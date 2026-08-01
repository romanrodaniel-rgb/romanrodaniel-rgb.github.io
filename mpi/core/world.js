const AUDIO_TYPES = new Set(['audio-original', 'audio-recorded', 'audio-generated']);
const RELATION_PRIORITY = [
  'text-audio', 'image-source', 'derived-from', 'documentary', 'spatial',
  'chronological', 'belongs-to-source', 'semantic-similarity', 'navigation',
];

export class World {
  constructor(bundle) {
    this.manifest = bundle.manifest;
    this.manifestUrl = bundle.manifestUrl;
    this.id = this.manifest.id;
    this.name = this.manifest.name;
    this.method = this.manifest.method || '';
    this.dimensions = Number(this.manifest.dimensions || 3);
    this.sonification = bundle.sonification || {};

    const nodeRows = bundle.nodes.nodes || bundle.nodes;
    const defaultCoordinateRows = bundle.coordinates.coordinates || bundle.coordinates;
    if (!Array.isArray(nodeRows) || !Array.isArray(defaultCoordinateRows)) {
      throw new Error('nodes.json y coordinates.json deben contener listas.');
    }
    if (nodeRows.length !== defaultCoordinateRows.length) {
      throw new Error('nodes.json y coordinates.json tienen cantidades distintas.');
    }

    this.coordinateSets = new Map();
    const defaultProjection = this.manifest.defaultProjection || 'default';
    this.coordinateSets.set(defaultProjection, bundle.coordinates);
    for (const [id, projection] of Object.entries(bundle.projections || {})) {
      if (projection) this.coordinateSets.set(id, projection);
    }
    this.activeProjection = this.coordinateSets.has(defaultProjection)
      ? defaultProjection
      : this.coordinateSets.keys().next().value;

    const coordinatesById = this.coordinatesMap(this.coordinateSets.get(this.activeProjection));
    this.nodes = nodeRows.map((row) => {
      const coordinate = coordinatesById.get(String(row.id));
      if (!coordinate) throw new Error(`Faltan coordenadas para el nodo ${row.id}.`);
      const text = row.text ?? row.title ?? row.label ?? row.verse ?? '';
      return {
        ...row,
        id: row.id,
        type: row.type || 'text-fragment',
        text,
        label: row.label || row.title || text,
        x: Number(coordinate.x),
        y: Number(coordinate.y),
        z: Number(coordinate.z ?? 0),
        region: coordinate.region ?? row.region ?? 'default',
      };
    });

    this.byId = new Map(this.nodes.map((node) => [String(node.id), node]));
    this.indexById = new Map(this.nodes.map((node, index) => [String(node.id), index]));
    this.searchText = this.nodes.map((node) => [
      node.label,
      node.text,
      node.type,
      node.region,
      node.metadata ? JSON.stringify(node.metadata) : '',
    ].join(' ').toLocaleLowerCase('es'));

    this.neighborRows = bundle.neighbors.neighbors || [];
    this.densityRows = bundle.neighbors.density || [];
    this.neighborMetric = bundle.neighbors.metric || 'euclidean';

    const relationRows = bundle.relations?.relations || bundle.relations || [];
    this.relations = Array.isArray(relationRows) ? relationRows.map((relation, index) => ({
      id: relation.id || `relation-${index}`,
      type: relation.type || 'documentary',
      source: relation.source,
      target: relation.target,
      weight: Number(relation.weight ?? 1),
      metadata: relation.metadata || {},
    })) : [];
    this.relationsByNode = new Map();
    for (const relation of this.relations) {
      for (const id of [relation.source, relation.target]) {
        const key = String(id);
        const list = this.relationsByNode.get(key) || [];
        list.push(relation);
        this.relationsByNode.set(key, list);
      }
    }

    this.audio = new Map();
    for (const node of this.nodes) {
      const audio = node.media?.audio || node.audio;
      if (!audio?.file) continue;
      this.audio.set(String(node.id), {
        ...audio,
        id: node.id,
        nodeId: node.id,
        nodeType: node.type,
        label: node.label,
        provenance: audio.provenance || node.provenance || {},
        url: new URL(audio.file, this.manifestUrl).href,
      });
    }
    for (const item of this.manifest.audio?.items || []) {
      this.audio.set(String(item.id), {
        ...item,
        id: item.id,
        nodeId: item.id,
        nodeType: 'audio-original',
        label: `Audio ${item.id}`,
        provenance: item.provenance || { category: 'legacy' },
        url: new URL(item.file, this.manifestUrl).href,
      });
    }

    const promptRows = bundle.prompts?.prompts || [];
    this.prompts = Array.isArray(promptRows) ? promptRows : [];
    this.promptByRegion = new Map();
    this.promptByRelation = new Map();
    for (const prompt of this.prompts) {
      const region = prompt.target?.region;
      const relation = prompt.target?.relationType;
      if (region) this.promptByRegion.set(String(region), prompt);
      if (relation && !this.promptByRelation.has(String(relation))) this.promptByRelation.set(String(relation), prompt);
    }

    this.rebuildRegions();
  }

