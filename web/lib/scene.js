// @ts-nocheck
/* Stoa journey scene: marble causeway over the sea, maker-pool monuments, agora.
   Ported from the prototype; React owns the UI, this module owns WebGL. */
import * as THREE from "three";
import { Reflector } from "three/addons/objects/Reflector.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

export const CARD_RANGES = [
  [0.15, 0.215], [0.245, 0.315], [0.365, 0.435], [0.485, 0.555], [0.605, 0.675], [0.74, 0.82], [0.94, 1.01],
];

export function createScene(canvas, opts = {}) {
const isMobile = matchMedia("(max-width: 860px)").matches || /Mobi|Android/i.test(navigator.userAgent);
// phones: no MSAA (the 1.5x pixel ratio already smooths edges) and about 30 frames a second, to keep the main thread
// and the battery free; nothing is drawn while the plain section below the walk covers the canvas (setPaused)
const renderer = new THREE.WebGLRenderer({ canvas, antialias: !isMobile, powerPreference: "high-performance" });
const DPR = Math.min(window.devicePixelRatio || 1, isMobile ? 1.5 : 1.75);
renderer.setPixelRatio(DPR);
renderer.setSize(innerWidth, innerHeight, false);
renderer.toneMapping = THREE.NeutralToneMapping;
renderer.toneMappingExposure = 1.0;

const C = h => new THREE.Color(h);
const PAL = {
  top: C('#4A8BDF'), horizon: C('#E9EFF4'), sun: C('#FFE2B4'),
  deep: C('#3F78B8'), marble: '#F1EDE5', accent: C('#2F6FD6'), glass: C('#4C97F0'), ice: C('#9CCBFF')
};

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(PAL.horizon, 110, 560);
const camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.1, 2000);

