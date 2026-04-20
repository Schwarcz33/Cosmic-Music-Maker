// Violet Media — Meditation Studio
// Entry point. Wires UI to audio engines.

import { audioEngine, AudioEngine } from './engine/audio-context.js';
import { BinauralEngine, beatBandLabel } from './engine/binaural.js';
import { SolfeggioEngine } from './engine/solfeggio.js';
import { RainEngine } from './engine/rain.js';
import { ThunderEngine } from './engine/thunder.js';
import { TrackEngine } from './engine/track.js';
import { NatureLayer, NATURE_LIBRARY } from './engine/nature-layer.js';
import { audioBufferToWav, downloadBlob, safeFilename } from './engine/wav-encoder.js';
import { Visualizer } from './ui/visualizer.js';

// --- Instantiate engines ---
// Track first so user music sits under meditation layers in the chain order
const track = new TrackEngine();
const binaural = new BinauralEngine();
const solfeggio = new SolfeggioEngine();
const rain = new RainEngine();
const thunder = new ThunderEngine();
audioEngine.registerEngine(track);
audioEngine.registerEngine(binaural);
audioEngine.registerEngine(solfeggio);
audioEngine.registerEngine(rain);
audioEngine.registerEngine(thunder);

// Nature layers — one per category
const natureLayers = {};
for (const key of Object.keys(NATURE_LIBRARY)) {
  const layer = new NatureLayer(key);
  natureLayers[key] = layer;
  audioEngine.registerEngine(layer);
}

// --- Transport ---
const btnPlay = document.getElementById('btn-play');
const btnStop = document.getElementById('btn-stop');
let visualizer = null;
let lufsInterval = null;

async function play() {
  await audioEngine.play();
  btnPlay.textContent = 'Pause';
  btnPlay.classList.add('playing');

  if (!visualizer) {
    const canvas = document.getElementById('visualizer');
    visualizer = new Visualizer(canvas, audioEngine.analyser);
  }
  visualizer.start();

  if (lufsInterval) clearInterval(lufsInterval);
  const lufsEl = document.getElementById('lufs-value');
  lufsInterval = setInterval(() => {
    const lufs = visualizer.getLufsApprox();
    lufsEl.textContent = (lufs === -Infinity || isNaN(lufs)) ? '—' : lufs.toFixed(1);
  }, 250);
}

function stop() {
  audioEngine.stop();
  btnPlay.textContent = 'Play';
  btnPlay.classList.remove('playing');
  if (visualizer) visualizer.stop();
  if (lufsInterval) { clearInterval(lufsInterval); lufsInterval = null; }
  document.getElementById('lufs-value').textContent = '—';
}

btnPlay.addEventListener('click', () => {
  if (audioEngine.isPlaying) stop(); else play();
});
btnStop.addEventListener('click', stop);

// --- Track Loader UI ---
const trackEnabled = document.getElementById('track-enabled');
const trackDropzone = document.getElementById('track-dropzone');
const trackFileInput = document.getElementById('track-file');
const trackVol = document.getElementById('track-vol');
const trackHpf = document.getElementById('track-hpf');
const trackLpf = document.getElementById('track-lpf');
const trackLoop = document.getElementById('track-loop');
const dropzoneEmpty = trackDropzone.querySelector('.dropzone-empty');
const dropzoneLoaded = trackDropzone.querySelector('.dropzone-loaded');

function fmtDuration(sec) {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

track.onLoad((info) => {
  if (!info) {
    dropzoneEmpty.classList.remove('hidden');
    dropzoneLoaded.classList.add('hidden');
    return;
  }
  document.getElementById('track-filename').textContent = info.fileName;
  document.getElementById('track-meta').textContent =
    `${fmtDuration(info.duration)} · ${info.channels === 2 ? 'Stereo' : 'Mono'}`;
  dropzoneEmpty.classList.add('hidden');
  dropzoneLoaded.classList.remove('hidden');
});

async function handleTrackFile(file) {
  if (!file || !file.type.startsWith('audio/')) {
    alert('Please drop an audio file (WAV, MP3, FLAC, OGG).');
    return;
  }
  document.getElementById('track-filename').textContent = 'Loading…';
  document.getElementById('track-meta').textContent = '';
  dropzoneEmpty.classList.add('hidden');
  dropzoneLoaded.classList.remove('hidden');
  try {
    await track.loadFile(file);
    trackEnabled.checked = true;
    track.enabled = true;
    if (audioEngine.isPlaying) await track.start(audioEngine.ctx, audioEngine.masterBus);
  } catch (err) {
    alert(`Failed to load: ${err.message}`);
    track.clear();
  }
}

trackDropzone.addEventListener('click', (e) => {
  if (e.target.closest('.dropzone-loaded')) return; // don't open picker if interacting with loaded info
  trackFileInput.click();
});

trackFileInput.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (file) handleTrackFile(file);
  trackFileInput.value = ''; // reset for re-upload same file
});

