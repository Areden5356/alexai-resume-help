'use strict';
// Accessibility basics, checked statically across every page. No network, no browser.
// Run with: node --test tests/a11y.test.js
// This covers the mechanical basics only. It does not replace testing with a screen reader,
// a keyboard-only pass, or browser zoom, and the contrast check covers the color tokens in the
// stylesheet, not every rendered combination.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');

function walk(dir, out = []) {
  for (const name of fs.readdirSync(dir)) {
    if (['.git', 'tests', 'node_modules'].includes(name)) continue;
    const p = path.join(dir, name);
    if (fs.statSync(p).isDirectory()) walk(p, out); else out.push(p);
  }
  return out;
}
const rel = (p) => path.relative(ROOT, p).split(path.sep).join('/');
const read = (f) => fs.readFileSync(f, 'utf8');
const pages = walk(ROOT).filter((f) => f.endsWith('.html')).map((f) => ({ name: rel(f), html: read(f).replace(/<script[\s\S]*?<\/script>/gi, '') }));
const css = read(path.join(ROOT, 'assets', 'style.css'));

const attr = (tag, name) => (tag.match(new RegExp('\\b' + name + '="([^"]*)"')) || [])[1];
const textOf = (html) => html.replace(/<[^>]+>/g, ' ').replace(/&[a-z#0-9]+;/g, ' ').replace(/\s+/g, ' ').trim();

test('every page has a lang attribute, a title, one h1 and exactly one main landmark', () => {
  for (const p of pages) {
    assert.match(p.html, /<html lang="[a-z]{2}(?:-[A-Za-z]{2})?">/, p.name + ' lang');
    assert.ok(textOf((p.html.match(/<title>([\s\S]*?)<\/title>/) || [])[1] || '').length > 0, p.name + ' title');
    assert.equal((p.html.match(/<h1[\s>]/g) || []).length, 1, p.name + ' h1 count');
    assert.equal((p.html.match(/<main[\s>]/g) || []).length, 1, p.name + ' main count');
  }
  console.log('    pages checked: ' + pages.length);
});

test('images have alt text, and the site uses none', () => {
  let imgs = 0;
  for (const p of pages) {
    for (const m of p.html.matchAll(/<img\b[^>]*>/g)) {
      imgs++;
      assert.ok(attr(m[0], 'alt') !== undefined, p.name + ' image without alt: ' + m[0]);
    }
  }
  console.log('    images found: ' + imgs);
});

test('every form control has a label, and every label points at a real control', () => {
  let controls = 0;
  for (const p of pages) {
    const ids = [...p.html.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]);
    assert.equal(new Set(ids).size, ids.length, p.name + ' has duplicate ids');
    const labelFor = new Set([...p.html.matchAll(/<label\b[^>]*\bfor="([^"]+)"/g)].map((m) => m[1]));
    for (const m of p.html.matchAll(/<(input|textarea|select)\b[^>]*>/g)) {
      if (/type="(?:hidden|submit|button)"/.test(m[0])) continue;
      controls++;
      const id = attr(m[0], 'id');
      const named = (id && labelFor.has(id)) || attr(m[0], 'aria-label') || attr(m[0], 'aria-labelledby');
      assert.ok(named, p.name + ' control without a label: ' + m[0]);
    }
    for (const f of labelFor) assert.ok(ids.includes(f), p.name + ' label for="' + f + '" has no matching id');
    for (const m of p.html.matchAll(/<button\b[^>]*>([\s\S]*?)<\/button>/g)) {
      assert.ok(textOf(m[1]).length > 0 || attr(m[0], 'aria-label'), p.name + ' button without a name');
    }
  }
  console.log('    form controls labelled: ' + controls);
  assert.ok(controls >= 7, 'expected the three tools to expose their inputs, found ' + controls);
});

test('links have visible text or an aria-label, and there is a working skip link', () => {
  for (const p of pages) {
    for (const m of p.html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/g)) {
      assert.ok(textOf(m[2]).length > 0 || attr(m[1], 'aria-label'), p.name + ' link without text: ' + m[0].slice(0, 80));
    }
    assert.match(p.html, /<main id="main">/, p.name + ' main id');
    if (p.name === '404.html') continue; // five links and no repeated header: a skip link and nav have nothing to skip
    assert.match(p.html, /<a class="skip" href="#main">/, p.name + ' skip link');
    assert.ok(!/tabindex="[1-9]/.test(p.html), p.name + ' uses a positive tabindex');
    for (const m of p.html.matchAll(/<details\b[^>]*>([\s\S]*?)<\/details>/g)) assert.match(m[1], /<summary\b/, p.name + ' details without summary');
    assert.match(p.html, /<nav aria-label="[^"]+">/, p.name + ' nav needs a label');
  }
});

test('the 404 page, which carries its own styles, keeps a visible focus style and removes no outlines', () => {
  const style = read(path.join(ROOT, '404.html')).match(/<style>([\s\S]*?)<\/style>/)[1];
  assert.match(style, /:focus-visible\s*\{[^}]*outline:\s*3px solid var\(--accent\)/);
  assert.ok(!/outline:\s*(?:none|0)/.test(style));
});

test('the stylesheet has a visible focus style, a skip link reveal, and no rule that removes outlines', () => {
  const rule = css.match(/:focus-visible\s*\{([^}]*)\}/);
  assert.ok(rule, 'no :focus-visible rule');
  const w = rule[1].match(/outline:\s*(\d+)px\s+solid\s+var\(--([a-z-]+)\)/);
  assert.ok(w && Number(w[1]) >= 2, 'focus outline must be solid and at least 2px: ' + rule[1]);
  assert.ok(!/outline:\s*(?:none|0)\b/.test(css), 'a rule removes outlines');
  assert.match(css, /\.skip:focus\s*\{[^}]*left:\s*0/, 'skip link is not revealed on focus');
  assert.match(css, /::placeholder\s*\{[^}]*color:\s*var\(--muted\)/, 'placeholder color must use a token with checked contrast');
  assert.match(css, /prefers-reduced-motion/);
  console.log('    focus outline: ' + w[1] + 'px solid var(--' + w[2] + ')');
});

function lum(hex) {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };
const vars = (block) => Object.fromEntries([...block.matchAll(/--([a-z-]+):\s*(#[0-9a-fA-F]{6});/g)].map((m) => [m[1], m[2]]));

test('contrast ratios for the color tokens, light and dark (text 4.5:1, focus ring and borders 3:1)', () => {
  const light = vars(css.match(/:root \{([^}]*)\}/)[1]);
  const dark = Object.assign({}, light, vars(css.match(/prefers-color-scheme: dark\)\s*\{\s*:root \{([^}]*)\}/)[1]));
  const text = [
    ['ink', 'bg', 'body text'], ['ink', 'surface', 'text on cards'], ['muted', 'bg', 'secondary text'], ['muted', 'surface', 'secondary text on cards'],
    ['link', 'bg', 'links'], ['link', 'surface', 'links on cards'], ['accent', 'bg', 'eyebrow text'], ['accent', 'surface', 'tag text on cards'],
    ['on-accent', 'accent', 'button text'], ['bg', 'ink', 'skip link text'], ['ok', 'bg', 'status Fine'], ['ok', 'surface', 'status Fine on cards'],
    ['warn', 'bg', 'status Look'], ['warn', 'surface', 'status Look on cards'], ['bad', 'bg', 'status Check and errors'], ['bad', 'surface', 'status Check on cards'],
    ['ink', 'mark', 'highlighted text'], ['muted', 'mark', 'secondary text on highlight']
  ];
  const nontext = [['accent', 'bg', 'focus ring on page'], ['accent', 'surface', 'focus ring on cards'], ['muted', 'surface', 'input border'], ['ink', 'bg', 'quiet button border']];
  const rows = [];
  let minText = 99, minNon = 99;
  for (const [tname, theme] of [['light', light], ['dark', dark]]) {
    for (const [fg, bg, use] of text) {
      const r = ratio(theme[fg], theme[bg]);
      minText = Math.min(minText, r);
      rows.push(tname + ' | ' + fg + ' ' + theme[fg] + ' on ' + bg + ' ' + theme[bg] + ' | ' + r.toFixed(2) + ' | ' + use);
      assert.ok(r >= 4.5, tname + ' ' + use + ' (' + fg + ' on ' + bg + ') is ' + r.toFixed(2));
    }
    for (const [fg, bg, use] of nontext) {
      const r = ratio(theme[fg], theme[bg]);
      minNon = Math.min(minNon, r);
      rows.push(tname + ' | ' + fg + ' ' + theme[fg] + ' vs ' + bg + ' ' + theme[bg] + ' | ' + r.toFixed(2) + ' | ' + use + ' (3:1)');
      assert.ok(r >= 3, tname + ' ' + use + ' is ' + r.toFixed(2));
    }
  }
  rows.forEach((r) => console.log('    ' + r));
  console.log('    lowest text ratio: ' + minText.toFixed(2) + ', lowest non-text ratio: ' + minNon.toFixed(2));
});

test('the sample pack page: every text block is a labelled, keyboard-scrollable region, and the invented notice is the first thing in the content', () => {
  const html = read(path.join(ROOT, 'sample', 'index.html'));
  const blocks = [...html.matchAll(/<pre\b[^>]*>/g)].map((m) => m[0]);
  assert.equal(blocks.length, 5, 'posting, original resume, email, new resume and letter');
  for (const b of blocks) {
    assert.ok(attr(b, 'aria-label'), 'pre without aria-label: ' + b);
    assert.equal(attr(b, 'tabindex'), '0', 'pre must be reachable by keyboard so a long line can be scrolled: ' + b);
  }
  const firstNote = html.indexOf('id="invented-notice"');
  assert.ok(firstNote > 0 && firstNote < html.indexOf('<h2>'), 'the invented notice must come before the first section');
  assert.match(html, /<a href="index\.html" aria-current="page">Sample pack<\/a>/);
});
