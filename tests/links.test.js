'use strict';
// Link checker for the static site. No network: every internal reference must
// resolve to a file in this folder, every #anchor to an id in its target page,
// and every page must be reachable from the home page by following links.
// Run with: node --test tests/
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const BASE = 'https://areden5356.github.io/alexai-resume-help';

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
const pages = walk(ROOT).filter((f) => f.endsWith('.html'));
const stripLd = (html) => html.replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>/g, '');

// Resolve a reference found in `fromFile` to {file, hash}, or null for external URLs.
function resolve(fromFile, ref) {
  if (/^(https?:|mailto:|tel:)/.test(ref)) return null;
  const [target, hash] = ref.split('#');
  const file = target ? path.resolve(path.dirname(fromFile), target) : fromFile;
  return { file, hash };
}

function references(html) {
  return [...stripLd(html).matchAll(/\b(?:href|src)="([^"]*)"/g)].map((m) => m[1]);
}

test('every internal href and src resolves to a file, and every #anchor to an id', () => {
  const broken = [];
  let checked = 0;
  for (const page of pages) {
    for (const ref of references(read(page))) {
      const r = resolve(page, ref);
      if (!r) continue;
      checked++;
      if (!fs.existsSync(r.file) || !fs.statSync(r.file).isFile()) { broken.push(rel(page) + ' -> ' + ref + ' (missing file)'); continue; }
      if (r.hash && !new RegExp('\\bid="' + r.hash + '"').test(r.file.endsWith('.html') ? read(r.file) : '')) {
        broken.push(rel(page) + ' -> ' + ref + ' (missing anchor)');
      }
    }
  }
  console.log('    internal references checked:', checked);
  assert.deepEqual(broken, []);
  assert.ok(checked > 300, 'suspiciously few links: ' + checked);
});

test('404 page links resolve from the site root', () => {
  const html = read(path.join(ROOT, '404.html'));
  const roots = [...html.matchAll(/data-root="([^"]+)"/g)].map((m) => m[1]);
  assert.ok(roots.length >= 4);
  roots.forEach((r) => assert.ok(fs.existsSync(path.join(ROOT, r)), '404 links to missing ' + r));
});

test('canonical URLs and sitemap entries map to files that exist', () => {
  const toFile = (url) => {
    assert.ok(url.startsWith(BASE + '/'), url);
    const p = url.slice(BASE.length + 1);
    return path.join(ROOT, p === '' ? 'index.html' : p.endsWith('/') ? p + 'index.html' : p);
  };
  for (const page of pages) {
    const c = read(page).match(/<link rel="canonical" href="([^"]+)">/)[1];
    assert.equal(toFile(c), page, rel(page) + ' canonical points elsewhere');
  }
  for (const m of read(path.join(ROOT, 'sitemap.xml')).matchAll(/<loc>([^<]+)<\/loc>/g)) {
    assert.ok(fs.existsSync(toFile(m[1])), 'sitemap lists missing ' + m[1]);
  }
});

test('every page is reachable from the home page by following links', () => {
  const seen = new Set();
  const queue = [path.join(ROOT, 'index.html')];
  while (queue.length) {
    const page = queue.pop();
    if (seen.has(page)) continue;
    seen.add(page);
    for (const ref of references(read(page))) {
      const r = resolve(page, ref);
      if (r && r.file.endsWith('.html') && fs.existsSync(r.file)) queue.push(r.file);
    }
  }
  // 404.html is only served for missing paths, so nothing links to it
  const orphans = pages.filter((p) => !seen.has(p) && rel(p) !== '404.html').map(rel);
  assert.deepEqual(orphans, []);
});

test('the cover letter tool is linked from the home page, the guides index and the keyword check', () => {
  const target = path.join(ROOT, 'cover-letter-check', 'index.html');
  for (const from of ['index.html', 'guides/index.html', 'ats-check/index.html']) {
    const page = path.join(ROOT, from);
    const hits = references(read(page)).map((r) => resolve(page, r)).filter((r) => r && r.file === target);
    assert.ok(hits.length >= 1, from + ' does not link to the cover letter check');
  }
});

test('the guides index links every guide, and every guide links back to the index and to a free tool', () => {
  const guidesDir = path.join(ROOT, 'guides');
  const guides = fs.readdirSync(guidesDir).filter((f) => f.endsWith('.html') && f !== 'index.html');
  const indexPath = path.join(guidesDir, 'index.html');
  const linked = new Set(references(read(indexPath)).map((r) => resolve(indexPath, r)).filter(Boolean).map((r) => path.basename(r.file)));
  guides.forEach((g) => assert.ok(linked.has(g), 'guides/index.html does not link ' + g));
  for (const g of guides) {
    const p = path.join(guidesDir, g);
    const refs = references(read(p)).map((r) => resolve(p, r)).filter(Boolean).map((r) => rel(r.file));
    assert.ok(refs.includes('guides/index.html'), g + ' has no link to the guides index');
    assert.ok(refs.includes('ats-check/index.html') || refs.includes('cover-letter-check/index.html'), g + ' links to no free tool');
  }
});