/* ---------- sky ---------- */
const sunDir = new THREE.Vector3(0.45, 0.13, -1).normalize();
const skyMat = new THREE.ShaderMaterial({
  side: THREE.BackSide, depthWrite: false, fog: false,
  uniforms: { top: { value: PAL.top }, horizon: { value: PAL.horizon }, sunColor: { value: PAL.sun }, sunDir: { value: sunDir } },
  vertexShader: `varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: `uniform vec3 top; uniform vec3 horizon; uniform vec3 sunColor; uniform vec3 sunDir; varying vec3 vDir;
  void main(){ vec3 d = normalize(vDir); float h = max(d.y, 0.0);
    vec3 c = mix(horizon, top, pow(h, 0.5));
    float s = max(dot(d, sunDir), 0.0);
    c += sunColor * (pow(s, 900.0) * 2.0 + pow(s, 14.0) * 0.32 + pow(s, 3.0) * 0.06);
    gl_FragColor = vec4(c, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }`
});
const sky = new THREE.Mesh(new THREE.SphereGeometry(900, 32, 16), skyMat);
sky.renderOrder = -1;
scene.add(sky);

/* environment map from the sky, for soft reflections on marble and glass */
{
  const envScene = new THREE.Scene();
  envScene.add(new THREE.Mesh(new THREE.SphereGeometry(10, 32, 16), skyMat));
  const pm = new THREE.PMREMGenerator(renderer);
  scene.environment = pm.fromScene(envScene, 0.02).texture;
  scene.environmentIntensity = 0.35;
}

scene.add(new THREE.HemisphereLight(0xD6E6FF, 0xA9B8C8, 0.85));
const sunL = new THREE.DirectionalLight(0xFFF0D8, 2.7);
sunL.position.set(40, 38, 6);
scene.add(sunL);

/* ---------- textures ---------- */
function noise2() {
  const P = new Uint8Array(512); const p = [...Array(256).keys()];
  for (let i = 255; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [p[i], p[j]] = [p[j], p[i]]; }
  for (let i = 0; i < 512; i++) P[i] = p[i & 255];
  const g = (h, x, y) => ((h & 1) ? -x : x) + ((h & 2) ? -y : y);
  const f = t => t * t * t * (t * (t * 6 - 15) + 10);
  return (x, y) => { const X = Math.floor(x) & 255, Y = Math.floor(y) & 255; x -= Math.floor(x); y -= Math.floor(y);
    const u = f(x), v = f(y), a = P[X] + Y, b = P[X + 1] + Y;
    const l1 = g(P[a], x, y) + u * (g(P[b], x - 1, y) - g(P[a], x, y));
    const l2 = g(P[a + 1], x, y - 1) + u * (g(P[b + 1], x - 1, y - 1) - g(P[a + 1], x, y - 1));
    return l1 + v * (l2 - l1); };
}
const N = noise2();
function marbleTexture() {
  const S = 512, cv = document.createElement('canvas'); cv.width = cv.height = S;
  const ctx = cv.getContext('2d'), img = ctx.createImageData(S, S), d = img.data;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    let t = 0, a = 1, fr = 4 / S;
    for (let o = 0; o < 5; o++) { t += Math.abs(N(x * fr, y * fr)) * a; a *= .5; fr *= 2; }
    const v = Math.abs(Math.sin((x + y * .6) * 0.018 + t * 7.0));
    const vein = Math.pow(1 - Math.min(v * 7, 1), 2) * 0.22 + t * 0.06;
    const i = (y * S + x) * 4;
    d[i] = 243 - vein * 70; d[i + 1] = 240 - vein * 68; d[i + 2] = 234 - vein * 58; d[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  const tx = new THREE.CanvasTexture(cv); tx.wrapS = tx.wrapT = THREE.RepeatWrapping; tx.colorSpace = THREE.SRGBColorSpace;
  tx.anisotropy = 4; return tx;
}
const marbleTx = marbleTexture();
const marble = new THREE.MeshStandardMaterial({ map: marbleTx, roughness: 0.42, metalness: 0 });
const marbleFloor = new THREE.MeshStandardMaterial({ map: marbleTx.clone(), roughness: 0.55, metalness: 0 });
marbleFloor.map.repeat.set(2, 40); marbleFloor.map.needsUpdate = true;
const glassMat = new THREE.MeshPhysicalMaterial({ color: 0xE6F1FF, transparent: true, opacity: 0.26, roughness: 0.04, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.05, depthWrite: false, side: THREE.DoubleSide, envMapIntensity: 1.6 });
const glowMat = (c, i = 1.4) => new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: i, roughness: 0.3 });

function cloudTexture() {
  const S = 256, cv = document.createElement('canvas'); cv.width = cv.height = S; const ctx = cv.getContext('2d');
  for (let i = 0; i < 26; i++) {
    const x = S / 2 + (Math.random() - .5) * S * .5, y = S / 2 + (Math.random() - .5) * S * .26, r = S * (.14 + Math.random() * .2);
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, 'rgba(255,255,255,.55)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, S, S);
  }
  ctx.globalCompositeOperation = 'source-atop';
  const sh = ctx.createLinearGradient(0, S * .3, 0, S * .75);
  sh.addColorStop(0, 'rgba(255,255,255,0)'); sh.addColorStop(1, 'rgba(150,175,210,.55)');
  ctx.fillStyle = sh; ctx.fillRect(0, 0, S, S);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t;
}
function glowTexture(inner = 'rgba(160,205,255,1)') {
  const S = 128, cv = document.createElement('canvas'); cv.width = cv.height = S; const ctx = cv.getContext('2d');
  const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  g.addColorStop(0, inner); g.addColorStop(.35, 'rgba(120,180,255,.35)'); g.addColorStop(1, 'rgba(120,180,255,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, S, S);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t;
}
const glowTx = glowTexture();
function coinTexture(lines) {
  const S = 512, cv = document.createElement('canvas'); cv.width = cv.height = S; const ctx = cv.getContext('2d');
  const g = ctx.createRadialGradient(S * .4, S * .35, S * .05, S / 2, S / 2, S / 2);
  g.addColorStop(0, '#FFFFFF'); g.addColorStop(1, '#DCE8F7');
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(S / 2, S / 2, S / 2, 0, Math.PI * 2); ctx.fill();
  ctx.lineWidth = 22; ctx.strokeStyle = '#2F6FD6'; ctx.beginPath(); ctx.arc(S / 2, S / 2, S / 2 - 16, 0, Math.PI * 2); ctx.stroke();
  ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(47,111,214,.35)'; ctx.beginPath(); ctx.arc(S / 2, S / 2, S / 2 - 44, 0, Math.PI * 2); ctx.stroke();
  ctx.fillStyle = '#1E2633'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const fs = lines.length > 1 ? 74 : (lines[0].length > 4 ? 84 : 120);
  ctx.font = `${fs}px Marcellus, Georgia, serif`;
  ctx.save(); ctx.translate(S, 0); ctx.scale(-1, 1);
  lines.forEach((l, i) => ctx.fillText(l, S / 2, S / 2 + (i - (lines.length - 1) / 2) * fs * 1.1));
  ctx.restore();
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; t.flipY = false; t.center.set(.5, .5); t.rotation = -Math.PI / 2; return t;
}

/* ---------- water ---------- */
const WaterShader = {
  name: 'StoaWater',
  uniforms: { color: { value: null }, tDiffuse: { value: null }, textureMatrix: { value: null }, time: { value: 0 },
    deep: { value: PAL.deep }, horizon: { value: PAL.horizon } },
  vertexShader: `uniform mat4 textureMatrix; varying vec4 vUv; varying vec3 vW;
    void main(){ vUv = textureMatrix * vec4(position,1.0); vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
  fragmentShader: `uniform sampler2D tDiffuse; uniform float time; uniform vec3 deep; uniform vec3 horizon; varying vec4 vUv; varying vec3 vW;
    void main(){
      vec2 d = vec2(sin(vW.x*.55+time*.9)+sin(vW.z*.8+time*.7)+sin((vW.x+vW.z)*1.7+time*1.3)*.5,
                    cos(vW.z*.6-time*.8)+sin(vW.x*1.1+time*.6)+cos((vW.x-vW.z)*1.9-time*1.1)*.5);
      vec4 uv = vUv; uv.xy += d * .0045 * uv.w;
      vec3 refl = texture2DProj(tDiffuse, uv).rgb;
      vec3 V = normalize(cameraPosition - vW);
      float fres = .25 + .75 * pow(1.0 - max(V.y, 0.0), 4.0);
      vec3 c = mix(deep, refl, clamp(fres, 0.0, 1.0) * .82);
      float dist = length(vW - cameraPosition);
      c = mix(c, horizon, smoothstep(140.0, 620.0, dist));
      gl_FragColor = vec4(c, 1.0);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`
};
const rScale = isMobile ? 0.5 : 0.6;
const water = new Reflector(new THREE.PlaneGeometry(2400, 2400), {
  shader: WaterShader, clipBias: 0.003, multisample: isMobile ? 0 : 4,
  textureWidth: Math.round(innerWidth * DPR * rScale), textureHeight: Math.round(innerHeight * DPR * rScale)
});
water.rotation.x = -Math.PI / 2;
water.position.set(0, 0, -100);
scene.add(water);

/* ---------- column geometry ---------- */
function columnGeo(h = 6.2) {
  const shaft = new THREE.CylinderGeometry(0.4, 0.48, h, 40, 8, true);
  const pos = shaft.attributes.position, v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i); const a = Math.atan2(v.z, v.x); const k = 1 - 0.045 * Math.pow(Math.abs(Math.cos(a * 10)), 0.7);
    pos.setXYZ(i, v.x * k, v.y, v.z * k);
  }
  shaft.computeVertexNormals(); shaft.translate(0, h / 2 + 0.36, 0);
  const plinth = new THREE.BoxGeometry(1.25, 0.2, 1.25); plinth.translate(0, 0.1, 0);
  const base = new THREE.CylinderGeometry(0.58, 0.62, 0.18, 32); base.translate(0, 0.29, 0);
  const ech = new THREE.CylinderGeometry(0.66, 0.42, 0.3, 32); ech.translate(0, h + 0.36 + 0.15, 0);
  const aba = new THREE.BoxGeometry(1.4, 0.22, 1.4); aba.translate(0, h + 0.36 + 0.3 + 0.11, 0);
  [shaft, plinth, base, ech, aba].forEach(g => { if (g.index) g.toNonIndexed; });
  return mergeGeometries([shaft.toNonIndexed(), plinth.toNonIndexed(), base.toNonIndexed(), ech.toNonIndexed(), aba.toNonIndexed()]);
}
const COLH = 6.2, TOP = COLH + 0.36 + 0.52; // top of abacus ≈ 7.08
const colGeo = columnGeo(COLH);

const DECK = 0.6;          // walkway height above water
const Z0 = 34, Z1 = -199;  // causeway extent
const STATIONS = [
  { z: -40, side: 1 }, { z: -80, side: -1 }, { z: -120, side: 1 }, { z: -160, side: -1 }
];
const AG = { z: -217, r: 12.5 };

/* causeway */
{
  const len = Z0 - Z1, mid = (Z0 + Z1) / 2;
  const top = new THREE.Mesh(new THREE.BoxGeometry(10, DECK, len), [marble, marble, marbleFloor, marble, marble, marble]);
  top.position.set(0, DECK / 2, mid); scene.add(top);
  const step = new THREE.Mesh(new THREE.BoxGeometry(11.2, 0.3, len + 1.2), marble);
  step.position.set(0, 0.15, mid); scene.add(step);
  // inlay strip: the router line
}

/* colonnade (instanced) */
const colMats = [];
function skipCol(x, z) {
  for (const s of STATIONS) if (Math.sign(x) === s.side && Math.abs(z - s.z) < 5.2) return true;
  return false;
}
for (let z = Z0 - 2; z > Z1 + 1; z -= 4.6) for (const x of [-4.3, 4.3]) if (!skipCol(x, z)) colMats.push([x, z]);
const cols = new THREE.InstancedMesh(colGeo, marble, colMats.length + 40);
const m4 = new THREE.Matrix4();
colMats.forEach(([x, z], i) => { m4.makeTranslation(x, DECK, z); cols.setMatrixAt(i, m4); });
let colCount = colMats.length;

/* entablature segments + pergola beams */
{
  const runs = { '-1': [], '1': [] };
  for (const side of [-1, 1]) {
    let start = Z0 - 2 + 0.7;
    const gaps = STATIONS.filter(s => s.side === side).map(s => s.z).sort((a, b) => b - a);
    for (const gz of gaps) { runs[side].push([start, gz + 4.7]); start = gz - 4.7; }
    runs[side].push([start, Z1 + 1]);
  }
  const archGeos = [];
  for (const side of [-1, 1]) for (const [a, b] of runs[side]) {
    const L = a - b; if (L < 1) continue;
    const g1 = new THREE.BoxGeometry(1.25, 0.55, L); g1.translate(side * 4.3, DECK + TOP + 0.275, (a + b) / 2);
    const g2 = new THREE.BoxGeometry(1.5, 0.22, L + 0.3); g2.translate(side * 4.3, DECK + TOP + 0.66, (a + b) / 2);
    archGeos.push(g1, g2);
  }
  for (let z = Z0 - 2; z > Z1 + 1; z -= 4.6) {
    const g = new THREE.BoxGeometry(8.0, 0.24, 0.34); g.translate(0, DECK + TOP + 0.9, z); archGeos.push(g);
  }
  scene.add(new THREE.Mesh(mergeGeometries(archGeos), marble));
}

/* ---------- stations ---------- */
const anim = [];
function addHalo(parent, y, s, op = .55) {
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTx, transparent: true, depthWrite: false, opacity: op, blending: THREE.AdditiveBlending, fog: false }));
  sp.scale.set(s, s, 1); sp.position.y = y; parent.add(sp); return sp;
}
function addCoin(parent, y, lines, size = 1.25, yaw = 0) {
  const tx = coinTexture(lines);
  const face = new THREE.MeshStandardMaterial({ map: tx, roughness: .35, metalness: .05, emissive: 0xffffff, emissiveMap: tx, emissiveIntensity: .25 });
  const rim = new THREE.MeshStandardMaterial({ color: PAL.accent, roughness: .25, metalness: .6, emissive: PAL.accent, emissiveIntensity: .35 });
  const g = new THREE.CylinderGeometry(size, size, 0.16, 64); g.rotateX(Math.PI / 2);
  const coin = new THREE.Mesh(g, [rim, face, face]);
  coin.position.y = y; parent.add(coin);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(size * 0.8, 0.05, 8, 64), glowMat(PAL.glass, 1.6));
  ring.rotation.x = Math.PI / 2; ring.position.y = y - size - 0.55; parent.add(ring);
  addHalo(parent, y, size * 4.2, .35);
  anim.push(t => { coin.position.y = y + Math.sin(t * 1.1 + y) * 0.18; coin.rotation.y = yaw + Math.sin(t * 0.55 + y) * 0.3; ring.scale.setScalar(1 + Math.sin(t * 2) * 0.04); });
  return coin;
}
function platform(sx, z) {
  const g = new THREE.Group(); g.position.set(sx * 13, 0, z); scene.add(g);
  const p = new THREE.Mesh(new THREE.CylinderGeometry(4.6, 4.9, DECK, 48), marble); p.position.y = DECK / 2; g.add(p);
  const st = new THREE.Mesh(new THREE.CylinderGeometry(5.2, 5.3, 0.3, 48), marble); st.position.y = 0.15; g.add(st);
  const br = new THREE.Mesh(new THREE.BoxGeometry(5, DECK, 3), marble); br.position.set(-sx * 6.6, DECK / 2, 0); g.add(br);
  const pl = new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.6, 2.6), marble); pl.position.y = DECK + 0.8; g.add(pl);
  const pl2 = new THREE.Mesh(new THREE.BoxGeometry(3.1, 0.25, 3.1), marble); pl2.position.y = DECK + 0.125; g.add(pl2);
  const pl3 = new THREE.Mesh(new THREE.BoxGeometry(2.9, 0.2, 2.9), marble); pl3.position.y = DECK + 1.6 + 0.1; g.add(pl3);
  // ring of six small columns around the platform edge
  for (let i = 0; i < 6; i++) {
    const a = i / 6 * Math.PI * 2 + Math.PI / 6; const x = Math.cos(a) * 3.9, zz = Math.sin(a) * 3.9;
    if (Math.abs(a - (sx > 0 ? Math.PI : 0)) < 0.7 || Math.abs(a - (sx > 0 ? Math.PI : 0) - Math.PI * 2) < 0.7) continue;
    m4.compose(new THREE.Vector3(sx * 13 + x, DECK, z + zz), new THREE.Quaternion(), new THREE.Vector3(.62, .55, .62));
    cols.setMatrixAt(colCount++, m4);
  }
  return g;
}
const BASEY = DECK + 1.8;

