# Buki Build in Public — full publishing automation plan

Prepared: August 14, 2026 (`Asia/Tbilisi`)

## Decision

Automate publishing to every **relevant** channel, not the same post to every network every day.

The campaign started on August 11, 2026. Full automation can begin only after the accounts, credentials, public media host, and write/read-back tests are complete. D01–D04 should not be dumped retroactively in one burst. If they were not already published, backfill only the strongest verified artifacts (D02 and D04), in separate slots, without pretending they were posted on their original dates.

Use Buffer's current API as the publishing transport for the first automated pair: two X posts every campaign day and LinkedIn only on Saturday and Sunday. Keep every other channel manual until its account, rules, evidence gates, and dedicated adapter are explicitly approved.

## What is actually required for Shipaton

Product Hunt is useful but **not required** for Shipaton.

The RevenueCat Shipaton 2026 submission requires:

- A brand-new app whose first public store release occurs between August 1 and September 30, 2026.
- RevenueCat powering at least one in-app/web purchase, or RevenueCat Ads.
- A public App Store, Google Play, or Galaxy Store URL.
- A publicly visible YouTube or Vimeo demo video under two minutes.
- A free trial or a promo code that lets judges test premium features.
- For the `#BuildInPublic` category: links to relevant social accounts/posts and a short explanation of how public feedback benefited the app.
- Submission by September 30, 2026 at 11:45 PM PDT.

The current 30-day campaign ends September 9, so a second Shipaton submission phase is required from September 10 through September 30.

## Channel portfolio

Shipaton's current official Build-in-Public partner spaces include `r/AppBusiness`, `r/androiddev`, HackerNoon, and Product Hunt. Buki should use `r/AppBusiness`; `r/androiddev` is only appropriate if an Android-specific implementation question is genuinely involved. HackerNoon is a strong fit for the planned long-form technical stories, while Product Hunt remains a one-time verified public launch rather than a daily channel.

### Tier 1 — currently authorized automatic publishing

| Channel | Role | Transport | Rule |
|---|---|---|---|
| X | Main public build log | Dedicated Brave X tab | Plan 14 media-backed posts each Saturday at 09:00 for Sunday–Saturday. Vary early posts within 13:00–13:30 and late posts within 18:30–19:00 `Asia/Tbilisi`; require one batch approval before scheduling. |
| LinkedIn | Product lesson and founder narrative | Buffer API | Saturday and Sunday at 18:15 `Asia/Tbilisi`; at most three relevant tags; do not copy the X caption verbatim. |

Reddit is now included only on D10 and D20 through a separate approved-API publisher with subreddit allowlisting and current-rules hash approval. Threads, Bluesky, Facebook, Instagram, Pinterest, YouTube, TikTok, Mastodon, Discord, DEV, Product Hunt, and Devpost are not part of the unattended publisher implemented in this phase.

### Tier 2 — automatically publish visual or video days

| Channel | Frequency | Transport | Rule |
|---|---|---|---|
| Instagram professional account | Image, carousel, and video days | Buffer API | Requires lifting the campaign's old Instagram exclusion and connecting a professional account. |
| Facebook Page | Two to four strong family/product posts weekly | Buffer API | Publish as a Page, never through personal-profile automation. |
| Pinterest business account | Evergreen image/diagram days | Buffer API | Use descriptive titles, alt text, and a destination URL. |
| YouTube Shorts | Only strong vertical demos | Buffer API | Do not turn every static campaign card into a Short. |
| TikTok | Only strong vertical demos | Buffer API | Requires explicitly retiring the old TikTok exclusion and a supported direct-publishing connection. |
| Mastodon | Technical and indie-builder days | Buffer API | Optional low-cost expansion after the core channels are stable. |

### Tier 3 — milestone or community-specific publishing

| Channel | When | Automation boundary |
|---|---|---|
| Reddit | D10 and D20 only | Post at 18:30 `Asia/Tbilisi` through approved Data API access. Require an allowlisted subreddit and an exact current-rules hash. Never mass-post the same promotion to multiple subreddits. |
| Shipaton Discord | Relevant campaign days | Use a webhook/bot only if RevenueCat's server administrators explicitly install/authorize it. Discord forbids automating a normal user account as a self-bot. Otherwise generate the exact message and leave the send step manual. |
| DEV | D16 and D28 | Fully automatable through the Forem/DEV API after an API key is configured. Publish substantive source-backed articles, not social snippets. |
| Product Hunt | One public launch | Create and schedule one launch from a personal Product Hunt account. Do not automate votes, ask for upvotes, or treat Product Hunt as a daily channel. |
| Devpost | Final Shipaton submission | Prepare and verify every field automatically; final submission should happen only after store URL, demo, trial/promo code, and social evidence are current. |
| Hacker News | Optional public technical launch | One `Show HN` only if Buki has a public, immediately usable product and a technically useful story. No daily posting. |

## Product Hunt plan

Product Hunt is a good launch amplifier, not a Shipaton eligibility requirement.

