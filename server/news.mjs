import { readFile, writeFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { FEEDS, BLOCKED_SOURCES } from "./feeds.mjs";
import { parseFeed, stripOutlet, screen, classifyHeuristic, detectCountry, groupStories, storyId, truncate, GEO, CATEGORIES } from "./lib.mjs";
import { aiEnabled, reviewWithAI, MODEL } from "./classify.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const MAX_AGE_DAYS = +(process.env.GOOD_THINGS_MAX_AGE_DAYS || 10);
const MAX_STORIES = +(process.env.GOOD_THINGS_MAX_STORIES || 200);
const PARALLEL_FEEDS = 8;
const blocked = name => BLOCKED_SOURCES.some(b => name.toLowerCase() === b.toLowerCase() || name.toLowerCase().startsWith(b.toLowerCase() + " "));
async function eachLimited(list, n, fn) {
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, list.length) }, async () => { while (i < list.length) await fn(list[i++]); }));
}
const ART = { "Environment & Nature": "forest", Conservation: "forest", Animals: "ocean", Space: "space", "Health & Medicine": "lab", Science: "lab", Technology: "signal", Innovation: "energy", Education: "books", Culture: "gallery", Sports: "court", "Business & Economy": "market", "Local Communities": "town", "Humanity & Community": "town", "Inspiring People": "plains", World: "energy" };

async function fetchFeed(feed, timeoutMs = 12000) {
  if (feed.url.startsWith("file:")) return readFile(fileURLToPath(feed.url), "utf8");
  const res = await fetch(feed.url, {
    signal: AbortSignal.timeout(timeoutMs),
    headers: { "user-agent": "GoodThingsNewsReader/1.0 (+RSS reader)", accept: "application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9, */*;q=0.5" },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

/**
 * Builds a fresh story list from the feeds.
 * `previous` is the last result; its AI reviews are reused so only new links are sent to the model.
 */
export async function collect({ feeds = FEEDS, previous = null, now = Date.now(), log = console, ai = aiEnabled(), review = reviewWithAI } = {}) {
  const status = [];
  const seen = new Set(), candidates = [];
  await eachLimited(feeds, PARALLEL_FEEDS, async feed => {
    try {
      const items = parseFeed(await fetchFeed(feed));
      let kept = 0;
      for (const raw of items) {
        const search = feed.kind === "search";
        const source = (search && raw.outlet) || feed.source;
        if (blocked(source)) continue;
        // A search result's description only repeats the headline, so it is dropped.
        const it = search ? { ...raw, title: stripOutlet(raw.title, raw.outlet), description: "" } : raw;
        if (!it.date) continue;
        const age = (now - Date.parse(it.date)) / 864e5;
        if (age > MAX_AGE_DAYS || age < -1) continue;
        const key = it.url.replace(/[?#].*$/, "");
        if (seen.has(key)) continue;
        seen.add(key);
        const lang = feed.lang || "en";
        const sc = screen(it, feed.kind, lang);
        // With AI on, the model makes the final call on anything that isn't obviously out.
        const pass = sc.keep || (ai && !/clickbait|not a news story|too little/.test(sc.reason || "") && (feed.kind === "positive" || /no clear positive/.test(sc.reason)));
        if (!pass) continue;
        candidates.push({ ...it, id: storyId(key), source, kind: feed.kind, lang, heuristicKeep: sc.keep });
        kept++;
      }
      status.push({ source: feed.label || feed.source, kind: feed.kind, url: feed.url, ok: true, items: items.length, candidates: kept });
    } catch (err) {
      status.push({ source: feed.label || feed.source, kind: feed.kind, url: feed.url, ok: false, error: err.message });
      log.warn(`feed failed: ${feed.label || feed.source} ${feed.url}: ${err.message}`);
    }
  });

  const reviews = new Map(Object.entries(previous?.reviews || {}));
  let aiUsed = false;
  if (ai) {
    const todo = candidates.filter(c => !reviews.has(c.id));
    if (todo.length) {
      const fresh = await review(todo, log);
      for (const [id, r] of fresh) reviews.set(id, r);
    }
    aiUsed = candidates.some(c => reviews.has(c.id));
  }

  const stories = [];
  for (const c of candidates) {
    const r = reviews.get(c.id);
    if (r && (!r.keep || r.misleading || !r.headline_accurate)) continue;
    if (!r && !c.heuristicKeep) continue;
    const h = classifyHeuristic(c, c.lang);
    const cat = r && CATEGORIES.includes(r.category) ? r.category : h.cat;
    const country = r && (GEO[r.country] || r.country === "Worldwide") ? r.country : detectCountry(c);
    stories.push({
      id: c.id, live: true, ai: Boolean(r), lang: c.lang,
      cat, tag: r?.impact || h.tag, art: ART[cat] || "lab",
      country, geo: GEO[country] || null,
      title: c.title,
      sum: truncate(r ? r.what_happened : c.description, 220),
      excerpt: truncate(c.description, 600),
      what: r?.what_happened || "", why: r?.why_it_matters || "", bigger: r?.bigger_picture || "",
      serious: r?.serious_subject ? 1 : 0, measurable: r?.measurable ?? null,
      source: c.source, author: c.author || "", url: c.url,
      date: c.date.slice(0, 10), published: c.date,
      read: c.words > 80 ? Math.min(20, Math.max(1, Math.round(c.words / 230))) : null,
      img: c.image || null,
      kw: [cat, country, ...c.categories].join(" ").toLowerCase(),
      moods: r?.moods?.length ? r.moods : h.moods,
      also: [],
    });
  }

  const grouped = groupStories(stories)
    .map(s => ({ ...s, w: Math.max(0.2, 1 - (now - Date.parse(s.published)) / (MAX_AGE_DAYS * 864e5)) + 0.15 * s.also.length }))
    .sort((a, b) => b.published.localeCompare(a.published))
    .slice(0, MAX_STORIES);

  // Keep reviews only for links still in the window, so the cache doesn't grow forever.
  const live = new Set(candidates.map(c => c.id));
  return {
    updatedAt: new Date(now).toISOString(),
    ai: aiUsed ? MODEL : null,
    windowDays: MAX_AGE_DAYS,
    sources: status.sort((a, b) => a.source.localeCompare(b.source)),
    stories: grouped,
    reviews: Object.fromEntries([...reviews].filter(([id]) => live.has(id))),
  };
}

/* ---------- cache on disk ---------- */

const CACHE = process.env.GOOD_THINGS_CACHE || path.join(here, "data", "cache.json");
export async function loadCache() {
  try { return JSON.parse(await readFile(CACHE, "utf8")); } catch { return null; }
}
export async function saveCache(data) {
  await mkdir(path.dirname(CACHE), { recursive: true });
  await writeFile(CACHE, JSON.stringify(data));
}
