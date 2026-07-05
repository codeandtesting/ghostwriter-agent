# GhostWriter — The Plagiarism Hunter

A paid, callable **CROO/CAP agent** that verifies content originality and mints an
**on-chain NFT attestation** on **Base**. Any human or agent can hire GhostWriter to
answer one question with cryptographic proof: *is this content original — and can I prove it?*

- **Track:** Data & Verification Agents (provenance, credentials, output checks)
- **Settlement:** USDC on Base, via the CROO Agent Protocol (CAP)
- **Proof:** ERC-721 attestation binding a normalized content hash → uniqueness score + timestamp + sources
- **Live contract:** [`0xA4d41cb5975CBD984BF328A14b67866dA95c7f00`](https://basescan.org/address/0xA4d41cb5975CBD984BF328A14b67866dA95c7f00) on Base

> Built for the CROO Agent Hackathon. Turns *"trust but verify"* into *"verify, then mint proof."*

---

## Why it matters

In the age of AI-generated content there is no verifiable, on-chain proof that a piece
of work is original. News aggregators, publishers, and agents have no automated way to
check authenticity before republishing or paying for content. GhostWriter is that
missing primitive — and because it speaks CAP, **other agents can hire it as a
dependency** (e.g. a news-aggregator agent that only republishes content scoring > 80,
then verifies the certificate is real before trusting it).

---

## Services (composable on the CROO Agent Store)

GhostWriter exposes a full **issue → verify** loop as priced, callable services:

| Service | Price | What it does |
| --- | --- | --- |
| **Content Originality Check** | $0.10 | Web-checks content, scores 0–100, **mints an NFT certificate** to the buyer |
| **Certificate Lookup** | $0.05 | Reads the chain to confirm whether content is **already certified** (no gas, no mint) |
| **Bulk Verification** | tiered | Many items in one order → per-item scores + one batch attestation NFT |

Each is a real CAP order settled in USDC on Base. Service 1 *issues* proof; Service 2
lets any other agent *verify* that proof before trusting it — that's the A2A story.

---

## How it works

1. **Input:** raw text, a JSON envelope (`{"content"|"text"|"input": "..."}`), or a **URL**
   (the page is fetched and its readable text extracted). Lookup also accepts a `0x` content hash.
2. **Originality engine:** extracts distinctive probe sentences, cross-checks them against
   the web (SerpAPI), and combines that with a lexical-diversity + char-shingle heuristic
   into a 0–100 score with source links.
3. **Attestation:** hashes a **normalized** form of the content (Unicode NFC + collapsed
   whitespace) so the same article reliably matches despite formatting differences, then
   mints an ERC-721 on Base bound to that hash, score, timestamp, and sources.
4. **Verify:** anyone hashes content (or calls the lookup service / `verify(hash)`) to
   confirm on-chain whether GhostWriter certified it. Certificates can't be forged — only
   the minter wallet can issue them.

Design principle: **graceful degradation.** No `SERPAPI_KEY` → offline heuristic. No
minter keys → signed off-chain attestation. So the full flow runs in CI / on a
reviewer's laptop with **zero external accounts**.

---

## Live proof (real completed jobs on Base)

- A buyer paid **$1 USDC** and GhostWriter delivered a signed originality result on-chain
  ([deliver tx](https://basescan.org/tx/0x27a5954e97e16eded416000a33258e815d37e7168ccaddb83ea0fd2d2ae7ace6)).
- The hosted agent later minted a real **ERC-721 certificate to the buyer's wallet** —
  token #3, [mint tx](https://basescan.org/tx/0xfc4e27e992bf4c86de950da3035a65249155345f3fdc38387862c8b01fd2213d).
- Anyone can verify a certificate on-chain: on
  [BaseScan → Read Contract](https://basescan.org/address/0xA4d41cb5975CBD984BF328A14b67866dA95c7f00#readContract),
  call `verify(bytes32 contentHash)` → returns `(exists, score, tokenId)`.

---

## Quick start

```bash
npm install
cp .env.example .env        # add CROO_SDK_KEY (+ optional SERPAPI_KEY / minter keys)

npm run demo               # offline end-to-end demo, no keys needed
npm test                   # unit tests
npm start                  # REST API always; CAP provider when CROO_SDK_KEY is set
```

### REST API

```bash
# Verify content (or a URL)
curl -X POST http://localhost:8787/api/verify \
  -H "Content-Type: application/json" \
  -d '{"content":"<article text>","subject":"0xBuyerWallet"}'
# or: -d '{"url":"https://example.com/article"}'

# Look up whether content is already certified
curl -X POST http://localhost:8787/api/lookup \
  -H "Content-Type: application/json" \
  -d '{"content":"<same article text>"}'
```

Verify response:

```json
{
  "ok": true,
  "unique": false,
  "score": 71,
  "contentHash": "0x…",
  "attestationTx": "0x…",
  "summary": "Found 1 potentially overlapping source(s); strongest match 0.25. Uniqueness 71/100.",
  "sources": [{ "title": "…", "link": "https://…", "overlap": 0.25 }]
}
```

---

## CAP integration

The agent is a CAP **provider**. Input is carried in the negotiation's `requirements`.
Orders are routed by service id: lookup → on-chain read; bulk → batch; otherwise → the
originality check.

Lifecycle (`src/agent.js`):

1. `EventType.NegotiationCreated` → validate/resolve input → `acceptNegotiation()`.
2. `EventType.OrderPaid` → run the service → mint (if applicable) → `deliverOrder()` on-chain.
3. `EventType.OrderCompleted` → done.

A startup **reconciliation sweep** (and 60s interval) catches up on any negotiation or
paid order missed while the provider was offline, so it's safe to restart anytime.

### CAP SDK methods used (`@croo-network/sdk`)

| Method | Purpose |
| --- | --- |
| `new AgentClient({ baseURL, wsURL, rpcURL }, sdkKey)` | Construct the provider client |
| `connectWebSocket()` | Open the event stream (`EventStream`) |
| `stream.on(EventType.NegotiationCreated / OrderPaid / OrderCompleted, …)` | Lifecycle handlers |
| `getNegotiation`, `listNegotiations` | Read requirements / reconciliation |
| `acceptNegotiation`, `rejectNegotiation` | Accept/decline a job |
| `getOrder`, `listOrders` | Order state / reconciliation |
| `deliverOrder(id, { deliverableType: DeliverableType.Text, deliverableText })` | Deliver on-chain |
| `getDelivery`, `rejectOrder` | Delivery + failure paths |

Enums: `EventType`, `DeliverableType`, `OrderStatus`, `NegotiationStatus`.

---

## On-chain attestation

`contracts/GhostWriterAttestation.sol` is a minimal, dependency-free ERC-721. Each token
records `{ contentHash, uniquenessScore, sourcesChecked, timestamp, subject }` and exposes
`verify(bytes32 contentHash) → (exists, score, tokenId)` so anyone can confirm a proof by
hash. Deploy with `node scripts/deploy-contract.js` (needs `DEPLOYER_PRIVATE_KEY`), then
set `ATTESTATION_CONTRACT` + `MINTER_PRIVATE_KEY` to mint real tokens; otherwise the agent
returns a signed off-chain attestation.

---

## How another agent hires GhostWriter

```js
import { AgentClient } from '@croo-network/sdk';
const client = new AgentClient({ baseURL, wsURL }, MY_SDK_KEY);

// 1) Certify
const neg = await client.negotiateOrder({
  serviceId: ORIGINALITY_SERVICE_ID,
  requirements: JSON.stringify({ content: articleText }), // or { url: '…' }
});
// pay the order, then:
const { score, contentHash, attestationTx } = JSON.parse((await client.getDelivery(orderId)).deliverableText);

// 2) Later, a different agent verifies the certificate before republishing
const neg2 = await client.negotiateOrder({
  serviceId: LOOKUP_SERVICE_ID,
  requirements: articleText, // or the 0x contentHash
});
const { certified, tokenId } = JSON.parse((await client.getDelivery(orderId2)).deliverableText);
if (certified) republish(articleText);
```

`scripts/hire.js` drives a full buyer-side job end-to-end (negotiate → pay → read delivery).

---

## Project layout

```
src/
  index.js               entrypoint (REST + CAP)
  config.js              env + service ids + policy
  agent.js               CAP provider event loop + reconciliation + routing
  server.js              REST API (/api/verify, /api/lookup, /api/verify/batch)
  verify.js              shared pipeline (check → mint), batch + bulk
  lookup.js              on-chain certificate lookup
  content.js             normalization, hashing, URL/hash input resolution
  plagiarism/            engine (scoring), websearch (SerpAPI), similarity
  attestation/minter.js  ERC-721 mint on Base / off-chain fallback
contracts/GhostWriterAttestation.sol
scripts/                 demo.js, hire.js, deploy-contract.js
test/pipeline.test.js    unit tests
```

## Configuration (env)

`CROO_SDK_KEY`, `CROO_API_URL`, `CROO_WS_URL`, `GHOSTWRITER_SERVICE_ID`,
`LOOKUP_SERVICE_ID`, `BULK_SERVICE_ID`, `BASE_RPC_URL`, `ATTESTATION_CONTRACT`,
`MINTER_PRIVATE_KEY`, `SERPAPI_KEY`, `PORT`, `MIN_CONTENT_LENGTH`, `UNIQUE_THRESHOLD`.
See `.env.example`.

## License

MIT — see [LICENSE](LICENSE).
