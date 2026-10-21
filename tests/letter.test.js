'use strict';
// Run with: node --test tests/
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const L = require(path.join(ROOT, 'cover-letter-check', 'checker.js'));

// Synthetic documents. The people, companies and numbers are invented.
const posting = fs.readFileSync(path.join(__dirname, 'fixtures', 'posting-marketing.txt'), 'utf8');

const goodLetter = [
  'Dear Ms. Alvarez,',
  '',
  'I am applying for the Marketing Analyst Intern role at Trailhead Supply that I found on your careers page. I have spent two semesters tracking which posts get replies for a student club, and your posting’s focus on email marketing and A/B testing is the part of marketing I most want to do more of.',
  '',
  'As social media chair of a campus marketing club, I managed posts across three accounts. Each Friday I went through which posts had gotten the most replies and changed the next week’s plan to match. That is a small version of the weekly reporting your posting describes, and it taught me that a simple spreadsheet, checked every week, answers more questions than a complicated one checked once.',
  '',
  'I have not used Tableau yet. I have used Excel for weekly sales tracking at my part-time retail job, and I am taking a data visualization course this term. I would be glad to show you the tracker I built.',
  '',
  'Thank you for reading. I am free to talk any afternoon next week.',
  '',
  'Sincerely,',
  'Jordan Example'
].join('\n');

const genericLetter = [
  'To Whom It May Concern,',
  '',
  'I am writing to express my interest in the open position. I am a hard-working, motivated team player who is passionate about [Company Name]. I am excited to bring my skills to a dynamic team.',
  '',
  'I am organized. I am reliable. I am detail oriented. I was given many responsibilities in my last job. Projects were completed on time. Reports were written every week. Deadlines were met. Customers were helped daily.',
  '',
  'I think I would be a great fit. I look forward to hearing from you.',
  '',
  'Sincerely,',
  'A. Applicant'
].join('\n');

const base = { posting, employer: 'Trailhead Supply', role: 'Marketing Analyst Intern' };
const byId = (r, id) => r.checks.find((c) => c.id === id);

test('a specific letter passes the employer, role, opening and template checks', () => {
  const r = L.analyze({ ...base, letter: goodLetter });
  assert.equal(byId(r, 'employer').status, 'ok');
  assert.equal(byId(r, 'role').status, 'ok');
  assert.equal(byId(r, 'opening').status, 'ok');
  assert.equal(byId(r, 'template').status, 'ok');
  assert.equal(byId(r, 'overlap').status, 'ok');
  assert.equal(r.opening.flags.length, 0);
  console.log('    good letter:', JSON.stringify(r.summary), r.stats.words + ' words');
});

test('greeting and sign-off are excluded from the body and the length', () => {
  const r = L.analyze({ ...base, letter: goodLetter });
  assert.equal(r.stats.paragraphs, 4);
  assert.ok(!r.opening.text.startsWith('Dear'));
  assert.ok(r.opening.text.startsWith('I am applying for the Marketing Analyst Intern role'));
});

test('length: short, ok and long are told apart', () => {
  const short = 'I am applying for the Marketing Analyst Intern role at Trailhead Supply. ' + 'I run a club newsletter every week. '.repeat(6);
  assert.equal(byId(L.analyze({ ...base, letter: 'Dear Team,\n\n' + short + '\n\nThanks,\nA' }), 'length').status, 'note');
  assert.equal(byId(L.analyze({ ...base, letter: goodLetter }), 'length').status, 'ok');
  const para = 'At Trailhead Supply the Marketing Analyst Intern role fits the weekly reporting I did for a club. '.repeat(30);
  const long = 'Dear Team,\n\n' + para.slice(0, para.length / 2) + '\n\n' + para.slice(para.length / 2) + '\n\nThanks,\nA';
  assert.equal(byId(L.analyze({ ...base, letter: long }), 'length').status, 'warn');
});

