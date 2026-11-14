// Translation of live stories into the app's other languages.
// GOOD_THINGS_TRANSLATOR picks how:
//   "google" (default)  Google Translate's free web endpoint. No API key, no tokens.
//   "claude"            Claude, if ANTHROPIC_API_KEY is set. Better with headlines, costs tokens.
//   "off"               No server translation (the app may still use the browser's own translator).
// Each story is translated once per language and kept in the cache.
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod/v4";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { MODEL, aiEnabled } from "./classify.mjs";

export const LANGS = { pl: "Polish", de: "German", es: "Spanish" };
export const FIELDS = ["title", "sum", "what", "why", "bigger", "excerpt"];
export const PROVIDER = (process.env.GOOD_THINGS_TRANSLATOR || "google").toLowerCase();
const BATCH = 8, PARALLEL = 4;

const Item = z.object({
  id: z.string(),
  title: z.string(), sum: z.string(), what: z.string(), why: z.string(), bigger: z.string(), excerpt: z.string(),
  kw: z.string().describe("8-15 lowercase search keywords in the target language: topic, place, kind of progress"),
});
const Out = z.object({ translations: z.array(Item) });

const system = lang => `You translate short news texts for Good Things, a calm positive-news app, from English into ${LANGS[lang]}.

Translate each field faithfully and naturally, as a native ${LANGS[lang]} news editor would write it. Keep the meaning, facts, numbers, names and caveats exactly; do not add, drop or soften anything, and do not add hype. Keep the names of people, organisations and news outlets as they are; use the usual ${LANGS[lang]} names for countries and places. Headlines should read like ${LANGS[lang]} headlines (sentence case unless ${LANGS[lang]} requires otherwise). If a field is empty, return it empty.`;

let client;
async function pool(tasks, n) {
  const out = []; let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, tasks.length) }, async () => { while (i < tasks.length) { const k = i++; out[k] = await tasks[k](); } }));
  return out;
}

/** Translates stories into `lang`. Returns Map(id -> {title, sum, what, why, bigger, excerpt, kw}). */
export async function translateWithAI(stories, lang, log = console) {
  client ||= new Anthropic();
  const result = new Map();
  const chunks = [];
  for (let i = 0; i < stories.length; i += BATCH) chunks.push(stories.slice(i, i + BATCH));
  await pool(chunks.map(chunk => async () => {
    const payload = chunk.map(s => Object.fromEntries([["id", s.id], ...FIELDS.map(f => [f, s[f] || ""])]));
    try {
      const res = await client.messages.parse({
        model: MODEL,
        max_tokens: 16000,
        system: system(lang),
        output_config: { effort: "low", format: zodOutputFormat(Out) },
        messages: [{ role: "user", content: `Translate these ${chunk.length} items into ${LANGS[lang]}. Return one entry per item with the same id.\n\n${JSON.stringify(payload, null, 1)}` }],
      });
      if (res.stop_reason === "refusal") return log.warn(`translation (${lang}) declined a batch of ${chunk.length}`);
      for (const t of res.parsed_output?.translations || []) if (chunk.some(c => c.id === t.id) && t.title) result.set(t.id, t);
    } catch (err) {
      if (err instanceof Anthropic.APIError) log.warn(`translation (${lang}): API error ${err.status}: ${err.message}`);
      else log.warn(`translation (${lang}) failed: ${err.message}`);
    }
  }), PARALLEL);
  return result;
}

/* ---------- Google Translate (free web endpoint) ---------- */

const GOOGLE = process.env.GOOD_THINGS_GOOGLE_URL || "https://translate.googleapis.com/translate_a/single"; // overridable for tests
const SEP = "\n\n";
export class GoogleBlocked extends Error {}
let googleBlockedUntil = 0;
export const googleAvailable = () => Date.now() >= googleBlockedUntil;

