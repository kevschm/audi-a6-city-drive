export function createDriveAudio() {
  let ctx, master, motor, overtone, engineGain, engineFilter, roadGain, skidGain, roadFilter, noise;
  let windGain, cityGain;
  let enabled = false, volume = 0.75;

  function applyVolume() {
    if (master) master.gain.setTargetAtTime(enabled ? volume * 0.82 : 0, ctx.currentTime, 0.08);
  }

  function setEnabled(active) {
    const Audio = window.AudioContext || window.webkitAudioContext;
    if (!active && !ctx) return false;
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
      engineFilter = ctx.createBiquadFilter();
      engineFilter.type = 'lowpass';
      engineFilter.frequency.value = 370;
      engineGain.connect(engineFilter).connect(limiter);
      motor = ctx.createOscillator();
      motor.setPeriodicWave(ctx.createPeriodicWave(
        new Float32Array([0, 0, 0.12, 0, 0.11, 0.018, 0.045, 0, 0.022]),
        new Float32Array([0, 1, 0.49, 0.14, 0.27, 0.095, 0.17, 0.036, 0.023]),
      ));
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
      const wind = ctx.createBiquadFilter();
      wind.type = 'highpass';
      wind.frequency.value = 390;
      windGain = ctx.createGain();
      windGain.gain.value = 0;
      tireNoise.connect(wind).connect(windGain).connect(limiter);
      const city = ctx.createBiquadFilter();
      city.type = 'lowpass';
      city.frequency.value = 93;
      cityGain = ctx.createGain();
      cityGain.gain.value = 0;
      tireNoise.connect(city).connect(cityGain).connect(limiter);
      tireNoise.start();
    }
    enabled = active;
    if (enabled) ctx.resume().catch(() => {});
    applyVolume();
    return enabled;
  }

  function update(car, throttle, running, hood = false) {
    if (!ctx || ctx.state !== 'running') return;
    const now = ctx.currentTime;
    const rpm = car.rpm || 850;
    const speed = Math.abs(car.speed);
    const pulse = rpm * 3 / 60;
    const load = car.shiftTimer > 0.09 ? throttle * 0.28 : throttle;
    const paving = car.surface === 'paving', grass = car.surface === 'grass';
    motor.frequency.setTargetAtTime(pulse, now, 0.055);
    overtone.frequency.setTargetAtTime(pulse / 3, now, 0.055);
    engineFilter.frequency.setTargetAtTime((175 + rpm * 0.064 + load * 255) * (hood ? 1.11 : 0.86), now, 0.085);
    engineGain.gain.setTargetAtTime(running ? 0.02 + load * 0.072 + rpm * 0.0000032 : 0, now, 0.083);
    roadFilter.frequency.setTargetAtTime((paving ? 206 : grass ? 139 : 165) + speed * (grass ? 10 : 22), now, 0.14);
    roadGain.gain.setTargetAtTime(running ? Math.min(speed * (paving ? 0.0052 : 0.0026), 0.11) : 0, now, 0.15);
    skidGain.gain.setTargetAtTime(running ? (car.skid || 0) * (grass ? 0.055 : 0.12) : 0, now, 0.06);
    windGain.gain.setTargetAtTime(running ? Math.min((speed / 48) ** 2, 0.8) * 0.11 : 0, now, 0.16);
    cityGain.gain.setTargetAtTime(running ? 0.033 / (1 + speed * 0.06) : 0, now, 0.20);
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

  function chime(complete) {
    if (!ctx || ctx.state !== 'running' || !enabled) return;
    const notes = complete ? [440, 587.33, 659.25] : [493.88];
    notes.forEach((pitch, index) => {
      const time = ctx.currentTime + index * 0.12;
      const osc = ctx.createOscillator(), gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = pitch;
      gain.gain.setValueAtTime(0.001, time);
      gain.gain.exponentialRampToValueAtTime(0.065, time + 0.013);
      gain.gain.exponentialRampToValueAtTime(0.001, time + 0.165);
      osc.connect(gain).connect(master);
      osc.onended = () => { osc.disconnect(); gain.disconnect(); };
      osc.start(time);
      osc.stop(time + 0.18);
    });
  }

  function setVolume(value) {
    volume = value;
    applyVolume();
  }

  return { setEnabled, setVolume, update, impact, chime };
}
