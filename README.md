# Suspiciously positive prototype

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

Only stories the model hasn't seen before are sent, so a refresh with no new stories costs nothing. The default model is `claude-opus-5-5` at low effort; set `GOOD_THINGS_MODEL` to use another.

### Translation

Live stories arrive in English or Polish. Each story is shown as published to readers of its own language, and translated for everyone else (English, Polish, German or Spanish):

- **What happens:** the server translates the headline, the card summary and the article text in the background, and the home screen shows progress.
- **Which stories a reader sees:** Personalisation → "Stories originally in" (English / Polski). By default Polish readers get both, and everyone else gets English-language stories. Anyone can add Polish stories, which are then translated for them.
- **Once per story:** each story is translated once per language and kept in the cache.
- **Ahead of time:** new stories are translated in advance for languages people have used.

`GOOD_THINGS_TRANSLATOR` chooses how:

- `google` (default) uses Google Translate's free web endpoint: no API key, no tokens. It is an unofficial endpoint, so Google can refuse requests when there are a lot of them. The server then pauses Google translation for 30 minutes.
- `claude` uses Claude (needs `ANTHROPIC_API_KEY`). The translations are more natural, but they cost tokens.
- `off` turns server translation off.

When the server can't translate, the app uses the browser's built-in translator if there is one (Chrome and Edge 138 or newer, on a computer). If not, the story stays in English with a note. Each article says how it was translated. The interface and the sample stories are always translated.

### Other ways to open the app

You don't need a second window for the app: the news server already serves it at http://localhost:8787.

If you open `index.html` directly, or serve the folder with another static server, the app looks for the news server at http://localhost:8787. If the news server is running, live news and Refresh work as usual. If it isn't, the app shows the bundled sample stories and the home screen says "news server not found".

## Mobile app (Android and iOS)

