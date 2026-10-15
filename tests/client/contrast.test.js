import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const read = f => fs.readFileSync(path.resolve(f), 'utf8');
const css = read('client/src/theme/tokens.css');
const globalCss = read('client/src/theme/global.css');
// Reads --name: value pairs from one rule; a value is a hex color or var(--other).
const block = (selector, source = css) => {
  const start = source.indexOf(`${selector} {`);
  return Object.fromEntries([...source.slice(start, source.indexOf('}', start)).matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{6}|var\(--[\w-]+\))/g)].map(m => [m[1], m[2]]));
};
const resolve = (tokens, name) => {
  let v = tokens[name];
  for (let i = 0; i < 5 && v?.startsWith('var('); i += 1) v = tokens[v.slice(6, -1)];
  return v;
};
const lum = hex => {
  const c = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(v => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

const PAIRS = [['ink', 'parchment'], ['ink-soft', 'parchment'], ['accent-ink', 'parchment'], ['ink', 'parchment-deep'],
  ['text-on-leather', 'leather-800'], ['text-on-leather', 'leather-900'], ['oxblood', 'parchment']];

describe('theme contrast (WCAG AA)', () => {
  const base = block(':root');
  const folk = { ...base, ...block("[data-theme='book-folk']") };
  for (const [name, tokens] of [['old-book', base], ['book-folk', folk]]) {
    for (const [fg, bg] of PAIRS) {
      it(`${name}: ${fg} on ${bg} (4.5:1)`, () => {
        expect(resolve(tokens, fg), `--${fg} missing`).toBeDefined();
        expect(ratio(resolve(tokens, fg), resolve(tokens, bg))).toBeGreaterThanOrEqual(4.5);
      });
    }
    // The chosen category icon is a non-text mark, so 3:1 against its filled box.
    it(`${name}: chosen category icon (3:1)`, () => {
      const rule = globalCss.slice(globalCss.indexOf('.icon-choice input:checked + span {'));
      const body = rule.slice(rule.indexOf('{') + 1, rule.indexOf('}'));
      const decl = prop => body.split(';').map(d => d.split(':').map(x => x.trim())).find(([p]) => p === prop)?.[1]?.slice(6, -1);
      expect(decl('color'), 'color missing').toBeDefined();
      expect(ratio(resolve(tokens, decl('color')), resolve(tokens, decl('background')))).toBeGreaterThanOrEqual(3);
    });
    // Focus rings are non-text, so 3:1. Dark areas (.sidebar, .topbar) set their own light ring.
    const dark = { ...tokens, ...block('.sidebar, .topbar', globalCss) };
    for (const [bg, scope] of [['leather-800', dark], ['leather-900', dark], ['parchment', tokens], ['parchment-deep', tokens]]) {
      it(`${name}: focus ring on ${bg} (3:1)`, () => {
        expect(resolve(scope, 'focus'), '--focus missing').toBeDefined();
        expect(ratio(resolve(scope, 'focus'), resolve(scope, bg))).toBeGreaterThanOrEqual(3);
      });
    }
  }
});
