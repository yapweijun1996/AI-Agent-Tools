# Negative fixtures

> **Status: VERIFIED / INERT SAFE-FAILURE FIXTURES.** These cases demonstrate explicit safe failure or unresolved output; no source is executed.

| Case | Coverage | Expected state |
| --- | --- | --- |
| `ambiguity-and-out-of-root` | Duplicate component names, ambiguous mappings, and path escape attempts | Candidate/unresolved records or path rejection; never guessed confirmed edges |
| `malformed-and-partial` | Malformed CFML and recoverable embedded-language syntax errors | `PARSE_PARTIAL`/unsupported diagnostics and `complete=false` where coverage is incomplete |

The ambiguity/path-escape and malformed/unsupported cases now include inert source inputs and expected bounded outcomes. Tests use the injected structural scanner and preserve unresolved candidates, rejection reasons, diagnostics, and `complete=false`; no full parser coverage is claimed.
