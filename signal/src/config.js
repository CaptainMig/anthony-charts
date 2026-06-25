// ---------------------------------------------------------------------------
// Anthony Charts · Signal — static configuration
// ---------------------------------------------------------------------------

// News feeds. `name` is the short publication label shown in the UI, `owner`
// is the parent entity used for the secondary sort and the scorecard subtitle.
export const FEEDS = [
  // AP killed apnews.com/rss/* and Reuters discontinued public RSS — recover both
  // source-restricted through Google News. These return headline + thin snippet
  // (no full article body), so they are flagged `thinBody` and routed through the
  // scorer's empty-body path. See methodology panel.
  {
    name: 'AP (via Google News)',
    owner: 'Associated Press',
    url: 'https://news.google.com/rss/search?q=site:apnews.com+when:1d&hl=en-US&gl=US&ceid=US:en',
    thinBody: true,
  },
  {
    name: 'Reuters (via Google News)',
    owner: 'Thomson Reuters',
    url: 'https://news.google.com/rss/search?q=site:reuters.com+when:1d&hl=en-US&gl=US&ceid=US:en',
    thinBody: true,
  },
  { name: 'Washington Post', owner: 'Jeff Bezos / Nash Holdings', url: 'https://feeds.washingtonpost.com/rss/national' },
  { name: 'WaPo World', owner: 'Jeff Bezos / Nash Holdings', url: 'https://feeds.washingtonpost.com/rss/world' },
  { name: 'WaPo Politics', owner: 'Jeff Bezos / Nash Holdings', url: 'https://feeds.washingtonpost.com/rss/politics' },
  { name: 'BBC News', owner: 'BBC / UK Public', url: 'https://feeds.bbci.co.uk/news/rss.xml' },
  { name: 'BBC World', owner: 'BBC / UK Public', url: 'https://feeds.bbci.co.uk/news/world/rss.xml' },
  { name: 'NPR News', owner: 'NPR / Public', url: 'https://feeds.npr.org/1001/rss.xml' },
  { name: 'Fox News', owner: 'News Corp', url: 'https://moxie.foxnews.com/google-publisher/latest.xml' },
  { name: 'CBS News', owner: 'Paramount / CBS', url: 'https://www.cbsnews.com/latest/rss/main' },
  { name: 'ABC News', owner: 'Disney / ABC', url: 'https://abcnews.go.com/abcnews/usheadlines' },
  { name: 'NBC News', owner: 'Comcast / NBCUniversal', url: 'https://feeds.nbcnews.com/nbcnews/public/news' },
  { name: 'CNN', owner: 'Warner Bros. Discovery', url: 'https://rss.cnn.com/rss/cnn_topstories.rss' },
  { name: 'CNBC', owner: 'Comcast / NBCUniversal', url: 'https://www.cnbc.com/id/100727362/device/rss/rss.html' },
  { name: 'The Hill', owner: 'Nexstar Media', url: 'https://thehill.com/feed/' },
  { name: 'Politico', owner: 'Axel Springer', url: 'https://www.politico.com/rss/politicopicks.xml' },
  { name: 'The Guardian', owner: 'Scott Trust', url: 'https://www.theguardian.com/world/rss' },
  { name: 'WSJ', owner: 'News Corp', url: 'https://feeds.a.dj.com/rss/RSSWorldNews.xml' },
  { name: 'NY Times', owner: 'NYT Co.', url: 'https://rss.nytimes.com/services/xml/rss/nyt/US.xml' },
  { name: 'LA Times', owner: 'Patrick Soon-Shiong', url: 'https://www.latimes.com/world/rss2.0.xml' },
  // Added for owner-grouping (Part 2). Owner labels are load-bearing — they must
  // match their corporate parent exactly (NY Post shares News Corp with WSJ;
  // Sky shares Comcast with NBC/CNBC).
  { name: 'New York Post', owner: 'News Corp', url: 'https://nypost.com/feed/' },
  // Sky News primary feed; fallbacks if home.xml dies: .../world.xml, .../us.xml
  { name: 'Sky News', owner: 'Comcast', url: 'https://feeds.skynews.com/feeds/rss/home.xml' },
  { name: 'Fortune', owner: 'Fortune Media', url: 'https://fortune.com/feed/' },
  // FT is paywalled — flag thinBody so its emptied body routes into the scorer's
  // existing empty-body rule (Fidelity 5, VERIFIED unless a self-evident tease).
  { name: 'Financial Times', owner: 'Nikkei', url: 'https://www.ft.com/rss/home', thinBody: true },
];

export const HEADLINES_PER_FEED = 10;

// Anthropic model + concurrency for the scoring queue.
export const MODEL = 'claude-sonnet-4-6';
export const CONCURRENCY = 3;

// The five verdicts, in display order, with their palette colors and the
// definitions injected into every scoring prompt.
export const VERDICTS = ['VERIFIED', 'CONTEXTUAL', 'CONTESTED', 'UNVERIFIED', 'MISLEADING'];

export const VERDICT_COLORS = {
  VERIFIED: '#6fd49a',
  CONTEXTUAL: '#8bbef0',
  CONTESTED: '#c5a0f0',
  UNVERIFIED: '#c8971f',
  MISLEADING: '#f08080',
};

export const VERDICT_DEFINITIONS = {
  VERIFIED: 'factual, sourced, checkable claim, no spin, headline matches story',
  CONTEXTUAL: 'true but missing important context that changes meaning',
  CONTESTED: 'facts genuinely disputed, or editorially slanted but not false',
  UNVERIFIED: 'anonymous sources, speculation as fact, premature conclusions',
  MISLEADING: 'engineered to trigger reaction, distorts or omits facts for outrage/clicks',
};

// Verdicts that count toward Framing Integrity.
export const INTEGRITY_VERDICTS = ['VERIFIED', 'CONTEXTUAL'];

export const ACCENT = '#5aabb0';
export const INK = '#0f0d0a';

export const STORAGE_KEYS = {
  lastScan: 'signal.lastScan',
};

// Bump this whenever the cached scan's shape, the feed set, or the scoring
// changes. A cache stamped with an older version is discarded on load, so a
// returning visitor can never be stranded on a stale scan that a hard refresh
// won't clear (localStorage survives reloads; only a version/TTL check evicts
// it). Mirrors a fresh/incognito visit: empty state → prompt to scan.
export const CACHE_VERSION = 2;

// A cached scan older than this is treated as stale and ignored. Signal reports
// "the news right now," so a day-old scan shouldn't masquerade as current.
export const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours
