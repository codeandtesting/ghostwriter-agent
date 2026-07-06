import { config } from '../config.js';
import { contentHash as computeContentHash } from '../content.js';
import { extractProbes, webSearch } from './websearch.js';
import { jaccard, lexicalOriginality } from './similarity.js';

// Backwards-compatible export; hashing is normalized (see src/content.js).
export const sha256 = computeContentHash;

/** Hostname of a URL, or null. Used to exclude a page from matching itself. */
function hostOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

/**
 * Run an originality check on a piece of content.
 *
 * Strategy:
 *  - Extract distinctive probe sentences.
 *  - Search the web for exact matches (SerpAPI). Any hit whose snippet overlaps
 *    strongly with our probe is treated as a potential source.
 *  - Combine web-match evidence with an offline lexical-originality heuristic
 *    into a single 0..100 uniqueness score.
 *
 * Returns a full provenance report suitable for embedding in an attestation.
 */
export async function runPlagiarismCheck(content, { kind = 'text', sourceUrl = null } = {}) {
  const text = (content || '').trim();
  const contentHash = computeContentHash(text);

  if (text.length < config.minContentLength) {
    return {
      ok: false,
      error: `Content too short: ${text.length} chars (minimum ${config.minContentLength}).`,
      contentHash,
    };
  }

  const probes = extractProbes(text);
  const sources = [];
  let webConfigured = false;
  let maxWebOverlap = 0;

  // When checking a URL, its own page (and other pages on the same host) are not
  // evidence of plagiarism — a page doesn't plagiarize itself.
  const selfHost = hostOf(sourceUrl);

  for (const probe of probes) {
    let hit;
    try {
      hit = await webSearch(probe);
    } catch (e) {
      hit = { configured: !!config.serpApiKey, results: [], error: String(e.message || e) };
    }
    webConfigured = webConfigured || hit.configured;
    for (const r of hit.results) {
      if (selfHost && hostOf(r.link) === selfHost) continue; // skip the source itself
      const overlap = jaccard(probe, `${r.title}. ${r.snippet}`);
      if (overlap > 0.18) {
        maxWebOverlap = Math.max(maxWebOverlap, overlap);
        sources.push({
          probe: probe.slice(0, 120),
          title: r.title,
          link: r.link,
          overlap: Number(overlap.toFixed(3)),
        });
      }
    }
  }

  // De-duplicate sources by link, keep strongest overlap.
  const byLink = new Map();
  for (const s of sources) {
    const prev = byLink.get(s.link);
    if (!prev || s.overlap > prev.overlap) byLink.set(s.link, s);
  }
  const dedupSources = [...byLink.values()].sort((a, b) => b.overlap - a.overlap);

  const offline = lexicalOriginality(text); // 0..1 (higher = more original)

  // Web evidence dominates when present; otherwise lean on offline heuristic.
  let score;
  if (webConfigured) {
    const webOriginality = 1 - Math.min(1, maxWebOverlap * 1.4);
    score = Math.round(100 * (0.75 * webOriginality + 0.25 * offline));
  } else {
    // No web search available — report conservatively and flag the limitation.
    score = Math.round(100 * (0.5 + 0.5 * offline));
  }
  score = Math.max(0, Math.min(100, score));

  return {
    ok: true,
    kind,
    sourceUrl,
    contentHash,
    uniquenessScore: score,
    unique: score >= config.uniqueThreshold,
    checkedAt: new Date().toISOString(),
    method: {
      webSearch: webConfigured ? 'serpapi' : 'unavailable (no SERPAPI_KEY)',
      offlineHeuristic: 'lexical-diversity + char-shingle jaccard',
    },
    probesChecked: probes.length,
    sources: dedupSources,
    reportSummary: buildSummary(score, dedupSources, webConfigured),
  };
}

function buildSummary(score, sources, webConfigured) {
  if (!webConfigured) {
    return `Offline-only estimate (no web index configured). Structural originality score ${score}/100. Attach SERPAPI_KEY for cross-web source matching.`;
  }
  if (!sources.length) {
    return `No matching sources found across the web. Content appears original (${score}/100).`;
  }
  return `Found ${sources.length} potentially overlapping source(s); strongest match ${sources[0].overlap}. Uniqueness ${score}/100.`;
}
