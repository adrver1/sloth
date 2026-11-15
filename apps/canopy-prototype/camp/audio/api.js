// The sound's API for the radios and the checks, the same in both levels (Adriaen 2026-11-15: the summit uses the camp's radio):
// makeAudio(keep) returns { stations, start, volume, muted, music, musicVolume, station, next, tune, musicFrom, running,
// playing, stationIndex, state, play, levels, _bus }, where keep() is the level's own "store the settings" (camp/audio.js adds
// onChange to the camp's). running(), playing() and stationIndex() are cheap reads for every frame that make no objects
// (review R2-085). The work is in context.js (the settings and the graph), sfx.js and music.js.
import * as THREE from "three";
import { STATIONS, ac, applyGain, bus, comp, own, set, start } from "./context.js";
import { SFX } from "./sfx.js";
import { mus, musicFrom } from "./music.js";

export function makeAudio(keep) {
  const clamp = (v) => THREE.MathUtils.clamp(+v, 0, 1);
  const audio = {
    stations: STATIONS,
    start,
    volume(v) { if (v !== undefined) { set.volume = clamp(v); applyGain(); keep(); } return set.volume; },
    muted(m) { if (m !== undefined) { own("muted"); set.muted = !!m; applyGain(); keep(); } return set.muted; },
    music(on) { if (on !== undefined) { set.music = !!on; if (on) mus.st = null; applyGain(); keep(); } return set.music; },
    musicVolume(v) { if (v !== undefined) { set.musicVolume = clamp(v); applyGain(); keep(); } return set.musicVolume; },
    station(s) {
      if (s !== undefined) {
        const st = typeof s === "number" ? STATIONS[((s % STATIONS.length) + STATIONS.length) % STATIONS.length] : STATIONS.find((x) => x.id === s);
        if (st) { own("station"); set.station = st.id; mus.st = null; if (ac) mus.next = ac.currentTime + 0.6; keep(); }
      }
      return STATIONS.find((x) => x.id === set.station);
    },
    next() { const i = audio.stationIndex(); audio.tune(); return audio.station(i + 1); },
    tune() { if (ac?.state === "running") SFX.tune(); },
    musicFrom,
    running: () => ac?.state === "running",
    playing: () => set.music && !set.muted,
    stationIndex() { for (let i = 0; i < STATIONS.length; i++) if (STATIONS[i].id === set.station) return i; return 0; },
    state: () => ({ ctx: ac?.state ?? "none", started: !!ac && ac.state === "running", volume: set.volume, muted: set.muted, music: set.music, musicVolume: set.musicVolume, station: set.station }),
    play(name, pos) { if (ac?.state === "running" && SFX[name]) SFX[name](pos || null); },   // any sound by name, for other modules and checks
    levels() {   // checks: the loudness of the mix now, in dBFS, over 0.2 s
      if (!ac) return null; if (!audio._an) { audio._an = ac.createAnalyser(); audio._an.fftSize = 8192; comp.connect(audio._an); }
      const a = new Float32Array(audio._an.fftSize); audio._an.getFloatTimeDomainData(a); let s = 0, pk = 0; for (const x of a) { s += x * x; pk = Math.max(pk, Math.abs(x)); }
      return { rms: +(10 * Math.log10(s / a.length + 1e-12)).toFixed(1), peak: +(20 * Math.log10(pk + 1e-9)).toFixed(1) };
    },
    _bus: () => bus,
  };
  return audio;
}
