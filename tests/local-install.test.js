const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { mkdtempSync, writeFileSync, readFileSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
test('isolated installer rejects missing options and preserves existing prefix',()=>{
 const invalid=spawnSync(process.execPath,['scripts/install-local.mjs'],{encoding:'utf8'});assert.equal(invalid.status,2);
 const prefix=mkdtempSync(join(tmpdir(),'ait-existing-install-'));try{
  writeFileSync(join(prefix,'personal-marker'),'preserve');
  const result=spawnSync(process.execPath,['scripts/install-local.mjs','--prefix',prefix],{encoding:'utf8'});
  assert.equal(result.status,2);assert.match(result.stderr,/already exists/);assert.equal(readFileSync(join(prefix,'personal-marker'),'utf8'),'preserve');
 }finally{rmSync(prefix,{recursive:true});}
});
