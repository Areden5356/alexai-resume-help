# AlexAI Resume Help (static site)

Plain HTML, CSS and JavaScript. No build step, no dependencies, no third-party requests.
All links are relative, so it works at any base path. Status: published at https://areden5356.github.io/alexai-resume-help/

## Run and test

    python -m http.server 8000        # then open http://127.0.0.1:8000/
    node --test tests/analyzer.test.js tests/letter.test.js tests/bullets.test.js tests/links.test.js tests/a11y.test.js tests/site.test.js

Node 22 or newer. The tests cover the keyword check logic (`ats-check/analyzer.js`), the cover
letter checks (`cover-letter-check/checker.js`), the bullet checks (`bullet-check/checker.js`), a link
checker (`tests/links.test.js`), accessibility basics (`tests/a11y.test.js`) and site integrity: links,
titles, descriptions, the four Stripe links (the $39 pack and the three smaller offers), no emails in source, no trackers or storage APIs, FAQ markup
matching the visible FAQ, guide word counts and dates, and `set_base_url.py`.

## Design standards

Checked with `design_lint` (assistant-hub	ools\design_lint). Rules kept here: one primary button per
view, tokens for every color, two font families (serif and sans, no web fonts), two radius tokens
(`--radius-control`, `--radius-box`), no colored side bars, an SVG favicon plus apple-touch icon, and a
social image on every indexable page. `scripts/make_images.py` regenerates `assets/social.png` and
`assets/apple-touch-icon.png` (needs Pillow and the Windows fonts Georgia and Segoe UI); `assets/icon.svg`
is written by hand and the script draws the same shape. Every page except the 404 carries a content
security policy meta that allows only this site, so do not add inline styles, inline scripts or
third-party files without changing it and the test that guards it.

## What is here

- Three free tools, each pure JavaScript that runs in the browser and is tested under node:
  `ats-check/` (keyword overlap), `cover-letter-check/` (nine labelled heuristics) and
  `bullet-check/` (five labelled heuristics per resume bullet: opening verb, number or outcome,
  length, vague words, tense). Every rule shows a "How this rule works" explanation.
- `sample/index.html`: a fully invented sample of the $39 pack (posting, messy original, emailed facts,
  rewritten resume, cover letter, what changed and why, questions asked). Every block carries the
  "Example, invented for illustration" tag. `tests/site.test.js` checks that the rewrite and letter add
  no number, name or claim absent from the invented inputs, and contain no brackets. If you change the
  sample, keep it that way. It is linked from the nav and footer of every page, the paid section and the guides index.
- 20 guides in `guides/`, grouped by job stage on `guides/index.html`. Each shows an "Updated" date
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
