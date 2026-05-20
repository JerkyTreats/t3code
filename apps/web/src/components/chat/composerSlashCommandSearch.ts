import type { ComposerCommandItem } from "./ComposerCommandMenu";

type SlashCommandMenuItem = Extract<
  ComposerCommandItem,
  { type: "slash-command" | "provider-slash-command" }
>;

function normalizeQuery(query: string): string {
  return query.trim().replace(/^\/+/, "").toLowerCase();
}

function scoreText(value: string, query: string, base: number): number | null {
  const candidate = value.toLowerCase();
  if (!candidate || !query) {
    return null;
  }
  if (candidate === query) {
    return base;
  }
  if (candidate.startsWith(query)) {
    return base + 2 + candidate.length - query.length;
  }
  const index = candidate.indexOf(query);
  if (index !== -1) {
    return base + 20 + index * 2 + candidate.length - query.length;
  }
  return null;
}

function scoreSlashCommandItem(item: SlashCommandMenuItem, query: string): number | null {
  const commandName =
    item.type === "slash-command" ? item.command.toLowerCase() : item.command.name.toLowerCase();
  const scores = [
    scoreText(commandName, query, 0),
    scoreText(item.label, query, 4),
    scoreText(item.description, query, 32),
  ].filter((score): score is number => score !== null);

  if (scores.length === 0) {
    return null;
  }
  return Math.min(...scores);
}

export function searchSlashCommandItems(
  items: ReadonlyArray<SlashCommandMenuItem>,
  query: string,
): SlashCommandMenuItem[] {
  const normalizedQuery = normalizeQuery(query);
  if (!normalizedQuery) {
    return [...items];
  }

  return items
    .flatMap((item) => {
      const score = scoreSlashCommandItem(item, normalizedQuery);
      return score === null ? [] : [{ item, score }];
    })
    .toSorted(
      (left, right) => left.score - right.score || left.item.id.localeCompare(right.item.id),
    )
    .map((entry) => entry.item);
}
