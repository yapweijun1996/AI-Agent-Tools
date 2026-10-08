import { buildProjectGraph } from './scanner.js';
import { queryGraph } from './query.js';
import { resolveRoot } from './safety.js';

const COMMANDS = new Set(['context', 'impact', 'changed', 'tests-for', 'evidence', 'goals', 'progress', 'path-to-done']);

function usage() {
  return `aptree <command> [--root DIR] [--path PATH] [--max-files N] [--ignore DIR] [--pretty]\n\nCommands: ${[...COMMANDS].join(', ')}\nRead-only deterministic project graph queries.\n--ignore may be passed multiple times to exclude additional root-relative directories.`;
}

function parse(argv) {
  const opts = { root: '.', pretty: false, ignore: [] };
  const command = argv.shift();
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--root') opts.root = argv[++i];
    else if (a === '--path') opts.path = argv[++i];
    else if (a === '--max-files') opts.maxFiles = Number(argv[++i]);
    else if (a === '--ignore') opts.ignore.push(argv[++i]);
    else if (a === '--pretty') opts.pretty = true;
    else if (a === '--help' || a === '-h') opts.help = true;
    else throw new Error(`Unknown option: ${a}`);
  }
  return { command, opts };
}

export async function runCli(argv, io) {
  let pretty = false;
  try {
    const { command, opts } = parse([...argv]);
    pretty = opts.pretty;
    if (opts.help || !command) {
      io.stdout.write(`${usage()}\n`);
      return 0;
    }
    if (!COMMANDS.has(command)) {
      io.stdout.write(`${JSON.stringify({ schema: 'aptree.error.v1', error: { code: 'INVALID_COMMAND', message: 'Unknown project graph command.' } }, null, pretty ? 2 : 0)}\n`);
      return 2;
    }
    const root = resolveRoot(opts.root, io.cwd);
    const graph = await buildProjectGraph({ root, maxFiles: opts.maxFiles, ignore: opts.ignore });
    const result = queryGraph(graph, command, { root, path: opts.path });
    io.stdout.write(`${JSON.stringify(result, null, pretty ? 2 : 0)}\n`);
    return 0;
  } catch {
    io.stdout.write(`${JSON.stringify({ schema: 'aptree.error.v1', error: { code: 'CLI_ERROR', message: 'Unable to complete the project query; check the root, path and scan options.' } }, null, pretty ? 2 : 0)}\n`);
    return 1;
  }
}
