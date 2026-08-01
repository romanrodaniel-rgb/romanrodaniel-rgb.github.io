const TYPE_COLORS = Object.freeze({
  document: '#f5f7fa',
  'document-page': '#b9d7ff',
  'text-fragment': '#70aef8',
  map: '#62d6b4',
  image: '#8fe388',
  place: '#ffd166',
  person: '#ff8fab',
  object: '#a9b8ff',
  'audio-original': '#ff9f43',
  'audio-recorded': '#ff7b72',
  'audio-generated': '#d08cff',
  derived: '#67d5d1',
  session: '#d4d4d4',
});
const RELATION_COLORS = Object.freeze({
  'belongs-to-source': '#5ca8ff',
  'text-audio': '#ff9f43',
  'image-source': '#8fe388',
  'derived-from': '#d08cff',
  documentary: '#f5f7fa',
  chronological: '#ffd166',
  spatial: '#67d5d1',
  'semantic-similarity': '#91a0b2',
  navigation: '#ff8fab',
});

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const lerp = (a, b, t) => a + (b - a) * t;
const smoothstep = (edge0, edge1, value) => {
  const x = clamp((value - edge0) / Math.max(1e-6, edge1 - edge0), 0, 1);
  return x * x * (3 - 2 * x);
};

function parseHex(hex) {
  const value = String(hex || '#ffffff').replace('#', '');
  if (value.length !== 6) return { r: 255, g: 255, b: 255 };
  return {
    r: Number.parseInt(value.slice(0, 2), 16),
    g: Number.parseInt(value.slice(2, 4), 16),
    b: Number.parseInt(value.slice(4, 6), 16),
  };
}

function hslToRgb(h, s, l) {
  h = ((h % 360) + 360) % 360;
  s /= 100;
  l /= 100;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs((h / 60) % 2 - 1));
  const m = l - c / 2;
  let r = 0; let g = 0; let b = 0;
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  return { r: Math.round((r + m) * 255), g: Math.round((g + m) * 255), b: Math.round((b + m) * 255) };
}

function cssColorToRgb(color) {
  const hsl = String(color).match(/hsl\(([-\d.]+)\s+([-\d.]+)%\s+([-\d.]+)%\)/i);
  if (hsl) return hslToRgb(Number(hsl[1]), Number(hsl[2]), Number(hsl[3]));
  return parseHex(color);
}

export class Renderer {
  constructor(world, elementId, performanceMonitor, options = {}) {
    this.world = world;
    this.element = document.getElementById(elementId);
    this.performance = performanceMonitor;
    this.onPreview = () => {};
    this.onConfirm = () => {};
    this.onProgress = () => {};
    this.onAdaptive = () => {};
    this.onScaleChange = () => {};
    this.config = this.world.manifest.rendering || {};
    this.requestedMode = options.mode || '3d';
    this.is3D = this.requestedMode !== '2d' && this.world.dimensions !== 2;
    this.secondaryEffects = options.secondaryEffects !== false;
    this.showLinks = options.showLinks === true;
    this.showAxes = options.showAxes !== false;
    this.colorMode = options.colorMode || this.config.colorModeDefault || 'relation-hierarchy';
    this.imageScale = clamp(Number(options.imageScale) || 1, 0.28, 2.2);
    this.quality = options.quality || this.config.qualityDefault || 'balanced';
    this.workspaceMode = options.workspaceMode || 'research';
    this.knowledgeScale = options.knowledgeScale || 'auto';
    this.representationMode = ['territories', 'constellation', 'flows', 'textures', 'tides', 'orbits'].includes(options.representationMode)
      ? options.representationMode
      : 'nodes';
    this.materialOverlay = options.materialOverlay === true;
    this.visualTemperature = clamp(Number(options.visualTemperature) || 0, 0, 100);
    this.nodeScope = ['archive', 'generated'].includes(options.nodeScope) ? options.nodeScope : 'all';
    this.resolvedKnowledgeScale = null;
    this.lastScaleStatus = '';
    this.route = [];
    this.stats = { previews: 0, confirmations: 0, plotUpdates: 0 };
    this.destroyed = false;
    this.hoverNode = null;
    this.selectedNode = null;
    this.searchIds = new Set();
    this.groupIds = new Set();
    this.pointer = { x: 0, y: 0, inside: false };
    this.coarsePointer = Boolean(window.matchMedia?.('(pointer: coarse)').matches || window.innerWidth <= 700);
    this.activePointers = new Map();
    this.pinch = null;
    this.drag = null;
    this.dwellEnabled = false;
    this.dwellDelay = 450;
    this.dwellTimer = 0;
    this.lastPreviewAt = 0;
    this.lastPreviewId = null;
    this.canvas = null;
    this.ctx = null;
    this.raf = 0;
    this.lastFrame = performance.now();
    this.lastDrawAt = 0;
    this.renderMsEMA = 0;
    this.adaptiveLevel = 0;
    this.lastAdaptiveAt = 0;
    this.camera = {
      yaw: -0.58,
      pitch: 0.33,
      distance: 3.55,
      targetDistance: 3.55,
      panX: 0,
      panY: 0,
      targetPanX: 0,
      targetPanY: 0,
      focal: 2.35,
    };
    this.displayPositions = new Map();
    this.transition = null;
    this.projected = [];
    this.imageCache = new Map();
    this.lastImageSyncAt = 0;
    this.resizeObserver = null;
    this.progressiveIds = new Set();
    this.progressiveHandle = 0;
    this.territorialIds = this.buildTerritorialRepresentatives();
    this.sonicContextIds = this.buildSonicContext();
    this.orbitCenters = this.buildOrbitCenters();
    this.bound = {};
  }

  buildTerritorialRepresentatives() {
    const representatives = new Set();
    const regions = this.world.regions instanceof Map
      ? this.world.regions
      : new Map((this.world.nodes || []).map((node) => [String(node.region || 'default'), []]));
    if (!(this.world.regions instanceof Map)) {
      for (const node of this.world.nodes || []) regions.get(String(node.region || 'default')).push(node);
    }
    for (const nodes of regions.values()) {
      if (!nodes.length) continue;
      const centroid = nodes.reduce((acc, node) => ({
        x: acc.x + node.x / nodes.length,
        y: acc.y + node.y / nodes.length,
        z: acc.z + node.z / nodes.length,
      }), { x: 0, y: 0, z: 0 });
      const representative = [...nodes].sort((a, b) => (
        Math.hypot(a.x - centroid.x, a.y - centroid.y, a.z - centroid.z)
        - Math.hypot(b.x - centroid.x, b.y - centroid.y, b.z - centroid.z)
      ))[0];
      if (representative) representatives.add(String(representative.id));
    }
    return representatives;
  }

  buildSonicContext() {
    const ids = new Set();
    for (const node of this.world.nodes || []) {
      if (!this.world.isAudioNode?.(node)) continue;
      ids.add(String(node.id));
      for (const relation of this.world.relationsFor?.(node) || []) {
        ids.add(String(relation.source));
        ids.add(String(relation.target));
      }
    }
    return ids;
  }

  buildOrbitCenters() {
    if (!this.world?.bounds || !Array.isArray(this.world?.nodes)) return new Map();
    const normalized = this.normalizePositions();
    const groups = new Map();
    for (const node of this.world.nodes || []) {
      const key = String(node.region || 'default');
      const list = groups.get(key) || [];
      const position = normalized.get(String(node.id));
      if (position) list.push(position);
      groups.set(key, list);
    }
    const centers = new Map();
    for (const [key, positions] of groups) {
      const count = Math.max(1, positions.length);
      centers.set(key, positions.reduce((center, position) => ({
        x: center.x + position.x / count,
        y: center.y + position.y / count,
        z: center.z + position.z / count,
      }), { x: 0, y: 0, z: 0 }));
    }
    return centers;
  }

  setWorkspaceMode(mode = 'research') {
    this.workspaceMode = mode === 'composition' ? 'composition' : 'research';
    this.emitProfile();
  }

  setKnowledgeScale(scale = 'auto') {
    const accepted = new Set(['all', 'auto', 'territorial', 'documentary', 'sonic']);
    this.knowledgeScale = accepted.has(scale) ? scale : 'auto';
    this.lastScaleStatus = '';
    this.updateResolvedScale(true);
    this.emitProfile();
  }

  currentKnowledgeScale() {
    if (this.knowledgeScale !== 'auto') return this.knowledgeScale;
    if (this.camera.distance >= 4.6) return 'territorial';
    if (this.camera.distance >= 1.85) return 'documentary';
    return 'sonic';
  }

  updateResolvedScale(force = false) {
    const next = this.currentKnowledgeScale();
    if (!force && next === this.resolvedKnowledgeScale) return;
    this.resolvedKnowledgeScale = next;
    this.emitScaleStatus(force);
  }

  emitScaleStatus(force = false) {
    const next = this.currentKnowledgeScale();
    const status = [
      this.knowledgeScale,
      next,
      this.projected.length,
      this.progressiveIds.size,
      this.world.nodes.length,
    ].join(':');
    if (!force && status === this.lastScaleStatus) return;
    this.lastScaleStatus = status;
    this.onScaleChange({
      requested: this.knowledgeScale,
      resolved: next,
      visible: this.projected.length,
      loaded: this.progressiveIds.size,
      total: this.world.nodes.length,
    });
  }

  nodeInKnowledgeScale(node) {
    const id = String(node.id);
    if (this.searchIds.has(id) || this.groupIds.has(id) || id === String(this.selectedNode?.id ?? '')) return true;
    const generated = this.world.isGeneratedNode(node);
    if (this.nodeScope === 'archive' && generated) return false;
    if (this.nodeScope === 'generated' && !generated) return false;
    const scale = this.currentKnowledgeScale();
    if (scale === 'all') return true;
    if (scale === 'territorial') return this.territorialIds.has(id);
    if (scale === 'sonic') return this.sonicContextIds.has(id);
    return !this.world.isAudioNode(node);
  }

