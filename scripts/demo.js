/**
 * Local end-to-end demo of the GhostWriter pipeline WITHOUT the CROO backend.
 * Runs the originality check + attestation for a sample original text and a
 * blatantly copied one, so a reviewer can see scoring + attestation offline.
 *
 *   node scripts/demo.js
 */
import { verifyContent } from '../src/verify.js';

const ORIGINAL = `The migratory patterns of the Arctic tern reveal an astonishing feat of
endurance that few other creatures on Earth can rival. Each year this small seabird
traces a looping route between its polar breeding grounds and the opposite pole,
threading through shifting winds and open ocean with uncanny precision. Researchers
tracking individual birds have logged journeys that, over a lifetime, add up to more
than the distance of several round trips to the Moon, a testament to biological
navigation we still only partly understand.`;

const COPIED = `Lorem ipsum dolor sit amet, consectetur adipiscing elit. Lorem ipsum dolor
sit amet, consectetur adipiscing elit. Lorem ipsum dolor sit amet, consectetur
adipiscing elit. Lorem ipsum dolor sit amet, consectetur adipiscing elit. Lorem ipsum
dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt ut labore.`;

function print(label, r) {
  console.log(`\n=== ${label} ===`);
  console.log('score     :', r.score);
  console.log('unique    :', r.unique);
  console.log('hash      :', r.contentHash);
  console.log('summary   :', r.report.reportSummary);
  console.log('sources   :', r.report.sources.length);
  console.log('attest.   :', r.attestation.onChain ? r.attestation.attestationTx : `${r.attestation.note}`);
  console.log('signer    :', r.attestation.signer);
}

const wallet = '0x1111111111111111111111111111111111111111';
print('ORIGINAL TEXT', await verifyContent(ORIGINAL, { subject: wallet }));
print('LOW-QUALITY / REPETITIVE', await verifyContent(COPIED, { subject: wallet }));
console.log('\nDemo complete.');
