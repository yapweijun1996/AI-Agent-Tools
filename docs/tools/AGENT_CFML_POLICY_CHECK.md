# Agent CFML Policy Check

| Field | Value |
| --- | --- |
| Lifecycle | `Planned` |
| Registry ID | `agent-cfml-policy-check` |
| Repository | [AI-Agent-Tool-CFML-Policy-Check](https://github.com/yapweijun1996/AI-Agent-Tool-CFML-Policy-Check) |
| Package and release | Not recorded |

This is the Hub design handoff for a configurable, read-only policy checker for
mixed CFML/HTML source. The tool is intended to detect project and presentation
rules that are valid for one codebase but are not part of CFML language syntax.
The first useful result should be a deterministic finding for one explicitly
selected `.cfm` or `.cfc` file under one explicit root and one explicit rule
profile.

The repository identity was confirmed on 2026-09-16. Its initial commit
`24e0889657ac7da0fe752c4fb48c9e7f90fcaa4a` contains only `.gitattributes`; no
implementation, tests, package metadata, npm identity, or release evidence has
been inspected. The registry therefore remains `Planned`.

## Responsibility and separation

`agent-cfml-check` owns CFML language-structural findings for its declared
subset, such as an unclosed CFML tag or a missing terminating `#` expression
delimiter. `agent-cfml-policy-check` owns configurable project rules, including
rules that span CFML and HTML. It must not silently expand the structural
checker or claim to prove runtime, business, or engine semantics.

| Concern | Owner | Boundary |
| --- | --- | --- |
| CFML tag/expression structure | `agent-cfml-check` | Reports supported syntax/structure and explicit unsupported coverage |
| Project and markup policy | `agent-cfml-policy-check` | Evaluates an explicit rule profile against an explicit source file |
| Precise source navigation | `agent-code-slice` | Returns bounded source context; it does not decide policy compliance |
| Diagnostic parsing | `agent-error-lens` | Classifies supplied error output; it does not inspect source policy |
| Package installation and process dispatch | `ai-agent-tools` / `ait` | Manages registered packages only; it does not contain the checker implementation |

The policy checker may report `incomplete` when malformed or dynamic source
prevents a reliable policy decision. It must not turn uncertainty into a pass,
and it must not require `agent-cfml-check` as a runtime dependency.

## Proposed V1 contract

Inputs should be explicit and bounded:

- one root and one source path; the resolved file must remain under the root;
- one local rule profile, preferably JSON in V1, with a profile identifier and
  version; remote rule retrieval and implicit project-wide discovery are out of
  scope;
- optional bounded limits for bytes, findings, nesting, and analysis time.

The tool should return the existing Hub result envelope without changing the Hub
standard versions. A finding should have stable fields equivalent to:

```json
{
  "rule_id": "html.table.requires-colgroup",
  "severity": "error",
  "message": "Table must contain a colgroup element.",
  "line": 42,
  "column": 9,
  "source": "policy-profile.json"
}
```

The final native schema, exit mapping, and profile application rules belong in
the independent repository. This Hub document records intended behavior only;
it is not a native consumer profile and does not claim implementation
conformance.

## Initial rule candidates

The rule engine should be data-driven so project-specific checks can be added
without changing the checker boundary. Candidate rules for the first fixtures
include:

- `html.table.requires-colgroup`: each statically understood `<table>` has a
  `<colgroup>` child;
- `html.table.requires-col`: each statically understood `<table>` has at least
  one `<col>` inside its `<colgroup>`;
- a generic required-element or required-attribute rule for explicitly allowed
  project conventions.

These are policy examples, not universal HTML claims. A table assembled through
CFML loops, conditionals, includes, or runtime-generated strings may be
undecidable from one file. The checker should emit an explicit incomplete or
unknown result according to its native contract instead of reporting a false
violation or false pass. CFML delimiter diagnostics remain structural findings,
not policy rules.

## Safety and non-goals

- Never execute CFML, JavaScript, SQL, includes, application code, or a browser.
- Never follow includes or scan a directory implicitly in the first version.
- Never fetch profiles or source over the network during a check.
- Never modify source, generate an automatic patch, or claim a fix was applied.
- Enforce path, byte, nesting, finding, and time limits; fail closed on limit
  exhaustion and malformed rule profiles.
- Do not certify accessibility, HTML validity, browser behavior, database
  behavior, permissions, tenant isolation, or business correctness.

## Acceptance cases for the independent repository

The owner should freeze fixture-backed cases before promotion:

| ID | Case | Expected evidence |
| --- | --- | --- |
| POL-01 | Table contains `colgroup` and `col` | Deterministic pass with no false finding |
| POL-02 | Table omits `colgroup` | `html.table.requires-colgroup` finding at the table location |
| POL-03 | Table has `colgroup` but no `col` | `html.table.requires-col` finding |
| POL-04 | Multiple tables have mixed compliance | One stable finding per applicable table |
| POL-05 | Policy rule is applied inside understood CFML markup | Correct source location or explicit incomplete result |
| POL-06 | Dynamic loop/conditional prevents certainty | Incomplete/unknown result, never an invented pass |
| POL-07 | Missing terminating `#` expression | Delegated or separately reported as structural coverage; no duplicate policy claim |
| POL-08 | Invalid or unsupported rule profile | Bounded error/incomplete result with no source mutation |
| POL-09 | Source path escapes the explicit root | Fail-closed path error |
| POL-10 | Repeated identical input and profile | Byte-stable JSON and stable exit/status behavior |

Implementation, tests, fixtures, CI, security reporting, package metadata, and
release evidence belong to the independent repository. A `docs/profiles` entry
should be added only after a concrete package/version and native contract are
verified. Shared parser or rule packages remain subject to the Hub maturity gate;
the Hub must not become the implementation repository.
