import { FIXED_STEP_SECONDS } from './fixed-step.js';

const controls = ['left', 'right', 'throttle', 'brake', 'handbrake'];
const stride = controls.length + 1;

// The lab starts from a known scenario. Replay the input and road condition
// at each physics tick, independent of drawing rate, camera and slow motion.
export function createLabRecording() {
  const frames = new Float64Array(Math.round(30 / FIXED_STEP_SECONDS) * stride);
  let end = 0, cursor = 0;
  return {
    get length() { return end / stride; },
    get finished() { return cursor >= end; },
    rewind() { cursor = 0; },
    record(input, wet) {
      if (end >= frames.length) return;
      for (const key of controls) frames[end++] = Number(input[key] || 0);
      frames[end++] = wet;
    },
    next(input, world) {
      if (cursor >= end) return false;
      for (const key of controls) input[key] = frames[cursor++];
      world.wetness = frames[cursor++];
      return true;
    },
  };
}
