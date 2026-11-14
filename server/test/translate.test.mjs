import { test } from "node:test";
import assert from "node:assert/strict";
import { createTranslator } from "../translate.mjs";

const stories = [
  { id: "a", title: "Otters return", sum: "Otters are back.", what: "", why: "", bigger: "", excerpt: "Otters are back in the river." },
  { id: "b", title: "Solar record", sum: "A new record.", what: "W", why: "Y", bigger: "B", excerpt: "" },
];
const quiet = { warn() {}, log() {} };
const fake = calls => async (list, lang) => {
  calls.push([lang, list.map(s => s.id)]);
  return new Map(list.map(s => [s.id, { id: s.id, title: `[${lang}] ${s.title}`, sum: `[${lang}] ${s.sum}`, what: s.what && `[${lang}] ${s.what}`, why: "", bigger: "", excerpt: "", kw: "test" }]));
};

test("translates missing stories once per language and attaches them", async () => {
  const calls = [];
  let updates = 0;
  const tr = createTranslator({ translate: fake(calls), enabled: () => true, onUpdate: () => updates++, log: quiet });
  assert.equal(tr.attach(stories, "pl")[0].tr, undefined);
  await tr.ensure(stories, "pl");
  assert.deepEqual(calls, [["pl", ["a", "b"]]]);
  assert.equal(updates, 1);
  const out = tr.attach(stories, "pl");
  assert.equal(out[0].tr.pl.title, "[pl] Otters return");
  assert.equal(out[1].tr.pl.what, "[pl] W");
  assert.equal(tr.ensure(stories, "pl"), null, "nothing left to translate");
  await tr.ensure([...stories, { id: "c", title: "New", sum: "" }], "pl");
  assert.deepEqual(calls[1], ["pl", ["c"]], "only the new story is sent");
});

test("one job per language at a time, unsupported languages and AI off are ignored", async () => {
  const calls = [];
  const tr = createTranslator({ translate: fake(calls), enabled: () => true, log: quiet });
  const j1 = tr.ensure(stories, "de"), j2 = tr.ensure(stories, "de");
  assert.equal(j1, j2);
  assert.equal(tr.pending("de"), true);
  await j1;
  assert.equal(tr.pending("de"), false);
  assert.equal(tr.ensure(stories, "fr"), null);
  assert.equal(tr.ensure(stories, "en"), null);
  const off = createTranslator({ translate: fake(calls), enabled: () => false, log: quiet });
  assert.equal(off.ensure(stories, "es"), null);
  assert.equal(calls.length, 1);
});

test("prune drops translations of stories that are gone", async () => {
  const tr = createTranslator({ translate: fake([]), enabled: () => true, log: quiet });
  await tr.ensure(stories, "es");
  tr.prune(new Set(["b"]));
  assert.deepEqual(Object.keys(tr.store.es), ["b"]);
});
