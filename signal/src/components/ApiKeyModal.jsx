import { useState } from 'react';
import { ACCENT } from '../config.js';

// Client-side app: the Anthropic key is supplied by the user and kept in
// localStorage on their own machine. We never transmit it anywhere but the
// Anthropic API.
export default function ApiKeyModal({ open, initialKey, onSave, onClose }) {
  const [value, setValue] = useState(initialKey || '');
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-sm border-hair border-white/15 bg-ink p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="font-display text-lg font-semibold text-[#e8e4dc]">Anthropic API key</h3>
        <p className="mt-2 font-mono text-[11px] leading-relaxed text-white/45">
          Signal scores headlines client-side with the Claude API. Your key is stored only in this
          browser&apos;s localStorage and sent only to Anthropic. Get one at console.anthropic.com.
        </p>

        <input
          type="password"
          value={value}
          autoFocus
          spellCheck={false}
          placeholder="sk-ant-…"
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && value.trim() && onSave(value.trim())}
          className="mt-4 w-full rounded-sm border-hair border-white/20 bg-white/[0.03] px-3 py-2 font-mono text-sm text-white/90 outline-none focus:border-teal"
        />

        <div className="mt-5 flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-sm px-3 py-1.5 font-mono text-[11px] uppercase tracking-wider text-white/50 hover:text-white/80"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!value.trim()}
            onClick={() => onSave(value.trim())}
            className="rounded-sm px-4 py-1.5 font-mono text-[11px] font-semibold uppercase tracking-wider text-ink disabled:opacity-50"
            style={{ backgroundColor: ACCENT }}
          >
            Save & scan
          </button>
        </div>
      </div>
    </div>
  );
}
