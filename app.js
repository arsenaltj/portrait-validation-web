import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {DEFAULT_PALETTE,makePalette,nearestPalette,quantizePixels,validateGLB,validateExperiment,linearToSrgb} from './core.mjs';
const $=id=>document.getElementById(id);
const state={palette:[...DEFAULT_PALETTE],model:null,image:null,stats:null,warnings:[],root:null,loadSequence:0,dirty:false};
const views=[],camera=new THREE.PerspectiveCamera(35,1,.01,100);
camera.position.set(2.8,1.8,3.8);
let framePending=false,loading=false,referenceURL=null;
function status(message,error=false){$('status').textContent=message;$('status').className=error?'error':'success';}
function render(){framePending=false;for(const v of views){const rect=v.element.getBoundingClientRect();if(rect.width<1||rect.height<1)continue;v.renderer.setSize(rect.width,rect.height,false);camera.aspect=rect.width/rect.height;camera.updateProjectionMatrix();v.renderer.render(v.scene,camera);}}
function requestRender(){if(!framePending){framePending=true;requestAnimationFrame(render);}}
try{
  for(const id of ['original','gray','limited']){
    const element=$(id+'-view'),renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true,alpha:false});
    renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));renderer.outputColorSpace=THREE.SRGBColorSpace;
    renderer.setClearColor(0x14202a);element.append(renderer.domElement);
    const scene=new THREE.Scene();scene.add(new THREE.HemisphereLight(0xffffff,0x5a7188,2));
    const light=new THREE.DirectionalLight(0xffffff,2.2);light.position.set(3,5,4);scene.add(light);
    const controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=false;controls.minDistance=.3;controls.maxDistance=20;
    controls.addEventListener('change',()=>{for(const v of views)if(v.controls!==controls)v.controls.target.copy(controls.target);requestRender();});
    renderer.domElement.addEventListener('webglcontextlost',event=>{event.preventDefault();status('图形上下文已丢失。请刷新页面并重新载入模型。',true);});
    views.push({id,element,renderer,scene,controls,model:null});
  }
  new ResizeObserver(requestRender).observe($('view-grid'));requestRender();
}catch{status('此浏览器无法创建 WebGL 3D 视图。请在本机 Chrome / Edge 启用硬件加速后重试。',true);}
function drawPalette(){
  $('palette').replaceChildren();state.palette.forEach((hex,i)=>{
    const wrap=document.createElement('div');wrap.className='swatch';
    const label=document.createElement('label');label.textContent=`基材 ${i+1}`;label.htmlFor=`color-${i}`;
    const color=document.createElement('input');color.type='color';color.id=`color-${i}`;color.value=hex;color.setAttribute('aria-label',`基材 ${i+1} 颜色`);
    const text=document.createElement('input');text.type='text';text.value=hex;text.maxLength=7;text.setAttribute('aria-label',`基材 ${i+1} RGB`);
    color.addEventListener('input',()=>{text.value=color.value.toUpperCase();state.palette[i]=color.value;state.dirty=true;});
    text.addEventListener('change',()=>{if(/^#[\da-f]{6}$/i.test(text.value)){color.value=text.value;state.palette[i]=text.value;state.dirty=true;}else{status('颜色格式需为 #RRGGBB，例如 #00BCD4。',true);text.value=state.palette[i];}});
    wrap.append(label,color,text);$('palette').append(wrap);
  });
}
drawPalette();
const textureCache=new Map();
const ownedGeometries=new Set(),ownedTextures=new Set(),ownedMaterials=new Set();
function ownMaterial(material){ownedMaterials.add(material);return material;}
function disposeModel(){
  for(const v of views){if(v.model){v.scene.remove(v.model);v.model=null;}}
  if(state.root)state.root.traverse(node=>{if(node.geometry)ownedGeometries.add(node.geometry);for(const m of Array.isArray(node.material)?node.material:[node.material])if(m){ownedMaterials.add(m);for(const value of Object.values(m))if(value?.isTexture)ownedTextures.add(value);}});
  for(const g of ownedGeometries)g.dispose();for(const t of ownedTextures)t.dispose();for(const m of ownedMaterials)m.dispose();
  ownedGeometries.clear();ownedTextures.clear();ownedMaterials.clear();textureCache.clear();state.root=null;
}
function releaseLimited(){
  const view=views.find(v=>v.id==='limited');if(!view?.model)return;
  view.scene.remove(view.model);view.model.traverse(node=>{if(node.geometry&&ownedGeometries.has(node.geometry)){node.geometry.dispose();ownedGeometries.delete(node.geometry);}for(const material of Array.isArray(node.material)?node.material:[node.material])if(material&&ownedMaterials.has(material)){material.dispose();ownedMaterials.delete(material);}});
  for(const t of textureCache.values()){t.dispose();ownedTextures.delete(t);}textureCache.clear();view.model=null;
}
function cloneTextureSettings(source,target){
  for(const key of ['wrapS','wrapT','flipY','channel'])target[key]=source[key];
  target.offset.copy(source.offset);target.repeat.copy(source.repeat);target.center.copy(source.center);target.rotation=source.rotation;
  // Nearest sampling avoids introducing blended colors between palette texels.
  target.magFilter=THREE.NearestFilter;target.minFilter=THREE.NearestFilter;target.generateMipmaps=false;target.colorSpace=THREE.SRGBColorSpace;target.needsUpdate=true;
}
function basicMaterial(source){return new THREE.MeshBasicMaterial({color:source.color||0xffffff,map:source.map||null,vertexColors:source.vertexColors,side:source.side,transparent:source.transparent,opacity:source.opacity,alphaTest:source.alphaTest,alphaMap:source.alphaMap,depthWrite:source.depthWrite});}
function limitedMaterial(source,palette,stats,hasVertexColors){
  const material=basicMaterial(source);ownMaterial(material);
  if(source.map&&hasVertexColors){state.warnings.push('存在纹理与顶点颜色同时相乘的网格：首版限色只处理基色纹理，关闭顶点色；该网格不能视为严格对照。');material.vertexColors=false;}
  if(source.map){
    const key=source.map.uuid+':'+(source.color?.toArray().join(',')||'white');
    if(textureCache.has(key))material.map=textureCache.get(key);
    else{
      const image=source.map.image;if(!image)throw Error('纹理未成功解码');
      const width=image.width||image.videoWidth,height=image.height||image.videoHeight;
      if(!width||!height)throw Error('纹理没有有效尺寸');
      const scale=Math.min(1,1024/Math.max(width,height));const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(width*scale));canvas.height=Math.max(1,Math.round(height*scale));
      const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(image,0,0,canvas.width,canvas.height);
      const data=ctx.getImageData(0,0,canvas.width,canvas.height),q=quantizePixels(data.data,palette,source.color?.toArray()||[1,1,1]);
      data.data.set(q.data);ctx.putImageData(data,0,0);const texture=new THREE.CanvasTexture(canvas);cloneTextureSettings(source.map,texture);ownedTextures.add(texture);textureCache.set(key,texture);material.map=texture;
      q.counts.forEach((x,i)=>stats.counts[i]+=x);stats.samples+=q.samples;stats.errorSum+=q.meanDeltaE*q.samples;stats.textureCount++;if(scale<1)stats.resampledTextures++;
    }
    material.color.set(0xffffff);
  }else if(!hasVertexColors){
    const rgb=(source.color||new THREE.Color(1,1,1)).clone().convertLinearToSRGB().toArray().map(x=>Math.round(x*255));const q=nearestPalette(rgb,palette);material.color.setRGB(...q.rgb.map(x=>x/255),THREE.SRGBColorSpace);stats.counts[q.index]++;stats.samples++;stats.errorSum+=q.deltaE;
  }
  return material;
}
function makeScene(mode){
  const root=state.root.clone(true),palette=makePalette(state.palette),stats={counts:Array(6).fill(0),samples:0,errorSum:0,textureCount:0,vertices:0,resampledTextures:0};
  root.traverse(node=>{
    if(!node.isMesh)return;
    const hasColors=!!node.geometry.getAttribute('color');
    const sources=Array.isArray(node.material)?node.material:[node.material];
    const originals=sources.map(m=>basicMaterial(m));
    if(mode==='original'){node.material=originals.map(ownMaterial);}
    if(mode==='gray')node.material=sources.map(source=>ownMaterial(new THREE.MeshStandardMaterial({color:0x9da8b3,roughness:.8,metalness:0,side:source.side})));
    if(mode==='limited'){
      // Only clone geometry when replacing its vertex colors.
      if(hasColors&&sources.every(m=>!m.map)){
        node.geometry=node.geometry.clone();ownedGeometries.add(node.geometry);
        const attr=node.geometry.getAttribute('color'),original=node.geometry.getAttribute('color'),values=new Float32Array(attr.count*3);
        const tint=sources[0]?.color||new THREE.Color(1,1,1);
        if(sources.length>1)state.warnings.push('多材质顶点色网格采用首个材质基色；此类网格限色为近似结果。');
        for(let i=0;i<attr.count;i++){
          const rgb=[original.getX(i)*tint.r,original.getY(i)*tint.g,original.getZ(i)*tint.b].map(x=>Math.max(0,Math.min(255,Math.round(linearToSrgb(x)*255))));
          const q=nearestPalette(rgb,palette);const color=new THREE.Color().setRGB(...q.rgb.map(x=>x/255),THREE.SRGBColorSpace);values.set(color.toArray(),i*3);stats.counts[q.index]++;stats.samples++;stats.errorSum+=q.deltaE;stats.vertices++;
        }
        node.geometry.setAttribute('color',new THREE.BufferAttribute(values,3));
      }
      node.material=sources.map(source=>limitedMaterial(source,palette,stats,hasColors));
      if(hasColors&&sources.every(m=>!m.map))for(const material of node.material)material.color.set(0xffffff);
    }
    if(!Array.isArray(stateOriginalMaterial(node)))node.material=node.material[0];
    if(node.isSkinnedMesh)state.warnings.push('骨骼模型只显示载入时姿态；未播放或验证动画。');
    if(mode!=='original')for(const m of originals)m.dispose();
  });
  if(mode==='limited'){stats.meanDeltaE=stats.samples?stats.errorSum/stats.samples:0;delete stats.errorSum;state.stats=stats;}
  return root;
}
// Preserve material array groups using the source node lookup established at load.
function stateOriginalMaterial(node){return node.userData.workbenchMaterialArray?[]:{};}
function updateMetrics(){
  const m=state.stats;if(!m){$('metrics').textContent='载入模型后显示纹理采样与映射色占比。';return;}
  $('metrics').replaceChildren();const summary=document.createElement('div');summary.textContent=`${m.textureCount} 张纹理 · ${m.samples.toLocaleString()} 个采样 · 平均 ΔE76 ${m.meanDeltaE.toFixed(2)}（数字色差）`;$('metrics').append(summary);
  const bars=document.createElement('div');bars.className='metric-bars';m.counts.forEach((n,i)=>{const bar=document.createElement('span');bar.style.background=state.palette[i];bar.style.width=(m.samples?n/m.samples*100:0)+'%';bars.append(bar);});$('metrics').append(bars);
  m.counts.forEach((n,i)=>{const item=document.createElement('span');item.className='metric-item';const dot=document.createElement('i');dot.className='metric-dot';dot.style.background=state.palette[i];item.append(dot,`${i+1}: ${(m.samples?n/m.samples*100:0).toFixed(1)}%`);$('metrics').append(item);});
  state.warnings=[...new Set(state.warnings)];if(state.warnings.length){const warning=document.createElement('p');warning.textContent=state.warnings.join(' ');warning.className='notice';$('metrics').append(warning);}
}
function refreshLimited(){if(!state.root)return;releaseLimited();state.warnings=[...state.baseWarnings];const v=views.find(v=>v.id==='limited');v.model=makeScene('limited');v.scene.add(v.model);state.dirty=false;updateMetrics();requestRender();}
function resetCamera(){state.restoredCamera=null;camera.position.set(2.8,1.8,3.8);for(const v of views){v.controls.target.set(0,0,0);v.controls.update();}requestRender();}
async function sha256(buffer){const hash=await crypto.subtle.digest('SHA-256',buffer);return [...new Uint8Array(hash)].map(x=>x.toString(16).padStart(2,'0')).join('');}
async function importModel(buffer,name){
  const sequence=++state.loadSequence;loading=true;$('demo').disabled=true;status('正在本地解析模型并计算六色预览……');
  try{
    if(views.length!==3)throw Error('WebGL 视图不可用');
    const inspection=validateGLB(buffer),hash=await sha256(buffer);
    const manager=new THREE.LoadingManager();manager.setURLModifier(url=>{if(url.startsWith('blob:')||url.startsWith('data:'))return url;throw Error('模型引用了外部资源，已阻止读取');});
    const loader=new GLTFLoader(manager);const gltf=await loader.parseAsync(buffer,'');
    if(sequence!==state.loadSequence){disposeDetached(gltf.scene);return;}
    const bounds=new THREE.Box3().setFromObject(gltf.scene),dimensions=bounds.getSize(new THREE.Vector3()),center=bounds.getCenter(new THREE.Vector3());
    if(![dimensions.x,dimensions.y,dimensions.z,center.x,center.y,center.z].every(Number.isFinite)||dimensions.length()===0){disposeDetached(gltf.scene);throw Error('模型尺寸或坐标无效');}
    disposeModel();state.root=new THREE.Group();state.root.add(gltf.scene);gltf.scene.position.sub(center);state.root.scale.setScalar(2/Math.max(dimensions.x,dimensions.y,dimensions.z));
    state.root.traverse(node=>{if(node.isMesh)node.userData.workbenchMaterialArray=Array.isArray(node.material);if(node.isLight)node.visible=false;});
    state.model={name,sha256:hash,bytes:buffer.byteLength,triangles:inspection.triangles,sourceDimensions:dimensions.toArray(),dimensionUnits:'GLB 坐标单位，未校验实际 mm',displayNormalization:'居中，最长轴归一至 2；不改源模型',synthetic:name==='非人像合成演示.glb'};
    state.baseWarnings=[];if(gltf.animations.length)state.baseWarnings.push('文件含动画：仅显示初始姿态。');
    if(inspection.doc.materials?.some(m=>m.extensions||m.normalTexture||m.emissiveTexture||m.pbrMetallicRoughness?.metallicRoughnessTexture))state.baseWarnings.push('原纹理与限色只对照无光照基色；金属度、粗糙度、发光、法线及材质扩展效果不纳入颜色对照。');
    if(inspection.doc.materials?.some(m=>m.alphaMode==='BLEND'))state.baseWarnings.push('模型含透明材质：保留透明度，但屏幕合成色不会严格等于六个色板值。');
    if(inspection.doc.meshes?.some(mesh=>mesh.primitives?.some(pr=>pr.attributes?.COLOR_0!==undefined)))state.baseWarnings.push('顶点色限色后，三角面内插值仍可能出现中间色；不能视为离散打印分区。');
    state.warnings=[...state.baseWarnings];for(const v of views){v.model=makeScene(v.id);v.scene.add(v.model);}state.dirty=false;
    $('model-info').textContent=`${name} · ${inspection.triangles.toLocaleString()} 面 · ${(buffer.byteLength/1048576).toFixed(2)} MB · 源尺寸 ${dimensions.toArray().map(x=>x.toFixed(3)).join(' × ')}（源单位）`;
    if(state.restoredCamera){camera.position.fromArray(state.restoredCamera.position);for(const v of views)v.controls.target.fromArray(state.restoredCamera.target);views[0].controls.update();requestRender();}else resetCamera();updateMetrics();status('模型已载入。原纹理与限色采用无光照基色显示；灰模使用几何光照。文件没有上传。');
  }catch(error){if(sequence===state.loadSequence)status('模型载入失败：'+(error.message||'文件不兼容')+'。原文件未修改。',true);}
  finally{if(sequence===state.loadSequence){loading=false;$('demo').disabled=false;}}
}
function disposeDetached(root){const geometries=new Set(),materials=new Set(),textures=new Set();root.traverse(n=>{if(n.geometry)geometries.add(n.geometry);for(const m of Array.isArray(n.material)?n.material:[n.material])if(m){materials.add(m);for(const t of Object.values(m))if(t?.isTexture)textures.add(t);}});geometries.forEach(g=>g.dispose());textures.forEach(t=>t.dispose());materials.forEach(m=>m.dispose());}
$('model-file').addEventListener('change',async event=>{const file=event.target.files[0];event.target.value='';if(!file)return;if(!file.name.toLowerCase().endsWith('.glb'))return status('请选择 .glb 文件。',true);if(file.size>64*1024*1024)return status('首版最多支持 64 MB GLB。',true);await importModel(await file.arrayBuffer(),file.name);});
$('demo').addEventListener('click',async()=>{try{const response=await fetch(new URL('./demo.glb',import.meta.url));if(!response.ok)throw Error('演示资源不可用');await importModel(await response.arrayBuffer(),'非人像合成演示.glb');}catch(e){status(e.message,true);}});
$('image-file').addEventListener('change',async event=>{
  const file=event.target.files[0];event.target.value='';if(!file)return;
  if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>20*1024*1024)return status('请选择 ≤20 MB 的 PNG、JPEG 或 WebP 原图。',true);
  const url=URL.createObjectURL(file),image=new Image();image.onload=async()=>{if(image.naturalWidth*image.naturalHeight>40000000){URL.revokeObjectURL(url);return status('图片超过 4000 万像素，请提供较小副本。',true);}const hash=await sha256(await file.arrayBuffer());if(referenceURL)URL.revokeObjectURL(referenceURL);referenceURL=url;$('reference').src=url;$('reference').hidden=false;$('reference-empty').hidden=true;$('reference-empty').style.display='none';state.image={name:file.name,sha256:hash,bytes:file.size,width:image.naturalWidth,height:image.naturalHeight};$('image-info').textContent=`${file.name} · ${image.naturalWidth} × ${image.naturalHeight} · 未上传`;status('原图已在本地载入，仅用于人工对照。');};image.onerror=()=>{URL.revokeObjectURL(url);status('原图无法解码。已有图片保留。',true);};image.src=url;
});
$('reset-camera').addEventListener('click',resetCamera);
$('apply-palette').addEventListener('click',async()=>{if(loading)return status('请等待模型载入后再应用色板。',true);$('apply-palette').disabled=true;status('正在应用六色映射……');await new Promise(resolve=>requestAnimationFrame(resolve));try{makePalette(state.palette);refreshLimited();status(state.root?'色板已应用：纹理按 CIELAB 最近色映射。':'色板已更新，载入模型后计算预览。');}catch(e){status('限色失败：'+e.message,true);}finally{$('apply-palette').disabled=false;}});
$('reset-palette').addEventListener('click',()=>{state.palette=[...DEFAULT_PALETTE];drawPalette();try{refreshLimited();status('已恢复六个未标定示例色。');}catch(e){status(e.message,true);}});
function snapshot(){
  if(loading)throw Error('模型仍在载入，请稍后保存');if(state.dirty)refreshLimited();
  const result={schema:'portrait-validation.v1',createdAt:new Date().toISOString(),palette:[...state.palette],paletteCalibrated:false,nozzleMm:Number($('nozzle').value),sizeMm:Number($('size').value),subject:$('subject').value,notes:$('notes').value,camera:{position:camera.position.toArray(),target:views[0]?.controls.target.toArray()||[0,0,0]},model:state.model,image:state.image,statistics:state.stats,warnings:state.warnings,algorithm:{name:'sRGB → CIELAB D65 → nearest ΔE76',tieBreak:'first palette entry',textureMaxEdge:1024,textureFilter:'nearest',dithering:false},evidence:{digitalPreview:!!state.root,identitySimilarity:'未验证；人工观察',semanticAI:false,physicalPalette:'未标定',slicing:'未执行',printing:'未执行',tripo:'未启用'}};
  return validateExperiment(result);
}
function restore(value){validateExperiment(value);state.palette=[...value.palette];drawPalette();$('nozzle').value=value.nozzleMm;$('size').value=value.sizeMm;$('subject').value=value.subject;$('notes').value=typeof value.notes==='string'?value.notes:'';
  if(value.camera){state.restoredCamera=value.camera;camera.position.fromArray(value.camera.position);for(const v of views)v.controls.target.fromArray(value.camera.target);views[0]?.controls.update();}
  refreshLimited();requestRender();$('save-info').textContent='已恢复参数与视角。原图、模型和统计不从 JSON 伪造恢复；请重新选择相同文件。';status('实验参数已恢复。文件 SHA-256 可用于人工确认是否为同一组输入。');}
function download(blob,name){const link=document.createElement('a'),url=URL.createObjectURL(blob);link.href=url;link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(url),3000);}
function safe(action){try{action();}catch(e){status(e.message,true);}}
$('save').addEventListener('click',()=>safe(()=>{localStorage.setItem('portrait-validation.v1',JSON.stringify(snapshot()));$('save-info').textContent='参数、视角与观察记录已保存到此浏览器；没有保存照片、模型或密钥。';status('实验已保存到此浏览器。');}));
$('restore').addEventListener('click',()=>safe(()=>{const data=localStorage.getItem('portrait-validation.v1');if(!data)throw Error('此浏览器暂无已保存实验');restore(JSON.parse(data));}));
$('export-json').addEventListener('click',()=>safe(()=>{download(new Blob([JSON.stringify(snapshot(),null,2)],{type:'application/json'}),'六色实验-'+Date.now()+'.json');status('JSON 已导出，包含参数、文件哈希、观察记录及未验证事项。');}));
$('experiment-file').addEventListener('change',async event=>{const file=event.target.files[0];event.target.value='';if(!file)return;try{if(file.size>1048576)throw Error('实验 JSON 不能超过 1 MB');restore(JSON.parse(await file.text()));}catch(e){status('无法恢复实验：'+e.message,true);}});
$('export-png').addEventListener('click',()=>safe(()=>{
  if(!state.root)throw Error('请先载入模型再导出 PNG');const data=snapshot();render();
  const canvas=document.createElement('canvas');canvas.width=1800;canvas.height=1040;const ctx=canvas.getContext('2d');ctx.fillStyle='#101820';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.fillStyle='#e7f1f8';ctx.font='bold 30px Microsoft YaHei, sans-serif';ctx.fillText('六色实验 / 数字对照',40,54);ctx.font='18px Microsoft YaHei, sans-serif';ctx.fillStyle='#b1c5d6';ctx.fillText(`喷嘴 ${data.nozzleMm} mm · 目标 ${data.sizeMm} mm · ${$('subject').selectedOptions[0].textContent} · 未标定 / 未切片 / 未打印`,40,90);
  views.forEach((v,i)=>{ctx.fillStyle='#dbe8f1';ctx.font='22px Microsoft YaHei, sans-serif';ctx.fillText(['原纹理 · 无光照基色','灰模 · 几何光照','六色限色 · 数字近似'][i],40+i*590,138);const image=v.renderer.domElement,scale=Math.min(560/image.width,520/image.height),w=image.width*scale,h=image.height*scale;ctx.drawImage(image,30+i*590+(560-w)/2,155+(520-h)/2,w,h);});
  data.palette.forEach((hex,i)=>{ctx.fillStyle=hex;ctx.fillRect(40+i*185,700,150,34);ctx.fillStyle='#dbe8f1';ctx.font='17px Microsoft YaHei, sans-serif';ctx.fillText(`${i+1} ${hex.toUpperCase()}`,40+i*185,760);});
  ctx.fillStyle='#adbece';ctx.font='17px Microsoft YaHei, sans-serif';ctx.fillText('模型：'+data.model.name.slice(0,70),40,805);ctx.fillText('SHA-256：'+data.model.sha256,40,838);ctx.fillText('限色算法：CIELAB 最近 ΔE76；纹理长边 ≤1024；非物理叠色配方；不是可切片打印分区。',40,871);
  if(data.image)ctx.fillText('原图：'+data.image.name.slice(0,70)+'（图像内容未嵌入导出）',40,904);
  const notes=(data.notes||'无人工记录').replace(/\s+/g,' ');ctx.fillText('观察：'+notes.slice(0,90),40,938);ctx.fillText(new Date().toLocaleString('zh-CN'),40,991);
  canvas.toBlob(blob=>{if(blob){download(blob,'六色对照-'+Date.now()+'.png');status('对照 PNG 已导出。实验完整记录请另存 JSON。');}else status('PNG 导出失败，请重试。',true);},'image/png');
}));
window.addEventListener('pagehide',()=>{disposeModel();if(referenceURL)URL.revokeObjectURL(referenceURL);for(const v of views){v.controls.dispose();v.renderer.dispose();}});
// Read-only diagnostics for local QA; no provider bridge or secret access.
window.workbenchDiagnostics=()=>({model:state.model,stats:state.stats,viewCount:views.length,camera:camera.position.toArray(),targets:views.map(v=>v.controls.target.toArray()),palette:[...state.palette],warnings:state.warnings,loading,geometryCount:ownedGeometries.size,textureCount:ownedTextures.size});
