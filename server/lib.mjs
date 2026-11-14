import { XMLParser } from "fast-xml-parser";
import { createHash } from "node:crypto";

// Must match CATS and the impact tags in index.html.
export const CATEGORIES = ["Environment & Nature", "Science", "Health & Medicine", "Technology", "Animals", "World", "Humanity & Community", "Space", "Culture", "Education", "Sports", "Business & Economy", "Local Communities", "Innovation", "Inspiring People", "Conservation"];
export const TAGS = ["Progress", "Breakthrough", "Recovery", "Community Win", "Conservation Success", "Scientific Discovery", "Good Trend", "Human Kindness", "Milestone"];
export const MOODS = ["hope", "smile", "amazing", "faith", "progress", "animals", "world", "calm"];

/* ---------- feed parsing ---------- */

const xml = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@", textNodeName: "#text", cdataPropName: "#cdata", trimValues: true });
const arr = x => (x == null ? [] : Array.isArray(x) ? x : [x]);
const text = x => {
  if (x == null) return "";
  if (typeof x === "string" || typeof x === "number") return String(x);
  if (Array.isArray(x)) return x.map(text).join(" ");
  return [x["#cdata"], x["#text"]].filter(v => v != null).map(text).join(" ");
};

const ENT = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", hellip: "…", mdash: "—", ndash: "–", rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“" };
export function cleanText(s) {
  return String(s || "")
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (m, n) => ENT[n.toLowerCase()] ?? m)
    .replace(/\s+/g, " ")
    .replace(/\s*(The post .* appeared first on .*|Continue reading\.*|Read more\.*|\[…\]|\[\.\.\.\])\s*$/i, "")
    .trim();
}

