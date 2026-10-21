'use strict';
// Run with: node --test tests/
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const A = require(path.join(ROOT, 'ats-check', 'analyzer.js'));

// Fixtures are synthetic documents shaped like real postings and student resumes.
const posting = fs.readFileSync(path.join(__dirname, 'fixtures', 'posting-marketing.txt'), 'utf8');
const resume = fs.readFileSync(path.join(__dirname, 'fixtures', 'resume-student.txt'), 'utf8');

const filler = ' lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt ut labore et dolore magna aliqua'.repeat(3);

function termMap(result) {
  const m = {};
  result.terms.forEach((t) => { m[t.term.toLowerCase()] = t; });
  return m;
}

test('tokenizer keeps technical tokens whole', () => {
  const toks = (s) => A.tokenizeSegment(s).map((t) => t.norm);
  assert.deepEqual(toks('C++ and C# with Node.js'), ['c++', 'and', 'c#', 'with', 'node.js']);
  assert.deepEqual(toks('CI/CD pipelines'), ['ci/cd', 'pipelines']);
  assert.deepEqual(toks('built with .NET'), ['built', 'with', '.net']);
});

test('hyphenated words split into parts but keep their surface form', () => {
  const t = A.tokenizeSegment('cross-functional teams');
  assert.deepEqual(t.map((x) => x.norm), ['cross', 'functional', 'teams']);
  assert.equal(t[1].join, '-');
});

test('solid and spaced compounds are treated as one word', () => {
  assert.equal(A.tokenizeSegment('front-end developer')[0].norm, 'frontend');
  assert.equal(A.tokenizeSegment('frontend developer')[0].norm, 'frontend');
  assert.equal(A.tokenizeSegment('E-commerce site')[0].norm, 'ecommerce');
});

test('stem ignores plural, -ing and -ed but leaves tech tokens alone', () => {
  assert.equal(A.stem('managed'), A.stem('managing'));
  assert.equal(A.stem('managed'), A.stem('manages'));
  assert.equal(A.stem('manage'), A.stem('managed'));
  assert.equal(A.stem('analyses'), A.stem('analyses'));
  assert.equal(A.stem('planning'), A.stem('planned'));
  assert.equal(A.stem('strategies'), A.stem('strategy'));
  assert.equal(A.stem('analysis'), 'analysis');
  assert.equal(A.stem('process'), 'process');
  assert.equal(A.stem('node.js'), 'node.js');
  assert.equal(A.stem('c++'), 'c++');
  assert.equal(A.stem('aws'), 'aws');
});

test('key terms: boilerplate and stopwords never appear', () => {
  const { terms } = A.extractKeyTerms(posting);
  const names = terms.map((t) => t.term.toLowerCase());
  ['experience', 'team', 'role', 'ability', 'strong', 'the', 'and', 'years', 'benefits', 'equal'].forEach((w) => {
    assert.ok(!names.includes(w), w + ' should not be a key term');
  });
});

test('key terms: real skills from the posting are found', () => {
  const names = A.extractKeyTerms(posting).terms.map((t) => t.term.toLowerCase());
  ['tableau', 'sql', 'excel', 'python', 'google analytics', 'hubspot', 'seo', 'a/b testing', 'email marketing', 'data visualization'].forEach((w) => {
    assert.ok(names.includes(w), w + ' should be a key term; got ' + names.join(', '));
  });
});

test('key terms: repeated plain phrase is kept, single-use plain phrase is not', () => {
  const text = 'We run quarterly roadmap reviews. The roadmap reviews matter. Also we value pottery glazing once.' + filler;
  const names = A.extractKeyTerms(text).terms.map((t) => t.term.toLowerCase());
  assert.ok(names.includes('roadmap reviews'), names.join(', '));
  assert.ok(!names.includes('pottery glazing'));
});

test('key terms: a phrase that always occurs together replaces its parts', () => {
  const text = 'Own customer relationship management across accounts. Customer relationship management is central.' + filler;
  const names = A.extractKeyTerms(text).terms.map((t) => t.term.toLowerCase());
  assert.ok(names.includes('customer relationship management'), names.join(', '));
  assert.ok(!names.includes('relationship management'));
  assert.ok(!names.includes('customer relationship'));
});

test('key terms: lexicon phrase beats a longer plain phrase with the same count', () => {
  const text = 'You will use machine learning models. Test the machine learning models weekly.' + filler;
  const names = A.extractKeyTerms(text).terms.map((t) => t.term.toLowerCase());
  assert.ok(names.includes('machine learning'), names.join(', '));
  assert.ok(!names.includes('machine learning models'));
});

test('key terms: acronyms and tech tokens count once, all-caps headings do not', () => {
  const text = 'REQUIREMENTS\nKnowledge of HIPAA and C++ is expected.\nABOUT THE ROLE' + filler;
  const names = A.extractKeyTerms(text).terms.map((t) => t.term);
  assert.ok(names.includes('HIPAA'));
  assert.ok(names.includes('C++'));
  assert.ok(!names.includes('REQUIREMENTS'));
  assert.ok(!names.includes('ABOUT'));
});

