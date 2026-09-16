/** Bounded, local detector: the same actions must return to the same states for
 * three consecutive cycles. Observation calls do not add frames. */
const MAX_PERIOD = 4;
const REPETITIONS = 3;
const ABORT_RECURRENCES = 9;
type Frame = { action: string; state: string };

export class ShortCycleGuard {
  private frames: Frame[] = [];
  private knownStates = new Set<string>();
  private recurrences = new Map<string, number>();
  private latched = new Set<string>();

  /** Human advice grants a fresh detection window, not an unlimited retry budget. */
  resetWindow() {
    this.frames = [];
    this.latched.clear();
  }

  reset() {
    this.resetWindow();
    this.recurrences.clear();
    this.knownStates.clear();
  }

  record(action: string, state: string) {
    // A state outside the recent trajectory is new evidence; retire old budgets.
    // Keep the frames so the first traversal of a new cycle can still be detected.
    if (!this.knownStates.has(state)) {
      this.recurrences.clear();
      this.latched.clear();
    }
    this.knownStates.add(state);
    if (this.knownStates.size > MAX_PERIOD * REPETITIONS) this.knownStates.delete(this.knownStates.values().next().value!);
    this.frames.push({ action, state });
    if (this.frames.length > MAX_PERIOD * REPETITIONS) this.frames.shift();
    const tokens = this.frames.map(frame => JSON.stringify([frame.action, frame.state]));
    for (let period = 2; period <= MAX_PERIOD; period++) {
      const tail = tokens.slice(-period * REPETITIONS);
      if (tail.length < period * REPETITIONS || !tail.every((token, i) => token === tail[i % period])) continue;
      const cycle = this.frames.slice(-period);
      // An unchanged state belongs to the existing repeat detector.
      if (new Set(cycle.map(frame => frame.state)).size < 2) continue;
      const pattern = tail.slice(0, period);
      const key = pattern.map((_, i) => JSON.stringify([...pattern.slice(i), ...pattern.slice(0, i)])).sort()[0];
      const count = (this.recurrences.get(key) ?? 0) + 1;
      this.recurrences.set(key, count);
      const assist = !this.latched.has(key);
      this.latched.add(key);
      return { period, count, assist, abort: count >= ABORT_RECURRENCES };
    }
    return null;
  }
}
