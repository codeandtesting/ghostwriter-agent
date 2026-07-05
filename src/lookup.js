import { ethers } from 'ethers';
import { config } from './config.js';
import { contentHash as computeContentHash, looksLikeHash } from './content.js';

/**
 * Certificate lookup: given a piece of content (or a raw 0x… SHA-256 hash),
 * check on-chain whether GhostWriter has already issued an originality
 * attestation for that EXACT content, and return the certificate details.
 *
 * Read-only: no gas, no private key. This is the "verify a claim" side of the
 * product — other agents call it before trusting/republishing content that
 * claims to be certified.
 */

const ABI = [
  'function verify(bytes32 contentHash) view returns (bool, uint16, uint256)',
  'function ownerOf(uint256 tokenId) view returns (address)',
  'function attestations(uint256) view returns (bytes32 contentHash, uint16 uniquenessScore, uint32 sourcesChecked, uint64 timestamp, address subject)',
];

/** Accept either an already-computed 0x… 32-byte hash, or raw content to hash. */
function toContentHash(input) {
  const raw = (input || '').trim();
  if (looksLikeHash(raw)) return raw.toLowerCase();
  return computeContentHash(raw); // normalized, matches the certify side
}

export async function lookupCertificate(input) {
  if (!config.attestationContract) {
    return { ok: false, error: 'No attestation contract configured (ATTESTATION_CONTRACT unset).' };
  }
  const contentHash = toContentHash(input);

  const provider = new ethers.JsonRpcProvider(config.baseRpcUrl);
  const contract = new ethers.Contract(config.attestationContract, ABI, provider);

  const [exists, score, tokenId] = await contract.verify(contentHash);
  if (!exists) {
    return { ok: true, certified: false, contentHash, contract: config.attestationContract };
  }

  const [owner, att] = await Promise.all([
    contract.ownerOf(tokenId).catch(() => null),
    contract.attestations(tokenId).catch(() => null),
  ]);

  return {
    ok: true,
    certified: true,
    contentHash,
    score: Number(score),
    tokenId: tokenId.toString(),
    owner,
    sourcesChecked: att ? Number(att.sourcesChecked) : undefined,
    certifiedAt: att ? new Date(Number(att.timestamp) * 1000).toISOString() : undefined,
    contract: config.attestationContract,
    chain: 'base',
  };
}
