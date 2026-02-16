const MAX_VOLUME = 0.4;

let audioCtx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  if (!audioCtx) {
    try {
      audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    } catch {
      return null;
    }
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {});
  }
  return audioCtx;
}

function getSoundEnabled(): boolean {
  try {
    const raw = localStorage.getItem('sc_sound_effects');
    if (raw === null) return true;
    return raw === 'true';
  } catch {
    return true;
  }
}

function shouldPlay(): boolean {
  if (typeof window === 'undefined') return false;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return false;
  return getSoundEnabled();
}

export function playCinematicHum(durationSec = 1.4): { stop: () => void } {
  const noop = { stop: () => {} };
  if (!shouldPlay()) return noop;
  const ctx = getCtx();
  if (!ctx) return noop;

  const now = ctx.currentTime;
  const vol = MAX_VOLUME * 0.35;

  const osc1 = ctx.createOscillator();
  const g1 = ctx.createGain();
  osc1.type = 'sine';
  osc1.frequency.setValueAtTime(55, now);
  osc1.frequency.exponentialRampToValueAtTime(80, now + durationSec);
  g1.gain.setValueAtTime(0, now);
  g1.gain.linearRampToValueAtTime(vol, now + 0.3);
  g1.gain.setValueAtTime(vol, now + durationSec - 0.2);
  g1.gain.linearRampToValueAtTime(vol * 0.6, now + durationSec);
  osc1.connect(g1).connect(ctx.destination);
  osc1.start(now);
  osc1.stop(now + durationSec + 0.1);

  const osc2 = ctx.createOscillator();
  const g2 = ctx.createGain();
  osc2.type = 'triangle';
  osc2.frequency.setValueAtTime(110, now);
  osc2.frequency.exponentialRampToValueAtTime(165, now + durationSec);
  g2.gain.setValueAtTime(0, now);
  g2.gain.linearRampToValueAtTime(vol * 0.25, now + 0.5);
  g2.gain.setValueAtTime(vol * 0.25, now + durationSec - 0.2);
  g2.gain.linearRampToValueAtTime(0, now + durationSec);
  osc2.connect(g2).connect(ctx.destination);
  osc2.start(now);
  osc2.stop(now + durationSec + 0.1);

  const bufLen = Math.floor(ctx.sampleRate * durationSec);
  const noiseBuffer = ctx.createBuffer(1, bufLen, ctx.sampleRate);
  const data = noiseBuffer.getChannelData(0);
  for (let i = 0; i < bufLen; i++) {
    data[i] = (Math.random() * 2 - 1) * 0.02;
  }
  const noiseSrc = ctx.createBufferSource();
  noiseSrc.buffer = noiseBuffer;
  const lpf = ctx.createBiquadFilter();
  lpf.type = 'lowpass';
  lpf.frequency.value = 200;
  const ng = ctx.createGain();
  ng.gain.setValueAtTime(0, now);
  ng.gain.linearRampToValueAtTime(vol * 0.4, now + 0.5);
  ng.gain.setValueAtTime(vol * 0.4, now + durationSec - 0.3);
  ng.gain.linearRampToValueAtTime(0, now + durationSec);
  noiseSrc.connect(lpf).connect(ng).connect(ctx.destination);
  noiseSrc.start(now);
  noiseSrc.stop(now + durationSec + 0.1);

  let stopped = false;
  return {
    stop: () => {
      if (stopped) return;
      stopped = true;
      try { osc1.stop(); osc2.stop(); noiseSrc.stop(); } catch {}
    }
  };
}

export function playRisingTone(durationSec = 2.0): { stop: () => void } {
  const noop = { stop: () => {} };
  if (!shouldPlay()) return noop;
  const ctx = getCtx();
  if (!ctx) return noop;

  const now = ctx.currentTime;
  const vol = MAX_VOLUME * 0.3;

  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(120, now);
  osc.frequency.exponentialRampToValueAtTime(440, now + durationSec);
  g.gain.setValueAtTime(0, now);
  g.gain.linearRampToValueAtTime(vol * 0.4, now + 0.2);
  g.gain.linearRampToValueAtTime(vol, now + durationSec * 0.8);
  g.gain.linearRampToValueAtTime(vol * 0.5, now + durationSec);
  osc.connect(g).connect(ctx.destination);
  osc.start(now);
  osc.stop(now + durationSec + 0.1);

  const sub = ctx.createOscillator();
  const sg = ctx.createGain();
  sub.type = 'sine';
  sub.frequency.setValueAtTime(60, now);
  sub.frequency.exponentialRampToValueAtTime(220, now + durationSec);
  sg.gain.setValueAtTime(0, now);
  sg.gain.linearRampToValueAtTime(vol * 0.2, now + 0.3);
  sg.gain.linearRampToValueAtTime(vol * 0.15, now + durationSec);
  sub.connect(sg).connect(ctx.destination);
  sub.start(now);
  sub.stop(now + durationSec + 0.1);

  let stopped = false;
  return {
    stop: () => { if (!stopped) { stopped = true; try { osc.stop(); sub.stop(); } catch {} } }
  };
}

