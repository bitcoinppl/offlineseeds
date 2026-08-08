# OfflineSeeds

OfflineSeeds creates a printable BIP39 card-pair lookup table. The same shuffle
code always creates the same 2,048-word mapping.

## Use the site

1. Open the site to create a shuffle code from Web Crypto, RANDOM.ORG, and
   drand.
2. Enter an existing shuffle code when you need the same word order.
3. Select **Print or save PDF** and use the browser print dialog.
4. Return all 52 cards and shuffle the full deck before you draw each pair.
   Retry a pair only when its table cell is blank.

The generated mapping stays in the browser. The shuffle code is in the URL so
that the page can be opened again. The site mixes secure local browser bytes
with available bytes from RANDOM.ORG and the drand public randomness beacon.

## Entropy checks

The table uses all 2,048 unique words from the canonical BIP39 English list.
Each word has one accepted ordered card pair. The table has no duplicate word
or slot. A blank pair is a rejection sample, so it does not favor one accepted
word over another.

The test suite pins the canonical word-list hash and checks the complete table
for all 2,048 words and slots. The table builder also stops at run time if the
word list has duplicates or if the card layout does not have exactly 2,048
slots.

The shuffle code only changes which word belongs to each accepted pair. This
fixed one-to-one change does not add or remove entropy from a well-shuffled
deck. The deck procedure supplies the phrase entropy. Shuffle the full deck
again before each word to let all accepted pairs occur.

The first 23 words supply 253 bits. A compatible offline wallet or tool must
generate the last 3 entropy bits and the 8-bit checksum for word 24.

## Develop

Requirements: Node.js 22.13 or later.

```sh
npm install
npm run dev
```

## Verify

```sh
npm run typecheck
npm run lint
npm test
```

## Deploy to Cloudflare Workers

Authenticate first with `npx wrangler whoami`, then run:

```sh
npm run deploy
```

## Attribution

The valid and blank card-pair layout is derived from
[SeedPicker Solitaire](https://github.com/jimbojw/seed-picker-solitaire).
See [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md) for license details.
