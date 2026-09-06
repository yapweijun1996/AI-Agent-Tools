#!/usr/bin/env python3
"""Validate the Hub's registry and controlled Markdown without dependencies."""

import datetime
import json
from pathlib import Path
import re
import sys
from urllib.parse import unquote, urlsplit


ROOT = Path(__file__).resolve().parents[1]
STATUSES = {"Planned", "Experimental", "Verified", "Stable", "Deprecated"}
SEMVER = re.compile(
    r"^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)"
    r"(?:-((?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)"
    r"(?:\.(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*))*))?"
    r"(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$"
)
REQUIRED_DOCS = [
    "README.md", "AGENTS.md", "ROADMAP.md", "DESIGN.md", "SPEC.md", "EPIC.md",
    "TASK.md", "DOCUMENTATION_INDEX.md", "VALIDATION.md", "docs/PRODUCT_VISION.md",
    "docs/ARCHITECTURE.md", "docs/TOOL_STANDARD.md", "docs/CLI_STANDARD.md",
    "docs/JSON_STANDARD.md", "docs/SECURITY_STANDARD.md",
    "docs/RELEASE_STANDARD.md", "docs/ADDING_A_TOOL.md",
]


def require(condition, message):
    if not condition:
        raise ValueError(message)


def nonempty(value):
    return isinstance(value, str) and bool(value.strip())


def version(value):
    return isinstance(value, str) and SEMVER.fullmatch(value) is not None


def https_url(value):
    if not isinstance(value, str) or any(c.isspace() for c in value):
        return False
    parsed = urlsplit(value)
    return (parsed.scheme == "https" and bool(parsed.hostname)
            and not parsed.username and not parsed.password)


def exact_keys(value, keys, label):
    require(isinstance(value, dict) and set(value) == set(keys),
            f"{label}: expected fields {sorted(keys)}")


def unique_object(pairs):
    result = {}
    for key, value in pairs:
        require(key not in result, f"Duplicate JSON key: {key}")
        result[key] = value
    return result


def reject_constant(value):
    raise ValueError(f"Non-JSON numeric constant: {value}")


def parse_json(text):
    return json.loads(text, object_pairs_hook=unique_object,
                      parse_constant=reject_constant)


def validate_registry(registry):
    exact_keys(registry, ["schema_version", "standards_version", "tools"], "registry")
    require(registry["schema_version"] == "1.0.0", "Unsupported registry schema")
    require(registry["standards_version"] == "1.0.0", "Review standards version change")
    require(isinstance(registry["tools"], list) and registry["tools"], "Empty tools")
    ids = set()
    names = set()
    external_urls = set()
    for tool in registry["tools"]:
        exact_keys(tool, ["id", "name", "description", "status", "repository_url",
                          "npm", "release_version", "verification", "deprecation"], "tool")
        tool_id = tool["id"]
        require(isinstance(tool_id, str)
                and re.fullmatch(r"[a-z][a-z0-9]*(?:-[a-z0-9]+)*", tool_id), "Invalid ID")
        require(tool_id not in ids, f"Duplicate ID: {tool_id}")
        ids.add(tool_id)
        require(nonempty(tool["name"]) and tool["name"] not in names,
                f"{tool_id}: invalid or duplicate name")
        names.add(tool["name"])
        require(nonempty(tool["description"]), f"{tool_id}: missing description")
        status = tool["status"]
        require(isinstance(status, str) and status in STATUSES, f"{tool_id}: invalid status")
        repo, npm, release = tool["repository_url"], tool["npm"], tool["release_version"]
        require(repo is None or https_url(repo), f"{tool_id}: invalid repository URL")
        if repo:
            external_urls.add(repo)
        if npm is not None:
            exact_keys(npm, ["name", "url"], f"{tool_id}.npm")
            require(isinstance(npm["name"], str) and re.fullmatch(
                r"(?:@[a-z0-9][a-z0-9._-]*/)?[a-z0-9][a-z0-9._-]*", npm["name"]),
                f"{tool_id}: invalid npm identity")
            require(npm["url"] == "https://www.npmjs.com/package/" + npm["name"],
                    f"{tool_id}: npm URL/name mismatch")
            external_urls.add(npm["url"])
        require(release is None or version(release), f"{tool_id}: invalid release version")
        require(release is None or (npm is not None and repo is not None),
                f"{tool_id}: release needs repository and npm identity")
        if status in {"Experimental", "Verified", "Stable"}:
            require(repo is not None, f"{tool_id}: status requires repository")
        verification = tool["verification"]
        if status in {"Verified", "Stable"}:
            require(release is not None and verification is not None,
                    f"{tool_id}: status requires release and evidence")
        if status in {"Planned", "Experimental"}:
            require(verification is None, f"{tool_id}: evidence requires verified lifecycle")
        if verification is not None:
            exact_keys(verification, ["version", "standards_version", "verified_on",
                                      "evidence_urls", "platforms", "limitations"],
                       f"{tool_id}.verification")
            require(release is not None and verification["version"] == release,
                    f"{tool_id}: evidence/release mismatch")
            require(version(verification["standards_version"]), "Invalid evidence standard version")
            date = verification["verified_on"]
            require(isinstance(date, str) and re.fullmatch(r"\d{4}-\d{2}-\d{2}", date),
                    f"{tool_id}: invalid verification date")
            parsed_date = datetime.date.fromisoformat(date)
            require(parsed_date <= datetime.datetime.now(datetime.timezone.utc).date(),
                    f"{tool_id}: future verification date")
            urls = verification["evidence_urls"]
            require(isinstance(urls, list) and urls and all(https_url(u) for u in urls),
                    f"{tool_id}: missing/invalid evidence URLs")
            external_urls.update(urls)
            platforms = verification["platforms"]
            require(isinstance(platforms, list) and platforms
                    and all(p in ("windows", "macos", "linux") for p in platforms)
                    and len(set(platforms)) == len(platforms), f"{tool_id}: invalid platforms")
            limits = verification["limitations"]
            require(isinstance(limits, list) and all(nonempty(x) for x in limits),
                    f"{tool_id}: invalid limitations")
        if status == "Stable":
            match = SEMVER.fullmatch(release)
            require(int(match.group(1)) >= 1 and match.group(4) is None,
                    f"{tool_id}: Stable requires non-prerelease >= 1.0.0")
            require(set(verification["platforms"]) == {"windows", "macos", "linux"},
                    f"{tool_id}: Stable requires all OS families")
        deprecation = tool["deprecation"]
        if status == "Deprecated":
            exact_keys(deprecation, ["reason", "replacement_id"], f"{tool_id}.deprecation")
            require(nonempty(deprecation["reason"]), f"{tool_id}: missing retirement reason")
        else:
            require(deprecation is None, f"{tool_id}: unexpected deprecation notice")
    for tool in registry["tools"]:
        if tool["deprecation"]:
            replacement = tool["deprecation"]["replacement_id"]
            require(replacement is None or (isinstance(replacement, str)
                    and replacement in ids and replacement != tool["id"]),
                    f"{tool['id']}: invalid replacement ID")
    return external_urls


