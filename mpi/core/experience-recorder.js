import { downloadBlob } from './utils.js';

const VIDEO_FORMATS = Object.freeze([
  { mimeType: 'video/mp4;codecs=avc1.42E01E,mp4a.40.2', extension: 'mp4', label: 'MP4' },
  { mimeType: 'video/mp4;codecs=h264,aac', extension: 'mp4', label: 'MP4' },
  { mimeType: 'video/mp4', extension: 'mp4', label: 'MP4' },
  { mimeType: 'video/webm;codecs=vp9,opus', extension: 'webm', label: 'WebM' },
  { mimeType: 'video/webm;codecs=vp8,opus', extension: 'webm', label: 'WebM' },
  { mimeType: 'video/webm', extension: 'webm', label: 'WebM' },
]);

function chooseFormat() {
  if (!window.MediaRecorder) return null;
  if (typeof MediaRecorder.isTypeSupported !== 'function') return VIDEO_FORMATS[0];
  return VIDEO_FORMATS.find((format) => MediaRecorder.isTypeSupported(format.mimeType)) || null;
}

function safeBaseName(value) {
  return String(value || 'mpi-experiencia')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120) || 'mpi-experiencia';
}

export class ExperienceRecorder {
  constructor() {
    this.mediaRecorder = null;
    this.displayStream = null;
    this.combinedStream = null;
    this.audioTracks = [];
    this.ownedAudioTracks = [];
    this.chunks = [];
    this.format = null;
    this.stopPromise = null;
    this.resolveStop = null;
    this.rejectStop = null;
    this.onDisplayEnded = null;
    this.filenameBase = 'mpi-experiencia';
  }

  get active() {
    return Boolean(this.mediaRecorder && this.mediaRecorder.state !== 'inactive');
  }

  async start({ audioStream = null, filenameBase = 'mpi-experiencia', onDisplayEnded = null } = {}) {
    if (this.active) throw new Error('Ya hay una experiencia en grabación.');
    if (!navigator.mediaDevices?.getDisplayMedia) {
      throw new Error('Este navegador no permite grabar la ventana de MPI.');
    }
    if (!window.MediaRecorder) {
      throw new Error('Este navegador no permite crear el vídeo de la experiencia.');
    }

    this.format = chooseFormat();
    if (!this.format) throw new Error('El navegador no ofrece un formato de vídeo compatible.');
    this.filenameBase = safeBaseName(filenameBase);
    this.onDisplayEnded = onDisplayEnded;
    this.chunks = [];

    try {
      this.displayStream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          frameRate: { ideal: 30, max: 30 },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
          cursor: 'always',
        },
        audio: false,
        preferCurrentTab: true,
        selfBrowserSurface: 'include',
        surfaceSwitching: 'exclude',
        systemAudio: 'exclude',
      });

      const videoTracks = this.displayStream.getVideoTracks();
      if (!videoTracks.length) throw new Error('No se seleccionó ninguna ventana para grabar.');

      const sourceAudioTracks = audioStream?.getAudioTracks?.() || [];
      this.audioTracks = sourceAudioTracks.map((track) => {
        if (typeof track.clone !== 'function') return track;
        const clone = track.clone();
        this.ownedAudioTracks.push(clone);
        return clone;
      });
      this.combinedStream = new MediaStream([...videoTracks, ...this.audioTracks]);

      const options = {
        mimeType: this.format.mimeType,
        videoBitsPerSecond: 8_000_000,
        audioBitsPerSecond: 192_000,
      };
      try {
        this.mediaRecorder = new MediaRecorder(this.combinedStream, options);
      } catch (_) {
        this.mediaRecorder = new MediaRecorder(this.combinedStream, { mimeType: this.format.mimeType });
      }

      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data?.size) this.chunks.push(event.data);
      };
      this.mediaRecorder.onerror = (event) => {
        const error = event.error || new Error('La grabación de vídeo se interrumpió.');
        this.rejectStop?.(error);
        this.cleanup();
      };
      this.mediaRecorder.onstop = () => this.finish();
      videoTracks[0].addEventListener?.('ended', () => {
        if (this.active) this.onDisplayEnded?.();
      }, { once: true });

      this.mediaRecorder.start(1000);
      return {
        mimeType: this.mediaRecorder.mimeType || this.format.mimeType,
        extension: this.format.extension,
        label: this.format.label,
        hasAudio: this.audioTracks.length > 0,
      };
    } catch (error) {
      this.cleanup();
      if (error?.name === 'NotAllowedError') {
        throw new Error('La grabación fue cancelada. Pulsa REC y elige la ventana o pestaña de MPI.');
      }
      throw error;
    }
  }

  stop() {
    if (!this.mediaRecorder || this.mediaRecorder.state === 'inactive') {
      return Promise.resolve(null);
    }
    if (this.stopPromise) return this.stopPromise;
    const pending = new Promise((resolve, reject) => {
      this.resolveStop = resolve;
      this.rejectStop = reject;
    });
    this.stopPromise = pending;
    try {
      this.mediaRecorder.stop();
    } catch (error) {
      this.rejectStop?.(error);
      this.cleanup();
    }
    return pending;
  }

  finish() {
    const mimeType = this.mediaRecorder?.mimeType || this.format?.mimeType || 'video/webm';
    const extension = mimeType.includes('mp4') ? 'mp4' : (this.format?.extension || 'webm');
    const label = extension === 'mp4' ? 'MP4' : 'WebM';
    const blob = new Blob(this.chunks, { type: mimeType });
    const filename = `${this.filenameBase}.${extension}`;
    if (blob.size) downloadBlob(blob, filename);
    const result = { blob, filename, mimeType, extension, label };
    const resolve = this.resolveStop;
    this.cleanup();
    resolve?.(result);
  }

  cleanup() {
    for (const track of this.displayStream?.getTracks?.() || []) {
      try { track.stop(); } catch (_) { /* ya detenido */ }
    }
    for (const track of this.ownedAudioTracks) {
      try { track.stop(); } catch (_) { /* ya detenido */ }
    }
    this.mediaRecorder = null;
    this.displayStream = null;
    this.combinedStream = null;
    this.audioTracks = [];
    this.ownedAudioTracks = [];
    this.chunks = [];
    this.stopPromise = null;
    this.resolveStop = null;
    this.rejectStop = null;
    this.onDisplayEnded = null;
  }
}
