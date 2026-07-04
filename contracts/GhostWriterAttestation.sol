// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * GhostWriterAttestation
 *
 * Minimal ERC-721 that records on-chain proof of a content originality check.
 * Each token binds a content SHA-256 hash to a uniqueness score, a timestamp,
 * and the number of sources checked. The tokenURI points at off-chain JSON
 * metadata (IPFS/Arweave). Only the GhostWriter minter (owner) can mint.
 *
 * Kept intentionally dependency-free (no OZ import) so it can be flattened and
 * deployed on Base with zero external files.
 */
contract GhostWriterAttestation {
    string public name = "GhostWriter Originality Attestation";
    string public symbol = "GWORIG";

    address public owner;
    uint256 public nextId = 1;

    struct Attestation {
        bytes32 contentHash;
        uint16 uniquenessScore; // 0..100
        uint32 sourcesChecked;
        uint64 timestamp;
        address subject; // wallet the proof was minted for
    }

    mapping(uint256 => address) public ownerOf;
    mapping(uint256 => string) public tokenURI;
    mapping(uint256 => Attestation) public attestations;
    // Fast lookup: has this exact content already been attested?
    mapping(bytes32 => uint256) public tokenIdForHash;

    event Transfer(address indexed from, address indexed to, uint256 indexed tokenId);
    event AttestationMinted(
        uint256 indexed tokenId,
        bytes32 indexed contentHash,
        address indexed subject,
        uint16 uniquenessScore
    );

    modifier onlyOwner() {
        require(msg.sender == owner, "not owner");
        _;
    }

    constructor() {
        owner = msg.sender;
    }

    function mint(
        address subject,
        bytes32 contentHash,
        uint16 uniquenessScore,
        uint32 sourcesChecked,
        string calldata uri
    ) external onlyOwner returns (uint256 tokenId) {
        require(uniquenessScore <= 100, "score>100");
        tokenId = nextId++;
        ownerOf[tokenId] = subject;
        tokenURI[tokenId] = uri;
        attestations[tokenId] = Attestation({
            contentHash: contentHash,
            uniquenessScore: uniquenessScore,
            sourcesChecked: sourcesChecked,
            timestamp: uint64(block.timestamp),
            subject: subject
        });
        tokenIdForHash[contentHash] = tokenId;

        emit Transfer(address(0), subject, tokenId);
        emit AttestationMinted(tokenId, contentHash, subject, uniquenessScore);
    }

    /// Verify an attestation by content hash. Returns (exists, score, tokenId).
    function verify(bytes32 contentHash) external view returns (bool, uint16, uint256) {
        uint256 id = tokenIdForHash[contentHash];
        if (id == 0) return (false, 0, 0);
        return (true, attestations[id].uniquenessScore, id);
    }
}
