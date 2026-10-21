# AlexAI Resume Help (static site)

Plain HTML, CSS and JavaScript. No build step, no dependencies, no third-party requests.
All links are relative, so it works at any base path. Status: published at https://areden5356.github.io/alexai-resume-help/

## Run and test

    python -m http.server 8000        # then open http://127.0.0.1:8000/
    node --test tests/analyzer.test.js tests/letter.test.js tests/bullets.test.js tests/links.test.js tests/a11y.test.js tests/site.test.js

Node 22 or newer. The tests cover the keyword check logic (`ats-check/analyzer.js`), the cover
letter checks (`cover-letter-check/checker.js`), the bullet checks (`bullet-check/checker.js`), a link
checker (`tests/links.test.js`), accessibility basics (`tests/a11y.test.js`) and site integrity: links,
titles, descriptions, the Stripe link, no emails in source, no trackers or storage APIs, FAQ markup
matching the visible FAQ, guide word counts and dates, and `set_base_url.py`.

## What is here

- Three free tools, each pure JavaScript that runs in the browser and is tested under node:
  `ats-check/` (keyword overlap), `cover-letter-check/` (nine labelled heuristics) and
  `bullet-check/` (five labelled heuristics per resume bullet: opening verb, number or outcome,
  length, vague words, tense). Every rule shows a "How this rule works" explanation.
- 17 guides in `guides/`, grouped by job stage on `guides/index.html`. Each shows an "Updated" date
  in a `<p class="meta">` line, and the index card must show the same date (the link test checks it).
  When you edit a guide, change both dates and `lastmod` in `sitemap.xml`.
- Adding a page: add it to the sitemap, to the guides index (if a guide), to the expected page list in
  `tests/site.test.js`, and link it from at least one other page. Guides need a related-guides list, a
  sources list, and examples wrapped in the "invented for illustration" label. External links are limited to
  the hosts listed in `SOURCE_HOSTS` in `tests/site.test.js`; add a host there only for a source you have read.
- Accessibility: `tests/a11y.test.js` checks lang, one h1, one main, alt text, labelled controls, link
  names, a visible focus style, and contrast ratios for every color token pair in light and dark. It
  prints the ratios. It does not replace a keyboard and screen reader pass.

## Base URL

The site is published, and canonical tags, `sitemap.xml` and `robots.txt` carry
`https://areden5356.github.io/alexai-resume-help`. To move it, use `set_base_url.py`:

    python set_base_url.py https://new.example --old https://areden5356.github.io/alexai-resume-help

## Things the owner decides

Refund wording, the 30 day deletion promise, the one-posting-per-pack rule and who the AI
provider is named as are written into `index.html`, `terms.html` and `privacy.html`.
Change the text there if the practice changes. The contact address is assembled in
`assets/site.js`.
