# Good Things prototype

Clickable prototype of a positive-news mobile app. The app is plain HTML, CSS and JavaScript with no build step. A small Node server in `server/` collects live news from real outlets, keeps the positive and constructive stories, and serves them to the app.

## Run it with live news

You need Node.js 20 or newer.

    cd server
    npm install
    npm start

Then open http://localhost:8787. On first start the server reads every feed, which takes a few seconds. After that:

- The app shows "Live from N outlets · updated X ago" on the home screen. **Refresh** fetches the feeds again.
- The server also refreshes on its own every 30 minutes, and keeps its last result in `server/data/cache.json` so a restart is instant.

### Turn on AI review (recommended)

Without credentials the server uses a keyword filter. It is fast and free, but it makes mistakes, and articles show the publisher's own description instead of an AI summary. With credentials, Claude reviews each new story:

- **The decision:** is it genuinely positive, or misleading, or does the headline match the text?
- **Labels:** the category, impact tag, country and moods.
- **The summary:** "What happened / Why it matters / The bigger picture", written only from the publisher's text.

To turn it on:

    export ANTHROPIC_API_KEY=your-key
    npm start

It also translates live stories into Polish, German and Spanish. When a reader picks one of those languages, the server translates the headline, card summary and article text in the background. The app shows progress on the home screen. Each story is translated once per language and kept in the cache, and new stories are translated ahead of time for languages people have used.

Only stories the model hasn't seen before are sent, so a refresh with no new stories costs nothing. The default model is `claude-opus-5-5` at low effort; set `GOOD_THINGS_MODEL` to use another.

### Translation without an API key

Without AI on the server, the app uses the browser's built-in translator when there is one: Chrome and Edge 138 or newer, on a computer. Translation then happens on the reader's device, and the article says so. Chrome may download the language pack the first time.

In other browsers, live stories stay in English with a note explaining why. The interface and the sample stories are always translated.

### Other ways to open the app

You don't need a second window for the app: the news server already serves it at http://localhost:8787.

If you open `index.html` directly, or serve the folder with another static server, the app looks for the news server at http://localhost:8787. If the news server is running, live news and Refresh work as usual. If it isn't, the app shows the bundled sample stories and the home screen says "news server not found".

## Settings

| Variable | Default | What it does |
| --- | --- | --- |
| `PORT` | `8787` | Port the server listens on |
| `ANTHROPIC_API_KEY` | none | Turns on AI review and summaries |
| `GOOD_THINGS_AI` | on | Set to `off` to keep AI review off even with a key |
| `GOOD_THINGS_MODEL` | `claude-opus-5-5` | Model used for AI review |
| `GOOD_THINGS_REFRESH_MINUTES` | `30` | Automatic refresh interval |
| `GOOD_THINGS_MIN_REFRESH_SECONDS` | `60` | Shortest gap between refreshes asked for from the app |
| `GOOD_THINGS_MAX_AGE_DAYS` | `10` | Ignore stories older than this |
| `GOOD_THINGS_MAX_STORIES` | `120` | Most stories kept at once |
| `GOOD_THINGS_FEEDS` | built-in list | Path to a JSON file with your own feed list |
| `GOOD_THINGS_CACHE` | `server/data/cache.json` | Where the last result is stored |

## Where the news comes from

The outlets are listed in `server/feeds.mjs`. There are two kinds:

- **Positive outlets** such as Positive News, Good News Network, Reasons to be Cheerful, The Optimist Daily and the Guardian's "The Upside". Their stories are kept unless they read as clearly negative.
- **General and science outlets** such as BBC News, the Guardian's environment section, ScienceDaily, NASA, Mongabay, Yale Environment 360, NPR and Smithsonian. Only stories with a clear positive development and no negative signal pass. With AI review on, the model makes the final call.

Every story links to the original article. When several outlets report the same event, the earliest report leads and the others appear under "Also reported by".

What the server never does:

- It never writes a story of its own.
- The AI summary may use only facts from the publisher's text.
- Without AI, the app shows the publisher's description and says it is not an AI summary.

## Files

- `index.html`: styles, markup and the app script.
- `i18n.js`: translations (Polish, German, Spanish) for the interface and the sample stories. English lives in `index.html`.
- `server/server.mjs`: the HTTP server. It serves the app, `GET /api/stories` and `POST /api/refresh`.
- `server/news.mjs`: collects the feeds, filters, reviews, groups and caches stories.
- `server/lib.mjs`: feed parsing (RSS and Atom), the keyword filter, the topic and country guesses, and duplicate grouping.
- `server/classify.mjs`: the optional Claude review.
- `server/translate.mjs`: the optional Claude translation, cached per story and language.
- `server/test/`: tests that use made-up test feeds and a fake translator. Run them with `npm test` in `server/`.

## How the script in index.html is organised

- `STORIES`: the sample stories. When the server answers, `applyLive()` replaces them with live ones. Stories that drop out stay findable in `ARCHIVE`, so saved items keep working.
- `loadLive(force)`: loads `/api/stories`, or calls `/api/refresh` when the reader taps Refresh.
- `S`: all app state (preferences, saved collections, reading history). It is kept in memory only and resets on reload.
- `ranked()`: feed ordering. Chosen topics, followed sources and chosen regions lift a story. Newer stories and stories confirmed by several outlets weigh a little more. One story from outside the chosen topics is moved into the first few.
- `V`: one function per screen, each returning an HTML string.
- `ask()` and `V.assistant`: the AI assistant preview. It only retrieves stories already loaded, and says so when nothing matches.
- `A`: one function per action. Clicks are routed by the `data-a` attribute on the clicked element.
- `t(key, ...args)`: interface text. The English string is the key; `st(story, field)` does the same for story text.

## Known limits

- **Not run against real feeds yet.** The feed reader was tested with made-up test feeds only. Real feeds can differ, so watch the server log on first run.
- **Keyword filter:** without AI review, the filter can let through a story that isn't really positive, and can drop one that is.
- **Translation needs AI or a capable browser:** without either, live stories stay in English.
- **Unreviewed translations:** the interface translations were written by AI and haven't been checked by native speakers.
- **Images:** pictures are loaded straight from the publishers' feeds. A public release needs image rights and the outlets' terms of use checked.
- **No database:** saved stories and preferences are kept in memory only.
- **Assistant:** it matches keywords in place of a language model.
