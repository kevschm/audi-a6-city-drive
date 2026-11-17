/**
 * Adaptive renderer resolution. Keeps 3D image quality high when hardware
 * has spare capacity and reduces the GPU pixel workload on slower devices.
 * The simulation timestep is deliberately independent from this controller.
 */
export function createAdaptiveResolution({
  minScale = 0.8,
  maxScale = 1.65,
  targetFps = 40,
  sampleMs = 1000,
  lowSamples = 2,
  highSamples = 3
} = {}) {
  if (!(minScale > 0 && maxScale >= minScale &&
        targetFps > 0 && sampleMs > 0 &&
        Number.isInteger(lowSamples) && lowSamples >= 1 &&
        Number.isInteger(highSamples) && highSamples >= 1)) {
    throw new RangeError('Invalid adaptive resolution settings');
  }

  let scale = maxScale;
  let fps = 0;
  let sampleStart = null;
  let frames = 0;
  let lows = 0;
  let highs = 0;

  return {
    get scale() { return scale; },
    get fps() { return fps; },

    reset(timestamp = null) {
      scale = maxScale;
      fps = 0;
      sampleStart = Number.isFinite(timestamp) ? timestamp : null;
      frames = 0;
      lows = highs = 0;
    },

    sample(timestamp) {
      if (!Number.isFinite(timestamp)) return false;
      if (sampleStart === null || timestamp < sampleStart) {
        sampleStart = timestamp;
        frames = 0;
        lows = highs = 0;
        return false;
      }
      frames++;
      const elapsed = timestamp - sampleStart;
      if (elapsed < sampleMs) return false;

      fps = Math.round(frames * 1000 / elapsed);
      sampleStart = timestamp;
      frames = 0;

      if (fps < targetFps * 0.82) {
        lows++;
        highs = 0;
        if (lows >= lowSamples) {
          scale = Math.max(minScale, Math.round((scale - 0.15) * 100) / 100);
          lows = 0;
        }
      } else if (fps > targetFps * 1.35) {
        highs++;
        lows = 0;
        if (highs >= highSamples) {
          scale = Math.min(maxScale, Math.round((scale + 0.10) * 100) / 100);
          highs = 0;
        }
      } else {
        lows = highs = 0;
      }
      return true;
    }
  };
}
