import fs from "node:fs";
import { spawnSync } from "node:child_process";

// Regression tests for the site-fix checklist (issue #13). Guards every
// resolved item so a future edit cannot silently reintroduce a fixed bug:
//
//   - copy: no "developemnt"/"Feburary"/"GPDR" typos or "ﬁ" ligatures
//   - nav: each page has a unique, sensible `order` (skills=1, projects=2)
//   - header profile image uses | relative_url
//   - head-analytics guards nca_event with typeof before calling it
//   - gemspec and LICENSE both declare the MIT license
//   - SCSS transitions are combined (no duplicate standalone declarations)
//   - contact iframe height is not the hardcoded 1024px
//   - privacy withdraw-consent link has no empty href
//   - head.html falls back to site.time when build_revision is nil
//   - .travis.yml removed; _config.yml excludes archive/; Gemfile.lock untracked
//   - built _site has no archive/ output and a ?v= CSS revision
//
// Part A reads source files; Part B reads _site, so it must run after
// `jekyll build` (as script/cibuild does).

const ROOT = new URL("../", import.meta.url);
const SITE = new URL("../_site/", import.meta.url);

const read = (p) => fs.readFileSync(new URL(p, ROOT), "utf8");

let failures = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  PASS: ${message}`);
  } else {
    console.error(`  FAIL: ${message}`);
    failures += 1;
  }
}

function frontMatter(source) {
  const m = source.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  return m ? m[1] : "";
}

function frontMatterValue(fm, key) {
  const line = fm.split("\n").find((l) => l.trim().startsWith(key + ":"));
  if (!line) return null;
  return line.slice(line.indexOf(":") + 1).trim();
}

// ===========================================================================
// Part A: source files
// ===========================================================================

const indexMd = read("index.md");
const skillsMd = read("skills.md");
const projectsMd = read("projects.md");
const privacyMd = read("privacy.md");
const contactMd = read("contact.md");

console.log("Copy checks (index.md, projects.md, privacy.md):");
for (const [name, content] of [
  ["index.md", indexMd],
  ["projects.md", projectsMd],
  ["privacy.md", privacyMd],
]) {
  for (const typo of ["developemnt", "Feburary", "GPDR", "\uFB01"]) {
    assert(!content.includes(typo), `${name} does not contain "${typo}"`);
  }
}

console.log("Nav order checks:");
const navPages = [
  ["index.md", indexMd],
  ["skills.md", skillsMd],
  ["projects.md", projectsMd],
  ["contact.md", contactMd],
  ["privacy.md", privacyMd],
];
const orders = new Set();
for (const [name, content] of navPages) {
  const order = frontMatterValue(frontMatter(content), "order");
  assert(order !== null, `${name} declares an order`);
  if (order !== null) {
    assert(!orders.has(order), `nav order ${order} (${name}) is unique`);
    orders.add(order);
  }
}
assert(frontMatterValue(frontMatter(skillsMd), "order") === "1", "skills.md uses order 1");
assert(frontMatterValue(frontMatter(projectsMd), "order") === "2", "projects.md uses order 2");

console.log("last_modified_at checks:");
for (const [name, content] of navPages) {
  const value = frontMatterValue(frontMatter(content), "last_modified_at");
  if (value) {
    assert(/^\d{4}-\d{2}-\d{2}$/.test(value), `${name} has a YYYY-MM-DD last_modified_at`);
    assert(value >= "2026-03-01", `${name} last_modified_at (${value}) is not stale`);
  }
}

console.log("Header & analytics checks:");
const header = read("_includes/header.html");
const headAnalytics = read("_includes/head-analytics.html");
const head = read("_includes/head.html");
const imgLine = header.split("\n").find((l) => l.includes("<img"));
assert(imgLine && imgLine.includes("| relative_url"), "header profile image uses | relative_url");
assert(
  headAnalytics.includes("typeof nca_event === 'function'"),
  "head-analytics guards nca_event with typeof before calling it"
);
assert(
  head.includes("site.github.build_revision | default: site.time | date: '%s'"),
  "head.html falls back to site.time when build_revision is nil"
);

console.log("License checks:");
const gemspec = read("jekyll-theme-slate.gemspec");
const license = read("LICENSE");
assert(/license\s*=\s*"MIT"/.test(gemspec), "gemspec declares the MIT license");
assert(/MIT License/.test(license), "LICENSE is the MIT license");

console.log("SCSS checks:");
const scss = read("_sass/jekyll-theme-slate.scss");
assert(
  scss.includes("transition: color 0.5s ease, text-shadow 0.5s ease;"),
  "transition declarations are combined"
);
for (const prefix of ["", "-webkit-", "-moz-", "-o-", "-ms-"]) {
  assert(
    scss.includes(`${prefix}transition: color 0.5s ease, text-shadow 0.5s ease;`),
    `${prefix}transition declarations are combined`
  );
  assert(
    !scss.split("\n").some((l) => l.trim() === `${prefix}transition: text-shadow 0.5s ease;`),
    `no duplicate standalone ${prefix}transition declaration`
  );
}

console.log("Contact page checks:");
const iframeHeight = contactMd.match(/height="(\d+)"/);
assert(iframeHeight !== null, "contact iframe declares a height");
assert(iframeHeight === null || iframeHeight[1] !== "1024", "contact iframe height is not 1024px");
assert(!privacyMd.includes('href=""'), "privacy withdraw-consent link has no empty href");

console.log("Config & file checks:");
const config = read("_config.yml");
assert(config.includes("- archive"), "_config.yml excludes the archive directory");
assert(!fs.existsSync(new URL(".travis.yml", ROOT)), ".travis.yml has been removed");
assert(read(".gitignore").includes("Gemfile.lock"), ".gitignore lists Gemfile.lock");
const tracked = spawnSync("git", ["ls-files", "Gemfile.lock"], { encoding: "utf8" });
if (tracked.error) {
  console.log("  SKIP: git not available, skipping Gemfile.lock tracking check");
} else {
  assert(tracked.stdout.trim() === "", "Gemfile.lock is not tracked in git");
}

// ===========================================================================
// Part B: built site (_site)
// ===========================================================================

console.log("Built site checks:");
assert(!fs.existsSync(new URL("archive/", SITE)), "_site/archive is excluded from the build");
const builtIndex = fs.readFileSync(new URL("index.html", SITE), "utf8");
assert(/style\.css\?v=[0-9a-f]+/.test(builtIndex), "built CSS link carries a ?v= revision");
const builtPrivacy = fs.readFileSync(new URL("privacy.html", SITE), "utf8");
assert(builtPrivacy.includes("GDPR"), "built privacy page says GDPR");

console.log("");
if (failures > 0) {
  console.error(`${failures} source regression test(s) FAILED`);
  process.exit(1);
}
console.log("All source regression tests passed.");
