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
  },
  vertexShader: `varying vec3 vP; void main(){ vP=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
  fragmentShader: `uniform vec3 top; uniform vec3 bottom; varying vec3 vP;
    void main(){ float h = normalize(vP).y*0.5+0.5; vec3 c = mix(bottom, top, pow(max(h,0.0),0.6));
    // burning horizon band
    c += vec3(0.5,0.08,0.0) * pow(1.0-abs(normalize(vP).y), 6.0);
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
  const dist = 60 + zoneIdx * 10 + Math.random() * 30;
  gateGroup.position.set(
    THREE.MathUtils.clamp(camera.position.x + Math.cos(a) * dist, -170, 170),
    0,
    THREE.MathUtils.clamp(camera.position.z + Math.sin(a) * dist, -170, 170));
  gateGroup.rotation.y = Math.atan2(camera.position.x - gateGroup.position.x, camera.position.z - gateGroup.position.z);
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
  // reset player to spawn, keep meters (suffering accumulates)
  camera.position.set(spawnPos.x, 1.7, spawnPos.z);
  vel.set(0, 0, 0);
  whisperTimer = 3;
  fadeEl.style.opacity = '0';
  showCenter(z.name, 3);
  setTimeout(() => showSubtitle(z.entry, 5), 1200);
  if (windGain && actx) windGain.gain.linearRampToValueAtTime(0.04 + zoneIdx * 0.016, actx.currentTime + 3);
}

function descend() {
  if (zoneIdx >= ZONES.length - 1) return;
  fadeEl.style.opacity = '1';
  screamBurst();
  setTimeout(() => {
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
  // rise again in same zone, meters slightly eased so it is survivable but hopeless
  thirst = Math.max(55, thirst - 25);
  sanity = Math.min(100, sanity + 25);
  stamina = 70;
  camera.position.set(spawnPos.x, 1.7, spawnPos.z);
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
   Math.sin(x * 0.31 + z * 0.21) * 0.45) * Math.min(Math.hypot(x, z) / 30, 1.4);

const fwd = new THREE.Vector3(), right = new THREE.Vector3();
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

  const wish = new THREE.Vector3();
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
    const look = new THREE.Vector3(); camera.getWorldDirection(look);
    for (const w of watchers) {
      const to = w.position.clone().sub(camera.position).normalize();
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
      flash(0.4);
      if (Math.random() < dt * 2) showSubtitle('The fire kisses your skin and stays.', 2.5);
    }
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
  gateLight.intensity = 50 + Math.sin(elapsed * 5) * 18;
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
fadeEl.style.opacity = '1'; // starts black behind menu

function loop() {
  requestAnimationFrame(loop);
  const dt = Math.min(clock.getDelta(), 0.05);
  if (phase === 'playing') updatePlayer(dt);
  updateAmbience(dt);
  renderer.render(scene, camera);
}
loop();
