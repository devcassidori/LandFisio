// Campos de distância (SDF) que esculpem cada osso da cena.
// Usado só pelo tools/bake-bones.mjs para gerar assets/bones.bin — não é carregado pela página.

const clamp=(v,a=0,b=1)=>Math.min(b,Math.max(a,v));
const sminK=(a,b,k)=>{ const h=Math.max(k-Math.abs(a-b),0)/k; return Math.min(a,b)-h*h*k*.25; };
const smaxK=(a,b,k)=>-sminK(-a,-b,k);
const sdSphere=(x,y,z,cx,cy,cz,r)=>Math.hypot(x-cx,y-cy,z-cz)-r;
function sdEll(x,y,z,cx,cy,cz,rx,ry,rz){ x-=cx; y-=cy; z-=cz;
  const k0=Math.hypot(x/rx,y/ry,z/rz), k1=Math.hypot(x/(rx*rx),y/(ry*ry),z/(rz*rz));
  return k1>1e-9 ? k0*(k0-1)/k1 : -Math.min(rx,ry,rz); }
function sdCone(px,py,pz,a,b,r1,r2){ // tapered capsule (round cone)
  const bax=b[0]-a[0], bay=b[1]-a[1], baz=b[2]-a[2];
  const l2=bax*bax+bay*bay+baz*baz, rr=r1-r2, a2=l2-rr*rr, il2=1/l2;
  const pax=px-a[0], pay=py-a[1], paz=pz-a[2];
  const y=pax*bax+pay*bay+paz*baz, z=y-l2;
  const qx=pax*l2-bax*y, qy=pay*l2-bay*y, qz=paz*l2-baz*y;
  const x2=qx*qx+qy*qy+qz*qz, y2=y*y*l2, z2=z*z*l2, k=Math.sign(rr)*rr*rr*x2;
  if(Math.sign(z)*a2*z2>k) return Math.sqrt(x2+z2)*il2-r2;
  if(Math.sign(y)*a2*y2<k) return Math.sqrt(x2+y2)*il2-r1;
  return (Math.sqrt(x2*a2*il2)+y*rr)*il2-r1; }
function sdChain(x,y,z,k,blend=.05){ let d=1e9; for(let i=0;i<k.length-1;i++) d=sminK(d,sdCone(x,y,z,k[i],k[i+1],k[i][3],k[i+1][3]),blend); return d; }
function sdSpool(x,y,z,cx,cy,cz,halfW,rMid,rEdge){ const dx=x-cx, t=Math.min(Math.abs(dx)/halfW,1), r=rMid+(rEdge-rMid)*t*t;
  return smaxK(Math.hypot(y-cy,z-cz)-r, Math.abs(dx)-halfW, .04); }
function sdPoly2(x,y,V){ let d=(x-V[0][0])**2+(y-V[0][1])**2, s=1;
  for(let i=0,j=V.length-1;i<V.length;j=i,i++){ const ex=V[j][0]-V[i][0], ey=V[j][1]-V[i][1], wx=x-V[i][0], wy=y-V[i][1];
    const t=clamp((wx*ex+wy*ey)/Math.max(ex*ex+ey*ey,1e-9)), bx=wx-ex*t, by=wy-ey*t; d=Math.min(d,bx*bx+by*by);
    const c1=y>=V[i][1], c2=y<V[j][1], c3=ex*wy>ey*wx; if((c1&&c2&&c3)||(!c1&&!c2&&!c3)) s=-s; }
  return s*Math.sqrt(d); }
const grain=(x,y,z)=>.004*Math.sin(x*41+y*13)*Math.sin(z*37+y*17)+.003*Math.sin(y*63+x*29+z*23);

const CUT=-.3, TROCH_Y=-3.54;
function RAD(x,y,z){
  let d=sdChain(x,y,z,[[.19,-.2,.02,.075],[.19,-.42,.02,.075],[.22,-1.4,.01,.085],[.22,-2.4,0,.1],[.23,-2.8,0,.14]],.06);
  const hx=x-.19, hy=y+.13, hz=z-.02, dd=Math.hypot(hx,hz)-.13, dh=Math.abs(hy)-.055;
  d=sminK(d, Math.min(Math.max(dd,dh),0)+Math.hypot(Math.max(dd,0),Math.max(dh,0))-.025, .05);   // radial head
  d=smaxK(d,-sdSphere(x,y,z,.19,.11,.06,.15),.02);                                                // fovea
  d=sminK(d,sdEll(x,y,z,.13,-.62,.03,.055,.12,.06),.05);                                          // radial tuberosity
  d=sminK(d,sdChain(x,y,z,[[.16,-.9,.05,.02],[.15,-2.2,.04,.015]]),.05);                          // interosseous crest
  d=sminK(d,sdEll(x,y,z,.22,-2.86,0,.23,.13,.13),.08);                                            // distal end
  d=sminK(d,sdChain(x,y,z,[[.38,-2.82,0,.06],[.44,-3.04,0,.03]]),.05);                            // styloid
  d=smaxK(d,-sdEll(x,y,z,.17,-3.13,0,.22,.1,.13),.03);                                            // carpal facet
  return d; }
