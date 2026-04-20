// Master audio context + signal chain
// Live chain: engines → masterBus → lowShelf → midBell → highShelf → width → compressor → limiter → analyser → destination

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.masterBus = null;
    this.analyser = null;
    this.isPlaying = false;
    this.nodes = {};
    this.engines = []; // registered engines
  }

  init() {
    if (this.ctx) return;
    this.ctx = new (window.AudioContext || window.webkitAudioContext)({
      sampleRate: 48000,
      latencyHint: 'interactive',
    });
    this._buildChain(this.ctx);
  }

  _buildChain(ctx) {
    // Master bus input
    this.masterBus = ctx.createGain();
    this.masterBus.gain.value = 1.0;

    // 3-band EQ
    this.nodes.lowShelf = ctx.createBiquadFilter();
    this.nodes.lowShelf.type = 'lowshelf';
    this.nodes.lowShelf.frequency.value = 200;
    this.nodes.lowShelf.gain.value = 0;

    this.nodes.midBell = ctx.createBiquadFilter();
    this.nodes.midBell.type = 'peaking';
    this.nodes.midBell.frequency.value = 1000;
    this.nodes.midBell.Q.value = 1.0;
    this.nodes.midBell.gain.value = 0;

    this.nodes.highShelf = ctx.createBiquadFilter();
    this.nodes.highShelf.type = 'highshelf';
    this.nodes.highShelf.frequency.value = 5000;
    this.nodes.highShelf.gain.value = 0;

    // Stereo widener (simple M/S mix)
    this.nodes.widener = this._createStereoWidener(ctx);

    // Compressor (gentle glue)
    this.nodes.compressor = ctx.createDynamicsCompressor();
    this.nodes.compressor.threshold.value = -18;
    this.nodes.compressor.knee.value = 12;
    this.nodes.compressor.ratio.value = 2.5;
    this.nodes.compressor.attack.value = 0.02;
    this.nodes.compressor.release.value = 0.2;

    // Limiter (fast-attack compressor as brickwall)
    this.nodes.limiter = ctx.createDynamicsCompressor();
    this.nodes.limiter.threshold.value = -0.3;
    this.nodes.limiter.knee.value = 0;
    this.nodes.limiter.ratio.value = 20;
    this.nodes.limiter.attack.value = 0.001;
    this.nodes.limiter.release.value = 0.05;

    // Master gain (post-limiter trim)
    this.nodes.masterGain = ctx.createGain();
    this.nodes.masterGain.gain.value = 1.0;

    // Analyser for visualizer
    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 2048;
    this.analyser.smoothingTimeConstant = 0.8;

    // Wire chain
    this.masterBus
      .connect(this.nodes.lowShelf)
      .connect(this.nodes.midBell)
      .connect(this.nodes.highShelf)
      .connect(this.nodes.widener.input);
    this.nodes.widener.output
      .connect(this.nodes.compressor)
      .connect(this.nodes.limiter)
      .connect(this.nodes.masterGain)
      .connect(this.analyser)
      .connect(ctx.destination);
  }

  // Mid/Side stereo widener using ChannelSplitter/Merger
  _createStereoWidener(ctx) {
    const input = ctx.createGain();
    const output = ctx.createGain();
    const splitter = ctx.createChannelSplitter(2);
    const merger = ctx.createChannelMerger(2);

    // Create M and S gains
    const midGainL = ctx.createGain();
    const midGainR = ctx.createGain();
    const sideGainL = ctx.createGain();
    const sideGainR = ctx.createGain();
    const sideInvert = ctx.createGain();
    sideInvert.gain.value = -1;

    // M = (L+R)/2, S = (L-R)/2
    // Output L = M + S, R = M - S; widen by scaling S
    // Simpler: keep L and R, adjust side content
    input.connect(splitter);
    splitter.connect(midGainL, 0);
    splitter.connect(midGainR, 1);
    splitter.connect(sideGainL, 0);
    splitter.connect(sideInvert, 1);
    sideInvert.connect(sideGainR);

    midGainL.gain.value = 0.5;
    midGainR.gain.value = 0.5;
    sideGainL.gain.value = 0.5;
    sideGainR.gain.value = 0.5;

    // Recombine — L channel = mid + side, R channel = mid - side
    midGainL.connect(merger, 0, 0);
    sideGainL.connect(merger, 0, 0);
    midGainR.connect(merger, 0, 1);
    sideGainR.connect(merger, 0, 1);

    merger.connect(output);

    const widener = { input, output };
    widener.setWidth = (pct) => {
      // 0 = mono, 100 = normal, 200 = extra wide
      const w = pct / 100;
      sideGainL.gain.value = 0.5 * w;
      sideGainR.gain.value = 0.5 * w;
    };
    return widener;
  }

  registerEngine(engine) {
    this.engines.push(engine);
  }

  async play() {
    this.init();
    if (this.ctx.state === 'suspended') await this.ctx.resume();
    for (const engine of this.engines) {
      if (engine.enabled) await engine.start(this.ctx, this.masterBus);
    }
    this.isPlaying = true;
  }

  stop() {
    for (const engine of this.engines) engine.stop();
    this.isPlaying = false;
  }

  // Convert dB to linear gain
  static db2gain(db) {
    return Math.pow(10, db / 20);
  }

  // --- Offline render ---
  async render(durationSec, sampleRate = 48000, bitDepth = 24, onProgress = null) {
    const numChannels = 2;
    const length = Math.ceil(durationSec * sampleRate);
    const offlineCtx = new OfflineAudioContext(numChannels, length, sampleRate);

    // Build a parallel chain in the offline context
    const offlineEngine = new AudioEngine();
    offlineEngine.ctx = offlineCtx;
    offlineEngine._buildChain(offlineCtx);

    // Copy settings from live chain
    offlineEngine.nodes.lowShelf.gain.value = this.nodes.lowShelf.gain.value;
    offlineEngine.nodes.midBell.gain.value = this.nodes.midBell.gain.value;
    offlineEngine.nodes.highShelf.gain.value = this.nodes.highShelf.gain.value;
    offlineEngine.nodes.limiter.threshold.value = this.nodes.limiter.threshold.value;
    offlineEngine.nodes.masterGain.gain.value = this.nodes.masterGain.gain.value;

    // Apply widener width
    if (this.nodes.widener._currentWidth !== undefined) {
      offlineEngine.nodes.widener.setWidth(this.nodes.widener._currentWidth);
    }

    // Start each enabled engine in the offline context
    for (const engine of this.engines) {
      if (engine.enabled) {
        const offlineClone = engine.cloneForRender(durationSec);
        await offlineClone.start(offlineCtx, offlineEngine.masterBus);
      }
    }

    // Report progress via polling — rendering is faster-than-realtime, so use a rough estimate
    let poll = null;
    if (onProgress) {
      const startTime = performance.now();
      poll = setInterval(() => {
        const elapsed = (performance.now() - startTime) / 1000;
        // Offline render is typically ~8-20x faster than realtime; show monotonic approximation
        const estimate = Math.min(elapsed / (durationSec / 10), 0.95);
        onProgress(estimate);
      }, 100);
    }

    try {
      const buffer = await offlineCtx.startRendering();
      if (poll) clearInterval(poll);
      if (onProgress) onProgress(1.0);
      return buffer;
    } catch (err) {
      if (poll) clearInterval(poll);
      throw err;
    }
  }
}

export const audioEngine = new AudioEngine();
