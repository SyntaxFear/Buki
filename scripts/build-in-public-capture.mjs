#!/usr/bin/env node

import { createHash } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import {
  access,
  copyFile,
  mkdir,
  readFile,
  stat,
  writeFile,
} from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  CAMPAIGN,
  resolveCampaignDay,
  validateBuildInPublicPlan,
} from "./build-in-public-plan.mjs";
import {
  hashtagsFor,
  platformGuidance,
  validatePlatformSet,
  validateSimulatorAuthorization,
  verifyPartnerMentions,
} from "./build-in-public-policy.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_OUTPUT = path.join(
  ROOT,
  "docs",
  "build-in-public-assets",
  "30-day",
  "generated",
);
const BUNDLE_ID = "com.parastashvili.bloombook";

function parseArgs(argv) {
  const result = {
    evidence: [],
    today: false,
    strict: false,
    allowSimulator: false,
    disposableSimulator: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--today") result.today = true;
    else if (arg === "--strict") result.strict = true;
    else if (arg === "--allow-simulator") result.allowSimulator = true;
    else if (arg === "--disposable-simulator")
      result.disposableSimulator = true;
    else if (arg === "--day") result.day = argv[++index];
    else if (arg === "--date") result.date = argv[++index];
    else if (arg === "--simulator") result.simulatorId = argv[++index];
    else if (arg === "--evidence") result.evidence.push(argv[++index]);
    else if (arg === "--output-root") result.outputRoot = argv[++index];
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return result;
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: "utf8", ...options });
  if (result.status !== 0) {
    const detail = (result.stderr || result.stdout || "").trim();
    throw new Error(`${command} failed${detail ? `: ${detail}` : ""}`);
  }
  return result.stdout.trim();
}

async function exists(file) {
  try {
    await access(file, fsConstants.F_OK);
    return true;
  } catch {
    return false;
  }
}

function escapeXml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function wrap(value, max = 28) {
  const words = String(value).split(/\s+/);
  const lines = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (next.length > max && line) {
      lines.push(line);
      line = word;
    } else line = next;
  }
  if (line) lines.push(line);
  return lines;
}

function tspans(lines, x, startY, lineHeight) {
  return lines
    .map(
      (line, index) =>
        `<tspan x="${x}" y="${startY + index * lineHeight}">${escapeXml(line)}</tspan>`,
    )
    .join("");
}

async function dataUri(file) {
  const buffer = await readFile(file);
  const extension = path.extname(file).toLowerCase();
  const mime =
    extension === ".png"
      ? "image/png"
      : extension === ".svg"
        ? "image/svg+xml"
        : "image/jpeg";
  return `data:${mime};base64,${buffer.toString("base64")}`;
}

async function renderSvg(svg, output) {
  const source = `${output}.svg`;
  await writeFile(source, svg);
  run("/opt/homebrew/bin/rsvg-convert", [
    "--width",
    "1080",
    "--height",
    "1350",
    "--output",
    output,
    source,
  ]);
  return [source, output];
}

