// Check raw evidence before JSON.parse can discard a contradictory field.
export function parseEvidenceJson(text) {
  let index = 0;
  const invalid = () => { throw new SyntaxError("Invalid unambiguous bounded JSON"); };
  const whitespace = () => {
    while (index < text.length && /[\x20\x09\x0a\x0d]/.test(text[index])) index++;
  };
  const string = () => {
    const start = index;
    if (text[index++] !== '"') invalid();
    while (index < text.length) {
      if (text[index] === '"') {
        index++;
        return JSON.parse(text.slice(start, index));
      }
      if (text[index++] === "\\") index++;
    }
    invalid();
  };
  const value = (depth) => {
    if (depth > 32) invalid();
    whitespace();
    const character = text[index];
    if (character === "{") {
      index++;
      whitespace();
      const seen = new Set();
      if (text[index] === "}") { index++; return; }
      while (true) {
        whitespace();
        const key = string();
        if (seen.has(key)) invalid();
        seen.add(key);
        whitespace();
        if (text[index++] !== ":") invalid();
        value(depth + 1);
        whitespace();
        if (text[index] === "}") { index++; return; }
        if (text[index++] !== ",") invalid();
      }
    }
    if (character === "[") {
      index++;
      whitespace();
      if (text[index] === "]") { index++; return; }
      while (true) {
        value(depth + 1);
        whitespace();
        if (text[index] === "]") { index++; return; }
        if (text[index++] !== ",") invalid();
      }
    }
    if (character === '"') { string(); return; }
    const token = /^(?:true|false|null|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)/.exec(text.slice(index));
    if (!token) invalid();
    index += token[0].length;
  };
  value(0);
  whitespace();
  if (index !== text.length) invalid();
  return JSON.parse(text);
}
