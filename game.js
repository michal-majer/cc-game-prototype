'use strict';
/* BONEYARD (Cmentarzysko) — auto-battler prototype.
   Vanilla JS + Canvas 2D. No modules, no deps. Runs from file://.
   Sections: CONFIG -> STATE -> UTIL -> AUDIO -> DATA -> SPAWN -> COMBAT ->
             WRECKS -> ECONOMY -> WAVES -> INPUT -> RENDER -> LOOP */

/* ============================ CONFIG ============================ */
const CONFIG = {
  SCRAPYARD_COST: 100,
  SCRAPYARD_INCOME: 8,
  INCOME_TICK_MS: 8000,
  BASE_INCOME: 10,
  WAVE_GAP_MS: 15000,
  GRACE_MS: 45000,
  ENEMY_HP_GROWTH: 1.12,
  ENEMY_DPS_GROWTH: 1.06,
  TARGET_DEATH_WAVE: 15,
  WRECK_HP: 150,
  WRECK_MELT_REWARD: 40,
  STARTING_WRECKS: 6,
  BOUNTY_SHARE: 0.55,
};

/* World geometry */
const VW = 480, VH = 270;
const LANE_Y = [72, 136, 200];
const LANE_H = 64;
const SLOT_COLS = [18, 58, 98, 138];
const SLOT_SIZE = 36;
const HQ_X = 0, HQ_W = 14;
const BUILD_ZONE_END = 174;
const SPAWN_X = 460;
const FIELD_END = 455;

/* ============================ STATE ============================ */
const S = {
  phase: 'commander',   // commander | grace | prep | battle | over
  scrap: 300,
  wave: 0,
  hq: { hp: 1000, max: 1000 },
  commander: null,
  buildings: [],
  units: [],
  wrecks: [],
  particles: [],
  toasts: [],
  bullets: [],
  slots: [],            // {col,lane,x,y,taken}
  income: 0,            // last income display
  incomeTimer: CONFIG.INCOME_TICK_MS,
  prepTimer: 0,
  phaseTimer: 0,
  waveMult: 1,
  pendingCard: null,
  spawnQueue: [],
  spawnTimer: 0,
  shake: 0,
  time: 0,
  bountyEarned: 0,
  scrapyardEarned: 0,
};

