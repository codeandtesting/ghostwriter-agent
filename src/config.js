import 'dotenv/config';

/**
 * Central configuration. Everything degrades gracefully: if optional keys are
 * missing (SerpAPI, minter key), the agent still runs in a demo-safe mode so a
 * reviewer can exercise the full CAP flow without external accounts.
 */
export const config = {
  // --- CROO / CAP ---
  crooApiUrl: process.env.CROO_API_URL || 'https://api.croo.network',
  crooWsUrl: process.env.CROO_WS_URL || 'wss://api.croo.network/ws',
  crooSdkKey: process.env.CROO_SDK_KEY || '',
  serviceId: process.env.GHOSTWRITER_SERVICE_ID || '',
  // Optional second service: certificate lookup (verify an existing attestation).
  lookupServiceId: process.env.LOOKUP_SERVICE_ID || '',
  // Optional third service: bulk verification (many items in one order).
  bulkServiceId: process.env.BULK_SERVICE_ID || '',

  // --- Base chain / attestation ---
  baseRpcUrl: process.env.BASE_RPC_URL || 'https://mainnet.base.org',
  minterPrivateKey: process.env.MINTER_PRIVATE_KEY || '',
  attestationContract: process.env.ATTESTATION_CONTRACT || '',

  // --- Plagiarism providers (all optional) ---
  serpApiKey: process.env.SERPAPI_KEY || '',

  // --- REST server (A2A + batch) ---
  port: Number(process.env.PORT || 8787),

  // --- Policy ---
  minContentLength: Number(process.env.MIN_CONTENT_LENGTH || 200),
  uniqueThreshold: Number(process.env.UNIQUE_THRESHOLD || 80),
};

export function assertProviderReady() {
  if (!config.crooSdkKey) {
    throw new Error('CROO_SDK_KEY is required to run the CAP provider. See .env.example');
  }
}