const cutAt=(x,z)=>CUT+.03*Math.sin((x-.19)*45+1)+.025*Math.cos((z-.02)*38)+.015*Math.sin((x+z)*70);
const splitAt=(x,y,z)=>(x-.19)*Math.cos(.7)+(z-.02)*Math.sin(.7)-.02+.012*Math.sin(y*90);
const RAD_UP=(x,y,z)=>Math.max(RAD(x,y,z),cutAt(x,z)-y);
const CARPALS=[[.2,-.1,.01,.1,.06,.06],[.06,-.09,0,.07,.065,.06],[-.07,-.1,-.01,.065,.06,.055],[-.12,-.11,.07,.045,.045,.04],
  [.24,-.27,.03,.07,.07,.06],[.12,-.28,0,.055,.06,.05],[.01,-.27,0,.065,.1,.06],[-.12,-.26,0,.07,.09,.06],[-.13,-.27,.08,.03,.04,.04]];

const BONES={
  girdle:(poly)=>(x,y,z)=>{                                   // scapula, spine, acromion, coracoid, glenoid, clavicle
    const d2=sdPoly2(x,y,poly), th=.022+.03*clamp((x+.9)/.6), dz=Math.abs(z+.45)-th;
    let d=Math.min(Math.max(d2,dz),0)+Math.hypot(Math.max(d2,0),Math.max(dz,0))-.012;
    d=sminK(d,sdChain(x,y,z,[[-.42,-.32,-.43,.06],[-.95,-1.3,-.45,.045],[-1.42,-2.18,-.45,.035]]),.06);
    d=sminK(d,sdChain(x,y,z,[[-1.8,.3,-.4,.025],[-1.0,.36,-.33,.05],[-.3,.42,-.22,.07]]),.06);
    d=sminK(d,sdEll(x,y,z,.02,.48,-.08,.2,.07,.16),.07);
    d=sminK(d,sdChain(x,y,z,[[-.32,.3,-.28,.07],[-.3,.36,-.02,.055],[-.16,.3,.17,.04]]),.05);
    d=sminK(d,sdEll(x,y,z,-.37,-.02,-.08,.08,.25,.18),.08);
    d=smaxK(d,-sdSphere(x,y,z,-.03,-.1,0,.32),.03);
    return Math.min(d,sdChain(x,y,z,[[0,.53,.05,.07],[-.5,.6,.24,.058],[-1.2,.56,.3,.052],[-1.8,.52,.16,.066],[-2.15,.5,.1,.085]],.08)); },
  humerus:()=>(x,y,z)=>{
    let d=sdEll(x,y,z,-.03,-.1,0,.29,.3,.29);                                                       // head
    d=sminK(d,sdChain(x,y,z,[[.03,-.22,0,.2],[.1,-.55,0,.15],[.11,-1.5,0,.125],[.1,-2.5,-.01,.13],[.1,-2.95,-.03,.16]]),.12);
    d=sminK(d,sdEll(x,y,z,.26,-.2,.03,.13,.19,.15),.07);                                            // greater tubercle
    d=sminK(d,sdEll(x,y,z,.13,-.3,.17,.08,.1,.07),.05);                                             // lesser tubercle
    d=smaxK(d,-sdChain(x,y,z,[[.2,-.14,.21,.035],[.15,-.85,.15,.03]]),.03);                         // bicipital groove
    d=sminK(d,sdEll(x,y,z,.22,-1.35,.02,.06,.3,.07),.08);                                           // deltoid tuberosity
    d=sminK(d,sdEll(x,y,z,.09,-3.22,-.03,.33,.26,.1),.1);                                           // supracondylar flare
    d=sminK(d,sdEll(x,y,z,-.25,-3.4,-.03,.11,.1,.09),.06);                                          // medial epicondyle
    d=sminK(d,sdEll(x,y,z,.41,-3.38,-.03,.07,.09,.08),.05);                                         // lateral epicondyle
    d=sminK(d,sdSpool(x,y,z,-.02,TROCH_Y,.03,.17,.115,.165),.05);                                   // trochlea
    d=sminK(d,sdSphere(x,y,z,.25,TROCH_Y+.01,.07,.125),.05);                                        // capitulum
    d=smaxK(d,-sdEll(x,y,z,.02,-3.28,-.13,.13,.15,.06),.03);                                        // olecranon fossa
    return smaxK(d,-sdEll(x,y,z,0,-3.3,.11,.1,.08,.04),.03); },                                     // coronoid fossa
  ulna:()=>(x,y,z)=>{
    let d=sdChain(x,y,z,[[-.1,.36,-.15,.1],[-.12,.1,-.13,.13],[-.14,-.22,-.04,.115],[-.16,-.7,-.02,.08],[-.17,-1.6,-.01,.065],[-.18,-2.6,0,.06],[-.17,-2.9,0,.085]],.08);
    d=sminK(d,sdEll(x,y,z,-.08,-.1,.13,.1,.07,.11),.06);                                            // coronoid process
    d=sminK(d,sdChain(x,y,z,[[-.15,-.9,.05,.02],[-.1,-2.2,.04,.015]]),.05);                         // interosseous crest
    d=smaxK(d,-sdSpool(x,y,z,-.08,.1,.03,.2,.13,.18),.025);                                         // trochlear notch
    d=smaxK(d,-sdSphere(x,y,z,.19,-.13,.02,.15),.02);                                               // radial notch
    return sminK(d,sdChain(x,y,z,[[-.2,-2.92,-.04,.045],[-.22,-3.08,-.04,.025]]),.03); },          // styloid
  radiusShaft:()=>(x,y,z)=>Math.max(RAD(x,y,z),y-cutAt(x,z)),
  headA:()=>(x,y,z)=>Math.max(RAD_UP(x,y,z),-splitAt(x,y,z),-(y+.22)),
  headB:()=>(x,y,z)=>Math.max(RAD_UP(x,y,z),Math.min(splitAt(x,y,z),y+.22)),
  carpals:()=>(x,y,z)=>{ let d=1e9; for(const c of CARPALS) d=sminK(d,sdEll(x,y,z,...c),.012); return d; },
  hand:(L,s,distal)=>(x,y,z)=>{                                // metacarpal / phalanx: base, waisted shaft, head or tuft
    let d=sdEll(x,y,z,0,-.03,0,.062*s,.045,.055*s);
    d=sminK(d,sdChain(x,y,z,[[0,-.05,0,.036*s],[0,-L*.5,.008,.028*s],[0,-L+.06,.012,.03*s]]),.04);
    return sminK(d, distal ? sdEll(x,y,z,0,-L+.035,.01,.042*s,.032,.022*s) : sdEll(x,y,z,0,-L+.035,.012,.052*s,.038,.046*s), .03); }
};

