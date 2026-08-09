import {
  type SyntheticEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DownloadIcon, ShuffleIcon } from "lucide-react";
import { type EntropySource, mixRandomSeed } from "../adapters/random-seed";
import {
  CARDS,
  type LookupEntry,
  type LookupRow,
  type LookupTable,
  MAX_SEED_LENGTH,
  generateLookupTable,
} from "../adapters/seed-picker";

const ROWS_PER_PAGE = 4;
const TABLE_PAGE_COUNT = 13;
// the downloadable PDF adds an instructions page before the 13 table pages
const TOTAL_PAGE_COUNT = TABLE_PAGE_COUNT + 1;

// typing must not fight the field, so the debounced path opts out of the
// write-back that seeded and random generation rely on
type GenerateOptions = Readonly<{
  updateUrl?: boolean;
  syncInput?: boolean;
}>;

type Notice = Readonly<{
  kind: "error" | "warning";
  message: string;
}>;

const REGENERATE_DELAY_MS = 400;

export function SeedTool() {
  const [shuffleInput, setShuffleInput] = useState("");
  const [selectedCardIndex, setSelectedCardIndex] = useState(0);
  const [table, setTable] = useState<LookupTable | null>(null);
  const [randomSources, setRandomSources] = useState<readonly EntropySource[]>(
    [],
  );
  const [notice, setNotice] = useState<Notice | null>(null);
  const [isGenerating, setIsGenerating] = useState(true);
  const [isRequestingRandom, setIsRequestingRandom] = useState(false);
  const [isDownloadingPdf, setIsDownloadingPdf] = useState(false);

  // the seed the current table was built from, so typing does not regenerate
  // the code that generation itself just put in the field
  const generatedSeed = useRef<string | null>(null);

  const generate = useCallback(
    async (shuffleCode: string, options: GenerateOptions = {}) => {
      const { updateUrl = true, syncInput = true } = options;

      setIsGenerating(true);
      setNotice(null);

      const result = await generateLookupTable(shuffleCode);
      setIsGenerating(false);
      if (!result.ok) {
        setNotice({ kind: "error", message: result.error.message });
        return false;
      }

      generatedSeed.current = result.table.seed;
      if (syncInput) setShuffleInput(result.table.seed);
      setTable(result.table);
      if (updateUrl) writeShuffleCodeToUrl(result.table.seed);
      return true;
    },
    [],
  );

  const requestRandomCode = useCallback(async () => {
    setIsRequestingRandom(true);
    setNotice(null);

    const result = await mixRandomSeed();
    setIsRequestingRandom(false);
    if (!result.ok) {
      setIsGenerating(false);
      setNotice({ kind: "error", message: result.error.message });
      return;
    }

    const didGenerate = await generate(result.seed);
    if (!didGenerate) return;

    setRandomSources(result.sources);
    if (result.warnings.length > 0) {
      setNotice({ kind: "warning", message: result.warnings.join(" ") });
    }
  }, [generate]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const shuffleCode = readShuffleCodeFromUrl();
      if (shuffleCode) {
        void generate(shuffleCode, { updateUrl: false });
        return;
      }

      void requestRandomCode();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [generate, requestRandomCode]);

  // the field is the only control: edits rebuild the PDF once typing settles
  useEffect(() => {
    const shuffleCode = shuffleInput.trim();
    if (!shuffleCode || shuffleCode === generatedSeed.current) return;

    const timer = window.setTimeout(() => {
      void generate(shuffleCode, { syncInput: false });
    }, REGENERATE_DELAY_MS);

    return () => window.clearTimeout(timer);
  }, [generate, shuffleInput]);

  const pages = useMemo(() => {
    if (!table) return [];

    return Array.from({ length: TABLE_PAGE_COUNT }, (_, pageIndex) =>
      table.rows.slice(
        pageIndex * ROWS_PER_PAGE,
        pageIndex * ROWS_PER_PAGE + ROWS_PER_PAGE,
      ),
    );
  }, [table]);

  const selectedRow = table?.rows[selectedCardIndex] ?? null;

  // Enter skips the debounce; the edit itself is what normally rebuilds
  function submitShuffleCode(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    void generate(shuffleInput, { syncInput: false });
  }

  function editShuffleCode(value: string) {
    // the listed sources describe the generated code, not a typed one
    setRandomSources([]);
    setShuffleInput(value);
  }

  const downloadPdf = useCallback(async () => {
    if (!table) return;

    setIsDownloadingPdf(true);
    setNotice(null);

    try {
      const { createLookupPdf } = await import("../adapters/lookup-pdf");
      const bytes = await createLookupPdf(table);
      const blob = new Blob([new Uint8Array(bytes)], {
        type: "application/pdf",
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "offlineseeds.pdf";
      document.body.append(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 0);
    } catch {
      setNotice({
        kind: "error",
        message: "The PDF could not be created. Try the download again.",
      });
    } finally {
      setIsDownloadingPdf(false);
    }
  }, [table]);

  const isBusy = isGenerating || isRequestingRandom || isDownloadingPdf;
  const canDownloadPdf =
    !isBusy && table !== null && shuffleInput.trim() === table.seed;

  return (
    <>
      <section className="band controls screen-only" aria-label="PDF controls">
        <div className="controls-main">
          <form className="control-form" onSubmit={submitShuffleCode}>
            <div className="field">
              <label className="field-label" htmlFor="shuffle-code">
                Shuffle code
              </label>
              <Input
                aria-describedby="shuffle-code-help"
                autoComplete="off"
                id="shuffle-code"
                className="shuffle-input"
                maxLength={MAX_SEED_LENGTH}
                name="shuffle-code"
                onChange={(event) => editShuffleCode(event.target.value)}
                spellCheck={false}
                value={shuffleInput}
              />
              <p className="field-description" id="shuffle-code-help">
                {isGenerating
                  ? "Rebuilding the PDF…"
                  : "Reuse a code to make the same PDF."}
              </p>
              {notice ? (
                <p
                  role="alert"
                  className={`field-error ${
                    notice.kind === "warning" ? "warning-text" : ""
                  }`}
                >
                  {notice.message}
                </p>
              ) : null}
            </div>

            <div className="action-row">
              <Button
                className="action-button"
                disabled={isBusy}
                onClick={() => void requestRandomCode()}
                size="lg"
                type="button"
                variant="secondary"
              >
                <ShuffleIcon data-icon="inline-start" />
                {isRequestingRandom ? "Getting a code…" : "New shuffle code"}
              </Button>
              <Button
                className="action-button"
                disabled={!canDownloadPdf}
                onClick={() => void downloadPdf()}
                size="lg"
                type="button"
              >
                <DownloadIcon data-icon="inline-start" />
                {isDownloadingPdf ? "Creating PDF…" : "Download PDF"}
              </Button>
            </div>
          </form>

          {randomSources.length > 0 ? (
            <p className="source-list" aria-live="polite">
              <span className="source-label">Random sources</span>
              <span>{randomSources.map(({ label }) => label).join(" · ")}</span>
            </p>
          ) : null}

          <div className="callout controls-warning">
            <strong>
              Do not enter a wallet recovery phrase as a shuffle code.
            </strong>
            <p>
              The code only sets which word belongs to each card pair, and it
              appears in the page URL. Your phrase comes from the shuffled deck,
              not from this code.
            </p>
          </div>
        </div>
      </section>

      <section className="band screen-only" aria-labelledby="guide-title">
        <div className="band-heading">
          <h2 id="guide-title">Make the first 23 words</h2>
          <p>
            Use the printed PDF, a full 52-card deck, and a private room. An
            offline wallet and one final card draw complete word 24.
          </p>
        </div>
        <ol className="instruction-list">
          <li>
            <span>1</span>
            <p>
              <strong>Prepare the deck.</strong> Count all 52 distinct cards.
              Remove the jokers and advertising cards. Work in a private room
              without cameras or microphones.
            </p>
          </li>
          <li>
            <span>2</span>
            <p>
              <strong>Test the wallet first.</strong> Use disposable test words
              to confirm that an empty COLDCARD shows eight valid final words,
              or that an air-gapped SeedSigner accepts three coin flips. Do this
              before you draw the real words.
            </p>
          </li>
          <li>
            <span>3</span>
            <p>
              <strong>Download the PDF.</strong> Keep all 14 pages together.
              Print on Letter paper at 100% scale. Page 1 repeats these
              instructions for offline use.
            </p>
          </li>
          <li>
            <span>4</span>
            <p>
              <strong>Draw one ordered pair.</strong> Return all 52 cards to the
              deck. Riffle-shuffle the full deck 12 times in loose, uneven
              groups. Draw the top card and put it on the left. Draw the next
              card and put it on the right. Do not swap them.
            </p>
          </li>
          <li>
            <span>5</span>
            <p>
              <strong>Read one word.</strong> Find the first card in the large
              box at the left. Find the second card in that row. If the pair has
              a dash, restore all 52 cards, shuffle the full deck, and try
              again. Do not continue through the remaining deck because that
              would favor some words. Otherwise, record the word.
            </p>
          </li>
          <li>
            <span>6</span>
            <p>
              <strong>Repeat until you have 23 words.</strong> Shuffle the full
              deck before each attempt. Expect approximately 30 attempts. Blank
              pairs are normal.
            </p>
          </li>
        </ol>
      </section>

      {selectedRow ? (
        <section className="band screen-only" aria-labelledby="live-title">
          <div className="band-heading">
            <h2 id="live-title">Live map preview</h2>
            <p>Check one first-card row before you use the full PDF.</p>
          </div>
          <div className="picker-scroll">
            <div className="card-picker" aria-label="Choose the first card">
              {CARDS.map((card) => (
                <Button
                  aria-label={`${card.rank} of ${card.suit}`}
                  aria-pressed={card.index === selectedCardIndex}
                  className={`deck-card-button card-${card.color}`}
                  key={card.id}
                  onClick={() => setSelectedCardIndex(card.index)}
                  type="button"
                  variant="ghost"
                >
                  {card.rank}
                  {card.symbol}
                </Button>
              ))}
            </div>
          </div>
          <div className="live-scroll">
            <div className="live-row">
              <div
                className={`live-first-card card-${selectedRow.first.color}`}
              >
                <span>First card</span>
                <strong>
                  {selectedRow.first.rank}
                  {selectedRow.first.symbol}
                </strong>
              </div>
              <div className="live-grid" aria-label="Second-card words">
                {selectedRow.entries.map((entry) => (
                  <MappingCell entry={entry} key={entry.second.id} />
                ))}
              </div>
            </div>
          </div>
        </section>
      ) : null}

      <section className="pdf-section" aria-labelledby="pdf-title">
        <div className="band pdf-heading screen-only">
          <div className="band-heading">
            <h2 id="pdf-title">Printable PDF</h2>
            <p>
              The PDF has 14 Letter pages: one instructions page and 13 table
              pages. Use the printed pages during card draws. The live map above
              is only a quick check. The first table page is shown below as a
              preview.
            </p>
          </div>
          <Button
            className="pdf-download-button"
            disabled={!canDownloadPdf}
            onClick={() => void downloadPdf()}
            size="lg"
            type="button"
          >
            <DownloadIcon data-icon="inline-start" />
            {isDownloadingPdf ? "Creating PDF…" : "Download all 14 pages"}
          </Button>
        </div>
        <div className="page-list" aria-busy={isGenerating}>
          {table ? (
            pages.map((rows, pageIndex) => (
              <LookupPage
                key={pageIndex}
                pageIndex={pageIndex}
                rows={rows}
                shuffleCode={table.seed}
              />
            ))
          ) : (
            <p className="loading-copy screen-only">Generating the PDF…</p>
          )}
        </div>
        {table ? (
          <p className="sr-only" aria-live="polite">
            PDF ready: 14 Letter pages.
          </p>
        ) : null}
      </section>

      <section className="band screen-only" aria-labelledby="notes-title">
        <div className="band-heading">
          <h2 id="notes-title">Draw rules and word 24</h2>
          <p>
            Follow these rules during draws. Finish the phrase only on a
            compatible offline wallet.
          </p>
        </div>
        <div className="note-columns">
          <div className="callout">
            <strong>Follow the draw rules exactly.</strong>
            <ul className="rule-list">
              <li>Accept every nonblank entry, including same-suit pairs.</li>
              <li>Never reverse a pair to avoid a blank.</li>
              <li>Never redraw only one card.</li>
              <li>
                Accept repeated cards, pairs, and words. Do not replace a result
                because it looks unusual.
              </li>
              <li>Keep accepted and rejected draws private.</li>
            </ul>
          </div>
          <div className="callout">
            <strong>All 2,048 words can occur.</strong>
            <p>
              Each word has one accepted card pair. A blank pair is a retry.
              This keeps all accepted words equally likely when the deck is well
              shuffled before each word.
            </p>
          </div>
          <div className="callout">
            <strong>Finish with COLDCARD.</strong>
            <p>
              On an empty COLDCARD, choose Import Existing, then 24 Words, and
              enter the 23 words. The device shows eight final words. Count
              positions 1 through 8 from the top of the list.
            </p>
            <p>
              Restore all 52 cards, shuffle as above, and draw the top card. Ace
              selects the first word, 2 selects the second word, and so on
              through 8. For 9 through King, return the card, shuffle the full
              deck, and draw again.
            </p>
            <p>
              Record word 24, confirm the complete phrase on the device, and
              destroy the temporary notes. Do not pick a word without the card
              draw.
            </p>
          </div>
          <div className="callout">
            <strong>Finish with SeedSigner.</strong>
            <p>
              On an air-gapped SeedSigner, choose Tools, Calc 12th/24th word,
              then 24 words. Enter the 23 words and choose Coin Flip Entropy.
            </p>
            <p>
              Flip a fair coin three times and enter each Heads or Tails result.
              SeedSigner displays word 24. Record it, confirm the complete
              phrase, and destroy the temporary notes.
            </p>
          </div>
          <div className="callout">
            <strong>Keep the words off computers.</strong>
            <p>
              Do not enter the words into this site, a phone, or any
              general-purpose computer. The first electronic entry of the 23
              words is on the offline wallet itself.
            </p>
          </div>
          <div className="callout">
            <strong>Optional: verify with a second offline wallet.</strong>
            <p>
              Enter the complete phrase on a second compatible, air-gapped
              wallet. Compare the master key fingerprint on both devices. Wipe
              the verification device when you finish. Each extra device that
              sees the phrase adds exposure, so do this check only if you need
              it.
            </p>
          </div>
        </div>
      </section>

      <section className="band screen-only" aria-labelledby="entropy-title">
        <div className="band-heading">
          <h2 id="entropy-title">Entropy analysis</h2>
          <p>
            An ideal shuffle makes each ordered pair equally likely. The numbers
            below are exact under that assumption.
          </p>
        </div>
        <div className="note-columns">
          <div className="callout">
            <strong>Pair space.</strong>
            <p>
              Two ordered cards give 52 × 51 = 2,652 possible pairs. The table
              accepts 2,048 pairs: 2,028 with different suits and 20 with the
              same suit. The other 604 pairs are blank. Each accepted pair maps
              to exactly one BIP39 word.
            </p>
          </div>
          <div className="callout">
            <strong>Bits per word.</strong>
            <p>
              A draw is accepted with probability 2,048 / 2,652 ≈ 77.2%. Each
              accepted word is uniform over 2,048 possibilities and supplies
              log₂(2,048) = 11 bits. The 23 words supply 253 bits. The final
              Ace-to-8 card draw adds 3 random bits for a total of 256 bits. The
              8-bit checksum adds no randomness.
            </p>
            <p>
              If you always choose the same final position, the phrase has 253
              bits rather than 256 bits. The final card draw is required for the
              256-bit claim.
            </p>
            <a href="https://github.com/bitcoin/bips/blob/master/bip-0039.mediawiki">
              Read the BIP39 specification
            </a>
          </div>
          <div className="callout">
            <strong>Expected attempts.</strong>
            <p>
              23 accepted words take approximately 29.8 attempts with
              approximately 6.8 blanks. A run with no blank at all has only a
              0.26% probability.
            </p>
            <table className="data-table">
              <thead>
                <tr>
                  <th scope="col">Attempts</th>
                  <th scope="col">Probability of 23 words</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>30</td>
                  <td>62.8%</td>
                </tr>
                <tr>
                  <td>34</td>
                  <td>93.3%</td>
                </tr>
                <tr>
                  <td>35</td>
                  <td>96.1%</td>
                </tr>
                <tr>
                  <td>38</td>
                  <td>99.4%</td>
                </tr>
                <tr>
                  <td>41</td>
                  <td>99.93%</td>
                </tr>
              </tbody>
            </table>
          </div>
          <div className="callout">
            <strong>Effect of imperfect shuffling.</strong>
            <p>
              If the most likely word is β times more likely than uniform, and
              the final draw supplies 3 independent bits, the min-entropy is 253
              − 23 × log₂(β) + 3 bits. In the ideal riffle model, the distance
              from uniform is 0.334 after 7 shuffles and about 0.011 after 12.
              Real hand shuffles can differ from that model, and no fixed count
              proves uniformity. The physical shuffle is the principal
              uncertainty.
            </p>
            <table className="data-table">
              <thead>
                <tr>
                  <th scope="col">Maximum word bias</th>
                  <th scope="col">Min-entropy</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>1×</td>
                  <td>256.0 bits</td>
                </tr>
                <tr>
                  <td>1.1×</td>
                  <td>252.8 bits</td>
                </tr>
                <tr>
                  <td>1.25×</td>
                  <td>248.6 bits</td>
                </tr>
                <tr>
                  <td>2×</td>
                  <td>233.0 bits</td>
                </tr>
                <tr>
                  <td>4×</td>
                  <td>210.0 bits</td>
                </tr>
                <tr>
                  <td>8×</td>
                  <td>187.0 bits</td>
                </tr>
              </tbody>
            </table>
            <a href="https://www.stat.berkeley.edu/~aldous/157/Papers/bayer_diaconis.pdf">
              Read the riffle-shuffle analysis
            </a>
          </div>
        </div>
        <p className="callout">
          Procedure and analysis adapted from{" "}
          <a href="https://gist.github.com/BullishNode/840e2b001f611b9b1f45dc900510166d">
            Generating a 24-Word BIP39 Phrase with Playing Cards
          </a>
          .
        </p>
      </section>
    </>
  );
}

function LookupPage({
  pageIndex,
  rows,
  shuffleCode,
}: {
  pageIndex: number;
  rows: readonly LookupRow[];
  shuffleCode: string;
}) {
  return (
    <article className="lookup-page">
      <header className="page-header">
        <strong>OfflineSeeds</strong>
        <span className="page-code">Shuffle code: {shuffleCode}</span>
        {/* table pages follow the PDF instructions page, so numbering starts at 2 */}
        <span>
          {pageIndex + 2} / {TOTAL_PAGE_COUNT}
        </span>
      </header>

      <div className="page-rows">
        {rows.map((row) => (
          <section className="lookup-row" key={row.first.id}>
            <div className={`first-card card-${row.first.color}`}>
              <strong>{row.first.rank}</strong>
              <span>{row.first.symbol}</span>
            </div>
            <div className="pair-grid">
              {row.entries.map((entry) => (
                <MappingCell entry={entry} key={entry.second.id} />
              ))}
            </div>
          </section>
        ))}
      </div>

      <footer className="page-footer">
        First card at left. Second card and word in the grid. A dash is a blank
        pair.
      </footer>
    </article>
  );
}

function MappingCell({ entry }: { entry: LookupEntry }) {
  return (
    <div className={`mapping-cell ${entry.kind === "blank" ? "is-blank" : ""}`}>
      <span className={`second-card card-${entry.second.color}`}>
        {entry.second.rank}
        {entry.second.symbol}
      </span>
      <span className="mapped-word">{entry.word ?? "—"}</span>
    </div>
  );
}

function readShuffleCodeFromUrl(): string | null {
  return new URL(window.location.href).searchParams.get("shuffle");
}

function writeShuffleCodeToUrl(shuffleCode: string) {
  const url = new URL(window.location.href);
  url.searchParams.set("shuffle", shuffleCode);
  window.history.replaceState({}, "", url);
}
