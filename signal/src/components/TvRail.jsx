import { useState } from 'react';
import { LIVE_TV_CHANNELS, embedUrl } from '../lib/tv.js';

// Optional live-news rail. Companion, not centerpiece — a docked right rail that
// only exists when toggled on. No iframe (and therefore zero video network) ever
// mounts until the user both opens the rail AND picks a channel.
export default function TvRail({ open, onClose }) {
  const [selected, setSelected] = useState(null);
  const [failed, setFailed] = useState(false);

  // OFF (default): render nothing at all — no iframe, no autoplay, no network.
  if (!open) return null;

  return (
    <aside
      className="fixed right-0 top-0 z-40 flex h-full w-full flex-col border-l-hair border-white/15 sm:w-[360px]"
      style={{ backgroundColor: '#14110d' }}
    >
      <header className="flex items-center justify-between border-b-hair border-white/10 px-4 py-3">
        <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-white/55">
          Live TV
        </span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close live TV"
          className="font-mono text-sm text-white/40 hover:text-white/80"
        >
          ✕
        </button>
      </header>

      <div className="flex flex-wrap gap-1.5 border-b-hair border-white/10 px-4 py-3">
        {LIVE_TV_CHANNELS.map((ch) => {
          const active = selected?.name === ch.name;
          return (
            <button
              key={ch.name}
              type="button"
              onClick={() => {
                setSelected(ch);
                setFailed(false);
              }}
              className="rounded-sm border-hair px-2 py-1 font-mono text-[10px] uppercase tracking-wider transition-colors"
              style={{
                color: active ? '#0f0d0a' : 'rgba(232,228,220,0.7)',
                backgroundColor: active ? '#e8e4dc' : 'transparent',
                borderColor: 'rgba(255,255,255,0.15)',
              }}
            >
              {ch.name}
            </button>
          );
        })}
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4">
        {!selected ? (
          <p className="font-mono text-[12px] leading-relaxed text-white/40">
            Pick a channel to start. No video loads until you do.
          </p>
        ) : failed ? (
          <p className="font-mono text-[12px] text-white/45">Stream unavailable.</p>
        ) : (
          <>
            <div className="aspect-video w-full overflow-hidden rounded-sm bg-black">
              <iframe
                key={selected.name}
                src={embedUrl(selected)}
                title={`${selected.name} — official YouTube live stream`}
                loading="lazy"
                allow="autoplay; encrypted-media; picture-in-picture"
                allowFullScreen
                onError={() => setFailed(true)}
                className="h-full w-full border-0"
              />
            </div>
            <p className="mt-2 font-mono text-[11px] text-white/60">{selected.name}</p>
            <p className="font-mono text-[10px] text-white/30">
              Official YouTube live embed. If blank, the stream may be offline or
              region-blocked.
            </p>
          </>
        )}
      </div>

      <footer className="border-t-hair border-white/10 px-4 py-3">
        <p className="font-mono text-[10px] leading-relaxed text-white/30">
          Official broadcaster YouTube live embeds only — a companion to the audit, not a
          source of record. No streams are scraped, proxied, or reframed.
        </p>
      </footer>
    </aside>
  );
}
