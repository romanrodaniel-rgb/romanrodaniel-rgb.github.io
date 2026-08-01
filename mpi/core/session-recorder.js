import { downloadBlob, nowIso } from './utils.js';

export class SessionRecorder {
  constructor() {
    this.reset();
  }

  reset() {
    this.startedAt = null;
    this.startedPerformance = null;
    this.endedAt = null;
    this.events = [];
    this.active = false;
    this.meta = {};
  }

  start(meta = {}) {
    this.reset();
    this.active = true;
    this.startedAt = nowIso();
    this.startedPerformance = performance.now();
    this.meta = meta;
  }

  add(type, payload = {}) {
    if (!this.active) return;
    this.events.push({
      t: Number(((performance.now() - this.startedPerformance) / 1000).toFixed(3)),
      type,
      ...payload,
    });
  }

  stop() {
    this.active = false;
    this.endedAt = nowIso();
    return this.snapshot();
  }

  snapshot() {
    return {
      format: 'semantic-sound-session/2',
      startedAt: this.startedAt,
      endedAt: this.endedAt || nowIso(),
      meta: this.meta || {},
      eventCount: this.events.length,
      events: this.events.map((event) => ({ ...event })),
    };
  }

  download(filename = 'session.json') {
    const blob = new Blob([JSON.stringify(this.snapshot(), null, 2)], { type: 'application/json' });
    downloadBlob(blob, filename);
  }
}
