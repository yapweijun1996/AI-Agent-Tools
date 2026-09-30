import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runCollectCli } from '../src/collect-cli.js';
import { runCli } from '../src/cli.js';
import { readFileSync } from 'node:fs';
import Ajv from 'ajv';
test('collection CLI rejects flags and missing files without echoing secrets',async()=>{
 for(const args of [[],['--input','missing-credential-file'],['--input','x','--input','y'],['--input','x','--json','--bundle'],['--token','ghp_secret']]){
  const result=await runCollectCli(args);assert.equal(result.code,2);assert.equal(JSON.parse(result.stdout).operation,'collect');assert.ok(!result.stdout.includes('ghp_secret'));
 }
});
test('collector error envelope matches published result schema',async()=>{
 const schema=JSON.parse(readFileSync(new URL('../schema/result.schema.json',import.meta.url)));const validate=new Ajv({strict:false}).compile(schema);
 assert.equal(validate(JSON.parse((await runCollectCli([])).stdout)),true);
});
test('explicit localhost flag is not accepted for capabilities',()=>assert.equal(runCli(['capabilities','--allow-localhost','--json']).code,2));
