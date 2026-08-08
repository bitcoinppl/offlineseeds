/** The number of valid BIP39 word slots in the card-pair layout */
@genType
let validSlotCount = 2048

/** The maximum accepted shuffle code length */
@genType
let maxShuffleCodeLength = 128

type suit = Spades | Hearts | Diamonds | Clubs
type rank = Ace | Two | Three | Four | Five | Six | Seven | Eight | Nine | Ten | Jack | Queen | King

type domainCard = {
  index: int,
  rank: rank,
  suit: suit,
}

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

/** A valid word cell or a blank cell in the card-pair layout */
@genType
type wordCell = {second: card, slot: int, word: string}

@genType
type blankCell = {second: card}

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

@module("@scure/bip39/wordlists/english.js")
external englishWordlist: array<string> = "wordlist"

let suits = [Spades, Hearts, Diamonds, Clubs]
let ranks = [Ace, Two, Three, Four, Five, Six, Seven, Eight, Nine, Ten, Jack, Queen, King]

let suitName = suit =>
  switch suit {
  | Spades => "spades"
  | Hearts => "hearts"
  | Diamonds => "diamonds"
  | Clubs => "clubs"
  }

let suitSymbol = suit =>
  switch suit {
  | Spades => "♠"
  | Hearts => "♥"
  | Diamonds => "♦"
  | Clubs => "♣"
  }

let suitColor = suit =>
  switch suit {
  | Hearts | Diamonds => "red"
  | Spades | Clubs => "black"
  }

let rankName = rank =>
  switch rank {
  | Ace => "A"
  | Two => "2"
  | Three => "3"
  | Four => "4"
  | Five => "5"
  | Six => "6"
  | Seven => "7"
  | Eight => "8"
  | Nine => "9"
  | Ten => "10"
  | Jack => "J"
  | Queen => "Q"
  | King => "K"
  }

let toPublicCard = ({index, rank, suit}: domainCard): card => {
  let rankName = rankName(rank)
  let suitName = suitName(suit)

  {
    index,
    id: `${rankName}-${suitName}`,
    rank: rankName,
    suit: suitName,
    symbol: suitSymbol(suit),
    color: suitColor(suit),
  }
}

let domainCards = suits->Array.flatMapWithIndex((suit, suitIndex) =>
  ranks->Array.mapWithIndex((rank, rankIndex) => {
    index: suitIndex * ranks->Array.length + rankIndex,
    rank,
    suit,
  })
)

/** All 52 cards in layout order */
@genType
let cards = domainCards->Array.map(toPublicCard)

let slotByPairIndex = {
  let cardCount = cards->Array.length
  let pairCount = cardCount * cardCount
  let blankIndices = Array.make(~length=pairCount, false)
  let blankCount = ref(0)

  for index in 0 to cardCount - 1 {
    blankIndices->Array.setUnsafe(index * (cardCount + 1), true)
    blankCount.contents = blankCount.contents + 1
  }

  for diagonal in 1 to ranks->Array.length - 1 {
    for rowOffset in 0 to ranks->Array.length - diagonal - 1 {
      for suitOffset in 0 to suits->Array.length - 1 {
        if pairCount - blankCount.contents > validSlotCount {
          let row = suitOffset * ranks->Array.length + rowOffset
          let column = row + diagonal
          blankIndices->Array.setUnsafe(row * cardCount + column, true)
          blankIndices->Array.setUnsafe(column * cardCount + row, true)
          blankCount.contents = blankCount.contents + 2
        }
      }
    }
  }

  let slots = Array.make(~length=pairCount, -1)
  let slot = ref(0)

  for pairIndex in 0 to pairCount - 1 {
    if !(blankIndices->Array.getUnsafe(pairIndex)) {
      slots->Array.setUnsafe(pairIndex, slot.contents)
      slot.contents = slot.contents + 1
    }
  }

  if slot.contents != validSlotCount {
    panic("The card-pair layout must contain exactly 2,048 word slots")
  }

  slots
}

if (
  englishWordlist->Array.length != validSlotCount ||
    englishWordlist->Set.fromArray->Set.size != validSlotCount
) {
  panic("The BIP39 English word list must contain exactly 2,048 unique words")
}

