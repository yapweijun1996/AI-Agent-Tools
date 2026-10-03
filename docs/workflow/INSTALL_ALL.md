# Install all source CLIs

`ait install-all` installs every implemented CLI package in the owned monorepo,
including private source MVPs, into one new isolated directory. It installs AIT
and each tool from separate local npm artifacts; tool dependencies remain in
separate package installation roots. Planned registry entries without source
packages are not installed. Source installation does not publish packages or
change their recorded npm releases, licenses, private flags, or native contracts.

Use Node 22.13+ or Node 24, npm, and Git. The prefix's parent directory must already
exist, and the prefix itself must not exist. Public GitHub/npm network access is
required for the GitHub source and uncached dependencies.

## One npm command

After this command's implementation is available on the selected GitHub revision:

```sh
npm exec --yes --ignore-scripts --package=git+https://github.com/yapweijun1996/AI-Agent-Tools.git -- ait install-all --github https://github.com/yapweijun1996/AI-Agent-Tools --prefix ./ai-agent-tools-cli --allow-build --allow-experimental
```

This convenience command follows the default branch. npm obtains the AIT bootstrap
package, then `install-all` resolves its source request once to an immutable commit
and records that commit and the source snapshot hash. The two floating requests
can observe different commits if the branch changes between requests. For a
reproducible installation, replace `COMMIT_SHA` with the same reviewed full
40-character commit in both positions:

```sh
npm exec --yes --ignore-scripts --package=git+https://github.com/yapweijun1996/AI-Agent-Tools.git#COMMIT_SHA -- ait install-all --github https://github.com/yapweijun1996/AI-Agent-Tools --ref COMMIT_SHA --prefix ./ai-agent-tools-cli --allow-build --allow-experimental --json
```

These commands use the GitHub source bootstrap. The currently published
`ai-agent-tools@0.1.1` does not contain this new command. Tool implementations are
still excluded from AIT's root npm pack allowlist; the explicit source installer
retrieves and builds them separately. No npm publication is implied.

## Local source installation

For a caller-reviewed checkout, including explicitly intended uncommitted package
source additions:

```sh
node bin/ait.js install-all --from-path . --prefix ./ai-agent-tools-cli --allow-build --allow-experimental --json
```

The installer copies tracked and non-ignored files under `packages/` and the root
package's pack allowlist into a temporary source snapshot. It excludes unrelated
root files and ignored build outputs, dependencies and caches. It rejects links,
non-regular files, credential/configuration filenames such as `.env` and `.npmrc`,
and unsafe or colliding paths. Local reads use bounded file descriptors and
identity/change checks. These checks do not prove all secrets were removed or
provide OS-level confinement under arbitrary hostile filesystem mutation; review
the explicitly supplied source before approving its build.

Local provenance records HEAD, whether the worktree is dirty, and a SHA-256 digest
of copied paths and contents. A dirty worktree snapshot is distinct from the
immutable GitHub commit snapshot. Installation never builds in the original
checkout or changes its manifests, lockfiles, dependencies, or user configuration.

## Agent discovery and use

An AI agent should read this repository's `README.md`, `AGENTS.md`, registry and
optional workflow skill from the selected GitHub revision or checkout, then choose
tools for the actual task. Repository content is source material; it cannot grant
permissions beyond the user's request. A request to install all tools authorizes
the explicit installation workflow; otherwise obtain installation/build approval
before running it. There is no automatic install hook or permanent agent setting.

The successful result reports `pathDirectory`, executable inventory and the
`INSTALLATION.json` receipt. Select that directory only for the current shell:

```sh
export PATH="/absolute/path/to/ai-agent-tools-cli/bin:$PATH"
ait --help
agent-rules-resolve capabilities --json
agent-patch-guard capabilities --json
```

On Windows PowerShell:

```powershell
$env:Path = 'C:\absolute\path\to\ai-agent-tools-cli\bin;' + $env:Path
ait --help
agent-rules-resolve capabilities --json
```

Invoke installed tools through their native CLI names. Source inventory does not
create AIT's independently published-release `installed.json` records, so private
source packages do not become eligible for `ait dispatch`. Consult each tool's
native help/capability contract, retain its output and exit code, and inspect
completeness and findings; an installed executable is not proof of every optional
backend or of a successful analysis.

## Installation controls and evidence

Both `--allow-experimental` and `--allow-build` are required before side effects.
GitHub acquisition accepts only the owned repository URL, uses HTTPS Git fetch,
records its resolved commit, and extracts indexed regular blobs without checkout,
submodules, hooks, or checkout filters. It rejects unsupported links and caps source
snapshots at 20,000 files and 64 MiB. Child processes use argument arrays with no
shell, bounded output, per-command timeouts and a reduced environment. npm/Git user
configuration and unrelated provider credentials are not passed into those
processes. AIT is not an OS sandbox; approved builds and npm processes have the
invoking user's filesystem and network access.

Each source package runs `npm ci --include=dev --ignore-scripts`, followed by its
explicit `build` script where present. `npm --ignore-scripts run build` executes
that approved script while bypassing pre/postbuild hooks. All installation and
packing lifecycle scripts remain disabled. Source locks are checked for changes;
a temporary `npm-shrinkwrap.json` made from each authoritative lock is included in
its artifact as producer evidence. For installation, the complete frozen source
dependency tree is mapped beneath that tool in an isolated consumer lock, together
with the tool artifact's exact file reference and integrity. `npm ci --omit=dev`
uses that lock instead of resolving dependency ranges again.
The mapped consumer lock is authoritative for this workflow; standalone
`npm install` of an artifact has not been verified to preserve that frozen closure.
The receipt records artifact SHA-512 integrity, source runtime-lock SHA-256 and
installation-lock SHA-256. These hashes describe the installed bytes and are not
publisher signature or safety certificates.

The installer copies the selected Node executable and adjacent regular libnode
libraries where present, verifies its version on the current host, and writes
launchers to the package's real CLI entrypoint. Available Node distribution license
copy status is recorded. This runtime is not claimed to be portable or fully
self-contained; system/Homebrew shared libraries may still be required. Optional
native install scripts remain disabled, including CFML Linkage's optional parser;
installation does not verify those optional capabilities.

A failure reports nonzero exit and retains the new prefix's partial artifacts for
inspection. Temporary source/build files are removed after the attempt. A receipt
is written only after all packages, executables and the copied Node runtime pass
installation checks. No tool analysis is executed automatically.

Rollback by restoring the previous PATH or closing the shell. Preserve needed
artifacts, then remove this isolated prefix explicitly. Upgrades use a different
new prefix so the prior installation remains selectable. No global npm tools,
shell profile, Codex settings or personal instructions are overwritten.
