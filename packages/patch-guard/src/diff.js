// This parser observes the supplied artifact only. It never applies a patch or reads its paths.
export function patchError(code, status = "error") {
  const error = new Error(code);
  error.code = code;
  error.status = status;
  return error;
}

const invalid = () => { throw patchError("INVALID_INPUT"); };
const unsupported = () => { throw patchError("UNSUPPORTED_INPUT", "incomplete"); };
const incomplete = () => { throw patchError("INCOMPLETE_RESULT", "incomplete"); };
const resource = () => { throw patchError("RESOURCE_LIMIT", "incomplete"); };
const modes = new Set(["100644", "100755", "120000"]);

// CRLF framing is accepted for metadata only; hunk source text stays byte-faithful.
const metadataLine = (line) => line?.endsWith("\r") ? line.slice(0, -1) : line;

export function safeRelativePath(value) {
  if (typeof value !== "string" || !value || value.length > 1024 ||
      /[\\:\u0000-\u001f\u007f]/.test(value) || value.startsWith("/") ||
      value.split("/").some((part) => part === "" || part === "." || part === "..")) {
    throw patchError("UNSAFE_PATH");
  }
  return value;
}

function plainPath(value) {
  if (value.includes('"')) unsupported();
  return safeRelativePath(value);
}

function headerPaths(line) {
  const prefix = "diff --git a/";
  if (!line.startsWith(prefix)) {
    const body = line.slice("diff --git ".length);
    if (body.startsWith("/") || /^[A-Za-z]:/.test(body)) throw patchError("UNSAFE_PATH");
    unsupported();
  }
  const body = line.slice(prefix.length);
  const first = body.indexOf(" b/");
  if (first < 0) unsupported();
  if (body.indexOf(" b/", first + 1) >= 0) throw patchError("AMBIGUOUS_INPUT", "incomplete");
  return [plainPath(body.slice(0, first)), plainPath(body.slice(first + 3))];
}

function mode(value) {
  if (value === "160000") unsupported();
  if (!modes.has(value)) unsupported();
  return value;
}

function number(value) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) invalid();
  return parsed;
}

function markerPath(line, prefix, side) {
  if (!line.startsWith(prefix)) invalid();
  // Git appends a tab separator to unquoted ---/+++ paths containing spaces.
  const raw = line.slice(prefix.length);
  const value = raw.endsWith("\t") ? raw.slice(0, -1) : raw;
  if (value.includes("\t")) unsupported();
  if (value === "/dev/null") return null;
  if (!value.startsWith(`${side}/`)) {
    if (value.startsWith("/") || /^[A-Za-z]:/.test(value)) throw patchError("UNSAFE_PATH");
    unsupported();
  }
  return plainPath(value.slice(2));
}

function binaryPaths(line) {
  if (!line.startsWith("Binary files ") || !line.endsWith(" differ")) invalid();
  const body = line.slice(13, -7);
  const separators = [];
  let offset = 0;
  while (offset < body.length) {
    const position = body.indexOf(" and ", offset);
    if (position < 0) break;
    separators.push(position);
    offset = position + 5;
    if (separators.length > 1) throw patchError("AMBIGUOUS_INPUT", "incomplete");
  }
  if (separators.length !== 1) invalid();
  const split = separators[0];
  return [markerPath(`--- ${body.slice(0, split)}`, "--- ", "a"),
    markerPath(`+++ ${body.slice(split + 5)}`, "+++ ", "b")];
}

