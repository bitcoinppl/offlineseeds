import {
  type ComponentProps,
  type KeyboardEvent,
  type ReactNode,
  type SyntheticEvent,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { DownloadIcon, ShuffleIcon } from "lucide-react";
import { type EntropySource, mixRandomSeed } from "../adapters/random-seed";
import {
  CARDS,
  type Card,
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

const suitTone: Record<Card["color"], string> = {
  red: "text-suit-red hover:text-suit-red aria-pressed:text-suit-red-on-ink aria-pressed:hover:text-suit-red-on-ink",
  black: "text-ink-1",
};

const deckCardClassName =
  "h-[3.4rem] min-w-0 rounded-[0.35rem] border border-rule-strong bg-paper-0 p-0 font-display text-[1.05rem] font-bold shadow-card transition-[transform,box-shadow] duration-[130ms] ease-[ease] hover:-translate-y-0.5 hover:bg-paper-0 hover:shadow-lift aria-pressed:z-[1] aria-pressed:-translate-y-0.5 aria-pressed:border-ink-1 aria-pressed:bg-ink-1 aria-pressed:text-paper-0 aria-pressed:shadow-lift aria-pressed:hover:-translate-y-0.5 aria-pressed:hover:bg-ink-1 aria-pressed:hover:shadow-lift motion-reduce:transform-none motion-reduce:transition-none motion-reduce:hover:transform-none motion-reduce:aria-pressed:transform-none motion-reduce:aria-pressed:hover:transform-none";

const calloutClassName =
  "mt-5 border-t border-rule pt-[0.9rem] text-note leading-[1.55] text-ink-2 [&_strong]:block [&_strong]:text-sm [&_strong]:font-semibold [&_strong]:text-ink-1 [&_p]:m-0 [&_strong+p]:mt-[0.3rem] [&_a]:mt-2 [&_a]:inline-block [&_a]:font-medium [&_a]:text-note [&_a]:text-ink-1 [&_a]:underline [&_a]:decoration-rule-strong [&_a]:underline-offset-[3px] [&_a]:transition-[text-decoration-color] [&_a]:duration-150 [&_a]:ease-[ease] [&_a:hover]:decoration-current [&_a:focus-visible]:decoration-current";

const dataTableClassName =
  "w-full max-w-sm border-collapse tabular-nums text-note text-ink-2 [&_tbody_tr:last-child_td]:border-b-0";

const dataCellClassName =
  "border-b border-rule py-1.5 text-left last:text-right";

// the last word is produced on the wallet, so each supported device gets its
// own procedure; the reader follows exactly one of them
type DeviceId = "coldcard" | "seedsigner";

const DEVICES: readonly Readonly<{
  id: DeviceId;
  label: string;
  steps: readonly string[];
}>[] = [
  {
    id: "coldcard",
    label: "COLDCARD",
    steps: [
      "On an empty COLDCARD, choose Import Existing, then 24 Words, and enter the 23 words. The device shows eight final words. Count positions 1 through 8 from the top of the list.",
      "Restore all 52 cards, shuffle as above, and draw the top card. Ace selects the first word, 2 selects the second word, and so on through 8. For 9 through King, return the card, shuffle the full deck, and draw again.",
      "Record word 24, confirm the complete phrase on the device, and destroy the temporary notes. Do not pick a word without the card draw.",
    ],
  },
  {
    id: "seedsigner",
    label: "SeedSigner",
    steps: [
      "On an air-gapped SeedSigner, choose Tools, Calc 12th/24th word, then 24 words. Enter the 23 words and choose Coin Flip Entropy.",
      "Flip a fair coin three times and enter each Heads or Tails result. SeedSigner displays word 24. Record it, confirm the complete phrase, and destroy the temporary notes.",
    ],
  },
];

const dataHeaderClassName = cn(
  dataCellClassName,
  "text-label font-semibold uppercase tracking-[0.08em] text-ink-3",
);

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
      <Band
        className="mt-0 flex flex-col gap-5 border-t-0 pt-7 print:hidden"
        aria-label="PDF controls"
      >
        <div className="grid grid-cols-1 items-start gap-x-12 gap-y-5 md:grid-cols-2">
          <form
            className="col-start-1 flex flex-col gap-5"
            onSubmit={submitShuffleCode}
          >
            <div className="flex flex-col gap-2">
              <label
                className="w-fit text-xs font-semibold uppercase tracking-[0.08em] text-ink-3"
                htmlFor="shuffle-code"
              >
                Shuffle code
              </label>
              <Input
                aria-describedby="shuffle-code-help"
                autoComplete="off"
                id="shuffle-code"
                className="h-[2.6rem] bg-paper-0 font-mono text-note shadow-[inset_0_1px_2px_rgb(60_45_30/0.06)] md:text-note"
                maxLength={MAX_SEED_LENGTH}
                name="shuffle-code"
                onChange={(event) => editShuffleCode(event.target.value)}
                spellCheck={false}
                value={shuffleInput}
              />
              <p className="m-0 text-note text-ink-3" id="shuffle-code-help">
                {isGenerating
                  ? "Rebuilding the PDF…"
                  : "Reuse a code to make the same PDF."}
              </p>
              {notice ? (
                <p
                  role="alert"
                  className={cn(
                    "m-0 text-note font-medium text-suit-red",
                    notice.kind === "warning" && "text-ink-2",
                  )}
                >
                  {notice.message}
                </p>
              ) : null}
            </div>

            <div className="flex flex-col flex-wrap gap-2 md:flex-row">
              <Button
                className="h-[2.6rem] min-w-0 md:min-w-[13rem]"
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
                className="h-[2.6rem] min-w-0 md:min-w-[13rem]"
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
            <p
              className="col-start-1 mt-5 mb-0 flex flex-wrap gap-x-3 gap-y-1 text-xs text-ink-2"
              aria-live="polite"
            >
              <span className="font-semibold uppercase tracking-[0.08em] text-ink-3">
                Random sources
              </span>
              <span>{randomSources.map(({ label }) => label).join(" · ")}</span>
            </p>
          ) : null}

          <div
            className={cn(
              calloutClassName,
              "col-start-1 row-auto m-0 border-t border-rule pt-[0.9rem] md:col-start-2 md:row-start-1 md:border-t-0 md:pt-0",
            )}
          >
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
      </Band>

      <Band className="print:hidden" aria-labelledby="guide-title">
        <BandHeading titleId="guide-title" title="Make the first 23 words">
          Use the printed PDF, a full 52-card deck, and a private room. An
          offline wallet and one final card draw complete word 24.
        </BandHeading>
        <ol className="m-0 grid list-none grid-cols-1 gap-x-12 gap-y-[1.35rem] p-0 md:grid-cols-2 [&_p]:m-0 [&_p]:text-sm/[1.55] [&_p]:text-ink-2 [&_strong]:font-semibold [&_strong]:text-ink-1">
          <li className="grid grid-cols-[1.5rem_minmax(0,1fr)] items-baseline gap-[0.85rem]">
            <span className="font-display text-xl font-normal leading-none text-suit-red [font-variant-numeric:lining-nums]">
              1
            </span>
            <p>
              <strong>Prepare the deck.</strong> Count all 52 distinct cards.
              Remove the jokers and advertising cards. Work in a private room
              without cameras or microphones.
            </p>
          </li>
          <li className="grid grid-cols-[1.5rem_minmax(0,1fr)] items-baseline gap-[0.85rem]">
            <span className="font-display text-xl font-normal leading-none text-suit-red [font-variant-numeric:lining-nums]">
              2
            </span>
            <p>
              <strong>First-time dry run.</strong> If you have never finished
              word 24 on this device, do one dry run with disposable words
              first. Confirm the import or calc path works before you draw real
              words.
            </p>
          </li>
          <li className="grid grid-cols-[1.5rem_minmax(0,1fr)] items-baseline gap-[0.85rem]">
            <span className="font-display text-xl font-normal leading-none text-suit-red [font-variant-numeric:lining-nums]">
              3
            </span>
            <p>
              <strong>Download the PDF.</strong> Keep all 14 pages together.
              Print on Letter paper at 100% scale. Page 1 repeats these
              instructions for offline use.
            </p>
          </li>
          <li className="grid grid-cols-[1.5rem_minmax(0,1fr)] items-baseline gap-[0.85rem]">
            <span className="font-display text-xl font-normal leading-none text-suit-red [font-variant-numeric:lining-nums]">
              4
            </span>
            <p>
              <strong>Draw one ordered pair.</strong> Return all 52 cards to the
              deck. Riffle-shuffle the full deck 8 times in loose, uneven
              groups. Draw the top card and put it on the left. Draw the next
              card and put it on the right. Do not swap them.
            </p>
          </li>
          <li className="grid grid-cols-[1.5rem_minmax(0,1fr)] items-baseline gap-[0.85rem]">
            <span className="font-display text-xl font-normal leading-none text-suit-red [font-variant-numeric:lining-nums]">
              5
            </span>
            <p>
              <strong>Read one word.</strong> Find the first card in the large
              box at the left. Find the second card in that row. If the pair has
              a dash, restore all 52 cards, shuffle the full deck, and try
              again. Do not continue through the remaining deck because that
              would favor some words. Otherwise, record the word.
            </p>
          </li>
          <li className="grid grid-cols-[1.5rem_minmax(0,1fr)] items-baseline gap-[0.85rem]">
            <span className="font-display text-xl font-normal leading-none text-suit-red [font-variant-numeric:lining-nums]">
              6
            </span>
            <p>
              <strong>Repeat until you have 23 words.</strong> Shuffle the full
              deck before each attempt. Expect approximately 30 attempts. Blank
              pairs are normal.
            </p>
          </li>
        </ol>
      </Band>

      {selectedRow ? (
        <Band className="print:hidden" aria-labelledby="live-title">
          <BandHeading titleId="live-title" title="Live map preview">
            Check one first-card row before you use the full PDF.
          </BandHeading>
          <div className="overflow-x-auto">
            <div
              className="grid min-w-[36rem] grid-cols-[repeat(13,minmax(0,1fr))] gap-[0.3rem] md:min-w-0"
              aria-label="Choose the first card"
            >
              {CARDS.map((card) => (
                <Button
                  aria-label={`${card.rank} of ${card.suit}`}
                  aria-pressed={card.index === selectedCardIndex}
                  className={cn(deckCardClassName, suitTone[card.color])}
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
          <div className="mt-4 overflow-x-auto">
            <div className="grid min-w-[52rem] grid-cols-[5.75rem_minmax(0,1fr)] gap-3">
              <div
                className={cn(
                  "flex flex-col items-center justify-center rounded-[0.4rem] border border-rule-strong bg-paper-0 shadow-card",
                  suitTone[selectedRow.first.color],
                )}
              >
                <span className="font-sans text-label font-semibold uppercase tracking-[0.08em] text-ink-3">
                  First card
                </span>
                <strong className="mt-[0.35rem] font-display text-[2rem] font-bold leading-none">
                  {selectedRow.first.rank}
                  {selectedRow.first.symbol}
                </strong>
              </div>
              <div
                className="grid grid-cols-[repeat(13,minmax(0,1fr))] grid-rows-[repeat(4,minmax(3rem,1fr))] overflow-hidden rounded-[0.4rem] border border-rule-strong shadow-card [&_.mapped-word]:text-label [&_.mapping-cell]:px-[0.4rem] [&_.mapping-cell]:py-[0.35rem] [&_.second-card]:text-label"
                aria-label="Second-card words"
              >
                {selectedRow.entries.map((entry) => (
                  <MappingCell entry={entry} key={entry.second.id} />
                ))}
              </div>
            </div>
          </div>
        </Band>
      ) : null}

      <section
        className="print:m-0 print:block print:w-auto print:overflow-visible print:p-0"
        aria-labelledby="pdf-title"
      >
        <div
          className={cn(
            "mt-8 flex flex-col items-stretch gap-x-8 gap-y-4 border-t border-rule pt-8 print:hidden md:flex-row md:items-start md:justify-between",
          )}
        >
          <BandHeading
            className="mb-0"
            titleId="pdf-title"
            title="Printable PDF"
          >
            The PDF has 14 Letter pages: one instructions page and 13 table
            pages. Use the printed pages during card draws. The live map above
            is only a quick check. The first table page is shown below as a
            preview.
          </BandHeading>
          <Button
            className="h-[3.25rem] w-full shrink-0 px-6 text-base md:w-auto md:min-w-[15rem]"
            disabled={!canDownloadPdf}
            onClick={() => void downloadPdf()}
            size="lg"
            type="button"
          >
            <DownloadIcon data-icon="inline-start" />
            {isDownloadingPdf ? "Creating PDF…" : "Download all 14 pages"}
          </Button>
        </div>
        <div
          className="page-list mt-6 flex min-h-[calc(9.45in+4rem)] flex-col items-start gap-7 overflow-x-auto border-y border-rule bg-paper-2 p-4 print:m-0 print:block print:w-auto print:gap-0 print:overflow-visible print:border-0 print:bg-white print:p-0 md:items-center md:p-8"
          aria-busy={isGenerating}
        >
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
            <p className="m-0 self-start text-sm text-ink-3 print:hidden">
              Generating the PDF…
            </p>
          )}
        </div>
        {table ? (
          <p className="sr-only" aria-live="polite">
            PDF ready: 14 Letter pages.
          </p>
        ) : null}
      </section>

      <Band className="print:hidden" aria-labelledby="notes-title">
        <BandHeading titleId="notes-title" title="Draw rules and word 24">
          Follow these rules during draws. Finish the phrase only on a
          compatible offline wallet.
        </BandHeading>
        <Note lead="Follow the draw rules exactly.">
          <ul className="list-disc space-y-1.5 pl-4 marker:text-ink-3">
            <li>Accept every nonblank entry, including same-suit pairs.</li>
            <li>Never reverse a pair to avoid a blank.</li>
            <li>Never redraw only one card.</li>
            <li>
              Accept repeated cards, pairs, and words. Do not replace a result
              because it looks unusual.
            </li>
            <li>Keep accepted and rejected draws private.</li>
          </ul>
        </Note>
        <Note lead="All 2,048 words can occur.">
          <p>
            Each word has one accepted card pair. A blank pair is a retry. This
            keeps all accepted words equally likely when the deck is well
            shuffled before each word.
          </p>
        </Note>
        <DeviceSteps />
        <Note lead="Keep the words off computers.">
          <p>
            Do not enter the words into this site, a phone, or any
            general-purpose computer. The first electronic entry of the 23 words
            is on the offline wallet itself.
          </p>
        </Note>
        <Note lead="Optional: verify with a second offline wallet.">
          <p>
            Enter the complete phrase on a second compatible, air-gapped wallet.
            Compare the master key fingerprint on both devices. Wipe the
            verification device when you finish. Each extra device that sees the
            phrase adds exposure, so do this check only if you need it.
          </p>
        </Note>
      </Band>

      <Band className="print:hidden" aria-labelledby="entropy-title">
        <BandHeading titleId="entropy-title" title="Entropy analysis">
          An ideal shuffle makes each ordered pair equally likely. The numbers
          below are exact under that assumption.
        </BandHeading>
        <Note lead="Pair space.">
          <p>
            Two ordered cards give 52 × 51 = 2,652 possible pairs. The table
            accepts 2,048 pairs: 2,028 with different suits and 20 with the same
            suit. The other 604 pairs are blank. Each accepted pair maps to
            exactly one BIP39 word.
          </p>
        </Note>
        <Note lead="Bits per word.">
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
        </Note>
        <Note lead="Expected attempts.">
          <p>
            23 accepted words take approximately 29.8 attempts with
            approximately 6.8 blanks. A run with no blank at all has only a
            0.26% probability.
          </p>
          <table className={dataTableClassName}>
            <thead>
              <tr>
                <th className={dataHeaderClassName} scope="col">
                  Attempts
                </th>
                <th className={dataHeaderClassName} scope="col">
                  Probability of 23 words
                </th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className={dataCellClassName}>30</td>
                <td className={dataCellClassName}>62.8%</td>
              </tr>
              <tr>
                <td className={dataCellClassName}>34</td>
                <td className={dataCellClassName}>93.3%</td>
              </tr>
              <tr>
                <td className={dataCellClassName}>35</td>
                <td className={dataCellClassName}>96.1%</td>
              </tr>
              <tr>
                <td className={dataCellClassName}>38</td>
                <td className={dataCellClassName}>99.4%</td>
              </tr>
              <tr>
                <td className={dataCellClassName}>41</td>
                <td className={dataCellClassName}>99.93%</td>
              </tr>
            </tbody>
          </table>
        </Note>
        <Note lead="Effect of imperfect shuffling.">
          <p>
            If the most likely word is β times more likely than uniform, and the
            final draw supplies 3 independent bits, the min-entropy is 253 − 23
            × log₂(β) + 3 bits. In the ideal riffle model, the distance from
            uniform is 0.334 after 7 shuffles and 0.167 after 8. This method
            only needs the top two cards, which mix faster than the full deck.
            Real hand shuffles can differ from that model, and no fixed count
            proves uniformity. The physical shuffle is the principal
            uncertainty.
          </p>
          <table className={dataTableClassName}>
            <thead>
              <tr>
                <th className={dataHeaderClassName} scope="col">
                  Maximum word bias
                </th>
                <th className={dataHeaderClassName} scope="col">
                  Min-entropy
                </th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className={dataCellClassName}>1×</td>
                <td className={dataCellClassName}>256.0 bits</td>
              </tr>
              <tr>
                <td className={dataCellClassName}>1.1×</td>
                <td className={dataCellClassName}>252.8 bits</td>
              </tr>
              <tr>
                <td className={dataCellClassName}>1.25×</td>
                <td className={dataCellClassName}>248.6 bits</td>
              </tr>
              <tr>
                <td className={dataCellClassName}>2×</td>
                <td className={dataCellClassName}>233.0 bits</td>
              </tr>
              <tr>
                <td className={dataCellClassName}>4×</td>
                <td className={dataCellClassName}>210.0 bits</td>
              </tr>
              <tr>
                <td className={dataCellClassName}>8×</td>
                <td className={dataCellClassName}>187.0 bits</td>
              </tr>
            </tbody>
          </table>
          <a href="https://www.stat.berkeley.edu/~aldous/157/Papers/bayer_diaconis.pdf">
            Read the riffle-shuffle analysis
          </a>
        </Note>
      </Band>
    </>
  );
}