// I — Trade: glass column holding live bid / ask depth
{
  const s = STATIONS[0], g = platform(s.side, s.z);
  const H = 7, R = 1.05;
  const shell = new THREE.Mesh(new THREE.CylinderGeometry(R, R, H, 48, 1, true), glassMat); shell.position.y = BASEY + H / 2; g.add(shell);
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(R + .25, R + .1, .28, 48), marble); cap.position.y = BASEY + H + .14; g.add(cap);
  const half = (start, col) => { const ge = new THREE.CylinderGeometry(R * .86, R * .86, 1, 40, 1, false, start, Math.PI); ge.translate(0, .5, 0);
    const m = new THREE.Mesh(ge, glowMat(col, 1.25)); m.position.y = BASEY + .05; g.add(m); return m; };
  const bid = half(0, PAL.accent), ask = half(Math.PI, PAL.ice);
  const sep = new THREE.Mesh(new THREE.BoxGeometry(.04, H, R * 1.8), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: .5 })); sep.position.y = BASEY + H / 2; g.add(sep);
  for (let i = 1; i < 7; i++) { const t = new THREE.Mesh(new THREE.TorusGeometry(R + .01, .012, 6, 48), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: .55 })); t.rotation.x = Math.PI / 2; t.position.y = BASEY + i; g.add(t); }
  const hb = addHalo(g, BASEY + 3, 6, .25);
  addCoin(g, BASEY + H + 2.4, ['WHYPE', 'USDC'], 1.25, -1 * Math.PI / 2);
  anim.push(t => {
    const b = 3.2 + Math.sin(t * .9) * 1.1 + Math.sin(t * 2.3) * .35, a = 3.0 + Math.sin(t * .8 + 2) * 1.1 + Math.sin(t * 2.9 + 1) * .35;
    bid.scale.y = b; ask.scale.y = a; hb.position.y = BASEY + (a + b) / 4;
  });
}
// II — Earn: stacked drums with fee rings lighting upward
{
  const s = STATIONS[1], g = platform(s.side, s.z);
  const rings = []; let y = BASEY;
  for (let i = 0; i < 6; i++) {
    const r = 1.35 - i * .1, h = .95;
    const d = new THREE.Mesh(new THREE.CylinderGeometry(r, r + .04, h, 48), marble); d.position.y = y + h / 2; g.add(d);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(r + .02, .07, 10, 64), glowMat(PAL.glass, .2)); ring.rotation.x = Math.PI / 2; ring.position.y = y + h + .02; g.add(ring);
    rings.push(ring); y += h + .08;
  }
  addCoin(g, y + 2.2, ['LP'], 1.25, 1 * Math.PI / 2);
  anim.push(t => rings.forEach((r, i) => { const k = Math.max(0, Math.sin(t * 2.2 - i * .7)); r.material.emissiveIntensity = .15 + k * k * 2.4; }));
}
// III — Run a pool: column with makers orbiting
{
  const s = STATIONS[2], g = platform(s.side, s.z);
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(.62, .7, 5.2, 40), marble); shaft.position.y = BASEY + 2.6; g.add(shaft);
  const gem = new THREE.Mesh(new THREE.OctahedronGeometry(1.1, 0), new THREE.MeshPhysicalMaterial({ color: 0xBFDcff, roughness: .05, transparent: true, opacity: .55, clearcoat: 1, emissive: PAL.glass, emissiveIntensity: .35 }));
  gem.position.y = BASEY + 6.4; gem.scale.y = 1.35; g.add(gem);
  const orb = [];
  [[2.1, .35, 0], [2.6, -.5, 1.3], [3.1, .15, 2.4]].forEach(([r, tilt, ph], i) => {
    const pivot = new THREE.Group(); pivot.position.y = BASEY + 2.4 + i * 1.3; pivot.rotation.x = tilt; pivot.rotation.z = tilt * .6; g.add(pivot);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(r, .018, 6, 96), new THREE.MeshBasicMaterial({ color: 0x8FBFF5, transparent: true, opacity: .7 })); ring.rotation.x = Math.PI / 2; pivot.add(ring);
    const dot = new THREE.Mesh(new THREE.SphereGeometry(.17, 16, 12), glowMat(PAL.glass, 2.2)); pivot.add(dot);
    const h = addHalo(pivot, 0, 1.6, .7); orb.push({ dot, h, r, ph, sp: .9 + i * .35 });
  });
  addCoin(g, BASEY + 9.6, ['MAKER'], 1.25, -1 * Math.PI / 2);
  anim.push(t => { gem.rotation.y = t * .5; orb.forEach(o => { const a = t * o.sp + o.ph; o.dot.position.set(Math.cos(a) * o.r, 0, Math.sin(a) * o.r); o.h.position.copy(o.dot.position); }); });
}
// IV — Build: tower of blocks lighting in sequence
{
  const s = STATIONS[3], g = platform(s.side, s.z);
  const blocks = []; const B = .95;
  for (let l = 0; l < 7; l++) {
    const rot = l % 2 ? Math.PI / 2 : 0;
    for (let k = -1; k <= 1; k++) {
      if ((l === 6 && k !== 0)) continue;
      const isGlass = (l * 3 + k + 7) % 4 === 0;
      const m = new THREE.Mesh(new THREE.BoxGeometry(B * .96, B * .62, B * 2.9), isGlass ? glowMat(PAL.glass, .2) : marble);
      const off = k * B; m.position.set(rot ? 0 : off, BASEY + .31 * B + l * B * .64, rot ? off : 0); m.rotation.y = rot;
      if (l === 6) m.scale.set(1, 1, .34);
      g.add(m); if (isGlass) blocks.push(m);
    }
  }
  addCoin(g, BASEY + 7.4, ['SDK'], 1.25, 1 * Math.PI / 2);
  anim.push(t => blocks.forEach((b, i) => { const k = Math.max(0, Math.sin(t * 1.6 - i * 1.1)); b.material.emissiveIntensity = .2 + k * 1.8; }));
}

