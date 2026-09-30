import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import http from 'node:http';
import https from 'node:https';
import { createHash } from 'node:crypto';
import { validateBundle, invalid, digest } from './index.js';

export const COLLECTION_LIMITS = Object.freeze({ timeoutMs: 5000, bodyBytes: 4194304, requests: 64, totalBytes: 16777216, redirects: 5, durationMs: 60000 });
const safeId = x => typeof x === 'string' && /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/.test(x) && !/(sk-proj-|ghp_|github_pat_|xox[baprs]-)/i.test(x);
const bounded = (v, fallback, max) => { if(v === undefined) return fallback; if(!Number.isInteger(v)||v<1||v>max) throw invalid('Invalid collection budget'); return v; };
export function publicAddress(address) {
  if(isIP(address)===4) {
    const [a,b,c] = address.split('.').map(Number);
    return !(a===0||a===10||a===127||a>=224||a===169&&b===254||a===172&&b>=16&&b<=31||a===192&&(b===168||b===0||b===2||b===88&&c===99)||a===198&&(b===18||b===19||b===51&&c===100)||a===203&&b===0&&c===113||a===100&&b>=64&&b<=127);
  }
  // Reject IPv4-mapped/translated and special IPv6 ranges conservatively.
  if(isIP(address)===6) return /^(?:2[0-9a-f]{3}|3[0-9a-f]{3}):/i.test(address) && !/^2001:(?:db8|0|2|10|20)(?::|$)/i.test(address) && !/^2002:/i.test(address);
  return false;
}
function target(value, origin, local) {
  let u; try { u=new URL(value); } catch { throw invalid('Invalid collection URL'); }
  const loop = ['127.0.0.1','[::1]'].includes(u.hostname);
  if(u.origin!==origin||u.username||u.password||u.search||u.hash||/[\u0000-\u0020\u007f\\]/.test(value)||u.protocol!=='https:'&&!(local&&loop&&u.protocol==='http:')) throw invalid('Collection URL outside explicit scope');
  if(!loop&&u.protocol!=='https:') throw invalid();
  return {u,loop};
}
async function boundedLookup(host, timeout) {
  let timer;
  try { return await Promise.race([lookup(host,{all:true,verbatim:true}),new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('TIMEOUT')),timeout);})]); } finally {clearTimeout(timer);}
}
async function transport(u, address, family, timeoutMs, byteLimit, accountBytes) {
  return new Promise((resolve,reject)=>{
    const req=(u.protocol==='https:'?https:http).request(u,{method:'GET',headers:{'accept-encoding':'identity'},agent:false,lookup:(_host,_opts,cb)=>cb(null,address,family)},res=>{
      const chunks=[];let size=0;
      res.on('data',chunk=>{size+=chunk.length;accountBytes(chunk.length);if(size>byteLimit){reject(new Error('BODY_LIMIT'));req.destroy();}else chunks.push(chunk);});
      res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,body:Buffer.concat(chunks)}));
      res.on('error',reject);
    });
    const timer=setTimeout(()=>req.destroy(new Error('TIMEOUT')),timeoutMs);timer.unref();
    req.on('error',reject);req.on('close',()=>clearTimeout(timer));req.end();
  });
}
export async function collectEvidence(request) {
  if(!request||typeof request!=='object'||Array.isArray(request)||Object.keys(request).some(k=>!['schemaVersion','expected','policy','ci','browser','collection'].includes(k))) throw invalid();
  const config=request.collection??{};
  if(!config||typeof config!=='object'||Array.isArray(config)||Object.keys(config).some(k=>!['allowLocalhost','timeoutMs','maxBodyBytes','maxRequests','maxDurationMs'].includes(k))||config.allowLocalhost!==undefined&&typeof config.allowLocalhost!=='boolean') throw invalid();
  const timeout=bounded(config.timeoutMs,5000,30000), bodyLimit=bounded(config.maxBodyBytes,4194304,4194304), requestLimit=bounded(config.maxRequests,64,128);
  const bundle=structuredClone(Object.fromEntries(Object.entries(request).filter(([k])=>k!=='collection')));
  validateBundle(bundle,{allowLocalhost:config.allowLocalhost===true});
  const duration=bounded(config.maxDurationMs,30000,60000), deadline=Date.now()+duration;
  const remaining=()=>{const ms=deadline-Date.now();if(ms<=0)throw new Error('DURATION_LIMIT');return Math.min(timeout,ms);};
  const origin=bundle.expected.origin;
  const start=target(origin,origin,config.allowLocalhost===true);
  if(start.loop&&!config.allowLocalhost) throw invalid('Local collection requires explicit opt-in');
  const diagnostics=[],provenance=[];let requests=0,totalBytes=0;
  bundle.http=[];
  for(const [i,asset] of bundle.expected.assets.entries()) {
    const redirects=[];let current=origin+asset.path;
    try {
      let response;
      for(let hop=0;;hop++) {
        if(requests>=requestLimit) throw new Error('REQUEST_LIMIT');
        if(totalBytes>=COLLECTION_LIMITS.totalBytes) throw new Error('TOTAL_BYTE_LIMIT');
        const {u,loop}=target(current,origin,config.allowLocalhost===true);
        const answers=loop?[{address:u.hostname==='[::1]'?'::1':'127.0.0.1',family:u.hostname==='[::1]'?6:4}]:await boundedLookup(u.hostname,remaining());
        if(!answers.length||!loop&&answers.some(a=>!publicAddress(a.address))) throw new Error('ADDRESS_NOT_PUBLIC');
        const address=answers[0];requests++;
        response=await transport(u,address.address,address.family,remaining(),Math.min(bodyLimit,COLLECTION_LIMITS.totalBytes-totalBytes),bytes=>{totalBytes+=bytes;});
        if([301,302,303,307,308].includes(response.status)) {
          if(hop>=5) throw new Error('REDIRECT_LIMIT');
          const location=response.headers.location;
          if(typeof location!=='string') throw new Error('REDIRECT_LOCATION_MISSING');
          current=new URL(location,u).href;target(current,origin,config.allowLocalhost===true);redirects.push({status:response.status,url:current});continue;
        }
        break;
      }
      const row={id:'collected-http-'+i,observedAt:new Date().toISOString(),assetPath:asset.path,finalUrl:current,status:response.status,redirects};
      // Version identity is observed only from dedicated public headers, never copied from expected.
      const commit=response.headers['x-deploy-commit'],build=response.headers['x-deploy-build-id'];
      if(typeof commit==='string'&&/^[a-f0-9]{40}$/.test(commit))row.commit=commit;
      if(safeId(build))row.buildId=build;
      if(response.status>=200&&response.status<300&&response.headers['content-encoding']===undefined)row.sha256=createHash('sha256').update(response.body).digest('hex');
      row.cache={source:'network'};
      const age=response.headers.age;if(typeof age==='string'&&/^\d{1,9}$/.test(age))row.cache.ageSeconds=Number(age);
      bundle.http.push(row);provenance.push({pointer:'/http/'+(bundle.http.length-1),method:'GET',bodyBytes:response.body.length,redirectCount:redirects.length,versionSource:'dedicated-public-response-headers'});
      if(!row.commit||!row.buildId)diagnostics.push({code:'VERSION_HEADERS_MISSING',assetIndex:i});
      if(!row.sha256)diagnostics.push({code:'BODY_HASH_UNAVAILABLE',assetIndex:i});
    } catch(error) {
      const allowed=['DURATION_LIMIT','TOTAL_BYTE_LIMIT','BODY_LIMIT','TIMEOUT','REQUEST_LIMIT','ADDRESS_NOT_PUBLIC','REDIRECT_LIMIT','REDIRECT_LOCATION_MISSING'];
      diagnostics.push({code:allowed.includes(error.message)?error.message:'COLLECTION_UNAVAILABLE',assetIndex:i});
    }
  }
  bundle.policy.asOf=new Date().toISOString();
  validateBundle(bundle,{allowLocalhost:config.allowLocalhost===true});
  return {bundle,provenance:{requestSha256:digest(request),cutoff:bundle.policy.asOf,requests,totalBytes,observations:provenance,ci:'supplied-sanitized-evidence-only',browser:'supplied-sanitized-evidence-only',installedDeviceUpdate:'unknown'},diagnostics};
}