async function generateStoryCard(day, runDir) {
  const bearPath = path.join(ROOT, "assets", "images", "buki-bear.png");
  const sampleName =
    day.sources.find((source) => source.startsWith("assets/samples/")) ??
    "assets/samples/sample-house.jpg";
  const samplePath = path.join(ROOT, sampleName);
  const [bear, sample] = await Promise.all([
    dataUri(bearPath),
    dataUri(samplePath),
  ]);
  const headline = wrap(day.headline, 12).slice(0, 5);
  const body = wrap(day.body ?? day.title, 26).slice(0, 5);
  const output = path.join(runDir, `${day.id.toLowerCase()}-buki-story.png`);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1350" viewBox="0 0 1080 1350">
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#FFF9EF"/><stop offset="1" stop-color="#FFE8B4"/></linearGradient>
      <filter id="shadow" x="-30%" y="-30%" width="160%" height="160%"><feDropShadow dx="0" dy="18" stdDeviation="18" flood-color="#7C5422" flood-opacity=".18"/></filter>
      <clipPath id="photo"><rect x="565" y="264" width="390" height="488" rx="32"/></clipPath>
    </defs>
    <rect width="1080" height="1350" fill="url(#bg)"/>
    <circle cx="955" cy="115" r="190" fill="#FFCB67" opacity=".32"/><circle cx="80" cy="1220" r="230" fill="#E87747" opacity=".12"/>
    <text x="82" y="112" font-family="Arial, sans-serif" font-size="38" font-weight="700" fill="#5D371F">BUKI</text>
    <text x="82" y="157" font-family="Arial, sans-serif" font-size="22" letter-spacing="3" fill="#A66B3C">A LITTLE BOOK FOR BIG MEMORIES</text>
    <text font-family="Arial, sans-serif" font-size="64" font-weight="800" fill="#3D291D">${tspans(headline, 82, 270, 70)}</text>
    <text font-family="Arial, sans-serif" font-size="31" fill="#654B3A">${tspans(body, 82, 655, 44)}</text>
    <g transform="rotate(4 760 508)" filter="url(#shadow)"><rect x="542" y="240" width="436" height="552" rx="42" fill="#FFF"/><image href="${sample}" x="565" y="264" width="390" height="488" preserveAspectRatio="xMidYMid slice" clip-path="url(#photo)"/></g>
    <path d="M574 830 C685 775 850 791 966 894" fill="none" stroke="#D9894A" stroke-width="8" stroke-linecap="round" stroke-dasharray="3 22"/>
    <image href="${bear}" x="650" y="790" width="350" height="400" preserveAspectRatio="xMidYMid meet"/>
    <rect x="82" y="1132" width="520" height="112" rx="56" fill="#5C7A62"/>
    <text x="342" y="1203" text-anchor="middle" font-family="Arial, sans-serif" font-size="30" font-weight="700" fill="#FFF">BUILDING IN PUBLIC</text>
    <text x="82" y="1300" font-family="Arial, sans-serif" font-size="22" fill="#81624A">Synthetic sample drawing • product story, not a release claim</text>
  </svg>`;
  return renderSvg(svg, output);
}

async function generateDiagramCard(day, runDir) {
  const bear = await dataUri(
    path.join(ROOT, "assets", "images", "buki-bear.png"),
  );
  const output = path.join(runDir, `${day.id.toLowerCase()}-buki-diagram.png`);
  const title = wrap(day.headline, 27).slice(0, 3);
  const steps = (day.steps ?? []).slice(0, 4);
  const cards = steps
    .map((step, index) => {
      const y = 430 + index * 170;
      return `<g><rect x="90" y="${y}" width="900" height="126" rx="32" fill="#FFFFFF" stroke="#EBCB99" stroke-width="3"/><circle cx="160" cy="${y + 63}" r="38" fill="#E87747"/><text x="160" y="${y + 75}" text-anchor="middle" font-family="Arial" font-size="34" font-weight="700" fill="#FFF">${index + 1}</text><text x="225" y="${y + 75}" font-family="Arial" font-size="34" font-weight="700" fill="#493325">${escapeXml(step)}</text></g>`;
    })
    .join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1350"><rect width="1080" height="1350" fill="#FFF5E5"/><circle cx="930" cy="160" r="220" fill="#F9C867" opacity=".32"/><text x="82" y="104" font-family="Arial" font-size="36" font-weight="700" fill="#5D371F">BUKI • BUILDING IN PUBLIC</text><text font-family="Arial" font-size="68" font-weight="800" fill="#3D291D">${tspans(title, 82, 220, 78)}</text>${cards}<image href="${bear}" x="760" y="1050" width="260" height="270" preserveAspectRatio="xMidYMid meet"/><text x="82" y="1290" font-family="Arial" font-size="22" fill="#81624A">Source-backed product explanation • verify live behavior separately</text></svg>`;
  return renderSvg(svg, output);
}

