import { AgentClient, EventType, DeliverableType, NegotiationStatus, OrderStatus } from '@croo-network/sdk';
import { config, assertProviderReady } from './config.js';
import { verifyContent, verifyBulk } from './verify.js';
import { lookupCertificate } from './lookup.js';
import { resolveInput } from './content.js';

/**
 * Parse a bulk order's requirements into an array of content items. Accepts a
 * JSON array, {"items":[...]}, or blank-line / newline separated text.
 */
function parseBulkItems(requirements) {
  const t = (requirements || '').trim();
  try {
    const o = JSON.parse(t);
    if (Array.isArray(o)) return o.map(String);
    if (o && Array.isArray(o.items)) return o.items.map(String);
  } catch {
    /* not JSON */
  }
  const byBlank = t.split(/\n\s*\n/).map((s) => s.trim()).filter(Boolean);
  if (byBlank.length > 1) return byBlank;
  return t ? [t] : [];
}

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
 * We support raw text, a JSON envelope ({"content"|"text"|"input": "..."}), a
 * bare URL (the page is fetched), or — for lookup — a bare content hash.
 */

/** Accept a pending negotiation (validating input), caching resolved content. */
async function acceptNegotiation(client, negotiationId, contentByOrder) {
  const negotiation = await client.getNegotiation(negotiationId);
  if (negotiation.status !== NegotiationStatus.Pending) return; // already handled
  const isLookup = negotiation.serviceId && negotiation.serviceId === config.lookupServiceId;
  const isBulk = negotiation.serviceId && negotiation.serviceId === config.bulkServiceId;

  let resolved;
  try {
    resolved = await resolveInput(negotiation.requirements);
  } catch (e) {
    await client.rejectNegotiation(negotiationId, `Could not read input: ${e.message || e}`);
    console.log(`[GhostWriter] rejected negotiation ${negotiationId} (${e.message || e})`);
    return;
  }

  // Lookup accepts a content hash or any content; bulk accepts a multi-item
  // blob; the single originality check needs full content (unless URL).
  const enough = resolved.isHash || resolved.text.length >= config.minContentLength;
  if (!resolved.text || (!isLookup && !isBulk && !enough)) {
    await client.rejectNegotiation(
      negotiationId,
      isLookup ? 'Content, URL, or content hash required.' : `Content required, minimum ${config.minContentLength} chars.`
    );
    console.log(`[GhostWriter] rejected negotiation ${negotiationId} (insufficient input)`);
    return;
  }

  const result = await client.acceptNegotiation(negotiationId);
  contentByOrder.set(result.order.orderId, resolved);
  console.log(`[GhostWriter] accepted -> order ${result.order.orderId}`);
}

// Orders currently being fulfilled, to prevent the OrderPaid event and the
// reconciliation sweep from processing the same order concurrently (which would
// broadcast a duplicate mint tx → "already known" error and a refund).
const inFlight = new Set();

/** Run the check and deliver a paid order. Idempotent + concurrency-safe. */
async function fulfillOrder(client, orderId, contentByOrder) {
  if (inFlight.has(orderId)) return; // already being handled in this process
  inFlight.add(orderId);
  try {
    await doFulfillOrder(client, orderId, contentByOrder);
  } finally {
    inFlight.delete(orderId);
  }
}

