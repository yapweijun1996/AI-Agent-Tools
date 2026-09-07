# Agent CFML Check

Registry ID: `agent-cfml-check`. Lifecycle: `Planned`. Design revision:
2026-09-07, draft for independent implementation. Repository, maintainer, npm
identity, executable name, and release version are unconfirmed. This document
specifies intended behavior; examples and acceptance cases are not test results.

## Problem and outcome

After a CFML edit, report structural defects with exact locations and explain
which supported syntax was checked. The motivating extra closing `cfif` is an
owner-reported incident, EXP-01 in the [expansion review](../TOOL_EXPANSION.md).
Equal opening/closing counts do not establish correct nesting.

V1 checks one explicitly selected `.cfm` or `.cfc` source under an allowed root.
It validates a declared tag-structure profile and CFScript lexical/delimiter
boundaries. It does not claim full CFML grammar, expression/type correctness,
SQL correctness, valid HTML, include expansion, or successful Lucee execution.

## Interface and input

Proposed operation names are interface design, not installed commands:

| Operation | Required input | Effect |
| --- | --- | --- |
| `capabilities` | None | Describe supported profile revisions, syntax, exclusions, and caps |
| `check` | Explicit allowed root, one source file, supported profile; optional bounded limits | Read-only structural analysis |

`--json`, help, version, streams, and exits follow the [CLI standard](../CLI_STANDARD.md).
Resolve caller-supplied file paths against the caller's working directory, then
check the resolved file against the explicit root. Accept regular UTF-8 files,
with an optional BOM; preserve LF/CRLF bytes for source locations. Reject binary
content, invalid UTF-8, unsupported extensions, root escape, and ambiguous inputs.
No directory discovery, network, include traversal, format changes, or fixes in V1.

The proposed profile ID `cfml-structure-v1` is a design identifier, not an engine
version or compatibility certification. The tool owner must pin tested Lucee
versions and lexer/parser revisions before claiming support. Adobe CF compatibility
requires its own fixtures; JavaScript grammar is not a CFScript parser.

## Supported structural subset

The initial tag catalog is finite and versioned:

- Paired bodies: `cfif`, `cfloop`, `cfoutput`, `cfquery`, `cfsavecontent`,
  `cfsilent`, `cfcomponent`, `cffunction`, and `cfscript`.
- Branch markers: `cfelseif` and `cfelse` belong to the directly open `cfif`;
  at most one `cfelse`, and no `cfelseif` after it.
- Bodyless statements: `cfset`, `cfreturn`, `cfinclude`, `cfargument`, and
  `cfqueryparam`; the profile must state accepted self-closing spellings.
- `cfargument`/`cfqueryparam` context rules and required attributes are outside
  this structural subset unless explicitly added with fixtures.

Treat names case-insensitively while retaining original byte coordinates. Do not
assume every `cf*` construct needs a closing tag. Unknown built-in tags, custom
tags, imported tag libraries, and optional-body semantics outside this catalog
make the whole requested check incomplete, rather than silently passing them.

The lexer must distinguish template text, CFML comments, CF tag expressions and
quoted attributes, CFScript, CFScript strings/comments, and interpolation. Handle
nested CFML comments and doubled quote escapes in the supported profile. Comments
inside tag expressions must not terminate the enclosing tag. Comment-like text in
a string stays literal. If the implementation cannot establish a boundary,
report an unsupported construct or unterminated lexical construct explicitly.

Do not blindly suppress server-side CFML inside HTML comments, JavaScript/CSS
text, or a query body. Client-side quotes and comments are not generally CFML
lexical delimiters. CFML quoted attributes/expressions and CFScript strings are
different contexts; this distinction requires engine-confirmed fixtures.
Tag islands inside CFScript are excluded initially and must yield incomplete.

Within supported CFScript, check balanced braces, parentheses, and brackets while
respecting strings, interpolation, line comments, and block comments. A balanced
script is only a delimiter result. Expressions, callable names, overloads, and
runtime semantics remain unverified even when the structural verdict passes.
Pure-script CFC entry mode must be recognized by the profile; unrecognized modes
are incomplete. Narrowing support is preferable to recovering unknown tokens into
an empty successful result.

## Processing and ownership

One owning repository contains a bounded source reader, lexical state machine,
tag catalog/stack checker, CFScript delimiter checker, and diagnostic renderer.
These are local responsibilities, not new services or shared ecosystem packages.

Evaluate existing Code Slice/formatter parsing as prior art before implementing.
Record license, public API availability, exact-source preservation, error recovery,
and unsupported-syntax behavior. Do not import Code Slice internals, copy its
implementation into the Hub, or equate a returned slice with validated syntax.
A dedicated lexer plus a stack is sufficient if it passes the lexical fixtures;
a tolerant parser is useful only when error/missing nodes cannot produce a false pass.

## Result and failure contract

Use the [Hub envelope](../JSON_STANDARD.md); `data` contains:

| Field | Meaning |
| --- | --- |
| `profile` | Exact structural profile ID/revision |
| `source` | Root-relative path, SHA-256 of inspected bytes, byte size, and encoding |
| `verdict` | `pass` or `violations`; only present for a completed supported check |
| `checks` | Explicit checked dimensions, e.g. tag nesting and script delimiters |
| `exclusions` | Declared unverified dimensions, including expression/runtime behavior |
| `findings` | Ordered structural diagnostics with `code`, `message`, `location`, and nullable `related_open` |

