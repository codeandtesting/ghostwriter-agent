import { config } from '../config.js';

/**
 * Extract representative "fingerprint" phrases from content — long, distinctive
 * shingles are far better plagiarism probes than short common phrases.
 */
export function extractProbes(text, maxProbes = 5) {
  const sentences = text
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.split(' ').length >= 8);

  // Prefer the longest, most information-dense sentences.
  const ranked = sentences
    .sort((a, b) => b.length - a.length)
    .slice(0, maxProbes);

  return ranked.length ? ranked : [text.slice(0, 200)];
}

/**
 * Query the web for a probe phrase via SerpAPI. Returns an array of
 * { title, link, snippet }. If no key is configured, returns [] so the engine
 * falls back to structural/heuristic analysis instead of failing.
 */
export async function webSearch(query) {
  if (!config.serpApiKey) return { configured: false, results: [] };

  const url = new URL('https://serpapi.com/search.json');
  url.searchParams.set('engine', 'google');
  url.searchParams.set('q', `"${query.slice(0, 120)}"`); // exact-match probe
  url.searchParams.set('num', '10');
  url.searchParams.set('api_key', config.serpApiKey);

  const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`SerpAPI ${res.status}`);
  const data = await res.json();
  const results = (data.organic_results || []).map((r) => ({
    title: r.title,
    link: r.link,
    snippet: r.snippet || '',
  }));
  return { configured: true, results };
}