test('employer and role: missing, partial and exact are distinguished; matching ignores case', () => {
  const noNames = goodLetter.replace(/Trailhead Supply/g, 'your company').replace(/Marketing Analyst Intern/g, 'internship');
  const r = L.analyze({ ...base, letter: noNames });
  assert.equal(byId(r, 'employer').status, 'warn');
  assert.equal(byId(r, 'role').status, 'warn');
  const partial = goodLetter.replace('Marketing Analyst Intern', 'analyst');
  assert.equal(byId(L.analyze({ ...base, letter: partial }), 'role').status, 'warn');
  assert.match(byId(L.analyze({ ...base, letter: partial }), 'role').detail, /Marketing, Analyst/);
  const reordered = goodLetter.replace('Marketing Analyst Intern role', 'intern role for a marketing analyst');
  assert.equal(byId(L.analyze({ ...base, letter: reordered }), 'role').status, 'note');
  const lower = L.analyze({ ...base, letter: goodLetter, employer: 'trailhead supply' });
  assert.equal(byId(lower, 'employer').status, 'ok');
  // "Trailhead Supplies" must not count as "Trailhead Supply"
  const near = goodLetter.replace(/Trailhead Supply/g, 'Trailhead Supplyco');
  assert.equal(byId(L.analyze({ ...base, letter: near }), 'employer').status, 'warn');
});

test('role names with regex characters do not break matching', () => {
  const r = L.analyze({ ...base, letter: goodLetter.replace('Marketing Analyst Intern', 'Analyst (Marketing) + Intern'), role: 'Analyst (Marketing) + Intern' });
  assert.equal(byId(r, 'role').status, 'ok');
});

test('a generic opening is flagged by each rule it breaks', () => {
  const r = L.analyze({ ...base, letter: genericLetter });
  const flags = r.opening.flags.join(' ');
  assert.match(flags, /I am writing to/);
  assert.match(flags, /neither the employer nor the role/);
  assert.equal(byId(r, 'opening').status, 'warn');
  const first = L.analyze({ ...base, letter: 'Dear Team,\n\nTo whom it may concern, I am applying to Trailhead Supply for the Marketing Analyst Intern role. ' + 'I ran a club newsletter. '.repeat(10) });
  assert.deepEqual(first.opening.flags.length, 1);
  assert.equal(byId(first, 'opening').status, 'note');
});

test('a very long first sentence is flagged', () => {
  const longFirst = 'I am applying to Trailhead Supply ' + 'and also '.repeat(25) + 'because of the work.';
  const r = L.analyze({ ...base, letter: 'Dear Team,\n\n' + longFirst + ' ' + 'I ran a club newsletter. '.repeat(10) });
  assert.match(r.opening.flags.join(' '), /over 40 words/);
});

test('template leftovers are caught', () => {
  const r = L.analyze({ ...base, letter: genericLetter });
  assert.equal(byId(r, 'template').status, 'warn');
  assert.match(byId(r, 'template').detail, /\[Company Name\]/);
});

test('overlap lists posting terms and which the letter uses', () => {
  const r = L.analyze({ ...base, letter: goodLetter });
  assert.ok(r.overlap.terms.length > 5 && r.overlap.terms.length <= L.LIMITS.maxPostingTerms);
  const used = r.overlap.used.map((t) => t.term);
  assert.ok(used.includes('excel') || used.includes('marketing'), used.join(','));
  const unrelated = 'Dear Team,\n\n' + 'I enjoy gardening and cooking dinner for my friends on weekends and I bake bread. '.repeat(6) + '\n\nThanks,\nA';
  assert.equal(byId(L.analyze({ ...base, letter: unrelated }), 'overlap').status, 'note');
  // every listed term is a real word from the posting
  r.overlap.terms.forEach((t) => assert.ok(posting.toLowerCase().includes(t.term.toLowerCase().slice(0, 4)), t.term));
});

test('repeated words and repeated sentence openers are reported with counts', () => {
  const r = L.analyze({ ...base, letter: genericLetter });
  assert.deepEqual(L.analyze({ ...base, letter: goodLetter }).repeatedWords.map((w) => w.word), ['posts', 'marketing']);
  const repeated = 'Dear Team,\n\nI applied. I wrote reports. I built dashboards. I sent emails. Dashboards matter to me because dashboards show trends, and dashboards drive dashboards.\n\nThanks,\nA';
  const r2 = L.analyze({ ...base, letter: repeated + '\n\n' + 'I like data. '.repeat(10) });
  assert.ok(r2.repeatedWords.some((w) => w.word === 'dashboards' && w.count >= 4), JSON.stringify(r2.repeatedWords));
  assert.ok(r2.repeatedOpeners.some((o) => o.word === 'i' && o.count >= 3));
  assert.equal(byId(r2, 'openers').status, 'note');
  assert.equal(r.repeatedOpeners.find((o) => o.word === 'i').count >= 3, true);
});