  coordinatesMap(data) {
    const rows = data?.coordinates || data || [];
    return new Map(rows.map((row) => [String(row.id), row]));
  }

  projectionOptions() {
    const labels = { default: 'Proyección principal', umap: 'UMAP', tsne: 't-SNE', pca: 'PCA' };
    return [...this.coordinateSets.entries()].map(([id, data]) => ({
      id,
      label: labels[id] || id,
      method: data?.method || id,
    }));
  }

  setProjection(id) {
    if (!this.coordinateSets.has(id)) return false;
    const map = this.coordinatesMap(this.coordinateSets.get(id));
    for (const node of this.nodes) {
      const coordinate = map.get(String(node.id));
      if (!coordinate) throw new Error(`La proyección ${id} no contiene el nodo ${node.id}.`);
      node.x = Number(coordinate.x);
      node.y = Number(coordinate.y);
      node.z = Number(coordinate.z ?? 0);
      node.region = coordinate.region ?? node.region ?? 'default';
    }
    this.activeProjection = id;
    this.rebuildRegions();
    return true;
  }

  rebuildRegions() {
    this.regions = new Map();
    for (const node of this.nodes) {
      const list = this.regions.get(node.region) || [];
      list.push(node);
      this.regions.set(node.region, list);
    }
    this.bounds = this.getBounds();
  }

  getNode(id) { return this.byId.get(String(id)); }

  isAudioNode(nodeOrId) {
    const node = typeof nodeOrId === 'object' ? nodeOrId : this.getNode(nodeOrId);
    return Boolean(node && AUDIO_TYPES.has(node.type));
  }

  getAudioAsset(id) { return this.audio.get(String(id)); }

  mediaUrl(nodeOrId, kind = 'image') {
    const node = typeof nodeOrId === 'object' ? nodeOrId : this.getNode(nodeOrId);
    const file = node?.media?.[kind]?.file;
    return file ? new URL(file, this.manifestUrl).href : null;
  }

  sourceUrl(nodeOrId) {
    const node = typeof nodeOrId === 'object' ? nodeOrId : this.getNode(nodeOrId);
    if (!node) return null;
    const metadata = node.metadata || {};
    const traceability = metadata.traceability || {};
    const directSource = this.getNode(traceability.sourceDocumentId || metadata.sourceId || metadata.source);
    const sourceFile = traceability.sourceFile
      || metadata.sourceFile
      || directSource?.metadata?.traceability?.sourceFile
      || directSource?.metadata?.sourceFile;
    if (!sourceFile) return null;
    const url = new URL(sourceFile, this.manifestUrl);
    const page = traceability.pageNumber ?? metadata.page ?? metadata.pageNumber ?? metadata.page_number;
    if (/\.pdf$/i.test(url.pathname) && page !== undefined && page !== null && page !== '') {
      url.hash = `page=${encodeURIComponent(String(page))}`;
    }
    return url.href;
  }