function Band({ className, ...props }: ComponentProps<"section">) {
  return (
    <section
      className={cn("mt-8 border-t border-rule pt-8", className)}
      {...props}
    />
  );
}

function BandHeading({
  className,
  titleId,
  title,
  children,
}: {
  className?: string;
  titleId: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <div className={cn("mb-5", className)}>
      <h2
        id={titleId}
        className="m-0 font-display text-[1.45rem] font-normal tracking-[-0.01em]"
      >
        {title}
      </h2>
      <p className="mt-[0.3rem] mb-0 max-w-[46rem] text-sm/[1.55] text-ink-2">
        {children}
      </p>
    </div>
  );
}

function Note({
  lead,
  children,
  className,
}: {
  lead: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "grid gap-y-1.5 border-t border-rule py-4 md:grid-cols-[13rem_minmax(0,1fr)] md:gap-x-12 md:gap-y-0",
        className,
      )}
    >
      <strong className="text-sm font-semibold text-ink-1">{lead}</strong>
      <div className="max-w-2xl space-y-2.5 text-note leading-[1.55] text-ink-2 [&_a]:inline-block [&_a]:font-medium [&_a]:text-ink-1 [&_a]:underline [&_a]:decoration-rule-strong [&_a]:underline-offset-[3px] [&_a]:transition-[text-decoration-color] [&_a]:duration-150 [&_a]:ease-[ease] [&_a:hover]:decoration-current [&_a:focus-visible]:decoration-current">
        {children}
      </div>
    </div>
  );
}

