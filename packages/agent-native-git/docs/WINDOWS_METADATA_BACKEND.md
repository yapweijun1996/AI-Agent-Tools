# Windows metadata backend

Stage 2 adds a separate packaged execution helper described in [STAGE2](STAGE2.md). The filesystem helper and admission boundaries below remain unchanged; statements that this helper does not supervise processes refer specifically to `platform.exe`, not `execution.exe`.

## Scope and public shape

Stage 1 has a packaged Windows x64 .NET Framework console helper, not a PowerShell-per-operation backend. Its only operations implement `PlatformAdapter` from `src/shared.ts`:

- `ownerContext(): { sid, stateRoot }`
- `identify(path): { canonicalPath, identity, ownerSid, directory, reparsePoint, localDisk }`
- `preparePrivateDirectory(path): FileIdentity`
- `assertPrivateDirectory(path): FileIdentity`
- `assertPrivateFile(path): FileIdentity`

`createNativePlatform(assetRoot: string): PlatformAdapter` is the public TypeScript factory. The asset root is a trusted package/service construction input, not a task-data executable selector. The helper contains no Git, shell, arbitrary process launcher, Job Object supervisor, provider or execution operation. Unsupported OS/architecture raises `UNSUPPORTED_PLATFORM` with exit code 3 before package inspection or directory mutation. There is no fallback implementation.

The owner SID comes from the current Windows token. `SHGetKnownFolderPath(FOLDERID_LocalAppData)` supplies the actual owner Local AppData directory. Production state belongs at its canonical `angit` child. Environment variables, repository text, task data and CLI flags cannot redirect this root. Internal Core fixture injection does not convey authority; disposable fixtures must first establish their own owner-controlled parent and private directories.

`ownerContext` observes the token SID and canonical Known Folder; it does not approve that folder's write permissions or create state. Actual private-state operations validate the selected parent. This separates read-only location discovery from admission and permits isolated private fixture roots without relaxing production-state ACL checks. An unsafe default Known Folder anchor remains unsupported for registration; no existing ACL is repaired.

## Handle identity and filesystem admission

The helper opens ordinary drive-absolute paths with fixed Win32 APIs. Internally added extended-length prefixes are implementation details; caller-supplied UNC, device/extended prefixes, alternate data streams, relative paths, dot segments, reserved DOS device names, malformed surrogate pairs, control characters and paths longer than 4096 UTF-16 code units are rejected. Each lexical component is opened without following its final reparse point and retained until the operation completes. Handles allow read/write sharing but omit delete sharing. Final target canonical names come from `GetFinalPathNameByHandleW`; identities come from `GetFileInformationByHandleEx(FileIdInfo)` as `win:<16 lowercase hex volume serial>:<32 lowercase hex file identifier>`.

Case and junction aliases of the same target therefore compare by the same native identity, rather than normalized pathname guesses. `reparsePoint` reports an observed lexical ancestor or final reparse point; `identify` may resolve such aliases for comparison. Private-state operations and owner context reject reparse/cloud-placeholder ancestry rather than adopting it. `localDisk` is true only for a fixed drive with an observed NTFS/ReFS filesystem supporting persistent ACLs and no observed offline/recall/unpinned placeholder attributes. Unknown, removable, remote and unsupported filesystems never admit state creation.

## ACL policy: create, inspect, never repair

New managed directories are created atomically by `CreateDirectoryW` with the current owner SID and a protected DACL containing only an owner Full Control ACE, inheritable by files and directories (`O:<owner>D:P(A;OICI;FA;;;<owner>)`). Missing intermediate directories receive the same protection. Directory inspection requires:

- actual owner equals the current token SID;
- a non-null, non-empty protected DACL;
- only ordinary non-callback owner Allow ACEs, effective owner Full Control, and owner Full Control inheritance for files/directories;
- a local admitted directory without observed reparse or cloud-placeholder ancestry.

An existing insecure target is denied without changing its owner, ACL or contents. An independently created directory racing creation must pass the same inspection. Existing data is never silently repaired or deleted.

`assertPrivateDirectory` is noncreating inspection: it applies the same managed-directory protection checks and validates the direct anchor parent without creating missing directories or changing ACLs. Existing registry access revalidates the state root through this API (including its parent) before inspecting the registry file. A previously admitted root is not permanently trusted.

The nearest existing bootstrap parent and direct parent of a private target must be owned by the caller on admitted local storage. Their effective write/delete/ACL-change grants may belong only to the owner, SYSTEM or local Administrators; broad user/group/world-write grants and unsupported ACE forms are denied. Ordinary owner Local AppData/temp ancestors are anchors, not managed-state targets, and are not rewritten or required to have protected owner-only DACLs. SYSTEM/Administrator exceptions apply only to those anchors, never to managed targets.

On the current host, Local AppData/Temp has non-owner grants including CodexSandboxUsers/other SID Modify/DeleteChild, so default state bootstrap fails closed. Existing anchors are not repaired. Internal fixtures first protect only a newly allocated base and then create native private directories; those isolated results do not establish default-host deployment safety.

