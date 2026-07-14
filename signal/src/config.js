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
  // rss.cnn.com is a FeedBurner-era host that stopped serving reliably (one of
  // the 7 outright feed failures in the July 2026 sweep) — recovered
  // source-restricted through Google News like AP/Reuters/WSJ, labeled honestly.
  {
    name: 'CNN (via Google News)',
    owner: 'Warner Bros. Discovery',
    url: 'https://news.google.com/rss/search?q=site:cnn.com+when:1d&hl=en-US&gl=US&ceid=US:en',
    thinBody: true,
  },
  { name: 'CNBC', owner: 'Comcast / NBCUniversal', url: 'https://www.cnbc.com/id/100727362/device/rss/rss.html' },
  { name: 'The Hill', owner: 'Nexstar Media', url: 'https://thehill.com/feed/' },
  // www.politico.com/rss/politicopicks.xml failed in the July 2026 sweep;
  // rss.politico.com is Politico's canonical feed host and still publishes.
  { name: 'Politico', owner: 'Axel Springer', url: 'https://rss.politico.com/politics-news.xml' },
  { name: 'The Guardian', owner: 'Scott Trust', url: 'https://www.theguardian.com/world/rss' },
  // WSJ's direct endpoint (feeds.a.dj.com/rss/RSSWorldNews.xml) froze around
  // Jan 2025 and now serves an archived snapshot — live scans showed every item
  // ~500+ days old. Recovered source-restricted through Google News like
  // AP/Reuters above (headline + thin snippet, so thinBody).
  {
    name: 'WSJ (via Google News)',
    owner: 'News Corp',
    url: 'https://news.google.com/rss/search?q=site:wsj.com+when:1d&hl=en-US&gl=US&ceid=US:en',
    thinBody: true,
  },
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

// Feed hygiene (see lib/feeds.js). Items with a parseable published date older
// than this are dropped before scoring — never counted in totals, aggregates,
// the Briefing, or history. Items with NO parseable date are kept but tagged
// `undated` (not assumed fresh or stale).
export const MAX_ITEM_AGE_HOURS = 48;
// A cleaned "headline" shorter than this is rejected as malformed (feed junk,
// nav fragments), as is anything still containing HTML markup after cleaning.
export const MIN_HEADLINE_CHARS = 15;

// Anthropic model + concurrency for the scoring queue.
export const MODEL = 'claude-sonnet-4-6';
export const CONCURRENCY = 3;

// The five MODEL verdicts, in display order, with their palette colors and the
// definitions injected into every scoring prompt. This is the set the model may
// return — parseScore rejects anything else.
export const VERDICTS = ['VERIFIED', 'CONTEXTUAL', 'CONTESTED', 'UNVERIFIED', 'MISLEADING'];

// Display set: PROVISIONAL is a policy verdict, never a model verdict. A
// headline-only sweep can't confirm distortion (it never saw the article body),
// so a sweep MISLEADING is downgraded to PROVISIONAL until full-text scoring
// confirms or clears it. See lib/prompt.js provisionalize().
export const DISPLAY_VERDICTS = [
  'VERIFIED',
  'CONTEXTUAL',
  'CONTESTED',
  'UNVERIFIED',
  'PROVISIONAL',
  'MISLEADING',
];

// Display labels. Internal verdict tokens are load-bearing and stable — the
// model emits them, cached scans and share payloads carry them — so a rename
// is a DISPLAY mapping, never a data migration. UNVERIFIED reads as a judgment
// on the outlet; UNVERIFIABLE says what it means: the claim can't be verified
// from what the article/source gives us.
export const VERDICT_LABELS = { UNVERIFIED: 'UNVERIFIABLE' };
export const verdictLabel = (v) => VERDICT_LABELS[v] || v;

export const VERDICT_COLORS = {
  VERIFIED: '#6fd49a',
  CONTEXTUAL: '#8bbef0',
  CONTESTED: '#c5a0f0',
  UNVERIFIED: '#c8971f',
  // Policy verdict: sweep-flagged as misleading but awaiting full-text
  // confirmation — deliberately between UNVERIFIED amber and MISLEADING red.
  PROVISIONAL: '#e0876a',
  MISLEADING: '#f08080',
  // Not a model verdict: the scoring call failed (timeout/error) and the row is
  // shown grey and excluded from every average. See lib/scoring.js.
  UNSCORED: '#8d939e',
};

export const VERDICT_DEFINITIONS = {
  VERIFIED: 'factual, sourced, checkable claim, no spin, headline matches story',
  CONTEXTUAL: 'true but missing important context that changes meaning',
  CONTESTED: 'facts genuinely disputed, or editorially slanted but not false',
  UNVERIFIED: 'anonymous sources, speculation as fact, premature conclusions',
  PROVISIONAL: 'headline-only sweep flagged distortion — held until the full text confirms or clears it',
  MISLEADING: 'engineered to trigger reaction, distorts or omits facts for outrage/clicks — full-text confirmed',
};

// Verdicts that count toward Framing Integrity.
export const INTEGRITY_VERDICTS = ['VERIFIED', 'CONTEXTUAL'];

export const ACCENT = '#5aabb0';
export const INK = '#0f0d0a';

export const STORAGE_KEYS = {
  lastScan: 'signal.lastScan',
  // Persisted full-text verdicts, keyed by stable article id — score once on
  // first detail view, serve from here forever after. See lib/fulltextStore.js.
  fulltextVerdicts: 'signal.fulltextVerdicts',
};
