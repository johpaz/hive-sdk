# Dependency audit remediation

## Scope

Remove the critical Baileys advisory and every remaining audit finding that can
be fixed inside the dependency ranges already accepted by the SDK. Preserve the
public API and avoid package overrides unless a direct dependency cannot express
the safe version. The unpatched and unreachable `image-size` findings retain the
documented exception in `SECURITY.md`.

## Design

Pin `@whiskeysockets/baileys` to the latest official release candidate in both
published manifests. This moves beyond the security fix in rc12 and includes the
follow-up protocol-message regression fix. Refresh transitive packages only
within their parents' declared semver ranges so patched `ws`, `protobufjs`,
`nanoid`, `fast-uri`, `hono`, `undici`, and related HTTP packages can resolve
without changing Hive application code.

Use `bun audit` as the failing security regression check: the baseline must show
the critical advisory before the change and no critical finding afterward. Run
the channel tests, typecheck, and complete suite to detect API or runtime drift.
Inspect the final lockfile and audit output before committing. Any advisory that
cannot be removed by a compatible update is reported separately rather than
hidden with a broad suppression.
