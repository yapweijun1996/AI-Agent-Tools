import { main } from '../dist/cli.js';

// A separate real consumer process, not a supervisor substitute. Fixture state is private.
const [repo, stateRoot, ...args] = process.argv.slice(2);
if (!repo || !stateRoot || !args.length) throw new Error('Explicit disposable repository, private state and CLI arguments are required.');
process.exitCode = await main(args, { cwd: repo, coreOptions: { stateRoot }, interactive: false });
