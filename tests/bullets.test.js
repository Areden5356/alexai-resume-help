'use strict';
// Run with: node --test tests/
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const B = require(path.join(__dirname, '..', 'bullet-check', 'checker.js'));

// Synthetic bullets. The people, clubs and numbers are invented.
const one = (text) => B.analyze({ text }).bullets[0];
const get = (b, id) => b.checks.find((c) => c.id === id);

test('every result carries five checks, each labelled a heuristic with an explanation', () => {
  const b = one('Managed three social accounts for a campus club');
  assert.deepEqual(b.checks.map((c) => c.id), ['verb', 'number', 'length', 'vague', 'tense']);
  b.checks.forEach((c) => {
    assert.equal(c.heuristic, true);
    assert.ok(c.explain.length > 60, c.id + ' explanation too short');
    assert.ok(c.detail.length > 5);
  });
});

test('opening verb: strong verbs pass, duty phrases are flagged', () => {
  assert.equal(get(one('Managed three social accounts for a campus club'), 'verb').status, 'ok');
  assert.equal(get(one('Led a team of four volunteers at a food drive'), 'verb').status, 'ok');
  assert.equal(get(one('Spearheaded the move to a shared calendar for the club'), 'verb').status, 'ok');
  const weak = [
    'Responsible for the club social media accounts',
    'Was responsible for opening the store each morning',
    'Duties included answering phones and filing',
    'Worked on the weekly newsletter with the editor',
    'Helped with event setup and teardown each week',
    'In charge of the cash drawer on weekend shifts',
    'I answered customer questions at the front desk',
    'Participated in club meetings every week'
  ];
  weak.forEach((t) => assert.equal(get(one(t), 'verb').status, 'warn', t));
});

test('opening verb: -ing starts and unknown words are notes, unknown -ed words pass', () => {
  assert.equal(get(one('Managing the club budget and weekly receipts'), 'verb').status, 'note');
  assert.equal(get(one('Customer service at a busy campus cafe counter'), 'verb').status, 'note');
  assert.equal(get(one('Photographed twelve events for the student paper'), 'verb').status, 'ok');
});

test('number or outcome: digits, money, percent and number words count; years alone do not', () => {
  ['Sold 40 raffle tickets in two weeks', 'Raised $1,200 for the food bank', 'Cut wait time by 15%',
    'Trained three new hires on the register', 'Wrote a guide used by a dozen volunteers', 'Wrote 2,000 words a week for the paper']
    .forEach((t) => assert.equal(get(one(t), 'number').status, 'ok', t));
  assert.equal(get(one('Wrote a guide for new volunteers since 2023'), 'number').status, 'note');
  assert.equal(B.hasMeasure('Joined the club in 2024'), false);
  assert.equal(B.hasMeasure('Earned $2024 in tips'), true);
  assert.equal(B.hasMeasure('Grew attendance 2024%'), true);
});

test('number or outcome: a result word with no number is a note that says so; neither is a note too', () => {
  const r = get(one('Reduced the time it took to restock the shelves'), 'number');
  assert.equal(r.status, 'note');
  assert.match(r.detail, /"Reduced"/);
  assert.match(r.detail, /no size/);
  const n = get(one('Answered customer questions at the front desk'), 'number');
  assert.equal(n.status, 'note');
  assert.match(n.detail, /No number and no result word/);
});

test('length thresholds: 8 to 30 words fine, 5 to 7 and 31 to 40 note, outside that check', () => {
  const w = (n) => 'Managed ' + Array(n - 1).fill('item').join(' ');
  assert.equal(get(one(w(8)), 'length').status, 'ok');
  assert.equal(get(one(w(30)), 'length').status, 'ok');
  assert.equal(get(one(w(7)), 'length').status, 'note');
  assert.equal(get(one(w(5)), 'length').status, 'note');
  assert.equal(get(one(w(31)), 'length').status, 'note');
  assert.equal(get(one(w(40)), 'length').status, 'note');
  assert.equal(get(one(w(4)), 'length').status, 'warn');
  assert.equal(get(one(w(41)), 'length').status, 'warn');
  assert.equal(one(w(12)).words, 12);
});

test('vague words: none ok, one note, two or more check; whole words only', () => {
  assert.equal(get(one('Counted cash drawers at close for the campus bookstore'), 'vague').status, 'ok');
  const a = get(one('Handled various returns at the campus bookstore'), 'vague');
  assert.equal(a.status, 'note');
  assert.match(a.detail, /"various"/);
  const b = get(one('Handled various tasks and other stuff for the manager'), 'vague');
  assert.equal(b.status, 'warn');
  // "manyfold" and "thingamajig" must not match "many" or "things"; "good" inside "goods" must not match
  assert.equal(get(one('Stocked goods and thingamajig displays for the manyfold sale'), 'vague').status, 'ok');
  assert.equal(get(one('A strong team player who is passionate about retail'), 'vague').status, 'warn');
});

