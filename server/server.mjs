// Good Things news server: serves the app and a small JSON API.
//   GET  /api/stories   current stories (refreshes first if the cache is older than REFRESH_MINUTES)
//   POST /api/refresh   fetch the feeds again now (at most once per MIN_REFRESH_SECONDS)
// Both take ?lang=pl|de|es. Stories then carry `tr: {lang: {...}}` once translated;
// missing translations are made in the background and `translating: true` says so.
import http from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { collect, loadCache, saveCache } from "./news.mjs";
import { aiEnabled, MODEL } from "./classify.mjs";
import { createTranslator, LANGS } from "./translate.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const APP_DIR = path.resolve(here, "..");
const PORT = +(process.env.PORT || 8787);
const REFRESH_MINUTES = +(process.env.GOOD_THINGS_REFRESH_MINUTES || 30);
const MIN_REFRESH_SECONDS = +(process.env.GOOD_THINGS_MIN_REFRESH_SECONDS || 60);
const STATIC = { "/": ["index.html", "text/html; charset=utf-8"], "/index.html": ["index.html", "text/html; charset=utf-8"], "/i18n.js": ["i18n.js", "text/javascript; charset=utf-8"] };

let data = await loadCache();
let running = null;
const translations = createTranslator({ store: data?.translations || {}, onUpdate: () => data && saveCache({ ...data, translations: translations.store }) });
const wantedLangs = new Set(data?.langs || []);

function refresh(reason) {
  if (running) return running;
  const started = Date.now();
  console.log(`refreshing (${reason})…`);
  running = collect({ previous: data })
    .then(async next => {
      translations.prune(new Set(next.stories.map(s => s.id)));
      data = { ...next, langs: [...wantedLangs] };
      await saveCache({ ...data, translations: translations.store });
      for (const lang of wantedLangs) translations.ensure(data.stories, lang); // translate new stories ahead of time
      const ok = next.sources.filter(s => s.ok).length;
      console.log(`refreshed in ${((Date.now() - started) / 1000).toFixed(1)}s: ${next.stories.length} stories from ${ok}/${next.sources.length} feeds${next.ai ? `, reviewed by ${next.ai}` : ", heuristic filter only"}`);
      return next;
    })
    .catch(err => { console.error("refresh failed:", err); return data; })
    .finally(() => { running = null; });
  return running;
}

const age = () => (data ? (Date.now() - Date.parse(data.updatedAt)) / 1000 : Infinity);
function publicView(d, lang, extra = {}) {
  if (!d) return { updatedAt: null, ai: null, sources: [], stories: [], ...extra };
  let stories = d.stories, translation = null;
  if (translations.supported(lang)) {
    if (!wantedLangs.has(lang)) { wantedLangs.add(lang); data.langs = [...wantedLangs]; }
    translations.ensure(stories, lang);
    stories = translations.attach(stories, lang);
    translation = { lang, available: aiEnabled(), translating: translations.pending(lang), done: stories.filter(s => s.tr).length, total: stories.length };
  }
  return { updatedAt: d.updatedAt, ai: d.ai, windowDays: d.windowDays, sources: d.sources.map(({ source, ok, candidates, error }) => ({ source, ok, candidates, error })), stories, translation, ...extra };
}

function send(res, code, body, type = "application/json; charset=utf-8") {
  // The API is readable from any page, so the app also works when it is opened as a file or from another local server.
  res.writeHead(code, { "content-type": type, "cache-control": "no-store", "x-content-type-options": "nosniff", "access-control-allow-origin": "*", "access-control-allow-methods": "GET, POST, OPTIONS", "access-control-allow-headers": "accept, content-type" });
  res.end(typeof body === "string" || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  const lang = url.searchParams.get("lang") || "en";
  try {
    if (req.method === "OPTIONS" && url.pathname.startsWith("/api/")) return send(res, 204, "");
    if (url.pathname === "/api/stories" && req.method === "GET") {
      if (!data) await refresh("first request");
      else if (age() > REFRESH_MINUTES * 60) refresh("cache older than " + REFRESH_MINUTES + " min"); // answer now, update in the background
      return send(res, 200, publicView(data, lang, { refreshing: Boolean(running) }));
    }
    if (url.pathname === "/api/refresh" && req.method === "POST") {
      if (age() < MIN_REFRESH_SECONDS && !running) return send(res, 200, publicView(data, lang, { throttled: true, retryAfter: Math.ceil(MIN_REFRESH_SECONDS - age()) }));
      await refresh("requested by the app");
      return send(res, 200, publicView(data, lang));
    }
    const file = STATIC[url.pathname];
    if (file && req.method === "GET") return send(res, 200, await readFile(path.join(APP_DIR, file[0])), file[1]);
    send(res, 404, { error: "not found" });
  } catch (err) {
    console.error(err);
    send(res, 500, { error: "server error" });
  }
});

server.listen(PORT, () => {
  console.log(`Good Things running at http://localhost:${PORT}`);
  console.log(aiEnabled()
    ? `AI review and translation on (${MODEL}). Only stories not seen before are sent to the model.`
    : "AI review off: set ANTHROPIC_API_KEY to turn on AI filtering, summaries and translation into " + Object.values(LANGS).join(", ") + ". Using the heuristic filter.");
  if (!data || age() > REFRESH_MINUTES * 60) refresh("startup");
});
setInterval(() => refresh("scheduled"), REFRESH_MINUTES * 60 * 1000).unref();