  nodeInRepresentation(node) {
    if (this.representationMode !== 'constellation' || !this.selectedNode) return true;
    return this.groupIds.has(String(node.id)) || String(node.id) === String(this.selectedNode.id);
  }
  startProgressiveReveal() {
    if (this.progressiveHandle) {
      (window.cancelIdleCallback || window.clearTimeout)(this.progressiveHandle);
      this.progressiveHandle = 0;
    }
    this.progressiveIds.clear();
    const threshold = Number(this.config.progressiveThreshold || 3000);
    if (this.world.nodes.length <= threshold) {
      for (const node of this.world.nodes) this.progressiveIds.add(String(node.id));
      this.onProgress({ loaded: this.progressiveIds.size, total: this.world.nodes.length, regions: this.world.regions.size });
      return;
    }
    const batches = this.world.regionBatches(Number(this.config.progressiveBatchSize || 700));
    let index = 0;
    const reveal = () => {
      for (const node of batches[index] || []) this.progressiveIds.add(String(node.id));
      index += 1;
      this.onProgress({
        loaded: this.progressiveIds.size,
        total: this.world.nodes.length,
        regions: Math.min(index, batches.length),
      });
      if (index < batches.length && !this.destroyed) {
        this.progressiveHandle = (window.requestIdleCallback || window.setTimeout)(reveal);
      } else {
        this.progressiveHandle = 0;
      }
    };
    reveal();
  }

  setDwell(enabled, delay = 450) {
    this.dwellEnabled = Boolean(enabled);
    this.dwellDelay = Math.max(250, Number(delay) || 450);
    if (!this.dwellEnabled) this.cancelDwell();
  }

  setSecondaryEffects(enabled) {
    this.secondaryEffects = Boolean(enabled);
    this.emitProfile();
  }

  setShowLinks(enabled) {
    this.showLinks = Boolean(enabled);
    this.emitProfile();
  }

  setShowAxes(enabled) {
    this.showAxes = Boolean(enabled);
    this.emitProfile();
  }

  setRepresentationMode(mode = 'nodes') {
    this.representationMode = ['territories', 'constellation', 'flows', 'textures', 'tides', 'orbits'].includes(mode) ? mode : 'nodes';
    this.displayPositions = this.layoutPositions(this.representationMode);
    this.transition = null;
    this.camera.targetDistance = 3.55;
    this.camera.targetPanX = 0;
    this.camera.targetPanY = 0;
    this.emitProfile();
  }

  setMaterialOverlay(enabled) {
    this.materialOverlay = Boolean(enabled);
    this.emitProfile();
  }

  setVisualTemperature(value = 0) {
    this.visualTemperature = clamp(Number(value) || 0, 0, 100);
    this.emitProfile();
  }

  setNodeScope(scope = 'all') {
    this.nodeScope = ['archive', 'generated'].includes(scope) ? scope : 'all';
    this.lastScaleStatus = '';
    this.emitProfile();
  }

  async setColorMode(mode) {
    this.colorMode = mode || 'relation-hierarchy';
    this.emitProfile();
  }

  setImageScale(value = 1) {
    this.imageScale = clamp(Number(value) || 1, 0.28, 2.2);
    this.emitProfile();
  }

  pixelRatio() {
    const dpr = Number(window.devicePixelRatio || 1);
    if (this.coarsePointer) {
      if (this.quality === 'high') return Math.min(1.75, Math.max(1.25, dpr));
      if (this.quality === 'balanced') return Math.min(1.35, Math.max(1, dpr));
      return 1;
    }
    if (this.quality === 'fluid') return 1;
    if (this.quality === 'high') return Math.min(3, Math.max(2, dpr * 1.28));
    return Math.min(2.25, Math.max(1.25, dpr));
  }

  performanceProfile() {
    return {
      mode: this.is3D ? 'Proyector espacial Canvas' : 'Plano Canvas',
      adaptiveLevel: this.adaptiveLevel,
      labels: this.labelCount(),
      imageScale: this.imageScale,
      relations: this.showLinks ? Number(this.config.visibleRelationLimit || 8) : 0,
      secondaryEffects: this.secondaryEffects,
      showLinks: this.showLinks,
      showAxes: this.showAxes,
      representationMode: this.representationMode,
      colorMode: this.colorMode,
      projection: this.world.activeProjection,
      quality: this.quality,
      imageCache: this.imageCache.size,
      workspaceMode: this.workspaceMode,
      knowledgeScale: this.currentKnowledgeScale(),
      nodeScope: this.nodeScope,
      loadedNodes: this.progressiveIds.size,
    };
  }

  labelCount() {
    return this.hoverNode || this.selectedNode ? 1 : 0;
  }

  emitProfile() { this.onAdaptive(this.performanceProfile()); }

  hashHue(value) {
    let hash = 0;
    const text = String(value || 'default');
    for (let index = 0; index < text.length; index += 1) hash = ((hash << 5) - hash + text.charCodeAt(index)) | 0;
    return Math.abs(hash) % 360;
  }

  nodeColor(node) {
    if (this.colorMode === 'cluster' || this.colorMode === 'relation-hierarchy') {
      const hue = this.hashHue(node.region || 'default');
      const density = clamp(Number(this.world.density(node) || 0), 0, 1);
      return `hsl(${hue} ${this.colorMode === 'relation-hierarchy' ? 68 : 76}% ${48 + density * 13}%)`;
    }
    if (this.colorMode === 'source') {
      const source = node.metadata?.source || node.metadata?.sourceId || node.metadata?.sourceFile || node.type;
      return `hsl(${this.hashHue(source)} 68% 60%)`;
    }
    if (this.colorMode === 'relation') return RELATION_COLORS[this.world.dominantRelation(node)] || '#9aa8b7';
    return TYPE_COLORS[node.type] || '#89939f';
  }

  baseNodeSize(node) {
    if (node.type === 'image') return 7.2;
    if (this.world.isAudioNode(node)) return 5.8;
    if (node.type === 'document') return 5.4;
    if (node.type === 'document-page') return 4.7;
    return 4.0;
  }

  normalizePositions() {
    const axes = ['x', 'y', 'z'];
    const center = {};
    const span = {};
    for (const axis of axes) {
      const bounds = this.world.bounds[axis] || [0, 1];
      center[axis] = (Number(bounds[0]) + Number(bounds[1])) / 2;
      span[axis] = Math.max(1e-6, Number(bounds[1]) - Number(bounds[0]));
    }
    const maxSpan = Math.max(span.x, span.y, this.is3D ? span.z : 0.0001);
    const map = new Map();
    for (const node of this.world.nodes) {
      map.set(String(node.id), {
        x: ((Number(node.x) - center.x) / maxSpan) * 2,
        y: ((Number(node.y) - center.y) / maxSpan) * 2,
        z: this.is3D ? ((Number(node.z) - center.z) / maxSpan) * 2 : 0,
      });
    }
    return map;
  }

  nodeYear(node) {
    const candidates = [
      node.metadata?.year,
      node.metadata?.date,
      node.metadata?.created,
      node.metadata?.period,
      node.label,
    ];
    for (const candidate of candidates) {
      const match = String(candidate || '').match(/\b(0?[7-9]\d{2}|1\d{3}|20\d{2})\b/);
      if (match) return Number(match[1]);
    }
    return null;
  }

  materialFamily(node) {
    if (this.world.isAudioNode(node)) return 'audio';
    if (node.type === 'image' || node.type === 'map') return 'image';
    if (node.type === 'person' || node.type === 'place') return 'entity';
    if (node.type === 'document' || node.type === 'document-page') return 'document';
    return 'text';
  }

  layoutPositions(mode = 'nodes') {
    if (!['timeline', 'matrix'].includes(mode)) return this.normalizePositions();
    const nodes = this.world.nodes || [];
    const map = new Map();
    if (mode === 'timeline') {
      const dated = nodes.map((node) => this.nodeYear(node)).filter(Number.isFinite);
      const minYear = dated.length ? Math.min(...dated) : 0;
      const maxYear = dated.length ? Math.max(...dated) : minYear + 1;
      const span = Math.max(1, maxYear - minYear);
      const families = ['document', 'text', 'image', 'audio', 'entity'];
      nodes.forEach((node, index) => {
        const year = this.nodeYear(node);
        const family = this.materialFamily(node);
        const lane = Math.max(0, families.indexOf(family));
        const fallback = (index % 29) / 28;
        const progress = Number.isFinite(year) ? (year - minYear) / span : fallback;
        const jitter = ((this.hashHue(node.id) % 17) - 8) / 180;
        map.set(String(node.id), {
          x: -1.72 + progress * 3.44,
          y: 1.25 - lane * 0.62 + jitter,
          z: 0,
        });
      });
      return map;
    }

    const regions = [...new Set(nodes.map((node) => String(node.region || 'sin región')))].slice(0, 8);
    const families = ['document', 'text', 'image', 'audio', 'entity'];
    nodes.forEach((node, index) => {
      const regionName = String(node.region || 'sin región');
      let column = regions.indexOf(regionName);
      if (column < 0) column = Math.abs(this.hashHue(regionName)) % Math.max(1, regions.length);
      const row = Math.max(0, families.indexOf(this.materialFamily(node)));
      const seed = this.hashHue(`${node.id}:${index}`);
      const jx = ((seed % 19) - 9) / 95;
      const jy = (((seed * 7) % 17) - 8) / 110;
      const columns = Math.max(1, regions.length);
      map.set(String(node.id), {
        x: columns === 1 ? 0 : -1.65 + column * (3.3 / (columns - 1)) + jx,
        y: 1.25 - row * 0.62 + jy,
        z: 0,
      });
    });
    return map;
  }


