'use strict';
// Site integrity checks. Run with: node --test tests/
// Static, regex-based checks over the files in this folder. No network.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const STRIPE = 'https://buy.stripe.com/5kQbJ16Ji658d806uQg3601';
const REFUND = 'If I cannot deliver a usable pack, you get a full refund.';
const PLACEHOLDER = '%%BASE_URL%%';
const ALLOWED_EXTERNAL = [STRIPE, 'https://stripe.com/privacy', 'https://owl.purdue.edu/'];

function walk(dir, out = []) {
  for (const name of fs.readdirSync(dir)) {
    if (['.git', 'tests', 'node_modules'].includes(name)) continue;
    const p = path.join(dir, name);
    if (fs.statSync(p).isDirectory()) walk(p, out); else out.push(p);
  }
  return out;
}
const rel = (p) => path.relative(ROOT, p).split(path.sep).join('/');
const files = walk(ROOT);
const htmlFiles = files.filter((f) => f.endsWith('.html'));
const textFiles = files.filter((f) => /\.(html|css|js|xml|txt|py)$/.test(f));
const read = (f) => fs.readFileSync(f, 'utf8');

const decode = (s) => s.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
const squash = (s) => decode(s).replace(/\s+/g, ' ').trim();
function visibleText(html) {
  return squash(html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' '));
}

const pages = htmlFiles.map((f) => ({ file: f, name: rel(f), html: read(f) }));
const indexable = pages.filter((p) => p.name !== '404.html');

test('the expected pages exist', () => {
  const names = pages.map((p) => p.name).sort();
  assert.deepEqual(names, [
    '404.html', 'ats-check/index.html', 'guides/achievement-bullets-from-duties.html', 'guides/common-resume-mistakes.html',
    'guides/cover-letter-structure.html', 'guides/index.html', 'guides/resume-formatting-that-parses-cleanly.html',
    'guides/tailor-resume-to-job-posting.html', 'index.html', 'privacy.html', 'terms.html'
  ]);
});

test('every page has lang, viewport, a unique title and a unique description', () => {
  const titles = new Set();
  const descs = new Set();
  for (const p of pages) {
    assert.match(p.html, /<html lang="en">/, p.name);
    assert.match(p.html, /<meta name="viewport" content="width=device-width, initial-scale=1">/, p.name);
    const title = (p.html.match(/<title>([^<]+)<\/title>/) || [])[1];
    assert.ok(title && title.length <= 65, p.name + ' title length ' + (title && title.length));
    assert.ok(!titles.has(title), 'duplicate title ' + title);
    titles.add(title);
    const desc = (p.html.match(/<meta name="description" content="([^"]+)"/) || [])[1];
    assert.ok(desc && desc.length >= 70 && desc.length <= 165, p.name + ' description length ' + (desc && desc.length));
    assert.ok(!descs.has(desc), 'duplicate description ' + p.name);
    descs.add(desc);
  }
  console.log('    pages checked:', pages.length);
});

test('canonical tags use the placeholder and the right path; Open Graph is present', () => {
  const expected = (name) => name === 'index.html' ? '/' : name.endsWith('/index.html') ? '/' + name.replace('index.html', '') : '/' + name;
  for (const p of pages) {
    const c = (p.html.match(/<link rel="canonical" href="([^"]+)">/) || [])[1];
    assert.equal(c, PLACEHOLDER + expected(p.name), p.name);
    if (p.name !== '404.html') {
      assert.match(p.html, /<meta property="og:title" content="[^"]+">/, p.name);
      assert.match(p.html, /<meta property="og:description" content="[^"]+">/, p.name);
      assert.match(p.html, /<meta property="og:type" content="[^"]+">/, p.name);
    }
  }
});

test('one h1 per page and heading levels never skip downward', () => {
  for (const p of pages) {
    const body = p.html.replace(/<script[\s\S]*?<\/script>/g, '');
    const levels = [...body.matchAll(/<h([1-6])[\s>]/g)].map((m) => Number(m[1]));
    assert.equal(levels.filter((l) => l === 1).length, 1, p.name + ' h1 count');
    levels.reduce((prev, cur) => {
      assert.ok(cur <= prev + 1, p.name + ' heading jumps from h' + prev + ' to h' + cur);
      return cur;
    }, 1);
  }
});

