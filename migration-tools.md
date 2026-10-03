# Tool index

Source versions below come from imported manifests. They are not claims of published npm releases.

| Package | Source version | Executable | License / visibility | Source and usage |
| --- | --- | --- | --- | --- |
| `agent-cfml-check` | 0.1.1 | `agent-cfml-check` | MIT; public package identity | [README](packages/cfml-check/README.md) |
| `agent-cfml-linkage` | 0.1.0 | `agent-cfml-linkage` | No declared package license; private | [README](packages/cfml-linkage/README.md) |
| `agent-cfml-policy-check` | 0.1.0 | `agent-cfml-policy-check` | UNLICENSED; private | [README](packages/cfml-policy-check/README.md) |
| `agent-change-impact` | 0.1.1 | `agent-impact` | MIT; public package identity | [README](packages/change-impact/README.md) |
| `agent-code-slice` | 0.4.0 | `code-slice` | MIT; public package identity | [README](packages/code-slice/README.md) |
| `agent-error-lens` | 0.1.0 | `agent-error-lens` | MIT; private | [README](packages/error-lens/README.md) |
| `agent-project-profile` | 0.1.2 | `agent-project-profile` | MIT; public package identity | [README](packages/project-profile/README.md) |
| `ai-agent-tool-project-tree` | 0.1.1 | `aptree` | MIT; public package identity | [README](packages/project-tree/README.md) |
| `agent-symbol-search` | 0.1.2 | `agent-symbol-search` | MIT; public package identity | [README](packages/symbol-search/README.md) |
| `agent-test-scope` | 0.1.1 | `agent-test-scope` | MIT; public package identity | [README](packages/test-scope/README.md) |

Build before invoking TypeScript-backed binaries. Run package tests with `npm --prefix packages/TOOL test`. JS API entrypoints and `exports` remain as originally declared. Each package directory retains its schemas, fixtures, skills, docs and local guidance.

There are no mandatory inter-tool source dependencies. Dependencies resolve within each package from its own lockfile. If a future inter-tool dependency is required, declare an exact compatible published package version or explicitly reviewed local link; do not silently rewrite native imports. Versions remain independent. Tag future releases with `package-name/vX.Y.Z` after explicit publication approval. Historical unprefixed tags remain in local recovery bundles.

## New native monorepo tools

| Package | CLI | Registry | Status |
|---|---|---|---|
| [ai-agent-tool-environment-doctor](packages/environment-doctor/README.md) | agent-env-doctor | agent-environment-doctor | Experimental, private source |
| [agent-contract-check](packages/contract-check/README.md) | agent-contract-check | agent-contract-diff | Experimental, private source |
| [ai-agent-tool-release-guard](packages/release-guard/README.md) | agent-release-guard deploy-verify | agent-release-guard | Experimental, private source |
| [ai-agent-tool-runtime-trace](packages/runtime-trace/README.md) | agent-runtime-trace ui-regression-check | agent-runtime-trace | Experimental UI profile, private source |
| [agent-patch-guard](packages/patch-guard/README.md) | agent-patch-guard check | agent-patch-guard | Experimental, private source |
| [agent-rules-resolve](packages/rules-resolve/README.md) | agent-rules-resolve resolve | agent-rules-resolve | Experimental, private source |

Optional source installation: [local CLI workflow](docs/workflow/LOCAL_CLI.md). Release Guard additionally supports bounded explicit evidence collection; see its package README.
