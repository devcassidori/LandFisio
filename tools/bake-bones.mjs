// Gera assets/bones.bin: esculpe os ossos (SDF → Marching Cubes), solda vértices,
// simplifica e comprime com meshoptimizer. A página só baixa e decodifica o resultado.
//
//   cd tools && npm install && npm run bake
//
// Opções: node bake-bones.mjs [proporção de triângulos=0.2] [erro máx. relativo=0.003] [bits de posição=14]
import * as THREE from 'three';
import { MarchingCubes } from 'three/examples/jsm/objects/MarchingCubes.js';
import { MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer';
import { BONES, buildField } from './bones-sdf.mjs';
import fs from 'fs';

const RATIO = +(process.argv[2] ?? 0.2), MAX_ERR = +(process.argv[3] ?? 0.003), POS_BITS = +(process.argv[4] ?? 14);
const OUT = new URL('../assets/bones.bin', import.meta.url);

/* ---- lista de ossos (mesmas caixas/resoluções da cena; as chaves batem com o index.html) ---- */
const scap = new THREE.Shape();
scap.moveTo(-.32,.22); scap.quadraticCurveTo(-1.0,.5,-1.85,.42);
scap.quadraticCurveTo(-1.75,-1.0,-1.45,-2.25); scap.quadraticCurveTo(-.9,-1.0,-.36,-.28);
scap.quadraticCurveTo(-.28,0,-.32,.22);
const scapPoly = scap.getPoints(10).map(v=>[v.x,v.y]).filter((p,i,a)=>{ const q=a[(i+a.length-1)%a.length]; return Math.hypot(p[0]-q[0],p[1]-q[1])>1e-4; });

const jobs = new Map();
const add = (key,name,args,bmin,bmax,res)=>{ if(!jobs.has(key)) jobs.set(key,{name,args,bmin,bmax,res}); };
add('girdle','girdle',[scapPoly],[-2.32,-2.42,-.62],[.32,.78,.48],112);
add('humerus','humerus',[],[-.44,-3.82,-.38],[.62,.3,.38],104);
add('ulna','ulna',[],[-.44,-3.18,-.34],[.22,.52,.32],104);
add('radiusShaft','radiusShaft',[],[-.05,-3.22,-.24],[.56,-.18,.24],104);
add('headA','headA',[],[-.05,-.46,-.22],[.44,.02,.26],56);
add('headB','headB',[],[-.05,-.46,-.22],[.44,.02,.26],56);
add('carpals','carpals',[],[-.26,-.43,-.13],[.37,.03,.17],60);
const hand = (L,s,distal=false)=> add(`hand:${L},${s},${distal}`,'hand',[L,s,distal],[-.11,-L-.06,-.1],[.11,.06,.11],40);
const ML=[.72,.75,.68,.6], PL=[[.42,.27,.2],[.47,.3,.21],[.44,.29,.2],[.34,.21,.18]];
ML.forEach((m,i)=>{ hand(m,1); PL[i].forEach((L,k)=>hand(L,.85-k*.1,k===2)); });
hand(.5,1.05); [.34,.25].forEach((L,k)=>hand(L,1-k*.1,k===1));

await MeshoptEncoder.ready; await MeshoptSimplifier.ready;
const parts = []; let triIn = 0, triOut = 0;

for (const [key,{name,args,bmin,bmax,res}] of jobs){
  /* 1. SDF → Marching Cubes (sopa de triângulos) */
  const field = buildField(BONES[name](...args), bmin, bmax, res);
  const mc = new MarchingCubes(res, new THREE.MeshBasicMaterial(), false, false, 160000);
  mc.reset(); mc.field.set(field); mc.isolation = 0; mc.update();
  const cx=(bmin[0]+bmax[0])/2, cy=(bmin[1]+bmax[1])/2, cz=(bmin[2]+bmax[2])/2;
  const hx=(bmax[0]-bmin[0])/2, hy=(bmax[1]-bmin[1])/2, hz=(bmax[2]-bmin[2])/2;
  const cnt = mc.count, MP = mc.positionArray, MN = mc.normalArray;

  /* 2. solda vértices repetidos e acumula normais */
  const map = new Map(), pos = [], nor = [], idx = new Uint32Array(cnt);
  for (let i=0;i<cnt;i++){
    const x=cx+MP[i*3]*hx, y=cy+MP[i*3+1]*hy, z=cz+MP[i*3+2]*hz;
    const nx=MN[i*3]/hx, ny=MN[i*3+1]/hy, nz=MN[i*3+2]/hz, l=Math.hypot(nx,ny,nz)||1;   // gradiente → normal no grid esticado
    const k = Math.round(x*1e5)+','+Math.round(y*1e5)+','+Math.round(z*1e5);
    let v = map.get(k);
    if (v === undefined){ v = pos.length/3; map.set(k,v); pos.push(x,y,z); nor.push(0,0,0); }
    nor[v*3]+=nx/l; nor[v*3+1]+=ny/l; nor[v*3+2]+=nz/l; idx[i]=v;
  }
  const tris = []; for (let t=0;t<cnt;t+=3){ const a=idx[t],b=idx[t+1],c=idx[t+2]; if(a!==b&&b!==c&&a!==c) tris.push(a,b,c); }
  const P = new Float32Array(pos), N = new Float32Array(nor), V = P.length/3;
  for (let v=0;v<V;v++){ const l=Math.hypot(N[v*3],N[v*3+1],N[v*3+2])||1; N[v*3]/=l; N[v*3+1]/=l; N[v*3+2]/=l; }

  /* 3. simplificação preservando forma e normais */
  const I0 = new Uint32Array(tris); triIn += I0.length/3;
  const target = Math.floor(I0.length*RATIO/3)*3;
  const [I] = MeshoptSimplifier.simplifyWithAttributes(I0, P, 3, N, 3, [.5,.5,.5], null, target, MAX_ERR, []);

  /* 4. compacta, reordena para cache/compressão e quantiza (posição POS_BITS, normal 8 bits) */
  const used = new Int32Array(V).fill(-1), back = []; const I2 = new Uint32Array(I.length);
  for (let i=0;i<I.length;i++){ const v=I[i]; if(used[v]<0){ used[v]=back.length; back.push(v); } I2[i]=used[v]; }
  const [remap, nv] = MeshoptEncoder.reorderMesh(I2, true, true);
  const lo=[1e9,1e9,1e9], hi=[-1e9,-1e9,-1e9];
  for (const v of back) for(let c=0;c<3;c++){ lo[c]=Math.min(lo[c],P[v*3+c]); hi[c]=Math.max(hi[c],P[v*3+c]); }
  const QMAX = (1<<POS_BITS)-1, qp = new Uint16Array(nv*4), qn = new Int8Array(nv*4);
  back.forEach((v,c0)=>{ const o=remap[c0]; if(o===0xffffffff) return;
    for (let c=0;c<3;c++){ qp[o*4+c]=Math.round((P[v*3+c]-lo[c])/((hi[c]-lo[c])||1)*QMAX); qn[o*4+c]=Math.round(N[v*3+c]*127); } });
  triOut += I2.length/3;
  parts.push({ key, nv, ni:I2.length, lo, hi,
    vb: MeshoptEncoder.encodeVertexBufferLevel(new Uint8Array(qp.buffer), nv, 8, 2, 0),
    nb: MeshoptEncoder.encodeVertexBufferLevel(new Uint8Array(qn.buffer), nv, 4, 2, 0),
    ib: MeshoptEncoder.encodeIndexBuffer(new Uint8Array(I2.buffer), I2.length, 4) });
}

/* ---- arquivo: [u32 tamanho do cabeçalho][cabeçalho JSON][buffers meshopt] ---- */
let off = 0;
const header = parts.map(p=>{
  const h = { k:p.key, nv:p.nv, ni:p.ni, q:(1<<POS_BITS)-1, min:p.lo.map(x=>+x.toFixed(6)), max:p.hi.map(x=>+x.toFixed(6)) };
  h.v=[off,p.vb.length]; off+=p.vb.length; h.n=[off,p.nb.length]; off+=p.nb.length; h.i=[off,p.ib.length]; off+=p.ib.length;
  return h; });
const hj = new TextEncoder().encode(JSON.stringify(header)), pad = (4-hj.length%4)%4;
const buf = new Uint8Array(4+hj.length+pad+off);
new DataView(buf.buffer).setUint32(0, hj.length+pad, true);
buf.set(hj,4); buf.fill(32, 4+hj.length, 4+hj.length+pad);
let o = 4+hj.length+pad; for (const p of parts){ for (const b of [p.vb,p.nb,p.ib]){ buf.set(b,o); o+=b.length; } }
fs.mkdirSync(new URL('../assets/', import.meta.url), { recursive:true });
fs.writeFileSync(OUT, buf);
console.log(`${parts.length} malhas · ${triIn} → ${triOut} triângulos · ${(buf.length/1024).toFixed(0)} KB → assets/bones.bin`);