trackDropzone.addEventListener('dragover', (e) => {
  e.preventDefault();
  trackDropzone.classList.add('dragover');
});
trackDropzone.addEventListener('dragleave', () => {
  trackDropzone.classList.remove('dragover');
});
trackDropzone.addEventListener('drop', (e) => {
  e.preventDefault();
  trackDropzone.classList.remove('dragover');
  const file = e.dataTransfer.files[0];
  if (file) handleTrackFile(file);
});

document.getElementById('btn-track-clear').addEventListener('click', (e) => {
  e.stopPropagation();
  track.clear();
  trackEnabled.checked = false;
  track.enabled = false;
});

trackEnabled.addEventListener('change', async (e) => {
  track.enabled = e.target.checked;
  if (audioEngine.isPlaying) {
    if (track.enabled) await track.start(audioEngine.ctx, audioEngine.masterBus);
    else track.stop();
  }
});

trackVol.addEventListener('input', (e) => {
  const db = Number(e.target.value);
  track.setVolume(db);
  document.getElementById('track-vol-val').textContent = `${db >= 0 ? '+' : ''}${db} dB`;
});

trackHpf.addEventListener('input', (e) => {
  const hz = Number(e.target.value);
  track.setHpf(hz);
  document.getElementById('track-hpf-val').textContent = hz < 1000 ? `${hz} Hz` : `${(hz / 1000).toFixed(1)} kHz`;
});

trackLpf.addEventListener('input', (e) => {
  const hz = Number(e.target.value);
  track.setLpf(hz);
  document.getElementById('track-lpf-val').textContent = hz < 1000 ? `${hz} Hz` : `${(hz / 1000).toFixed(1)} kHz`;
});

trackLoop.addEventListener('change', (e) => {
  track.setLoop(e.target.checked);
});

// Progress bar while track is playing
setInterval(() => {
  if (track.nodes && track.decodedBuffer) {
    if (track._startTime === undefined) track._startTime = track.nodes.ctx.currentTime;
    const elapsed = track.nodes.ctx.currentTime - track._startTime;
    const pos = track.loop ? (elapsed % track.duration) / track.duration : Math.min(elapsed / track.duration, 1);
    const fill = document.getElementById('track-progress-fill');
    if (fill) fill.style.width = `${(pos * 100).toFixed(1)}%`;
  } else {
    // reset
    track._startTime = undefined;
    const fill = document.getElementById('track-progress-fill');
    if (fill) fill.style.width = '0%';
  }
}, 100);

// --- Binaural UI ---
const binEnabled = document.getElementById('binaural-enabled');
const binCarrier = document.getElementById('bin-carrier');
const binBeat = document.getElementById('bin-beat');
const binVol = document.getElementById('bin-vol');

binEnabled.addEventListener('change', (e) => {
  binaural.enabled = e.target.checked;
  if (audioEngine.isPlaying) {
    if (binaural.enabled) binaural.start(audioEngine.ctx, audioEngine.masterBus);
    else binaural.stop();
  }
});

binCarrier.addEventListener('input', (e) => {
  const hz = Number(e.target.value);
  binaural.setCarrier(hz);
  document.getElementById('bin-carrier-val').textContent = `${hz} Hz`;
});

binBeat.addEventListener('input', (e) => {
  const hz = Number(e.target.value);
  binaural.setBeat(hz);
  document.getElementById('bin-beat-val').textContent = beatBandLabel(hz);
});

binVol.addEventListener('input', (e) => {
  const db = Number(e.target.value);
  binaural.setVolume(db);
  document.getElementById('bin-vol-val').textContent = `${db >= 0 ? '+' : ''}${db} dB`;
});

