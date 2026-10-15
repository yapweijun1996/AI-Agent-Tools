# Stage 0 preflight

Date: 2026-10-14. Scope: independent new Windows x64 workspace, contract consolidation and disposable primitive probes only.

## Authorization and impact

The owner selected Windows-first, MIT and then authorized Stage 0 in `C:/Users/tno/Documents/GitHub/Agent-Native-Git`. The destination did not exist before this work. No Git repository, remote, product CLI, release version, running Coordinator or installed service is created. No actual Codex/Claude/Pi task is started. AI-Agent-Tools source, registry and its ignored baseline bundle remain outside mutation scope.

The new probe scripts have no callers in an existing product or TypeScript project, and do not expose a product API. Static graph analysis cannot operate on a nonexistent preexisting JS/TS configuration; this is bounded new-file impact evidence, not a claim of a complete empty dependency graph. Later product changes require normal impact/reference analysis.

## Observed environment

| Item | Observed value | Evidence scope |
|---|---|---|
| Windows | Microsoft Windows NT 10.0.26200.0 | Environment.OSVersion from Windows PowerShell |
| Process architecture | x64 | PowerShell Is64BitProcess=true; Node arch=x64 |
| PowerShell | 5.1.26100.9444 | Explicit WindowsPowerShell executable, no profile |
| .NET Framework runtime | 4.0.30319.42000 | Environment.Version; not a .NET SDK claim |
| Native fixture compiler | Framework64 csc.exe, 4.8.9221.0 | Actual x64 fixture compilation, exit 0; not a dotnet SDK |
| Git | 2.51.0.windows.2 | git --version |
| Node target executable | C:/Users/tno/.omp/ai-agent-tools-20261014/runtime/node.exe | Existing local source-tool installation; no download |
| Node target version | v24.21.0 | Direct invocation of that executable |
| Built-in SQLite | 3.53.4 | SELECT sqlite_version() using node:sqlite under the target executable |
| node:sqlite backup | function | Export surface observation only; behavioral verification is separate |
| PATH Node | v25.2.1, previously observed | Outside the selected Node24 target; not used for the Stage 0 SQLite probe |

`pwsh` was not found. `dotnet` and `csc` were not reported by PowerShell Get-Command. The discovery command exited 1 after reporting environment facts because optional executables were absent; this did not establish compiler availability. The native probe subsequently located `C:/Windows/Microsoft.NET/Framework64/v4.0.30319/csc.exe` through the installed runtime directory and compiled the inert fixture successfully with explicit references and `/noconfig`. See [native evidence](../evidence/windows-primitives.json). No SDK or package was installed.

The observed Node patch is a local probe pin, not a security-audited release approval. Driver stability, power-loss behavior and distributable native helper packaging remain independent gates even when primitives pass.

## License and identity

The owner explicitly chose MIT. The workspace uses the existing owned MIT tool notice convention `Copyright (c) 2026 Yap Wei Jun`, observed in AI-Agent-Tools/packages/code-slice/LICENSE. This is a recorded attribution convention, not a fabricated maintainer list or a claim that third-party code is relicensed. Public npm name/account ownership, repository remote and release identity are not established.

## Reuse gate

The engineering reuse gate returned passed/retrieval_complete with permission to proceed. Retrieved delegation guidance is applicable to work decomposition; unrelated PostgreSQL material is not selected as architecture evidence. Local source specifications and directly exercised Windows/Node behavior remain authoritative for this stage.

## Verification boundary

Environment/API presence does not establish safe IPC, process supervision, SQLite lock lifetime, coherent schemas, packaged installation or product correctness. Final Stage 0 evidence must report each probe independently, including failed/blocked cases and cleanup observations. No power-loss, sandbox, provider compatibility or production-readiness claim follows from a successful primitive probe.

## Primary API references

- [Node v24 SQLite documentation](https://nodejs.org/docs/latest-v24.x/api/sqlite.html): fetched version is v24.21.0; module stability is 1.2 (release candidate), not a stable-API guarantee.
- [GetNamedPipeClientProcessId](https://learn.microsoft.com/en-us/windows/win32/api/winbase/nf-winbase-getnamedpipeclientprocessid): observe the process on an actual pipe handle, then independently validate its token/start identity.
- [AssignProcessToJobObject](https://learn.microsoft.com/en-us/windows/win32/api/jobapi2/nf-jobapi2-assignprocesstojobobject): assignment/limits, inherited child jobs and nested-job behavior require actual host proof.

API documentation supports the probe design; it is not behavioral evidence or platform certification.
