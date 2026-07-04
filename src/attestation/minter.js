import { ethers } from 'ethers';
import { config } from '../config.js';

/** ABI subset matching contracts/GhostWriterAttestation.sol */
const ABI = [
  'function mint(address subject, bytes32 contentHash, uint16 uniquenessScore, uint32 sourcesChecked, string uri) returns (uint256)',
  'function verify(bytes32 contentHash) view returns (bool, uint16, uint256)',
  'event AttestationMinted(uint256 indexed tokenId, bytes32 indexed contentHash, address indexed subject, uint16 uniquenessScore)',
];

function buildMetadata(report, subject) {
  return {
    name: `GhostWriter Attestation — ${report.contentHash.slice(0, 10)}`,
    description: 'On-chain proof of a content originality check performed by GhostWriter.',
    attributes: [
      { trait_type: 'Uniqueness Score', value: report.uniquenessScore },
      { trait_type: 'Unique', value: report.unique ? 'true' : 'false' },
      { trait_type: 'Content Hash', value: report.contentHash },
      { trait_type: 'Sources Checked', value: report.sources.length },
      { trait_type: 'Kind', value: report.kind },
      { trait_type: 'Checked At', value: report.checkedAt },
    ],
    ghostwriter: {
      version: '1.0.0',
      subject,
      method: report.method,
      sources: report.sources,
    },
  };
}

/**
 * Mint an originality attestation.
 *
 * If MINTER_PRIVATE_KEY + ATTESTATION_CONTRACT are configured, mints a real
 * ERC-721 on Base. Otherwise returns a signed off-chain attestation object so
 * the full agent flow still works end-to-end in a demo/CI environment.
 */
export async function mintAttestation(report, subjectAddress) {
  const subject =
    subjectAddress && ethers.isAddress(subjectAddress)
      ? subjectAddress
      : ethers.ZeroAddress;
  const metadata = buildMetadata(report, subject);

  if (!config.minterPrivateKey || !config.attestationContract) {
    // Off-chain fallback: deterministic signed attestation (no chain write).
    const wallet = config.minterPrivateKey
      ? new ethers.Wallet(config.minterPrivateKey)
      : ethers.Wallet.createRandom();
    const payload = JSON.stringify({
      contentHash: report.contentHash,
      uniquenessScore: report.uniquenessScore,
      checkedAt: report.checkedAt,
    });
    const signature = await wallet.signMessage(payload);
    return {
      onChain: false,
      attestationTx: null,
      tokenId: null,
      signer: wallet.address,
      signature,
      metadata,
      note: 'Off-chain signed attestation (set MINTER_PRIVATE_KEY + ATTESTATION_CONTRACT to mint on Base).',
    };
  }

  const provider = new ethers.JsonRpcProvider(config.baseRpcUrl);
  const wallet = new ethers.Wallet(config.minterPrivateKey, provider);
  const contract = new ethers.Contract(config.attestationContract, ABI, wallet);

  // In production the metadata JSON would be pinned to IPFS/Arweave first;
  // we embed a data URI so the demo needs no external pinning service.
  const uri = 'data:application/json;base64,' + Buffer.from(JSON.stringify(metadata)).toString('base64');

  const tx = await contract.mint(
    subject,
    report.contentHash,
    report.uniquenessScore,
    report.sources.length,
    uri
  );
  const receipt = await tx.wait();

  let tokenId = null;
  for (const log of receipt.logs) {
    try {
      const parsed = contract.interface.parseLog(log);
      if (parsed?.name === 'AttestationMinted') tokenId = parsed.args.tokenId.toString();
    } catch {
      /* not our event */
    }
  }

  return {
    onChain: true,
    attestationTx: receipt.hash,
    tokenId,
    signer: wallet.address,
    contract: config.attestationContract,
    metadata,
  };
}
