export function createDriveAudio() {
  let ctx, master, limiter, motor, overtone, exhaust, engineGain, engineFilter, engineBody;
  let roadGain, skidGain, skidFilter, roadFilter, noise, intakeGain, intakeFilter, windGain, cityGain;
  let rollingPulse, pulseDepth, previousGear;
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

      limiter = ctx.createDynamicsCompressor();
      limiter.threshold.value = -15;
      limiter.knee.value = 19;
      limiter.ratio.value = 4.4;
      limiter.attack.value = 0.0035;
      limiter.release.value = 0.16;
      limiter.connect(master);
      engineGain = ctx.createGain();
      engineGain.gain.value = 0;
      engineFilter = ctx.createBiquadFilter();
      engineFilter.type = 'lowpass';
      engineFilter.frequency.value = 370;
      engineBody = ctx.createBiquadFilter();
      engineBody.type = 'peaking';
      engineBody.frequency.value = 113;
      engineBody.Q.value = 1.15;
      engineBody.gain.value = 4.5;
      engineGain.connect(engineFilter).connect(engineBody).connect(limiter);
      motor = ctx.createOscillator();
      motor.setPeriodicWave(ctx.createPeriodicWave(
        new Float32Array([0, 0.11, -0.20, 0.13, 0, 0.054, -0.028, 0.016, 0.007]),
        new Float32Array([0, 1, 0.71, 0.35, 0.24, 0.15, 0.11, 0.06, 0.03]),
      ));
      motor.connect(engineGain);
      motor.start();
      overtone = ctx.createOscillator();
      overtone.type = 'triangle';
      const bass = ctx.createGain();
      bass.gain.value = 0.39;
      overtone.connect(bass).connect(engineGain);
      overtone.start();
      exhaust = ctx.createOscillator();
      exhaust.setPeriodicWave(ctx.createPeriodicWave(new Float32Array([0, 0.3, 0, -0.27, 0.12]),
        new Float32Array([0, 1, 0.52, 0.1, 0.1])));
      const exhaustMix = ctx.createGain();
      exhaustMix.gain.value = 0.31;
      exhaust.connect(exhaustMix).connect(engineGain);
      exhaust.start();

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
      rollingPulse = ctx.createOscillator();
      pulseDepth = ctx.createGain();
      pulseDepth.gain.value = 0;
      rollingPulse.connect(pulseDepth).connect(roadGain.gain);
      rollingPulse.start();
      skidFilter = ctx.createBiquadFilter();
      skidFilter.type = 'bandpass';
      skidFilter.frequency.value = 1120;
      skidFilter.Q.value = 3.8;
      skidGain = ctx.createGain();
      skidGain.gain.value = 0;
      tireNoise.connect(skidFilter).connect(skidGain).connect(limiter);
      intakeFilter = ctx.createBiquadFilter();
      intakeFilter.type = 'bandpass';
      intakeFilter.Q.value = 1.2;
      intakeGain = ctx.createGain();
      intakeGain.gain.value = 0;
      tireNoise.connect(intakeFilter).connect(intakeGain).connect(limiter);
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

  function update(car, throttle, running, hood = false, wet = 0) {
    if (!ctx || ctx.state !== 'running') return;
    const now = ctx.currentTime;
    const rpm = car.rpm || 850;
    const speed = Math.abs(car.speed);
    const pulse = rpm * 3 / 60;
    const load = car.shiftTimer > 0.09 ? car.throttle * 0.3 : car.throttle;
    const paving = car.surface === 'paving', grass = car.surface === 'grass';
    motor.frequency.setTargetAtTime(pulse, now, 0.055);
    overtone.frequency.setTargetAtTime(pulse / 3, now, 0.055);
    exhaust.frequency.setTargetAtTime(pulse * 0.502, now, 0.069);
    engineBody.frequency.setTargetAtTime(92 + rpm * 0.013, now, 0.095);
    engineFilter.frequency.setTargetAtTime((188 + rpm * 0.093 + load * 372) * (hood ? 1.2 : 0.80), now, 0.078);
    engineGain.gain.setTargetAtTime(running ? 0.032 + load * 0.106 + rpm * 0.000005 : 0, now, 0.067);
    intakeFilter.frequency.setTargetAtTime(320 + rpm * 0.14, now, 0.065);
    intakeGain.gain.setTargetAtTime(running ? load ** 1.25 * (hood ? 0.18 : 0.12) + 0.025 * car.damage[0] : 0, now, 0.08);
    roadFilter.frequency.setTargetAtTime((paving ? 206 : grass ? 139 : 165) + speed * (grass ? 10 : 22 + wet * 35), now, 0.14);
    roadGain.gain.setTargetAtTime(running ? Math.min(speed * (paving ? 0.0052 : 0.0026 + 0.0023 * wet), 0.13) : 0, now, 0.15);
    rollingPulse.frequency.setTargetAtTime(4.0 + speed * 1.75, now, 0.12);
    pulseDepth.gain.setTargetAtTime(running && paving ? Math.min(speed * 0.0019, 0.027) : 0, now, 0.10);
    skidFilter.frequency.setTargetAtTime((grass ? 480 : 975) + speed * 16, now, 0.07);
    skidGain.gain.setTargetAtTime(running ? (car.skid || 0) ** 1.4 * (grass ? 0.055 : 0.22) : 0, now, 0.055);
    windGain.gain.setTargetAtTime(running ? Math.min((speed / 48) ** 2, 0.8) * 0.11 : 0, now, 0.16);
    cityGain.gain.setTargetAtTime(running ? 0.033 / (1 + speed * 0.06) : 0, now, 0.20);
    if (running && throttle > 0.26 && /^D[2-5]$/.test(car.gear) && previousGear && previousGear !== car.gear) {
      noiseBurst('bandpass', 430, 0.030 + throttle * 0.038, 0.095, 0.9);
    }
    previousGear = car.gear;
  }

  function noiseBurst(type, frequency, loudness, duration, q, pan = 0) {
    const now = ctx.currentTime;
    const burst = ctx.createBufferSource(), filter = ctx.createBiquadFilter(), gain = ctx.createGain();
    burst.buffer = noise;
    filter.type = type;
    filter.frequency.value = frequency;
    filter.Q.value = q;
    gain.gain.setValueAtTime(Math.max(0.0012, loudness), now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
    burst.connect(filter).connect(gain);
    const stereo = ctx.createStereoPanner?.();
    if (stereo) { stereo.pan.value = pan; gain.connect(stereo).connect(limiter); }
    else gain.connect(limiter);
    burst.onended = () => { burst.disconnect(); filter.disconnect(); gain.disconnect(); stereo?.disconnect(); };
    burst.start(now, Math.random() * 0.8, duration + 0.025);
  }

  function impact({ closingSpeed, scrapeSpeed, area }) {
    if (!ctx || ctx.state !== 'running' || !enabled) return;
    const strength = Math.min(1, closingSpeed / 17);
    const pan = area === 2 ? -0.5 : area === 3 ? 0.5 : 0;
    noiseBurst('lowpass', 137 + strength * 91, 0.13 + strength * 0.74, 0.17 + strength * 0.21, 0.76, pan);
    noiseBurst('bandpass', 620 + strength * 890, 0.05 + strength * 0.51, 0.10 + strength * 0.15, 1.65, pan);
    if (scrapeSpeed > 2 || strength > 0.24) {
      noiseBurst('bandpass', 1960 + strength * 810, 0.07 + Math.min(0.34, scrapeSpeed * 0.016 + strength * 0.21),
        0.15 + Math.min(0.26, scrapeSpeed * 0.012), 3.5, pan);
    }
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
