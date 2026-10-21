/* Cover letter checks against a job posting.
 *
 * Pure functions, no network, no storage, no DOM. Runs in the browser (as
 * window.LetterChecker) and under node (module.exports) so the same code is tested.
 *
 * Every rule below is a HEURISTIC: a fixed, deterministic pattern or count with a
 * threshold chosen for plain letters by students and new graduates. None of them
 * measures how a hiring manager will react, and none is a recognized standard.
 * Each result carries an `explain` string saying what the rule looks at and where
 * it can be wrong, so the page can show it next to the result.
 *
 * Rules: length, employer named, role named, opening line, template leftovers,
 * overlap with posting terms, repeated words, repeated sentence openers, passive voice.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.LetterChecker = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var LIMITS = {
    maxChars: 40000,
    minLetterWords: 40,
    minPostingWords: 40,
    shortLetterWords: 150,
    longLetterWords: 400,
    longParagraphWords: 140,
    openingSentenceLongWords: 40,
    maxPostingTerms: 20,
    repeatedWordCount: 4,
    repeatedOpenerCount: 3,
    passiveNoteCount: 3,
    passiveNoteShare: 0.25
  };

  function InputError(message) {
    this.name = 'LetterInputError';
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

  var STOP = set(
    'a about above after again against all also am an and any are as at be because been before being between both but by ' +
    'can could did do does doing down during each few for from further had has have having he her here him his how i if ' +
    'in into is it its itself just me more most my myself no nor not of off on once only or other our out over own same ' +
    'she should so some such than that the their them then there these they this those through to too under until up ' +
    'very was we were what when where which while who whom why will with would you your yours'
  );

  // Common in every posting or letter; never a useful overlap term or a repeat worth flagging.
  var COMMON = set(
    'ability able apply applicant application applications benefits candidate candidates company culture day days degree ' +
    'description duties effective employer employment equal experience familiarity full good great help hire hiring ' +
    'include includes including job jobs join knowledge level looking make making need needs new opportunity part plus ' +
    'position preferred provide qualifications related relevant required requirements responsibilities role roles ' +
    'seeking strong team teams time understanding use used using various well work working year years ' +
    'like want get gets got many much one two three first next every since ' +
    'thank thanks sincerely regards dear hello'
  );

  // Words that look like past participles but act as plain adjectives in a letter.
  var NOT_PARTICIPLES = set(
    'excited interested motivated pleased thrilled honored delighted committed dedicated qualified experienced located ' +
    'based skilled determined focused concerned prepared involved organized detailed needed limited advanced united ' +
    'tired scared married related supposed used inclined impressed inspired passionate'
  );
  var IRREGULAR_PARTICIPLES = set(
    'done made given taken written known seen shown chosen built held kept led sent paid found told begun brought ' +
    'bought caught drawn driven gotten hidden lost met put sold spoken taught thought understood won'
  );
  var BE_FORMS = set('am is are was were be been being');

  // Opening lines that read the same in any letter. A match flags the phrase, not the writer.
  var GENERIC_OPENERS = [
    { re: /\bto whom it may concern\b/i, label: '"To whom it may concern"' },
    { re: /\bi am writing to (?:apply|express|submit|inquire|enquire|introduce)\b/i, label: '"I am writing to apply / express / submit"' },
    { re: /\bi am (?:excited|thrilled|pleased|delighted|eager|very interested|extremely interested) (?:to|about|in)\b/i, label: 'a stock "I am excited / pleased / eager to" opener' },
    { re: /\bi would like to (?:apply|express|submit)\b/i, label: '"I would like to apply / express"' },
    { re: /\bi am (?:interested in|applying for) (?:the )?(?:open |advertised |available )?(?:position|opening|opportunity)\b/i, label: '"I am applying for the position" with no role named' },
    { re: /\bmy name is\b/i, label: '"My name is"' },
    { re: /\balways (?:admired|dreamed|wanted to work)\b|\balways been passionate\b/i, label: 'an "always admired / always dreamed" opener' },
    { re: /\bhard[- ]?working,? (?:and )?(?:motivated|dedicated|detail)/i, label: 'a "hard-working, motivated" self-description' },
    { re: /\bpassionate about\b/i, label: '"passionate about"' },
    { re: /\bperfect (?:fit|candidate)\b|\bideal candidate\b/i, label: '"perfect fit" or "ideal candidate"' },
    { re: /\bin today'?s\b/i, label: '"in today\'s ..." scene-setting' }
  ];

  var ABBREVIATIONS = /\b(?:Mr|Mrs|Ms|Dr|Prof|St|Sr|Jr|vs|etc|e\.g|i\.e|U\.S|Inc|Ltd|Co|No)\.$/;

  // ------------------------------------------------------------------ text helpers

  function words(text) {
    return (text.match(/[A-Za-z0-9](?:[A-Za-z0-9'+#.\/-]*[A-Za-z0-9+#])?/g) || []);
  }

  function norm(s) { return s.toLowerCase(); }

  function stem(w) {
    w = norm(w).replace(/'s$/, '');
    if (w.length > 5 && /ing$/.test(w)) return w.slice(0, -3);
    if (w.length > 4 && /ies$/.test(w)) return w.slice(0, -3) + 'y';
    if (w.length > 4 && /ed$/.test(w)) return w.slice(0, -2);
    if (w.length > 4 && /es$/.test(w)) return w.slice(0, -2);
    if (w.length > 3 && /s$/.test(w) && !/ss$/.test(w)) return w.slice(0, -1);
    return w;
  }

  function clean(text) {
    return text.replace(/\r\n?/g, '\n').replace(/[‘’]/g, "'").replace(/[“”]/g, '"');
  }

  function paragraphs(text) {
    return text.split(/\n\s*\n/).map(function (p) { return p.replace(/\s*\n\s*/g, ' ').trim(); }).filter(Boolean);
  }

  function splitSentences(text) {
    var flat = text.replace(/\s*\n\s*/g, ' ').trim();
    var out = [];
    var start = 0;
    var re = /[.!?]+["')\]]*\s+/g;
    var m;
    while ((m = re.exec(flat)) !== null) {
      var end = m.index + m[0].replace(/\s+$/, '').length;
      var piece = flat.slice(start, end);
      var next = flat.charAt(m.index + m[0].length);
      if (ABBREVIATIONS.test(piece) || (next && /[a-z]/.test(next))) continue;
      out.push(piece.trim());
      start = m.index + m[0].length;
    }
    var tail = flat.slice(start).trim();
    if (tail) out.push(tail);
    return out;
  }

  var GREETING = /^(?:dear|hello|hi|greetings|to whom)\b/i;
  var SIGN_OFF_MAX_WORDS = 8;

  // The body is the letter without any heading block, the greeting line and the sign-off block.
  function bodyParagraphs(letter) {
    var paras = paragraphs(clean(letter));
    for (var i = 0; i < Math.min(paras.length, 4); i++) {
      if (GREETING.test(paras[i]) && words(paras[i]).length <= 12) { paras = paras.slice(i + 1); break; }
    }
    if (paras.length > 1 && words(paras[paras.length - 1]).length <= SIGN_OFF_MAX_WORDS) paras.pop();
    return paras;
  }

  function requireText(value, label, min) {
    if (typeof value !== 'string' || !value.trim()) {
      throw new InputError('The ' + label + ' box is empty. Paste the full text and try again.');
    }
    if (value.length > LIMITS.maxChars) {
      throw new InputError('The ' + label + ' is longer than ' + LIMITS.maxChars + ' characters. Paste only the text itself.');
    }
    if (words(value).length < min) {
      throw new InputError('The ' + label + ' is under ' + min + ' words, which is too short to check. Paste the full text.');
    }
    return value;
  }

  function requireField(value, label) {
    if (typeof value !== 'string' || !value.trim()) {
      throw new InputError('Enter the ' + label + ' exactly as the posting writes it, so the check knows what to look for.');
    }
    if (value.length > 120) throw new InputError('The ' + label + ' is too long. Enter just the name.');
    return value.trim();
  }

  function check(id, label, status, detail, explain) {
    return { id: id, label: label, status: status, detail: detail, explain: explain, heuristic: true };
  }

  function plural(n, one, many) { return n + ' ' + (n === 1 ? one : many); }

  // ----------------------------------------------------------------- individual rules

  function phraseCount(text, phrase) {
    var esc = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
    var re = new RegExp('(^|[^A-Za-z0-9])' + esc + '(?![A-Za-z0-9])', 'gi');
    var n = 0;
    while (re.exec(text) !== null) n++;
    return n;
  }

  function checkLength(letterWords, paras) {
    var longest = 0;
    paras.forEach(function (p) { longest = Math.max(longest, words(p).length); });
    var status = 'ok';
    var detail = letterWords + ' words in ' + plural(paras.length, 'paragraph', 'paragraphs') + ' (not counting a greeting or sign-off).';
    if (letterWords < LIMITS.shortLetterWords) {
      status = 'note';
      detail += ' That is short. A short letter can work, but check that it gives at least one specific example.';
    } else if (letterWords > LIMITS.longLetterWords) {
      status = 'warn';
      detail += ' That is likely more than one page. Cut the least relevant paragraph first.';
    } else if (longest > LIMITS.longParagraphWords) {
      status = 'note';
      detail += ' Your longest paragraph is ' + longest + ' words. Consider splitting it.';
    }
    return check('length', 'Length', status, detail,
      'Counts the words in the body of the pasted letter. Flags under ' + LIMITS.shortLetterWords + ' words, over ' + LIMITS.longLetterWords +
      ' words, or any paragraph over ' + LIMITS.longParagraphWords + ' words. These cutoffs are rules of thumb for a one page letter, not a standard. ' +
      'Greeting and sign-off are found by simple patterns and can be miscounted.');
  }

  function checkEmployer(letter, employer) {
    var n = phraseCount(letter, employer);
    var status = n === 0 ? 'warn' : 'ok';
    var detail = n === 0
      ? 'The employer name "' + employer + '" does not appear in the letter. If the letter uses a short form, enter that form, or name the employer in the opening.'
      : 'The employer name appears ' + plural(n, 'time', 'times') + '.';
    return check('employer', 'Names the employer', status, detail,
      'Looks for the exact name you entered, ignoring capital letters. It cannot tell whether the name is used well, and it misses a nickname or an abbreviation unless you enter that form.');
  }

  function checkRole(letter, role) {
    var explain = 'Looks for the exact title you entered, ignoring capital letters. If only some words of the title appear, it reports that as partial.';
    var n = phraseCount(letter, role);
    if (n > 0) return check('role', 'Names the role', 'ok', 'The role title appears ' + plural(n, 'time', 'times') + '.', explain);
    var parts = words(role).filter(function (w) { return !STOP[norm(w)]; });
    var stems = Object.create(null);
    words(letter).forEach(function (w) { stems[stem(w)] = true; });
    var present = parts.filter(function (w) { return stems[stem(w)]; });
    if (parts.length && present.length === parts.length) {
      return check('role', 'Names the role', 'note', 'Every word of "' + role + '" appears, but not as that phrase. Use the title as the posting writes it at least once.', explain);
    }
    if (present.length) {
      return check('role', 'Names the role', 'warn', 'Only part of the title appears (' + present.join(', ') + '). Name the role as the posting writes it: "' + role + '".', explain);
    }
    return check('role', 'Names the role', 'warn', 'The role "' + role + '" is not mentioned. Say which job you are applying for in the first paragraph.', explain);
  }

  function checkOpening(paras, employer, role) {
    var explain = 'Takes the first sentence after any greeting line. Looks for ' + GENERIC_OPENERS.length +
      ' fixed stock phrases, for whether it names the employer or the role, and for length over ' + LIMITS.openingSentenceLongWords +
      ' words. A flag means the line could open many letters. It does not mean the writer is insincere, and a line can avoid every flag and still be dull.';
    if (!paras.length) {
      return { check: check('opening', 'Opening line', 'note', 'No opening line found.', explain), opening: '', flags: [] };
    }
    var first = splitSentences(paras[0])[0] || paras[0];
    var flags = [];
    GENERIC_OPENERS.forEach(function (g) { if (g.re.test(first)) flags.push('Uses ' + g.label + '.'); });
    if (phraseCount(first, employer) === 0 && phraseCount(first, role) === 0) flags.push('The first sentence names neither the employer nor the role.');
    if (words(first).length > LIMITS.openingSentenceLongWords) flags.push('The first sentence is over ' + LIMITS.openingSentenceLongWords + ' words.');
    var status = flags.length === 0 ? 'ok' : flags.length === 1 ? 'note' : 'warn';
    var detail = flags.length === 0
      ? 'No generic-opening flags on: "' + first + '"'
      : flags.join(' ') + ' First sentence: "' + first + '"';
    return { check: check('opening', 'Opening line', status, detail, explain), opening: first, flags: flags };
  }

  var TEMPLATE_PATTERNS = [
    /\[[^\]\n]{2,40}\]/,
    /\{\{?[^}\n]{2,40}\}?\}/,
    /<[A-Za-z ]{3,30}>/,
    /\b(?:company|employer|organization|firm) name\b/i,
    /\byour company\b/i,
    /\b(?:insert|fill in|lorem ipsum)\b/i,
    /\bxxx+\b/i
  ];

  function checkTemplate(letter) {
    var found = [];
    TEMPLATE_PATTERNS.forEach(function (re) {
      var m = letter.match(re);
      if (m) found.push('"' + m[0] + '"');
    });
    return check('template', 'Template leftovers', found.length ? 'warn' : 'ok',
      found.length ? 'Looks like unfilled template text: ' + found.join(', ') + '.' : 'No square brackets, curly braces or "company name" style placeholders found.',
      'Looks for square brackets, curly braces, angle brackets and phrases such as "company name" or "insert". It cannot see a wrong employer name left from an earlier letter, so also check the name against the posting yourself.');
  }

  function contentTerms(text) {
    var counts = Object.create(null);
    var firstAt = Object.create(null);
    var surface = Object.create(null);
    var order = 0;
    words(text).forEach(function (w) {
      var n = norm(w);
      if (n.length < 3 || STOP[n] || COMMON[n] || /^\d+$/.test(n)) return;
      var s = stem(w);
      if (STOP[s] || COMMON[s]) return;
      counts[s] = (counts[s] || 0) + 1;
      if (!(s in firstAt)) { firstAt[s] = order++; surface[s] = n; }
      if (/^[A-Z]{2,5}$/.test(w)) surface[s] = w;
    });
    return { counts: counts, firstAt: firstAt, surface: surface };
  }

  function checkOverlap(letter, posting) {
    var p = contentTerms(posting);
    var keys = Object.keys(p.counts).filter(function (k) {
      return p.counts[k] >= 2 || /^[A-Z]{2,5}$/.test(p.surface[k]);
    });
    keys.sort(function (a, b) { return p.counts[b] - p.counts[a] || p.firstAt[a] - p.firstAt[b]; });
    keys = keys.slice(0, LIMITS.maxPostingTerms);
    var letterStems = Object.create(null);
    words(letter).forEach(function (w) { letterStems[stem(w)] = true; });
    var terms = keys.map(function (k) { return { term: p.surface[k], count: p.counts[k], inLetter: !!letterStems[k] }; });
    var used = terms.filter(function (t) { return t.inLetter; });
    var missing = terms.filter(function (t) { return !t.inLetter; });
    var explain = 'Takes single words from the posting that are not everyday filler, keeps those used twice or more (or written as an acronym such as SQL), ' +
      'ranks them by how often the posting repeats them, and keeps the top ' + LIMITS.maxPostingTerms + '. Then checks which appear in your letter, ignoring capital letters and simple word endings. ' +
      'It counts words, not meaning. Copying posting words into a letter does not make it better, and a term you cannot back up should stay out.';
    var status, detail;
    if (!terms.length) {
      status = 'note';
      detail = 'No repeated terms came out of that posting. Paste the whole posting, including the requirements.';
    } else {
      var share = used.length / terms.length;
      status = share >= 0.3 ? 'ok' : 'note';
      detail = used.length + ' of ' + plural(terms.length, 'posting term', 'posting terms') + ' appear in your letter.' +
        (share < 0.3 ? ' Few of the posting’s own words show up. Check that the one or two requirements you cover are the ones the posting stresses.' : '');
    }
    return { check: check('overlap', 'Overlap with the posting', status, detail, explain), terms: terms, used: used, missing: missing };
  }

  function checkRepeatedWords(text) {
    var t = contentTerms(text);
    var rep = Object.keys(t.counts).filter(function (k) { return t.counts[k] >= LIMITS.repeatedWordCount; })
      .map(function (k) { return { word: t.surface[k], count: t.counts[k] }; })
      .sort(function (a, b) { return b.count - a.count || (a.word < b.word ? -1 : 1); });
    return {
      check: check('repeats', 'Repeated words', rep.length ? 'note' : 'ok',
        rep.length
          ? 'Used ' + LIMITS.repeatedWordCount + ' or more times: ' + rep.map(function (r) { return r.word + ' (' + r.count + ')'; }).join(', ') + '. Repetition can be deliberate. Check each one.'
          : 'No everyday content word appears ' + LIMITS.repeatedWordCount + ' or more times.',
        'Counts words other than everyday function words, with simple word endings merged ("manage" and "managed" count together). Flags any used ' + LIMITS.repeatedWordCount +
        ' or more times. The employer name and the role title often show up here, and that is usually fine.'),
      words: rep
    };
  }

  function checkOpeners(sentences) {
    var counts = Object.create(null);
    sentences.forEach(function (s) {
      var w = words(s)[0];
      if (w) { var k = norm(w); counts[k] = (counts[k] || 0) + 1; }
    });
    var rep = Object.keys(counts).filter(function (k) { return counts[k] >= LIMITS.repeatedOpenerCount; })
      .map(function (k) { return { word: k, count: counts[k] }; }).sort(function (a, b) { return b.count - a.count; });
    var explain = 'Counts how many sentences start with the same word. Flags a word that starts ' + LIMITS.repeatedOpenerCount +
      ' or more sentences. A run of sentences that begin with "I" is the usual case. Splitting sentences is approximate, so abbreviations can add or hide a sentence.';
    return {
      check: check('openers', 'Repeated sentence openers', rep.length ? 'note' : 'ok',
        rep.length
          ? rep.map(function (r) { return plural(r.count, 'sentence starts', 'sentences start') + ' with "' + r.word + '"'; }).join('; ') + '. Try opening one or two with the thing you did instead.'
          : 'No word starts ' + LIMITS.repeatedOpenerCount + ' or more sentences.', explain),
      openers: rep
    };
  }

  function findPassives(sentence) {
    var toks = words(sentence);
    var hits = [];
    for (var i = 0; i < toks.length - 1; i++) {
      if (!BE_FORMS[norm(toks[i])]) continue;
      var j = i + 1;
      if (/ly$/i.test(toks[j]) && toks[j].length > 4) j++;
      if (j >= toks.length) continue;
      var w = norm(toks[j]);
      if (NOT_PARTICIPLES[w]) continue;
      if ((w.length >= 4 && /ed$/.test(w)) || IRREGULAR_PARTICIPLES[w]) hits.push(toks.slice(i, j + 1).join(' '));
    }
    return hits;
  }

  function checkPassive(sentences) {
    var flagged = [];
    sentences.forEach(function (s) {
      var h = findPassives(s);
      if (h.length) flagged.push({ sentence: s, matches: h });
    });
    var share = sentences.length ? flagged.length / sentences.length : 0;
    var status = flagged.length >= LIMITS.passiveNoteCount || share >= LIMITS.passiveNoteShare ? 'note' : 'ok';
    var detail = flagged.length === 0
      ? 'No sentences matched the passive voice pattern.'
      : plural(flagged.length, 'sentence', 'sentences') + ' of ' + sentences.length + ' matched (' + Math.round(share * 100) + '%). Matches: ' +
        flagged.slice(0, 5).map(function (f) { return '"' + f.matches[0] + '"'; }).join(', ') + '.';
    return {
      check: check('passive', 'Passive voice indicators', status, detail,
        'Looks for a form of "to be" (am, is, are, was, were, be, been, being), optionally followed by an adverb ending in -ly, then a word ending in -ed or a common irregular past participle. ' +
        'It skips a short list of words that act as plain adjectives, such as "excited". It still gets some wrong: it misses passives built with other verbs, and it flags a few adjectives. ' +
        'Passive voice is sometimes the right choice, so this is a prompt to reread, not an error count.'),
      flagged: flagged
    };
  }

  // ---------------------------------------------------------------------- entry point

  function analyze(input) {
    input = input || {};
    var letter = clean(requireText(input.letter, 'cover letter', LIMITS.minLetterWords));
    var posting = clean(requireText(input.posting, 'job posting', LIMITS.minPostingWords));
    var employer = requireField(input.employer, 'employer name');
    var role = requireField(input.role, 'role title');

    var paras = bodyParagraphs(letter);
    var bodyText = paras.join('\n\n');
    var sentences = splitSentences(bodyText);
    var bodyWords = words(bodyText).length;

    var opening = checkOpening(paras, employer, role);
    var overlap = checkOverlap(letter, posting);
    var repeats = checkRepeatedWords(bodyText);
    var openers = checkOpeners(sentences);
    var passive = checkPassive(sentences);

    var checks = [
      checkLength(bodyWords, paras),
      checkEmployer(letter, employer),
      checkRole(letter, role),
      opening.check,
      checkTemplate(letter),
      overlap.check,
      repeats.check,
      openers.check,
      passive.check
    ];

    var summary = { ok: 0, note: 0, warn: 0 };
    checks.forEach(function (c) { summary[c.status]++; });

    return {
      summary: summary,
      checks: checks,
      stats: { words: bodyWords, paragraphs: paras.length, sentences: sentences.length },
      opening: { text: opening.opening, flags: opening.flags },
      overlap: { terms: overlap.terms, used: overlap.used, missing: overlap.missing },
      repeatedWords: repeats.words,
      repeatedOpeners: openers.openers,
      passive: passive.flagged
    };
  }

  return {
    analyze: analyze,
    splitSentences: splitSentences,
    findPassives: findPassives,
    stem: stem,
    InputError: InputError,
    LIMITS: LIMITS
  };
});
