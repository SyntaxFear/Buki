export const AUTOMATED_SOCIAL_PLATFORMS = Object.freeze(["X", "LinkedIn"]);
export const DEFAULT_X_TRANSPORT = "brave";

export const X_DAILY_POST_SLOTS = Object.freeze([
  Object.freeze({
    key: "X-progress",
    draftId: "progress",
    defaultTime: "14:30",
  }),
  Object.freeze({
    key: "X-builder-note",
    draftId: "builder-note",
    defaultTime: "18:00",
  }),
]);

export function isWeekendDate(date) {
  const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
  return weekday === 0 || weekday === 6;
}

export function automaticPublishingPlatforms(date) {
  return isWeekendDate(date) ? ["X", "LinkedIn"] : ["X"];
}

export function automaticPublishingTargets(
  date,
  publishTimes = {},
  { xTransport = DEFAULT_X_TRANSPORT } = {},
) {
  const targets =
    xTransport === "buffer"
      ? X_DAILY_POST_SLOTS.map((slot) => ({
          key: slot.key,
          platform: "X",
          draftId: slot.draftId,
          localPublishTime: publishTimes[slot.key] ?? slot.defaultTime,
        }))
      : [];
  if (isWeekendDate(date)) {
    targets.push({
      key: "LinkedIn",
      platform: "LinkedIn",
      draftId: null,
      localPublishTime: publishTimes.LinkedIn ?? "18:15",
    });
  }
  return targets;
}

export function applyAutomaticPublishingSchedule(date, platforms = []) {
  const retained = platforms.filter(
    (platform) => !AUTOMATED_SOCIAL_PLATFORMS.includes(platform),
  );
  return [...automaticPublishingPlatforms(date), ...retained];
}

function timezoneOffsetMs(instant, timeZone) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(instant)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );
  const representedAsUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  );
  return representedAsUtc - instant.getTime();
}

export function scheduledPublishInstant({
  date,
  time = "18:00",
  timeZone = "Asia/Tbilisi",
  now = new Date(),
  minimumLeadMinutes = 10,
} = {}) {
  const [year, month, day] = String(date).split("-").map(Number);
  const [hour, minute] = String(time).split(":").map(Number);
  if (![year, month, day, hour, minute].every(Number.isFinite)) {
    throw new Error(`Invalid publishing date/time: ${date} ${time}`);
  }

  let timestamp = Date.UTC(year, month - 1, day, hour, minute, 0);
  for (let index = 0; index < 2; index += 1) {
    timestamp =
      Date.UTC(year, month - 1, day, hour, minute, 0) -
      timezoneOffsetMs(new Date(timestamp), timeZone);
  }

  const minimum = now.getTime() + minimumLeadMinutes * 60_000;
  return new Date(Math.max(timestamp, minimum));
}
