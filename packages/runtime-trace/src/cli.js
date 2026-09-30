#!/usr/bin/env node
import { fileURLToPath } from 'node:url';
import { realpathSync } from 'node:fs';
import { capabilities, checkUiRegression, readJson, encodeResult, exitCode, invalid } from './index.js';
const HELP = `agent-runtime-trace ui-regression-check --input FILE [--json]\nagent-runtime-trace capabilities [--json]\nOffline explicit UI evidence only; no browser launch, network or business trace implementation.\nExit 0 pass, 1 fail, 2 invalid input, 3 unknown.\n`;
export function runCli(args) {
  if(!args.length || args.includes('--help')) return {stdout:HELP,code:0};
  let result;
  try {
    const [operation,...rest] = args, flags = {};
    for(let i=0;i<rest.length;i++) {
      const flag = rest[i];
      if(Object.hasOwn(flags,flag)) throw invalid();
      if(flag === '--json') flags[flag] = true;
      else if(flag === '--input' && rest[i+1] && !rest[i+1].startsWith('--')) flags[flag] = rest[++i];
      else throw invalid();
    }
    if(operation === 'capabilities' && !flags['--input']) result = capabilities();
    else if(operation === 'ui-regression-check' && flags['--input']) result = checkUiRegression(readJson(flags['--input']));
    else throw invalid();
  } catch { result = {schemaVersion:'1.0',tool:'agent-runtime-trace',operation:'ui-regression-check',status:'error',complete:false,data:null,diagnostics:[{code:'INVALID_INPUT',message:'Provide valid bounded sanitized UI evidence; use --help'}]}; }
  const bounded = JSON.parse(encodeResult(result));
  return {stdout:args.includes('--json') ? JSON.stringify(bounded)+'\n' : `agent-runtime-trace: ${bounded.status}\n`+(bounded.data?.checks ?? []).map(c => `${c.status} ${c.id}: ${c.reason}`).join('\n')+'\n',code:exitCode(bounded)};
}
if(process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) { const out = runCli(process.argv.slice(2)); process.stdout.write(out.stdout); process.exitCode = out.code; }