`assertPrivateFile` applies to the explicitly selected external owner policy/profiles input as well as state DBs, guard files and SQLite sidecars. It requires a regular file, one native hard link, the current owner SID, admitted local storage, no observed reparse/cloud ancestry, an owner-controlled direct parent and only ordinary owner Allow ACEs with effective owner Full Control. An inherited owner-only file DACL is accepted: SQLite-created DB/WAL/SHM files inherit from the private managed directory. A protected file DACL is also accepted. A repository policy file with normal broad inherited permissions is not implicitly approved; the owner must independently supply an appropriately protected policy file, for example inside an already owner-only directory. This primitive checks protection, not policy semantic approval or byte/hash stability; Core and strict JSON readers own those decisions.

## Packaged protocol and build identity

The wrapper executes only `<assetRoot>/dist/native/platform.exe` with the fixed argv `['--stdio-v1']`, empty controlled environment, no shell and UTF-8 JSON on stdin. Each call is bounded to 10 seconds and 65536 captured bytes per stream. Requests carry `schemaVersion: 'angit-native/v1'`, a random 32-hex `requestId`, one known `op` and, except for `ownerContext`, one `path`. The helper accepts only a closed string-valued request object, rejects duplicate keys including escaped-equivalent keys, invalid UTF-8, invalid JSON, unknown keys/operations, multiple frames, raw CR and non-terminal raw LF. One optional terminal LF is accepted. Paths are never executable arguments.

Replies are one bounded UTF-8 JSON line written directly to standard-output bytes, avoiding Windows console-codepage conversion. Success and error envelopes have exact keys; response nonce, operation, version, result fields, native exit status and the empty stderr requirement are validated by the wrapper. Error messages come from a fixed sanitized catalog, without path, exception or stack text. Timeout, output-limit, unavailable-helper, identity and protocol errors become stable `AngitError` codes. There is no mock response or compile-on-first-use path.

Before and after each invocation the wrapper checks `platform.identity.json`, owned `native/Platform.cs` and the executable with bounded reads and SHA-256. The manifest binds both source and binary, the fixed reference names, `win32-x64` platform and Framework64 compiler family. File identity/size/timestamps are checked across each asset read. Packing must include both `native/Platform.cs` and `dist/native/platform.exe`/`platform.identity.json`; stale, missing or mismatched pairs fail closed.

`scripts/build-native.mjs` exports `buildNative(root: string): void`; importing it does not compile or mutate anything. The explicit developer build uses the locally observed `C:/Windows/Microsoft.NET/Framework64/v4.0.30319/csc.exe` with `/noconfig`, `/nostdlib+`, x64 and explicit fixed `mscorlib.dll` and `System.dll` references from that same Framework64 directory. It creates a bounded x64 PE executable and paired digest under `dist/native`; failed compilation raises an error and removes only its own random temporary outputs. A crash during the two final renames leaves a pair that runtime digest checks reject. No installer hook, network/model download, alternate compiler or runtime source compilation is introduced.

The explicit package developer build, from the project root with exactly Node 24.21.0 on PATH, is:

```powershell
npm run build
node ./bin/angit.js --capabilities --json
```

Build integration invokes `buildNative` and compiles TypeScript; local bin invocation requires those built assets. These are instructions, not compilation/product acceptance claims. Actual parent-run evidence belongs in the validation ledger. Installation has no compiler/download hook.

## Cooperative limits and evidence boundaries

This is same-account cooperative coordination, not a hostile-process sandbox. Retained non-delete-sharing handles narrow rename/replacement races during the short native inspection, and atomic security-at-creation avoids a create-then-tighten window. These are not exclusive locks against another writer changing ACLs or reparse metadata. Helper handles close before subsequent Node/Core file opens; there is no retained cross-process handle capability or atomic native-inspect-plus-SQLite-open transaction. Core must bind actual content/identity reads and mutation admission separately. Writable same-owner package assets can replace both the digest manifest and binary; pairing detects stale/corrupted/mismatched packages, not a malicious owner. SYSTEM, Administrators, backup privileges and a hostile same-owner process remain outside the claim.

Stage 0 `evidence/windows-primitives.json` separately records actual Framework64 compiler discovery/compilation, native junction/case identity and owner ACL primitives. The learned reflection cleanup rule was to load disposable assemblies from bytes rather than locking an executable with `LoadFile`; this runtime does not load probe assemblies or import that disposable fixture. Stage 0 Job/pipe/process tests are preserved, not claimed for this helper. No Stage 1 native build, runtime smoke, ACL race challenge or packed-consumer test is performed by the native slice mid-flight. Parent verification should exercise real helper/CLI calls, inherited policy/SQLite protection, insecure-existing rejection without repair, junction/case identity equivalence, malformed/duplicate/oversized frames, helper/source/manifest mismatch and unsupported-platform early rejection. Controlled race evidence must name the actual schedule exercised; handle retention alone is not evidence that every race is eliminated.

## Metadata lease boundary

The Stage 1 metadata/init timer described here does not host a background coordinator. Stage 2 has a separate foreground ExecutionSession heartbeat/broker described in STAGE2. Synchronous native invocation can pause the event loop past lease expiry; renewal preserves the existing grant/fence and cannot revive an expired grant. Unknown effects remain preserved, not silently released or repaired.
