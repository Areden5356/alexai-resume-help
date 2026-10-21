/* UI for the keyword overlap check. All work happens in this page.
   Nothing is sent anywhere and nothing is stored. */
(function () {
  'use strict';
  var A = window.AtsAnalyzer;

  var SAMPLE_POSTING = [
    'Marketing Analyst Intern', '',
    'We are a small outdoor gear company looking for a marketing analyst intern for the spring term.', '',
    'What you will do',
    '- Build weekly dashboards in Tableau that track email marketing and paid social performance.',
    '- Run A/B testing on subject lines and landing pages, then summarize results for the team.',
    '- Pull data with SQL and clean it in Excel or Python.',
    '- Support social media planning and write short summaries for stakeholders.', '',
    'Requirements',
    '- Currently pursuing a degree in marketing, business, statistics, or a related field.',
    '- Experience with SQL and Excel. Familiarity with Google Analytics is a plus.',
    '- Strong written communication and attention to detail.',
    '- Comfortable with data analysis and data visualization.', '',
    'Nice to have',
    '- Experience with HubSpot or another CRM.',
    '- Basic knowledge of SEO.'
  ].join('\n');

  var SAMPLE_RESUME = [
    'Jordan Example',
    'jordan.example@example.com | (555) 010-0142', '',
    'EDUCATION',
    'State University, B.S. in Business Administration, Marketing concentration',
    'Expected May 2027', '',
    'EXPERIENCE',
    'Campus Outfitters, Sales Associate',
    'Aug 2024 - Present',
    '- Helped customers choose gear and ran the register on weekend shifts',
    '- Tracked weekly sales in an Excel sheet and shared totals with the store lead',
    '- Posted twice a week on the store Instagram account', '',
    'Marketing Club, Social Media Chair',
    'Sep 2023 - May 2024',
    '- Planned and scheduled posts across three accounts',
    '- Wrote the weekly email newsletter',
    '- Reviewed which posts got the most replies and adjusted the next week plan', '',
    'PROJECTS',
    'Coffee Shop Survey, class project, Spring 2025',
    '- Collected 60 survey responses and summarized them in a short slide deck',
    '- Used pivot tables to compare answers by age group', '',
    'SKILLS',
    'Excel, Google Sheets, Canva, Mailchimp, written communication, SQL (coursework)'
  ].join('\n');

  var $ = function (id) { return document.getElementById(id); };
  var resumeBox = $('resume');
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

  function chips(kind, items, describe) {
    var ul = el('ul', { 'class': 'chips ' + kind });
    items.forEach(function (t) {
      var li = el('li', {}, [t.term]);
      var extra = describe(t);
      if (extra) { li.appendChild(document.createTextNode(' ')); li.appendChild(el('small', { text: extra })); }
      ul.appendChild(li);
    });
    return ul;
  }

  function section(title, intro, list) {
    var wrap = el('div', {}, [el('h3', { text: title })]);
    if (intro) wrap.appendChild(el('p', { 'class': 'small', text: intro }));
    wrap.appendChild(list);
    return wrap;
  }

  function plural(n, one, many) { return n + ' ' + (n === 1 ? one : many); }

  function render(r) {
    out.textContent = '';
    var s = r.summary;
    out.appendChild(el('h2', { text: 'Your keyword overlap' }));

    if (s.total === 0) {
      out.appendChild(el('p', { text: 'No distinct key terms came out of that posting. Paste the whole posting, including the requirements section, and try again.' }));
    } else {
      out.appendChild(el('p', { 'class': 'scoreline', text: s.found + ' of ' + plural(s.total, 'key term', 'key terms') + ' from the posting appear in your resume.' }));
      out.appendChild(el('p', { 'class': 'small', text: (s.partial === 1 ? '1 more is close' : s.partial + ' more are close') + ' (the words are there, not as that phrase) and ' + s.missing + (s.missing === 1 ? ' does not appear.' : ' do not appear.') + ' This counts words and phrases. It is not an applicant tracking system score and it cannot tell you how any employer\u2019s software will treat your resume.' }));
    }

    if (r.title && r.title.words.length) {
      var yes = r.title.words.filter(function (w) { return w.found; }).map(function (w) { return w.term; });
      var no = r.title.words.filter(function (w) { return !w.found; }).map(function (w) { return w.term; });
      out.appendChild(el('p', { text: 'First line of the posting (probably the job title): \u201c' + r.title.text + '\u201d. ' +
        (yes.length ? 'Your resume uses: ' + yes.join(', ') + '. ' : '') + (no.length ? 'Not in your resume: ' + no.join(', ') + '.' : '') }));
    }

    var found = r.terms.filter(function (t) { return t.status === 'found'; });
    var partial = r.terms.filter(function (t) { return t.status === 'partial'; });
    var missing = r.terms.filter(function (t) { return t.status === 'missing'; });

    if (found.length) {
      out.appendChild(section('In your resume', '', chips('found', found, function (t) {
        return t.matchedAs ? '(as \u201c' + t.matchedAs + '\u201d)' : '';
      })));
    }
    if (partial.length) {
      out.appendChild(section('Close, check your wording', 'Every word of the phrase appears somewhere in your resume, but not together.', chips('partial', partial, function () { return ''; })));
    }
    if (missing.length) {
      out.appendChild(section('Not in your resume', 'Add one only if it is true for you and you can back it up in an interview. Skip the rest.', chips('missing', missing, function (t) {
        return t.inRequirements ? '(listed under requirements)' : t.count > 1 ? '(mentioned ' + t.count + ' times)' : '';
      })));
    }

    out.appendChild(el('h2', { text: 'Format checks' }));
    out.appendChild(el('p', { 'class': 'small', text: 'These read the pasted text only. Tables, columns, headers, footers and images do not survive a paste, so check the file itself as well.' }));
    var ul = el('ul', { 'class': 'checks' });
    var label = { ok: 'Fine', note: 'Note', warn: 'Check' };
    r.format.checks.forEach(function (c) {
      ul.appendChild(el('li', {}, [
        el('span', { 'class': 'st ' + c.status, text: label[c.status] }),
        el('span', {}, [el('strong', { text: c.label + '. ' }), c.detail])
      ]));
    });
    out.appendChild(ul);

    out.hidden = false;
    out.setAttribute('tabindex', '-1');
    out.focus({ preventScroll: false });
  }

  function run() {
    errorBox.textContent = '';
    try {
      render(A.analyze(resumeBox.value, postingBox.value));
    } catch (e) {
      out.hidden = true;
      if (e instanceof A.AtsInputError) {
        errorBox.textContent = e.message;
      } else {
        errorBox.textContent = 'Something went wrong while reading the text. Reload the page and try again.';
        if (window.console) console.error(e);
      }
    }
  }

  $('run').addEventListener('click', run);
  $('sample').addEventListener('click', function () {
    resumeBox.value = SAMPLE_RESUME;
    postingBox.value = SAMPLE_POSTING;
    run();
  });
  $('clear').addEventListener('click', function () {
    resumeBox.value = '';
    postingBox.value = '';
    errorBox.textContent = '';
    out.textContent = '';
    out.hidden = true;
    resumeBox.focus();
  });
})();
