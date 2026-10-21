/* Shared behavior: assemble the public contact address in the browser.
   The address is built here from parts so it is not present as plain text in
   the HTML source. Without JavaScript, pages show a readable fallback. */
(function () {
  'use strict';
  var parts = { user: ['a.eden', '+orders'], host: ['steelcloudsolutions', 'com'] };
  var address = parts.user.join('') + String.fromCharCode(64) + parts.host.join('.');

  var spots = document.querySelectorAll('[data-mail]');
  for (var i = 0; i < spots.length; i++) {
    var spot = spots[i];
    var link = document.createElement('a');
    var subject = spot.getAttribute('data-mail-subject');
    link.href = 'mailto:' + address + (subject ? '?subject=' + encodeURIComponent(subject) : '');
    link.textContent = address;
    spot.replaceWith(link);
  }
})();
