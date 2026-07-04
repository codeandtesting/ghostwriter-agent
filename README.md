# GhostWriter — The Plagiarism Hunter

A paid, callable **CROO/CAP agent** that verifies content originality and mints an
**on-chain NFT attestation** on **Base**. Any human or agent can hire GhostWriter to
answer one question with cryptographic proof: *is this content original?*

- **Track:** Data & Verification Agents (provenance, credentials, output checks)
- **Settlement:** USDC on Base, via the CROO Agent Protocol (CAP)
- **Proof:** ERC-721 attestation binding a content SHA-256 hash → uniqueness score + timestamp + sources

> Built for the CROO Agent Hackathon. Turns *"trust but verify"* into *"verify, then mint proof."*

---

## Why it matters

In the age of AI-generated content there is no verifiable, on-chain proof that a piece
of work is original. News aggregators, publishers, and agents have no automated way to
check authenticity before republishing or paying for content. GhostWriter is that
missing primitive — and because it speaks CAP, **other agents can hire it as a
dependency** (e.g. a news-aggregator agent that only republishes content scoring > 80).

---

## Architecture

```
CROO Agent Store  ── discovery / listing / payments (USDC on Base)
        │
        ▼
GhostWriter Agent
 ├─ CAP provider (src/agent.js)        negotiate → accept → paid → deliver on-chain
 ├─ Plagiarism engine (src/plagiarism) probe extraction + web search + similarity
 ├─ Attestation minter (src/attestation) SHA-256 → ERC-721 on Base (or signed off-chain)
 └─ REST API (src/server.js)           /api/verify + /api/verify/batch for direct A2A
```

Design principle: **graceful degradation.** Missing `SERPAPI_KEY` → offline structural
heuristic. Missing minter keys → signed off-chain attestation. So the full flow is
runnable in CI / on a reviewer's laptop with **zero external accounts**.

---

## Quick start

```bash
npm install
cp .env.example .env        # fill in what you have (all optional except CROO_SDK_KEY for CAP)

# 1) Offline end-to-end demo (no keys needed) — shows scoring + attestation
npm run demo

# 2) Unit tests
npm test

# 3) Run the agent (REST always; CAP provider when CROO_SDK_KEY is set)
npm start
```

### Try the REST API

```bash
curl -X POST http://localhost:8787/api/verify \
  -H "Content-Type: application/json" \
  -d '{"content":"<at least 200 chars of text>","subject":"0xYourWallet"}'
```

Response:

```json
{
  "ok": true,
  "unique": true,
  "score": 94,
  "contentHash": "0x…",
  "attestationTx": "0x…",
  "summary": "No matching sources found across the web. Content appears original (94/100).",
  "sources": []
}
```

Batch: `POST /api/verify/batch { "items": ["…","…"], "format": "csv" }` → CSV report.

---

## CAP integration

The agent is a CAP **provider**. Content to verify is carried in the negotiation's
`requirements` string — either raw text or `{"content":"…","kind":"text"}`.

Lifecycle (`src/agent.js`):

1. `EventType.NegotiationCreated` → validate content → `acceptNegotiation()` (backend creates the on-chain order).
2. `EventType.OrderPaid` (buyer paid USDC) → run originality check → mint attestation → `deliverOrder()` with the JSON result on-chain.
3. `EventType.OrderCompleted` → done.

### CAP SDK methods used (`@croo-network/sdk`)

| Method | Purpose |
| --- | --- |
| `new AgentClient({ baseURL, wsURL, rpcURL }, sdkKey)` | Construct the provider client |
| `connectWebSocket()` | Open the event stream (`EventStream`) |
| `stream.on(EventType.NegotiationCreated, …)` | React to incoming hire requests |
| `getNegotiation(id)` | Read the buyer's `requirements` (the content) |
| `acceptNegotiation(id)` / `rejectNegotiation(id, reason)` | Accept/decline the job |
| `stream.on(EventType.OrderPaid, …)` | Trigger work after USDC settlement |
| `getOrder(id)` | Read buyer wallet + order state |
| `deliverOrder(id, { deliverableType: DeliverableType.Text, deliverableText })` | Deliver result on-chain |
| `rejectOrder(id, reason)` | Fail gracefully on error |

Enums used: `EventType`, `DeliverableType`, `OrderStatus`, `NegotiationStatus`.

---

## On-chain attestation

`contracts/GhostWriterAttestation.sol` is a minimal, dependency-free ERC-721. Each token
records `{ contentHash, uniquenessScore, sourcesChecked, timestamp, subject }` and exposes
`verify(bytes32 contentHash) → (exists, score, tokenId)` so anyone can confirm a proof
by hash. Deploy on Base, set `ATTESTATION_CONTRACT` + `MINTER_PRIVATE_KEY`, and
`src/attestation/minter.js` mints real tokens; otherwise it returns a signed off-chain
attestation.

---

## How another agent hires GhostWriter

```js
import { AgentClient } from '@croo-network/sdk';
const client = new AgentClient({ baseURL, wsURL }, MY_SDK_KEY);

const negotiation = await client.negotiateOrder({
  serviceId: GHOSTWRITER_SERVICE_ID,
  requirements: JSON.stringify({ content: articleText, kind: 'text' }),
});
// pay the resulting order, then read the delivery:
const delivery = await client.getDelivery(orderId);
const { unique, score, attestationTx } = JSON.parse(delivery.deliverableText);
if (score > 80) republish(articleText);
```

---

## Project layout

```
src/
  index.js               entrypoint (REST + CAP)
  config.js              env + policy
  agent.js               CAP provider event loop
  server.js              REST API (/api/verify, /api/verify/batch)
  verify.js              shared pipeline (check → mint)
  plagiarism/
    engine.js            orchestration + scoring + SHA-256
    websearch.js         probe extraction + SerpAPI
    similarity.js        char-shingle jaccard + lexical heuristic
  attestation/
    minter.js            ERC-721 mint on Base / off-chain fallback
contracts/
  GhostWriterAttestation.sol
scripts/demo.js          offline end-to-end demo
test/pipeline.test.js    unit tests
```

## License

MIT — see [LICENSE](LICENSE).
