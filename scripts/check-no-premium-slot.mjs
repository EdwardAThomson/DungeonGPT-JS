// Deploy guard: the local premium-content slot (src/data/premiumTemplates.local.js)
// is merged into the bundle at BUILD time for local playtesting. Deploying with it
// populated would publish premium content — the exact thing the private-content
// architecture exists to prevent (docs/LICENSING_OPTIONS.md, backlog #40).
// This runs as `predeploy`; override knowingly with ALLOW_PREMIUM_SLOT=1.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const slot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src', 'data', 'premiumTemplates.local.js');

if (fs.existsSync(slot) && process.env.ALLOW_PREMIUM_SLOT !== '1') {
  console.error(
    '\n✖ DEPLOY BLOCKED: src/data/premiumTemplates.local.js exists.\n' +
    '  Deploying now would bundle PREMIUM content into the public site.\n' +
    '  Remove/move the slot file (it lives canonically in dungeongpt-premium-content),\n' +
    '  or — only if you truly intend this — set ALLOW_PREMIUM_SLOT=1.\n'
  );
  process.exit(1);
}
console.log('✓ premium slot clear — safe to deploy');