async function generateContactSheet(day, evidence, runDir) {
  const images = evidence.slice(0, 3);
  const uris = await Promise.all(images.map(dataUri));
  const width = images.length === 2 ? 410 : 286;
  const gap = images.length === 2 ? 40 : 24;
  const start =
    (1080 - (images.length * width + (images.length - 1) * gap)) / 2;
  const panels = uris
    .map((uri, index) => {
      const x = start + index * (width + gap);
      return `<g><rect x="${x - 8}" y="330" width="${width + 16}" height="760" rx="28" fill="#FFF" stroke="#EBCB99" stroke-width="3"/><image href="${uri}" x="${x}" y="342" width="${width}" height="736" preserveAspectRatio="xMidYMid slice"/><circle cx="${x + 32}" cy="378" r="24" fill="#E87747"/><text x="${x + 32}" y="388" text-anchor="middle" font-family="Arial" font-size="25" font-weight="700" fill="#FFF">${index + 1}</text></g>`;
    })
    .join("");
  const output = path.join(runDir, `${day.id.toLowerCase()}-contact-sheet.png`);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1350"><rect width="1080" height="1350" fill="#FFF5E5"/><text x="70" y="90" font-family="Arial" font-size="34" font-weight="700" fill="#5D371F">BUKI • FEEDBACK CHECK</text><text font-family="Arial" font-size="61" font-weight="800" fill="#3D291D">${tspans(wrap(day.headline, 30).slice(0, 3), 70, 175, 70)}</text>${panels}<text x="540" y="1190" text-anchor="middle" font-family="Arial" font-size="28" fill="#654B3A">${escapeXml(day.feedbackQuestion)}</text><text x="540" y="1275" text-anchor="middle" font-family="Arial" font-size="20" fill="#81624A">Fresh supplied evidence • no external publication performed</text></svg>`;
  return renderSvg(svg, output);
}

async function sha256(file) {
  return createHash("sha256")
    .update(await readFile(file))
    .digest("hex");
}

async function inspectAsset(file) {
  const info = await stat(file);
  const asset = {
    path: path.relative(ROOT, file),
    bytes: info.size,
    sha256: await sha256(file),
    kind: "file",
  };
  const extension = path.extname(file).toLowerCase();
  if ([".png", ".jpg", ".jpeg"].includes(extension)) {
    const output = run("sips", ["-g", "pixelWidth", "-g", "pixelHeight", file]);
    asset.kind = "image";
    asset.width = Number(output.match(/pixelWidth:\s*(\d+)/)?.[1]);
    asset.height = Number(output.match(/pixelHeight:\s*(\d+)/)?.[1]);
  } else if ([".mp4", ".mov", ".m4v"].includes(extension)) {
    const probe = JSON.parse(
      run("ffprobe", [
        "-v",
        "error",
        "-show_streams",
        "-show_format",
        "-of",
        "json",
        file,
      ]),
    );
    const video =
      probe.streams.find((stream) => stream.codec_type === "video") ?? {};
    asset.kind = "video";
    asset.codec = video.codec_name;
    asset.width = video.width;
    asset.height = video.height;
    asset.fps = video.avg_frame_rate;
    asset.durationSeconds = Number(
      probe.format?.duration ?? video.duration ?? 0,
    );
  } else if (extension === ".svg") asset.kind = "source";
  return asset;
}

async function copyEvidence(files, runDir) {
  const copied = [];
  for (let index = 0; index < files.length; index += 1) {
    const source = path.resolve(files[index]);
    if (!(await exists(source)))
      throw new Error(`Evidence does not exist: ${source}`);
    const target = path.join(
      runDir,
      `evidence-${index + 1}-${path.basename(source)}`,
    );
    await copyFile(source, target);
    copied.push(target);
  }
  return copied;
}

function timestamp() {
  return new Date().toISOString().replaceAll(/[-:]/g, "").replace(".", "-");
}

