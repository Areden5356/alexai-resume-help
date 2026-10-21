/* UI for the bullet check. All work happens in this page.
   Nothing is sent anywhere and nothing is stored. */
(function () {
  'use strict';
  var B = window.BulletChecker;

  // Invented sample. The club, the store and the numbers are made up.
  var SAMPLE = [
    '- Responsible for various tasks in the campus bookstore',
    '- Restocked 12 shelves each shift and counted the register drawer at close',
    '- Helped with the club newsletter',
    '- Organize the spring book sale and trained three new volunteers',
    '- Wrote the weekly email to 250 members of the reading club'
  ].join('\n');

  var $ = function (id) { return document.getElementById(id); };
  var box = $('bullets');
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

  function render(r) {
    out.textContent = '';
    var s = r.summary;
    out.appendChild(el('h2', { text: 'Results' }));
    out.appendChild(el('p', { 'class': 'scoreline', text: r.stats.bullets + (r.stats.bullets === 1 ? ' bullet: ' : ' bullets: ') + s.ok + ' fine, ' + s.note + ' to look at, ' + s.warn + ' to check.' }));
    var intro = 'Five heuristic checks per bullet. They are rules of thumb, not a grade, and they say nothing about whether a bullet is true or how an employer will read it.';
    if (r.tense.mixed) {
      intro += ' Tense: ' + r.tense.past + ' past and ' + r.tense.present + ' present' +
        (r.tense.majority ? ', so the ' + r.tense.majority + ' tense is the majority.' : ', with no majority, so no bullet is flagged.');
    }
    out.appendChild(el('p', { 'class': 'small', text: intro }));

    var label = { ok: 'Fine', note: 'Look', warn: 'Check', na: 'n/a' };
    r.bullets.forEach(function (b, i) {
      var card = el('div', { 'class': 'bullet-card' });
      card.appendChild(el('h3', { text: 'Bullet ' + (i + 1) }));
      card.appendChild(el('p', { 'class': 'bullet-text', text: b.text }));
      card.appendChild(el('p', { 'class': 'score', text: b.passed + ' of ' + b.applicable + ' checks fine, ' + b.words + ' words' }));
      var ul = el('ul', { 'class': 'checks' });
      b.checks.forEach(function (c) {
        var body = el('span', {}, [el('strong', { text: c.label + '. ' }), c.detail, el('span', { 'class': 'small' }, [' (heuristic)'])]);
        var how = el('details', {}, [el('summary', { text: 'How this rule works' }), el('p', { text: c.explain })]);
        ul.appendChild(el('li', {}, [el('span', { 'class': 'st ' + c.status, text: label[c.status] }), el('div', {}, [body, how])]));
      });
      card.appendChild(ul);
      out.appendChild(card);
    });

    out.hidden = false;
    out.setAttribute('tabindex', '-1');
    out.focus({ preventScroll: false });
  }

  function run() {
    errorBox.textContent = '';
    try {
      render(B.analyze({ text: box.value }));
    } catch (e) {
      out.hidden = true;
      if (e instanceof B.InputError) {
        errorBox.textContent = e.message;
      } else {
        errorBox.textContent = 'Something went wrong while reading the text. Reload the page and try again.';
        if (window.console) console.error(e);
      }
    }
  }

  $('run').addEventListener('click', run);
  $('sample').addEventListener('click', function () { box.value = SAMPLE; run(); });
  $('clear').addEventListener('click', function () {
    box.value = '';
    errorBox.textContent = '';
    out.textContent = '';
    out.hidden = true;
    box.focus();
  });
})();
