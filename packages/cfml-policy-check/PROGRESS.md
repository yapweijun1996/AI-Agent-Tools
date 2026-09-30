# Progress

Status date: 2026-09-16
Lifecycle: `Pre-prototype`
Product state: `In progress`

## Situation brief

The repository now contains a small executable Node.js implementation for local
CFML/HTML policy checks, a local AIT JSON stdin contract, and an owner-approved
Globe3 legacy PrintForm profile with representative sanitized fixtures. The
generic and Globe3 fixture slices are locally verified. It is not a public npm
release, AIT registry registration, deployment, or Hub admission.

This progress record covers the implementation cycle following the previous
clean documentation commit `d107b6a`. The final commit identity and working
tree state are verified by Git rather than duplicated as a mutable claim here.

## Independent lifecycle state

| Scope | Planned | Implemented | Verified | Released |
| --- | --- | --- | --- | --- |
| Documentation baseline (E-01) | Yes | Yes | Yes | No |
| Local checker vertical slice (E-02--E-05) | Yes | Yes | Yes locally | No |
| CLI/AIT local contract (E-07 partial) | Yes | Yes | Partial | No |
| Project-specific profile/fixtures (E-06) | Yes | Yes | Yes locally | No |
| AIT/Hub admission (E-08) | Yes | No | No | No |

## Progress basis

Eight work packages are defined. E-01 through E-06 have local implementation
and verification evidence, so verified delivery-plan progress is
`6/8 = 75.0%`. E-07 has static package/security evidence but is not a complete
verification matrix. Executable implementation is present, but released product
progress remains `0%`.

## Work-package state

| ID | Work package | Planned | Implemented | Verified | Released | Evidence / gap |
| --- | --- | --- | --- | --- | --- | --- |
| E-01 | Documentation and contract baseline | Yes | Yes | Yes | No | Core SSOT and affected docs synchronized |
| E-02 | Repository and package skeleton | Yes | Yes | Yes locally | No | Node/npm package, lockfile, CLI, and private identity exist |
| E-03 | Secure bounded source reader | Yes | Yes | Yes locally | No | Root/file, UTF-8, limits, path containment, and no-write tests |
| E-04 | CFML-aware mixed-markup model | Yes | Yes | Yes locally | No | Tags, comments, locations, cfoutput, and uncertainty tests |
| E-05 | Declarative policy engine | Yes | Yes | Yes locally | No | Profile-driven table rules and stable findings |
| E-06 | Project profile and sanitized fixtures | Yes | Yes | Yes locally | No | Owner-approved Globe3 profile, four sanitized fixtures, and four passing tests |
| E-07 | CLI, JSON, security, and platform evidence | Yes | Partial | Partial | No | Fifteen local tests plus package hygiene/packlist/SBOM/Secretlint; platform and consumer matrix pending |
| E-08 | Release and Hub/AIT admission | Yes | No | No | No | No registration, release, deployment, or public artifact |

## Verification matrix

| Check | State | Evidence and limitation |
| --- | --- | --- |
| Runtime/package smoke | Pass | Node v25.2.1 and npm 11.6.2; npm lockfile generated without dependencies |
| Unit tests | Pass | Current-cycle `npm test`: 15/15 passed on Windows Node v25.2.1 |
| CLI capabilities/version/help | Pass | Each emitted one JSON document and exit 0 |
| CLI violation smoke | Pass | Missing colgroup returned a stable finding and exit 0 |
| AIT stdin capabilities/check smoke | Pass | `ait` mode returned the same envelope shape for both operations, including the approved Globe3 profile |
| Dynamic CFML fail-closed | Pass | `cfloop` fixture returned `incomplete`, exit 3, no data |
| Profile/path/no-write tests | Pass locally | Malformed profile, root escape, repeated output, source immutability, and approved profile coverage |
| Schema JSON parse | Pass | Profile, result, manifest, and approved Globe3 profile are structurally checked; stronger validator still pending |
| Package hygiene | Pass | npm 11.6.2: no dependencies, no Git dependencies, no duplicates, empty CycloneDX component list |
| Package artifact inspection | Pass (dry-run) | `npm pack --dry-run --ignore-scripts`: 8 files including the approved Globe3 profile; no artifact was published |
| Secret scan | Pass | Secretlint 13.0.5 with masked formatter over docs, JSON, source, tests, fixtures, and `.gitattributes`; no findings |
| Cross-platform/security matrix | Partial | Current Windows tests pass; symlink/encoding/resource and macOS/Linux matrix remain |
| Browser/mobile/PWA | Not applicable | No user-facing web product evidenced |
| Independent CFML checker smoke | Unavailable | Installed `agent-cfml-check` 0.1.1 exited 0 but emitted no stdout; no result was used as proof |
| AIT registry registration | Not run | Manifest explicitly says `local-contract-only`; no registry write performed |
| External KB-MCP reference | Pass with limit | Trusted `agent_cfml_check` metadata/harness test passed; Globe3 context informed the approved scope, and project evidence is mirrored at item `3e631a61-d63d-4c25-aaac-cd1557b063f2:3f3cdb8a-5751-478c-9f4b-24ec092235b6`; neither is proof of runtime behavior |

## Blockers and risks

- Maintainer, distributable license, supported Node platform matrix, and exact
  AIT registration path remain unresolved.
- Dynamic CFML and generated markup can make a static policy conclusion unknown.
- Local tests do not prove packaged, deployed, or registered behavior.
- Symlink, unusual-encoding, oversized/deep-input, cross-platform, and consumer
  checks remain for T-009.
- The current parser is intentionally conservative and not a full CFML parser.

## Resume point

Resume at the remaining `T-009` matrix in [TASK.md](TASK.md): execute bounded
symlink, encoding, resource, cross-platform, and consumer/import checks.
