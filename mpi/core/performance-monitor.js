export class PerformanceMonitor {
  constructor(onUpdate = () => {}, flushInterval = 750) {
    this.samples = new Map();
    this.dirty = new Set();
    this.onUpdate = onUpdate;
    this.flushInterval = Math.max(250, Number(flushInterval) || 750);
    this.timer = window.setInterval(() => this.flush(), this.flushInterval);
  }

  record(name, duration) {
    const value = Number(duration) || 0;
    const values = this.samples.get(name) || [];
    values.push(value);
    if (values.length > 60) values.shift();
    this.samples.set(name, values);
    this.dirty.add(name);
    return value;
  }

  measure(name, fn) {
    const started = performance.now();
    try {
      const result = fn();
      if (result && typeof result.then === 'function') {
        return result.finally(() => this.record(name, performance.now() - started));
      }
      this.record(name, performance.now() - started);
      return result;
    } catch (error) {
      this.record(name, performance.now() - started);
      throw error;
    }
  }

  summary(name) {
    const values = this.samples.get(name) || [];
    if (!values.length) return { last: 0, average: 0, p95: 0, count: 0 };
    const sorted = [...values].sort((a, b) => a - b);
    const last = values.at(-1);
    const average = values.reduce((sum, value) => sum + value, 0) / values.length;
    const p95 = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))];
    return { last, average, p95, count: values.length };
  }

  flush() {
    if (!this.dirty.size) return;
    for (const name of this.dirty) this.onUpdate(name, this.summary(name));
    this.dirty.clear();
  }

  reset() {
    this.samples.clear();
    this.dirty.clear();
  }

  destroy() {
    window.clearInterval(this.timer);
    this.flush();
  }

  static format(summary) {
    if (!summary?.count) return '—';
    return `${summary.last.toFixed(1)} ms · μ ${summary.average.toFixed(1)} · p95 ${summary.p95.toFixed(1)}`;
  }
}
