# AIT runtime

Status: **Experimental public release**. Package name: `ai-agent-tools`.
Executable: `ait`. Version: `0.1.1`. The package is publicly published on npm
under Apache-2.0.

AIT is the Hub-owned install and dispatch runtime for independently released tools.
It does not contain tool implementations, normalize their native semantics, or
control agent reasoning.

The source CLI reads its reported version from its own package manifest. On Windows, source `ait install` resolves npm's JavaScript entrypoint from the invoking npm context, the Node distribution, or PATH and executes it through Node without a shell. This also supports install-all's copied Node runtime, which does not bundle npm; npm must still be available on the host. These source corrections do not change the existing published artifact.

## Distribution status and release gate

`ai-agent-tools@0.1.1` is publicly published under Apache-2.0. The package includes
the checked-in `TOOL_REGISTRY.json` snapshot so its default `list` and `doctor`
paths remain usable after packing. Registry read-back confirms the current latest
release, the published Apache-2.0 metadata, and the recorded package integrity. A clean
consumer installed the published package and verified `list` and `doctor` without
using the source checkout.

The following policies are decided for the current runtime boundary:

- **Registry refresh:** no remote refresh in `0.1.x`; local exact snapshots remain the
  source for discovery and dispatch. A future refresh must be an explicit, bounded,
  read-only command with integrity and review rules, never an implicit fallback.
- **Signatures/provenance:** do not invent a custom signature layer. Record npm
  registry integrity/provenance only when the selected publication process supplies
  verifiable evidence; absence of that evidence must not be presented as a trust
  certificate.
- **Dependencies:** keep production runtime dependencies at zero. Installation of
  independent tools remains explicit, version-pinned, no-shell, and lifecycle-script
  disabled; no dependency policy may silently become an adapter or shared runtime.
- **Sandboxing:** AIT is not an OS sandbox. The current release must not claim
  filesystem, network, privilege, or dependency isolation. Any future sandbox is a
  separate platform-specific design and acceptance gate, not an implied feature.

## Commands

```text
ait list [--json] [--registry PATH] [--home PATH]
ait doctor [--json] [--registry PATH] [--home PATH]
ait install TOOL_ID [--allow-experimental] [--json] [--registry PATH] [--home PATH]
ait install TOOL_ID --from-path PACKAGE_DIR [--allow-experimental] [--json] [--registry PATH] [--home PATH]
ait dispatch TOOL_ID --allow-execution [--cwd PATH] [--json] [--registry PATH] [--home PATH] [--profile-index PATH] -- [ARGS...]
```

`list` reads the explicit local `TOOL_REGISTRY.json` snapshot. Current source
`doctor` checks installed-state records, the actual rooted package manifest and
name/version, the recorded executable declaration and the executable path without
executing a package. A consumer-only manifest is not an installed tool. `install`
only accepts a registered tool with a confirmed package identity and recorded
release version. Planned, Deprecated, and unknown-package entries fail closed;
Experimental entries require `--allow-experimental`.

Installation-state records require unique registered-style IDs, package/version
identity, an absolute installation root, and safe executable name/path fields.
Malformed or duplicate state records fail before discovery with `INVALID_STATE`
and exit 2. Invalid state JSON also returns an input-error envelope rather than
an installation-health result. Doctor checks registry/manifest identity, the
normalized executable declaration and realpath containment without executing the
tool; stale or inconsistent installations return issues and incomplete status
with exit 3.
With `--json` before the dispatch `--` boundary, argument errors emit a structured
AIT error envelope as well as errors raised after parsing.

npm installation is explicit and pinned to the registry's recorded version. AIT
uses npm's `--ignore-scripts`, `--no-audit`, `--no-fund`, `--no-package-lock`, and
no-shell invocation. `--from-path` supports controlled local fixtures and must still
resolve to the registered package identity. Installation state is stored in
`$AIT_HOME` or the user's `~/.ai-agent-tools` directory.

Current source serializes installs of the same tool with an exclusive per-tool
lock; a competing same-tool install fails with `INSTALL_LOCK_BUSY`. Different
tools may install concurrently, but their read/merge/write of installed state is
serialized by a separate lock with a five-second acquisition bound. Locks are
released after normal completion or failure; stale locks are never removed
automatically. These source changes do not upgrade an existing installation.

`dispatch` requires a separate `--allow-execution` approval. It resolves the
installed package's declared `bin`, starts it without a shell, passes a reduced
environment, captures bounded stdout/stderr, and wraps the result as
`ait-result/v1`. When the exact package/version/executable match exists in
`docs/profiles/PROFILE_INDEX.json` (or `--profile-index PATH`), AIT applies the
profile's bounded native validator and adds optional `meta.profile` metadata.
Native streams, payload, and `native_exit` are retained; profile validation never
renames native fields or maps native statuses to a universal Hub status. AIT is not
a sandbox: tool processes may still access resources available to the invoking user.

Current source treats the 1 MiB capture ceiling as `EXECUTION_OUTPUT_LIMIT`,
not as a failure to start. It retains UTF-8-safe bounded stdout/stderr and the
observed `native_exit` (including `null` when no numeric exit was observed), marks
`output_truncated`, and returns wrapper exit 1. Truncated output is never admitted
as a complete native JSON document or a successful exact-profile validation.

## Security boundaries

- Registry descriptions, package metadata, and tool output are untrusted data.
- No automatic installation, upgrade, import, lifecycle-script execution, retry, or
  dispatch occurs.
- Core discovery and doctor operations are local and read-only.
- Network access is limited to an explicit npm installation request.
- Package lifecycle scripts are disabled during installation.
- Execution requires an explicit flag and uses an argument array with `shell: false`.
- Unknown registry identity, missing executable, path escape, malformed state, and
  unsupported lifecycle states fail closed.
- Resolved package directories must remain within their installation root, including
  when dispatch falls back to the package executable because an npm shim is absent.

## Current limitations

The first implementation does not provide OS-level sandboxing, remote registry
refresh, package signature verification, dependency policy enforcement beyond npm's
explicit flags, uninstall/upgrade commands, or a universal Hub protocol adapter.
Only the checked-in exact profiles and bounded validators are supported; adding a
profile requires its catalog entry, native contract, fixtures, and review. Individual
tool repositories remain responsible for implementation, releases, native
contracts, and security reporting.

## Explicit install-all source workflow (2026-10-03)

The current owned source adds `ait install-all` for caller-authorized batch installation from a local checkout or the fixed GitHub repository. [Install all](workflow/INSTALL_ALL.md) owns the command, build authorization, isolated prefix, provenance, dependency and rollback contract. It remains separate from registry-installed state and exact native profiles. Root packing includes its dependency-free installer module and guide, never tool implementations. Published `ai-agent-tools@0.1.1` has not been republished with this command.
