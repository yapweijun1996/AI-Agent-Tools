# Goal: Verified Agent CFML Check

## Outcome

Deliver a trustworthy `agent-cfml-check` tool that deterministically checks bounded CFML structure without executing source or claiming runtime compatibility that has not been tested.

The immediate target is a verified `0.1.1` feasibility product and a clearly bounded release path. The CLI artifact is published and registry-verified; grammar expansion and semantic/runtime analysis are separate future scopes.

## Verification surface

Completion is evaluated against:

- repository source, generated `dist/`, package metadata, and JSON Schema;
- unit and CLI regression tests;
- typecheck, clean packed-install smoke, and executable schema validation;
- authorized Lucee and Adobe ColdFusion compatibility evidence;
- independent platform evidence;
- canonical Hub/repository ownership, admission, provenance, and publication evidence; publication is satisfied for the current CLI artifact by npm registry readback.

## Constraints

- Read exactly one explicitly selected `.cfm` or `.cfc` file under an explicit root.
- Never execute CFML, follow includes, access network/database, or modify inspected source.
- Fail closed for unsupported syntax, unstable input, and exhausted limits.
- Preserve stable envelope, finding, coordinate, and exit-code semantics.
- Keep source code as behavior authority and do not convert plans or KB notes into facts.

## Boundaries

The current profile excludes full CFML grammar, expression/type/runtime semantics, HTML/SQL validity, directory/project analysis, include expansion, engine compatibility, and custom/imported tags. Repository package exports, executable schema validation, and temporary packed-install CLI/library imports are verified; registry parity for the current release is verified.

## Iteration policy

Choose the smallest next task that closes a documented evidence gap. After each change, update the owning document, run focused checks, then run regression and packaging checks. Do not expand parser scope while release gates remain unresolved.

## Blocked stop condition

Stop and report evidence gathered, attempted paths, blocker, and required input when compatibility engines, independent platform access, canonical ownership, release authorization, or required validation tooling is unavailable. Do not guess or publish around a missing gate.

## Current stage

The local feasibility implementation, contract hardening, CLI publication, and registry verification are complete. Full external compatibility and canonical evidence remain pending.
