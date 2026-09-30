#!/usr/bin/env node
// Explicit isolated source installation. Never modifies shell/Codex configuration.
import { readdirSync, readFileSync, mkdirSync, existsSync, writeFileSync, symlinkSync, realpathSync, copyFileSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
const root = dirname(dirname(fileURLToPath(import.meta.url)));
const args = process.argv.slice(2);
if (args.length !== 2 || args[0] !== '--prefix') { console.error('Usage: node scripts/install-local.mjs --prefix NEW_EMPTY_DIRECTORY'); process.exit(2); }
const prefix = resolve(args[1]);
if (existsSync(prefix)) { console.error('Prefix already exists; choose a new directory to preserve prior installations.'); process.exit(2); }
if (!/^v(22|24)\./.test(process.version)) { console.error('Use verified Node 22 or 24.'); process.exit(2); }
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const env = { ...process.env, npm_config_cache: join(root,'.cache/npm') };
function run(cmd, argv, cwd) { const r=spawnSync(cmd,argv,{cwd,env,encoding:'utf8',shell:process.platform==='win32'&&cmd===npm}); if(r.status!==0) throw new Error(`${cmd} failed; partial isolated prefix retained for inspection`); return r.stdout; }
try {
 mkdirSync(prefix,{recursive:true}); mkdirSync(join(prefix,'artifacts')); mkdirSync(join(prefix,'bin'));
 const packages=[{folder:'.',path:root},...readdirSync(join(root,'packages')).sort().map(folder=>({folder,path:join(root,'packages',folder)}))];
 const inventory=[]; const tarballs=[]; const bins=new Set();
 for(const p of packages) {
  const manifest=JSON.parse(readFileSync(join(p.path,'package.json'),'utf8'));
  const packed=JSON.parse(run(npm,['pack','--ignore-scripts','--json','--pack-destination',join(prefix,'artifacts')],p.path))[0];
  tarballs.push(join(prefix,'artifacts',packed.filename));
  const declared=typeof manifest.bin==='string'?{[manifest.name]:manifest.bin}:manifest.bin??{};
  for(const bin of Object.keys(declared)) { if(bins.has(bin)) throw new Error('Duplicate CLI name'); bins.add(bin); }
  inventory.push({folder:p.folder,name:manifest.name,version:manifest.version,private:manifest.private===true,bins:Object.keys(declared),binTargets:declared,artifact:packed.filename,integrity:packed.integrity});
 }
 writeFileSync(join(prefix,'package.json'),JSON.stringify({name:'ai-agent-tools-local-install',version:'0.0.0',private:true},null,2));
 run(npm,['install','--ignore-scripts','--no-audit','--no-fund',...tarballs],prefix);
 mkdirSync(join(prefix,'runtime'));
 const installedNode=join(prefix,'runtime',process.platform==='win32'?'node.exe':'node');
 copyFileSync(realpathSync(process.execPath),installedNode);
 const runtimeLicense=join(dirname(dirname(realpathSync(process.execPath))),'LICENSE');
 if(existsSync(runtimeLicense)) copyFileSync(runtimeLicense,join(prefix,'runtime','LICENSE'));
 const quote = value => "'" + value.replaceAll("'", "'\\''") + "'";
 if(process.platform!=='win32') {
  symlinkSync(installedNode,join(prefix,'bin/node'));
  for(const p of inventory) for(const [bin,target] of Object.entries(p.binTargets)) {
   const executable=realpathSync(join(prefix,'node_modules',p.name,target));
   writeFileSync(join(prefix,'bin',bin),'#!/bin/sh\nexec '+quote(installedNode)+' '+quote(executable)+' "$@"\n',{mode:0o755});
  }
 }
 const commit=run('git',['rev-parse','HEAD'],root).trim();
 const workspaceDirty=run('git',['status','--porcelain'],root).trim().length>0;
 writeFileSync(join(prefix,'INSTALLATION.json'),JSON.stringify({commit,workspaceDirty,node:process.version,nodeExecutable:installedNode,sourceNodeExecutable:realpathSync(process.execPath),prefix,packages:inventory,configurationChanged:false,nativeInstallScriptsExecuted:false,rollback:'Stop using this prefix; restore previous PATH. Prefix contents may be removed explicitly after preserving any needed artifacts.'},null,2)+'\n');
 console.log(JSON.stringify({prefix,commit,packages:inventory.length,bins:[...bins].sort(),pathDirectory:process.platform==='win32'?join(prefix,'node_modules','.bin'):join(prefix,'bin')},null,2));
} catch(error) { console.error(error.message); process.exitCode=1; }
