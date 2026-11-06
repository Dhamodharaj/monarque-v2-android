// Legacy-reference audit. Scans shipped files for terms from the previous universe / old engine vocabulary.
// Every match is classified: COMPAT (internal engine id, never shown), DEV (tests, sims, scripts, archived docs),
// or LEAK (user-facing; fails the audit).
//   node scripts/legacy-audit.mjs [--verbose]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ALL_DIALOGUE } from '../src/story/reactions.js';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const verbose = process.argv.includes('--verbose');

const IP = /dragon ?ball|\bgoku\b|vegeta|saiyan|super saiyan|capsule corp|ultra instinct|\bzeno\b|\bwhis\b|frieza|\bnaruto\b|one piece|bleach|jujutsu|hunter x hunter|my hero|\bluffy\b|\bsasuke\b|\bichigo\b|\bsukuna\b|kamehameha|ki clash|\bkiclash\b|shenron|\bsenzu\b|mafuba|scouter|\bnamek|\bbeerus\b/i;
const KI = /\bKi\b|\bKI\b/; // the old resource name: case-sensitive so identifiers like 'ki' do not match
const TERMS = /game master|crazy round|wild ?card|decree|\bfighter\b|\bcurse\b|\bzenkai\b|domain inversion|final atonement|solar flare|time chamber|side quest|training arc|bounty hunt|sacred auction|divine swap/i;

