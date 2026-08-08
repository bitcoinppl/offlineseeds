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
const PAGE_COUNT = 13;

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

    return Array.from({ length: PAGE_COUNT }, (_, pageIndex) =>
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
        </div>

        <div className="controls-notes">
          <div className="callout">
            <strong>New codes mix independent sources.</strong>
            <p>
              The browser uses Web Crypto and available bytes from RANDOM.ORG
              and drand. It requires at least one network source and mixes the
              bytes with SHA-256.
            </p>
          </div>

          <p className="callout">
            Do not enter a wallet recovery phrase as a shuffle code.
          </p>
        </div>
      </section>

      <section className="band screen-only" aria-labelledby="guide-title">
        <div className="band-heading">
          <h2 id="guide-title">Make the first 23 words</h2>
          <p>
            Use the printed PDF and a shuffled deck. An offline wallet adds
            entropy and the checksum for word 24.
          </p>
        </div>
        <ol className="instruction-list">
          <li>
            <span>1</span>
            <p>
              <strong>Download the PDF.</strong> Keep all 13 pages together.
              Print on Letter paper at 100% scale when you are ready.
            </p>
          </li>
          <li>
            <span>2</span>
            <p>
              <strong>Draw one pair.</strong> Put all 52 cards in the deck and
              shuffle well. Deal two cards face up without replacement.
            </p>
          </li>
          <li>
            <span>3</span>
            <p>
              <strong>Read one word.</strong> Find the first card in the large
              box at the left. Find the second card in that row. If the pair has
              a dash, return the cards, shuffle the full deck, and try again.
              Otherwise, record the word.
            </p>
          </li>
          <li>
            <span>4</span>
            <p>
              <strong>Shuffle again for each word.</strong> Return all cards to
              the deck before each draw. Do not reject a pair only because its
              suits match. Stop after you record 23 words.
            </p>
          </li>
        </ol>
        <div className="note-columns">
          <div className="callout">
            <strong>All 2,048 words can occur.</strong>
            <p>
              Each word has one accepted card pair. A blank pair is a retry.
              This keeps all accepted words equally likely when the deck is well
              shuffled before each word.
            </p>
          </div>
          <div className="callout">
            <strong>Use a compatible offline wallet for word 24.</strong>
            <p>
              Record 23 words. The wallet must generate the final 3 entropy bits
              and calculate the 8-bit checksum. Do not pick word 24 from this
              table.
            </p>
            <a href="https://github.com/bitcoin/bips/blob/master/bip-0039.mediawiki">
              Read the BIP39 specification
            </a>
          </div>
        </div>
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
              Use these 13 Letter pages during card draws. The live map above is
              only a quick check. Page 1 is shown below as a preview.
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
            {isDownloadingPdf ? "Creating PDF…" : "Download all 13 pages"}
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
            PDF ready: 13 Letter pages.
          </p>
        ) : null}
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
        <span>
          {pageIndex + 1} / {PAGE_COUNT}
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