/* ---------- agora ---------- */
let logoSprite;
{
  const g = new THREE.Group(); g.position.set(0, 0, AG.z); scene.add(g);
  const p = new THREE.Mesh(new THREE.CylinderGeometry(17, 17.4, DECK, 72), [marble, marbleFloor, marble]); p.position.y = DECK / 2; g.add(p);
  const st = new THREE.Mesh(new THREE.CylinderGeometry(18.2, 18.4, .3, 72), marble); st.position.y = .15; g.add(st);
  // inlaid rings on the floor
  for (const r of [6, 9.2]) { const ring = new THREE.Mesh(new THREE.RingGeometry(r - .06, r + .06, 128), new THREE.MeshBasicMaterial({ color: 0x9CC2EE, transparent: true, opacity: .8 })); ring.rotation.x = -Math.PI / 2; ring.position.y = DECK + .01; g.add(ring); }
  const n = 16, archG = [];
  for (let i = 0; i < n; i++) {
    const a = i / n * Math.PI * 2 + Math.PI / 2;
    const x = Math.cos(a) * AG.r, z = Math.sin(a) * AG.r;
    const front = Math.abs(Math.atan2(Math.sin(a - Math.PI / 2), Math.cos(a - Math.PI / 2))) < 0.3;
    if (!front) { m4.compose(new THREE.Vector3(x, DECK, AG.z + z), new THREE.Quaternion(), new THREE.Vector3(1.08, 1.12, 1.08)); cols.setMatrixAt(colCount++, m4); }
    const a2 = (i + 1) / n * Math.PI * 2 + Math.PI / 2, mx = (Math.cos(a) + Math.cos(a2)) / 2 * AG.r, mz = (Math.sin(a) + Math.sin(a2)) / 2 * AG.r;
    const chord = 2 * AG.r * Math.sin(Math.PI / n) + 1.2;
    const midFront = Math.abs(Math.atan2(Math.sin((a + a2) / 2 - Math.PI / 2), Math.cos((a + a2) / 2 - Math.PI / 2))) < 0.25;
    if (!midFront) for (const [h, w, y] of [[.6, 1.35, DECK + TOP * 1.12 + .3], [.24, 1.6, DECK + TOP * 1.12 + .72]]) {
      const b = new THREE.BoxGeometry(chord, h, w); b.rotateY(-Math.atan2(mz, mx) + Math.PI / 2); b.translate(mx, y, mz); archG.push(b);
    }
  }
  g.add(new THREE.Mesh(mergeGeometries(archG), marble));
  // monument
  let y = DECK;
  [[4.2, .5], [3.4, .5], [2.6, .6]].forEach(([w, h]) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, w), marble); b.position.y = y + h / 2; g.add(b); y += h; });
  const H = 9.5, R = 1.55;
  const shell = new THREE.Mesh(new THREE.CylinderGeometry(R, R, H, 64, 1, true), glassMat); shell.position.y = y + H / 2; g.add(shell);
  const core = new THREE.Mesh(new THREE.CylinderGeometry(R * .45, R * .45, H, 32), glowMat(PAL.glass, 1.1)); core.position.y = y + H / 2; g.add(core);
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(R + .35, R + .15, .35, 64), marble); cap.position.y = y + H + .17; g.add(cap);
  const lifts = [];
  for (let i = 0; i < 5; i++) { const r = new THREE.Mesh(new THREE.TorusGeometry(R + .03, .03, 8, 64), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: .8 })); r.rotation.x = Math.PI / 2; g.add(r); lifts.push(r); }
  const top = y + H + .35;
  // light shaft
  const beamMat = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false,
    uniforms: { t: { value: 0 } },
    vertexShader: `varying vec2 vU; void main(){ vU = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `varying vec2 vU; uniform float t; void main(){ float a = pow(1.0 - vU.y, 1.6) * .16 * (0.85 + .15 * sin(t*1.3 + vU.y*8.0)); float e = sin(vU.x*3.14159*2.0)*.5+.5; gl_FragColor = vec4(vec3(.62,.8,1.0) * a * (.6+.4*e), a); }` });
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 1.6, 60, 32, 1, true), beamMat); beam.position.y = top + 30; g.add(beam);
  const lt = new THREE.TextureLoader().load('/logo.png'); lt.colorSpace = THREE.SRGBColorSpace;
  logoSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: lt, transparent: true, fog: false }));
  logoSprite.scale.set(6.4, 6.4, 1); logoSprite.position.y = top + 3.6; g.add(logoSprite);
  addHalo(g, top + 3.6, 9, .22);
  const pr = new THREE.Mesh(new THREE.TorusGeometry(2.6, .06, 8, 96), glowMat(PAL.glass, 1.8)); pr.rotation.x = Math.PI / 2; pr.position.y = top + .6; g.add(pr);
  anim.push(t => {
    logoSprite.position.y = top + 3.6 + Math.sin(t * .9) * .25; beamMat.uniforms.t.value = t;
    lifts.forEach((r, i) => { const k = ((t * .18 + i / lifts.length) % 1); r.position.y = y + k * H; r.material.opacity = Math.sin(k * Math.PI) * .9; });
    pr.scale.setScalar(1 + Math.sin(t * 1.6) * .05);
  });
}
cols.count = colCount; cols.instanceMatrix.needsUpdate = true;
scene.add(cols);

/* ---------- router arcs ---------- */
const arcMat = new THREE.ShaderMaterial({
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
  uniforms: { t: { value: 0 }, k: { value: .25 } },
  vertexShader: `varying vec2 vU; void main(){ vU = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: `varying vec2 vU; uniform float t; uniform float k;
    void main(){ float d = fract(vU.x * 6.0 - t * .8); float p = smoothstep(.0,.08,d) * (1.0 - smoothstep(.08,.5,d));
      float a = (0.18 + p * 1.2) * k; gl_FragColor = vec4(vec3(.45,.72,1.0) * a, a); }`
});
{
  const end = new THREE.Vector3(0, DECK + 14.5, AG.z);
  STATIONS.forEach((s, i) => {
    const start = new THREE.Vector3(s.side * 13, BASEY + 8.5, s.z);
    const mid = start.clone().lerp(end, .5); mid.y += 16 + i * 2; mid.x *= .6;
    const curve = new THREE.QuadraticBezierCurve3(start, mid, end);
    scene.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 96, .14, 8, false), arcMat));
  });
  // floor line along the causeway
  const sg = new THREE.PlaneGeometry(Z0 - Z1 + 4, .18); sg.rotateX(-Math.PI / 2); sg.rotateY(Math.PI / 2);
  const s2 = new THREE.Mesh(sg, arcMat); s2.position.set(0, DECK + .02, (Z0 + Z1) / 2 - 2); scene.add(s2);
}

