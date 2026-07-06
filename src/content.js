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

function decodeEntities(s) {
  return s
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}

const stripTags = (h) => decodeEntities(h.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

/**
 * Extract the readable *article body* from HTML — not nav bars, menus, headers
 * or footers. Strategy: drop non-content elements, prefer the <article> region,
 * then collect paragraph text; fall back to a full strip if that's too thin.
 */
export function extractReadable(html) {
  let h = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<svg[\s\S]*?<\/svg>/gi, ' ')
    .replace(/<(nav|header|footer|aside|form)\b[\s\S]*?<\/\1>/gi, ' ');

  const article = h.match(/<article\b[\s\S]*?<\/article>/i);
  const scope = article ? article[0] : h;

  const paras = [...scope.matchAll(/<p\b[\s\S]*?<\/p>/gi)]
    .map((m) => stripTags(m[0]))
    .filter((t) => t.length > 40); // drop menu-item fragments

  let text = paras.join('\n\n');
  if (text.length < 200) text = stripTags(scope); // fallback for thin/JS pages
  return text.replace(/\s+/g, ' ').trim();
}

/** Fetch a web page and extract its readable article text. */
export async function fetchUrlText(url) {
  const res = await fetch(url, {
    signal: AbortSignal.timeout(15000),
    headers: { 'user-agent': 'GhostWriter/1.0 (+https://agent.croo.network)' },
  });
  if (!res.ok) throw new Error(`Failed to fetch URL (${res.status})`);
  return extractReadable(await res.text());
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
  } else {
    text = s;
  }
  text = text.trim();

  // The value itself may be a bare hash or a bare URL — even when the CROO store
  // wraps it as {"text":"..."}. Detect and handle those.
  if (looksLikeHash(text)) {
    return { text, sourceUrl: null, kind, isHash: true };
  }
  if (!sourceUrl && looksLikeUrl(text)) {
    sourceUrl = text;
    text = '';
  }

  // If we only have a URL, fetch its readable text.
  if (sourceUrl && !text) {
    text = await fetchUrlText(sourceUrl);
  }

  return { text, sourceUrl, kind, isHash: false };
}
