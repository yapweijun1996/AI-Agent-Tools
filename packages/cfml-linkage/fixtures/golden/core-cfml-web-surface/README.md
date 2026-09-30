# Golden case: core CFML/web surface

> **Status: VERIFIED / T-021 BOUNDED INPUT.** This inert directory exercises the bounded CFML Fact extractor; no source is executed.

Coverage: `cfinclude`, `cfimport`, `cfinvoke`, `cfobject`, `cfmodule`, `cfif`, and `cfset` structural facts.

Expected artifact: `fixtures/golden/expected-facts-v0.1.json`. Graph IR and cross-file resolution remain unimplemented.
