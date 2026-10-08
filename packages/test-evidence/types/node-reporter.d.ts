export default function reporter(source: AsyncIterable<{ type: string; data?: unknown }>): AsyncGenerator<string>;