async function releaseSnapshot() {
  const [appText, packageText] = await Promise.all([
    readFile(path.join(ROOT, "app.json"), "utf8"),
    readFile(path.join(ROOT, "package.json"), "utf8"),
  ]);
  const app = JSON.parse(appText).expo;
  const pkg = JSON.parse(packageText);
  return {
    appVersion: app.version,
    packageVersion: pkg.version,
    iosBuildNumber: app.ios?.buildNumber,
    bundleIdentifier: app.ios?.bundleIdentifier,
    publicStoreAvailability: "unverified",
    note: "Local configuration is source truth for version/build only. Public App Store, TestFlight, purchase, analytics, and review state require fresh external evidence.",
  };
}

async function previousReadyAssets(dayId, outputRoot) {
  const latest = path.join(outputRoot, dayId, "latest.json");
  if (!(await exists(latest))) return [];
  const record = JSON.parse(await readFile(latest, "utf8"));
  if (record.status !== "ready") return [];
  return (record.assets ?? [])
    .map((asset) => path.join(ROOT, asset.path))
    .filter((file) => path.extname(file) !== ".svg");
}

function partnerSentence(day) {
  const mentions = day.partnerMentions ?? [];
  const parts = [];
  if (mentions.includes("Expo")) parts.push("Buki is built with Expo");
  if (mentions.includes("RevenueCat"))
    parts.push("RevenueCat handles the Pro purchase layer");
  if (mentions.includes("Shipaton"))
    parts.push("this is part of the Shipaton 2026 build-in-public journey");
  return parts.length ? `${parts.join("; ")}.` : "";
}

function trimToCodePoints(value, limit) {
  const characters = [...String(value ?? "").trim()];
  if (characters.length <= limit) return characters.join("");
  if (limit <= 1) return "…";
  return `${characters.slice(0, limit - 1).join("")}…`;
}

function fitXPost({ opening, context, question, tags }) {
  const tagLine = tags.join(" ");
  const render = (nextOpening, nextContext) =>
    [nextOpening, nextContext, question, tagLine].filter(Boolean).join("\n\n");
  let nextOpening = String(opening ?? "").trim();
  let nextContext = String(context ?? "").trim();
  let text = render(nextOpening, nextContext);
  if ([...text].length > 280 && nextContext) {
    nextContext = trimToCodePoints(
      nextContext,
      Math.max(24, [...nextContext].length - ([...text].length - 280)),
    );
    text = render(nextOpening, nextContext);
  }
  if ([...text].length > 280) {
    nextOpening = trimToCodePoints(
      nextOpening,
      Math.max(20, [...nextOpening].length - ([...text].length - 280)),
    );
    text = render(nextOpening, nextContext);
  }
  if ([...text].length > 280) {
    throw new Error(`Unable to fit X draft within 280 characters: ${text}`);
  }
  return text;
}

function xTopicHashtags(day, variant) {
  const source = `${day.title} ${day.headline} ${day.body ?? ""}`.toLowerCase();
  const base = hashtagsFor("X");
  if (variant === "builder-note") return [...base, "#MobileApp"];
  if (/app store|testflight|release|launch/.test(source))
    return ["#Shipaton", "#BuildInPublic", "#AppStore", "#iOSDev"];
  if (/accessibility|dynamic type/.test(source))
    return ["#Shipaton", "#BuildInPublic", "#Accessibility", "#iOSDev"];
  if (/privacy|trust|cloud|backup|archive|export/.test(source))
    return ["#Shipaton", "#BuildInPublic", "#Privacy", "#MobileApp"];
  if (/camera|image|scan|drawing|page curl|pipeline/.test(source))
    return ["#Shipaton", "#BuildInPublic", "#Expo", "#ReactNative"];
  return ["#Shipaton", "#BuildInPublic", "#IndieDev", "#MobileApp"];
}

export function xDraftsFor(day) {
  const partner = partnerSentence(day);
  const body = day.body ?? `Today I’m showing ${day.title.toLowerCase()} in Buki.`;
  return [
    {
      id: "progress",
      role: "product-progress",
      text: fitXPost({
        opening: day.headline,
        context: `${body}${partner ? ` ${partner}` : ""}`,
        question: day.feedbackQuestion,
        tags: xTopicHashtags(day, "progress"),
      }),
      mediaRequired: true,
    },
    {
      id: "builder-note",
      role: "founder-process-or-status",
      text: fitXPost({
        opening: "I keep learning that building the app is only half the work.",
        context: `Today I’m also looking at ${day.title.toLowerCase()}. I want to show what is real now without making the update sound bigger than it is.`,
        question: day.feedbackQuestion,
        tags: xTopicHashtags(day, "builder-note"),
      }),
      mediaRequired: true,
    },
  ];
}

