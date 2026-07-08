import { test } from 'node:test';
import assert from 'node:assert';
import { sha256, runPlagiarismCheck } from '../src/plagiarism/engine.js';
import { jaccard, lexicalOriginality } from '../src/plagiarism/similarity.js';
import { verifyContent } from '../src/verify.js';
import { contentHash, normalizeContent, looksLikeHash, looksLikeUrl } from '../src/content.js';

test('normalized hash ignores whitespace/formatting differences', () => {
  const a = 'The quick brown fox   jumps\n\nover the lazy dog.';
  const b = '  The quick brown fox jumps over the lazy dog.  ';
  assert.equal(contentHash(a), contentHash(b));
});

test('normalizeContent collapses whitespace and trims', () => {
  assert.equal(normalizeContent('  a\n\t b  '), 'a b');
});

test('input detectors', () => {
  assert.ok(looksLikeHash('0x' + 'a'.repeat(64)));
  assert.ok(!looksLikeHash('0xzz'));
  assert.ok(looksLikeUrl('https://example.com/x'));
  assert.ok(!looksLikeUrl('just text'));
});

const LONG = 'Original sentence number one about navigation and endurance across oceans. '.repeat(6);

test('sha256 is deterministic and 0x-prefixed', () => {
  const h = sha256('hello');
  assert.match(h, /^0x[0-9a-f]{64}$/);
  assert.equal(h, sha256('hello'));
});

test('jaccard: identical text ~1, disjoint ~0', () => {
  assert.ok(jaccard('the quick brown fox', 'the quick brown fox') > 0.99);
  assert.ok(jaccard('aaaaaa', 'zzzzzz') < 0.01);
});

test('lexicalOriginality returns [0,1]', () => {
  const v = lexicalOriginality(LONG);
  assert.ok(v >= 0 && v <= 1);
});

test('rejects too-short content', async () => {
  const r = await runPlagiarismCheck('too short');
  assert.equal(r.ok, false);
  assert.match(r.error, /too short/i);
});

test('verifyContent produces score + attestation for valid content', async () => {
  const r = await verifyContent(LONG, { subject: '0x1111111111111111111111111111111111111111', mint: false });
  assert.equal(r.ok, true);
  assert.ok(typeof r.score === 'number' && r.score >= 0 && r.score <= 100);
  assert.ok(r.contentHash.startsWith('0x'));
  assert.ok(r.attestation);
  assert.ok(r.attestation.signature || r.attestation.attestationTx);
});
