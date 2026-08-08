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
const PAGE_COUNT = 13;
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

  for (let pageIndex = 0; pageIndex < PAGE_COUNT; pageIndex += 1) {
    const page = document.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    const start = pageIndex * ROWS_PER_PAGE;
    const rows = table.rows.slice(start, start + ROWS_PER_PAGE);

    drawHeader(page, fonts, table.seed, pageIndex);
    rows.forEach((row, rowIndex) => drawLookupRow(page, fonts, row, rowIndex));
    drawFooter(page, fonts);
  }

  return document.save();
}

function drawHeader(
  page: PDFPage,
  fonts: PdfFonts,
  shuffleCode: string,
  pageIndex: number,
) {
  const top = PAGE_HEIGHT - PAGE_MARGIN;
  const baseline = top - 11;
  const pageLabel = `${pageIndex + 1} / ${PAGE_COUNT}`;
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