function draftFor(day, platform) {
  const partner = partnerSentence(day);
  const body =
    day.body ?? `Today I’m showing ${day.title.toLowerCase()} in Buki.`;
  if (platform === "X") return xDraftsFor(day)[0].text;
  if (platform === "LinkedIn")
    return `${day.headline}\n\n${body}\n\n${partner}\n\nI’m building this in public because the hard product questions are easier to see with real feedback. ${day.feedbackQuestion}\n\n#Shipaton #BuildInPublic #FamilyTech`.replace(
      "\n\n\n",
      "\n\n",
    );
  if (platform === "Discord")
    return `${day.headline}\n${body}\n${partner}\nFeedback I’d value: ${day.feedbackQuestion}`.replace(
      "\n\n",
      "\n",
    );
  if (platform === "Reddit")
    return `${day.headline}\n\n${body}\n\n${day.feedbackQuestion}`;
  if (platform === "Dev.to")
    return `${day.headline}\n\nDraft a source-backed article from the files listed in today’s receipt. End with: ${day.feedbackQuestion}`;
  if (platform === "Product Hunt")
    return `${day.headline}\n\nA private home that turns children’s paper drawings into an animated keepsake.`;
  if (platform === "Devpost")
    return `${day.headline}\n\nUpdate the project only with verified current product, media, and release evidence.`;
  return `${day.headline}\n\n${body}\n\n${day.feedbackQuestion}`;
}

async function recordSimulatorVideo(day, options, runDir) {
  const authorization = validateSimulatorAuthorization(options);
  if (!authorization.authorized)
    return {
      status: "evidence_required",
      missing: [authorization.reason],
      files: [],
    };
  const booted = JSON.parse(
    run("xcrun", ["simctl", "list", "devices", "booted", "-j"]),
  );
  const bootedIds = Object.values(booted.devices)
    .flat()
    .map((device) => device.udid);
  if (!bootedIds.includes(options.simulatorId))
    return {
      status: "evidence_required",
      missing: [
        `Simulator ${options.simulatorId} is not currently booted. The automation will not boot a personal simulator.`,
      ],
      files: [],
    };
  try {
    run("xcrun", [
      "simctl",
      "get_app_container",
      options.simulatorId,
      BUNDLE_ID,
      "app",
    ]);
  } catch {
    return {
      status: "evidence_required",
      missing: [
        `Buki (${BUNDLE_ID}) is not installed on the authorized simulator.`,
      ],
      files: [],
    };
  }
  const flow = day.sources.find((source) => source.endsWith(".yaml"));
  if (!flow || !(await exists(path.join(ROOT, flow))))
    return {
      status: "evidence_required",
      missing: ["The required deterministic Maestro flow is missing."],
      files: [],
    };
  const raw = path.join(runDir, `${day.id.toLowerCase()}-raw.mov`);
  const output = path.join(runDir, `${day.id.toLowerCase()}-buki-demo.mp4`);
  run("xcrun", ["simctl", "launch", options.simulatorId, BUNDLE_ID]);
  await new Promise((resolve) => setTimeout(resolve, 1500));
  const recorder = spawn(
    "xcrun",
    [
      "simctl",
      "io",
      options.simulatorId,
      "recordVideo",
      "--codec=h264",
      "--force",
      raw,
    ],
    { stdio: "ignore" },
  );
  await new Promise((resolve) => setTimeout(resolve, 1200));
  try {
    run(
      "/Users/bitcoin/.maestro/bin/maestro",
      ["--device", options.simulatorId, "test", path.join(ROOT, flow)],
      { timeout: 120000 },
    );
  } finally {
    recorder.kill("SIGINT");
    await new Promise((resolve) => recorder.once("close", resolve));
  }
  run("ffmpeg", [
    "-y",
    "-i",
    raw,
    "-vf",
    "setpts=0.67*PTS,fps=30,scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:color=0xFFF5E5",
    "-an",
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    "-movflags",
    "+faststart",
    output,
  ]);
  return { status: "ready", missing: [], files: [raw, output] };
}

