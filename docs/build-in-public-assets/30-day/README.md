# Generated campaign evidence

Run `npm run build-in-public:plan` once, then `npm run build-in-public:today` each campaign day.

Each daily run contains:

- `receipt.json` — machine-readable proof, hashes, media metadata, missing evidence, source truth, rollback, and publication status.
- `session.md` — concise human handoff with platform-specific drafts and one feedback question.
- generated or copied evidence assets, when the day calls for them.

`latest.json` is only a pointer to the newest run; it is not proof that anything was published. Never silently reuse a stale asset to satisfy a current evidence gate.

The local `generated/` entry may be a symlink to `/Users/bitcoin/.codex/artifacts/buki-build-in-public/generated` so video capture does not exhaust the nearly full Personal volume. Removing the symlink and moving that directory back restores a fully in-repository layout.
