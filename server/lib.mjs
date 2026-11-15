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
      outlet: cleanText(text(it.source)), // Google News names the original outlet here
    };
  }).filter(i => i.title && /^https?:\/\//.test(i.url));
}

/* ---------- heuristic screening (used always, and as the whole filter when AI is off) ---------- */

const words = list => new RegExp(`\\b(${list.join("|")})`, "i");
const NEGATIVE = words(["kill", "killed", "killing", "dead", "deaths?", "dies", "died", "murder", "shooting", "shot dead", "war\\b", "airstrike", "bomb", "terror", "attack", "massacre", "genocide", "rape", "abuse", "assault", "hostage", "crash", "wildfire kills", "disaster", "catastroph", "famine", "outbreak", "pandemic", "epidemic", "collapse", "crisis", "emergency", "scandal", "outrage", "fraud", "corrupt", "arrested", "jailed", "sentenced", "lawsuit", "sued", "layoffs?", "bankrupt", "recession", "slump", "plunge", "worst", "deadly", "fatal", "threat", "threaten", "warns?", "warning", "fears?", "alarm", "danger", "toxic", "poison", "extinct\\b", "decline", "declining", "shrinking", "loss of", "lost", "fails?", "failed", "failure", "cuts", "slashe", "banned", "riot", "clash", "violence"]);
const POSITIVE = words(["record", "recover", "restor", "rebound", "return", "breakthrough", "first[- ]ever", "for the first time", "milestone", "success", "succeed", "saved", "saving", "rescue", "protect", "conserv", "thriv", "boost", "improv", "progress", "cure", "treatment", "therapy", "vaccine", "discover", "new species", "renewable", "solar", "wind power", "clean energy", "emissions fall", "lowest", "falls? to", "drop in", "reduc", "volunteer", "donat", "kindness", "community", "free ", "helps?", "help ", "empower", "hope", "inspir", "celebrat", "wins?", "won ", "award", "launch", "opens?", "reopen", "rewild", "reforest", "planted", "clean", "affordable", "access to", "lifts?", "rising", "grows?", "growth", "expands?", "innovat", "invent"]);
const CLICKBAIT = /you won'?t believe|shocking|jaw[- ]dropping|mind[- ]blowing|this one (trick|thing)|what happened next|will blow your mind|!!|\?\?|\b[A-Z]{4,}\b.*\b[A-Z]{4,}\b.*\b[A-Z]{4,}\b/;
const LISTICLE = /^(\d+|ten|five|seven) (best|things|ways|reasons)|quiz|horoscope|podcast|newsletter|crossword|sponsored|deal of|sale\b|gift guide|photos of the week|in pictures/i;

/* Polish rules. Polish words change their endings, so these are word beginnings (stems),
   matched only at the start of a word. \b doesn't work with letters like ą or ł, hence the lookbehind. */
const plWords = list => new RegExp(`(?<!\\p{L})(${list.join("|")})`, "iu");
const NEGATIVE_PL = plWords(["zgin", "zmarł", "zmarl", "nie żyj", "śmier", "smierc", "zabi", "zabój", "morderst", "strzelanin", "wojn", "atak", "zamach", "bomb", "terror", "przemoc", "gwałt", "pobi", "napad", "wypad", "katastrof", "tragedi", "tragiczn", "pożar", "powodz", "powódź", "huragan", "epidemi", "pandemi", "kryzys", "afer", "skandal", "oszust", "oszuk", "korupc", "zatrzyman", "areszt", "wyrok", "zarzut", "pozew", "zwolnie", "upadłoś", "bankruct", "recesj", "inflacj", "drożej", "najgorsz", "groź", "zagroż", "niebezpiecz", "ostrzeg", "alarm", "toksyczn", "zatru", "wymarł", "wyginięci", "strat", "porażk", "ofiar", "rann", "zakaz", "zamieszk", "konflikt", "przestęp", "nie żyją"]);
const POSITIVE_PL = plWords(["rekord", "sukces", "przełom", "odkry", "uratow", "ocal", "pomog", "wolontariusz", "zbiórk", "zebral", "darowizn", "przekazal", "przekazał", "powr", "wróci", "wraca", "odtworz", "odbudow", "renaturyzac", "rewitaliz", "chronion", "ochron", "rezerwat", "park narodow", "zasadz", "posadz", "drzew", "fotowoltai", "oze", "odnawialn", "farm wiatrow", "wiatrak", "czyst", "nagrod", "medal", "zwycię", "wygra", "po raz pierwszy", "najniższ", "mniej wypadk", "mniej ofiar", "bezpłatn", "darmow", "leczeni", "terapi", "szczepion", "innowac", "wynalaz", "nadziej", "inspir", "dobr[aey] wiadomo", "pozytywn", "rośnie", "wzrósł", "wzrosł", "wzrost", "popraw", "lepsz", "udało się", "historyczn", "otwar", "nowy park", "uczniowie zdobyli", "spadł", "spadek bezroboc"]);
const CLICKBAIT_PL = /nie uwierzysz|szok|szokując|musisz to zobaczyć|zobacz,? co|tego się nie spodziewa|internauci oszaleli|hit internetu|!!|\?\?/i;
const LISTICLE_PL = /horoskop|quiz|kupon|promocj|wyprzedaż|sprawdź (ceny|wyniki)|lotto|program tv|pogoda na|prognoza pogody|podcast|newsletter|galeria zdjęć|zdjęcia dnia|krzyżówk/i;

