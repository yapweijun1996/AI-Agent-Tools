# Consolidation evidence and deletion readiness

Ten tool source snapshots were imported on 2026-09-30 into `packages/`. [Tool index](../../migration-tools.md), [decision](DECISION.md), [coverage manifest](SOURCE_MANIFEST.json), and [verification](VERIFICATION.md) explain scope and evidence. The unrelated AI-Powered-CSV-Forecaster-v2 repository is excluded.

Every source tracked path has its SHA-256, import destination/disposition and destination hash. Compiled `dist/` files in CFML Check are reproducible build outputs and explicitly excluded; required Code Slice WASM grammars and integrity metadata are retained. Package manifests receive only repository metadata changes. Documentation navigation is redirected to package folders; immutable upstream evidence links are listed as historical external dependencies and remain recoverable through local bundles. Run `python3 scripts/verify_migration.py` to verify imported coverage.

## History recovery

Recovery bundles for all ten repositories are stored locally beside this checkout in `../history/`. The source manifest records their full paths, SHA-256 values, imported heads and tags. Each bundle contains all fetched Git refs, not merely the default branch. Verify with `git bundle verify PATH` and restore with `git clone PATH.bundle restored-tool`. These files are deliberately excluded from public Git. Preserve them in durable private storage before deleting any original repository. The Hub history remains in this repository; its migration base is `d28ffa6`.

Git bundles do not include issues, PR discussions/reviews, GitHub release descriptions or uploaded release assets, Actions run logs/artifacts, repository settings, environments/secrets, deploy keys, branch protections, webhook configuration, or npm trusted-publishing/OIDC bindings. Those need explicit export/reconfiguration before deletion. Existing npm registry metadata and consumers' old repository links cannot be retroactively changed by this commit. A future approved release can update metadata; no release or npm publication occurred here.

## Deletion checklist

- [ ] Review and separately approve/merge the draft migration PR.
- [ ] Recheck remote heads against the manifest immediately before deletion; migrate later commits and pending PR changes.
- [ ] Confirm each package's tests and required native parser behavior on supported platforms; inspect reported limitations.
- [ ] Copy local recovery bundles to durable private storage and verify SHA-256 plus restore of heads/tags.
- [ ] Export any needed issues, PR discussions, release assets/descriptions, Actions artifacts and metadata.
- [ ] Reconfigure protections, Actions permissions, environments, webhooks and npm trusted publishing on the monorepo where needed.
- [ ] Review all historical URLs in [external dependency inventory](EXTERNAL_DEPENDENCIES.json); archive evidence or update consumers before deleting source repositories.
- [ ] Plan separately approved package metadata releases; preserve unpublished/private packages and license gaps.
- [ ] Owner manually decides whether and when to delete originals. Codex has not deleted or archived them.

Deletion is not declared ready merely because code/tests pass. This PR provides source consolidation and recovery evidence; unchecked external/history/platform gates remain owner decisions.
