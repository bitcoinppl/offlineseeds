import {
  encodeContributions,
  parseDrand,
  parseRandomOrg,
  type parseResult,
} from "../../lib/Entropy.gen.ts";

const RANDOM_ORG_URL =
  "https://www.random.org/integers/?num=32&min=0&max=255&col=1&base=16&format=plain&rnd=new";
const DRAND_URL = "https://api.drand.sh/public/latest";

export type EntropySourceId = "device" | "random-org" | "drand";

export type EntropySource = Readonly<{
  id: EntropySourceId;
  label: string;
}>;

export type MixedSeedError = Readonly<{
  code:
    | "insecure-context"
    | "local-unavailable"
    | "insufficient-sources"
    | "mix-failed";
  message: string;
}>;

export type MixedSeedResult =
  | Readonly<{
      ok: true;
      seed: string;
      sources: readonly EntropySource[];
      warnings: readonly string[];
    }>
  | Readonly<{ ok: false; error: MixedSeedError }>;

type CryptoProvider = Pick<Crypto, "getRandomValues" | "subtle">;

type MixedSeedOptions = Readonly<{
  signal?: AbortSignal;
  fetcher?: typeof fetch;
  cryptoProvider?: CryptoProvider;
}>;

type Contribution = Readonly<{
  source: EntropySource;
  bytes: readonly number[];
}>;

type ContributionResult =
  | Readonly<{ ok: true; contribution: Contribution }>
  | Readonly<{ ok: false; warning: string }>;

const SOURCES = {
  device: { id: "device", label: "Web Crypto" },
  randomOrg: { id: "random-org", label: "RANDOM.ORG" },
  drand: { id: "drand", label: "drand" },
} as const satisfies Record<string, EntropySource>;

/** Mix secure local bytes with every required independent network source. */
export async function mixRandomSeed(
  options: MixedSeedOptions = {},
): Promise<MixedSeedResult> {
  const usingDefaultCrypto = options.cryptoProvider === undefined;
  if (usingDefaultCrypto && globalThis.isSecureContext === false) {
    return insecureContext();
  }

  const cryptoProvider = options.cryptoProvider ?? globalThis.crypto;
  if (!cryptoProvider?.getRandomValues || !cryptoProvider.subtle) {
    return localUnavailable();
  }

  const deviceBytes = new Uint8Array(32);
  try {
    cryptoProvider.getRandomValues(deviceBytes);
  } catch {
    return localUnavailable();
  }
  const device: Contribution = {
    source: SOURCES.device,
    bytes: Array.from(deviceBytes),
  };

  const fetcher = options.fetcher ?? fetch;
  const [randomOrg, drand] = await Promise.all([
    fetchRandomOrg(fetcher, options.signal),
    fetchDrand(fetcher, options.signal),
  ]);
  const networkResults = [randomOrg, drand];
  const randomOrgBytes = contributionBytes(randomOrg);
  const drandBytes = contributionBytes(drand);
  const encoded = encodeContributions(
    [...device.bytes],
    randomOrgBytes,
    drandBytes,
  );

  if (encoded === "InsufficientSources") {
    return insufficientSources();
  }
  if (encoded === "InvalidContribution") {
    return mixFailed();
  }

  let digest: ArrayBuffer;
  try {
    digest = await cryptoProvider.subtle.digest(
      "SHA-256",
      new Uint8Array(encoded._0),
    );
  } catch {
    return mixFailed();
  }

  const contributions = [
    device,
    ...(randomOrg.ok ? [randomOrg.contribution] : []),
    ...(drand.ok ? [drand.contribution] : []),
  ];

  return {
    ok: true,
    seed: bytesToHex(new Uint8Array(digest)),
    sources: Object.freeze(contributions.map(({ source }) => source)),
    warnings: Object.freeze(
      networkResults.flatMap((result) => (result.ok ? [] : [result.warning])),
    ),
  };
}

async function fetchRandomOrg(
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<ContributionResult> {
  const response = await fetchSource(
    fetcher,
    RANDOM_ORG_URL,
    { method: "GET", cache: "no-store", signal },
    "RANDOM.ORG was unavailable.",
  );
  if (!response.ok) return response;

  return toContribution(
    parseRandomOrg(await response.response.text()),
    SOURCES.randomOrg,
    "RANDOM.ORG returned invalid data.",
  );
}

async function fetchDrand(
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<ContributionResult> {
  const response = await fetchSource(
    fetcher,
    DRAND_URL,
    {
      method: "GET",
      cache: "no-store",
      headers: { accept: "application/json" },
      signal,
    },
    "drand was unavailable.",
  );
  if (!response.ok) return response;

  return toContribution(
    parseDrand(await response.response.text()),
    SOURCES.drand,
    "drand returned invalid data.",
  );
}

async function fetchSource(
  fetcher: typeof fetch,
  url: string,
  init: RequestInit,
  warning: string,
): Promise<{ ok: true; response: Response } | { ok: false; warning: string }> {
  try {
    const response = await fetcher(url, init);
    if (!response.ok) return { ok: false, warning };
    return { ok: true, response };
  } catch {
    return { ok: false, warning };
  }
}

function toContribution(
  result: parseResult,
  source: EntropySource,
  warning: string,
): ContributionResult {
  if (result === "InvalidSourceData") return { ok: false, warning };

  return {
    ok: true,
    contribution: { source, bytes: result._0 },
  };
}

function contributionBytes(result: ContributionResult): number[] | undefined {
  return result.ok ? [...result.contribution.bytes] : undefined;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join(
    "",
  );
}

function insecureContext(): MixedSeedResult {
  return {
    ok: false,
    error: {
      code: "insecure-context",
      message:
        "This page is not a secure context. Open http://localhost:4321 or use HTTPS.",
    },
  };
}

function localUnavailable(): MixedSeedResult {
  return {
    ok: false,
    error: {
      code: "local-unavailable",
      message: "This browser cannot provide secure local randomness.",
    },
  };
}

function insufficientSources(): MixedSeedResult {
  return {
    ok: false,
    error: {
      code: "insufficient-sources",
      message:
        "The site could not reach every required random source. Try again.",
    },
  };
}

function mixFailed(): MixedSeedResult {
  return {
    ok: false,
    error: {
      code: "mix-failed",
      message: "The browser could not mix the random sources.",
    },
  };
}
