import {
  cards as domainCards,
  generateLookupTable as generateDomainLookupTable,
  maxShuffleCodeLength,
  normalizeShuffleCode,
  validSlotCount,
  type card as DomainCard,
  type shuffleCodeError,
} from "../../lib/SeedPicker.gen.ts";

export const SUITS = ["spades", "hearts", "diamonds", "clubs"] as const;
export const RANKS = [
  "A",
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
  "10",
  "J",
  "Q",
  "K",
] as const;
export const VALID_SLOT_COUNT = validSlotCount;
export const MAX_SEED_LENGTH = maxShuffleCodeLength;

export type Suit = (typeof SUITS)[number];
export type Rank = (typeof RANKS)[number];
export type Seed = string & { readonly __seed: unique symbol };

export type Card = Readonly<{
  index: number;
  id: string;
  rank: Rank;
  suit: Suit;
  symbol: "♠" | "♥" | "♦" | "♣";
  color: "black" | "red";
}>;

export type WordEntry = Readonly<{
  kind: "word";
  second: Card;
  slot: number;
  word: string;
}>;

export type BlankEntry = Readonly<{
  kind: "blank";
  second: Card;
  slot: null;
  word: null;
}>;

export type LookupEntry = WordEntry | BlankEntry;

export type LookupRow = Readonly<{
  first: Card;
  entries: readonly LookupEntry[];
}>;

export type LookupTable = Readonly<{
  seed: Seed;
  rows: readonly LookupRow[];
}>;

export type SeedError = Readonly<{
  code: "empty" | "too-long" | "crypto-unavailable";
  message: string;
}>;

export type SeedResult =
  | Readonly<{ ok: true; seed: Seed }>
  | Readonly<{ ok: false; error: SeedError }>;

export type LookupTableResult =
  | Readonly<{ ok: true; table: LookupTable }>
  | Readonly<{ ok: false; error: SeedError }>;

const CARD_BY_INDEX = domainCards.map(toCard);

/** All 52 cards in the order used by the lookup table. */
export const CARDS: readonly Card[] = Object.freeze(CARD_BY_INDEX);

/** Normalize external shuffle code text into the mapper's canonical value. */
export function normalizeSeed(value: string): SeedResult {
  const result = normalizeShuffleCode(value);
  if (result.TAG === "Valid") {
    return { ok: true, seed: result._0 as Seed };
  }

  return { ok: false, error: toSeedError(result._0) };
}

/** Generate the complete deterministic card-pair lookup for a shuffle code. */
export async function generateLookupTable(
  value: string,
): Promise<LookupTableResult> {
  const normalized = normalizeSeed(value);
  if (!normalized.ok) return normalized;

  if (!globalThis.crypto?.subtle) {
    return cryptoUnavailable();
  }

  const digest = await globalThis.crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(normalized.seed),
  );
  const result = generateDomainLookupTable(
    normalized.seed,
    Array.from(new Uint8Array(digest)),
  );

  if (result === "InvalidDigest") return cryptoUnavailable();
  if (result.TAG === "InvalidCode") {
    return { ok: false, error: toSeedError(result._0) };
  }

  const rows = result._0.rows.map<LookupRow>((row) =>
    Object.freeze({
      first: CARD_BY_INDEX[row.first.index],
      entries: Object.freeze(
        row.entries.map<LookupEntry>((entry) => {
          if (entry.TAG === "Blank") {
            return Object.freeze({
              kind: "blank",
              second: CARD_BY_INDEX[entry._0.second.index],
              slot: null,
              word: null,
            });
          }

          return Object.freeze({
            kind: "word",
            second: CARD_BY_INDEX[entry._0.second.index],
            slot: entry._0.slot,
            word: entry._0.word,
          });
        }),
      ),
    }),
  );

  return {
    ok: true,
    table: Object.freeze({
      seed: result._0.shuffleCode as Seed,
      rows: Object.freeze(rows),
    }),
  };
}

function toCard(card: DomainCard): Card {
  return Object.freeze({
    ...card,
    rank: card.rank as Rank,
    suit: card.suit as Suit,
    symbol: card.symbol as Card["symbol"],
    color: card.color as Card["color"],
  });
}

function toSeedError(error: shuffleCodeError): SeedError {
  return {
    code: error.code === "Empty" ? "empty" : "too-long",
    message: error.message,
  };
}

function cryptoUnavailable(): LookupTableResult {
  return {
    ok: false,
    error: {
      code: "crypto-unavailable",
      message: "This browser cannot build the lookup.",
    },
  };
}