document.querySelectorAll('.preset-btn[data-beat]').forEach((btn) => {
  btn.addEventListener('click', () => {
    const hz = Number(btn.dataset.beat);
    binBeat.value = hz;
    binaural.setBeat(hz);
    document.getElementById('bin-beat-val').textContent = beatBandLabel(hz);
  });
});

// --- Solfeggio UI ---
const solfEnabled = document.getElementById('solf-enabled');
const solfFreq = document.getElementById('solf-freq');
const solfHarm = document.getElementById('solf-harmonics');
const solfLfo = document.getElementById('solf-lfo');
const solfRev = document.getElementById('solf-rev');
const solfVol = document.getElementById('solf-vol');

solfEnabled.addEventListener('change', (e) => {
  solfeggio.enabled = e.target.checked;
  if (audioEngine.isPlaying) {
    if (solfeggio.enabled) solfeggio.start(audioEngine.ctx, audioEngine.masterBus);
    else solfeggio.stop();
  }
});

solfFreq.addEventListener('change', (e) => {
  solfeggio.setFrequency(Number(e.target.value));
});

solfHarm.addEventListener('change', (e) => {
  solfeggio.setHarmonics(e.target.value);
});

solfLfo.addEventListener('input', (e) => {
  const hz = Number(e.target.value);
  solfeggio.setLfoRate(hz);
  document.getElementById('solf-lfo-val').textContent = `${hz.toFixed(2)} Hz`;
});

solfRev.addEventListener('input', (e) => {
  const pct = Number(e.target.value);
  solfeggio.setReverbMix(pct / 100);
  document.getElementById('solf-rev-val').textContent = `${pct}%`;
});

solfVol.addEventListener('input', (e) => {
  const db = Number(e.target.value);
  solfeggio.setVolume(db);
  document.getElementById('solf-vol-val').textContent = `${db >= 0 ? '+' : ''}${db} dB`;
});

// --- Rain UI ---
const rainEnabled = document.getElementById('rain-enabled');
const rainInt = document.getElementById('rain-int');
const rainShelter = document.getElementById('rain-shelter');
const rainVol = document.getElementById('rain-vol');

rainEnabled.addEventListener('change', (e) => {
  rain.enabled = e.target.checked;
  if (audioEngine.isPlaying) {
    if (rain.enabled) rain.start(audioEngine.ctx, audioEngine.masterBus);
    else rain.stop();
  }
});

function rainIntLabel(v) {
  if (v < 20) return 'Drizzle';
  if (v < 50) return 'Light';
  if (v < 75) return 'Steady';
  return 'Downpour';
}

function rainShelterLabel(v) {
  if (v < 10) return 'Open';
  if (v < 40) return 'Under roof';
  if (v < 70) return 'Porch';
  return 'Indoors';
}

rainInt.addEventListener('input', (e) => {
  const v = Number(e.target.value);
  rain.setIntensity(v / 100);
  document.getElementById('rain-int-val').textContent = rainIntLabel(v);
});

rainShelter.addEventListener('input', (e) => {
  const v = Number(e.target.value);
  rain.setShelter(v / 100);
  document.getElementById('rain-shelter-val').textContent = rainShelterLabel(v);
});

rainVol.addEventListener('input', (e) => {
  const db = Number(e.target.value);
  rain.setVolume(db);
  document.getElementById('rain-vol-val').textContent = `${db >= 0 ? '+' : ''}${db} dB`;
});

document.querySelectorAll('.preset-btn[data-rain-int]').forEach((btn) => {
  btn.addEventListener('click', () => {
    const intVal = Number(btn.dataset.rainInt);
    const shVal = Number(btn.dataset.rainShelter);
    rainInt.value = intVal;
    rainShelter.value = shVal;
    rain.setIntensity(intVal / 100);
    rain.setShelter(shVal / 100);
    document.getElementById('rain-int-val').textContent = rainIntLabel(intVal);
    document.getElementById('rain-shelter-val').textContent = rainShelterLabel(shVal);
  });
});

// --- Thunder UI ---
const thunderEnabled = document.getElementById('thunder-enabled');
const thunderInt = document.getElementById('thunder-int');
const thunderDist = document.getElementById('thunder-dist');
const thunderFreq = document.getElementById('thunder-freq');
const thunderVol = document.getElementById('thunder-vol');

thunderEnabled.addEventListener('change', (e) => {
  thunder.enabled = e.target.checked;
  if (audioEngine.isPlaying) {
    if (thunder.enabled) thunder.start(audioEngine.ctx, audioEngine.masterBus);
    else thunder.stop();
  }
});

