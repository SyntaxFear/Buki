#!/usr/bin/env node

import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { applyAutomaticPublishingSchedule } from "./build-in-public-distribution.mjs";

export const CAMPAIGN = Object.freeze({
  product: "Buki",
  timezone: "Asia/Tbilisi",
  startDate: "2026-08-11",
  endDate: "2026-09-09",
  excludedPlatforms: ["TikTok", "Instagram"],
  defaultPlatforms: ["X"],
});

const day = (id, date, title, strategy, format, platforms, feedbackQuestion, extra = {}) => ({
  id,
  date,
  title,
  strategy,
  format,
  platforms: applyAutomaticPublishingSchedule(date, platforms),
  feedbackQuestion,
  partnerMentions: [],
  sources: [],
  evidence: [],
  ...extra,
});

export const DAYS = Object.freeze([
  day("D01", "2026-08-11", "Why children’s drawings disappear", "story-card", "4:5 image", ["X", "LinkedIn", "Discord"], "What happens to the drawings in your home after they leave the fridge?", {
    headline: "Kids make hundreds of drawings. Most quietly disappear.",
    body: "I’m building Buki: a private little book that turns paper drawings into an animated keepsake.",
    partnerMentions: ["Expo", "RevenueCat", "Shipaton"],
    sources: ["README.md", "assets/images/buki-bear.png", "assets/samples/sample-house.jpg"],
  }),
  day("D02", "2026-08-12", "Paper drawing to animated book", "simulator-video", "15–25 second video", ["X", "LinkedIn", "Discord"], "Which moment should feel more magical: the cutout or the page landing?", {
    headline: "From paper to Buki in one scan",
    sources: ["assets/samples/sample-cat.jpg", ".maestro/build-in-public/scan-to-book.yaml"],
  }),
  day("D03", "2026-08-13", "Ask Shipaton builders for feedback", "brief-only", "text + D02 clip", ["X", "Discord"], "If you have shipped a family app, what trust detail mattered most?", {
    headline: "Building a private home for children’s drawings",
    partnerMentions: ["RevenueCat", "Shipaton"],
    reuseDay: "D02",
  }),
  day("D04", "2026-08-14", "The origin of Buki", "story-card", "4:5 image", ["X", "LinkedIn"], "What childhood object do you wish your family had preserved?", {
    headline: "Buki means ‘little book’",
    body: "The product began with a simple question: can a phone make a paper sketch feel worth keeping?",
    sources: ["README.md", "assets/images/buki-bear.png", "assets/samples/sample-boat.jpg"],
  }),
  day("D05", "2026-08-15", "Show source photo versus clean artwork", "verified-source", "before/after image", ["X", "Discord"], "Should Buki preserve the paper texture, or make every drawing clean and transparent?", {
    headline: "The extraction choice: faithful paper or clean cutout?",
    sources: ["assets/samples/sample-house.jpg"],
    evidence: ["A current output captured from Buki using the same source image"],
    contactSheet: true,
  }),
  day("D06", "2026-08-16", "Contribute to other builders", "brief-only", "three thoughtful replies", ["X", "Discord"], "Which Shipaton project should Buki learn from this week?", {
    headline: "No standalone post today — useful feedback for other builders",
    partnerMentions: ["Shipaton"],
  }),
  day("D07", "2026-08-17", "Week-one feedback loop", "feedback-gated", "feedback summary card", ["X", "LinkedIn", "Discord"], "Which suggestion should move to the top of the Buki list?", {
    headline: "What I heard in Buki’s first public week",
    evidence: ["Links or screenshots of genuine comments received during D01–D06"],
  }),
  day("D08", "2026-08-18", "Physical sketchpad design direction", "verified-source", "design reference image", ["X", "LinkedIn", "Discord"], "Should the library feel like a real shelf of sketchbooks or a cleaner photo grid?", {
    headline: "Should a digital art library still feel physical?",
    sources: ["assets/design/implementation-2026-08-08/sketchpad-library.png"],
    sourceLabel: "Design reference — verify against the current app before calling it shipped",
  }),
  day("D09", "2026-08-19", "Page curl interaction", "simulator-video", "10–18 second video", ["X", "LinkedIn", "Discord"], "Does the page curl add delight, or slow you down?", {
    headline: "A real page curl for a digital sketchbook",
    sources: [".maestro/build-in-public/page-curl-tour.yaml"],
  }),
  day("D10", "2026-08-20", "Ask camera-capture builders", "brief-only", "technical question", ["Reddit"], "What capture failure should a drawing scanner handle first?", {
    headline: "How forgiving should a children’s drawing scanner be?",
    subreddit: "Choose a relevant community only after checking its current rules",
  }),
  day("D11", "2026-08-21", "Explain the image pipeline", "diagram-card", "4:5 diagram", ["X", "LinkedIn", "Discord"], "Which pipeline step would you like to see measured next?", {
    headline: "How Buki turns a photo into artwork",
    steps: ["Find the paper", "Straighten the page", "Remove the background", "Place it in the book"],
    sources: ["README.md", "src/utils/cutout.ts"],
  }),
  day("D12", "2026-08-22", "Real-device camera proof", "evidence-gated", "15–25 second phone capture", ["X", "LinkedIn", "Discord"], "Is the capture guidance understandable without narration?", {
    headline: "The real camera flow, not a simulator shortcut",
    evidence: ["A fresh real-device recording showing capture, processing, and the saved artwork"],
  }),
  day("D13", "2026-08-23", "Synthesize feedback", "feedback-gated", "three-point summary", ["X", "Discord"], "Did I interpret this feedback correctly?", {
    headline: "Three things early viewers keep asking about Buki",
    evidence: ["At least three genuine comments or one clear recurring theme"],
  }),
  day("D14", "2026-08-24", "Show what feedback changed", "evidence-gated", "before/after or decision note", ["X", "LinkedIn", "Discord"], "Would you have made the same product decision?", {
    headline: "A community question changed this Buki decision",
    evidence: ["A linked feedback item and current implementation, issue, or documented decision it affected"],
  }),
  day("D15", "2026-08-25", "Private by design", "diagram-card", "4:5 trust diagram", ["X", "LinkedIn", "Discord"], "What would you need to trust a family artwork app?", {
    headline: "Children’s art should be private by default",
    steps: ["Adult account", "Private child profiles", "Local-first library", "Cloud features with clear controls"],
    sources: ["CONTEXT.md", "docs/Buki-Pro-Implementation-Progress.md"],
  }),
  day("D16", "2026-08-26", "Write the privacy and processing story", "brief-only", "technical article", ["Dev.to", "X", "LinkedIn"], "Which part needs a deeper technical follow-up?", {
    headline: "Building a private drawing scanner for families",
    sources: ["README.md", "CONTEXT.md", "src/utils/cutout.ts"],
  }),
  day("D17", "2026-08-27", "Explain the Free and Pro boundary", "evidence-gated", "paywall screenshot + text", ["X", "LinkedIn", "Discord"], "Does the free version feel genuinely useful before Pro appears?", {
    headline: "Buki’s rule: never hold a child’s existing art hostage",
    partnerMentions: ["RevenueCat", "Shipaton"],
    evidence: ["Fresh current paywall screenshots and verified entitlement/product state"],
  }),
  day("D18", "2026-08-28", "Monetization without deleting art", "diagram-card", "4:5 principle card", ["X", "LinkedIn", "Discord"], "What is a fair paid boundary for a family keepsake app?", {
    headline: "If a family stops paying, their art should not vanish",
    steps: ["Keep existing artwork", "Pause paid creation limits", "Explain retention clearly", "Offer a portable export"],
    sources: ["CONTEXT.md"],
    partnerMentions: ["RevenueCat", "Shipaton"],
  }),
  day("D19", "2026-08-29", "Tour the free core", "simulator-video", "15–25 second video", ["X", "LinkedIn", "Discord"], "Where would you expect the first paid boundary?", {
    headline: "What you can do in Buki before paying",
    sources: [".maestro/build-in-public/free-core-tour.yaml"],
    partnerMentions: ["RevenueCat", "Shipaton"],
  }),
  day("D20", "2026-08-30", "Ask about packaging", "brief-only", "pricing discussion", ["Reddit", "Discord"], "Monthly, yearly, lifetime — which choice best fits a family archive?", {
    headline: "How would you price a private family art archive?",
    partnerMentions: ["RevenueCat", "Shipaton"],
  }),
  day("D21", "2026-08-31", "Trust and monetization recap", "feedback-gated", "decision summary", ["X", "LinkedIn", "Discord"], "Which trust promise should be visible directly on the paywall?", {
    headline: "What Buki’s monetization feedback changed",
    partnerMentions: ["RevenueCat", "Shipaton"],
    evidence: ["Genuine replies or test feedback from D17–D20"],
  }),
  day("D22", "2026-09-01", "Dynamic Type proof", "evidence-gated", "two-screen comparison", ["X", "LinkedIn", "Discord"], "Which screen becomes hardest to use at the largest text size?", {
    headline: "Family apps need to work for more than one generation",
    evidence: ["Fresh screenshots at default and an accessibility text size from the same current build"],
    contactSheet: true,
  }),
  day("D23", "2026-09-02", "Accessibility walkthrough", "simulator-video", "15–25 second video", ["X", "LinkedIn", "Discord"], "What accessibility check should I add before release?", {
    headline: "A quick accessibility pass through Buki",
    sources: [".maestro/build-in-public/accessibility-home.yaml"],
  }),
  day("D24", "2026-09-03", "App Store first-frame test", "evidence-gated", "three-frame contact sheet", ["X", "LinkedIn", "Discord"], "Which first screenshot explains Buki fastest?", {
    headline: "You get one screenshot to explain Buki. Which one wins?",
    evidence: ["Three current App Store screenshot candidates from the same verified build"],
    contactSheet: true,
  }),
  day("D25", "2026-09-04", "Accessibility lesson", "brief-only", "short lesson", ["LinkedIn", "X"], "What is one accessibility detail small apps often miss?", {
    headline: "The accessibility detail that changed how I see Buki",
    reuseDays: ["D22", "D23"],
  }),
  day("D26", "2026-09-05", "Prepare a public launch page", "release-gated", "Product Hunt draft", ["Product Hunt", "X", "LinkedIn"], "Is Buki’s one-line promise clear to someone seeing it for the first time?", {
    headline: "Buki — turn paper drawings into a private animated keepsake",
    evidence: ["Verified public App Store availability and a working public product URL"],
  }),
  day("D27", "2026-09-06", "Invite testers and compare messages", "feedback-gated", "tester invite + A/B copy", ["X", "Discord"], "Which line makes you more likely to test: ‘save every drawing’ or ‘build their little art book’?", {
    headline: "Looking for a few thoughtful Buki testers",
    evidence: ["A current TestFlight public link or a documented manual-invite process with available capacity"],
  }),
  day("D28", "2026-09-07", "Explain export and archive safety", "diagram-card", "diagram + article", ["Dev.to", "X", "LinkedIn"], "Which export format would your family actually use?", {
    headline: "A keepsake app needs an exit door",
    steps: ["Export artwork", "Create a family archive", "Restore safely", "Keep a portable copy"],
    sources: ["CONTEXT.md", "docs/Buki-Pro-Implementation-Progress.md"],
  }),
  day("D29", "2026-09-08", "Evidence-based retrospective", "retrospective-gated", "metrics + lessons", ["X", "LinkedIn", "Discord"], "Which Buki thread should continue after Shipaton?", {
    headline: "29 days of building Buki in public — what actually worked",
    evidence: ["Current platform analytics, feedback count, tester count, and shipped-change evidence"],
  }),
  day("D30", "2026-09-09", "Shipaton campaign retrospective", "retrospective-gated", "video or carousel + Devpost update", ["X", "LinkedIn", "Discord", "Devpost"], "What should Buki build next?", {
    headline: "What Buki became after 30 days in public",
    partnerMentions: ["Expo", "RevenueCat", "Shipaton"],
    evidence: ["Verified campaign artifacts, current release status, feedback outcomes, and accurate Devpost project state"],
  }),
]);

