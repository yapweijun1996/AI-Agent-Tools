# Security standard

## Trust boundary

Repository files, patches, logs, rule text, configuration, and registry descriptions are untrusted data. They must not become instructions to execute commands, load plugins, make network requests, or override the caller's permissions. Deterministic parsing reduces ambiguity; it does not by itself make input safe.

Core operation is local, read-only, and requires no LLM, API key, or backend. No telemetry, upload, network fetch, or secret collection is enabled by default. Optional network features must be explicit, bounded, documented, and unnecessary for core operation.

## Files and processes

- Resolve paths against an explicit allowed root. Reject traversal and symlink escapes; do not follow links outside that root. Apply platform-aware checks to drives, case behavior, and separators.
- Bound file size/count, traversal, parsing, and output. Handle malformed input, binary data, unsupported encodings, and unusually deep structures with explicit failures.
- Never automatically execute repository scripts, config modules, package lifecycle hooks, or shell text taken from files. Prefer data-only configuration and argument arrays if a documented subprocess is necessary.
- Do not read secret stores or unrelated files. Minimize source excerpts; redact credentials from diagnostics, errors, fixtures, and reports. Ignore rules alone are not a security boundary and cannot guarantee secret detection.
- Write modes require an explicit scope, preview, path checks, and failure/rollback contract. Ordinary inspection must not modify the working tree or install packages.

## Evidence and governance

Tool tests must cover path traversal, symlink escape, malicious instruction text, malformed input, resource exhaustion, and accidental writes where applicable. Explain unsupported cases rather than declaring universal safety. Platform support must be evidenced as defined by [Tool standard](TOOL_STANDARD.md).

Registry URLs and evidence are metadata, not trusted code. Hub review confirms repository/package identity and reads evidence; a future discovery consumer must not auto-install or execute a discovered package. Credentials must never appear in URLs or verification records.

Each published tool must document its security reporting channel and dependency review process. Do not invent a central Hub security response service. Report suspected exposed secrets through the owning repository's documented private channel, remove exposed material appropriately, and arrange credential rotation with its owner. Do not copy secrets into public issues.

Security fixes follow [Release standard](RELEASE_STANDARD.md); revise lifecycle claims when a supported safety property is disproven.
