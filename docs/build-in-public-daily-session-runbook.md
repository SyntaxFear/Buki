# Buki legacy daily and non-X Build in Public runbook

X is no longer scheduled by this daily workflow. Use `docs/build-in-public-weekly-x-runbook.md`. This document remains authoritative for original 30-day evidence receipts, weekend LinkedIn, Reddit, and manual channels.

## 1. Read before creating anything

1. Open `docs/build-in-public-assets/30-day/plan.json`.
2. Read the current day and its latest receipt, if one exists.
3. Read recent genuine comments supplied in the task or visible in the approved active session.
4. Confirm that the current story still answers the most useful audience question.

## 2. Prepare the day

Run:

```bash
npm run build-in-public:today
```

Use `--evidence /absolute/path` for a day that calls for current screenshots, video, feedback, analytics, TestFlight, App Store, RevenueCat, release, or Devpost proof.

Possible outcomes:

- `READY`: the receipt and session handoff are complete. This does **not** mean published.
- `EVIDENCE_REQUIRED`: stop. Report each missing proof item exactly.
- command failure: keep the failed run as diagnostic evidence; do not replace it with an older asset.

## 3. Verify media and claims

- Images must include pixel dimensions, byte size, and SHA-256 in the receipt.
- Videos must include codec, dimensions, duration, frame rate, byte size, and SHA-256.
- A design reference must be called a design reference unless a current runtime capture confirms it.
- A simulator demo must say simulator/demo where that distinction matters.
- Never claim public App Store availability, TestFlight readiness, purchases, analytics, reviews, tester feedback, or submission state from source code alone.
- Never show real child names, artwork, accounts, email addresses, purchase identifiers, or other private data.

## 4. Platform rules

- **X:** use only the weekly Brave workflow. Buffer X publishing is disabled by default.
- **LinkedIn:** publish only Saturday and Sunday at 18:15 `Asia/Tbilisi`; explain the lesson and decision; use at most three relevant hashtags.
- **Discord:** concise context in the official Shipaton `#post-engagement-boost` channel, then ask for useful feedback. Do not ask for artificial engagement.
- **Reddit:** publish only on calendar days that explicitly name Reddit, at 18:30 `Asia/Tbilisi`. Use the official Shipaton partner `r/AppBusiness`, fetch its current rules immediately before posting, require the approved rules SHA-256 to match, require exactly one current Shipaton flair, and use no decorative hashtags or sponsor block.
- **Dev.to:** publish only substantive technical material and cite the real implementation.
- **Product Hunt:** only after verified public availability; never ask for upvotes.
- **Devpost:** update only the real Buki entry with verified current facts.
- **Never use TikTok or Instagram for this campaign.**

Mention Expo, RevenueCat, Apple, Supabase, or Shipaton only when the day’s artifact genuinely depends on them. Do not tag unrelated sponsors.

## 5. Automatic publishing

The approved routes are:

- X scheduling only after the weekly batch receives action-time confirmation.
- LinkedIn on Saturday and Sunday only.
- Reddit only on campaign days whose platform list explicitly includes Reddit, through approved Reddit Data API access and an approved current-rules hash.

After `npm run build-in-public:today` returns `READY`, run:

```bash
npm run build-in-public:publish
```

On Reddit calendar days, the separate 18:30 Tbilisi automation runs:

```bash
npm run build-in-public:publish:reddit
```

The publishers must verify the receipt, local asset hashes, hosted asset hashes, platform schedule, exact caption/body read-back, account IDs, current Reddit community-rules hash, and prior publication state. A provider post ID is terminal evidence. A timeout or response without a definitive post ID is `uncertain` and must never be retried automatically.

LinkedIn keeps its Buffer read-back protection. X uses X Scheduled posts in the dedicated Brave tab as its immediate read-back.

At 19:15 `Asia/Tbilisi`, the X verifier checks delivered posts read-only and notifies on missing, mismatched, or unknown outcomes. It never creates a replacement.

Required local configuration is stored outside Git in `.env.build-in-public.local`. The public media host must preserve immutable paths and return exactly the staged bytes before Buffer is called.

If any credential, channel, media host, evidence item, or hash is absent, record `blocked` in `publication.json`, report the exact missing requirement, and do not publish a substitute post.

All other external actions still require explicit approval. Never automatically reply, like, vote, follow, upload to a store, invite testers, submit a form, or message a community.

## 6. One-time account checkpoint

Before enabling unattended runs, connect the official Buki X and LinkedIn accounts to Buffer, create a Buffer API key, copy the organization and channel IDs, and configure a public media deployment target. For Reddit, obtain explicit Data API approval, authorize the intended account, configure D10/D20 subreddit targets, inspect each community's current rules, and approve the resulting rules hash. Run one supervised test per channel and verify the resulting post in the destination account.

## 7. Rollback

Each receipt names its run directory. Removing that directory and restoring the prior `latest.json` rolls back the campaign artifact. Daily generation does not mutate Buki app data or any external account.
