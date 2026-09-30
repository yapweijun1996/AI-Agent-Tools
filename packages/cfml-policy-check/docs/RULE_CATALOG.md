# Rule Catalog

Status: `Two V1 rules implemented locally`
Last reconciled: 2026-09-16

A rule is released only when source, fixtures, package evidence, and the release
gates prove it. The current rules are locally implemented and tested, not
released.

## Implemented rules

| Rule ID | Severity | Semantics | Local evidence |
| --- | --- | --- | --- |
| `html.table.requires-colgroup` | Configured | Each statically understood `<table>` has a direct `<colgroup>` child | Pass and missing-group fixtures; stable finding test |
| `html.table.requires-col` | Configured | Each applicable `<colgroup>` has at least one direct `<col>` child | Empty-group fixture; stable finding test |

## Semantics

- A nested table is a separate target.
- A `<col>` elsewhere in the table does not satisfy the `colgroup` rule.
- An empty `<colgroup>` fails the `requires-col` rule.
- Comments do not create elements.
- Tag matching is case-insensitive while source locations remain original.
- The rules do not infer column counts from `colspan`, CSS, or runtime data.
- Dynamic or malformed structure affecting a table returns `incomplete` before
  findings are presented.

## Planned rules

These remain outside the implemented slice:

- `html.element.requires-child`;
- `html.element.requires-attribute`;
- `cfml.query.requires-queryparam`;
- required/forbidden CFML attributes;
- include allowlists;
- output-escaping conventions;
- project-specific naming or scope rules.

The missing terminating `#` expression remains the separate
`agent-cfml-check` scope.

## Globe3 applicability

The Globe3 approved profile applies the two implemented table rules to a
sanitized legacy PrintForm-shaped fixture. KB-MCP evidence confirms that
table-based HTML and predictable nested table structure are compatibility
constraints for that family. The owner decision on 2026-09-16 additionally
requires direct `<colgroup>` and direct `<col>` elements for this bounded
static policy scope. Local fixtures verify the decision; runtime compatibility
is outside this tool.
