/* UI for the cover letter check. All work happens in this page.
   Nothing is sent anywhere and nothing is stored. */
(function () {
  'use strict';
  var C = window.LetterChecker;

  // Invented sample. The person, the company and the letter are made up.
  var SAMPLE_POSTING = [
    'Marketing Analyst Intern', '',
    'Trailhead Supply is a small outdoor gear company looking for a marketing analyst intern for the spring term.', '',
    'What you will do',
    '- Build weekly dashboards in Tableau that track email marketing and paid social performance.',
    '- Run A/B testing on subject lines and landing pages, then summarize results for the team.',
    '- Pull data with SQL and clean it in Excel or Python.',
    '- Support social media planning and write short summaries for stakeholders.', '',
    'Requirements',
    '- Currently pursuing a degree in marketing, business, statistics, or a related field.',
    '- Experience with SQL and Excel. Familiarity with Google Analytics is a plus.',
    '- Strong written communication and attention to detail.',
    '- Comfortable with data analysis and data visualization.'
  ].join('\n');

  var SAMPLE_LETTER = [
    'Dear Hiring Team,', '',
    'I am writing to express my interest in the open internship. I am a hard-working student who is passionate about marketing and eager to learn.', '',
    'As social media chair of a campus marketing club, I managed posts across three accounts. Each Friday I went through which posts had gotten the most replies and changed the next week’s plan to match. Reports were shared with the club officers every month.', '',
    'I have used Excel for weekly sales tracking at my part-time retail job, and I am taking a data visualization course this term. I have not used Tableau yet.', '',
    'Thank you for reading. I am free to talk any afternoon next week.', '',
    'Sincerely,',
    'Jordan Example'
  ].join('\n');

  var $ = function (id) { return document.getElementById(id); };
  var employerBox = $('employer');
  var roleBox = $('role');
  var letterBox = $('letter');
  var postingBox = $('posting');
  var out = $('results');
  var errorBox = $('error');

  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      if (k === 'text') node.textContent = attrs[k];
      else node.setAttribute(k, attrs[k]);
    });
    (children || []).forEach(function (c) { node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return node;
  }

  function chips(kind, items) {
    var ul = el('ul', { 'class': 'chips ' + kind });
    items.forEach(function (t) { ul.appendChild(el('li', {}, [t.term])); });
    return ul;
  }

  function render(r) {
    out.textContent = '';
    var s = r.summary;
    out.appendChild(el('h2', { text: 'Results' }));
    out.appendChild(el('p', { 'class': 'scoreline', text: s.ok + ' fine, ' + s.note + ' to look at, ' + s.warn + ' to check.' }));
    out.appendChild(el('p', { 'class': 'small', text: 'Nine heuristic checks on ' + r.stats.words + ' words in ' + r.stats.paragraphs + ' paragraphs. They are rules of thumb, not a grade, and they say nothing about how any employer will react.' }));

    var label = { ok: 'Fine', note: 'Look', warn: 'Check' };
    var ul = el('ul', { 'class': 'checks' });
    r.checks.forEach(function (c) {
      var body = el('span', {}, [
        el('strong', { text: c.label + '. ' }),
        c.detail,
        el('span', { 'class': 'small' }, [' (heuristic)'])
      ]);
      var how = el('details', {}, [el('summary', { text: 'How this rule works' }), el('p', { text: c.explain })]);
      var cell = el('div', {}, [body, how]);
      ul.appendChild(el('li', {}, [el('span', { 'class': 'st ' + c.status, text: label[c.status] }), cell]));
    });
    out.appendChild(ul);

    if (r.overlap.terms.length) {
      out.appendChild(el('h3', { text: 'Posting terms your letter uses' }));
      out.appendChild(r.overlap.used.length ? chips('found', r.overlap.used) : el('p', { 'class': 'small', text: 'None of the top terms.' }));
      if (r.overlap.missing.length) {
        out.appendChild(el('h3', { text: 'Posting terms not in your letter' }));
        out.appendChild(el('p', { 'class': 'small', text: 'A missing term is a question, not an instruction. Add one only if it is true for you and you can back it up.' }));
        out.appendChild(chips('missing', r.overlap.missing));
      }
    }

    if (r.passive.length) {
      out.appendChild(el('h3', { text: 'Sentences that matched the passive voice pattern' }));
      var pl = el('ul', {});
      r.passive.slice(0, 8).forEach(function (p) { pl.appendChild(el('li', { text: p.sentence })); });
      out.appendChild(pl);
    }

    out.hidden = false;
    out.setAttribute('tabindex', '-1');
    out.focus({ preventScroll: false });
  }

  function run() {
    errorBox.textContent = '';
    try {
      render(C.analyze({ letter: letterBox.value, posting: postingBox.value, employer: employerBox.value, role: roleBox.value }));
    } catch (e) {
      out.hidden = true;
      if (e instanceof C.InputError) {
        errorBox.textContent = e.message;
      } else {
        errorBox.textContent = 'Something went wrong while reading the text. Reload the page and try again.';
        if (window.console) console.error(e);
      }
    }
  }

  $('run').addEventListener('click', run);
  $('sample').addEventListener('click', function () {
    employerBox.value = 'Trailhead Supply';
    roleBox.value = 'Marketing Analyst Intern';
    letterBox.value = SAMPLE_LETTER;
    postingBox.value = SAMPLE_POSTING;
    run();
  });
  $('clear').addEventListener('click', function () {
    employerBox.value = '';
    roleBox.value = '';
    letterBox.value = '';
    postingBox.value = '';
    errorBox.textContent = '';
    out.textContent = '';
    out.hidden = true;
    employerBox.focus();
  });
})();