test('tense: majority past flags a present-tense bullet as a note; same tense passes', () => {
  const r = B.analyze({ text: ['- Managed the club budget', '- Led weekly planning meetings', '- Organize the spring event', '- Wrote the newsletter'].join('\n') });
  assert.equal(r.tense.majority, 'past');
  assert.equal(r.tense.mixed, true);
  const st = r.bullets.map((b) => get(b, 'tense').status);
  assert.deepEqual(st, ['ok', 'ok', 'note', 'ok']);
  assert.match(get(r.bullets[2], 'tense').detail, /present tense/);
  const same = B.analyze({ text: ['Managed the club budget', 'Led weekly planning meetings'].join('\n') });
  assert.equal(same.tense.mixed, false);
  assert.deepEqual(same.bullets.map((b) => get(b, 'tense').status), ['ok', 'ok']);
});

test('tense: single bullet, unknown first word and a tie are not applicable, never invented', () => {
  assert.equal(get(one('Managed the club budget'), 'tense').status, 'na');
  const unknown = B.analyze({ text: ['Managed the club budget', 'Customer service at the front desk'].join('\n') });
  assert.equal(get(unknown.bullets[1], 'tense').status, 'na');
  const tie = B.analyze({ text: ['Managed the club budget', 'Manage the club budget'].join('\n') });
  assert.equal(tie.tense.majority, null);
  assert.deepEqual(tie.bullets.map((b) => get(b, 'tense').status), ['na', 'na']);
  assert.equal(B.tenseOf('Cut'), null, 'ambiguous forms are not guessed');
  assert.equal(B.tenseOf('Led'), 'past');
  assert.equal(B.tenseOf('Lead'), 'present');
});

test('bullet marks of several kinds are stripped, blank lines skipped, wrapped lines joined', () => {
  const text = ['\u2022 Managed a budget', '* Led a team', '- Wrote a guide', '1. Trained two hires', '2) Sold tickets', '', '   ',
    'Answered the phone', '  and took messages for six staff'].join('\n');
  const parts = B.splitBullets(text);
  assert.deepEqual(parts, ['Managed a budget', 'Led a team', 'Wrote a guide', 'Trained two hires', 'Sold tickets', 'Answered the phone and took messages for six staff']);
  assert.deepEqual(B.splitBullets('Managed a budget\r\nLed a team'), ['Managed a budget', 'Led a team']);
});

test('a realistic weak-to-strong pair scores worse before than after, and the summary adds up', () => {
  const before = B.analyze({ text: 'Responsible for various tasks in the campus bookstore' }).bullets[0];
  const after = B.analyze({ text: 'Restocked 12 shelves each shift and counted the register drawer at close' }).bullets[0];
  assert.ok(before.passed < after.passed, before.passed + ' vs ' + after.passed);
  assert.equal(get(before, 'verb').status, 'warn');
  assert.equal(get(before, 'vague').status, 'warn');
  const r = B.analyze({ text: ['Responsible for various tasks in the campus bookstore', 'Restocked 12 shelves each shift and counted the register drawer at close'].join('\n') });
  const total = r.summary.ok + r.summary.note + r.summary.warn + r.summary.na;
  assert.equal(total, 10);
  console.log('    before passed ' + before.passed + ' of ' + before.applicable + ', after passed ' + after.passed + ' of ' + after.applicable);
});

test('results are deterministic', () => {
  const text = ['Managed the club budget', 'Responsible for various things', 'Organize the spring event'].join('\n');
  assert.deepEqual(B.analyze({ text }), B.analyze({ text }));
});

test('inputs are validated with messages that say how to fix them', () => {
  assert.throws(() => B.analyze({ text: '' }), (e) => e instanceof B.InputError && /empty/.test(e.message));
  assert.throws(() => B.analyze({}), B.InputError);
  assert.throws(() => B.analyze({ text: 12 }), B.InputError);
  assert.throws(() => B.analyze({ text: '-\n*\n   ' }), (e) => /No bullets found/.test(e.message));
  assert.throws(() => B.analyze({ text: Array(61).fill('Managed a budget').join('\n') }), (e) => /at most 60/.test(e.message));
  assert.throws(() => B.analyze({ text: 'Managed ' + 'a'.repeat(700) }), (e) => /own line/.test(e.message));
  assert.throws(() => B.analyze({ text: 'x'.repeat(20001) }), (e) => /longer than/.test(e.message));
});
