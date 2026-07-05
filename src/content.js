import { createHash } from 'crypto';

/**
 * Content normalization + hashing + input resolution.
 *
 * The originality certificate is bound to a SHA-256 of the content. To make the
 * human flow robust — so a publisher pasting "the same article" reliably matches
 * the certified version despite minor formatting differences — we hash a
 * NORMALIZED form of the text, not the raw bytes.
 *
 * Normalization: Unicode NFC, collapse all whitespace runs to a single space,
 * trim. This absorbs indentation, line-wrapping, and copy-paste whitespace
 * differences while preserving the words themselves.
 */
export function normalizeContent(text) {
  return (text || '')
    .normalize('NFC')
    .replace(/\s+/g, ' ')
    .trim();
}

/** 0x-prefixed SHA-256 of the normalized content. Same words → same hash. */
export function contentHash(text) {
  return '0x' + createHash('sha256').update(normalizeContent(text), 'utf8').digest('hex');
}

const URL_RE = /^https?:\/\/\S+$/i;
const HASH_RE = /^0x[0-9a-fA-F]{64}$/;

export const looksLikeUrl = (s) => URL_RE.test((s || '').trim());
export const looksLikeHash = (s) => HASH_RE.test((s || '').trim());

/** Fetch a web page and extract its readable text (best-effort, dependency-free). */
export async function fetchUrlText(url) {
  const res = await fetch(url, {
    signal: AbortSignal.timeout(15000),
    headers: { 'user-agent': 'GhostWriter/1.0 (+https://agent.croo.network)' },
  });
  if (!res.ok) throw new Error(`Failed to fetch URL (${res.status})`);
  const html = await res.text();
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Resolve a buyer's raw requirement into usable text.
 *
 * Accepts, in order of preference:
 *  - JSON: {content|text|input: "..."} and/or {url|link: "https://..."}
 *  - a bare URL string  → fetches the page text
 *  - a bare 0x hash     → passed through as-is (for lookup by hash)
 *  - raw text
 *
 * Returns { text, sourceUrl, kind, isHash }.
 */
export async function resolveInput(raw) {
  const s = (raw || '').trim();
  let obj = null;
  try {
    const p = JSON.parse(s);
    if (p && typeof p === 'object') obj = p;
  } catch {
    /* not JSON */
  }

  let text = '';
  let sourceUrl = null;
  let kind = 'text';

  if (obj) {
    sourceUrl = obj.url || obj.link || null;
    text = obj.content ?? obj.text ?? obj.input ?? '';
    kind = obj.kind || 'text';
    text = text == null ? '' : String(text);
  } else if (looksLikeUrl(s)) {
    sourceUrl = s;
  } else {
    text = s;
  }

  // A bare hash is passed straight through (lookup-by-hash).
  if (!obj && looksLikeHash(s)) {
    return { text: s, sourceUrl: null, kind, isHash: true };
  }

  // If we only have a URL, fetch its text.
  if (sourceUrl && !text) {
    text = await fetchUrlText(sourceUrl);
  }

  return { text, sourceUrl, kind, isHash: false };
}
