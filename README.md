# Cosmic Music Maker

A browser-based meditation music studio. Layer binaural beats, solfeggio frequencies, synthesized rain and thunder, a nature sample library, and your own audio track. Mixes through a full master chain (3-band EQ, stereo widener, glue compressor, brickwall limiter) and exports mastered WAV files up to 60 minutes long.

Built by [Violet Media](https://violetmedia.org) — _Quality for the ages._

---

## What's in the box

### Engines

| Engine | What it does |
|---|---|
| **Track** | Drop any WAV / MP3 / FLAC / OGG file. Loops, fades in/out on render, LPF + HPF filters so your music can sit cleanly under the meditation layers. |
| **Binaural Beats** | Two hard-L/R sine oscillators with a precise frequency offset. Presets: Delta 2 Hz, Theta 6 Hz, Alpha 10 Hz, Beta 20 Hz, Gamma 40 Hz. Headphones required. |
| **Solfeggio** | All 9 healing frequencies (174 / 285 / 396 / 417 / 528 / 639 / 741 / 852 / 963 Hz). Harmonic stack modes (pure / +octave / +5th / rich). Slow breath LFO. Convolution reverb tail. |
| **Rain** | Fully synthesized — pink noise bed + Poisson-distributed droplet scheduler. Intensity scales drizzle → downpour (8 → 108 drops/sec). Shelter LPF for "indoors" feel. |
| **Thunder** | Fully synthesized — 5-layer strikes (snap / crack with crackle / sub-bass boom / rolling rumble / mid-body). Distance control for close-crack → horizon-rumble. Strikes per minute controls probabilistic firing. Manual trigger button. |
| **Nature Library** | 6 categories × up to 12 samples each — Rain, Storms & Thunder, Ocean, Water & Rivers, Forest, Creatures. Per-layer volume, pan, filters, 3-second fade-in. Samples not bundled (see setup below). |
| **Master** | 3-band EQ (low shelf / mid bell / high shelf), M/S stereo widener 0–200%, gentle glue compressor, brickwall limiter with adjustable ceiling, post-limiter gain trim. |
| **Export** | Offline render via `OfflineAudioContext` at 48 kHz / 24-bit or 44.1 kHz / 16-bit. Durations 1 min to 60 min. Custom WAV encoder. Automatic file download. |

### Visual / UX
- Full VM brand — primary `#8A2BE2` violet, Cormorant Garamond serif, Space Grotesk UI font
- Deep-space cosmic backdrop with live starfield canvas (~150 stars, 12% cyan + 22% magenta + rest white, independent twinkle phases; brighter while playing)
- Logo breathes in sync with transport
- Real-time spectrum visualizer + approximate LUFS meter

---

## Quick start

```bash
# Clone
git clone https://github.com/Schwarcz33/Cosmic-Music-Maker.git
cd Cosmic-Music-Maker

# Serve (any static server works — Python shown)
python -m http.server 3462

# Open in browser
open http://localhost:3462/
```

No build step, no npm install, no bundler. Pure Web Audio API + vanilla JavaScript.

### Repo layout

- **`index.html`** — the canonical, deployable single-file build. CSS and all JavaScript inlined, assets via `assets/`. This is what GitHub Pages serves. Edit this when polishing.
- **`css/` + `js/`** — the modular source, preserved as reference. 12 clean files separating engines, UI, master chain, and WAV encoder. Useful if you want to fork and rebuild with your own tooling.

---

## Nature sample library

The Nature Library engine loads samples from `samples/nature/<category>/<filename>.mp3`. The URL manifest is defined in:

- **`index.html`** → search for `NATURE_LIBRARY` (canonical)
- **`js/engine/nature-layer.js`** → `NATURE_LIBRARY` export (modular source reference)

Samples are **not bundled** with this repo. Either:

1. **Drop your own samples** at matching paths (e.g. `samples/nature/ocean/Gentle Ocean.mp3`), or
2. **Edit the `NATURE_LIBRARY` manifest** to point to your own filenames / categories, or
3. **Skip this engine entirely** — the synthesized Rain and Thunder engines produce excellent results without any samples.

The `samples/` folder is in `.gitignore` so your sample library stays private.

---

## Browser support

- Chrome / Edge / Opera (Chromium) — **recommended**, full feature set including WebAudio OfflineAudioContext renders up to 60 minutes
- Firefox — works, but OfflineAudioContext renders are slower
- Safari — works but WAV export may fail on very long renders (iOS memory limits)

Web Audio API + `OfflineAudioContext` + `AudioContext.decodeAudioData` are all required. All modern desktop browsers from 2020 onward support these.

---

## Project structure

```
Cosmic-Music-Maker/
├── index.html                    # Canonical deployable single-file build
├── assets/
│   └── vm-logo.jpeg              # VM brand logo
├── css/
│   └── style.css                 # Modular source reference
├── js/                           # Modular source reference (12 files)
│   ├── main.js                   # Event wiring, transport, export
│   ├── engine/
│   │   ├── audio-context.js      # Master chain + offline render
│   │   ├── binaural.js           # Dual-oscillator brainwave entrainment
│   │   ├── solfeggio.js          # 9 frequencies + harmonic stack + reverb
│   │   ├── rain.js               # Pink noise + Poisson droplets
│   │   ├── thunder.js            # 5-layer synthesized strikes
│   │   ├── track.js              # User audio file loader
│   │   ├── nature-layer.js       # URL-based sample player + library manifest
│   │   └── wav-encoder.js        # AudioBuffer → WAV blob (16 / 24-bit PCM)
│   └── ui/
│       └── visualizer.js         # Spectrum bars + LUFS approximation
├── .gitignore
└── README.md
```

Total: ~3,100 lines of hand-written JavaScript + CSS. Zero runtime dependencies.

---

## License

© Violet Media. All rights reserved. This code is shared publicly for reference and is not licensed for redistribution or commercial use outside Violet Media without written permission.

The VM nebula logo in `assets/` is a registered Violet Media brand asset — not for reuse.

---

_Built in Perth, Western Australia · violetmedia.org_
