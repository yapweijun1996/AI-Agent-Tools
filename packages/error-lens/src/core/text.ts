export interface TextLine {
  text: string;
  start: number;
  end: number;
}

export function splitLines(text: string): TextLine[] {
  const lines: TextLine[] = [];
  let start = 0;
  while (start < text.length) {
    const newline = text.indexOf("\n", start);
    const end = newline < 0 ? text.length : newline;
    lines.push({ text: text.slice(start, end), start, end });
    if (newline < 0) break;
    start = newline + 1;
  }
  return lines;
}