  pdfPageReference(nodeOrId) {
    const node = typeof nodeOrId === 'object' ? nodeOrId : this.getNode(nodeOrId);
    if (!node) return null;
    const source = this.sourceUrl(node);
    if (!source) return null;
    const url = new URL(source);
    if (!/\.pdf$/i.test(url.pathname)) return null;
    const metadata = node.metadata || {};
    const traceability = metadata.traceability || {};
    const page = traceability.pageNumber
      ?? metadata.page
      ?? metadata.pageNumber
      ?? metadata.page_number
      ?? (node.type === 'document' ? 1 : null);
    if (page === null || page === undefined || page === '') return null;
    url.hash = '';
    const pageNumber = Math.max(1, Number.parseInt(page, 10) || 1);
    return {
      url: url.href,
      pageNumber,
      pageLabel: String(traceability.pageLabel ?? metadata.pageLabel ?? pageNumber),
      ocrStatus: String(metadata.ocrStatus || traceability.ocrStatus || 'unknown'),
      hasDigitalText: Boolean(metadata.hasDigitalText || metadata.extractionStatus === 'digital-text'),
      representation: 'page-facsimile',
    };
  }

  thumbnailUrl(nodeOrId) {
    const node = typeof nodeOrId === 'object' ? nodeOrId : this.getNode(nodeOrId);
    const image = node?.media?.image;
    const file = image?.thumbnail || image?.file;
    return file ? new URL(file, this.manifestUrl).href : null;
  }

  imageNodes() { return this.nodes.filter((node) => node.type === 'image' && this.mediaUrl(node, 'image')); }

  dist(a, b) {
    if (!a || !b) return 0;
    return Math.hypot(a.x - b.x, a.y - b.y, (a.z || 0) - (b.z || 0));
  }

  nearest(nodeOrId, count = 3) {
    const node = typeof nodeOrId === 'object' ? nodeOrId : this.getNode(nodeOrId);
    if (!node) return [];
    const index = this.indexById.get(String(node.id));
    const row = this.neighborRows[index] || [];
    return row.slice(0, count).map((entry) => {
      const [id, distance] = Array.isArray(entry) ? entry : [entry.id, entry.distance];
      return { node: this.getNode(id), distance: Number(distance) };
    }).filter((entry) => entry.node);
  }

  density(nodeOrId) {
    const id = typeof nodeOrId === 'object' ? nodeOrId.id : nodeOrId;
    const index = this.indexById.get(String(id));
    const explicit = this.getNode(id)?.metadata?.densityScore ?? this.getNode(id)?.metadata?.density_score;
    return Number(this.densityRows[index] ?? explicit ?? 0);
  }

  relationsFor(nodeOrId, types = null) {
    const id = typeof nodeOrId === 'object' ? nodeOrId.id : nodeOrId;
    const list = this.relationsByNode.get(String(id)) || [];
    if (!types) return list;
    const accepted = new Set(types);
    return list.filter((relation) => accepted.has(relation.type));
  }

  relationBetween(aOrId, bOrId) {
    const aId = String(typeof aOrId === 'object' ? aOrId.id : aOrId);
    const bId = String(typeof bOrId === 'object' ? bOrId.id : bOrId);
    return this.relationsFor(aId)
      .filter((relation) => {
        const source = String(relation.source);
        const target = String(relation.target);
        return (source === aId && target === bId) || (source === bId && target === aId);
      })
      .sort((a, b) => b.weight - a.weight)[0] || null;
  }

  dominantRelation(nodeOrId) {
    const node = typeof nodeOrId === 'object' ? nodeOrId : this.getNode(nodeOrId);
    if (!node) return 'semantic-similarity';
    if (node.type === 'image') return 'image-source';
    if (this.isAudioNode(node)) return 'text-audio';
    if (node.type === 'document' || node.type === 'document-page') return 'documentary';
    const counts = new Map();
    for (const relation of this.relationsFor(node)) {
      counts.set(relation.type, (counts.get(relation.type) || 0) + Math.max(0.1, relation.weight));
    }
    return [...counts.entries()].sort((a, b) => {
      const score = b[1] - a[1];
      if (score) return score;
      return RELATION_PRIORITY.indexOf(a[0]) - RELATION_PRIORITY.indexOf(b[0]);
    })[0]?.[0] || 'semantic-similarity';
  }

