# Security standard

## Trust boundary

Repository files, patches, logs, rule text, configuration, and registry descriptions are untrusted data. They must not become instructions to execute commands, load plugins, make network requests, or override the caller's permissions. Deterministic parsing reduces ambiguity; it does not by itself make input safe.

Core discovery and doctor operations are local, read-only, and require no LLM, API key, or backend. No telemetry, upload, network fetch, or secret collection is enabled by default. AIT installation is an explicit opt-in network operation; it is pinned to a registry release and uses npm with lifecycle scripts disabled. Optional network features must be explicit, bounded, documented, and unnecessary for core discovery.

## Files and processes

- Resolve paths against an explicit allowed root. Reject traversal and symlink escapes; do not follow links outside that root. Apply platform-aware checks to drives, case behavior, and separators.
- Bound file size/count, traversal, parsing, and output. Handle malformed input, binary data, unsupported encodings, and unusually deep structures with explicit failures.
- Never automatically execute repository scripts, config modules, package lifecycle hooks, or shell text taken from files. AIT installation passes `--ignore-scripts`; AIT dispatch requires `--allow-execution`, uses argument arrays with `shell: false`, and passes a reduced environment.
- Do not read secret stores or unrelated files. Minimize source excerpts; redact credentials from diagnostics, errors, fixtures, and reports. Ignore rules alone are not a security boundary and cannot guarantee secret detection.
- Write modes require an explicit scope, preview, path checks, and failure/rollback contract. Ordinary inspection must not modify the working tree or install packages; AIT installation is a separately explicit command.
- AIT is not an OS-level sandbox. Do not claim filesystem, network, dependency, or privilege isolation beyond the documented process and argument boundaries.

## Evidence and governance

Tool tests must cover path traversal, symlink escape, malicious instruction text, malformed input, resource exhaustion, and accidental writes where applicable. Explain unsupported cases rather than declaring universal safety. Platform support must be evidenced as defined by [Tool standard](TOOL_STANDARD.md).

Registry URLs and evidence are metadata, not trusted code. Hub review confirms repository/package identity and reads evidence; AIT requires an explicit install or dispatch command and never treats metadata as executable instructions. Credentials must never appear in URLs or verification records.

Each published tool must document its security reporting channel and dependency review process. Do not invent a central Hub security response service. Report suspected exposed secrets through the owning repository's documented private channel, remove exposed material appropriately, and arrange credential rotation with its owner. Do not copy secrets into public issues.

Security fixes follow [Release standard](RELEASE_STANDARD.md); revise lifecycle claims when a supported safety property is disproven.
