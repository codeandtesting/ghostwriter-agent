# GhostWriter — DoraHacks BUIDL Submission

Copy-paste the fields below into the DoraHacks submission form.

---

## Project name
GhostWriter — The Plagiarism Hunter

## Tagline (one line)
A paid, callable CAP agent that verifies content originality and mints on-chain proof on Base.

## Tracks (max 2)
1. **Data & Verification Agents** (primary) — provenance, credentials, output checks
2. **Open – Any A2A Agents** (secondary) — proves A2A composability

## Short description (~50 words)
GhostWriter is a paid AI agent on the CROO Agent Store that checks whether text or
code is original. It returns a 0–100 uniqueness score with sources and a signed
attestation of originality, settling in USDC on Base via CAP. Other agents can hire
it as a dependency before republishing or paying for content.

## Full description
**The problem.** AI-generated content is everywhere, and there's no automatic,
verifiable way to prove a piece of work is original. Publishers, news aggregators,
and other agents have no way to check authenticity before they pay for content or
republish it.

**The solution.** GhostWriter is a paid, callable agent that scans submitted content,
generates a uniqueness score (0–100) plus a provenance report, and produces a
cryptographic attestation of originality — optionally minted as an ERC-721 NFT on
Base. The proof binds a SHA-256 hash of the exact content to the score, a timestamp,
and the sources checked, so anyone (human or agent) can verify it later.

**Why it matters for the agent economy.** GhostWriter is composable: a news-aggregator
agent that only republishes original content can hire GhostWriter via CAP, get back a
score, and act on it automatically. It turns "trust but verify" into "verify, then
mint proof" — a reusable verification primitive other agents can depend on.

**How it works.** The agent is a CAP provider built on `@croo-network/sdk`. It listens
for negotiations over WebSocket, auto-accepts valid ones, runs its originality engine
when the order is paid (USDC on Base), and delivers a JSON result on-chain. A startup
reconciliation sweep guarantees it never drops an order across restarts. The originality
engine extracts distinctive probe phrases, cross-checks them against the web (SerpAPI),
and combines that with a lexical-diversity + character-shingle heuristic to score
uniqueness. It handles text and code, and degrades gracefully so the full pipeline runs
with zero external keys for auditing.

## Proof it works — a real completed on-chain job
A real buyer wallet paid $1 USDC and GhostWriter autonomously verified an article
(scored **96/100**) and delivered a signed attestation. All settled on Base:
- Order: `c2d6cd53-e236-42c6-ba94-378851b886ff` (status: completed)
- Pay tx: `0xc13a11d63eb823b5568cd985477cf16bcfdf422931baececea54dfd875f17e94`
- Deliver tx: `0x27a5954e97e16eded416000a33258e815d37e7168ccaddb83ea0fd2d2ae7ace6`
- Clear tx: `0x42b2194a0a101849c354c4294e8c7c6f0630ac7f31fee672d32e18d3ab794479`

## Links
- **GitHub (MIT, public):** https://github.com/codeandtesting/ghostwriter-agent
- **CROO Agent Store listing:** <paste your GhostWriter store URL>
- **Demo video (≤5 min):** <paste your unlisted YouTube/Loom URL>

## CAP SDK methods used (`@croo-network/sdk`)
- `new AgentClient({ baseURL, wsURL, rpcURL }, sdkKey)` — construct provider client
- `connectWebSocket()` → `EventStream` — live order events
- `EventType.NegotiationCreated` / `OrderPaid` / `OrderCompleted` — lifecycle handlers
- `getNegotiation`, `acceptNegotiation`, `rejectNegotiation` — negotiation handling
- `getOrder`, `listOrders`, `listNegotiations` — reconciliation sweep
- `deliverOrder(orderId, { deliverableType: DeliverableType.Text, deliverableText })` — on-chain delivery
- `getDelivery`, `rejectOrder` — delivery + failure paths
- Enums: `EventType`, `DeliverableType`, `NegotiationStatus`, `OrderStatus`

## Integration notes (how another agent hires GhostWriter)
Call `negotiateOrder({ serviceId, requirements })` where `requirements` is the content
to verify — raw text, or JSON `{"content":"...","kind":"text"}` (also accepts `{"text":...}`).
Pay the resulting order, then read `getDelivery(orderId)`; `deliverableText` is JSON:
`{ unique, score, contentHash, attestationTx, summary, sources[] }`.

## Setup (from README)
```bash
npm install
cp .env.example .env      # add CROO_SDK_KEY (+ optional SERPAPI_KEY, minter keys)
npm start                 # runs REST API + CAP provider
npm run demo              # offline end-to-end demo, no keys needed
npm test                  # unit tests
```

## Team
- codeandtesting (solo) — or add teammates (max 5)

## License
MIT
