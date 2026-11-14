# Good Things prototype

Clickable prototype of a positive-news mobile app. Plain HTML, CSS and JavaScript, no build step and no dependencies apart from two Google Fonts.

## Run it

Keep `index.html` and `i18n.js` in the same folder and serve the folder, for example:

    python3 -m http.server 8000

Then open http://localhost:8000. Opening `index.html` directly from disk also works in most browsers.

## Files

- `index.html`: styles, markup and the app script.
- `i18n.js`: translations (Polish, German, Spanish) for the interface and the 16 story summaries. English lives in `index.html`.

## How the script in index.html is organised

- `STORIES`: the sample stories. Each one is real and carries its publisher, date and URL.
- `S`: all app state (preferences, saved collections, reading history). It is kept in memory only and resets on reload.
- `ranked()`: feed ordering. Chosen topics, followed sources and chosen regions lift a story; one story from outside the chosen topics is moved into the first few.
- `V`: one function per screen, each returning an HTML string.
- `A`: one function per action. Clicks are routed by the `data-a` attribute on the clicked element.
- `t(key, ...args)`: interface text. The English string is the key; `st(story, field)` does the same for story text.

## Adding a language

In `i18n.js`, add a column to every row of `R`, a block to `raw`, an entry in `langs`, and a stop-word list in `stop`. In `index.html`, add the locale code to `LOC`.

## Known limits

- Pictures are drawn SVG placeholders, not photography.
- Translations were written by AI and have not been reviewed by native speakers.
- Technology, Culture, Education, Sports and Business have no sample stories.
- The AI assistant from the brief is not built.
