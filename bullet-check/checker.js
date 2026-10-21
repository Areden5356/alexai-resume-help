/* Resume bullet checks.
 *
 * Pure functions, no network, no storage, no DOM. Runs in the browser (as
 * window.BulletChecker) and under node (module.exports) so the same code is tested.
 *
 * Every rule below is a HEURISTIC: a fixed, deterministic pattern or count with a
 * threshold chosen for ordinary resume bullets by students and new graduates. None of
 * them measures how an employer will read a bullet, none is a recognized standard, and
 * none can tell whether a bullet is true. Each result carries an `explain` string saying
 * what the rule looks at and where it can be wrong, so the page can show it.
 *
 * Rules per bullet: strong opening verb, number or concrete outcome, length, vague words,
 * and tense consistency (compared across the bullets pasted together).
 *
 * The only outside source for any rule is the Purdue OWL resume sections page, which
 * advises specific action verbs, past tense for finished jobs and present tense for a
 * current one, and one grammatical structure across bullets. Cutoffs and word lists
 * below are this site's own judgment.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.BulletChecker = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var LIMITS = {
    maxChars: 20000,
    maxBullets: 60,
    maxBulletChars: 600,
    okMinWords: 8,
    okMaxWords: 30,
    noteMinWords: 5,
    noteMaxWords: 40
  };

  function InputError(message) {
    this.name = 'BulletInputError';
    this.message = message;
    if (Error.captureStackTrace) Error.captureStackTrace(this, InputError);
  }
  InputError.prototype = Object.create(Error.prototype);
  InputError.prototype.constructor = InputError;

  function set(str) {
    var s = Object.create(null);
    str.split(/\s+/).forEach(function (w) { if (w) s[w] = true; });
    return s;
  }

  // Action verbs, base form. "base:past" gives an irregular or doubled-consonant past form.
  var VERB_SPEC = (
    'achieve act adapt address administer advise analyze answer apply approve arrange assemble assess assist audit author ' +
    'automate award balance begin:began brief budget build:built calculate catalog chair:chaired check clean clarify coach collaborate ' +
    'collect communicate compare compile complete compose conduct configure construct consult contact coordinate create ' +
    'cut:cut debug decide decrease define deliver demonstrate design detect develop devise diagnose direct document draft ' +
    'drive:drove edit educate enforce engineer enhance enter establish estimate evaluate examine execute expand expedite explain ' +
    'extract facilitate file:filed find:found fix forecast form:formed found:founded gather generate grow:grew guide handle ' +
    'identify illustrate implement improve increase initiate inspect install instruct interview introduce investigate ' +
    'launch lead:led learn:learned lift maintain manage map:mapped measure mediate mentor model monitor motivate negotiate ' +
    'observe obtain operate optimize organize outline oversee participate perform plan:planned post present prepare prioritize ' +
    'process produce program promote propose prototype provide publish purchase raise rank:ranked rebuild recommend reconcile ' +
    'record recruit redesign reduce refine register rehearse remodel repair replace report represent research resolve respond ' +
    'restructure retrieve review revise run:ran sample schedule screen:screened select sell:sold serve set:set ship:shipped simplify ' +
    'sort:sorted spearhead speak:spoke staff standardize streamline strengthen submit summarize supervise support survey ' +
    'sustain teach:taught test tighten track train transcribe translate troubleshoot tutor update upgrade validate verify visit ' +
    'volunteer win:won write:wrote'
  ).split(/\s+/).filter(Boolean);

  var PAST = Object.create(null);   // past form -> true
  var BASE = Object.create(null);   // base form -> true
  VERB_SPEC.forEach(function (tok) {
    var parts = tok.split(':');
    var base = parts[0];
    var past = parts[1];
    if (!past) {
      if (/e$/.test(base)) past = base + 'd';
      else if (/[^aeiou]y$/.test(base)) past = base.slice(0, -1) + 'ied';
      else past = base + 'ed';
    }
    BASE[base] = true;
    PAST[past] = true;
  });
  // cut, set, put style verbs are the same in both forms; tense cannot be read from the word.
  var AMBIGUOUS_TENSE = set('cut set put read');

  // Starts that describe a duty instead of an action. A match is a flag on the phrase.
  var WEAK_STARTS = [
    { re: /^(?:i\s+(?:was|am)\s+)?(?:was\s+|were\s+|am\s+)?responsible\s+for\b/i, label: '"responsible for"' },
    { re: /^(?:in\s+charge\s+of|tasked\s+with|charged\s+with)\b/i, label: '"in charge of / tasked with"' },
    { re: /^(?:duties|responsibilities)\s+(?:included?|were|are)\b/i, label: '"duties included"' },
    { re: /^(?:worked|working)\s+(?:on|with|in)\b/i, label: '"worked on / with"' },
    { re: /^(?:helped|helping|assisted|assisting)\s+(?:with|in|on)\b/i, label: '"helped with / assisted with"' },
    { re: /^(?:involved|involvement)\s+in\b/i, label: '"involved in"' },
    { re: /^(?:participated|participating)\s+in\b/i, label: '"participated in"' },
    { re: /^(?:part\s+of|member\s+of\s+a\s+team)\b/i, label: '"part of a team"' },
    { re: /^(?:i|my|me)\b/i, label: 'a first-person start ("I", "my")' }
  ];

  // Phrases that say little. Each is matched as whole words. This list is a judgment call.
  var VAGUE_PHRASES = [
    'various', 'several', 'numerous', 'many', 'a lot of', 'lots of', 'stuff', 'things', 'etc', 'and more', 'duties', 'responsibilities',
    'tasks', 'daily tasks', 'misc', 'miscellaneous', 'general', 'generally', 'basic', 'some', 'a variety of', 'a number of',
    'team player', 'hard-working', 'hard working', 'detail-oriented', 'detail oriented', 'results-driven', 'results driven',
    'self-starter', 'dynamic', 'passionate', 'excellent', 'strong', 'good', 'great', 'familiar with', 'exposure to',
    'worked on', 'worked with', 'helped with', 'assisted with', 'involved in', 'responsible for', 'in charge of'
  ];

  var NUMBER_WORDS = set(
    'one two three four five six seven eight nine ten eleven twelve fifteen twenty thirty forty fifty hundred hundreds thousand ' +
    'thousands million dozen dozens double doubled triple tripled half'
  );

  // Verbs that name a result. Used only when no number is present.
  var OUTCOME_WORDS = set(
    'increased decreased reduced cut saved raised grew improved won earned launched delivered published completed shipped ' +
    'built created reorganized streamlined simplified automated resolved recovered exceeded boosted doubled tripled lowered ' +
    'expanded founded established introduced redesigned organized'
  );

  var BULLET_MARK = /^\s*(?:[-*\u2022\u25AA\u25CF\u2013\u2014+>]|\d{1,2}[.)])\s*/;

  // ------------------------------------------------------------------ text helpers

  function clean(text) {
    return String(text).replace(/\r\n?/g, '\n').replace(/[\u2018\u2019]/g, "'").replace(/[\u201C\u201D]/g, '"');
  }

  function words(text) {
    return (text.match(/[A-Za-z0-9$%](?:[A-Za-z0-9'+#.\/,$%-]*[A-Za-z0-9+#%])?/g) || []);
  }

  function norm(s) { return s.toLowerCase().replace(/^[^a-z0-9$]+|[^a-z0-9%]+$/g, ''); }

  function plural(n, one, many) { return n + ' ' + (n === 1 ? one : many); }

  function phraseFound(text, phrase) {
    var esc = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
    return new RegExp('(^|[^A-Za-z0-9])' + esc + '(?![A-Za-z0-9])', 'i').test(text);
  }

  function check(id, label, status, detail, explain) {
    return { id: id, label: label, status: status, detail: detail, explain: explain, heuristic: true };
  }

  // ----------------------------------------------------------------------- rules

  // 'past', 'present', or null when the first word is not a recognized verb form.
  function tenseOf(firstWord) {
    var w = norm(firstWord);
    if (!w) return null;
    if (AMBIGUOUS_TENSE[w]) return null;
    if (PAST[w]) return 'past';
    if (BASE[w]) return 'present';
    if (/^[a-z]{4,}ed$/.test(w)) return 'past';
    return null;
  }

  function checkVerb(text) {
    var explain = 'Looks at the first words. A start such as "responsible for", "duties included", "worked on" or "helped with" is flagged, because ' +
      'it describes a duty rather than something you did. Otherwise the first word is looked up in a list of ' + Object.keys(BASE).length +
      ' action verbs, and any other word ending in -ed counts as a verb. A word the list does not know is not an error, only a prompt to check that the bullet opens with what you did. ' +
      'The Purdue OWL resume sections page advises specific action verbs; the list and the flagged phrases are this site\u2019s own judgment.';
    for (var i = 0; i < WEAK_STARTS.length; i++) {
      if (WEAK_STARTS[i].re.test(text)) {
        return check('verb', 'Opening verb', 'warn', 'Starts with ' + WEAK_STARTS[i].label + '. Open with the action instead, for example the verb for what you actually did.', explain);
      }
    }
    var first = words(text)[0] || '';
    var w = norm(first);
    if (PAST[w] || BASE[w]) return check('verb', 'Opening verb', 'ok', 'Opens with the action verb "' + first + '".', explain);
    if (/^[a-z]{4,}ed$/.test(w)) return check('verb', 'Opening verb', 'ok', '"' + first + '" looks like a past-tense verb.', explain);
    if (/^[a-z]{4,}ing$/.test(w)) {
      return check('verb', 'Opening verb', 'note', 'Opens with "' + first + '", an -ing form. It works, but one form across all bullets reads more cleanly, and past tense is the usual choice for finished jobs.', explain);
    }
    return check('verb', 'Opening verb', 'note', '"' + first + '" is not in the verb list. Check that the bullet opens with what you did, not with a noun or a description of yourself.', explain);
  }

  function hasMeasure(text) {
    // 4-digit years are dates, not measures, unless written like money, a percent or a larger number.
    var t = text.replace(/(^|[^$\d,.])(?:19|20)\d{2}(?![\d%,.]\d|%)/g, '$1 ');
    if (/\d/.test(t)) return true;
    var ws = words(t);
    for (var i = 0; i < ws.length; i++) if (NUMBER_WORDS[norm(ws[i])]) return true;
    return false;
  }

  function checkNumber(text) {
    var explain = 'Looks for a digit, a dollar sign, a percent sign, or a number word such as "three" or "dozen". A bare year such as 2024 is treated as a date, not a measure. ' +
      'If there is no number, it looks for a verb that names a result (such as "reduced", "launched", "published"). The rule cannot tell whether a number is true or meaningful, and ' +
      'many good bullets have no number. Add a number only if you know it. Never estimate one to fill the gap.';
    if (hasMeasure(text)) return check('number', 'Number or outcome', 'ok', 'Contains a number or measure.', explain);
    var found = words(text).filter(function (w) { return OUTCOME_WORDS[norm(w)]; })[0];
    if (found) {
      return check('number', 'Number or outcome', 'note', 'States a result ("' + found + '") but no size. If you know a real count, amount, time or percent, add it. If you do not, leave it as it is.', explain);
    }
    return check('number', 'Number or outcome', 'note', 'No number and no result word. Ask what changed because you did this, or how many, how often, or how long. If the honest answer is "nothing measurable", the bullet can stay.', explain);
  }

  function checkLength(text) {
    var n = words(text).length;
    var explain = 'Counts words. ' + LIMITS.okMinWords + ' to ' + LIMITS.okMaxWords + ' is treated as fine; ' + LIMITS.noteMinWords + ' to ' + (LIMITS.okMinWords - 1) +
      ' or ' + (LIMITS.okMaxWords + 1) + ' to ' + LIMITS.noteMaxWords + ' is a note; fewer or more is a check. These cutoffs are this site\u2019s rule of thumb for a one or two line bullet, not a standard. ' +
      'Line wrapping depends on your layout, so count lines in your own file as well.';
    var status = 'ok';
    var detail = n + ' words.';
    if (n < LIMITS.noteMinWords || n > LIMITS.noteMaxWords) {
      status = 'warn';
      detail += n < LIMITS.noteMinWords ? ' Very short. Say what you did, to what, and what came of it.' : ' Very long. Split it into two bullets or cut the least important part.';
    } else if (n < LIMITS.okMinWords) {
      status = 'note';
      detail += ' Short. Check that it says what you did and to what.';
    } else if (n > LIMITS.okMaxWords) {
      status = 'note';
      detail += ' Long. It may wrap past two lines.';
    }
    return check('length', 'Length', status, detail, explain);
  }

  function checkVague(text) {
    var hits = [];
    VAGUE_PHRASES.forEach(function (p) { if (phraseFound(text, p)) hits.push(p); });
    var explain = 'Looks for any of ' + VAGUE_PHRASES.length + ' words and phrases that say little on their own, such as "various", "several", "stuff", "team player", "responsible for" and "worked on". ' +
      'One hit is a note and two or more is a check. The list is this site\u2019s own judgment. A flagged word can be right in context, for example "good" inside a quoted award title, and a bullet can avoid every word and still say nothing.';
    var status = hits.length === 0 ? 'ok' : hits.length === 1 ? 'note' : 'warn';
    var detail = hits.length === 0
      ? 'None of the vague words on the list.'
      : 'Vague wording: ' + hits.map(function (h) { return '"' + h + '"'; }).join(', ') + '. Replace each with the specific thing, number or name.';
    return check('vague', 'Vague words', status, detail, explain);
  }

  function tenseExplain() {
    return 'Reads the first word of each bullet and sorts it as past tense ("managed"), present tense ("manage") or unknown. The most common tense among the bullets pasted together is the majority; ' +
      'a bullet in the other tense is flagged. The Purdue OWL resume sections page advises past tense for finished jobs and present tense for a current one, with the same structure across bullets. ' +
      'This rule cannot know which job a bullet belongs to, so paste the bullets of one job together. Mixed tense is correct if one bullet describes something you still do.';
  }

  function checkTense(tense, majority, total) {
    var explain = tenseExplain();
    if (total < 2) return check('tense', 'Tense consistency', 'na', 'Needs at least two bullets to compare. Paste all the bullets for one job.', explain);
    if (!tense) return check('tense', 'Tense consistency', 'na', 'The first word is not a verb form the rule recognizes, so its tense is not compared.', explain);
    if (!majority) return check('tense', 'Tense consistency', 'na', 'Too few bullets start with a recognized verb to find a majority tense.', explain);
    if (tense === majority) return check('tense', 'Tense consistency', 'ok', 'Same tense (' + tense + ') as most of the bullets.', explain);
    return check('tense', 'Tense consistency', 'note', 'This bullet is in the ' + tense + ' tense and most bullets are in the ' + majority +
      '. Fine if it describes something you still do in a current role. Otherwise change the verb.', explain);
  }

  // ----------------------------------------------------------------- input handling

  function splitBullets(text) {
    var lines = clean(text).split('\n');
    var out = [];
    lines.forEach(function (line) {
      var isMarked = BULLET_MARK.test(line);
      var body = line.replace(BULLET_MARK, '').trim();
      if (!body) return;
      // A line with no bullet mark that follows a bullet and starts in lowercase is a wrapped continuation.
      if (!isMarked && out.length && /^[a-z]/.test(body) && /^\s/.test(line)) {
        out[out.length - 1] += ' ' + body;
        return;
      }
      out.push(body);
    });
    return out;
  }

  function analyze(input) {
    input = input || {};
    var raw = input.text;
    if (typeof raw !== 'string' || !raw.trim()) {
      throw new InputError('The box is empty. Paste one bullet per line and try again.');
    }
    if (raw.length > LIMITS.maxChars) {
      throw new InputError('The text is longer than ' + LIMITS.maxChars + ' characters. Paste only the bullets for one job or one section.');
    }
    var bullets = splitBullets(raw);
    if (!bullets.length) throw new InputError('No bullets found. Put each bullet on its own line.');
    if (bullets.length > LIMITS.maxBullets) {
      throw new InputError('Found ' + bullets.length + ' bullets. Paste at most ' + LIMITS.maxBullets + ' at a time, ideally the bullets for one job.');
    }
    bullets.forEach(function (b, i) {
      if (b.length > LIMITS.maxBulletChars) {
        throw new InputError('Bullet ' + (i + 1) + ' is ' + b.length + ' characters, over the ' + LIMITS.maxBulletChars + ' limit. Check that each bullet is on its own line.');
      }
    });

    var tenses = bullets.map(function (b) { return tenseOf(words(b)[0] || ''); });
    var counts = { past: 0, present: 0 };
    tenses.forEach(function (t) { if (t) counts[t]++; });
    var majority = null;
    if (counts.past !== counts.present && counts.past + counts.present >= 2) majority = counts.past > counts.present ? 'past' : 'present';
    // a tie with two or more recognized bullets: no majority, so nothing is flagged, and the summary says so
    var mixed = counts.past > 0 && counts.present > 0;

    var summary = { ok: 0, note: 0, warn: 0, na: 0 };
    var results = bullets.map(function (b, i) {
      var checks = [checkVerb(b), checkNumber(b), checkLength(b), checkVague(b), checkTense(tenses[i], majority, bullets.length)];
      var s = { ok: 0, note: 0, warn: 0, na: 0 };
      checks.forEach(function (c) { s[c.status]++; summary[c.status]++; });
      var applicable = checks.length - s.na;
      return { text: b, words: words(b).length, checks: checks, passed: s.ok, applicable: applicable, counts: s };
    });

    return {
      bullets: results,
      summary: summary,
      tense: { past: counts.past, present: counts.present, majority: majority, mixed: mixed },
      stats: { bullets: bullets.length }
    };
  }

  return {
    analyze: analyze,
    splitBullets: splitBullets,
    tenseOf: tenseOf,
    hasMeasure: hasMeasure,
    InputError: InputError,
    LIMITS: LIMITS,
    VAGUE_PHRASES: VAGUE_PHRASES
  };
});