export function parseDiff(diffText, limits) {
  if (typeof diffText !== "string" || diffText.includes("\0")) invalid();
  if (Buffer.byteLength(diffText, "utf8") > limits.max_input_bytes) resource();
  if (Buffer.from(diffText, "utf8").toString("utf8") !== diffText) throw patchError("INVALID_ENCODING");
  if (diffText === "") return [];
  if (!diffText.endsWith("\n")) incomplete();
  const lines = diffText.slice(0, -1).split("\n");
  const files = [];
  const occupiedPaths = new Set();
  let cursor = 0;
  let totalChangedLines = 0;
  while (cursor < lines.length) {
    if (lines[cursor].startsWith("diff --cc ") || lines[cursor].startsWith("diff --combined ")) unsupported();
    if (!lines[cursor].startsWith("diff --git ")) invalid();
    if (files.length >= limits.max_files) resource();
    const [oldPath, newPath] = headerPaths(metadataLine(lines[cursor]));
    const file = {
      path: newPath,
      previous_path: null,
      kind: "modified",
      binary: false,
      symlink: false,
      added_lines: 0,
      deleted_lines: 0,
      addedContent: [],
    };
    cursor += 1;
    const metadata = new Map();
    let oldMarker;
    let newMarker;
    let hadMarkers = false;
    let hadHunks = false;
    let binary = false;
    let previousOldEnd = 0;
    let previousNewEnd = 0;
    let lineDelta = 0;
    let oldEnded = false;
    let newEnded = false;
    const put = (key, value) => {
      if (metadata.has(key)) invalid();
      metadata.set(key, value);
    };
    while (cursor < lines.length && !lines[cursor].startsWith("diff --git ")) {
      const line = metadataLine(lines[cursor]);
      if (line.startsWith("diff --cc ") || line.startsWith("diff --combined ")) unsupported();
      if (line.startsWith("@@ ")) {
        if (!hadMarkers || binary) invalid();
        const match = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(?: .*)?$/.exec(line);
        if (!match) invalid();
        const oldStart = number(match[1]);
        const oldCount = number(match[2] ?? "1");
        const newStart = number(match[3]);
        const newCount = number(match[4] ?? "1");
        if ((!oldCount && !newCount) || (oldCount && !oldStart) || (newCount && !newStart)) invalid();
        const oldIndex = oldStart - (oldCount ? 1 : 0);
        const newIndex = newStart - (newCount ? 1 : 0);
        if (oldIndex < previousOldEnd || newIndex < previousNewEnd ||
            newIndex - oldIndex !== lineDelta || !Number.isSafeInteger(oldIndex + oldCount) ||
            !Number.isSafeInteger(newIndex + newCount)) invalid();
        if (oldMarker === null && (oldCount !== 0 || oldStart !== 0)) invalid();
        if (newMarker === null && (newCount !== 0 || newStart !== 0)) invalid();
        cursor += 1;
        let oldConsumed = 0;
        let newConsumed = 0;
        let lastType = null;
        const noNewline = () => {
          if (lastType === null) invalid();
          if (lastType !== "+") oldEnded = true;
          if (lastType !== "-") newEnded = true;
          lastType = null;
          cursor += 1;
        };
        while (oldConsumed < oldCount || newConsumed < newCount) {
          const bodyLine = lines[cursor];
          if (metadataLine(bodyLine) === "\\ No newline at end of file") { noNewline(); continue; }
          if (bodyLine === undefined || bodyLine.startsWith("diff --git ") || bodyLine.startsWith("@@ ")) incomplete();
          if (![" ", "+", "-"].includes(bodyLine[0])) invalid();
          const type = bodyLine[0];
          if (type !== "+") {
            if (oldConsumed >= oldCount || oldEnded) invalid();
            oldConsumed += 1;
          }
          if (type !== "-") {
            if (newConsumed >= newCount || newEnded) invalid();
            newConsumed += 1;
          }
          if (type === "+") {
            file.added_lines += 1;
            file.addedContent.push({ text: bodyLine.slice(1), line: newStart + newConsumed - 1, diff_line: cursor + 1 });
          } else if (type === "-") file.deleted_lines += 1;
          if (type !== " ") {
            totalChangedLines += 1;
            if (totalChangedLines > limits.max_changed_lines) resource();
          }
          lastType = type;
          cursor += 1;
        }
        if (metadataLine(lines[cursor]) === "\\ No newline at end of file") noNewline();
        previousOldEnd = oldIndex + oldCount;
        previousNewEnd = newIndex + newCount;
        lineDelta += newCount - oldCount;
        hadHunks = true;
        continue;
      }
      if (line.startsWith("@@@")) unsupported();
      if (hadHunks || binary) {
        if (/^[ +\\-]/.test(line) || /^(old mode|new mode|new file mode|deleted file mode|index|similarity index|rename from|rename to)\b/.test(line)) invalid();
        unsupported();
      }
      if (line.startsWith("--- ")) {
        if (hadMarkers) invalid();
        oldMarker = markerPath(line, "--- ", "a");
        if (lines[cursor + 1] === undefined) incomplete();
        newMarker = markerPath(metadataLine(lines[cursor + 1]) ?? "", "+++ ", "b");
        hadMarkers = true;
        cursor += 2;
        continue;
      }
      if (hadMarkers) invalid();
      if (line.startsWith("Binary files ")) {
        [oldMarker, newMarker] = binaryPaths(line);
        binary = true;
        cursor += 1;
        continue;
      }
      let match;
      if ((match = /^(old mode|new mode|new file mode|deleted file mode) (\d{6})$/.exec(line))) {
        put(match[1], mode(match[2]));
      } else if ((match = /^index ([0-9a-f]{4,64})\.\.([0-9a-f]{4,64})(?: (\d{6}))?$/.exec(line))) {
        if (match[3] !== undefined) mode(match[3]);
        put("index", { old: match[1], new: match[2], mode: match[3] ?? null });
      } else if ((match = /^similarity index (\d{1,3})%$/.exec(line))) {
        const value = number(match[1]);
        if (value > 100) invalid();
        put("similarity", value);
      } else if (line.startsWith("rename from ")) {
        put("rename from", plainPath(line.slice(12)));
      } else if (line.startsWith("rename to ")) {
        put("rename to", plainPath(line.slice(10)));
      } else if (line === "GIT binary patch" || line.startsWith("copy from ") ||
          line.startsWith("copy to ") || line.startsWith("dissimilarity index ")) unsupported();
      else if (/^(index |old mode |new mode |new file mode |deleted file mode |similarity index |rename from |rename to )/.test(line)) invalid();
      else unsupported();
      cursor += 1;
    }
    const added = metadata.has("new file mode");
    const deleted = metadata.has("deleted file mode");
    const renamed = metadata.has("rename from") || metadata.has("rename to");
    const oldMode = metadata.get("old mode");
    const newMode = metadata.get("new mode");
    const index = metadata.get("index");
    if ((added && deleted) || ((added || deleted) && (renamed || oldMode || newMode)) ||
        (Boolean(oldMode) !== Boolean(newMode)) || (oldMode && oldMode === newMode)) invalid();
    if (renamed) {
      if (metadata.has("rename from") && !metadata.has("rename to")) incomplete();
      if (!metadata.has("rename from") || !metadata.has("rename to") || !metadata.has("similarity") ||
          metadata.get("rename from") !== oldPath || metadata.get("rename to") !== newPath || oldPath === newPath) invalid();
      file.kind = "renamed";
      file.previous_path = oldPath;
    } else {
      if (metadata.has("similarity") || oldPath !== newPath) invalid();
      if (added) file.kind = "added";
      if (deleted) { file.kind = "deleted"; file.path = oldPath; }
    }
    if (hadMarkers || binary) {
      if (oldMarker !== (added ? null : oldPath) || newMarker !== (deleted ? null : newPath)) invalid();
    }
    if (hadMarkers && !hadHunks) invalid();
    if (hadHunks && file.added_lines === 0 && file.deleted_lines === 0) invalid();
    if (index) {
      if (/^0+$/.test(index.old) !== added || /^0+$/.test(index.new) !== deleted) invalid();
      if ((added || deleted) && index.mode !== null) invalid();
      if (oldMode && index.mode !== null) invalid();
      if (index.old === index.new && (hadHunks || binary)) invalid();
      if (renamed && metadata.get("similarity") === 100 && index.old !== index.new) invalid();
    }
    // Empty-file creation/deletion has index evidence without a hunk; other no-content
    // entries must be an explicit mode change or a rename rather than a truncated patch.
    if (!hadHunks && !binary && !renamed && !oldMode && !added && !deleted) invalid();
    if (!hadHunks && !binary && renamed && metadata.get("similarity") !== 100) incomplete();
    if ((hadHunks || binary) && renamed && metadata.get("similarity") === 100) invalid();
    if ((added || deleted) && !hadHunks && !binary && !index) incomplete();
    if (!hadHunks && !binary && (added || deleted)) {
      const emptyHash = index[added ? "new" : "old"];
      const emptyBlobHashes = ["e69de29bb2d1d6434b8b29ae775ad8c2e48c5391", "473a0f4c3be8a93681a267e3b1e9a7dcda1185436fe141f7749120a303721813"];
      if (!emptyBlobHashes.some((hash) => hash.startsWith(emptyHash))) invalid();
    }
    for (const path of new Set([oldPath, newPath])) {
      if (occupiedPaths.has(path)) throw patchError("AMBIGUOUS_INPUT", "incomplete");
      occupiedPaths.add(path);
    }
    file.binary = binary;
    file.symlink = [metadata.get("new file mode"), metadata.get("deleted file mode"), oldMode, newMode, index?.mode].includes("120000");
    files.push(file);
  }
  return files;
}
