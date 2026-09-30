# Negative case: malformed and partial input

> **Status: VERIFIED / INERT INPUT.** The injected bounded scanner preserves safe failure and does not execute or interpret unsupported regions as confirmed facts.

Coverage: syntax-like comments/strings, malformed CFML, unsupported tags, parser diagnostics, and `complete=false` behavior. `expected-malformed-v0.1.json` records the bounded expectations.
