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
function loadPage(html, { consent, url = "https://zsnzeeshan.github.io/", ua } = {}) {
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
      // Optionally simulate a crawler by overriding the user agent.
      if (ua) {
        Object.defineProperty(window.navigator, "userAgent", {
          value: ua,
          configurable: true,
        });
      }
      // Fast-forward the 30s engagement heartbeat, and capture the 6s
      // interaction timer so the test can fire it manually.
      window.__sixSecTimers = [];
      const origSetTimeout = window.setTimeout.bind(window);
      window.setTimeout = (fn, ms, ...args) => {
        if (ms === 30000) fn();
        else if (ms === 6000) window.__sixSecTimers.push(fn);
        else return origSetTimeout(fn, ms, ...args);
      };
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

// Value payload captured for an event, if any (bot events carry
// "category|user-agent" so the dashboard can segment crawlers).
function eventValue(captured, name) {
  const match = captured.find((args) => args[0] === name);
  return match ? match[1] : undefined;
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
assert(
  hasEvent(noConsent.captured, "engaged.30s"),
  "30s time-on-page heartbeat fires an engaged.30s event"
);
assert(
  hasEvent(noConsent.captured, "visitor.human"),
  "a normal browser is classified as visitor.human"
);

// Scroll depth: jsdom has no real layout, so stub the geometry to simulate
// a scrollable page, then dispatch a scroll event to ~83% of the page.
// Expect the 25/50/75 milestones (not 100) to be reported once.
const docEl = noConsentWin.document.documentElement;
Object.defineProperty(docEl, "scrollHeight", { value: 2000, configurable: true });
Object.defineProperty(docEl, "clientHeight", { value: 500, configurable: true });
Object.defineProperty(docEl, "scrollTop", { value: 1250, configurable: true });
noConsentWin.dispatchEvent(new noConsentWin.Event("scroll"));
assert(
  hasEvent(noConsent.captured, "scroll-depth.25") &&
    hasEvent(noConsent.captured, "scroll-depth.50") &&
    hasEvent(noConsent.captured, "scroll-depth.75"),
  "scrolling to 83% reports the 25/50/75 scroll-depth milestones"
);
assert(
  !hasEvent(noConsent.captured, "scroll-depth.100"),
  "the 100% milestone is not reported before reaching the bottom"
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

// Fire the captured 6s interaction timer now that scrolls/clicks happened;
// the visit should be classified as active (human interaction observed).
noConsentWin.__sixSecTimers[0]();
assert(
  hasEvent(noConsent.captured, "visit.active"),
  "interacting within 6s classifies the visit as visit.active"
);

console.log("Logged NCA events (index):");
console.log(`  ${eventNames(noConsent.captured).join(", ")}`);

// --- Scenario 4: Reject (fresh window, no prior decision) ---
console.log("Loading index.html fresh and simulating Reject...");
const reject = loadPage(INDEX);
await waitReady(reject.dom.window);
const rejectWin = reject.dom.window;

// No interaction happened on this fresh load yet; firing the captured 6s
// timer should classify the visit as passive (no human engagement).
rejectWin.__sixSecTimers[0]();
assert(
  hasEvent(reject.captured, "visit.passive"),
  "no interaction within 6s classifies the visit as visit.passive"
);

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

// --- Scenario 6: bot/crawler classification via user-agent ---
console.log("Loading index.html with a Googlebot user-agent...");
const bot = loadPage(INDEX, {
  ua: "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
});
await waitReady(bot.dom.window);
assert(
  hasEvent(bot.captured, "visitor.bot.Googlebot"),
  "a Googlebot user-agent is classified as visitor.bot.Googlebot"
);
assert(
  eventValue(bot.captured, "visitor.bot.Googlebot").startsWith("search|"),
  "bot events carry a category payload (Googlebot => search|...)"
);
assert(
  eventValue(bot.captured, "visitor.bot.Googlebot").includes("googlebot"),
  "bot events carry the (truncated) user-agent in the payload"
);
assert(
  !hasEvent(bot.captured, "visitor.human"),
  "a Googlebot user-agent is not classified as a human"
);
// Bot visits must not pollute the human-engagement metrics: no 30s
// heartbeat and no active/passive visit classification.
assert(
  !hasEvent(bot.captured, "engaged.30s"),
  "bot visits do not report an engaged.30s heartbeat"
);
bot.dom.window.__sixSecTimers[0]();
assert(
  !hasEvent(bot.captured, "visit.active") && !hasEvent(bot.captured, "visit.passive"),
  "bot visits do not report visit.active/visit.passive"
);

console.log("Loading index.html with an AI crawler user-agent...");
const ai = loadPage(INDEX, {
  ua: "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; GPTBot/1.2; +https://openai.com/gptbot",
});
await waitReady(ai.dom.window);
assert(
  hasEvent(ai.captured, "visitor.bot.GPTBot"),
  "GPTBot user-agent is classified as visitor.bot.GPTBot"
);
assert(
  eventValue(ai.captured, "visitor.bot.GPTBot").startsWith("ai|"),
  "AI crawler events carry the ai category payload"
);

console.log("Loading index.html with an unknown generic spider...");
const generic = loadPage(INDEX, { ua: "MysteryCrawler/1.0 (compatible; example spider)" });
await waitReady(generic.dom.window);
assert(
  hasEvent(generic.captured, "visitor.bot.Unknown"),
  "an unmatched crawler-like user-agent is classified as visitor.bot.Unknown"
);
assert(
  eventValue(generic.captured, "visitor.bot.Unknown").startsWith("other|"),
  "unknown bot events carry the other category payload"
);

// --- Scenario 7: returning visitor who previously accepted consent ---
// A stored consent=granted must re-apply on every page load: GA loads
// without the visitor having to click Accept again.
console.log("Loading index.html with a Lighthouse renderer user-agent...");
const lighthouse = loadPage(INDEX, {
  ua: "Mozilla/5.0 (Linux; Android 11; Pixel 5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Mobile Safari/537.36 Chrome-Lighthouse",
});
await waitReady(lighthouse.dom.window);
assert(
  hasEvent(lighthouse.captured, "visitor.bot.Lighthouse"),
  "a Lighthouse renderer (clean Chrome UA) is classified as visitor.bot.Lighthouse"
);
lighthouse.dom.window.__sixSecTimers[0]();
assert(
  !hasEvent(lighthouse.captured, "visit.active") && !hasEvent(lighthouse.captured, "visit.passive"),
  "renderer crawlers that scroll do not report visit.active/visit.passive"
);

console.log("Loading index.html with stored granted consent...");
const returning = loadPage(INDEX, { consent: "granted" });
await waitReady(returning.dom.window);
assert(
  returning.dom.window.gaLoaded === true,
  "returning visitor with stored granted consent loads GA without clicking"
);
assert(
  returning.dom.window.document.getElementById("cookie-consent").style.display === "none",
  "banner stays hidden for a returning visitor who already accepted"
);

// --- Scenario 8: returning visitor who previously rejected consent ---
console.log("Loading index.html with stored denied consent...");
const returningDenied = loadPage(INDEX, { consent: "denied" });
await waitReady(returningDenied.dom.window);
assert(
  returningDenied.dom.window.gaLoaded !== true,
  "returning visitor with stored denied consent does not load GA"
);
assert(
  returningDenied.dom.window["ga-disable-G-3T5JF88VB0"] === true,
  "returning visitor with stored denied consent keeps the ga-disable flag set"
);

// --- Summary: fail the build if any assertion failed ---
console.log("");
if (failures > 0) {
  console.error(`${failures} NCA test(s) FAILED`);
  process.exit(1);
}
console.log("All NCA event tests passed.");