Locations contain one-based line/column and zero-based UTF-8 byte ranges
`[start_byte, end_byte)`. Columns count Unicode scalar values, not visual tab
width or UTF-16 units. `related_open` identifies the conflicting opener, or is
null for an orphan close; never invent a matching opener. Sort by byte start,
then code. Diagnostic text avoids full source lines and attribute values by default.

| Condition | Envelope / exit | Detail |
| --- | --- | --- |
| All supported structures valid | `ok`, complete, exit 0 | `verdict: pass` within declared checks |
| Known unmatched, misnested, or invalid branch structure | `ok`, complete, exit 0 | `verdict: violations`; consumers must inspect it |
| Unsupported syntax/profile coverage or exhausted budget | `incomplete`, exit 3 | `data: null`, stable error code and bounded safe location in message |
| Invalid invocation, encoding, or requested limits | `error`, exit 2 | Input error, not a source finding |
| Root or access-policy rejection | `error`, exit 4 | No out-of-root reads |
| I/O or internal checker failure | `error`, exit 1 | No success fallback |

Proposed finding codes: `UNEXPECTED_CLOSE`, `MISMATCHED_CLOSE`, `UNCLOSED_TAG`,
`INVALID_BRANCH`, `UNTERMINATED_STRING`, `UNTERMINATED_COMMENT`, and
`UNBALANCED_DELIMITER`. Proposed incomplete codes: `UNSUPPORTED_SYNTAX`,
`PARSER_RECOVERY_UNSAFE`, and `LIMIT_EXCEEDED`. A known broken structure can be
reported when the checker safely establishes the remaining structure; ambiguity
or unsafe recovery instead makes the entire result incomplete, with no partial data.

## Proposed resource budgets

| Resource | Default | Hard cap |
| --- | --- | --- |
| Files per check | 1 | 1 |
| Source bytes | 2 MiB | 16 MiB |
| Lexical/tag/delimiter nesting | 256 | 1,024 |
| Findings | 100 | 1,000 |
| Output bytes including envelope | 64 KiB | 1 MiB |
| Processing time | 5 seconds | 30 seconds |

Limits are configurable only inside hard caps. Reaching a findings/output cap
must return incomplete instead of dropping diagnostics. Reserve a bounded failure
envelope. Implementation must enforce deadlines during lexing, not merely check
elapsed time after parsing. These numbers require measurement before release.

## Acceptance cases

| ID | Fixture | Required result |
| --- | --- | --- |
| CF-01 | Supported `cfif` followed by two closing tags | Extra close reported at the second close, no fabricated opener |
| CF-02 | `cfif`, `cfloop`, `</cfif>`, `</cfloop>` | Misnesting despite equal counts; point to open loop |
| CF-03 | Nested CFML comment containing fake opening/closing tags | Comment contents ignored; actual outer structure checked |
| CF-04 | CF quoted value and CFScript string containing tag-like text, doubled quotes, and interpolation | Correct lexical boundaries and locations |
| CF-05 | `cfelse` outside `cfif`, duplicate else, elseif after else | `INVALID_BRANCH` with responsible location |
| CF-06 | Supported bodyless tags and mixed-case paired tags | No false unmatched-tag finding |
| CF-07 | CFML embedded in HTML comment, JavaScript text, and query body | Do not hide executable CFML using client-language rules |
| CF-08 | Missing quote/comment terminator; script delimiters inside comments | Correct lexical finding or explicit incomplete, never a false pass |
| CF-09 | Unknown/custom/optional-body tag or CFScript tag island | Exit 3 with `data: null` |
| CF-10 | Non-ASCII prefix, tabs, BOM, LF and CRLF variants | Exact byte slices and defined line/column positions |
| CF-11 | Oversize file, deep nesting, findings overflow, expired deadline | Bounded incomplete envelope and no partial success |
| CF-12 | Path traversal, symlink escape, source mutation during read | Reject escape; detect changed snapshot or identify only bytes actually read |
| CF-13 | Identical bytes/profile/limits repeated; clean-tree check | Equivalent results and no writes |
| CF-14 | Sanitized production-like report and reference engine compile fixtures | Record false positives/negatives and engine version; structural pass never substitutes for engine validation |

Before Experimental admission, CF-01 through CF-13 must be executable in the
independent repository. CF-14 requires an authorized isolated engine fixture run
before engine-specific coverage is claimed. Never compile or execute production
templates merely to validate this documentation. Report actual denominators and
false-positive/false-negative counts; no unmeasured percentage or speed claim.

## Handoff sequence and references

First validate lexical feasibility on CF-01 through CF-09. Then implement source
coordinates, limits, stable outputs, and platform fixtures. Add syntax only when
its semantics, failure path, and fixtures are defined. Node.js is an implementation
candidate; runtime support versions and parser dependencies remain an owner decision.

Reference material reviewed on 2026-09-07: Lucee's
[cfif contract](https://docs.lucee.org/reference/tags/if.html) defines paired body
behavior; [tag islands](https://docs.lucee.org/recipes/tag-islands.html) demonstrate
a syntax boundary that V1 must reject explicitly. Adobe's
[CFML comments reference](https://helpx.adobe.com/coldfusion/developing-applications/the-cfml-programming-language/elements-of-cfml/comments.html)
documents nested comments and comments inside expressions. References guide
fixture design; cross-engine behavior remains to be tested.
