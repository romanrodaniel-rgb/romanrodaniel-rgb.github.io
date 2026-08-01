import { AudioEngine } from './audio-engine.js';

const clampValue = (value, min, max) =>
  Math.min(max, Math.max(min, Number(value) || 0));

AudioEngine.prototype.ensure = async function ensureIOSAudio() {
  if (this.destroyed) {
    throw new Error('El motor de audio ya fue destruido.');
  }

  if (this.ctx) {
    if (
      this.ctx.state === 'suspended' ||
      this.ctx.state === 'interrupted'
    ) {
      await this.ctx.resume();
    }
    return;
  }

  const AudioContextClass =
    window.AudioContext || window.webkitAudioContext;

  if (!AudioContextClass) {
    throw new Error('Este navegador no ofrece Web Audio.');
  }

  this.ctx = new AudioContextClass({
    latencyHint: 'interactive',
  });

  this.master = this.ctx.createGain();
  this.master.gain.value = clampValue(this.volume, 0, 1.6);

  this.compressor = this.ctx.createDynamicsCompressor();
  this.compressor.threshold.value = -24;
  this.compressor.knee.value = 12;
  this.compressor.ratio.value = 3;

  if (this.compressor.attack) {
    this.compressor.attack.value = 0.006;
  }

  if (this.compressor.release) {
    this.compressor.release.value = 0.18;
  }

  this.output = this.ctx.createGain();
  this.output.gain.value = 1.08;

  this.master.connect(this.compressor);
  this.compressor.connect(this.output);
  this.output.connect(this.ctx.destination);

  if (typeof this.ctx.createMediaStreamDestination === 'function') {
    this.recordDest = this.ctx.createMediaStreamDestination();
    this.output.connect(this.recordDest);
  } else {
    this.recordDest = null;
  }

  if (typeof this.ctx.createConvolver === 'function') {
    this.reverb = this.ctx.createConvolver();

    this.reverb.buffer = this.createImpulseResponse(
      Number(
        this.world.sonification.bellField?.reverbSeconds ||
          3.6
      )
    );

    this.reverbReturn = this.ctx.createGain();
    this.reverbReturn.gain.value = 0.42;

    this.reverb.connect(this.reverbReturn);
    this.reverbReturn.connect(this.master);
  }
};

AudioEngine.prototype.unlock =
  async function unlockIOSAudio() {
    this.userInteracted = true;

    await this.ensure();

    if (
      this.ctx.state === 'suspended' ||
      this.ctx.state === 'interrupted'
    ) {
      await this.ctx.resume();
    }

    const silentBuffer = this.ctx.createBuffer(
      1,
      1,
      this.ctx.sampleRate
    );

    const silentSource = this.ctx.createBufferSource();
    const silentGain = this.ctx.createGain();

    silentGain.gain.value = 0.000001;
    silentSource.buffer = silentBuffer;

    silentSource.connect(silentGain);
    silentGain.connect(this.ctx.destination);

    silentSource.start(0);
    silentSource.stop(this.ctx.currentTime + 0.01);

    const bell = this.bellAsset();

    if (bell) {
      try {
        await this.getBuffer(bell.id, {
          priority: 'active',
        });
      } catch (error) {
        console.warn(
          'El audio se activó, pero la precarga inicial falló.',
          error
        );
      }
    }

    if (this.ctx.state !== 'running') {
      throw new Error(
        'Safari no permitió iniciar el audio. Toca Activar audio otra vez.'
      );
    }

    return true;
  };
