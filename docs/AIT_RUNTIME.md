# AIT runtime

Status: **Experimental public release**. Package name: `ai-agent-tools`.
Executable: `ait`. Version: `0.1.1`. The package is publicly published on npm
under Apache-2.0.

AIT is the Hub-owned install and dispatch runtime for independently released tools.
It does not contain tool implementations, normalize their native semantics, or
control agent reasoning.

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

`list` reads the explicit local `TOOL_REGISTRY.json` snapshot. `doctor` checks
registry and installed-state references without executing a package. `install` only
accepts a registered tool with a confirmed package identity and recorded release
version. Planned, Deprecated, and unknown-package entries fail closed; Experimental
entries require `--allow-experimental`.

npm installation is explicit and pinned to the registry's recorded version. AIT
uses npm's `--ignore-scripts`, `--no-audit`, `--no-fund`, `--no-package-lock`, and
no-shell invocation. `--from-path` supports controlled local fixtures and must still
resolve to the registered package identity. Installation state is stored in
`$AIT_HOME` or the user's `~/.ai-agent-tools` directory.

`dispatch` requires a separate `--allow-execution` approval. It resolves the
installed package's declared `bin`, starts it without a shell, passes a reduced
environment, captures bounded stdout/stderr, and wraps the result as
`ait-result/v1`. When the exact package/version/executable match exists in
`docs/profiles/PROFILE_INDEX.json` (or `--profile-index PATH`), AIT applies the
profile's bounded native validator and adds optional `meta.profile` metadata.
Native streams, payload, and `native_exit` are retained; profile validation never
renames native fields or maps native statuses to a universal Hub status. AIT is not
a sandbox: tool processes may still access resources available to the invoking user.

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

## Current limitations

The first implementation does not provide OS-level sandboxing, remote registry
refresh, package signature verification, dependency policy enforcement beyond npm's
explicit flags, uninstall/upgrade commands, or a universal Hub protocol adapter.
Only the checked-in exact profiles and bounded validators are supported; adding a
profile requires its catalog entry, native contract, fixtures, and review. Individual
tool repositories remain responsible for implementation, releases, native
contracts, and security reporting.
