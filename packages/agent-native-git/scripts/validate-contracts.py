#!/usr/bin/env python3
"""Offline Stage 0 contract harness; never executes angit, Git or providers."""
from __future__ import annotations

import json
from pathlib import Path
import re
import sqlite3
import sys
import tempfile
from urllib.parse import urldefrag

from jsonschema import Draft202012Validator
from referencing import Registry, Resource
from referencing.exceptions import NoSuchResource

ROOT = Path(__file__).resolve().parents[1]


def unique_object(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError(f"duplicate JSON key: {key}")
        result[key] = value
    return result


def load(path):
    return json.loads(path.read_text(encoding="utf-8"), object_pairs_hook=unique_object)


def no_network(uri):
    raise NoSuchResource(ref=uri)


def walk(value):
    yield value
    if isinstance(value, dict):
        for child in value.values():
            yield from walk(child)
    elif isinstance(value, list):
        for child in value:
            yield from walk(child)


def schema_checks():
    resources = {}
    for path in sorted((ROOT / "schemas").rglob("*.schema.json")):
        schema = load(path)
        Draft202012Validator.check_schema(schema)
        identifier = schema["$id"]
        if identifier in resources:
            raise ValueError(f"duplicate schema ID: {identifier}")
        resources[identifier] = (path, schema)
    registry = Registry(retrieve=no_network).with_resources(
        (identifier, Resource.from_contents(schema))
        for identifier, (_, schema) in resources.items()
    )
    for identifier, (_, schema) in resources.items():
        resolver = registry.resolver(identifier)
        for node in walk(schema):
            if isinstance(node, dict) and "$ref" in node:
                resolver.lookup(node["$ref"])
    count = 0
    fixtures = [
        fixture
        for name in ("schema-fixtures.json", "schema-review-fixtures.json")
        for fixture in load(ROOT / "tests" / name)["fixtures"]
    ]
    for fixture in fixtures:
        path = ROOT / fixture["path"]
        schema = load(ROOT / fixture["schema"])
        if "schemaFragment" in fixture:
            schema = registry.resolver(schema["$id"]).lookup(
                "#" + fixture["schemaFragment"]
            ).contents
        errors = list(Draft202012Validator(schema, registry=registry).iter_errors(load(path)))
        valid = not errors
        if valid != fixture["valid"]:
            detail = errors[0].message if errors else "invalid fixture was accepted"
            raise ValueError(f"{fixture['label']}: {detail}")
        count += 1
    return len(resources), count


def catalog_checks():
    catalog = load(ROOT / "contracts/commands.json")
    expected = [
        "init", "doctor", "status", "task add", "task list", "task show",
        "task message", "task cancel", "agent start", "agent stop", "run",
        "worker start", "worker stop", "worktree list", "integrate plan",
        "integrate apply", "snapshot list", "snapshot restore",
    ]
    commands = catalog["commands"]
    if catalog["commandCount"] != 18 or [c["name"] for c in commands] != expected:
        raise ValueError("eighteen-command surface mismatch")
    if [c["number"] for c in commands] != list(range(1, 19)):
        raise ValueError("command numbering mismatch")
    for command in commands:
        reference, anchor = urldefrag(command["reference"])
        if not (ROOT / reference).is_file():
            raise ValueError(f"missing command reference: {reference}")
        if f"## {anchor}" not in (ROOT / reference).read_text(encoding="utf-8"):
            raise ValueError(f"missing command anchor: {anchor}")
        request = load(ROOT / command["requestSchema"])
        # Catalog options and leaf request shapes must use the same definitions.
        props = request["properties"]["options"]["properties"]
        for name, definition in command["options"].items():
            if props.get(name) != definition:
                raise ValueError(f"catalog/request option disagreement: {command['name']} {name}")
    return len(commands)


def acceptance_checks():
    spec = load(ROOT / "tests/test-cases.json")
    mapping = load(ROOT / "tests/acceptance-map.json")
    original_ids = [
        *[f"CLI-{n:02}" for n in range(1, 7)],
        *[f"CON-{n:02}" for n in range(1, 7)],
        *[f"DB-{n:02}" for n in range(1, 5)],
        *[f"GIT-{n:02}" for n in range(1, 6)],
        *[f"INT-{n:02}" for n in range(1, 8)],
        *[f"EV-{n:02}" for n in range(1, 6)],
        *[f"SEC-{n:02}" for n in range(1, 9)],
        *[f"RB-{n:02}" for n in range(1, 5)],
        *[f"REC-{n:02}" for n in range(1, 10)],
        *[f"BK-{n:02}" for n in range(1, 4)],
        *[f"ADP-{n:02}" for n in range(1, 4)],
        *[f"PKG-{n:02}" for n in range(1, 4)],
        "DOC-01",
    ]
    # Preserve identities by the reviewed adoption map, not by silently pruning tests.
    cases = spec["tests"]
    case_ids = [c["id"] for c in cases]
    mapped_ids = [c["id"] for c in mapping["baseline"]]
    if case_ids != original_ids or case_ids != mapped_ids:
        raise ValueError("baseline 64-scenario mapping mismatch")
    for case, mapped in zip(cases, mapping["baseline"]):
        if case["invariants"] != mapped["invariants"]:
            raise ValueError(f"lost invariant: {case['id']}")
        if case["status"] != "not_run_product_test":
            raise ValueError("offline contract harness cannot claim product execution")
    additions = mapping["additions"]
    if [a["id"] for a in additions] != [f"CR-T{n:02}" for n in range(1, 19)]:
        raise ValueError("CR addition mapping mismatch")
    if any(a["status"] != "not_run_product_test" for a in additions):
        raise ValueError("CR requirements are not executed product tests")
    sql_ids = {c["id"] for c in sql_fixture_cases()}
    for addition in additions:
        if not set(addition["baselineScenarioIds"]).issubset(original_ids):
            raise ValueError(f"unknown baseline association: {addition['id']}")
        if not set(addition["offlineSqlFixtureIds"]).issubset(sql_ids):
            raise ValueError(f"unknown SQL fixture association: {addition['id']}")
        if not addition["runtimeGate"]:
            raise ValueError(f"missing runtime evidence boundary: {addition['id']}")
    if spec["productTestsExecuted"] or mapping["productTestsExecuted"]:
        raise ValueError("unsupported product execution claim")
    faults = (ROOT / "tests/FAULT_INJECTION.md").read_text(encoding="utf-8")
    for number in range(1, 17):
        if f"FI-{number:02}" not in faults:
            raise ValueError(f"missing FI-{number:02}")
    return len(cases), len(additions)


def source_checks():
    identity = load(ROOT / "contracts/identity.json")
    if not identity["private"] or identity["publicationAuthorized"]:
        raise ValueError("private/no-publication identity mismatch")
    if identity["productVersion"] is not None or identity["repositoryRemote"] is not None:
        raise ValueError("Stage 0 must not fabricate release identity")
    for directory in ["docs", "contracts", "schemas", "tests", "examples"]:
        for path in sorted((ROOT / directory).rglob("*.json")):
            load(path)
    # These are owned specification links only, not parent-generated evidence pages.
    for path in sorted((ROOT / "docs").glob("*.md")):
        if path.name == "STAGE0_PREFLIGHT.md":
            continue
        text = path.read_text(encoding="utf-8")
        for link in re.findall(r"\[[^\]]+\]\(([^)]+)\)", text):
            file_part, _ = urldefrag(link)
            if not file_part or "://" in file_part:
                continue
            if not (path.parent / file_part).exists():
                raise ValueError(f"broken local link {path.relative_to(ROOT)}: {link}")
    return True


def sql_state(connection):
    """Capture all logical rows, including retained AUTOINCREMENT state."""
    names = [row[0] for row in connection.execute(
        "SELECT name FROM sqlite_schema WHERE type='table' ORDER BY name"
    )]
    return {
        name: connection.execute(
            'SELECT * FROM "' + name.replace('"', '""') + '" ORDER BY rowid'
        ).fetchall()
        for name in names
    }


def sql_statement(connection, item, case_id):
    expected_code = item.get("expectError")
    rejection_required = item.get("expectRejected", False) or expected_code is not None
    before = sql_state(connection) if rejection_required else None
    connection.execute("SAVEPOINT fixture_step")
    try:
        cursor = connection.execute(item["sql"], item.get("params", []))
    except sqlite3.Error as error:
        unchanged = sql_state(connection) == before if rejection_required else False
        connection.execute("ROLLBACK TO fixture_step")
        connection.execute("RELEASE fixture_step")
        if not rejection_required or not isinstance(error, sqlite3.IntegrityError):
            raise ValueError(f"{case_id}: unexpected SQL rejection: {error}") from error
        if expected_code is not None and expected_code not in str(error):
            raise ValueError(f"{case_id}: required consumer error code missing: {error}") from error
        if not unchanged:
            raise ValueError(f"{case_id}: rejected statement changed stored rows")
        return 1
    if rejection_required:
        connection.execute("ROLLBACK TO fixture_step")
        connection.execute("RELEASE fixture_step")
        raise ValueError(f"{case_id}: SQL negative fixture was accepted")
    if "expectRows" in item:
        actual = [list(row) for row in cursor.fetchall()]
        if actual != item["expectRows"]:
            raise ValueError(f"{case_id}: expected rows {item['expectRows']}, got {actual}")
    connection.execute("RELEASE fixture_step")
    return 0


def sql_fixture_cases():
    return [
        case
        for name in ("sql-fixtures.json", "sql-review-fixtures.json")
        for case in load(ROOT / "tests" / name)["cases"]
    ]


def sql_checks():
    migration = (ROOT / "sql/001_initial.sql").read_text(encoding="utf-8")
    connection_sql = (ROOT / "sql/connection.sql").read_text(encoding="utf-8")
    cases = sql_fixture_cases()
    rejects = 0
    with tempfile.TemporaryDirectory(prefix="angit-contracts-") as temporary:
        for index, case in enumerate(cases):
            connection = sqlite3.connect(Path(temporary) / f"fixture-{index}.sqlite")
            try:
                connection.executescript(connection_sql)
                connection.executescript(migration)
                for item in case["setup"]:
                    if "expectError" in item or "expectRejected" in item or "expectRows" in item:
                        raise ValueError(f"{case['id']}: setup cannot conceal expected failure")
                    sql_statement(connection, item, case["id"] + " setup")
                for item in case["steps"]:
                    rejects += sql_statement(connection, item, case["id"])
                if connection.execute("PRAGMA foreign_key_check").fetchall():
                    raise ValueError(f"{case['id']}: foreign-key violation")
                if connection.execute("PRAGMA integrity_check").fetchall() != [("ok",)]:
                    raise ValueError(f"{case['id']}: integrity failure")
            finally:
                connection.close()
    return len(cases), rejects


def main():
    source_checks()
    schema_count, fixture_count = schema_checks()
    commands = catalog_checks()
    baseline, additions = acceptance_checks()
    sql_cases, sql_rejections = sql_checks()
    print(json.dumps({
        "status": "passed_offline_contract_checks",
        "schemas": schema_count,
        "schemaFixtures": fixture_count,
        "publicCommandContracts": commands,
        "baselineAcceptanceScenariosMapped": baseline,
        "contractAdditionsMapped": additions,
        "sqlFixtureCases": sql_cases,
        "sqlNegativeRejections": sql_rejections,
        "temporarySqlFixturesCleaned": True,
        "productTestsExecuted": False,
        "platformRuntimeProviderGates": "not_established_by_this_validator",
        "pythonSqliteVersion": sqlite3.sqlite_version,
    }, indent=2))


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(json.dumps({"status": "failed_offline_contract_checks", "error": str(error),
                          "productTestsExecuted": False}), file=sys.stderr)
        sys.exit(1)
