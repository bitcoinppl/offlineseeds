import {
  PDFDocument,
  type PDFFont,
  type PDFPage,
  StandardFonts,
  rgb,
  type RGB,
} from "pdf-lib";

import {
  type Card,
  type LookupEntry,
  type LookupRow,
  type LookupTable,
  type Suit,
} from "./seed-picker";

const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const TABLE_PAGE_COUNT = 13;
// an instructions page precedes the table so the procedure stays with the printout
const TOTAL_PAGE_COUNT = TABLE_PAGE_COUNT + 1;
const ROWS_PER_PAGE = 4;
const PAGE_MARGIN = 36;
const CONTENT_WIDTH = PAGE_WIDTH - PAGE_MARGIN * 2;
const HEADER_HEIGHT = 28;
const LOOKUP_ROW_HEIGHT = 135;
const LOOKUP_ROW_GAP = 8;
const FIRST_CARD_WIDTH = 36;
const GRID_WIDTH = CONTENT_WIDTH - FIRST_CARD_WIDTH;
const GRID_COLUMN_COUNT = 13;
const GRID_ROW_COUNT = 4;
const GRID_COLUMN_WIDTH = GRID_WIDTH / GRID_COLUMN_COUNT;
const GRID_ROW_HEIGHT = LOOKUP_ROW_HEIGHT / GRID_ROW_COUNT;
const FIRST_ROW_TOP = PAGE_HEIGHT - PAGE_MARGIN - HEADER_HEIGHT - 12;

const BLACK = rgb(0.094, 0.094, 0.106);
const RED = rgb(0.725, 0.11, 0.11);
const MUTED = rgb(0.322, 0.322, 0.357);
const RULE = rgb(0.63, 0.63, 0.667);
const LIGHT_RULE = rgb(0.894, 0.894, 0.906);
const BLANK_BACKGROUND = rgb(0.957, 0.957, 0.961);

type PdfFonts = Readonly<{
  regular: PDFFont;
  bold: PDFFont;
}>;

/** Create the complete 13-page Letter PDF for a lookup table. */
export async function createLookupPdf(table: LookupTable): Promise<Uint8Array> {
  const document = await PDFDocument.create();
  const fonts: PdfFonts = {
    regular: await document.embedFont(StandardFonts.Helvetica),
    bold: await document.embedFont(StandardFonts.HelveticaBold),
  };

  document.setTitle("OfflineSeeds card-to-word lookup");
  document.setSubject(`Shuffle code: ${table.seed}`);
  document.setCreator("OfflineSeeds");
  document.setProducer("OfflineSeeds");

  const instructionsPage = document.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  drawHeader(instructionsPage, fonts, table.seed, 1);
  drawInstructions(instructionsPage, fonts);

  for (let pageIndex = 0; pageIndex < TABLE_PAGE_COUNT; pageIndex += 1) {
    const page = document.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    const start = pageIndex * ROWS_PER_PAGE;
    const rows = table.rows.slice(start, start + ROWS_PER_PAGE);

    drawHeader(page, fonts, table.seed, pageIndex + 2);
    rows.forEach((row, rowIndex) => drawLookupRow(page, fonts, row, rowIndex));
    drawFooter(page, fonts);
  }

  return document.save();
}

type InstructionSection = Readonly<{
  title: string;
  lines: readonly string[];
}>;

