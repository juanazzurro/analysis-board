// Sonidos de jugada sintetizados (sin archivos de audio).
let ctx = null;
let enabled = true;
export function setSoundEnabled(v) { enabled = !!v; }

function ensure() {
  if (!ctx) { try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { ctx = null; } }
  return ctx;
}

function knock(t0, freq, dur, gain) {
  const c = ctx;
  const len = Math.floor(c.sampleRate * dur);
  const buf = c.createBuffer(1, len, c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 6);
  const src = c.createBufferSource(); src.buffer = buf;
  const bp = c.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = freq; bp.Q.value = 3.5;
  const g = c.createGain(); g.gain.value = gain;
  src.connect(bp); bp.connect(g); g.connect(c.destination);
  src.start(t0);
}

export function playMoveSound({ captured = false, check = false } = {}) {
  if (!enabled || !ensure()) return;
  if (ctx.state === "suspended") ctx.resume();
  const t = ctx.currentTime + 0.005;
  if (captured) { knock(t, 520, 0.09, 1.4); knock(t + 0.03, 300, 0.12, 1.0); }
  else knock(t, 820, 0.07, 1.1);
  if (check) knock(t + 0.07, 1200, 0.05, 0.5);
}
