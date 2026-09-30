import { readFileSync } from "node:fs";
try {
  const { before, after, samples } = JSON.parse(readFileSync(0, "utf8"));
  const evaluate = (pattern, value) =>
    pattern === undefined
      ? { substring: true, fullMatch: true }
      : (() => {
          const re = new RegExp(pattern);
          const match = re.exec(value);
          return {
            substring: match !== null,
            fullMatch:
              match !== null &&
              match.index === 0 &&
              match[0].length === value.length,
          };
        })();
  console.log(
    JSON.stringify(
      samples.map((value, index) => ({
        index,
        before: evaluate(before, value),
        after: evaluate(after, value),
      })),
    ),
  );
} catch {
  process.exitCode = 2;
}
