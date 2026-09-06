# Adding a tool

## Registration workflow

1. **Check fit.** Read [Product vision](PRODUCT_VISION.md) and [Architecture](ARCHITECTURE.md). Propose one bounded responsibility, intended inputs/outputs, non-goals, and how it differs from registered tools.
2. **Inspect evidence.** Check for an existing independent repository and npm package. Confirm ownership, canonical URLs, publication, and actual behavior before recording them. Do not infer an npm name from the display name or registry ID.
3. **Register intent.** Add one unique stable ID to [TOOL_REGISTRY.json](../TOOL_REGISTRY.json). Use `Planned` when implementation readiness is unestablished. Use `null` for unknown repository, npm, release, verification, and deprecation values. Describe intended purpose without unmeasured guarantees.
4. **Align scope and priority.** Update [Roadmap](../ROADMAP.md) if adding or changing priority. The current ten-tool order is agreed; additions or reorderings require an explicit reviewed rationale. Do not turn priority into a tool dependency.
5. **Implement independently.** Code, package metadata, tests, examples, CI, and release scripts belong in the tool repository. Adopt [Tool](TOOL_STANDARD.md), [CLI](CLI_STANDARD.md), [JSON](JSON_STANDARD.md), [Security](SECURITY_STANDARD.md), and [Release](RELEASE_STANDARD.md) standards. Existing tools with contract gaps remain experimental until their scope and conformance are verified; do not rewrite their source in the Hub.
6. **Attach evidence.** Promote only when the [lifecycle gate](TOOL_STANDARD.md#lifecycle) is satisfied. Add exact package/release identity and verification snapshot, with immutable evidence, tested platforms, and limits. A documentation-only claim is not test evidence.
7. **Validate and review.** Run the commands below; open new/changed external links, verify they support the claims, and request Hub maintainer review. Record any unavailable evidence explicitly.

```sh
python3 scripts/validate_hub.py
git diff --check
```

## Owner completion updates

When the owner reports a tool completed, verify the supplied repository and claimed
package/version, record delivery completion in TASK/ROADMAP/README, and update
registry facts supported by evidence. Preserve the distinction between completed
delivery and Hub conformance. Validate and commit the Hub documentation update.
Wait for further owner notices instead of inferring completion for other tools.

## Review checklist

Consult [TASK.md](../TASK.md) for ecosystem integration dependencies and
[VALIDATION.md](../VALIDATION.md) for dated evidence before changing lifecycle.
Do not reopen historical review findings as if their current disposition were unknown.

- The ID is unique; repository and npm identities are confirmed or `null`.
- Status meets its gate, and evidence version equals the recorded release.
- Intended purpose is distinguished from tested capability; unsupported cases are visible.
- No tool source, workspace, agent runtime, or unnecessary dependency was added to the Hub.
- Roadmap, registry, and links agree; standards have one owner document each.
- The independent owner has documented compatibility, security reporting, licensing, and release responsibility before stable publication.

Ongoing maintenance follows the same review path. Update links when projects move, retain IDs, and deprecate rather than silently removing discoverable history. Future discovery consumers will use this registry contract; registration does not currently install a tool or expose a new command.
