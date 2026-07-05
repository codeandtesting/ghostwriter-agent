# GhostWriter — Demo Video Script (~4:40, max 5 min)

**Before recording, open and arrange:**
1. GhostWriter store page (agent.croo.network) showing **LIVE**
2. Terminal in the project folder, ready to run `npm start`
3. GitHub repo (github.com/codeandtesting/ghostwriter-agent)
4. BaseScan on a settlement tx hash (see references below)
5. VS Code with `src/agent.js` open

---

### 0:00–0:30 — Hook + problem
**SHOW:** Store page (or face-cam).
> "This is GhostWriter — a paid AI agent that verifies whether content is original and mints proof of it, on-chain. In a world flooded with AI-generated text, publishers and other agents have no automatic way to check if content is original before they pay for it or republish it. GhostWriter fixes that. It's live right now on the CROO Agent Store, and any human — or any other agent — can hire it. Let me show you."

### 0:30–1:15 — The live listing
**SHOW:** LIVE badge, agent wallet, tags, the $1.00 Content Originality Check service, Hire button.
> "Here's GhostWriter on the marketplace. It's live, it has its own wallet, and it offers one priced service: a Content Originality Check for one USDC, tagged under Data & Verification. This isn't a sandbox — it's a real listing that real buyers and other agents can discover and pay."

### 1:15–2:15 — Start provider + hire it
**SHOW:** Terminal `npm start` → log "connected to CAP. Listening for orders…"
> "On my side I start the provider. It connects to CAP over WebSocket using just my SDK key — no private keys, CROO's backend handles on-chain settlement. Now it's listening."

**SHOW:** Store → Hire → paste an article → pay 1 USDC.
> "Now I act as a buyer. I submit an article and pay one USDC. Watch: the negotiation is created, my agent auto-accepts, an order is created on-chain, payment settles, GhostWriter runs the check and delivers the result — all autonomous."

**SHOW:** Terminal logs: accepted → paid → delivered score 96.

### 2:15–3:00 — Result + on-chain proof
**SHOW:** Delivered result — score, unique:true, contentHash, signed attestation.
> "Here's the delivered result: a uniqueness score of 96 out of 100, a SHA-256 hash of the exact content, and a cryptographically signed attestation of originality — proof that can be attached to the work and verified by anyone."

**SHOW:** BaseScan tx.
> "And it's real. Here's the settlement on Base — payment and delivery are on-chain. GhostWriter got paid, the buyer got verifiable proof. A complete transaction."

### 3:00–4:00 — Technical deep-dive + A2A composability
**SHOW:** `src/agent.js` — CAP handlers (NegotiationCreated, OrderPaid, deliverOrder) + reconcile sweep.
> "Under the hood it's built on the CROO SDK. It listens for negotiations, accepts them, runs the originality engine when the order is paid, and delivers on-chain. It has a reconciliation sweep so it never drops an order if it restarts. The engine extracts distinctive phrases, cross-checks them against the web, and scores uniqueness — and it works for code too."

**SHOW:** "I'm an agent" MCP view or `scripts/hire.js`.
> "The key part for the agent economy: GhostWriter is composable. Another agent — say a news aggregator that only republishes original content — can hire GhostWriter as a dependency, get a score, and act on it. Agents paying agents, on-chain."

### 4:00–4:40 — Impact + close
**SHOW:** GitHub repo (public, MIT).
> "Everything's open source under MIT. GhostWriter turns content authenticity into a paid, callable service any agent can plug into. It's live on the CROO Agent Store today. Verify, then mint proof. Thanks for watching."

---

## On-chain references (real completed job)
- Order: `c2d6cd53-e236-42c6-ba94-378851b886ff` — status **completed**, score **96/100**
- Create tx: `0x09883b8a65cdae9984249253553059971cc78144de23d5dbd5e891a7a0c64ed8`
- Pay tx:    `0xc13a11d63eb823b5568cd985477cf16bcfdf422931baececea54dfd875f17e94`
- Deliver tx:`0x27a5954e97e16eded416000a33258e815d37e7168ccaddb83ea0fd2d2ae7ace6`
- Clear tx:  `0x42b2194a0a101849c354c4294e8c7c6f0630ac7f31fee672d32e18d3ab794479`
- Content hash: `0xf23243e3c4238e9843530a507d8ecd45eeebcb50d997f990b5d44d798a2a94ee`

## Tips
- Record ~1.5× your normal talking pace; 5 min goes fast. If long, cut the deep-dive to 30s.
- Do one live hire on camera; fall back to the completed order + BaseScan hashes if it's slow.
- Loom or OBS → unlisted YouTube → paste link into DoraHacks.
- Bump terminal font size so logs are readable.
