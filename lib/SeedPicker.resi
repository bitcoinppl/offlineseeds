/** The number of valid BIP39 word slots in the card-pair layout */
@genType
let validSlotCount: int

/** The maximum accepted shuffle code length */
@genType
let maxShuffleCodeLength: int

/** A playing card in the printable lookup */
@genType
type card = {
  index: int,
  id: string,
  rank: string,
  suit: string,
  symbol: string,
  color: string,
}

/** A valid word cell in the card-pair layout */
@genType
type wordCell = {second: card, slot: int, word: string}

/** A blank cell in the card-pair layout */
@genType
type blankCell = {second: card}

/** A valid word cell or a blank cell in the card-pair layout */
@genType
type lookupEntry = Word(wordCell) | Blank(blankCell)

/** One first-card row in the card-pair lookup */
@genType
type lookupRow = {
  first: card,
  entries: array<lookupEntry>,
}

/** A complete deterministic card-pair lookup */
@genType
type lookupTable = {
  shuffleCode: string,
  rows: array<lookupRow>,
}

/** The reason that a shuffle code is not valid */
@genType
type shuffleCodeErrorCode = Empty | TooLong

/** A user-safe shuffle code validation error */
@genType
type shuffleCodeError = {
  code: shuffleCodeErrorCode,
  message: string,
}

/** The result of shuffle code validation */
@genType
type normalizeResult = Valid(string) | Invalid(shuffleCodeError)

/** The result of deterministic lookup generation */
@genType
type generateResult = Generated(lookupTable) | InvalidCode(shuffleCodeError) | InvalidDigest

/** All 52 cards in layout order */
@genType
let cards: array<card>

/** Normalize external shuffle code text into its canonical value */
@genType
let normalizeShuffleCode: string => normalizeResult

/** Build the complete lookup from a normalized code and its SHA-256 bytes */
@genType
let generateLookupTable: (string, array<int>) => generateResult
