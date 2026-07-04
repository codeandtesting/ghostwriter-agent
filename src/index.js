import { config } from './config.js';
import { startServer } from './server.js';
import { startAgent } from './agent.js';

/**
 * Entrypoint. Always starts the REST API (A2A + batch). Also starts the CAP
 * provider when a CROO_SDK_KEY is present, so the same process serves both the
 * on-chain marketplace flow and direct HTTP calls.
 */
async function main() {
  startServer();

  if (config.crooSdkKey) {
    try {
      await startAgent();
    } catch (e) {
      console.error('[GhostWriter] CAP provider failed to start:', e.message || e);
      console.error('[GhostWriter] REST API still available; set CROO_SDK_KEY to enable CAP.');
    }
  } else {
    console.log('[GhostWriter] No CROO_SDK_KEY set — running REST-only mode.');
  }
}

main().catch((e) => {
  console.error('Fatal:', e);
  process.exit(1);
});