test('related-guide links in each guide point at other guides, never at itself', () => {
  const dir = path.join(ROOT, 'guides');
  for (const g of fs.readdirSync(dir).filter((f) => f.endsWith('.html') && f !== 'index.html')) {
    const html = read(path.join(dir, g));
    const block = (html.match(/<ul class="related">([\s\S]*?)<\/ul>/) || [])[1] || '';
    const hrefs = [...block.matchAll(/href="([^"]+)"/g)].map((m) => m[1]);
    assert.ok(hrefs.length >= 2, g + ' has too few related links');
    assert.ok(!hrefs.includes(g), g + ' links to itself under Related guides');
  }
});

test('the bullet check is linked from the home page, the guides index, the keyword check and the cover letter check, and from the nav and footer of every page', () => {
  const target = path.join(ROOT, 'bullet-check', 'index.html');
  for (const from of ['index.html', 'guides/index.html', 'ats-check/index.html', 'cover-letter-check/index.html']) {
    const page = path.join(ROOT, from);
    const hits = references(read(page)).map((r) => resolve(page, r)).filter((r) => r && r.file === target);
    assert.ok(hits.length >= 1, from + ' does not link to the bullet check');
  }
  // every page except the 404 (which lists the tools in its own list) links to it at least twice: nav and footer
  for (const page of pages.filter((p) => rel(p) !== '404.html' && rel(p) !== 'bullet-check/index.html')) {
    const hits = references(read(page)).map((r) => resolve(page, r)).filter((r) => r && r.file === target);
    assert.ok(hits.length >= 2, rel(page) + ' links to the bullet check ' + hits.length + ' time(s)');
  }
  const four04 = read(path.join(ROOT, '404.html'));
  assert.match(four04, /data-root="bullet-check\/index\.html"/);
});

test('the guides index groups every guide exactly once under a stage heading and shows an updated date on each card', () => {
  const html = read(path.join(ROOT, 'guides', 'index.html'));
  const guides = fs.readdirSync(path.join(ROOT, 'guides')).filter((f) => f.endsWith('.html') && f !== 'index.html');
  const sections = [...html.matchAll(/<section aria-labelledby="(g-[a-z-]+)">([\s\S]*?)<\/section>/g)];
  assert.ok(sections.length >= 4, 'expected at least four stage groups, found ' + sections.length);
  const seen = [];
  for (const [, id, body] of sections) {
    assert.match(body, new RegExp('<h2 id="' + id + '">'), id + ' heading');
    const cards = [...body.matchAll(/<li>[\s\S]*?<\/li>/g)].map((m) => m[0]);
    assert.ok(cards.length >= 2, id + ' has fewer than two guides');
    for (const c of cards) {
      seen.push(c.match(/href="([^"]+)"/)[1]);
      assert.match(c, /<p class="small">Updated \d{1,2} [A-Z][a-z]+ 20\d\d<\/p>/, 'a card in ' + id + ' has no updated date');
    }
  }
  assert.deepEqual(seen.sort(), guides.sort(), 'every guide must appear exactly once in the index');
  console.log('    groups: ' + sections.length + ', guides listed: ' + seen.length);
});

test('each guide page shows the same updated date as its card in the guides index', () => {
  const idx = read(path.join(ROOT, 'guides', 'index.html'));
  for (const m of idx.matchAll(/<li>\s*<a class="title" href="([^"]+)">[\s\S]*?Updated ([^<]+)<\/p>/g)) {
    const page = read(path.join(ROOT, 'guides', m[1]));
    assert.ok(page.includes('<p class="meta">Updated ' + m[2] + '</p>'), m[1] + ' date differs from the index card (' + m[2] + ')');
  }
});

test('the sample pack is linked from the home page (twice), the guides index and the 404 page, and from the nav and footer of every page', () => {
  const target = path.join(ROOT, 'sample', 'index.html');
  const count = (from) => { const page = path.join(ROOT, from); return references(read(page)).map((r) => resolve(page, r)).filter((r) => r && r.file === target).length; };
  assert.ok(count('index.html') >= 4, 'home page needs the nav, the paid section (two links) and the footer, found ' + count('index.html'));
  assert.ok(count('guides/index.html') >= 3, 'guides index needs a body link plus nav and footer');
  for (const page of pages.filter((p) => rel(p) !== '404.html' && rel(p) !== 'sample/index.html')) {
    const hits = references(read(page)).map((r) => resolve(page, r)).filter((r) => r && r.file === target);
    assert.ok(hits.length >= 2, rel(page) + ' links to the sample pack ' + hits.length + ' time(s)');
  }
  assert.match(read(path.join(ROOT, '404.html')), /data-root="sample\/index\.html"/);
  // the sample must sit next to the paid section, not only in the chrome
  const home = read(path.join(ROOT, 'index.html'));
  const paid = home.slice(home.indexOf('id="paid"'), home.indexOf('Two smaller paid options'));
  assert.match(paid, /href="sample\/index\.html"/, 'no sample link inside the paid section');
});
