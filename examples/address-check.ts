/**
 * Decide whether user-supplied targets are safe for a public proxy to connect to.
 *
 *   node examples/address-check.ts
 */
import { isInCidr, isPrivateAddress, normalizeAddress, splitHostPort } from '../src/index.ts';

const targets = [
  '93.184.215.14:443',
  '127.0.0.1:22',
  '[::ffff:169.254.169.254]:80',
  '[2606:4700:4700::1111]:443',
  '10.1.2.3:8080',
  'example.com:80',
];

for (const target of targets) {
  const parsed = splitHostPort(target);
  if (!parsed) {
    console.log(`${target.padEnd(30)} invalid`);
    continue;
  }
  const address = normalizeAddress(parsed.host);
  if (!address) {
    console.log(`${target.padEnd(30)} hostname: resolve it, then check every answer`);
    continue;
  }
  const verdict = isPrivateAddress(address) ? 'blocked' : 'allowed';
  const note = isInCidr(address, '10.0.0.0/8') ? ' (inside 10.0.0.0/8)' : '';
  console.log(`${target.padEnd(30)} ${address} ${verdict}${note}`);
}