function firstImage(it) {
  for (const m of [...arr(it["media:content"]), ...arr(it["media:thumbnail"]), ...arr(it["media:group"]?.["media:content"])]) {
    const u = m?.["@url"];
    if (u && (!m["@medium"] || m["@medium"] === "image")) return u;
  }
  for (const e of arr(it.enclosure)) if (e?.["@url"] && /^image\//.test(e["@type"] || "image/")) return e["@url"];
  const html = text(it["content:encoded"]) || text(it.description) || text(it.content) || text(it.summary);
  const m = html.match(/<img[^>]+src=["']([^"']+)["']/i);
  return m ? m[1] : null;
}

/** Parses RSS 2.0 or Atom into plain items. Returns [] for anything it can't read. */
export function parseFeed(body) {
  let doc;
  try { doc = xml.parse(body); } catch { return []; }
  const rss = doc?.rss?.channel || doc?.["rdf:RDF"];
  const raw = rss ? arr(rss.item || doc?.["rdf:RDF"]?.item) : arr(doc?.feed?.entry);
  return raw.map(it => {
    const link = rss ? text(arr(it.link)[0]) || text(arr(it.guid)[0]) : (arr(it.link).find(l => !l["@rel"] || l["@rel"] === "alternate")?.["@href"] || text(it.id));
    const full = text(it["content:encoded"]) || text(it.content);
    const desc = cleanText(text(it.description) || text(it.summary) || full);
    const author = cleanText(text(it["dc:creator"]) || text(it.author?.name) || text(it.author));
    const date = new Date(text(it.pubDate) || text(it["dc:date"]) || text(it.published) || text(it.updated));
    return {
      title: cleanText(text(it.title)),
      url: String(link || "").trim(),
      date: isNaN(date) ? null : date.toISOString(),
      description: desc,
      words: full ? cleanText(full).split(" ").length : 0,
      author: author && !/^https?:/.test(author) && !author.includes("@") ? author.slice(0, 80) : "",
      image: firstImage(it),
      categories: arr(it.category).map(c => cleanText(text(c) || c?.["@term"])).filter(Boolean),
    };
  }).filter(i => i.title && /^https?:\/\//.test(i.url));
}

/* ---------- heuristic screening (used always, and as the whole filter when AI is off) ---------- */

const words = list => new RegExp(`\\b(${list.join("|")})`, "i");
const NEGATIVE = words(["kill", "killed", "killing", "dead", "deaths?", "dies", "died", "murder", "shooting", "shot dead", "war\\b", "airstrike", "bomb", "terror", "attack", "massacre", "genocide", "rape", "abuse", "assault", "hostage", "crash", "wildfire kills", "disaster", "catastroph", "famine", "outbreak", "pandemic", "epidemic", "collapse", "crisis", "emergency", "scandal", "outrage", "fraud", "corrupt", "arrested", "jailed", "sentenced", "lawsuit", "sued", "layoffs?", "bankrupt", "recession", "slump", "plunge", "worst", "deadly", "fatal", "threat", "threaten", "warns?", "warning", "fears?", "alarm", "danger", "toxic", "poison", "extinct\\b", "decline", "declining", "shrinking", "loss of", "lost", "fails?", "failed", "failure", "cuts", "slashe", "banned", "riot", "clash", "violence"]);
const POSITIVE = words(["record", "recover", "restor", "rebound", "return", "breakthrough", "first[- ]ever", "for the first time", "milestone", "success", "succeed", "saved", "saving", "rescue", "protect", "conserv", "thriv", "boost", "improv", "progress", "cure", "treatment", "therapy", "vaccine", "discover", "new species", "renewable", "solar", "wind power", "clean energy", "emissions fall", "lowest", "falls? to", "drop in", "reduc", "volunteer", "donat", "kindness", "community", "free ", "helps?", "help ", "empower", "hope", "inspir", "celebrat", "wins?", "won ", "award", "launch", "opens?", "reopen", "rewild", "reforest", "planted", "clean", "affordable", "access to", "lifts?", "rising", "grows?", "growth", "expands?", "innovat", "invent"]);
const CLICKBAIT = /you won'?t believe|shocking|jaw[- ]dropping|mind[- ]blowing|this one (trick|thing)|what happened next|will blow your mind|!!|\?\?|\b[A-Z]{4,}\b.*\b[A-Z]{4,}\b.*\b[A-Z]{4,}\b/;
const LISTICLE = /^(\d+|ten|five|seven) (best|things|ways|reasons)|quiz|horoscope|podcast|newsletter|crossword|sponsored|deal of|sale\b|gift guide|photos of the week|in pictures/i;

export function screen(item, kind) {
  const hay = `${item.title}. ${item.description}`;
  const neg = (hay.match(new RegExp(NEGATIVE.source, "gi")) || []).length;
  const pos = (hay.match(new RegExp(POSITIVE.source, "gi")) || []).length;
  const titleNeg = NEGATIVE.test(item.title);
  if (CLICKBAIT.test(item.title)) return { keep: false, reason: "clickbait headline" };
  if (LISTICLE.test(item.title)) return { keep: false, reason: "not a news story" };
  if (item.description.length < 40) return { keep: false, reason: "too little text to judge" };
  if (kind === "positive") return neg >= 3 || (titleNeg && pos === 0) ? { keep: false, reason: "reads as negative news" } : { keep: true, pos, neg };
  if (titleNeg || neg > 1) return { keep: false, reason: "reads as negative news" };
  return pos >= 2 ? { keep: true, pos, neg } : { keep: false, reason: "no clear positive development" };
}

/* ---------- light classification used when AI is off ---------- */

const CAT_RULES = [
  ["Space", /\b(space|nasa|esa|orbit|planet|moon|mars|asteroid|telescope|galax|astronaut|rocket|satellite)/i],
  ["Health & Medicine", /\b(health|medic|cancer|disease|patient|hospital|vaccine|drug|therapy|treatment|clinical|doctor|mental health|surgery|diabet|alzheimer|malaria|hiv)/i],
  ["Conservation", /\b(conserv|endangered|species|habitat|protected area|national park|rewild|reintroduc|poach|marine reserve|coral)/i],
  ["Animals", /\b(animal|wildlife|bird|whale|dolphin|turtle|elephant|tiger|lion|wolf|wolves|bear|bees?|butterfl|dog|cat|horse|fish|frog|otter|beaver|bison|rhino|gorilla|koala|penguin)/i],
  ["Environment & Nature", /\b(climate|emission|carbon|renewable|solar|wind|forest|tree|river|ocean|pollution|plastic|recycl|environment|nature|biodivers|clean energy|ev\b|electric vehicle|heat pump)/i],
  ["Education", /\b(school|student|teacher|educat|literacy|universit|classroom|learn|scholarship|graduat)/i],
  ["Technology", /\b(tech|robot|software|\bai\b|artificial intelligence|computer|chip|battery|3d[- ]print|app\b|internet|digital|drone|implant)/i],
  ["Sports", /\b(sport|olympi|athlete|football|soccer|tennis|marathon|cricket|rugby|basketball|cycling|championship|medal)/i],
  ["Culture", /\b(art\b|artist|museum|music|film|book|library|theatre|theater|heritage|festival|culture|poet|painting)/i],
  ["Business & Economy", /\b(econom|business|jobs|employment|wage|income|poverty|company|market|investment|startup|cooperative|price)/i],
  ["Science", /\b(scien|research|study|scientist|discover|physic|chemist|biolog|lab\b|fossil|archaeolog|genome|quantum)/i],
  ["Local Communities", /\b(neighbo|local|town|village|city council|community garden|residents)/i],
  ["Humanity & Community", /\b(volunteer|refugee|charity|donat|kindness|community|homeless|food bank|stranger|neighbor)/i],
  ["Inspiring People", /\b(\d+-year-old|teen|grandm|grandf|she |he |her |his |woman|man who|girl|boy)/i],
];
const TAG_RULES = [
  ["Breakthrough", /breakthrough|first[- ]ever|for the first time|world first|cure/i],
  ["Scientific Discovery", /discover|new species|scientists (find|found)|study (finds|shows|reveals)|researchers (find|found)/i],
  ["Conservation Success", /conserv|protected|rewild|reintroduc|population (grow|rise|rebound)|back from|no longer endangered/i],
  ["Recovery", /recover|rebound|restor|return|revive|comeback/i],
  ["Human Kindness", /kind|volunteer|donat|stranger|helped|generos|gift/i],
  ["Community Win", /community|residents|neighbo|cooperative|town|village|local/i],
  ["Milestone", /milestone|record|wins?\b|won\b|anniversary|historic/i],
  ["Good Trend", /falls?|fell|lowest|decline in|drop in|rising|rise in|trend|more and more|fewer/i],
];
export const classifyHeuristic = item => {
  const hay = `${item.title} ${item.description} ${item.categories.join(" ")}`;
  const cat = (CAT_RULES.find(([, r]) => r.test(hay)) || ["World"])[0];
  const tag = (TAG_RULES.find(([, r]) => r.test(hay)) || ["Progress"])[0];
  const moods = new Set();
  if (["Animals", "Conservation"].includes(cat)) moods.add("animals");
  if (["Science", "Space", "Technology", "Innovation", "Health & Medicine"].includes(cat)) moods.add("amazing").add("progress");
  if (["Humanity & Community", "Local Communities", "Inspiring People"].includes(cat) || tag === "Human Kindness") moods.add("faith").add("smile");
  if (["Environment & Nature", "World", "Business & Economy", "Education"].includes(cat) || tag === "Good Trend") moods.add("world").add("hope");
  if (["Culture", "Environment & Nature", "Animals"].includes(cat)) moods.add("calm");
  if (!moods.size) moods.add("hope");
  return { cat, tag, moods: [...moods] };
};

/* ---------- places ---------- */

// [name, lon, lat, extra words that point to it]
const PLACE_LIST = [
  ["United States", -98, 39, "u\\.s\\.|usa|american|california|texas|new york|florida|washington state|oregon|colorado|alaska|hawaii|chicago|boston|michigan"], ["Canada", -100, 58, "canadian|ontario|quebec|british columbia|alberta|toronto|vancouver"], ["Mexico", -102, 23, "mexican"], ["Brazil", -52, -10, "brazilian|amazon rainforest|são paulo|sao paulo|rio de janeiro"], ["Argentina", -64, -34, "argentine|argentinian|patagonia"], ["Chile", -71, -33, "chilean"], ["Peru", -75, -10, "peruvian"], ["Colombia", -73, 4, "colombian"], ["Costa Rica", -84, 10, "costa rican"], ["Ecuador", -78, -1, "galápagos|galapagos|ecuadorian"],
  ["United Kingdom", -2, 54, "uk\\b|britain|british|england|english|scotland|scottish|wales|welsh|london|northern ireland"], ["Ireland", -8, 53, "irish|dublin"], ["France", 2, 46, "french|paris"], ["Spain", -4, 40, "spanish|madrid|barcelona"], ["Portugal", -8, 39, "portuguese|lisbon"], ["Germany", 10, 51, "german|berlin"], ["Netherlands", 5, 52, "dutch|amsterdam"], ["Belgium", 4, 50, "belgian|brussels"], ["Italy", 12, 42, "italian|rome|milan|sicily"], ["Switzerland", 8, 47, "swiss"], ["Austria", 14, 47, "austrian|vienna"], ["Poland", 19, 52, "polish|warsaw"], ["Denmark", 10, 56, "danish|copenhagen"], ["Norway", 9, 61, "norwegian|oslo"], ["Sweden", 15, 62, "swedish|stockholm"], ["Finland", 26, 64, "finnish|helsinki"], ["Iceland", -19, 65, "icelandic"], ["Greece", 22, 39, "greek|athens"], ["Ukraine", 31, 49, "ukrainian|kyiv"], ["Romania", 25, 46, "romanian"], ["Czech Republic", 15, 50, "czech|prague"],
  ["Kenya", 38, 0, "kenyan|nairobi"], ["Nigeria", 8, 9, "nigerian|lagos"], ["South Africa", 24, -29, "south african|cape town|johannesburg"], ["Ethiopia", 39, 9, "ethiopian"], ["Egypt", 30, 27, "egyptian|cairo"], ["Ghana", -1, 8, "ghanaian"], ["Rwanda", 30, -2, "rwandan"], ["Uganda", 32, 1, "ugandan"], ["Tanzania", 35, -6, "tanzanian"], ["Morocco", -7, 32, "moroccan"], ["Madagascar", 47, -19, "malagasy"], ["Senegal", -14, 14, "senegalese"], ["Zimbabwe", 30, -19, "zimbabwean"], ["Mozambique", 35, -18, "mozambican"], ["Namibia", 17, -22, "namibian"], ["Botswana", 24, -22, "botswanan"],
  ["India", 79, 22, "indian|delhi|mumbai|bengaluru|kerala"], ["China", 104, 35, "chinese|beijing|shanghai"], ["Japan", 138, 37, "japanese|tokyo"], ["South Korea", 128, 36, "korean|seoul"], ["Indonesia", 117, -2, "indonesian|bali|jakarta"], ["Philippines", 122, 12, "filipino|filipina|manila"], ["Vietnam", 106, 16, "vietnamese"], ["Thailand", 101, 15, "thai\\b|bangkok"], ["Malaysia", 102, 4, "malaysian|borneo"], ["Singapore", 104, 1, "singapore"], ["Bangladesh", 90, 24, "bangladeshi|dhaka"], ["Pakistan", 70, 30, "pakistani"], ["Nepal", 84, 28, "nepali|nepalese|himalaya"], ["Sri Lanka", 81, 8, "sri lankan"], ["Kazakhstan", 67, 48, "kazakh"], ["Mongolia", 104, 47, "mongolian"], ["Saudi Arabia", 45, 24, "saudi"], ["Israel", 35, 31, "israeli"], ["Turkey", 35, 39, "turkish|istanbul"], ["United Arab Emirates", 54, 24, "uae|dubai|abu dhabi"],
  ["Australia", 134, -25, "australian|sydney|melbourne|queensland|tasmania|great barrier reef"], ["New Zealand", 174, -41, "new zealander|kiwi|auckland|aotearoa|māori|maori"],
];
const PLACE_RE = PLACE_LIST.map(([n, lon, lat, extra]) => [n, [lon, lat], new RegExp(`\\b(${n.replace(/ /g, "\\s")}${extra ? "|" + extra : ""})`, "i")]);
export const GEO = Object.fromEntries(PLACE_LIST.map(([n, lon, lat]) => [n, [lon, lat]]));
export function detectCountry(item) {
  const t = `${item.title} ${item.description}`;
  let best = null, bestIdx = Infinity;
  for (const [name, , re] of PLACE_RE) { const m = re.exec(t); if (m && m.index < bestIdx) { best = name; bestIdx = m.index; } }
  return best || "Worldwide";
}

/* ---------- multi-source grouping ---------- */

const STOP = new Set("a an the of to in on for and or with by at from as is are be been its it this that new after over into about how why what who than more".split(" "));
const sig = t => new Set(t.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").split(/\s+/).filter(w => w.length > 2 && !STOP.has(w)));
export function similarity(a, b) {
  const A = sig(a), B = sig(b);
  if (!A.size || !B.size) return 0;
  let n = 0; for (const w of A) if (B.has(w)) n++;
  return n / Math.min(A.size, B.size);
}
/** Merges stories about the same event from different outlets; the earliest report leads. */
export function groupStories(stories, threshold = 0.6) {
  const out = [];
  const when = x => x.published || x.date;
  for (const s of [...stories].sort((a, b) => when(a).localeCompare(when(b)) || a.source.localeCompare(b.source))) {
    const twin = out.find(o => o.source !== s.source && !o.also.some(([src]) => src === s.source) && similarity(o.title, s.title) >= threshold);
    if (twin) { twin.also.push([s.source, s.url]); twin.img ||= s.img; } else out.push(s);
  }
  return out;
}

export const storyId = url => createHash("sha1").update(url).digest("base64url").slice(0, 12);
export const truncate = (s, n) => (s.length <= n ? s : s.slice(0, s.lastIndexOf(" ", n - 1)).replace(/[,;:\s]+$/, "") + "…");
