# Optional source CLI workflow

For automatic source acquisition, builds and isolated installation in one explicit command, use [Install all](INSTALL_ALL.md). The manual checkout route below remains available.

Use Node 22 (>=22.13) or 24; verify `node -p 'process.version + " " + process.execPath'`. Source installation preserves each package's license/private flag and does not publish anything.

```sh
npm run bootstrap
npm run build
node scripts/install-local.mjs --prefix /absolute/new/ai-agent-tools-install
```

The prefix must not exist. Its `INSTALLATION.json` records source commit, actual runtime, package/artifact integrity and bin inventory. On macOS/Linux select tools for this shell with `export PATH="/absolute/new/ai-agent-tools-install/bin:$PATH"`; Windows use `node_modules/.bin` and the verified Node runtime. No shell profile or Codex configuration is edited. Package lifecycle/native install scripts are disabled; CFML Linkage's optional native parser remains separately unverified. Project Profile's upstream missing license-file gap remains documented. Rebuild before installation; packing here deliberately does not execute lifecycle scripts.

Run `ait --help` and each needed tool's `--help`/`capabilities` before use. Published `ait` metadata remains independent of this local source install; private MVPs are invoked directly through their CLI, not inferred as public npm releases.

The repository skill `skills/ai-agent-tools-workflow/SKILL.md` is optional guidance. A Codex session can read it when useful; no mandatory hook, always-on automation or personal instruction overwrite is installed. Choose tools for an actual evidence need. Retain input snapshot, output and exit code. Never interpret `unknown` as pass.

Rollback: close this shell or restore its previous PATH. Existing global installations/configuration remain intact. The isolated prefix can be removed by its owner after preserving needed artifacts. A future upgrade installs into a new prefix, allowing selection of the prior one without uninstalling it. The installer copies the verified Node executable and its available distribution license into the isolated prefix, so installed launchers do not depend on the task runtime path. npm itself is not installed by this script.

On macOS/Linux the isolated installer creates launchers that use the recorded Node executable and the package's real CLI entrypoint. This preserves invocation for older tools whose direct bin-symlink entrypoint guard does not run. It does not rewrite those tools. Help/capability support varies by native contract; unsupported `--help` may correctly exit2. Installation inventory alone does not prove every tool's optional parser/backend capability.

Example commands after selecting the prefix:

```sh
agent-env-doctor capabilities --json
agent-contract-check capabilities --json
agent-release-guard collect --input request.json --json
agent-release-guard deploy-verify --input evidence.json --json
agent-runtime-trace ui-regression-check --input ui-evidence.json --json
```

Collection authenticates neither supplied CI/browser producers nor an installed device. The fixed Playwright adapter can export geometry from an already authorized caller-owned page; it does not navigate, click, type, read cookies/storage or collect page text. Focus/Back evidence comes from the caller's explicitly approved runner. No production UI coverage is claimed by synthetic fixture success.
