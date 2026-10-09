# Isolated interleaved math repair protocol

Owner-authorized local development study, 2026-10-09. This is a second historical
repair case, not a replacement for the first replay or an AIT agent runtime.

## Case and acceptance

Replay Markdown-Editor commit `5214c9554f8b118fe60fa44ac563e5f785c410e4`.
The historical reference is `094478786ca427f82cab977c9f98a1e4cfd5bad6`;
only its math module and two native math tests are used in the positive control.
Participants receive tracked source, tests and locked package metadata, without
history, reference patch or independent acceptance cases. They may change only
`src/preview/mathRenderer.js` and add `test/mathSafety.test.js`.

The task fixes math detection in code/currency, protects HTML code and attributes,
renders visible inline/display math, decodes Markdown HTML entities for KaTeX,
and tolerates unavailable CSS without losing math rendering. Eighteen frozen
independent cases exercise the actual module with a controlled KaTeX/CSS loader.
Native tests use the locked production dependencies. This proves selected module
behavior, not complete browser, application, asynchronous revision or security
correctness. Acceptance does not require a particular parsing implementation.

Before formal trials, require baseline native tests to pass, independent acceptance
to reproduce the defect, and the historical math fix to pass all eighteen cases.
Register exact observed baseline/reference counts and freeze code/protocol hashes
before any participant. Controls may not be weakened after a participant starts.

## Conditions and order

Six fresh ephemeral Codex CLI sessions, three per condition. Request the same
`gpt-6.1-sol`, `xhigh`, CLI 0.161.0 and Ubuntu WSL Node 24.19.0 as the first case.
These are launch settings, not independent backend model attestation. Seed
20261011 chooses the first condition; subsequent conditions strictly alternate.
Each pair uses a fresh source copy. No selective replacements or repair reruns.

Both arms inspect source, edit, author meaningful regression tests, execute every
native test and run the same producer. The conventional arm reasons from the
actual diff, receipt and request. The tool arm additionally attempts Code Slice,
Test Scope, Patch Guard and Test Evidence. Scope selection never replaces native
execution; analysis exit zero never replaces an explicit verdict.

## Isolation and preflight

Use a per-invocation named permission profile extending `:workspace`, with root
read denial, minimal system runtime reads, denied shared temp directories,
network disabled, and explicit read-only runtime/dependency/tool roots. Keep
execpolicy rules and managed controls. Do not use ignore-rules, dangerous flags,
credential copies, user configuration edits or policy escalation.

CLI 0.161.0 treats explicit writable file rules as synthetic directory roots and
cannot start this fixture with them. Use directory carveouts within the isolated
fixture instead; complete source comparison enforces the two-file edit contract.
This does not grant reads or writes to other projects. Preserve failed preparation
evidence with zero formal participants, then repeat preparation before freezing
any participant run. Create an empty command HOME inside the fixture.

The CLI authenticates through its existing authorized home; generated commands
receive only explicit PATH/HOME variables. Enumerate local Skill paths without
reading their contents and disable those optional Skills only for this invocation.
Project-document discovery is disabled for both arms, whose common prompt carries
the identical authorized task and safety/scope rules. Record configuration and
Skill paths. Client authentication/service traffic and hidden/server instructions
remain outside the command sandbox; isolation is not a claim about every Codex
surface. Preserve higher-priority governance and do not suppress execpolicy.

Before formal trials, actually prove fixture reads/writes and native tests succeed;
an outside benign sentinel, an ancestor rule sentinel and a Skill-path probe are
unreadable. Do not read credentials or personal Skill bodies to test denial.
Unsupported enforcement or unavailable authorized execution aborts before trials.
Use Node `--test-isolation=none` with VM modules enabled and opened child output
descriptors, preserving individual counts without weakening sandbox restrictions.

## Evidence and scoring

Reuse the first replay's pure capture/fingerprint helpers and common producer
bytes, adding the explicit VM flag to this case's frozen generated producer.
Independent verification reads every submitted project file, rejects protected
changes, checks support bytes, reruns native and withheld acceptance tests, and
checks source stability. Capture submitted source, actual process outcomes,
producer hashes, command events and emitted usage in an ignored local evidence
directory. Freeze copied tool bundles and all previous replay bytes.

Score repair correctness, evidence adequacy, tool uptake and scope compliance
separately. Manually audit completed commands and file edits; blocked outside
requests remain recorded deviations rather than being silently discarded. Report
all assigned attempts and compliant attempts. Usage is emitted CLI accounting,
not billing or complete context telemetry. Medians are descriptive, with n=3 per
arm, one second module case, one platform, shared provider/cache state and no
general causal or performance claim. Do not pool the two different repair cases.

Clean all owned source/dependency/tool temporary copies after capture, retain
ignored raw evidence, update current documentation and run root acceptance.
No production source edits, automatic commit, push, publication or KB writeback.
