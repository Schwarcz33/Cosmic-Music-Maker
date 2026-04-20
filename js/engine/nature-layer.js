// Nature layer — plays a sample from a URL (from the built-in library or anywhere).
// Shared loading cache so the same sample can be reused across engines or reloads without refetching.

import { AudioEngine } from './audio-context.js';

// In-memory cache keyed by URL. Stores ArrayBuffer (raw bytes) — we decode per-context.
const bufferCache = new Map();

async function fetchBuffer(url) {
  if (bufferCache.has(url)) return bufferCache.get(url);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to load ${url}: ${res.status}`);
  const buf = await res.arrayBuffer();
  bufferCache.set(url, buf);
  return buf;
}

export class NatureLayer {
  constructor(categoryKey) {
    this.categoryKey = categoryKey;
    this.enabled = false;
    this.url = null;              // currently selected sample URL
    this.displayName = '';
    this.volumeDb = -14;
    this.pan = 0;                 // -1 (L) to +1 (R)
    this.lpfHz = 22000;
    this.hpfHz = 20;
    this.fadeInSec = 3;
    this.fadeOutSec = 4;

    this.nodes = null;
    this._renderDuration = null;
  }

  setSample(url, displayName) {
    const changed = url !== this.url;
    this.url = url;
    this.displayName = displayName;
    if (this.nodes && changed) {
      // Crossfade swap: stop current and restart with new sample
      this.stop();
      if (this.enabled && this._liveCtx) {
        this.start(this._liveCtx, this._liveDest);
      }
    }
  }

  setVolume(db) {
    this.volumeDb = db;
    if (this.nodes) this.nodes.gain.gain.setTargetAtTime(AudioEngine.db2gain(db), this.nodes.ctx.currentTime, 0.1);
  }

  setPan(v) {
    this.pan = v;
    if (this.nodes) this.nodes.panner.pan.setTargetAtTime(v, this.nodes.ctx.currentTime, 0.1);
  }

  setLpf(hz) {
    this.lpfHz = hz;
    if (this.nodes) this.nodes.lpf.frequency.setTargetAtTime(hz, this.nodes.ctx.currentTime, 0.1);
  }

  setHpf(hz) {
    this.hpfHz = hz;
    if (this.nodes) this.nodes.hpf.frequency.setTargetAtTime(hz, this.nodes.ctx.currentTime, 0.1);
  }

  async start(ctx, destination) {
    if (!this.url) return;
    if (this.nodes) this.stop();

    // Remember live ctx/dest for sample swaps while playing
    this._liveCtx = ctx;
    this._liveDest = destination;

    // Load raw bytes (cached) and decode into this context
    const raw = await fetchBuffer(this.url);
    const buffer = await ctx.decodeAudioData(raw.slice(0));

    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    // Small loop-point crossfade hack: start 0.5s before loop end if buffer is long enough
    // (not a real crossfade, but bufferSource.loop handles seamlessly for clean audio)

    const hpf = ctx.createBiquadFilter();
    hpf.type = 'highpass';
    hpf.frequency.value = this.hpfHz;
    hpf.Q.value = 0.707;

    const lpf = ctx.createBiquadFilter();
    lpf.type = 'lowpass';
    lpf.frequency.value = this.lpfHz;
    lpf.Q.value = 0.707;

    const panner = ctx.createStereoPanner();
    panner.pan.value = this.pan;

    const gain = ctx.createGain();
    gain.gain.value = 0;

    src.connect(hpf).connect(lpf).connect(panner).connect(gain).connect(destination);

    // Fade in
    const target = AudioEngine.db2gain(this.volumeDb);
    const startT = ctx.currentTime;
    gain.gain.setValueAtTime(0, startT);
    gain.gain.linearRampToValueAtTime(target, startT + this.fadeInSec);

    // Fade out for offline render
    if (this._renderDuration !== null) {
      const fadeStart = Math.max(this.fadeInSec, this._renderDuration - this.fadeOutSec);
      gain.gain.setValueAtTime(target, fadeStart);
      gain.gain.linearRampToValueAtTime(0, this._renderDuration);
    }

    src.start(0);
    this.nodes = { ctx, src, hpf, lpf, panner, gain };
  }

  stop() {
    if (!this.nodes) return;
    const { ctx, src, gain } = this.nodes;
    gain.gain.cancelScheduledValues(ctx.currentTime);
    gain.gain.setValueAtTime(gain.gain.value, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.3);
    try { src.stop(ctx.currentTime + 0.32); } catch (e) {}
    this.nodes = null;
  }

  cloneForRender(durationSec) {
    const clone = new NatureLayer(this.categoryKey);
    clone.enabled = true;
    clone.url = this.url;
    clone.displayName = this.displayName;
    clone.volumeDb = this.volumeDb;
    clone.pan = this.pan;
    clone.lpfHz = this.lpfHz;
    clone.hpfHz = this.hpfHz;
    clone.fadeInSec = this.fadeInSec;
    clone.fadeOutSec = this.fadeOutSec;
    clone._renderDuration = durationSec;
    return clone;
  }
}

// Built-in library manifest — scanned from Peter's Nature Sounds stash, URL-encoded
const BASE = 'samples/nature';
const enc = encodeURIComponent;
function u(cat, filename) { return `${BASE}/${cat}/${filename.split('/').map(enc).join('/')}`; }

export const NATURE_LIBRARY = {
  rain: {
    label: 'Rain',
    samples: [
      { name: 'African Rain',       url: u('rain', 'African Rain.mp3') },
      { name: 'Long Soothing Rain', url: u('rain', 'Long Soothing Rain.mp3') },
      { name: 'Rain in Forest',     url: u('rain', 'Rain in Forest.mp3') },
      { name: 'Rain on a Pond',     url: u('rain', 'Rain on a pond.mp3') },
      { name: 'Rainshowers',        url: u('rain', 'Rainshowers.mp3') },
      { name: 'Wind and Rain',      url: u('rain', 'Wind and Rain.mp3') },
      { name: 'Rain in Woods',      url: u('rain', 'rain in woods.mp3') },
    ],
  },
  storm: {
    label: 'Storms & Thunder',
    samples: [
      { name: 'Continuous Thunder Claps',         url: u('rain', 'Continuous Thunder Claps And Rumbles.mp3') },
      { name: 'Heavy Rain with Rolling Thunder',  url: u('rain', 'Heavy Rain With Rolling Thunder.mp3') },
      { name: 'Severe Thunderstorm (light rain)', url: u('rain', 'Severe Thunderstorm (with light rain).mp3') },
      { name: 'Storm · Thunder · Wind · Rain',    url: u('rain', 'Storm, Thunder, Wind, And Rain.mp3') },
      { name: 'Thunder and Rain',                 url: u('rain', 'Thunder and rain.mp3') },
      { name: 'Thunder, Light & Heavy Rain',      url: u('rain', 'Thunder, Light & Heavy Rain.mp3') },
    ],
  },
  ocean: {
    label: 'Ocean',
    samples: [
      { name: 'Gentle Ocean',          url: u('ocean', 'Gentle Ocean.mp3') },
      { name: 'Relaxing Surf',         url: u('ocean', 'Ocean Relaxing Surf.mp3') },
      { name: 'Ocean Surf',            url: u('ocean', 'Ocean Surf.mp3') },
      { name: 'Pebble Beach Waves',    url: u('ocean', 'Ocean Waves - Pebble Beach.mp3') },
      { name: 'Ocean Waves',           url: u('ocean', 'Ocean Waves.MP3') },
      { name: 'Pleasant Beach',        url: u('ocean', 'Pleasant Beach.mp3') },
      { name: 'Wind Near Ocean',       url: u('ocean', 'Winds blowing near the ocean1.mp3') },
      { name: 'Low Tide',              url: u('ocean', 'low tide.mp3') },
    ],
  },
  river: {
    label: 'Water & Rivers',
    samples: [
      { name: 'Jungle River', url: u('river', 'Jungle River.mp3') },
      { name: 'Waterfall',    url: u('river', 'Waterfall.mp3') },
      { name: 'Small Rapid',  url: u('river', 'small rapid.mp3') },
    ],
  },
  forest: {
    label: 'Forest',
    samples: [
      { name: 'Tropical Rain Forest',         url: u('rainforest', 'A Tropical Rain Forest.mp3') },
      { name: 'S. American Rainforest',       url: u('rainforest', 'South American rain forest - waterfall in background.mp3') },
      { name: 'Tropical Rain',                url: u('rainforest', 'Tropical Rain.mp3') },
    ],
  },
  creatures: {
    label: 'Creatures',
    samples: [
      { name: 'Birds in Rain Forest',      url: u('creatures', 'Birds In A Rain Forest.mp3') },
      { name: 'Birds and Dogs',            url: u('creatures', 'Birds and Dogs.mp3') },
      { name: 'Birds · Waterfall',         url: u('creatures', 'Birds chirping and singing - waterfall in background.mp3') },
      { name: 'Blackbird & Sparrows',      url: u('creatures', 'Blackbird and Sparrows.mp3') },
      { name: 'Crickets and Water',        url: u('creatures', 'Crickets And Water.mp3') },
      { name: 'Duck and Geese',            url: u('creatures', 'Duck and Geese.mp3') },
      { name: 'Frog Chorus',               url: u('creatures', 'Frog Chorus.mp3') },
      { name: 'Swamp Frogs & Birds',       url: u('creatures', 'Frogs, birds - other swamp sounds.mp3') },
      { name: 'Many Birds · Crickets',     url: u('creatures', 'Many birds chirping - crickets or June bugs.mp3') },
      { name: 'Streamside Songbirds',      url: u('creatures', 'Streamside Songbirds.mp3') },
      { name: 'Wolves Howling (Pack)',     url: u('creatures', 'Wolves Howling and Pack Barking.MP3') },
      { name: 'Wolves Howling',            url: u('creatures', 'wolves howling.mp3') },
    ],
  },
};
