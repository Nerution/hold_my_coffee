// News outlets the server reads. Edit this list to add or remove sources.
//
// kind "positive": the outlet publishes mostly constructive or solutions journalism,
//   so stories are kept unless they look clearly negative.
// kind "general": a general or science outlet. A story is kept only when it shows a
//   clear positive signal and no negative one (or when the AI step judges it positive).
import { readFileSync } from "node:fs";

const DEFAULT_FEEDS = [
  { source: "Positive News", url: "https://www.positive.news/feed/", kind: "positive" },
  { source: "Good News Network", url: "https://www.goodnewsnetwork.org/feed/", kind: "positive" },
  { source: "Reasons to be Cheerful", url: "https://reasonstobecheerful.world/feed/", kind: "positive" },
  { source: "The Optimist Daily", url: "https://www.optimistdaily.com/feed/", kind: "positive" },
  { source: "The Guardian", url: "https://www.theguardian.com/world/series/the-upside/rss", kind: "positive" },
  { source: "BBC News", url: "https://feeds.bbci.co.uk/news/science_and_environment/rss.xml", kind: "general" },
  { source: "The Guardian", url: "https://www.theguardian.com/environment/rss", kind: "general" },
  { source: "ScienceDaily", url: "https://www.sciencedaily.com/rss/top/science.xml", kind: "general" },
  { source: "NASA", url: "https://www.nasa.gov/news-release/feed/", kind: "general" },
  { source: "Mongabay", url: "https://news.mongabay.com/feed/", kind: "general" },
  { source: "Yale Environment 360", url: "https://e360.yale.edu/feed.xml", kind: "general" },
  { source: "NPR", url: "https://feeds.npr.org/1007/rss.xml", kind: "general" },
  { source: "Smithsonian Magazine", url: "https://www.smithsonianmag.com/rss/latest_articles/", kind: "general" },
];

// GOOD_THINGS_FEEDS can point to a JSON file with the same shape, to use a different list.
export const FEEDS = process.env.GOOD_THINGS_FEEDS
  ? JSON.parse(readFileSync(process.env.GOOD_THINGS_FEEDS, "utf8"))
  : DEFAULT_FEEDS;
