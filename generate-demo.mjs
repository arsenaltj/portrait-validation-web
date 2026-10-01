import * as THREE from 'three';
import fs from 'node:fs';
import zlib from 'node:zlib';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.dirname(fileURLToPath(import.meta.url));
function crc32(buffer){let crc=0xffffffff;for(const b of buffer){crc^=b;for(let i=0;i<8;i++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}return (crc^0xffffffff)>>>0;}
function chunk(name,data){const type=Buffer.from(name),length=Buffer.alloc(4),crc=Buffer.alloc(4);length.writeUInt32BE(data.length);crc.writeUInt32BE(crc32(Buffer.concat([type,data])));return Buffer.concat([length,type,data,crc]);}
const width=128,height=128,rows=Buffer.alloc(height*(width*4+1));
for(let y=0;y<height;y++)for(let x=0;x<width;x++){const at=y*(width*4+1)+1+x*4;rows[at]=Math.round(x/(width-1)*255);rows[at+1]=Math.round(y/(height-1)*255);rows[at+2]=Math.round((Math.sin(x/10)*.5+.5)*220);rows[at+3]=255;}
const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(width,0);ihdr.writeUInt32BE(height,4);ihdr[8]=8;ihdr[9]=6;
const png=Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',ihdr),chunk('IDAT',zlib.deflateSync(rows)),chunk('IEND',Buffer.alloc(0))]);
const geometry=new THREE.TorusKnotGeometry(1,.32,96,12).toNonIndexed();
const parts=[],views=[];let offset=0;
function append(data,target){const buffer=Buffer.from(data.buffer,data.byteOffset,data.byteLength);const padding=(4-buffer.length%4)%4;views.push({buffer:0,byteOffset:offset,byteLength:buffer.length,...(target?{target}:{})});parts.push(buffer,Buffer.alloc(padding));offset+=buffer.length+padding;return views.length-1;}
const positions=geometry.getAttribute('position').array,normals=geometry.getAttribute('normal').array,uv=geometry.getAttribute('uv').array;
const posView=append(positions,34962),normView=append(normals,34962),uvView=append(uv,34962),imageView=append(png);
geometry.computeBoundingBox();const bbox=geometry.boundingBox;
const doc={asset:{version:'2.0',generator:'Local synthetic non-portrait texture fixture'},scene:0,scenes:[{nodes:[0]}],nodes:[{mesh:0}],meshes:[{primitives:[{attributes:{POSITION:0,NORMAL:1,TEXCOORD_0:2},material:0}]}],materials:[{name:'Synthetic gradient',pbrMetallicRoughness:{baseColorTexture:{index:0},metallicFactor:0,roughnessFactor:.7}}],textures:[{source:0,sampler:0}],samplers:[{magFilter:9729,minFilter:9729,wrapS:10497,wrapT:10497}],images:[{bufferView:imageView,mimeType:'image/png'}],accessors:[{bufferView:posView,componentType:5126,count:positions.length/3,type:'VEC3',min:bbox.min.toArray(),max:bbox.max.toArray()},{bufferView:normView,componentType:5126,count:normals.length/3,type:'VEC3'},{bufferView:uvView,componentType:5126,count:uv.length/2,type:'VEC2'}],bufferViews:views,buffers:[{byteLength:offset}]};
let json=Buffer.from(JSON.stringify(doc));json=Buffer.concat([json,Buffer.alloc((4-json.length%4)%4,32)]);const binary=Buffer.concat(parts),header=Buffer.alloc(12),jh=Buffer.alloc(8),bh=Buffer.alloc(8);header.writeUInt32LE(0x46546c67,0);header.writeUInt32LE(2,4);header.writeUInt32LE(28+json.length+binary.length,8);jh.writeUInt32LE(json.length);jh.writeUInt32LE(0x4e4f534a,4);bh.writeUInt32LE(binary.length);bh.writeUInt32LE(0x004e4942,4);
fs.writeFileSync(path.join(root,'demo.glb'),Buffer.concat([header,jh,json,bh,binary]));
fs.mkdirSync(path.join(root,'tests','fixtures'),{recursive:true});fs.writeFileSync(path.join(root,'tests','fixtures','synthetic-reference.png'),png);
console.log('Generated one local non-portrait torus-knot GLB and a synthetic reference PNG');
