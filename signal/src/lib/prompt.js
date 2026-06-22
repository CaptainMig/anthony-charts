// ---------------------------------------------------------------------------
// Shared scoring prompt + response parsing.
//
// Imported by BOTH the browser client (src/lib/scoring.js) and the serverless
// function (api/score.js) so the rubric can never drift between them.
// ---------------------------------------------------------------------------
import { VERDICTS, VERDICT_DEFINITIONS } from '../config.js';

const VALID_VERDICTS = new Set(VERDICTS);
const VALID_BIAS = new Set(['LEFT', 'CENTER', 'RIGHT']);

const DEFINITIONS_BLOCK = VERDICTS.map((v) => `- ${v} = ${VERDICT_DEFINITIONS[v]}`).join('\n');

export const SYSTEM_PROMPT = `You are Signal, a media integrity scanner derived from the NERVA decision-integrity rubric. You score ONE news headline at a time against a fixed rubric and return ONLY compact JSON — no prose, no markdown, no code fences.

Verdict definitions:
${DEFINITIONS_BLOCK}

Also assess:
- bias: the political lean the HEADLINE'S FRAMING signals (LEFT, CENTER, or RIGHT) — judge the wording, not the outlet.
- truth: 1-10, how factually grounded and checkable the claim is (10 = fully verifiable fact, 1 = unfounded).
- sens: 1-10, sensationalism of the language (1 = flat/neutral, 10 = maximally inflammatory).
- click: 1-10, clickbait engineering (1 = informative, 10 = pure curiosity-gap bait).

Return exactly this JSON shape and nothing else:
{"verdict":"VERIFIED|CONTEXTUAL|CONTESTED|UNVERIFIED|MISLEADING","bias":"LEFT|CENTER|RIGHT","truth":1-10,"sens":1-10,"click":1-10}`;

// The per-headline user turn.
export function userContent(headline, publication) {
  return `Headline: "${headline}"\nPublication: ${publication}\n\nScore it. Return only the JSON object.`;
}

function clampScore(n) {
  const v = Math.round(Number(n));
  if (!Number.isFinite(v)) return 5;
  return Math.min(10, Math.max(1, v));
}

// Pull the first JSON object out of the model's text and normalize it.
// Throws if there is no parseable object or the verdict is invalid.
export function parseScore(text) {
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
