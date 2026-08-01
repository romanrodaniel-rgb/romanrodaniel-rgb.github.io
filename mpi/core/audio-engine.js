import { cancelIdle, clamp, downloadBlob, idle, seededRandom } from './utils.js';

const RELATION_FREQUENCIES = Object.freeze({
  'belongs-to-source': 110.0,
  documentary: 146.83,
  'semantic-similarity': 196.0,
  'text-audio': 220.0,
  'image-source': 261.63,
  spatial: 293.66,
  chronological: 329.63,
  'derived-from': 392.0,
  navigation: 440.0,
});
const RELATION_WAVEFORMS = Object.freeze({
  'belongs-to-source': 'sine',
  documentary: 'triangle',
  'semantic-similarity': 'sine',
  'text-audio': 'sine',
  'image-source': 'triangle',
  spatial: 'sine',
  chronological: 'sawtooth',
  'derived-from': 'triangle',
  navigation: 'sine',
});
const RELATION_INTERVALS = Object.freeze({
  'belongs-to-source': 0,
  documentary: 7,
  'semantic-similarity': 2,
  'text-audio': 9,
  'image-source': 5,
  spatial: 4,
  chronological: 11,
  'derived-from': 3,
  navigation: 12,
});


export class AudioEngine {
  constructor(world, performanceMonitor) {
    this.world = world;
    this.performance = performanceMonitor;
    this.ctx = null;
    this.master = null;
    this.compressor = null;
    this.output = null;
    this.recordDest = null;
    this.reverb = null;
    this.reverbReturn = null;
    this.voices = [];
    this.currentNode = null;
    this.mode = 'direct';
    this.mediaRecorder = null;
    this.chunks = [];
    this.cache = new Map();
    this.requests = new Map();
    this.prefetchHandles = new Set();
    this.generation = 0;
    this.destroyed = false;
    this.cacheSize = Number(world.sonification.cacheSize || world.manifest.audio?.cacheSize || 12);
    this.maxVoices = Math.max(1, Number(world.sonification.maxVoices || world.manifest.audio?.maxVoices || 4));
    this.crossfadeSeconds = clamp(Number(world.sonification.crossfadeSeconds || 0.42), 0.05, 1.5);
    this.seed = Number(world.sonification.seed || Math.floor(Math.random() * 2 ** 31));
    this.random = seededRandom(this.seed);
    this.userInteracted = false;
    this.volume = clamp(Number(world.sonification.masterGain ?? 1.08), 0, 1.6);
    this.lastPreviewAt = 0;
    this.lastPreviewId = null;
    this.stats = { cacheHits: 0, cacheMisses: 0, abortedRequests: 0, startedVoices: 0 };
  }

  async ensure() {
    if (this.destroyed) throw new Error('El motor de audio ya fue destruido.');
    if (this.ctx) {
      if (this.ctx.state === 'suspended') await this.ctx.resume();
      return;
    }
    this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.volume;
    this.compressor = this.ctx.createDynamicsCompressor();
    this.compressor.threshold.value = -24;
    this.compressor.knee.value = 12;
    this.compressor.ratio.value = 3;
    if (this.compressor.attack) this.compressor.attack.value = 0.006;
    if (this.compressor.release) this.compressor.release.value = 0.18;
    this.output = this.ctx.createGain();
    this.output.gain.value = 1.08;
    this.master.connect(this.compressor);
    this.compressor.connect(this.output);
    this.output.connect(this.ctx.destination);
    this.recordDest = this.ctx.createMediaStreamDestination();
    this.output.connect(this.recordDest);

    if (typeof this.ctx.createConvolver === 'function') {
      this.reverb = this.ctx.createConvolver();
      this.reverb.buffer = this.createImpulseResponse(Number(this.world.sonification.bellField?.reverbSeconds || 3.6));
      this.reverbReturn = this.ctx.createGain();
      this.reverbReturn.gain.value = 0.42;
      this.reverb.connect(this.reverbReturn);
      this.reverbReturn.connect(this.master);
    }
  }

