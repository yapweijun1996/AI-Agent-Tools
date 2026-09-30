#!/usr/bin/env node

import { runCli } from "../src/cli.js";

const outcome = runCli(process.argv.slice(2));
process.stdout.write(outcome.stdout);
process.stderr.write(outcome.stderr);
process.exitCode = outcome.exitCode;
