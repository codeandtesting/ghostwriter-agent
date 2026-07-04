/**
 * Lightweight, dependency-free text similarity used for two things:
 *  1) scoring how strongly a web snippet overlaps our content, and
 *  2) an offline structural originality heuristic when no web search is
 *     available (internal repetition / boilerplate density).
 */

const STOP = new Set(
  'the a an and or but if then of to in on at for with by is are was were be been as it its this that these those from into over under about'.split(
    ' '
  )
);

export function tokenize(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w && !STOP.has(w));
}

/** Character n-gram shingles → robust to small edits. */
function shingles(text, k = 5) {
  const clean = text.toLowerCase().replace(/\s+/g, ' ').trim();
  const set = new Set();
  for (let i = 0; i + k <= clean.length; i++) set.add(clean.slice(i, i + k));
  return set;
}

export function jaccard(aText, bText) {
  const a = shingles(aText);
  const b = shingles(bText);
  if (!a.size || !b.size) return 0;
  let inter = 0;
  for (const s of a) if (b.has(s)) inter++;
  return inter / (a.size + b.size - inter);
}

/**
 * Offline originality heuristic in [0,1] where 1 = highly original.
 * Penalizes low lexical diversity (copy-paste padding tends to repeat).
 */
export function lexicalOriginality(text) {
  const toks = tokenize(text);
  if (toks.length < 20) return 0.5;
  const uniq = new Set(toks).size;
  const diversity = uniq / toks.length; // ~0.4 (repetitive) .. ~0.8 (rich)
  return Math.max(0, Math.min(1, (diversity - 0.3) / 0.45));
}