async function executeStrategy(day, options, runDir, outputRoot) {
  if (day.strategy === "story-card")
    return {
      status: "ready",
      missing: [],
      files: await generateStoryCard(day, runDir),
    };
  if (day.strategy === "diagram-card")
    return {
      status: "ready",
      missing: [],
      files: await generateDiagramCard(day, runDir),
    };
  if (day.strategy === "simulator-video")
    return recordSimulatorVideo(day, options, runDir);

  if (
    [
      "evidence-gated",
      "feedback-gated",
      "release-gated",
      "retrospective-gated",
    ].includes(day.strategy)
  ) {
    if (!options.evidence.length)
      return { status: "evidence_required", missing: day.evidence, files: [] };
    const copied = await copyEvidence(options.evidence, runDir);
    if (day.contactSheet && copied.length >= 2)
      copied.push(...(await generateContactSheet(day, copied, runDir)));
    return { status: "ready", missing: [], files: copied };
  }

  if (day.strategy === "verified-source") {
    if (day.evidence.length && !options.evidence.length)
      return { status: "evidence_required", missing: day.evidence, files: [] };
    const sources = options.evidence.length
      ? [path.join(ROOT, day.sources[0]), ...options.evidence]
      : [path.join(ROOT, day.sources[0])];
    const copied = await copyEvidence(sources, runDir);
    if (day.contactSheet && copied.length >= 2)
      copied.push(...(await generateContactSheet(day, copied, runDir)));
    return { status: "ready", missing: [], files: copied };
  }

  const reuseIds = [day.reuseDay, ...(day.reuseDays ?? [])].filter(Boolean);
  const reused = [];
  for (const id of reuseIds)
    reused.push(...(await previousReadyAssets(id, outputRoot)));
  return {
    status: "ready",
    missing: [],
    files: reused,
    note: reused.length
      ? "Uses previously verified campaign assets."
      : "Text/session day; no new media required.",
  };
}

