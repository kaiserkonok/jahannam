// JAHANNAM — a first-person reminder of the Hereafter.
// Goal: make the player FEEL how bad Hell will be: thirst, burden, isolation, dread.
// Three.js only. No game engine. No external assets — all procedural.

import * as THREE from 'three';

// ---------------------------------------------------------------- zones
interface Zone {
  name: string;
  entry: string;
  fog: number; fogDensity: number;
  ground: number; skyTop: number; skyBottom: number;
  ambient: number; thirstRate: number; burdenRate: number;
  whisperGap: [number, number];
  flavor: string;
}

const ZONES: Zone[] = [
  { name: 'I — Wastes of Thirst', entry: 'You wake on burning sand. Your tongue sticks to your mouth.',
    fog: 0x1a0803, fogDensity: 0.016, ground: 0x2a0f06, skyTop: 0x000000, skyBottom: 0x5a1400,
    ambient: 0.55, thirstRate: 2.2, burdenRate: 0.5, whisperGap: [14, 26],
    flavor: 'No water. Only mirage.' },
  { name: 'II — Pit of Whispers', entry: 'The fog thickens. Voices know your name.',
    fog: 0x12060a, fogDensity: 0.030, ground: 0x1c0a08, skyTop: 0x000000, skyBottom: 0x3a0a12,
    ambient: 0.42, thirstRate: 2.6, burdenRate: 0.8, whisperGap: [8, 16],
    flavor: 'They whisper what you did in secret.' },
  { name: 'III — Fields of Chains', entry: 'Something heavy is now tied to you. Walk.',
    fog: 0x0d0603, fogDensity: 0.022, ground: 0x201006, skyTop: 0x000000, skyBottom: 0x4a1e00,
    ambient: 0.38, thirstRate: 3.0, burdenRate: 1.6, whisperGap: [10, 18],
    flavor: 'Every step is heavier. This is the weight of neglect.' },
  { name: 'IV — City of Faces', entry: 'Walls rise. Eyes open on every side. You are seen.',
    fog: 0x0a0408, fogDensity: 0.020, ground: 0x160a0c, skyTop: 0x050005, skyBottom: 0x3a0a1a,
    ambient: 0.34, thirstRate: 3.4, burdenRate: 1.4, whisperGap: [7, 14],
    flavor: 'Do not stare back. Keep walking.' },
  { name: 'V — Sea of Fire', entry: 'The ground ends. Only flame remains. Cross.',
    fog: 0x1c0500, fogDensity: 0.014, ground: 0x3a0d00, skyTop: 0x000000, skyBottom: 0x8a2400,
    ambient: 0.6, thirstRate: 4.2, burdenRate: 1.2, whisperGap: [9, 16],
    flavor: 'The heat drinks your breath.' },
  { name: 'VI — Mirror Abyss', entry: 'Still black water. Look — if you dare.',
    fog: 0x020202, fogDensity: 0.026, ground: 0x050505, skyTop: 0x000000, skyBottom: 0x140a0a,
    ambient: 0.25, thirstRate: 3.6, burdenRate: 2.0, whisperGap: [6, 12],
    flavor: 'Your life replays. No excuses work here.' },
  { name: 'VII — The Deepest', entry: 'No gate. No direction. No death. Only remaining.',
    fog: 0x000000, fogDensity: 0.034, ground: 0x000000, skyTop: 0x000000, skyBottom: 0x0a0000,
    ambient: 0.16, thirstRate: 5.0, burdenRate: 2.4, whisperGap: [4, 9],
    flavor: 'This was only a game. The real one has no pause.' },
];

const WHISPERS = [
  'You were warned... and you laughed.',
  'No water here. You wasted yours.',
  'The world distracted you... where is it now?',
  'You prayed to be seen by people... now you are seen.',
  'Nobody is coming to ransom you.',
  'Remember the nights you knew the truth and slept anyway?',
  'Drink? There is only boiling regret.',
  'Your wealth... your followers... call them now.',
  'This thirst never ends. It only deepens.',
  'You had time. You said: later.',
  'No second life. No reset. No mercy you did not send ahead.',
  'Scream. The walls have heard it all before.',
];

const COLLAPSE_TEXTS = [
  'You fall. The ground burns your face. But death does not come — death is a mercy of the old world.',
  'You beg for water. Something boiling touches your lips and you wish you had never asked.',
  'You close your eyes. The voices continue inside your skull.',
  'You pray for death the way a drowning man prays for air. In this place there is neither dying nor living.',
  'No death is decreed for you here, and your torment will not be lightened — not for one breath.',
  'Death comes at you from every side at once. And it never arrives.',
];

// ---------------------------------------------------------------- dom
const $ = (id: string) => document.getElementById(id)!;
const menuEl = $('menu'), overlayEl = $('overlay'), hudEl = $('hud');
const zoneNameEl = $('zone-name'), depthEl = $('depth');
const thirstFill = $('thirst-fill'), burdenFill = $('burden-fill'), sanityFill = $('sanity-fill');
const subtitleEl = $('subtitle'), centerMsg = $('center-msg'), fadeEl = $('fade'), flashEl = $('flash');
const crosshair = $('crosshair');

// ---------------------------------------------------------------- three setup
const canvas = document.getElementById('game') as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(ZONES[0].fog, ZONES[0].fogDensity);
scene.background = new THREE.Color(0x000000);

const camera = new THREE.PerspectiveCamera(72, innerWidth / innerHeight, 0.1, 600);
camera.position.set(0, 1.7, 20);
camera.rotation.order = 'YXZ'; // keep horizon level — roll must stay 0

// LOOK SYSTEM — classic hover-look (the original mouse version).
// Moving the mouse turns the view directly, 1:1. No drag, no peek,
// no glide-back, no blocks. The two things that were broken back then
// (tilted horizon, too-slow turning) stay fixed.
let yaw = 0, pitch = 0;
let sensitivity = 0.0048; // full 360° in one wrist swipe
let locked = false;
let lockFailed = false; // browser blocked capture (iframe/permissions) → drag fallback
let dragging = false;
let dragLastX = 0, dragLastY = 0;
const PITCH_MAX = 1.55; // ±89° gimbal safety only — not a gameplay block

function setLookModeLabel(mode: string) {
  const el = $('look-mode');
  if (el) el.textContent = mode;
}
function applyLook() {
  camera.quaternion.setFromEuler(new THREE.Euler(pitch, yaw, 0, 'YXZ'));
}
// direct 1:1 turn — what your hand does is what the view does
function turnView(dxPx: number, dyPx: number) {
  yaw -= dxPx * sensitivity;
  pitch = THREE.MathUtils.clamp(pitch - dyPx * sensitivity, -PITCH_MAX, PITCH_MAX);
}
function enableDragMode() {
  if (lockFailed || phase !== 'playing') return;
  lockFailed = true;
  setLookModeLabel('DRAG');
  showCenter('Mouse capture blocked here — CLICK + DRAG to look instead.', 4);
}
function lockPointer() {
  if (lockFailed || document.pointerLockElement) return;
  try {
    const r = (document.body as HTMLElement).requestPointerLock() as unknown as Promise<void> | undefined;
    if (r && typeof (r as Promise<void>).catch === 'function') {
      (r as Promise<void>).catch(() => enableDragMode());
    }
  } catch {
    enableDragMode();
  }
  setTimeout(() => {
    if (!document.pointerLockElement && !lockFailed && phase === 'playing') enableDragMode();
  }, 1200);
}
function unlockPointer() {
  if (document.pointerLockElement) document.exitPointerLock();
}

const ambient = new THREE.AmbientLight(0xff6a33, ZONES[0].ambient);
scene.add(ambient);
const dirLight = new THREE.DirectionalLight(0xff4400, 1.1);
dirLight.position.set(30, 60, -40);
scene.add(dirLight);
const gateLight = new THREE.PointLight(0xff2200, 60, 60, 1.8);
scene.add(gateLight);
const playerFlicker = new THREE.PointLight(0xff5a00, 6, 18, 2);
scene.add(playerFlicker);