test('key terms: phrases do not cross commas or line breaks', () => {
  const text = 'Python, SQL\nTableau\nPython, SQL\nTableau' + filler;
  const names = A.extractKeyTerms(text).terms.map((t) => t.term.toLowerCase());
  assert.ok(!names.includes('python sql'));
  assert.ok(!names.includes('sql tableau'));
  assert.ok(names.includes('python'));
});

test('key terms: output is capped', () => {
  const words = [];
  for (let i = 0; i < 80; i++) words.push('toolalpha' + String.fromCharCode(97 + (i % 26)) + String.fromCharCode(97 + Math.floor(i / 26)));
  const text = words.join(' ') + ' ' + words.join(' ');
  assert.ok(A.extractKeyTerms(text).terms.length <= A.LIMITS.maxTerms);
});

test('key terms: title line words are reported separately', () => {
  const { title } = A.extractKeyTerms(posting);
  assert.equal(title.text, 'Marketing Analyst Intern');
  assert.deepEqual(title.words.map((w) => w.term), ['Marketing', 'Analyst', 'Intern']);
});

test('matching: found, partial and missing are told apart', () => {
  const r = A.analyze(resume, posting);
  const m = termMap(r);
  assert.equal(m['sql'].status, 'found');
  assert.equal(m['excel'].status, 'found');
  assert.equal(m['social media'].status, 'found');
  assert.equal(m['tableau'].status, 'missing');
  assert.equal(m['python'].status, 'missing');
  assert.equal(m['email marketing'].status, 'partial');
  assert.equal(r.summary.total, r.terms.length);
  assert.equal(r.summary.found + r.summary.partial + r.summary.missing, r.summary.total);
});

test('matching: endings and case do not matter', () => {
  const p = 'You will be managing campaigns and analyzing dashboards for stakeholders. We need strong analyzing skills. Managing budgets matters too.' + filler;
  const r = A.analyze('I managed campaigns at a club and analyzed dashboards each week for the board of directors and members.' + filler, p);
  const m = termMap(r);
  const mgmt = r.terms.find((t) => /manag/i.test(t.term));
  assert.ok(mgmt, JSON.stringify(r.terms.map((t) => t.term)));
  assert.equal(mgmt.status, 'found');
  assert.ok(m['analyzing'] && m['analyzing'].status === 'found');
});

test('matching: irregular past tense matches the base word', () => {
  assert.equal(A.stem('built'), A.stem('build'));
  assert.equal(A.stem('led'), A.stem('lead'));
  assert.equal(A.stem('wrote'), A.stem('writing'));
  const p = 'Experience in tutoring and teaching is required. Teaching small groups is the main duty of this tutoring role.' + filler;
  const r = A.analyze('I taught algebra to two small groups after school and ran a tutoring table at the library each week for a term.' + filler, p);
  const t = r.terms.find((x) => /teaching/i.test(x.term));
  assert.equal(t.status, 'found');
});

test('matching: short form in the resume satisfies the long form in the posting', () => {
  const p = 'Experience with search engine optimization is required. Search engine optimization drives our traffic.' + filler;
  const r = A.analyze('Ran SEO audits for a campus club website and wrote the results up for the team.' + filler, p);
  const t = r.terms.find((x) => /search engine optimization/i.test(x.term));
  assert.equal(t.status, 'found');
  assert.equal(t.matchedAs, 'seo');
});

test('matching: a phrase split across a comma is not a match', () => {
  const p = 'Strong project management skills. Project management tools.' + filler;
  const r = A.analyze('Projects, management of a club budget, plus other things I did during the year at school.' + filler, p);
  const t = r.terms.find((x) => /project management/i.test(x.term));
  assert.notEqual(t.status, 'found');
});

test('matching: a line wrapped mid-phrase still matches', () => {
  const p = 'Needs project management skills. Project management is central.' + filler;
  const r = A.analyze('Led project\nmanagement for the spring fundraiser and wrote the schedule and the budget for it.' + filler, p);
  const t = r.terms.find((x) => /project management/i.test(x.term));
  assert.equal(t.status, 'found');
});

test('format: headings found and missing', () => {
  const f = A.checkFormat('Alex\nEDUCATION\nState U\nSKILLS\nExcel\nSome other text to pad out the resume.');
  assert.deepEqual(f.headings.found.sort(), ['education', 'skills']);
  assert.deepEqual(f.headings.missingCore, ['experience']);
  assert.equal(f.checks.find((c) => c.id === 'headings').status, 'warn');
  const all = A.checkFormat(resume);
  assert.deepEqual(all.headings.missingCore, []);
});

