#!/usr/bin/env node
import { runCli } from '../src/cli.js';

runCli(process.argv.slice(2), { stdout: process.stdout, stderr: process.stderr, cwd: process.cwd() })
  .then((code) => {
    process.exitCode = code;
  })
  .catch((error) => {
    console.error(error && error.stack ? error.stack : String(error));
    process.exitCode = 1;
  });