async function doFulfillOrder(client, orderId, contentByOrder) {
  // Don't re-deliver an order that already has a delivery.
  const existing = await client.getDelivery(orderId).catch(() => null);
  if (existing && existing.deliverableText) {
    contentByOrder.delete(orderId);
    return;
  }

  const order = await client.getOrder(orderId);
  let resolved = contentByOrder.get(orderId);
  if (!resolved) {
    const negotiation = await client.getNegotiation(order.negotiationId);
    resolved = await resolveInput(negotiation.requirements);
  }

  // Route to the bulk-verification service if this order is for it.
  if (order.serviceId && order.serviceId === config.bulkServiceId) {
    const negotiation = await client.getNegotiation(order.negotiationId);
    const items = parseBulkItems(negotiation.requirements);
    console.log(`[GhostWriter] order ${orderId} paid — bulk check of ${items.length} item(s)…`);
    const bulk = await verifyBulk(items, { subject: order.requesterWalletAddress });
    await client.deliverOrder(orderId, {
      deliverableType: DeliverableType.Text,
      deliverableText: JSON.stringify(bulk),
    });
    contentByOrder.delete(orderId);
    console.log(`[GhostWriter] delivered bulk ${orderId} — ${bulk.count} items, avg ${bulk.averageScore}`);
    return;
  }

  // Route to the certificate-lookup service if this order is for it.
  if (order.serviceId && order.serviceId === config.lookupServiceId) {
    console.log(`[GhostWriter] order ${orderId} paid — certificate lookup…`);
    const lookup = await lookupCertificate(resolved.text);
    await client.deliverOrder(orderId, {
      deliverableType: DeliverableType.Text,
      deliverableText: JSON.stringify(lookup),
    });
    contentByOrder.delete(orderId);
    console.log(`[GhostWriter] delivered lookup ${orderId} — certified=${lookup.certified}`);
    return;
  }

  console.log(`[GhostWriter] order ${orderId} paid — running check…`);
  const result = await verifyContent(resolved.text, {
    kind: resolved.kind,
    subject: order.requesterWalletAddress,
    sourceUrl: resolved.sourceUrl,
  });

  const deliverable = {
    unique: result.unique,
    score: result.score,
    contentHash: result.contentHash,
    sourceUrl: result.report.sourceUrl,
    attestationTx: result.attestationTx,
    attestation: result.attestation,
    summary: result.report.reportSummary,
    sources: result.report.sources,
  };

  await client.deliverOrder(orderId, {
    deliverableType: DeliverableType.Text,
    deliverableText: JSON.stringify(deliverable),
  });
  contentByOrder.delete(orderId);
  console.log(
    `[GhostWriter] delivered order ${orderId} — score ${result.score}, unique=${result.unique}`
  );
}

/**
 * Startup reconciliation: catch up on anything that arrived while the provider
 * was offline — accept still-pending negotiations, and fulfill paid-but-
 * undelivered orders. Makes the provider safe to restart at any time.
 */
async function reconcile(client, contentByOrder) {
  try {
    const negs = await client.listNegotiations({ role: 'provider', pageSize: 50 });
    const pending = negs.filter((n) => n.status === NegotiationStatus.Pending);
    for (const n of pending) {
      await acceptNegotiation(client, n.negotiationId, contentByOrder).catch((e) =>
        console.error('[GhostWriter] reconcile accept error:', e.message || e)
      );
    }

    const orders = await client.listOrders({ role: 'provider', pageSize: 50 });
    const paid = orders.filter((o) => o.status === OrderStatus.Paid);
    for (const o of paid) {
      await fulfillOrder(client, o.orderId, contentByOrder).catch((e) =>
        console.error('[GhostWriter] reconcile fulfill error:', e.message || e)
      );
    }
    if (pending.length || paid.length) {
      console.log(`[GhostWriter] reconciled ${pending.length} negotiation(s), ${paid.length} paid order(s).`);
    }
  } catch (err) {
    console.error('[GhostWriter] reconcile sweep failed:', err.message || err);
  }
}

export async function startAgent() {
  assertProviderReady();

  const client = new AgentClient(
    { baseURL: config.crooApiUrl, wsURL: config.crooWsUrl, rpcURL: config.baseRpcUrl },
    config.crooSdkKey
  );

  const stream = await client.connectWebSocket();
  console.log('[GhostWriter] connected to CAP. Listening for orders…');

  // Cache parsed content by orderId so we still have it at OrderPaid time.
  const contentByOrder = new Map();

  // Catch up on anything missed while offline, then keep it fresh periodically
  // (covers events dropped during transient WS reconnects).
  await reconcile(client, contentByOrder);
  const sweep = setInterval(() => reconcile(client, contentByOrder), 60_000);
  if (sweep.unref) sweep.unref();

  stream.on(EventType.NegotiationCreated, (e) =>
    acceptNegotiation(client, e.negotiation_id, contentByOrder).catch((err) =>
      console.error('[GhostWriter] negotiation error:', err.message || err)
    )
  );

  stream.on(EventType.OrderPaid, async (e) => {
    try {
      await fulfillOrder(client, e.order_id, contentByOrder);
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
