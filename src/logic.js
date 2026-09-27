// QVAC Changelog Entry Writer — core logic.
// completion() does the actual generation; a small set of deterministic
// guards catch unusable model output (refusals, empty text, preamble).

import { completion } from "@qvac/sdk";

function looksUnusable(text) {
  if (!text || text.trim().length === 0) return true;
  if (text.length > 1200) return true;
  const bad = ["i cannot", "i can't", "as an ai", "i'm not able", "i am not able", "i apologize"];
  const lower = text.toLowerCase();
  return bad.some((phrase) => lower.includes(phrase));
}

function stripPreamble(text) {
  return text
    .trim()
    .replace(/^here'?s?[^:\n]*:\s*/i, "")
    .replace(/^sure[,!]?\s*/i, "")
    .trim()
    .replace(/^["'`]+|["'`]+$/g, "")
    .trim();
}

const ADDED_WORDS = ["add", "new ", "introduce", "implement"];
const FIXED_WORDS = ["fix", "bug", "crash", "leak", "error", "issue", "broken", "resolve"];
// everything else defaults to "Changed"

// The small model often skips the Added/Changed/Fixed section headers
// entirely (or mislabels an obvious "fixed" item as "Changed"), so once we
// have bullet-worthy text we deterministically re-bucket each line by
// keyword instead of trusting the model's own section placement.
function classify(line) {
  const lower = line.toLowerCase();
  if (FIXED_WORDS.some((w) => lower.includes(w))) return "Fixed";
  if (ADDED_WORDS.some((w) => lower.includes(w))) return "Added";
  return "Changed";
}

function splitClauses(text) {
  return text
    .split(/\n|,(?!\d)| and (?=\w)|\.\s+/i)
    .map((s) => s.replace(/^[-•*]\s*/, "").trim())
    .filter(Boolean);
}

const SECTION_ORDER = ["Added", "Changed", "Fixed"];

// Shared by both the fully-deterministic path (bucketize) and the
// per-clause-polished path (generate) so the section ordering/formatting
// logic only lives in one place instead of being duplicated.
function formatBuckets(buckets) {
  return SECTION_ORDER.filter((k) => buckets[k].length > 0)
    .map((k) => `${k}\n${buckets[k].map((i) => `- ${i}`).join("\n")}`)
    .join("\n\n");
}

function bucketize(text, original) {
  const lines = splitClauses(text);
  const source = lines.length > 0 ? lines : splitClauses(original);
  const buckets = { Added: [], Changed: [], Fixed: [] };
  for (const line of source) {
    buckets[classify(line)].push(line[0].toUpperCase() + line.slice(1));
  }
  return formatBuckets(buckets);
}

function significantWords(text) {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 3)
  );
}

// Asking the model to restructure the whole list of changes in one shot
// invited it to invent several unrelated extra changes. Instead we split
// the input into clauses deterministically, and ask the model to polish
// ONE clause at a time into a short changelog bullet — a much smaller
// surface for it to hallucinate on. Any rewrite that doesn't share a
// significant word with its own source clause, or that looks longer/wilder
// than the source, is discarded in favor of the original clause text.
async function polishClause(modelId, clause) {
  const run = completion({
    modelId,
    history: [
      {
        role: "system",
        content:
          "Rewrite the given single changelog change as one short, clean sentence for a changelog bullet. Do NOT add any new information, numbers, or details that are not already in the text — only clean up grammar and phrasing. Reply with ONLY the rewritten sentence, no bullet mark, no preamble.",
      },
      { role: "user", content: "backend now caches results for 5 minutes" },
      { role: "assistant", content: "Backend now caches results for 5 minutes" },
      { role: "user", content: clause },
    ],
    stream: true,
    completionOpts: { temperature: 0.2, maxTokens: 60 },
  });

  let text = "";
  for await (const token of run.tokenStream) text += token;
  text = stripPreamble(text).split("\n")[0].trim();

  const clauseWords = significantWords(clause);
  const rewriteWords = significantWords(text);
  const overlap = [...rewriteWords].filter((w) => clauseWords.has(w)).length;
  const looksSafe = !looksUnusable(text) && text.length > 0 && text.length <= clause.length * 3 + 20 && overlap >= Math.min(1, clauseWords.size);

  const base = looksSafe ? text : clause;
  return base[0].toUpperCase() + base.slice(1).replace(/[.]+$/, "");
}

const FALLBACK = (v) => bucketize(v, v);

export async function generate(modelId, changes) {
  const clauses = splitClauses(changes);
  if (clauses.length === 0) return { result: FALLBACK(changes) };

  const buckets = { Added: [], Changed: [], Fixed: [] };
  for (const clause of clauses) {
    const category = classify(clause);
    const polished = await polishClause(modelId, clause);
    buckets[category].push(polished);
  }

  return { result: formatBuckets(buckets) };
}