/** Translates one text; the endpoint returns [[["translated", "original", ...], ...], ...]. */
export async function googleTranslateText(text, lang, fetchImpl = fetch) {
  if (!text.trim()) return "";
  const url = `${GOOGLE}?client=gtx&sl=en&tl=${lang}&dt=t&q=${encodeURIComponent(text)}`;
  const res = await fetchImpl(url, { signal: AbortSignal.timeout(10000), headers: { "user-agent": "Mozilla/5.0 (GoodThingsNewsReader)" } });
  const body = await res.text();
  if (res.status === 429 || res.status === 403 || /google\.com\/sorry|<html/i.test(body.slice(0, 400))) throw new GoogleBlocked(`Google Translate refused the request (HTTP ${res.status})`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = JSON.parse(body);
  if (!Array.isArray(data?.[0])) throw new Error("unexpected response");
  return data[0].map(seg => (Array.isArray(seg) && typeof seg[0] === "string" ? seg[0] : "")).join("");
}

/** Translates stories with Google: one request per story (fields joined by blank lines), per field if that doesn't split cleanly. */
export async function translateWithGoogle(stories, lang, log = console, fetchImpl = fetch) {
  const result = new Map();
  let blocked = false;
  await pool(stories.map(s => async () => {
    if (blocked) return;
    const fields = FIELDS.filter(f => s[f] && s[f].trim());
    try {
      const joined = await googleTranslateText(fields.map(f => s[f].replace(/\s*\n\s*/g, " ")).join(SEP), lang, fetchImpl);
      let parts = joined.split(/\n\s*\n/).map(x => x.trim());
      if (parts.length !== fields.length) parts = await Promise.all(fields.map(f => googleTranslateText(s[f], lang, fetchImpl)));
      const out = { id: s.id, by: "google", kw: "" };
      for (const f of FIELDS) out[f] = "";
      fields.forEach((f, i) => { out[f] = parts[i]; });
      if (out.title) result.set(s.id, out);
    } catch (err) {
      if (err instanceof GoogleBlocked) {
        blocked = true;
        googleBlockedUntil = Date.now() + 30 * 60 * 1000;
        log.warn(`${err.message}. Pausing Google translation for 30 minutes; the app will use the browser's translator if it has one.`);
      } else log.warn(`Google translation (${lang}) failed for one story: ${err.message}`);
    }
  }), 3);
  return result;
}

/** The translator chosen by GOOD_THINGS_TRANSLATOR, and whether it can run right now. */
export const providerTranslate = (stories, lang, log) => (PROVIDER === "claude" ? translateWithAI(stories, lang, log) : translateWithGoogle(stories, lang, log));
export const providerEnabled = () => (PROVIDER === "claude" ? aiEnabled() : PROVIDER === "google" ? googleAvailable() : false);

/**
 * Keeps translations per language and translates missing stories in the background.
 * `store` is the persisted object {pl: {id: {...}}, de: {...}}.
 */
export function createTranslator({ store = {}, translate = providerTranslate, enabled = providerEnabled, onUpdate = () => {}, log = console } = {}) {
  const running = new Map();
  return {
    store,
    supported: lang => Object.hasOwn(LANGS, lang),
    available: () => enabled(),
    pending: lang => running.has(lang),
    /** Starts translating whatever is missing for `lang`. Returns the running job, or null if nothing to do. */
    ensure(stories, lang) {
      if (!Object.hasOwn(LANGS, lang) || !enabled()) return null;
      if (running.has(lang)) return running.get(lang);
      const have = store[lang] || {};
      const missing = stories.filter(s => !have[s.id]);
      if (!missing.length) return null;
      const started = Date.now();
      const job = translate(missing, lang, log)
        .then(map => {
          store[lang] = { ...(store[lang] || {}), ...Object.fromEntries(map) };
          log.log?.(`translated ${map.size}/${missing.length} stories into ${LANGS[lang]} in ${((Date.now() - started) / 1000).toFixed(1)}s`);
          onUpdate();
        })
        .catch(err => log.warn(`translation (${lang}) failed: ${err.message}`))
        .finally(() => running.delete(lang));
      running.set(lang, job);
      return job;
    },
    /** Adds `tr: {lang: {...}}` to each story that has a translation. */
    attach(stories, lang) {
      const have = store[lang];
      if (!have) return stories;
      return stories.map(s => (have[s.id] ? { ...s, tr: { [lang]: have[s.id] } } : s));
    },
    /** Drops translations of stories that are no longer listed. */
    prune(ids) {
      for (const lang of Object.keys(store)) store[lang] = Object.fromEntries(Object.entries(store[lang]).filter(([id]) => ids.has(id)));
    },
  };
}