// sample -(sdf) on an n^3 lattice fitted to the box; exact only near the surface (narrow band)
function buildField(sdf,bmin,bmax,n){
  const f=new Float32Array(n*n*n), h=n/2, n2=n*n;
  const cx=(bmin[0]+bmax[0])/2, cy=(bmin[1]+bmax[1])/2, cz=(bmin[2]+bmax[2])/2;
  const hx=(bmax[0]-bmin[0])/2, hy=(bmax[1]-bmin[1])/2, hz=(bmax[2]-bmin[2])/2;
  const val=(i,j,k)=>{ const px=cx+((i-h)/h)*hx, py=cy+((j-h)/h)*hy, pz=cz+((k-h)/h)*hz; return -(sdf(px,py,pz)+grain(px,py,pz)); };
  const S=4, m=Math.ceil((n-1)/S), cs=m+1, C=new Float32Array(cs*cs*cs), ci=c=>Math.min(c*S,n-1);
  for(let k=0;k<cs;k++) for(let j=0;j<cs;j++) for(let i=0;i<cs;i++) C[i+j*cs+k*cs*cs]=val(ci(i),ci(j),ci(k));
  const band=1.5*S*2*Math.max(hx,hy,hz)/n;
  for(let k=0;k<m;k++) for(let j=0;j<m;j++) for(let i=0;i<m;i++){
    const q=i+j*cs+k*cs*cs, c000=C[q], c100=C[q+1], c010=C[q+cs], c110=C[q+1+cs],
          c001=C[q+cs*cs], c101=C[q+1+cs*cs], c011=C[q+cs+cs*cs], c111=C[q+1+cs+cs*cs];
    const near=Math.min(Math.abs(c000),Math.abs(c100),Math.abs(c010),Math.abs(c110),Math.abs(c001),Math.abs(c101),Math.abs(c011),Math.abs(c111))<band;
    const i0=ci(i), j0=ci(j), k0=ci(k), i1=ci(i+1), j1=ci(j+1), k1=ci(k+1);
    for(let kk=k0;kk<=k1;kk++){ const tz=(kk-k0)/((k1-k0)||1);
      for(let jj=j0;jj<=j1;jj++){ const ty=(jj-j0)/((j1-j0)||1), o=kk*n2+jj*n;
        for(let ii=i0;ii<=i1;ii++){
          if(near){ f[o+ii]=val(ii,jj,kk); continue; }
          const tx=(ii-i0)/((i1-i0)||1);
          const a0=c000+(c100-c000)*tx, a1=c010+(c110-c010)*tx, a2=c001+(c101-c001)*tx, a3=c011+(c111-c011)*tx;
          const b0=a0+(a1-a0)*ty, b1=a2+(a3-a2)*ty; f[o+ii]=b0+(b1-b0)*tz; } } }
  }
  return f;
}

export { BONES, buildField };