  imageCacheLimit() {
    const configured = Number(this.config.visibleImageLimit || 10);
    if (this.quality === 'fluid') return Math.min(configured, 5);
    if (this.quality === 'high') return Math.max(configured, 14);
    return configured;
  }

  requestImage(node, time) {
    const id = String(node.id);
    const existing = this.imageCache.get(id);
    if (existing) {
      existing.lastUsed = time;
      return;
    }
    const url = this.world.thumbnailUrl(node);
    if (!url) return;
    const image = new Image();
    const entry = { image, ready: false, failed: false, lastUsed: time, url };
    image.decoding = 'async';
    image.onload = () => {
      if (this.destroyed) return;
      entry.ready = true;
    };
    image.onerror = () => {
      entry.failed = true;
      entry.ready = false;
    };
    image.src = url;
    this.imageCache.set(id, entry);
  }

  releaseImage(id) {
    const entry = this.imageCache.get(String(id));
    if (!entry) return;
    entry.image.onload = null;
    entry.image.onerror = null;
    entry.image.removeAttribute?.('src');
    this.imageCache.delete(String(id));
  }

  syncImageCache(time) {
    if (time - this.lastImageSyncAt < 220) return;
    this.lastImageSyncAt = time;
    const limit = this.imageCacheLimit();
    const candidates = this.projected
      .filter((item) => item.node.type === 'image' && (
        item.visual?.size >= (this.materialOverlay ? 4.8 : 9.2)
        || item.visual?.selected
        || item.visual?.hovered
      ))
      .sort((a, b) => {
        const priorityA = (a.visual?.selected ? 4 : 0) + (a.visual?.hovered ? 2 : 0);
        const priorityB = (b.visual?.selected ? 4 : 0) + (b.visual?.hovered ? 2 : 0);
        if (priorityA !== priorityB) return priorityB - priorityA;
        return Number(b.visual?.size || 0) - Number(a.visual?.size || 0);
      })
      .slice(0, limit);
    const active = new Set(candidates.map((item) => String(item.node.id)));
    for (const item of candidates) this.requestImage(item.node, time);

    const releaseAfter = Number(this.config.imageCacheReleaseMs || 3500);
    const entries = [...this.imageCache.entries()]
      .sort((a, b) => a[1].lastUsed - b[1].lastUsed);
    for (const [id, entry] of entries) {
      if (active.has(id)) {
        entry.lastUsed = time;
        continue;
      }
      if (time - entry.lastUsed >= releaseAfter || this.imageCache.size > limit) {
        this.releaseImage(id);
      }
    }
  }

  async init() {
    this.element.innerHTML = '';
    this.element.classList.add('canvas-projector');
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'embedding-canvas';
    this.canvas.setAttribute('aria-label', 'Nube de embeddings interactiva');
    this.element.appendChild(this.canvas);
    this.ctx = this.canvas.getContext('2d', { alpha: false, desynchronized: true })
      || this.canvas.getContext('2d', { alpha: false });
    if (!this.ctx) throw new Error('El navegador no ha podido iniciar el lienzo gráfico de MPI.');
    this.displayPositions = this.layoutPositions(this.representationMode);
    this.startProgressiveReveal();
    this.resize();
    this.bindEvents();
    if (typeof window.ResizeObserver === 'function') {
      this.resizeObserver = new ResizeObserver(() => this.resize());
      this.resizeObserver.observe(this.element);
    } else {
      window.addEventListener('resize', this.bound.resize, { passive: true });
    }
    this.updateResolvedScale(true);
    this.emitProfile();
    this.lastFrame = performance.now();
    this.raf = requestAnimationFrame((time) => this.frame(time));
  }

  resize() {
    if (!this.canvas || !this.element) return;
    const rect = this.element.getBoundingClientRect();
    const ratio = this.pixelRatio();
    const width = Math.max(1, Math.round(rect.width));
    const height = Math.max(1, Math.round(rect.height));
    if (this.canvas.width !== Math.round(width * ratio) || this.canvas.height !== Math.round(height * ratio)) {
      this.canvas.width = Math.round(width * ratio);
      this.canvas.height = Math.round(height * ratio);
      this.canvas.style.width = `${width}px`;
      this.canvas.style.height = `${height}px`;
    }
    this.width = width;
    this.height = height;
    this.ratio = ratio;
  }

  bindEvents() {
    this.bound.pointerMove = (event) => this.pointerMove(event);
    this.bound.pointerDown = (event) => this.pointerDown(event);
    this.bound.pointerUp = (event) => this.pointerUp(event);
    this.bound.pointerCancel = (event) => this.pointerCancel(event);
    this.bound.pointerLeave = () => this.pointerLeave();
    this.bound.wheel = (event) => this.wheel(event);
    this.bound.resize = () => this.resize();
    this.canvas.addEventListener('pointermove', this.bound.pointerMove);
    this.canvas.addEventListener('pointerdown', this.bound.pointerDown);
    window.addEventListener('pointerup', this.bound.pointerUp);
    window.addEventListener('pointercancel', this.bound.pointerCancel);
    this.canvas.addEventListener('pointerleave', this.bound.pointerLeave);
    this.canvas.addEventListener('wheel', this.bound.wheel, { passive: false });
  }

  pointerDistance() {
    const points = [...this.activePointers.values()];
    if (points.length < 2) return 0;
    return Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
  }

  pointerDown(event) {
    event.preventDefault();
    try { this.canvas.setPointerCapture?.(event.pointerId); } catch { /* Safari may reject capture during a gesture. */ }
    this.activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (this.activePointers.size >= 2) {
      this.pinch = { distance: Math.max(1, this.pointerDistance()), cameraDistance: this.camera.targetDistance };
      this.drag = null;
      this.cancelDwell();
      return;
    }
    this.drag = { x: event.clientX, y: event.clientY, lastX: event.clientX, lastY: event.clientY, moved: false, pointerId: event.pointerId };
  }

  pointerMove(event) {
    const rect = this.canvas.getBoundingClientRect();
    this.pointer.x = event.clientX - rect.left;
    this.pointer.y = event.clientY - rect.top;
    this.pointer.inside = true;
    if (this.activePointers.has(event.pointerId)) {
      this.activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    }
    if (this.activePointers.size >= 2) {
      event.preventDefault();
      const distance = Math.max(1, this.pointerDistance());
      if (!this.pinch) this.pinch = { distance, cameraDistance: this.camera.targetDistance };
      const factor = this.pinch.distance / distance;
      this.camera.targetDistance = clamp(this.pinch.cameraDistance * factor, 0.72, 8.5);
      return;
    }
    if (this.drag && this.drag.pointerId === event.pointerId) {
      const dx = event.clientX - this.drag.lastX;
      const dy = event.clientY - this.drag.lastY;
      const threshold = this.coarsePointer ? 8 : 3;
      if (Math.hypot(event.clientX - this.drag.x, event.clientY - this.drag.y) > threshold) this.drag.moved = true;
      this.drag.lastX = event.clientX;
      this.drag.lastY = event.clientY;
      if (this.is3D) {
        this.camera.yaw += dx * (this.coarsePointer ? 0.0048 : 0.0062);
        this.camera.pitch = clamp(this.camera.pitch + dy * (this.coarsePointer ? 0.0042 : 0.0054), -1.28, 1.28);
      } else {
        this.camera.targetPanX += dx;
        this.camera.targetPanY += dy;
      }
      return;
    }
    if (!this.coarsePointer) this.pickHover(event);
  }

  pointerUp(event) {
    const wasPinching = Boolean(this.pinch) || this.activePointers.size > 1;
    this.activePointers.delete(event.pointerId);
    if (wasPinching) {
      if (this.activePointers.size < 2) this.pinch = null;
      this.drag = null;
      return;
    }
    if (!this.drag || this.drag.pointerId !== event.pointerId) return;
    const moved = this.drag.moved;
    this.drag = null;
    if (!moved) {
      this.pickHover(event);
      if (this.hoverNode) this.confirmNode(this.hoverNode, 'click', { clientX: event.clientX, clientY: event.clientY });
    }
  }

  pointerCancel(event) {
    this.activePointers.delete(event.pointerId);
    this.pinch = null;
    this.drag = null;
    this.cancelDwell();
  }

  pointerLeave() {
    if (this.activePointers.size) return;
    this.pointer.inside = false;
    this.hoverNode = null;
    this.cancelDwell();
  }

  wheel(event) {
    event.preventDefault();
    const factor = Math.exp(event.deltaY * 0.00105);
    this.camera.targetDistance = clamp(this.camera.targetDistance * factor, 0.72, 8.5);
  }

  pickHover(event) {
    if (!this.projected.length) return;
    const rect = this.canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    let best = null;
    let bestScore = Infinity;
    for (const item of this.projected) {
      if (!item.visible) continue;
      const distance = Math.hypot(x - item.sx, y - item.sy);
      const radius = Math.max(this.coarsePointer ? 17 : 8, item.size * 0.8 + (this.coarsePointer ? 10 : 5));
      const insideMaterial = item.hitWidth > 0
        && Math.abs(x - item.sx) <= item.hitWidth / 2
        && Math.abs(y - item.sy) <= item.hitHeight / 2;
      if (insideMaterial || distance <= radius) {
        const score = distance - item.depth * 0.02;
        if (score < bestScore) { best = item; bestScore = score; }
      }
    }
    const node = best?.node || null;
    if (String(node?.id ?? '') === String(this.hoverNode?.id ?? '')) return;
    this.hoverNode = node;
    this.cancelDwell();
    if (!node) return;
    this.stats.previews += 1;
    const now = performance.now();
    if (String(this.lastPreviewId) !== String(node.id) || now - this.lastPreviewAt > 90) {
      this.lastPreviewId = node.id;
      this.lastPreviewAt = now;
      this.onPreview(node);
    }
    const pointer = { clientX: event.clientX, clientY: event.clientY };
    if (this.dwellEnabled) {
      this.dwellTimer = window.setTimeout(() => this.confirmNode(node, 'dwell', pointer), this.dwellDelay);
    }
  }