const RULES = {
  en: { neg: NEGATIVE, pos: POSITIVE, clickbait: CLICKBAIT, listicle: LISTICLE },
  pl: { neg: NEGATIVE_PL, pos: POSITIVE_PL, clickbait: CLICKBAIT_PL, listicle: LISTICLE_PL },
};
const rulesFor = lang => RULES[lang] || RULES.en;
const count = (re, text) => (text.match(new RegExp(re.source, re.flags.includes("g") ? re.flags : re.flags + "g")) || []).length;

export function screen(item, kind, lang = "en") {
  const { neg: NEG, pos: POS, clickbait: CLICK, listicle: LIST } = rulesFor(lang);
  if (kind === "search") return screenHeadline(item, lang);
  const hay = `${item.title}. ${item.description}`;
  const neg = count(NEG, hay);
  const pos = count(POS, hay);
  const titleNeg = NEG.test(item.title);
  if (CLICK.test(item.title)) return { keep: false, reason: "clickbait headline" };
  if (LIST.test(item.title)) return { keep: false, reason: "not a news story" };
  if (item.description.length < 40) return { keep: false, reason: "too little text to judge" };
  if (kind === "positive") return neg >= 3 || (titleNeg && pos === 0) ? { keep: false, reason: "reads as negative news" } : { keep: true, pos, neg };
  if (titleNeg || neg > 1) return { keep: false, reason: "reads as negative news" };
  return pos >= 2 ? { keep: true, pos, neg } : { keep: false, reason: "no clear positive development" };
}

/** Search results carry only a headline, and the search itself already asked for good news. */
function screenHeadline(item, lang) {
  const { neg: NEG, pos: POS, clickbait: CLICK, listicle: LIST } = rulesFor(lang);
  if (CLICK.test(item.title)) return { keep: false, reason: "clickbait headline" };
  if (LIST.test(item.title)) return { keep: false, reason: "not a news story" };
  if (NEG.test(item.title)) return { keep: false, reason: "reads as negative news" };
  if (item.title.split(" ").length < 5) return { keep: false, reason: "too little text to judge" };
  return POS.test(item.title) ? { keep: true, pos: 1, neg: 0 } : { keep: false, reason: "no clear positive development" };
}

