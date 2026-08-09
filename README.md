# OfflineSeeds

OfflineSeeds creates a printable BIP39 card-pair lookup table. The same shuffle
code always creates the same 2,048-word mapping.

## Use the site

1. Open the site to create a shuffle code from Web Crypto, RANDOM.ORG, and
   drand.
2. Enter an existing shuffle code when you need the same word order.
3. Select **Download PDF** to save the 14-page lookup PDF. Page 1 holds the
   instructions and pages 2–14 hold the table. Print on Letter paper at 100%
   scale.

The generated mapping stays in the browser. The shuffle code is in the URL so
that the page can be opened again. The site mixes secure local browser bytes
with available bytes from RANDOM.ORG and the drand public randomness beacon.

## Generate a phrase with the printed table

Materials: a complete 52-card deck without jokers, the printed table, pen and
paper, a fair coin if you use SeedSigner, an empty COLDCARD or an air-gapped
SeedSigner for word 24, and a private room without cameras or microphones.

Prepare:

1. Count all 52 distinct cards. Remove the jokers and advertising cards.
2. Test the wallet's final-word function with disposable words before the real
   run. Do not discover an incompatible wallet after you draw the real words.

Generate words 1–23. For each word:

1. Return all 52 cards to the deck. Riffle-shuffle the full deck 12 times in
   loose, uneven groups.
2. Put the top card on the left and the next card on the right. Do not swap
   them.
3. Find the ordered pair in the table: first card in the left box, second card
   in that row.
4. A dash is a blank pair. Restore all 52 cards, shuffle the full deck, and try
   again. Do not continue through the remaining deck because that would favor
   some words.
5. Otherwise, record the word. Stop after 23 words.

Rules:

- Accept every nonblank entry, including same-suit pairs.
- Never reverse a pair to avoid a blank. Never redraw only one card.
- Accept repeated cards, pairs, and words. Do not replace a result because it
  looks unusual.
- Keep accepted and rejected draws private.

Word 24 with COLDCARD:

1. On an empty COLDCARD, choose **Import Existing**, then **24 Words**, and
   enter the 23 words. Count the eight final words from the top of the list.
2. Restore all 52 cards, shuffle as above, and draw the top card.
3. Ace selects the first word, 2 selects the second word, and so on through 8.
4. For 9 through King, return the card, shuffle the full deck, and draw again.
5. Record word 24 with the first 23 words. Confirm the complete phrase on the
   device, then destroy the temporary card-pair and word notes.

Word 24 with SeedSigner:

1. On an air-gapped SeedSigner, choose **Tools**, **Calc 12th/24th word**, then
   **24 words**.
2. Enter the 23 words and choose **Coin Flip Entropy**.
3. Flip a fair coin three times and enter each Heads or Tails result.
4. Record the displayed word 24, confirm the complete phrase, and destroy the
   temporary notes.

Optional verification: enter the complete phrase on a second compatible,
air-gapped wallet. Compare the master key fingerprint on both devices. Wipe the
verification device when you finish. Each extra device that sees the phrase
adds exposure, so do this check only if you need it.

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

### Pair space

Two ordered cards give 52 × 51 = 2,652 possible pairs. The table accepts 2,048
pairs: 2,028 with different suits and 20 with the same suit. The other 604
pairs are blank. Each accepted pair maps to exactly one BIP39 word.

### Bits per word

With an ideal shuffle, a draw is accepted with probability 2,048 / 2,652 ≈
77.2%. Each accepted word is then uniform over 2,048 possibilities and
supplies log₂(2,048) = 11 bits. The first 23 words supply 253 bits. The final
Ace-to-8 card draw adds the last 3 entropy bits, for a total of 256 bits. The
wallet calculates the 8-bit checksum for word 24. The checksum detects
transcription errors and adds no randomness.

If you always choose the same final position, the phrase has 253 bits rather
than 256 bits. The final card draw is required for the 256-bit claim.

### Expected attempts

23 accepted words take approximately 29.8 attempts with approximately 6.8
blanks. A run with no blank at all has only a 0.26% probability.

| Attempts | Probability of 23 words |
| -------: | ----------------------: |
|       30 |                   62.8% |
|       34 |                   93.3% |
|       35 |                   96.1% |
|       38 |                   99.4% |
|       41 |                  99.93% |

### Effect of imperfect shuffling

The 256-bit result requires uniform, independent shuffles and 3 independent
bits from the final card draw. If the most likely word is β times more likely
than uniform, and the final draw supplies `h_final` bits of min-entropy, the
phrase min-entropy is:

```text
253 − 23 × log₂(β) + h_final
```

With `h_final = 3`:

| Maximum word bias | Min-entropy |
| ----------------: | ----------: |
|                1× |  256.0 bits |
|              1.1× |  252.8 bits |
|             1.25× |  248.6 bits |
|                2× |  233.0 bits |
|                4× |  210.0 bits |
|                8× |  187.0 bits |

Dependence between successive shuffles can reduce the entropy further. In the
ideal riffle model, the total variation distance from uniform is 0.334 after 7
shuffles and approximately 0.011 after 12. Real hand shuffles can differ from
that model, and no fixed count proves uniformity. The physical shuffle is the
principal uncertainty in the method. See the
[Bayer and Diaconis analysis](https://www.stat.berkeley.edu/~aldous/157/Papers/bayer_diaconis.pdf).

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
The deck procedure and the entropy analysis are adapted from
[Generating a 24-Word BIP39 Phrase with Playing Cards](https://gist.github.com/BullishNode/840e2b001f611b9b1f45dc900510166d)
by BullishNode.
See [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md) for license details.
