import { invalid, validateBundle, LIMITS } from './index.js';
/** Fixed read-only geometry export from an already authorized caller-owned page. */
export async function captureGeometry(page, options) {
  if(!page || typeof page.evaluate !== 'function' || !options || typeof options !== 'object' || Array.isArray(options)) throw invalid();
  const allowed = ['id','producer','observedAt','elementIds','pairs','tolerancePx'];
  if(Object.keys(options).some(k => !allowed.includes(k)) || !Array.isArray(options.elementIds) || options.elementIds.length > LIMITS.rectangles || new Set(options.elementIds).size !== options.elementIds.length) throw invalid();
  const candidate = {id:options.id,producer:options.producer,observedAt:options.observedAt,required:['overflow',...(options.pairs ? ['overlap'] : [])],viewport:{width:1,height:1},rectangles:options.elementIds.map(id => ({id,x:0,y:0,width:0,height:0,visible:false})),...(options.pairs ? {pairs:options.pairs}:{}),...(Object.hasOwn(options,'tolerancePx') ? {tolerancePx:options.tolerancePx}:{})};
  validateBundle({schemaVersion:'1.0',profile:'ui-regression-v1',asOf:options.observedAt,maxEvidenceAgeSeconds:0,cases:[candidate]});
  let timer;
  let geometry;
  try { geometry = await Promise.race([page.evaluate(({elementIds}) => {
    const root = document.documentElement;
    const rectangles = [];
    for(const id of elementIds) {
      const matches = document.querySelectorAll('[data-testid="'+CSS.escape(id)+'"]');
      if(matches.length !== 1) continue;
      const element = matches[0];
      const rect = element.getBoundingClientRect(), style = getComputedStyle(element);
      rectangles.push({id,x:rect.x,y:rect.y,width:rect.width,height:rect.height,visible:rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.visibility !== 'collapse' && style.display !== 'none'});
    }
    return {viewport:{width:root.clientWidth,height:root.clientHeight},document:{scrollWidth:root.scrollWidth},rectangles};
  },{elementIds:options.elementIds}),new Promise((_resolve,reject) => {timer=setTimeout(()=>reject(invalid()),5000);})]); } finally {clearTimeout(timer);}
  const result = {...candidate,...geometry};
  validateBundle({schemaVersion:'1.0',profile:'ui-regression-v1',asOf:options.observedAt,maxEvidenceAgeSeconds:0,cases:[result]});
  return result;
}