export function sessionMarkdown(receipt) {
  const assetLines = receipt.assets.length
    ? receipt.assets
        .map(
          (asset) =>
            `- ${asset.path} — ${asset.kind}${asset.width ? `, ${asset.width}×${asset.height}` : ""}, sha256 ${asset.sha256}`,
        )
        .join("\n")
    : "- No media asset for this run.";
  const missing = receipt.missingEvidence.length
    ? receipt.missingEvidence.map((item) => `- ${item}`).join("\n")
    : "- None.";
  const drafts = Object.entries(receipt.drafts)
    .map(
      ([platform, draft]) => {
        const text = Array.isArray(draft.posts)
          ? draft.posts
              .map(
                (post, index) =>
                  `#### Post ${index + 1}: ${post.id}\n\n${post.text}`,
              )
              .join("\n\n")
          : draft.text;
        return `### ${platform}\n\n${text}\n\nGuidance: ${draft.guidance}`;
      },
    )
    .join("\n\n");
  return `# ${receipt.day.id} — ${receipt.day.title}\n\nStatus: **${receipt.status}**\n\nDate: ${receipt.day.date} (${CAMPAIGN.timezone})\n\n## Today’s objective\n\n${receipt.day.headline}\n\n## Feedback question\n\n${receipt.day.feedbackQuestion}\n\n## Ready assets\n\n${assetLines}\n\n## Missing evidence\n\n${missing}\n\n## Release/source truth\n\n- Local version ${receipt.release.appVersion}, iOS build ${receipt.release.iosBuildNumber}.\n- ${receipt.release.note}\n- ${receipt.sourceTruth}\n\n## Platform drafts\n\n${drafts}\n\n## Human checkpoint\n\nNothing was published, submitted, messaged, or uploaded. Review the evidence, media, claims, tags, audience, and account before any external action.\n\n## Rollback\n\n${receipt.rollback}\n`;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const planErrors = validateBuildInPublicPlan();
  if (planErrors.length) throw new Error(planErrors.join("\n"));
  const day = resolveCampaignDay({ id: options.day, date: options.date });
  if (!day)
    throw new Error(
      `No Buki campaign day exists for ${options.day ?? options.date ?? "today"}. Campaign runs ${CAMPAIGN.startDate}–${CAMPAIGN.endDate} in ${CAMPAIGN.timezone}.`,
    );
  const excluded = validatePlatformSet(day.platforms);
  if (excluded.length)
    throw new Error(`Excluded platforms found: ${excluded.join(", ")}`);
  const invalidPartners = verifyPartnerMentions(day);
  if (invalidPartners.length)
    throw new Error(
      `Unverified partner mentions: ${invalidPartners.join(", ")}`,
    );

  const outputRoot = path.resolve(options.outputRoot ?? DEFAULT_OUTPUT);
  const dayDir = path.join(outputRoot, day.id);
  const runDir = path.join(dayDir, timestamp());
  await mkdir(runDir, { recursive: true });
  const strategy = await executeStrategy(day, options, runDir, outputRoot);
  const assets = [];
  for (const file of strategy.files) assets.push(await inspectAsset(file));
  const release = await releaseSnapshot();
  const drafts = Object.fromEntries(
    day.platforms.map((platform) => {
      const text = draftFor(day, platform);
      return [
        platform,
        {
          text,
          guidance: platformGuidance(platform, "IndieDev"),
          ...(platform === "X" ? { posts: xDraftsFor(day) } : {}),
        },
      ];
    }),
  );
  const receipt = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    campaign: CAMPAIGN,
    day,
    status: strategy.status,
    strategyNote: strategy.note ?? null,
    release,
    assets,
    suppliedEvidence: options.evidence.map((item) => path.resolve(item)),
    missingEvidence: strategy.missing,
    sourceTruth:
      day.sourceLabel ??
      `Claims are limited to ${day.sources.length ? day.sources.join(", ") : "the campaign plan and explicitly supplied evidence"}.`,
    drafts,
    rollback: `Remove ${path.relative(ROOT, runDir)} and restore the prior ${path.relative(ROOT, path.join(dayDir, "latest.json"))}, or remove that pointer if no prior run existed. No app, account, store, or social state was changed.`,
    externalActionPerformed: false,
  };
  await writeFile(
    path.join(runDir, "receipt.json"),
    `${JSON.stringify(receipt, null, 2)}\n`,
  );
  const sessionPath = path.join(runDir, "session.md");
  await writeFile(sessionPath, sessionMarkdown(receipt));
  await writeFile(
    path.join(dayDir, "latest.json"),
    `${JSON.stringify({ status: receipt.status, generatedAt: receipt.generatedAt, receipt: path.relative(ROOT, path.join(runDir, "receipt.json")), session: path.relative(ROOT, sessionPath), assets }, null, 2)}\n`,
  );
  process.stdout.write(
    `${receipt.status.toUpperCase()} ${day.id}: ${day.title}\n`,
  );
  process.stdout.write(
    `Receipt: ${path.relative(ROOT, path.join(runDir, "receipt.json"))}\n`,
  );
  process.stdout.write(`Session: ${path.relative(ROOT, sessionPath)}\n`);
  for (const asset of assets.filter((item) => item.kind !== "source"))
    process.stdout.write(`Asset: ${asset.path}\n`);
  if (receipt.missingEvidence.length)
    process.stdout.write(
      `Missing proof: ${receipt.missingEvidence.join(" | ")}\n`,
    );
  if (options.strict && receipt.status !== "ready") process.exitCode = 2;
}

main().catch((error) => {
  console.error(
    error instanceof Error ? (error.stack ?? error.message) : error,
  );
  process.exitCode = 1;
});
