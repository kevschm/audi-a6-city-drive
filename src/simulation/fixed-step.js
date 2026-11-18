/** Fixed 60 Hz simulation clock with bounded catch-up and pause-safe reset.
 * Time units: input timestamps are milliseconds; simulation dt is seconds.
 */
export const FIXED_STEP_SECONDS = 1 / 60;

export function createFixedStepClock({
  stepSeconds = FIXED_STEP_SECONDS,
  maxFrameSeconds = 0.1,
  maxUpdatesPerFrame = 6,
} = {}) {
  if (!(stepSeconds > 0) || !(maxFrameSeconds > 0) ||
      !Number.isInteger(maxUpdatesPerFrame) || maxUpdatesPerFrame < 1) {
    throw new RangeError('Invalid simulation clock settings');
  }

  let previousMs = null;
  let accumulatedSeconds = 0;

  return {
    reset(timeMs = null) {
      previousMs = Number.isFinite(timeMs) ? timeMs : null;
      accumulatedSeconds = 0;
    },

    tick(timeMs, update, timeScale = 1) {
      if (!Number.isFinite(timeMs)) throw new TypeError('Timestamp must be finite');
      if (typeof update !== 'function') throw new TypeError('update must be a function');
      if (!Number.isFinite(timeScale) || timeScale < 0 || timeScale > 1) throw new RangeError('Invalid time scale');
      if (previousMs === null) {
        previousMs = timeMs;
        return { updates: 0, interpolation: 0 };
      }

      // Browser timestamps should be monotonic, but recover safely if they regress.
      if (timeMs < previousMs) {
        previousMs = timeMs;
        accumulatedSeconds = 0;
        return { updates: 0, interpolation: 0 };
      }
      // No enormous simulation step after backgrounding.
      const elapsedSeconds = Math.min(maxFrameSeconds, Math.max(0, (timeMs - previousMs) / 1000));
      previousMs = timeMs;
      accumulatedSeconds += elapsedSeconds * timeScale;

      let updates = 0;
      while (accumulatedSeconds + 1e-10 >= stepSeconds && updates < maxUpdatesPerFrame) {
        update(stepSeconds);
        accumulatedSeconds = Math.max(0, accumulatedSeconds - stepSeconds);
        updates++;
      }
      // Deliberately drop excessive backlog instead of entering a spiral of death.
      if (updates === maxUpdatesPerFrame && accumulatedSeconds >= stepSeconds) {
        accumulatedSeconds %= stepSeconds;
      }
      return { updates, interpolation: accumulatedSeconds / stepSeconds };
    },
  };
}
