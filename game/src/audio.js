// All sound is synthesized with WebAudio: no audio files, no network. A short noise
// burst through a filter is a gunshot; a low sine thump is an explosion; a few square
// blips are the round stingers. The context is created on the first user gesture, so
// autoplay rules never block it.
export function createAudio() {
  let ctx = null;
  let master = null;

  function ensure() {
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume();
      return true;
    }
    try {
      const AC = window.AudioContext ?? window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.32;
      master.connect(ctx.destination);
      return true;
    } catch {
      return false;
    }
  }

  function noiseBurst(duration, filterFreq, gainValue, type = 'lowpass') {
    if (!ensure()) return;
    const length = Math.max(1, Math.floor(ctx.sampleRate * duration));
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / length);
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = filterFreq;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(gainValue, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    source.connect(filter).connect(gain).connect(master);
    source.start();
  }

  function tone(freq, duration, gainValue, type = 'sine', slideTo = null) {
    if (!ensure()) return;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, ctx.currentTime);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, ctx.currentTime + duration);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(gainValue, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    osc.connect(gain).connect(master);
    osc.start();
    osc.stop(ctx.currentTime + duration);
  }

  return {
    unlock() { ensure(); },
    shot(kind) {
      if (kind === 'marksman') { noiseBurst(0.22, 900, 0.9); tone(140, 0.18, 0.35, 'sine', 60); }
      else if (kind === 'smg') noiseBurst(0.09, 1600, 0.5);
      else if (kind === 'pistol') noiseBurst(0.12, 1200, 0.55);
      else noiseBurst(0.14, 1100, 0.7);
    },
    enemyShot(distance) {
      const g = Math.max(0.08, 0.5 - distance * 0.008);
      noiseBurst(0.1, 900, g);
    },
    hit(kill) { tone(kill ? 1320 : 880, kill ? 0.14 : 0.07, 0.25, 'square'); },
    hurt() { tone(160, 0.16, 0.3, 'sawtooth', 90); },
    reload() { tone(520, 0.05, 0.18, 'square'); setTimeout(() => tone(760, 0.05, 0.18, 'square'), 260); },
    dryFire() { tone(300, 0.04, 0.15, 'square'); },
    explosion() {
      noiseBurst(0.7, 320, 1.0);
      tone(70, 0.6, 0.6, 'sine', 28);
    },
    captureTick() { tone(1040, 0.05, 0.12, 'sine'); },
    roundWin() {
      tone(523, 0.16, 0.25, 'square');
      setTimeout(() => tone(659, 0.16, 0.25, 'square'), 150);
      setTimeout(() => tone(784, 0.3, 0.3, 'square'), 300);
    },
    roundLose() {
      tone(392, 0.2, 0.25, 'square');
      setTimeout(() => tone(311, 0.35, 0.25, 'square'), 200);
    },
    buy() { tone(980, 0.08, 0.2, 'sine'); tone(1240, 0.08, 0.15, 'sine'); },
    denied() { tone(220, 0.12, 0.2, 'square'); },
  };
}
