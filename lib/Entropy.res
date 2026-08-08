/** Parsed 256-bit entropy or invalid source data */
@genType
type parseResult = Parsed(array<int>) | InvalidSourceData

/** Encoded entropy contributions or an invalid contribution set */
@genType
type encodeResult = Encoded(array<int>) | InvalidContribution | InsufficientSources

@val
external isSafeInteger: float => bool = "Number.isSafeInteger"

let byteTokenPattern = /^[\da-f]{1,2}$/i
let entropyHexPattern = /^[\da-f]{64}$/i
let whitespacePattern = /\s+/
let mixDomain = "offlineseeds:cards:mixed-seed:v1"

let parseHexByte = value =>
  switch Int.fromString(value, ~radix=16) {
  | Some(byte) => byte
  | None => 0
  }

let parseHex = value =>
  Array.fromInitializer(~length=value->String.length / 2, index =>
    value
    ->String.slice(~start=index * 2, ~end=index * 2 + 2)
    ->parseHexByte
  )

/** Parse and validate the 32 hexadecimal bytes returned by RANDOM.ORG */
@genType
let parseRandomOrg = body => {
  let values =
    body
    ->String.trim
    ->String.splitByRegExp(whitespacePattern)
    ->Array.keepSome

  if (
    values->Array.length != 32 ||
      !(values->Array.every(value => byteTokenPattern->RegExp.test(value)))
  ) {
    InvalidSourceData
  } else {
    Parsed(values->Array.map(parseHexByte))
  }
}

let parseDrandJson = json =>
  switch json {
  | JSON.Object(fields) =>
    switch (fields->Dict.get("round"), fields->Dict.get("randomness")) {
    | (Some(JSON.Number(round)), Some(JSON.String(randomness)))
      if isSafeInteger(round) && entropyHexPattern->RegExp.test(randomness) =>
      Parsed(parseHex(randomness))
    | _ => InvalidSourceData
    }
  | _ => InvalidSourceData
  }

/** Parse and validate a drand JSON response */
@genType
let parseDrand = body =>
  try {
    body->JSON.parseOrThrow->parseDrandJson
  } catch {
  | _ => InvalidSourceData
  }

let isEntropy = bytes =>
  bytes->Array.length == 32 && bytes->Array.every(byte => byte >= 0 && byte <= 255)

let asciiBytes = value =>
  Array.fromInitializer(~length=value->String.length, index =>
    switch value->String.charCodeAt(index) {
    | Some(code) => code
    | None => 0
    }
  )

let appendContribution = (output, sourceId, bytes) => {
  let label = asciiBytes(sourceId)
  output->Array.push(label->Array.length)
  output->Array.pushMany(label)
  output->Array.push(Int.shiftRightUnsigned(bytes->Array.length, 8) % 256)
  output->Array.push(bytes->Array.length % 256)
  output->Array.pushMany(bytes)
}

/** Encode local and required network entropy with fixed labels and lengths */
@genType
let encodeContributions = (device, randomOrg, drand) => {
  let networkContributions = [randomOrg, drand]->Array.keepSome

  if !isEntropy(device) || !(networkContributions->Array.every(isEntropy)) {
    InvalidContribution
  } else if networkContributions->Array.length != 2 {
    InsufficientSources
  } else {
    let output = asciiBytes(mixDomain)
    output->Array.push(0)
    appendContribution(output, "device", device)

    switch randomOrg {
    | Some(bytes) => appendContribution(output, "random-org", bytes)
    | None => ()
    }

    switch drand {
    | Some(bytes) => appendContribution(output, "drand", bytes)
    | None => ()
    }

    Encoded(output)
  }
}
