import express from 'express';
import { config } from './config.js';
import { verifyContent, verifyBatch, batchToCsv } from './verify.js';
import { lookupCertificate } from './lookup.js';
import { resolveInput } from './content.js';

/**
 * REST surface for direct A2A calls and batch verification. This complements
 * the on-chain CAP flow: agents that have already settled (or are integrating)
 * can call these endpoints for the actual verification work.
 */
export function createServer() {
  const app = express();
  app.use(express.json({ limit: '5mb' }));

  app.get('/health', (_req, res) => {
    res.json({ ok: true, service: 'ghostwriter', uniqueThreshold: config.uniqueThreshold });
  });

  // Single verification — the core A2A endpoint.
  // POST /api/verify { content | url, kind?, subject?, mint? }
  app.post('/api/verify', async (req, res) => {
    try {
      const { content, url, kind, subject, mint = true } = req.body || {};
      const raw = url || content;
      if (typeof raw !== 'string' || !raw.trim()) {
        return res.status(400).json({ ok: false, error: 'content or url (string) required' });
      }
      const resolved = await resolveInput(kind ? JSON.stringify({ content, url, kind }) : raw);
      const result = await verifyContent(resolved.text, {
        kind: resolved.kind,
        subject,
        mint,
        sourceUrl: resolved.sourceUrl,
      });
      if (!result.ok) return res.status(422).json(result);
      res.json({
        ok: true,
        unique: result.unique,
        score: result.score,
        contentHash: result.contentHash,
        sourceUrl: result.report.sourceUrl,
        attestationTx: result.attestationTx,
        attestation: result.attestation,
        summary: result.report.reportSummary,
        sources: result.report.sources,
      });
    } catch (e) {
      res.status(500).json({ ok: false, error: String(e.message || e) });
    }
  });

  // Certificate lookup — POST /api/lookup { content | url | hash }
  // Checks whether GhostWriter already certified this content, on-chain.
  app.post('/api/lookup', async (req, res) => {
    try {
      const raw = req.body?.hash ?? req.body?.url ?? req.body?.content;
      if (typeof raw !== 'string' || !raw.trim()) {
        return res.status(400).json({ ok: false, error: 'content, url, or hash (string) required' });
      }
      const resolved = await resolveInput(raw);
      const result = await lookupCertificate(resolved.text);
      if (!result.ok) return res.status(422).json(result);
      res.json({ ...result, sourceUrl: resolved.sourceUrl || undefined });
    } catch (e) {
      res.status(500).json({ ok: false, error: String(e.message || e) });
    }
  });

  // Batch verification — POST /api/verify/batch { items: [str,...], format?: 'json'|'csv' }
  app.post('/api/verify/batch', async (req, res) => {
    try {
      const { items, kind = 'text', mint = true, format = 'json' } = req.body || {};
      if (!Array.isArray(items) || !items.length) {
        return res.status(400).json({ ok: false, error: 'items (non-empty array) required' });
      }
      const results = await verifyBatch(items, { kind, mint });
      if (format === 'csv') {
        res.setHeader('Content-Type', 'text/csv');
        return res.send(batchToCsv(results));
      }
      res.json({ ok: true, count: results.length, results });
    } catch (e) {
      res.status(500).json({ ok: false, error: String(e.message || e) });
    }
  });

  return app;
}

export function startServer() {
  const app = createServer();
  return app.listen(config.port, () => {
    console.log(`[GhostWriter] REST API on http://localhost:${config.port}`);
  });
}
