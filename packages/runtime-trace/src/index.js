import { constants, openSync, closeSync, fstatSync, readSync, realpathSync, statSync } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
export const LIMITS = Object.freeze({ inputBytes: 1048576, outputBytes: 65536, cases: 32, rectangles: 128, pairs: 128, focusEntries: 128 });
const object = x => x !== null && typeof x === 'object' && !Array.isArray(x);
const own = (x, k) => Object.hasOwn(x, k);
const keys = (x, allowed, required = []) => {
  if (!object(x) || Object.keys(x).some(k => !allowed.includes(k)) || required.some(k => !own(x,k))) throw invalid();
};
const canonical = x => JSON.stringify(x, (_k,v) => object(v) ? Object.fromEntries(Object.keys(v).sort().map(k => [k,v[k]])) : v);
export const digest = x => createHash('sha256').update(canonical(x)).digest('hex');
const id = x => typeof x === 'string' && /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/.test(x) && !/(?:sk-proj-|ghp_|github_pat_|xox[baprs]-)/i.test(x);
const number = (x,min = 0,max = 1000000) => typeof x === 'number' && Number.isFinite(x) && x >= min && x <= max;
const time = x => typeof x === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z$/.test(x) && Number.isFinite(Date.parse(x)) && new Date(x).toISOString() === x.replace(/Z$/, x.includes('.') ? 'Z' : '.000Z');
const list = (x,max,valid) => Array.isArray(x) && x.length <= max && x.every(valid);
const scopes = ['overflow','overlap','focus','back'];
export function invalid() { const error = new Error('Invalid bounded sanitized UI evidence'); error.code = 'INVALID_INPUT'; return error; }
export function validateBundle(input) {
  try { if(Buffer.byteLength(JSON.stringify(input)) > LIMITS.inputBytes) throw invalid(); } catch { throw invalid(); }
  keys(input,['schemaVersion','profile','asOf','maxEvidenceAgeSeconds','cases'],['schemaVersion','profile','asOf','maxEvidenceAgeSeconds','cases']);
  if(input.schemaVersion !== '1.0' || input.profile !== 'ui-regression-v1' || !time(input.asOf) || !Number.isInteger(input.maxEvidenceAgeSeconds) || !number(input.maxEvidenceAgeSeconds,0,604800) || !Array.isArray(input.cases) || !input.cases.length || input.cases.length > LIMITS.cases) throw invalid();
  const seen = new Set();
  for(const c of input.cases) {
    keys(c,['id','producer','observedAt','required','tolerancePx','viewport','document','rectangles','pairs','focus','back'],['id','producer','observedAt','required','viewport']);
    if(!id(c.id) || !id(c.producer) || seen.has(c.id) || !time(c.observedAt) || !list(c.required,4,x => scopes.includes(x)) || !c.required.length || new Set(c.required).size !== c.required.length || (own(c,'tolerancePx') && !number(c.tolerancePx,0,10))) throw invalid();
    seen.add(c.id);
    keys(c.viewport,['width','height'],['width','height']);
    if(!number(c.viewport.width,1,100000) || !number(c.viewport.height,1,100000)) throw invalid();
    if(own(c,'document')) { keys(c.document,['scrollWidth'],['scrollWidth']); if(!number(c.document.scrollWidth)) throw invalid(); }
    if(own(c,'rectangles')) {
      if(!Array.isArray(c.rectangles) || c.rectangles.length > LIMITS.rectangles) throw invalid();
      const rects = new Set();
      for(const r of c.rectangles) {
        keys(r,['id','x','y','width','height','visible'],['id','x','y','width','height','visible']);
        if(!id(r.id) || rects.has(r.id) || !number(r.x,-1000000) || !number(r.y,-1000000) || !number(r.width) || !number(r.height) || typeof r.visible !== 'boolean') throw invalid();
        rects.add(r.id);
      }
    }
    if(own(c,'pairs')) {
      if(!Array.isArray(c.pairs) || c.pairs.length > LIMITS.pairs) throw invalid();
      const pairs = new Set();
      for(const pair of c.pairs) {
        keys(pair,['id','first','second','allowOverlap'],['id','first','second','allowOverlap']);
        if(!id(pair.id) || pairs.has(pair.id) || !id(pair.first) || !id(pair.second) || pair.first === pair.second || typeof pair.allowOverlap !== 'boolean') throw invalid();
        pairs.add(pair.id);
      }
    }
    if(own(c,'focus')) {
      keys(c.focus,['expected','observed','complete'],['expected']);
      if(!list(c.focus.expected,LIMITS.focusEntries,id) || !c.focus.expected.length || (own(c.focus,'observed') && !list(c.focus.observed,LIMITS.focusEntries,id)) || (own(c.focus,'complete') && typeof c.focus.complete !== 'boolean')) throw invalid();
    }
    if(own(c,'back')) {
      keys(c.back,['expectedRouteId','observedRouteId','outcome','complete'],['expectedRouteId']);
      if(!id(c.back.expectedRouteId) || (own(c.back,'observedRouteId') && !id(c.back.observedRouteId)) || (own(c.back,'outcome') && !['settled','timeout','unknown'].includes(c.back.outcome)) || (own(c.back,'complete') && typeof c.back.complete !== 'boolean')) throw invalid();
    }
  }
  return input;
}
const envelope = (status, data, diagnostics = []) => ({ schemaVersion:'1.0',tool:'agent-runtime-trace',operation:'ui-regression-check',status,complete: status === 'pass' || status === 'fail',data,diagnostics });
export function checkUiRegression(input) {
  try { validateBundle(input); } catch { return envelope('error',null,[{code:'INVALID_INPUT',message:'Provide valid bounded sanitized UI evidence'}]); }
  const checks = [];
  const add = (c, kind, suffix, status, reason, pointers, measurements) => checks.push({ id:`${c.id}/${kind}${suffix ? '/'+suffix : ''}`, caseId:c.id, kind, status, reason, evidence:pointers, ...(measurements ? {measurements} : {}) });
  for(const c of input.cases) {
    const ix = input.cases.indexOf(c), ptr = `/cases/${ix}`, tolerance = c.tolerancePx ?? 0;
    const age = (Date.parse(input.asOf)-Date.parse(c.observedAt))/1000;
    if(age < 0 || age > input.maxEvidenceAgeSeconds) {
      for(const kind of [...c.required].sort()) add(c,kind,'','unknown',age < 0 ? 'Evidence timestamp is after the cutoff' : 'Evidence is stale',[ptr+'/observedAt','/asOf']);
      continue;
    }
    for(const kind of [...c.required].sort()) {
      if(kind === 'overflow') {
        if(!c.document) add(c,kind,'','unknown','Document scroll width was not supplied',[ptr+'/viewport']);
        else add(c,kind,'',c.document.scrollWidth > c.viewport.width+tolerance ? 'fail':'pass','Compare declared document scroll width with the viewport',[ptr+'/document/scrollWidth',ptr+'/viewport/width'],{scrollWidth:c.document.scrollWidth,viewportWidth:c.viewport.width,tolerancePx:tolerance});
      }
      if(kind === 'overlap') {
        if(!c.pairs?.length) add(c,kind,'','unknown','No explicit nonoverlap or allowance pairs were supplied',[ptr]);
        else for(const pair of c.pairs) {
          const pairIndex = c.pairs.indexOf(pair), refs = [ptr+'/pairs/'+pairIndex];
          const a = c.rectangles?.find(r => r.id === pair.first), b = c.rectangles?.find(r => r.id === pair.second);
          if(!a || !b || !a.visible || !b.visible) { add(c,kind,pair.id,'unknown','Both declared visible rectangles are required',refs); continue; }
          refs.push(ptr+'/rectangles/'+c.rectangles.indexOf(a),ptr+'/rectangles/'+c.rectangles.indexOf(b));
          const width = Math.max(0,Math.min(a.x+a.width,b.x+b.width)-Math.max(a.x,b.x)), height = Math.max(0,Math.min(a.y+a.height,b.y+b.height)-Math.max(a.y,b.y));
          const overlaps = width > tolerance && height > tolerance;
          add(c,kind,pair.id,overlaps && !pair.allowOverlap ? 'fail':'pass',pair.allowOverlap ? 'Overlap is explicitly allowed for this pair' : 'Compare supplied axis-aligned rectangles for this declared pair',refs,{intersectionWidth:width,intersectionHeight:height,tolerancePx:tolerance});
        }
      }
      if(kind === 'focus') {
        if(!c.focus?.observed || c.focus.complete !== true) add(c,kind,'','unknown','Complete supplied focus interaction evidence is required',[ptr+'/focus']);
        else add(c,kind,'',canonical(c.focus.expected) === canonical(c.focus.observed) ? 'pass':'fail','Compare declared and completely observed focus sequences',[ptr+'/focus/expected',ptr+'/focus/observed']);
      }
      if(kind === 'back') {
        if(!c.back?.observedRouteId || c.back.complete !== true || c.back.outcome !== 'settled') add(c,kind,'','unknown','Settled complete Back navigation evidence is required',[ptr+'/back']);
        else add(c,kind,'',c.back.expectedRouteId === c.back.observedRouteId ? 'pass':'fail','Compare expected and observed route identities',[ptr+'/back/expectedRouteId',ptr+'/back/observedRouteId']);
      }
    }
  }
  checks.sort((a,b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  const counts = Object.fromEntries(['pass','fail','unknown'].map(s => [s,checks.filter(c => c.status === s).length]));
  const status = counts.fail ? 'fail' : counts.unknown ? 'unknown' : 'pass';
  const result = envelope(status,{ profile:'ui-regression-v1', scope:'supplied-declared-ui-evidence',checks,summary:counts,provenance:{inputSha256:digest(input)},limitations:['Producer declarations are not authenticated','Only explicitly requested checks and declared pairs are assessed','Screenshots, clipping, stacking, hit targets and whole-workflow correctness are not inferred'] });
  result.complete = !counts.unknown;
  return result;
}
export function capabilities() {
  return {schemaVersion:'1.0',tool:'agent-runtime-trace',operation:'capabilities',status:'pass',complete:true,data:{operations:['ui-regression-check','capabilities'],profiles:['ui-regression-v1'],checks:scopes,offline:true,network:false,executesScripts:false,generalBusinessTraceImplemented:false,limits:LIMITS,exitCodes:{pass:0,fail:1,error:2,unknown:3}},diagnostics:[]};
}
export const exitCode = result => ({pass:0,fail:1,error:2,unknown:3})[result.status] ?? 2;
export function encodeResult(result) {
  const text = JSON.stringify(result);
  return Buffer.byteLength(text) <= LIMITS.outputBytes ? text : JSON.stringify(envelope('unknown',null,[{code:'OUTPUT_LIMIT',message:'Narrow the evidence snapshot; output limit exceeded'}]));
}
export function readJson(file) {
  const resolved = realpathSync(file);
  if(/^(?:\.env(?:\..*)?|\.npmrc|auth\.json|credentials(?:\.json)?|tokens\.json|id_rsa)$/i.test(path.basename(resolved)) || /^(?:\.env(?:\..*)?|\.npmrc|auth\.json|credentials(?:\.json)?|tokens\.json|id_rsa)$/i.test(path.basename(file))) throw invalid();
  const before = statSync(resolved);
  if(!before.isFile() || before.size > LIMITS.inputBytes) throw invalid();
  const fd = openSync(resolved,constants.O_RDONLY | (process.platform === 'win32' ? 0 : constants.O_NONBLOCK));
  try {
    const stat = fstatSync(fd);
    if(!stat.isFile() || stat.size > LIMITS.inputBytes) throw invalid();
    const buffer = Buffer.alloc(LIMITS.inputBytes+1); let length = 0;
    while(length < buffer.length) { const count = readSync(fd,buffer,length,buffer.length-length,null); if(!count) break; length += count; }
    if(length > LIMITS.inputBytes) throw invalid();
    return parseJson(new TextDecoder('utf-8',{fatal:true}).decode(buffer.subarray(0,length)));
  } finally { closeSync(fd); }
}

// Validate JSON structure before parsing so duplicate fields cannot silently replace evidence.
export function parseJson(text) {
  if(typeof text !== 'string' || Buffer.byteLength(text) > LIMITS.inputBytes) throw invalid();
  let i = 0;
  const ws = () => { while(i < text.length && /[\x20\x09\x0a\x0d]/.test(text[i])) i++; };
  const string = () => {
    const start = i;
    if(text[i++] !== '"') throw invalid();
    while(i < text.length) {
      if(text[i] === '"') { i++; return JSON.parse(text.slice(start,i)); }
      if(text[i++] === '\\') i++;
    }
    throw invalid();
  };
  const value = depth => {
    if(depth > 32) throw invalid();
    ws(); const ch = text[i];
    if(ch === '{') {
      i++; ws(); const seen = new Set();
      if(text[i] === '}') {i++; return;}
      while(true) {
        ws(); const key = string(); if(seen.has(key)) throw invalid(); seen.add(key);
        ws(); if(text[i++] !== ':') throw invalid(); value(depth+1); ws();
        if(text[i] === '}') {i++; return;} if(text[i++] !== ',') throw invalid();
      }
    }
    if(ch === '[') {
      i++; ws(); if(text[i] === ']') {i++; return;}
      while(true) {value(depth+1);ws();if(text[i] === ']') {i++;return;}if(text[i++] !== ',') throw invalid();}
    }
    if(ch === '"') {string();return;}
    const token = /^(?:true|false|null|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)/.exec(text.slice(i));
    if(!token) throw invalid(); i += token[0].length;
  };
  value(0); ws(); if(i !== text.length) throw invalid(); return JSON.parse(text);
}
