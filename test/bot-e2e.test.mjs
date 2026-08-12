import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer";

// End-to-end test: drives the BUILT site in a real headless Chrome and
// verifies the visitor classification + engagement pipeline end to end.
//
//   1. A real headless browser (webdriver=true, clean Chrome UA) must be
//      classified as visitor.bot.Headless and must NOT emit visit.* or
//      engaged.30s events.
//   2. A simulated real user (webdriver=false, clean Chrome UA, mouse move)
//      must be classified as visitor.human and must emit visit.active and
//      the engaged.30s heartbeat.
//
// The 6s/30s timers are shortened so the whole suite stays fast; the event
// flow is otherwise identical to production. If headless Chrome cannot be
// launched (e.g. the Alpine Jekyll image, which lacks glibc) the test skips
// cleanly; set NCA_E2E_REQUIRED=1 to make the skip a hard failure.

const SITE = fileURLToPath(new URL("../_site/", import.meta.url));
if (!fs.existsSync(path.join(SITE, "index.html"))) {
  console.error("FAIL: _site/index.html not found - run the Jekyll build first.");
  process.exit(1);
}

const CLEAN_CHROME_UA =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36";

const MIME = {
  ".html": "text/html",
  ".css": "text/css",
  ".js": "text/javascript",
  ".json": "application/json",
  ".png": "image/png",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".xml": "application/xml",
  ".ico": "image/x-icon",
  ".txt": "text/plain",
};

const server = http.createServer((req, res) => {
  let urlPath = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
  if (urlPath.endsWith("/")) urlPath += "index.html";
  const file = path.join(SITE, urlPath);
  if (!file.startsWith(SITE) || !fs.existsSync(file)) {
    res.writeHead(404);
    res.end("Not found");
    return;
  }
  res.writeHead(200, { "Content-Type": MIME[path.extname(file).toLowerCase()] || "application/octet-stream" });
  fs.createReadStream(file).pipe(res);
});

let failures = 0;
function assert(condition, message) {
  if (condition) {
    console.log(`  PASS: ${message}`);
  } else {
    console.error(`  FAIL: ${message}`);
    failures += 1;
  }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Capture NCA events and shorten the 6s/30s timers before any page script runs.
function prep(page) {
  return page.evaluateOnNewDocument(() => {
    window.__events = [];
    window.nca_event = (...args) => window.__events.push(args);
    const orig = window.setTimeout.bind(window);
    window.setTimeout = (fn, ms, ...args) =>
      orig(fn, ms === 6000 ? 600 : ms === 30000 ? 900 : ms, ...args);
  });
}

async function eventNames(page) {
  return page.evaluate(() => window.__events.map((a) => a[0]));
}

let browser;
try {
  browser = await puppeteer.launch({ headless: true });
} catch (err) {
  // Chrome for Testing requires glibc; environments like the Alpine-based
  // Jekyll docker image (musl) cannot run it. Skip cleanly there so the
  // local `docker compose up cibuild` still passes - CI (Ubuntu, glibc)
  // has Chrome and will run the full end-to-end test. Set NCA_E2E_REQUIRED=1
  // to turn the skip into a hard failure.
  if (process.env.NCA_E2E_REQUIRED === "1") {
    console.error("FAIL: could not launch headless Chrome:", err.message);
    process.exit(1);
  }
  console.log(
    `SKIP: headless Chrome is not available in this environment (${err.message.split("\n")[0]}); end-to-end test skipped.`
  );
  process.exit(0);
}

try {
  await new Promise((resolve, reject) => {
    server.listen(0, "127.0.0.1", resolve);
    server.on("error", reject);
  });
  const port = server.address().port;
  const url = `http://127.0.0.1:${port}/`;

  // --- Scenario 1: real headless browser must be treated as a bot ---
  console.log("Running headless browser against the built site...");
  const ctxBot = await browser.createBrowserContext();
  const pageBot = await ctxBot.newPage();
  const pageErrors = [];
  pageBot.on("pageerror", (err) => pageErrors.push(err.message));
  await prep(pageBot);
  await pageBot.goto(url, { waitUntil: "load" });
  await sleep(1400); // let the (shortened) 6s/30s timers fire

  const botEvents = await eventNames(pageBot);
  assert(
    botEvents.some((e) => e.startsWith("visitor.bot.")),
    `a headless Chrome is classified as a bot (got: ${botEvents.join(", ") || "no events"})`
  );
  assert(
    !botEvents.some((e) => e.startsWith("visit.")),
    "a bot does not report visit.active/visit.passive"
  );
  assert(
    !botEvents.includes("engaged.30s"),
    "a bot does not report an engaged.30s heartbeat"
  );
  assert(pageErrors.length === 0, "no page errors in the bot scenario");
  await ctxBot.close();

  // --- Scenario 2: simulated real user must be treated as a human ---
  console.log("Running a simulated human against the built site...");
  const ctxHuman = await browser.createBrowserContext();
  const pageHuman = await ctxHuman.newPage();
  await pageHuman.setUserAgent(CLEAN_CHROME_UA);
  await pageHuman.evaluateOnNewDocument(() => {
    Object.defineProperty(window.Navigator.prototype, "webdriver", { get: () => false });
  });
  await prep(pageHuman);
  await pageHuman.goto(url, { waitUntil: "load" });
  await pageHuman.mouse.move(5, 5); // real mousemove = engagement signal
  await sleep(1400);

  const humanEvents = await eventNames(pageHuman);
  assert(
    humanEvents.includes("visitor.human"),
    `a clean Chrome UA is classified as a human (got: ${humanEvents.join(", ") || "no events"})`
  );
  assert(
    humanEvents.includes("visit.active"),
    "an interacting human reports visit.active"
  );
  assert(
    humanEvents.includes("engaged.30s"),
    "an interacting human reports the engaged.30s heartbeat"
  );
  await ctxHuman.close();
} finally {
  await browser.close();
  server.close();
}

if (failures > 0) {
  console.error(`\n${failures} assertion(s) failed.`);
  process.exit(1);
}
console.log("\nAll end-to-end bot classification tests passed.");
