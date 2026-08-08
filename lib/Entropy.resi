/** Parsed 256-bit entropy or invalid source data */
@genType
type parseResult = Parsed(array<int>) | InvalidSourceData

/** Encoded entropy contributions or an invalid contribution set */
@genType
type encodeResult = Encoded(array<int>) | InvalidContribution | InsufficientSources

/** Parse and validate the 32 hexadecimal bytes returned by RANDOM.ORG */
@genType
let parseRandomOrg: string => parseResult

/** Parse and validate a drand JSON response */
@genType
let parseDrand: string => parseResult

/** Encode local and required network entropy with fixed labels and lengths */
@genType
let encodeContributions: (array<int>, option<array<int>>, option<array<int>>) => encodeResult
