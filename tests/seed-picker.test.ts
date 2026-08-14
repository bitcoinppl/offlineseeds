import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { wordlist as englishWordlist } from "@scure/bip39/wordlists/english.js";
import jsQR from "jsqr";
import { generateLookupTable as generateDomainLookupTable } from "../lib/SeedPicker.gen";
import {
  createLookupPdf,
  encodeShuffleCodeQr,
} from "../src/adapters/lookup-pdf";
import { mixRandomSeed } from "../src/adapters/random-seed";
import {
  CARDS,
  VALID_SLOT_COUNT,
  generateLookupTable,
  normalizeSeed,
} from "../src/adapters/seed-picker";

test("normalizes seeds at the boundary", () => {
  assert.deepEqual(normalizeSeed("  repeat me  "), {
    ok: true,
    seed: "repeat me",
  });
  assert.equal(normalizeSeed("   ").ok, false);
});

test("generates the same lookup for the same seed", async () => {
  const first = await generateLookupTable("stable-seed");
  const second = await generateLookupTable("stable-seed");
  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  if (!first.ok || !second.ok) return;

  assert.deepEqual(first.table, second.table);
});

test("rejects invalid digest bytes at the ReScript boundary", () => {
  const negativeByte = Array<number>(32).fill(0);
  negativeByte[31] = -1;
  const oversizedByte = Array<number>(32).fill(0);
  oversizedByte[31] = 256;

  assert.equal(
    generateDomainLookupTable("digest-check", negativeByte),
    "InvalidDigest",
  );
  assert.equal(
    generateDomainLookupTable("digest-check", oversizedByte),
    "InvalidDigest",
  );
});

test("preserves the deterministic lookup algorithm", async () => {
  const result = await generateLookupTable("migration-parity-check");
  if (!result.ok) assert.fail(result.error.message);

  const words = result.table.rows.flatMap((row) =>
    row.entries.flatMap((entry) => (entry.kind === "word" ? [entry.word] : [])),
  );
  const digest = createHash("sha256").update(words.join("\n")).digest("hex");

  assert.equal(
    digest,
    "4220941866d311342986b6c81377f4aed80f3f44dfeeb7df9a4bf5bb977a0c0e",
  );
});

test("changes the word order for a different seed", async () => {
  const first = await generateLookupTable("seed-one");
  const second = await generateLookupTable("seed-two");
  if (!first.ok || !second.ok) assert.fail("lookup generation failed");

  const firstWords = first.table.rows.flatMap((row) =>
    row.entries.flatMap((entry) => (entry.kind === "word" ? [entry.word] : [])),
  );
  const secondWords = second.table.rows.flatMap((row) =>
    row.entries.flatMap((entry) => (entry.kind === "word" ? [entry.word] : [])),
  );
  assert.notDeepEqual(firstWords, secondWords);
});

test("uses every canonical BIP39 English word exactly once", async () => {
  const canonicalListHash = createHash("sha256")
    .update(englishWordlist.join("\n"))
    .digest("hex");
  assert.equal(
    canonicalListHash,
    "187db04a869dd9bc7be80d21a86497d692c0db6abd3aa8cb6be5d618ff757fae",
  );

  const result = await generateLookupTable("word-coverage-check");
  if (!result.ok) assert.fail(result.error.message);

  const entries = result.table.rows.flatMap((row) =>
    row.entries.filter((entry) => entry.kind === "word"),
  );
  assert.equal(entries.length, VALID_SLOT_COUNT);
  assert.deepEqual(
    entries.map(({ slot }) => slot),
    Array.from({ length: VALID_SLOT_COUNT }, (_, slot) => slot),
  );
  assert.deepEqual(
    entries.map(({ word }) => word).sort(),
    [...englishWordlist].sort(),
  );
});

test("preserves the reference card-pair layout invariants", async () => {
  const result = await generateLookupTable("layout-check");
  if (!result.ok) assert.fail(result.error.message);

  const rows = result.table.rows;
  const validCount = rows.reduce(
    (count, row) =>
      count + row.entries.filter((entry) => entry.kind === "word").length,
    0,
  );
  assert.equal(validCount, VALID_SLOT_COUNT);

  for (const row of rows) {
    assert.equal(row.entries[row.first.index].kind, "blank");
    for (const entry of row.entries) {
      const reverse = rows[entry.second.index].entries[row.first.index];
      assert.equal(entry.kind, reverse.kind);
      if (row.first.suit !== entry.second.suit)
        assert.equal(entry.kind, "word");
    }
  }

  const suitedWords = rows.flatMap((row) =>
    row.entries.filter(
      (entry) => entry.kind === "word" && row.first.suit === entry.second.suit,
    ),
  );
  assert.equal(suitedWords.length, 20);

  const fourSpades = CARDS.find((card) => card.id === "4-spades");
  const sevenDiamonds = CARDS.find((card) => card.id === "7-diamonds");
  assert.ok(fourSpades && sevenDiamonds);
  assert.equal(
    rows[fourSpades.index].entries[sevenDiamonds.index].kind,
    "word",
  );
});

test("creates a complete Letter PDF for the lookup", async () => {
  const result = await generateLookupTable("pdf-download-check");
  if (!result.ok) assert.fail(result.error.message);

  const bytes = await createLookupPdf(result.table);
  const document = await import("pdf-lib").then(({ PDFDocument }) =>
    PDFDocument.load(bytes),
  );

  assert.equal(document.getPageCount(), 14);
  assert.deepEqual(document.getPage(0).getSize(), {
    width: 612,
    height: 792,
  });
  assert.equal(document.getTitle(), "OfflineSeeds card-to-word lookup");
});