  createImpulseResponse(seconds = 3.6) {
    const length = Math.max(1, Math.floor(this.ctx.sampleRate * clamp(seconds, 0.8, 7)));
    const buffer = this.ctx.createBuffer(2, length, this.ctx.sampleRate);
    for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
      const data = buffer.getChannelData(channel);
      for (let index = 0; index < length; index += 1) {
        const decay = Math.pow(1 - index / length, 2.7);
        data[index] = (Math.random() * 2 - 1) * decay;
      }
    }
    return buffer;
  }

  setMode(mode) { this.mode = mode; }

  async unlock() {
    this.userInteracted = true;
    await this.ensure();
    const bell = this.bellAsset();
    if (bell) await this.getBuffer(bell.id, { priority: 'active' });
    return true;
  }

  setVolume(value) {
    this.volume = clamp(Number(value) || 0, 0, 1.6);
    if (this.master && this.ctx) {
      const now = this.ctx.currentTime;
      this.master.gain.cancelScheduledValues(now);
      this.master.gain.linearRampToValueAtTime(this.volume, now + 0.05);
    }
  }

  preview(node) {
    if (!this.userInteracted || !this.ctx || this.destroyed) return [];
    const nowMs = performance.now();
    if (String(this.lastPreviewId) === String(node.id) && nowMs - this.lastPreviewAt < 180) return [];
    if (nowMs - this.lastPreviewAt < 75) return [];
    this.lastPreviewAt = nowMs;
    this.lastPreviewId = node.id;
    const plan = this.performance.measure('sonic', () => this.planCurrentRelational(node, { preview: true }));
    const generation = ++this.generation;
    void this.playPlan(plan, generation);
    return plan;
  }

  navigate(node) {
    this.userInteracted = true;
    const previous = this.currentNode;
    const plan = this.performance.measure('sonic', () => this.plan(node, previous));
    this.lastPreviewId = node.id;
    this.currentNode = node;
    const generation = ++this.generation;
    const needed = new Set(plan.filter((item) => item.kind !== 'synth').map((item) => String(item.audioId)));
    this.cancelObsoleteRequests(needed);
    void this.playPlan(plan, generation);
    this.prefetchAround(node, needed);
    return plan;
  }

  plan(node, previous) {
    if (this.mode === 'relational' || this.mode.startsWith('bell-')) return this.planCurrentRelational(node);

    const candidates = this.world.audioCandidates(node, 8);
    if (!candidates.length) return this.planRelational(node);
    const base = this.planItem(candidates[0], { gain: 0.78, rate: 1, label: 'actual' });
    let plan = [base];

    if (this.mode === 'temperature') {
      const heat = this.world.density(node);
      plan = [{ ...base, gain: 0.34 + 0.42 * heat, rate: 0.82 + 0.36 * heat, label: 'temperatura', heat }];
    } else if (this.mode === 'euclidean') {
      const distance = previous ? this.world.dist(previous, node) : 0;
      plan = [{ ...base, gain: 0.78, rate: clamp(0.82 + distance * 0.14, 0.72, 1.35), label: 'distancia', distance }];
    } else if (this.mode === 'random') {
      const pool = this.collectAudioPool(node, 5);
      const pick = pool[Math.floor(this.random() * pool.length)] || candidates[0];
      plan = [this.planItem(pick, { gain: 0.78, rate: 0.85 + this.random() * 0.3, label: 'azar', sourceNode: pick.node.id })];
    } else if (this.mode === 'horizon') {
      const pool = this.collectAudioPool(node, 8);
      plan = pool.slice(0, this.maxVoices).map((candidate, index) => this.planItem(candidate, {
        gain: index === 0 ? 0.58 : 0.22 / Math.max(1, index),
        rate: index === 0 ? 1 : 0.9 + index * 0.09,
        label: index === 0 ? 'actual' : 'horizonte',
        sourceNode: candidate.node.id,
      }));
    }

    const unique = new Map();
    for (const item of plan) {
      if (item?.audioId === undefined || item.audioId === null) continue;
      if (!unique.has(String(item.audioId))) unique.set(String(item.audioId), item);
    }
    return [...unique.values()].slice(0, this.maxVoices);
  }

  planCurrentRelational(node, options = {}) {
    if (this.mode === 'relational') return this.planRelational(node, options);
    if (this.mode.startsWith('bell-')) return this.planBellField(node, { ...options, variant: this.mode.replace('bell-', '') });
    return this.planRelational(node, options);
  }

  bellAsset() {
    const preferred = this.world.sonification.bellField?.sourceNode;
    if (preferred && this.world.getAudioAsset(preferred)) return this.world.getAudioAsset(preferred);
    return [...this.world.audio.values()].find((asset) => asset.nodeType === 'audio-recorded' || asset.nodeType === 'audio-original')
      || [...this.world.audio.values()][0]
      || null;
  }

  normalizedCoordinate(node, axis) {
    const [min, max] = this.world.bounds[axis] || [0, 1];
    const value = Number(node?.[axis] || 0);
    return max === min ? 0.5 : clamp((value - min) / (max - min), 0, 1);
  }

  relationBehavior(type) {
    const table = {
      'semantic-similarity': { density: 1.22, duration: 1.18, filter: 1.0, wet: 0.58 },
      'belongs-to-source': { density: 0.78, duration: 1.45, filter: 0.72, wet: 0.40 },
      documentary: { density: 0.72, duration: 1.32, filter: 0.82, wet: 0.34 },
      'text-audio': { density: 1.08, duration: 1.0, filter: 1.2, wet: 0.46 },
      'image-source': { density: 0.92, duration: 1.18, filter: 1.36, wet: 0.50 },
      spatial: { density: 1.0, duration: 1.58, filter: 0.92, wet: 0.72 },
      chronological: { density: 0.66, duration: 1.72, filter: 0.66, wet: 0.62 },
      'derived-from': { density: 1.12, duration: 0.92, filter: 1.48, wet: 0.44 },
      navigation: { density: 1.34, duration: 0.78, filter: 1.12, wet: 0.38 },
    };
    return table[type] || table['semantic-similarity'];
  }

  bellVariantProfile(variant = 'mass') {
    const table = {
      mass: { label: 'masa granular', baseRate: 0.58, baseDuration: 3.2, interval: 1180, wet: 0.62, q: 1.0, filter: 'lowpass', filterBase: 2600, simultaneous: 9, step: 1, noiseMix: 0 },
      granular: { label: 'nube granular', baseRate: 0.92, baseDuration: 0.22, interval: 145, wet: 0.42, q: 1.1, filter: 'lowpass', filterBase: 5200, simultaneous: 7, step: 2, noiseMix: 0 },
      resonant: { label: 'campo resonante', baseRate: 0.72, baseDuration: 1.45, interval: 460, wet: 0.74, q: 6.2, filter: 'bandpass', filterBase: 1800, simultaneous: 6, step: 1, noiseMix: 0 },
      spectral: { label: 'resonancia espectral', baseRate: 0.48, baseDuration: 2.1, interval: 360, wet: 0.70, q: 12.5, filter: 'bandpass', filterBase: 1280, simultaneous: 8, step: 1, noiseMix: 0 },
      harmonic: { label: 'nube armónica', baseRate: 0.42, baseDuration: 4.0, interval: 760, wet: 0.78, q: 3.8, filter: 'bandpass', filterBase: 2100, simultaneous: 10, step: 1, noiseMix: 0 },
      constellation: { label: 'constelación puntual', baseRate: 1.28, baseDuration: 0.16, interval: 210, wet: 0.56, q: 5.8, filter: 'highpass', filterBase: 3900, simultaneous: 5, step: 3, noiseMix: 0.06 },
      pulse: { label: 'pulso relacional', baseRate: 0.86, baseDuration: 0.34, interval: 315, wet: 0.38, q: 3.2, filter: 'bandpass', filterBase: 1500, simultaneous: 4, step: 2, noiseMix: 0.03 },
      noise: { label: 'fricción y ruido', baseRate: 1.66, baseDuration: 0.12, interval: 105, wet: 0.34, q: 0.8, filter: 'highpass', filterBase: 3400, simultaneous: 8, step: 4, noiseMix: 0.34 },
      space: { label: 'espacio reverberante', baseRate: 0.36, baseDuration: 5.1, interval: 1420, wet: 0.88, q: 2.2, filter: 'lowpass', filterBase: 1600, simultaneous: 11, step: 1, noiseMix: 0 },
      morph: { label: 'morfología continua', baseRate: 0.63, baseDuration: 2.8, interval: 520, wet: 0.72, q: 4.6, filter: 'bandpass', filterBase: 2300, simultaneous: 9, step: 1, noiseMix: 0.02 },
      mix: { label: 'mezcla relacional', baseRate: 0.70, baseDuration: 2.2, interval: 390, wet: 0.70, q: 5.2, filter: 'bandpass', filterBase: 2450, simultaneous: 12, step: 1, noiseMix: 0.08 },
    };
    return table[variant] || table.mass;
  }

  planBellField(node, options = {}) {
    const asset = this.bellAsset();
    if (!asset) return this.planRelational(node, options);
    const preview = Boolean(options.preview);
    const requested = String(options.variant || 'mass');
    const variant = Object.prototype.hasOwnProperty.call({ mass:1, granular:1, resonant:1, spectral:1, harmonic:1, constellation:1, pulse:1, noise:1, space:1, morph:1, mix:1 }, requested) ? requested : 'mass';
    const profileVariant = this.bellVariantProfile(variant);
    const group = this.world.relationGroup(node);
    const relationProfile = this.world.relationProfile(node);
    const rootRelation = relationProfile[0]?.type || this.world.dominantRelation(node);
    const maxGroup = Number(this.world.sonification.bellField?.maxGroupNodes || 24);
    const targetCount = preview ? Math.min(8, profileVariant.simultaneous) : Math.max(profileVariant.simultaneous, Number(this.world.sonification.bellField?.vectorGrains || 14));
    const groupNodes = this.world.groupFor(node, maxGroup);
    const vectors = groupNodes.slice(0, targetCount).map((item, index) => {
      const relation = String(item.id) === String(node.id) ? null : this.world.relationBetween(node, item);
      const relationType = relation?.type || (index === 0 ? rootRelation : 'semantic-similarity');
      const behavior = this.relationBehavior(relationType);
      const signature = this.hashNumber(`${item.id}:${item.text || item.label || ''}:${variant}`);
      const x = this.normalizedCoordinate(item, 'x');
      const y = this.normalizedCoordinate(item, 'y');
      const z = this.normalizedCoordinate(item, 'z');
      const density = clamp(this.world.density(item), 0, 1);
      const continuousDetune = ((x - 0.5) * 0.52 + (z - 0.5) * 0.28 + ((signature % 97) - 48) / 700);
      const coordinateRate = 0.72 + continuousDetune;
      const rate = clamp(coordinateRate * profileVariant.baseRate * (0.92 + (signature % 41) / 310), 0.18, 2.8);
      const duration = clamp(profileVariant.baseDuration * behavior.duration * (0.72 + density * 0.78), variant === 'noise' ? 0.045 : 0.08, variant === 'space' ? 9.2 : 7.2);
      const spectralBand = 210 + Math.pow(z, 1.5) * 6200 + density * 1650;
      return {
        id: item.id,
        relationType,
        offsetNorm: ((signature % 1000) / 1000 * 0.54 + x * 0.19 + y * 0.15 + z * 0.12) % 0.95,
        rate,
        duration,
        gain: clamp((0.17 + density * 0.23 + (index === 0 ? 0.10 : 0)) / Math.sqrt(Math.max(1, targetCount / 5)), 0.045, 0.30),
        pan: clamp((x * 2 - 1) * (relationType === 'spatial' ? 1 : 0.86), -0.98, 0.98),
        filterFrequency: clamp(spectralBand * behavior.filter * (variant === 'spectral' ? 0.82 : 1), 180, 7600),
        q: profileVariant.q + (signature % 35) / 10,
        densityFactor: behavior.density,
        wet: clamp((behavior.wet + profileVariant.wet) / 2, 0, 0.92),
        seed: signature,
        noiseMix: profileVariant.noiseMix * (0.65 + density * 0.7),
      };
    });
    const averageDensity = vectors.length ? vectors.reduce((sum, vector) => sum + vector.densityFactor, 0) / vectors.length : 1;
    const intervalMs = clamp(profileVariant.interval / Math.max(0.55, averageDensity), 55, 1900);
    const prompt = this.world.promptFor(node);
    return [{
      kind: 'synth',
      role: 'bell-field',
      variant,
      preview,
      sampleAssetId: asset.id,
      audioId: `campanas:${variant}:${node.id}`,
      audioNodeId: asset.nodeId,
      audioType: 'bell-field-synthesis',
      audioLabel: `${profileVariant.label} · ${group.label}`,
      relationType: rootRelation,
      groupId: group.id,
      groupSize: groupNodes.length,
      vectors,
      intervalMs,
      gain: preview ? 0.84 : 1.0,
      wet: profileVariant.wet,
      profile: profileVariant,
      patternSeed: this.hashNumber(`${group.id}:${node.id}:${variant}`),
      provenance: {
        category: 'realtime-sample-mass',
        source: asset.provenance?.source || asset.label,
        method: 'fragmentación y superposición de la grabación contemporánea según coordenadas, densidad y jerarquía relacional',
        historicalOriginal: false,
        promptId: prompt?.id || null,
      },
      transformations: [
        'segmentación de la grabación de campanas',
        'superposición determinada por vectores',
        'filtrado y resonancia según relaciones',
        'espacialización según coordenadas',
        `modo ${profileVariant.label}`,
      ],
      label: `${profileVariant.label} · ${group.label}`,
    }];
  }

  planRelational(node, options = {}) {
    const preview = Boolean(options.preview);
    const group = this.world.relationGroup(node);
    const profile = this.world.relationProfile(node);
    const types = profile.map((item) => item.type);
    for (const fallback of ['semantic-similarity', 'documentary', 'spatial']) {
      if (!types.includes(fallback)) types.push(fallback);
      if (types.length >= 3) break;
    }

    const maxGroup = Number(this.world.sonification.relational?.maxGroupNodes || 16);
    const configuredVoices = Math.max(6, Number(this.world.sonification.relational?.vectorVoices || 10));
    const vectorVoiceCount = preview ? Math.min(7, configuredVoices) : configuredVoices;
    const groupNodes = this.world.groupFor(node, maxGroup);
    const soundingNodes = groupNodes.slice(0, vectorVoiceCount);
    const heat = groupNodes.length
      ? groupNodes.reduce((sum, item) => sum + this.world.density(item), 0) / groupNodes.length
      : this.world.density(node);
    const clusterShift = this.hashNumber(group.region) % 9;
    const prompt = this.world.promptFor(node);
    const nodeSignature = this.hashNumber(`${node.id}:${node.text || node.label || ''}`);
    const tempo = Math.round(clamp(54 + heat * 82 + (nodeSignature % 23), 50, 148));
    const scaleSets = [
      [0, 2, 5, 7, 9],
      [0, 3, 5, 7, 10],
      [0, 2, 4, 7, 9],
      [0, 1, 5, 7, 8],
      [0, 2, 3, 7, 10],
    ];
    const scale = scaleSets[this.hashNumber(`${group.id}:${node.id}:scale`) % scaleSets.length];
    const rootType = types[0] || 'semantic-similarity';
    const nodeShift = (nodeSignature % 15) - 7;
    const root = clamp((RELATION_FREQUENCIES[rootType] || 110) * (2 ** ((clusterShift - 4 + nodeShift) / 12)), 52, 246);

    const vectors = soundingNodes.map((item, index) => {
      const relation = String(item.id) === String(node.id) ? null : this.world.relationBetween(node, item);
      const relationType = relation?.type || (index === 0 ? rootType : 'semantic-similarity');
      const signature = this.hashNumber(`${item.id}:${item.text || item.label || ''}`);
      const degree = scale[(signature + index * 3) % scale.length];
      const relationOffset = RELATION_INTERVALS[relationType] ?? 0;
      const octave = ((signature >>> 5) % 2) * 12;
      const registerCorrection = index >= 5 ? -12 : 0;
      const semitone = degree + relationOffset + octave + registerCorrection;
      const frequency = clamp(root * (2 ** (semitone / 12)), 55, 1320);
      const nodeHeat = clamp(this.world.density(item), 0, 1);
      const waveform = item.type === 'image'
        ? 'triangle'
        : this.world.isAudioNode(item)
          ? 'sine'
          : item.type === 'document'
            ? 'triangle'
            : ([ 'sine', 'triangle', 'sawtooth' ][(signature + index) % 3] || RELATION_WAVEFORMS[relationType] || 'sine');
      return {
        id: item.id,
        label: this.world.shortLabel(item, 5, 36),
        nodeType: item.type,
        relationType,
        frequency,
        waveform,
        gain: clamp(0.15 + nodeHeat * 0.12 + (index === 0 ? 0.13 : 0), 0.14, 0.39),
        pan: clamp(this.positionPan(item), -0.92, 0.92),
        detune: ((signature % 9) - 4) * 1.2,
        filterFrequency: clamp(620 + nodeHeat * 3300 + index * 130, 420, 5200),
      };
    });

    const shared = {
      kind: 'synth',
      audioNodeId: group.id,
      audioType: 'synthesis-relational',
      audioLabel: group.label,
      provenance: {
        category: 'realtime-vector-synthesis',
        method: 'cada vector aporta una voz; las relaciones determinan intervalos, timbres y orden temporal; no reconstrucción histórica',
        promptId: prompt?.id || null,
      },
      groupId: group.id,
      groupSize: groupNodes.length,
      vectorCount: vectors.length,
      vectors,
      tempo,
      scale,
      filterFrequency: clamp(780 + heat * 3100, 520, 4600),
      patternSeed: this.hashNumber(`${group.id}:${node.id}:vectors`),
      preview,
    };

    const plan = preview ? [
      {
        ...shared,
        role: 'vector-stack',
        audioId: `cursor:${node.id}:acorde`,
        relationType: rootType,
        gain: 0.50,
        label: `preescucha vectorial · ${node.id}`,
        transformations: ['raíz propia del nodo', 'acorde de vecinos', 'panorama por coordenada'],
      },
      {
        ...shared,
        role: 'selected-accent',
        audioId: `cursor:${node.id}:gesto`,
        relationType: rootType,
        gain: 0.30,
        division: 1,
        label: `gesto del vector · ${node.id}`,
        transformations: ['ataque breve', 'registro distintivo', 'ritmo derivado del identificador'],
      },
    ] : [
      {
        ...shared,
        role: 'vector-stack',
        audioId: `vectores:${node.id}:acorde`,
        relationType: rootType,
        gain: 0.72,
        label: `acorde de ${vectors.length} vectores · ${node.id}`,
        transformations: ['una voz por vector', 'intervalos según relación', 'timbre según tipo de nodo', 'panorama según coordenada'],
      },
      {
        ...shared,
        role: 'relation-weave',
        audioId: `vectores:${node.id}:trama`,
        relationType: types[1] || rootType,
        gain: 0.42,
        division: 2,
        label: `trama relacional · ${this.world.relationLabel(types[1] || rootType)}`,
        transformations: ['arpegio de vectores', 'orden según relaciones', 'eco corto', 'tempo según densidad'],
      },
      {
        ...shared,
        role: 'vector-pulse',
        audioId: `vectores:${node.id}:pulso`,
        relationType: types[2] || 'spatial',
        gain: 0.32,
        division: 4,
        label: `pulso de proximidad · ${node.id}`,
        transformations: ['fragmentos breves por vector', 'acentos según densidad', 'registro según posición'],
      },
      {
        ...shared,
        role: 'selected-accent',
        audioId: `vectores:${node.id}:gesto`,
        relationType: rootType,
        gain: 0.38,
        division: 1,
        label: `gesto del vector seleccionado · ${node.id}`,
        transformations: ['ataque definido', 'raíz específica del vector', 'contraste al hacer clic'],
      },
    ];

    const generated = this.world.audioCandidates(node, 8).find((candidate) => candidate.node.type === 'audio-generated');
    const original = this.world.audioCandidates(node, 8).find((candidate) => candidate.node.type === 'audio-original');
    const sample = generated || original;
    if (!preview && sample && plan.length < this.maxVoices) {
      plan.push(this.planItem(sample, {
        gain: generated ? 0.18 : 0.10,
        rate: 1,
        label: generated ? 'música generada desde prompt' : 'registro sonoro contextual',
        transformations: ['mezcla con síntesis vectorial'],
      }));
    }
    return plan.slice(0, this.maxVoices);
  }

  hashNumber(value) {
    let hash = 0;
    const text = String(value || '');
    for (let index = 0; index < text.length; index += 1) hash = ((hash << 5) - hash + text.charCodeAt(index)) | 0;
    return Math.abs(hash);
  }

  positionPan(node) {
    const [min, max] = this.world.bounds.x;
    if (!Number.isFinite(min) || !Number.isFinite(max) || max === min) return 0;
    return ((node.x - min) / (max - min)) * 1.6 - 0.8;
  }

  collectAudioPool(node, neighborCount) {
    const pool = new Map();
    const add = (candidate, distance = 0) => {
      if (!candidate?.asset) return;
      const key = String(candidate.asset.id);
      if (!pool.has(key)) pool.set(key, { ...candidate, distance });
    };
    for (const candidate of this.world.audioCandidates(node, 8)) add(candidate, 0);
    for (const entry of this.world.nearest(node, neighborCount)) {
      for (const candidate of this.world.audioCandidates(entry.node, 2)) add(candidate, entry.distance);
    }
    return [...pool.values()].sort((a, b) => a.distance - b.distance || b.relationWeight - a.relationWeight);
  }

  planItem(candidate, overrides = {}) {
    const asset = candidate.asset;
    return {
      kind: 'sample',
      audioId: asset.id,
      audioNodeId: asset.nodeId,
      audioType: asset.nodeType,
      audioLabel: asset.label,
      provenance: asset.provenance || {},
      relationType: candidate.relationType,
      gain: 0.78,
      rate: 1,
      transformations: [],
      ...overrides,
    };
  }

  async playPlan(plan, generation) {
    if (!plan.length) {
      if (generation === this.generation) this.crossfadeTo([]);
      return;
    }
    await this.ensure();
    const started = performance.now();
    const results = await Promise.allSettled(plan.map(async (item) => {
      if (item.kind === 'synth' && item.sampleAssetId) {
        return { item, synth: true, buffer: await this.getBuffer(item.sampleAssetId, { priority: 'active' }) };
      }
      if (item.kind === 'synth') return { item, synth: true, buffer: null };
      return { item, synth: false, buffer: await this.getBuffer(item.audioId, { priority: 'active' }) };
    }));
    if (generation !== this.generation || this.destroyed) return;
    const playable = results
      .filter((result) => result.status === 'fulfilled' && (result.value.buffer || (result.value.synth && !result.value.item.sampleAssetId)))
      .map((result) => result.value)
      .slice(0, this.maxVoices);
    this.crossfadeTo(playable);
    this.performance.record('audioStart', performance.now() - started);
  }

  async getBuffer(audioId, { priority = 'active' } = {}) {
    const id = String(audioId);
    if (this.cache.has(id)) {
      this.stats.cacheHits += 1;
      const buffer = this.cache.get(id);
      this.cache.delete(id);
      this.cache.set(id, buffer);
      return buffer;
    }
    this.stats.cacheMisses += 1;
    if (this.requests.has(id)) {
      const request = this.requests.get(id);
      if (priority === 'active') request.priority = 'active';
      return request.promise;
    }
    const asset = this.world.getAudioAsset(id);
    if (!asset) return null;

    const controller = new AbortController();
    const request = { controller, priority, promise: null };
    const promise = this.performance.measure('audioDecode', async () => {
      await this.ensure();
      const response = await fetch(asset.url, { signal: controller.signal, cache: 'force-cache' });
      if (!response.ok) throw new Error(`No se pudo cargar el audio ${id} (${response.status}).`);
      const bytes = await response.arrayBuffer();
      const buffer = await this.ctx.decodeAudioData(bytes.slice(0));
      this.cache.set(id, buffer);
      while (this.cache.size > this.cacheSize) {
        const oldest = this.cache.keys().next().value;
        this.cache.delete(oldest);
      }
      return buffer;
    }).catch((error) => {
      if (error.name === 'AbortError') return null;
      throw error;
    }).finally(() => {
      if (this.requests.get(id) === request) this.requests.delete(id);
    });
    request.promise = promise;
    this.requests.set(id, request);
    return promise;
  }

  cancelObsoleteRequests(neededIds = new Set()) {
    for (const [id, request] of this.requests) {
      if (neededIds.has(String(id))) continue;
      request.controller.abort();
      this.stats.abortedRequests += 1;
      this.requests.delete(id);
    }
    for (const handle of this.prefetchHandles) cancelIdle(handle);
    this.prefetchHandles.clear();
  }

  crossfadeTo(playable) {
    if (!this.ctx) return;
    const previous = this.voices;
    const next = [];
    const now = this.ctx.currentTime;

    for (const entry of playable.slice(0, this.maxVoices)) {
      const { item } = entry;
      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0, now);
      const fadeIn = item.preview ? 0.075 : this.crossfadeSeconds;
      gain.gain.linearRampToValueAtTime(item.gain ?? 0.22, now + fadeIn);

      if (entry.synth || item.kind === 'synth') {
        const voice = this.createRelationalVoice(item, gain, now, entry.buffer || null);
        next.push(voice);
      } else {
        const source = this.ctx.createBufferSource();
        source.buffer = entry.buffer;
        source.loop = true;
        source.playbackRate.value = item.rate || 1;
        source.connect(gain);
        gain.connect(this.master);
        source.start(now);
        next.push({ source, gain, item });
      }
      this.stats.startedVoices += 1;
    }

    this.voices = next;
    for (const voice of previous) this.releaseVoice(voice, this.crossfadeSeconds);
  }


  createRelationalVoice(item, gain, now, sampleBuffer = null) {
    gain.connect(this.master);
    const voice = { source: null, gain, item, timers: new Set(), sources: new Set(), stopped: false, delayInput: null };

    if (item.role === 'bell-field' && sampleBuffer) {
      return this.createBellFieldVoice(voice, item, sampleBuffer, now);
    }

    if (item.role === 'vector-stack') {
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(item.filterFrequency || 1800, now);
      filter.Q.value = 0.8;
      filter.connect(gain);
      voice.filter = filter;

      const vectors = Array.isArray(item.vectors) ? item.vectors : [];
      const normalization = 1.55 / Math.sqrt(Math.max(1, vectors.length));
      vectors.forEach((vector, index) => {
        const source = this.ctx.createOscillator();
        const partialGain = this.ctx.createGain();
        const panner = this.ctx.createStereoPanner ? this.ctx.createStereoPanner() : null;
        source.type = vector.waveform || 'sine';
        source.frequency.setValueAtTime(vector.frequency || 110, now);
        source.detune.setValueAtTime(vector.detune || 0, now);
        partialGain.gain.setValueAtTime(0.0001, now);
        partialGain.gain.exponentialRampToValueAtTime(Math.max(0.012, (vector.gain || 0.2) * normalization), now + 0.12 + index * 0.018);
        source.connect(partialGain);
        if (panner) {
          panner.pan.value = vector.pan || 0;
          partialGain.connect(panner);
          panner.connect(filter);
        } else partialGain.connect(filter);
        source.start(now);
        voice.sources.add(source);
      });

      const lfo = this.ctx.createOscillator();
      const lfoGain = this.ctx.createGain();
      lfo.type = 'sine';
      lfo.frequency.value = 0.05 + ((item.patternSeed || 0) % 9) * 0.008;
      lfoGain.gain.value = Math.min(420, (item.filterFrequency || 1800) * 0.16);
      lfo.connect(lfoGain);
      lfoGain.connect(filter.frequency);
      lfo.start(now);
      voice.sources.add(lfo);
      return voice;
    }

    if (item.role === 'relation-weave') {
      const delay = this.ctx.createDelay(0.8);
      const feedback = this.ctx.createGain();
      const wet = this.ctx.createGain();
      delay.delayTime.value = 0.16 + ((item.patternSeed || 0) % 7) * 0.012;
      feedback.gain.value = 0.22;
      wet.gain.value = 0.24;
      delay.connect(feedback);
      feedback.connect(delay);
      delay.connect(wet);
      wet.connect(gain);
      voice.delayInput = delay;
      voice.delay = delay;
      voice.feedback = feedback;
      voice.wet = wet;
    }

    if (item.role === 'drone') {
      const source = this.ctx.createOscillator();
      const filter = this.ctx.createBiquadFilter();
      const panner = this.ctx.createStereoPanner ? this.ctx.createStereoPanner() : null;
      source.type = item.waveform || 'sine';
      source.frequency.setValueAtTime(item.frequency || 110, now);
      source.detune.setValueAtTime(item.detune || 0, now);
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(item.filterFrequency || 1200, now);
      filter.Q.value = 0.9;
      source.connect(filter);
      if (panner) { panner.pan.value = item.pan || 0; filter.connect(panner); panner.connect(gain); }
      else filter.connect(gain);
      source.start(now);
      voice.source = source; voice.filter = filter; voice.panner = panner; voice.sources.add(source);
      return voice;
    }

    this.scheduleRelationalPattern(voice, item);
    return voice;
  }

  createBellFieldVoice(voice, item, buffer, now) {
    const profile = item.profile || this.bellVariantProfile(item.variant);
    const fieldBus = this.ctx.createGain();
    const tone = this.ctx.createBiquadFilter();
    const wetSend = this.ctx.createGain();
    tone.type = profile.filter || 'lowpass';
    tone.frequency.value = profile.filterBase || 2400;
    tone.Q.value = Math.max(0.3, Math.min(18, profile.q || 1));
    fieldBus.gain.value = 1;
    wetSend.gain.value = clamp(item.wet ?? profile.wet ?? 0.5, 0, 0.92);
    fieldBus.connect(tone);
    tone.connect(voice.gain);
    tone.connect(wetSend);
    if (this.reverb) wetSend.connect(this.reverb);
    voice.fieldBus = fieldBus;
    voice.filter = tone;
    voice.wetSend = wetSend;
    voice.sampleBuffer = buffer;

    const vectors = Array.isArray(item.vectors) ? item.vectors : [];
    const simultaneous = item.preview ? Math.min(4, vectors.length) : Math.min(profile.simultaneous || 7, vectors.length);
    for (let index = 0; index < simultaneous; index += 1) {
      const timer = window.setTimeout(() => {
        voice.timers.delete(timer);
        this.triggerBellGrain(voice, item, vectors[index % Math.max(1, vectors.length)], index);
      }, index * (item.variant === 'granular' || item.variant === 'noise' ? 24 : item.variant === 'constellation' ? 48 : 72));
      voice.timers.add(timer);
    }

    let step = simultaneous;
    const cycle = () => {
      if (voice.stopped || this.destroyed || !this.ctx || !vectors.length) return;
      const vector = vectors[step % vectors.length];
      this.triggerBellGrain(voice, item, vector, step);
      step += Math.max(1, profile.step || 1);
      if (item.variant === 'mix') step += (step + item.patternSeed) % 3 === 0 ? 1 : 0;
      const jitterRange = item.variant === 'pulse' ? 0.14 : item.variant === 'morph' ? 0.08 : 0.28;
      const jitter = 1 - jitterRange / 2 + (((item.patternSeed + step * 19) % 97) / 96) * jitterRange;
      const previewFactor = item.preview ? 1.28 : 1;
      const delay = Math.max(42, Number(item.intervalMs || 320) * jitter * previewFactor);
      const timer = window.setTimeout(() => { voice.timers.delete(timer); cycle(); }, delay);
      voice.timers.add(timer);
    };
    const cycleTimer = window.setTimeout(() => { voice.timers.delete(cycleTimer); cycle(); }, item.preview ? 240 : 120);
    voice.timers.add(cycleTimer);
    return voice;
  }

  triggerBellGrain(voice, item, vector, step = 0) {
    if (!vector || voice.stopped || !this.ctx || !voice.sampleBuffer) return;
    const profile = item.profile || this.bellVariantProfile(item.variant);
    const now = this.ctx.currentTime;
    const buffer = voice.sampleBuffer;
    const source = this.ctx.createBufferSource();
    const envelope = this.ctx.createGain();
    const filter = this.ctx.createBiquadFilter();
    const panner = this.ctx.createStereoPanner ? this.ctx.createStereoPanner() : null;
    source.buffer = buffer;

    let rateDrift = (((vector.seed + step * 37) % 101) - 50) / 5000;
    if (item.variant === 'morph') rateDrift += Math.sin((step + vector.seed % 31) * 0.19) * 0.09;
    if (item.variant === 'harmonic') rateDrift *= 0.25;
    if (item.variant === 'noise') rateDrift += (((vector.seed + step * 13) % 37) - 18) / 80;
    source.playbackRate.setValueAtTime(clamp(vector.rate + rateDrift, 0.16, 3.2), now);

    let duration = clamp(vector.duration * (0.84 + ((vector.seed + step * 11) % 31) / 100), 0.045, 9.5);
    if (item.variant === 'pulse') duration *= step % 4 === 0 ? 1.45 : 0.58;
    if (item.variant === 'constellation') duration *= 0.52 + ((step + vector.seed) % 7) / 13;
    const sourceDuration = Math.min(buffer.duration * 0.88, duration * Math.max(0.22, source.playbackRate.value));
    const safeRange = Math.max(0.01, buffer.duration - sourceDuration - 0.02);
    let movingOffset = (vector.offsetNorm + ((step * 0.017 + vector.seed * 0.00001) % 0.18)) % 0.96;
    if (item.variant === 'pulse') movingOffset = (vector.offsetNorm + (step % 8) * 0.031) % 0.96;
    const offset = clamp(movingOffset * safeRange, 0, Math.max(0, buffer.duration - 0.03));

    filter.type = profile.filter || 'lowpass';
    if (item.variant === 'mix') {
      const types = ['bandpass', 'lowpass', 'highpass'];
      filter.type = types[(step + vector.seed) % types.length];
    }
    if (item.variant === 'noise') filter.type = step % 2 ? 'highpass' : 'bandpass';
    let filterFrequency = vector.filterFrequency;
    if (item.variant === 'spectral') filterFrequency *= 0.72 + ((step + vector.seed) % 9) * 0.09;
    if (item.variant === 'harmonic') filterFrequency *= [0.5, 0.75, 1, 1.5, 2][(step + vector.seed) % 5];
    if (item.variant === 'morph') filterFrequency *= 0.65 + (Math.sin(step * 0.13) + 1) * 0.48;
    filter.frequency.setValueAtTime(clamp(filterFrequency, 150, 9200), now);
    filter.Q.value = clamp(vector.q, 0.25, 22);

    const isTiny = item.variant === 'granular' || item.variant === 'noise' || item.variant === 'constellation';
    const attack = isTiny ? Math.min(0.028, duration * 0.19) : Math.min(0.34, duration * 0.18);
    const release = item.variant === 'space' ? Math.min(4.2, duration * 0.82)
      : item.variant === 'mass' || item.variant === 'harmonic' ? Math.min(2.8, duration * 0.74)
        : Math.min(0.95, duration * 0.64);
    let peak = clamp(vector.gain * (item.preview ? 0.88 : 1.22), 0.028, 0.40);
    if (item.variant === 'pulse') peak *= step % 4 === 0 ? 1.28 : 0.74;
    if (item.variant === 'noise') peak *= 0.76;
    envelope.gain.setValueAtTime(0.0001, now);
    envelope.gain.exponentialRampToValueAtTime(Math.max(0.001, peak), now + Math.max(0.006, attack));
    envelope.gain.setValueAtTime(Math.max(0.0002, peak * 0.90), now + Math.max(0.01, duration - release));
    envelope.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    source.connect(filter);
    filter.connect(envelope);
    if (panner) {
      let movement = 0;
      if (item.variant === 'granular' || item.variant === 'constellation' || item.variant === 'noise') movement = Math.sin((step + vector.seed % 17) * 0.71) * 0.22;
      if (item.variant === 'space') movement = Math.sin(step * 0.23) * 0.34;
      panner.pan.value = clamp(vector.pan + movement, -1, 1);
      envelope.connect(panner);
      panner.connect(voice.fieldBus);
    } else envelope.connect(voice.fieldBus);

    source.start(now, offset, Math.max(0.025, sourceDuration));
    source.stop(now + duration + 0.12);
    voice.sources.add(source);
    source.onended = () => voice.sources.delete(source);
  }

  scheduleRelationalPattern(voice, item) {
    const beatMs = 60000 / Math.max(36, Number(item.tempo || 72));
    const intervalMs = beatMs / Math.max(1, Number(item.division || 2));
    const vectors = Array.isArray(item.vectors) && item.vectors.length ? item.vectors : null;
    const scale = Array.isArray(item.scale) && item.scale.length ? item.scale : [0, 3, 7, 10];
    let step = (item.patternSeed || 0) % (vectors?.length || scale.length);

    const trigger = () => {
      if (voice.stopped || this.destroyed || !this.ctx) return;
      const now = this.ctx.currentTime;
      const vector = vectors ? vectors[step % vectors.length] : null;
      const seedStep = ((item.patternSeed || 0) + step * 7) % scale.length;
      const semitone = scale[seedStep] + (item.role === 'spark' && step % 3 === 0 ? 12 : 0);
      let frequency = vector?.frequency || clamp((item.frequency || 220) * (2 ** (semitone / 12)), 72, 1760);
      if (item.role === 'vector-pulse' && step % 4 === 0) frequency *= 0.5;
      frequency = clamp(frequency, 48, 1760);

      const source = this.ctx.createOscillator();
      const noteGain = this.ctx.createGain();
      const filter = this.ctx.createBiquadFilter();
      const panner = this.ctx.createStereoPanner ? this.ctx.createStereoPanner() : null;
      source.type = vector?.waveform || item.waveform || 'sine';
      source.frequency.setValueAtTime(frequency, now);
      source.detune.setValueAtTime(vector?.detune || item.detune || 0, now);
      filter.type = item.role === 'vector-pulse' || item.role === 'spark' || item.role === 'selected-accent' ? 'bandpass' : 'lowpass';
      filter.frequency.setValueAtTime(vector?.filterFrequency || item.filterFrequency || 1800, now);
      filter.Q.value = item.role === 'selected-accent' ? 3.4 : item.role === 'vector-pulse' ? 2.8 : item.role === 'spark' ? 2.2 : 1.15;

      const peak = item.role === 'selected-accent' ? 0.95 : item.role === 'vector-pulse' ? 0.72 : item.role === 'relation-weave' ? 0.82 : 0.76;
      const duration = Math.max(0.07, item.role === 'selected-accent' ? 0.18 : (intervalMs / 1000) * (item.role === 'relation-weave' ? 0.78 : 0.38));
      noteGain.gain.setValueAtTime(0.0001, now);
      noteGain.gain.exponentialRampToValueAtTime(Math.max(0.001, peak), now + 0.014);
      noteGain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
      source.connect(filter);
      filter.connect(noteGain);

      let output = noteGain;
      if (panner) {
        panner.pan.value = clamp((vector?.pan || item.pan || 0) + ((step % 3) - 1) * 0.08, -1, 1);
        noteGain.connect(panner);
        output = panner;
      }
      output.connect(voice.gain);
      if (voice.delayInput) output.connect(voice.delayInput);

      source.start(now);
      source.stop(now + duration + 0.04);
      voice.sources.add(source);
      source.onended = () => voice.sources.delete(source);
      step += item.role === 'relation-weave' || item.role === 'selected-accent' ? 1 : 2;
      const jitter = item.role === 'vector-pulse' ? ((item.patternSeed + step * 13) % 5) * 0.045 : 0;
      const repeatFactor = item.role === 'selected-accent' ? 1.8 : 1;
      const timer = window.setTimeout(() => { voice.timers.delete(timer); trigger(); }, intervalMs * (1 + jitter) * repeatFactor);
      voice.timers.add(timer);
    };
    trigger();
  }

  releaseVoice(voice, fade = 0.12) {
    if (!voice || !this.ctx) return;
    voice.stopped = true;
    for (const timer of voice.timers || []) window.clearTimeout(timer);
    voice.timers?.clear?.();
    const now = this.ctx.currentTime;
    const end = now + fade;
    try {
      voice.gain.gain.cancelScheduledValues(now);
      voice.gain.gain.setValueAtTime(Math.max(0.0001, voice.gain.gain.value), now);
      voice.gain.gain.linearRampToValueAtTime(0.0001, end);
      if (voice.source) voice.source.stop(end + 0.04);
      for (const source of voice.sources || []) { try { source.stop(end + 0.04); } catch (_) { /* ya terminado */ } }
    } catch (_) {
      // La voz ya terminó o el contexto se cerró.
    }
  }

  stopVoices(fade = 0.12) {
    const previous = this.voices;
    this.voices = [];
    for (const voice of previous) this.releaseVoice(voice, fade);
  }

  stop(fade = 0.12) {
    this.generation += 1;
    this.cancelObsoleteRequests(new Set());
    this.stopVoices(fade);
    this.currentNode = null;
  }

  prefetchAround(node, protectedIds = new Set()) {
    if (!this.userInteracted || this.destroyed) return;
    const ids = [];
    for (const entry of this.world.nearest(node, 5)) {
      for (const candidate of this.world.audioCandidates(entry.node, 1)) {
        const id = String(candidate.asset.id);
        if (!protectedIds.has(id) && !this.cache.has(id) && !ids.includes(id)) ids.push(id);
      }
      if (ids.length >= 2) break;
    }
    if (!ids.length) return;
    const handle = idle(() => {
      this.prefetchHandles.delete(handle);
      for (const id of ids) void this.getBuffer(id, { priority: 'prefetch' }).catch(() => {});
    }, 900);
    this.prefetchHandles.add(handle);
  }

  async recordingStream() {
    await this.ensure();
    return this.recordDest?.stream || null;
  }

  async startRecording() {
    await this.ensure();
    if (!window.MediaRecorder) throw new Error('MediaRecorder no está disponible en este navegador.');
    this.chunks = [];
    let options = {};
    for (const type of ['audio/webm;codecs=opus', 'audio/ogg;codecs=opus', 'audio/webm']) {
      if (MediaRecorder.isTypeSupported(type)) { options = { mimeType: type }; break; }
    }
    this.mediaRecorder = new MediaRecorder(this.recordDest.stream, options);
    this.mediaRecorder.ondataavailable = (event) => { if (event.data.size) this.chunks.push(event.data); };
    this.mediaRecorder.start(1000);
  }

  stopRecording(filename = 'navegacion-sonora.webm') {
    return new Promise((resolve) => {
      if (!this.mediaRecorder || this.mediaRecorder.state === 'inactive') return resolve(null);
      this.mediaRecorder.onstop = () => {
        const blob = new Blob(this.chunks, { type: this.mediaRecorder.mimeType || 'audio/webm' });
        downloadBlob(blob, filename);
        resolve(blob);
      };
      this.mediaRecorder.stop();
    });
  }

  destroy() {
    this.destroyed = true;
    this.stop(0.04);
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      try { this.mediaRecorder.stop(); } catch (_) { /* sin acción */ }
    }
    this.cache.clear();
    this.requests.clear();
    if (this.ctx) void this.ctx.close();
    this.ctx = null;
    this.master = null;
    this.compressor = null;
    this.output = null;
    this.recordDest = null;
    this.reverb = null;
    this.reverbReturn = null;
  }
}