export function validateBuildInPublicPlan(days = DAYS) {
  const errors = [];
  if (days.length !== 30) errors.push(`Expected 30 days, found ${days.length}.`);
  const ids = new Set();
  const dates = new Set();
  for (const [index, item] of days.entries()) {
    if (ids.has(item.id)) errors.push(`Duplicate id: ${item.id}.`);
    if (dates.has(item.date)) errors.push(`Duplicate date: ${item.date}.`);
    ids.add(item.id);
    dates.add(item.date);
    for (const platform of item.platforms) {
      if (CAMPAIGN.excludedPlatforms.includes(platform)) errors.push(`${item.id} includes excluded platform ${platform}.`);
    }
    if (!item.feedbackQuestion) errors.push(`${item.id} has no feedback question.`);
    const expected = new Date(`${CAMPAIGN.startDate}T00:00:00Z`);
    expected.setUTCDate(expected.getUTCDate() + index);
    if (item.date !== expected.toISOString().slice(0, 10)) errors.push(`${item.id} is not on the expected consecutive date.`);
  }
  if (days[0]?.date !== CAMPAIGN.startDate) errors.push("Campaign start date does not match D01.");
  if (days.at(-1)?.date !== CAMPAIGN.endDate) errors.push("Campaign end date does not match D30.");
  return errors;
}

