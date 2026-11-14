// AI review of candidate stories with Claude. Used only when credentials are configured.
// The model judges and summarises; it never adds stories. Anything it drops stays dropped,
// and anything it can't review falls back to the heuristic result.
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod/v4";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { CATEGORIES, TAGS, MOODS, GEO } from "./lib.mjs";

export const MODEL = process.env.GOOD_THINGS_MODEL || "claude-opus-5-5";
const BATCH = 15;

export const aiEnabled = () =>
  process.env.GOOD_THINGS_AI !== "off" && Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);

const Review = z.object({
  id: z.string(),
  keep: z.boolean().describe("true only if this is real news about a genuinely positive, constructive or hopeful development"),
  reason: z.string().describe("one short sentence explaining the decision"),
  headline_accurate: z.boolean().describe("false if the headline overstates or misrepresents the excerpt"),
  misleading: z.boolean().describe("true if the story is likely to mislead, e.g. hype, unverified claims, an advert or press release dressed as news"),
  measurable: z.boolean().describe("true if the excerpt describes concrete, measurable progress"),
  serious_subject: z.boolean().describe("true if the underlying topic is serious (illness, disaster, conflict) even though the development is positive"),
  category: z.enum(CATEGORIES),
  impact: z.enum(TAGS),
  country: z.string().describe(`the main country, written exactly as one of: ${Object.keys(GEO).join(", ")}; or "Worldwide"`),
  moods: z.array(z.enum(MOODS)).describe("which 'what do you need right now' moods the story suits"),
  what_happened: z.string().describe("1-2 sentences, facts from the excerpt only"),
  why_it_matters: z.string().describe("1-2 sentences"),
  bigger_picture: z.string().describe("1-2 sentences, including any caveat or limitation the excerpt mentions"),
});
const Batch = z.object({ reviews: z.array(Review) });

const SYSTEM = `You are the editorial filter for Good Things, an app that shows positive, constructive news without pretending bad news doesn't exist. Its philosophy: optimistic, not naive.

For each item you get a headline and a short excerpt from a news feed. Decide whether it belongs in the app, and if it does, classify and summarise it.

Keep a story only when it reports a real development that is positive, hopeful, constructive or solution-oriented: scientific and medical progress, environmental recovery, conservation wins, communities helping each other, improving trends, achievements, rescues, kindness. A serious subject is fine when the development itself is constructive (for example, survival rates improving).

Drop it when it is mainly about harm, conflict, fear or outrage; when positivity is forced onto a tragedy; when it is opinion, advice, a product pitch, a listicle, a quiz or a promotion; when it is trivial "cute content" with no real-world substance; or when the headline is clickbait or misrepresents the excerpt.

Summaries must use only facts stated in the headline and excerpt. Never add numbers, names, quotes, dates or claims that are not there. "Why it matters" and "the bigger picture" may give general context, but phrase it cautiously and keep any limitation the excerpt mentions. Write plain, calm, factual English without hype or exclamation marks.`;

let client;
/** Returns Map(id -> review) for the items it managed to review. */
export async function reviewWithAI(items, log = console) {
  client ||= new Anthropic();
  const out = new Map();
  for (let i = 0; i < items.length; i += BATCH) {
    const chunk = items.slice(i, i + BATCH);
    const payload = chunk.map(it => ({ id: it.id, outlet: it.source, headline: it.title, excerpt: it.description.slice(0, 1200) }));
    try {
      const res = await client.messages.parse({
        model: MODEL,
        max_tokens: 16000,
        system: SYSTEM,
        output_config: { effort: "low", format: zodOutputFormat(Batch) },
        messages: [{ role: "user", content: `Review these ${chunk.length} items. Return one review per item, using each item's id.\n\n${JSON.stringify(payload, null, 1)}` }],
      });
      if (res.stop_reason === "refusal") { log.warn(`AI review declined a batch of ${chunk.length}; using heuristics for it`); continue; }
      for (const r of res.parsed_output?.reviews || []) if (chunk.some(c => c.id === r.id)) out.set(r.id, r);
    } catch (err) {
      if (err instanceof Anthropic.AuthenticationError) { log.warn("AI review: credentials rejected; using heuristics only"); break; }
      if (err instanceof Anthropic.RateLimitError) { log.warn("AI review: rate limited; using heuristics for the rest of this refresh"); break; }
      if (err instanceof Anthropic.APIError) log.warn(`AI review: API error ${err.status}: ${err.message}`);
      else log.warn(`AI review failed: ${err.message}`);
    }
  }
  return out;
}