  cancelDwell() {
    if (this.dwellTimer) window.clearTimeout(this.dwellTimer);
    this.dwellTimer = 0;
  }

  projectPosition(position) {
    let { x, y, z } = position;
    if (!this.is3D) {
      const scale = Math.min(this.width, this.height) * (2.9 / this.camera.distance);
      return {
        sx: this.width / 2 + x * scale + this.camera.panX,
        sy: this.height / 2 - y * scale + this.camera.panY,
        depth: 0,
        perspective: clamp(3.55 / this.camera.distance, 0.35, 5.2),
        visible: true,
      };
    }
    const cy = Math.cos(this.camera.yaw); const sy = Math.sin(this.camera.yaw);
    const cp = Math.cos(this.camera.pitch); const sp = Math.sin(this.camera.pitch);
    const rx = cy * x + sy * z;
    const rz = -sy * x + cy * z;
    const ry = cp * y - sp * rz;
    const rz2 = sp * y + cp * rz;
    const depth = this.camera.distance - rz2;
    if (depth <= 0.08) return { sx: 0, sy: 0, depth, perspective: 0, visible: false };
    const perspective = this.camera.focal / depth;
    const scale = Math.min(this.width, this.height) * 0.43;
    return {
      sx: this.width / 2 + rx * perspective * scale + this.camera.panX,
      sy: this.height / 2 - ry * perspective * scale + this.camera.panY,
      depth,
      perspective,
      visible: true,
    };
  }

  currentPosition(node, time) {
    const id = String(node.id);
    let value = this.displayPositions.get(id) || { x: 0, y: 0, z: 0 };
    if (this.transition) {
      const elapsed = time - this.transition.start;
      const t = smoothstep(0, 1, elapsed / this.transition.duration);
      const from = this.transition.from.get(id) || value;
      const to = this.transition.to.get(id) || from;
      value = { x: lerp(from.x, to.x, t), y: lerp(from.y, to.y, t), z: lerp(from.z, to.z, t) };
      if (t >= 1) this.displayPositions.set(id, to);
    }
    return this.applyVectorMotion(node, value, time);
  }

  applyVectorMotion(node, position, time) {
    const temperature = this.visualTemperature / 100;
    const seconds = time / 1000;
    const phase = this.hashHue(node.id) * 0.0174533;
    if (this.representationMode === 'tides') {
      const wave = Math.sin(position.x * 2.4 + seconds * (0.34 + temperature * 0.8) + phase * 0.16);
      const crossing = Math.cos(position.z * 1.9 - seconds * (0.22 + temperature * 0.46));
      const amplitude = 0.07 + temperature * 0.18;
      return {
        x: position.x,
        y: position.y * 0.62 + (wave * 0.72 + crossing * 0.28) * amplitude,
        z: this.is3D ? position.z * 1.08 : 0,
      };
    }
    if (this.representationMode === 'orbits') {
      const center = this.orbitCenters.get(String(node.region || 'default')) || { x: 0, y: 0, z: 0 };
      const dx = position.x - center.x;
      const dz = position.z - center.z;
      const angularSpeed = 0.025 + temperature * 0.16;
      const angle = seconds * angularSpeed * (this.hashHue(node.region || 'default') % 2 ? 1 : -1);
      const cosine = Math.cos(angle);
      const sine = Math.sin(angle);
      return {
        x: center.x + dx * cosine - dz * sine,
        y: position.y + Math.sin(seconds * 0.18 + phase) * 0.012 * temperature,
        z: this.is3D ? center.z + dx * sine + dz * cosine : 0,
      };
    }
    if (this.visualTemperature <= 0) return position;
    const density = clamp(Number(this.world.density(node) || 0), 0, 1);
    const relationActivity = clamp((this.world.relationsFor(node)?.length || 0) / 9, 0, 1);
    const heat = temperature * (0.24 + density * 0.46 + relationActivity * 0.3);
    const amplitude = 0.018 * heat;
    return {
      x: position.x + Math.sin(seconds * (0.48 + density) + phase) * amplitude,
      y: position.y + Math.cos(seconds * (0.39 + relationActivity) + phase * 1.7) * amplitude,
      z: position.z + (this.is3D ? Math.sin(seconds * 0.31 + phase * 0.7) * amplitude * 0.65 : 0),
    };
  }

  frame(time) {
    if (this.destroyed) return;
    const dt = Math.min(0.05, Math.max(0.001, (time - this.lastFrame) / 1000));
    this.lastFrame = time;
    const ease = 1 - Math.exp(-dt * 12);
    this.camera.distance = lerp(this.camera.distance, this.camera.targetDistance, ease);
    this.camera.panX = lerp(this.camera.panX, this.camera.targetPanX, ease);
    this.camera.panY = lerp(this.camera.panY, this.camera.targetPanY, ease);
    this.updateResolvedScale();
    if (this.transition && time - this.transition.start >= this.transition.duration) {
      this.displayPositions = this.transition.to;
      this.transition = null;
    }
    const baseFps = this.coarsePointer
      ? (this.quality === 'high' ? 45 : this.quality === 'fluid' ? 24 : 30)
      : (this.quality === 'high' ? 60 : this.quality === 'fluid' ? 30 : 45);
    const targetFps = this.adaptiveLevel === 2 ? 24 : this.adaptiveLevel === 1 ? Math.min(30, baseFps) : baseFps;
    if (time - this.lastDrawAt >= 1000 / targetFps) {
      const started = performance.now();
      this.draw(time);
      const renderMs = performance.now() - started;
      this.lastDrawAt = time;
      this.renderMsEMA = this.renderMsEMA ? lerp(this.renderMsEMA, renderMs, 0.08) : renderMs;
      this.performance.record?.('render', renderMs);
      if (time - this.lastAdaptiveAt > 900) {
        const previous = this.adaptiveLevel;
        const pressure = this.renderMsEMA * targetFps;
        if (pressure > 850) this.adaptiveLevel = 2;
        else if (pressure > 580) this.adaptiveLevel = 1;
        else if (pressure < 390) this.adaptiveLevel = 0;
        this.lastAdaptiveAt = time;
        if (previous !== this.adaptiveLevel) this.emitProfile();
      }
    }
    this.raf = requestAnimationFrame((next) => this.frame(next));
  }

  nodeVisual(node, projection, index) {
    const selected = String(node.id) === String(this.selectedNode?.id ?? '');
    const hovered = String(node.id) === String(this.hoverNode?.id ?? '');
    const inGroup = this.groupIds.has(String(node.id));
    const search = this.searchIds.has(String(node.id));
    const initialPerspective = this.camera.focal / 3.55;
    const zoomGrowth = clamp(projection.perspective / initialPerspective, 0.48, 6.2);
    let size = this.baseNodeSize(node) * Math.pow(zoomGrowth, 0.92);
    if (this.representationMode === 'territories' && !selected && !hovered) size *= 0.68;
    if (node.type === 'image') size *= this.imageScale;
    if (inGroup && this.secondaryEffects) size *= 1.08;
    if (hovered) size *= 1.55;
    if (selected) size *= node.type === 'image' ? 1.75 : 1.45;
    if (search) size *= 1.32;
    const minimumSize = node.type === 'image' ? 1.2 : 2.1;
    const maximumSize = node.type === 'image' ? 46 * Math.max(1, this.imageScale) : 30;
    size = clamp(size, minimumSize, maximumSize);

    let alpha = 0.40;
    if (this.selectedNode && this.colorMode === 'relation-hierarchy') {
      if (selected) alpha = 1;
      else if (inGroup) {
        const relation = this.world.relationBetween(this.selectedNode, node);
        const rank = Math.max(0, index);
        const strength = relation ? clamp(Number(relation.weight || 0.5), 0, 1) : clamp(1 - rank / 24, 0.12, 0.85);
        alpha = 0.30 + strength * 0.60;
      } else alpha = 0.12;
    } else if (hovered || selected || search) alpha = 0.98;
    else if (inGroup) alpha = 0.67;
    if (this.representationMode === 'territories' && !selected && !hovered) alpha = Math.min(alpha, 0.48);
    let baseColor = this.nodeColor(node);
    if (this.colorMode === 'relation-hierarchy' && this.selectedNode && inGroup && !selected) {
      const hue = this.hashHue(this.selectedNode.region || this.world.dominantRelation(this.selectedNode) || 'default');
      const relation = this.world.relationBetween(this.selectedNode, node);
      const rank = Math.max(0, index);
      const strength = relation ? clamp(Number(relation.weight || 0.5), 0, 1) : clamp(1 - rank / 24, 0.12, 0.88);
      baseColor = `hsl(${hue} ${50 + strength * 38}% ${36 + strength * 34}%)`;
    }
    const color = selected ? { r: 255, g: 255, b: 255 } : cssColorToRgb(baseColor);
    return { size, alpha, color, selected, hovered, inGroup, search };
  }

  draw(time) {
    if (!this.ctx || !this.width || !this.height) return;
    const ctx = this.ctx;
    ctx.setTransform(this.ratio, 0, 0, this.ratio, 0, 0);
    const gradient = ctx.createRadialGradient(this.width * 0.48, this.height * 0.45, 10, this.width * 0.48, this.height * 0.45, Math.max(this.width, this.height) * 0.72);
    gradient.addColorStop(0, '#101722'); gradient.addColorStop(0.55, '#090d12'); gradient.addColorStop(1, '#05070a');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, this.width, this.height);

