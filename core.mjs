export const DEFAULT_PALETTE=['#00BCD4','#E83E8C','#F3CC30','#22252A','#F2F0E9','#B8835A'];
export function srgbToLinear(x){return x<=.04045?x/12.92:((x+.055)/1.055)**2.4;}
export function linearToSrgb(x){return x<=.0031308?12.92*x:1.055*x**(1/2.4)-.055;}
export function rgbToLab(rgb){
  const [r,g,b]=rgb.map(x=>srgbToLinear(x/255));
  const f=x=>x>.008856?Math.cbrt(x):7.787*x+16/116;
  const x=f((.4124564*r+.3575761*g+.1804375*b)/.95047),y=f(.2126729*r+.7151522*g+.072175*b),z=f((.0193339*r+.119192*g+.9503041*b)/1.08883);
  return [116*y-16,500*(x-y),200*(y-z)];
}
export function makePalette(colors){
  if(!Array.isArray(colors)||colors.length!==6||colors.some(c=>!/^#[\da-fA-F]{6}$/.test(c)))throw Error('色板需要六个 #RRGGBB 颜色');
  return colors.map(hex=>{const rgb=[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16));return {hex:hex.toUpperCase(),rgb,lab:rgbToLab(rgb)};});
}
export function nearestPalette(rgb,palette){
  const lab=rgbToLab(rgb);let best=0,distance=Infinity;
  palette.forEach((p,i)=>{const d=p.lab.reduce((s,x,j)=>s+(x-lab[j])**2,0);if(d<distance){distance=d;best=i;}});
  return {index:best,rgb:palette[best].rgb,deltaE:Math.sqrt(distance)};
}
export function quantizePixels(data,palette,linearTint=[1,1,1]){
  const result=new Uint8ClampedArray(data.length),counts=Array(6).fill(0);let total=0,error=0;
  // Cache uses 8-bit transformed RGB; every distinct displayed input gets the
  // same CIE76 result, with palette order resolving ties deterministically.
  const cache=new Map();
  for(let i=0;i<data.length;i+=4){
    result[i+3]=data[i+3];if(!data[i+3])continue;
    const rgb=[0,1,2].map(j=>Math.max(0,Math.min(255,Math.round(linearToSrgb(srgbToLinear(data[i+j]/255)*linearTint[j])*255))));
    const key=(rgb[0]<<16)|(rgb[1]<<8)|rgb[2];let q=cache.get(key);if(!q){q=nearestPalette(rgb,palette);cache.set(key,q);}
    result.set(q.rgb,i);counts[q.index]++;total++;error+=q.deltaE;
  }
  return {data:result,counts,samples:total,meanDeltaE:total?error/total:0};
}
export function validateGLB(buffer){
  if(!(buffer instanceof ArrayBuffer)||buffer.byteLength<20)throw Error('文件不是有效 GLB：长度不足');
  if(buffer.byteLength>64*1024*1024)throw Error('首版最多支持 64 MB GLB');
  const view=new DataView(buffer);
  if(view.getUint32(0,true)!==0x46546c67||view.getUint32(4,true)!==2||view.getUint32(8,true)!==buffer.byteLength)throw Error('仅支持完整的 GLB 2.0 文件');
  const size=view.getUint32(12,true);
  if(view.getUint32(16,true)!==0x4e4f534a||size<2||20+size>buffer.byteLength)throw Error('GLB JSON 数据块无效');
  let doc;try{doc=JSON.parse(new TextDecoder().decode(new Uint8Array(buffer,20,size)));}catch{throw Error('GLB JSON 无法解析');}
  if(!doc||doc.asset?.version!=='2.0')throw Error('GLB 版本不兼容');
  if(doc.skins?.length)throw Error('首版不支持骨骼网格，请导出静态模型 GLB');
  for(const entry of [...(doc.buffers||[]),...(doc.images||[])])if(entry.uri&&!entry.uri.startsWith('data:'))throw Error('只支持内嵌资源 GLB，禁止读取外部图片或链接');
  const unsupported=['KHR_draco_mesh_compression','EXT_meshopt_compression','KHR_texture_basisu'];
  if([...(doc.extensionsUsed||[]),...(doc.extensionsRequired||[])].some(x=>unsupported.includes(x)))throw Error('首版不支持 Draco / Meshopt / KTX2 压缩，请导出未压缩 GLB');
  let triangles=0;
  for(const mesh of doc.meshes||[])for(const primitive of mesh.primitives||[]){
    if((primitive.mode??4)!==4)throw Error('首版只支持三角面网格');
    const count=doc.accessors?.[primitive.indices??primitive.attributes?.POSITION]?.count;
    if(!Number.isSafeInteger(count)||count<=0)throw Error('GLB 缺少有效网格数据');
    triangles+=Math.ceil(count/3);
  }
  if(!triangles)throw Error('GLB 没有三角面模型');
  if(triangles>500000)throw Error('首版最多支持 50 万三角面，请先导出较轻模型');
  return {doc,triangles};
}
export function validateExperiment(value){
  if(value?.schema!=='portrait-validation.v1')throw Error('实验 JSON 格式不兼容');
  makePalette(value.palette);
  if(!(value.nozzleMm>0&&value.nozzleMm<=2&&value.sizeMm>=10&&value.sizeMm<=1000))throw Error('喷嘴或目标尺寸超出范围');
  if(!['pending','whole','head'].includes(value.subject))throw Error('全身 / 头部参数无效');
  if(value.camera){for(const key of ['position','target'])if(!Array.isArray(value.camera[key])||value.camera[key].length!==3||value.camera[key].some(x=>!Number.isFinite(x)||Math.abs(x)>10000))throw Error('视角参数无效');}
  return value;
}
