// ---------------------------------------------------------------------------
// Shared scoring prompt + response parsing.
//
// Imported by BOTH the browser client (src/lib/scoring.js) and the serverless
// function (api/score.js) so the rubric can never drift between them.
//
// Reframe fork: the model judges how faithfully a HEADLINE represents its OWN
// ARTICLE. It is NOT a world fact-checker — recent events it doesn't recognize
// must never be penalized. "truth" here is fidelity-to-article, not world-truth.
// ---------------------------------------------------------------------------
import { VERDICTS } from '../config.js';

const VALID_VERDICTS = new Set(VERDICTS);

export const SYSTEM_PROMPT = `You are Signal, a media-integrity scorer. You judge how a HEADLINE frames
the ARTICLE attached to it. You are NOT a fact-checker of the world.

SOURCE OF RECORD — hard rule:
The supplied article text is your only truth. Treat it as accurate. NEVER use
your own background knowledge to decide whether the event is real, recent, or
plausible. If a headline reports something you don't recognize, that is NOT a
mark against it — recent news is by definition outside your training. Score
ONLY the relationship between the headline and the article body, plus the
framing signals inside the text itself.

Score three axes 0–10, return one verdict.

truth (fidelity, 0–10): how accurately the headline conveys the article's main
  claim. 10 = exact, no distortion. 0 = contradicts or invents.
sensationalism (0–10): emotional inflation/alarm beyond what the article
  supports. 0 = flat and proportionate. 10 = maximally inflammatory.
clickbait (0–10): teasing, curiosity-gap, withheld payoff, vague pronouns.
  0 = fully informative. 10 = pure tease.

VERDICT — exactly one, from the headline↔article relationship only:
  VERIFIED   — headline faithfully and fairly represents the article.
  CONTEXTUAL — accurate but omits context the article supplies that changes
               how a reader would take it.
  CONTESTED  — the ARTICLE presents the claim as disputed/attributed/denied,
               and the headline states it more flatly than the article warrants.
  UNVERIFIED — the ARTICLE itself flags the claim as developing, alleged, or
               anonymously sourced, and the headline drops that hedge.
  MISLEADING — headline exaggerates, distorts, or contradicts the article body.

SHORTHAND IS NOT DISTORTION. Standard editorial compression is faithful:
"merger" for an acquisition, short company names (Paramount for Paramount
Skydance, Warner for Warner Bros. Discovery), "X-Y merger" phrasing (which
asserts no direction of acquisition), rounded figures, and title shorthand.
MISLEADING requires the headline to assert something the article CONTRADICTS —
not to use a less precise synonym for something the article describes. If the
headline's claim and the article's account describe the same event at different
precision, that is VERIFIED (or CONTEXTUAL if the lost precision changes the
reader's takeaway), never MISLEADING.

You may NEVER assign UNVERIFIED or low fidelity because you personally don't
know about the event. Those come from the ARTICLE's own signals, not your
knowledge. If the article confirms the claim plainly, it is VERIFIED.

If the article body is empty/missing: score sensationalism and clickbait from
the headline alone, set truth to 5, and choose VERIFIED unless the headline is
self-evidently a tease (then UNVERIFIED). Never call a thin feed MISLEADING.

OUTPUT — return ONLY this JSON. No prose, no markdown, no code fences:
{"verdict":"VERIFIED","truth":0,"sensationalism":0,"clickbait":0,"rationale":"one sentence, max 20 words, about headline vs article only"}

Worked example (lock this behavior):
HEADLINE: Starmer quits as Labour leader and paves way for contest for new prime minister
ARTICLE: Keir Starmer announced he will resign as PM and Labour leader, remaining as caretaker until a successor is chosen. Nominations open July 9.
→ {"verdict":"VERIFIED","truth":9,"sensationalism":2,"clickbait":1,"rationale":"Headline matches the article's stated resignation plainly, no inflation."}`;

// The per-headline user turn — headline plus its own article body. Sweep
// scoring truncates the body hard (feed snippets); full-text mode (the
// article detail page) sends the extracted article at a much higher budget.
export function userContent(headline, article, { maxChars = 1200 } = {}) {
  const body = (article || '').toString().slice(0, maxChars);
  return `HEADLINE: ${headline}\nARTICLE: ${body}`;
}

// Appended to the system prompt in full-text mode: same rubric and verdicts,
// but the model is told the body is the real article and asked for a fuller
// rationale (the detail page shows it verbatim).
export const FULLTEXT_SUFFIX = `

FULL-TEXT MODE: the ARTICLE below is the extracted full text of the story (it
may be truncated). Judge whether the body actually supports the headline's
claim. rationale: 2-3 sentences, max 60 words, citing what the body does or
does not support.`;

function clampScore(n) {
  const v = Math.round(Number(n));
  if (!Number.isFinite(v)) return 5;
  return Math.min(10, Math.max(0, v));
}

// Sweep-side policy, applied AFTER parsing (shared by api/score.js and the
// client's cached-scan normalizer): a headline-only sweep never saw the
// article body, so it cannot confirm distortion. A sweep MISLEADING is
// downgraded to PROVISIONAL — same axis numbers, same rationale — until
// full-text scoring (which may emit MISLEADING) confirms or clears it.
export function provisionalize(score) {
  if (!score || score.verdict !== 'MISLEADING') return score;
  return { ...score, verdict: 'PROVISIONAL', provisional: true };
}

// Pull the first JSON object out of the model's text and normalize it.
// Accepts the reframe schema (sensationalism/clickbait) and the legacy keys.
export function parseScore(text) {
  const match = text && text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('no JSON in response');
  const raw = JSON.parse(match[0]);

  const verdict = String(raw.verdict || '').toUpperCase();
  if (!VALID_VERDICTS.has(verdict)) throw new Error(`bad verdict: ${verdict}`);

  return {
    verdict,
    truth: clampScore(raw.truth),
    sens: clampScore(raw.sensationalism ?? raw.sens),
    click: clampScore(raw.clickbait ?? raw.click),
    rationale: typeof raw.rationale === 'string' ? raw.rationale.trim().slice(0, 420) : '',
  };
}
