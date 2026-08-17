export const EXCLUDED_PLATFORMS = Object.freeze(["TikTok", "Instagram"]);

export function validatePlatformSet(platforms = []) {
  return platforms.filter((platform) => EXCLUDED_PLATFORMS.includes(platform));
}

export function validateSimulatorAuthorization({ allowSimulator = false, disposableSimulator = false, simulatorId = "" } = {}) {
  const missing = [];
  if (!allowSimulator) missing.push("--allow-simulator");
  if (!disposableSimulator) missing.push("--disposable-simulator");
  if (!String(simulatorId).trim()) missing.push("--simulator <UDID>");
  return {
    authorized: missing.length === 0,
    missing,
    reason: missing.length
      ? `Simulator capture is fail-closed. Missing: ${missing.join(", ")}.`
      : "Simulator capture explicitly authorized for the supplied disposable simulator.",
  };
}

export function hashtagsFor(platform, topic = "") {
  const normalized = platform.toLowerCase();
  if (normalized === "x")
    return [
      "#Shipaton",
      "#BuildInPublic",
      topic ? `#${topic.replace(/[^a-z0-9]/gi, "")}` : "#IndieDev",
    ];
  if (normalized === "linkedin") return ["#Shipaton", "#BuildInPublic", topic ? `#${topic.replace(/[^a-z0-9]/gi, "")}` : "#IndieDev"];
  if (normalized === "dev.to") return ["shipaton", "buildinpublic", "reactnative", "expo"];
  return [];
}

export function platformGuidance(platform, topic = "") {
  const tags = hashtagsFor(platform, topic);
  switch (platform) {
    case "X":
      return `Use Plainspoken: first person, short paragraphs, calm wording, and no marketing clichés. Use one concrete point, a natural hook or specific question when it fits, and 3–5 relevant hashtags including #Shipaton #BuildInPublic. Keep sponsor mentions factual.`;
    case "LinkedIn":
      return `Lead with the product lesson, add context, then ask one question. Suggested tags: ${tags.join(" ")}.`;
    case "Discord":
      return "Share a short context line plus the artifact in Shipaton #post-engagement-boost. Ask for feedback; never ask for artificial engagement.";
    case "Reddit":
      return "Check the selected community’s current rules before posting. Use no hashtags or sponsor block; make the post useful without requiring a click.";
    case "Dev.to":
      return `Publish a substantive technical article. Suggested Dev.to tags: ${tags.join(", ")}.`;
    case "Product Hunt":
      return "Use a verified public product URL. Do not ask for upvotes or coordinate artificial voting.";
    case "Devpost":
      return "Update only the real project submission with current, verified product and release evidence.";
    default:
      return "Use a truthful artifact and one specific feedback question.";
  }
}

export function verifyPartnerMentions(day, actualStack = ["Expo", "RevenueCat", "Shipaton"]) {
  return (day.partnerMentions ?? []).filter((partner) => !actualStack.includes(partner));
}