- Use a personal maker account. The account must be at least one week old before it can post.
- Create the account by August 28 at the latest for a September 5 launch; creating it now is safer.
- Product Hunt allows scheduling within 30 days.
- Schedule for 12:01 AM Pacific time so the launch receives the full Product Hunt day. Resolve Pacific daylight saving time at runtime rather than hard-coding a Tbilisi hour.
- Launch only after Buki has a verified public App Store URL and a working product/support URL.
- Prepare: product name, tagline, description, topics, maker comment, gallery, demo, website/store links, and social announcement variants.
- Share the launch and invite discussion, but never ask or incentivize people to upvote.
- If public App Store availability is not proven by September 5, postpone Product Hunt. It is better to miss D26 than launch a dead or unavailable product page.

## Recommended publishing architecture

```text
plan.json
   -> build-in-public:today
   -> evidence and media verification
   -> publication manifest
   -> immutable public media URL
   -> platform-specific caption renderer
   -> Buffer or dedicated platform adapter
   -> authoritative read-back
   -> publication receipt and metrics queue
```

### 1. Publication manifest

Add a machine-readable `publication.json` to every generated day. It should contain:

- Campaign day, date, source receipt SHA-256, and asset SHA-256.
- Exact target accounts and platforms.
- Platform-specific text, alt text, link, media role, and scheduled time.
- Evidence gates and release-claim gates.
- An idempotency key such as `BIP-D05-X-<asset-sha-prefix>`.
- Per-platform states: `not_planned`, `blocked`, `queued`, `publishing`, `published`, `uncertain`, `failed`, or `skipped_policy`.
- Provider post ID, canonical URL, request time, read-back time, and response fingerprint.

### 2. Public media hosting

Buffer, Threads, Instagram, and similar APIs fetch media from public URLs. Local workspace files are insufficient.

- Publish only verified media to an immutable HTTPS path such as `/build-in-public/D05/<sha256>/asset.png`.
- Keep the URL available until every provider has fetched and published the media.
- Do not expose rejected takes, receipts containing local paths, private screenshots, or device backups.
- Verify the hosted bytes against the local SHA-256 before queueing any post.

### 3. Publishing transports

X uses the signed-in `@Parastashvilii` account in one dedicated background Brave tab controlled through the Codex extension. Buffer X publishing is disabled by default. Weekend LinkedIn continues through Buffer, and Reddit continues through its separate approved Data API workflow.

Use Buffer for the currently approved X and LinkedIn channels. Additional Buffer channels require a separate policy and account-connection review before they are enabled.

Benefits:

- One API and one account-connection layer.
- Uses the networks' official APIs.
- Supports platform-specific text/media and scheduled publishing.
- Avoids maintaining separate OAuth refresh logic for every social network.

Constraints:

- Buffer's free plan supports only three connected channels and ten scheduled posts per channel. A multi-network campaign will need paid channel slots or a deliberately smaller initial set.
- Buffer media supplied through its API must be hosted at a public URL.
- Buffer's API analytics are currently experimental, so do not use them as the only source for the D29 metrics retrospective.

### 4. Dedicated adapters

- `dev`: create articles through the DEV API.
- `reddit`: use only an approved Reddit API application and a community allowlist with freshly checked rules.
- `discord`: webhook or bot only when installed/authorized by the server owner.
- `product-hunt`: prepare and validate launch material; use Product Hunt's scheduled-launch workflow.
- `devpost`: prepare a submission package and verify the final public links/evidence.

### 5. Write safety

- Never retry a timed-out or ambiguous write blindly.
- After any uncertain response, query scheduled/sent content and reconcile by provider ID, media URL, text fingerprint, and scheduled time.
- A confirmed provider post ID is terminal for that platform/day unless the post is explicitly deleted.
- Never publish twice because one network failed; report each platform independently.
- Provide a global kill switch and a per-platform kill switch.
- Store tokens in macOS Keychain or the automation's secret store, never Git, `plan.json`, receipts, or logs.

## Full-automation gate

Publishing may run unattended only when all of these pass:

1. Today's deterministic receipt is `ready`.
2. Every required evidence item is current and verified.
3. The hosted media hash matches the receipt hash.
4. The platform is allowed for that content type and campaign day.
5. The account ID matches the configured Buki account/Page/channel.
6. The caption passes platform length, hashtag, mention, disclosure, and privacy checks.
7. No public-release, purchase, analytics, review, or tester claim exceeds the available evidence.
8. No prior `published`, `publishing`, or `uncertain` record exists for the same idempotency key.
9. The provider credential is healthy and the account can be read back.
10. The global and platform kill switches are off.

If a gate fails, the automation must skip that platform and report the exact missing proof. It must not replace the post with a fabricated generic update.

## Engagement policy

Automate publishing and evidence collection, not fake conversation.

- Automatically collect genuine replies/comments when APIs permit.
- Deduplicate and store comment URLs as campaign evidence.
- Generate suggested replies, but do not auto-send replies that speak as the founder.
- Never automate likes, votes, upvotes, follows, or coordinated engagement.
- Never send identical comments to other builders. D06 should remain genuine, contextual contribution.

## Revised timeline

