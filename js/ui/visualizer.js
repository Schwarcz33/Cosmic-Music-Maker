// Spectrum + level visualizer — reads from AnalyserNode, draws on canvas

export class Visualizer {
  constructor(canvas, analyser) {
    this.canvas = canvas;
    this.ctx2d = canvas.getContext('2d');
    this.analyser = analyser;
    this.freqData = new Uint8Array(analyser.frequencyBinCount);
    this.timeData = new Uint8Array(analyser.fftSize);
    this.running = false;
    this._resize();
  }

  _resize() {
    const dpr = window.devicePixelRatio || 1;
    const rect = this.canvas.getBoundingClientRect();
    this.canvas.width = rect.width * dpr;
    this.canvas.height = rect.height * dpr;
    this.ctx2d.scale(dpr, dpr);
  }

  start() {
    this.running = true;
    this._loop();
  }

  stop() {
    this.running = false;
  }

  _loop() {
    if (!this.running) {
      this._clear();
      return;
    }
    this.analyser.getByteFrequencyData(this.freqData);
    this._draw();
    requestAnimationFrame(() => this._loop());
  }

  _clear() {
    const w = this.canvas.width / (window.devicePixelRatio || 1);
    const h = this.canvas.height / (window.devicePixelRatio || 1);
    this.ctx2d.fillStyle = '#0a0612';
    this.ctx2d.fillRect(0, 0, w, h);
  }

  _draw() {
    const dpr = window.devicePixelRatio || 1;
    const w = this.canvas.width / dpr;
    const h = this.canvas.height / dpr;

    // Background
    this.ctx2d.fillStyle = '#0a0612';
    this.ctx2d.fillRect(0, 0, w, h);

    // Log-spaced frequency bars
    const bins = this.freqData.length;
    const barCount = 48;
    const barWidth = w / barCount;

    for (let i = 0; i < barCount; i++) {
      // Log-spaced bin selection — weight toward lower frequencies
      const t = i / barCount;
      const binIdx = Math.floor(Math.pow(t, 2) * bins * 0.6);
      const v = this.freqData[binIdx] / 255;
      const barHeight = v * h;

      // Violet gradient
      const grad = this.ctx2d.createLinearGradient(0, h - barHeight, 0, h);
      grad.addColorStop(0, '#c58af0');
      grad.addColorStop(1, '#5a1c94');
      this.ctx2d.fillStyle = grad;
      this.ctx2d.fillRect(i * barWidth + 1, h - barHeight, barWidth - 2, barHeight);
    }
  }

  // Rough LUFS approximation — integrates mean square over a 400ms window
  getLufsApprox() {
    this.analyser.getByteTimeDomainData(this.timeData);
    let sum = 0;
    for (let i = 0; i < this.timeData.length; i++) {
      const s = (this.timeData[i] - 128) / 128;
      sum += s * s;
    }
    const rms = Math.sqrt(sum / this.timeData.length);
    if (rms < 1e-5) return -Infinity;
    // LUFS is not exact here (no K-weighting), but useful mix reference
    return 20 * Math.log10(rms) - 0.691;
  }
}
