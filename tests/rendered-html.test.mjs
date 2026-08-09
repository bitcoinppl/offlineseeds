import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("renders the finished OfflineSeeds product shell", async () => {
  const html = await readFile(
    new URL("../dist/index.html", import.meta.url),
    "utf8",
  );

  assert.match(html, /<title>OfflineSeeds<\/title>/i);
  const oldBrand = new RegExp(["Shuffle", "tropy"].join(""), "i");
  assert.doesNotMatch(html, oldBrand);
  assert.match(html, /Shuffle code/);
  assert.match(html, /New shuffle code/);
  assert.match(html, /Download PDF/);
  assert.match(html, /Download all 14 pages/);
  assert.doesNotMatch(html, /Download all 13 pages/);
  assert.doesNotMatch(html, /Select “Save as PDF” in the print window/);
  assert.match(html, /All 2,048 words can occur/);
  assert.match(html, /A blank pair is a retry/);
  assert.match(html, /Riffle-shuffle the full deck 12 times/);
  assert.match(html, /12 times in loose, uneven groups/);
  assert.match(html, /Do not continue through the remaining deck/);
  assert.match(html, /empty COLDCARD shows eight valid final words/);
  assert.match(html, /SeedSigner accepts three coin flips/);
  assert.match(html, /Flip a fair coin three times/);
  assert.doesNotMatch(html, /A=TTT|2=TTH|3=THT/);
  assert.match(html, /phrase has 253 bits rather than 256 bits/);
  assert.match(html, /verify with a second offline wallet/i);
  assert.match(html, /Never reverse a pair to avoid a blank/);
  assert.match(html, /Never redraw only one card/);
  assert.match(html, /Do not swap them/);
  assert.match(html, /without cameras or microphones/);
  assert.match(html, /Test the wallet first/);
  assert.match(html, /The 23 words supply 253 bits/);
  assert.match(html, /Entropy analysis/);
  assert.doesNotMatch(html, /One seed\. One deck\./);
  assert.doesNotMatch(html, /Seeded card-to-word maps/i);
});

test("renders complete social preview metadata", async () => {
  const html = await readFile(
    new URL("../dist/index.html", import.meta.url),
    "utf8",
  );

  assert.match(
    html,
    /<link rel="canonical" href="https:\/\/offlineseeds\.com\/">/i,
  );
  assert.match(html, /<meta property="og:title" content="OfflineSeeds">/i);
  assert.match(html, /<meta property="og:type" content="website">/i);
  assert.match(
    html,
    /<meta property="og:image" content="https:\/\/offlineseeds\.com\/og\.png">/i,
  );
  assert.match(html, /<meta property="og:image:width" content="1200">/i);
  assert.match(html, /<meta property="og:image:height" content="630">/i);
  assert.match(
    html,
    /<meta name="twitter:card" content="summary_large_image">/i,
  );
  assert.match(
    html,
    /<meta name="twitter:image" content="https:\/\/offlineseeds\.com\/og\.png">/i,
  );
});
