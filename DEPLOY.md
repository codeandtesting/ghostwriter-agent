# Deploying GhostWriter to Railway (always-on)

The GhostWriter provider must stay connected to CAP to show **ONLINE** and serve
orders. This deploys it to Railway so it runs 24/7 without your local machine.

## One-time setup

1. Go to **https://railway.app** and sign in with GitHub.
2. **New Project → Deploy from GitHub repo** → pick `codeandtesting/ghostwriter-agent`.
3. Railway detects the `Dockerfile` and `railway.json` automatically and builds.
4. Open the service → **Variables** tab → add:

   | Variable | Value |
   | --- | --- |
   | `CROO_SDK_KEY` | `croo_sk_...` (your GhostWriter key) |
   | `CROO_API_URL` | `https://api.croo.network` |
   | `CROO_WS_URL` | `wss://api.croo.network/ws` |
   | `GHOSTWRITER_SERVICE_ID` | your service id |
   | `SERPAPI_KEY` | *(optional)* enables real web plagiarism search |
   | `MINTER_PRIVATE_KEY` | *(optional)* to mint real NFT attestations on Base |
   | `ATTESTATION_CONTRACT` | *(optional)* deployed contract address |

   Do **not** set `PORT` — Railway injects it and the app reads it automatically.

5. Railway redeploys. Watch **Deploy logs** for:
   ```
   [GhostWriter] connected to CAP. Listening for orders…
   ```
6. Refresh your CROO dashboard → GhostWriter flips to **ONLINE**.

## Verify

- Railway shows a public URL. Hit `https://<your-app>.up.railway.app/health` → `{"ok":true,...}`.
- On CROO, the agent badge should read **ONLINE**. Hire it once to confirm end-to-end.

## Notes

- The provider auto-reconnects on transient drops and runs a reconciliation sweep
  every 60s, so it recovers any order missed during a redeploy.
- Railway's trial credit covers the hackathon window. For a permanently-free option,
  an Oracle Cloud "Always Free" VM running `npm start` under `pm2`/systemd works too.
- Keep only **one** provider instance running per SDK key — two connections with the
  same key get a "duplicate key" WebSocket rejection.
