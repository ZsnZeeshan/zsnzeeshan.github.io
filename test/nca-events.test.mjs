import fs from "node:fs";
import { JSDOM, VirtualConsole } from "jsdom";

// This test verifies the site's analytics consent + click-tracking logic
// (see _includes/head-analytics.html) behaves correctly at runtime:
//
//   1. Consent banner appears when the visitor has no saved decision,
//      and Google Analytics is not loaded before consent.
//   2. Link clicks are logged as NCA events (via nca_event).
//   3. "Accept" logs cookie-consent-accepted, stores consent=granted,
//      loads the GA script, and hides the banner.
//   4. "Reject" logs cookie-consent-rejected, stores consent=denied,
//      keeps GA off, and sets the ga-disable flag.
//   5. "Withdraw" (privacy page) logs cookie-consent-withdrawn, clears
//      the stored consent, and disables GA.
//
// It runs the built HTML from _site inside jsdom, stubs nca_event to
// capture the event log, simulates the user actions, and asserts on the
// captured events and side effects. Fails (exit 1) if any assertion fails.

const SITE = new URL("../_site/", import.meta.url);
const INDEX = fs.readFileSync(new URL("index.html", SITE), "utf8");
const PRIVACY = fs.readFileSync(new URL("privacy.html", SITE), "utf8");

// Suppress jsdom's noisy "navigation not implemented" warning that fires
// when a link click is simulated, while keeping real errors visible.
const virtualConsole = new VirtualConsole();
virtualConsole.on("jsdomError", (err) => {
  if (!String(err.message).includes("Not implemented: navigation")) {
    console.error(err);
  }
});

let failures = 0;

// Minimal assertion helper; records failures and logs PASS/FAIL per check.
function assert(condition, message) {
  if (condition) {
    console.log(`  PASS: ${message}`);
  } else {
    console.error(`  FAIL: ${message}`);
    failures += 1;
  }
}

// Load a built page in jsdom and execute its inline scripts.
//  - captured: array of (name, value) tuples pushed by the nca_event stub
//  - consent: optional pre-seeded value for the ga_consent localStorage key,
//    simulating a returning visitor who already made a decision
function loadPage(html, { consent, url = "https://zsnzeeshan.github.io/" } = {}) {
  const captured = [];
  const dom = new JSDOM(html, {
    runScripts: "dangerously", // execute inline <script>s from the page
    url, // required so localStorage (and ga_consent) works
    virtualConsole,
    beforeParse(window) {
      // Seed prior consent BEFORE page scripts run, and stub nca_event so
      // we can observe every event the site tries to send to NCA.
      if (consent) window.localStorage.setItem("ga_consent", consent);
      window.nca_event = (...args) => captured.push(args);
    },
  });
  return { dom, captured };
}

// The banner logic runs on DOMContentLoaded; ensure it has fired before
// asserting on its effects (inline scripts run synchronously during parse,
// but waiting here keeps the test robust).
function waitReady(window) {
  if (window.document.readyState === "loading") {
    return new Promise((resolve) =>
      window.addEventListener("DOMContentLoaded", resolve, { once: true })
    );
  }
  return Promise.resolve();
}

// Extract just the event names from the captured nca_event calls.
function eventNames(captured) {
  return captured.map((args) => args[0]);
}

function hasEvent(captured, name) {
  return eventNames(captured).includes(name);
}

// --- Scenario 1: fresh visitor (no prior consent) ---
console.log("Loading index.html with no prior consent...");
const noConsent = loadPage(INDEX);
await waitReady(noConsent.dom.window);
const noConsentWin = noConsent.dom.window;

// Banner must be shown and GA must neither be loaded nor disabled yet.
assert(
  noConsentWin.document.getElementById("cookie-consent").style.display === "block",
  "banner is shown when no consent decision exists"
);
assert(!noConsentWin.gaLoaded, "GA is not loaded before consent");
assert(
  !noConsentWin["ga-disable-G-3T5JF88VB0"],
  "GA is not disabled before consent"
);

// --- Scenario 2: link click tracking ---
console.log("Simulating a link click...");
noConsentWin.document
  .querySelector('a[href="/projects.html"]:not(.profile-link)')
  .dispatchEvent(new noConsentWin.MouseEvent("click", { bubbles: true }));
assert(
  eventNames(noConsent.captured).some((n) => n.startsWith("click.")),
  "link click sends an NCA click event"
);

// --- Scenario 3: Accept ---
console.log("Simulating Accept...");
noConsentWin.document
  .getElementById("accept-cookies")
  .dispatchEvent(new noConsentWin.MouseEvent("click", { bubbles: true }));
assert(
  hasEvent(noConsent.captured, "cookie-consent-accepted"),
  "Accept logs cookie-consent-accepted"
);
assert(
  noConsentWin.localStorage.getItem("ga_consent") === "granted",
  "Accept stores consent=granted"
);
assert(noConsentWin.gaLoaded === true, "Accept loads GA");
assert(
  noConsentWin.document.querySelector('script[src*="googletagmanager.com/gtag/js"]'),
  "GA script tag is injected after accept"
);
assert(
  noConsentWin.document.getElementById("cookie-consent").style.display === "none",
  "banner hides after Accept"
);

console.log("Logged NCA events (index):");
console.log(`  ${eventNames(noConsent.captured).join(", ")}`);

// --- Scenario 4: Reject (fresh window, no prior decision) ---
console.log("Loading index.html fresh and simulating Reject...");
const reject = loadPage(INDEX);
await waitReady(reject.dom.window);
const rejectWin = reject.dom.window;
rejectWin.document
  .getElementById("reject-cookies")
  .dispatchEvent(new rejectWin.MouseEvent("click", { bubbles: true }));
assert(
  hasEvent(reject.captured, "cookie-consent-rejected"),
  "Reject logs cookie-consent-rejected"
);
assert(
  rejectWin.localStorage.getItem("ga_consent") === "denied",
  "Reject stores consent=denied"
);
assert(rejectWin.gaLoaded !== true, "Reject does not load GA");
assert(
  rejectWin["ga-disable-G-3T5JF88VB0"] === true,
  "Reject sets ga-disable flag"
);

// --- Scenario 5: Withdraw (privacy page, previously granted) ---
console.log("Loading privacy.html with granted consent and simulating Withdraw...");
const withdraw = loadPage(PRIVACY, { consent: "granted" });
await waitReady(withdraw.dom.window);
const withdrawWin = withdraw.dom.window;
withdrawWin.document
  .getElementById("withdraw-consent")
  .dispatchEvent(new withdrawWin.MouseEvent("click", { bubbles: true }));
assert(
  hasEvent(withdraw.captured, "cookie-consent-withdrawn"),
  "Withdraw logs cookie-consent-withdrawn"
);
assert(
  withdrawWin.localStorage.getItem("ga_consent") === null,
  "Withdraw clears the consent key"
);
assert(
  withdrawWin["ga-disable-G-3T5JF88VB0"] === true,
  "Withdraw sets ga-disable flag (stops GA)"
);

console.log("Logged NCA events (privacy):");
console.log(`  ${eventNames(withdraw.captured).join(", ")}`);

// --- Summary: fail the build if any assertion failed ---
console.log("");
if (failures > 0) {
  console.error(`${failures} NCA test(s) FAILED`);
  process.exit(1);
}
console.log("All NCA event tests passed.");
