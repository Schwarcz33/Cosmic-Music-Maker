// Track engine — loads a user-provided audio file (Suno, voice, any stem)
// Decoded once, replayable. Supports loop, volume, LPF/HPF, fade in/out.
// Renders inside OfflineAudioContext by decoding the raw ArrayBuffer into the offline ctx.

import { AudioEngine } from './audio-context.js';

export class TrackEngine {
  constructor() {
    this.enabled = false;
    this.volumeDb = -6;
    this.loop = true;
    this.loopCrossfade = 2.0;    // seconds crossfade on loop boundary
    this.lpfHz = 22000;
    this.hpfHz = 20;
    this.fadeInSec = 2;
    this.fadeOutSec = 3;

    this.rawArrayBuffer = null;
    this.decodedBuffer = null;
    this.fileName = '';
    this.duration = 0;

    this.nodes = null;
    this._renderDuration = null;
    this._onLoad = null;        // callback for UI (filename, duration)
  }

  onLoad(cb) { this._onLoad = cb; }

  setVolume(db) {
    this.volumeDb = db;
    if (this.nodes) this.nodes.gain.gain.setTargetAtTime(AudioEngine.db2gain(db), this.nodes.ctx.currentTime, 0.1);
  }

  setLoop(v) { this.loop = v; if (this.nodes && this.nodes.src) this.nodes.src.loop = v; }

  setLpf(hz) {
    this.lpfHz = hz;
    if (this.nodes) this.nodes.lpf.frequency.setTargetAtTime(hz, this.nodes.ctx.currentTime, 0.1);
  }

  setHpf(hz) {
    this.hpfHz = hz;
    if (this.nodes) this.nodes.hpf.frequency.setTargetAtTime(hz, this.nodes.ctx.currentTime, 0.1);
  }

  async loadFile(file) {
    this.fileName = file.name;
    const arrayBuffer = await file.arrayBuffer();
    this.rawArrayBuffer = arrayBuffer;
    // Decode using a temporary context (detached from live chain, just for metadata)
    const tempCtx = new (window.AudioContext || window.webkitAudioContext)();
    try {
      // Clone because decodeAudioData consumes the buffer
      const decoded = await tempCtx.decodeAudioData(arrayBuffer.slice(0));
      this.decodedBuffer = decoded;
      this.duration = decoded.duration;
    } finally {
      await tempCtx.close();
    }
    if (this._onLoad) this._onLoad({ fileName: this.fileName, duration: this.duration, channels: this.decodedBuffer.numberOfChannels });
  }

  clear() {
    this.stop();
    this.rawArrayBuffer = null;
    this.decodedBuffer = null;
    this.fileName = '';
    this.duration = 0;
    if (this._onLoad) this._onLoad(null);
  }

  async _decodeForContext(ctx) {
    if (!this.rawArrayBuffer) return null;
    // Decode fresh into this specific context (required for OfflineAudioContext)
    return await ctx.decodeAudioData(this.rawArrayBuffer.slice(0));
  }

  async start(ctx, destination) {
    if (!this.rawArrayBuffer) return;
    if (this.nodes) this.stop();

    // Decode into this context (works for both live and offline)
    const buffer = await this._decodeForContext(ctx);

    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = this.loop;

    // Filters — HPF then LPF in series (so Peter can "EQ out" music under meditation)
    const hpf = ctx.createBiquadFilter();
    hpf.type = 'highpass';
    hpf.frequency.value = this.hpfHz;
    hpf.Q.value = 0.707;

    const lpf = ctx.createBiquadFilter();
    lpf.type = 'lowpass';
    lpf.frequency.value = this.lpfHz;
    lpf.Q.value = 0.707;

    // Engine gain with fade-in / fade-out
    const gain = ctx.createGain();
    gain.gain.value = 0;

    src.connect(hpf).connect(lpf).connect(gain).connect(destination);

    // Fade in
    const target = AudioEngine.db2gain(this.volumeDb);
    const startT = ctx.currentTime;
    gain.gain.setValueAtTime(0, startT);
    gain.gain.linearRampToValueAtTime(target, startT + this.fadeInSec);

    // Fade out (only in render mode — we know the end)
    if (this._renderDuration !== null) {
      const fadeStart = Math.max(0, this._renderDuration - this.fadeOutSec);
      gain.gain.setValueAtTime(target, fadeStart);
      gain.gain.linearRampToValueAtTime(0, this._renderDuration);
    }

    src.start(0);
    this.nodes = { ctx, src, hpf, lpf, gain };
  }

  stop() {
    if (!this.nodes) return;
    const { ctx, src, gain } = this.nodes;
    gain.gain.cancelScheduledValues(ctx.currentTime);
    gain.gain.setValueAtTime(gain.gain.value, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.2);
    try { src.stop(ctx.currentTime + 0.22); } catch (e) {}
    this.nodes = null;
  }

  // Read current playback position (live mode only) for progress bar
  getPlaybackPosition() {
    if (!this.nodes || !this.decodedBuffer) return 0;
    // AudioBufferSourceNode doesn't expose position; estimate via ctx time offset
    if (this._startTime === undefined) {
      this._startTime = this.nodes.ctx.currentTime;
    }
    const elapsed = this.nodes.ctx.currentTime - this._startTime;
    if (!this.loop) return Math.min(elapsed / this.duration, 1);
    return (elapsed % this.duration) / this.duration;
  }

  cloneForRender(durationSec) {
    const clone = new TrackEngine();
    clone.enabled = true;
    clone.volumeDb = this.volumeDb;
    clone.loop = this.loop;
    clone.lpfHz = this.lpfHz;
    clone.hpfHz = this.hpfHz;
    clone.fadeInSec = this.fadeInSec;
    clone.fadeOutSec = this.fadeOutSec;
    clone.rawArrayBuffer = this.rawArrayBuffer;  // shared reference OK — we slice() on decode
    clone.decodedBuffer = null;  // will redecode in offline ctx
    clone.duration = this.duration;
    clone._renderDuration = durationSec;
    return clone;
  }
}
