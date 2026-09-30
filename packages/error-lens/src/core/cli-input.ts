export const MAX_CLI_INPUT_BYTES = 128 * 1024 * 1024;

export type CliInputResult =
  | { ok: true; text: string; bytes: number }
  | { ok: false; code: "CLI_INPUT_TOO_LARGE" | "CLI_INPUT_INVALID_UTF8"; message: string; bytes: number };

export async function readUtf8Stream(
  stream: AsyncIterable<Uint8Array | string>,
  maxBytes = MAX_CLI_INPUT_BYTES,
): Promise<CliInputResult> {
  const decoder = new TextDecoder("utf-8", { fatal: true });
  const textParts: string[] = [];
  let bytes = 0;

  for await (const chunk of stream) {
    const buffer = typeof chunk === "string" ? Buffer.from(chunk, "utf8") : Buffer.from(chunk);
    bytes += buffer.byteLength;
    if (bytes > maxBytes) {
      return {
        ok: false,
        code: "CLI_INPUT_TOO_LARGE",
        message: `stdin exceeds the ${maxBytes} byte transport limit`,
        bytes,
      };
    }

    try {
      textParts.push(decoder.decode(buffer, { stream: true }));
    } catch {
      return {
        ok: false,
        code: "CLI_INPUT_INVALID_UTF8",
        message: "stdin must contain valid UTF-8",
        bytes,
      };
    }
  }

  try {
    textParts.push(decoder.decode());
  } catch {
    return {
      ok: false,
      code: "CLI_INPUT_INVALID_UTF8",
      message: "stdin must contain valid UTF-8",
      bytes,
    };
  }

  return { ok: true, text: textParts.join(""), bytes };
}