### August 14–16: infrastructure and cutover

- Create or verify the Product Hunt personal account and join the Shipaton Devpost project.
- Create Buffer, connect the first channels, and create an API key with posting permission.
- Start with X, LinkedIn, and Threads or Bluesky; add channels after read-back tests pass.
- Create the immutable public media host.
- Implement publication manifests, idempotency, read-back, kill switches, and dry-run mode.
- Run sandbox/private tests where each provider allows them.
- Do not bulk-post D01–D04. Optionally schedule D02 and D04 as separate backfill stories.

### August 17–25: expand distribution

- Add Facebook Page, Instagram professional, Pinterest, Bluesky/Threads, and Mastodon.
- Add comment ingestion and a campaign evidence store.
- Keep Reddit limited to approved communities and appropriate days.
- Use D12 real-device proof only if fresh private-data-safe evidence exists.

### August 26–September 4: authority and launch preparation

- Publish the two substantive DEV articles.
- Prepare the Product Hunt draft, gallery, maker comment, and launch announcements.
- Prepare the Shipaton demo script and evidence outline.
- Verify public App Store availability before making launch claims.

### September 5: optional Product Hunt launch

- Launch only if Buki is publicly downloadable and all links work.
- Automatically publish adapted announcements to the approved social portfolio.
- Monitor comments and prepare reply suggestions; do not automate upvote requests.

### September 6–9: campaign close

- Collect platform URLs, genuine comments, and verified metrics.
- Publish the evidence-based retrospective.
- Freeze a signed index of campaign posts for the Devpost submission.

### September 10–25: Shipaton submission phase

- Produce and publish the final English YouTube/Vimeo demo under two minutes.
- Verify the public store URL, RevenueCat purchase path, and judge access through a free trial or promo code.
- Write the Build in Public impact summary using real examples and linked comments.
- Complete the Devpost draft and verify every external URL.
- Target final submission by September 25, leaving five days before the official deadline.

### September 26–30: contingency only

- Use this window for corrections, store-review delays, broken links, or Devpost fixes.
- Do not wait until September 30 for the first submission attempt.

## Account and credential checklist

- [ ] Buffer owner account and API key with posting permission.
- [ ] X profile connected to Buffer.
- [ ] LinkedIn personal profile and/or Buki Page connected to Buffer.
- [ ] Threads profile connected to Buffer.
- [ ] Bluesky profile connected to Buffer.
- [ ] Facebook Page connected to Buffer.
- [ ] Instagram professional account connected to Buffer.
- [ ] Pinterest business account connected to Buffer.
- [ ] YouTube channel connected to Buffer.
- [ ] TikTok account connected through a supported publishing flow.
- [ ] Product Hunt personal maker account at least one week old.
- [ ] Devpost account joined to Shipaton 2026.
- [ ] Public YouTube or Vimeo channel for the final demo.
- [ ] DEV API key.
- [ ] Approved Reddit API access, if unattended Reddit posting remains desired.
- [ ] Authorized Discord webhook/bot for the exact server/channel, if the organizers permit it.
- [ ] Immutable public campaign-media host.
- [ ] macOS Keychain/secret-store entries and token-expiry monitoring.

## Implementation order

1. Public media host and hash verification.
2. Publication manifest and state machine.
3. Buffer adapter with dry-run, queue, read-back, and reconciliation.
4. X/LinkedIn/Threads/Bluesky account connections.
5. Automatic publication receipts and canonical URL archive.
6. Facebook/Instagram/Pinterest/video-channel expansion.
7. DEV adapter.
8. Comment/evidence ingestion.
9. Reddit adapter only after approved API access and community allowlisting.
10. Product Hunt and Devpost preparation workflows.
11. Replace the current automation prompt's `never publish` rule with the full-automation gate, explicit platform allowlist, and kill-switch behavior.

## Official references checked on August 14, 2026

- Shipaton overview and submission requirements: https://revenuecat-shipaton-2026.devpost.com/
- Shipaton official rules: https://revenuecat-shipaton-2026.devpost.com/rules
- Product Hunt launch preparation: https://www.producthunt.com/launch/preparing-for-launch
- Product Hunt promotion guidance: https://www.producthunt.com/launch/sharing-your-launch
- Product Hunt scheduling: https://help.producthunt.com/en/articles/2724119-how-to-schedule-a-post
- Product Hunt account-age requirement: https://help.producthunt.com/en/articles/481909-how-can-i-get-access-to-post
- Product Hunt upvote policy: https://help.producthunt.com/en/articles/484935-can-i-ask-my-community-friends-family-to-upvote-a-product
- Buffer supported channels: https://support.buffer.com/article/567-supported-channels
- Buffer API capabilities: https://support.buffer.com/articles/what-is-buffers-api-GtIYIQilz5
- Reddit developer access: https://support.reddithelp.com/hc/en-us/articles/14945211791892-Developer-Platform-Accessing-Reddit-Data
- Discord self-bot policy: https://support.discord.com/hc/en-us/articles/115002192352-Automated-User-Accounts-Self-Bots
- DEV API: https://developers.forem.com/api/v0
