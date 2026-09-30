import test from 'node:test';
import assert from 'node:assert/strict';
import { captureGeometry } from '../src/playwright-export.js';
import { checkUiRegression } from '../src/index.js';
const options=()=>({id:'mobile',producer:'authorized-playwright-export',observedAt:'2026-09-30T12:00:00Z',elementIds:['save','cancel'],pairs:[{id:'buttons',first:'save',second:'cancel',allowOverlap:false}]});
const mock = missing => ({evaluate:async (fn,args)=>{
  const old={document:globalThis.document,CSS:globalThis.CSS,getComputedStyle:globalThis.getComputedStyle};
  const selectors=[];
  globalThis.CSS={escape:x=>x};
  globalThis.document={documentElement:{clientWidth:390,clientHeight:844,scrollWidth:390},querySelectorAll:selector=>{selectors.push(selector);if(missing && selector.includes('cancel'))return [];return [{getBoundingClientRect:()=>({x:selector.includes('save')?16:204,y:700,width:170,height:44})}];}};
  globalThis.getComputedStyle=()=>({visibility:'visible',display:'block'});
  try {const result=fn(args);assert.equal(selectors.length,2);return result;} finally {Object.assign(globalThis,old);}
}});
test('fixed geometry adapter produces valid sanitized analyzer evidence',async()=>{const result=await captureGeometry(mock(false),options());assert.equal(result.rectangles.length,2);assert.equal(checkUiRegression({schemaVersion:'1.0',profile:'ui-regression-v1',asOf:result.observedAt,maxEvidenceAgeSeconds:0,cases:[result]}).status,'pass');assert.ok(!JSON.stringify(result).includes('selector'));});
test('missing elements stay unknown for declared pairs',async()=>{const result=await captureGeometry(mock(true),options());assert.equal(checkUiRegression({schemaVersion:'1.0',profile:'ui-regression-v1',asOf:result.observedAt,maxEvidenceAgeSeconds:0,cases:[result]}).status,'unknown');});
test('adapter rejects arbitrary selector/script/interaction fields without calling page',async()=>{let called=false;const page={evaluate:()=>{called=true;}};for(const field of ['script','selector','click','cookies'])await assert.rejects(()=>captureGeometry(page,{...options(),[field]:'secret'}));assert.equal(called,false);});
test('adapter rejects duplicate elements and credential IDs',async()=>{await assert.rejects(()=>captureGeometry(mock(false),{...options(),elementIds:['save','save']}));await assert.rejects(()=>captureGeometry(mock(false),{...options(),elementIds:['ghp_secret']}));});
test('adapter preserves caller supplied provenance timestamp without inventing interaction',async()=>{const result=await captureGeometry(mock(false),options());assert.equal(result.observedAt,options().observedAt);assert.deepEqual(result.required,['overflow','overlap']);assert.ok(!Object.hasOwn(result,'focus'));assert.ok(!Object.hasOwn(result,'back'));});

test('duplicate data-testid matches are omitted instead of choosing one',async()=>{const page={evaluate:async(fn,args)=>{const old={document:globalThis.document,CSS:globalThis.CSS,getComputedStyle:globalThis.getComputedStyle};globalThis.CSS={escape:x=>x};globalThis.document={documentElement:{clientWidth:390,clientHeight:844,scrollWidth:390},querySelectorAll:()=>[{},{}]};globalThis.getComputedStyle=()=>({visibility:'visible',display:'block'});try{return fn(args);}finally{Object.assign(globalThis,old);}}};const result=await captureGeometry(page,options());assert.equal(result.rectangles.length,0);});

test('adapter bounds caller wait without retrying or closing page',async(t)=>{t.mock.timers.enable({apis:['setTimeout']});let calls=0;const page={evaluate:()=>{calls++;return new Promise(()=>{});},close:()=>assert.fail('must not close caller page')};const pending=captureGeometry(page,options());const rejected=assert.rejects(pending);t.mock.timers.tick(5000);await rejected;assert.equal(calls,1);});
test('adapter rejects invalid producer geometry rather than declaring pass',async()=>{const page={evaluate:async()=>({viewport:{width:0,height:844},document:{scrollWidth:0},rectangles:[]})};await assert.rejects(()=>captureGeometry(page,options()));});
