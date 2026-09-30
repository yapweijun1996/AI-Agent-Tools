# Agent Error Lens fixture corpus

`corpus.json` is the frozen V0.1 Golden/adversarial fixture inventory. It defines reproducible request inputs and assertions consumed by the parser verification tests.

The `expected` object contains reviewed assertions rather than a complete canonical result. A fixture with `generator` expands deterministically in the validator; it does not execute a command or read a repository file.

Fixture families cover approved producers, stream/terminal/path structure, malformed or bounded input, security redaction, repeated determinism, and downstream agent location/evidence use. The corpus checker proves inventory and fixture-shape integrity; parser behavior is verified by the Node tests that consume these assertions. T-004 and T-005 are complete, while remaining package and cross-platform proof is tracked in T-007.
