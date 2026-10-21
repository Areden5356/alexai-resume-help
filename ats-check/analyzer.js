/* Keyword overlap and format checks for a resume against a job posting.
 *
 * Pure functions, no network, no storage, no DOM. Runs in the browser (as
 * window.AtsAnalyzer) and under node (module.exports) so the same code is tested.
 *
 * What this is: a keyword overlap check. It finds the terms a posting leans on
 * and reports which of them appear in a resume. It does not simulate any
 * applicant tracking system and says nothing about how a real one will rank or
 * parse a resume.
 *
 * How terms are chosen (all heuristics, listed so they can be argued with):
 *  - words and 2 to 3 word phrases from the posting, never across punctuation
 *    or line breaks, never starting or ending on a stopword
 *  - kept if the posting repeats them, they are a known skill or tool from the
 *    small lexicon below, they look like an acronym (SQL, CRM), or they contain
 *    technical characters (C++, node.js)
 *  - if a phrase and its parts always occur together, only the phrase is kept
 *  - matching ignores case and simple endings (plural, -ing, -ed), so
 *    "managed" matches "managing"
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.AtsAnalyzer = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var LIMITS = {
    maxChars: 60000,
    minWords: 40,
    maxTerms: 30,
    longBulletWords: 30,
    shortBulletWords: 5,
    shortResumeWords: 150,
    longResumeWords: 800,
    wordsPerPageRoughly: 500
  };

  function AtsInputError(message) {
    this.name = 'AtsInputError';
    this.message = message;
    if (Error.captureStackTrace) Error.captureStackTrace(this, AtsInputError);
  }
  AtsInputError.prototype = Object.create(Error.prototype);
  AtsInputError.prototype.constructor = AtsInputError;

  // ---------------------------------------------------------------- word lists

  function set(str) {
    var s = Object.create(null);
    str.split(/\s+/).forEach(function (w) { if (w) s[w] = true; });
    return s;
  }

  // Words that carry no skill meaning and break phrases.
  var FUNCTION_WORDS = set(
    'a about above across after again against all almost also although always am among an and any are around as at ' +
    'be because been before being between both but by can cannot could did do does doing down during each either else ' +
    'etc even ever every few for from further had has have having he her here hers him his how however i if in into is ' +
    'it its itself just let like may me might more most much must my neither no nor not of off on once one only onto ' +
    'or other our ours out over own per same shall she should since so some such than that the their them then there ' +
    'these they this those through to too under until up upon us very via was we were what when where whether which ' +
    'while who whom whose why will with within without would yet you your yours e.g i.e u.s n/a and/or he/she his/her ' +
    'll re ve don doesn isn aren wasn weren hasn haven hadn didn wouldn shouldn couldn'
  );

  // Posting boilerplate: common in every posting, useless as a resume keyword.
  // Such words are never kept alone and never start or end a phrase.
  var BOILERPLATE = set(
    'ability able apply applicant applicants application applications benefits candidate candidates company companies ' +
    'culture day days degree demonstrated description detail details duties duty effective effectively employer ' +
    'employment equal excellent experience experiences familiarity full good great help helping hire hiring ideal ' +
    'include includes including join job jobs knowledge level looking love make making minimum need needs new ' +
    'opportunity opportunities part passion passionate plus position positions preferred proven provide provides ' +
    'qualification qualifications qualified related relevant required requirement requirements requires ' +
    'responsibilities responsibility responsible role roles salary seeking similar solid strong successful team teams ' +
    'member members time understanding use used using various well work working works year years bachelor bachelors ' +
    'masters ensure ensuring highly fast paced dynamic environment location remote hybrid onsite pay range ' +
    'compensation insurance dental vision medical pto paid vacation holidays stock bonus perks eoe eeo race color ' +
    'religion sex gender orientation national origin disability veteran status protected regardless united states ' +
    'usa inc llc ltd summary overview title department report reports reporting looking ideally eligible authorization ' +
    'authorized sponsorship hours week weekly weekends full-time part-time fulltime parttime today tomorrow ' +
    'successfully ongoing day-to-day daily build builds building built feature features ship ships shipping shipped ' +
    'write writes wrote small large clear comfortable alongside'
  );

  var ACRONYM_STOP = set(
    'US USA EEO EOE LLC INC LTD PTO CEO CFO CTO COO VP AM PM ID OK II III IV FAQ TBD FT PT ASAP GPA USD NYC LA DC UK ' +
    'EU PDF'
  );

  // Terms that count even if the posting mentions them once. A lexicon hit makes
  // no claim about the posting; it only stops a real skill being ignored.
  var LEXICON_TERMS = [
    // software, data, IT
    'python', 'java', 'javascript', 'typescript', 'sql', 'nosql', 'html', 'css', 'react', 'angular', 'vue', 'node.js',
    'c++', 'c#', '.net', 'rust', 'swift', 'kotlin', 'php', 'ruby', 'matlab', 'git', 'github', 'docker', 'kubernetes',
    'aws', 'azure', 'gcp', 'linux', 'api', 'rest', 'graphql', 'ci/cd', 'agile', 'scrum', 'kanban', 'jira',
    'confluence', 'machine learning', 'deep learning', 'data science', 'data analysis', 'data analytics',
    'data visualization', 'data engineering', 'data entry', 'statistics', 'statistical analysis', 'excel',
    'microsoft excel', 'powerpoint', 'microsoft office', 'google sheets', 'google workspace', 'tableau', 'power bi',
    'looker', 'pandas', 'numpy', 'scikit learn', 'tensorflow', 'pytorch', 'spark', 'hadoop', 'etl', 'cybersecurity',
    'networking', 'troubleshooting', 'devops', 'testing', 'unit testing', 'quality assurance', 'debugging',
    'object oriented', 'frontend', 'backend', 'fullstack', 'database', 'cloud', 'automation', 'artificial intelligence',
    'natural language processing', 'software development', 'web development', 'mobile development',
    // business, marketing, sales, finance, operations
    'seo', 'sem', 'social media', 'content marketing', 'email marketing', 'marketing', 'copywriting',
    'google analytics', 'crm', 'salesforce', 'hubspot', 'customer service', 'customer success', 'account management',
    'sales', 'lead generation', 'market research', 'branding', 'public relations', 'event planning',
    'project management', 'program management', 'product management', 'stakeholder management', 'budgeting',
    'forecasting', 'financial analysis', 'financial modeling', 'accounting', 'bookkeeping', 'accounts payable',
    'accounts receivable', 'quickbooks', 'gaap', 'auditing', 'compliance', 'risk management', 'procurement',
    'supply chain', 'logistics', 'inventory', 'operations', 'process improvement', 'lean', 'six sigma',
    'vendor management', 'negotiation', 'presentations', 'public speaking', 'strategic planning',
    'business development', 'kpi', 'okr', 'roi', 'a/b testing', 'b2b', 'b2c', 'ecommerce', 'business analysis',
    'cross functional', 'analytics',
    // design and media
    'figma', 'photoshop', 'illustrator', 'indesign', 'adobe creative suite', 'canva', 'ux', 'ui', 'user experience',
    'user interface', 'user research', 'wireframing', 'prototyping', 'graphic design', 'video editing', 'photography',
    // health, education, service, people
    'patient care', 'electronic health records', 'ehr', 'hipaa', 'scheduling', 'record keeping', 'cash handling',
    'point of sale', 'teaching', 'curriculum development', 'lesson planning', 'tutoring', 'mentoring', 'training',
    'onboarding', 'recruiting', 'human resources', 'payroll', 'volunteer', 'fundraising', 'grant writing',
    'research', 'literature review', 'laboratory', 'customer support', 'client relations',
    // working styles that postings name outright
    'leadership', 'communication', 'collaboration', 'teamwork', 'problem solving', 'critical thinking',
    'time management', 'attention to detail', 'multitasking', 'adaptability',
    // role words
    'intern', 'internship', 'analyst', 'coordinator', 'specialist', 'engineer', 'developer', 'designer',
    'representative', 'administrator', 'consultant', 'technician'
  ];

  // Short forms and their expansions, so "SEO" in a resume satisfies
  // "search engine optimization" in the posting and the reverse.
  var ALIAS_GROUPS = [
    ['seo', 'search engine optimization'],
    ['crm', 'customer relationship management'],
    ['kpi', 'key performance indicator'],
    ['ux', 'user experience'],
    ['ui', 'user interface'],
    ['qa', 'quality assurance'],
    ['hr', 'human resources'],
    ['aws', 'amazon web services'],
    ['gcp', 'google cloud platform'],
    ['roi', 'return on investment'],
    ['ehr', 'electronic health records'],
    ['api', 'application programming interface'],
    ['ml', 'machine learning'],
    ['ai', 'artificial intelligence'],
    ['nlp', 'natural language processing'],
    ['etl', 'extract transform load'],
    ['b2b', 'business to business'],
    ['okr', 'objectives and key results'],
    ['excel', 'microsoft excel'],
    ['ms office', 'microsoft office'],
    ['power bi', 'powerbi'],
    ['node.js', 'nodejs'],
    ['js', 'javascript'],
    ['ci/cd', 'continuous integration']
  ];

  // Words written solid or spaced depending on the author.
  var COMPOUNDS = {
    'front end': 'frontend', 'back end': 'backend', 'full stack': 'fullstack', 'e commerce': 'ecommerce',
    'health care': 'healthcare', 'data set': 'dataset', 'work flow': 'workflow', 'e mail': 'email'
  };

  var REQ_HEADING = /^[\s\-*\u2022]*(?:minimum |basic |required |preferred |desired )?(?:requirements?|qualifications?|skills(?: (?:and|&) experience)?|what you(?:'|\u2019)ll (?:need|bring)|what we(?:'|\u2019)re looking for|must[- ]haves?|nice[- ]to[- ]haves?|who you are|you have|about you)\s*:?\s*$/i;
  var OTHER_HEADING = /^[\s\-*\u2022]*(?:responsibilities|what you(?:'|\u2019)ll do|about (?:the|us)|benefits|perks|compensation|how to apply|why join|equal opportunity|the role|overview)\b.*$/i;

  // ---------------------------------------------------------------- text basics

  function wordCount(text) {
    var m = String(text).match(/\S+/g);
    return m ? m.length : 0;
  }

  function preprocess(text) {
    return String(text)
      .replace(/\r\n?/g, '\n')
      .replace(/[\u2018\u2019\u02bc]/g, "'")
      .replace(/[\u201c\u201d]/g, '"')
      .replace(/\u00a0/g, ' ')
      .replace(/https?:\/\/\S+|www\.\S+/gi, ' ')
      .replace(/\S+@\S+\.\S+/g, ' ')
      .replace(/\bcan't\b/gi, 'cannot')
      .replace(/\bwon't\b/gi, 'will not')
      .replace(/n't\b/gi, ' not')
      .replace(/(\w)'(?:s|ll|re|ve|d|m)\b/gi, '$1')
      .replace(/\br\s*&\s*d\b/gi, 'research and development')
      .replace(/\bp\s*&\s*l\b/gi, 'profit and loss');
  }

  // Common irregular past forms, so "built" matches "build" and "led" matches "lead".
  var IRREGULAR = {
    built: 'build', wrote: 'write', written: 'write', led: 'lead', ran: 'run', taught: 'teach', held: 'hold',
    sold: 'sell', kept: 'keep', began: 'begin', grew: 'grow', drove: 'drive', gave: 'give', spoke: 'speak',
    chose: 'choose', won: 'win', met: 'meet', made: 'make', took: 'take', brought: 'bring', thought: 'think',
    taught: 'teach', found: 'find', sent: 'send', spent: 'spend', paid: 'pay', saw: 'see', did: 'do'
  };

  /** Reduce a lowercase word to a comparison key. Only plain letters are touched. */
  function stem(w) {
    if (IRREGULAR[w]) w = IRREGULAR[w];
    if (w.length <= 3 || !/^[a-z]+$/.test(w)) return w;
    var out = w;
    if (/ies$/.test(out) && out.length > 4) out = out.slice(0, -3) + 'y';
    else if (/sses$/.test(out)) out = out.slice(0, -2);
    else if (/ing$/.test(out) && out.length > 5) out = undouble(out.slice(0, -3));
    else if (/ied$/.test(out) && out.length > 4) out = out.slice(0, -3) + 'y';
    else if (/ed$/.test(out) && out.length > 4) out = undouble(out.slice(0, -2));
    else if (/(?:s|x|z|ch|sh)es$/.test(out)) out = out.slice(0, -2);
    else if (/s$/.test(out) && !/(?:ss|us|is)$/.test(out)) out = out.slice(0, -1);
    if (out.length > 4 && /[^e]e$/.test(out)) out = out.slice(0, -1);
    return out;
  }

  function undouble(w) {
    return /([b-df-hj-km-np-tv-xz])\1$/.test(w) ? w.slice(0, -1) : w;
  }

  var TOKEN_RE = /\.net\b|[A-Za-z0-9]+(?:[.\/\-][A-Za-z0-9]+)*(?:\+\+|\+|#)?/gi;
  var NUMERIC_RE = /^\d+(?:[.\/]\d+)*\+?$/;

  /** Split one text segment into tokens. Hyphenated words become adjacent tokens. */
  function tokenizeSegment(segment) {
    var raw = segment.match(TOKEN_RE) || [];
    var out = [];
    raw.forEach(function (tok) {
      var parts = /^[A-Za-z0-9]+(?:-[A-Za-z0-9]+)+$/.test(tok) ? tok.split('-') : [tok];
      parts.forEach(function (p, idx) {
        out.push({ raw: p, norm: p.toLowerCase(), join: idx === 0 ? ' ' : '-' });
      });
    });
    // merge words that are written solid or spaced depending on the author
    var merged = [];
    for (var i = 0; i < out.length; i++) {
      var next = out[i + 1];
      var key = next ? out[i].norm + ' ' + next.norm : '';
      if (next && COMPOUNDS[key]) {
        merged.push({ raw: out[i].raw + next.join + next.raw, norm: COMPOUNDS[key], join: out[i].join });
        i++;
      } else {
        merged.push(out[i]);
      }
    }
    merged.forEach(function (t) { t.stem = stem(t.norm); });
    return merged;
  }

  var BOUNDARY_RE = /[;:!?(),|\u2022\u00b7\u25aa\u25cf\u25e6\u2013\u2014\u2192]|\.(?=\s|$)|\s-\s|\s\/\s/;

  /** Posting: every line is its own block, punctuation splits phrases. */
  function postingLines(text) {
    return preprocess(text).split('\n').map(function (line) {
      var letters = line.replace(/[^A-Za-z]/g, '');
      return {
        text: line,
        allCaps: letters.length > 0 && letters === letters.toUpperCase(),
        segments: line.split(BOUNDARY_RE).map(tokenizeSegment).filter(function (s) { return s.length; })
      };
    });
  }

  var BULLET_START = /^\s*(?:[\u2022\u00b7\u25aa\u25ab\u25e6\u25cf\u25cb\u25a0\u25a1\u27a2\u27a4\u25ba\u25b6\u2023\u2043]\s*|[-*+\u2013\u2014]\s+)/;

  /** Resume: hard-wrapped lines are rejoined so phrases survive a line break. */
  function resumeSegments(text) {
    var pre = preprocess(text);
    var blocks = [];
    var current = '';
    pre.split('\n').forEach(function (line) {
      if (/^\s*$/.test(line) || BULLET_START.test(line)) {
        if (current) blocks.push(current);
        current = /^\s*$/.test(line) ? '' : line.replace(BULLET_START, '');
      } else {
        current = current ? current + ' ' + line : line;
      }
    });
    if (current) blocks.push(current);
    var segs = [];
    blocks.forEach(function (b) {
      b.split(BOUNDARY_RE).forEach(function (s) {
        var toks = tokenizeSegment(s);
        if (toks.length) segs.push(toks);
      });
    });
    return segs;
  }

  // ---------------------------------------------------------------- key terms

  var LEXICON = Object.create(null);
  LEXICON_TERMS.forEach(function (t) {
    LEXICON[tokenizeSegment(preprocess(t)).map(function (x) { return x.stem; }).join(' ')] = true;
  });

  var ALIASES = Object.create(null);
  ALIAS_GROUPS.forEach(function (group) {
    var keys = group.map(function (g) { return tokenizeSegment(preprocess(g)).map(function (x) { return x.stem; }).join(' '); });
    keys.forEach(function (k) { ALIASES[k] = (ALIASES[k] || []).concat(keys.filter(function (o) { return o !== k; })); });
  });

  function isContent(tok) {
    return !FUNCTION_WORDS[tok.norm] && !NUMERIC_RE.test(tok.norm) && tok.norm.length > 1;
  }

  function surface(tokens) {
    var s = tokens[0].raw;
    for (var i = 1; i < tokens.length; i++) s += tokens[i].join + tokens[i].raw;
    return s;
  }

  function looksLikeAcronym(tok) {
    return /^[A-Z][A-Z0-9&]{1,5}$/.test(tok.raw) && !ACRONYM_STOP[tok.raw];
  }

  function hasTechChars(tok) {
    return /[+#]|\./.test(tok.norm) || /\//.test(tok.norm);
  }

  function isSubsequence(small, big) {
    if (small.length >= big.length) return false;
    for (var i = 0; i + small.length <= big.length; i++) {
      var ok = true;
      for (var j = 0; j < small.length; j++) if (big[i + j] !== small[j]) { ok = false; break; }
      if (ok) return true;
    }
    return false;
  }

  function titleLineOf(lines) {
    for (var i = 0; i < lines.length; i++) {
      var t = lines[i].text.trim();
      if (!t) continue;
      if (wordCount(t) <= 12 && !/[.!?]$/.test(t)) return { index: i, text: t };
      return null;
    }
    return null;
  }

  /**
   * @param {string} postingText
   * @returns {{terms: Array, title: (null|{text: string, words: Array})}}
   */
  function extractKeyTerms(postingText, maxTerms) {
    var cap = maxTerms || LIMITS.maxTerms;
    var lines = postingLines(postingText);
    var title = titleLineOf(lines);
    var inReq = false;
    var cands = Object.create(null);
    var order = 0;

    lines.forEach(function (line, li) {
      var trimmed = line.text.trim();
      if (REQ_HEADING.test(trimmed)) inReq = true;
      else if (OTHER_HEADING.test(trimmed) && wordCount(trimmed) <= 6) inReq = false;
      var isTitle = title && li === title.index;

      line.segments.forEach(function (seg) {
        // runs of content tokens: function words and numbers break phrases
        var runs = [];
        var run = [];
        seg.forEach(function (tok) {
          if (isContent(tok)) run.push(tok);
          else { if (run.length) runs.push(run); run = []; }
        });
        if (run.length) runs.push(run);

        runs.forEach(function (r) {
          for (var i = 0; i < r.length; i++) {
            for (var n = 1; n <= 3 && i + n <= r.length; n++) {
              var gram = r.slice(i, i + n);
              var key = gram.map(function (g) { return g.stem; }).join(' ');
              var c = cands[key];
              if (!c) {
                c = cands[key] = {
                  key: key, stems: gram.map(function (g) { return g.stem; }), n: n, count: 0, reqCount: 0,
                  inTitle: false, surfaces: Object.create(null), order: order++,
                  lexicon: !!LEXICON[key],
                  acronym: n === 1 && !line.allCaps && looksLikeAcronym(gram[0]),
                  tech: n === 1 && hasTechChars(gram[0]),
                  startsBoiler: !!BOILERPLATE[gram[0].norm],
                  endsBoiler: !!BOILERPLATE[gram[n - 1].norm]
                };
              }
              c.count++;
              if (inReq) c.reqCount++;
              if (isTitle) c.inTitle = true;
              var s = surface(gram);
              c.surfaces[s] = (c.surfaces[s] || 0) + 1;
            }
          }
        });
      });
    });

    // qualify
    var qualified = Object.keys(cands).map(function (k) { return cands[k]; }).filter(function (c) {
      if (c.n === 1) {
        if (c.startsBoiler && !c.lexicon) return false;
        return c.lexicon || c.acronym || c.tech || c.count >= 2;
      }
      if ((c.startsBoiler || c.endsBoiler) && !c.lexicon) return false;
      return c.lexicon || c.count >= 2;
    });

    qualified.forEach(function (c) {
      c.score = c.count + 0.5 * c.reqCount + (c.lexicon ? 1.5 : 0) + (c.inTitle ? 1 : 0) + (c.n > 1 ? 0.5 : 0);
    });

    // select, longest first among non-lexicon terms; lexicon terms go first
    qualified.sort(function (a, b) {
      if (a.lexicon !== b.lexicon) return a.lexicon ? -1 : 1;
      if (a.n !== b.n) return b.n - a.n;
      return b.score - a.score;
    });

    var selected = [];
    qualified.forEach(function (c) {
      var covering = 0;
      var coveredBySelectedShorter = false;
      selected.forEach(function (s) {
        if (isSubsequence(c.stems, s.stems)) covering += s.count;
        if (!c.lexicon && isSubsequence(s.stems, c.stems) && s.count >= c.count) coveredBySelectedShorter = true;
      });
      if (c.count - covering <= 0) return;
      if (coveredBySelectedShorter) return;
      selected.push(c);
    });

    selected.sort(function (a, b) { return b.score - a.score || b.count - a.count || a.order - b.order; });

    var terms = selected.slice(0, cap).map(function (c) {
      var best = Object.keys(c.surfaces).sort(function (a, b) { return c.surfaces[b] - c.surfaces[a]; })[0];
      var kind = c.lexicon ? 'skill' : c.acronym ? 'acronym' : c.n > 1 ? 'phrase' : 'word';
      return { term: best, key: c.key, stems: c.stems, kind: kind, count: c.count, inRequirements: c.reqCount > 0 };
    });

    var titleInfo = null;
    if (title) {
      var words = [];
      var seen = Object.create(null);
      postingLines(title.text)[0].segments.forEach(function (seg) {
        seg.forEach(function (tok) {
          if (isContent(tok) && !BOILERPLATE[tok.norm] && !seen[tok.stem]) {
            seen[tok.stem] = true;
            words.push({ term: tok.raw, stem: tok.stem });
          }
        });
      });
      titleInfo = { text: title.text, words: words };
    }
    return { terms: terms, title: titleInfo };
  }

  // ---------------------------------------------------------------- matching

  function countSeq(segments, seq) {
    var total = 0;
    segments.forEach(function (seg) {
      for (var i = 0; i + seq.length <= seg.length; i++) {
        var ok = true;
        for (var j = 0; j < seq.length; j++) if (seg[i + j] !== seq[j]) { ok = false; break; }
        if (ok) total++;
      }
    });
    return total;
  }

  function matchTerm(term, segmentStems, stemSet) {
    var variants = [term.key].concat(ALIASES[term.key] || []);
    for (var v = 0; v < variants.length; v++) {
      var seq = variants[v].split(' ');
      var hits = countSeq(segmentStems, seq);
      if (hits > 0) return { status: 'found', resumeCount: hits, matchedAs: v === 0 ? null : variants[v] };
    }
    if (term.stems.length > 1) {
      var present = term.stems.filter(function (s) { return stemSet[s]; }).length;
      if (present === term.stems.length) return { status: 'partial', resumeCount: 0, matchedAs: null };
      if (term.stems.length === 3) {
        for (var i = 0; i < 2; i++) {
          if (countSeq(segmentStems, term.stems.slice(i, i + 2)) > 0) return { status: 'partial', resumeCount: 0, matchedAs: null };
        }
      }
    }
    return { status: 'missing', resumeCount: 0, matchedAs: null };
  }

  // ---------------------------------------------------------------- format checks

  var HEADINGS = {
    experience: /\b(?:experience|employment|work history|internships)\b/i,
    education: /\b(?:education|academic background|academics)\b/i,
    skills: /\b(?:skills?|technologies|tools|competenc(?:y|ies)|proficienc(?:y|ies))\b/i,
    summary: /\b(?:summary|profile|objective|about me)\b/i,
    projects: /\bprojects?\b/i,
    certifications: /\b(?:certifications?|licenses?|certificates?)\b/i,
    activities: /\b(?:activities|leadership|involvement|volunteer(?:ing)?|honors|awards)\b/i
  };
  var CORE_HEADINGS = ['experience', 'education', 'skills'];

  function headingCandidates(text) {
    return String(text).replace(/\r\n?/g, '\n').split('\n').map(function (l) { return l.trim(); }).filter(function (l) {
      return l && l.length <= 45 && wordCount(l) <= 5 && !/[.!?]$/.test(l) && !BULLET_START.test(l) && !/\d{4}/.test(l);
    });
  }

  var MONTH = '(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sept?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\\.?';
  var YEAR = '(?:19|20)\\d{2}';
  var NUMERIC_MONTH = '(?:0?[1-9]|1[0-2])\\/' + YEAR;
  var MONTH_YEAR = '\\b' + MONTH + '\\s*,?\\s*' + YEAR + '\\b';
  var RANGE_RE = new RegExp(
    '(?:' + MONTH_YEAR + '|\\b' + NUMERIC_MONTH + '\\b|\\b' + YEAR + '\\b)\\s*(?:-|\\u2013|\\u2014|to|until)\\s*(?:' +
    MONTH_YEAR + '|\\b' + NUMERIC_MONTH + '\\b|\\b' + YEAR + '\\b|present|current|now|ongoing)', 'gi');

  function analyzeDates(text) {
    var monthName = (text.match(new RegExp(MONTH_YEAR, 'gi')) || []).length;
    var numeric = (text.match(new RegExp('\\b' + NUMERIC_MONTH + '\\b', 'g')) || []).length;
    var ranges = (text.match(RANGE_RE) || []).length;
    var stripped = text.replace(new RegExp(MONTH_YEAR, 'gi'), ' ').replace(new RegExp('\\b' + NUMERIC_MONTH + '\\b', 'g'), ' ');
    var yearOnly = 0;
    stripped.split('\n').forEach(function (line) {
      var m = line.match(new RegExp('\\b' + YEAR + '\\b', 'g'));
      if (!m) return;
      // a bare year counts when the line is short (a date or heading line) or sits in a range
      if (wordCount(line) <= 10 || new RegExp('\\b' + YEAR + '\\b\\s*(?:-|\\u2013|\\u2014|to)\\s*(?:' + YEAR + '|present|current)', 'i').test(line)) yearOnly += m.length;
    });
    return {
      total: monthName + numeric + yearOnly,
      ranges: ranges,
      styles: { monthName: monthName, numeric: numeric, yearOnly: yearOnly },
      mixedMonthStyles: monthName > 0 && numeric > 0,
      hasPresent: /\b(?:present|current)\b/i.test(text)
    };
  }

  /**
   * @param {string} resumeText
   * @returns {object} measurements and a list of checks with status ok | note | warn
   */
  function checkFormat(resumeText) {
    var text = String(resumeText).replace(/\r\n?/g, '\n');
    var words = wordCount(text);
    var checks = [];

    // length
    var pages = Math.round((words / LIMITS.wordsPerPageRoughly) * 10) / 10;
    var lengthStatus = 'ok';
    var lengthDetail = words + ' words, very roughly ' + pages + ' pages of normal text (about ' + LIMITS.wordsPerPageRoughly + ' words fill a page).';
    if (words < LIMITS.shortResumeWords) { lengthStatus = 'note'; lengthDetail += ' That is short. Check that the paste did not cut off part of the resume.'; }
    else if (words > LIMITS.longResumeWords) { lengthStatus = 'note'; lengthDetail += ' That may run past two pages. Students and recent graduates usually fit on one page, and an employer may prefer it.'; }
    checks.push({ id: 'length', label: 'Length', status: lengthStatus, detail: lengthDetail });

    // headings
    var cands = headingCandidates(text);
    var found = {};
    Object.keys(HEADINGS).forEach(function (name) {
      if (cands.some(function (c) { return HEADINGS[name].test(c); })) found[name] = true;
    });
    var foundList = Object.keys(found);
    var missingCore = CORE_HEADINGS.filter(function (h) { return !found[h]; });
    checks.push({
      id: 'headings', label: 'Section headings',
      status: missingCore.length === 0 ? 'ok' : 'warn',
      detail: (foundList.length ? 'Found: ' + foundList.join(', ') + '. ' : 'No standard headings found. ') +
        (missingCore.length ? 'Missing from the usual three: ' + missingCore.join(', ') + '. Put each heading on its own line, in plain words.' : 'Experience, education and skills are all present.')
    });

    // bullets
    var bulletLines = text.split('\n').filter(function (l) { return BULLET_START.test(l) && l.replace(BULLET_START, '').trim(); })
      .map(function (l) { return l.replace(BULLET_START, '').trim(); });
    var bulletWords = bulletLines.map(wordCount);
    var avg = bulletLines.length ? Math.round(bulletWords.reduce(function (a, b) { return a + b; }, 0) / bulletLines.length) : 0;
    var longB = bulletWords.filter(function (w) { return w > LIMITS.longBulletWords; }).length;
    var shortB = bulletWords.filter(function (w) { return w < LIMITS.shortBulletWords; }).length;
    var withNumbers = bulletLines.filter(function (b) { return /\d/.test(b); }).length;
    var starts = Object.create(null);
    bulletLines.forEach(function (b) { var w = (b.match(/[A-Za-z']+/) || [''])[0].toLowerCase(); if (w) starts[w] = (starts[w] || 0) + 1; });
    var repeated = Object.keys(starts).filter(function (w) { return starts[w] >= 3; }).map(function (w) { return { word: w, count: starts[w] }; });
    var bulletStatus = 'ok';
    var bulletDetail;
    if (!bulletLines.length) {
      bulletStatus = 'note';
      bulletDetail = 'No bullet markers found. If you copied from a PDF, the bullets may have been lost in the paste. Experience is usually easier to scan as short bullets.';
    } else {
      bulletDetail = bulletLines.length + ' bullets, averaging ' + avg + ' words. Bullets with a number in them: ' + withNumbers + '.';
      if (longB) { bulletStatus = 'note'; bulletDetail += ' ' + longB + ' run over ' + LIMITS.longBulletWords + ' words and may read better split in two.'; }
      if (shortB) bulletDetail += ' ' + shortB + ' are under ' + LIMITS.shortBulletWords + ' words.';
      if (repeated.length) {
        bulletStatus = 'note';
        bulletDetail += ' Repeated openers: ' + repeated.map(function (r) { return '"' + r.word + '" x' + r.count; }).join(', ') + '.';
      }
    }
    checks.push({ id: 'bullets', label: 'Bullets', status: bulletStatus, detail: bulletDetail });

    // dates
    var dates = analyzeDates(text);
    var dateStatus = 'ok';
    var dateDetail;
    if (dates.total === 0) { dateStatus = 'warn'; dateDetail = 'No dates found. Employers expect a start and end for each role and school.'; }
    else {
      dateDetail = dates.total + ' dates found, ' + dates.ranges + ' of them in ranges (' + dates.styles.monthName + ' written as month and year, ' +
        dates.styles.numeric + ' as MM/YYYY, ' + dates.styles.yearOnly + ' as a year alone).';
      if (dates.mixedMonthStyles) { dateStatus = 'note'; dateDetail += ' You mix written months and MM/YYYY. Pick one style.'; }
      if (dates.ranges === 0) { dateStatus = 'note'; dateDetail += ' No start to end ranges found.'; }
    }
    checks.push({ id: 'dates', label: 'Dates', status: dateStatus, detail: dateDetail });

    // contact
    var contact = {
      email: /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(text),
      phone: /(?:\+?1[\s.-]?)?(?:\(\d{3}\)|\d{3})[\s.-]?\d{3}[\s.-]?\d{4}/.test(text),
      linkedin: /linkedin\.com\/in\/[\w-]+/i.test(text)
    };
    var missingContact = [];
    if (!contact.email) missingContact.push('email address');
    if (!contact.phone) missingContact.push('phone number');
    checks.push({
      id: 'contact', label: 'Contact details',
      status: missingContact.length ? 'note' : 'ok',
      detail: missingContact.length ? 'Not found in the pasted text: ' + missingContact.join(' and ') + '. If they sit in the page header of your file, a paste can drop them.' : 'Email and phone found. LinkedIn link ' + (contact.linkedin ? 'found.' : 'not found (optional).')
    });

    // layout
    var wide = text.split('\n').filter(function (l) { return /\S(?: {3,}|\t)\S/.test(l); }).length;
    checks.push({
      id: 'layout', label: 'Layout',
      status: wide >= 3 ? 'note' : 'ok',
      detail: wide >= 3 ? wide + ' lines have wide gaps or tabs inside them. That often means columns or a table in the original file, which some software reads out of order.' : 'No sign of columns or tables in the pasted text. A paste cannot show headers, footers, images or text boxes, so look at the file itself too.'
    });

    return {
      words: words, approxPages: pages, headings: { found: foundList, missingCore: missingCore },
      bullets: { count: bulletLines.length, averageWords: avg, long: longB, short: shortB, withNumbers: withNumbers, repeatedStarts: repeated },
      dates: dates, contact: contact, wideGapLines: wide, checks: checks
    };
  }

  // ---------------------------------------------------------------- public

  function requireText(value, label) {
    if (typeof value !== 'string' || !value.trim()) {
      throw new AtsInputError('The ' + label + ' box is empty. Paste the full text and try again.');
    }
    if (value.length > LIMITS.maxChars) {
      throw new AtsInputError('The ' + label + ' is over ' + LIMITS.maxChars.toLocaleString('en-US') + ' characters. Paste only the part that matters.');
    }
    if (wordCount(value) < LIMITS.minWords) {
      throw new AtsInputError('The ' + label + ' is too short to analyze (under ' + LIMITS.minWords + ' words). Paste the whole thing.');
    }
  }

  /**
   * @param {string} resumeText
   * @param {string} postingText
   * @returns {{summary: object, terms: Array, title: (null|object), format: object}}
   * @throws {AtsInputError} when an input is empty, too short, or too long
   */
  function analyze(resumeText, postingText) {
    requireText(resumeText, 'resume');
    requireText(postingText, 'job posting');

    var extracted = extractKeyTerms(postingText);
    var segs = resumeSegments(resumeText).map(function (seg) { return seg.map(function (t) { return t.stem; }); });
    var stemSet = Object.create(null);
    segs.forEach(function (seg) { seg.forEach(function (s) { stemSet[s] = true; }); });

    var terms = extracted.terms.map(function (t) {
      var m = matchTerm(t, segs, stemSet);
      return { term: t.term, kind: t.kind, count: t.count, inRequirements: t.inRequirements, status: m.status, resumeCount: m.resumeCount, matchedAs: m.matchedAs };
    });

    var title = extracted.title && {
      text: extracted.title.text,
      words: extracted.title.words.map(function (w) { return { term: w.term, found: !!stemSet[w.stem] }; })
    };

    var summary = { total: terms.length, found: 0, partial: 0, missing: 0 };
    terms.forEach(function (t) { summary[t.status]++; });

    return { summary: summary, terms: terms, title: title, format: checkFormat(resumeText) };
  }

  return {
    analyze: analyze,
    extractKeyTerms: extractKeyTerms,
    checkFormat: checkFormat,
    analyzeDates: analyzeDates,
    tokenizeSegment: tokenizeSegment,
    stem: stem,
    AtsInputError: AtsInputError,
    LIMITS: LIMITS
  };
});