test('images, if any, have alt text', () => {
  for (const p of pages) {
    for (const m of p.html.matchAll(/<img\b[^>]*>/g)) assert.match(m[0], /\balt="/, p.name + ' ' + m[0]);
  }
});

test('internal links and assets resolve, relative, with valid anchors', () => {
  let checked = 0;
  for (const p of pages) {
    const body = p.html.replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>/g, '');
    for (const m of body.matchAll(/\b(?:href|src)="([^"]*)"/g)) {
      const url = m[1];
      if (/^(https?:|mailto:|tel:)/.test(url)) continue;
      assert.ok(url && !url.startsWith('/'), p.name + ' uses a root-relative or empty URL: "' + url + '"');
      if (url.includes('%%')) continue; // canonical placeholder
      const [target, hash] = url.split('#');
      const targetFile = target ? path.resolve(path.dirname(p.file), target) : p.file;
      assert.ok(fs.existsSync(targetFile) && fs.statSync(targetFile).isFile(), p.name + ' links to missing file ' + url);
      if (hash) {
        const targetHtml = targetFile.endsWith('.html') ? read(targetFile) : '';
        assert.match(targetHtml, new RegExp('id="' + hash + '"'), p.name + ' links to missing anchor #' + hash + ' in ' + rel(targetFile));
      }
      checked++;
    }
  }
  console.log('    internal links checked:', checked);
  assert.ok(checked > 100);
});

