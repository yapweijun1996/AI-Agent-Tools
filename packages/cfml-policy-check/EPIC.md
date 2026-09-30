# Delivery Epic

Status: `In progress`
Lifecycle: `Pre-prototype`
Last reconciled: 2026-09-16

## Outcome

Deliver an independently supportable, read-only CFML/HTML project-policy
checker that AI agents and AIT adapters can invoke without executing
application code.

The first local vertical slice now exists and is tested. It is not a public
package, registry registration, deployment, or release.

## Work packages

| ID | Work package | Depends on | Planned | Implemented | Verified | Released |
| --- | --- | --- | --- | --- | --- | --- |
| E-01 | Documentation and contract baseline | None | Yes | Yes | Yes | No |
| E-02 | Repository and package skeleton | E-01 | Yes | Yes | Yes locally | No |
| E-03 | Secure bounded source reader | E-02 | Yes | Yes | Yes locally | No |
| E-04 | CFML-aware mixed-markup model | E-03 | Yes | Yes | Yes locally | No |
| E-05 | Declarative policy engine | E-04 | Yes | Yes | Yes locally | No |
| E-06 | Project profile and sanitized fixtures | E-05 | Yes | Yes | Yes locally | No |
| E-07 | CLI, JSON, security, and platform evidence | E-05 | Yes | Partial | No | No |
| E-08 | Release and Hub/AIT admission | E-06, E-07 | Yes | No | No | No |

E-02 through E-06 are locally implemented and covered by the current test
suite. E-07 is not verified as a complete matrix because only the
current Windows environment has been exercised and no external AIT registration
exists.

## User and product boundaries

The user is an AI coding agent or developer reviewing one selected template.
The product boundary ends at a bounded static result. AIT/Hub may consume a
future released tool, but the current local manifest is only a contract
description. The external `agent-cfml-check` boundary remains a proposed
separation of concerns and was not reimplemented here.

## Definition of done

The epic is complete only when:

- package/runtime/CLI ownership, maintainer, and license are explicit;
- source, tests, fixtures, build, and CI are inspectable;
- one-file policy analysis is secure, deterministic, read-only, and fail-closed;
- the JSON/exit/capabilities contract is executable and tested;
- representative project rules and sanitized fixtures are reviewed;
- package/artifact/platform/release evidence exists;
- AIT/Hub admission is proven or explicitly declined;
- limitations do not claim runtime or business correctness.

## Handoff rules

- Implementation, tests, fixtures, CI, package metadata, and releases stay in
  this repository.
- Registry and ecosystem documentation belongs to the Hub/consumer boundary,
  not the local parser or rule engine.
- No work package authorizes pushing, publishing, deployment, or modifying a
  different repository.
