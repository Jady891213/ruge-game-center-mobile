/* Pitch direction is relative to a comfortable hum; loudness never sets direction. */
(function (root) {
  'use strict';
  const CALIBRATION_SECONDS = .85;
  const median = a => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
  function create() {
    let baseline = 0, elapsed = 0, samples = [], band = 'silent', candidate = 'middle', held = 0;
    let last = {ready: false, progress: 0, baseline: 0, band: 'silent', intent: 0, voiced: false, semitones: 0, level: 0};
    function reset() { baseline = elapsed = held = 0; samples = []; band = 'silent'; candidate = 'middle'; last = {ready: false, progress: 0, baseline: 0, band: 'silent', intent: 0, voiced: false, semitones: 0, level: 0}; return {...last}; }
    function update(sample = {}, dt = 0) {
      if (!sample || typeof sample !== 'object') sample = {};
      const validTime = Number.isFinite(dt) && dt > 0 && dt <= .25;
      const foreground = !(root.document && root.document.hidden);
      const voiced = !!(validTime && foreground && sample.status === 'listening' &&
        (!sample.mode || sample.mode === 'pitch') &&
        Number.isFinite(sample.ageMs) && sample.ageMs >= 0 && sample.ageMs <= 350 &&
        Number.isFinite(sample.pitch) && sample.pitch >= 75 && sample.pitch <= 900 &&
        Number.isFinite(sample.confidence) && sample.confidence >= .8 && Number.isFinite(sample.rms) && sample.rms >= .006);
      const level = voiced ? Math.min(1, Math.max(0, (sample.rms - .006) / .045)) : 0;
      if (!voiced) {
        band = 'silent'; candidate = 'middle'; held = 0;
        if (!baseline) { elapsed = 0; samples = []; }
      } else if (!baseline) {
        // Require one stable, contiguous hum, not scattered noise or a stale sample.
        const center = samples.length ? median(samples) : sample.pitch;
        if (Math.abs(12 * Math.log2(sample.pitch / center)) > 2.5) { samples = []; elapsed = 0; }
        samples.push(sample.pitch);
        elapsed += dt;
        band = 'middle';
        if (elapsed >= CALIBRATION_SECONDS && samples.length >= 8) baseline = median(samples);
      } else {
        const semitones = 12 * Math.log2(sample.pitch / baseline);
        const next = semitones >= (band === 'high' ? 1.2 : 2.0) ? 'high' :
          semitones <= (band === 'low' ? -1.2 : -2.0) ? 'low' : 'middle';
        if (next !== candidate) { candidate = next; held = 0; }
        held += dt;
        // 65 ms eliminates single-frame spikes without making a sustained note an edge trigger.
        if (held >= .065) band = candidate;
      }
      const semitones = voiced && baseline ? 12 * Math.log2(sample.pitch / baseline) : 0;
      last = {ready: !!baseline, progress: baseline ? 1 : Math.min(1, elapsed / CALIBRATION_SECONDS),
        baseline, band, intent: !voiced || !baseline ? 0 : band === 'high' ? -1 : band === 'low' ? 1 : 0,
        voiced, semitones, level};
      return {...last};
    }
    return {update, reset, snapshot: () => ({...last})};
  }
  root.PitchFlightInput = Object.freeze({create, CALIBRATION_SECONDS});
})(typeof window === 'undefined' ? globalThis : window);
