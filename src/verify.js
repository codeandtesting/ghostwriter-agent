import { runPlagiarismCheck } from './plagiarism/engine.js';
import { mintAttestation } from './attestation/minter.js';

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
