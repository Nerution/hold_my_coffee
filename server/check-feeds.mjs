// Checks every feed and search in feeds.mjs and prints what each one gives.
// Run with: npm run check-feeds
// It reads the feeds only; nothing is cached and no AI is used.
import { FEEDS } from "./feeds.mjs";
import { parseFeed, screen, stripOutlet } from "./lib.mjs";

const DAYS = +(process.env.GOOD_THINGS_MAX_AGE_DAYS || 10);
const pad = (s, n) => String(s).slice(0, n).padEnd(n);
const rows = [];
let i = 0;

async function check(feed) {
  const started = Date.now();
  try {
    const res = await fetch(feed.url, { signal: AbortSignal.timeout(15000), headers: { "user-agent": "GoodThingsNewsReader/1.0 (+RSS reader)" } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const items = parseFeed(await res.text());
    if (!items.length) throw new Error("no items (not a feed, or blocked)");
    const recent = items.filter(it => it.date && Date.now() - Date.parse(it.date) < DAYS * 864e5);
    const newest = items.map(it => it.date).filter(Boolean).sort().pop();
    const kept = recent.filter(it => screen(feed.kind === "search" ? { ...it, title: stripOutlet(it.title, it.outlet), description: "" } : it, feed.kind, feed.lang).keep);
    rows.push({ feed, ok: true, items: items.length, recent: recent.length, kept: kept.length, newest, ms: Date.now() - started, example: kept[0]?.title });
  } catch (err) {
    rows.push({ feed, ok: false, error: err.name === "TimeoutError" ? "timed out" : [err.message, err.cause?.code].filter(Boolean).join(": ") });
  }
}

console.log(`Checking ${FEEDS.length} feeds and searches…\n`);
await Promise.all(Array.from({ length: 8 }, async () => { while (i < FEEDS.length) await check(FEEDS[i++]); }));

rows.sort((a, b) => Number(b.ok) - Number(a.ok) || (b.kept ?? 0) - (a.kept ?? 0));
console.log(`${pad("Feed", 34)} ${pad("Status", 8)} ${pad("Items", 6)} ${pad(`Last ${DAYS}d`, 9)} ${pad("Kept", 5)} Newest`);
for (const r of rows) {
  const name = r.feed.label || r.feed.source;
  if (!r.ok) { console.log(`${pad(name, 34)} ${pad("FAILED", 8)} ${r.error}  ${r.feed.url}`); continue; }
  const age = r.newest ? `${Math.round((Date.now() - Date.parse(r.newest)) / 36e5)} h ago` : "-";
  console.log(`${pad(name, 34)} ${pad("ok", 8)} ${pad(r.items, 6)} ${pad(r.recent, 9)} ${pad(r.kept, 5)} ${age}`);
}
const ok = rows.filter(r => r.ok), failed = rows.filter(r => !r.ok), quiet = ok.filter(r => !r.kept);
console.log(`\n${ok.length} working, ${failed.length} failed. Stories passing the filter: ${ok.reduce((n, r) => n + r.kept, 0)} (before removing duplicates).`);
if (failed.length) console.log("Failed feeds can be removed from feeds.mjs, or their address fixed if the site moved its feed.");
if (quiet.length) console.log(`${quiet.length} working feeds gave no positive story right now. That is normal for general outlets on some days.`);