const INSTRUCTION_SECTIONS: readonly InstructionSection[] = [
  {
    title: "Materials",
    lines: [
      "- A complete 52-card deck without jokers",
      "- This printed lookup table, pages 2-14",
      "- Pen and paper",
      "- A fair coin if you use SeedSigner for word 24",
      "- An empty COLDCARD or an air-gapped SeedSigner for word 24",
      "- A private room without cameras or microphones",
    ],
  },
  {
    title: "Prepare",
    lines: [
      "1. Count all 52 distinct cards. Remove the jokers and advertising cards.",
      "2. If you have never finished word 24 on this device, do one dry run with disposable words first.",
    ],
  },
  {
    title: "Generate words 1-23. For each word:",
    lines: [
      "1. Return all 52 cards. Riffle-shuffle the full deck 8 times in loose, uneven groups.",
      "2. Put the top card on the left and the next card on the right. Do not swap them.",
      "3. Find the first card in the large box at the left edge of a table row.",
      "4. Find the second card in that row. For a dash, restore all 52 cards",
      "   and shuffle again. Continuing through the deck would favor some words.",
      "5. Otherwise, record the word. Stop after 23 words.",
    ],
  },
  {
    title: "Rules",
    lines: [
      "- Accept every nonblank entry, including same-suit pairs.",
      "- Never reverse a pair to avoid a blank. Never redraw only one card.",
      "- Accept repeated cards, pairs, and words. Do not replace a result because it looks unusual.",
      "- Keep accepted and rejected draws private.",
    ],
  },
  {
    title: "Word 24 with COLDCARD",
    lines: [
      "1. COLDCARD: choose Import Existing > 24 Words, then enter the 23 words.",
      "2. The device shows 8 final words. Count positions 1-8 from the top.",
      "3. Restore all 52 cards, shuffle as above, and draw the top card.",
      "4. Ace selects 1, 2 selects 2, and so on through 8.",
      "5. For 9-K, return the card, shuffle the full deck, and draw again.",
    ],
  },
  {
    title: "Word 24 with SeedSigner",
    lines: [
      "1. Choose Tools > Calc 12th/24th word > 24 words.",
      "2. Enter the 23 words, then choose Coin Flip Entropy.",
      "3. Flip a fair coin 3 times. Enter each Heads or Tails result.",
      "4. Record the displayed word 24 and confirm the complete phrase.",
      "Destroy the temporary notes after either method.",
    ],
  },
  {
    title: "What to expect",
    lines: [
      "- Approximately 77.2% of draws give a word: 2,048 of 2,652 ordered pairs.",
      "- Expect approximately 30 attempts for 23 words. Blank pairs are normal.",
      "- COLDCARD uses one final card; SeedSigner uses 3 final coin flips.",
    ],
  },
];

function drawInstructions(page: PDFPage, fonts: PdfFonts) {
  const titleSize = 10;
  const lineSize = 9;
  const lineHeight = 14;
  const sectionGap = 12;
  let y = PAGE_HEIGHT - PAGE_MARGIN - HEADER_HEIGHT - 26;

  page.drawText("How to use this table", {
    x: PAGE_MARGIN,
    y,
    size: 13,
    font: fonts.bold,
    color: BLACK,
  });
  y -= 26;

  for (const section of INSTRUCTION_SECTIONS) {
    page.drawText(section.title, {
      x: PAGE_MARGIN,
      y,
      size: titleSize,
      font: fonts.bold,
      color: BLACK,
    });
    y -= lineHeight + 2;

    for (const line of section.lines) {
      page.drawText(line, {
        x: PAGE_MARGIN,
        y,
        size: lineSize,
        font: fonts.regular,
        color: BLACK,
      });
      y -= lineHeight;
    }

    y -= sectionGap;
  }
}