The repository is also a [Capacitor](https://capacitorjs.com) project. The app's files are bundled inside the Android and iOS apps, which add native features:

- reminders for the daily digest;
- the system share sheet;
- offline reading;
- an optional Face ID or fingerprint lock;
- a home-screen widget.

Settings and saved stories are kept on the phone.

    npm install
    GOOD_THINGS_API_URL=https://your-news-server.example npm run sync
    npm run android      # opens Android Studio
    npm run ios          # opens Xcode (on a Mac)

The app needs the news server hosted over HTTPS; `render.yaml` sets it up on Render. [docs/STORE-RELEASE.md](docs/STORE-RELEASE.md) covers the rest:

- signing the builds;
- the iOS widget;
- the privacy policy (`privacy.html`, also served at `/privacy.html`);
- the answers for Apple's App Privacy and Google's Data safety forms;
- what store review will look at.

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
| `GOOD_THINGS_MAX_STORIES` | `200` | Most stories kept at once |
| `GOOD_THINGS_TRANSLATOR` | `google` | `google`, `claude` or `off` |
| `GOOD_THINGS_SEARCH` | on | Set to `off` to skip the Google News searches |
| `GOOD_THINGS_FEEDS` | built-in list | Path to a JSON file with your own feed list |
| `GOOD_THINGS_CACHE` | `server/data/cache.json` | Where the last result is stored |

## Where the news comes from

The sources are listed in `server/feeds.mjs`: 57 outlet feeds (12 of them Polish) and 30 Google News searches (10 of them Polish). There are three kinds:

- **Positive outlets** such as Positive News, Good News Network, Reasons to be Cheerful, The Optimist Daily, YES! Magazine, The Better India, Shareable, Anthropocene Magazine and the Guardian's "The Upside". Their stories are kept unless they read as clearly negative.
- **General, science and specialist outlets.** Only stories with a clear positive development and no negative signal pass. With AI review on, the model makes the final call. They include:
  - environment and conservation magazines: Mongabay, Yale e360, Ensia, Grist, Hakai, The Revelator, Carbon Brief, Rewilding Europe and others;
  - science, health and space: ScienceDaily, Phys.org, Medical Xpress, Science News, Quanta, New Atlas, MIT News, The Conversation, NIH, NASA, ESA and others;
  - education and culture: The Hechinger Report, Hyperallergic, Colossal;
  - world and regional news in English: UN News, Al Jazeera, DW, ABC Australia, CBC, RNZ, Notes from Poland, BBC and NPR.
- **Polish outlets, in Polish:**
  - science: Nauka w Polsce (PAP), Crazy Nauka;
  - environment and energy: SmogLab, Gramwzielone.pl, WysokieNapiecie.pl;
  - technology and business: Spider's Web, Bankier.pl;
  - general news: OKO.press, RMF24, TVN24, Polsat News, Gazeta.pl.

  They are filtered with Polish rules, written as word beginnings so that endings like *uratowali / uratowała* still match. There are also Polish clickbait patterns (*nie uwierzysz…*, *szok*) and Polish place names for the map (*w Polsce*, *Warszawa*, *Tatry*, *Niemcy*…).
- **Google News searches.** Ten topic searches (wildlife recovery, medical progress, clean energy records, restoration, community help and more) and one broad good-news search in each of ten country editions (UK, India, Australia, Canada, Ireland, Kenya, Nigeria, South Africa, the Philippines, Singapore). Ten more searches run in the Polish edition, in Polish. They cover good news (*dobre wiadomości*), species returning, nature protection, medicine, Polish scientists, renewable energy records, falling unemployment or accidents, volunteers, rescues, and pupils' successes.
  - These reach thousands of outlets, including small local papers, and each story is credited to the outlet that published it.
  - Search results give only a headline, so only headlines with a positive signal and no negative one are kept. The article page says so and links to the full story.

`BLOCKED_SOURCES` in the same file lists outlets that are never shown, even when a search finds them: tabloids flagged by reliability reviews, and press-release wires. Add names there to exclude more.

### Checking the feeds

Websites move or drop their feeds, so check the list now and then:

    cd server
    npm run check-feeds

It prints each feed and search with:

- whether it answered;
- how many items it has;
- how many are recent;
- how many pass the positive filter;
- when its newest item was published.

Remove failed feeds from `feeds.mjs`, or fix their addresses. To add an outlet, find its RSS or Atom feed (often at `/feed/` or `/rss`) and add one line: `feed(...)` for English and `pl(...)` for Polish. Set `GOOD_THINGS_SEARCH=off` to turn the Google News searches off.

Every story links to the original article. When several outlets report the same event, the earliest report leads and the others appear under "Also reported by".

What the server never does:

- It never writes a story of its own.
- The AI summary may use only facts from the publisher's text.
- Without AI, the app shows the publisher's description and says it is not an AI summary.

## Files

- `index.html`: styles, markup and the app script.
- `privacy.html`: the privacy policy, bundled in the app and served by the news server.
- `src/native.js`: the bridge to the phone (storage, share, reminders, app lock, widget, offline pictures), bundled into the mobile app.
- `scripts/build-web.mjs`: builds `www/`, the folder bundled into the mobile app.
- `capacitor.config.json`, `android/`, `ios/`, `assets/`: the Capacitor project, native projects and icon sources.
- `render.yaml`: hosting the news server on Render.
- `i18n.js`: translations (Polish, German, Spanish) for the interface and the sample stories. English lives in `index.html`.
- `server/server.mjs`: the HTTP server. It serves the app, `GET /api/stories` and `POST /api/refresh`.
- `server/news.mjs`: collects the feeds, filters, reviews, groups and caches stories.
- `server/lib.mjs`: feed parsing (RSS and Atom), the keyword filter, the topic and country guesses, and duplicate grouping.
- `server/classify.mjs`: the optional Claude review.
- `server/translate.mjs`: translation with Google Translate or Claude, cached per story and language.
- `server/check-feeds.mjs`: the feed check (`npm run check-feeds`).
- `server/test/`: tests that use made-up test feeds and a fake translator. Run them with `npm test` in `server/`.

## How the script in index.html is organised

- `STORIES`: the sample stories. When the server answers, `applyLive()` replaces them with live ones. Stories that drop out stay findable in `ARCHIVE`, so saved items keep working.
- `loadLive(force)`: loads `/api/stories`, or calls `/api/refresh` when the reader taps Refresh.
- `S`: all app state (preferences, saved collections, reading history). It is kept in memory only and resets on reload.
- `ranked()`: feed ordering. Chosen topics, followed sources and chosen regions lift a story. Newer stories and stories confirmed by several outlets weigh a little more. One story from outside the chosen topics is moved into the first few.
- `V`: one function per screen, each returning an HTML string.
- `brunoFace()`, `brunoLines()`, `brunoContext()` and `renderBruno()`: Bruno, the grumpy badger, a small assistant in the corner of the screen.
  - **Where he sits:** bottom right above the tab bar, or top right on screens without it, so he never covers their buttons.
  - **When he speaks:** one bubble per screen visit, shown on arrival, on every article and Daily Dose story, at the end of the dose, when the reader is caught up, at the end of onboarding, and once per session on the home screen. The bubble holds his whole comment, the gloomy line then the grudging one, and his frown turns into a smile. It closes by itself after 6 to 13 seconds, depending on length. Background updates, such as stories loading, translations or refreshes, never start a new bubble.
  - **Tapping:** tapping the bubble, the × or anywhere else closes it. Tapping Bruno brings the comment back, or on other screens gives a short grumble.
  - **His lines** are fixed and translated in `i18n.js`. They are picked per story from its impact tag, with a gentler line for serious subjects.
  - **Turning him off:** in Personalisation.
- `ask()` and `V.assistant`: the AI assistant preview. It only retrieves stories already loaded, and says so when nothing matches.
- `A`: one function per action. Clicks are routed by the `data-a` attribute on the clicked element.
- `t(key, ...args)`: interface text. The English string is the key; `st(story, field)` does the same for story text.

## Known limits

- **Feeds not checked from here:** the feed addresses were not checked from the build environment, so some may be wrong or moved. Run `npm run check-feeds` to see which work.
- **Keyword filter:** without AI review, the filter can let through a story that isn't really positive, and can drop one that is.
- **Google translation may be refused:** the free Google endpoint is unofficial and can stop answering for a while. A public release would need the paid Google Cloud Translation API or another service.
- **Unreviewed translations:** the interface translations were written by AI and haven't been checked by native speakers.
- **Images:** pictures are loaded straight from the publishers' feeds. A public release needs image rights and the outlets' terms of use checked.
- **Settings on one device only:** settings and saved stories are kept on each device (in the app, or in the browser's local storage). There are no accounts, so nothing syncs between devices.
- **Native builds not compiled yet:** the Android and iOS projects were generated and synced, but not compiled in the build environment, which has neither the Android SDK nor Xcode. The first build in Android Studio and Xcode may need small fixes.
- **Assistant:** it matches keywords in place of a language model.
