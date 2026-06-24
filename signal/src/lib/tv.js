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
// ⚠️ VERIFY THE CHANNEL IDS: best-effort, not confirmable from the build sandbox
// (no outbound network). ABC News Live and Sky News were reported not playing —
// their channel `live_stream` embeds don't resolve (likely embedding disabled on
// their live, which no ID can fix), so they're replaced here with DW News and
// France 24 English, two reliably embeddable 24/7 English news streams. To bring
// a specific broadcaster back, set a `videoId` (the 11-char ID from that
// channel's live video → Share → Embed) instead of `channelId`. A bad/blocked
// entry degrades to "stream unavailable" — it never breaks the layout.
// ---------------------------------------------------------------------------

export const LIVE_TV_CHANNELS = [
  { name: 'NBC News NOW', channelId: 'UCeY0bbntWzzVIaj2z3QigXg' },
  { name: 'Al Jazeera English', channelId: 'UCNye-wNBqNL5ZzHSJj3l8Bg' },
  { name: 'Bloomberg Television', channelId: 'UCIALMKvObZNtJ6AmdCLP7Lg' },
  { name: 'DW News', channelId: 'UCknLrEdhRCp1aegoMqRaCZg' },
  { name: 'France 24 English', channelId: 'UCQfwfsi5VrQ8yKZ-UWmAEFg' },
];

// Build the official YouTube embed URL. Muted by default; autoplay applies only
// because the iframe is mounted solely AFTER a user clicks a channel.
export function embedUrl(ch) {
  const params = 'autoplay=1&mute=1&rel=0';
  return ch.videoId
    ? `https://www.youtube.com/embed/${ch.videoId}?${params}`
    : `https://www.youtube.com/embed/live_stream?channel=${ch.channelId}&${params}`;
}