thunderInt.addEventListener('input', (e) => {
  const v = Number(e.target.value);
  thunder.setIntensity(v / 100);
  document.getElementById('thunder-int-val').textContent = `${v}%`;
});

function distLabel(v) {
  if (v < 20) return 'Close';
  if (v < 50) return 'Mid';
  if (v < 80) return 'Far';
  return 'Horizon';
}

thunderDist.addEventListener('input', (e) => {
  const v = Number(e.target.value);
  thunder.setDistance(v / 100);
  document.getElementById('thunder-dist-val').textContent = distLabel(v);
});

thunderFreq.addEventListener('input', (e) => {
  const v = Number(e.target.value);
  thunder.setFrequency(v);
  document.getElementById('thunder-freq-val').textContent = v.toFixed(1);
});

thunderVol.addEventListener('input', (e) => {
  const db = Number(e.target.value);
  thunder.setVolume(db);
  document.getElementById('thunder-vol-val').textContent = `${db >= 0 ? '+' : ''}${db} dB`;
});

document.getElementById('btn-thunder-trigger').addEventListener('click', async () => {
  if (!audioEngine.isPlaying) {
    await audioEngine.play();
    btnPlay.textContent = 'Pause';
    btnPlay.classList.add('playing');
  }
  if (!thunder.nodes) thunder.start(audioEngine.ctx, audioEngine.masterBus);
  thunder.triggerNow();
});

document.querySelectorAll('.preset-btn[data-thunder-dist]').forEach((btn) => {
  btn.addEventListener('click', () => {
    const distVal = Number(btn.dataset.thunderDist);
    const freqVal = Number(btn.dataset.thunderFreq);
    thunderDist.value = distVal;
    thunderFreq.value = freqVal;
    thunder.setDistance(distVal / 100);
    thunder.setFrequency(freqVal);
    document.getElementById('thunder-dist-val').textContent = distLabel(distVal);
    document.getElementById('thunder-freq-val').textContent = freqVal.toFixed(1);
  });
});

// --- Master UI ---
function wireMaster(nodeKey, sliderId, valueId, unit = 'dB', target = 'gain') {
  const slider = document.getElementById(sliderId);
  const valEl = document.getElementById(valueId);
  slider.addEventListener('input', (e) => {
    const v = Number(e.target.value);
    audioEngine.init(); // ensure chain exists for live tweaks before play
    const node = audioEngine.nodes[nodeKey];
    if (target === 'gain') node.gain.value = v;
    else if (target === 'threshold') node.threshold.value = v;
    valEl.textContent = `${v >= 0 && unit === 'dB' ? '+' : ''}${v} ${unit}`;
  });
}

wireMaster('lowShelf', 'eq-low', 'eq-low-val');
wireMaster('midBell', 'eq-mid', 'eq-mid-val');
wireMaster('highShelf', 'eq-high', 'eq-high-val');
wireMaster('limiter', 'master-ceil', 'master-ceil-val', 'dB', 'threshold');

// Width
document.getElementById('master-width').addEventListener('input', (e) => {
  const pct = Number(e.target.value);
  audioEngine.init();
  audioEngine.nodes.widener.setWidth(pct);
  audioEngine.nodes.widener._currentWidth = pct;
  document.getElementById('master-width-val').textContent = `${pct}%`;
});

// Master gain — convert dB → linear
document.getElementById('master-gain').addEventListener('input', (e) => {
  const db = Number(e.target.value);
  audioEngine.init();
  audioEngine.nodes.masterGain.gain.setTargetAtTime(
    AudioEngine.db2gain(db),
    audioEngine.ctx.currentTime,
    0.05
  );
  document.getElementById('master-gain-val').textContent = `${db >= 0 ? '+' : ''}${db} dB`;
});