  relationProfile(nodeOrId) {
    const node = typeof nodeOrId === 'object' ? nodeOrId : this.getNode(nodeOrId);
    if (!node) return [];
    const counts = new Map();
    for (const relation of this.relationsFor(node)) {
      counts.set(relation.type, (counts.get(relation.type) || 0) + Math.max(0.1, relation.weight));
    }
    const fallback = this.dominantRelation(node);
    if (!counts.size) counts.set(fallback, 1);
    return [...counts.entries()]
      .map(([type, weight]) => ({ type, weight }))
      .sort((a, b) => b.weight - a.weight || RELATION_PRIORITY.indexOf(a.type) - RELATION_PRIORITY.indexOf(b.type));
  }

  relationGroup(nodeOrId) {
    const node = typeof nodeOrId === 'object' ? nodeOrId : this.getNode(nodeOrId);
    if (!node) return { id: 'none', label: 'sin grupo', relationType: 'semantic-similarity', region: 'default' };
    const relationType = this.dominantRelation(node);
    return {
      id: `${relationType}:${node.region}`,
      label: `${this.relationLabel(relationType)} · ${node.region}`,
      relationType,
      region: node.region,
    };
  }

  relationLabel(type) {
    const labels = {
      'belongs-to-source': 'fuente documental',
      'text-audio': 'texto–sonido',
      'image-source': 'imagen–fuente',
      'derived-from': 'derivación',
      documentary: 'documental',
      chronological: 'cronológica',
      spatial: 'espacial',
      'semantic-similarity': 'semejanza semántica',
      navigation: 'navegación',
    };
    return labels[type] || type;
  }

  relationExplanation(type, weight = null) {
    const explanations = {
      'belongs-to-source': 'forma parte de la misma fuente documental',
      'text-audio': 'comparte un vínculo intermodal entre texto y sonido',
      'image-source': 'vincula una imagen con su fuente o descripción',
      'derived-from': 'fue derivado de este material durante un proceso trazable',
      documentary: 'pertenece al mismo conjunto documental',
      chronological: 'comparte una relación temporal declarada',
      spatial: 'comparte una relación espacial declarada',
      'semantic-similarity': 'presenta semejanza calculada en el espacio vectorial',
      navigation: 'quedó vinculado por un recorrido de navegación',
    };
    const score = Number.isFinite(Number(weight)) ? ` · intensidad ${Number(weight).toFixed(3)}` : '';
    return `${explanations[type] || `comparte la relación “${this.relationLabel(type)}”`}${score}`;
  }

  isGeneratedNode(nodeOrId) {
    const node = typeof nodeOrId === 'object' ? nodeOrId : this.getNode(nodeOrId);
    if (!node) return false;
    const status = String(node.metadata?.generationStatus || node.generationStatus || '').toLowerCase();
    const provenance = node.media?.audio?.provenance || node.provenance || {};
    return node.type === 'audio-generated'
      || ['generated', 'intermodal-generated', 'generated-audio'].includes(status)
      || String(provenance.category || '').toLowerCase() === 'generated';
  }

  sourceFor(nodeOrId) {
    const node = typeof nodeOrId === 'object' ? nodeOrId : this.getNode(nodeOrId);
    if (!node) return { node: null, label: '—', detail: 'Procedencia no declarada.' };
    const metadata = node.metadata || {};
    const directSourceId = metadata.sourceId || metadata.source;
    const directSource = directSourceId ? this.getNode(directSourceId) : null;
    if (directSource) {
      return {
        node: directSource,
        label: directSource.label || String(directSource.id),
        detail: metadata.provenance || metadata.description || `Fuente declarada: ${directSource.id}.`,
      };
    }
    const relation = this.relationsFor(node)
      .filter((item) => ['belongs-to-source', 'documentary', 'image-source', 'derived-from'].includes(item.type))
      .sort((a, b) => b.weight - a.weight)[0];
    if (relation) {
      const otherId = String(relation.source) === String(node.id) ? relation.target : relation.source;
      const sourceNode = this.getNode(otherId);
      if (sourceNode) {
        return {
          node: sourceNode,
          label: sourceNode.label || String(sourceNode.id),
          detail: this.relationExplanation(relation.type, relation.weight),
        };
      }
    }
    const sourceFile = metadata.sourceFile || node.media?.audio?.provenance?.source || node.media?.image?.provenance?.source;
    if (sourceFile) return { node: null, label: String(sourceFile), detail: metadata.provenance || 'Archivo de origen declarado.' };
    if (this.isGeneratedNode(node)) {
      const count = Array.isArray(metadata.sourceNodeIds) ? metadata.sourceNodeIds.length : 0;
      return {
        node: null,
        label: 'Composición intermodal MPI',
        detail: count ? `Resultado generado desde ${count} nodos trazables.` : 'Resultado generado con procedencia trazable.',
      };
    }
    return { node: null, label: node.region || '—', detail: 'No existe una fuente documental explícita para este nodo.' };
  }

