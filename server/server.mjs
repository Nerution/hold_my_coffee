// Good Things news server: serves the app and a small JSON API.
//   GET  /api/stories   current stories (refreshes first if the cache is older than REFRESH_MINUTES)
//   POST /api/refresh   fetch the feeds again now (at most once per MIN_REFRESH_SECONDS)
import http from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { collect, loadCache, saveCache } from "./news.mjs";
import { aiEnabled, MODEL } from "./classify.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const APP_DIR = path.resolve(here, "..");
const PORT = +(process.env.PORT || 8787);
const REFRESH_MINUTES = +(process.env.GOOD_THINGS_REFRESH_MINUTES || 30);
const MIN_REFRESH_SECONDS = +(process.env.GOOD_THINGS_MIN_REFRESH_SECONDS || 60);
const STATIC = { "/": ["index.html", "text/html; charset=utf-8"], "/index.html": ["index.html", "text/html; charset=utf-8"], "/i18n.js": ["i18n.js", "text/javascript; charset=utf-8"] };

let data = await loadCache();
let running = null;

function refresh(reason) {
  if (running) return running;
  const started = Date.now();
  console.log(`refreshing (${reason})…`);
  running = collect({ previous: data })
    .then(async next => {
      data = next;
      await saveCache(next);
      const ok = next.sources.filter(s => s.ok).length;
      console.log(`refreshed in ${((Date.now() - started) / 1000).toFixed(1)}s: ${next.stories.length} stories from ${ok}/${next.sources.length} feeds${next.ai ? `, reviewed by ${next.ai}` : ", heuristic filter only"}`);
      return next;
    })
    .catch(err => { console.error("refresh failed:", err); return data; })
    .finally(() => { running = null; });
  return running;
}

const age = () => (data ? (Date.now() - Date.parse(data.updatedAt)) / 1000 : Infinity);
const publicView = (d, extra = {}) => d
  ? { updatedAt: d.updatedAt, ai: d.ai, windowDays: d.windowDays, sources: d.sources.map(({ source, ok, candidates, error }) => ({ source, ok, candidates, error })), stories: d.stories, ...extra }
  : { updatedAt: null, ai: null, sources: [], stories: [], ...extra };

function send(res, code, body, type = "application/json; charset=utf-8") {
  // The API is readable from any page, so the app also works when it is opened as a file or from another local server.
  res.writeHead(code, { "content-type": type, "cache-control": "no-store", "x-content-type-options": "nosniff", "access-control-allow-origin": "*", "access-control-allow-methods": "GET, POST, OPTIONS", "access-control-allow-headers": "accept, content-type" });
  res.end(typeof body === "string" || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  try {
    if (req.method === "OPTIONS" && url.pathname.startsWith("/api/")) return send(res, 204, "");
    if (url.pathname === "/api/stories" && req.method === "GET") {
      if (!data) await refresh("first request");
      else if (age() > REFRESH_MINUTES * 60) refresh("cache older than " + REFRESH_MINUTES + " min"); // answer now, update in the background
      return send(res, 200, publicView(data, { refreshing: Boolean(running) }));
    }
    if (url.pathname === "/api/refresh" && req.method === "POST") {
      if (age() < MIN_REFRESH_SECONDS && !running) return send(res, 200, publicView(data, { throttled: true, retryAfter: Math.ceil(MIN_REFRESH_SECONDS - age()) }));
      await refresh("requested by the app");
      return send(res, 200, publicView(data));
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
  console.log(aiEnabled() ? `AI review on (${MODEL}). Only links not reviewed before are sent to the model.` : "AI review off: set ANTHROPIC_API_KEY to turn on AI filtering and summaries. Using the heuristic filter.");
  if (!data || age() > REFRESH_MINUTES * 60) refresh("startup");
});
setInterval(() => refresh("scheduled"), REFRESH_MINUTES * 60 * 1000).unref();