// --- Export ---
const btnRender = document.getElementById('btn-render');
btnRender.addEventListener('click', async () => {
  const duration = Number(document.getElementById('export-duration').value);
  const format = document.getElementById('export-format').value;
  const title = document.getElementById('export-title').value.trim() || 'Violet_Media_Meditation';
  const [sr, depth] = format.split('-').map(Number);

  const anyEngineOn = audioEngine.engines.some((e) => e.enabled);
  if (!anyEngineOn) {
    alert('Enable at least one engine before rendering.');
    return;
  }

  audioEngine.init(); // ensure chain for settings copy
  const progressEl = document.getElementById('render-progress');
  const progressFill = progressEl.querySelector('.progress-fill');
  const progressLabel = progressEl.querySelector('.progress-label');
  progressEl.classList.remove('hidden');
  progressFill.style.width = '0%';
  progressLabel.textContent = 'Rendering…';
  btnRender.disabled = true;

  try {
    const buffer = await audioEngine.render(duration, sr, depth, (p) => {
      progressFill.style.width = `${(p * 100).toFixed(1)}%`;
    });
    progressLabel.textContent = 'Encoding WAV…';
    const blob = audioBufferToWav(buffer, depth);
    const filename = `${safeFilename(title)}_${Math.round(duration / 60)}min_${sr / 1000}kHz_${depth}bit.wav`;
    downloadBlob(blob, filename);
    progressLabel.textContent = `Rendered: ${filename}`;
    progressFill.style.width = '100%';
  } catch (err) {
    console.error(err);
    progressLabel.textContent = `Error: ${err.message}`;
  } finally {
    btnRender.disabled = false;
    setTimeout(() => {
      progressEl.classList.add('hidden');
      progressFill.style.width = '0%';
    }, 6000);
  }
});

// --- Nature Library UI (build dynamically) ---
const natureBody = document.getElementById('nature-body');

for (const [key, cat] of Object.entries(NATURE_LIBRARY)) {
  const layer = natureLayers[key];
  const card = document.createElement('div');
  card.className = 'nature-layer';
  card.dataset.category = key;

  card.innerHTML = `
    <div class="nature-layer-head">
      <span class="nature-layer-label">${cat.label}</span>
      <label class="engine-toggle">
        <input type="checkbox" class="nl-enabled">
        <span class="toggle-track"></span>
      </label>
    </div>
    <select class="nature-layer-select nl-select">
      <option value="">— Choose sample —</option>
      ${cat.samples.map((s, i) => `<option value="${i}">${s.name}</option>`).join('')}
    </select>
    <div class="nature-layer-row">
      <label>Vol <span class="val nl-vol-val">−14</span></label>
      <input type="range" class="nl-vol" min="-60" max="0" value="-14" step="0.5">
    </div>
    <div class="nature-layer-row">
      <label>Pan <span class="val nl-pan-val">C</span></label>
      <input type="range" class="nl-pan" min="-100" max="100" value="0" step="1">
    </div>
  `;

  const cbEnabled = card.querySelector('.nl-enabled');
  const sel = card.querySelector('.nl-select');
  const volSlider = card.querySelector('.nl-vol');
  const volVal = card.querySelector('.nl-vol-val');
  const panSlider = card.querySelector('.nl-pan');
  const panVal = card.querySelector('.nl-pan-val');

  cbEnabled.addEventListener('change', async (e) => {
    layer.enabled = e.target.checked;
    card.classList.toggle('active', layer.enabled);
    if (audioEngine.isPlaying) {
      if (layer.enabled && layer.url) await layer.start(audioEngine.ctx, audioEngine.masterBus);
      else layer.stop();
    }
  });

  sel.addEventListener('change', (e) => {
    const idx = e.target.value;
    if (idx === '') {
      layer.setSample(null, '');
    } else {
      const s = cat.samples[Number(idx)];
      layer.setSample(s.url, s.name);
    }
  });

  volSlider.addEventListener('input', (e) => {
    const db = Number(e.target.value);
    layer.setVolume(db);
    volVal.textContent = `${db}`;
  });

  panSlider.addEventListener('input', (e) => {
    const v = Number(e.target.value) / 100;
    layer.setPan(v);
    const label = Math.abs(v) < 0.05 ? 'C' : (v < 0 ? `L${Math.round(-v * 100)}` : `R${Math.round(v * 100)}`);
    panVal.textContent = label;
  });

  natureBody.appendChild(card);
}

// Ensure context resumes on any first interaction (browser autoplay policy)
document.addEventListener('click', () => {
  if (audioEngine.ctx && audioEngine.ctx.state === 'suspended') {
    audioEngine.ctx.resume();
  }
}, { once: true });

console.log('%cViolet Media — Meditation Studio', 'color: #8A2BE2; font-weight: bold; font-size: 14px');
console.log('Phase 1: Binaural + Solfeggio + Master + Export');
