export function debounce(fn, wait = 200) {
  let timer = 0;
  const wrapped = (...args) => {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => fn(...args), wait);
  };
  wrapped.cancel = () => window.clearTimeout(timer);
  return wrapped;
}

export function throttle(fn, wait = 90) {
  let last = 0;
  let timer = 0;
  let queued = null;
  const wrapped = (...args) => {
    const now = performance.now();
    const remaining = wait - (now - last);
    queued = args;
    if (remaining <= 0) {
      window.clearTimeout(timer);
      timer = 0;
      last = now;
      const callArgs = queued;
      queued = null;
      fn(...callArgs);
      return;
    }
    if (!timer) {
      timer = window.setTimeout(() => {
        last = performance.now();
        timer = 0;
        if (queued) fn(...queued);
        queued = null;
      }, remaining);
    }
  };
  wrapped.cancel = () => {
    window.clearTimeout(timer);
    timer = 0;
    queued = null;
  };
  return wrapped;
}

export function nextAnimationFrame() {
  return new Promise((resolve) => window.requestAnimationFrame(resolve));
}

export function idle(callback, timeout = 800) {
  if ('requestIdleCallback' in window) {
    return window.requestIdleCallback(callback, { timeout });
  }
  return window.setTimeout(() => callback({ timeRemaining: () => 0, didTimeout: true }), 20);
}

export function cancelIdle(handle) {
  if (!handle) return;
  if ('cancelIdleCallback' in window) window.cancelIdleCallback(handle);
  else window.clearTimeout(handle);
}

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function downloadBlob(blob, name) {
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1500);
}

export async function fetchJson(url, label = String(url), options = {}) {
  const response = await fetch(url, {
    cache: options.cache || 'no-cache',
    signal: options.signal,
  });
  if (!response.ok) {
    throw new Error(`No se pudo cargar ${label} (${response.status})`);
  }
  try {
    return await response.json();
  } catch (error) {
    throw new Error(`${label} no contiene JSON válido: ${error.message}`);
  }
}

export function seededRandom(seed = 1) {
  let state = (Number(seed) >>> 0) || 1;
  return () => {
    state += 0x6D2B79F5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

export function nowIso() {
  return new Date().toISOString();
}