// Internal compat ids: engine effect ids appear in code as quoted identifiers or object keys, never as display text.
const COMPAT_ID = /['"`](SENZU|MAFUBA|SCOUTER|SHENRON_WISH|FINAL_ATONEMENT|OTHER_WORLD|SOLAR_FLARE|CURSE|CURSE_INJECTION|ZENKAI|TIME_CHAMBER|SIDE_QUEST|TRAINING_ARC|BOUNTY_HUNT|SACRED_AUCTION|DIVINE_SWAP|DRAGON_BALL_DRAFT|GM_GIFT|PUBLIC_FORECAST|NO_APEX|TOTAL_MIGHT|BACKWARDS|WISH_ROUND|HIGH_STAKES)['"`]|\b(SENZU|MAFUBA|SCOUTER|SHENRON_WISH|FINAL_ATONEMENT|OTHER_WORLD|SOLAR_FLARE|CURSE_INJECTION|ZENKAI|TIME_CHAMBER|SIDE_QUEST|TRAINING_ARC|BOUNTY_HUNT|SACRED_AUCTION|DIVINE_SWAP|DRAGON_BALL_DRAFT|GM_GIFT)\b/;

const SCAN = ['src', 'public', 'index.html', 'package.json', 'README.md', 'scripts', 'docs', 'data-src'];
const SKIP_DIR = new Set(['node_modules', 'dist', '.git']);
const files = [];
for (const s of SCAN) (function walk(p) {
  const full = path.join(root, p); if (!fs.existsSync(full)) return; const st = fs.statSync(full);
  if (st.isDirectory()) { if (SKIP_DIR.has(path.basename(full))) return; for (const f of fs.readdirSync(full)) walk(path.join(p, f)); }
  else if (/\.(js|jsx|mjs|json|css|html|md|txt)$/.test(full) && st.size < 3e6 && !files.includes(p)) files.push(p);
})(s);

const isDev = (f) => /^scripts\//.test(f) || /^docs\//.test(f) || /^data-src\//.test(f);
// Files whose job is to bridge: the engine itself, the lexicon patterns, the presentation layer and the generated bridge table.
const isCompatFile = (f) => /^src\/game\/(GameEngine|AIEngine|AITurn|SpecialCards|lexicon|presentation)\.js$/.test(f) || /^src\/data\/(monarque\.generated\.js|cards\.json)$/.test(f) || /^src\/story\/(powers|storyAI|duel|storyFlow)\.js$/.test(f);
// Text a player could read: string literals containing a space (or a lone capitalised word) and JSX text nodes. Identifiers, ids and comments are not.
function visibleText(line) {
  const code = line.replace(/=>/g, '  ').replace(/(\w)>(\s)/g, '$1 $2').replace(/className=("[^"]*"|\{`[^`]*`\})/g, '').replace(/(querySelector(All)?|closest|matches|classList\.\w+|getElementById)\(([^)]*)\)/g, '').replace(/key=\{`[^`]*`\}/g, '').replace(/\/\/.*$/, '').replace(/\/\*.*?\*\//g, '');
  const out = [];
  for (const m of code.replace(/\$\{[^}]*\}/g, '').matchAll(/'([^'\\]*)'|"([^"\\]*)"|`([^`]*)`/g)) { const t = m[1] ?? m[2] ?? m[3] ?? ''; if (/\s/.test(t) || /^[A-Z][a-z]+$/.test(t)) out.push(t); }
  for (const m of code.matchAll(/>([^<>{}]*[A-Za-z][^<>{}]*)</g)) out.push(m[1]);
  return out.join(' | ');
}

const tally = { COMPAT: 0, DEV: 0, LEAK: 0 }; const leaks = []; const byFile = {};
const own = (f) => files.filter((x) => x.replace(/\\/g, '/') === f);
for (const f of [...new Set(files.map((x) => x.replace(/\\/g, '/').replace(/^\.\//, '')))]) {
  if (f === 'scripts/legacy-audit.mjs') continue;
  const text = fs.readFileSync(path.join(root, f), 'utf8').split('\n');
  text.forEach((line, i) => {
    const hit = IP.exec(line) || TERMS.exec(line) || KI.exec(line);
    if (!hit) return;
    let cls;
    const codeFile = /^src\/.*\.(jsx?|mjs)$/.test(f);
    const visible = codeFile ? visibleText(line) : line;
    if (codeFile && !(IP.test(visible) || TERMS.test(visible) || KI.test(visible)) && !isCompatFile(f) && !isDev(f)) { tally.COMPAT++; return; }
    if (isDev(f)) cls = 'DEV';
    else if (isCompatFile(f)) cls = 'COMPAT';
    else if (COMPAT_ID.test(line) && !IP.test(line.replace(COMPAT_ID, ''))) cls = 'COMPAT';
    else if (/^src\/.*\.css$/.test(f) && !/(^|[\s;{])content\s*:/.test(line)) cls = 'COMPAT'; // selectors, comments, keyframes: never rendered
    else if (/^src\/utils\/audioGain\.json$/.test(f)) cls = 'COMPAT'; // asset file names // class names / comments in CSS
    else cls = 'LEAK';
    tally[cls]++; (byFile[f] ??= {})[cls] = (byFile[f][cls] ?? 0) + 1;
    if (cls === 'LEAK') leaks.push(`${f}:${i + 1}: ${line.trim().slice(0, 140)}`);
  });
}
// Shipped story dialogue must be clean, calm and original.
const BANNED_KI = KI;
const BANNED = new RegExp(`${IP.source}|${TERMS.source}|\\bok(ay)?\\b|\\blol\\b|\\bawesome\\b|\\bcool\\b|power level`, 'i');
const dlg = [...new Set(typeof ALL_DIALOGUE === "function" ? ALL_DIALOGUE() : ALL_DIALOGUE)];
const bad = dlg.filter((l) => BANNED.test(l) || BANNED_KI.test(l) || /!{1,}.*!/.test(l) || (l.match(/!/g) ?? []).length > 1);
for (const l of bad) leaks.push(`dialogue: ${l}`);

console.log(`Legacy audit: ${files.length} files scanned, ${dlg.length} dialogue lines checked`);
console.log(`  COMPAT (internal ids/bridge): ${tally.COMPAT}\n  DEV (tests, sims, docs, source data): ${tally.DEV}\n  LEAK: ${leaks.length}`);
if (verbose) for (const [f, c] of Object.entries(byFile)) console.log(' ', f, JSON.stringify(c));
if (leaks.length) { console.log('\nLEAKS to fix:'); leaks.slice(0, 80).forEach((l) => console.log('  ' + l)); process.exit(1); }
console.log('PASS legacy audit: no user-facing leaks');
void own;