def without_fences(text):
    return re.sub(r"^```[^\n]*\n.*?^```\s*$", "", text, flags=re.M | re.S)


def anchors(text):
    found = set()
    counts = {}
    for heading in re.findall(r"^#{1,6}\s+(.+?)\s*#*\s*$", without_fences(text), re.M):
        slug = re.sub(r"[^\w\- ]", "", heading.lower()).replace(" ", "-")
        count = counts.get(slug, 0)
        counts[slug] = count + 1
        found.add(slug if count == 0 else f"{slug}-{count}")
    return found


def validate_docs(registry):
    for path in REQUIRED_DOCS:
        require((ROOT / path).is_file(), f"Missing document: {path}")
    # Controlled Hub docs use inline Markdown links and ATX headings, not raw HTML.
    documents = [ROOT / p for p in REQUIRED_DOCS]
    documents.extend(p for p in (ROOT / "docs").rglob("*.md") if p not in documents)
    external_urls = set()
    link_count = 0
    for document in documents:
        content = document.read_text(encoding="utf-8")
        for example in re.findall(r"^```json\n(.*?)^```", content, re.M | re.S):
            parse_json(example)
        for destination in re.findall(r"\[[^\]\n]*\]\(([^)\n]+)\)", without_fences(content)):
            link_count += 1
            destination = destination.strip("<>")
            parsed = urlsplit(destination)
            if parsed.scheme or parsed.netloc:
                require(https_url(destination), f"{document.name}: invalid external link")
                external_urls.add(destination)
                continue
            target = (document.parent / unquote(parsed.path)).resolve() if parsed.path else document
            require(target.is_relative_to(ROOT), f"{document.name}: link escapes repository")
            require(target.exists(), f"{document.name}: broken link {destination}")
            if parsed.fragment:
                require(target.suffix == ".md", "Anchors supported only for Markdown")
                require(unquote(parsed.fragment) in anchors(target.read_text(encoding="utf-8")),
                        f"{document.name}: broken anchor {destination}")
    roadmap = (ROOT / "ROADMAP.md").read_text(encoding="utf-8")
    rows = re.findall(r"^\| (\d+) \| `([^`]+)` \| ([^|]+) \|", roadmap, re.M)
    expected = [(str(i), tool["id"], tool["name"]) for i, tool in enumerate(registry["tools"], 1)]
    require([(i, tool_id, name.strip()) for i, tool_id, name in rows] == expected,
            "Roadmap order/IDs/names differ from registry")
    lifecycle = (ROOT / "docs/TOOL_STANDARD.md").read_text(encoding="utf-8")
    require(set(re.findall(r"^\| `([^`]+)` \|", lifecycle, re.M)) == STATUSES,
            "Documented lifecycle differs from registry validator")
    return len(documents), link_count, external_urls


def main():
    try:
        registry = parse_json((ROOT / "TOOL_REGISTRY.json").read_text(encoding="utf-8"))
        urls = validate_registry(registry)
        count, links, doc_urls = validate_docs(registry)
        urls.update(doc_urls)
    except (ValueError, OSError, TypeError, KeyError) as error:
        print(f"FAIL: {error}", file=sys.stderr)
        return 1
    print(f"PASS: {len(registry['tools'])} tools, {count} documents, {links} links; "
          "registry gates, roadmap, lifecycle, local anchors, and JSON syntax valid.")
    print(f"External URLs requiring human evidence review: {len(urls)}")
    for url in sorted(urls):
        print(f"  {url}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