/** Normalize external shuffle code text into its canonical value */
@genType
let normalizeShuffleCode = value => {
  let shuffleCode = value->String.trim

  if shuffleCode->String.length == 0 {
    Invalid({
      code: Empty,
      message: "Enter a shuffle code before you generate the PDF.",
    })
  } else if shuffleCode->String.length > maxShuffleCodeLength {
    Invalid({
      code: TooLong,
      message: `Use a shuffle code with ${maxShuffleCodeLength->Int.toString} characters or fewer.`,
    })
  } else {
    Valid(shuffleCode)
  }
}

let rotateLeft = (value, shift) =>
  Int.bitwiseOr(Int.shiftLeft(value, shift), Int.shiftRightUnsigned(value, 32 - shift))

let nextUint32 = state => {
  let state0 = state->Array.getUnsafe(0)
  let state1 = state->Array.getUnsafe(1)
  let state2 = state->Array.getUnsafe(2)
  let state3 = state->Array.getUnsafe(3)
  let result = Math.Int.imul(rotateLeft(Math.Int.imul(state1, 5), 7), 9)
  let transfer = Int.shiftLeft(state1, 9)
  let nextState2 = Int.bitwiseXor(state2, state0)
  let nextState3 = Int.bitwiseXor(state3, state1)
  let nextState1 = Int.bitwiseXor(state1, nextState2)
  let nextState0 = Int.bitwiseXor(state0, nextState3)

  state->Array.setUnsafe(0, nextState0)
  state->Array.setUnsafe(1, nextState1)
  state->Array.setUnsafe(2, Int.bitwiseXor(nextState2, transfer))
  state->Array.setUnsafe(3, rotateLeft(nextState3, 11))
  result
}

let randomInteger = (state, bound) => {
  let limit = Math.floor(4294967296.0 /. bound->Float.fromInt) *. bound->Float.fromInt
  let value = ref(nextUint32(state))
  let asUint32 = value =>
    if value < 0 {
      value->Float.fromInt +. 4294967296.0
    } else {
      value->Float.fromInt
    }

  while value.contents->asUint32 >= limit {
    value.contents = nextUint32(state)
  }

  Float.mod(value.contents->asUint32, bound->Float.fromInt)->Float.toInt
}

let uint32LittleEndian = (bytes, offset) =>
  Int.bitwiseOr(
    bytes->Array.getUnsafe(offset),
    Int.bitwiseOr(
      Int.shiftLeft(bytes->Array.getUnsafe(offset + 1), 8),
      Int.bitwiseOr(
        Int.shiftLeft(bytes->Array.getUnsafe(offset + 2), 16),
        Int.shiftLeft(bytes->Array.getUnsafe(offset + 3), 24),
      ),
    ),
  )

// a fixed word permutation preserves card entropy, so keep shuffle-code compatibility
let shuffleWords = digestBytes => {
  let state = Array.fromInitializer(~length=4, index => uint32LittleEndian(digestBytes, index * 4))
  let words = englishWordlist->Array.copy

  for index in words->Array.length - 1 downto 1 {
    let swapIndex = randomInteger(state, index + 1)
    let word = words->Array.getUnsafe(index)
    words->Array.setUnsafe(index, words->Array.getUnsafe(swapIndex))
    words->Array.setUnsafe(swapIndex, word)
  }

  words
}

/** Build the complete lookup from a normalized code and its SHA-256 bytes */
@genType
let generateLookupTable = (value, digestBytes) =>
  switch normalizeShuffleCode(value) {
  | Invalid(error) => InvalidCode(error)
  | Valid(_)
    if digestBytes->Array.length != 32 ||
      !(digestBytes->Array.every(byte => byte >= 0 && byte <= 255)) =>
    InvalidDigest
  | Valid(shuffleCode) => {
      let words = shuffleWords(digestBytes)
      let cardCount = cards->Array.length
      let rows = cards->Array.map(first => {
        let entries = cards->Array.map(second => {
          let pairIndex = first.index * cardCount + second.index
          let slot = slotByPairIndex->Array.getUnsafe(pairIndex)

          if slot < 0 {
            Blank({second: second})
          } else {
            Word({
              second,
              slot,
              word: words->Array.getUnsafe(slot),
            })
          }
        })

        {first, entries}
      })

      Generated({shuffleCode, rows})
    }
  }