/* ---------- clouds ---------- */
{
  const tx = [cloudTexture(), cloudTexture(), cloudTexture()];
  const rnd = (a, b) => a + Math.random() * (b - a);
  for (let i = 0; i < 110; i++) {
    const m = new THREE.SpriteMaterial({ map: tx[i % 3], transparent: true, depthWrite: false, opacity: rnd(.55, .95), fog: true });
    const s = new THREE.Sprite(m); const sc = rnd(30, 70);
    s.scale.set(sc * 1.8, sc, 1); s.position.set(rnd(-160, 160), rnd(26, 42), rnd(-55, 140));
    if (Math.abs(s.position.x) < 20 && s.position.z > -30 && s.position.z < 50) s.position.y += rnd(-4, 6);
    scene.add(s);
  }
  // distant low haze bank on the horizon
  for (let i = 0; i < 24; i++) {
    const m = new THREE.SpriteMaterial({ map: tx[i % 3], transparent: true, depthWrite: false, opacity: .5, fog: false });
    const s = new THREE.Sprite(m); const a = (i / 24) * Math.PI * 2; s.scale.set(220, 40, 1); s.position.set(Math.cos(a) * 620, 14, -100 + Math.sin(a) * 620); scene.add(s);
  }
}

/* ---------- camera path ---------- */
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const portrait = () => innerWidth / innerHeight < 0.8;
// a..b = range of scroll progress where the camera rests at this key
const KEYS = [
  { a: 0, b: .02, pos: V(0, 72, 70), look: V(0, 60, -140) },
  { a: .09, b: .09, pos: V(0, 42, 44), look: V(0, 14, -90), pass: true },
  { a: .155, b: .205, pos: V(0, 3.4, 24), look: V(0, 4.2, -40) },
  { a: .255, b: .305, pos: V(-1.2, 3.4, -36), look: V(13, 7.2, -40) },
  { a: .375, b: .425, pos: V(1.2, 3.4, -76), look: V(-13, 7.2, -80) },
  { a: .495, b: .545, pos: V(-1.2, 3.4, -116), look: V(13, 7.2, -120) },
  { a: .615, b: .665, pos: V(1.2, 3.4, -156), look: V(-13, 7.2, -160) },
  { a: .75, b: .81, pos: V(46, 44, -62), look: V(0, 2, -132) },
  { a: .9, b: .9, pos: V(0, 4.2, -170), look: V(0, 7, -217), pass: true },
  { a: .955, b: 1, pos: V(0, 3.8, -191), look: V(0, 10, -217) }
];
const STOPS = [{ n: 'I', l: 'Trade', k: 3 }, { n: 'II', l: 'Earn', k: 4 }, { n: 'III', l: 'Run a pool', k: 5 }, { n: 'IV', l: 'Build', k: 6 }, { n: 'V', l: 'Agora', k: 9 }];
const ease = (t, i, o) => i && o ? t * t * (3 - 2 * t) : i ? t * t : o ? 1 - (1 - t) * (1 - t) : t;
const P = V(0, 0, 0), L = V(0, 0, 0);
function camAt(p) {
  for (let i = 0; i < KEYS.length; i++) {
    const k = KEYS[i];
    if (p <= k.b) {
      if (p >= k.a || i === 0) { P.copy(k.pos); L.copy(k.look); return; }
      const j = KEYS[i - 1]; let t = (p - j.b) / (k.a - j.b);
      t = ease(Math.min(Math.max(t, 0), 1), !j.pass, !k.pass);
      P.lerpVectors(j.pos, k.pos, t); L.lerpVectors(j.look, k.look, t); return;
    }
  }
  const k = KEYS[KEYS.length - 1]; P.copy(k.pos); L.copy(k.look);
}


