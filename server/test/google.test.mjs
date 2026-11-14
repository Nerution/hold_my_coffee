import { test } from "node:test";
import assert from "node:assert/strict";
import { googleTranslateText, translateWithGoogle, googleAvailable } from "../translate.mjs";

const quiet = { warn() {}, log() {} };
// Mimics the endpoint: splits on sentences and blank lines like Google does, and prefixes each segment.
const fakeGoogle = ({ keepBreaks = true, calls = [] } = {}) => async url => {
  const q = decodeURIComponent(new URL(url).searchParams.get("q"));
  calls.push(q);
  const segs = q.split(/(?<=\n\n)/).map(part => [keepBreaks ? "PL " + part : "PL " + part.replace(/\n\n/g, " "), part, null, null, 10]);
  return new Response(JSON.stringify([segs, null, "en"]), { status: 200, headers: { "content-type": "application/json" } });
};
const stories = [
  { id: "a", title: "Bristol aims to become a wetland city", sum: "Five-year project will create wetlands.", what: "", why: "", bigger: "", excerpt: "A charity wants to build\nwetlands." },
];

test("parses the endpoint's segment format", async () => {
  const out = await googleTranslateText("Hello. World.", "pl", async () => new Response(JSON.stringify([[["Cześć. ", "Hello. "], ["Świat.", "World."]], null, "en"]), { status: 200 }));
  assert.equal(out, "Cześć. Świat.");
  assert.equal(await googleTranslateText("  ", "pl", () => { throw new Error("should not be called"); }), "");
});

test("translates all fields of a story in one request when blank lines survive", async () => {
  const calls = [];
  const map = await translateWithGoogle(stories, "pl", quiet, fakeGoogle({ calls }));
  assert.equal(calls.length, 1);
  const t = map.get("a");
  assert.equal(t.by, "google");
  assert.equal(t.title, "PL Bristol aims to become a wetland city");
  assert.equal(t.sum, "PL Five-year project will create wetlands.");
  assert.equal(t.excerpt, "PL A charity wants to build wetlands.");
  assert.equal(t.what, "");
});

test("falls back to one request per field when the parts don't split cleanly", async () => {
  const calls = [];
  const map = await translateWithGoogle(stories, "pl", quiet, fakeGoogle({ keepBreaks: false, calls }));
  assert.equal(calls.length, 4, "one joined request, then three fields");
  assert.ok(map.get("a").sum.startsWith("PL Five-year"));
});

test("a captcha page pauses Google translation instead of storing junk", async () => {
  const blocked = async () => new Response("<HTML><HEAD><TITLE>302 Moved</TITLE> https://www.google.com/sorry/index", { status: 200 });
  const map = await translateWithGoogle(stories, "pl", quiet, blocked);
  assert.equal(map.size, 0);
  assert.equal(googleAvailable(), false);
});
