export function createDriveAudio() {
  let ctx, master, motor, overtone, engineGain, roadGain, skidGain, roadFilter, noise;

  function setEnabled(enabled) {
    const Audio = window.AudioContext || window.webkitAudioContext;
    if (!enabled && !ctx) return false;
    if (!Audio) return false;
    if (!ctx) {
      ctx = new Audio();
      master = ctx.createGain();
      master.gain.value = 0;
      master.connect(ctx.destination);

      const limiter = ctx.createDynamicsCompressor();
      limiter.connect(master);
      engineGain = ctx.createGain();
      engineGain.gain.value = 0;
      const engineFilter = ctx.createBiquadFilter();
      engineFilter.type = 'lowpass';
      engineFilter.frequency.value = 370;
      engineGain.connect(engineFilter).connect(limiter);
      motor = ctx.createOscillator();
      motor.type = 'sawtooth';
      motor.connect(engineGain);
      motor.start();
      overtone = ctx.createOscillator();
      overtone.type = 'triangle';
      overtone.connect(engineGain);
      overtone.start();

      noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
      const samples = noise.getChannelData(0);
      for (let i = 0; i < samples.length; i++) samples[i] = Math.random() * 2 - 1;

      const tireNoise = ctx.createBufferSource();
      tireNoise.buffer = noise;
      tireNoise.loop = true;
      roadGain = ctx.createGain();
      roadGain.gain.value = 0;
      roadFilter = ctx.createBiquadFilter();
      roadFilter.type = 'lowpass';
      roadFilter.frequency.value = 190;
      tireNoise.connect(roadFilter).connect(roadGain).connect(limiter);
      const skidFilter = ctx.createBiquadFilter();
      skidFilter.type = 'bandpass';
      skidFilter.frequency.value = 1120;
      skidFilter.Q.value = 3.8;
      skidGain = ctx.createGain();
      skidGain.gain.value = 0;
      tireNoise.connect(skidFilter).connect(skidGain).connect(limiter);
      tireNoise.start();
    }
    if (enabled) ctx.resume().catch(() => {});
    master.gain.setTargetAtTime(enabled ? 0.65 : 0, ctx.currentTime, 0.08);
    return enabled;
  }

  function update(car, throttle, running) {
    if (!ctx || ctx.state !== 'running') return;
    const now = ctx.currentTime;
    const rpm = car.rpm || 850;
    const speed = Math.abs(car.speed);
    const pulse = rpm * 2.5 / 60;
    motor.frequency.setTargetAtTime(pulse, now, 0.07);
    overtone.frequency.setTargetAtTime(pulse * 0.5, now, 0.07);
    engineGain.gain.setTargetAtTime(running ? 0.025 + throttle * 0.042 : 0, now, 0.10);
    roadFilter.frequency.setTargetAtTime(140 + speed * 19, now, 0.16);
    roadGain.gain.setTargetAtTime(running ? 0.008 + Math.min(speed * 0.003, 0.085) : 0, now, 0.16);
    skidGain.gain.setTargetAtTime(running ? (car.skid || 0) * 0.16 : 0, now, 0.06);
  }

  function impact(strength) {
    if (!ctx || ctx.state !== 'running') return;
    const now = ctx.currentTime;
    const burst = ctx.createBufferSource(), filter = ctx.createBiquadFilter(), gain = ctx.createGain();
    burst.buffer = noise;
    filter.type = 'lowpass';
    filter.frequency.value = 320;
    gain.gain.setValueAtTime(Math.min(0.32, strength * 0.035), now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.26);
    burst.connect(filter).connect(gain).connect(master);
    burst.onended = () => { burst.disconnect(); filter.disconnect(); gain.disconnect(); };
    burst.start(now, 0, 0.3);
  }

  return { setEnabled, update, impact };
}
