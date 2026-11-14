// Where the news comes from. Edit these lists to add or remove sources, then run
// `npm run check-feeds` to see which feeds answer and how many stories each one gives.
//
// kind "positive": the outlet publishes mostly constructive or solutions journalism,
//   so stories are kept unless they read as clearly negative.
// kind "general":  a general, science or specialist outlet. A story is kept only when it
//   shows a clear positive signal and no negative one (or when AI review judges it positive).
// kind "search":   a Google News search. Results come from thousands of outlets, including
//   small local papers; only headlines with a positive signal and no negative one are kept.
import { readFileSync } from "node:fs";

const feed = (source, url, kind = "general") => ({ source, url, kind });

const DEFAULT_FEEDS = [
  // Constructive and solutions journalism
  feed("Positive News", "https://www.positive.news/feed/", "positive"),
  feed("Good News Network", "https://www.goodnewsnetwork.org/feed/", "positive"),
  feed("Reasons to be Cheerful", "https://reasonstobecheerful.world/feed/", "positive"),
  feed("The Optimist Daily", "https://www.optimistdaily.com/feed/", "positive"),
  feed("The Guardian", "https://www.theguardian.com/world/series/the-upside/rss", "positive"),
  feed("YES! Magazine", "https://www.yesmagazine.org/feed", "positive"),
  feed("The Better India", "https://thebetterindia.com/feed/", "positive"),
  feed("Shareable", "https://www.shareable.net/feed/", "positive"),
  feed("Anthropocene Magazine", "https://www.anthropocenemagazine.org/feed/", "positive"),

  // Environment, climate and conservation (many are small independent magazines)
  feed("Mongabay", "https://news.mongabay.com/feed/"),
  feed("Yale Environment 360", "https://e360.yale.edu/feed.xml"),
  feed("The Guardian", "https://www.theguardian.com/environment/rss"),
  feed("Ensia", "https://ensia.com/feed/"),
  feed("Grist", "https://grist.org/feed/"),
  feed("Hakai Magazine", "https://hakaimagazine.com/feed/"),
  feed("The Revelator", "https://therevelator.org/feed/"),
  feed("Carbon Brief", "https://www.carbonbrief.org/feed/"),
  feed("Inhabitat", "https://inhabitat.com/feed/"),
  feed("CleanTechnica", "https://cleantechnica.com/feed/"),
  feed("Rewilding Europe", "https://rewildingeurope.com/feed/"),

  // Science, health, space and technology
  feed("ScienceDaily", "https://www.sciencedaily.com/rss/top/science.xml"),
  feed("Phys.org", "https://phys.org/rss-feed/"),
  feed("Medical Xpress", "https://medicalxpress.com/rss-feed/"),
  feed("Tech Xplore", "https://techxplore.com/rss-feed/"),
  feed("Science News", "https://www.sciencenews.org/feed"),
  feed("Quanta Magazine", "https://www.quantamagazine.org/feed/"),
  feed("New Atlas", "https://newatlas.com/index.rss"),
  feed("MIT News", "https://news.mit.edu/rss/feed"),
  feed("The Conversation", "https://theconversation.com/global/articles.atom"),
  feed("NIH", "https://www.nih.gov/news-releases/feed.xml"),
  feed("NASA", "https://www.nasa.gov/news-release/feed/"),
  feed("ESA", "https://www.esa.int/rssfeed/Our_Activities/Space_News"),
  feed("Smithsonian Magazine", "https://www.smithsonianmag.com/rss/latest_articles/"),
  feed("NPR", "https://feeds.npr.org/1007/rss.xml"),
  feed("BBC News", "https://feeds.bbci.co.uk/news/science_and_environment/rss.xml"),

  // Education, culture and communities
  feed("The Hechinger Report", "https://hechingerreport.org/feed/"),
  feed("Hyperallergic", "https://hyperallergic.com/feed/"),
  feed("Colossal", "https://www.thisiscolossal.com/feed/"),

  // World and regional news in English
  feed("UN News", "https://news.un.org/feed/subscribe/en/news/all/rss.xml"),
  feed("Al Jazeera", "https://www.aljazeera.com/xml/rss/all.xml"),
  feed("DW", "https://rss.dw.com/rdf/rss-en-all"),
  feed("ABC News (Australia)", "https://www.abc.net.au/news/feed/51120/rss.xml"),
  feed("CBC News", "https://www.cbc.ca/webfeed/rss/rss-topstories"),
  feed("RNZ", "https://www.rnz.co.nz/rss/national.xml"),
  feed("Notes from Poland", "https://notesfrompoland.com/feed/"),
];

// Google News searches. Each runs in one Google News edition and covers the last 7 days.
const google = (label, q, edition = "US:en") => {
  const [gl, hl] = edition.split(":");
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(q + " when:7d")}&hl=${hl}-${gl}&gl=${gl}&ceid=${gl}:${hl}`;
  return { source: "Google News", label: `${label} (${gl})`, url, kind: "search" };
};
const TOPIC_SEARCHES = [
  ["Wildlife recovery", '"endangered" (recovery OR rebound OR "back from" OR "returns to")'],
  ["Species found again", '("first time in" OR "rediscovered" OR "spotted again") (species OR wildlife OR bird)'],
  ["New species", '"new species" discovered'],
  ["Medical progress", '(breakthrough OR "promising results") (treatment OR therapy OR vaccine) trial'],
  ["Clean energy records", '(renewable OR solar OR wind) (record OR milestone)'],
  ["Restoration", '(restored OR restoration OR rewilding OR reforestation) (river OR wetland OR reef OR forest)'],
  ["Falling numbers", '"record low" (deaths OR poverty OR emissions OR crime OR unemployment)'],
  ["Community help", 'volunteers (rebuild OR donated OR "came together" OR helped) community'],
  ["Education", '("literacy rates" OR "graduation rates" OR "test scores") (improve OR rise OR record)'],
  ["Kindness", '("act of kindness" OR "good samaritan" OR "pays it forward")'],
];
const BROAD_POSITIVE = '("good news" OR breakthrough OR "record low" OR restored OR milestone OR volunteers OR "first ever")';
const EDITIONS = ["GB:en", "IN:en", "AU:en", "CA:en", "IE:en", "KE:en", "NG:en", "ZA:en", "PH:en", "SG:en"];
const DEFAULT_SEARCHES = [
  ...TOPIC_SEARCHES.map(([label, q]) => google(label, q)),
  ...EDITIONS.map(e => google("Good news", BROAD_POSITIVE, e)),
];

// Outlets never shown, even when a search finds them: tabloids that reliability reviews flag,
// and press-release wires (adverts written by companies, not journalism). Matched on the outlet name.
export const BLOCKED_SOURCES = [
  "Daily Mail", "MailOnline", "The Sun", "Daily Star", "Daily Express", "Express.co.uk", "New York Post",
  "PR Newswire", "GlobeNewswire", "Business Wire", "Accesswire", "EIN Presswire", "Newsfile", "PRWeb", "openPR",
];

// GOOD_THINGS_FEEDS can point to a JSON file with your own list (same shape: source, url, kind).
// GOOD_THINGS_SEARCH=off turns the Google News searches off.
export const FEEDS = process.env.GOOD_THINGS_FEEDS
  ? JSON.parse(readFileSync(process.env.GOOD_THINGS_FEEDS, "utf8"))
  : [...DEFAULT_FEEDS, ...(process.env.GOOD_THINGS_SEARCH === "off" ? [] : DEFAULT_SEARCHES)];