test("encodes the shuffle code in a scannable QR", () => {
  const shuffleCode = "pdf-download-check";
  assert.equal(decodeQrMatrix(encodeShuffleCodeQr(shuffleCode)), shuffleCode);
  assert.equal(
    decodeQrMatrix(encodeShuffleCodeQr("a".repeat(128))),
    "a".repeat(128),
  );
});

test("mixes local, RANDOM.ORG, and drand contributions", async () => {
  const fetcher = makeEntropyFetcher();
  const cryptoProvider = makeCryptoProvider(17);
  const first = await mixRandomSeed({ fetcher, cryptoProvider });
  const second = await mixRandomSeed({ fetcher, cryptoProvider });

  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  if (!first.ok || !second.ok) return;

  assert.match(first.seed, /^[\da-f]{64}$/);
  assert.equal(first.seed, second.seed);
  assert.deepEqual(
    first.sources.map(({ id }) => id),
    ["device", "random-org", "drand"],
  );
});

test("uses every accepted entropy contribution in the mixed seed", async () => {
  const baseline = await mixRandomSeed({
    fetcher: makeEntropyFetcher(),
    cryptoProvider: makeCryptoProvider(17),
  });
  const changedDevice = await mixRandomSeed({
    fetcher: makeEntropyFetcher(),
    cryptoProvider: makeCryptoProvider(17, 18),
  });
  const changedRandomOrg = await mixRandomSeed({
    fetcher: makeEntropyFetcher(1),
    cryptoProvider: makeCryptoProvider(17),
  });
  const changedDrand = await mixRandomSeed({
    fetcher: makeEntropyFetcher(0, "cd"),
    cryptoProvider: makeCryptoProvider(17),
  });
  const results = [baseline, changedDevice, changedRandomOrg, changedDrand];
  if (results.some((result) => !result.ok)) {
    assert.fail("seed mixing failed");
  }

  const seeds = results.flatMap((result) => (result.ok ? [result.seed] : []));
  assert.equal(new Set(seeds).size, results.length);
});

test("explains when the page is not a secure context", async () => {
  const previous = Object.getOwnPropertyDescriptor(
    globalThis,
    "isSecureContext",
  );
  Object.defineProperty(globalThis, "isSecureContext", {
    configurable: true,
    value: false,
  });

  try {
    const result = await mixRandomSeed({
      fetcher: makeEntropyFetcher(),
    });

    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.error.code, "insecure-context");
      assert.match(result.error.message, /localhost:4321/);
    }
  } finally {
    if (previous) {
      Object.defineProperty(globalThis, "isSecureContext", previous);
    } else {
      Reflect.deleteProperty(globalThis, "isSecureContext");
    }
  }
});

test("requires local randomness and every independent network source", async () => {
  const unavailableFetcher: typeof fetch = async () =>
    new Response("Unavailable", { status: 503 });
  const result = await mixRandomSeed({
    fetcher: unavailableFetcher,
    cryptoProvider: makeCryptoProvider(29),
  });

  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.error.code, "insufficient-sources");
});

test("does not use a reduced-source fallback", async () => {
  const partialFetcher: typeof fetch = async (input) => {
    if (String(input).includes("random.org")) {
      return new Response("Unavailable", { status: 503 });
    }

    return Response.json({
      round: 42,
      randomness: "ab".repeat(32),
    });
  };
  const result = await mixRandomSeed({
    fetcher: partialFetcher,
    cryptoProvider: makeCryptoProvider(31),
  });

  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.error.code, "insufficient-sources");
});

function decodeQrMatrix(qr: {
  data: boolean[][];
  size: number;
}): string | null {
  const scale = 8;
  const width = qr.size * scale;
  const pixels = new Uint8ClampedArray(width * width * 4);

  for (let row = 0; row < qr.size; row += 1) {
    for (let col = 0; col < qr.size; col += 1) {
      const value = qr.data[row]?.[col] === true ? 0 : 255;
      for (let dy = 0; dy < scale; dy += 1) {
        for (let dx = 0; dx < scale; dx += 1) {
          const index = ((row * scale + dy) * width + (col * scale + dx)) * 4;
          pixels[index] = value;
          pixels[index + 1] = value;
          pixels[index + 2] = value;
          pixels[index + 3] = 255;
        }
      }
    }
  }

  return jsQR(pixels, width, width)?.data ?? null;
}

function makeEntropyFetcher(
  randomOrgOffset = 0,
  drandByte = "ab",
): typeof fetch {
  return async (input) => {
    const url = String(input);
    if (url.includes("random.org")) {
      const values = Array.from({ length: 32 }, (_, index) =>
        ((index + randomOrgOffset) % 256).toString(16),
      );
      return new Response(values.join("\n"), { status: 200 });
    }

    return Response.json({
      round: 42,
      randomness: drandByte.repeat(32),
    });
  };
}

function makeCryptoProvider(
  value: number,
  lastValue = value,
): Pick<Crypto, "getRandomValues" | "subtle"> {
  return {
    getRandomValues: <T extends ArrayBufferView | null>(array: T): T => {
      if (array && "fill" in array && typeof array.fill === "function") {
        array.fill(value);

        const bytes = new Uint8Array(
          array.buffer,
          array.byteOffset,
          array.byteLength,
        );
        bytes[bytes.length - 1] = lastValue;
      }
      return array;
    },
    subtle: globalThis.crypto.subtle,
  };
}
