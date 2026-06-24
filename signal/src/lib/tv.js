// ---------------------------------------------------------------------------
// Live TV — OFF BY DEFAULT. Companion to the audit tool, never the centerpiece.
//
// HARD LEGAL RULE: the ONLY permitted video is the official YouTube IFRAME
// EMBED of a broadcaster's own public live-news channel (YouTube licenses these
// for embedding by design). No scraping, proxying, hotlinking, or reframing of
// any stream from any site. No sports. Nothing else.
//
// We use the channel live_stream embed so the rail always resolves the
// broadcaster's CURRENT live news stream without us tracking rotating video IDs.
//
// ⚠️ VERIFY THE CHANNEL IDS: these are best-effort and could not be confirmed
// from the build sandbox (no outbound network). Each should be checked against
// the broadcaster's official YouTube channel; swap in a specific `videoId` if a
// channel's live_stream embed doesn't resolve. A wrong/blocked ID degrades to
// "stream unavailable" — it never breaks the layout.
// ---------------------------------------------------------------------------

export const LIVE_TV_CHANNELS = [
  { name: 'ABC News Live', channelId: 'UCBi2mrWuNuyYy4gbM6fU18Q' },
  { name: 'Sky News', channelId: 'UCoMdktPbSTixAyNGwb-UYkQ' },
  { name: 'NBC News NOW', channelId: 'UCeY0bbntWzzVIaj2z3QigXg' },
  { name: 'Al Jazeera English', channelId: 'UCNye-wNBqNL5ZzHSJj3l8Bg' },
  { name: 'Bloomberg Television', channelId: 'UCIALMKvObZNtJ6AmdCLP7Lg' },
];

// Build the official YouTube embed URL. Muted by default; autoplay applies only
// because the iframe is mounted solely AFTER a user clicks a channel.
export function embedUrl(ch) {
  const params = 'autoplay=1&mute=1&rel=0';
  return ch.videoId
    ? `https://www.youtube.com/embed/${ch.videoId}?${params}`
    : `https://www.youtube.com/embed/live_stream?channel=${ch.channelId}&${params}`;
}
