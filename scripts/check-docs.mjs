#!/usr/bin/env node
// Documentation integrity check: required community files exist and every relative markdown link resolves.
// Run in CI (.github/workflows/docs.yml) and locally: node scripts/check-docs.mjs
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, normalize } from 'node:path';

const required = ['README.md', 'LICENSE', 'CONTRIBUTING.md', 'CODE_OF_CONDUCT.md', 'SECURITY.md', 'CHANGELOG.md', 'brand/icon.svg'];
const missing = required.filter((f) => !existsSync(f) || statSync(f).size === 0);

// GitBook source is validated by its own sync; skip it here so one broken page cannot block unrelated code.
const files = execFileSync('git', ['ls-files', '*.md'], { encoding: 'utf8' })
  .split('\n')
  .map((s) => s.trim())
  .filter((f) => f && !f.startsWith('gitbook/') && !f.includes('node_modules/'));

const broken = [];
const linkRe = /\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;
for (const f of files) {
  const text = readFileSync(f, 'utf8').replace(/```[\s\S]*?```/g, '');
  for (const m of text.matchAll(linkRe)) {
    let target = m[1];
    if (/^(https?:|mailto:|#|data:)/i.test(target)) continue;
    target = decodeURIComponent(target.split('#')[0].split('?')[0]);
    if (!target) continue;
    const path = target.startsWith('/') ? normalize(target.slice(1)) : normalize(join(dirname(f), target));
    if (!existsSync(path)) broken.push(`${f}: ${m[1]}`);
  }
}

if (missing.length || broken.length) {
  if (missing.length) console.error(`Missing or empty required files:\n  ${missing.join('\n  ')}`);
  if (broken.length) console.error(`Broken relative links:\n  ${broken.join('\n  ')}`);
  process.exit(1);
}
console.log(`docs ok: ${files.length} markdown files, all required files present, no broken relative links`);