test('the Stripe link is present exactly, and no other Stripe URL exists', () => {
  const home = read(path.join(ROOT, 'index.html'));
  const count = home.split(STRIPE).length - 1;
  assert.ok(count >= 3, 'expected at least 3 pay links on the landing page, found ' + count);
  for (const f of textFiles) {
    for (const m of read(f).matchAll(/https?:\/\/buy\.stripe\.com\/[^\s"'<)]*/g)) {
      assert.equal(m[0], STRIPE, rel(f));
    }
  }
  assert.match(home, /<a class="btn" href="https:\/\/buy\.stripe\.com\/5kQbJ16Ji658d806uQg3601">Pay \$39 with Stripe<\/a>/);
  console.log('    Stripe link occurrences on index.html:', count);
});

test('the only external hosts are Stripe and Purdue, all as plain links; nothing external is loaded', () => {
  for (const f of textFiles.filter((x) => !x.endsWith('.py'))) {
    const text = read(f);
    for (const m of text.matchAll(/https?:\/\/[^\s"'<>)]+/g)) {
      const url = m[0];
      if (url.startsWith('http://www.sitemaps.org/') || url.startsWith('https://schema.org')) continue;
      assert.ok(ALLOWED_EXTERNAL.some((a) => url.startsWith(a)), rel(f) + ' references ' + url);
    }
  }
  for (const p of pages) {
    assert.ok(!/<script[^>]+src="https?:/i.test(p.html), p.name);
    assert.ok(!/<link[^>]+href="https?:/i.test(p.html.replace(/rel="canonical"[^>]*/g, '')), p.name);
    assert.ok(!/<(iframe|img|video|audio|embed|object)\b/i.test(p.html), p.name + ' embeds media');
  }
  assert.ok(!/@import|url\(\s*["']?https?:/.test(read(path.join(ROOT, 'assets', 'style.css'))));
});

test('the base URL placeholder appears only in canonical tags, sitemap.xml and robots.txt', () => {
  for (const f of textFiles.filter((x) => !x.endsWith('.py'))) {
    let text = read(f);
    if (f.endsWith('.html')) text = text.replace(/<link rel="canonical" href="[^"]*">/g, '');
    if (['sitemap.xml', 'robots.txt'].includes(rel(f))) { assert.ok(text.includes(PLACEHOLDER), rel(f)); continue; }
    assert.ok(!text.includes(PLACEHOLDER), rel(f) + ' has a stray placeholder');
  }
});

test('sitemap lists every page except the 404 and points at files that exist', () => {
  const xml = read(path.join(ROOT, 'sitemap.xml'));
  const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].replace(PLACEHOLDER, ''));
  const toFile = (l) => (l === '/' ? 'index.html' : l.endsWith('/') ? l.slice(1) + 'index.html' : l.slice(1));
  const listed = locs.map(toFile).sort();
  listed.forEach((f) => assert.ok(fs.existsSync(path.join(ROOT, f)), 'sitemap points to missing ' + f));
  assert.deepEqual(listed, indexable.map((p) => p.name).sort());
  assert.match(read(path.join(ROOT, 'robots.txt')), /^Sitemap: %%BASE_URL%%\/sitemap\.xml$/m);
  console.log('    sitemap entries:', locs.length);
});

test('no personal data: no email in source, no home address terms, no school', () => {
  for (const f of textFiles.filter((x) => !x.endsWith('.py'))) {
    let text = read(f);
    if (f.endsWith('.html')) text = text.replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>/g, '');
    const emails = [...text.matchAll(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g)].map((m) => m[0]).filter((e) => !e.endsWith('@example.com'));
    assert.deepEqual(emails, [], rel(f) + ' contains an email address in source');
    assert.ok(!/a\.eden@/i.test(text), rel(f));
    assert.ok(!/steelcloudsolutions\.com/i.test(text), rel(f) + ' has the full domain in source');
    assert.ok(!/boulder|\bcu\b|colorado|university of/i.test(text), rel(f) + ' mentions a school or place');
    const phones = [...text.matchAll(/\(?\b\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}\b/g)].map((m) => m[0]).filter((n) => !/555/.test(n));
    assert.deepEqual(phones, [], rel(f));
  }
});

test('contact address is assembled in JavaScript and each page has a plain-text fallback', () => {
  const js = read(path.join(ROOT, 'assets', 'site.js'));
  assert.match(js, /a\.eden/);
  assert.match(js, /\+orders/);
  assert.match(js, /steelcloudsolutions/);
  for (const p of indexable) {
    assert.match(p.html, /<span data-mail[^>]*>a\.eden\+orders at steelcloudsolutions dot com<\/span>/, p.name);
    assert.ok(!/mailto:/.test(p.html), p.name + ' has a static mailto link');
  }
  // execute the script against a tiny fake DOM and check the address it builds
  const spots = [];
  const fakeSpot = { getAttribute: (n) => (n === 'data-mail-subject' ? 'Hello there' : null), replaceWith(el) { spots.push(el); } };
  const document = { querySelectorAll: () => [fakeSpot], createElement: () => ({}) };
  new Function('document', js)(document);
  assert.equal(spots[0].textContent, 'a.eden+orders@steelcloudsolutions.com');
  assert.equal(spots[0].href, 'mailto:a.eden+orders@steelcloudsolutions.com?subject=Hello%20there');
});

test('no emoji, no dashes used as punctuation, no banned filler words', () => {
  for (const f of textFiles) {
    const text = read(f);
    assert.ok(!/\p{Extended_Pictographic}/u.test(text), rel(f) + ' contains an emoji');
    assert.ok(!/[–—]/.test(text), rel(f) + ' contains an en or em dash');
  }
  const banned = /\b(leverag(?:e|es|ing)|unlock|seamless(?:ly)?|elevate|game[- ]changer|delve|robust|cutting[- ]edge|synerg\w+|supercharge|revolutionary|world[- ]class)\b|in today's|not just [^.]{1,60}\bbut\b/i;
  for (const p of pages) {
    const text = visibleText(p.html);
    assert.ok(!banned.test(text), p.name + ' contains: ' + (text.match(banned) || [])[0]);
    // code samples keep their line-leading hyphen bullets, so they are excluded here
    const prose = visibleText(p.html.replace(/<pre[\s\S]*?<\/pre>/g, ' '));
    const spaced = prose.match(/\S \- \S|\S--\S/);
    assert.ok(!spaced, p.name + ' has a dash used as punctuation near: ' + (spaced && spaced[0]));
  }
});

test('no invented proof: no testimonials, ratings, counts, awards or outcome guarantees', () => {
  const claims = [
    /\bas seen (?:in|on)\b/i, /award[- ]winning/i, /\b\d[\d,]*\+?\s+(?:happy\s+)?(?:customers|clients|students|users|resumes|orders)\b/i,
    /[★☆]/, /\b(?:five|5)[- ]stars?\b/i, /testimonial/i, /\btrusted by\b/i, /\bsatisfaction\b/i, /\b#1\b/,
    /\bbeat(?:s|ing)? (?:the )?ats\b/i, /\b\d+\s*%\s+(?:of|more|higher|faster)/i
  ];
  for (const p of pages) {
    const text = visibleText(p.html);
    claims.forEach((re) => assert.ok(!re.test(text), p.name + ' matches ' + re + ': ' + (text.match(re) || [])[0]));
    const sentences = text.split(/(?<=[.!?])\s+/);
    const negation = /\b(no|not|nobody|cannot|can't|never|nothing|neither|without)\b|n't\b/i;
    sentences.filter((s) => /guarantee/i.test(s)).forEach((s) => assert.match(s, negation, p.name + ': unqualified guarantee in "' + s + '"'));
    sentences.filter((s) => /promise/i.test(s) && /\b(interview|job|offer|hired|hiring)\b/i.test(s))
      .forEach((s) => assert.match(s, negation, p.name + ': unqualified promise in "' + s + '"'));
  }
});

test('examples are labelled as invented', () => {
  for (const p of pages) {
    const examples = (p.html.match(/class="example"/g) || []).length;
    const tags = (p.html.match(/<span class="tag">Example, invented for illustration<\/span>/g) || []).length;
    assert.equal(tags, examples, p.name);
    for (const m of p.html.matchAll(/<pre class="sample[ "]/g)) {
      const before = p.html.slice(0, m.index);
      assert.ok(before.lastIndexOf('class="example"') > before.lastIndexOf('</div>') , p.name + ': code sample outside a labelled example');
    }
  }
  assert.match(read(path.join(ROOT, 'index.html')), /Example, invented for illustration/);
});

test('refund line, AI disclosure and keyword-check privacy statement are present', () => {
  for (const name of ['index.html', 'terms.html']) assert.ok(visibleText(read(path.join(ROOT, name))).includes(REFUND), name);
  for (const p of indexable) assert.match(visibleText(p.html), /written with AI and reviewed by a person/, p.name);
  assert.match(visibleText(read(path.join(ROOT, 'index.html'))), /Drafts are made with AI, and I read and edit every one/);
  assert.match(visibleText(read(path.join(ROOT, 'ats-check', 'index.html'))), /Nothing is uploaded or stored/);
  assert.match(visibleText(read(path.join(ROOT, 'privacy.html'))), /not legal advice/);
  assert.match(visibleText(read(path.join(ROOT, 'terms.html'))), /not legal advice/);
  assert.match(visibleText(read(path.join(ROOT, 'privacy.html'))), /30 days after I deliver it/);
});

test('no cookies, storage, tracking or network calls in any script', () => {
  const banned = /\b(fetch\s*\(|XMLHttpRequest|sendBeacon|WebSocket|localStorage|sessionStorage|indexedDB|document\.cookie|EventSource|navigator\.geolocation|importScripts|gtag|dataLayer|analytics\.js|_paq|fbq)\b/;
  const scripts = files.filter((f) => f.endsWith('.js'));
  scripts.forEach((f) => assert.ok(!banned.test(read(f).replace(/\/\*[\s\S]*?\*\//g, '')), rel(f)));
  for (const p of pages) {
    for (const m of p.html.matchAll(/<script(?![^>]*ld\+json)[^>]*>([\s\S]*?)<\/script>/g)) {
      assert.ok(!banned.test(m[1].replace(/\/\*[\s\S]*?\*\//g, '')), p.name + ' inline script');
    }
  }
  // the keyword check page loads only local scripts
  const tool = read(path.join(ROOT, 'ats-check', 'index.html'));
  const srcs = [...tool.matchAll(/<script src="([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(srcs, ['../assets/site.js', 'analyzer.js', 'tool.js']);
  console.log('    scripts scanned:', scripts.length);
});

test('FAQ JSON-LD matches the visible FAQ word for word; Service JSON-LD matches the offer', () => {
  const home = read(path.join(ROOT, 'index.html'));
  const blocks = [...home.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1]));
  const faq = blocks.find((b) => b['@type'] === 'FAQPage');
  const service = blocks.find((b) => b['@type'] === 'Service');
  assert.ok(faq && service);
  const details = [...home.matchAll(/<details>\s*<summary>([\s\S]*?)<\/summary>\s*<p>([\s\S]*?)<\/p>\s*<\/details>/g)]
    .map((m) => ({ q: squash(m[1]), a: squash(m[2]) }));
  assert.equal(details.length, faq.mainEntity.length);
  faq.mainEntity.forEach((e, i) => {
    assert.equal(e.name, details[i].q);
    assert.equal(e.acceptedAnswer.text, details[i].a);
  });
  assert.equal(service.offers.price, '39.00');
  assert.equal(service.offers.priceCurrency, 'USD');
  assert.equal(service.offers.url, STRIPE);
  for (const p of pages.filter((x) => x.name !== 'index.html')) assert.ok(!/ld\+json/.test(p.html), p.name + ' has structured data');
  console.log('    FAQ entries matched:', details.length);
});

test('guides: 5 pages, each 700 to 1200 words, each with a hub link and sources only from Purdue', () => {
  const guides = pages.filter((p) => /^guides\/(?!index)/.test(p.name));
  assert.equal(guides.length, 5);
  for (const g of guides) {
    const article = g.html.match(/<article[\s\S]*?<\/article>/)[0];
    const words = visibleText(article).split(' ').length;
    console.log('    ' + g.name + ': ' + words + ' words');
    assert.ok(words >= 700 && words <= 1200, g.name + ' has ' + words + ' words');
    assert.match(g.html, /href="index\.html"/);
    for (const m of g.html.matchAll(/href="(https?:[^"]+)"/g)) {
      if (m[1] !== STRIPE) assert.ok(m[1].startsWith('https://owl.purdue.edu/owl/job_search_writing/'), g.name + ' ' + m[1]);
    }
  }
});

function lum(hex) {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };

test('color tokens meet WCAG AA (4.5:1) for text pairs in light and dark', () => {
  const css = read(path.join(ROOT, 'assets', 'style.css'));
  const vars = (block) => Object.fromEntries([...block.matchAll(/--([a-z-]+):\s*(#[0-9a-fA-F]{6});/g)].map((m) => [m[1], m[2]]));
  const light = vars(css.match(/:root \{([^}]*)\}/)[1]);
  const dark = Object.assign({}, light, vars(css.match(/prefers-color-scheme: dark\)\s*\{\s*:root \{([^}]*)\}/)[1]));
  const pairs = [['ink', 'bg'], ['ink', 'surface'], ['muted', 'bg'], ['muted', 'surface'], ['link', 'bg'], ['link', 'surface'],
    ['accent', 'bg'], ['accent', 'surface'], ['on-accent', 'accent'], ['ok', 'bg'], ['ok', 'surface'], ['warn', 'bg'], ['warn', 'surface'],
    ['bad', 'bg'], ['bad', 'surface'], ['ink', 'mark']];
  const rows = [];
  for (const [name, theme] of [['light', light], ['dark', dark]]) {
    for (const [fg, bg] of pairs) {
      const r = ratio(theme[fg], theme[bg]);
      rows.push(name + ' ' + fg + ' on ' + bg + ': ' + r.toFixed(2));
      assert.ok(r >= 4.5, name + ' ' + fg + ' on ' + bg + ' is ' + r.toFixed(2));
    }
  }
  const min = Math.min(...rows.map((r) => Number(r.split(': ')[1])));
  console.log('    pairs checked: ' + rows.length + ', lowest ratio: ' + min.toFixed(2));
});

test('set_base_url.py replaces the placeholder, refuses bad input, and can swap an old URL', (t) => {
  const py = spawnSync('python', ['--version']);
  if (py.status !== 0) { t.skip('python not available'); return; }
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'alexai-site-'));
  const copy = (src, dst) => {
    fs.mkdirSync(dst, { recursive: true });
    for (const n of fs.readdirSync(src)) {
      if (['.git', 'tests', 'node_modules'].includes(n)) continue;
      const s = path.join(src, n), d = path.join(dst, n);
      fs.statSync(s).isDirectory() ? copy(s, d) : fs.copyFileSync(s, d);
    }
  };
  copy(ROOT, tmp);
  const run = (...args) => spawnSync('python', [path.join(tmp, 'set_base_url.py'), ...args], { encoding: 'utf8' });

  assert.equal(run('ftp://nope').status, 2);
  assert.equal(run('example.com').status, 2);
  const dry = run('https://u.github.io/alexai-resume-help/', '--dry-run');
  assert.equal(dry.status, 0, dry.stderr);
  assert.ok(fs.readFileSync(path.join(tmp, 'sitemap.xml'), 'utf8').includes(PLACEHOLDER), 'dry run must not write');

  const ok = run('https://u.github.io/alexai-resume-help/');
  assert.equal(ok.status, 0, ok.stderr);
  console.log('    ' + ok.stdout.trim().split('\n').pop());
  for (const f of walk(tmp)) assert.ok(!fs.readFileSync(f, 'utf8').replace(/PLACEHOLDER = "%%BASE_URL%%"/, '').includes(PLACEHOLDER) || /\.(py|md)$/.test(f), f);
  assert.match(fs.readFileSync(path.join(tmp, 'sitemap.xml'), 'utf8'), /<loc>https:\/\/u\.github\.io\/alexai-resume-help\/ats-check\/<\/loc>/);
  assert.match(fs.readFileSync(path.join(tmp, 'index.html'), 'utf8'), /<link rel="canonical" href="https:\/\/u\.github\.io\/alexai-resume-help\/">/);
  assert.match(fs.readFileSync(path.join(tmp, 'robots.txt'), 'utf8'), /Sitemap: https:\/\/u\.github\.io\/alexai-resume-help\/sitemap\.xml/);

  const again = run('https://other.example.org');
  assert.equal(again.status, 1);
  assert.match(again.stderr, /--old/);
  const swap = run('https://other.example.org', '--old', 'https://u.github.io/alexai-resume-help');
  assert.equal(swap.status, 0, swap.stderr);
  assert.match(fs.readFileSync(path.join(tmp, '404.html'), 'utf8'), /href="https:\/\/other\.example\.org\/404\.html"/);
  fs.rmSync(tmp, { recursive: true, force: true });
});