// both panels stay mounted so the static HTML keeps every step; only the
// active one is visible
function DeviceSteps() {
  const [device, setDevice] = useState<DeviceId>(DEVICES[0].id);
  const baseId = useId();
  const tabId = (id: DeviceId) => `${baseId}-tab-${id}`;
  const panelId = (id: DeviceId) => `${baseId}-panel-${id}`;

  const moveFocus = (event: KeyboardEvent<HTMLButtonElement>) => {
    const step =
      event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
    if (step === 0) return;

    event.preventDefault();
    const current = DEVICES.findIndex((entry) => entry.id === device);
    const next = DEVICES[(current + step + DEVICES.length) % DEVICES.length];
    setDevice(next.id);
    document.getElementById(tabId(next.id))?.focus();
  };

  return (
    <Note lead="Finish on your device.">
      <div
        aria-label="Wallet"
        className="flex gap-6 border-b border-rule"
        role="tablist"
      >
        {DEVICES.map((entry) => (
          <button
            aria-controls={panelId(entry.id)}
            aria-selected={entry.id === device}
            className={cn(
              "-mb-px border-b-2 pb-2 text-sm transition-colors duration-150 ease-[ease] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink-1",
              entry.id === device
                ? "border-ink-1 font-semibold text-ink-1"
                : "border-transparent text-ink-3 hover:text-ink-1",
            )}
            id={tabId(entry.id)}
            key={entry.id}
            onClick={() => setDevice(entry.id)}
            onKeyDown={moveFocus}
            role="tab"
            tabIndex={entry.id === device ? 0 : -1}
            type="button"
          >
            {entry.label}
          </button>
        ))}
      </div>
      {DEVICES.map((entry) => (
        <div
          aria-labelledby={tabId(entry.id)}
          hidden={entry.id !== device}
          id={panelId(entry.id)}
          key={entry.id}
          role="tabpanel"
          tabIndex={0}
        >
          <ol className="list-decimal space-y-1.5 pl-5 marker:text-ink-3">
            {entry.steps.map((step, index) => (
              <li key={index}>{step}</li>
            ))}
          </ol>
        </div>
      ))}
    </Note>
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