    this.projected = this.world.nodes
      .filter((node) => (
        this.progressiveIds.has(String(node.id))
        && this.nodeInKnowledgeScale(node)
        && this.nodeInRepresentation(node)
      ))
      .map((node) => {
      const position = this.currentPosition(node, time);
      const projection = this.projectPosition(position);
      return { node, position, ...projection };
    }).filter((item) => item.visible && item.sx > -100 && item.sx < this.width + 100 && item.sy > -100 && item.sy < this.height + 100)
      .sort((a, b) => b.depth - a.depth);
    this.emitScaleStatus();

    if (this.representationMode === 'territories') this.drawTerritories(ctx);
    if (this.representationMode === 'textures') this.drawTextures(ctx);
    if (this.representationMode === 'tides') this.drawTides(ctx, time);
    if (this.representationMode === 'orbits') this.drawOrbits(ctx);
    if (this.showAxes) this.drawAxes(ctx);
    if (this.representationMode === 'flows') this.drawFlows(ctx, time);
    else if (this.showLinks || this.representationMode === 'constellation') this.drawLinks(ctx);

    const activeContext = this.selectedNode ? this.world.groupFor(this.selectedNode, 28) : [];
    const rankById = new Map(activeContext.map((node, index) => [String(node.id), index]));
    for (const item of this.projected) {
      const visual = this.nodeVisual(item.node, item, rankById.get(String(item.node.id)) ?? 99);
      item.size = visual.size;
      item.visual = visual;
      if (this.materialOverlay && (visual.selected || visual.hovered || visual.size >= 5.8)) {
        const isTextMaterial = item.node.type !== 'image' && !this.world.isAudioNode(item.node);
        item.hitWidth = isTextMaterial
          ? clamp(visual.size * 12, 72, visual.selected ? 320 : visual.hovered ? 260 : 210)
          : clamp(visual.size * 8.2, 42, visual.selected || visual.hovered ? 190 : 132);
        item.hitHeight = this.world.isAudioNode(item.node)
          ? clamp(item.hitWidth * 0.34, 24, 52)
          : item.node.type === 'image'
            ? clamp(item.hitWidth * 0.76, 34, 142)
            : clamp(visual.size * 5.4, 28, visual.selected ? 124 : visual.hovered ? 100 : 78);
      } else {
        item.hitWidth = 0;
        item.hitHeight = 0;
      }
    }
    if (this.materialOverlay) this.applyMaterialDetailBudget();
    this.syncImageCache(time);
    for (const item of this.projected) this.drawNode(ctx, item, item.visual);
    this.drawLabels(ctx);
  }

  applyMaterialDetailBudget() {
    const baseLimit = this.quality === 'fluid' ? 30 : this.quality === 'high' ? 90 : 54;
    const limit = Math.max(18, Math.round(baseLimit * (this.adaptiveLevel === 2 ? 0.42 : this.adaptiveLevel === 1 ? 0.68 : 1)));
    const candidates = this.projected
      .filter((item) => item.visual.selected || item.visual.hovered || item.visual.size >= 5.8)
      .sort((a, b) => {
        const priorityA = (a.visual.selected ? 100 : 0) + (a.visual.hovered ? 60 : 0) + a.visual.size;
        const priorityB = (b.visual.selected ? 100 : 0) + (b.visual.hovered ? 60 : 0) + b.visual.size;
        return priorityB - priorityA;
      });
    const allowed = new Set(candidates.slice(0, limit).map((item) => String(item.node.id)));
    for (const item of this.projected) {
      item.materialDetail = allowed.has(String(item.node.id));
      if (!item.materialDetail) {
        item.hitWidth = 0;
        item.hitHeight = 0;
      }
    }
  }

  convexHull(points) {
    if (points.length <= 2) return points;
    const sorted = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
    const cross = (o, a, b) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
    const lower = [];
    for (const point of sorted) {
      while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], point) <= 0) lower.pop();
      lower.push(point);
    }
    const upper = [];
    for (let index = sorted.length - 1; index >= 0; index -= 1) {
      const point = sorted[index];
      while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], point) <= 0) upper.pop();
      upper.push(point);
    }
    lower.pop();
    upper.pop();
    return lower.concat(upper);
  }

  drawTerritories(ctx) {
    const groups = new Map();
    for (const item of this.projected) {
      const key = String(item.node.region || 'sin región');
      const list = groups.get(key) || [];
      list.push(item);
      groups.set(key, list);
    }
    const visibleGroups = [...groups.entries()]
      .sort((a, b) => b[1].length - a[1].length)
      .slice(0, this.quality === 'fluid' ? 10 : 18);
    ctx.save();
    for (const [region, items] of visibleGroups) {
      const points = items.map((item) => ({ x: item.sx, y: item.sy }));
      const centroid = points.reduce((acc, point) => ({
        x: acc.x + point.x / points.length,
        y: acc.y + point.y / points.length,
      }), { x: 0, y: 0 });
      const hue = this.hashHue(region);
      const hull = this.convexHull(points).map((point) => {
        const dx = point.x - centroid.x;
        const dy = point.y - centroid.y;
        const length = Math.max(1, Math.hypot(dx, dy));
        return { x: point.x + dx / length * 18, y: point.y + dy / length * 18 };
      });
      ctx.fillStyle = `hsla(${hue},72%,54%,.075)`;
      ctx.strokeStyle = `hsla(${hue},78%,68%,.34)`;
      ctx.lineWidth = 1.2;
      ctx.setLineDash([6, 5]);
      ctx.beginPath();
      if (hull.length >= 3) {
        ctx.moveTo(hull[0].x, hull[0].y);
        for (const point of hull.slice(1)) ctx.lineTo(point.x, point.y);
        ctx.closePath();
      } else {
        const radius = hull.length === 2
          ? Math.max(34, Math.hypot(hull[0].x - hull[1].x, hull[0].y - hull[1].y) * 0.62)
          : 38;
        ctx.arc(centroid.x, centroid.y, radius, 0, Math.PI * 2);
      }
      ctx.fill();
      ctx.stroke();
      ctx.setLineDash([]);
      const title = region.replace(/[-_]+/g, ' ').trim() || 'sin región';
      ctx.font = '520 11px "Avenir Next", "Helvetica Neue", Arial, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineWidth = 4;
      ctx.strokeStyle = 'rgba(3,7,12,.9)';
      ctx.strokeText(title, centroid.x, centroid.y - 7);
      ctx.fillStyle = `hsl(${hue} 76% 78%)`;
      ctx.fillText(title, centroid.x, centroid.y - 7);
      ctx.font = '400 10px "Avenir Next", "Helvetica Neue", Arial, sans-serif';
      ctx.fillStyle = 'rgba(213,225,237,.72)';
      const materialLabel = document.documentElement?.lang === 'es' ? 'materiales' : 'materials';
      ctx.fillText(`${items.length} ${materialLabel}`, centroid.x, centroid.y + 8);
    }
    ctx.restore();
  }

  drawFlows(ctx, time) {
    const visible = new Map(this.projected.map((item) => [String(item.node.id), item]));
    const limit = this.quality === 'fluid' ? 90 : this.quality === 'high' ? 260 : 170;
    const relations = [...(this.world.relations || [])]
      .filter((relation) => visible.has(String(relation.source)) && visible.has(String(relation.target)))
      .sort((a, b) => Number(b.weight || 0) - Number(a.weight || 0))
      .slice(0, limit);
    const temperature = this.visualTemperature / 100;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const relation of relations) {
      const source = visible.get(String(relation.source));
      const target = visible.get(String(relation.target));
      const dx = target.sx - source.sx;
      const dy = target.sy - source.sy;
      const length = Math.max(1, Math.hypot(dx, dy));
      const nx = -dy / length;
      const ny = dx / length;
      const phase = time / 1200 + this.hashHue(relation.id) * 0.03;
      const bend = Math.min(54, length * 0.2) * (0.42 + Math.sin(phase) * 0.12 * temperature);
      const cx = (source.sx + target.sx) / 2 + nx * bend;
      const cy = (source.sy + target.sy) / 2 + ny * bend;
      const rgb = cssColorToRgb(RELATION_COLORS[relation.type] || '#91a0b2');
      const weight = clamp(Number(relation.weight ?? 0.55), 0.08, 1);
      ctx.strokeStyle = `rgba(${rgb.r},${rgb.g},${rgb.b},${0.08 + weight * 0.24})`;
      ctx.lineWidth = 0.55 + weight * 1.7;
      ctx.beginPath();
      ctx.moveTo(source.sx, source.sy);
      ctx.quadraticCurveTo(cx, cy, target.sx, target.sy);
      ctx.stroke();

      const pulse = (time / (2600 - temperature * 900) + this.hashHue(relation.id) / 360) % 1;
      const inv = 1 - pulse;
      const px = inv * inv * source.sx + 2 * inv * pulse * cx + pulse * pulse * target.sx;
      const py = inv * inv * source.sy + 2 * inv * pulse * cy + pulse * pulse * target.sy;
      ctx.fillStyle = `rgba(${rgb.r},${rgb.g},${rgb.b},${0.3 + weight * 0.5})`;
      ctx.beginPath(); ctx.arc(px, py, 1.1 + weight * 1.7, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }

  drawTextures(ctx) {
    const groups = new Map();
    for (const item of this.projected) {
      const key = String(item.node.region || 'sin región');
      const list = groups.get(key) || [];
      list.push(item);
      groups.set(key, list);
    }
    const limit = this.quality === 'fluid' ? 8 : 15;
    const temperature = this.visualTemperature / 100;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const [region, rawItems] of [...groups.entries()].sort((a, b) => b[1].length - a[1].length).slice(0, limit)) {
      const items = [...rawItems].sort((a, b) => a.sx - b.sx || a.sy - b.sy);
      if (items.length < 2) continue;
      const hue = this.hashHue(region);
      const density = clamp(items.length / 28, 0.12, 1);
      const passes = Math.min(5, Math.max(2, Math.ceil(items.length / 9)));
      for (let pass = 0; pass < passes; pass += 1) {
        const offset = (pass - (passes - 1) / 2) * (3.5 + temperature * 5);
        ctx.strokeStyle = `hsla(${(hue + pass * 8) % 360},72%,67%,${0.045 + density * 0.055})`;
        ctx.lineWidth = 1.2 + density * 2.4;
        ctx.beginPath();
        ctx.moveTo(items[0].sx, items[0].sy + offset);
        for (let index = 1; index < items.length - 1; index += 1) {
          const current = items[index];
          const next = items[index + 1];
          const midpointX = (current.sx + next.sx) / 2;
          const midpointY = (current.sy + next.sy) / 2 + offset;
          ctx.quadraticCurveTo(current.sx, current.sy + offset, midpointX, midpointY);
        }
        const last = items[items.length - 1];
        ctx.lineTo(last.sx, last.sy + offset);
        ctx.stroke();
      }
      const centroid = items.reduce((acc, item) => ({
        x: acc.x + item.sx / items.length,
        y: acc.y + item.sy / items.length,
      }), { x: 0, y: 0 });
      const radius = 28 + Math.sqrt(items.length) * 10;
      const glow = ctx.createRadialGradient(centroid.x, centroid.y, 0, centroid.x, centroid.y, radius);
      glow.addColorStop(0, `hsla(${hue},72%,58%,${0.055 + density * 0.04})`);
      glow.addColorStop(1, `hsla(${hue},72%,58%,0)`);
      ctx.fillStyle = glow;
      ctx.beginPath(); ctx.arc(centroid.x, centroid.y, radius, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }

  drawTides(ctx, time) {
    const temperature = this.visualTemperature / 100;
    const bands = this.adaptiveLevel === 2 ? 4 : this.adaptiveLevel === 1 ? 6 : 9;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let band = 0; band < bands; band += 1) {
      const depth = -0.9 + (band / Math.max(1, bands - 1)) * 1.8;
      const hue = 194 + band * 3;
      ctx.strokeStyle = `hsla(${hue},76%,64%,${0.045 + temperature * 0.035})`;
      ctx.lineWidth = 0.7 + temperature * 0.8;
      ctx.beginPath();
      const segments = this.adaptiveLevel === 0 ? 34 : 22;
      for (let segment = 0; segment <= segments; segment += 1) {
        const x = -1.9 + (segment / segments) * 3.8;
        const y = depth * 0.34 + Math.sin(x * 2.35 + time / (2200 - temperature * 900) + band * 0.62) * (0.035 + temperature * 0.09);
        const point = this.projectPosition({ x, y, z: depth });
        if (!point.visible) continue;
        if (segment === 0) ctx.moveTo(point.sx, point.sy);
        else ctx.lineTo(point.sx, point.sy);
      }
      ctx.stroke();
    }
    ctx.restore();
  }

  drawOrbits(ctx) {
    const groups = new Map();
    for (const item of this.projected) {
      const key = String(item.node.region || 'default');
      const list = groups.get(key) || [];
      list.push(item);
      groups.set(key, list);
    }
    const limit = this.adaptiveLevel === 2 ? 6 : 12;
    ctx.save();
    ctx.setLineDash([3, 7]);
    for (const [region, items] of [...groups.entries()].sort((a, b) => b[1].length - a[1].length).slice(0, limit)) {
      if (items.length < 2) continue;
      const centroid = items.reduce((result, item) => ({
        x: result.x + item.sx / items.length,
        y: result.y + item.sy / items.length,
      }), { x: 0, y: 0 });
      const radiusX = Math.max(22, Math.sqrt(items.reduce((sum, item) => sum + (item.sx - centroid.x) ** 2, 0) / items.length));
      const radiusY = Math.max(12, Math.sqrt(items.reduce((sum, item) => sum + (item.sy - centroid.y) ** 2, 0) / items.length));
      const hue = this.hashHue(region);
      ctx.strokeStyle = `hsla(${hue},68%,68%,.16)`;
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.ellipse(centroid.x, centroid.y, radiusX * 1.18, radiusY * 1.18, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = `hsla(${hue},78%,72%,.55)`;
      ctx.beginPath();
      ctx.arc(centroid.x, centroid.y, 2.2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  drawTimelineGuide(ctx) {
    const dated = (this.world.nodes || []).map((node) => this.nodeYear(node)).filter(Number.isFinite);
    const minYear = dated.length ? Math.min(...dated) : null;
    const maxYear = dated.length ? Math.max(...dated) : null;
    const families = ['document', 'text', 'image', 'audio', 'entity'];
    const labels = document.documentElement?.lang !== 'es'
      ? ['documents', 'texts', 'images', 'audio', 'entities']
      : ['documentos', 'textos', 'imágenes', 'audio', 'entidades'];
    ctx.save();
    ctx.font = '400 10px "Avenir Next", "Helvetica Neue", Arial, sans-serif';
    ctx.textBaseline = 'middle';
    for (let index = 0; index < families.length; index += 1) {
      const point = this.projectPosition({ x: -1.72, y: 1.25 - index * 0.62, z: 0 });
      const end = this.projectPosition({ x: 1.72, y: 1.25 - index * 0.62, z: 0 });
      if (!point.visible || !end.visible) continue;
      ctx.strokeStyle = 'rgba(126,159,196,.14)';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(point.sx, point.sy); ctx.lineTo(end.sx, end.sy); ctx.stroke();
      ctx.fillStyle = 'rgba(183,203,224,.66)';
      ctx.fillText(labels[index], Math.max(14, point.sx - 62), point.sy);
    }
    if (minYear !== null && maxYear !== null) {
      const steps = Math.min(7, Math.max(2, maxYear - minYear + 1));
      for (let index = 0; index < steps; index += 1) {
        const t = steps === 1 ? 0 : index / (steps - 1);
        const point = this.projectPosition({ x: -1.72 + t * 3.44, y: -1.48, z: 0 });
        ctx.fillStyle = 'rgba(213,226,239,.72)';
        ctx.textAlign = 'center';
        ctx.fillText(String(Math.round(minYear + t * (maxYear - minYear))), point.sx, point.sy);
      }
    }
    ctx.restore();
  }

  drawMatrixGuide(ctx) {
    const nodes = this.world.nodes || [];
    const regions = [...new Set(nodes.map((node) => String(node.region || 'sin región')))].slice(0, 8);
    const labels = document.documentElement?.lang !== 'es'
      ? ['documents', 'texts', 'images', 'audio', 'entities']
      : ['documentos', 'textos', 'imágenes', 'audio', 'entidades'];
    const columns = Math.max(1, regions.length);
    ctx.save();
    ctx.font = '400 9px "Avenir Next", "Helvetica Neue", Arial, sans-serif';
    ctx.textBaseline = 'middle';
    for (let row = 0; row < labels.length; row += 1) {
      for (let column = 0; column < columns; column += 1) {
        const x = columns === 1 ? 0 : -1.65 + column * (3.3 / (columns - 1));
        const y = 1.25 - row * 0.62;
        const center = this.projectPosition({ x, y, z: 0 });
        const left = this.projectPosition({ x: x - 0.19, y, z: 0 });
        const top = this.projectPosition({ x, y: y + 0.22, z: 0 });
        const width = Math.max(34, Math.abs(center.sx - left.sx) * 2);
        const height = Math.max(26, Math.abs(center.sy - top.sy) * 2);
        ctx.fillStyle = `hsla(${this.hashHue(regions[column])},62%,50%,.035)`;
        ctx.strokeStyle = 'rgba(135,164,198,.12)';
        ctx.lineWidth = 1;
        ctx.fillRect(center.sx - width / 2, center.sy - height / 2, width, height);
        ctx.strokeRect(center.sx - width / 2, center.sy - height / 2, width, height);
      }
      const labelPoint = this.projectPosition({ x: -1.92, y: 1.25 - row * 0.62, z: 0 });
      ctx.fillStyle = 'rgba(183,203,224,.66)';
      ctx.textAlign = 'right';
      ctx.fillText(labels[row], labelPoint.sx, labelPoint.sy);
    }
    regions.forEach((region, column) => {
      const x = columns === 1 ? 0 : -1.65 + column * (3.3 / (columns - 1));
      const point = this.projectPosition({ x, y: 1.58, z: 0 });
      ctx.save();
      ctx.translate(point.sx, point.sy);
      ctx.rotate(-0.55);
      ctx.textAlign = 'left';
      ctx.fillStyle = `hsla(${this.hashHue(region)},72%,78%,.8)`;
      ctx.fillText(region.replace(/[-_]+/g, ' ').slice(0, 22), 0, 0);
      ctx.restore();
    });
    ctx.restore();
  }

  drawAxes(ctx) {
    const origin = this.projectPosition({ x: 0, y: 0, z: 0 });
    const axes = [
      [{ x: 1.18, y: 0, z: 0 }, '#ef6c7a', 'X'],
      [{ x: 0, y: 1.18, z: 0 }, '#67d5a5', 'Y'],
      [{ x: 0, y: 0, z: 1.18 }, '#6ca8ff', 'Z'],
    ];
    ctx.save();
    ctx.lineWidth = 1.15;
    for (const [position, color, label] of axes) {
      if (!this.is3D && label === 'Z') continue;
      const end = this.projectPosition(position);
      if (!origin.visible || !end.visible) continue;
      ctx.strokeStyle = color;
      ctx.globalAlpha = 0.72;
      ctx.beginPath(); ctx.moveTo(origin.sx, origin.sy); ctx.lineTo(end.sx, end.sy); ctx.stroke();
      ctx.globalAlpha = 0.9;
      ctx.fillStyle = color;
      ctx.font = '400 10px "Avenir Next", "Helvetica Neue", Arial, sans-serif';
      ctx.fillText(label, end.sx + 4, end.sy - 4);
    }
    ctx.restore();
  }

  drawLinks(ctx) {
    ctx.save();
    ctx.lineWidth = 1;
    if (this.route.length > 1) {
      ctx.strokeStyle = 'rgba(216,228,240,.45)';
      ctx.beginPath();
      let started = false;
      for (const node of this.route) {
        const item = this.projected.find((row) => String(row.node.id) === String(node.id));
        if (!item) continue;
        if (!started) { ctx.moveTo(item.sx, item.sy); started = true; } else ctx.lineTo(item.sx, item.sy);
      }
      ctx.stroke();
    }
    if (this.selectedNode) {
      const group = this.world.groupFor(this.selectedNode, Number(this.config.visibleRelationLimit || 8));
      const active = this.projected.find((row) => String(row.node.id) === String(this.selectedNode.id));
      if (active) {
        for (const node of group.slice(1)) {
          const item = this.projected.find((row) => String(row.node.id) === String(node.id));
          if (!item) continue;
          const relation = this.world.relationBetween(this.selectedNode, node);
          const rgb = cssColorToRgb(RELATION_COLORS[relation?.type] || '#91a0b2');
          ctx.strokeStyle = `rgba(${rgb.r},${rgb.g},${rgb.b},.28)`;
          ctx.beginPath(); ctx.moveTo(active.sx, active.sy); ctx.lineTo(item.sx, item.sy); ctx.stroke();
        }
      }
    }
    ctx.restore();
  }

  drawNode(ctx, item, visual) {
    const { node, sx, sy } = item;
    const { size, color, alpha, selected, hovered, inGroup } = visual;
    ctx.save();
    ctx.globalAlpha = alpha;
    const cachedImage = this.imageCache.get(String(node.id));
    const image = cachedImage?.image;
    const imageReady = node.type === 'image' && image && cachedImage.ready;
    const generated = node.type === 'audio-generated' || node.metadata?.historicalOriginal === false;
    if (
      this.materialOverlay
      && item.materialDetail
      && this.drawMaterialNode(ctx, item, visual, imageReady, image, generated)
    ) {
      ctx.restore();
      return;
    }
    const revealThreshold = 10.5;
    if (imageReady && size >= revealThreshold) {
      const maximumImageSize = Math.min(212, 96 * Math.max(1, this.imageScale));
      const imageSize = clamp(size * 2.15, 10, maximumImageSize);
      ctx.beginPath();
      const radius = Math.min(10, imageSize * 0.18);
      this.roundRectPath(ctx, sx - imageSize / 2, sy - imageSize / 2, imageSize, imageSize, radius);
      ctx.clip();
      const sourceRatio = image.naturalWidth / Math.max(1, image.naturalHeight);
      let sw = image.naturalWidth; let sh = image.naturalHeight; let sx0 = 0; let sy0 = 0;
      if (sourceRatio > 1) { sw = image.naturalHeight; sx0 = (image.naturalWidth - sw) / 2; }
      else { sh = image.naturalWidth; sy0 = (image.naturalHeight - sh) / 2; }
      ctx.drawImage(image, sx0, sy0, sw, sh, sx - imageSize / 2, sy - imageSize / 2, imageSize, imageSize);
      ctx.restore();
      ctx.save();
      ctx.globalAlpha = selected || hovered ? 1 : 0.72;
      ctx.strokeStyle = selected ? '#ffffff' : `rgb(${color.r},${color.g},${color.b})`;
      ctx.lineWidth = selected ? 2.6 : 1.2;
      this.roundRectPath(ctx, sx - imageSize / 2, sy - imageSize / 2, imageSize, imageSize, radius);
      ctx.stroke();
      ctx.restore();
      return;
    }

    if (inGroup && this.secondaryEffects) {
      const glow = ctx.createRadialGradient(sx, sy, 0, sx, sy, size * 2.4);
      glow.addColorStop(0, `rgba(${color.r},${color.g},${color.b},${selected ? 0.5 : 0.2})`);
      glow.addColorStop(1, `rgba(${color.r},${color.g},${color.b},0)`);
      ctx.fillStyle = glow;
      ctx.beginPath(); ctx.arc(sx, sy, size * 2.4, 0, Math.PI * 2); ctx.fill();
    }

    if (generated) {
      ctx.save();
      ctx.globalAlpha = selected || hovered ? 1 : 0.9;
      ctx.strokeStyle = '#d08cff';
      ctx.lineWidth = selected ? 3 : 2;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.arc(sx, sy, size + 5, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = '#f2d8ff';
      ctx.beginPath();
      ctx.arc(sx + size + 3, sy - size - 3, Math.max(2.2, size * 0.28), 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    ctx.fillStyle = `rgb(${color.r},${color.g},${color.b})`;
    if (this.world.isAudioNode(node)) {
      ctx.fillRect(sx - size / 2, sy - size / 2, size, size);
    } else if (node.type === 'document') {
      ctx.beginPath();
      ctx.moveTo(sx - size, sy); ctx.lineTo(sx + size, sy);
      ctx.moveTo(sx, sy - size); ctx.lineTo(sx, sy + size);
      ctx.strokeStyle = ctx.fillStyle; ctx.lineWidth = 2; ctx.stroke();
    } else if (node.type === 'document-page') {
      ctx.strokeStyle = ctx.fillStyle;
      ctx.lineWidth = 1.6;
      ctx.strokeRect(sx - size * 0.72, sy - size, size * 1.44, size * 2);
    } else if (node.type === 'image') {
      ctx.beginPath();
      ctx.moveTo(sx, sy - size); ctx.lineTo(sx + size, sy); ctx.lineTo(sx, sy + size); ctx.lineTo(sx - size, sy); ctx.closePath(); ctx.fill();
    } else {
      ctx.beginPath(); ctx.arc(sx, sy, size, 0, Math.PI * 2); ctx.fill();
    }
    if (selected || hovered) {
      ctx.globalAlpha = 0.95;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = selected ? 2.3 : 1.3;
      ctx.beginPath(); ctx.arc(sx, sy, size + 3, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.restore();
  }

  drawMaterialNode(ctx, item, visual, imageReady, image, generated) {
    const { node, sx, sy } = item;
    const { size, color, selected, hovered } = visual;
    const detail = selected || hovered || size >= 5.8;
    if (!detail) return false;

    if (node.type !== 'image' && !this.world.isAudioNode(node)) {
      return this.drawFreeTextMaterial(ctx, item, visual, generated);
    }

    const width = clamp(size * 8.2, 42, selected || hovered ? 190 : 132);
    const height = this.world.isAudioNode(node)
      ? clamp(width * 0.34, 24, 52)
      : clamp(width * 0.76, 34, 142);
    const x = sx - width / 2;
    const y = sy - height / 2;
    const radius = clamp(width * 0.07, 5, 12);
    const tint = `rgb(${color.r},${color.g},${color.b})`;

    ctx.globalAlpha = selected || hovered ? 1 : clamp(visual.alpha + 0.18, 0.44, 0.88);
    ctx.shadowColor = generated ? 'rgba(208,140,255,.52)' : `rgba(${color.r},${color.g},${color.b},.28)`;
    ctx.shadowBlur = selected ? 24 : 11;
    this.roundRectPath(ctx, x, y, width, height, radius);
    ctx.fillStyle = 'rgba(8,13,21,.94)';
    ctx.fill();
    ctx.shadowBlur = 0;

    if (node.type === 'image' && imageReady) {
      ctx.save();
      this.roundRectPath(ctx, x + 2, y + 2, width - 4, height - 4, Math.max(3, radius - 2));
      ctx.clip();
      const sourceRatio = image.naturalWidth / Math.max(1, image.naturalHeight);
      const targetRatio = width / Math.max(1, height);
      let sw = image.naturalWidth; let sh = image.naturalHeight; let sx0 = 0; let sy0 = 0;
      if (sourceRatio > targetRatio) {
        sw = image.naturalHeight * targetRatio;
        sx0 = (image.naturalWidth - sw) / 2;
      } else {
        sh = image.naturalWidth / targetRatio;
        sy0 = (image.naturalHeight - sh) / 2;
      }
      ctx.drawImage(image, sx0, sy0, sw, sh, x + 2, y + 2, width - 4, height - 4);
      ctx.restore();
    } else if (this.world.isAudioNode(node)) {
      const seed = this.hashHue(`${node.id}:${node.label}`);
      const centerY = sy;
      ctx.strokeStyle = tint;
      ctx.lineWidth = selected ? 1.8 : 1.15;
      ctx.beginPath();
      for (let index = 0; index <= 48; index += 1) {
        const phase = index / 48;
        const envelope = Math.sin(Math.PI * phase);
        const harmonic = Math.sin((phase * (7 + seed % 9) + seed) * Math.PI * 2)
          + 0.45 * Math.sin((phase * 19 + seed * 0.13) * Math.PI * 2);
        const px = x + 8 + phase * (width - 16);
        const py = centerY + harmonic * envelope * height * 0.22;
        if (index === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.stroke();
      ctx.globalAlpha *= 0.48;
      ctx.strokeStyle = 'rgba(220,232,245,.5)';
      ctx.beginPath(); ctx.moveTo(x + 8, centerY); ctx.lineTo(x + width - 8, centerY); ctx.stroke();
      ctx.globalAlpha = selected || hovered ? 1 : clamp(visual.alpha + 0.18, 0.44, 0.88);
    }

    ctx.strokeStyle = generated ? '#d08cff' : selected ? '#ffffff' : tint;
    ctx.lineWidth = selected ? 2.2 : generated ? 1.8 : 1;
    if (generated) ctx.setLineDash([4, 3]);
    this.roundRectPath(ctx, x, y, width, height, radius);
    ctx.stroke();
    ctx.setLineDash([]);
    return true;
  }

  drawFreeTextMaterial(ctx, item, visual, generated) {
    const { node, sx, sy } = item;
    const { size, color, selected, hovered } = visual;
    const wordLimit = selected ? 28 : hovered ? 20 : size >= 10 ? 15 : size >= 7.4 ? 10 : 6;
    const charLimit = selected ? 300 : hovered ? 220 : size >= 10 ? 170 : size >= 7.4 ? 112 : 72;
    const text = this.nodeOriginLabel(node, wordLimit, charLimit);
    const fontSize = selected ? 18 : hovered ? 16 : clamp(9.5 + size * 0.42, 11, 15);
    const fontWeight = selected ? 400 : hovered ? 350 : 300;
    const lineHeight = fontSize * 1.3;
    const maxWidth = clamp(size * 12, 86, selected ? 320 : hovered ? 260 : 210);
    const maxLines = selected ? 6 : hovered ? 5 : size >= 10 ? 4 : 3;
    const words = text.split(/\s+/);
    const lines = [];
    let line = '';

    ctx.font = `${fontWeight} ${fontSize}px "Helvetica Neue", Helvetica, Arial, sans-serif`;
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;
      if (ctx.measureText(candidate).width > maxWidth && line) {
        lines.push(line);
        line = word;
      } else {
        line = candidate;
      }
      if (lines.length >= maxLines) break;
    }
    if (line && lines.length < maxLines) lines.push(line);

    const firstY = sy - ((lines.length - 1) * lineHeight) / 2;
    const tint = `rgb(${color.r},${color.g},${color.b})`;
    ctx.globalAlpha = selected || hovered ? 1 : clamp(visual.alpha + 0.22, 0.52, 0.94);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.shadowColor = generated
      ? 'rgba(208,140,255,.72)'
      : selected
        ? `rgba(${color.r},${color.g},${color.b},.62)`
        : 'rgba(0,0,0,.65)';
    ctx.shadowBlur = selected ? 20 : hovered ? 13 : generated ? 10 : 5;
    ctx.strokeStyle = 'rgba(3,7,12,.88)';
    ctx.lineWidth = selected ? 4.5 : 3.2;
    ctx.fillStyle = selected ? '#ffffff' : hovered ? '#f7fbff' : '#eaf1f7';

    lines.forEach((row, index) => {
      const y = firstY + index * lineHeight;
      ctx.strokeText(row, sx, y, maxWidth);
      ctx.fillText(row, sx, y, maxWidth);
    });

    if (generated) {
      const lastLine = lines[lines.length - 1] || '';
      const underlineWidth = Math.min(maxWidth * 0.72, Math.max(28, ctx.measureText(lastLine).width));
      const underlineY = firstY + lines.length * lineHeight - lineHeight * 0.28;
      ctx.shadowBlur = selected ? 16 : 8;
      ctx.strokeStyle = '#d08cff';
      ctx.lineWidth = selected ? 2 : 1.2;
      ctx.beginPath();
      ctx.moveTo(sx - underlineWidth / 2, underlineY);
      ctx.lineTo(sx + underlineWidth / 2, underlineY);
      ctx.stroke();
    }

    ctx.shadowBlur = 0;
    ctx.textAlign = 'start';
    return true;
  }

  roundRectPath(ctx, x, y, width, height, radius) {
    const r = Math.min(radius, width / 2, height / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + width, y, x + width, y + height, r);
    ctx.arcTo(x + width, y + height, x, y + height, r);
    ctx.arcTo(x, y + height, x, y, r);
    ctx.arcTo(x, y, x + width, y, r);
    ctx.closePath();
  }

  drawLabels(ctx) {
    if (this.materialOverlay || this.representationMode === 'territories') return;
    if (this.representationMode === 'constellation' && this.selectedNode) {
      this.drawConstellationLabels(ctx);
      return;
    }
    const node = this.hoverNode || this.selectedNode;
    if (!node || node.type === 'image') return;
    const item = this.projected.find((row) => String(row.node.id) === String(node.id));
    if (!item) return;
    const label = this.nodeOriginLabel(item.node, 5, 54);
    ctx.save();
    ctx.font = '400 10px "Avenir Next", "Helvetica Neue", Arial, sans-serif';
    ctx.textBaseline = 'middle';
    const width = ctx.measureText(label).width;
    let x = item.sx + item.size + 7;
    const y = clamp(item.sy, 12, this.height - 12);
    if (x + width > this.width - 10) x = item.sx - item.size - width - 7;
    ctx.lineJoin = 'round';
    ctx.lineWidth = 3.5;
    ctx.strokeStyle = 'rgba(3,7,11,.9)';
    ctx.strokeText(label, x, y);
    ctx.fillStyle = '#e8f0f7';
    ctx.fillText(label, x, y);
    ctx.restore();
  }

  drawConstellationLabels(ctx) {
    ctx.save();
    ctx.font = '400 10px "Avenir Next", "Helvetica Neue", Arial, sans-serif';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    for (const item of this.projected) {
      const selected = String(item.node.id) === String(this.selectedNode.id);
      const label = this.nodeOriginLabel(item.node, selected ? 9 : 5, selected ? 92 : 56);
      const x = item.sx + item.size + 7;
      const y = clamp(item.sy, 12, this.height - 12);
      ctx.lineWidth = selected ? 4.5 : 3.2;
      ctx.strokeStyle = 'rgba(3,7,11,.9)';
      ctx.strokeText(label, x, y);
      ctx.fillStyle = selected ? '#ffffff' : 'rgba(220,231,241,.82)';
      ctx.fillText(label, x, y);
    }
    ctx.restore();
  }

  nodeOriginLabel(node, words = 8, chars = 82) {
    const raw = String(node.text || node.label || (node.id ?? '')).replace(/\s+/g, ' ').trim();
    const parts = raw.split(' ');
    let text = parts.slice(0, words).join(' ');
    if (parts.length > words) text += '…';
    return text.length > chars ? `${text.slice(0, chars - 1).trim()}…` : text;
  }

  confirmNode(node, source = 'selection') {
    if (!node || this.destroyed) return;
    this.cancelDwell();
    this.selectedNode = node;
    this.groupIds = new Set(this.world.groupFor(node, Number(this.config.activeGroupLimit || 24)).map((item) => String(item.id)));
    for (const id of this.groupIds) this.progressiveIds.add(id);
    this.route.push(node);
    const maxRoute = Number(this.config.visibleRouteLimit || 36);
    if (this.route.length > maxRoute) this.route.splice(0, this.route.length - maxRoute);
    this.stats.confirmations += 1;
    if (node.type === 'image') void this.focusNode(node);
    this.onConfirm(node, { source });
  }

  async focusNode(node) {
    if (!node) return;
    const position = this.displayPositions.get(String(node.id));
    if (!position) return;
    this.camera.targetDistance = node.type === 'image' ? 1.05 : 1.35;
    if (this.is3D) {
      const yaw = Math.atan2(position.x, position.z || 1e-6);
      const horizontal = Math.hypot(position.x, position.z);
      const pitch = -Math.atan2(position.y, Math.max(1e-6, horizontal));
      this.camera.yaw = lerp(this.camera.yaw, -yaw, 0.65);
      this.camera.pitch = clamp(lerp(this.camera.pitch, pitch, 0.65), -1.15, 1.15);
    } else {
      const projected = this.projectPosition(position);
      this.camera.targetPanX += this.width / 2 - projected.sx;
      this.camera.targetPanY += this.height / 2 - projected.sy;
    }
  }

  async transitionProjection(duration = 1050) {
    const next = this.layoutPositions(this.representationMode);
    const current = new Map();
    for (const node of this.world.nodes) {
      const id = String(node.id);
      current.set(id, this.displayPositions.get(id) || next.get(id));
    }
    this.transition = { from: current, to: next, start: performance.now(), duration: Math.max(300, Number(duration) || 950) };
    await new Promise((resolve) => window.setTimeout(resolve, this.transition.duration + 30));
    this.groupIds.clear();
    this.selectedNode = null;
    this.hoverNode = null;
    this.route = [];
  }

  async search(query, scope = 'all') {
    return this.performance.measure('search', async () => {
      const normalized = String(query || '').trim();
      const matches = !normalized && scope === 'all' ? [] : this.world.search(normalized, scope);
      this.searchIds = new Set(matches.map((node) => String(node.id)));
      for (const id of this.searchIds) this.progressiveIds.add(id);
      return matches;
    });
  }

  async reset() {
    this.cancelDwell();
    this.route = [];
    this.searchIds.clear();
    this.groupIds.clear();
    this.selectedNode = null;
    this.hoverNode = null;
    this.camera.yaw = -0.58;
    this.camera.pitch = 0.33;
    this.camera.targetDistance = 3.55;
    this.camera.targetPanX = 0;
    this.camera.targetPanY = 0;
  }

  getCameraState() {
    return {
      renderer: 'canvas-perspective',
      yaw: this.camera.yaw,
      pitch: this.camera.pitch,
      distance: this.camera.distance,
      panX: this.camera.panX,
      panY: this.camera.panY,
    };
  }

  destroy() {
    this.destroyed = true;
    this.cancelDwell();
    if (this.raf) cancelAnimationFrame(this.raf);
    if (this.progressiveHandle) (window.cancelIdleCallback || window.clearTimeout)(this.progressiveHandle);
    this.resizeObserver?.disconnect();
    if (this.canvas) {
      this.canvas.removeEventListener('pointermove', this.bound.pointerMove);
      this.canvas.removeEventListener('pointerdown', this.bound.pointerDown);
      this.canvas.removeEventListener('pointerleave', this.bound.pointerLeave);
      this.canvas.removeEventListener('wheel', this.bound.wheel);
    }
    window.removeEventListener('pointerup', this.bound.pointerUp);
    window.removeEventListener('pointercancel', this.bound.pointerCancel);
    window.removeEventListener('resize', this.bound.resize);
    for (const id of [...this.imageCache.keys()]) this.releaseImage(id);
    if (this.element) this.element.innerHTML = '';
  }
}