export function getDayById(id) {
  return DAYS.find((item) => item.id.toLowerCase() === String(id).toLowerCase());
}

export function getDayByDate(date) {
  return DAYS.find((item) => item.date === date);
}

export function dateInTimezone(timeZone = CAMPAIGN.timezone, now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

export function resolveCampaignDay({ id, date } = {}) {
  if (id) return getDayById(id);
  return getDayByDate(date ?? dateInTimezone());
}

function markdownTable() {
  const rows = DAYS.map((item) => `| ${item.id} | ${item.date} | ${item.title} | ${item.format} | ${item.platforms.join(", ")} |`);
  return [
    "# Buki — 30-day Build in Public plan",
    "",
    `Campaign: ${CAMPAIGN.startDate} through ${CAMPAIGN.endDate} (${CAMPAIGN.timezone})`,
    "",
    "| Day | Date | Story | Asset | Platforms |",
    "|---|---|---|---|---|",
    ...rows,
    "",
  ].join("\n");
}

function htmlEscape(value) {
  return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

function htmlCalendar() {
  const cards = DAYS.map((item) => {
    const platforms = item.platforms.map((platform) => `<span>${htmlEscape(platform)}</span>`).join("");
    return `<article class="day" data-date="${item.date}">
      <div class="day-top"><strong>${item.id}</strong><time datetime="${item.date}">${item.date}</time></div>
      <h2>${htmlEscape(item.title)}</h2>
      <p class="format">${htmlEscape(item.format)}</p>
      <div class="platforms">${platforms}</div>
      <p class="question"><b>Ask:</b> ${htmlEscape(item.feedbackQuestion)}</p>
    </article>`;
  }).join("\n");
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Buki — 30-day Build in Public calendar</title>
  <style>
    :root { color-scheme: light; --ink:#3d291d; --muted:#7b6250; --paper:#fffaf1; --cream:#fff1d5; --orange:#e87747; --green:#5c7a62; --line:#ead4ad; }
    * { box-sizing:border-box; }
    body { margin:0; background:linear-gradient(145deg,#fffaf1,#ffe8b4); color:var(--ink); font:16px/1.45 ui-rounded,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; min-height:100vh; }
    header { max-width:1280px; margin:auto; padding:64px 28px 30px; }
    .eyebrow { color:#a6673f; font-weight:800; letter-spacing:.14em; text-transform:uppercase; }
    h1 { margin:.25em 0 .15em; font-size:clamp(42px,7vw,88px); line-height:.95; letter-spacing:-.055em; max-width:920px; }
    header p { color:var(--muted); font-size:19px; max-width:760px; }
    .legend { display:flex; flex-wrap:wrap; gap:10px; margin-top:24px; }
    .legend span { border:1px solid var(--line); background:rgba(255,255,255,.68); border-radius:999px; padding:8px 13px; font-size:14px; }
    main { max-width:1280px; margin:auto; padding:16px 28px 72px; display:grid; grid-template-columns:repeat(auto-fit,minmax(285px,1fr)); gap:18px; }
    .day { position:relative; min-height:285px; border:1px solid rgba(202,164,107,.56); border-radius:28px; padding:24px; background:rgba(255,255,255,.78); box-shadow:0 16px 45px rgba(95,58,25,.08); overflow:hidden; }
    .day::after { content:""; position:absolute; width:110px; height:110px; right:-42px; bottom:-48px; border-radius:50%; background:#f4c96f; opacity:.22; }
    .day.today { outline:4px solid var(--orange); background:#fff; transform:translateY(-3px); }
    .day.today::before { content:"TODAY"; position:absolute; top:0; right:0; padding:7px 14px; border-radius:0 24px 0 18px; background:var(--orange); color:#fff; font-size:12px; font-weight:900; letter-spacing:.12em; }
    .day-top { display:flex; align-items:center; justify-content:space-between; color:var(--muted); }
    .day-top strong { color:#fff; background:var(--green); border-radius:999px; padding:6px 11px; letter-spacing:.06em; }
    h2 { margin:20px 0 6px; font-size:25px; line-height:1.12; letter-spacing:-.025em; }
    .format { color:#a65f39; font-weight:750; margin:0 0 14px; }
    .platforms { display:flex; flex-wrap:wrap; gap:7px; }
    .platforms span { border:1px solid var(--line); border-radius:999px; padding:5px 9px; background:var(--paper); font-size:13px; }
    .question { margin:18px 0 0; color:var(--muted); }
    footer { padding:0 28px 64px; text-align:center; color:var(--muted); }
    code { color:var(--ink); background:rgba(255,255,255,.72); border:1px solid var(--line); border-radius:8px; padding:4px 7px; }
  </style>
</head>
<body>
  <header>
    <div class="eyebrow">Buki • Build in Public</div>
    <h1>Thirty days of showing the real work.</h1>
    <p>August 11–September 9, 2026 · Asia/Tbilisi. Each day has one focused story, one useful feedback question, and a source or evidence rule.</p>
    <div class="legend"><span>No TikTok</span><span>No Instagram</span><span>No automatic publishing</span><span>Evidence-gated claims</span><span>Short videos where useful</span></div>
  </header>
  <main>${cards}</main>
  <footer>Generated from <code>scripts/build-in-public-plan.mjs</code>. Run <code>npm run build-in-public:today</code> for today’s verified handoff.</footer>
  <script>
    const parts = new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Tbilisi',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
    const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    const today = value.year + '-' + value.month + '-' + value.day;
    const card = document.querySelector('[data-date="' + today + '"]');
    if (card) { card.classList.add('today'); card.scrollIntoView({block:'center'}); }
  </script>
</body>
</html>\n`;
}

async function main() {
  const errors = validateBuildInPublicPlan();
  if (errors.length) throw new Error(errors.join("\n"));
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const outputDir = path.join(root, "docs", "build-in-public-assets", "30-day");
  await mkdir(outputDir, { recursive: true });
  await writeFile(path.join(outputDir, "plan.json"), `${JSON.stringify({ campaign: CAMPAIGN, days: DAYS }, null, 2)}\n`);
  await writeFile(path.join(root, "docs", "build-in-public-30-day-calendar.md"), markdownTable());
  await writeFile(path.join(root, "build-in-public-calendar.html"), htmlCalendar());
  process.stdout.write(`Validated ${DAYS.length} Buki campaign days.\n`);
  process.stdout.write(`Wrote ${path.relative(root, outputDir)}/plan.json, docs/build-in-public-30-day-calendar.md, and build-in-public-calendar.html.\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
