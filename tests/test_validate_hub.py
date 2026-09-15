import importlib.util
from pathlib import Path
import unittest


ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "scripts" / "validate_hub.py"


spec = importlib.util.spec_from_file_location("validate_hub", SCRIPT)
validate_hub = importlib.util.module_from_spec(spec)
spec.loader.exec_module(validate_hub)


class ValidateHubTests(unittest.TestCase):
    def test_current_repository_passes_validator_components(self):
        registry = validate_hub.parse_json(
            (ROOT / "TOOL_REGISTRY.json").read_text(encoding="utf-8")
        )
        validate_hub.validate_registry(registry)
        validate_hub.validate_docs(registry)

    def test_rejects_malformed_roadmap_row(self):
        registry = {"tools": [{"id": "example-tool", "name": "Example Tool"}]}
        roadmap = "\n".join(
            [
                "| Order | Registry ID | Tool | Intended outcome |",
                "| --- | --- | --- | --- |",
                "| 1 | `example-tool` | Example Tool | Bounded output. |",
                "| malformed roadmap row |",
                "",
            ]
        )

        with self.assertRaises(ValueError):
            validate_hub.validate_roadmap(roadmap, registry)

    def test_rejects_malformed_roadmap_separator(self):
        registry = {"tools": [{"id": "example-tool", "name": "Example Tool"}]}
        roadmap = "\n".join(
            [
                "| Order | Registry ID | Tool | Intended outcome |",
                "| bad | separator | row | here |",
                "| 1 | `example-tool` | Example Tool | Bounded output. |",
                "",
            ]
        )

        with self.assertRaises(ValueError):
            validate_hub.validate_roadmap(roadmap, registry)

    def test_rejects_unquoted_roadmap_id(self):
        registry = {"tools": [{"id": "example-tool", "name": "Example Tool"}]}
        roadmap = "\n".join(
            [
                "| Order | Registry ID | Tool | Intended outcome |",
                "| --- | --- | --- | --- |",
                "| 1 | example-tool | Example Tool | Bounded output. |",
                "",
            ]
        )

        with self.assertRaises(ValueError):
            validate_hub.validate_roadmap(roadmap, registry)

    def test_rejects_missing_roadmap_row(self):
        registry = {"tools": [{"id": "example-tool", "name": "Example Tool"}]}
        roadmap = "\n".join(
            [
                "| Order | Registry ID | Tool | Intended outcome |",
                "| --- | --- | --- | --- |",
                "",
            ]
        )

        with self.assertRaises(ValueError):
            validate_hub.validate_roadmap(roadmap, registry)

    def test_rejects_duplicate_json_keys(self):
        with self.assertRaises(ValueError):
            validate_hub.parse_json('{"key": 1, "key": 2}')

    def test_rejects_non_json_numeric_constants(self):
        with self.assertRaises(ValueError):
            validate_hub.parse_json('{"value": NaN}')


if __name__ == "__main__":
    unittest.main()
