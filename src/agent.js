import { AgentClient, EventType, DeliverableType } from '@croo-network/sdk';
import { config, assertProviderReady } from './config.js';
import { verifyContent } from './verify.js';

/**
 * GhostWriter CAP provider.
 *
 * Lifecycle on the CROO marketplace:
 *   1. A buyer (human or agent) opens a negotiation against our service.
 *   2. We auto-accept  -> backend creates an on-chain order.
 *   3. Buyer pays (USDC on Base) -> OrderPaid event.
 *   4. We run the originality check, mint the attestation, and deliver the
 *      JSON result on-chain.
 *
 * The content to verify is carried in the negotiation's `requirements` string.
 * We support either raw text or a JSON envelope: {"content": "...", "kind":"text"}.
 */

function parseRequirements(requirements) {
  const raw = (requirements || '').trim();
  if (!raw) return { content: '', kind: 'text' };
  try {
    const obj = JSON.parse(raw);
    if (obj && typeof obj === 'object' && 'content' in obj) {
      return { content: String(obj.content), kind: obj.kind || 'text' };
    }
  } catch {
    /* not JSON — treat as raw text */
  }
  return { content: raw, kind: 'text' };
}

export async function startAgent() {
  assertProviderReady();

  const client = new AgentClient(
    { baseURL: config.crooApiUrl, wsURL: config.crooWsUrl, rpcURL: config.baseRpcUrl },
    config.crooSdkKey
  );

  const stream = await client.connectWebSocket();
  console.log('[GhostWriter] connected to CAP. Listening for orders…');

  // Cache negotiation requirements by negotiation_id so we still have the
  // content at OrderPaid time.
  const contentByOrder = new Map();

  stream.on(EventType.NegotiationCreated, async (e) => {
    try {
      const negotiation = await client.getNegotiation(e.negotiation_id);
      const parsed = parseRequirements(negotiation.requirements);

      if (!parsed.content || parsed.content.length < config.minContentLength) {
        await client.rejectNegotiation(
          e.negotiation_id,
          `Content required, minimum ${config.minContentLength} chars.`
        );
        console.log(`[GhostWriter] rejected negotiation ${e.negotiation_id} (insufficient content)`);
        return;
      }

      const result = await client.acceptNegotiation(e.negotiation_id);
      contentByOrder.set(result.order.orderId, parsed);
      console.log(`[GhostWriter] accepted -> order ${result.order.orderId}`);
    } catch (err) {
      console.error('[GhostWriter] negotiation error:', err.message || err);
    }
  });

  stream.on(EventType.OrderPaid, async (e) => {
    try {
      let parsed = contentByOrder.get(e.order_id);
      if (!parsed) {
        // Recover content from the order's negotiation if we lost the cache.
        const order = await client.getOrder(e.order_id);
        const negotiation = await client.getNegotiation(order.negotiationId);
        parsed = parseRequirements(negotiation.requirements);
      }

      const order = await client.getOrder(e.order_id);
      console.log(`[GhostWriter] order ${e.order_id} paid — running check…`);

      const result = await verifyContent(parsed.content, {
        kind: parsed.kind,
        subject: order.requesterWalletAddress,
      });

      const deliverable = {
        unique: result.unique,
        score: result.score,
        contentHash: result.contentHash,
        attestationTx: result.attestationTx,
        attestation: result.attestation,
        summary: result.report.reportSummary,
        sources: result.report.sources,
      };

      await client.deliverOrder(e.order_id, {
        deliverableType: DeliverableType.Text,
        deliverableText: JSON.stringify(deliverable),
      });
      contentByOrder.delete(e.order_id);
      console.log(
        `[GhostWriter] delivered order ${e.order_id} — score ${result.score}, unique=${result.unique}`
      );
    } catch (err) {
      console.error('[GhostWriter] delivery error:', err.message || err);
      try {
        await client.rejectOrder(e.order_id, 'Verification failed: ' + (err.message || 'internal error'));
      } catch { /* best effort */ }
    }
  });

  stream.on(EventType.OrderCompleted, (e) => {
    console.log(`[GhostWriter] order ${e.order_id} completed ✔`);
  });

  return { client, stream };
}