/* ============================ UTIL ============================ */
function rngFrom(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
let _seed = 1337;
function rnd() { _seed = (_seed * 1103515245 + 12345) & 0x7fffffff; return _seed / 0x7fffffff; }
function rndi(a, b) { return a + Math.floor(rnd() * (b - a + 1)); }
function pick(arr) { return arr[Math.floor(rnd() * arr.length)]; }
function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
function laneCenter(i) { return LANE_Y[i]; }

/* ============================ AUDIO ============================ */
const Audio2 = (function () {
  let ctx = null;
  function ac() { if (!ctx) { try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {} } return ctx; }
  function tone(freq, dur, type, vol, freq2) {
    const c = ac(); if (!c) return;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type || 'square';
    o.frequency.setValueAtTime(freq, c.currentTime);
    if (freq2) o.frequency.exponentialRampToValueAtTime(freq2, c.currentTime + dur);
    g.gain.setValueAtTime((vol || 0.15), c.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + dur);
    o.connect(g); g.connect(c.destination);
    o.start(); o.stop(c.currentTime + dur);
  }
  function noise(dur, vol, cutoff) {
    const c = ac(); if (!c) return;
    const n = Math.floor(c.sampleRate * dur);
    const buf = c.createBuffer(1, n, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const src = c.createBufferSource(); src.buffer = buf;
    const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = cutoff || 800;
    const g = c.createGain(); g.gain.value = vol || 0.25;
    src.connect(f); f.connect(g); g.connect(c.destination);
    src.start();
  }
  return {
    resume() { const c = ac(); if (c && c.state === 'suspended') c.resume(); },
    spawn() { tone(600, 0.04, 'square', 0.08); },
    thud() { noise(0.12, 0.3, 500); },
    chime() { tone(880, 0.12, 'sine', 0.12, 1320); },
    alarm() { tone(300, 0.25, 'sawtooth', 0.14, 180); },
    melt() { tone(300, 0.08, 'sine', 0.16); tone(450, 0.08, 'sine', 0.12); },
    blip() { tone(1200, 0.03, 'square', 0.06); },
    buzz() { tone(90, 0.15, 'sawtooth', 0.08); },
  };
})();

/* ============================ DATA ============================ */
// Damage matrix: attacker weapon-row -> target armor-column.
// columns: inf, rockets, armor, air, building
const DMG = {
  infantry: { inf: 1.0, rockets: 2.0, armor: 0.3, air: 0, building: 0.8 },
  rockets:  { inf: 0.5, rockets: 0.8, armor: 3.0, air: 0, building: 1.5 },
  armor:    { inf: 2.0, rockets: 1.5, armor: 1.2, air: 0, building: 1.5 },
  air:      { inf: 0,   rockets: 0,   armor: 0,   air: 0, building: 1.5 },
  bunker:   { inf: 2.0, rockets: 1.5, armor: 0.3, air: 0, building: 0 },
  atgun:    { inf: 0.4, rockets: 0.4, armor: 2.5, air: 0, building: 0 },
  aa:       { inf: 0,   rockets: 0,   armor: 0,   air: 3.0, building: 0 },
};

// Building blueprints
const BUILD = {
  scrapyard: { name: 'Złomowisko', cost: 100, hp: 100, kind: 'econ', desc: '+8 złomu' },
  barracks:  { name: 'Koszary', cost: 120, hp: 180, kind: 'spawn', unit: 'rifleman', every: 5000, desc: 'Strzelec /5s' },
  rocketry:  { name: 'Warsztat rak.', cost: 160, hp: 160, kind: 'spawn', unit: 'rocketeer', every: 7000, desc: 'Rakiet. /7s' },
  factory:   { name: 'Fabryka', cost: 300, hp: 220, kind: 'spawn', unit: 'tank', every: 10000, desc: 'Czołg /10s' },
  bunker:    { name: 'Bunkier', cost: 150, hp: 300, kind: 'defense', wtype: 'bunker', dps: 14, range: 40, target: 'ground', desc: 'DPS14 z40' },
  atgun:     { name: 'Działo ppanc', cost: 170, hp: 180, kind: 'defense', wtype: 'atgun', dps: 20, range: 50, target: 'ground', desc: 'DPS20 z50' },
  aa:        { name: 'Bateria AA', cost: 180, hp: 120, kind: 'defense', wtype: 'aa', dps: 30, range: 70, target: 'air', desc: 'DPS30 z70' },
};
const BUILD_ORDER = ['scrapyard', 'barracks', 'rocketry', 'factory', 'bunker', 'atgun', 'aa'];

// Unit blueprints. cls = armor/weapon class for matrix.
const UNIT = {
  // KORPUS
  rifleman:  { name: 'Strzelec', hp: 45, dps: 10, range: 18, speed: 20, cls: 'infantry', side: 'corps', color: '#e8c840' },
  rocketeer: { name: 'Rakietowiec', hp: 35, dps: 8, range: 34, speed: 13, cls: 'rockets', side: 'corps', color: '#e8c840' },
  tank:      { name: 'Czołg', hp: 180, dps: 22, range: 28, speed: 14, cls: 'armor', side: 'corps', color: '#e8c840' },
  // RDZA
  looter:    { name: 'Szabrownik', hp: 40, dps: 10, range: 18, speed: 22, cls: 'infantry', side: 'rust', color: '#c62828', bounty: 8 },
  bazooka:   { name: 'Bazookowiec', hp: 38, dps: 8, range: 34, speed: 12, cls: 'rockets', side: 'rust', color: '#c62828', bounty: 12 },
  ram:       { name: 'Taran', hp: 200, dps: 24, range: 28, speed: 13, cls: 'armor', side: 'rust', color: '#c62828', bounty: 25 },
  vulture:   { name: 'Sęp', hp: 70, dps: 16, range: 20, speed: 34, cls: 'air', side: 'rust', color: '#c62828', bounty: 15 },
};

// Commanders
const COMMANDERS = {
  reznik: { name: 'Płk Reznik', plus: 'Budynki +30% HP', minus: 'Dochód −10%', buildHp: 1.3, income: 0.9, meltBonus: 0, scrapHp: 1, spawnRate: 1, buildCost: 1 },
  hutnik: { name: 'Hutnik', plus: 'Przetop +70', minus: 'Złomowiska 50% HP', buildHp: 1, income: 1, meltBonus: 70, scrapHp: 0.5, spawnRate: 1, buildCost: 1 },
  vega:   { name: 'Mjr Vega', plus: 'Spawn +20% szybszy', minus: 'Budynki +15% kosztu', buildHp: 1, income: 1, meltBonus: 0, scrapHp: 1, spawnRate: 0.8, buildCost: 1.15 },
};

/* Wave card definitions */
const CARDS = {
  looters: { name: 'Szabrownicy', unit: 'looter', mult: 1.0, count: n => 4 + n, ctr: 'Bunkry, czołgi', line: 'Idą tłumem. Zadepczą wszystko po drodze.' },
  bazookas: { name: 'Bazooki', unit: 'bazooka', mult: 1.4, count: n => 2 + Math.floor(n / 2), ctr: 'Strzelcy, piechota', line: 'Rakiety z dystansu. Rozbiorą pancerz i mur.' },
  rams: { name: 'Tarany', unit: 'ram', mult: 1.7, count: n => 1 + Math.floor(n / 2), ctr: 'Rakietowcy, działa ppanc', line: 'Ciężkie żelastwo. Przegryzą się przez front.' },
  raid: { name: 'Nalot', unit: 'vulture', mult: 2.2, count: n => 2 + Math.floor(n / 3), ctr: 'WYŁĄCZNIE Bateria AA', line: 'Lecą nad linią. Prosto na złomowiska.' },
  mixed: { name: 'Mieszana', unit: null, mult: 1.3, count: n => 0, ctr: 'Wszystko po trochu', line: 'Dwa oddziały naraz. Trzymaj front równo.' },
};
const CARD_KEYS = ['looters', 'bazookas', 'rams', 'raid', 'mixed'];

/* ============================ CANVAS SETUP ============================ */
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
ctx.imageSmoothingEnabled = false;
let SCALE = 1, canvasRect = null;

function resize() {
  const sc = Math.max(1, Math.floor(Math.min(window.innerWidth / VW, window.innerHeight / VH)));
  SCALE = sc;
  canvas.style.width = (VW * sc) + 'px';
  canvas.style.height = (VH * sc) + 'px';
  canvasRect = canvas.getBoundingClientRect();
}
window.addEventListener('resize', () => { resize(); });

/* Offscreen persistent ground + decals */
const groundCv = document.createElement('canvas'); groundCv.width = VW; groundCv.height = VH;
const gctx = groundCv.getContext('2d');
const decalCv = document.createElement('canvas'); decalCv.width = VW; decalCv.height = VH;
const dctx = decalCv.getContext('2d');

function buildGround() {
  const r = rngFrom(9001);
  // base dirt bands per lane
  for (let y = 0; y < VH; y++) {
    for (let x = 0; x < VW; x++) {
      const v = r();
      let c = '#5f4e35';
      if (v < 0.12) c = '#3d3122';
      else if (v < 0.22) c = '#7d6844';
      gctx.fillStyle = c;
      gctx.fillRect(x, y, 1, 1);
    }
  }
  // lane dividers (dashed dark)
  gctx.fillStyle = '#3d3122';
  for (let li = 0; li < 2; li++) {
    const y = (LANE_Y[li] + LANE_Y[li + 1]) / 2;
    for (let x = 0; x < VW; x += 6) gctx.fillRect(x, y, 3, 1);
  }
  // scattered old craters & tank tracks (persistent atmosphere)
  for (let i = 0; i < 40; i++) {
    const x = 174 + r() * (FIELD_END - 174), y = 40 + r() * 200;
    const rad = 2 + r() * 4;
    gctx.fillStyle = '#3d3122';
    gctx.beginPath(); gctx.arc(x, y, rad, 0, 7); gctx.fill();
    gctx.fillStyle = '#14100c';
    gctx.fillRect(x - 1, y, 2, 1);
  }
  // old oil stains
  for (let i = 0; i < 14; i++) {
    const x = 174 + r() * (FIELD_END - 174), y = 40 + r() * 200;
    gctx.fillStyle = 'rgba(20,16,12,0.6)';
    gctx.beginPath(); gctx.arc(x, y, 2 + r() * 3, 0, 7); gctx.fill();
  }
}

function decalCrater(x, y) {
  dctx.fillStyle = '#3d3122';
  dctx.beginPath(); dctx.arc(x, y, 2 + rnd() * 2, 0, 7); dctx.fill();
  dctx.fillStyle = 'rgba(20,16,12,0.5)';
  dctx.fillRect(x - 1, y, 2, 1);
}
function decalTrack(x, y) {
  dctx.fillStyle = 'rgba(20,16,12,0.35)';
  dctx.fillRect(x - 4, y - 2, 1, 4);
  dctx.fillRect(x - 4, y + 2, 1, 4);
}
function decalStain(x, y, color) {
  dctx.fillStyle = color;
  dctx.fillRect(x - 1, y - 1, 2, 2);
}

/* ============================ SPAWN (buildings/units) ============================ */
let slotIdCounter = 0;
function initSlots() {
  S.slots = [];
  for (let li = 0; li < 3; li++) {
    for (let ci = 0; ci < 4; ci++) {
      S.slots.push({ col: ci, lane: li, x: SLOT_COLS[ci], y: laneCenter(li) - 18, taken: false });
    }
  }
}

function buildingAt(slot) { return S.buildings.find(b => b.slot === slot); }

function placeBuilding(type, slot) {
  const bp = BUILD[type];
  let cost = Math.round(bp.cost * (S.commander ? S.commander.buildCost : 1));
  if (S.scrap < cost || slot.taken) return false;
  S.scrap -= cost;
  let maxhp = Math.round(bp.hp * (S.commander ? S.commander.buildHp : 1));
  if (type === 'scrapyard') maxhp = Math.round(bp.hp * (S.commander ? S.commander.scrapHp : 1));
  const b = {
    type, bp, slot, lane: slot.lane,
    x: slot.x + SLOT_SIZE / 2, y: laneCenter(slot.lane),
    hp: maxhp, max: maxhp,
    cool: bp.every || 0, fireVis: 0, aim: 0,
    rust: rngFrom((slotIdCounter++ * 131 + 7) >>> 0),
    aaOpen: 0, truck: -1, blink: 0, flag: 0, cost,
  };
  // stash a fixed rust pattern
  b.rustCols = [];
  const rr = b.rust;
  const nStreak = 2 + Math.floor(rr() * 3);
  for (let i = 0; i < nStreak; i++) b.rustCols.push(2 + Math.floor(rr() * 32));
  slot.taken = true;
  S.buildings.push(b);
  toast('Budowa: ' + bp.name);
  Audio2.blip();
  return true;
}

function sellBuilding(b) {
  const refund = Math.round(b.cost * 0.5);
  S.scrap += refund;
  b.slot.taken = false;
  S.buildings = S.buildings.filter(x => x !== b);
  toast('Sprzedano +' + refund);
  Audio2.blip();
}

let unitIdCounter = 0;
function spawnUnit(type, lane, x, side) {
  const bp = UNIT[type];
  const u = {
    id: unitIdCounter++, type, bp, side, lane,
    x: x, y: laneCenter(lane) + (rnd() * 8 - 4),
    hp: bp.hp, max: bp.hp, dps: bp.dps,
    dir: side === 'corps' ? 1 : -1,
    flash: 0, anim: 0, animT: 0, fireVis: 0, aim: 0,
    target: null, scaleHp: 1,
  };
  if (bp.cls === 'air') u.y = laneCenter(lane) - 14; // fly higher
  S.units.push(u);
  return u;
}

function enemyScaled(type, lane) {
  const u = spawnUnit(type, lane, SPAWN_X, 'rust');
  const n = S.wave;
  const hpMul = Math.pow(CONFIG.ENEMY_HP_GROWTH, n - 1);
  const dpsMul = Math.pow(CONFIG.ENEMY_DPS_GROWTH, n - 1);
  u.max = Math.round(u.max * hpMul); u.hp = u.max;
  u.dps = u.bp.dps * dpsMul;
  return u;
}

/* ============================ COMBAT ============================ */
function dmgMult(attackerWtype, targetCls) {
  const row = DMG[attackerWtype];
  if (!row) return 1;
  const v = row[targetCls];
  return v == null ? 1 : v;
}

// target class for matrix column
function targetClass(obj) {
  if (obj.isWreck) return 'armor';
  if (obj.isBuilding || obj.isHQ) return 'building';
  return obj.bp.cls; // unit class
}

function updateUnits(dt) {
  const groundKorpus = S.units.filter(u => u.side === 'corps' && u.bp.cls !== 'air');
  const groundRust = S.units.filter(u => u.side === 'rust' && u.bp.cls !== 'air');

  for (const u of S.units) {
    if (u.hp <= 0) continue;
    // animation
    u.animT += dt; if (u.animT > 0.1) { u.animT = 0; u.anim ^= 1; }
    if (u.flash > 0) u.flash -= dt;
    if (u.fireVis > 0) u.fireVis -= dt;

    if (u.bp.cls === 'air') { updateAir(u, dt); continue; }

    // find nearest target ahead in same lane
    let best = null, bestDist = 1e9;
    const dir = u.dir;
    const enemyUnits = u.side === 'corps' ? groundRust : groundKorpus;
    // enemy units
    for (const e of enemyUnits) {
      if (e.hp <= 0 || e.lane !== u.lane) continue;
      const d = (e.x - u.x) * dir; // ahead is positive
      if (d < -6) continue;
      const ad = Math.abs(e.x - u.x);
      if (ad < bestDist) { bestDist = ad; best = e; }
    }
    // wrecks in lane (block both sides)
    for (const w of S.wrecks) {
      if (w.hp <= 0 || w.lane !== u.lane) continue;
      const d = (w.x - u.x) * dir;
      if (d < -4) continue;
      const ad = Math.abs(w.x - u.x);
      if (ad < bestDist) { bestDist = ad; best = w; }
    }
    // RDZA can target player buildings + HQ once in reach
    if (u.side === 'rust') {
      for (const b of S.buildings) {
        if (b.hp <= 0 || b.lane !== u.lane) continue;
        const d = (b.x - u.x) * dir;
        if (d < -6) continue;
        const ad = Math.abs(b.x - u.x);
        if (ad < bestDist) { bestDist = ad; best = b; }
      }
      // HQ (leftmost) if lane empty of live buildings ahead
      const hqObj = { isHQ: true, x: HQ_X + HQ_W, y: laneCenter(u.lane) };
      const laneHasBuilding = S.buildings.some(b => b.lane === u.lane && b.hp > 0);
      if (!laneHasBuilding) {
        const ad = Math.abs(hqObj.x - u.x);
        if (u.x - hqObj.x > -6 && ad < bestDist) { bestDist = ad; best = hqObj; }
      }
    } else {
      // KORPUS units with nothing ahead just keep marching right (toward spawn edge)
    }

    u.target = best;
    if (best) {
      if (bestDist <= u.bp.range) {
        // in range: fire
        u.aim = Math.atan2((best.y || u.y) - u.y, (best.x) - u.x);
        applyDamage(u, best, u.dps * dt);
        if (u.fireVis <= 0) { u.fireVis = 0.25; onFire(u, best); }
        continue;
      } else {
        // move toward, but stop at range
        const step = u.bp.speed * dt * dir;
        const targetStop = best.x - dir * u.bp.range;
        let nx = u.x + step;
        if (dir > 0 && nx > targetStop) nx = targetStop;
        if (dir < 0 && nx < targetStop) nx = targetStop;
        u.x = nx;
        continue;
      }
    }
    // no target: march forward
    u.x += u.bp.speed * dt * dir;
    // KORPUS despawn at far edge
    if (u.side === 'corps' && u.x > FIELD_END + 6) u.hp = 0;
    if (u.side === 'rust' && u.x < HQ_X - 4) u.hp = 0;
  }
}

function updateAir(u, dt) {
  // fly toward nearest scrapyard, else HQ
  let target = null, bd = 1e9;
  for (const b of S.buildings) {
    if (b.hp <= 0 || b.type !== 'scrapyard') continue;
    const d = Math.hypot(b.x - u.x, b.y - u.y);
    if (d < bd) { bd = d; target = b; }
  }
  if (!target) target = { isHQ: true, x: HQ_X + HQ_W, y: u.y, hp: 1 };
  u.target = target;
  const dist = Math.hypot(target.x - u.x, target.y - u.y);
  if (dist <= u.bp.range) {
    applyDamage(u, target, u.dps * dt);
    if (u.fireVis <= 0) { u.fireVis = 0.25; onFire(u, target); }
  } else {
    const ang = Math.atan2(target.y - u.y, target.x - u.x);
    u.x += Math.cos(ang) * u.bp.speed * dt;
    u.y += Math.sin(ang) * u.bp.speed * dt;
  }
}

function applyDamage(attacker, target, base) {
  const m = dmgMult(attacker.bp ? attacker.bp.cls : attacker.wtype, targetClass(target));
  if (m <= 0) return;
  target.hp -= base * m;
  if (target.flash != null) target.flash = 0.06;
  if (target.hp <= 0) onDeath(target, attacker);
}

function onFire(u, target) {
  if (u.bp.cls === 'rockets' || u.bp.cls === 'air') {
    S.bullets.push({ x: u.x, y: u.y, tx: target.x, ty: (target.y || u.y), life: 0.25, col: u.side === 'corps' ? '#e8c840' : '#c62828' });
  }
}

function updateDefenses(dt) {
  for (const b of S.buildings) {
    if (b.hp <= 0 || b.bp.kind !== 'defense') continue;
    if (b.fireVis > 0) b.fireVis -= dt;
    // acquire target
    let best = null, bd = 1e9;
    for (const u of S.units) {
      if (u.hp <= 0 || u.side !== 'rust') continue;
      const isAir = u.bp.cls === 'air';
      if (b.bp.target === 'air' && !isAir) continue;
      if (b.bp.target === 'ground' && isAir) continue;
      const d = Math.hypot(u.x - b.x, u.y - b.y);
      if (d <= b.bp.range && d < bd) { bd = d; best = u; }
    }
    if (b.bp.wtype === 'aa') b.aaOpen = best ? 2 : Math.max(0, b.aaOpen - dt);
    if (best) {
      b.aim = Math.atan2(best.y - b.y, best.x - b.x);
      applyDamage2(b, best, b.bp.dps * dt);
      if (b.fireVis <= 0) {
        b.fireVis = 0.2;
        S.bullets.push({ x: b.x, y: b.y - 4, tx: best.x, ty: best.y, life: 0.15, col: '#ffb000' });
      }
    }
  }
}
function applyDamage2(building, target, base) {
  const m = dmgMult(building.bp.wtype, targetClass(target));
  if (m <= 0) return;
  target.hp -= base * m;
  target.flash = 0.06;
  if (target.hp <= 0) onDeath(target, building);
}

function onDeath(obj, killer) {
  if (obj.isHQ) return;
  if (obj.isWreck) return; // wreck death handled in wreck update
  if (obj.isBuilding || obj.bp && !obj.side) {
    // it's a player building
  }
  // building death
  if (S.buildings.indexOf(obj) !== -1) {
    obj.slot.taken = false;
    S.buildings = S.buildings.filter(x => x !== obj);
    spawnExplosion(obj.x, obj.y, 10);
    S.shake = Math.max(S.shake, 2);
    Audio2.thud();
    toast('Budynek zniszczony!', true);
    return;
  }
  // unit death
  if (obj.bp && obj.side) {
    obj.hp = 0;
    spawnExplosion(obj.x, obj.y, obj.bp.cls === 'armor' ? 8 : 4);
    Audio2.thud();
    // ARMOR units leave a wreck (both sides). infantry leave stain. air = nothing on ground.
    if (obj.bp.cls === 'armor') {
      createWreck(obj.x, obj.y, obj.lane);
      decalTrack(obj.x, obj.y);
    } else if (obj.bp.cls === 'infantry') {
      decalStain(obj.x, obj.y, obj.side === 'corps' ? 'rgba(138,32,32,0.6)' : 'rgba(138,32,32,0.6)');
    } else if (obj.bp.cls === 'air') {
      spawnExplosion(obj.x, obj.y, 6);
    }
    // bounty if a RDZA unit died
    if (obj.side === 'rust') {
      const bounty = Math.round((obj.bp.bounty || 0) * S.waveMult);
      S.scrap += bounty;
      S.bountyEarned += bounty;
      spawnFloat(obj.x, obj.y, '+' + bounty, '#6be86b');
    }
  }
}

/* ============================ WRECKS ============================ */
function createWreck(x, y, lane) {
  x = clamp(x, BUILD_ZONE_END + 4, FIELD_END - 4);
  S.wrecks.push({ isWreck: true, x, y: laneCenter(lane) + (rnd() * 6 - 3), lane, hp: CONFIG.WRECK_HP, max: CONFIG.WRECK_HP, flash: 0, collapse: 0, rustSeed: rndi(1, 9999) });
  decalCrater(x, y);
}

function updateWrecks(dt) {
  for (const w of S.wrecks) {
    if (w.flash > 0) w.flash -= dt;
    if (w.hp <= 0 && !w.dying) {
      w.dying = true; w.collapse = 0.12;
      spawnExplosion(w.x, w.y, 5);
      decalStain(w.x, w.y, 'rgba(20,16,12,0.6)');
    }
    if (w.dying) w.collapse -= dt;
  }
  S.wrecks = S.wrecks.filter(w => !(w.dying && w.collapse <= 0));
}

function meltWreck(w) {
  if (w.hp <= 0) return;
  const reward = CONFIG.WRECK_MELT_REWARD + (S.commander ? S.commander.meltBonus : 0);
  S.scrap += reward;
  w.hp = 0; // updateWrecks starts collapse next frame
  spawnFloat(w.x, w.y, '+' + reward, '#e8c840');
  for (let i = 0; i < 8; i++) spawnSpark(w.x, w.y);
  toast('Przetopiono +' + reward);
  Audio2.melt();
}

/* ============================ PARTICLES ============================ */
function spawnExplosion(x, y, n) {
  for (let i = 0; i < n; i++) {
    S.particles.push({ x, y, vx: (rnd() * 2 - 1) * 30, vy: (rnd() * 2 - 1) * 30 - 10, life: 0.3 + rnd() * 0.3, col: pick(['#ffb000', '#9c5a22', '#9a9a90', '#14100c']), r: 1 + rnd() });
  }
}
function spawnSpark(x, y) {
  S.particles.push({ x, y, vx: (rnd() * 2 - 1) * 40, vy: -rnd() * 40, life: 0.25, col: '#e8c840', r: 1 });
}
function spawnFloat(x, y, text, col) {
  S.particles.push({ x, y, vx: 0, vy: -14, life: 1.1, text, col, float: true });
}
function updateParticles(dt) {
  for (const p of S.particles) {
    p.x += p.vx * dt; p.y += p.vy * dt;
    if (!p.float) p.vy += 60 * dt;
    p.life -= dt;
  }
  S.particles = S.particles.filter(p => p.life > 0);
  for (const b of S.bullets) b.life -= dt;
  S.bullets = S.bullets.filter(b => b.life > 0);
}

/* ============================ TOASTS / HUD ============================ */
const toastEl = document.getElementById('toasts');
function toast(text, alarm) {
  const d = document.createElement('div');
  d.className = 'toast' + (alarm ? ' alarm' : '');
  d.textContent = text;
  toastEl.appendChild(d);
  setTimeout(() => { d.style.opacity = '0'; setTimeout(() => d.remove(), 300); }, 1800);
  while (toastEl.children.length > 5) toastEl.removeChild(toastEl.firstChild);
}

const hudScrap = document.getElementById('hud-scrap');
const hudIncome = document.getElementById('hud-income');
const hudWave = document.getElementById('hud-wave');
const hudNext = document.getElementById('hud-next');
const hudEl = document.getElementById('hud');
function updateHUD() {
  hudScrap.textContent = Math.floor(S.scrap);
  const yards = S.buildings.filter(b => b.type === 'scrapyard').length;
  const inc = Math.round((CONFIG.BASE_INCOME + yards * CONFIG.SCRAPYARD_INCOME) * (S.commander ? S.commander.income : 1));
  hudIncome.textContent = '+' + inc;
  hudWave.textContent = S.wave;
  if (S.phase === 'battle') hudNext.textContent = 'TRWA';
  else if (S.phase === 'grace' || S.phase === 'prep') hudNext.textContent = Math.ceil(S.phaseTimer / 1000) + 's';
  else hudNext.textContent = '--';
  // pulse red in last 3s
  if ((S.phase === 'grace' || S.phase === 'prep') && S.phaseTimer <= 3000) hudEl.classList.add('pulse-red');
  else hudEl.classList.remove('pulse-red');
}

/* ============================ ECONOMY ============================ */
function incomeTick(dt) {
  if (S.phase === 'commander' || S.phase === 'over') return;
  S.incomeTimer -= dt * 1000;
  if (S.incomeTimer <= 0) {
    S.incomeTimer += CONFIG.INCOME_TICK_MS;
    const yards = S.buildings.filter(b => b.type === 'scrapyard');
    const gain = Math.round((CONFIG.BASE_INCOME + yards.length * CONFIG.SCRAPYARD_INCOME) * (S.commander ? S.commander.income : 1));
    S.scrap += gain;
    S.scrapyardEarned += yards.length * CONFIG.SCRAPYARD_INCOME;
    Audio2.chime();
    hudScrap.classList.add('flash-green');
    setTimeout(() => hudScrap.classList.remove('flash-green'), 300);
    // truck animation on yards
    for (const b of yards) b.truck = 1.0;
  }
}

/* ============================ WAVES ============================ */
function laneWeights() {
  // choose weakest lane (fewest player buildings) when wave>=4
  const counts = [0, 0, 0];
  for (const b of S.buildings) counts[b.lane]++;
  return counts;
}
function chooseLane() {
  if (S.wave >= 4 && rnd() < 0.6) {
    const c = laneWeights();
    let min = Math.min(c[0], c[1], c[2]);
    const cand = [0, 1, 2].filter(i => c[i] === min);
    return pick(cand);
  }
  return rndi(0, 2);
}

function offerCards() {
  S.phase = 'cardpick';
  // draw 3 of 5; force looters until wave 3
  let keys = CARD_KEYS.slice();
  const chosen = [];
  if (S.wave < 3) { chosen.push('looters'); keys = keys.filter(k => k !== 'looters'); }
  while (chosen.length < 3 && keys.length) {
    const k = keys.splice(Math.floor(rnd() * keys.length), 1)[0];
    chosen.push(k);
  }
  renderCards(chosen);
}

function buildSpawnQueue(cardKey) {
  const card = CARDS[cardKey];
  const n = S.wave;
  const queue = [];
  if (cardKey === 'mixed') {
    // two random non-mixed cards, half each
    const opts = CARD_KEYS.filter(k => k !== 'mixed');
    const a = opts.splice(Math.floor(rnd() * opts.length), 1)[0];
    const b = opts.splice(Math.floor(rnd() * opts.length), 1)[0];
    const ca = Math.max(1, Math.ceil(CARDS[a].count(n) / 2));
    const cb = Math.max(1, Math.ceil(CARDS[b].count(n) / 2));
    for (let i = 0; i < ca; i++) queue.push(CARDS[a].unit);
    for (let i = 0; i < cb; i++) queue.push(CARDS[b].unit);
  } else {
    const c = card.count(n);
    for (let i = 0; i < c; i++) queue.push(card.unit);
  }
  // shuffle
  for (let i = queue.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); const t = queue[i]; queue[i] = queue[j]; queue[j] = t; }
  return queue;
}

function chooseCard(cardKey, skipBonus) {
  hideCards();
  S.pendingCard = cardKey;
  S.spawnQueue = buildSpawnQueue(cardKey).map(u => ({ unit: u, lane: chooseLane() }));
  let mult = CARDS[cardKey].mult;
  if (skipBonus) mult *= 1.25;
  S.pendingMult = mult;
  // prep period (grace on wave 1) then wave
  S.phase = S.wave === 0 ? 'grace' : 'prep';
  S.phaseTimer = S.wave === 0 ? CONFIG.GRACE_MS : CONFIG.WAVE_GAP_MS;
  if (skipBonus) { S.phaseTimer = 200; toast('Fala od razu! +25% złomu'); }
}

function startWave() {
  S.wave++;
  S.phase = 'battle';
  S.waveMult = S.pendingMult || 1;
  S.spawnTimer = 0;
  toast('FALA ' + S.wave);
  Audio2.alarm();
  const cardKey = S.pendingCard;
  if (cardKey === 'raid') toast('Nalot!', true);
}

function updateWave(dt) {
  if (S.phase === 'grace' || S.phase === 'prep') {
    S.phaseTimer -= dt * 1000;
    if (S.phaseTimer <= 0) startWave();
    return;
  }
  if (S.phase !== 'battle') return;
  // spawn queued enemies staggered
  if (S.spawnQueue.length) {
    S.spawnTimer -= dt * 1000;
    if (S.spawnTimer <= 0) {
      S.spawnTimer = 600;
      const e = S.spawnQueue.shift();
      enemyScaled(e.unit, e.lane);
    }
  }
  // wave end?
  const aliveRust = S.units.some(u => u.side === 'rust' && u.hp > 0);
  if (!S.spawnQueue.length && !aliveRust) {
    endWave();
  }
}
function endWave() {
  S.phase = 'won-wave';
  toast('Fala ' + S.wave + ' odparta');
  // report bounty share occasionally to console for tuning
  setTimeout(() => { offerCards(); }, 500);
}

/* ============================ BUILDING SPAWN TICK ============================ */
function updateBuildings(dt) {
  for (const b of S.buildings) {
    if (b.hp <= 0) continue;
    if (b.truck > -1) { b.truck -= dt; if (b.truck < -1) b.truck = -1; }
    b.blink = (b.blink + dt) % 1;
    b.flag = (b.flag + dt * 2) % 2;
    const canSpawn = S.phase === 'battle' || S.phase === 'grace' || S.phase === 'prep' || S.phase === 'won-wave';
    if (b.bp.kind === 'spawn' && canSpawn) {
      // Vega: koszary + fabryki spawnują 20% szybciej
      let every = b.bp.every;
      if ((b.type === 'barracks' || b.type === 'factory') && S.commander) every *= S.commander.spawnRate;
      b.cool -= dt * 1000;
      if (b.cool <= 0) {
        b.cool += every;
        b.fireVis = 0.3;
        spawnUnit(b.bp.unit, b.lane, b.x + 6, 'corps');
        Audio2.spawn();
      }
    }
    if (b.fireVis > 0) b.fireVis -= dt;
    if (b.aaOpen > 0) b.aaOpen -= 0;
  }
}

/* ============================ HQ CHECK ============================ */
function checkHQ() {
  if (S.hq.hp <= 0 && S.phase !== 'over') {
    S.phase = 'over';
    S.shake = 4;
    showGameOver();
  }
}
// RDZA units damage HQ when reaching it (handled via HQ target in applyDamage)
// applyDamage targets HQ obj which is transient; instead handle directly:
function updateHQDamage(dt) {
  for (const u of S.units) {
    if (u.side !== 'rust' || u.hp <= 0) continue;
    if (u.bp.cls === 'air') {
      // air hits HQ only if no scrapyards (handled in updateAir via target isHQ)
      const noYards = !S.buildings.some(b => b.type === 'scrapyard' && b.hp > 0);
      if (noYards && u.x <= HQ_X + HQ_W + u.bp.range) {
        S.hq.hp -= u.dps * dt * 1.5;
        if (Math.random() < dt * 2) Audio2.alarm();
      }
      continue;
    }
    const laneHasBuilding = S.buildings.some(b => b.lane === u.lane && b.hp > 0);
    if (!laneHasBuilding && u.x <= HQ_X + HQ_W + u.bp.range) {
      S.hq.hp -= u.dps * dt;
      S.shake = Math.max(S.shake, 1);
      if (Math.random() < dt) { toast('Nasza baza jest atakowana!', true); }
    }
  }
}

/* ============================ INPUT ============================ */
const buildMenu = document.getElementById('buildmenu');
let openSlot = null;

function toInternal(clientX, clientY) {
  canvasRect = canvas.getBoundingClientRect();
  return { x: (clientX - canvasRect.left) / SCALE, y: (clientY - canvasRect.top) / SCALE };
}
function internalToScreen(x, y) {
  canvasRect = canvas.getBoundingClientRect();
  return { x: canvasRect.left + x * SCALE, y: canvasRect.top + y * SCALE };
}

canvas.addEventListener('mousedown', (e) => {
  Audio2.resume();
  const p = toInternal(e.clientX, e.clientY);
  if (S.phase === 'commander' || S.phase === 'over') return;
  if (e.button === 2) { // right click sell
    const b = buildingHit(p.x, p.y);
    if (b) { sellBuilding(b); closeMenu(); }
    return;
  }
  // left click
  closeMenu();
  // wreck?
  const w = wreckHit(p.x, p.y);
  if (w) { meltWreck(w); return; }
  // building? (ignore, no selection)
  const b = buildingHit(p.x, p.y);
  if (b) return;
  // slot?
  const slot = slotHit(p.x, p.y);
  if (slot && !slot.taken) { openBuildMenu(slot, e.clientX, e.clientY); }
});
canvas.addEventListener('contextmenu', e => e.preventDefault());

let mouseInt = { x: -1, y: -1 };
canvas.addEventListener('mousemove', (e) => { mouseInt = toInternal(e.clientX, e.clientY); });

window.addEventListener('keydown', (e) => {
  if (e.code === 'Space') {
    e.preventDefault();
    if (S.phase === 'grace' || S.phase === 'prep') { S.pendingMult *= 1.25; startWave(); }
  }
});

function slotHit(x, y) {
  for (const s of S.slots) if (x >= s.x && x < s.x + SLOT_SIZE && y >= s.y && y < s.y + SLOT_SIZE) return s;
  return null;
}
function buildingHit(x, y) {
  for (const b of S.buildings) if (Math.abs(x - b.x) < 18 && Math.abs(y - b.y) < 18) return b;
  return null;
}
function wreckHit(x, y) {
  for (const w of S.wrecks) if (w.hp > 0 && Math.abs(x - w.x) < 8 && Math.abs(y - w.y) < 8) return w;
  return null;
}

function openBuildMenu(slot, clientX, clientY) {
  openSlot = slot;
  buildMenu.innerHTML = '';
  for (const type of BUILD_ORDER) {
    const bp = BUILD[type];
    const cost = Math.round(bp.cost * (S.commander ? S.commander.buildCost : 1));
    const cant = S.scrap < cost;
    const btn = document.createElement('div');
    btn.className = 'build-btn' + (cant ? ' cant' : '');
    btn.innerHTML = bp.name + '<span class="c">' + cost + ' złomu</span>';
    if (!cant) btn.addEventListener('mousedown', (ev) => { ev.stopPropagation(); placeBuilding(type, slot); closeMenu(); });
    buildMenu.appendChild(btn);
  }
  buildMenu.classList.remove('hidden');
  // position near slot
  const sp = internalToScreen(slot.x + SLOT_SIZE, slot.y);
  buildMenu.style.left = Math.min(sp.x, window.innerWidth - 160) + 'px';
  buildMenu.style.top = Math.min(sp.y, window.innerHeight - 160) + 'px';
}
function closeMenu() { buildMenu.classList.add('hidden'); openSlot = null; }
document.addEventListener('mousedown', (e) => {
  if (!buildMenu.contains(e.target) && e.target !== canvas) closeMenu();
});

/* ============================ CARDS UI ============================ */
const cardsOverlay = document.getElementById('cards');
const cardsRow = document.getElementById('cards-row');
const cardsTitle = document.getElementById('cards-title');
function renderCards(keys) {
  cardsTitle.textContent = 'WYBIERZ FALĘ ' + (S.wave + 1);
  cardsRow.innerHTML = '';
  for (const key of keys) {
    const c = CARDS[key];
    const n = S.wave + 1; // upcoming wave number
    let count = key === 'mixed' ? '2 oddziały' : c.count(n);
    const el = document.createElement('div');
    el.className = 'card';
    const vis = document.createElement('canvas'); vis.width = 108; vis.height = 30;
    drawCardVis(vis.getContext('2d'), key);
    el.innerHTML = '<h3>' + c.name + '</h3>';
    el.appendChild(vis);
    el.insertAdjacentHTML('beforeend',
      '<div class="cnum">' + count + ' wrogów</div>' +
      '<div class="cmul">×' + c.mult.toFixed(1) + '</div>' +
      '<div class="cdesc">' + c.line + '</div>' +
      '<div class="cctr">Kontra: ' + c.ctr + '</div>');
    el.addEventListener('click', () => { chooseCard(key, false); });
    cardsRow.appendChild(el);
  }
  cardsOverlay.classList.remove('hidden');
}
function hideCards() { cardsOverlay.classList.add('hidden'); }
function drawCardVis(c, key) {
  c.imageSmoothingEnabled = false;
  c.clearRect(0, 0, 108, 30);
  const type = key === 'mixed' ? 'looter' : CARDS[key].unit;
  for (let i = 0; i < 5; i++) {
    const x = 10 + i * 18, y = 15;
    drawUnitIcon(c, x, y, type, i % 2);
  }
}
function drawUnitIcon(c, x, y, type, frame) {
  const bp = UNIT[type];
  c.save();
  c.translate(x, y);
  const col = '#8f8f84';
  c.fillStyle = col;
  if (bp.cls === 'air') {
    c.fillStyle = '#6e6e64'; c.fillRect(-4, -1, 9, 3);
    c.fillStyle = '#14100c'; c.fillRect(-5, -3 + (frame ? 0 : 1), 11, 1);
    c.fillStyle = bp.color; c.fillRect(-4, 0, 9, 1);
  } else if (bp.cls === 'armor') {
    c.fillStyle = '#6e6e64'; c.fillRect(-4, -2, 9, 5);
    c.fillStyle = '#14100c'; c.fillRect(-4, 2, 9, 2);
    c.fillStyle = bp.color; c.fillRect(-1, -4, 6, 1);
  } else if (bp.cls === 'rockets') {
    c.fillStyle = '#8f8f84'; c.fillRect(-1, -3, 3, 6);
    c.fillStyle = '#4a4a44'; c.fillRect(2, -2, 4, 1);
    c.fillStyle = bp.color; c.fillRect(-1, -3, 3, 1);
  } else {
    c.fillStyle = '#8f8f84'; c.fillRect(-1, -3, 3, 6);
    c.fillStyle = bp.color; c.fillRect(-1, -3, 3, 1);
  }
  c.restore();
}

/* ============================ COMMANDERS UI ============================ */
const cmdOverlay = document.getElementById('commanders');
const cmdRow = document.getElementById('commanders-row');
function renderCommanders() {
  cmdRow.innerHTML = '';
  for (const key of ['reznik', 'hutnik', 'vega']) {
    const c = COMMANDERS[key];
    const el = document.createElement('div');
    el.className = 'cmd-card';
    const cv = document.createElement('canvas'); cv.width = 64; cv.height = 64;
    const cc = cv.getContext('2d'); cc.imageSmoothingEnabled = false;
    cc.scale(2, 2);
    drawCommanderPortrait(cc, key);
    el.appendChild(cv);
    el.insertAdjacentHTML('beforeend', '<h3>' + c.name + '</h3>' +
      '<div class="plus">+ ' + c.plus + '</div>' +
      '<div class="minus">− ' + c.minus + '</div>');
    el.addEventListener('click', () => {
      Audio2.resume();
      S.commander = c;
      cmdOverlay.classList.add('hidden');
      offerCards();
    });
    cmdRow.appendChild(el);
  }
}
function drawCommanderPortrait(c, key) {
  c.fillStyle = '#3d3122'; c.fillRect(0, 0, 32, 32);
  // shoulders
  c.fillStyle = key === 'reznik' ? '#5a6a7a' : key === 'hutnik' ? '#6b3410' : '#7d6844';
  c.fillRect(6, 24, 20, 8);
  // head
  c.fillStyle = '#8f8f84'; c.fillRect(11, 12, 10, 11);
  c.fillStyle = '#7d6844'; c.fillRect(11, 12, 10, 11); // skin-ish
  if (key === 'reznik') { // officer cap
    c.fillStyle = '#5a6a7a'; c.fillRect(9, 8, 14, 5); c.fillStyle = '#e8c840'; c.fillRect(14, 9, 4, 2);
    c.fillStyle = '#14100c'; c.fillRect(9, 13, 14, 1);
  } else if (key === 'hutnik') { // welding mask
    c.fillStyle = '#4a4a44'; c.fillRect(10, 9, 12, 13);
    c.fillStyle = '#14100c'; c.fillRect(12, 14, 8, 3);
    c.fillStyle = '#ffb000'; c.fillRect(13, 15, 6, 1);
  } else { // hood
    c.fillStyle = '#4a4a44'; c.fillRect(8, 8, 16, 8);
    c.fillStyle = '#14100c'; c.fillRect(12, 15, 3, 2); c.fillRect(17, 15, 3, 2);
  }
  // eyes for reznik
  if (key === 'reznik') { c.fillStyle = '#14100c'; c.fillRect(13, 17, 2, 2); c.fillRect(17, 17, 2, 2); }
}

/* ============================ GAME OVER ============================ */
const goOverlay = document.getElementById('gameover');
function showGameOver() {
  document.getElementById('go-stats').textContent =
    'Dotarłeś do fali ' + S.wave + '. Złom z zabójstw: ' + Math.round(S.bountyEarned) +
    ', ze złomowisk: ' + Math.round(S.scrapyardEarned) + '.';
  goOverlay.classList.remove('hidden');
}
document.getElementById('go-restart').addEventListener('click', () => location.reload());

/* ============================ RENDER ============================ */
function draw() {
  ctx.imageSmoothingEnabled = false;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  // shake
  let sx = 0, sy = 0;
  if (S.shake > 0) { sx = (rnd() * 2 - 1) * S.shake; sy = (rnd() * 2 - 1) * S.shake; }
  ctx.clearRect(0, 0, VW, VH);
  ctx.save();
  ctx.translate(Math.round(sx), Math.round(sy));

  // ground + decals
  ctx.drawImage(groundCv, 0, 0);
  ctx.drawImage(decalCv, 0, 0);

  drawHQ();
  drawSlots();
  drawFrontLines();
  // wrecks under units
  for (const w of S.wrecks) drawWreck(w);
  for (const b of S.buildings) drawBuilding(b);
  // sort units by y for depth
  const us = S.units.slice().sort((a, b) => a.y - b.y);
  for (const u of us) drawUnit(u);
  for (const b of S.bullets) drawBullet(b);
  drawParticles();
  drawHover();

  ctx.restore();
}

function drawHQ() {
  // big fortified base on left, full height
  ctx.fillStyle = '#4a4a44'; ctx.fillRect(0, 30, HQ_W, VH - 30);
  ctx.fillStyle = '#6e6e64'; ctx.fillRect(0, 30, HQ_W, 2);
  ctx.fillStyle = '#14100c'; ctx.fillRect(HQ_W - 1, 30, 1, VH - 30);
  // crenellations
  for (let y = 34; y < VH; y += 10) { ctx.fillStyle = '#5a6a7a'; ctx.fillRect(2, y, 10, 2); }
  // amber flag
  ctx.fillStyle = '#8f8f84'; ctx.fillRect(6, 20, 1, 12);
  ctx.fillStyle = '#e8c840'; ctx.fillRect(7, 20, 5, 4);
  // HP as damage cracks (no bar, per spec) — show darker as HP drops
  const dmg = 1 - S.hq.hp / S.hq.max;
  if (dmg > 0.3) { ctx.fillStyle = 'rgba(20,16,12,0.5)'; ctx.fillRect(0, 30, HQ_W, VH); }
  if (dmg > 0.6) { ctx.fillStyle = '#8a2020'; for (let i = 0; i < 4; i++) ctx.fillRect(2 + i * 3, 40 + i * 40, 1, 20); }
}

function drawSlots() {
  for (const s of S.slots) {
    if (s.taken) continue;
    ctx.strokeStyle = 'rgba(110,110,100,0.25)';
    ctx.fillStyle = 'rgba(74,74,68,0.15)';
    ctx.fillRect(s.x, s.y, SLOT_SIZE, SLOT_SIZE);
    // corner ticks
    ctx.fillStyle = 'rgba(110,110,100,0.4)';
    ctx.fillRect(s.x, s.y, 3, 1); ctx.fillRect(s.x, s.y, 1, 3);
    ctx.fillRect(s.x + SLOT_SIZE - 3, s.y, 3, 1); ctx.fillRect(s.x + SLOT_SIZE - 1, s.y, 1, 3);
    ctx.fillRect(s.x, s.y + SLOT_SIZE - 1, 3, 1); ctx.fillRect(s.x, s.y + SLOT_SIZE - 3, 1, 3);
    ctx.fillRect(s.x + SLOT_SIZE - 3, s.y + SLOT_SIZE - 1, 3, 1); ctx.fillRect(s.x + SLOT_SIZE - 1, s.y + SLOT_SIZE - 3, 1, 3);
  }
}

function drawFrontLines() {
  for (let li = 0; li < 3; li++) {
    let kMax = -1, rMin = 1e9, hasK = false, hasR = false;
    for (const u of S.units) {
      if (u.hp <= 0 || u.lane !== li || u.bp.cls === 'air') continue;
      if (u.side === 'corps') { hasK = true; if (u.x > kMax) kMax = u.x; }
      else { hasR = true; if (u.x < rMin) rMin = u.x; }
    }
    let fx = null;
    if (hasK && hasR) fx = (kMax + rMin) / 2;
    else if (hasR) fx = rMin;
    else if (hasK) fx = kMax;
    if (fx == null) continue;
    ctx.fillStyle = 'rgba(255,176,0,0.35)';
    const y0 = LANE_Y[li] - LANE_H / 2 + 2, y1 = LANE_Y[li] + LANE_H / 2 - 2;
    for (let y = y0; y < y1; y += 4) ctx.fillRect(Math.round(fx), y, 1, 2);
  }
}

/* ---- building drawing ---- */
function rustOverlay(b, x, y, w, h) {
  ctx.fillStyle = 'rgba(107,52,16,0.5)';
  for (const cx of b.rustCols) {
    const px = x + (cx % w);
    ctx.fillRect(px, y + 2, 1, h - 4);
  }
}
function baseBox(x, y, w, h, col, light) {
  ctx.fillStyle = col; ctx.fillRect(x, y, w, h);
  ctx.fillStyle = '#14100c'; ctx.strokeStyle = '#14100c';
  ctx.fillRect(x, y, w, 1); ctx.fillRect(x, y, 1, h);
  ctx.fillRect(x + w - 1, y, 1, h); ctx.fillRect(x, y + h - 1, w, 1);
  ctx.fillStyle = light || '#8f8f84';
  ctx.fillRect(x + 1, y + 1, w - 2, 1); ctx.fillRect(x + 1, y + 1, 1, h - 2);
}
function sandbags(x, y, w) {
  ctx.fillStyle = '#7d6844';
  for (let i = 0; i < w; i += 3) ctx.fillRect(x + i, y, 2, 2);
}
function mudPatch(x, y, w, h) {
  ctx.fillStyle = 'rgba(61,49,34,0.55)';
  ctx.fillRect(x - 3, y + h - 2, w + 6, 4);
}

function drawBuilding(b) {
  const x = b.x - 18, y = b.y - 18, cx = b.x, cy = b.y;
  mudPatch(x, y, 36, 36);
  const dmg = 1 - b.hp / b.max;
  switch (b.type) {
    case 'scrapyard': {
      // scrap heap + press + smoking chimney + truck
      baseBox(x + 4, y + 14, 28, 20, '#6e6e64');
      rustOverlay(b, x + 4, y + 14, 28, 20);
      // scrap heap
      ctx.fillStyle = '#8a8f7a';
      ctx.fillRect(x + 6, y + 22, 10, 10); ctx.fillRect(x + 8, y + 18, 6, 6);
      ctx.fillStyle = '#4a4a44'; ctx.fillRect(x + 7, y + 24, 2, 2); ctx.fillRect(x + 12, y + 20, 2, 2);
      // chimney
      ctx.fillStyle = '#4a4a44'; ctx.fillRect(x + 24, y + 8, 4, 8);
      // blinking roof light
      if (b.blink < 0.5) { ctx.fillStyle = '#c62828'; ctx.fillRect(x + 28, y + 13, 2, 2); }
      // truck (income anim)
      if (b.truck > 0) {
        const tx = x - 6 + (1 - b.truck) * 8;
        ctx.fillStyle = '#7d6844'; ctx.fillRect(tx, y + 28, 6, 4);
        ctx.fillStyle = '#14100c'; ctx.fillRect(tx, y + 31, 2, 1); ctx.fillRect(tx + 4, y + 31, 2, 1);
      }
      // continuous smoke
      if (rnd() < 0.4) S.particles.push({ x: cx + 8, y: y + 6, vx: 2, vy: -12, life: 1.2, col: 'rgba(154,154,144,0.5)', r: 1, float: false, smoke: true });
      break;
    }
    case 'barracks': {
      baseBox(x + 4, y + 16, 28, 18, '#5f4e35');
      rustOverlay(b, x + 4, y + 16, 28, 18);
      // gable roof
      ctx.fillStyle = '#4a4a44';
      for (let i = 0; i < 14; i++) ctx.fillRect(x + 4 + i, y + 16 - i * 0.4, 1, 2);
      for (let i = 0; i < 14; i++) ctx.fillRect(x + 32 - i, y + 16 - i * 0.4, 1, 2);
      ctx.fillStyle = '#14100c'; ctx.fillRect(x + 16, y + 24, 4, 10); // door
      if (b.fireVis > 0) { ctx.fillStyle = '#ffb000'; ctx.fillRect(x + 16, y + 24, 4, 4); }
      // flag mast
      ctx.fillStyle = '#8f8f84'; ctx.fillRect(x + 6, y + 6, 1, 12);
      ctx.fillStyle = '#e8c840'; ctx.fillRect(x + 7, y + 6, 3 + (b.flag < 1 ? 1 : 0), 3);
      sandbags(x + 4, y + 33, 28);
      break;
    }
    case 'rocketry': {
      baseBox(x + 4, y + 20, 28, 14, '#5a6a7a');
      rustOverlay(b, x + 4, y + 20, 28, 14);
      // slanted launch rail on roof
      ctx.fillStyle = '#4a4a44';
      for (let i = 0; i < 12; i++) ctx.fillRect(x + 10 + i, y + 18 - i, 3, 2);
      ctx.fillStyle = '#c62828'; ctx.fillRect(x + 20, y + 8, 2, 2); // rocket tip
      sandbags(x + 4, y + 33, 28);
      break;
    }
    case 'factory': {
      baseBox(x + 2, y + 12, 32, 22, '#6e6e64');
      rustOverlay(b, x + 2, y + 12, 32, 22);
      // sawtooth roof segments
      ctx.fillStyle = '#4a4a44';
      for (let s = 0; s < 4; s++) ctx.fillRect(x + 3 + s * 8, y + 10, 6, 3);
      // garage door
      const doorOpen = b.fireVis > 0.15;
      ctx.fillStyle = doorOpen ? '#14100c' : '#4a4a44';
      ctx.fillRect(x + 12, y + 22, 12, 12);
      ctx.fillStyle = '#14100c'; ctx.fillRect(x + 12, y + 22, 12, 1);
      // crane
      ctx.fillStyle = '#e8c840'; ctx.fillRect(x + 30, y + 6, 1, 8); ctx.fillRect(x + 26, y + 6, 5, 1);
      if (rnd() < 0.3) S.particles.push({ x: cx - 6, y: y + 8, vx: 1, vy: -10, life: 1, col: 'rgba(154,154,144,0.4)', r: 1, smoke: true });
      break;
    }
    case 'bunker': {
      // low wide dome with slit
      ctx.fillStyle = '#6e6e64'; ctx.fillRect(x + 3, y + 20, 30, 14);
      ctx.beginPath(); ctx.fillStyle = '#6e6e64';
      ctx.arc(cx, y + 20, 15, Math.PI, 0); ctx.fill();
      ctx.fillStyle = '#14100c'; ctx.fillRect(x + 8, y + 18, 20, 2); // slit
      ctx.fillStyle = '#8f8f84'; ctx.fillRect(x + 3, y + 20, 30, 1);
      rustOverlay(b, x + 3, y + 20, 30, 14);
      sandbags(x + 3, y + 33, 30);
      if (b.fireVis > 0) { ctx.fillStyle = '#ffb000'; ctx.fillRect(x + 16, y + 17, 4, 2); }
      break;
    }
    case 'atgun': {
      // concrete pedestal + long barrel rotating
      ctx.fillStyle = '#6e6e64'; ctx.fillRect(x + 10, y + 22, 16, 12);
      baseBox(x + 10, y + 22, 16, 12, '#6e6e64');
      // barrel (long, 4-dir aim)
      const a = b.aim || 0;
      ctx.save(); ctx.translate(cx, y + 22);
      ctx.rotate(a);
      ctx.fillStyle = '#4a4a44'; ctx.fillRect(0, -1, 18, 2);
      ctx.restore();
      ctx.fillStyle = '#5a6a7a'; ctx.fillRect(x + 14, y + 20, 8, 4); // turret
      sandbags(x + 10, y + 33, 16);
      if (b.fireVis > 0) { ctx.fillStyle = '#ffb000'; ctx.fillRect(cx + Math.cos(a) * 18 - 1, y + 22 + Math.sin(a) * 18 - 1, 2, 2); }
      break;
    }
    case 'aa': {
      // closed crate when idle; opens when firing
      const open = b.aaOpen > 0;
      baseBox(x + 8, y + 20, 20, 14, '#5a6a7a');
      rustOverlay(b, x + 8, y + 20, 20, 14);
      if (open) {
        ctx.fillStyle = '#4a4a44'; ctx.fillRect(x + 10, y + 12, 16, 8);
        const a = b.aim || -1;
        ctx.save(); ctx.translate(cx, y + 16); ctx.rotate(a);
        ctx.fillStyle = '#6e6e64'; ctx.fillRect(0, -1, 12, 3);
        ctx.restore();
        if (b.fireVis > 0) { ctx.fillStyle = '#ffb000'; ctx.fillRect(cx + Math.cos(a) * 12 - 1, y + 16 + Math.sin(a) * 12 - 1, 2, 2); }
      } else {
        ctx.fillStyle = '#4a4a44'; ctx.fillRect(x + 10, y + 22, 16, 3);
      }
      sandbags(x + 8, y + 33, 20);
      break;
    }
  }
  // damage darkening
  if (dmg > 0.5) { ctx.fillStyle = 'rgba(20,16,12,0.35)'; ctx.fillRect(x, y, 36, 36); }
  // thin HP tick under building when hurt
  if (dmg > 0.05) {
    ctx.fillStyle = '#14100c'; ctx.fillRect(x + 4, y + 35, 28, 1);
    ctx.fillStyle = b.hp / b.max > 0.5 ? '#6be86b' : b.hp / b.max > 0.25 ? '#e8c840' : '#c62828';
    ctx.fillRect(x + 4, y + 35, Math.round(28 * b.hp / b.max), 1);
  }
}

/* ---- wreck drawing ---- */
function drawWreck(w) {
  if (w.hp <= 0) {
    // collapsing
    ctx.fillStyle = '#4a4a44'; ctx.fillRect(w.x - 4, w.y + 2, 8, 2);
    return;
  }
  const x = w.x, y = w.y;
  const flash = w.flash > 0;
  // burnt tank hulk
  ctx.fillStyle = flash ? '#e8e4d8' : '#4a4a44';
  ctx.fillRect(x - 5, y - 3, 11, 6);
  ctx.fillStyle = flash ? '#e8e4d8' : '#14100c';
  ctx.fillRect(x - 5, y + 2, 11, 2); // tracks
  ctx.fillStyle = flash ? '#e8e4d8' : '#6b3410';
  ctx.fillRect(x - 2, y - 5, 5, 3); // busted turret
  ctx.fillStyle = flash ? '#e8e4d8' : '#3d3122';
  ctx.fillRect(x + 2, y - 6, 4, 1); // bent barrel
  // rust streaks
  ctx.fillStyle = 'rgba(107,52,16,0.6)';
  ctx.fillRect(x - 3, y - 2, 1, 4); ctx.fillRect(x + 1, y - 1, 1, 3);
  // HP tick
  const r = w.hp / w.max;
  ctx.fillStyle = '#14100c'; ctx.fillRect(x - 5, y + 4, 11, 1);
  ctx.fillStyle = '#9c5a22'; ctx.fillRect(x - 5, y + 4, Math.round(11 * r), 1);
}

/* ---- unit drawing ---- */
function drawUnit(u) {
  if (u.hp <= 0) return;
  const x = Math.round(u.x), y = Math.round(u.y);
  const flash = u.flash > 0;
  const bob = u.anim ? 0 : 1;
  ctx.save();
  const bp = u.bp;
  if (bp.cls === 'air') {
    // shadow (mandatory)
    ctx.fillStyle = 'rgba(20,16,12,0.4)';
    ctx.fillRect(x - 4, y + 16, 8, 3);
    // body
    ctx.fillStyle = flash ? '#e8e4d8' : '#6e6e64';
    ctx.fillRect(x - 4, y - 1, 9, 3);
    ctx.fillStyle = flash ? '#e8e4d8' : '#4a4a44';
    ctx.fillRect(x + 4, y, 3, 1); // tail
    // rotor blinking
    ctx.fillStyle = '#14100c';
    if (u.anim) ctx.fillRect(x - 5, y - 3, 11, 1);
    else ctx.fillRect(x - 2, y - 3, 5, 1);
    // faction stripe
    ctx.fillStyle = bp.color; ctx.fillRect(x - 3, y + 1, 7, 1);
  } else if (bp.cls === 'armor') {
    ctx.fillStyle = flash ? '#e8e4d8' : '#6e6e64';
    ctx.fillRect(x - 4, y - 2, 9, 5);
    ctx.fillStyle = flash ? '#e8e4d8' : '#14100c';
    ctx.fillRect(x - 4, y + 2, 9, 2 + bob); // tracks
    // turret + barrel toward aim
    ctx.fillStyle = flash ? '#e8e4d8' : '#5a6a7a';
    ctx.fillRect(x - 1, y - 4, 4, 3);
    const a = u.aim || (u.dir > 0 ? 0 : Math.PI);
    ctx.fillStyle = '#4a4a44';
    ctx.fillRect(x + (u.dir > 0 ? 2 : -6), y - 3, 5, 1);
    if (u.side === 'rust') { // ram pointed front
      ctx.fillStyle = flash ? '#e8e4d8' : '#7a1414';
      ctx.fillRect(x + (u.dir > 0 ? 4 : -5), y - 1, 2, 3);
    }
    ctx.fillStyle = bp.color; ctx.fillRect(x - 1, y - 4, 4, 1);
  } else if (bp.cls === 'rockets') {
    ctx.fillStyle = flash ? '#e8e4d8' : '#7d6844';
    ctx.fillRect(x - 1, y - 3 + bob, 3, 6 - bob);
    // shoulder tube sticking out sideways
    ctx.fillStyle = flash ? '#e8e4d8' : '#4a4a44';
    ctx.fillRect(x + (u.dir > 0 ? 1 : -4), y - 2, 4, 1);
    ctx.fillStyle = bp.color; ctx.fillRect(x - 1, y - 3, 3, 1);
  } else { // infantry
    ctx.fillStyle = flash ? '#e8e4d8' : '#7d6844';
    ctx.fillRect(x - 1, y - 3 + bob, 3, 6 - bob);
    ctx.fillStyle = '#4a4a44'; ctx.fillRect(x - 2, y - 4, 5, 1); // helmet
    ctx.fillStyle = bp.color; ctx.fillRect(x - 1, y - 2, 3, 1); // stripe
    // gun
    ctx.fillStyle = '#14100c'; ctx.fillRect(x + (u.dir > 0 ? 1 : -3), y - 1, 3, 1);
  }
  ctx.restore();
  // muzzle flash
  if (u.fireVis > 0.15 && bp.cls !== 'air') {
    ctx.fillStyle = '#ffb000';
    ctx.fillRect(x + u.dir * (bp.range > 30 ? 4 : 3), y - 1, 2, 1);
  }
  // hp pip if hurt
  if (u.hp < u.max * 0.99) {
    ctx.fillStyle = '#14100c'; ctx.fillRect(x - 4, y - (bp.cls === 'air' ? 6 : 7), 8, 1);
    ctx.fillStyle = u.side === 'corps' ? '#6be86b' : '#c62828';
    ctx.fillRect(x - 4, y - (bp.cls === 'air' ? 6 : 7), Math.round(8 * u.hp / u.max), 1);
  }
}

function drawBullet(b) {
  const t = 1 - b.life / 0.25;
  const bx = b.x + (b.tx - b.x) * t, by = b.y + (b.ty - b.y) * t;
  ctx.fillStyle = b.col;
  ctx.fillRect(Math.round(bx), Math.round(by), 2, 1);
}

function drawParticles() {
  for (const p of S.particles) {
    if (p.text) {
      ctx.fillStyle = p.col;
      ctx.font = '6px Silkscreen, monospace';
      ctx.fillText(p.text, Math.round(p.x) - 6, Math.round(p.y));
    } else if (p.smoke) {
      ctx.fillStyle = p.col;
      ctx.fillRect(Math.round(p.x), Math.round(p.y), 1, 1);
    } else {
      ctx.fillStyle = p.col;
      const s = p.r || 1;
      ctx.fillRect(Math.round(p.x), Math.round(p.y), s, s);
    }
  }
}

function drawHover() {
  if (S.phase === 'commander' || S.phase === 'over') return;
  const w = wreckHit(mouseInt.x, mouseInt.y);
  if (w) {
    ctx.strokeStyle = '#ffb000'; ctx.lineWidth = 1;
    ctx.strokeRect(w.x - 6.5, w.y - 6.5, 13, 13);
    ctx.fillStyle = '#ffb000'; ctx.font = '6px Silkscreen, monospace';
    const rew = CONFIG.WRECK_MELT_REWARD + (S.commander ? S.commander.meltBonus : 0);
    ctx.fillText('PRZETOP +' + rew, w.x - 12, w.y - 9);
    return;
  }
  const s = slotHit(mouseInt.x, mouseInt.y);
  if (s && !s.taken) {
    ctx.strokeStyle = 'rgba(255,176,0,0.6)';
    ctx.strokeRect(s.x + 0.5, s.y + 0.5, SLOT_SIZE - 1, SLOT_SIZE - 1);
  }
}

/* ============================ LOOP ============================ */
let last = 0;
function loop(t) {
  const dt = Math.min(0.05, (t - last) / 1000 || 0);
  last = t;
  S.time += dt;

  if (S.phase !== 'commander' && S.phase !== 'over' && S.phase !== 'cardpick') {
    incomeTick(dt);
    updateBuildings(dt);
    updateUnits(dt);
    updateAirNothing();
    updateDefenses(dt);
    updateHQDamage(dt);
    updateWrecks(dt);
    updateParticles(dt);
    updateWave(dt);
    // remove dead units
    S.units = S.units.filter(u => u.hp > 0);
    checkHQ();
  } else {
    updateParticles(dt);
  }
  if (S.shake > 0) { S.shake -= dt * 12; if (S.shake < 0) S.shake = 0; }

  updateHUD();
  draw();
  requestAnimationFrame(loop);
}
function updateAirNothing() {}

/* ============================ INIT ============================ */
function init() {
  resize();
  buildGround();
  initSlots();
  // starting wrecks: 6, 2 per lane, x 200..380
  for (let li = 0; li < 3; li++) {
    for (let k = 0; k < 2; k++) {
      createWreck(rndi(200, 380), 0, li);
    }
  }
  renderCommanders();
  requestAnimationFrame(loop);
}
init();
