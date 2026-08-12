import fs from "node:fs";

// This test verifies the visitor classifier in _includes/head-analytics.html
// (window.classifyVisitor) against real-world crawler and browser corpora:
//
//   1. Coverage: at least 95% of the vendored crawler corpus (2118 user
//      agents from monperrus/crawler-user-agents, family instances) must be
//      classified as bots. The corpus is a superset of what a static
//      GitHub Pages site can expect to see.
//   2. False positives: none of the real browser user agents may be
//      classified as a bot.
//   3. The webdriver flag alone (headless automation) must classify as a bot.
//
// The classifier is extracted from the BUILT page so the test always runs
// against exactly what ships to visitors.
//
// Fixture provenance:
//   - crawler-corpus.json: 2118 unique user agents generated from the
//     monperrus/crawler-user-agents corpus (one instance per family),
//     vendored as a snapshot. Regenerate with:
//       curl -L https://raw.githubusercontent.com/monperrus/crawler-user-agents/master/crawler-user-agents.json \
//         | jq -r '.[].instances[] | if type == "object" then .url else . end' | sort -u
//   - real-browsers.json: curated current desktop/mobile browser user agents
//     (used as the false-positive check).

const INDEX = fs.readFileSync(new URL("../_site/index.html", import.meta.url), "utf8");

const match = INDEX.match(/window\.classifyVisitor = \(function \(\) \{[\s\S]*?\}\)\(\);/);
if (!match) {
  console.error("FAIL: window.classifyVisitor not found in built _site/index.html");
  process.exit(1);
}

// Evaluate the vendored classifier in a bare sandbox (no DOM needed - it is
// pure UA + webdriver string logic).
const classify = new Function("window", match[0] + " return window.classifyVisitor;")({});

let failures = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  PASS: ${message}`);
  } else {
    console.error(`  FAIL: ${message}`);
    failures += 1;
  }
}

// --- Coverage: crawler corpus must be caught ---
const corpus = JSON.parse(
  fs.readFileSync(new URL("./fixtures/crawler-corpus.json", import.meta.url), "utf8")
);
let caught = 0;
const misses = [];
for (const ua of corpus) {
  if (classify(ua, false).name !== "human") caught += 1;
  else misses.push(ua);
}
const coverage = (caught / corpus.length) * 100;
console.log(`Coverage: ${caught}/${corpus.length} crawler user agents (${coverage.toFixed(1)}%)`);
assert(coverage >= 95, `crawler corpus coverage >= 95% (got ${coverage.toFixed(1)}%)`);
if (coverage < 95) {
  misses.slice(0, 20).forEach((ua) => console.error(`    missed: ${ua}`));
}

// --- False positives: real browsers must NOT be bots ---
const browsers = JSON.parse(
  fs.readFileSync(new URL("./fixtures/real-browsers.json", import.meta.url), "utf8")
);
const fpHits = browsers.filter((ua) => classify(ua, false).name !== "human");
console.log(`False positives: ${fpHits.length}/${browsers.length} real browsers misclassified`);
assert(fpHits.length === 0, "no real browser user agent is classified as a bot");

// --- Webdriver flag (headless automation) ---
const headless = classify(
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  true
);
assert(headless.name === "Headless", "webdriver=true classifies as visitor.bot.Headless");

if (failures > 0) {
  console.error(`\n${failures} assertion(s) failed.`);
  process.exit(1);
}
console.log("\nAll bot classification tests passed.");