function drawHeader(
  page: PDFPage,
  fonts: PdfFonts,
  shuffleCode: string,
  pageNumber: number,
) {
  const top = PAGE_HEIGHT - PAGE_MARGIN;
  const baseline = top - 11;
  const pageLabel = `${pageNumber} / ${TOTAL_PAGE_COUNT}`;
  const pageLabelWidth = fonts.regular.widthOfTextAtSize(pageLabel, 8);
  const codeAreaStart = PAGE_MARGIN + 82;
  const codeAreaEnd = PAGE_WIDTH - PAGE_MARGIN - pageLabelWidth - 18;
  const codeAreaWidth = codeAreaEnd - codeAreaStart;
  const code = `Shuffle code: ${shuffleCode}`;
  const codeSize = fitTextSize(fonts.regular, code, codeAreaWidth, 7, 4.5);
  const codeWidth = fonts.regular.widthOfTextAtSize(code, codeSize);

  page.drawText("OfflineSeeds", {
    x: PAGE_MARGIN,
    y: baseline,
    size: 10,
    font: fonts.bold,
    color: BLACK,
  });
  page.drawText(code, {
    x: codeAreaStart + (codeAreaWidth - codeWidth) / 2,
    y: baseline + (7 - codeSize) / 2,
    size: codeSize,
    font: fonts.regular,
    color: BLACK,
  });
  page.drawText(pageLabel, {
    x: PAGE_WIDTH - PAGE_MARGIN - pageLabelWidth,
    y: baseline + 1,
    size: 8,
    font: fonts.regular,
    color: BLACK,
  });
  page.drawLine({
    start: { x: PAGE_MARGIN, y: top - HEADER_HEIGHT },
    end: { x: PAGE_WIDTH - PAGE_MARGIN, y: top - HEADER_HEIGHT },
    thickness: 0.7,
    color: RULE,
  });
}

function drawLookupRow(
  page: PDFPage,
  fonts: PdfFonts,
  row: LookupRow,
  rowIndex: number,
) {
  const top = FIRST_ROW_TOP - rowIndex * (LOOKUP_ROW_HEIGHT + LOOKUP_ROW_GAP);
  const bottom = top - LOOKUP_ROW_HEIGHT;

  page.drawRectangle({
    x: PAGE_MARGIN,
    y: bottom,
    width: CONTENT_WIDTH,
    height: LOOKUP_ROW_HEIGHT,
    borderColor: RULE,
    borderWidth: 0.7,
  });
  page.drawLine({
    start: { x: PAGE_MARGIN + FIRST_CARD_WIDTH, y: bottom },
    end: { x: PAGE_MARGIN + FIRST_CARD_WIDTH, y: top },
    thickness: 0.7,
    color: RULE,
  });

  drawFirstCard(page, fonts, row.first, bottom);
  row.entries.forEach((entry, entryIndex) =>
    drawMappingCell(page, fonts, entry, entryIndex, bottom),
  );
}

function drawFirstCard(
  page: PDFPage,
  fonts: PdfFonts,
  card: Card,
  rowBottom: number,
) {
  const color = card.color === "red" ? RED : BLACK;
  const rankSize = 16;
  const rankWidth = fonts.bold.widthOfTextAtSize(card.rank, rankSize);
  const centerX = PAGE_MARGIN + FIRST_CARD_WIDTH / 2;

  page.drawText(card.rank, {
    x: centerX - rankWidth / 2,
    y: rowBottom + LOOKUP_ROW_HEIGHT / 2 + 5,
    size: rankSize,
    font: fonts.bold,
    color,
  });
  drawSuit(page, card.suit, centerX - 6, rowBottom + 61, 12, color);
}

function drawMappingCell(
  page: PDFPage,
  fonts: PdfFonts,
  entry: LookupEntry,
  entryIndex: number,
  rowBottom: number,
) {
  const gridRow = Math.floor(entryIndex / GRID_COLUMN_COUNT);
  const gridColumn = entryIndex % GRID_COLUMN_COUNT;
  const x = PAGE_MARGIN + FIRST_CARD_WIDTH + gridColumn * GRID_COLUMN_WIDTH;
  const y = rowBottom + LOOKUP_ROW_HEIGHT - (gridRow + 1) * GRID_ROW_HEIGHT;

  if (entry.kind === "blank") {
    page.drawRectangle({
      x,
      y,
      width: GRID_COLUMN_WIDTH,
      height: GRID_ROW_HEIGHT,
      color: BLANK_BACKGROUND,
    });
  }

  if (gridColumn > 0) {
    page.drawLine({
      start: { x, y },
      end: { x, y: y + GRID_ROW_HEIGHT },
      thickness: 0.45,
      color: LIGHT_RULE,
    });
  }
  if (gridRow > 0) {
    page.drawLine({
      start: { x, y: y + GRID_ROW_HEIGHT },
      end: { x: x + GRID_COLUMN_WIDTH, y: y + GRID_ROW_HEIGHT },
      thickness: 0.45,
      color: LIGHT_RULE,
    });
  }

  drawSecondCard(page, fonts, entry.second, x, y);
  const word = entry.word ?? "-";
  const wordSize = fitTextSize(
    fonts.regular,
    word,
    GRID_COLUMN_WIDTH - 5,
    5.4,
    4.6,
  );
  page.drawText(word, {
    x: x + 2.5,
    y: y + 8,
    size: wordSize,
    font: fonts.regular,
    color: BLACK,
  });
}

