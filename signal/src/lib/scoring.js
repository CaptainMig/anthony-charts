// ---------------------------------------------------------------------------
// Headline scoring via the Anthropic API (client-side, one call per headline).
// ---------------------------------------------------------------------------
import Anthropic from '@anthropic-ai/sdk';
import { MODEL, CONCURRENCY, VERDICTS, VERDICT_DEFINITIONS } from '../config.js';

const VALID_VERDICTS = new Set(VERDICTS);
const VALID_BIAS = new Set(['LEFT', 'CENTER', 'RIGHT']);

const DEFINITIONS_BLOCK = VERDICTS.map((v) => `- ${v} = ${VERDICT_DEFINITIONS[v]}`).join('\n');

const SYSTEM_PROMPT = `You are Signal, a media integrity scanner derived from the NERVA decision-integrity rubric. You score ONE news headline at a time against a fixed rubric and return ONLY compact JSON — no prose, no markdown, no code fences.

Verdict definitions:
${DEFINITIONS_BLOCK}

Also assess:
- bias: the political lean the HEADLINE'S FRAMING signals (LEFT, CENTER, or RIGHT) — judge the wording, not the outlet.
- truth: 1-10, how factually grounded and checkable the claim is (10 = fully verifiable fact, 1 = unfounded).
- sens: 1-10, sensationalism of the language (1 = flat/neutral, 10 = maximally inflammatory).
- click: 1-10, clickbait engineering (1 = informative, 10 = pure curiosity-gap bait).

Return exactly this JSON shape and nothing else:
{"verdict":"VERIFIED|CONTEXTUAL|CONTESTED|UNVERIFIED|MISLEADING","bias":"LEFT|CENTER|RIGHT","truth":1-10,"sens":1-10,"click":1-10}`;

// Build a fresh client per scan so a changed API key takes effect immediately.
export function makeClient(apiKey) {
  return new Anthropic({ apiKey, dangerouslyAllowBrowser: true });
}

function clampScore(n) {
  const v = Math.round(Number(n));
  if (!Number.isFinite(v)) return 5;
  return Math.min(10, Math.max(1, v));
}

// Pull the first JSON object out of the model's text, tolerating stray wrapping.
function parseScore(text) {
  const match = text && text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('no JSON in response');
  const raw = JSON.parse(match[0]);

  const verdict = String(raw.verdict || '').toUpperCase();
  const bias = String(raw.bias || '').toUpperCase();
  if (!VALID_VERDICTS.has(verdict)) throw new Error(`bad verdict: ${verdict}`);

  return {
    verdict,
    bias: VALID_BIAS.has(bias) ? bias : 'CENTER',
    truth: clampScore(raw.truth),
    sens: clampScore(raw.sens),
    click: clampScore(raw.click),
  };
}

// Score one headline. Retries once; on total failure marks it UNVERIFIED.
async function scoreOne(client, headline) {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await client.messages.create({
        model: MODEL,
        max_tokens: 120,
        system: SYSTEM_PROMPT,
        messages: [
          {
            role: 'user',
            content: `Headline: "${headline.title}"\nPublication: ${headline.publication}\n\nScore it. Return only the JSON object.`,
          },
        ],
      });
      const text = res.content
        .filter((b) => b.type === 'text')
        .map((b) => b.text)
        .join('');
      return parseScore(text);
    } catch (err) {
      if (attempt === 1) {
        // Final failure — degrade to UNVERIFIED so the row still renders.
        return { verdict: 'UNVERIFIED', bias: 'CENTER', truth: 1, sens: 5, click: 5, failed: true };
      }
    }
  }
}

/**
 * Score every headline with a fixed-concurrency worker pool.
 *
 * @param client      Anthropic client from makeClient().
 * @param headlines   array of headline objects.
 * @param onScored    (headline, score) => void — fires as each one finishes.
 * @param shouldStop  () => boolean — return true to abort the run early.
 */
export async function scoreHeadlines(client, headlines, { onScored, shouldStop } = {}) {
  let next = 0;

  async function worker() {
    while (true) {
      if (shouldStop?.()) return;
      const i = next++;
      if (i >= headlines.length) return;
      const headline = headlines[i];
      const score = await scoreOne(client, headline);
      if (shouldStop?.()) return;
      onScored?.(headline, score);
    }
  }

  const pool = Array.from({ length: Math.min(CONCURRENCY, headlines.length) }, worker);
  await Promise.all(pool);
}
