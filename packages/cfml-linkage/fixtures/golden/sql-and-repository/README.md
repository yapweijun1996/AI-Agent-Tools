# SQL and repository linkage fixture

> **Status: VERIFIED / T-034 BOUNDED SUBSET.** These inert CFC/page inputs exercise visible SQL, datasource, and structurally evidenced repository/action relationships. They are never executed.

| Field | Value |
| --- | --- |
| Version | 0.1 |
| Scope | `cfquery`, `queryExecute`, datasource metadata, and CFC method-to-repository action linkage |
| Evidence | `test/repository-resolver.test.js`, Fact/Graph schema validation, and deterministic repeat analysis |
| Limitations | Only a CFC method containing a statically visible query is classified as a repository action; filenames, naming conventions, runtime dispatch, SQL semantics, and dynamic queries are not authoritative |

The caller uses an explicit `cfinvoke` target. The repository action is recognized from the method's query evidence, not from the `Repository` filename or class name.