function drawSecondCard(
  page: PDFPage,
  fonts: PdfFonts,
  card: Card,
  cellX: number,
  cellY: number,
) {
  const color = card.color === "red" ? RED : BLACK;
  const rankSize = 5.4;
  const rankX = cellX + 2.5;
  const rankY = cellY + GRID_ROW_HEIGHT - 9;
  const rankWidth = fonts.bold.widthOfTextAtSize(card.rank, rankSize);

  page.drawText(card.rank, {
    x: rankX,
    y: rankY,
    size: rankSize,
    font: fonts.bold,
    color,
  });
  drawSuit(page, card.suit, rankX + rankWidth + 1.2, rankY + 5.5, 5.2, color);
}

function drawFooter(page: PDFPage, fonts: PdfFonts) {
  const footerY = 87;

  page.drawLine({
    start: { x: PAGE_MARGIN, y: footerY + 14 },
    end: { x: PAGE_WIDTH - PAGE_MARGIN, y: footerY + 14 },
    thickness: 0.5,
    color: LIGHT_RULE,
  });
  page.drawText(
    "First card at left. Second card and word in the grid. A dash is a blank pair.",
    {
      x: PAGE_MARGIN,
      y: footerY,
      size: 7,
      font: fonts.regular,
      color: MUTED,
    },
  );
}

function drawSuit(
  page: PDFPage,
  suit: Suit,
  x: number,
  y: number,
  size: number,
  color: RGB,
) {
  page.drawSvgPath(SUIT_PATHS[suit], {
    x,
    y,
    scale: size / 10,
    color,
  });
}

function fitTextSize(
  font: PDFFont,
  text: string,
  maxWidth: number,
  preferredSize: number,
  minimumSize: number,
) {
  const width = font.widthOfTextAtSize(text, preferredSize);
  if (width <= maxWidth) return preferredSize;

  return Math.max(minimumSize, (preferredSize * maxWidth) / width);
}

const SUIT_PATHS: Readonly<Record<Suit, string>> = {
  spades:
    "M5 0C4.1 1.4 0 4.2 0 6.8C0 8.3 1.1 9.3 2.6 9.3C3.5 9.3 4.3 8.8 4.7 8L4.1 10H5.9L5.3 8C5.7 8.8 6.5 9.3 7.4 9.3C8.9 9.3 10 8.3 10 6.8C10 4.2 5.9 1.4 5 0Z",
  hearts:
    "M5 10C4.2 9.1 0 6.3 0 3.3C0 1.4 1.4 0 3.2 0C4.2 0 5 0.5 5.5 1.3C6 0.5 6.8 0 7.8 0C9.2 0 10 1.4 10 3.3C10 6.3 5.8 9.1 5 10Z",
  diamonds: "M5 0L10 5L5 10L0 5Z",
  clubs:
    "M5 0C3.7 0 2.7 1 2.7 2.3C2.7 2.7 2.8 3 3 3.3C2.7 3.2 2.3 3.1 2 3.1C0.9 3.1 0 4 0 5.2C0 6.4 0.9 7.3 2 7.3C2.9 7.3 3.7 6.8 4 6L3.3 10H6.7L6 6C6.3 6.8 7.1 7.3 8 7.3C9.1 7.3 10 6.4 10 5.2C10 4 9.1 3.1 8 3.1C7.7 3.1 7.3 3.2 7 3.3C7.2 3 7.3 2.7 7.3 2.3C7.3 1 6.3 0 5 0Z",
};