// sky dome
const skyMat = new THREE.ShaderMaterial({
  side: THREE.BackSide, depthWrite: false, fog: false,
  uniforms: {
    top: { value: new THREE.Color(ZONES[0].skyTop) },
    bottom: { value: new THREE.Color(ZONES[0].skyBottom) },
    time: { value: 0 },
  },
  vertexShader: `varying vec3 vP; void main(){ vP=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
  fragmentShader: `uniform vec3 top; uniform vec3 bottom; uniform float time; varying vec3 vP;
    void main(){ float h = normalize(vP).y*0.5+0.5; vec3 c = mix(bottom, top, pow(max(h,0.0),0.6));
    // burning horizon band that churns and breathes — the sky is alive
    float fl = 0.8 + 0.11*sin(time*2.3) + 0.09*sin(time*5.7+1.7);
    c += vec3(0.5,0.08,0.0) * pow(1.0-abs(normalize(vP).y), 6.0) * fl;
    c *= 0.96 + 0.04*sin(time*0.9);
    gl_FragColor = vec4(c,1.0); }`,
});
scene.add(new THREE.Mesh(new THREE.SphereGeometry(500, 24, 16), skyMat));

// ground with cracks
const groundGeo = new THREE.PlaneGeometry(420, 420, 72, 72);
groundGeo.rotateX(-Math.PI / 2);
const gPos = groundGeo.attributes.position;
for (let i = 0; i < gPos.count; i++) {
  const x = gPos.getX(i), z = gPos.getZ(i);
  const h = Math.sin(x * 0.11) * Math.cos(z * 0.13) * 1.2
    + Math.sin(x * 0.31 + z * 0.21) * 0.45
    + Math.sin(x * 0.9) * Math.sin(z * 0.8) * 0.08;
  gPos.setY(i, h * (Math.min(Math.hypot(x, z) / 30, 1.4)));
}
groundGeo.computeVertexNormals();
const groundMat = new THREE.MeshStandardMaterial({ color: ZONES[0].ground, roughness: 1, metalness: 0.05 });
const ground = new THREE.Mesh(groundGeo, groundMat);
scene.add(ground);

// lava cracks: emissive lines via a canvas texture
function makeCrackTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas'); c.width = c.height = 512;
  const g = c.getContext('2d')!;
  g.fillStyle = '#000'; g.fillRect(0, 0, 512, 512);
  g.strokeStyle = 'rgba(255,60,0,0.9)'; g.lineWidth = 2;
  for (let i = 0; i < 26; i++) {
    g.beginPath();
    let x = Math.random() * 512, y = Math.random() * 512;
    g.moveTo(x, y);
    for (let s = 0; s < 8; s++) { x += (Math.random() - 0.5) * 90; y += (Math.random() - 0.5) * 90; g.lineTo(x, y); }
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(6, 6);
  return t;
}
const crackTex = makeCrackTexture();
const crackMat = new THREE.MeshBasicMaterial({ map: crackTex, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false });
const cracks = new THREE.Mesh(new THREE.PlaneGeometry(420, 420), crackMat);
cracks.rotation.x = -Math.PI / 2; cracks.position.y = 0.06;
scene.add(cracks);

// rocks / pillars / watchers
const rockGeo = new THREE.DodecahedronGeometry(1, 0);
const rockMat = new THREE.MeshStandardMaterial({ color: 0x180806, roughness: 1 });
const rocks = new THREE.InstancedMesh(rockGeo, rockMat, 160);
{
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
  const e = new THREE.Euler();
  for (let i = 0; i < 160; i++) {
    const r = 25 + Math.random() * 165, a = Math.random() * Math.PI * 2;
    p.set(Math.cos(a) * r, -0.5 + Math.random() * 0.6, Math.sin(a) * r);
    e.set(Math.random() * 3, Math.random() * 3, Math.random() * 3); q.setFromEuler(e);
    const sc = 0.6 + Math.random() * 3.4; s.set(sc, sc * (0.6 + Math.random()), sc);
    m.compose(p, q, s); rocks.setMatrixAt(i, m);
  }
}
scene.add(rocks);

const pillarGeo = new THREE.BoxGeometry(3, 26, 3);
const pillarMat = new THREE.MeshStandardMaterial({ color: 0x0d0505, roughness: 0.9 });
const pillars: THREE.Mesh[] = [];
for (let i = 0; i < 22; i++) {
  const mesh = new THREE.Mesh(pillarGeo, pillarMat);
  const r = 40 + Math.random() * 130, a = (i / 22) * Math.PI * 2 + Math.random() * 0.4;
  mesh.position.set(Math.cos(a) * r, 10, Math.sin(a) * r);
  mesh.rotation.y = Math.random() * Math.PI;
  scene.add(mesh); pillars.push(mesh);
}

function glowTexture(inner: string, outer: string): THREE.CanvasTexture {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(64, 64, 2, 64, 64, 64);
  grad.addColorStop(0, inner); grad.addColorStop(1, outer);
  g.fillStyle = grad; g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}
const emberTex = glowTexture('rgba(255,180,80,1)', 'rgba(255,40,0,0)');
const eyeTex = (() => {
  const c = document.createElement('canvas'); c.width = 128; c.height = 128;
  const g = c.getContext('2d')!;
  g.fillStyle = 'rgba(0,0,0,0)'; g.fillRect(0, 0, 128, 128);
  g.fillStyle = '#2a0000'; g.beginPath(); g.ellipse(64, 64, 52, 30, 0, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#ff2d00'; g.beginPath(); g.arc(64, 64, 16, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#000'; g.beginPath(); g.arc(64, 64, 7, 0, Math.PI * 2); g.fill();
  return new THREE.CanvasTexture(c);
})();

// embers
const EMBERS = 700;
const emberGeo = new THREE.BufferGeometry();
const emberPos = new Float32Array(EMBERS * 3);
const emberVel = new Float32Array(EMBERS);
for (let i = 0; i < EMBERS; i++) {
  emberPos[i * 3] = (Math.random() - 0.5) * 220;
  emberPos[i * 3 + 1] = Math.random() * 30;
  emberPos[i * 3 + 2] = (Math.random() - 0.5) * 220;
  emberVel[i] = 0.6 + Math.random() * 2.2;
}
emberGeo.setAttribute('position', new THREE.BufferAttribute(emberPos, 3));
const emberMat = new THREE.PointsMaterial({ map: emberTex, size: 0.9, transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending, color: 0xff7733 });
const embers = new THREE.Points(emberGeo, emberMat);
scene.add(embers);

// fire pits (fake bloom sprites + 2 real lights)
interface Pit { sprite: THREE.Sprite; x: number; z: number; seed: number; }
const pits: Pit[] = [];
const pitTex = glowTexture('rgba(255,220,120,1)', 'rgba(200,20,0,0)');
for (let i = 0; i < 14; i++) {
  const r = 30 + Math.random() * 120, a = Math.random() * Math.PI * 2;
  const x = Math.cos(a) * r, z = Math.sin(a) * r;
  const mat = new THREE.SpriteMaterial({ map: pitTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.9 });
  const sp = new THREE.Sprite(mat);
  const s = 6 + Math.random() * 10;
  sp.scale.set(s, s * 0.7, 1); sp.position.set(x, 1.2, z);
  scene.add(sp);
  pits.push({ sprite: sp, x, z, seed: Math.random() * 100 });
}

// watchers (eyes) — only visible in zone >= 3
const watchers: THREE.Sprite[] = [];
for (let i = 0; i < 14; i++) {
  const mat = new THREE.SpriteMaterial({ map: eyeTex, transparent: true, depthWrite: false, opacity: 0 });
  const sp = new THREE.Sprite(mat);
  sp.scale.set(5, 2.6, 1);
  const p = pillars[i % pillars.length];
  sp.position.set(p.position.x + (Math.random() - 0.5) * 4, 14 + Math.random() * 8, p.position.z + (Math.random() - 0.5) * 4);
  scene.add(sp); watchers.push(sp);
}

// ---------------------------------------------------------------- shadow sufferers
// Deliberately NOT human depictions: whole-black silhouettes, featureless,
// no face, no eyes, no skin — a body-shape of a man and nothing more.
const shadeMat = new THREE.MeshStandardMaterial({
  color: 0x080808, roughness: 0.85, metalness: 0.1,
  emissive: 0x220400, emissiveIntensity: 0.8,
});
const shadeTorsoGeo = new THREE.CapsuleGeometry(0.34, 0.9, 4, 10);
const shadeHeadGeo = new THREE.SphereGeometry(0.24, 12, 10);
const shadeLimbGeo = new THREE.CapsuleGeometry(0.11, 0.75, 4, 8);

interface Shade {
  g: THREE.Group; torso: THREE.Mesh; head: THREE.Mesh;
  armL: THREE.Group; armR: THREE.Group; legL: THREE.Group; legR: THREE.Group;
  seed: number; mode: string; baseY: number;
}
const sufferers: Shade[] = [];

function makeShade(mode: string, x: number, z: number, ry = 0, scale = 1): Shade {
  const g = new THREE.Group();
  const torso = new THREE.Mesh(shadeTorsoGeo, shadeMat);
  torso.position.y = 1.15; g.add(torso);
  const head = new THREE.Mesh(shadeHeadGeo, shadeMat); // blank — no face at all
  head.position.y = 2.0; g.add(head);
  const mkLimb = (px: number, py: number) => {
    const pivot = new THREE.Group(); pivot.position.set(px, py, 0);
    const m = new THREE.Mesh(shadeLimbGeo, shadeMat); m.position.y = -0.45; pivot.add(m);
    g.add(pivot); return pivot;
  };
  const armL = mkLimb(-0.44, 1.55), armR = mkLimb(0.44, 1.55);
  const legL = mkLimb(-0.16, 0.9), legR = mkLimb(0.16, 0.9);

  if (mode === 'chained') { armL.rotation.z = 2.55; armR.rotation.z = -2.55; head.rotation.x = 0.35; }
  if (mode === 'kneel') {
    legL.rotation.x = -1.9; legR.rotation.x = -1.9;
    torso.position.y = 0.72; head.position.y = 1.55; head.rotation.x = 0.5;
    armL.position.y = 1.1; armR.position.y = 1.1;
  }
  if (mode === 'reach') { armR.rotation.x = -2.7; head.rotation.x = -0.45; }
  if (mode === 'sit') {
    legL.rotation.x = -1.5; legR.rotation.x = -1.5;
    torso.position.y = 0.62; head.position.y = 1.38; head.rotation.x = 0.55;
  }
  if (mode === 'headback') { head.rotation.x = -0.7; }
  if (mode === 'submerged') { head.rotation.x = -0.5; armL.rotation.x = -0.9; armR.rotation.x = -0.9; }

  g.position.set(x, groundH(x, z), z);
  g.rotation.y = ry;
  g.scale.setScalar(scale);
  scene.add(g);
  const s: Shade = { g, torso, head, armL, armR, legL, legR, seed: Math.random() * 100, mode, baseY: g.position.y };
  sufferers.push(s);
  return s;
}

// THE GATE — descent portal
const gateGroup = new THREE.Group();
const gateMesh = new THREE.Mesh(
  new THREE.BoxGeometry(4, 14, 1.4),
  new THREE.MeshStandardMaterial({ color: 0x000000, roughness: 0.4, metalness: 0.6, emissive: 0x550000, emissiveIntensity: 0.7 })
);
gateMesh.position.y = 7;
gateGroup.add(gateMesh);
const gateGlowMat = new THREE.SpriteMaterial({ map: pitTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.95 });
const gateGlow = new THREE.Sprite(gateGlowMat);
gateGlow.scale.set(16, 22, 1); gateGlow.position.y = 7;
gateGroup.add(gateGlow);
scene.add(gateGroup);

function placeGate(zoneIdx: number) {
  if (zoneIdx >= ZONES.length - 1) { gateGroup.visible = false; return; }
  gateGroup.visible = true;
  // gates spawn ahead of where you face (±~55°), so looking around finds them
  const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
  const a = Math.atan2(fz, fx) + (Math.random() - 0.5) * 1.9;
  const dist = 55 + zoneIdx * 5 + Math.random() * 20;
  gateGroup.position.set(
    THREE.MathUtils.clamp(camera.position.x + Math.cos(a) * dist, -170, 170),
    0,
    THREE.MathUtils.clamp(camera.position.z + Math.sin(a) * dist, -170, 170));
  gateGroup.rotation.y = Math.atan2(camera.position.x - gateGroup.position.x, camera.position.z - gateGroup.position.z);
}

// ---------------------------------------------------------------- punishment stations
// Every torment here is drawn from the Quran and Hadith (see refs on triggers).
// One zone-group of props per depth; only the current depth's horrors are visible.
const zoneProps: THREE.Group[] = [];
const zoneFigs: Shade[][] = [];
const stationsByZone: Station[][] = [];
for (let i = 0; i < 7; i++) {
  const grp = new THREE.Group(); grp.visible = false; scene.add(grp);
  zoneProps.push(grp); zoneFigs.push([]); stationsByZone.push([]);
}
interface Station { x: number; z: number; r: number; line: string; ref: string; last: number; }

const ironMat = new THREE.MeshStandardMaterial({ color: 0x0c0c0e, roughness: 0.55, metalness: 0.75 });
const emberHotMat = new THREE.MeshStandardMaterial({ color: 0x1a0500, emissive: 0xff4400, emissiveIntensity: 2.0 });
const brassMat = new THREE.MeshStandardMaterial({ color: 0x140800, emissive: 0xff9500, emissiveIntensity: 1.8 });
const lavaMat = new THREE.MeshStandardMaterial({ color: 0x200400, emissive: 0xff2d00, emissiveIntensity: 1.6 });
const frostMat = new THREE.MeshStandardMaterial({ color: 0x0a1626, emissive: 0x86ccff, emissiveIntensity: 1.5 });
const thornMat = new THREE.MeshStandardMaterial({ color: 0x050505, roughness: 1 });
const fruitMat = new THREE.MeshStandardMaterial({ color: 0x201000, emissive: 0xffb300, emissiveIntensity: 2.4 });
const streamMat = new THREE.MeshStandardMaterial({ color: 0x1a0500, emissive: 0xff6a00, emissiveIntensity: 2.6 });
const sickMat = new THREE.MeshStandardMaterial({ color: 0x1a2005, emissive: 0x8a9a1a, emissiveIntensity: 1.4, roughness: 0.6 });
const goldMat = new THREE.MeshStandardMaterial({ color: 0x2a1a05, emissive: 0xffb300, emissiveIntensity: 1.3, metalness: 0.85, roughness: 0.35 });
const darkWaterMat = new THREE.MeshStandardMaterial({ color: 0x030303, roughness: 0.2, metalness: 0.5 });
const rimMat = new THREE.MeshStandardMaterial({ color: 0x0a0000, emissive: 0xff1a00, emissiveIntensity: 0.6 });
const goldSpriteMat = new THREE.SpriteMaterial({ map: pitTex, color: 0xffd27a, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.55 });

const pulsers: { m: THREE.MeshStandardMaterial; base: number; amp: number; speed: number; seed: number }[] = [];
function pulse(mat: THREE.MeshStandardMaterial, base: number, amp = 0.5, speed = 2) {
  pulsers.push({ m: mat, base, amp, speed, seed: Math.random() * 10 });
  mat.emissiveIntensity = base;
}
const risers: { sp: THREE.Sprite; x: number; y0: number; z: number; h: number; speed: number; seed: number; s: number; op: number }[] = [];
function riser(parent: THREE.Object3D, x: number, y0: number, z: number, h: number, speed: number, s: number, tex: THREE.Texture, op = 0.7) {
  const m = new THREE.SpriteMaterial({ map: tex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: op });
  const sp = new THREE.Sprite(m); sp.position.set(x, y0, z); sp.scale.set(s, s, 1);
  parent.add(sp);
  risers.push({ sp, x, y0, z, h, speed, seed: Math.random() * 10, s, op });
}
const flames: { sp: THREE.Sprite; seed: number; bx: number; by: number }[] = [];
function flame(parent: THREE.Object3D, x: number, y: number, z: number, sx: number, sy: number, tex: THREE.Texture, op = 0.85) {
  const m = new THREE.SpriteMaterial({ map: tex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: op });
  const sp = new THREE.Sprite(m); sp.position.set(x, y, z); sp.scale.set(sx, sy, 1);
  parent.add(sp);
  flames.push({ sp, seed: Math.random() * 10, bx: sx, by: sy });
}
const slammers: { mesh: THREE.Mesh; baseY: number; seed: number; prev: number }[] = [];
const flowTexs: { tex: THREE.Texture; sx: number; sy: number }[] = [];

// ---------------------------------------------------------------- atmosphere of Hell
// ash that never stops falling, fog banks that drift, fire on the horizon
const ashTex = glowTexture('rgba(190,170,160,0.85)', 'rgba(190,170,160,0)');
const fogTex = glowTexture('rgba(160,140,130,0.4)', 'rgba(160,140,130,0)');
const ASH_N = 380;
let ashGeo: THREE.BufferGeometry | null = null;
const ashVel = new Float32Array(ASH_N);
interface FogBank { sp: THREE.Sprite; a: number; r: number; y: number; spd: number }
const fogBanks: FogBank[] = [];

function buildAtmosphere() {
  ashGeo = new THREE.BufferGeometry();
  const arr = new Float32Array(ASH_N * 3);
  for (let i = 0; i < ASH_N; i++) {
    arr[i * 3] = (Math.random() - 0.5) * 200;
    arr[i * 3 + 1] = Math.random() * 40;
    arr[i * 3 + 2] = (Math.random() - 0.5) * 200;
    ashVel[i] = 0.5 + Math.random() * 1.4;
  }
  ashGeo.setAttribute('position', new THREE.BufferAttribute(arr, 3));
  const m = new THREE.PointsMaterial({ map: ashTex, size: 0.4, transparent: true, opacity: 0.5, depthWrite: false, color: 0xbb9988 });
  scene.add(new THREE.Points(ashGeo, m));
  // low fog banks circling far out — Hell extends past what you can see
  for (let i = 0; i < 8; i++) {
    const mat = new THREE.SpriteMaterial({ map: fogTex, transparent: true, depthWrite: false, opacity: 0.05 + Math.random() * 0.03, fog: false });
    const sp = new THREE.Sprite(mat);
    const sx = 70 + Math.random() * 40;
    sp.scale.set(sx, 22 + Math.random() * 8, 1);
    scene.add(sp);
    fogBanks.push({ sp, a: (i / 8) * Math.PI * 2 + Math.random(), r: 120 + Math.random() * 60, y: 8 + Math.random() * 10, spd: 0.004 + Math.random() * 0.006 });
  }
  // pillars of fire on the horizon — the torment goes on without you
  for (let i = 0; i < 6; i++) {
    const mat = new THREE.SpriteMaterial({ map: emberTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.35 + Math.random() * 0.15, fog: false });
    const sp = new THREE.Sprite(mat);
    const a = Math.random() * Math.PI * 2;
    sp.position.set(Math.cos(a) * 330, 45, Math.sin(a) * 330);
    sp.scale.set(10 + Math.random() * 6, 120 + Math.random() * 40, 1);
    scene.add(sp);
  }
}

function updateAtmosphere(dt: number) {
  void dt;
  skyMat.uniforms.time.value = fxT;
  for (const f of flowTexs) { f.tex.offset.x += f.sx * dt; f.tex.offset.y += f.sy * dt; }
  if (ashGeo) {
    const arr = ashGeo.attributes.position.array as Float32Array;
    for (let i = 0; i < ASH_N; i++) {
      arr[i * 3 + 1] -= ashVel[i] * dt * 1.2;
      arr[i * 3] += Math.sin(fxT * 0.5 + i) * dt * 0.8;
      if (arr[i * 3 + 1] < 0 || Math.abs(arr[i * 3] - camera.position.x) > 100 || Math.abs(arr[i * 3 + 2] - camera.position.z) > 100) {
        arr[i * 3] = camera.position.x + (Math.random() - 0.5) * 180;
        arr[i * 3 + 1] = 34 + Math.random() * 6;
        arr[i * 3 + 2] = camera.position.z + (Math.random() - 0.5) * 180;
      }
    }
    ashGeo.attributes.position.needsUpdate = true;
  }
  for (const b of fogBanks) {
    b.a += dt * b.spd;
    b.sp.position.set(Math.cos(b.a) * b.r, b.y + Math.sin(fxT * 0.2 + b.r) * 1.5, Math.sin(b.a) * b.r);
  }
}

const boxGeo = new THREE.BoxGeometry(1, 1, 1);
const postGeo = new THREE.BoxGeometry(0.8, 1, 0.8);
const barGeo = new THREE.CylinderGeometry(0.35, 0.45, 1, 8);
const discGeo = new THREE.CircleGeometry(1, 28);
const ballGeo = new THREE.SphereGeometry(1, 12, 10);
const coneGeo = new THREE.ConeGeometry(1, 1, 7);
const linkGeo = new THREE.TorusGeometry(0.35, 0.09, 6, 12);

function box(parent: THREE.Object3D, mat: THREE.Material, x: number, y: number, z: number, sx: number, sy: number, sz: number, ry = 0) {
  const m = new THREE.Mesh(boxGeo, mat);
  m.position.set(x, y, z); m.scale.set(sx, sy, sz); m.rotation.y = ry;
  parent.add(m); return m;
}
function post(parent: THREE.Object3D, x: number, z: number, h: number, mat: THREE.Material = ironMat) {
  const m = new THREE.Mesh(postGeo, mat);
  m.position.set(x, groundH(x, z) + h / 2, z); m.scale.set(1.4, h, 1.4);
  parent.add(m); return m;
}
function poolDisc(parent: THREE.Object3D, x: number, z: number, r: number, mat: THREE.Material) {
  const m = new THREE.Mesh(discGeo, mat);
  m.rotation.x = -Math.PI / 2; m.position.set(x, groundH(x, z) + 0.12, z); m.scale.set(r, r, 1);
  parent.add(m); return m;
}
// a black silhouette placed into a depth's cast
function SF(zi: number, mode: string, x: number, z: number, ry = 0, scale = 1, sink = 0) {
  const s = makeShade(mode, x, z, ry, scale);
  s.g.position.y += sink; s.baseY = s.g.position.y;
  zoneFigs[zi].push(s);
  return s;
}
function addStation(zi: number, x: number, z: number, r: number, line: string, ref: string) {
  stationsByZone[zi].push({ x, z, r, line, ref, last: -1000 });
}
function chainRun(parent: THREE.Object3D, ax: number, ay: number, az: number, bx: number, by: number, bz: number, links = 9) {
  for (let i = 0; i < links; i++) {
    const t = i / (links - 1);
    const m = new THREE.Mesh(linkGeo, ironMat);
    m.position.set(ax + (bx - ax) * t, ay + (by - ay) * t, az + (bz - az) * t);
    m.rotation.y = (i % 2) * Math.PI / 2;
    parent.add(m);
  }
}

function buildStations() {
  // ——— DEPTH I — Wastes of Thirst ———
  { const zi = 0, P = zoneProps[zi];
    // sandals of fire: the lightest torment (Bukhari & Muslim)
    box(P, emberHotMat, 30, groundH(30, -20) + 0.1, -20, 0.55, 0.2, 1.15);
    box(P, emberHotMat, 31, groundH(31, -20) + 0.1, -20, 0.55, 0.2, 1.15);
    SF(zi, 'headback', 30.5, -20, Math.PI, 1);
    addStation(zi, 30.5, -20, 15, 'The least punished here thinks no one suffers more than him — yet his torment is only sandals of fire, boiling his brain.', 'Bukhari & Muslim');
    // molten-brass drink (18:29)
    const cx = -45, cz = 35, cy = groundH(cx, cz);
    const pot = new THREE.Mesh(barGeo, ironMat); pot.position.set(cx, cy + 1.3, cz); pot.scale.set(2.4, 2.6, 2.4); P.add(pot);
    poolDisc(P, cx, cz, 2.0, brassMat).position.y = cy + 2.65;
    flame(P, cx, cy + 0.8, cz, 7, 4, pitTex, 0.7);
    riser(P, cx, cy + 3, cz, 7, 1.1, 2.4, pitTex);
    SF(zi, 'kneel', cx + 4.2, cz + 1, -Math.PI / 2.3, 1);
    addStation(zi, cx, cz, 16, 'Water like molten brass — it scalds the face as it nears. What an evil drink, what an evil rest.', 'Quran 18:29');
    // pus-drink (14:16-17): sickly pool + kneeling drinker + head-back waiter
    {
      const px = -10, pz = 80, py = groundH(px, pz);
      poolDisc(P, px, pz, 2.2, sickMat);
      riser(P, px, py + 1, pz, 6, 0.5, 2.2, fogTex, 0.4);
      SF(zi, 'kneel', px + 3.2, pz + 1, -Math.PI / 2, 1);
      SF(zi, 'headback', px - 3.5, pz - 2, Math.PI / 3, 1);
      addStation(zi, px, pz, 15, 'Sip, and choke. Death crowds you from every side, yet you will not die.', 'Quran 14:16-17');
    }
    // seventy parts of fire (Bukhari 3265; Muslim 2843): campfire vs towering glow wall
    {
      const fx = 85, fz = -55, fy = groundH(fx, fz);
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        flame(P, fx + Math.cos(a) * 1.5, fy + 0.8, fz + Math.sin(a) * 1.5, 1.6, 2.4, pitTex);
      }
      flame(P, fx + 8, fy + 7, fz, 14, 18, emberTex, 0.55);
      SF(zi, 'stand', fx + 4, fz, -Math.PI / 2, 1);
      addStation(zi, fx, fz, 16, 'Everything you called hot was one part. Here are the other sixty-nine.', 'Bukhari 3265; Muslim 2843');
    }
  }
  // ——— DEPTH II — Pit of Whispers ———
  { const zi = 1, P = zoneProps[zi];
    // dari thorn (88:6-7)
    for (let i = 0; i < 7; i++) {
      const x = 60 + (Math.random() - 0.5) * 9, z = 55 + (Math.random() - 0.5) * 9;
      const c = new THREE.Mesh(coneGeo, thornMat);
      c.position.set(x, groundH(x, z) + 1.2, z); c.scale.set(0.7 + Math.random() * 0.5, 2.4 + Math.random() * 1.4, 0.7 + Math.random() * 0.5);
      c.rotation.y = Math.random() * 3; P.add(c);
    }
    SF(zi, 'kneel', 60, 55, 0.6, 1);
    addStation(zi, 60, 55, 15, 'No food but bitter thorn — it does not nourish, and it does not end hunger.', 'Quran 88:6-7');
    // hamim on iron hooks (Tirmidhi)
    const hx = -70, hz = -30;
    post(P, hx - 4, hz, 6); post(P, hx + 4, hz, 6);
    box(P, ironMat, hx, groundH(hx, hz) + 6, hz, 9, 0.5, 0.5);
    for (let i = -1; i <= 1; i++) {
      const hook = new THREE.Mesh(linkGeo, ironMat);
      hook.position.set(hx + i * 2.6, groundH(hx, hz) + 4.6, hz); P.add(hook);
    }
    poolDisc(P, hx, hz, 3, brassMat);
    SF(zi, 'stand', hx, hz + 5.5, Math.PI, 1);
    addStation(zi, hx, hz, 16, 'Boiling water, poured from above — it melts the face before it ever touches the lips.', 'Quran 22:19-20');
    // narrow pit (25:13-14): sunken ring, packed together, chained ankles
    {
      const nx = -15, nz = 85, ny = groundH(nx, nz);
      const ring = new THREE.Mesh(linkGeo, ironMat);
      ring.position.set(nx, ny + 0.6, nz); ring.rotation.x = Math.PI / 2; ring.scale.set(12, 12, 3);
      P.add(ring);
      SF(zi, 'sit', nx - 1.2, nz, 0.4, 1);
      SF(zi, 'kneel', nx + 1.2, nz + 0.5, -0.5, 1);
      SF(zi, 'sit', nx, nz - 1.4, Math.PI, 1);
      SF(zi, 'kneel', nx + 0.4, nz + 1.5, Math.PI / 2, 1);
      chainRun(P, nx - 1.2, ny + 0.4, nz, nx + 1.2, ny + 0.4, nz + 0.5, 5);
      chainRun(P, nx, ny + 0.4, nz - 1.4, nx + 0.4, ny + 0.4, nz + 1.5, 5);
      addStation(zi, nx, nz, 15, 'Bound together in the narrow dark. You will beg for an end, and beg again.', 'Quran 25:13-14');
    }
    // walls of craving (Bukhari 6487): gold glows ringed around one soul
    {
      const wx = 15, wz = -75, wy = groundH(wx, wz);
      SF(zi, 'stand', wx, wz, 0, 1);
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI * 2;
        const s = new THREE.Sprite(goldSpriteMat);
        s.position.set(wx + Math.cos(a) * 6, wy + 1.5, wz + Math.sin(a) * 6);
        s.scale.set(2.2, 2.2, 1);
        P.add(s);
        flames.push({ sp: s, seed: Math.random() * 10, bx: 2.2, by: 2.2 });
      }
      addStation(zi, wx, wz, 15, 'Every craving you obeyed is here. They are standing around you like walls.', 'Bukhari 6487');
    }
  }
  // ——— DEPTH III — Fields of Chains ———
  { const zi = 2, P = zoneProps[zi];
    // the 70-cubit chain (69:30-32)
    const px = 20, pz = 95, py = groundH(px, pz);
    post(P, px, pz, 9);
    const f = SF(zi, 'chained', px + 3.4, pz + 1, -Math.PI / 2.4, 1);
    chainRun(P, px, py + 9, pz, px + 3.4, py + 2.2, pz + 1, 10);
    void f;
    addStation(zi, px, pz, 16, 'Seize him. Fetter him. Then chain him in a chain of seventy cubits.', 'Quran 69:30-32');
    // maces of iron (22:21-22)
    const mx = -35, mz = -95, my = groundH(mx, mz);
    post(P, mx - 5, mz, 8); post(P, mx + 5, mz, 8);
    box(P, ironMat, mx, my + 8, mz, 11, 0.6, 0.6);
    for (const off of [-2.4, 2.4]) {
      const head = box(P, ironMat, mx + off, my + 6, mz, 1.5, 1.5, 1.5);
      const handle = new THREE.Mesh(barGeo, ironMat);
      handle.position.set(mx + off, my + 7, mz); handle.scale.set(0.25, 2.4, 0.25); P.add(handle);
      slammers.push({ mesh: head, baseY: my + 6, seed: Math.random() * 10, prev: 0 });
    }
    SF(zi, 'sit', mx, mz, 0, 1);
    addStation(zi, mx, mz, 17, 'Maces of iron. Every time they try to escape the anguish, they are struck back down.', 'Quran 22:21-22');
    // yoked and dragged (40:71-72): scalding pool, fire pool, churned path
    {
      const yx = -80, yz = -10, yy = groundH(yx, yz);
      poolDisc(P, yx - 6, yz, 3, frostMat);
      riser(P, yx - 6, yy + 1, yz, 6, 0.7, 2.4, fogTex, 0.45);
      poolDisc(P, yx + 6, yz, 3, lavaMat);
      flame(P, yx + 6, yy + 1, yz, 4, 3, pitTex, 0.7);
      const path = poolDisc(P, yx, yz, 1, thornMat);
      path.scale.set(7, 2, 1);
      SF(zi, 'chained', yx, yz + 0.5, Math.PI / 2, 1);
      chainRun(P, yx, yy + 1.8, yz + 0.5, yx - 6, yy + 0.5, yz, 7);
      addStation(zi, yx, yz, 16, 'Yoked by the neck. Dragged through the scalding, then delivered to the flame. Again.', 'Quran 40:71-72');
    }
    // dragged closer (Muslim 2842): colossus in fog, tethered glows — no figure
    {
      const tx = 90, tz = -25;
      const bx = 135, bz = -38, by = groundH(bx, bz);
      box(P, ironMat, bx, by + 12, bz, 22, 24, 22);
      for (let i = 0; i < 10; i++) {
        const t = (i + 1) / 11;
        const gx = tx + (bx - tx) * t, gz = tz + (bz - tz) * t;
        flame(P, gx, groundH(gx, gz) + 2 + t * 10, gz, 0.9, 5, emberTex, 0.35);
      }
      addStation(zi, tx, tz, 16, 'Listen. That sound is Hell itself, dragged closer by more hands than stars.', 'Muslim 2842');
    }
  }
  // ——— DEPTH IV — City of Faces ———
  { const zi = 3, P = zoneProps[zi];
    // garments of fire (22:19)
    const g = SF(zi, 'stand', 100, -10, -Math.PI / 2, 1);
    const garb = new THREE.Mesh(shadeTorsoGeo, emberHotMat);
    garb.position.copy(g.g.position); garb.position.y += 1.15; garb.scale.set(1.18, 1.02, 1.18);
    P.add(garb);
    addStation(zi, 100, -10, 15, 'Garments cut from fire, fitted to the body. There is no other cloth here.', 'Quran 22:19');
    // faces turned in the fire (33:66)
    for (let i = 0; i < 6; i++) flame(P, -108 + i * 2.4, groundH(-105, 25) + 3.4, 25, 3.4, 7.5, pitTex);
    SF(zi, 'kneel', -105, 20.5, Math.PI, 1);
    addStation(zi, -105, 25, 16, 'The Day their faces are turned about in the Fire — wishing, too late, that they had obeyed.', 'Quran 33:66');
    // branded treasure (9:34-35): dull gold plinth that knows your name
    {
      const gx = 20, gz = 110, gy = groundH(gx, gz);
      box(P, goldMat, gx, gy + 0.5, gz, 3, 1, 2);
      box(P, goldMat, gx, gy + 1.4, gz, 2.2, 0.8, 1.6);
      box(P, goldMat, gx, gy + 2.1, gz, 1.4, 0.6, 1);
      pulse(goldMat, 1.3, 0.6, 2.2);
      SF(zi, 'stand', gx + 3.2, gz + 1, -Math.PI / 2, 1);
      flame(P, gx + 3.2, groundH(gx + 3.2, gz + 1) + 2.0, gz + 1, 1.2, 1.2, pitTex);
      flame(P, gx + 3.2, groundH(gx + 3.2, gz + 1) + 1.2, gz + 2.2, 1.0, 1.0, pitTex);
      flame(P, gx + 3.2, groundH(gx + 3.2, gz + 1) + 1.2, gz - 0.2, 1.0, 1.0, pitTex);
      addStation(zi, gx, gz, 15, 'Count it now. Your treasure is hot, and it knows your name.', 'Quran 9:34-35');
    }
    // dragged on faces (54:48): ember wake, three bowed ones pulled forward
    {
      const ex = -20, ez = -110, ey = groundH(ex, ez);
      for (let i = 0; i < 5; i++) flame(P, ex + i * 3, groundH(ex + i * 3, ez) + 0.5, ez, 1.4, 1.4, emberTex, 0.7);
      SF(zi, 'kneel', ex, ez + 1, Math.PI / 2, 1);
      SF(zi, 'kneel', ex + 6, ez + 1, Math.PI / 2, 1);
      SF(zi, 'kneel', ex + 12, ez + 1, Math.PI / 2, 1);
      chainRun(P, ex, ey + 0.8, ez + 1, ex + 6, ey + 0.8, ez + 1, 4);
      chainRun(P, ex + 6, ey + 0.8, ez + 1, ex + 12, ey + 0.8, ez + 1, 4);
      addStation(zi, ex + 6, ez, 15, 'Face down through the embers. This is the touch you denied.', 'Quran 54:48');
    }
  }
  // ——— DEPTH V — Sea of Fire ———
  { const zi = 4, P = zoneProps[zi];
    // degrees of submersion (Musnad Ahmad)
    poolDisc(P, 40, -110, 9, lavaMat);
    riser(P, 38, groundH(38, -112) + 1, -112, 8, 1.4, 3, emberTex);
    riser(P, 43, groundH(43, -108) + 1, -108, 8, 1.1, 3.4, emberTex);
    SF(zi, 'submerged', 36.5, -110, 0.5, 1, -0.15);   // ankles
    SF(zi, 'submerged', 40, -111.5, -0.4, 1, -0.95);  // waist
    SF(zi, 'submerged', 43.5, -109.5, 2.6, 1, -1.35); // chest
    addStation(zi, 40, -110, 17, 'Ankles. Knees. Waist. Chest. Swallowed whole. Each one is certain his torment is the worst.', 'Musnad Ahmad');
    // poured over the head (44:47-48)
    const qx = -60, qz = 110, qy = groundH(qx, qz);
    const vessel = new THREE.Mesh(barGeo, ironMat);
    vessel.position.set(qx, qy + 8.4, qz); vessel.scale.set(1.7, 1.7, 1.7); P.add(vessel);
    const stream = new THREE.Mesh(barGeo, streamMat);
    stream.position.set(qx, qy + 4.6, qz); stream.scale.set(0.28, 7.4, 0.28); P.add(stream);
    pulse(streamMat, 2.6, 0.9, 3.2);
    SF(zi, 'headback', qx, qz, 0, 1);
    addStation(zi, qx, qz, 16, 'Seize him, drag him to the middle of the Fire — then pour boiling water over his head. Taste!', 'Quran 44:47-49');
    // pacing between boil and blaze (55:44): two pools, worn path, two pacers
    {
      const vx = 95, vz = 45, vy = groundH(vx, vz);
      poolDisc(P, vx - 12, vz, 4, lavaMat);
      flame(P, vx - 12, groundH(vx - 12, vz) + 1, vz, 4, 3, pitTex, 0.7);
      poolDisc(P, vx + 13, vz, 4, frostMat);
      riser(P, vx + 13, groundH(vx + 13, vz) + 1, vz, 7, 0.8, 2.6, fogTex, 0.45);
      const walk = poolDisc(P, vx, vz, 1, thornMat);
      walk.scale.set(13, 1.8, 1);
      riser(P, vx, vy + 1, vz, 7, 1.0, 2.6, emberTex, 0.5);
      SF(zi, 'pace', vx - 3, vz, Math.PI / 2, 1);
      SF(zi, 'pace', vx + 3, vz, -Math.PI / 2, 1);
      addStation(zi, vx, vz, 16, 'Walk to the water. It is boiling. Walk back to the fire. Walk again.', 'Quran 55:44');
    }
    // enlarged for feeling (Muslim 2851): one colossus half-sunk in fire
    {
      const mx2 = -110, mz2 = -45, my2 = groundH(mx2, mz2);
      poolDisc(P, mx2, mz2, 8, lavaMat);
      riser(P, mx2 - 3, my2 + 1, mz2, 8, 1.2, 3, emberTex);
      riser(P, mx2 + 3, my2 + 1, mz2, 8, 1.0, 3.2, emberTex);
      SF(zi, 'kneel', mx2, mz2, 0, 3.6, -0.8);
      SF(zi, 'stand', mx2 + 8.5, mz2 + 1, -Math.PI / 2, 1);
      addStation(zi, mx2, mz2, 16, 'You are made larger here, so that nothing misses you and nothing fades.', 'Muslim 2851');
    }
  }
  // ——— DEPTH VI — Mirror Abyss ———
  { const zi = 5, P = zoneProps[zi];
    // zaqqum (44:43-46; 37:62-68)
    const zx = 110, zz = 80, zy = groundH(zx, zz);
    const trunk = new THREE.Mesh(barGeo, thornMat);
    trunk.position.set(zx, zy + 3.5, zz); trunk.scale.set(1.3, 7, 1.3); P.add(trunk);
    for (let i = 0; i < 5; i++) {
      const br = new THREE.Mesh(barGeo, thornMat);
      const a = (i / 5) * Math.PI * 2;
      br.position.set(zx + Math.cos(a) * 2.2, zy + 6 + (i % 2), zz + Math.sin(a) * 2.2);
      br.scale.set(0.4, 4.4, 0.4); br.rotation.z = Math.cos(a) * 1.1; br.rotation.x = Math.sin(a) * 1.1;
      P.add(br);
      const fr = new THREE.Mesh(ballGeo, fruitMat);
      fr.position.set(zx + Math.cos(a) * 3.6, zy + 5.2 + (i % 2), zz + Math.sin(a) * 3.6);
      fr.scale.setScalar(0.38); P.add(fr);
    }
    pulse(fruitMat, 2.4, 0.8, 1.6);
    SF(zi, 'reach', zx + 2.6, zz + 1.4, -Math.PI / 3, 1);
    addStation(zi, zx, zz, 17, 'The tree of Zaqqum — food of the sinful. One drop of it would ruin all life on earth.', 'Quran 44:43-46');
    // zamhareer (Bukhari & Muslim)
    poolDisc(P, -115, -75, 6, frostMat);
    pulse(frostMat, 1.5, 0.6, 1.1);
    flame(P, -115, groundH(-115, -75) + 1.2, -75, 9, 2.6, fogTex, 0.28);
    SF(zi, 'shiver', -115, -75, 0.8, 1);
    addStation(zi, -115, -75, 16, 'And a cold that burns worse than fire — bones cracking in the frost of Hell, begging for the flames again.', 'Bukhari & Muslim');
    // canopy of fire (39:16): ember ceiling over black water
    {
      const cx2 = 0, cz2 = 120, cy2 = groundH(cx2, cz2);
      poolDisc(P, cx2, cz2, 10, darkWaterMat);
      for (let i = 0; i < 10; i++) {
        const ox = ((i * 37) % 20) - 10, oz = ((i * 53) % 20) - 10;
        flame(P, cx2 + ox, cy2 + 22 + (i % 4) * 1.5, cz2 + oz, 1.5, 1.5, emberTex, 0.5);
      }
      SF(zi, 'stand', cx2, cz2, 0, 0.9);
      addStation(zi, cx2, cz2, 16, 'Look up. Look down. The fire has closed above you and below.', 'Quran 39:16');
    }
    // false shade (77:30-33): three leaning planes, no coolness — never any camel shape
    {
      const dx = 10, dz = -120, dy = groundH(dx, dz);
      const p1 = box(P, ironMat, dx - 2, dy + 2, dz, 4, 0.3, 4);
      p1.rotation.z = 0.28;
      const p2 = box(P, ironMat, dx + 2, dy + 2, dz, 4, 0.3, 4);
      p2.rotation.z = -0.3;
      const p3 = box(P, ironMat, dx, dy + 3.2, dz, 4.4, 0.3, 3.6);
      p3.rotation.x = 0.12;
      SF(zi, 'kneel', dx, dz, 0, 1);
      flame(P, dx, dy + 2, dz, 3, 4, pitTex, 0.6);
      for (let i = 0; i < 4; i++) flame(P, dx + (i - 1.5) * 3, dy + 10 + (i % 2), dz + (i - 1.5) * 2, 3, 3, emberTex, 0.4);
      addStation(zi, dx, dz, 16, 'That shade will not cool you. Watch the sky. The sparks rise like towers.', 'Quran 77:30-33');
    }
  }
  // ——— DEPTH VII — The Deepest ———
  { const zi = 6, P = zoneProps[zi];
    // the seat of judgment stands empty; the call to Malik (43:77)
    const sx = 0, sz = -140, sy = groundH(sx, sz);
    box(P, ironMat, sx, sy + 0.5, sz, 3.4, 1, 2.2);
    box(P, ironMat, sx, sy + 4.2, sz - 0.8, 3.4, 7.4, 0.8);
    flame(P, sx, sy + 4.5, sz - 0.6, 8, 11, pitTex, 0.5);
    SF(zi, 'sit', sx + 5.5, sz + 1, -Math.PI / 2.2, 1);
    // cage beside the seat
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const bar = new THREE.Mesh(postGeo, ironMat);
      bar.position.set(sx - 6.5 + Math.cos(a) * 1.6, sy + 1.6, sz + 3 + Math.sin(a) * 1.6);
      bar.scale.set(0.5, 3.2, 0.5); P.add(bar);
    }
    SF(zi, 'sit', sx - 6.5, sz + 3, 0.4, 0.95);
    addStation(zi, sx, sz, 18, 'They will call: O Malik, ask your Lord to end us. And the answer, after a thousand years of silence: You will remain.', 'Quran 43:77');
    // skins renewed (4:56) — the burn-and-restore cycle
    const rxf = SF(zi, 'stand', 55, 140, -0.6, 1.05);
    flame(P, rxf.g.position.x, rxf.g.position.y + 1.4, rxf.g.position.z, 4.5, 6.5, pitTex, 0.75);
    addStation(zi, 55, 140, 16, 'Every time their skins burn through, they are given new skins — so the pain never dulls. Forever.', 'Quran 4:56');
    // the lowest pit (4:145): concentric rings, seated apart, bowed — darkest dressing
    {
      const lx = -80, lz = 20, ly = groundH(lx, lz);
      const tiers: [number, number][] = [[18, 0.5], [12, 0.9], [6, 1.3]];
      for (const [sc, yy] of tiers) {
        const r = new THREE.Mesh(linkGeo, ironMat);
        r.position.set(lx, ly + yy, lz); r.rotation.x = Math.PI / 2; r.scale.set(sc, sc, 2.5);
        P.add(r);
      }
      SF(zi, 'sit', lx - 1.5, lz, 0.3, 1);
      SF(zi, 'sit', lx + 1.5, lz + 0.8, -0.4, 1);
      SF(zi, 'sit', lx + 0.2, lz - 1.6, Math.PI, 1);
      addStation(zi, lx, lz, 16, 'The lowest place is for the two-faced. No mask works this far down.', 'Quran 4:145');
    }
    // the asking void (50:30): vast emptiness with a faint red rim — no figure, nothing else staged
    {
      const ex2 = 90, ez2 = -20, ey2 = groundH(ex2, ez2);
      const voidDisc = poolDisc(P, ex2, ez2, 14, darkWaterMat);
      voidDisc.scale.set(18, 10, 1);
      const rim = new THREE.Mesh(linkGeo, rimMat);
      rim.position.set(ex2, ey2 + 0.3, ez2); rim.rotation.x = Math.PI / 2; rim.scale.set(50, 28, 1.5);
      P.add(rim);
      pulse(rimMat, 0.6, 0.4, 1.2);
      addStation(zi, ex2, ez2, 18, 'It asked if it was full. It answered: bring me more.', 'Quran 50:30');
    }
  }

  pulse(emberHotMat, 2.0, 0.7, 2.0);
  pulse(brassMat, 1.8, 0.6, 2.4);
  pulse(lavaMat, 1.6, 0.55, 1.7);
  // molten surfaces that visibly FLOW — scrolling emissive crack-maps
  const lavaFlow = crackTex.clone(); lavaFlow.needsUpdate = true;
  lavaMat.emissiveMap = lavaFlow; lavaMat.emissive.setHex(0xff5a00);
  flowTexs.push({ tex: lavaFlow, sx: 0.013, sy: -0.05 });
  const brassFlow = crackTex.clone(); brassFlow.needsUpdate = true;
  brassMat.emissiveMap = brassFlow; brassMat.emissive.setHex(0xff8a00);
  flowTexs.push({ tex: brassFlow, sx: 0.04, sy: -0.09 });
}

// the one who walks: a silhouette pacing its circle, never stopping, never arriving
let wanderer: Shade | null = null;
let wanderAngle = 0;
function buildWanderer() {
  wanderer = makeShade('walk', 45, 0, 0, 1.02);
}

let fxT = 0;
let stationFireT = -1000; // last station trigger time — the chained one echoes it
function thud() {
  if (!actx) return;
  try {
    const t = actx.currentTime;
    const o = actx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(58, t);
    o.frequency.exponentialRampToValueAtTime(30, t + 0.35);
    const g = actx.createGain();
    g.gain.setValueAtTime(0.22, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.45);
    o.connect(g); g.connect(actx.destination);
    o.start(t); o.stop(t + 0.5);
  } catch { /* noop */ }
}

function updateFigures(dt: number) {
  fxT += dt;
  for (const p of pulsers) p.m.emissiveIntensity = p.base + Math.sin(fxT * p.speed + p.seed) * p.amp;
  for (const r of risers) {
    const k = ((fxT * r.speed + r.seed) % r.h) / r.h;
    r.sp.position.set(r.x, r.y0 + k * r.h, r.z);
    (r.sp.material as THREE.SpriteMaterial).opacity = r.op * (1 - k * 0.75);
  }
  for (const f of flames) {
    const s = 1 + 0.16 * Math.sin(fxT * 9 + f.seed) + 0.09 * Math.sin(fxT * 23 + f.seed * 2);
    f.sp.scale.set(f.bx * s, f.by * (2 - s), 1);
  }
  for (const s of slammers) {
    const ph = (fxT * 0.45 + s.seed) % 1;
    if (s.prev < 0.9 && ph >= 0.9 && phase === 'playing') {
      const d = Math.hypot(camera.position.x - s.mesh.position.x, camera.position.z - s.mesh.position.z);
      if (d < 45) { flash(0.22); thud(); }
    }
    s.prev = ph;
    s.mesh.position.y = ph > 0.9 ? s.baseY - ((ph - 0.9) / 0.1) * 6.2 : s.baseY + Math.sin(fxT * 1.2 + s.seed) * 0.3;
  }
  for (const s of sufferers) {
    if (s.mode === 'walk' || s.mode === 'pace' || !s.g.visible) continue; // walker & pacers are driven below
    const t = fxT, sd = s.seed;
    if (s.mode === 'chained') {
      s.torso.rotation.z = Math.sin(t * 1.4 + sd) * 0.09;
      s.armL.rotation.x = Math.sin(t * 6.3 + sd) * 0.08;
      s.armR.rotation.x = Math.sin(t * 6.9 + sd + 1) * 0.08;
      s.head.rotation.z = Math.sin(t * 0.9 + sd) * 0.12;
    } else if (s.mode === 'kneel') {
      s.g.rotation.x = Math.sin(t * 0.8 + sd) * 0.07;
      s.head.rotation.x = 0.5 + Math.sin(t * 0.8 + sd) * 0.1;
    } else if (s.mode === 'submerged') {
      s.g.position.y = s.baseY + Math.sin(t * 1.2 + sd) * 0.14;
      s.head.rotation.x = -0.5 + Math.sin(t * 1.2 + sd) * 0.12;
    } else if (s.mode === 'reach') {
      s.armR.rotation.x = -2.7 + Math.sin(t * 1.1 + sd) * 0.16;
      s.torso.rotation.x = Math.sin(t * 1.1 + sd) * 0.05;
    } else if (s.mode === 'sit') {
      const sh = Math.pow(Math.max(0, Math.sin(t * (0.4 + (sd % 1) * 0.25) + sd * 3.1)), 24);
      s.torso.rotation.z = sh * Math.sin(t * (26 + (sd % 5)) + sd * 9) * 0.12;
      s.head.rotation.x = 0.55 + sh * 0.1;
    } else if (s.mode === 'shiver') {
      s.torso.position.x = Math.sin(t * 23 + sd) * 0.02;
      s.armL.rotation.x = Math.sin(t * 23 + sd) * 0.07;
      s.armR.rotation.x = Math.sin(t * 21 + sd + 2) * 0.07;
      s.head.rotation.z = Math.sin(t * 19 + sd) * 0.05;
    } else { // stand / headback — the light tremble
      s.torso.rotation.x = Math.sin(t * 4.7 + sd) * 0.02;
    }
    // near you, their torment visibly redoubles — twist harder the closer you stand
    const dc = Math.hypot(camera.position.x - s.g.position.x, camera.position.z - s.g.position.z);
    s.torso.rotation.y = Math.sin(t * 7 + sd) * 0.09 * Math.max(0, 1 - dc / 25);
    // chained figures fight their chains when you near — bigger struggle, no new meshes
    if (s.mode === 'chained') {
      const prox = Math.max(0, 1 - dc / 14);
      const fight = Math.sin(t * 9 + sd * 2) * 0.22 * prox;
      s.armL.rotation.x += fight;
      s.armR.rotation.x -= fight;
      s.torso.rotation.z += Math.sin(t * 7.3 + sd) * 0.1 * prox;
    }
    // station victims turn their blank heads toward you within 14m — yaw only, poses intact
    if (dc < 14) {
      const hx = camera.position.x - s.g.position.x, hz = camera.position.z - s.g.position.z;
      let want = Math.atan2(hx, hz) - s.g.rotation.y;
      want = Math.atan2(Math.sin(want), Math.cos(want));
      const tracked = THREE.MathUtils.clamp(want, -0.7, 0.7) * Math.max(0, 1 - dc / 14);
      s.head.rotation.y += (tracked - s.head.rotation.y) * Math.min(1, dt * 3);
    } else {
      s.head.rotation.y += (0 - s.head.rotation.y) * Math.min(1, dt * 2);
    }
  }
  if (wanderer) {
    wanderAngle += dt * 0.028;
    const r = 45;
    const wx = Math.cos(wanderAngle) * r, wz = Math.sin(wanderAngle) * r;
    wanderer.g.position.set(wx, groundH(wx, wz), wz);
    wanderer.g.rotation.y = Math.atan2(-Math.sin(wanderAngle), Math.cos(wanderAngle));
    const sw = Math.sin(fxT * 3.4);
    wanderer.legL.rotation.x = sw * 0.5; wanderer.legR.rotation.x = -sw * 0.5;
    wanderer.armL.rotation.x = -sw * 0.35; wanderer.armR.rotation.x = sw * 0.35;
    wanderer.g.position.y += Math.abs(Math.cos(fxT * 3.4)) * 0.05;
  }
  // the Sea-of-Fire pacers: endless march between boil and blaze, never arriving
  for (const s of sufferers) {
    if (s.mode !== 'pace' || !s.g.visible) continue;
    const sw = Math.sin(fxT * 3.4 + s.seed);
    s.legL.rotation.x = sw * 0.5; s.legR.rotation.x = -sw * 0.5;
    s.armL.rotation.x = -sw * 0.35; s.armR.rotation.x = sw * 0.35;
  }
}

function triggerStation(st: Station) {
  st.last = fxT;
  stationFireT = fxT;
  flash(0.6);
  screamBurst();
  showSubtitle(st.line + '  — ' + st.ref, 6.5);
  speak(st.line);
  thirst = Math.min(100, thirst + 6);
  sanity = Math.max(0, sanity - 8);
  whisperTimer = 2;
}

function updateStations() {
  if (phase !== 'playing') return;
  for (const st of stationsByZone[zoneIdx]) {
    if (fxT - st.last < 90) continue;
    const d = Math.hypot(camera.position.x - st.x, camera.position.z - st.z);
    if (d < st.r) triggerStation(st);
  }
  // the walker, noticed once
  if (wanderer && !((updateStations as unknown as { seen?: boolean }).seen)) {
    const d = Math.hypot(camera.position.x - wanderer.g.position.x, camera.position.z - wanderer.g.position.z);
    if (d < 22) {
      (updateStations as unknown as { seen?: boolean }).seen = true;
      showSubtitle('One of them walks. He cannot stop. There is nowhere to go.', 5);
    }
  }
}

// ---------------------------------------------------------------- the chained one
// A sufferer bound to YOU — always a few steps ahead, always in sight,
// always being punished. You never hunt for him. He is the preview.
const LASH_LINES: { line: string; ref: string }[] = [
  { line: 'This is the Fire which you used to deny.', ref: 'Quran 52:14' },
  { line: 'You will remain. There is no second death here.', ref: 'Quran 43:77' },
  { line: 'New skins, again and again — so the suffering never dulls.', ref: 'Quran 4:56' },
  { line: 'Beg for water, and receive molten brass.', ref: 'Quran 18:29' },
  { line: 'A thousand years of screaming — and not one cry answered.', ref: 'Tirmidhi 2586' },
  { line: 'Every escape is struck back down.', ref: 'Quran 22:22' },
  { line: 'No friend today. No food but the filth of wounds.', ref: 'Quran 69:35-36' },
  { line: 'No death will finish you. No pain will ever grow lighter.', ref: 'Quran 35:36' },
  { line: 'It does not quench. It cuts you open from the inside.', ref: 'Quran 47:15' },
  { line: 'You walked tall. Now walk small, with the small, to the prison called Bulas.', ref: 'Tirmidhi 2492' },
];

let companion: Shade | null = null;
const compChain: THREE.Mesh[] = [];
let striker: THREE.Mesh | null = null;
let compMode: 'trudge' | 'fallen' | 'lashed' = 'trudge';
let compT = 0;
let nextStumble = 9;
let nextLash = 14;
let lashIdx = 0;
let fallDir = 1;
let lashBend = false; // true while the current lash is one of the 4 new doubling-over lines

function whimper() {
  if (!actx) return;
  try {
    const t = actx.currentTime;
    const o = actx.createOscillator(); o.type = 'triangle';
    o.frequency.setValueAtTime(300 + Math.random() * 90, t);
    o.frequency.exponentialRampToValueAtTime(130, t + 0.7);
    const g = actx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.12, t + 0.1);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.8);
    o.connect(g); g.connect(actx.destination);
    o.start(t); o.stop(t + 0.9);
  } catch { /* noop */ }
}

function buildCompanion() {
  companion = makeShade('walk', 0, 13, Math.PI, 1.0);
  for (let i = 0; i < 8; i++) {
    const m = new THREE.Mesh(linkGeo, ironMat);
    scene.add(m); compChain.push(m);
  }
  striker = box(scene, ironMat, 0, 8, 13, 1.3, 1.3, 1.3);
  const gl = new THREE.SpriteMaterial({ map: emberTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.5 });
  const gs = new THREE.Sprite(gl); gs.scale.set(3, 3, 1); striker.add(gs);
  // foot-glow so your eyes always find him in the dark
  const fg = new THREE.SpriteMaterial({ map: emberTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.35 });
  const fs = new THREE.Sprite(fg); fs.scale.set(2.6, 1.6, 1); fs.position.y = 0.4;
  companion.g.add(fs);
}

function placeCompanionAhead() {
  if (!companion) return;
  const ax = camera.position.x - Math.sin(yaw) * 7;
  const az = camera.position.z - Math.cos(yaw) * 7;
  companion.g.position.set(ax, groundH(ax, az), az);
  companion.baseY = companion.g.position.y;
  companion.g.rotation.set(0, yaw, 0);
  compMode = 'trudge'; compT = 0;
  nextStumble = 7 + Math.random() * 6;
  nextLash = 10 + Math.random() * 8;
}

function updateCompanion(dt: number) {
  if (!companion || phase !== 'playing') return;
  const c = companion;
  compT += dt;
  // the ahead-point: 7m in front of where YOU face — he hurries back into frame
  const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
  let tx = camera.position.x + fx * 7;
  let tz = camera.position.z + fz * 7;
  const tr = Math.hypot(tx, tz);
  if (tr > 180) { tx *= 180 / tr; tz *= 180 / tr; }
  const dx = tx - c.g.position.x, dz = tz - c.g.position.z;
  const d = Math.hypot(dx, dz);

  if (compMode === 'fallen') {
    // collapsed in the dirt, then struggles back up — he is never allowed rest
    c.g.rotation.z += (fallDir * 1.35 - c.g.rotation.z) * Math.min(1, dt * 5);
    c.g.position.y += (c.baseY + 0.25 - c.g.position.y) * Math.min(1, dt * 5);
    c.torso.rotation.x = 0; c.torso.rotation.z = 0;
    // pleading: one arm reaches toward you as he falls, blank face turns to you
    c.armR.rotation.x = -1.3 + Math.sin(fxT * 3) * 0.15;
    c.head.rotation.x = 0.2;
    {
      const hx = camera.position.x - c.g.position.x, hz = camera.position.z - c.g.position.z;
      let want = Math.atan2(hx, hz) - c.g.rotation.y;
      want = Math.atan2(Math.sin(want), Math.cos(want));
      const tracked = THREE.MathUtils.clamp(want, -0.75, 0.75);
      c.head.rotation.y += (tracked - c.head.rotation.y) * Math.min(1, dt * 4);
      c.armR.rotation.z += (THREE.MathUtils.clamp(-want, -0.5, 0.5) - c.armR.rotation.z) * Math.min(1, dt * 4);
    }
    if (compT > 2.4) { compMode = 'trudge'; compT = 0; c.armR.rotation.z = 0; }
  } else if (compMode === 'lashed') {
    // struck — convulsing under the striker, synced to screamVoice() at fire time
    const spike = compT < 0.3 ? 2 : 1; // scream-sync: convulsion peaks on the scream's first 0.3s
    c.g.position.x += (Math.random() - 0.5) * 0.22 * spike;
    c.g.position.z += (Math.random() - 0.5) * 0.22 * spike;
    c.torso.rotation.y = Math.sin(fxT * 42) * 0.45 * spike;
    c.torso.rotation.z = 0;
    // new-lines staging: abstract double-over only — no anatomy, no liquid
    c.torso.rotation.x = lashBend ? 0.7 + Math.sin(fxT * 18) * 0.08 * spike : 0;
    c.head.rotation.x = lashBend ? 0.5 : -0.6;
    {
      const hx = camera.position.x - c.g.position.x, hz = camera.position.z - c.g.position.z;
      let want = Math.atan2(hx, hz) - c.g.rotation.y;
      want = Math.atan2(Math.sin(want), Math.cos(want));
      const tracked = THREE.MathUtils.clamp(want, -0.75, 0.75);
      c.head.rotation.y += (tracked - c.head.rotation.y) * Math.min(1, dt * 4);
    }
    if (striker) {
      const by = c.g.position.y;
      striker.position.x = c.g.position.x; striker.position.z = c.g.position.z;
      striker.position.y = compT < 0.12 ? by + 6.5 - (compT / 0.12) * 5.1
        : compT < 0.3 ? by + 1.4
        : by + 1.4 + Math.min(1, (compT - 0.3) / 0.8) * 5.1 + Math.sin(fxT * 1.3) * 0.25;
    }
    if (compT > 1.1) { compMode = 'trudge'; compT = 0; c.torso.rotation.y = 0; c.torso.rotation.x = 0; lashBend = false; }
  } else {
    // trudge: hurries when left behind, trudges head-hung when near
    // gate awareness: he knows what descent means — slows, faces it, trembles
    const gateD = Math.hypot(c.g.position.x - gateGroup.position.x, c.g.position.z - gateGroup.position.z);
    const gateNear = gateGroup.visible && gateD < 25;
    const dragged = d > 14; // chain taut: he is hauled back, scrambling
    let speed: number = dragged ? 10.5 : d > 8 ? 6 : 3.4;
    if (gateNear) speed *= 0.35;
    if (d > 0.5) {
      c.g.position.x += (dx / d) * speed * dt;
      c.g.position.z += (dz / d) * speed * dt;
    }
    const freq = dragged ? 9 : 3 + speed * 0.35;
    const amp = dragged ? 0.85 : 0.25 + speed * 0.035;
    c.g.position.y = groundH(c.g.position.x, c.g.position.z) + Math.abs(Math.cos(fxT * freq)) * (dragged ? 0.09 : 0.04);
    if (d > 0.6) {
      let targetRy = Math.atan2(dx, dz);
      if (gateNear) targetRy = Math.atan2(gateGroup.position.x - c.g.position.x, gateGroup.position.z - c.g.position.z);
      let dr = targetRy - c.g.rotation.y;
      dr = Math.atan2(Math.sin(dr), Math.cos(dr));
      c.g.rotation.y += dr * Math.min(1, dt * 6);
    }
    c.g.rotation.z += (0 - c.g.rotation.z) * Math.min(1, dt * 4);
    const sw = Math.sin(fxT * freq);
    c.legL.rotation.x = sw * amp * 1.6; c.legR.rotation.x = -sw * amp * 1.6;
    c.armL.rotation.x = -sw * amp; c.armR.rotation.x = sw * amp;
    c.armR.rotation.z += (0 - c.armR.rotation.z) * Math.min(1, dt * 4);
    c.torso.rotation.x = dragged ? 0.3 : 0; // hauled forward lean
    c.torso.rotation.z = 0;
    if (gateNear) {
      c.torso.rotation.z = Math.sin(fxT * 30) * 0.1;
      c.torso.rotation.x += 0.15 + Math.sin(fxT * 26) * 0.05;
      c.head.rotation.z = Math.sin(fxT * 24) * 0.06;
    } else {
      c.head.rotation.z += (0 - c.head.rotation.z) * Math.min(1, dt * 4);
    }
    c.head.rotation.x = 0.45; // hung — always
    // ...until he feels you near: his blank face turns toward you
    {
      const hx = camera.position.x - c.g.position.x, hz = camera.position.z - c.g.position.z;
      const hd = Math.hypot(hx, hz);
      let want = Math.atan2(hx, hz) - c.g.rotation.y;
      want = Math.atan2(Math.sin(want), Math.cos(want));
      const tracked = THREE.MathUtils.clamp(want, -0.75, 0.75) * Math.max(0, 1 - hd / 16);
      c.head.rotation.y += (tracked - c.head.rotation.y) * Math.min(1, dt * 3);
    }
    if (dragged && Math.random() < dt * 2) rattle(); // chains scream as he is hauled back
    if (striker) striker.position.set(c.g.position.x, c.g.position.y + 6.5 + Math.sin(fxT * 1.3) * 0.25, c.g.position.z);
    nextStumble -= dt;
    if (nextStumble <= 0) {
      compMode = 'fallen'; compT = 0; fallDir = Math.random() < 0.5 ? -1 : 1;
      nextStumble = 8 + Math.random() * 9;
      whimper(); rattle();
      sanity = Math.max(0, sanity - 2);
    }
  }
  // station empathy: any station's torment echoes in him for ~3s
  if (fxT - stationFireT < 3) {
    c.torso.rotation.z += Math.sin(fxT * 30) * 0.09;
    c.head.rotation.x += Math.abs(Math.sin(fxT * 24)) * 0.08;
  }
  // the lash finds him wherever he is, on its own timer
  if (compMode === 'trudge') {
    nextLash -= dt;
    if (nextLash <= 0) {
      compMode = 'lashed'; compT = 0;
      nextLash = 16 + Math.random() * 10;
      const li = lashIdx % LASH_LINES.length;
      const L = LASH_LINES[li]; lashIdx++;
      lashBend = li >= 6; // the 4 new lines: abstract double-over staging only
      flash(0.3); screamVoice(); thud();
      showSubtitle(L.line + '  — ' + L.ref, 5);
      speak(L.line);
      sanity = Math.max(0, sanity - 3);
    }
  }
  // the chain binding him to you — sagging between you both, always
  const ax = c.g.position.x, ay = c.g.position.y + 1.3, az = c.g.position.z;
  const bx = camera.position.x, by = groundH(camera.position.x, camera.position.z) + 0.5, bz = camera.position.z;
  const taut = d > 14; // dragged: chain pulled straight; else sagging between you both
  const sag = taut ? 0.05 : 0.9;
  for (let i = 0; i < compChain.length; i++) {
    const t = i / (compChain.length - 1);
    const m = compChain[i];
    m.position.set(ax + (bx - ax) * t, ay + (by - ay) * t - Math.sin(t * Math.PI) * sag, az + (bz - az) * t);
    m.rotation.y = (i % 2) * Math.PI / 2 + (taut ? 0 : Math.sin(fxT * 0.8 + i) * 0.1);
  }
  if (striker && compMode !== 'lashed') {
    striker.position.x += (c.g.position.x - striker.position.x) * Math.min(1, dt * 5);
    striker.position.z += (c.g.position.z - striker.position.z) * Math.min(1, dt * 5);
  }
}

// ---------------------------------------------------------------- audio (all procedural)
let actx: AudioContext | null = null;
let droneGain: GainNode | null = null;
let windGain: GainNode | null = null;
let windFilter: BiquadFilterNode | null = null;
let breathGain: GainNode | null = null;

function initAudio() {
  if (actx) return;
  actx = new AudioContext();
  const master = actx.createGain(); master.gain.value = 0.8; master.connect(actx.destination);

  // deep hell-drone: two detuned low oscillators
  droneGain = actx.createGain(); droneGain.gain.value = 0.0; droneGain.connect(master);
  for (const f of [38, 38.7, 77.3]) {
    const o = actx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f;
    const lp = actx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 160;
    const g = actx.createGain(); g.gain.value = 0.05;
    o.connect(lp); lp.connect(g); g.connect(droneGain); o.start();
  }
  // slow LFO on drone = breathing of the pit
  const lfo = actx.createOscillator(); lfo.frequency.value = 0.07;
  const lfoG = actx.createGain(); lfoG.gain.value = 0.05;
  lfo.connect(lfoG); lfoG.connect(droneGain!.gain); lfo.start();
  droneGain.gain.linearRampToValueAtTime(0.14, actx.currentTime + 4);

  // wind of embers: looped noise through bandpass
  const len = actx.sampleRate * 3;
  const buf = actx.createBuffer(1, len, actx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  const src = actx.createBufferSource(); src.buffer = buf; src.loop = true;
  windFilter = actx.createBiquadFilter(); windFilter.type = 'bandpass'; windFilter.frequency.value = 400; windFilter.Q.value = 0.6;
  windGain = actx.createGain(); windGain.gain.value = 0.05;
  src.connect(windFilter); windFilter.connect(windGain); windGain.connect(master); src.start();

  // player breath loop (fear)
  breathGain = actx.createGain(); breathGain.gain.value = 0.0; breathGain.connect(master);
  const bSrc = actx.createBufferSource(); bSrc.buffer = buf; bSrc.loop = true; bSrc.playbackRate.value = 0.3;
  const bFil = actx.createBiquadFilter(); bFil.type = 'lowpass'; bFil.frequency.value = 500;
  bSrc.connect(bFil); bFil.connect(breathGain); bSrc.start();

  // ---- dread layers (research: dissonance + near-infrasound = unease) ----
  sfxBus = actx.createGain(); sfxBus.gain.value = 0.9; sfxBus.connect(master);
  masterBus = master;
  // shared looped-noise buffer for aspiration breath (one alloc, reused by wails)
  sharedNoise = actx.createBuffer(1, actx.sampleRate * 2, actx.sampleRate);
  {
    const nd = sharedNoise.getChannelData(0);
    for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
  }
  // wail bus with zone-darkening lowpass (vertical remix: deeper zones = darker)
  wailBus = actx.createGain(); wailBus.gain.value = 1.0;
  wailDark = actx.createBiquadFilter(); wailDark.type = 'lowpass'; wailDark.frequency.value = 3200; wailDark.Q.value = 0.4;
  wailBus.connect(wailDark); wailDark.connect(sfxBus);
  // procedural cavern reverb: 1.2s decaying-noise impulse, dry path kept + wet path added
  {
    const dur = 1.2, rate = actx.sampleRate, impLen = Math.floor(rate * dur);
    const imp = actx.createBuffer(2, impLen, rate);
    for (let ch = 0; ch < 2; ch++) {
      const chd = imp.getChannelData(ch);
      for (let i = 0; i < impLen; i++) {
        const k = i / impLen;
        chd[i] = (Math.random() * 2 - 1) * Math.pow(1 - k, 2.4);
      }
    }
    verbNode = actx.createConvolver(); verbNode.buffer = imp;
    verbSend = actx.createGain(); verbSend.gain.value = 1.0;
    verbGain = actx.createGain(); verbGain.gain.value = 0.22;
    sfxBus.connect(verbSend); verbSend.connect(verbNode); verbNode.connect(verbGain); verbGain.connect(master);
  }

  // tritone against the 38Hz drone + a 19.5Hz near-infrasound weight
  const tri = actx.createOscillator(); tri.type = 'sawtooth'; tri.frequency.value = 53.7;
  const triF = actx.createBiquadFilter(); triF.type = 'lowpass'; triF.frequency.value = 130;
  const triG = actx.createGain(); triG.gain.value = 0.035;
  tri.connect(triF); triF.connect(triG); triG.connect(master); tri.start();
  const sub = actx.createOscillator(); sub.type = 'sine'; sub.frequency.value = 19.5;
  const subG = actx.createGain(); subG.gain.value = 0.05;
  sub.connect(subG); subG.connect(master); sub.start();

  // fire roar bed — gain follows flame proximity every frame
  const rSrc = actx.createBufferSource(); rSrc.buffer = buf; rSrc.loop = true; rSrc.playbackRate.value = 0.5;
  roarFilter = actx.createBiquadFilter(); roarFilter.type = 'lowpass'; roarFilter.frequency.value = 320;
  roarGain = actx.createGain(); roarGain.gain.value = 0.0;
  rSrc.connect(roarFilter); roarFilter.connect(roarGain); roarGain.connect(master); rSrc.start();

  // the choir: one voice chained near you, four lost in the dark
  compVoice = makeWail(250, 0, 0, true, 0.14, 0.09);
  chorusVoices = [
    makeWail(168, -60, 60, false, 0.075, 0.045),
    makeWail(214, 70, -40, false, 0.075, 0.045),
    makeWail(142, 0, 120, false, 0.075, 0.045),
    makeWail(262, -110, -20, false, 0.075, 0.045),
  ];
}

function screamBurst() {
  // distant scream = descending pitch sweep of filtered noise. No samples needed.
  if (!actx || !droneGain) return;
  const t = actx.currentTime;
  const o = actx.createOscillator(); o.type = 'sawtooth';
  o.frequency.setValueAtTime(600 + Math.random() * 500, t);
  o.frequency.exponentialRampToValueAtTime(120, t + 1.4 + Math.random());
  const f = actx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 900; f.Q.value = 4;
  const g = actx.createGain();
  g.gain.setValueAtTime(0.0, t);
  g.gain.linearRampToValueAtTime(0.10, t + 0.15);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 1.8);
  o.connect(f); f.connect(g); g.connect(actx.destination);
  o.start(t); o.stop(t + 2);
}

// ---------------------------------------------------------------- spoken reminders
// A loud voice over the torment: SpeechSynthesis, no audio files needed.
let voiceOn = true;
let chosenVoice: SpeechSynthesisVoice | null = null;
function pickVoice() {
  try {
    const vs = speechSynthesis.getVoices().filter((v) => v.lang.toLowerCase().startsWith('en'));
    chosenVoice =
      vs.find((v) => /male|daniel|david|alex|fred|james|george/i.test(v.name)) ||
      vs.find((v) => /google uk english male|google us english/i.test(v.name)) ||
      vs[0] || null;
  } catch { chosenVoice = null; }
}
if ('speechSynthesis' in window) {
  pickVoice();
  try { speechSynthesis.onvoiceschanged = pickVoice; } catch { /* noop */ }
}
function speak(text: string) {
  if (!voiceOn || !('speechSynthesis' in window)) return;
  try {
    speechSynthesis.cancel();
    speechSynthesis.resume();
    const u = new SpeechSynthesisUtterance(text);
    u.volume = 1; u.rate = 0.95; u.pitch = 0.5;
    if (chosenVoice) u.voice = chosenVoice;
    speechSynthesis.speak(u);
  } catch { /* voice unavailable — subtitles still carry it */ }
}

// One spoken reminder per depth, on entry.
const ZONE_VOICE = [
  'The lightest punishment in Hell: sandals of fire that make the brain boil. And this is only the first depth — reported by Bukhari and Muslim.',
  'They will beg for food, and be fed bitter thorn, that neither nourishes, nor ends hunger — the thorn of the Quran.',
  'Seize him. Fetter him. Then chain him, in a chain of seventy cubits.',
  'Garments of fire are cut for them. And faces are turned over in the flames.',
  'Some drown to the ankles. Some to the waist. Some are swallowed whole. And boiling water is poured over their heads.',
  'Eat from the tree of Zaqqum. It boils in the belly like molten metal. And beside it, a cold that cracks the bones.',
  'They will call: O Malik, ask your Lord to end us. And after a thousand years of silence, the answer comes: You will remain.',
];

// gate-whispers: warned once per depth as you near the descent
const GATE_LINES: { line: string; ref: string }[] = [
  { line: 'Seven gates. Each gate has its portion named. One of them has yours.', ref: 'Quran 15:44' },
  { line: 'Every crowd thrown in is asked: did no warner ever come to you? You were warned.', ref: 'Quran 67:8' },
];
let gateSaidZone = -1;

// ---------------------------------------------------------------- voices of the damned
// Procedural source-filter vocal synthesis: sawtooth glottis through two
// vowel formants ("ah": ~750Hz + ~1220Hz), vibrato, pitch envelopes.
// No samples — every wail below is synthesized live.
let sfxBus: GainNode | null = null;
let roarGain: GainNode | null = null;
let roarFilter: BiquadFilterNode | null = null;
let masterBus: GainNode | null = null;
let wailBus: GainNode | null = null;
let wailDark: BiquadFilterNode | null = null;
let verbNode: ConvolverNode | null = null;
let verbSend: GainNode | null = null;
let verbGain: GainNode | null = null;
let sharedNoise: AudioBuffer | null = null;
let masterVol = 0.8;
let wasLashed = false;
let choirDip = 0;
interface WailVoice {
  osc: OscillatorNode; gain: GainNode; pan: StereoPannerNode | null;
  baseF: number; seed: number; wob: number; x: number; z: number;
  followsCompanion: boolean; maxGain: number; falloff: number;
  effort: number; crackUntil: number;
}
let compVoice: WailVoice | null = null;
let chorusVoices: WailVoice[] = [];
let screamCurve: Float32Array<ArrayBuffer> | null = null;
let stepAcc = 0;
let stepFlip = false;
let hbT = 0.8;
let roarNear = 1e9;

function makeWail(baseF: number, x: number, z: number, follows: boolean, maxGain: number, falloff: number): WailVoice {
  const a = actx!;
  const effort = 0.75 + Math.random() * 0.5;
  const osc = a.createOscillator(); osc.type = 'sawtooth'; osc.frequency.value = baseF;
  const vib = a.createOscillator(); vib.frequency.value = 5.2 + Math.random() * 1.6;
  const vibG = a.createGain(); vibG.gain.value = baseF * 0.06 * effort;
  vib.connect(vibG); vibG.connect(osc.frequency); vib.start();
  const f1 = a.createBiquadFilter(); f1.type = 'bandpass'; f1.frequency.value = 750; f1.Q.value = 1.6;
  const f2 = a.createBiquadFilter(); f2.type = 'bandpass'; f2.frequency.value = 1220; f2.Q.value = 2.2;
  const f3 = a.createBiquadFilter(); f3.type = 'bandpass'; f3.frequency.value = 2500; f3.Q.value = 3.0;
  const g2 = a.createGain(); g2.gain.value = 0.5;
  const g3 = a.createGain(); g3.gain.value = 0.22;
  const gain = a.createGain(); gain.gain.value = 0;
  let pan: StereoPannerNode | null = null;
  try { pan = a.createStereoPanner(); } catch { pan = null; }
  osc.connect(f1); osc.connect(f2); osc.connect(f3); f2.connect(g2); f3.connect(g3); f1.connect(gain); g2.connect(gain); g3.connect(gain);
  // faint aspiration noise (breath through the cry) — looped shared buffer
  if (sharedNoise) {
    const ns = a.createBufferSource(); ns.buffer = sharedNoise; ns.loop = true; ns.playbackRate.value = 0.6 + Math.random() * 0.3;
    const nf = a.createBiquadFilter(); nf.type = 'bandpass'; nf.frequency.value = 2500; nf.Q.value = 0.8;
    const ng = a.createGain(); ng.gain.value = 0.05;
    ns.connect(nf); nf.connect(ng); ng.connect(gain); ns.start();
  }
  if (pan) { gain.connect(pan); pan.connect(wailBus ?? sfxBus!); } else { gain.connect(wailBus ?? sfxBus!); }
  osc.start();
  return { osc, gain, pan, baseF, seed: Math.random() * 10, wob: 0.45 + Math.random() * 0.5, x, z, followsCompanion: follows, maxGain, falloff, effort, crackUntil: -1 };
}

// a near, human scream for the lash — pitch collapse + distortion, not a synth blip
function screamVoice() {
  if (!actx || !sfxBus) return;
  try {
    if (!screamCurve) {
      screamCurve = new Float32Array(256);
      for (let i = 0; i < 256; i++) { const x = (i / 128) - 1; screamCurve[i] = Math.tanh(2.5 * x); }
    }
    const a = actx, t = a.currentTime;
    const o = a.createOscillator(); o.type = 'sawtooth';
    o.frequency.setValueAtTime(620 + Math.random() * 120, t);
    o.frequency.exponentialRampToValueAtTime(150, t + 1.5);
    const vib = a.createOscillator(); vib.frequency.value = 6.5;
    const vg = a.createGain(); vg.gain.value = 45;
    vib.connect(vg); vg.connect(o.frequency); vib.start(t); vib.stop(t + 1.7);
    const f1 = a.createBiquadFilter(); f1.type = 'bandpass'; f1.frequency.value = 850; f1.Q.value = 1.4;
    const f2 = a.createBiquadFilter(); f2.type = 'bandpass'; f2.frequency.value = 1350; f2.Q.value = 2.5;
    const g2 = a.createGain(); g2.gain.value = 0.6;
    const ws = a.createWaveShaper(); ws.curve = screamCurve; ws.oversample = '2x';
    const g = a.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.5, t + 0.12);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.7);
    o.connect(f1); o.connect(f2); f2.connect(g2); f1.connect(ws); g2.connect(ws); ws.connect(g); g.connect(sfxBus);
    o.start(t); o.stop(t + 1.8);
  } catch { /* noop */ }
}

function rattle() {
  if (!actx || !sfxBus) return;
  try {
    const a = actx, t0 = a.currentTime;
    for (let i = 0; i < 4; i++) {
      const t = t0 + i * (0.05 + Math.random() * 0.04);
      const fr = 1800 + Math.random() * 2200;
      const o = a.createOscillator(); o.type = 'square'; o.frequency.value = fr;
      const f = a.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = fr; f.Q.value = 8;
      const g = a.createGain();
      g.gain.setValueAtTime(0.055, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
      o.connect(f); f.connect(g); g.connect(sfxBus);
      o.start(t); o.stop(t + 0.12);
    }
  } catch { /* noop */ }
}

function stepThump(k: number) {
  if (!actx || !sfxBus) return;
  try {
    const a = actx, t = a.currentTime;
    const zi = zoneIdx;
    const o = a.createOscillator(); o.type = 'sine';
    if (zi <= 1) {
      o.frequency.setValueAtTime(stepFlip ? 62 : 55, t);
      stepFlip = !stepFlip;
      o.frequency.exponentialRampToValueAtTime(30, t + 0.13);
    } else if (zi <= 4) {
      o.frequency.setValueAtTime(stepFlip ? 82 : 74, t);
      stepFlip = !stepFlip;
      o.frequency.exponentialRampToValueAtTime(40, t + 0.09);
    } else {
      o.frequency.setValueAtTime(stepFlip ? 66 : 60, t);
      stepFlip = !stepFlip;
      o.frequency.exponentialRampToValueAtTime(34, t + 0.12);
    }
    const g = a.createGain();
    g.gain.setValueAtTime(0.05 + 0.06 * k, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.14);
    o.connect(g); g.connect(sfxBus); o.start(t); o.stop(t + 0.16);
    // stone knock layer: bandpass click for zones 2-4
    if (zi >= 2 && zi <= 4) {
      const c = a.createOscillator(); c.type = 'triangle';
      c.frequency.setValueAtTime(1050 + Math.random() * 350, t);
      const cf = a.createBiquadFilter(); cf.type = 'bandpass'; cf.frequency.value = 1200; cf.Q.value = 5;
      const cg = a.createGain();
      cg.gain.setValueAtTime(0.03 + 0.03 * k, t);
      cg.gain.exponentialRampToValueAtTime(0.0001, t + 0.06);
      c.connect(cf); cf.connect(cg); cg.connect(sfxBus); c.start(t); c.stop(t + 0.08);
    }
    // hollow keter + faint sizzle near lava (zone 4)
    if (zi === 4) {
      const h = a.createOscillator(); h.type = 'sine';
      h.frequency.setValueAtTime(96, t);
      h.frequency.exponentialRampToValueAtTime(48, t + 0.22);
      const hg = a.createGain();
      hg.gain.setValueAtTime(0.03 + 0.02 * k, t);
      hg.gain.exponentialRampToValueAtTime(0.0001, t + 0.24);
      h.connect(hg); hg.connect(sfxBus); h.start(t); h.stop(t + 0.26);
      if (!sharedNoise) return;
      const ss = a.createBufferSource(); ss.buffer = sharedNoise; ss.playbackRate.value = 1.7 + Math.random() * 0.4;
      const sf = a.createBiquadFilter(); sf.type = 'highpass'; sf.frequency.value = 4200;
      const sg = a.createGain(); sg.gain.value = 0.016;
      ss.connect(sf); sf.connect(sg); sg.connect(sfxBus); ss.start(t); ss.stop(t + 0.16);
    }
  } catch { /* noop */ }
}

function heartThump(v = 1) {
  if (!actx || !sfxBus) return;
  try {
    const a = actx, t = a.currentTime;
    const o = a.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(58, t);
    o.frequency.exponentialRampToValueAtTime(34, t + 0.16);
    const g = a.createGain();
    g.gain.setValueAtTime(0.13 * v, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
    o.connect(g); g.connect(sfxBus); o.start(t); o.stop(t + 0.25);
  } catch { /* noop */ }
}

function crackle() {
  if (!actx || !sfxBus || !sharedNoise) return;
  try {
    const a = actx, t = a.currentTime;
    const s = a.createBufferSource(); s.buffer = sharedNoise; s.playbackRate.value = 1.5 + Math.random();
    const f = a.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 2500;
    const g = a.createGain(); g.gain.value = 0.05;
    s.connect(f); f.connect(g); g.connect(sfxBus); s.start(t); s.stop(t + 0.08);
  } catch { /* noop */ }
}

const ROAR_SPOTS: [number, number][] = [[40, -110], [-45, 35], [-105, 25], [55, 140], [-60, 110]];

function updateWail(v: WailVoice | null, boost: number) {
  if (!v || !actx) return;
  const px = v.followsCompanion && companion ? companion.g.position.x : v.x;
  const pz = v.followsCompanion && companion ? companion.g.position.z : v.z;
  const dx = px - camera.position.x, dz = pz - camera.position.z;
  const d = Math.hypot(dx, dz);
  // cry envelope: swells and chokes, never steady, never resolving
  const choke = 0.45 + 0.55 * Math.max(0, Math.sin(fxT * v.wob + v.seed));
  const choke2 = 0.6 + 0.4 * Math.sin(fxT * v.wob * 2.7 + v.seed * 2);
  const eff = v.effort;
  // companion voice cracks under the lash: random downward pitch breaks
  const lashed = v.followsCompanion && compMode === 'lashed';
  if (lashed && Math.random() < 0.05) v.crackUntil = fxT + 0.1 + Math.random() * 0.18;
  const cracked = lashed && fxT < v.crackUntil;
  const crackMul = cracked ? 0.55 : 1;
  const f = v.baseF * (0.82 + 0.38 * choke * eff) * choke2 * boost * crackMul;
  v.osc.frequency.setTargetAtTime(Math.max(60, f), actx.currentTime, cracked ? 0.03 : 0.09);
  const atten = 1 / (1 + d * v.falloff);
  const dipMul = !v.followsCompanion && choirDip > 0 ? Math.max(0, 1 - choirDip * 4) : 1;
  v.gain.gain.setTargetAtTime(v.maxGain * choke * (0.7 + 0.3 * eff) * atten * boost * dipMul, actx.currentTime, 0.18);
  // stereo: which ear faces the suffering
  const inv = 1 / Math.max(1, d);
  const rx = Math.cos(yaw), rz = -Math.sin(yaw);
  if (v.pan) v.pan.pan.setTargetAtTime(THREE.MathUtils.clamp((dx * rx + dz * rz) * inv, -1, 1) * 0.85, actx.currentTime, 0.15);
}

function updateAudio(dt: number) {
  if (!actx) return;
  const t = actx.currentTime;
  // lash edge -> brief choir silence-dip right before the strike lands
  const lashedNow = compMode === 'lashed';
  if (lashedNow && !wasLashed) choirDip = 0.28;
  wasLashed = lashedNow;
  if (choirDip > 0) choirDip = Math.max(0, choirDip - dt);
  // wail bus darkens with depth (vertical remix, read-only zoneIdx)
  if (wailDark) wailDark.frequency.setTargetAtTime(3200 - zoneIdx * 280, t, 0.6);
  // fire roar follows the nearest flame
  roarNear = 1e9;
  for (const p of pits) {
    const d = Math.hypot(camera.position.x - p.x, camera.position.z - p.z);
    if (d < roarNear) roarNear = d;
  }
  for (const s of ROAR_SPOTS) {
    const d = Math.hypot(camera.position.x - s[0], camera.position.z - s[1]);
    if (d < roarNear) roarNear = d;
  }
  // swell roar near punishment stations (read-only stationsByZone + zoneIdx)
  let stNear = 1e9;
  const sts = stationsByZone[zoneIdx];
  if (sts) {
    for (let i = 0; i < sts.length; i++) {
      const st = sts[i];
      const d = Math.hypot(camera.position.x - st.x, camera.position.z - st.z);
      if (d < stNear) stNear = d;
    }
  }
  if (roarGain) {
    const base = THREE.MathUtils.clamp(0.34 - roarNear * 0.006, 0.015, 0.3);
    const swell = THREE.MathUtils.clamp(0.22 - stNear * 0.008, 0, 0.22);
    roarGain.gain.setTargetAtTime((base + swell) * (phase === 'playing' ? 1 : 0.4), t, 0.5);
  }
  if (roarFilter) roarFilter.frequency.setTargetAtTime(240 + Math.min(900, (40 / Math.max(6, Math.min(roarNear, stNear))) * 150), t, 0.5);
  if (sfxBus && phase === 'playing' && roarNear < 26 && Math.random() < dt * (30 - roarNear) * 0.5) crackle();
  // the damned, near and far
  const lashBoost = lashedNow ? 2.2 : 1;
  updateWail(compVoice, lashBoost);
  for (const v of chorusVoices) updateWail(v, 1);
  // wind gusts that breathe
  if (windGain) {
    const base = 0.04 + zoneIdx * 0.014 + (Math.sin(fxT * 0.23) + Math.sin(fxT * 0.11 + 2)) * 0.02;
    windGain.gain.setTargetAtTime(Math.max(0.01, base), t, 0.8);
  }
  // your own heart, quickening with thirst and fear
  if (phase === 'playing') {
    hbT -= dt;
    if (hbT <= 0) {
      const fear = THREE.MathUtils.clamp((thirst / 100) * 0.7 + ((100 - sanity) / 100) * 0.3, 0, 1);
      hbT = 1.15 - 0.65 * fear;
      heartThump();
      setTimeout(() => heartThump(0.7), 170);
    }
  }
}

// ---------------------------------------------------------------- game state
type Phase = 'menu' | 'playing' | 'overlay' | 'ended';
let phase: Phase = 'menu';
let zoneIdx = 0;
let thirst = 12, burden = 5, sanity = 100, stamina = 100;
let whisperTimer = 6;
let subTimer = 0;
let elapsed = 0;
let runBreath = 0;
const keys = new Set<string>();

const spawnPos = new THREE.Vector3(0, 0, 20);
let vel = new THREE.Vector3();

function showSubtitle(text: string, dur = 4) {
  subtitleEl.textContent = '“' + text + '”';
  subtitleEl.style.opacity = '1';
  subTimer = dur;
}
function showCenter(text: string, dur = 3.4) {
  centerMsg.textContent = text;
  centerMsg.style.opacity = '1';
  setTimeout(() => (centerMsg.style.opacity = '0'), dur * 1000);
}
function flash(strength = 1) {
  flashEl.style.opacity = String(0.55 * strength);
  setTimeout(() => (flashEl.style.opacity = '0'), 180);
}

function setZone(i: number) {
  zoneIdx = THREE.MathUtils.clamp(i, 0, ZONES.length - 1);
  const z = ZONES[zoneIdx];
  (scene.fog as THREE.FogExp2).color.setHex(z.fog);
  (scene.fog as THREE.FogExp2).density = z.fogDensity;
  (skyMat.uniforms.top.value as THREE.Color).setHex(z.skyTop);
  (skyMat.uniforms.bottom.value as THREE.Color).setHex(z.skyBottom);
  groundMat.color.setHex(z.ground);
  ambient.intensity = z.ambient;
  dirLight.intensity = 0.5 + zoneIdx * 0.18;
  crackMat.opacity = 0.3 + zoneIdx * 0.1;
  emberMat.opacity = Math.min(0.5 + zoneIdx * 0.08, 1);
  zoneNameEl.textContent = z.name;
  depthEl.textContent = `DEPTH: ${zoneIdx + 1} / 7 — ${z.flavor}`;
  placeGate(zoneIdx);
  // only this depth's punishments stand visible; the voice names the depth
  zoneProps.forEach((g, i) => (g.visible = i === zoneIdx));
  zoneFigs.forEach((arr, i) => arr.forEach((f) => (f.g.visible = i === zoneIdx)));
  placeCompanionAhead(); // he descends with you — the chain does not break
  gateSaidZone = -1;
  speak(ZONE_VOICE[zoneIdx]);
  // reset player to spawn, keep meters (suffering accumulates)
  camera.position.set(spawnPos.x, 1.7, spawnPos.z);
  vel.set(0, 0, 0);
  whisperTimer = 3;
  fadeEl.style.opacity = '0';
  showCenter(z.name, 3);
  setTimeout(() => showSubtitle(z.entry, 5), 1200);
  if (windGain && actx) windGain.gain.linearRampToValueAtTime(0.04 + zoneIdx * 0.016, actx.currentTime + 3);
}

let descending = false;
function descend() {
  if (descending || zoneIdx >= ZONES.length - 1) return;
  descending = true;
  fadeEl.style.opacity = '1';
  screamBurst();
  setTimeout(() => {
    descending = false;
    if (phase !== 'playing') return; // collapsed mid-fade: stay, do not skip a depth
    burden = Math.min(100, burden + 14);
    thirst = Math.min(100, thirst + 10);
    sanity = Math.max(10, sanity - 8);
    setZone(zoneIdx + 1);
  }, 1400);
}

function collapse() {
  if (phase !== 'playing') return;
  phase = 'overlay';
  unlockPointer();
  flash(1);
  screamBurst();
  const t = ZONES[zoneIdx];
  void t;
  $('overlay-title').textContent = 'YOU COLLAPSED';
  $('overlay-text').textContent =
    COLLAPSE_TEXTS[Math.floor(Math.random() * COLLAPSE_TEXTS.length)] +
    '\n\nBut there is no death here. Only rising — and descending again. (Thirst and Burden remain.)';
  overlayEl.classList.remove('hidden');
}

function finish() {
  phase = 'ended';
  unlockPointer();
  speak('This was only a game, and you can still leave. Pray. Forgive. Repent. The gate of mercy is still open — for now.');
  fadeEl.style.opacity = '1';
  setTimeout(() => {
    $('overlay-title').textContent = 'THE DEEPEST';
    $('overlay-text').textContent =
      'You have reached the bottom. There is nothing left to find.\n\nThis was only a game — you can close this tab. In the real Hereafter there is no closing, no pausing, no respawn.\n\nGo back while you still breathe: pray, forgive, give, repent. The Gate of mercy is still open — for now.';
    overlayEl.classList.remove('hidden');
    fadeEl.style.opacity = '0';
  }, 1600);
}

// ---------------------------------------------------------------- input
addEventListener('keydown', (e) => {
  keys.add(e.code);
  // [ / ] tune look speed live
  if (e.code === 'BracketLeft') setSensitivity(sensitivity - 0.0006);
  if (e.code === 'BracketRight') setSensitivity(sensitivity + 0.0006);
  // - / = master volume (audio only)
  if (e.code === 'Minus' || e.code === 'NumpadSubtract') { masterVol = Math.max(0, masterVol - 0.1); applyMasterVol(); }
  if (e.code === 'Equal' || e.code === 'NumpadAdd') { masterVol = Math.min(1.2, masterVol + 0.1); applyMasterVol(); }
  // M mutes / unmutes the speaking voice
  if (e.code === 'KeyM') {
    voiceOn = !voiceOn;
    try { if (!voiceOn && 'speechSynthesis' in window) speechSynthesis.cancel(); } catch { /* noop */ }
    showCenter(voiceOn ? 'The voice returns.' : 'The voice falls silent. The torment does not.', 2.2);
  }
});
addEventListener('keyup', (e) => keys.delete(e.code));
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

function setSensitivity(v: number) {
  sensitivity = THREE.MathUtils.clamp(v, 0.001, 0.012);
  const s = $('sens-slider') as HTMLInputElement | null;
  if (s) s.value = String(Math.round((sensitivity / 0.012) * 100));
  const label = $('sens-val');
  if (label) label.textContent = sensitivity.toFixed(4);
}
function applyMasterVol() {
  if (masterBus && actx) masterBus.gain.setTargetAtTime(masterVol, actx.currentTime, 0.05);
  const el = $('vol-val');
  if (el) el.textContent = Math.round((masterVol / 1.0) * 100) + '%';
}
{
  const s = $('sens-slider') as HTMLInputElement | null;
  if (s) {
    s.value = String(Math.round((sensitivity / 0.012) * 100));
    s.addEventListener('input', () => setSensitivity((Number(s.value) / 100) * 0.012));
  }
  const label = $('sens-val');
  if (label) label.textContent = sensitivity.toFixed(4);
  setLookModeLabel('CLICK');
}

// mouse: moving it turns the view, hover-style. Click captures the mouse;
// if capture is blocked, click + drag is the silent fallback.
document.addEventListener('mousemove', (e) => {
  if (phase !== 'playing') return;
  if (locked) {
    turnView(e.movementX, e.movementY);
  } else if (lockFailed && dragging) {
    const dx = e.clientX - dragLastX, dy = e.clientY - dragLastY;
    dragLastX = e.clientX; dragLastY = e.clientY;
    turnView(dx, dy * 1.0);
  }
});
document.addEventListener('mousedown', (e) => {
  if (phase !== 'playing' || e.button !== 0) return;
  if ((e.target as HTMLElement).closest?.('#sens-box')) return;
  if (lockFailed) { dragging = true; dragLastX = e.clientX; dragLastY = e.clientY; }
});
document.addEventListener('mouseup', () => { dragging = false; });
document.addEventListener('pointerlockerror', () => enableDragMode());

document.addEventListener('pointerlockchange', () => {
  locked = document.pointerLockElement != null;
  if (locked) setLookModeLabel('LOCKED');
  else if (phase === 'playing' && !lockFailed) {
    setLookModeLabel('CLICK');
    showCenter('Click to capture the mouse and keep walking.', 2.5);
    const relock = () => { if (phase === 'playing') lockPointer(); document.body.removeEventListener('click', relock); };
    setTimeout(() => document.body.addEventListener('click', relock), 300);
  }
});

$('start-btn').addEventListener('click', () => {
  initAudio();
  menuEl.classList.add('hidden');
  hudEl.classList.remove('hidden');
  crosshair.classList.remove('hidden');
  phase = 'playing';
  yaw = 0; pitch = 0;
  applyLook(); setLookModeLabel('CLICK');
  lockFailed = false; dragging = false;
  setZone(0);
  fadeEl.style.opacity = '0';
  lockPointer();
  setTimeout(() => {
    if (phase === 'playing') showCenter('One is chained to you. Where you walk, he follows — watch what waits for you.', 4.5);
  }, 7000);
});
$('overlay-btn').addEventListener('click', () => {
  overlayEl.classList.add('hidden');
  if (phase === 'ended') {
    // restart whole descent
    thirst = 12; burden = 5; sanity = 100;
    yaw = 0; pitch = 0;
    applyLook(); setLookModeLabel('CLICK');
    phase = 'playing'; setZone(0); lockPointer();
    return;
  }
  // rise again in same zone, meters eased so progress stays possible in deep zones
  thirst = Math.max(35, thirst - 45);
  burden = Math.max(0, burden - 12);
  sanity = Math.min(100, sanity + 25);
  stamina = 70;
  camera.position.set(spawnPos.x, 1.7, spawnPos.z);
  vel.set(0, 0, 0);
  phase = 'playing';
  fadeEl.style.opacity = '0';
  lockPointer();
  showSubtitle('You rise. The thirst stayed with you.', 4);
});

// touch: left half = move stick, right half = look drag
let moveVec = { x: 0, y: 0 };
let lookLast: { x: number; y: number } | null = null;
const stick = $('touch-stick'), knob = $('stick-knob');
let stickId: number | null = null, lookId: number | null = null;
let stickOrigin = { x: 0, y: 0 };
addEventListener('touchstart', (e) => {
  for (const t of Array.from(e.touches)) {
    if (t.clientX < innerWidth / 2 && stickId === null) {
      stickId = t.identifier; stickOrigin = { x: t.clientX, y: t.clientY };
    } else if (lookId === null) {
      lookId = t.identifier; lookLast = { x: t.clientX, y: t.clientY };
    }
  }
}, { passive: true });
addEventListener('touchmove', (e) => {
  for (const t of Array.from(e.touches)) {
    if (t.identifier === stickId) {
      const dx = (t.clientX - stickOrigin.x) / 45, dy = (t.clientY - stickOrigin.y) / 45;
      moveVec = { x: THREE.MathUtils.clamp(dx, -1, 1), y: THREE.MathUtils.clamp(dy, -1, 1) };
      knob.style.transform = `translate(${moveVec.x * 28}px, ${moveVec.y * 28}px)`;
    } else if (t.identifier === lookId && lookLast) {
      const dx = t.clientX - lookLast.x, dy = t.clientY - lookLast.y;
      lookLast = { x: t.clientX, y: t.clientY };
      turnView(dx, dy); // touch drag turns exactly like the mouse
    }
  }
}, { passive: true });
addEventListener('touchend', (e) => {
  for (const t of Array.from(e.changedTouches)) {
    if (t.identifier === stickId) { stickId = null; moveVec = { x: 0, y: 0 }; knob.style.transform = ''; }
    if (t.identifier === lookId) { lookId = null; lookLast = null; }
  }
});

// ---------------------------------------------------------------- helpers
const groundH = (x: number, z: number) =>
  (Math.sin(x * 0.11) * Math.cos(z * 0.13) * 1.2 +
   Math.sin(x * 0.31 + z * 0.21) * 0.45 +
   Math.sin(x * 0.9) * Math.sin(z * 0.8) * 0.08) * Math.min(Math.hypot(x, z) / 30, 1.4);

const fwd = new THREE.Vector3(), right = new THREE.Vector3();
const wishV = new THREE.Vector3(), lookV = new THREE.Vector3(), toV = new THREE.Vector3();
const clock = new THREE.Clock();

function updatePlayer(dt: number) {
  // Q/E turn, same as the mouse, for keyboard-only players
  if (keys.has('KeyQ')) yaw += 2.0 * dt;
  if (keys.has('KeyE')) yaw -= 2.0 * dt;
  applyLook();

  const running = keys.has('ShiftLeft') || keys.has('ShiftRight');
  const burdenSlow = 1 - (burden / 100) * 0.55; // chains get heavy
  const baseSpeed = (running && stamina > 1 ? 9.5 : 4.6) * burdenSlow;

  // classic movement: W walks where you look, A/D strafe off it
  fwd.set(0, 0, -1).applyQuaternion(camera.quaternion); fwd.y = 0; fwd.normalize();
  right.set(1, 0, 0).applyQuaternion(camera.quaternion); right.y = 0; right.normalize();

  const wish = wishV.set(0, 0, 0);
  if (keys.has('KeyW') || keys.has('ArrowUp')) wish.add(fwd);
  if (keys.has('KeyS') || keys.has('ArrowDown')) wish.sub(fwd);
  if (keys.has('KeyD') || keys.has('ArrowRight')) wish.add(right);
  if (keys.has('KeyA') || keys.has('ArrowLeft')) wish.sub(right);
  wish.x += right.x * moveVec.x - fwd.x * moveVec.y;
  wish.z += right.z * moveVec.x - fwd.z * moveVec.y;
  if (wish.lengthSq() > 1) wish.normalize();
  wish.multiplyScalar(baseSpeed);

  // heavy, laggy acceleration = wading through suffering
  vel.lerp(wish, 1 - Math.exp(-dt * 3.2));
  camera.position.addScaledVector(vel, dt);
  // footsteps — the ground answers every stride
  stepAcc += vel.length() * dt;
  if (stepAcc > 2.3 && vel.length() > 1.2) { stepAcc = 0; stepThump(Math.min(1, vel.length() / 9)); }

  // keep inside the pit + out of gate pillar sides is fine (walk through = descend)
  const r = Math.hypot(camera.position.x, camera.position.z);
  if (r > 195) {
    camera.position.multiplyScalar(195 / r);
    showSubtitle('The desert bends you back. There is no outward.', 3);
  }
  // head-bob (vertical only — never tilt the horizon)
  elapsed += dt;
  const speedK = vel.length() / 9.5;
  const bob = Math.sin(elapsed * (running ? 11 : 8)) * 0.035 * (0.3 + speedK);
  camera.position.y = groundH(camera.position.x, camera.position.z) + 1.7 + bob;
  // horizon always level (roll forced to 0 in applyLook)

  // meters
  const z = ZONES[zoneIdx];
  thirst = Math.min(100, thirst + dt * z.thirstRate * (running ? 1.6 : 1));
  burden = Math.min(100, burden + dt * z.burdenRate);
  if (running && wish.lengthSq() > 0.1) stamina = Math.max(0, stamina - dt * 16);
  else stamina = Math.min(100, stamina + dt * 10);

  // sanity: drains in deep zones & when stared at; recovers slightly near gate (hope is bait)
  const gateDist = camera.position.distanceTo(gateGroup.position);
  sanity = Math.max(0, sanity - dt * (0.5 + zoneIdx * 0.5));
  if (gateDist < 25) sanity = Math.min(100, sanity + dt * 4);

  // watchers drain sanity when looked at (zone >= IV)
  if (zoneIdx >= 3) {
    const look = lookV; camera.getWorldDirection(look);
    for (const w of watchers) {
      const to = toV.copy(w.position).sub(camera.position).normalize();
      if (look.dot(to) > 0.985 && camera.position.distanceTo(w.position) < 90) {
        sanity = Math.max(0, sanity - dt * 9);
      }
    }
  }

  // breath audio follows exertion
  runBreath = running && wish.lengthSq() > 0.1 ? 1 : 0;
  if (breathGain && actx) breathGain.gain.linearRampToValueAtTime(runBreath ? 0.12 : 0.015, actx.currentTime + 0.4);

  // fire damage: standing close to a pit burns
  for (const p of pits) {
    const d = Math.hypot(camera.position.x - p.x, camera.position.z - p.z);
    if (d < 5) {
      thirst = Math.min(100, thirst + dt * 10);
      sanity = Math.max(0, sanity - dt * 6);
      if (Math.random() < dt * 6) flash(0.4);
      if (Math.random() < dt * 2) showSubtitle('The fire kisses your skin and stays.', 2.5);
    }
  }

  // gate-whispers: the descent warns you as you near (once per depth)
  if (gateGroup.visible && gateDist < 24 && gateSaidZone !== zoneIdx) {
    gateSaidZone = zoneIdx;
    const G = GATE_LINES[zoneIdx % 2];
    showSubtitle(G.line + '  — ' + G.ref, 5);
    speak(G.line);
  }
  // gate = descend
  if (gateGroup.visible && gateDist < 4.5) descend();

  // final zone: reaching the middle ends it
  if (zoneIdx === ZONES.length - 1 && Math.hypot(camera.position.x, camera.position.z) < 8 && phase === 'playing') {
    finish();
  }

  if ((thirst >= 100 || sanity <= 0) && phase === 'playing') collapse();

  // HUD
  thirstFill.style.width = thirst + '%';
  burdenFill.style.width = burden + '%';
  sanityFill.style.width = sanity + '%';
  // heartbeat vignette as thirst peaks
  ($('vignette') as HTMLElement).style.opacity = String(0.7 + (thirst / 100) * 0.6 + Math.sin(elapsed * 6) * 0.06 * (thirst / 100));
}

function updateAmbience(dt: number) {
  void dt;
  // embers rise
  const arr = emberGeo.attributes.position.array as Float32Array;
  for (let i = 0; i < EMBERS; i++) {
    arr[i * 3 + 1] += emberVel[i] * dt * (1 + zoneIdx * 0.15);
    arr[i * 3] += Math.sin(elapsed * 0.8 + i) * dt * 0.6;
    if (arr[i * 3 + 1] > 34) {
      arr[i * 3 + 1] = 0;
      arr[i * 3] = camera.position.x + (Math.random() - 0.5) * 160;
      arr[i * 3 + 2] = camera.position.z + (Math.random() - 0.5) * 160;
    }
  }
  emberGeo.attributes.position.needsUpdate = true;

  // fire flicker
  for (const p of pits) {
    const s = 6 + Math.sin(elapsed * 7 + p.seed) * 1.6 + Math.sin(elapsed * 17 + p.seed * 2) * 0.8;
    p.sprite.scale.set(s + zoneIdx * 0.7, s * 0.7, 1);
    (p.sprite.material as THREE.SpriteMaterial).opacity = 0.65 + Math.sin(elapsed * 9 + p.seed) * 0.2;
  }
  gateGlowMat.opacity = 0.75 + Math.sin(elapsed * 3.2) * 0.2;
  gateGroup.position.y = groundH(gateGroup.position.x, gateGroup.position.z);
  gateLight.position.set(gateGroup.position.x, 6, gateGroup.position.z);
  gateLight.intensity = gateGroup.visible ? 50 + Math.sin(elapsed * 5) * 18 : 0;
  playerFlicker.position.copy(camera.position);
  playerFlicker.intensity = 4 + Math.sin(elapsed * 8.3) * 1.5;

  // watchers fade in from zone IV
  const wTarget = zoneIdx >= 3 ? Math.min(0.9, 0.3 + zoneIdx * 0.15) : 0;
  for (let i = 0; i < watchers.length; i++) {
    const m = watchers[i].material as THREE.SpriteMaterial;
    m.opacity += (wTarget * (0.6 + 0.4 * Math.sin(elapsed * 0.9 + i * 1.7)) - m.opacity) * dt * 1.5;
  }

  // cracks pulse
  crackMat.opacity = (0.3 + zoneIdx * 0.09) + Math.sin(elapsed * 2.2) * 0.08;

  // whispers
  if (phase === 'playing') {
    whisperTimer -= dt;
    if (whisperTimer <= 0) {
      const z = ZONES[zoneIdx];
      whisperTimer = z.whisperGap[0] + Math.random() * (z.whisperGap[1] - z.whisperGap[0]);
      showSubtitle(WHISPERS[Math.floor(Math.random() * WHISPERS.length)], 4.5);
      if (Math.random() < 0.55) screamBurst();
      sanity = Math.max(0, sanity - 3);
    }
  }
  if (subTimer > 0) { subTimer -= dt; if (subTimer <= 0) subtitleEl.style.opacity = '0'; }
}

// ---------------------------------------------------------------- loop
placeGate(0);
buildStations();
buildWanderer();
buildCompanion();
buildAtmosphere();
fadeEl.style.opacity = '1'; // starts black behind menu

function loop() {
  requestAnimationFrame(loop);
  const dt = Math.min(clock.getDelta(), 0.05);
  if (phase === 'playing') { updatePlayer(dt); updateStations(); updateCompanion(dt); }
  updateAmbience(dt);
  updateFigures(dt);
  updateAtmosphere(dt);
  updateAudio(dt);
  renderer.render(scene, camera);
}
loop();
