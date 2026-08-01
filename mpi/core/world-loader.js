import { fetchJson } from './utils.js?v=20260801-original-working-rollback';
import { World } from './world.js?v=20260801-original-working-rollback';

export class WorldLoader {
  constructor(performanceMonitor) {
    this.performance = performanceMonitor;
    this.controller = null;
  }

  async loadRegistry(url = 'worlds/index.json') {
    const registryUrl = new URL(url, document.baseURI);
    const data = await fetchJson(registryUrl, 'el registro de mundos');
    const worlds = (data.worlds || [])
      .filter((entry) => entry.enabled !== false)
      .map((entry) => ({ ...entry, manifestUrl: new URL(entry.manifest, registryUrl).href }));
    return { ...data, worlds };
  }

  abort() {
    this.controller?.abort();
    this.controller = null;
  }

  async loadWorld(manifestUrl) {
    this.abort();
    this.controller = new AbortController();
    const { signal } = this.controller;

    try {
      return await this.performance.measure('worldLoad', async () => {
        const resolvedManifestUrl = new URL(manifestUrl, document.baseURI);
        const manifest = await fetchJson(resolvedManifestUrl, 'manifest.json', { signal });
        this.validateManifest(manifest);
        const resolve = (path) => new URL(path, resolvedManifestUrl).href;
        const optional = async (path, label, fallback) => {
          if (!path) return fallback;
          try { return await fetchJson(resolve(path), label, { signal }); }
          catch (error) {
            console.warn(`${label} no disponible; se continúa con valores por defecto.`, error);
            return fallback;
          }
        };

        const projectionEntries = Object.entries(manifest.files?.projections || {});
        const projectionPromise = Promise.all(projectionEntries.map(async ([id, path]) => [
          id,
          await optional(path, `proyección ${id}`, null),
        ])).then((rows) => Object.fromEntries(rows.filter(([, value]) => value)));

        const [nodes, coordinates, neighbors, relations, sonification, projections, prompts] = await Promise.all([
          fetchJson(resolve(manifest.files.nodes), 'nodes.json', { signal }),
          fetchJson(resolve(manifest.files.coordinates), 'coordinates.json', { signal }),
          fetchJson(resolve(manifest.files.neighbors), 'neighbors.json', { signal }),
          optional(manifest.files.relations, 'relations.json', { relations: [] }),
          optional(manifest.files.sonification, 'sonification.json', {}),
          projectionPromise,
          optional(manifest.files.prompts, 'prompts musicales', { prompts: [] }),
        ]);

        return new World({
          manifest,
          manifestUrl: resolvedManifestUrl.href,
          nodes,
          coordinates,
          neighbors,
          relations,
          sonification,
          projections,
          prompts,
        });
      });
    } finally {
      if (this.controller?.signal === signal) this.controller = null;
    }
  }

  validateManifest(manifest) {
    const supported = new Set(['semantic-sound-world/1', 'semantic-sound-world/2']);
    if (!manifest || !supported.has(manifest.format)) {
      throw new Error('El manifest no utiliza un formato compatible semantic-sound-world/1 o /2.');
    }
    for (const key of ['nodes', 'coordinates', 'neighbors']) {
      if (!manifest.files?.[key]) throw new Error(`Falta files.${key} en manifest.json.`);
    }
  }
}