test('passive voice: matches be plus participle, skips adjectives, reports share', () => {
  assert.deepEqual(L.findPassives('The report was written by me.'), ['was written']);
  assert.deepEqual(L.findPassives('Deadlines were consistently met.'), ['were consistently met']);
  assert.equal(L.findPassives('Deadlines were consistently completed.').length, 1);
  assert.deepEqual(L.findPassives('I am excited and interested.'), []);
  assert.deepEqual(L.findPassives('I ran the report and wrote the summary.'), []);
  assert.deepEqual(L.findPassives('Each report is being reviewed.'), ['being reviewed']);
  const r = L.analyze({ ...base, letter: genericLetter });
  assert.equal(byId(r, 'passive').status, 'note');
  assert.ok(r.passive.length >= 4);
  assert.equal(byId(L.analyze({ ...base, letter: goodLetter }), 'passive').status, 'ok');
});

test('sentence splitter respects abbreviations and lowercase continuations', () => {
  assert.deepEqual(L.splitSentences('Dr. Lee wrote it. I read it! Did you? Yes.'), ['Dr. Lee wrote it.', 'I read it!', 'Did you?', 'Yes.']);
  assert.deepEqual(L.splitSentences('I use e.g. Excel and SQL. Then I report.'), ['I use e.g. Excel and SQL.', 'Then I report.']);
  assert.deepEqual(L.splitSentences('one\ntwo. Three'), ['one two.', 'Three']);
});

test('every check explains itself and is labelled a heuristic', () => {
  const r = L.analyze({ ...base, letter: goodLetter });
  assert.equal(r.checks.length, 9);
  r.checks.forEach((c) => {
    assert.equal(c.heuristic, true, c.id);
    assert.ok(c.explain && c.explain.length > 60, c.id + ' needs an explanation');
    assert.match(c.status, /^(ok|note|warn)$/);
    assert.ok(c.detail.length > 10, c.id);
  });
  assert.equal(new Set(r.checks.map((c) => c.id)).size, 9);
  assert.equal(r.summary.ok + r.summary.note + r.summary.warn, 9);
});

test('analysis is deterministic', () => {
  const a = JSON.stringify(L.analyze({ ...base, letter: goodLetter }));
  const b = JSON.stringify(L.analyze({ ...base, letter: goodLetter }));
  assert.equal(a, b);
});

test('bad input fails loudly with a fix in the message', () => {
  const run = (o) => () => L.analyze({ ...base, letter: goodLetter, ...o });
  assert.throws(run({ letter: '' }), (e) => e instanceof L.InputError && /cover letter box is empty/.test(e.message));
  assert.throws(run({ letter: 'Too short to check.' }), /under 40 words/);
  assert.throws(run({ posting: '   ' }), /job posting box is empty/);
  assert.throws(run({ posting: 'Short posting text.' }), /job posting is under 40 words/);
  assert.throws(run({ employer: '' }), /Enter the employer name/);
  assert.throws(run({ role: undefined }), /Enter the role title/);
  assert.throws(run({ employer: 'x'.repeat(200) }), /too long/);
  assert.throws(run({ letter: 'word '.repeat(L.LIMITS.maxChars) }), /longer than/);
  assert.throws(() => L.analyze(), /box is empty/);
  assert.throws(() => L.analyze({ ...base, letter: 42 }), /box is empty/);
});

test('the module touches no network, storage or DOM', () => {
  const src = fs.readFileSync(path.join(ROOT, 'cover-letter-check', 'checker.js'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  assert.ok(!/\b(fetch|XMLHttpRequest|localStorage|sessionStorage|document|window|navigator|cookie)\b/.test(src));
});