export function playPulseTick(): void {
  if (!shouldPlay()) return;
  const ctx = getCtx();
  if (!ctx) return;

  const now = ctx.currentTime;
  const vol = MAX_VOLUME * 0.25;

  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(1800, now);
  osc.frequency.exponentialRampToValueAtTime(600, now + 0.06);
  g.gain.setValueAtTime(vol, now);
  g.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
  osc.connect(g).connect(ctx.destination);
  osc.start(now);
  osc.stop(now + 0.1);

  const click = ctx.createOscillator();
  const cg = ctx.createGain();
  click.type = 'square';
  click.frequency.setValueAtTime(3000, now);
  click.frequency.exponentialRampToValueAtTime(800, now + 0.015);
  cg.gain.setValueAtTime(vol * 0.5, now);
  cg.gain.exponentialRampToValueAtTime(0.001, now + 0.025);
  click.connect(cg).connect(ctx.destination);
  click.start(now);
  click.stop(now + 0.03);
}

export function playMetallicSnap(): void {
  if (!shouldPlay()) return;
  const ctx = getCtx();
  if (!ctx) return;

  const now = ctx.currentTime;
  const vol = MAX_VOLUME * 0.55;

  const bufSize = Math.floor(ctx.sampleRate * 0.15);
  const buf = ctx.createBuffer(1, bufSize, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < bufSize; i++) {
    d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / bufSize, 3);
  }
  const noise = ctx.createBufferSource();
  noise.buffer = buf;
  const bpf = ctx.createBiquadFilter();
  bpf.type = 'bandpass';
  bpf.frequency.setValueAtTime(4500, now);
  bpf.frequency.exponentialRampToValueAtTime(1200, now + 0.08);
  bpf.Q.value = 2.5;
  const ng = ctx.createGain();
  ng.gain.setValueAtTime(vol, now);
  ng.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
  noise.connect(bpf).connect(ng).connect(ctx.destination);
  noise.start(now);

  const impact = ctx.createOscillator();
  const ig = ctx.createGain();
  impact.type = 'sine';
  impact.frequency.setValueAtTime(2400, now);
  impact.frequency.exponentialRampToValueAtTime(180, now + 0.05);
  ig.gain.setValueAtTime(vol * 0.7, now);
  ig.gain.exponentialRampToValueAtTime(0.001, now + 0.06);
  impact.connect(ig).connect(ctx.destination);
  impact.start(now);
  impact.stop(now + 0.07);

  const body = ctx.createOscillator();
  const bg = ctx.createGain();
  body.type = 'triangle';
  body.frequency.setValueAtTime(800, now + 0.02);
  body.frequency.exponentialRampToValueAtTime(200, now + 0.15);
  bg.gain.setValueAtTime(0, now);
  bg.gain.linearRampToValueAtTime(vol * 0.3, now + 0.025);
  bg.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
  body.connect(bg).connect(ctx.destination);
  body.start(now);
  body.stop(now + 0.2);
}

export function playPremiumChime(): void {
  if (!shouldPlay()) return;
  const ctx = getCtx();
  if (!ctx) return;

  const now = ctx.currentTime;
  const vol = MAX_VOLUME * 0.35;

  const notes = [
    { freq: 523.25, delay: 0, dur: 0.5, v: 0.8 },
    { freq: 659.25, delay: 0.08, dur: 0.45, v: 0.85 },
    { freq: 783.99, delay: 0.16, dur: 0.4, v: 0.9 },
    { freq: 1046.5, delay: 0.28, dur: 0.6, v: 1.0 },
    { freq: 1318.5, delay: 0.42, dur: 0.8, v: 0.7 },
  ];

  notes.forEach(({ freq, delay, dur, v }) => {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, now + delay);
    g.gain.setValueAtTime(0, now + delay);
    g.gain.linearRampToValueAtTime(vol * v, now + delay + 0.015);
    g.gain.setValueAtTime(vol * v, now + delay + dur * 0.3);
    g.gain.exponentialRampToValueAtTime(0.001, now + delay + dur);
    osc.connect(g).connect(ctx.destination);
    osc.start(now + delay);
    osc.stop(now + delay + dur + 0.05);

    const h = ctx.createOscillator();
    const hg = ctx.createGain();
    h.type = 'sine';
    h.frequency.setValueAtTime(freq * 2, now + delay);
    hg.gain.setValueAtTime(0, now + delay);
    hg.gain.linearRampToValueAtTime(vol * v * 0.15, now + delay + 0.02);
    hg.gain.exponentialRampToValueAtTime(0.001, now + delay + dur * 0.6);
    h.connect(hg).connect(ctx.destination);
    h.start(now + delay);
    h.stop(now + delay + dur + 0.05);
  });

  const shimLen = Math.floor(ctx.sampleRate * 0.4);
  const shimBuf = ctx.createBuffer(1, shimLen, ctx.sampleRate);
  const sd = shimBuf.getChannelData(0);
  for (let i = 0; i < shimLen; i++) {
    sd[i] = (Math.random() * 2 - 1) * 0.005 * Math.pow(1 - i / shimLen, 2);
  }
  const shim = ctx.createBufferSource();
  shim.buffer = shimBuf;
  const hpf = ctx.createBiquadFilter();
  hpf.type = 'highpass';
  hpf.frequency.value = 6000;
  const sg = ctx.createGain();
  sg.gain.setValueAtTime(vol * 0.6, now + 0.28);
  sg.gain.exponentialRampToValueAtTime(0.001, now + 0.7);
  shim.connect(hpf).connect(sg).connect(ctx.destination);
  shim.start(now + 0.28);
}
