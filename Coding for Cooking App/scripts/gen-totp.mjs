// Test helper: print a live TOTP code for a base32 secret.
// Usage: node scripts/gen-totp.mjs <base32secret> [offsetSteps]
import { totpCode } from '../shared/authShared.js';

const secret = process.argv[2];
const offsetSteps = Number(process.argv[3] || 0);
if (!secret) {
  console.error('usage: node scripts/gen-totp.mjs <base32secret> [offsetSteps]');
  process.exit(1);
}
console.log(await totpCode(secret, { offsetSteps }));