  researchProfile(nodeOrId, relationLimit = 10) {
    const node = typeof nodeOrId === 'object' ? nodeOrId : this.getNode(nodeOrId);
    if (!node) return null;
    const source = this.sourceFor(node);
    const direct = this.relationsFor(node)
      .map((relation) => {
        const otherId = String(relation.source) === String(node.id) ? relation.target : relation.source;
        return { relation, node: this.getNode(otherId) };
      })
      .filter((item) => item.node)
      .sort((a, b) => b.relation.weight - a.relation.weight)
      .slice(0, relationLimit)
      .map(({ relation, node: relatedNode }) => ({
        node: relatedNode,
        type: relation.type,
        label: this.relationLabel(relation.type),
        weight: relation.weight,
        explanation: this.relationExplanation(relation.type, relation.weight),
        evidence: 'declarada',
      }));
    const relations = [...direct];
    if (relations.length < Math.min(4, relationLimit)) {
      const used = new Set([String(node.id), ...relations.map((item) => String(item.node.id))]);
      for (const entry of this.nearest(node, relationLimit)) {
        if (used.has(String(entry.node.id))) continue;
        relations.push({
          node: entry.node,
          type: 'vector-proximity',
          label: 'proximidad vectorial',
          weight: 1 / (1 + Math.max(0, entry.distance)),
          explanation: `es un vecino calculado a distancia ${entry.distance.toFixed(3)}; no constituye una relación documental declarada`,
          evidence: 'calculada',
        });
        if (relations.length >= relationLimit) break;
      }
    }
    const dominant = direct[0] || relations[0];
    const modality = node.type === 'image'
      ? 'Imagen'
      : this.isAudioNode(node)
      ? (this.isGeneratedNode(node) ? 'Audio generado' : 'Audio')
      : node.type === 'document'
      ? 'Documento'
      : node.type === 'document-page'
      ? 'Página documental'
      : 'Fragmento textual';
    return {
      node,
      modality,
      generated: this.isGeneratedNode(node),
      source,
      region: String(node.region || 'sin región').replace(/[-_]+/g, ' '),
      what: String(node.text || node.label || 'Nodo sin descripción textual.'),
      relations,
      why: dominant
        ? `La relación principal es ${dominant.label}: ${dominant.explanation}.`
        : 'El mundo no declara todavía una relación para este nodo.',
    };
  }

  groupFor(nodeOrId, limit = 48) {
    const node = typeof nodeOrId === 'object' ? nodeOrId : this.getNode(nodeOrId);
    if (!node) return [];
    const result = new Map([[String(node.id), node]]);
    const add = (candidate) => {
      if (candidate && result.size < limit) result.set(String(candidate.id), candidate);
    };

    const related = this.relationsFor(node)
      .sort((a, b) => b.weight - a.weight)
      .map((relation) => this.getNode(String(relation.source) === String(node.id) ? relation.target : relation.source));
    for (const candidate of related) add(candidate);

    const sameRegion = [...(this.regions.get(node.region) || [])]
      .filter((candidate) => String(candidate.id) !== String(node.id))
      .sort((a, b) => this.dist(node, a) - this.dist(node, b));
    for (const candidate of sameRegion) add(candidate);

    for (const entry of this.nearest(node, limit)) add(entry.node);
    return [...result.values()].slice(0, limit);
  }

