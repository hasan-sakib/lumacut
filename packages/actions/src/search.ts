import type { AnyAction } from "./registry.ts";

export interface SearchHit<Ctx> {
  action: AnyAction<Ctx>;
  score: number;
}

const normalize = (text: string): string =>
  text.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "");

/** How well one query word matches one field: exact word 100, word prefix 80, substring 60, scattered letters 10-30, else 0. */
export function tokenScore(token: string, field: string): number {
  const text = normalize(field);
  if (token === "" || text === "") return 0;
  const words = text.split(/[^a-z0-9]+/).filter(Boolean);
  if (words.includes(token)) return 100;
  if (words.some((w) => w.startsWith(token))) return 80;
  if (text.includes(token)) return 60;
  if (token.length < 3) return 0;
  // Letters in order but scattered ("splt" finds "split"): a weak match that favours short fields.
  let at = 0;
  for (const ch of token) {
    at = text.indexOf(ch, at);
    if (at < 0) return 0;
    at += 1;
  }
  return 10 + Math.round((token.length / text.length) * 20);
}

/** What a query word is matched against, and how much each field counts. */
function fieldsOf<Ctx>(action: AnyAction<Ctx>): [string, number][] {
  return [
    [action.title, 3],
    ...action.keywords.map((k): [string, number] => [k, 2]),
    [action.category, 1],
    [action.description, 0.5],
    [action.id, 0.5],
  ];
}

/**
 * Ranks actions for a palette query. Every word of the query must match something (title,
 * keywords, category, description or id); better fields and closer matches rank higher. An empty
 * query lists everything, by category then title.
 */
export function searchActions<Ctx>(
  actions: readonly AnyAction<Ctx>[],
  query: string,
  limit = 50,
): SearchHit<Ctx>[] {
  const tokens = normalize(query).split(/\s+/).filter(Boolean);
  const hits: SearchHit<Ctx>[] = [];
  for (const action of actions) {
    if (tokens.length === 0) {
      hits.push({ action, score: 0 });
      continue;
    }
    let total = 0;
    for (const token of tokens) {
      const best = Math.max(
        0,
        ...fieldsOf(action).map(([text, weight]) => tokenScore(token, text) * weight),
      );
      if (best === 0) {
        total = 0;
        break;
      }
      total += best;
    }
    if (total > 0) hits.push({ action, score: total });
  }
  hits.sort(
    (a, b) =>
      b.score - a.score ||
      a.action.category.localeCompare(b.action.category) ||
      a.action.title.localeCompare(b.action.title),
  );
  return hits.slice(0, limit);
}