/** Google News headlines end with " - Outlet name"; returns the headline without it. */
export function stripOutlet(title, outlet) {
  if (outlet && title.endsWith(" - " + outlet)) return title.slice(0, -(outlet.length + 3)).trim();
  return title.replace(/\s+[-|–]\s+[^-|–]{2,40}$/, m => (outlet ? m : "")).trim() || title;
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
const pl = re => new RegExp(`(?<!\\p{L})(${re})`, "iu");
const CAT_RULES_PL = [
  ["Space", pl("kosm|nasa|esa|polsa|orbit|planet|księżyc|mars|astronom|teleskop|satelit|rakiet")],
  ["Health & Medicine", pl("zdrow|medy|lekar|szpital|pacjent|nowotw|chorob|terapi|leczeni|szczepion|operacj|serc|onkolog")],
  ["Conservation", pl("ochron|zagrożon|gatun|rezerwat|park narodow|siedlisk|kłusow|reintrodukc|żubr|ryś|rysi")],
  ["Animals", pl("zwierz|ptak|ptasz|pies|psa|psy|kot|koń|konie|bocian|fok|wilk|wilcz|niedźwied|jeż|sow|bóbr|bobr|delfin|wieloryb|żółw")],
  ["Environment & Nature", pl("klimat|emisj|węgl|oze|fotowoltai|wiatr|las|drzew|rzek|morz|plastik|recykling|smog|powietrz|przyrod|środowisk|zielon|bałtyk")],
  ["Education", pl("szkoł|uczni|uczeń|nauczyciel|edukac|uczeln|student|olimpiad|matur|stypend|bibliotek")],
  ["Technology", pl("technolog|robot|sztuczn[a-ząćęłńóśźż]* inteligenc|komputer|aplikacj|internet|cyfrow|dron|bateri|akumulator|chip")],
  ["Sports", pl("sport|olimp|mistrz|medal|piłk|siatk|tenis|maraton|skocz|kolarst|reprezentac|lekkoatlet")],
  ["Culture", pl("kultur|muze|muzyk|film|książk|teatr|festiwal|sztuk|artyst|zabyt|koncert|pisarz|poet")],
  ["Business & Economy", pl("gospodar|firm|biznes|prac[ay]|bezroboc|płac|wynagrodz|eksport|inwestyc|pkb|ubóstw|zarobk")],
  ["Science", pl("nauk|badacz|naukow|odkry|badani|uniwersytet|archeolog|fizy|chemi|biolog|polsk[a-ząćęłńóśźż]* akademi")],
  ["Local Communities", pl("gmin|miast|mieszkańc|sąsiad|wieś|wsi|osiedl|radn|lokaln|sołectw")],
  ["Humanity & Community", pl("wolontariusz|zbiórk|charyt|fundacj|pomoc|bezdomn|uchodźc|darowizn|życzliw|seniorom")],
  ["Inspiring People", pl("\\d+-lat|nastolat|seniork|dziewczyn|chłop|kobiet[ay] któr|mężczyzn[ay] któr")],
];
const TAG_RULES_PL = [
  ["Breakthrough", pl("przełom|po raz pierwszy|pierwsz[a-ząćęłńóśźż]* na świecie|wyleczy")],
  ["Scientific Discovery", pl("odkry|nowy gatunek|naukowcy (ustalili|wykazali)|badanie (wykazało|pokazuje)")],
  ["Conservation Success", pl("ochron|chronion|reintrodukc|populacja (rośnie|wzrosła)")],
  ["Recovery", pl("odbudow|odtworz|renaturyzac|rewitaliz|powr|wróci|wraca|odzysk")],
  ["Human Kindness", pl("pomog|życzliw|wolontariusz|zbiórk|podarow|przekaza|bezinteresown")],
  ["Community Win", pl("mieszkańc|społeczno|lokaln|sąsiad|gmin|wspólnie")],
  ["Milestone", pl("rekord|kamień milowy|zwycię|wygra|medal|historyczn|jubileusz")],
  ["Good Trend", pl("spad|najniższ|mniej|rośnie|wzrost|coraz więcej|coraz mniej")],
];
export const classifyHeuristic = (item, lang = "en") => {
  const hay = `${item.title} ${item.description} ${item.categories.join(" ")}`;
  const cats = lang === "pl" ? CAT_RULES_PL : CAT_RULES, tags = lang === "pl" ? TAG_RULES_PL : TAG_RULES;
  const cat = (cats.find(([, r]) => r.test(hay)) || ["World"])[0];
  const tag = (tags.find(([, r]) => r.test(hay)) || ["Progress"])[0];
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
  ["United States", -98, 39, "u\\.s\\.|usa|american|california|texas|new york|florida|washington state|oregon|colorado|alaska|hawaii|chicago|boston|michigan|usa|stan[óa]?w? zjednoczon|stany zjednoczone|amerykań|amerykan"], ["Canada", -100, 58, "canadian|ontario|quebec|british columbia|alberta|toronto|vancouver|kanad"], ["Mexico", -102, 23, "mexican|meksyk"], ["Brazil", -52, -10, "brazilian|amazon rainforest|são paulo|sao paulo|rio de janeiro|brazyli"], ["Argentina", -64, -34, "argentine|argentinian|patagonia|argentyn"], ["Chile", -71, -33, "chilean"], ["Peru", -75, -10, "peruvian"], ["Colombia", -73, 4, "colombian"], ["Costa Rica", -84, 10, "costa rican"], ["Ecuador", -78, -1, "galápagos|galapagos|ecuadorian"],
  ["United Kingdom", -2, 54, "uk\\b|britain|british|england|english|scotland|scottish|wales|welsh|london|northern ireland|wielk[aiej]+ brytani|brytyj|angli|londyn|szkocj"], ["Ireland", -8, 53, "irish|dublin|irlandi"], ["France", 2, 46, "french|paris|francj|francusk|paryż"], ["Spain", -4, 40, "spanish|madrid|barcelona|hiszpani|hiszpańsk"], ["Portugal", -8, 39, "portuguese|lisbon|portugali"], ["Germany", 10, 51, "german|berlin|niemc|niemieck|berlin"], ["Netherlands", 5, 52, "dutch|amsterdam|holandi|holendersk|niderland"], ["Belgium", 4, 50, "belgian|brussels|belgi"], ["Italy", 12, 42, "italian|rome|milan|sicily|włoch|włosk|rzym"], ["Switzerland", 8, 47, "swiss|szwajcari"], ["Austria", 14, 47, "austrian|vienna|austri"], ["Poland", 19, 52, "polish|warsaw|polsk|polac|w polsce|warszaw|krak[oó]w|gdańsk|gdansk|wrocław|wroclaw|poznań|poznan|łódź|lodz|lublin|katowic|szczecin|bydgoszcz|białystok|białymstok|rzesz[oó]w|toruń|torun|olsztyn|opol|kielc|gdyni|sopot|zakopan|tatr|bieszczad|mazur|podlas|wisł|białowie|pomorz|śląs|małopols|wielkopols|mazowsz"], ["Denmark", 10, 56, "danish|copenhagen|dani[ia]|duńsk"], ["Norway", 9, 61, "norwegian|oslo|norwegi|norwesk"], ["Sweden", 15, 62, "swedish|stockholm|szwecj|szwedzk"], ["Finland", 26, 64, "finnish|helsinki|finlandi|fińsk"], ["Iceland", -19, 65, "icelandic|islandi"], ["Greece", 22, 39, "greek|athens|grecj|greck"], ["Ukraine", 31, 49, "ukrainian|kyiv|ukrain"], ["Romania", 25, 46, "romanian|rumuni"], ["Czech Republic", 15, 50, "czech|prague|czech|czesk"],
  ["Kenya", 38, 0, "kenyan|nairobi|keni"], ["Nigeria", 8, 9, "nigerian|lagos|nigeri"], ["South Africa", 24, -29, "south african|cape town|johannesburg|rpa|republik[ai] południowej afryki"], ["Ethiopia", 39, 9, "ethiopian|etiopi"], ["Egypt", 30, 27, "egyptian|cairo|egip"], ["Ghana", -1, 8, "ghanaian"], ["Rwanda", 30, -2, "rwandan"], ["Uganda", 32, 1, "ugandan"], ["Tanzania", 35, -6, "tanzanian"], ["Morocco", -7, 32, "moroccan"], ["Madagascar", 47, -19, "malagasy"], ["Senegal", -14, 14, "senegalese"], ["Zimbabwe", 30, -19, "zimbabwean"], ["Mozambique", 35, -18, "mozambican"], ["Namibia", 17, -22, "namibian"], ["Botswana", 24, -22, "botswanan"],
  ["India", 79, 22, "indian|delhi|mumbai|bengaluru|kerala|w indiach|indyjsk"], ["China", 104, 35, "chinese|beijing|shanghai|chin[ayi]|chińsk"], ["Japan", 138, 37, "japanese|tokyo|japoni|japońsk"], ["South Korea", 128, 36, "korean|seoul|kore[ai] południow"], ["Indonesia", 117, -2, "indonesian|bali|jakarta|indonezj"], ["Philippines", 122, 12, "filipino|filipina|manila|filipin"], ["Vietnam", 106, 16, "vietnamese|wietnam"], ["Thailand", 101, 15, "thai\\b|bangkok|tajlandi"], ["Malaysia", 102, 4, "malaysian|borneo"], ["Singapore", 104, 1, "singapore"], ["Bangladesh", 90, 24, "bangladeshi|dhaka"], ["Pakistan", 70, 30, "pakistani"], ["Nepal", 84, 28, "nepali|nepalese|himalaya"], ["Sri Lanka", 81, 8, "sri lankan"], ["Kazakhstan", 67, 48, "kazakh|kazachstan"], ["Mongolia", 104, 47, "mongolian"], ["Saudi Arabia", 45, 24, "saudi"], ["Israel", 35, 31, "israeli"], ["Turkey", 35, 39, "turkish|istanbul|turcj|turecki"], ["United Arab Emirates", 54, 24, "uae|dubai|abu dhabi"],
  ["Australia", 134, -25, "australian|sydney|melbourne|queensland|tasmania|great barrier reef|australi"], ["New Zealand", 174, -41, "new zealander|kiwi|auckland|aotearoa|māori|maori|now[aejy]+ zelandi"],
];
// English and Polish names. Matched at the start of a word (works with letters like ł or ż too).
const PLACE_RE = PLACE_LIST.map(([n, lon, lat, extra]) => [n, [lon, lat], new RegExp(`(?<!\\p{L})(${n.replace(/ /g, "\\s")}${extra ? "|" + extra : ""})`, "iu")]);
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