test('format: bullet glyphs, counts, long bullets, numbers and repeated openers', () => {
  const longBullet = '- ' + 'word '.repeat(35).trim();
  const text = ['EXPERIENCE', '• Led a team of 4 volunteers', '•Helped customers', '* Helped with returns', '- Helped stock shelves', longBullet, 'Plain line, not a bullet'].join('\n');
  const f = A.checkFormat(text);
  assert.equal(f.bullets.count, 5);
  assert.equal(f.bullets.long, 1);
  assert.equal(f.bullets.withNumbers, 1);
  assert.deepEqual(f.bullets.repeatedStarts, [{ word: 'helped', count: 3 }]);
});

test('format: no bullets gives a note about PDF paste', () => {
  const f = A.checkFormat('EXPERIENCE\nWorked at a store. Helped customers.');
  const c = f.checks.find((x) => x.id === 'bullets');
  assert.equal(c.status, 'note');
  assert.match(c.detail, /PDF/);
});

test('dates: ranges, styles and mixed-style warning', () => {
  const d = A.analyzeDates('Aug 2023 - Present\nJanuary 2022 to May 2023\n06/2021 - 08/2021\nGraduated 2019');
  assert.equal(d.ranges, 3);
  assert.equal(d.styles.monthName, 3);
  assert.equal(d.styles.numeric, 2);
  assert.equal(d.styles.yearOnly, 1);
  assert.equal(d.total, 6);
  assert.equal(d.mixedMonthStyles, true);
  assert.equal(d.hasPresent, true);
});

test('dates: a bare year inside a long sentence is not counted', () => {
  const d = A.analyzeDates('We grew the list from 2000 subscribers to far more by writing a better welcome email and sending it every week.');
  assert.equal(d.total, 0);
});

test('dates: none found is a warning', () => {
  const f = A.checkFormat('EXPERIENCE\n- Helped customers at a store');
  assert.equal(f.checks.find((c) => c.id === 'dates').status, 'warn');
});

test('contact: email and phone detected as booleans only', () => {
  const f = A.checkFormat(resume);
  assert.deepEqual(f.contact, { email: true, phone: true, linkedin: true });
  const none = A.checkFormat('EXPERIENCE\n- Worked at a store for a summer and learned to close out the register');
  assert.deepEqual(none.contact, { email: false, phone: false, linkedin: false });
  assert.ok(!JSON.stringify(f).includes('jordan.example'), 'the result must not echo contact details');
});

test('layout: wide gaps and tabs are flagged as possible columns', () => {
  const cols = ['Python      Java', 'Excel\tSQL', 'Tableau      R', 'Done'].join('\n');
  assert.equal(A.checkFormat(cols).checks.find((c) => c.id === 'layout').status, 'note');
  assert.equal(A.checkFormat(resume).checks.find((c) => c.id === 'layout').status, 'ok');
});

test('length: short and long resumes get a note', () => {
  assert.equal(A.checkFormat('too short').checks.find((c) => c.id === 'length').status, 'note');
  assert.equal(A.checkFormat('word '.repeat(900)).checks.find((c) => c.id === 'length').status, 'note');
  assert.equal(A.checkFormat('word '.repeat(450)).checks.find((c) => c.id === 'length').status, 'ok');
});

test('input errors say what to do', () => {
  assert.throws(() => A.analyze('', posting), (e) => e instanceof A.AtsInputError && /resume box is empty/.test(e.message));
  assert.throws(() => A.analyze(resume, '   '), (e) => e instanceof A.AtsInputError && /job posting box is empty/.test(e.message));
  assert.throws(() => A.analyze('five words only here ok', posting), (e) => /too short/.test(e.message));
  assert.throws(() => A.analyze(resume, 'x '.repeat(40000)), (e) => /over 60,000 characters/.test(e.message));
  assert.throws(() => A.analyze(null, posting), A.AtsInputError);
});

test('end to end on fixtures: stable summary', () => {
  const r = A.analyze(resume, posting);
  console.log('    fixture summary:', JSON.stringify(r.summary));
  assert.ok(r.summary.total >= 15 && r.summary.total <= A.LIMITS.maxTerms);
  assert.ok(r.summary.found >= 5);
  assert.ok(r.summary.missing >= 5);
  assert.equal(r.title.words.find((w) => w.term === 'Marketing').found, true);
  assert.equal(r.title.words.find((w) => w.term === 'Analyst').found, false);
});

test('inputs are not modified and results are deterministic', () => {
  const a = JSON.stringify(A.analyze(resume, posting));
  const b = JSON.stringify(A.analyze(resume, posting));
  assert.equal(a, b);
});

test('analyzer source makes no network, storage or DOM calls', () => {
  const src = fs.readFileSync(path.join(ROOT, 'ats-check', 'analyzer.js'), 'utf8');
  const banned = /\b(fetch|XMLHttpRequest|sendBeacon|WebSocket|localStorage|sessionStorage|indexedDB|document\.cookie|document\.|window\.|navigator\.|eval|require\()/;
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '');
  // the UMD wrapper legitimately names module.exports and self
  const hits = code.split('\n').filter((l) => banned.test(l));
  assert.deepEqual(hits, []);
});
