// Translation of live stories into the app's other languages, with Claude.
// Each story is translated once per language and kept in the cache, so the
// model only sees stories it hasn't translated before.
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod/v4";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { MODEL, aiEnabled } from "./classify.mjs";

export const LANGS = { pl: "Polish", de: "German", es: "Spanish" };
export const FIELDS = ["title", "sum", "what", "why", "bigger", "excerpt"];
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

/**
 * Keeps translations per language and translates missing stories in the background.
 * `store` is the persisted object {pl: {id: {...}}, de: {...}}.
 */
export function createTranslator({ store = {}, translate = translateWithAI, enabled = aiEnabled, onUpdate = () => {}, log = console } = {}) {
  const running = new Map();
  return {
    store,
    supported: lang => Object.hasOwn(LANGS, lang),
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
