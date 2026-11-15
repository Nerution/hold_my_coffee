import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { pathToFileURL, fileURLToPath } from "node:url";
import path from "node:path";
import { parseFeed, screen, groupStories, detectCountry, similarity } from "../lib.mjs";
import { collect } from "../news.mjs";

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures");
const fx = name => pathToFileURL(path.join(dir, name)).href;
const FEEDS = [
  { source: "Test Outlet A", url: fx("positive.xml"), kind: "positive" },
  { source: "Test Outlet B", url: fx("general.xml"), kind: "general" },
];
const NOW = Date.parse("2026-11-14T12:00:00Z");
const quiet = { warn() {}, log() {} };

test("parses RSS with CDATA, entities, author, image and full text", async () => {
  const items = parseFeed(await readFile(path.join(dir, "positive.xml"), "utf8"));
  assert.equal(items.length, 4);
  const [otters] = items;
  assert.equal(otters.title, "Test story: river otters return to a restored test river & thrive");
  assert.equal(otters.author, "Test Author");
  assert.equal(otters.image, "https://example.com/img/otter.jpg");
  assert.ok(otters.words >= 700);
  assert.ok(!otters.description.includes("appeared first on"), "feed boilerplate is stripped");
  assert.equal(items[3].image, "https://example.com/img/foodbank.jpg");
});

test("parses Atom", async () => {
  const items = parseFeed(await readFile(path.join(dir, "general.xml"), "utf8"));
  assert.equal(items.length, 4);
  assert.equal(items[0].url, "https://example.org/b/otters");
  assert.equal(items[0].author, "Second Test Author");
  assert.ok(items[0].description.startsWith("Fixture text. Otters"));
});

test("screen drops clickbait and negative news, keeps constructive news", () => {
  const item = (title, description) => ({ title, description: description || title + " with enough text to judge it properly." });
  assert.equal(screen(item("YOU WON'T BELIEVE what this village did!!"), "positive").keep, false);
  assert.equal(screen(item("Storm kills dozens in coastal towns"), "general").keep, false);
  assert.equal(screen(item("Study looks at sediment layers in a lake"), "general").keep, false);
  assert.equal(screen(item("Endangered turtles recover after nesting beaches are protected"), "general").keep, true);
  assert.equal(screen(item("Volunteers open a community food bank"), "positive").keep, true);
});

test("detects countries from names and demonyms", () => {
  assert.equal(detectCountry({ title: "Kenyan volunteers plant trees", description: "" }), "Kenya");
  assert.equal(detectCountry({ title: "Solar record", description: "Researchers in Japan built it." }), "Japan");
  assert.equal(detectCountry({ title: "Global renewables record", description: "Worldwide figures." }), "Worldwide");
});

test("groups reports of the same event from different outlets", () => {
  assert.ok(similarity("Otters return to restored river in Scotland", "River otters return to a restored river") > 0.6);
  const g = groupStories([
    { source: "A", url: "a", title: "Otters return to restored river in Scotland", date: "2026-11-12", also: [] },
    { source: "B", url: "b", title: "River otters return to a restored river in Scotland", date: "2026-11-13", also: [] },
    { source: "B", url: "c", title: "Solar cell sets efficiency record", date: "2026-11-13", also: [] },
  ]);
  assert.equal(g.length, 2);
  assert.deepEqual(g[0].also, [["B", "b"]]);
});

test("collect without AI: filters, dates, grouping and metadata", async () => {
  const out = await collect({ feeds: FEEDS, now: NOW, log: quiet, ai: false });
  const titles = out.stories.map(s => s.title);
  assert.equal(out.ai, null);
  assert.ok(!titles.some(t => /BELIEVE|storm|sediment|Old test/i.test(t)), titles.join(" | "));
  const otters = out.stories.find(s => /otters/.test(s.title));
  assert.equal(otters.source, "Test Outlet A", "earliest report leads");
  assert.deepEqual(otters.also, [["Test Outlet B", "https://example.org/b/otters"]]);
  assert.equal(otters.country, "United Kingdom");
  assert.equal(otters.read, 3);
  assert.equal(otters.ai, false);
  assert.equal(otters.what, "", "no AI text is invented when AI is off");
  const food = out.stories.find(s => /food bank/.test(s.title));
  assert.equal(food.country, "Kenya");
  assert.deepEqual(food.geo, [38, 0]);
  assert.ok(out.stories.some(s => /solar cell/.test(s.title) && s.country === "Japan"));
  assert.ok(out.sources.every(s => s.ok));
});

test("collect with AI: the model's rejections stick and reviews are reused", async () => {
  let calls = 0;
  const review = async items => {
    calls++;
    return new Map(items.map(it => [it.id, {
      id: it.id, keep: !/sediment/.test(it.title), reason: "test", headline_accurate: true, misleading: false, measurable: true, serious_subject: false,
      category: "Science", impact: "Progress", country: "Worldwide", moods: ["progress"],
      what_happened: "What: " + it.title, why_it_matters: "Why.", bigger_picture: "Bigger.",
    }]));
  };
  const first = await collect({ feeds: FEEDS, now: NOW, log: quiet, ai: true, review });
  assert.equal(calls, 1);
  assert.ok(first.ai);
  assert.ok(!first.stories.some(s => /sediment|storm/i.test(s.title)), "rejected by the model, or never sent");
  assert.ok(first.stories.every(s => s.ai && s.what.startsWith("What:")));
  const second = await collect({ feeds: FEEDS, now: NOW, log: quiet, ai: true, review, previous: first });
  assert.equal(calls, 1, "nothing new to review");
  assert.equal(second.stories.length, first.stories.length);
});

test("a failing feed is reported, the others still load", async () => {
  const out = await collect({ feeds: [...FEEDS, { source: "Missing", url: fx("missing.xml"), kind: "general" }], now: NOW, log: quiet, ai: false });
  assert.equal(out.sources.find(s => s.source === "Missing").ok, false);
  assert.ok(out.stories.length >= 3);
});

test("Google News results: original outlet, clean headline, tabloids and press releases blocked", async () => {
  const out = await collect({ feeds: [{ source: "Google News", label: "Test search", url: fx("googlenews.xml"), kind: "search" }], now: NOW, log: quiet, ai: false });
  assert.equal(out.stories.length, 1, out.stories.map(s => s.source + ": " + s.title).join(" | "));
  const [s] = out.stories;
  assert.equal(s.source, "Example Valley Gazette");
  assert.equal(s.title, "Test town volunteers restore historic river path");
  assert.equal(s.excerpt, "");
  assert.equal(s.url, "https://news.google.com/rss/articles/CBMiTESTONE?oc=5");
  assert.equal(out.sources[0].source, "Test search");
});

test("Polish feeds: Polish rules, Polish place names, story language", async () => {
  const out = await collect({ feeds: [{ source: "Testowy serwis", url: fx("polish.xml"), kind: "general", lang: "pl" }], now: NOW, log: quiet, ai: false });
  const titles = out.stories.map(s => s.title);
  assert.deepEqual(titles.sort(), ["Test: bobry wróciły nad testową rzekę na Mazowszu, populacja rośnie", "Test: polscy naukowcy opracowali przełomową terapię testową"]);
  assert.ok(out.stories.every(s => s.lang === "pl"));
  const beavers = out.stories.find(s => /bobry/.test(s.title));
  assert.equal(beavers.country, "Poland");
  assert.equal(beavers.cat, "Conservation", "mentions species protection (ochrona gatunku)");
  assert.equal(out.stories.find(s => /terapi/.test(s.title)).cat, "Health & Medicine");
});
