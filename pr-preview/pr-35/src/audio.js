/* =========================================================================
   FRONT — silnik dźwięku
   Proceduralne boom/siren (jak w oryginale) + rejestr próbek, żeby móc
   podmieniać efekty na wczytane pliki (assets/sfx/*.mp3|wav|ogg).

   Jak dodać własny dźwięk:
     import { registerSfx } from './audio.js'
     registerSfx('boom', 'assets/sfx/boom.wav');   // przy starcie
     ...a potem play('boom') zamiast proceduralnego.
   Dopóki nic nie zarejestrujesz, gra brzmi tak jak wcześniej.
   ========================================================================= */

let actx = null;
let lastBoom = 0;
let muted = false;

// name -> { buffer:AudioBuffer|null, url:string }
const sfx = {};

export function isMuted() { return muted; }
export function setMuted(v) { muted = !!v; }
export function toggleMuted() { muted = !muted; return muted; }

// Kontekst audio powstaje leniwie — pierwszy gest użytkownika go odblokowuje.
export function actxOf() {
  if (!actx) {
    const C = window.AudioContext || window.webkitAudioContext;
    if (C) actx = new C();
  }
  return actx;
}
export function resumeAudio() {
  try { const a = actxOf(); if (a && a.state === 'suspended') a.resume(); } catch (e) {}
}

// --- rejestr próbek ------------------------------------------------------
// Zarejestruj plik pod logiczną nazwą. Wczyta się w tle; do czasu wczytania
// (lub gdy plik nie istnieje) używamy dźwięku proceduralnego.
export function registerSfx(name, url) {
  sfx[name] = { buffer: null, url };
  loadSfx(name).catch(() => {});
}
async function loadSfx(name) {
  const a = actxOf(); if (!a) return;
  const entry = sfx[name]; if (!entry) return;
  const res = await fetch(entry.url);
  if (!res.ok) throw new Error('sfx 404: ' + entry.url);
  const arr = await res.arrayBuffer();
  entry.buffer = await a.decodeAudioData(arr);
}

// Odtwórz zarejestrowaną próbkę, jeśli jest gotowa. Zwraca true, gdy zagrała.
function playSample(name, vol) {
  const entry = sfx[name];
  if (!entry || !entry.buffer || muted) return false;
  try {
    const a = actxOf();
    const s = a.createBufferSource(); s.buffer = entry.buffer;
    const g = a.createGain(); g.gain.value = vol == null ? 1 : vol;
    s.connect(g); g.connect(a.destination); s.start();
    return true;
  } catch (e) { return false; }
}

// --- efekty proceduralne (fallback) --------------------------------------
export function boom(vol) {
  if (muted) return;
  if (playSample('boom', vol)) return;
  const now = performance.now();
  if (now - lastBoom < 45) return;
  lastBoom = now;
  try {
    const a = actxOf(); if (!a) return;
    const len = (a.sampleRate * 0.22) | 0;
    const buf = a.createBuffer(1, len, a.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2);
    const s = a.createBufferSource(); s.buffer = buf;
    const f = a.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 380;
    const g = a.createGain(); g.gain.value = (vol || 0) * 0.5;
    s.connect(f); f.connect(g); g.connect(a.destination); s.start();
  } catch (e) {}
}

export function siren() {
  if (muted) return;
  if (playSample('siren', 1)) return;
  try {
    const a = actxOf(); if (!a) return;
    const o = a.createOscillator(), g = a.createGain();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(220, a.currentTime);
    o.frequency.linearRampToValueAtTime(340, a.currentTime + 0.18);
    g.gain.setValueAtTime(0.06, a.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, a.currentTime + 0.35);
    o.connect(g); g.connect(a.destination); o.start(); o.stop(a.currentTime + 0.36);
  } catch (e) {}
}

// Ogólny hak — zagraj dowolną zarejestrowaną próbkę (np. 'shoot', 'build').
export function play(name, vol) { return playSample(name, vol); }
