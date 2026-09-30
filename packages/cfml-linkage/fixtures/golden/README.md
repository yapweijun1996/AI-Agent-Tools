# Golden fixtures

> **Status: VERIFIED / BOUNDED FACT BASELINE.** These cases contain inert inputs for bounded CFML/web scanners and Fact extraction; no full parser or linkage output exists yet.

| Case | Coverage | Expected state |
| --- | --- | --- |
| `core-cfml-web-surface` | CFML include, mapping, invocation, instantiation, custom tag, condition, and scope-write facts | Bounded Fact output with complete scanner coverage for this subset |
| `cfc-inheritance-and-scope` | CFC component/method, instantiation, method call, ordered include scope flow, conditions | Complete with confirmed/strong edges and evidence |
| `web-surface` | HTML forms/assets, JavaScript fetch/AJAX, CSS references, visible SQL | Bounded Fact output with explicit partial coverage |
| `web-flow-and-conditions` | Conditional form, fetch, jQuery AJAX, XMLHttpRequest, and redirect flow with literal route targets | Bounded flow/condition Graph edges with explicit partial coverage |
| `sql-and-repository` | Literal `cfquery`/`queryExecute` tables/datasources and CFC method repository/action calls | Bounded SQL/repository Graph edges; filename-only names are not evidence |

The current inputs support bounded M2 structural Fact extraction, fixture-backed T-032 web-flow/condition verification, and T-034 SQL/repository linkage verification. Add checked-in golden Graph outputs only after the corresponding resolver and graph contracts are verified.