  regionProfile(nodeOrId, limit = 24) {
    const node = typeof nodeOrId === 'object' ? nodeOrId : this.getNode(nodeOrId);
    if (!node) return null;
    const field = this.groupFor(node, limit);
    const counts = { text: 0, image: 0, audio: 0, document: 0 };
    for (const item of field) {
      if (item.type === 'image') counts.image += 1;
      else if (this.isAudioNode(item)) counts.audio += 1;
      else if (item.type === 'document') counts.document += 1;
      else counts.text += 1;
    }

    const relationWeights = new Map();
    for (const relation of this.visibleRelations(node, field.map((item) => item.id), 96)) {
      relationWeights.set(
        relation.type,
        (relationWeights.get(relation.type) || 0) + Math.max(0.05, Number(relation.weight || 0))
      );
    }
    const relations = [...relationWeights.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([type, weight]) => ({ type, label: this.relationLabel(type), weight }));

    const stopwords = new Set([
      'para', 'como', 'desde', 'entre', 'sobre', 'este', 'esta', 'estos', 'estas', 'pero',
      'porque', 'cuando', 'donde', 'tambien', 'hacia', 'hasta', 'cada', 'todo', 'toda',
      'todos', 'todas', 'del', 'las', 'los', 'una', 'uno', 'unos', 'unas', 'con', 'sin',
      'por', 'que', 'sus', 'son', 'ser', 'mas', 'the', 'and', 'from', 'with',
    ]);
    const terms = new Map();
    for (const item of field) {
      const words = `${item.label || ''} ${item.text || ''}`
        .toLocaleLowerCase('es')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .match(/[a-zñ]{4,}/g) || [];
      for (const term of words.slice(0, 80)) {
        if (stopwords.has(term)) continue;
        terms.set(term, (terms.get(term) || 0) + 1);
      }
    }
    const concepts = [...terms.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'es'))
      .slice(0, 5)
      .map(([term, frequency]) => ({ term, frequency }));
    const dominant = relations[0] || {
      type: this.dominantRelation(node),
      label: this.relationLabel(this.dominantRelation(node)),
      weight: 1,
    };
    const regionName = String(node.region || 'campo sin nombre')
      .replace(/^clap-generated-/, '')
      .replace(/[-_]+/g, ' ')
      .trim();
    const conceptLabel = concepts.slice(0, 3).map((item) => item.term).join(' · ');
    const modalities = [
      counts.text ? `${counts.text} texto${counts.text === 1 ? '' : 's'}` : '',
      counts.document ? `${counts.document} documento${counts.document === 1 ? '' : 's'}` : '',
      counts.image ? `${counts.image} imagen${counts.image === 1 ? '' : 'es'}` : '',
      counts.audio ? `${counts.audio} audio${counts.audio === 1 ? '' : 's'}` : '',
    ].filter(Boolean);
    return {
      title: conceptLabel || regionName || dominant.label,
      region: regionName || 'sin región',
      field,
      counts,
      concepts,
      relations,
      dominantRelation: dominant,
      modalities,
      summary: `${field.length} nodos · ${modalities.join(' · ') || 'sin modalidad declarada'} · relación dominante: ${dominant.label}.`,
      method: 'Interpretación calculada; describe frecuencias textuales, modalidades y relaciones del campo, no una categoría absoluta.',
    };
  }

  promptFor(nodeOrId) {
    const node = typeof nodeOrId === 'object' ? nodeOrId : this.getNode(nodeOrId);
    if (!node) return null;
    return this.promptByRegion.get(String(node.region))
      || this.promptByRelation.get(this.dominantRelation(node))
      || null;
  }

  visibleRelations(nodeOrId, contextIds = [], limit = 12) {
    const node = typeof nodeOrId === 'object' ? nodeOrId : this.getNode(nodeOrId);
    if (!node) return [];
    const context = new Set([String(node.id), ...contextIds.map(String)]);
    const priority = new Map(RELATION_PRIORITY.map((type, index) => [type, index]));
    return this.relations
      .filter((relation) => context.has(String(relation.source)) || context.has(String(relation.target)))
      .sort((a, b) => (priority.get(a.type) ?? 99) - (priority.get(b.type) ?? 99) || b.weight - a.weight)
      .slice(0, Math.max(0, limit))
      .map((relation) => ({ ...relation, sourceNode: this.getNode(relation.source), targetNode: this.getNode(relation.target) }))
      .filter((relation) => relation.sourceNode && relation.targetNode);
  }

  audioCandidates(nodeOrId, limit = 6) {
    const node = typeof nodeOrId === 'object' ? nodeOrId : this.getNode(nodeOrId);
    if (!node) return [];
    const candidates = new Map();
    const add = (audioNode, relation = null) => {
      if (!audioNode || !this.isAudioNode(audioNode)) return;
      const asset = this.getAudioAsset(audioNode.id);
      if (!asset) return;
      const current = candidates.get(String(audioNode.id));
      const candidate = {
        node: audioNode,
        asset,
        relationType: relation?.type || 'self',
        relationWeight: Number(relation?.weight ?? 1),
      };
      if (!current || candidate.relationWeight > current.relationWeight) candidates.set(String(audioNode.id), candidate);
    };

    add(node);
    for (const relation of this.relationsFor(node)) {
      const otherId = String(relation.source) === String(node.id) ? relation.target : relation.source;
      add(this.getNode(otherId), relation);
    }
    if (node.audio_id !== undefined && this.getAudioAsset(node.audio_id)) {
      const asset = this.getAudioAsset(node.audio_id);
      candidates.set(String(node.audio_id), {
        node: this.getNode(node.audio_id) || node,
        asset,
        relationType: 'legacy-text-audio',
        relationWeight: 1,
      });
    }
    if (!candidates.size) {
      for (const entry of this.nearest(node, 12)) add(entry.node, { type: 'semantic-similarity', weight: 1 / (1 + entry.distance) });
    }
    return [...candidates.values()].sort((a, b) => b.relationWeight - a.relationWeight).slice(0, limit);
  }


  shortLabel(nodeOrText, maxWords = 9, maxChars = 72) {
    const node = typeof nodeOrText === 'object' ? nodeOrText : null;
    const source = node ? (node.type === 'image' || node.type === 'document' || this.isAudioNode(node) ? node.label : (node.text || node.label)) : nodeOrText;
    const clean = String(source || '').replace(/\s+/g, ' ').trim();
    if (!clean) return 'Sin etiqueta';
    const words = clean.split(' ');
    let value = words.slice(0, Math.max(1, maxWords)).join(' ');
    if (words.length > maxWords) value += '…';
    if (value.length > maxChars) value = `${value.slice(0, Math.max(1, maxChars - 1)).trim()}…`;
    return value;
  }

  search(query, scope = 'all') {
    const normalized = String(query || '').trim().toLocaleLowerCase('es');
    const matches = [];
    for (let index = 0; index < this.searchText.length; index += 1) {
      const node = this.nodes[index];
      const generated = this.isGeneratedNode(node);
      if (scope === 'generated' && !generated) continue;
      if (scope === 'archive' && generated) continue;
      if (!normalized || this.searchText[index].includes(normalized)) matches.push(node);
    }
    return matches;
  }

  regionBatches(chunkSize = 1000) {
    const regionEntries = [...this.regions.entries()].map(([id, nodes]) => {
      const centroid = nodes.reduce((acc, node) => ({
        x: acc.x + node.x / nodes.length,
        y: acc.y + node.y / nodes.length,
        z: acc.z + node.z / nodes.length,
      }), { x: 0, y: 0, z: 0 });
      return { id, nodes, radius: Math.hypot(centroid.x, centroid.y, centroid.z) };
    }).sort((a, b) => a.radius - b.radius);

    const batches = [];
    let current = [];
    for (const region of regionEntries) {
      if (current.length && current.length + region.nodes.length > chunkSize) {
        batches.push(current);
        current = [];
      }
      current.push(...region.nodes);
    }
    if (current.length) batches.push(current);
    return batches;
  }

  getBounds() {
    const axis = (key) => {
      const values = this.nodes.map((node) => node[key]);
      return values.length ? [Math.min(...values), Math.max(...values)] : [0, 0];
    };
    return { x: axis('x'), y: axis('y'), z: axis('z') };
  }
}
