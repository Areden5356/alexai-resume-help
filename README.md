# AlexAI Resume Help (static site)

Plain HTML, CSS and JavaScript. No build step, no dependencies, no third-party requests.
All links are relative, so it works at any base path. Status: published at https://areden5356.github.io/alexai-resume-help/

## Run and test

    python -m http.server 8000        # then open http://127.0.0.1:8000/
    node --test tests/analyzer.test.js tests/letter.test.js tests/links.test.js tests/site.test.js

Node 22 or newer. The tests cover the keyword check logic (`ats-check/analyzer.js`), the cover letter
checks (`cover-letter-check/checker.js`), a link checker (`tests/links.test.js`) and
site integrity: links, titles, descriptions, the Stripe link, no emails in source, no
trackers or storage APIs, FAQ markup matching the visible FAQ, guide word counts, color
contrast, and `set_base_url.py`.

## Base URL

The site is published, and canonical tags, `sitemap.xml` and `robots.txt` carry
`https://areden5356.github.io/alexai-resume-help`. To move it, use `set_base_url.py`:

    python set_base_url.py https://new.example --old https://areden5356.github.io/alexai-resume-help

## Things the owner decides

Refund wording, the 30 day deletion promise, the one-posting-per-pack rule and who the AI
provider is named as are written into `index.html`, `terms.html` and `privacy.html`.
Change the text there if the practice changes. The contact address is assembled in
`assets/site.js`.