/* ---------- loop ---------- */
let target = 0, cur = 0, appView = !!opts.appView, needFrame = true, raf = 0, disposed = false, paused = false, lastDraw = 0;
const MIN_FRAME_MS = isMobile ? 30 : 0;
function resize() {
  renderer.setSize(innerWidth, innerHeight, false);
  camera.aspect = innerWidth / innerHeight; camera.fov = portrait() ? 62 : 46; camera.updateProjectionMatrix();
  water.getRenderTarget().setSize(Math.round(innerWidth * DPR * rScale), Math.round(innerHeight * DPR * rScale));
  needFrame = true;
}
addEventListener("resize", resize); resize();
const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
const clock = new THREE.Clock(); let first = true;
function frame(now) {
  if (disposed) return;
  if ((paused && !first) || (MIN_FRAME_MS && now - lastDraw < MIN_FRAME_MS && !first)) { raf = requestAnimationFrame(frame); return; }
  lastDraw = now;
  const dt = Math.min(clock.getDelta(), .05), t = clock.elapsedTime;
  if (appView) {
    if (needFrame) { camera.position.set(30, 18, -20); camera.lookAt(0, 4, -120); sky.position.copy(camera.position); anim.forEach(f => f(t)); renderer.render(scene, camera); needFrame = false; first && opts.onReady?.(); first = false; }
    raf = requestAnimationFrame(frame); return;
  }
  cur += (target - cur) * (1 - Math.exp(-dt * (reduce ? 20 : 4.5)));
  if (Math.abs(target - cur) < 1e-5) cur = target;
  camAt(cur);
  const bob = reduce ? 0 : 1;
  camera.position.set(P.x + Math.sin(t * .4) * .08 * bob, P.y + Math.sin(t * .6) * .06 * bob, P.z);
  camera.lookAt(L);
  sky.position.copy(camera.position);
  water.material.uniforms.time.value = t;
  arcMat.uniforms.t.value = t;
  arcMat.uniforms.k.value = .28 + .9 * Math.max(0, 1 - Math.abs(cur - .78) / .08);
  if (!reduce) anim.forEach(f => f(t)); else if (first) anim.forEach(f => f(1));
  opts.onProgress?.(cur);
  renderer.render(scene, camera);
  if (first) { first = false; opts.onReady?.(); }
  raf = requestAnimationFrame(frame);
}
raf = requestAnimationFrame(frame);

return {
  stops: STOPS.map(s => ({ n: s.n, l: s.l, p: (KEYS[s.k].a + KEYS[s.k].b) / 2, a: KEYS[s.k].a })),
  setTarget(p) { target = Math.min(Math.max(p, 0), 1); },
  jump(p) { target = cur = p; },
  setAppView(v) { appView = v; needFrame = true; },
  setPaused(v) { if (paused && !v) clock.getDelta(); paused = !!v; },
  dispose() {
    disposed = true; cancelAnimationFrame(raf); removeEventListener("resize", resize);
    scene.traverse(o => { o.geometry?.dispose?.(); const m = o.material; (Array.isArray(m) ? m : [m]).forEach(x => x?.dispose?.()); });
    water.getRenderTarget().dispose(); renderer.dispose();
  },
};
}
