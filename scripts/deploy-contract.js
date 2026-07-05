/**
 * Compile and deploy GhostWriterAttestation.sol to Base.
 *
 * Usage (from project root):
 *   DEPLOYER_PRIVATE_KEY=0xyourkey node scripts/deploy-contract.js
 *
 * Uses BASE_RPC_URL from .env (defaults to https://mainnet.base.org).
 * Prints the deployed contract address — set it as ATTESTATION_CONTRACT and set
 * the same key as MINTER_PRIVATE_KEY so the provider mints real NFTs.
 *
 * The private key is read only from the environment; it is never written to disk
 * or logged.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import solc from 'solc';
import { ethers } from 'ethers';
import { config } from '../src/config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const KEY = process.env.DEPLOYER_PRIVATE_KEY;

if (!KEY) {
  console.error('Set DEPLOYER_PRIVATE_KEY (a funded Base wallet key) in the environment.');
  process.exit(1);
}

function compile() {
  const src = fs.readFileSync(
    path.join(__dirname, '..', 'contracts', 'GhostWriterAttestation.sol'),
    'utf8'
  );
  const input = {
    language: 'Solidity',
    sources: { 'GhostWriterAttestation.sol': { content: src } },
    settings: {
      optimizer: { enabled: true, runs: 200 },
      outputSelection: { '*': { '*': ['abi', 'evm.bytecode.object'] } },
    },
  };
  const out = JSON.parse(solc.compile(JSON.stringify(input)));
  const errors = (out.errors || []).filter((e) => e.severity === 'error');
  if (errors.length) {
    for (const e of errors) console.error(e.formattedMessage);
    throw new Error('Solidity compilation failed');
  }
  const c = out.contracts['GhostWriterAttestation.sol']['GhostWriterAttestation'];
  return { abi: c.abi, bytecode: '0x' + c.evm.bytecode.object };
}

async function main() {
  const { abi, bytecode } = compile();
  console.log('[deploy] compiled GhostWriterAttestation');

  const provider = new ethers.JsonRpcProvider(config.baseRpcUrl);
  const wallet = new ethers.Wallet(KEY, provider);
  const net = await provider.getNetwork();
  const bal = await provider.getBalance(wallet.address);
  console.log(`[deploy] deployer ${wallet.address} on chainId ${net.chainId}, balance ${ethers.formatEther(bal)} ETH`);

  if (bal === 0n) {
    throw new Error('Deployer has 0 ETH on this network — fund it with a little Base ETH first.');
  }

  const factory = new ethers.ContractFactory(abi, bytecode, wallet);
  console.log('[deploy] sending deployment tx…');
  const contract = await factory.deploy();
  const tx = contract.deploymentTransaction();
  console.log(`[deploy] tx ${tx.hash} — waiting for confirmation…`);
  await contract.waitForDeployment();
  const address = await contract.getAddress();

  console.log('\n[deploy] ===== DEPLOYED =====');
  console.log('contract :', address);
  console.log('tx       :', tx.hash);
  console.log('basescan :', `https://basescan.org/address/${address}`);
  console.log('\nNext: set these on Railway (and .env):');
  console.log(`  ATTESTATION_CONTRACT=${address}`);
  console.log('  MINTER_PRIVATE_KEY=<the same deployer key>   (it is the contract owner / only minter)');
}

main().catch((e) => {
  console.error('[deploy] error:', e.message || e);
  process.exit(1);
});
