import { collectEvidence } from './collector.js';
import { readJson, verifyDeployment, encodeResult, exitCode } from './index.js';
export async function runCollectCli(args) {
 let raw=false;try {
  const flags={};for(let i=0;i<args.length;i++){const k=args[i];if(Object.hasOwn(flags,k))throw Error();if(k==='--json'||k==='--bundle')flags[k]=true;else if(k==='--input'&&args[i+1]&&!args[i+1].startsWith('--'))flags[k]=args[++i];else throw Error();}
  if(!flags['--input']||flags['--json']&&flags['--bundle'])throw Error();raw=flags['--bundle']===true;
  const request=readJson(flags['--input']);const collected=await collectEvidence(request);
  const verification=verifyDeployment(collected.bundle,{allowLocalhost:request.collection?.allowLocalhost===true});
  const result={...verification,operation:'collect',data:{...verification.data,bundle:collected.bundle,collectionProvenance:collected.provenance},diagnostics:[...verification.diagnostics,...collected.diagnostics]};
  const bounded=JSON.parse(encodeResult(result));
  return {stdout:raw&&bounded.data?.bundle?JSON.stringify(bounded.data.bundle)+'\n':flags['--json']||raw?JSON.stringify(bounded)+'\n':`agent-release-guard collect: ${bounded.status}\nUse --bundle for normalized verifier input; --json includes provenance.\n`,code:exitCode(bounded)};
 }catch{return {stdout:JSON.stringify({schemaVersion:'1.0',tool:'agent-release-guard',operation:'collect',status:'error',complete:false,data:null,diagnostics:[{code:'INVALID_COLLECTION_INPUT',message:'Provide bounded sanitized collection input; no credentials or arbitrary commands.'}]})+'\n',code:2};}
}
