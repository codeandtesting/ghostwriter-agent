import { runPlagiarismCheck } from './plagiarism/engine.js';
import { mintAttestation } from './attestation/minter.js';
import { contentHash as computeContentHash } from './content.js';
import { config } from './config.js';

/**
 * Full GhostWriter verification pipeline: check originality, then mint an
 * attestation. Shared by the CAP provider (paid delivery) and the REST API.
 *
 * @param {string} content   The content to verify.
 * @param {object} opts
 * @param {string} [opts.kind]     'text' | 'code'
 * @param {string} [opts.subject]  wallet address to mint the attestation for
 * @param {boolean}[opts.mint]     whether to mint (default true)
 */
export async function verifyContent(content, opts = {}) {
  const { kind = 'text', subject, mint = true, sourceUrl = null } = opts;
  const report = await runPlagiarismCheck(content, { kind, sourceUrl });
  if (!report.ok) return report;

  let attestation = null;
  if (mint) {
    attestation = await mintAttestation(report, subject);
  }

  return {
    ok: true,
    unique: report.unique,
    score: report.uniquenessScore,
    contentHash: report.contentHash,
    report,
    attestation,
    attestationTx: attestation?.attestationTx || null,
  };
}

/**
 * Bulk pack: verify many items in one order. To keep it fast and cheap, items
 * are checked WITHOUT per-item minting; instead a single "batch" attestation
 * NFT is minted over the combined fingerprint of all items.
 */
export async function verifyBulk(items, { subject } = {}) {
  const perItem = await verifyBatch(items, { mint: false });
  const ok = perItem.filter((r) => r.ok);
  const scores = ok.map((r) => r.score);
  const avg = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;
  const batchHash = computeContentHash(ok.map((r) => r.contentHash).join('|'));

  // Synthetic report so the existing minter can issue one batch attestation.
  const report = {
    kind: 'batch',
    sourceUrl: null,
    contentHash: batchHash,
    uniquenessScore: avg,
    unique: avg >= config.uniqueThreshold,
    checkedAt: new Date().toISOString(),
    sources: [],
    method: { mode: 'bulk-pack' },
    reportSummary: `Batch of ${perItem.length} item(s), average uniqueness ${avg}/100.`,
  };
  const attestation = await mintAttestation(report, subject);

  return {
    ok: true,
    count: perItem.length,
    averageScore: avg,
    batchContentHash: batchHash,
    attestation,
    attestationTx: attestation?.attestationTx || null,
    results: perItem.map((r) => ({
      index: r.index,
      ok: r.ok,
      score: r.score,
      unique: r.unique,
      contentHash: r.contentHash,
      error: r.error,
    })),
  };
}

/** Batch: verify many items, return per-item results. */
export async function verifyBatch(items, opts = {}) {
  const results = [];
  for (const [i, content] of items.entries()) {
    try {
      const r = await verifyContent(content, opts);
      results.push({ index: i, ...r });
    } catch (e) {
      results.push({ index: i, ok: false, error: String(e.message || e) });
    }
  }
  return results;
}

export function batchToCsv(results) {
  const rows = [['index', 'ok', 'unique', 'score', 'contentHash', 'attestationTx']];
  for (const r of results) {
    rows.push([
      r.index,
      r.ok,
      r.unique ?? '',
      r.score ?? '',
      r.contentHash ?? '',
      r.attestationTx ?? '',
    ]);
  }
  return rows.map((r) => r.join(',')).join('\n');
}
