/**
 * Hire GhostWriter over CAP as a *requester* (buyer) agent.
 *
 * This drives the full on-chain job lifecycle end-to-end:
 *   negotiate → (provider accepts → order created) → pay USDC → read delivery
 *
 * Requires a SECOND agent's SDK key (the buyer), funded with USDC on Base.
 * The provider (npm start) must be running to accept + deliver.
 *
 * Usage:
 *   REQUESTER_SDK_KEY=croo_sk_... node scripts/hire.js [path-to-content-file]
 *
 * If no file is given, a built-in sample article is used.
 */
import fs from 'fs';
import { AgentClient, OrderStatus, DeliveryStatus } from '@croo-network/sdk';
import { config } from '../src/config.js';

const REQUESTER_KEY = process.env.REQUESTER_SDK_KEY;
const SERVICE_ID = process.env.GHOSTWRITER_SERVICE_ID || config.serviceId;

if (!REQUESTER_KEY) {
  console.error('Set REQUESTER_SDK_KEY to a buyer agent SDK key (funded with USDC on Base).');
  process.exit(1);
}
if (!SERVICE_ID) {
  console.error('Set GHOSTWRITER_SERVICE_ID (the service to hire).');
  process.exit(1);
}

const SAMPLE = `The migratory patterns of the Arctic tern reveal an astonishing feat of endurance
that few other creatures on Earth can rival. Each year this small seabird traces a looping route
between its polar breeding grounds and the opposite pole, threading through shifting winds and open
ocean with uncanny precision. Researchers tracking individual birds have logged journeys that, over
a lifetime, add up to more than the distance of several round trips to the Moon.`;

const contentPath = process.argv[2];
const content = contentPath ? fs.readFileSync(contentPath, 'utf8') : SAMPLE;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function poll(fn, { tries = 60, intervalMs = 3000, label = 'condition' } = {}) {
  for (let i = 0; i < tries; i++) {
    const v = await fn();
    if (v) return v;
    process.stdout.write('.');
    await sleep(intervalMs);
  }
  throw new Error(`Timed out waiting for ${label}`);
}

async function main() {
  const client = new AgentClient(
    { baseURL: config.crooApiUrl, wsURL: config.crooWsUrl, rpcURL: config.baseRpcUrl },
    REQUESTER_KEY
  );

  console.log(`\n[hire] Negotiating for service ${SERVICE_ID}…`);
  const negotiation = await client.negotiateOrder({
    serviceId: SERVICE_ID,
    requirements: JSON.stringify({ content, kind: 'text' }),
  });
  console.log(`[hire] negotiation ${negotiation.negotiationId} (${negotiation.status})`);

  // 1) Wait for the provider to accept → an order is created on-chain.
  console.log('[hire] waiting for provider to accept');
  const order = await poll(
    async () => {
      const orders = await client.listOrders({ pageSize: 20 });
      return orders.find((o) => o.negotiationId === negotiation.negotiationId) || null;
    },
    { label: 'order creation' }
  );
  console.log(`\n[hire] order ${order.orderId} created (${order.status}), price ${order.price} ${order.paymentToken}`);

  // 2) Pay the order (USDC on Base).
  console.log('[hire] paying order…');
  const pay = await client.payOrder(order.orderId);
  console.log(`[hire] paid — tx ${pay.txHash}`);

  // 3) Wait for delivery.
  console.log('[hire] waiting for delivery');
  const delivery = await poll(
    async () => {
      const d = await client.getDelivery(order.orderId).catch(() => null);
      return d && d.deliverableText ? d : null;
    },
    { label: 'delivery' }
  );

  console.log('\n[hire] ===== DELIVERED =====');
  const result = JSON.parse(delivery.deliverableText);
  console.log(JSON.stringify(result, null, 2));
  console.log('\n[hire] score:', result.score, '| unique:', result.unique, '| attestationTx:', result.attestationTx);
}

main().catch((e) => {
  console.error('\n[hire] error:', e.message || e);
  process.exit(1);
});
