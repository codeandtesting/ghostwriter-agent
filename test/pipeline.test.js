import { test } from 'node:test';
import assert from 'node:assert';
import { sha256, runPlagiarismCheck } from '../src/plagiarism/engine.js';
import { jaccard, lexicalOriginality } from '../src/plagiarism/similarity.js';
import { verifyContent } from '../src/verify.js';

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
  const r = await verifyContent(LONG, { subject: '0x1111111111111111111111111111111111111111' });
  assert.equal(r.ok, true);
  assert.ok(typeof r.score === 'number' && r.score >= 0 && r.score <= 100);
  assert.ok(r.contentHash.startsWith('0x'));
  assert.ok(r.attestation);
  assert.ok(r.attestation.signature || r.attestation.attestationTx);
});
