import { AudioEngine } from './audio-engine.js?v=20260801-ios-audio';
import { debounce } from './utils.js';
import { ExperienceRecorder } from './experience-recorder.js';
import { PerformanceMonitor } from './performance-monitor.js?v=20260801-mobile-safari';
import { Renderer } from './renderer.js?v=20260801-mobile-safari';
import { SessionRecorder } from './session-recorder.js';
import { WorldLoader } from './world-loader.js';
import {
  extractPdfInBrowser,
  renderPdfPagePreview,
  isSupportedMaterial,
  recordsFromDrop,
  recordsFromFiles,
} from './material-drop.js';

const UI_TRANSLATIONS = Object.freeze({
  'Motor de Pensamiento Imaginal': 'Imaginal Thought Engine',
  'mundo · versión': 'world · version',
  'Cargando…': 'Loading…',
  'Ficha': 'Details',
  'Contexto activo': 'Active context',
  'Ver todos': 'Show all',
  'Experiencia de navegación': 'Navigation experience',
  'Investigación': 'Research',
  'Composición': 'Composition',
  'Examina fuentes, relaciones, coordenadas y trazabilidad sobre el corpus compartido.': 'Inspect sources, relations, coordinates and traceability across the shared corpus.',
  'Cargando mundo…': 'Loading world…',
  'GENERADO · TRAZABLE': 'GENERATED · TRACEABLE',
  'Ficha del nodo': 'Node details',
  'Ningún nodo seleccionado': 'No node selected',
  '← Anterior': '← Previous',
  '¿Qué es?': 'What is it?',
  'Selecciona un nodo para examinarlo.': 'Select a node to inspect it.',
  '¿De dónde procede?': 'Where does it come from?',
  '¿A qué campo pertenece?': 'Which field does it belong to?',
  '¿Por qué está relacionado?': 'Why is it related?',
  'Las relaciones explícitas proceden del mundo construido; la proximidad vectorial se identifica como una inferencia calculada.': 'Explicit relations come from the constructed world; vector proximity is identified as a calculated inference.',
  'Imágenes del mundo': 'World images',
  'Prompt musical del campo': 'Field music prompt',
  'Copiar prompt': 'Copy prompt',
  'Composición intermodal · CLAP': 'Intermodal composition · CLAP',
  'Selecciona un vector para formar su campo intermodal.': 'Select a vector to form its intermodal field.',
  'GPU externa sin configurar': 'External GPU not configured',
  'Singularidad calculada del campo': 'Calculated field singularity',
  'Descripción interpretativa calculada a partir de los materiales y relaciones visibles.': 'Interpretive description calculated from visible materials and relations.',
  'Duración': 'Duration',
  'Variantes': 'Variants',
  'Generar música desde esta región': 'Generate music from this region',
  'Preparando…': 'Preparing…',
  'La petición todavía no se ha enviado.': 'The request has not been sent yet.',
  'Materiales': 'Materials',
  'Esperando selección.': 'Waiting for selection.',
  'Campo relacional': 'Relational field',
  'Esperando análisis.': 'Waiting for analysis.',
  'Espacio CLAP': 'CLAP space',
  'Esperando cálculo externo.': 'Waiting for external calculation.',
  'Generación sonora': 'Sound generation',
  'Esperando RunPod.': 'Waiting for RunPod.',
  'Nuevo nodo': 'New node',
  'Esperando resultado validado.': 'Waiting for a validated result.',
  'Ver explicación completa del proceso': 'View full process explanation',
  'Cada ejecución crea un nodo sonoro nuevo y conserva su procedencia. Puedes repetirla sobre la misma región o sobre una región que ya contenga resultados anteriores.': 'Each run creates a new sound node and preserves its provenance. You can repeat it on the same region or on a region that already contains previous results.',
  'Interacción': 'Interaction',
  'Estado': 'Status',
  'inicializando': 'initialising',
  'Volumen': 'Volume',
  'Activar por permanencia': 'Activate by dwell',
  'Demora': 'Delay',
  'Destacar grupo activado': 'Highlight active group',
  'Calidad gráfica': 'Graphic quality',
  'Fluida': 'Fluid',
  'Equilibrada': 'Balanced',
  'Alta resolución': 'High resolution',
  'Tamaño de imágenes': 'Image size',
  'Casi imperceptibles': 'Almost invisible',
  'Orientativas': 'Guiding',
  'Medias': 'Medium',
  'Grandes': 'Large',
  'Protagonistas': 'Prominent',
  'Mostrar recorridos y relaciones': 'Show journeys and relations',
  'Mundo': 'World',
  'Proyección': 'Projection',
  'Perspectiva': 'Perspective',
  'Escala activa': 'Active scale',
  'automática': 'automatic',
  'Color': 'Colour',
  'Grupo activo': 'Active group',
  'Carga': 'Load',
  'Carga progresiva': 'Progressive load',
  'Nodos visibles': 'Visible nodes',
  'Perfil gráfico': 'Graphic profile',
  'Modo sonoro': 'Sound mode',
  'Registro': 'Recording',
  'inactivo': 'inactive',
  'Nodos': 'Nodes',
  'Audios cargados': 'Loaded audio',
  'Nodo actual': 'Current node',
  'Tipo': 'Type',
  'Coordenada X': 'X coordinate',
  'Coordenada Y': 'Y coordinate',
  'Coordenada Z': 'Z coordinate',
  'Campo sonoro': 'Sonic field',
  'Procedencia': 'Provenance',
  'Abrir PDF original': 'Open original PDF',
  'Abrir fuente original': 'Open original source',
  'Página': 'Page',
  'Texto digital': 'Digital text',
  'OCR pendiente': 'OCR pending',
  'OCR parcial': 'Partial OCR',
  'lector PDF no disponible': 'PDF reader unavailable',
  'Extracción': 'Extraction',
  'Huella SHA-256': 'SHA-256 fingerprint',
  'Salto euclídeo': 'Euclidean jump',
  'Temperatura': 'Temperature',
  'Rendimiento y trazabilidad': 'Performance and traceability',
  'Carga del mundo': 'World load',
  'Renderizado': 'Rendering',
  'Búsqueda': 'Search',
  'Cálculo sonoro': 'Sound calculation',
  'Carga/decodificación': 'Load/decoding',
  'Inicio de audio': 'Audio start',
  'Actualización de interfaz': 'Interface update',
  'Ruta reciente': 'Recent route',
  'Registro doble': 'Dual recording',
  'Lectura opcional': 'Optional reading',
  'Ningún fragmento seleccionado': 'No fragment selected',
  'Selecciona un vector textual.': 'Select a text vector.',
  'Fragmentos del campo activo': 'Active field fragments',
  'Constructor de Mundos': 'World Constructor',
  'Ampliar': 'Extend',
  'el mundo activo': 'the active world',
  'Añadir materiales': 'Add materials',
  'Arrastra aquí archivos o carpetas': 'Drop files or folders here',
  'Ningún material preparado.': 'No material prepared.',
  'Vaciar selección': 'Clear selection',
  'Nota metodológica o procedencia': 'Methodological note or provenance',
  'Subir y revisar': 'Upload and review',
  'Sin materiales seleccionados.': 'No materials selected.',
  'Revisar y construir': 'Review and build',
  'Unidad textual aproximada': 'Approximate text unit',
  'Nombre de esta versión': 'Version name',
  'Qué cambia en este mundo': 'What changes in this world',
  'Procesar materiales': 'Process materials',
  'Esperando revisión.': 'Waiting for review.',
  'Entregas del mundo': 'World batches',
  'Todavía no hay entregas.': 'There are no batches yet.',
  'Actualizar lista': 'Refresh list',
  'Versiones del mundo': 'World versions',
  'Cargando versiones…': 'Loading versions…',
  'Actualizar historial': 'Refresh history',
  'Procesamiento externo': 'External processing',
  'Comprobando configuración…': 'Checking configuration…',
  'Endpoint GPU de Runpod': 'RunPod GPU endpoint',
  'Credencial API': 'API credential',
  'Guardar conexión': 'Save connection',
  'Comprobar GPU': 'Check GPU',
  'Importar mundo procesado': 'Import processed world',
  'Paquete de mundo enriquecido': 'Enriched world package',
  'Debe contener un manifest compatible.': 'It must contain a compatible manifest.',
  'Instalar y abrir mundo': 'Install and open world',
  'Esperando un mundo procesado.': 'Waiting for a processed world.',
  'Biblioteca de mundos': 'World library',
  'Abrir o ampliar un mundo': 'Open or extend a world',
  'Cargando mundos…': 'Loading worlds…',
  'Papelera': 'Trash',
  'Enviar un mundo a la papelera': 'Move a world to trash',
  'Mundo que quieres eliminar': 'World to remove',
  'Mover a la papelera…': 'Move to trash…',
  'Elige un mundo.': 'Choose a world.',
  'Mundos que están en la papelera': 'Worlds in trash',
  'Cargando papelera…': 'Loading trash…',
  'Actualizar papelera': 'Refresh trash',
  'Confirmar retirada': 'Confirm removal',
  'Este mundo irá a la papelera': 'This world will be moved to trash',
  'Aceptar · mover a la papelera': 'Accept · move to trash',
  'Crear un mundo nuevo': 'Create a new world',
  'Nombre del mundo': 'World name',
  'Descripción': 'Description',
  'Pregunta o impulso de investigación': 'Research question or impulse',
  'Unidad textual inicial': 'Initial text unit',
  'Fragmentos breves': 'Short fragments',
  'Fragmentos equilibrados': 'Balanced fragments',
  'Fragmentos amplios': 'Long fragments',
  'Crear mundo y añadir materiales': 'Create world and add materials',
  'Esperando un nombre.': 'Waiting for a name.',
  'Esta aplicación necesita JavaScript.': 'This application requires JavaScript.',
});

class App {
  constructor() {
    this.dom = Object.fromEntries([
      'world', 'search', 'nodeScope', 'workspaceMode', 'knowledgeScale', 'workspaceBadge', 'workspaceMetric', 'scaleMetric', 'modePurpose',
      'mode', 'viewMode', 'projection', 'colorMode', 'showLinks', 'showAxes', 'imageScale', 'renderQuality',
      'representationMode', 'showMaterials', 'visualTemperature', 'visualTemperatureMetric', 'languageToggle',
      'secondaryFx', 'dwellEnabled', 'dwellDelay', 'record', 'recordLabel', 'reset', 'stop', 'audioUnlock', 'volume', 'volumeMetric',
      'active', 'generatedBadge', 'route', 'recordState', 'nodes', 'audios', 'nodeId', 'nodeType',
      'navigationContext', 'navigationVisible', 'showAllNodes', 'mainPanelTab',
      'researchNodeCard', 'researchNodeTitle', 'researchNodeKinds', 'researchWhat',
      'researchSource', 'researchRegion', 'researchWhy', 'researchRelations', 'researchBack',
      'audioId', 'audioProvenance', 'jump', 'heat', 'modeMetric', 'worldMetric',
      'projectionMetric', 'colorMetric', 'relationGroup', 'loadState', 'loadProgress', 'visibleProgress',
      'interactionState', 'performanceProfile', 'perfWorld', 'perfRender', 'perfSearch',
      'perfSonic', 'perfDecode', 'perfAudioStart', 'perfUi', 'loadingOverlay', 'loadingText',
      'mediaPreview', 'mediaImage', 'mediaTitle', 'mediaText', 'imageGallery',
      'coordinateHud', 'coordX', 'coordY', 'coordZ',
      'promptText', 'promptStatus', 'copyPrompt',
      'clapStatus', 'clapFieldMetric', 'clapSourceMetric', 'clapDuration', 'clapVariants',
      'prepareClapJob', 'externalState', 'clapProgress', 'clapStage', 'clapElapsed', 'clapProgressFill', 'clapProgressDetail', 'clapResultNote',
      'clapTrace', 'clapEvidence', 'regionProfile', 'regionProfileTitle', 'regionProfileSummary',
      'regionProfileConcepts', 'regionProfileMethod', 'clapProcessDetails', 'clapProcessLog',
      'exploreTab', 'textsTab', 'textNodeTitle', 'textNodeMeta', 'textNodeBody', 'textGroupList',
      'worldVersionBadge',
      'openWorldLibrary', 'worldLibraryDialog', 'worldLibraryClose', 'worldLibrary',
      'newWorld', 'newWorldDialog', 'newWorldClose', 'newWorldName', 'newWorldDescription',
      'newWorldQuestion', 'newWorldSegment', 'createWorld', 'newWorldProgress',
      'openWorldTrash', 'worldTrashDialog', 'worldTrashClose', 'trashWorldSelect',
      'requestWorldDelete', 'worldTrashStatus', 'worldTrash', 'refreshTrash',
      'deleteWorldConfirmDialog', 'deleteWorldConfirmClose', 'deleteWorldConfirmText',
      'confirmWorldDelete',
      'manageWorld', 'constructorDialog', 'constructorWorld', 'constructorClose',
      'materialDropZone', 'materialFiles', 'selectedMaterials', 'clearMaterials',
      'materialNotes', 'uploadMaterials', 'materialProgress',
      'segmentMode', 'versionName', 'versionDescription', 'reviewSummary', 'processBatch', 'processProgress',
      'worldPackage', 'installWorld', 'installProgress', 'pendingBatches', 'refreshBatches',
      'historyViewingNote', 'worldVersionHistory', 'refreshHistory',
      'gpuConnectionStatus', 'gpuEndpointId', 'gpuApiKey', 'saveGpuConfig', 'testGpuConfig',
      'contextHelpBubble', 'contextHelpTitle', 'contextHelpText',
    ].map((id) => [id, document.getElementById(id)]));
    this.performance = new PerformanceMonitor((name, summary) => this.updatePerformance(name, summary), 750);
    this.loader = new WorldLoader(this.performance);
    this.recorder = new SessionRecorder();
    this.experienceRecorder = new ExperienceRecorder();
    this.renderer = null;
    this.audio = null;
    this.world = null;
    this.lastConfirmedNode = null;
    this.recording = false;
    this.recordStopping = false;
    this.recordingStartedAt = 0;
    this.recordingClock = 0;
    this.recordingFilenameBase = '';
    this.searchMatches = [];
    this.currentNode = null;
    this.researchBackStack = [];
    this.researchNavigatingBack = false;
    this.activePanelTab = 'explore';
    this.localApiAvailable = false;
    this.selectedBatchId = null;
    this.currentBatchPreview = null;
    this.historicalSnapshotId = null;
    this.activeGpuJob = null;
    this.externalServiceConfigured = false;
    this.availableWorlds = [];
    this.pendingWorldDeletion = null;
    this.selectedMaterialRecords = new Map();
    this.materialSelectionWorldId = null;
    this.language = 'en';
    this.compactExperience = Boolean(window.matchMedia?.('(max-width: 700px), (pointer: coarse)').matches || window.innerWidth <= 700);
    this.displayCaptureAvailable = Boolean(navigator.mediaDevices?.getDisplayMedia && window.MediaRecorder);
    this.interfaceSpanishText = new WeakMap();
    this.interfaceTranslationObserver = null;
    this.translatingInterface = false;
    this.audioEnabled = false;
    this.workspaceAxes = { research: true, composition: false };
    this.searchHandler = debounce((query) => void this.runSearch(query), 220);
    this.restoreVisualPreferences();
    this.restoreLanguagePreference();
  }

  installBrowserCompatibility() {
    const root = document.documentElement;
    const syncViewport = () => {
      const height = Math.max(320, Math.round(window.visualViewport?.height || window.innerHeight || 720));
      root.style.setProperty('--app-height', `${height}px`);
    };
    syncViewport();
    window.addEventListener('resize', syncViewport, { passive: true });
    window.addEventListener('orientationchange', syncViewport, { passive: true });
    window.visualViewport?.addEventListener('resize', syncViewport, { passive: true });
    root.classList.toggle('compact-experience', this.compactExperience);

    if (this.compactExperience) {
      this.dom.renderQuality.value = 'fluid';
      const temperature = Math.min(24, Number(this.dom.visualTemperature.value || 24));
      this.dom.visualTemperature.value = String(temperature);
      this.dom.visualTemperatureMetric.textContent = `${temperature} %`;
      document.querySelectorAll('.tool-popover select').forEach((control) => {
        control.addEventListener('change', () => window.setTimeout(() => control.closest('details')?.removeAttribute('open'), 80));
      });
      document.querySelectorAll('.tool-popover button:not(#audioUnlock)').forEach((control) => {
        control.addEventListener('click', () => window.setTimeout(() => control.closest('details')?.removeAttribute('open'), 80));
      });
    }

    if (!this.displayCaptureAvailable && this.dom.record) {
      this.dom.record.disabled = true;
      this.dom.record.classList.add('record-unavailable');
      this.setText('recordLabel', this.compactExperience ? 'REC · PC' : 'REC N/D');
      this.dom.record.title = this.uiText(
        'La grabación de pantalla se utiliza desde un navegador de escritorio compatible.',
        'Screen recording is available from a compatible desktop browser.'
      );
    }
  }

  async init() {
    this.bindControls();
    this.bindInterfaceTranslationObserver();
    this.applyLanguage(this.language);
    this.installBrowserCompatibility();
    const publicDemo = document.body.classList.contains('public-demo');
    if (publicDemo) {
      this.localApiAvailable = false;
      this.dom.manageWorld.disabled = true;
      this.dom.openWorldLibrary.disabled = true;
      this.dom.newWorld.disabled = true;
      this.dom.openWorldTrash.disabled = true;
    } else {
      await this.checkLocalApi();
      if (this.localApiAvailable) await this.refreshExternalService();
    }
    try {
      const registry = await this.loader.loadRegistry();
      this.populateWorlds(registry.worlds);
      const requestedId = new URLSearchParams(window.location.search).get('world');
      const first = registry.worlds.find((item) => item.id === requestedId) || registry.worlds[0];
      if (!first) throw new Error('El registro de mundos está vacío.');
      this.dom.world.value = first.manifestUrl;
      await this.loadWorld(first.manifestUrl);
    } catch (error) {
      this.showError(error);
    }
  }

  bindControls() {
    this.bindContextualHelp();
    this.dom.search.addEventListener('input', (event) => this.searchHandler(event.target.value));
    this.dom.nodeScope.addEventListener('change', () => {
      this.renderer?.setNodeScope(this.dom.nodeScope.value);
      void this.runSearch(this.dom.search.value);
      this.refreshContextualHelp(this.dom.nodeScope);
    });
    this.dom.search.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' || !this.renderer || !this.searchMatches.length) return;
      event.preventDefault();
      this.renderer.confirmNode(this.searchMatches[0], 'search-selection');
    });

    this.dom.world.addEventListener('change', async (event) => {
      if (this.recording) return;
      await this.loadWorld(event.target.value, { historicalSnapshotId: null });
    });

    this.dom.mode.addEventListener('change', (event) => {
      if (!this.audio) return;
      this.audio.setMode(event.target.value);
      this.setText('modeMetric', event.target.options[event.target.selectedIndex].text);
      this.recorder.add('user-change', { control: 'sonification-mode', value: event.target.value });
      this.refreshContextualHelp(event.target);
    });

    this.dom.workspaceMode.addEventListener('change', (event) => {
      this.applyWorkspaceMode(event.target.value, { userInitiated: true });
      this.refreshContextualHelp(event.target);
      this.updateNavigationContext();
    });

    this.dom.knowledgeScale.addEventListener('change', (event) => {
      this.renderer?.setKnowledgeScale(event.target.value);
      this.recorder.add('user-change', { control: 'knowledge-scale', value: event.target.value });
      this.refreshContextualHelp(event.target);
      this.updateNavigationContext();
    });

    this.dom.projection.addEventListener('change', async (event) => {
      if (!this.world || !this.renderer) return;
      const projection = event.target.value;
      if (!this.world.setProjection(projection)) return;
      this.audio?.stop();
      this.dom.projection.disabled = true;
      this.setText('projectionMetric', event.target.options[event.target.selectedIndex].text);
      this.setText('interactionState', `morfología ${projection} en movimiento`);
      this.recorder.add('user-change', { control: 'projection', value: projection });
      this.refreshContextualHelp(event.target);
      try {
        await this.renderer.transitionProjection(projection === 'tsne' ? 1250 : 950);
        this.lastConfirmedNode = null;
        this.dom.route.innerHTML = '';
        this.setText('interactionState', `${projection} listo`);
      } finally {
        this.dom.projection.disabled = this.world.projectionOptions().length <= 1;
      }
    });

    this.dom.colorMode.addEventListener('change', async (event) => {
      if (!this.renderer) return;
      await this.renderer.setColorMode(event.target.value);
      this.setText('colorMetric', event.target.options[event.target.selectedIndex].text);
      this.recorder.add('user-change', { control: 'color-mode', value: event.target.value });
      this.refreshContextualHelp(event.target);
      this.updateNavigationContext();
    });

    this.dom.viewMode.addEventListener('change', async (event) => {
      this.recorder.add('user-change', { control: 'view-mode', value: event.target.value });
      await this.rebuildRenderer('Cambiando modo de visualización…');
    });

    this.dom.representationMode.addEventListener('change', (event) => {
      this.renderer?.setRepresentationMode(event.target.value);
      this.saveVisualPreference('representation-mode', event.target.value);
      this.recorder.add('user-change', { control: 'representation-mode', value: event.target.value });
      this.refreshContextualHelp(event.target);
      this.updatePopoverExplanation(event.target);
    });

    this.dom.showMaterials.addEventListener('change', (event) => {
      this.renderer?.setMaterialOverlay(event.target.checked);
      this.saveVisualPreference('material-overlay', event.target.checked ? 'on' : 'off');
      this.recorder.add('user-change', { control: 'material-overlay', value: event.target.checked });
      const control = event.target.closest('[data-context-help]');
      this.refreshContextualHelp(control);
      this.updatePopoverExplanation(control);
    });

    this.dom.visualTemperature.addEventListener('input', (event) => {
      const value = Number(event.target.value);
      this.renderer?.setVisualTemperature(value);
      this.dom.visualTemperatureMetric.textContent = `${value} %`;
      this.saveVisualPreference('visual-temperature', value);
    });

    this.dom.renderQuality.addEventListener('change', async (event) => {
      this.recorder.add('user-change', { control: 'render-quality', value: event.target.value });
      await this.rebuildRenderer('Ajustando resolución gráfica…');
    });

    this.dom.showLinks.addEventListener('change', (event) => {
      this.renderer?.setShowLinks(event.target.checked);
      this.recorder.add('user-change', { control: 'show-links', value: event.target.checked });
    });

    this.dom.showAxes.addEventListener('change', (event) => {
      this.renderer?.setShowAxes(event.target.checked);
      const workspace = this.dom.workspaceMode.value === 'composition' ? 'composition' : 'research';
      this.workspaceAxes[workspace] = event.target.checked;
      this.recorder.add('user-change', { control: 'show-axes', value: event.target.checked });
    });

    this.dom.imageScale.addEventListener('change', (event) => {
      const value = Number(event.target.value);
      this.renderer?.setImageScale(value);
      this.saveVisualPreference('image-scale', event.target.value);
      this.recorder.add('user-change', { control: 'image-scale', value });
    });

    this.dom.secondaryFx.addEventListener('change', (event) => {
      this.renderer?.setSecondaryEffects(event.target.checked);
      this.recorder.add('user-change', { control: 'secondary-effects', value: event.target.checked });
    });

    const updateDwell = () => {
      this.renderer?.setDwell(this.dom.dwellEnabled.checked, Number(this.dom.dwellDelay.value));
      this.recorder.add('user-change', {
        control: 'dwell-navigation',
        value: this.dom.dwellEnabled.checked,
        delayMs: Number(this.dom.dwellDelay.value),
      });
    };
    this.dom.dwellEnabled.addEventListener('change', updateDwell);
    this.dom.dwellDelay.addEventListener('change', updateDwell);

    this.dom.reset.addEventListener('click', async () => {
      if (!this.renderer || !this.audio) return;
      this.dom.search.value = '';
      this.searchMatches = [];
      await this.renderer.reset();
      this.audio.stop();
      this.lastConfirmedNode = null;
      this.researchBackStack = [];
      this.dom.route.innerHTML = '';
      this.setText('active', 'Mueve el cursor para orientarte. El sonido solo se activa al hacer clic.');
      this.setText('interactionState', 'en espera');
      for (const id of ['nodeId', 'nodeType', 'audioId', 'audioProvenance', 'jump', 'heat', 'relationGroup', 'coordX', 'coordY', 'coordZ']) this.setText(id, '—');
      this.setText('coordinateHud', 'x — · y — · z —');
      this.clearTextReader();
      this.clearResearchNodeCard();
      this.clearMediaPreview();
      this.setPrompt(null);
      this.recorder.add('reset');
    });

    this.dom.stop.addEventListener('click', () => {
      this.audioEnabled = false;
      this.audio?.stop();
      this.setAudioControlState(false);
      this.recorder.add('audio-stop');
    });

    this.dom.copyPrompt.addEventListener('click', async () => {
      const text = this.dom.promptText.textContent || '';
      if (!text || text === '—') return;
      try {
        await navigator.clipboard.writeText(text);
        this.dom.copyPrompt.textContent = 'Prompt copiado';
        window.setTimeout(() => { this.dom.copyPrompt.textContent = 'Copiar prompt'; }, 1300);
      } catch (_) {
        this.dom.copyPrompt.textContent = 'Selecciona y copia';
      }
    });
    this.dom.prepareClapJob.addEventListener('click', () => void this.prepareIntermodalJob());

    this.dom.audioUnlock.addEventListener('click', async () => {
      if (!this.audio) return;
      try {
        await this.audio.unlock();
        this.audioEnabled = true;
        this.setAudioControlState(true);
        this.setText('interactionState', this.compactExperience ? 'audio activo · toca un nodo' : 'audio activo · mueve el cursor');
      } catch (error) {
        this.showError(error);
      }
    });

    this.dom.languageToggle.addEventListener('click', () => {
      this.applyLanguage(this.language === 'es' ? 'en' : 'es', { persist: true });
    });

    this.dom.volume.addEventListener('input', (event) => {
      const value = Number(event.target.value || 100);
      this.audio?.setVolume(value / 100);
      this.setText('volumeMetric', `${value} %`);
    });

    for (const button of document.querySelectorAll('[data-panel-tab]')) {
      button.addEventListener('click', () => this.switchPanelTab(button.dataset.panelTab));
    }
    this.dom.researchBack?.addEventListener('click', () => this.backToPreviousResearchNode());
    this.dom.showAllNodes?.addEventListener('click', () => {
      this.dom.knowledgeScale.value = 'all';
      this.renderer?.setKnowledgeScale('all');
      this.recorder.add('user-change', { control: 'knowledge-scale', value: 'all', source: 'show-all-button' });
      this.updateNavigationContext();
    });

    this.dom.record.addEventListener('click', () => void this.toggleRecording());
    this.dom.manageWorld.addEventListener('click', () => void this.openConstructor());
    this.dom.openWorldLibrary.addEventListener('click', () => this.openWorldLibraryDialog());
    this.dom.newWorld.addEventListener('click', () => this.openNewWorldDialog());
    this.dom.openWorldTrash.addEventListener('click', () => void this.openWorldTrashDialog());
    this.dom.createWorld.addEventListener('click', () => void this.createNewWorld());
    this.dom.newWorldDialog.addEventListener('click', (event) => {
      if (event.target === this.dom.newWorldDialog) this.dom.newWorldDialog.close();
    });
    this.dom.uploadMaterials.addEventListener('click', () => void this.uploadMaterials());
    this.bindMaterialDrop();
    this.dom.processBatch.addEventListener('click', () => void this.processSelectedBatch());
    this.dom.segmentMode.addEventListener('change', () => {
      if (this.selectedBatchId) void this.prepareBatch(this.selectedBatchId);
    });
    this.dom.installWorld.addEventListener('click', () => void this.installWorldPackage());
    this.dom.refreshBatches.addEventListener('click', () => void this.refreshBatches());
    this.dom.refreshHistory.addEventListener('click', () => void this.refreshWorldHistory());
    this.dom.requestWorldDelete.addEventListener('click', () => this.requestWorldDeletion());
    this.dom.confirmWorldDelete.addEventListener('click', () => void this.deleteSelectedWorld());
    this.dom.refreshTrash.addEventListener('click', () => void this.refreshWorldTrash());
    this.dom.saveGpuConfig.addEventListener('click', () => void this.saveExternalService());
    this.dom.testGpuConfig.addEventListener('click', () => void this.testExternalService());
    this.dom.constructorDialog.addEventListener('click', (event) => {
      if (event.target === this.dom.constructorDialog) this.dom.constructorDialog.close();
    });
    this.dom.worldLibraryDialog.addEventListener('click', (event) => {
      if (event.target === this.dom.worldLibraryDialog) this.dom.worldLibraryDialog.close();
    });
    this.dom.worldTrashDialog.addEventListener('click', (event) => {
      if (event.target === this.dom.worldTrashDialog) this.dom.worldTrashDialog.close();
    });
    this.dom.worldTrashDialog.addEventListener('close', () => {
      if (!this.dom.deleteWorldConfirmDialog.open) this.pendingWorldDeletion = null;
    });
    this.dom.deleteWorldConfirmDialog.addEventListener('click', (event) => {
      if (event.target === this.dom.deleteWorldConfirmDialog) this.dom.deleteWorldConfirmDialog.close();
    });
    this.dom.deleteWorldConfirmDialog.addEventListener('close', () => {
      if (!this.dom.confirmWorldDelete.disabled) this.pendingWorldDeletion = null;
    });
  }

  contextualHelp(control, value) {
    const help = {
      world: {
        active: ['Mundo activo', 'Cambia entre los mundos instalados. La selección conserva sus propios nodos, fuentes y versiones.'],
        open: ['Abrir mundos', 'Consulta los mundos disponibles y elige cuál abrir o ampliar.'],
        create: ['Nuevo mundo', 'Crea una estructura vacía y pasa al Constructor para incorporar sus primeras fuentes.'],
        extend: ['Añadir materiales', 'Incorpora nuevas fuentes al mundo activo como una versión trazable, sin destruir la anterior.'],
        trash: ['Papelera', 'Permite restaurar mundos retirados o eliminarlos definitivamente mediante una confirmación separada.'],
      },
      workspace: {
        research: ['Investigación', 'Examina fuentes, metadatos, relaciones y trazabilidad. Conserva exactamente el mismo corpus que Composición.'],
        composition: ['Composición', 'Activa herramientas de escucha, mezcla y generación. No elimina ni cambia los nodos del mundo.'],
      },
      scale: {
        all: ['Todos los nodos', 'Muestra el corpus completo sin selección por escala. Es la vista de referencia para comprobar que ningún nodo se ha perdido.'],
        auto: ['Escala automática', 'Cambia con el zoom: lejos usa Territorial, a media distancia Documental y cerca Sonora. Los nodos no se borran.'],
        territorial: ['Territorial', 'Panorama del mundo: muestra un nodo representativo por región o agrupación. Reduce temporalmente el detalle visible; no elimina nodos.'],
        documentary: ['Documental', 'Muestra textos, imágenes, personas, lugares y documentos. Los nodos puramente sonoros se ocultan temporalmente.'],
        sonic: ['Sonora', 'Muestra audios y los textos o imágenes relacionados con ellos. El resto se oculta temporalmente, pero permanece en el mundo.'],
      },
      projection: {
        umap: ['UMAP', 'Cartografía que conserva bien vecindades y agrupaciones. Es útil para explorar regiones semánticas del mundo.'],
        tsne: ['t-SNE', 'Destaca agrupaciones locales y separaciones. La distancia entre grupos lejanos no debe interpretarse como una medida exacta.'],
        pca: ['PCA', 'Proyección lineal y estable que resume las direcciones de mayor variación. Facilita comparaciones globales.'],
        default: ['Proyección espacial', 'Cambia la organización del mismo conjunto de nodos. No modifica ni recalcula el corpus.'],
      },
      view: {
        '3d': ['Proyector espacial', 'Permite girar, acercarse y atravesar el mundo conservando su profundidad tridimensional.'],
        '2d': ['Plano 2D', 'Fija la cartografía en un plano para comparar posiciones con zoom y desplazamiento, sin rotación.'],
        auto: ['Vista automática', 'Adapta el modo gráfico a las dimensiones declaradas por el mundo cargado.'],
      },
      representation: {
        nodes: ['Nube vectorial', 'Muestra cada material como nodo y privilegia la proximidad calculada entre todos los elementos.'],
        territories: ['Territorios', 'Dibuja regiones semánticas translúcidas, sus nombres y su cantidad de materiales para leer la estructura general.'],
        constellation: ['Constelaciones', 'Aísla el nodo seleccionado y sus relaciones directas. Selecciona otro nodo para recorrer su genealogía sin el ruido del mundo completo.'],
        flows: ['Flujos', 'Convierte las relaciones en corrientes curvas. El color diferencia su tipo y la intensidad permite seguir circulaciones dentro del mundo.'],
        textures: ['Texturas', 'Transforma densidades y superposiciones en campos continuos para leer concentraciones, porosidades y zonas de transición.'],
        tides: ['Mareas', 'Dispone el mundo como un océano cúbico. Conserva la proximidad vectorial y añade profundidad, verticalidad y ondas temporales.'],
        orbits: ['Órbitas', 'Organiza cada región como un sistema semántico en rotación lenta alrededor de su centro, conservando sus distancias internas.'],
      },
      'material-layer': {
        toggle: ['Ver materiales', 'Activa o desactiva el contenido visible sin cambiar la cartografía. Puede combinarse con cualquiera de las seis formas de visualización.'],
      },
      temperature: {
        motion: ['Temperatura vectorial', 'Gradúa la movilidad interpretativa según densidad y actividad relacional. No cambia las coordenadas ni recalcula los embeddings.'],
      },
      color: {
        'relation-hierarchy': ['Jerarquía relacional gradual', 'El color y la luminosidad muestran la región del nodo y la intensidad de su pertenencia al campo seleccionado.'],
        cluster: ['Color por región', 'Asigna un color común a los nodos de una misma región semántica, documental o sonora.'],
        relation: ['Color por tipo de relación', 'Colorea cada nodo según la relación que domina su conexión con el campo: similitud, procedencia, texto–audio u otras.'],
        type: ['Color por tipo de nodo', 'Distingue textos, documentos, imágenes, lugares, personas, audios originales y audios generados.'],
        source: ['Color por fuente', 'Agrupa visualmente los nodos que proceden del mismo documento, archivo o material de origen.'],
      },
      'node-scope': {
        all: ['Todo el corpus', 'La búsqueda recorre las fuentes originales y las creaciones del MPI.'],
        archive: ['Fuentes originales', 'Limita la búsqueda a textos, imágenes, documentos y audios incorporados al corpus.'],
        generated: ['Creaciones MPI', 'Busca únicamente los nodos musicales creados mediante el circuito intermodal y conservados con su procedencia.'],
      },
      'intermodal-action': {
        default: ['Generar música desde esta región', 'Reúne el campo del nodo activo, calcula un objetivo intermodal con textos, descripciones de imágenes y audios, genera variantes en RunPod, las compara mediante CLAP e incorpora la mejor como nodo trazable.'],
      },
      sound: {
        direct: ['Audio directo', 'Reproduce el archivo de audio asociado al nodo sin convertir sus relaciones en síntesis.'],
        temperature: ['Temperatura', 'Convierte la densidad y cercanía relacional en energía sonora: campos densos producen una respuesta más intensa.'],
        euclidean: ['Distancia euclídea', 'Transforma la distancia espacial entre nodos en parámetros de sonido.'],
        random: ['Azar controlado', 'Introduce variaciones reproducibles dentro de límites definidos por el mundo y la selección.'],
        horizon: ['Viso sonoro', 'Escucha el horizonte cercano de la navegación como un campo continuo alrededor del nodo activo.'],
        relational: ['Síntesis vectorial', 'Sintetiza un campo a partir de las relaciones, posiciones y vecinos del nodo seleccionado.'],
        default: ['Campo sonoro', 'Interpreta las relaciones del nodo como una textura o campo. Cambia la escucha, no la estructura del mundo.'],
      },
      'audio-action': {
        enable: ['Activar audio', 'Habilita la escucha en Investigación o reactiva el sonido detenido en Composición.'],
        stop: ['Detener sonido', 'Silencia inmediatamente la reproducción y los campos sonoros sin cambiar la navegación.'],
      },
    };
    const englishHelp = {
      world: {
        active: ['Active world', 'Switches between installed worlds. Each one preserves its own nodes, sources and versions.'],
        open: ['Open worlds', 'Browse available worlds and choose which one to open or extend.'],
        create: ['New world', 'Creates an empty structure and opens the Constructor to add its first sources.'],
        extend: ['Add materials', 'Adds new sources to the active world as a traceable version without destroying the previous one.'],
        trash: ['Trash', 'Restores removed worlds or permanently deletes them through a separate confirmation.'],
      },
      workspace: {
        research: ['Research', 'Inspect sources, metadata, relations and traceability. It preserves exactly the same corpus as Composition.'],
        composition: ['Composition', 'Enables listening, mixing and generation tools. It never removes or changes the nodes in the world.'],
      },
      scale: {
        all: ['All nodes', 'Shows the complete corpus without scale filtering. Use it to verify that no node has been lost.'],
        auto: ['Automatic scale', 'Changes with zoom: Territorial from afar, Documentary at mid distance and Sonic nearby. Nodes are never deleted.'],
        territorial: ['Territorial scale', 'World overview with one representative node per region or group. It temporarily reduces detail without removing nodes.'],
        documentary: ['Documentary scale', 'Shows texts, images, people, places and documents. Purely sonic nodes are temporarily hidden.'],
        sonic: ['Sonic scale', 'Shows audio and its related texts or images. The rest remains in the world but is temporarily hidden.'],
      },
      projection: {
        umap: ['UMAP', 'A map that preserves neighbourhoods and groups well. Useful for exploring semantic regions in the world.'],
        tsne: ['t-SNE', 'Emphasises local groups and separations. Distances between faraway groups should not be read as exact measurements.'],
        pca: ['PCA', 'A stable linear projection that summarises the main directions of variation and supports global comparison.'],
        default: ['Spatial projection', 'Changes the organisation of the same set of nodes. It does not modify or recalculate the corpus.'],
      },
      view: {
        '3d': ['Spatial projector', 'Rotate, approach and move through the world while preserving its three-dimensional depth.'],
        '2d': ['2D plane', 'Fixes the map to a plane for positional comparison through zoom and pan, without rotation.'],
        auto: ['Automatic view', 'Adapts the graphic mode to the dimensions declared by the loaded world.'],
      },
      representation: {
        nodes: ['Vector cloud', 'Shows every material as a node and foregrounds calculated proximity across the complete world.'],
        territories: ['Territories', 'Draws translucent semantic regions with their names and material counts for a readable structural overview.'],
        constellation: ['Constellations', 'Isolates the selected node and its direct relations. Select another node to follow its genealogy without the noise of the whole world.'],
        flows: ['Flows', 'Turns relations into curved currents. Colour identifies their type and intensity reveals circulation through the world.'],
        textures: ['Textures', 'Turns density and overlap into continuous fields for reading concentrations, porous areas and transitions.'],
        tides: ['Tides', 'Arranges the world as a cubic ocean. It preserves vector proximity while adding depth, verticality and temporal waves.'],
        orbits: ['Orbits', 'Arranges each region as a slowly rotating semantic system around its centre while preserving internal distances.'],
      },
      'material-layer': {
        toggle: ['Reveal materials', 'Shows or hides visible content without changing the map. It can be combined with any of the six visual forms.'],
      },
      temperature: {
        motion: ['Vector temperature', 'Controls interpretive motion from density and relational activity. It does not change coordinates or recalculate embeddings.'],
      },
      color: {
        'relation-hierarchy': ['Gradual relational hierarchy', 'Colour and luminosity show each node’s region and the strength of its belonging to the selected field.'],
        cluster: ['Colour by region', 'Assigns one colour to nodes in the same semantic, documentary or sonic region.'],
        relation: ['Colour by relation type', 'Colours each node by the relation that dominates its connection: similarity, provenance, text–audio or others.'],
        type: ['Colour by node type', 'Distinguishes texts, documents, images, places, people, original audio and generated audio.'],
        source: ['Colour by source', 'Visually groups nodes that come from the same document, archive or source material.'],
      },
      'node-scope': {
        all: ['Entire corpus', 'Searches original sources and MPI creations.'],
        archive: ['Original sources', 'Limits search to texts, images, documents and audio incorporated into the corpus.'],
        generated: ['MPI creations', 'Searches only musical nodes created by the intermodal process and stored with their provenance.'],
      },
      'intermodal-action': {
        default: ['Generate music from this region', 'Collects the active node field, calculates an intermodal target from texts, image descriptions and audio, generates variants in RunPod, compares them with CLAP and adds the best one as a traceable node.'],
      },
      sound: {
        direct: ['Direct audio', 'Plays the audio file associated with the node without translating its relations into synthesis.'],
        temperature: ['Temperature', 'Turns relational density and proximity into sonic energy: denser fields produce a more intense response.'],
        euclidean: ['Euclidean distance', 'Maps spatial distance between nodes to sound parameters.'],
        random: ['Controlled chance', 'Introduces reproducible variations within limits defined by the world and selection.'],
        horizon: ['Sonic horizon', 'Listens to the nearby navigation horizon as a continuous field around the active node.'],
        relational: ['Vector synthesis', 'Synthesises a field from the selected node’s relations, positions and neighbours.'],
        default: ['Sonic field', 'Interprets node relations as a texture or field. It changes listening, not the structure of the world.'],
      },
      'audio-action': {
        enable: ['Enable audio', 'Enables listening in Research or reactivates sound after it was stopped in Composition.'],
        stop: ['Stop sound', 'Immediately silences playback and sonic fields without changing navigation.'],
      },
    };
    const source = this.language === 'en' ? englishHelp : help;
    const group = source[control] || {};
    return group[String(value || '').toLowerCase()] || group.default || null;
  }

  bindContextualHelp() {
    const controls = document.querySelectorAll('[data-context-help]');
    for (const control of controls) {
      const show = () => {
        this.showContextualHelp(control);
        this.updatePopoverExplanation(control);
      };
      control.addEventListener('mouseenter', show);
      control.addEventListener('focus', show);
      control.addEventListener('change', show);
      control.addEventListener('mouseleave', () => this.hideContextualHelp());
      control.addEventListener('blur', () => this.hideContextualHelp());
    }
    for (const menu of document.querySelectorAll('.tool-menu')) {
      const popover = menu.querySelector('.tool-popover');
      if (!popover) continue;
      const explanation = document.createElement('div');
      explanation.className = 'popover-explanation';
      explanation.setAttribute('aria-live', 'polite');
      explanation.innerHTML = '<strong>Orientación</strong><span>Señala una opción para comprender qué modifica antes de aplicarla.</span>';
      popover.appendChild(explanation);
      menu.addEventListener('toggle', () => {
        if (!menu.open) return;
        const first = popover.querySelector('[data-context-help]');
        if (first) this.updatePopoverExplanation(first);
      });
    }
    window.addEventListener('scroll', () => this.hideContextualHelp(), true);
    window.addEventListener('resize', () => this.hideContextualHelp());
  }

  updatePopoverExplanation(control) {
    const popover = control?.closest?.('.tool-popover');
    const explanation = popover?.querySelector?.('.popover-explanation');
    if (!explanation) return;
    const content = this.contextualHelp(
      control.dataset.contextHelp,
      control.dataset.contextValue || control.value
    );
    if (!content) return;
    explanation.innerHTML = `<strong>${this.escapeHtml(content[0])}</strong><span>${this.escapeHtml(content[1])}</span>`;
  }

  refreshContextualHelp(control) {
    if (this.dom.contextHelpBubble?.hidden) return;
    this.showContextualHelp(control);
  }

  showContextualHelp(control) {
    const content = this.contextualHelp(
      control.dataset.contextHelp,
      control.dataset.contextValue || control.value
    );
    if (!content || !this.dom.contextHelpBubble) return;
    this.dom.contextHelpTitle.textContent = content[0];
    this.dom.contextHelpText.textContent = content[1];
    const rect = control.getBoundingClientRect();
    const bubble = this.dom.contextHelpBubble;
    bubble.hidden = false;
    bubble.style.left = `${Math.max(10, Math.min(rect.left, window.innerWidth - bubble.offsetWidth - 10))}px`;
    const below = rect.bottom + 9;
    bubble.style.top = `${below + bubble.offsetHeight <= window.innerHeight - 10
      ? below
      : Math.max(10, rect.top - bubble.offsetHeight - 9)}px`;
  }

  hideContextualHelp() {
    if (this.dom.contextHelpBubble) this.dom.contextHelpBubble.hidden = true;
  }

  async checkLocalApi() {
    try {
      const response = await fetch('/api/status', { cache: 'no-store' });
      const data = await response.json();
      this.localApiAvailable = response.ok && data.ok === true;
    } catch (_) {
      this.localApiAvailable = false;
    }
    this.dom.manageWorld.disabled = !this.localApiAvailable;
    this.dom.openWorldLibrary.disabled = !this.localApiAvailable;
    this.dom.newWorld.disabled = !this.localApiAvailable;
    this.dom.openWorldTrash.disabled = !this.localApiAvailable;
    this.dom.manageWorld.title = this.localApiAvailable
      ? 'Añadir materiales al mundo que está abierto'
      : 'Esta función necesita abrir el Motor mediante la aplicación o el servidor local.';
    this.dom.openWorldLibrary.title = this.localApiAvailable
      ? 'Abrir o añadir materiales a cualquiera de tus mundos'
      : 'Esta función necesita abrir el Motor mediante la aplicación o el servidor local.';
    this.dom.prepareClapJob.disabled = !this.localApiAvailable
      || !this.externalServiceConfigured
      || !this.currentNode;
  }

  populateWorlds(worlds) {
    this.availableWorlds = [...worlds];
    this.dom.world.innerHTML = '';
    for (const item of worlds) {
      const option = document.createElement('option');
      option.value = item.manifestUrl;
      option.textContent = item.name;
      this.dom.world.appendChild(option);
    }
    this.populateTrashWorldSelect();
    this.renderWorldLibrary();
  }

  openWorldLibraryDialog() {
    if (!this.localApiAvailable) return;
    this.renderWorldLibrary();
    this.dom.worldLibraryDialog.showModal();
  }

  renderWorldLibrary() {
    if (!this.dom.worldLibrary) return;
    this.dom.worldLibrary.innerHTML = '';
    if (!this.availableWorlds.length) {
      this.dom.worldLibrary.innerHTML = '<span class="empty-note">Todavía no hay mundos disponibles.</span>';
      return;
    }
    for (const item of this.availableWorlds) {
      const entry = document.createElement('article');
      entry.className = 'world-library-entry';
      if (item.id === this.world?.id && !this.historicalSnapshotId) entry.classList.add('is-active');

      const copy = document.createElement('div');
      copy.className = 'world-library-copy';
      const name = document.createElement('strong');
      name.textContent = item.name;
      const detail = document.createElement('span');
      detail.textContent = item.id === this.world?.id && !this.historicalSnapshotId
        ? 'Mundo abierto'
        : 'Mundo disponible';
      copy.append(name, detail);

      const actions = document.createElement('div');
      actions.className = 'world-library-actions';
      const open = document.createElement('button');
      open.type = 'button';
      open.className = 'open-world-action';
      open.textContent = item.id === this.world?.id && !this.historicalSnapshotId ? 'Abierto' : 'Abrir mundo';
      open.disabled = item.id === this.world?.id && !this.historicalSnapshotId;
      open.addEventListener('click', () => void this.openWorldFromLibrary(item));

      const extend = document.createElement('button');
      extend.type = 'button';
      extend.className = 'extend-world-action';
      extend.textContent = 'Añadir materiales';
      extend.disabled = !this.localApiAvailable;
      extend.addEventListener('click', () => void this.extendWorldFromLibrary(item));
      actions.append(open, extend);
      entry.append(copy, actions);
      this.dom.worldLibrary.appendChild(entry);
    }
  }

  async openWorldFromLibrary(item) {
    if (!item?.manifestUrl || this.recording) return;
    this.dom.worldLibraryDialog.close();
    await this.loadWorld(item.manifestUrl, { historicalSnapshotId: null });
    this.dom.world.value = item.manifestUrl;
  }

  async extendWorldFromLibrary(item) {
    if (!item?.manifestUrl || !this.localApiAvailable || this.recording) return;
    this.dom.worldLibraryDialog.close();
    const currentIsActive = this.world?.id === item.id && !this.historicalSnapshotId;
    if (!currentIsActive) {
      await this.loadWorld(item.manifestUrl, { historicalSnapshotId: null });
      this.dom.world.value = item.manifestUrl;
    }
    await this.openConstructor();
    this.dom.materialProgress.textContent = this.world.nodes.length
      ? `Ampliación incremental: ${this.world.nodes.length} nodos existentes quedarán conservados. Arrastra únicamente los materiales nuevos.`
      : 'Mundo vacío: arrastra sus primeras fuentes.';
  }

  populateTrashWorldSelect() {
    if (!this.dom.trashWorldSelect) return;
    const previous = this.dom.trashWorldSelect.value;
    this.dom.trashWorldSelect.innerHTML = '';
    for (const item of this.availableWorlds) {
      const option = document.createElement('option');
      option.value = item.id;
      option.textContent = item.name;
      this.dom.trashWorldSelect.appendChild(option);
    }
    const preferred = this.availableWorlds.some((item) => item.id === previous)
      ? previous
      : this.world?.id;
    if (preferred) this.dom.trashWorldSelect.value = preferred;
    const canDelete = this.availableWorlds.length > 1;
    this.dom.trashWorldSelect.disabled = !canDelete;
    this.dom.requestWorldDelete.disabled = !canDelete;
    this.dom.worldTrashStatus.textContent = canDelete
      ? 'El mundo elegido permanecerá recuperable.'
      : 'Crea otro mundo antes de enviar este a la papelera.';
  }

  openNewWorldDialog() {
    if (!this.localApiAvailable) return;
    this.dom.newWorldName.value = '';
    this.dom.newWorldDescription.value = '';
    this.dom.newWorldQuestion.value = '';
    this.dom.newWorldSegment.value = 'balanced';
    this.dom.newWorldProgress.textContent = 'Esperando un nombre.';
    this.dom.newWorldDialog.showModal();
    this.dom.newWorldName.focus();
  }

  async openWorldTrashDialog() {
    if (!this.localApiAvailable) return;
    this.pendingWorldDeletion = null;
    this.populateTrashWorldSelect();
    if (this.world) this.dom.trashWorldSelect.value = this.world.id;
    this.dom.worldTrashDialog.showModal();
    await this.refreshWorldTrash();
  }

  requestWorldDeletion() {
    const selected = this.availableWorlds.find(
      (item) => item.id === this.dom.trashWorldSelect.value
    );
    if (!selected) {
      this.dom.worldTrashStatus.textContent = 'Elige un mundo de la lista.';
      return;
    }
    this.pendingWorldDeletion = selected;
    this.dom.deleteWorldConfirmText.textContent =
      `“${selected.name}” y todas sus versiones se moverán a la papelera.`;
    this.dom.deleteWorldConfirmDialog.showModal();
  }

  async createNewWorld() {
    const name = this.dom.newWorldName.value.trim();
    if (!name) {
      this.dom.newWorldProgress.textContent = 'Escribe un nombre para el nuevo mundo.';
      return;
    }
    this.dom.createWorld.disabled = true;
    this.dom.newWorldClose.disabled = true;
    this.dom.newWorldProgress.textContent = 'Creando identidad, estructura e historial del mundo…';
    try {
      const result = await this.fetchApi('/api/worlds/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          description: this.dom.newWorldDescription.value.trim(),
          researchQuestion: this.dom.newWorldQuestion.value.trim(),
          segmentUnit: this.dom.newWorldSegment.value,
        }),
      });
      const registry = await this.loader.loadRegistry(`worlds/index.json?version=${Date.now()}`);
      this.populateWorlds(registry.worlds);
      const created = registry.worlds.find((item) => item.id === result.world.id);
      if (!created) throw new Error('El mundo se creó, pero no aparece en la biblioteca.');
      await this.loadWorld(`${created.manifestUrl}?version=${Date.now()}`, { historicalSnapshotId: null });
      this.dom.world.value = created.manifestUrl;
      this.dom.newWorldProgress.textContent = `${result.world.name} está listo para recibir materiales.`;
      this.dom.newWorldDialog.close();
      await this.openConstructor();
      this.dom.segmentMode.value = this.world.manifest.defaultSegmentMode || 'balanced';
      this.dom.materialProgress.textContent = 'Mundo vacío: selecciona sus primeras fuentes.';
    } catch (error) {
      this.dom.newWorldProgress.textContent = `No se pudo crear el mundo: ${error.message}`;
    } finally {
      this.dom.createWorld.disabled = false;
      this.dom.newWorldClose.disabled = false;
    }
  }

  async refreshExternalService() {
    try {
      const result = await this.fetchApi('/api/external/config');
      const service = result.service || {};
      this.externalServiceConfigured = Boolean(service.configured);
      this.dom.gpuEndpointId.value = service.endpointId || '5b7miocp3w3oem';
      this.dom.gpuApiKey.value = '';
      this.setText(
        'gpuConnectionStatus',
        service.configured
          ? `GPU conectada · endpoint ${service.endpointId}`
          : 'Todavía no hay una GPU externa conectada.'
      );
      this.setText(
        'externalState',
        service.configured ? 'GPU externa conectada' : 'GPU externa sin configurar'
      );
      this.dom.externalState.classList.toggle('is-online', service.configured);
      this.dom.externalState.classList.toggle('is-offline', !service.configured);
      this.dom.prepareClapJob.disabled = !service.configured
        || !this.currentNode
        || Boolean(this.historicalSnapshotId);
    } catch (error) {
      this.externalServiceConfigured = false;
      this.setText('gpuConnectionStatus', `No se pudo leer la conexión: ${error.message}`);
      this.setText('externalState', 'GPU externa no disponible');
      this.dom.externalState.classList.remove('is-online');
      this.dom.externalState.classList.add('is-offline');
      this.dom.prepareClapJob.disabled = true;
    }
  }

  async saveExternalService() {
    const endpointId = this.dom.gpuEndpointId.value.trim();
    const apiKey = this.dom.gpuApiKey.value.trim();
    if (!endpointId) {
      this.dom.gpuConnectionStatus.textContent = 'Escribe el identificador del endpoint.';
      return;
    }
    this.dom.saveGpuConfig.disabled = true;
    this.dom.testGpuConfig.disabled = true;
    this.dom.gpuConnectionStatus.textContent = 'Guardando la conexión únicamente en este equipo…';
    try {
      await this.fetchApi('/api/external/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ endpointId, apiKey }),
      });
      this.dom.gpuApiKey.value = '';
      await this.refreshExternalService();
      this.dom.gpuConnectionStatus.textContent = 'Conexión guardada. Pulsa «Comprobar GPU».';
    } catch (error) {
      this.dom.gpuConnectionStatus.textContent = `No se pudo guardar: ${error.message}`;
    } finally {
      this.dom.saveGpuConfig.disabled = false;
      this.dom.testGpuConfig.disabled = false;
    }
  }

  async testExternalService() {
    this.dom.testGpuConfig.disabled = true;
    this.dom.gpuConnectionStatus.textContent = 'Consultando el endpoint externo…';
    try {
      const result = await this.fetchApi('/api/external/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });
      const endpoint = result.health?.endpointId || this.dom.gpuEndpointId.value;
      this.dom.gpuConnectionStatus.textContent = `GPU disponible · endpoint ${endpoint}`;
      await this.refreshExternalService();
    } catch (error) {
      this.dom.gpuConnectionStatus.textContent = `La GPU no respondió: ${error.message}`;
    } finally {
      this.dom.testGpuConfig.disabled = false;
    }
  }

  async openConstructor() {
    if (!this.localApiAvailable || !this.world) return;
    this.dom.constructorWorld.textContent = `${this.world.name} · v${this.world.manifest.version}`;
    if (this.materialSelectionWorldId && this.materialSelectionWorldId !== this.world.id) {
      this.clearMaterialSelection();
    }
    this.materialSelectionWorldId = this.world.id;
    this.renderMaterialSelection();
    this.dom.installProgress.textContent = 'Esperando un mundo procesado.';
    this.dom.processProgress.textContent = 'Esperando revisión.';
    this.dom.reviewSummary.innerHTML = '<span class="empty-note">Selecciona una entrega para revisar su segmentación.</span>';
    this.selectedBatchId = null;
    this.currentBatchPreview = null;
    this.dom.versionName.value = '';
    this.dom.versionDescription.value = '';
    this.dom.processBatch.disabled = true;
    this.dom.historyViewingNote.hidden = !this.historicalSnapshotId;
    this.dom.historyViewingNote.textContent = this.historicalSnapshotId
      ? 'Estás observando una versión histórica sin modificarla. Puedes volver a la activa o recuperar este estado desde el historial.'
      : '';
    this.dom.materialFiles.closest('.constructor-card')?.classList.toggle('is-readonly', Boolean(this.historicalSnapshotId));
    this.dom.processBatch.closest('.constructor-card')?.classList.toggle('is-readonly', Boolean(this.historicalSnapshotId));
    this.setConstructorBusy(false);
    this.dom.constructorDialog.showModal();
    await Promise.all([
      this.refreshBatches(),
      this.refreshWorldHistory(),
      this.refreshExternalService(),
    ]);
  }

  async uploadMaterials() {
    const records = [...this.selectedMaterialRecords.values()];
    const files = records.map((record) => record.file);
    if (this.historicalSnapshotId) {
      this.dom.materialProgress.textContent = 'Vuelve a la versión activa antes de añadir materiales.';
      return;
    }
    if (!this.world || !files.length) {
      this.dom.materialProgress.textContent = 'Selecciona al menos un archivo.';
      return;
    }
    this.setConstructorBusy(true);
    try {
      this.dom.materialProgress.textContent = 'Creando entrega…';
      const start = await this.fetchApi('/api/materials/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          world: this.world.id,
          notes: this.dom.materialNotes.value,
          files: files.map((file) => file.name),
        }),
      });
      for (let index = 0; index < files.length; index += 1) {
        const file = files[index];
        const params = new URLSearchParams({
          world: this.world.id,
          batch: start.batchId,
          filename: file.name,
        });
        this.dom.materialProgress.textContent = `Enviando ${index + 1}/${files.length}: ${file.name}`;
        const uploaded = await this.fetchApi(
          `/api/materials/upload?${params}`,
          { method: 'POST', body: file }
        );
        if (file.name.toLowerCase().endsWith('.pdf')) {
          const analysis = await extractPdfInBrowser(file, (page, total) => {
            this.dom.materialProgress.textContent =
              `Leyendo PDF ${index + 1}/${files.length}: ${file.name} · página ${page}/${total}`;
          });
          const analysisParams = new URLSearchParams({
            world: this.world.id,
            batch: start.batchId,
            filename: uploaded.name,
          });
          this.dom.materialProgress.textContent =
            `Registrando páginas y trazabilidad: ${file.name}`;
          await this.fetchApi(`/api/materials/pdf-analysis?${analysisParams}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(analysis),
          });
        }
      }
      await this.fetchApi('/api/materials/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ world: this.world.id, batchId: start.batchId }),
      });
      this.dom.materialProgress.textContent = `${files.length} material${files.length === 1 ? '' : 'es'} recibido${files.length === 1 ? '' : 's'}. Preparando la revisión…`;
      this.clearMaterialSelection();
      this.dom.materialNotes.value = '';
      await this.refreshBatches();
      await this.prepareBatch(start.batchId);
      this.dom.materialProgress.textContent = 'Carga terminada. Revisa la propuesta en el paso 2.';
    } catch (error) {
      this.dom.materialProgress.textContent = `No se pudo completar la entrega: ${error.message}`;
    } finally {
      this.setConstructorBusy(false);
    }
  }

  bindMaterialDrop() {
    const zone = this.dom.materialDropZone;
    this.dom.materialFiles.addEventListener('change', (event) => {
      this.addMaterialRecords(recordsFromFiles(event.target.files));
      event.target.value = '';
    });
    this.dom.clearMaterials.addEventListener('click', () => this.clearMaterialSelection());
    this.dom.selectedMaterials.addEventListener('click', (event) => {
      const button = event.target.closest('button[data-material-index]');
      if (!button || button.disabled) return;
      const records = [...this.selectedMaterialRecords.values()];
      const record = records[Number(button.dataset.materialIndex)];
      if (!record) return;
      this.selectedMaterialRecords.delete(record.key);
      this.renderMaterialSelection();
    });
    for (const eventName of ['dragenter', 'dragover']) {
      zone.addEventListener(eventName, (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (!this.dom.materialFiles.disabled) {
          if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
          zone.classList.add('is-dragging');
        }
      });
    }
    for (const eventName of ['dragleave', 'dragend']) {
      zone.addEventListener(eventName, (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (eventName === 'dragleave' && zone.contains(event.relatedTarget)) return;
        zone.classList.remove('is-dragging');
      });
    }
    zone.addEventListener('drop', async (event) => {
      event.preventDefault();
      event.stopPropagation();
      zone.classList.remove('is-dragging');
      if (this.dom.materialFiles.disabled) return;
      this.dom.materialProgress.textContent = 'Leyendo los materiales arrastrados…';
      const records = await recordsFromDrop(event.dataTransfer);
      this.addMaterialRecords(records);
    });
  }

  addMaterialRecords(records) {
    let added = 0;
    let repeated = 0;
    const rejected = [];
    for (const record of records) {
      if (!isSupportedMaterial(record.file)) {
        rejected.push(record.path || record.file?.name || 'archivo sin nombre');
        continue;
      }
      if (this.selectedMaterialRecords.has(record.key)) {
        repeated += 1;
        continue;
      }
      this.selectedMaterialRecords.set(record.key, record);
      added += 1;
    }
    this.renderMaterialSelection();
    const total = this.selectedMaterialRecords.size;
    const messages = [`${total} material${total === 1 ? '' : 'es'} preparado${total === 1 ? '' : 's'}.`];
    if (added) messages.push(`${added} añadido${added === 1 ? '' : 's'}.`);
    if (repeated) messages.push(`${repeated} repetido${repeated === 1 ? '' : 's'} omitido${repeated === 1 ? '' : 's'}.`);
    if (rejected.length) messages.push(`${rejected.length} formato${rejected.length === 1 ? '' : 's'} no admitido${rejected.length === 1 ? '' : 's'}.`);
    this.dom.materialProgress.textContent = messages.join(' ');
  }

  clearMaterialSelection() {
    this.selectedMaterialRecords.clear();
    this.dom.materialFiles.value = '';
    this.renderMaterialSelection();
  }

  renderMaterialSelection() {
    const records = [...this.selectedMaterialRecords.values()];
    this.dom.selectedMaterials.innerHTML = '';
    if (!records.length) {
      this.dom.selectedMaterials.innerHTML = '<span class="empty-note">Ningún material preparado.</span>';
      this.dom.clearMaterials.hidden = true;
      this.dom.materialProgress.textContent = 'Sin materiales seleccionados.';
      return;
    }
    records.forEach((record, index) => {
      const row = document.createElement('div');
      row.className = 'selected-material';
      const copy = document.createElement('span');
      const name = document.createElement('strong');
      name.textContent = record.path || record.file.name;
      const detail = document.createElement('small');
      detail.textContent = this.formatFileSize(record.file.size);
      copy.append(name, detail);
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.dataset.materialIndex = String(index);
      remove.setAttribute('aria-label', `Quitar ${record.file.name}`);
      remove.textContent = 'Quitar';
      row.append(copy, remove);
      this.dom.selectedMaterials.appendChild(row);
    });
    const totalBytes = records.reduce((sum, record) => sum + (record.file.size || 0), 0);
    this.dom.clearMaterials.hidden = false;
    this.dom.materialProgress.textContent = `${records.length} material${records.length === 1 ? '' : 'es'} preparado${records.length === 1 ? '' : 's'} · ${this.formatFileSize(totalBytes)}.`;
  }

  formatFileSize(bytes) {
    if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB'];
    const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
    const value = bytes / (1024 ** index);
    return `${value >= 10 || index === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[index]}`;
  }

  async installWorldPackage() {
    const file = this.dom.worldPackage.files?.[0];
    if (!file) {
      this.dom.installProgress.textContent = 'Selecciona el ZIP de un mundo procesado.';
      return;
    }
    this.setConstructorBusy(true);
    try {
      const params = new URLSearchParams({ filename: file.name });
      this.dom.installProgress.textContent = `Validando e instalando ${file.name}…`;
      const result = await this.fetchApi(`/api/worlds/import?${params}`, { method: 'POST', body: file });
      const registry = await this.loader.loadRegistry(`worlds/index.json?version=${Date.now()}`);
      this.populateWorlds(registry.worlds);
      const installed = registry.worlds.find((item) => item.id === result.world.id);
      if (!installed) throw new Error('El mundo se instaló, pero no aparece en el registro.');
      await this.loadWorld(`${installed.manifestUrl}${installed.manifestUrl.includes('?') ? '&' : '?'}version=${Date.now()}`);
      this.dom.world.value = installed.manifestUrl;
      this.dom.installProgress.textContent = `${result.world.name} v${result.world.version} instalado y abierto.${result.previousVersionSaved ? ' La versión anterior quedó conservada.' : ''}`;
      this.dom.worldPackage.value = '';
    } catch (error) {
      this.dom.installProgress.textContent = `No se pudo instalar el mundo: ${error.message}`;
    } finally {
      this.setConstructorBusy(false);
    }
  }

  async prepareBatch(batchId) {
    if (!this.world || !batchId) return;
    this.selectedBatchId = batchId;
    this.currentBatchPreview = null;
    this.dom.processBatch.disabled = true;
    this.dom.reviewSummary.innerHTML = '<span class="empty-note">Extrayendo texto y preparando unidades…</span>';
    this.dom.processProgress.textContent = 'Analizando materiales sin modificar el mundo.';
    this.setConstructorBusy(true);
    try {
      const result = await this.fetchApi('/api/materials/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          world: this.world.id,
          batchId,
          segmentMode: this.dom.segmentMode.value,
        }),
      });
      this.currentBatchPreview = result.preview;
      this.renderBatchPreview(result.preview);
      const supported = result.preview.items.filter((item) => item.supported && item.estimatedNodes > 0).length;
      this.dom.processBatch.disabled = supported === 0 || result.preview.overQuickLimit;
      this.dom.processProgress.textContent = result.preview.overQuickLimit
        ? `La propuesta supera ${result.preview.quickNodeLimit} nodos. Divide la entrega o utiliza el enriquecimiento externo.`
        : supported
        ? 'Revisión lista. Desmarca cualquier material que quieras excluir.'
        : 'La entrega no contiene materiales procesables en la capa rápida.';
      await this.refreshBatches();
    } catch (error) {
      this.dom.reviewSummary.innerHTML = `<span class="error-note">${this.escapeHtml(error.message)}</span>`;
      this.dom.processProgress.textContent = 'No se pudo preparar la revisión.';
    } finally {
      this.setConstructorBusy(false);
    }
  }

  renderBatchPreview(preview) {
    this.dom.reviewSummary.innerHTML = '';
    const heading = document.createElement('div');
    heading.className = 'review-heading';
    heading.innerHTML = `<strong>${this.escapeHtml(`${preview.estimatedNodes} nodos propuestos`)}</strong><span>${this.escapeHtml(`${preview.items.length} materiales · ${preview.segmentCharacters} caracteres por unidad`)}</span>`;
    this.dom.reviewSummary.appendChild(heading);
    for (const item of preview.items) {
      const label = document.createElement('div');
      label.className = `preview-item${item.supported && item.estimatedNodes ? '' : ' is-unavailable'}`;
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.checked = Boolean(item.supported && item.estimatedNodes);
      checkbox.disabled = !item.supported || !item.estimatedNodes;
      checkbox.dataset.selectFile = item.name;
      checkbox.setAttribute('aria-label', `Incluir ${item.name}`);
      const copy = document.createElement('span');
      const kindLabels = { pdf: 'PDF', docx: 'Word', text: 'texto/datos', image: 'imagen', unsupported: 'no compatible' };
      kindLabels.audio = 'audio';
      const detail = item.kind === 'image'
        ? [item.width && item.height ? `${item.width} × ${item.height}` : 'dimensiones no detectadas', '1 nodo'].join(' · ')
        : item.kind === 'audio'
        ? [
            (item.format || 'audio').toUpperCase(),
            item.durationSeconds != null ? `${Number(item.durationSeconds).toFixed(1)} s` : 'duración pendiente',
            item.channels ? `${item.channels} canal${item.channels === 1 ? '' : 'es'}` : null,
            '1 nodo sonoro',
          ].filter(Boolean).join(' · ')
        : item.kind === 'pdf'
        ? [
            `${item.pages ?? '—'} páginas`,
            `${item.fragments} fragmentos`,
            item.extractionStatus === 'reader-unavailable'
              ? 'lector PDF no disponible'
              : item.ocrRequired
              ? 'OCR pendiente'
              : item.pagesWithoutDigitalText?.length
              ? `${item.pagesWithoutDigitalText.length} páginas para revisión/OCR`
              : 'texto digital completo',
            `${item.estimatedNodes} nodos`,
          ].join(' · ')
        : `${item.fragments} fragmentos · ${item.estimatedNodes} nodos`;
      const warning = item.warning ? `<em>${this.escapeHtml(item.warning)}</em>` : '';
      const sample = item.sample ? `<small>${this.escapeHtml(item.sample)}</small>` : '';
      copy.innerHTML = `<strong>${this.escapeHtml(item.name)}</strong><span>${this.escapeHtml(kindLabels[item.kind] || item.kind)} · ${this.escapeHtml(detail)}</span>${warning}${sample}`;
      if (item.supported && item.estimatedNodes) {
        const metadata = document.createElement('div');
        metadata.className = 'metadata-review-grid';
        const stem = item.name.replace(/\.[^.]+$/, '');
        for (const field of [
          { id: 'title', placeholder: 'Título', value: stem },
          { id: 'author', placeholder: 'Autor/a', value: '' },
          { id: 'year', placeholder: 'Fecha o periodo', value: '' },
          { id: 'provenance', placeholder: 'Procedencia adicional', value: '' },
        ]) {
          const input = document.createElement('input');
          input.type = 'text';
          input.placeholder = field.placeholder;
          input.value = field.value;
          input.dataset.metadataFile = item.name;
          input.dataset.metadataField = field.id;
          input.setAttribute('aria-label', `${field.placeholder} de ${item.name}`);
          metadata.appendChild(input);
        }
        copy.appendChild(metadata);
      }
      label.append(checkbox, copy);
      this.dom.reviewSummary.appendChild(label);
    }
  }

  async processSelectedBatch() {
    if (this.historicalSnapshotId) {
      this.dom.processProgress.textContent = 'Vuelve a la versión activa antes de construir.';
      return;
    }
    if (!this.world || !this.selectedBatchId || !this.currentBatchPreview) return;
    const excludedFiles = [...this.dom.reviewSummary.querySelectorAll('input[data-select-file]')]
      .filter((input) => !input.checked)
      .map((input) => input.dataset.selectFile);
    const metadataOverrides = {};
    for (const input of this.dom.reviewSummary.querySelectorAll('input[data-metadata-file]')) {
      const file = input.dataset.metadataFile;
      metadataOverrides[file] ||= {};
      metadataOverrides[file][input.dataset.metadataField] = input.value.trim();
    }
    const selected = this.currentBatchPreview.items.filter((item) => (
      item.supported && item.estimatedNodes > 0 && !excludedFiles.includes(item.name)
    ));
    if (!selected.length) {
      this.dom.processProgress.textContent = 'Selecciona al menos un material procesable.';
      return;
    }
    this.setConstructorBusy(true);
    try {
      this.dom.processProgress.textContent = 'Iniciando el Constructor local…';
      const started = await this.fetchApi('/api/materials/process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          world: this.world.id,
          batchId: this.selectedBatchId,
          segmentMode: this.dom.segmentMode.value,
          excludedFiles,
          metadataOverrides,
          versionName: this.dom.versionName.value.trim(),
          versionDescription: this.dom.versionDescription.value.trim(),
        }),
      });
      const job = await this.waitForConstructorJob(started.job.id);
      const result = job.result;
      const registry = await this.loader.loadRegistry(`worlds/index.json?version=${Date.now()}`);
      this.populateWorlds(registry.worlds);
      const updated = registry.worlds.find((item) => item.id === result.worldId);
      if (!updated) throw new Error('La nueva versión no aparece en el registro de mundos.');
      await this.loadWorld(`${updated.manifestUrl}?version=${Date.now()}`, { historicalSnapshotId: null });
      this.dom.world.value = updated.manifestUrl;
      this.dom.processProgress.textContent = `${result.versionName} · ${result.worldName} v${result.version} abierto: ${result.newNodes} nodos nuevos y ${result.totalNodes} en total. La versión anterior quedó conservada.`;
      this.dom.reviewSummary.innerHTML = `<div class="constructor-success"><strong>${this.escapeHtml(result.versionName || 'Nueva versión lista')}</strong><span>${this.escapeHtml(`${result.worldName} v${result.version}`)}</span><small>${this.escapeHtml(`${result.versionDescription || ''} · ${result.newNodes} nodos añadidos`)}</small></div>`;
      this.currentBatchPreview = null;
      this.dom.versionName.value = '';
      this.dom.versionDescription.value = '';
      this.dom.processBatch.disabled = true;
      await Promise.all([this.refreshBatches(), this.refreshWorldHistory()]);
    } catch (error) {
      this.dom.processProgress.textContent = `No se pudo construir el mundo: ${error.message}`;
    } finally {
      this.setConstructorBusy(false);
    }
  }

  async waitForConstructorJob(jobId) {
    for (let attempt = 0; attempt < 4800; attempt += 1) {
      const result = await this.fetchApi(`/api/jobs?id=${encodeURIComponent(jobId)}`);
      const job = result.job;
      this.dom.processProgress.textContent = `${job.message} · ${job.progress ?? 0} %`;
      if (job.status === 'completed') return job;
      if (job.status === 'failed') throw new Error(job.error || job.message || 'El Constructor se detuvo.');
      await new Promise((resolve) => window.setTimeout(resolve, 750));
    }
    throw new Error('El proceso sigue activo, pero la interfaz dejó de esperar su respuesta.');
  }

  async refreshBatches() {
    if (!this.world) return;
    try {
      const result = await this.fetchApi(`/api/materials?world=${encodeURIComponent(this.world.id)}`);
      this.dom.pendingBatches.innerHTML = '';
      if (!result.batches.length) {
        this.dom.pendingBatches.innerHTML = '<span class="empty-note">Todavía no hay entregas.</span>';
        return;
      }
      for (const batch of result.batches) {
        const item = document.createElement('article');
        item.className = 'pending-batch';
        const fileCount = batch.files?.length || 0;
        const date = batch.createdAt ? new Date(batch.createdAt).toLocaleString('es-ES') : 'sin fecha';
        const statusLabels = {
          uploading: 'carga incompleta',
          ready: 'lista para revisar',
          review: 'revisión preparada',
          processing: 'procesando',
          processed: `procesada${batch.result?.version ? ` · v${batch.result.version}` : ''}`,
          failed: 'requiere revisión',
        };
        const summary = document.createElement('div');
        summary.innerHTML = `<strong>${this.escapeHtml(`${fileCount} material${fileCount === 1 ? '' : 'es'}`)}</strong><span>${this.escapeHtml(date)} · ${this.escapeHtml(statusLabels[batch.status] || batch.status)}</span>`;
        item.appendChild(summary);
        if (['ready', 'review', 'failed'].includes(batch.status)) {
          const review = document.createElement('button');
          review.type = 'button';
          review.className = 'batch-action';
          review.textContent = batch.status === 'review' ? 'Abrir revisión' : 'Revisar';
          review.addEventListener('click', () => void this.prepareBatch(batch.id));
          item.appendChild(review);
        }
        this.dom.pendingBatches.appendChild(item);
      }
    } catch (error) {
      this.dom.pendingBatches.innerHTML = `<span class="error-note">${this.escapeHtml(error.message)}</span>`;
    }
  }

  async refreshWorldHistory() {
    if (!this.world) return;
    try {
      const result = await this.fetchApi(`/api/worlds/history?world=${encodeURIComponent(this.world.id)}`);
      this.dom.worldVersionHistory.innerHTML = '';
      for (const version of result.versions) {
        const entry = document.createElement('article');
        entry.className = `version-entry${version.active ? ' is-active' : ''}`;
        const copy = document.createElement('div');
        copy.className = 'version-copy';
        copy.innerHTML = `<strong>${this.escapeHtml(version.name)}</strong><span>${this.escapeHtml(`${version.worldName} · v${version.version}`)}</span><small>${this.escapeHtml(version.description)}</small>`;
        const actions = document.createElement('div');
        actions.className = 'version-actions';
        if (version.active && !this.historicalSnapshotId) {
          const chip = document.createElement('span');
          chip.className = 'active-version-chip';
          chip.textContent = 'activa';
          actions.appendChild(chip);
        } else {
          const open = document.createElement('button');
          open.type = 'button';
          open.textContent = version.active ? 'Volver a la activa' : 'Abrir sin modificar';
          open.addEventListener('click', () => void this.openWorldVersion(version));
          actions.appendChild(open);
        }
        if (!version.active) {
          const restore = document.createElement('button');
          restore.type = 'button';
          restore.className = 'restore-version';
          restore.textContent = 'Recuperar como activa';
          restore.addEventListener('click', () => void this.restoreWorldVersion(version));
          actions.appendChild(restore);
        }
        entry.append(copy, actions);
        this.dom.worldVersionHistory.appendChild(entry);
      }
    } catch (error) {
      this.dom.worldVersionHistory.innerHTML = `<span class="error-note">${this.escapeHtml(error.message)}</span>`;
    }
  }

  async openWorldVersion(version) {
    const suffix = version.manifestUrl.includes('?') ? '&' : '?';
    this.dom.constructorDialog.close();
    await this.loadWorld(`${version.manifestUrl}${suffix}version=${Date.now()}`, {
      historicalSnapshotId: version.active ? null : version.id,
    });
  }

  async restoreWorldVersion(version) {
    const accepted = window.confirm(
      `¿Recuperar “${version.name}” como versión activa?\n\nEl estado actual se conservará en el historial.`
    );
    if (!accepted) return;
    this.setConstructorBusy(true);
    try {
      await this.fetchApi('/api/worlds/history/restore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ world: this.world.id, snapshotId: version.id }),
      });
      const registry = await this.loader.loadRegistry(`worlds/index.json?version=${Date.now()}`);
      this.populateWorlds(registry.worlds);
      const active = registry.worlds.find((item) => item.id === this.world.id);
      if (!active) throw new Error('El mundo recuperado no aparece en el registro.');
      await this.loadWorld(`${active.manifestUrl}?version=${Date.now()}`, { historicalSnapshotId: null });
      this.dom.world.value = active.manifestUrl;
      this.dom.processProgress.textContent = `${version.name} se recuperó como versión activa. El estado anterior quedó conservado.`;
      await this.refreshWorldHistory();
    } catch (error) {
      this.dom.worldVersionHistory.innerHTML = `<span class="error-note">${this.escapeHtml(error.message)}</span>`;
    } finally {
      this.setConstructorBusy(false);
    }
  }

  async deleteSelectedWorld() {
    const selected = this.pendingWorldDeletion;
    if (!selected) return;
    const wasOpen = this.world?.id === selected.id;
    this.setWorldTrashBusy(true);
    this.dom.worldTrashStatus.textContent =
      `Moviendo ${selected.name} y su historial a la papelera…`;
    try {
      const result = await this.fetchApi('/api/worlds/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          world: selected.id,
          confirmationName: selected.name,
        }),
      });
      const registry = await this.loader.loadRegistry(`worlds/index.json?version=${Date.now()}`);
      this.populateWorlds(registry.worlds);
      if (wasOpen) {
        const next = registry.worlds.find((item) => item.id === result.nextWorldId)
          || registry.worlds[0];
        if (!next) throw new Error('No queda ningún mundo disponible para abrir.');
        await this.loadWorld(`${next.manifestUrl}?version=${Date.now()}`, {
          historicalSnapshotId: null,
        });
        this.dom.world.value = next.manifestUrl;
      } else {
        const open = registry.worlds.find((item) => item.id === this.world?.id);
        if (open) this.dom.world.value = open.manifestUrl;
      }
      this.recorder.add('world-moved-to-trash', {
        worldId: result.deleted.worldId,
        trashId: result.deleted.trashId,
      });
      this.dom.deleteWorldConfirmDialog.close();
      this.pendingWorldDeletion = null;
      this.populateTrashWorldSelect();
      this.dom.worldTrashStatus.textContent =
        `${result.deleted.name} está en la papelera y puede restaurarse.`;
      await this.refreshWorldTrash();
    } catch (error) {
      this.dom.deleteWorldConfirmText.textContent =
        `No se pudo mover “${selected.name}”: ${error.message}`;
      this.dom.worldTrashStatus.textContent = `No se eliminó el mundo: ${error.message}`;
    } finally {
      this.setWorldTrashBusy(false);
    }
  }

  async refreshWorldTrash() {
    if (!this.localApiAvailable) return;
    try {
      const result = await this.fetchApi('/api/worlds/trash');
      this.dom.worldTrash.innerHTML = '';
      if (!result.items.length) {
        this.dom.worldTrash.innerHTML = '<span class="empty-note">La papelera está vacía.</span>';
        return;
      }
      for (const item of result.items) {
        const entry = document.createElement('article');
        entry.className = 'trash-entry';
        const copy = document.createElement('div');
        copy.className = 'trash-copy';
        const date = item.deletedAt
          ? new Date(item.deletedAt).toLocaleString('es-ES')
          : 'sin fecha';
        copy.innerHTML = `<strong>${this.escapeHtml(item.name)}</strong><span>${this.escapeHtml(`v${item.version} · eliminado ${date}`)}</span><small>${this.escapeHtml('Mundo, historial y materiales conservados')}</small>`;
        const actions = document.createElement('div');
        actions.className = 'trash-actions';
        const restore = document.createElement('button');
        restore.type = 'button';
        restore.textContent = 'Restaurar';
        restore.addEventListener('click', () => void this.restoreTrashWorld(item));
        const purge = document.createElement('button');
        purge.type = 'button';
        purge.className = 'purge-world';
        purge.textContent = 'Eliminar definitivamente';
        purge.addEventListener('click', () => void this.purgeTrashWorld(item));
        actions.append(restore, purge);
        entry.append(copy, actions);
        this.dom.worldTrash.appendChild(entry);
      }
    } catch (error) {
      this.dom.worldTrash.innerHTML = `<span class="error-note">${this.escapeHtml(error.message)}</span>`;
    }
  }

  async restoreTrashWorld(item) {
    const accepted = window.confirm(
      `¿Restaurar “${item.name}” con todas sus versiones y materiales?`
    );
    if (!accepted) return;
    this.setWorldTrashBusy(true);
    try {
      const result = await this.fetchApi('/api/worlds/trash/restore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trashId: item.id }),
      });
      const registry = await this.loader.loadRegistry(`worlds/index.json?version=${Date.now()}`);
      this.populateWorlds(registry.worlds);
      const restored = registry.worlds.find((world) => world.id === result.world.id);
      if (!restored) throw new Error('El mundo restaurado no aparece en la biblioteca.');
      this.dom.worldTrashDialog.close();
      await this.loadWorld(`${restored.manifestUrl}?version=${Date.now()}`, {
        historicalSnapshotId: null,
      });
      this.dom.world.value = restored.manifestUrl;
      this.recorder.add('world-restored-from-trash', {
        worldId: result.world.id,
        trashId: item.id,
      });
    } catch (error) {
      this.dom.worldTrash.innerHTML = `<span class="error-note">${this.escapeHtml(error.message)}</span>`;
    } finally {
      this.setWorldTrashBusy(false);
    }
  }

  async purgeTrashWorld(item) {
    const confirmationName = window.prompt(
      `Esta acción es definitiva y no puede recuperarse.\n\nPara borrar “${item.name}”, escribe exactamente su nombre:`,
      ''
    );
    if (confirmationName === null) return;
    this.setWorldTrashBusy(true);
    try {
      await this.fetchApi('/api/worlds/trash/purge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trashId: item.id, confirmationName }),
      });
      await this.refreshWorldTrash();
    } catch (error) {
      this.dom.worldTrash.innerHTML = `<span class="error-note">${this.escapeHtml(error.message)}</span>`;
    } finally {
      this.setWorldTrashBusy(false);
    }
  }

  async fetchApi(url, options = {}) {
    const response = await fetch(url, { cache: 'no-store', ...options });
    let data = {};
    try { data = await response.json(); }
    catch (_) { throw new Error('El servidor local no devolvió una respuesta válida.'); }
    if (!response.ok || data.ok === false) throw new Error(data.error || `Error ${response.status}`);
    return data;
  }

  setConstructorBusy(busy) {
    const historical = Boolean(this.historicalSnapshotId);
    const canProcess = !this.currentBatchPreview?.overQuickLimit
      && this.currentBatchPreview?.items?.some((item) => item.supported && item.estimatedNodes > 0);
    this.dom.materialFiles.disabled = busy || historical;
    this.dom.materialDropZone.classList.toggle('is-disabled', busy || historical);
    this.dom.materialDropZone.setAttribute('aria-disabled', String(busy || historical));
    this.dom.clearMaterials.disabled = busy || historical;
    for (const button of this.dom.selectedMaterials.querySelectorAll('button')) {
      button.disabled = busy || historical;
    }
    this.dom.materialNotes.disabled = busy || historical;
    this.dom.uploadMaterials.disabled = busy || historical;
    this.dom.installWorld.disabled = busy;
    this.dom.refreshBatches.disabled = busy;
    this.dom.refreshHistory.disabled = busy;
    this.dom.segmentMode.disabled = busy || historical;
    this.dom.versionName.disabled = busy || historical;
    this.dom.versionDescription.disabled = busy || historical;
    this.dom.processBatch.disabled = busy || historical || !canProcess;
    this.dom.gpuEndpointId.disabled = busy;
    this.dom.gpuApiKey.disabled = busy;
    this.dom.saveGpuConfig.disabled = busy;
    this.dom.testGpuConfig.disabled = busy;
    this.dom.constructorClose.disabled = busy;
  }

  setWorldTrashBusy(busy) {
    const canDelete = this.availableWorlds.length > 1;
    this.dom.trashWorldSelect.disabled = busy || !canDelete;
    this.dom.requestWorldDelete.disabled = busy || !canDelete;
    this.dom.refreshTrash.disabled = busy;
    this.dom.worldTrashClose.disabled = busy;
    this.dom.confirmWorldDelete.disabled = busy;
    this.dom.deleteWorldConfirmClose.disabled = busy;
    for (const button of this.dom.worldTrash.querySelectorAll('button')) {
      button.disabled = busy;
    }
  }

  populateProjections() {
    this.dom.projection.innerHTML = '';
    const options = this.world?.projectionOptions() || [];
    for (const item of options) {
      const option = document.createElement('option');
      option.value = item.id;
      option.textContent = item.label;
      option.title = item.method;
      option.selected = item.id === this.world.activeProjection;
      this.dom.projection.appendChild(option);
    }
    this.dom.projection.disabled = options.length <= 1;
    const selected = this.dom.projection.options[this.dom.projection.selectedIndex];
    this.setText('projectionMetric', selected?.text || this.world.activeProjection || '—');
  }

  populateImageGallery() {
    this.dom.imageGallery.innerHTML = '';
    const images = this.world?.imageNodes() || [];
    if (!images.length) {
      this.dom.imageGallery.innerHTML = '<span class="empty-note">Este mundo no contiene imágenes.</span>';
      return;
    }
    for (const node of images) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'gallery-item';
      button.title = node.label;
      const image = document.createElement('img');
      image.src = this.world.thumbnailUrl(node);
      image.alt = node.label;
      image.loading = 'lazy';
      image.decoding = 'async';
      image.fetchPriority = 'low';
      const label = document.createElement('span');
      label.textContent = node.label;
      button.append(image, label);
      button.addEventListener('click', () => this.renderer?.confirmNode(node, 'image-gallery'));
      this.dom.imageGallery.appendChild(button);
    }
  }

  async loadWorld(manifestUrl, options = {}) {
    this.setLoading(true, 'Cargando mundo y estructura precalculada…');
    this.dom.world.disabled = true;
    this.dom.search.disabled = true;
    try {
      this.loader.abort();
      this.renderer?.destroy();
      this.audio?.destroy();
      this.renderer = null;
      this.audio = null;
      this.world = null;
      this.performance.reset();

      this.world = await this.loader.loadWorld(manifestUrl);
      this.historicalSnapshotId = options.historicalSnapshotId || null;
      const canonicalManifest = [...this.dom.world.options].find((option) => {
        const optionUrl = new URL(option.value, document.baseURI);
        return optionUrl.pathname === new URL(manifestUrl, document.baseURI).pathname;
      });
      if (canonicalManifest) this.dom.world.value = canonicalManifest.value;
      this.populateProjections();
      const colorDefault = this.world.manifest.rendering?.colorModeDefault || 'type';
      this.dom.colorMode.value = colorDefault;
      this.dom.showLinks.checked = Boolean(this.world.manifest.rendering?.showLinksDefault);
      this.dom.showAxes.checked = this.workspaceAxes[this.dom.workspaceMode.value] ?? true;
      this.dom.viewMode.value = this.world.manifest.rendering?.viewModeDefault || this.dom.viewMode.value;
      this.dom.renderQuality.value = this.compactExperience
        ? 'fluid'
        : (this.world.manifest.rendering?.qualityDefault || 'balanced');
      this.audio = new AudioEngine(this.world, this.performance);
      this.audio.setMode(this.dom.mode.value);
      this.audio.setVolume(Number(this.dom.volume.value || 112) / 100);
      this.audioEnabled = this.dom.workspaceMode.value === 'composition';
      this.setAudioControlState(this.audioEnabled);
      this.setText('volumeMetric', `${this.dom.volume.value} %`);
      await this.createRenderer();
      this.populateImageGallery();

      this.lastConfirmedNode = null;
      this.researchBackStack = [];
      this.searchMatches = [];
      this.dom.route.innerHTML = '';
      this.dom.search.value = '';
      this.dom.nodeScope.value = 'all';
      if (this.dom.generatedBadge) this.dom.generatedBadge.hidden = true;
      this.setText(
        'active',
        this.world.nodes.length
          ? 'Mueve el cursor para orientarte. El sonido solo se activa al hacer clic.'
          : 'Este mundo está vacío. Abre el Constructor para incorporar sus primeras fuentes.'
      );
      this.setText('interactionState', 'en espera');
      this.setText('nodes', String(this.world.nodes.length));
      this.setText('audios', String(this.world.audio.size));
      const versionName = this.world.manifest.versionName || (this.historicalSnapshotId ? 'Versión histórica' : 'Versión activa');
      this.setText('worldMetric', `${this.world.name} · v${this.world.manifest.version} · ${versionName}`);
      this.setText('worldVersionBadge', `${this.historicalSnapshotId ? 'historial · ' : ''}${versionName} · v${this.world.manifest.version}`);
      this.setText('loadState', 'listo');
      this.setText('modeMetric', this.dom.mode.options[this.dom.mode.selectedIndex]?.text || this.dom.mode.value);
      this.setText('colorMetric', this.dom.colorMode.options[this.dom.colorMode.selectedIndex]?.text || colorDefault);
      for (const id of ['nodeId', 'nodeType', 'audioId', 'audioProvenance', 'jump', 'heat', 'relationGroup', 'coordX', 'coordY', 'coordZ']) this.setText(id, '—');
      this.setText('coordinateHud', 'x — · y — · z —');
      this.clearTextReader();
      this.clearResearchNodeCard();
      this.clearMediaPreview();
      this.setPrompt(null);
      this.resetIntermodalPanel();
      document.title = `${this.world.name} · ${versionName} — MPI`;
      document.querySelector('h1').textContent = `MPI · ${this.world.name.toUpperCase()}`;
      this.applyWorkspaceMode(this.dom.workspaceMode.value);
      this.updateNavigationContext();
    } catch (error) {
      if (error.name !== 'AbortError') this.showError(error);
    } finally {
      this.dom.world.disabled = this.recording;
      this.dom.search.disabled = false;
      this.setLoading(false);
    }
  }

  async createRenderer() {
    if (!this.world) return;
    this.renderer = new Renderer(this.world, 'plot', this.performance, {
      mode: this.dom.viewMode.value,
      secondaryEffects: this.dom.secondaryFx.checked,
      showLinks: this.dom.showLinks.checked,
      showAxes: this.dom.showAxes.checked,
      colorMode: this.dom.colorMode.value,
      imageScale: Number(this.dom.imageScale.value),
      quality: this.dom.renderQuality.value,
      workspaceMode: this.dom.workspaceMode.value,
      knowledgeScale: this.dom.knowledgeScale.value,
      representationMode: this.dom.representationMode.value,
      materialOverlay: this.dom.showMaterials.checked,
      visualTemperature: Number(this.dom.visualTemperature.value),
      nodeScope: this.dom.nodeScope.value,
    });
    this.renderer.setDwell(this.dom.dwellEnabled.checked, Number(this.dom.dwellDelay.value));
    this.renderer.onPreview = (node) => this.preview(node);
    this.renderer.onConfirm = (node, detail) => this.navigate(node, detail);
    this.renderer.onProgress = ({ loaded, total, regions }) => {
      this.setText('loadProgress', `${loaded}/${total}${regions ? ` · ${regions} regiones` : ''}`);
    };
    this.renderer.onScaleChange = ({ requested, resolved, visible, total }) => {
      const labels = { all: 'todos', auto: 'automática', territorial: 'territorial', documentary: 'documental', sonic: 'sonora' };
      this.setText('scaleMetric', requested === 'auto'
        ? `automática → ${labels[resolved]} · ${visible} visibles`
        : `${labels[resolved]} · ${visible} visibles`);
      this.setText('visibleProgress', `${visible}/${total}`);
      this.setText('navigationVisible', `${visible} / ${total} nodos`);
      this.updateNavigationContext();
    };
    this.renderer.onAdaptive = (profile) => {
      const level = profile.adaptiveLevel === 0 ? 'normal' : profile.adaptiveLevel === 1 ? 'reducido' : 'mínimo';
      this.setText('performanceProfile', `${profile.mode} · ${level} · ${profile.labels} frase breve`);
    };
    await this.renderer.init();
  }

  async rebuildRenderer(text = 'Actualizando visualización…') {
    if (!this.world) return;
    this.setLoading(true, text);
    try {
      this.renderer?.destroy();
      this.renderer = null;
      await this.createRenderer();
      this.lastConfirmedNode = null;
      this.researchBackStack = [];
      this.updateResearchBackButton();
      this.dom.route.innerHTML = '';
      this.setText('interactionState', 'en espera');
    } catch (error) {
      this.showError(error);
    } finally {
      this.setLoading(false);
    }
  }

  preview(node) {
    this.setText('active', this.world.shortLabel(node, 5, 48));
    this.setText('interactionState', 'orientación visual · haz clic para activar');
    this.updateCoordinates(node);
  }

  applyWorkspaceMode(mode = 'research', options = {}) {
    const target = mode === 'composition' ? 'composition' : 'research';
    this.dom.workspaceMode.value = target;
    document.body.classList.toggle('mode-research', target === 'research');
    document.body.classList.toggle('mode-composition', target === 'composition');
    this.renderer?.setWorkspaceMode(target);
    const research = target === 'research';
    this.dom.showAxes.checked = this.workspaceAxes[target];
    this.renderer?.setShowAxes(this.dom.showAxes.checked);
    if (this.dom.mainPanelTab) this.dom.mainPanelTab.textContent = research
      ? this.uiText('Ficha', 'Card')
      : this.uiText('Composición', 'Composition');
    this.setText('workspaceBadge', research ? this.uiText('Investigación', 'Research') : this.uiText('Composición', 'Composition'));
    this.setText('workspaceMetric', research ? this.uiText('Investigación', 'Research') : this.uiText('Composición', 'Composition'));
    this.setText(
      'modePurpose',
      research
        ? this.uiText(
          'Examina fuentes, relaciones, coordenadas y trazabilidad sobre el corpus compartido.',
          'Examine sources, relations, coordinates and traceability across the shared corpus.'
        )
        : this.uiText(
          'Mezcla, transforma, espacializa y genera sonido sobre el mismo corpus, sin alterar sus fuentes.',
          'Mix, transform, spatialize and generate sound from the same corpus without altering its sources.'
        )
    );
    if (research) {
      this.dom.showLinks.checked = true;
      this.renderer?.setShowLinks(true);
      this.audioEnabled = false;
      this.audio?.stop();
      this.setAudioControlState(false);
    } else {
      this.audioEnabled = true;
      this.setAudioControlState(true);
      if (options.userInitiated) void this.audio?.unlock().catch(() => this.setAudioControlState(false));
    }
    if (options.userInitiated) {
      this.recorder.add('user-change', { control: 'workspace-mode', value: target });
    }
    this.updateNavigationContext();
  }

  navigate(node, detail = {}) {
    if (!this.audio || !this.renderer || !this.world) return;
    const uiStarted = performance.now();
    const previous = this.lastConfirmedNode;
    if (
      previous
      && String(previous.id) !== String(node.id)
      && detail.source !== 'research-back'
      && !this.researchNavigatingBack
    ) {
      this.researchBackStack.push(previous);
      if (this.researchBackStack.length > 30) this.researchBackStack.shift();
    }
    const jump = previous ? this.world.dist(previous, node) : 0;
    const plan = this.audioEnabled ? this.audio.navigate(node) : this.audio.plan(node, previous);
    const provenance = plan.map((item) => this.provenanceLabel(item)).filter(Boolean);
    const group = this.world.relationGroup(node);

    this.setText('active', this.world.shortLabel(node, 5, 48));
    this.setText('interactionState', `campo activado · ${detail.source || 'selección'}`);
    this.setText('nodeId', String(node.id));
    this.setText('nodeType', node.type);
    this.setText('audioId', plan.map((item) => item.audioId).join(', ') || 'sin audio vinculado');
    this.setText('audioProvenance', provenance.join(' · ') || '—');
    this.setText('jump', jump.toFixed(3));
    this.setText('heat', this.world.density(node).toFixed(3));
    this.setText('relationGroup', group.label);
    this.updateCoordinates(node);
    this.updateNodePanel(node);
    this.updateResearchBackButton();
    this.routeItem(node);

    this.recorder.add('navigate', {
      trigger: detail.source || 'selection',
      node: {
        id: node.id,
        type: node.type,
        label: node.label,
        position: { x: node.x, y: node.y, z: node.z },
        region: node.region,
      },
      projection: this.world.activeProjection,
      relationGroup: group,
      camera: this.renderer.getCameraState(),
      routeIndex: this.renderer.stats.confirmations,
      jump: Number(jump.toFixed(4)),
      density: Number(this.world.density(node).toFixed(4)),
      mode: this.audio.mode,
      seed: this.audio.seed,
      audioPlan: plan.map((item) => ({
        audioId: item.audioId,
        audioNodeId: item.audioNodeId,
        audioType: item.audioType,
        provenance: item.provenance,
        relationType: item.relationType,
        groupId: item.groupId,
        groupSize: item.groupSize,
        gain: item.gain,
        playbackRate: item.rate,
        frequency: item.frequency,
        waveform: item.waveform,
        transformations: item.transformations || [],
        label: item.label,
      })),
    });
    this.lastConfirmedNode = node;
    this.performance.record('ui', performance.now() - uiStarted);
  }

  updateNodePanel(node) {
    this.currentNode = node;
    const group = this.world.relationGroup(node);
    const generated = this.world.isGeneratedNode(node);
    if (this.dom.generatedBadge) this.dom.generatedBadge.hidden = !generated;
    this.setText('relationGroup', group.label);
    const imageUrl = this.world.mediaUrl(node, 'image');
    const pdfPage = this.world.pdfPageReference(node);
    if (imageUrl) {
      this.pdfPreviewRequest = (this.pdfPreviewRequest || 0) + 1;
      this.dom.mediaImage.src = imageUrl;
      this.dom.mediaImage.alt = node.label;
      this.dom.mediaTitle.textContent = node.label;
      this.dom.mediaText.textContent = `${node.type} · ${node.region || 'sin región'}`;
      this.dom.mediaPreview.hidden = false;
    } else if (pdfPage) {
      void this.showPdfFacsimile(node, pdfPage);
    } else {
      this.clearMediaPreview();
    }
    this.updateTextReader(node);
    this.updateResearchNodeCard(node);
    this.setPrompt(this.world.promptFor(node));
    this.updateIntermodalPanel(node);
  }

  async showPdfFacsimile(node, reference) {
    const request = (this.pdfPreviewRequest || 0) + 1;
    this.pdfPreviewRequest = request;
    this.dom.mediaImage.removeAttribute('src');
    this.dom.mediaImage.alt = '';
    this.dom.mediaTitle.textContent = `${node.label} · p. ${reference.pageLabel}`;
    this.dom.mediaText.textContent = 'Renderizando el facsímil desde el PDF original…';
    this.dom.mediaPreview.hidden = false;
    try {
      const preview = await renderPdfPagePreview(reference.url, reference.pageNumber, {
        maxWidth: 960,
        maxHeight: 1280,
        quality: 0.84,
      });
      if (request !== this.pdfPreviewRequest || String(this.currentNode?.id) !== String(node.id)) return;
      const hasText = reference.hasDigitalText || reference.ocrStatus === 'not-required';
      this.dom.mediaImage.src = preview.url;
      this.dom.mediaImage.alt = `Facsímil de ${node.label}, página ${reference.pageLabel}`;
      this.dom.mediaText.textContent = hasText
        ? `Facsímil visible · página ${reference.pageLabel} · texto digital disponible · ${preview.renderer} ${preview.rendererVersion}`
        : `Facsímil visible · página ${reference.pageLabel} · OCR pendiente · ${preview.renderer} ${preview.rendererVersion}`;
    } catch (error) {
      if (request !== this.pdfPreviewRequest || String(this.currentNode?.id) !== String(node.id)) return;
      this.dom.mediaText.textContent = `No se pudo representar el facsímil: ${error.message}`;
    }
  }

  resetIntermodalPanel() {
    this.activeGpuJob = null;
    this.setText('clapStatus', 'Selecciona un vector para formar su campo intermodal.');
    this.setText('clapFieldMetric', '—');
    this.setText('clapSourceMetric', '—');
    this.dom.prepareClapJob.disabled = true;
    if (this.dom.regionProfile) this.dom.regionProfile.hidden = true;
    this.setClapProgress({ visible: false });
    this.resetIntermodalTrace();
  }

  updateIntermodalPanel(node) {
    if (!node || !this.world) {
      this.resetIntermodalPanel();
      return;
    }
    const profile = this.world.regionProfile(node, 24);
    const field = profile?.field || this.world.groupFor(node, 24);
    const counts = field.reduce((summary, item) => {
      const modality = item.type === 'image'
        ? 'images'
        : this.world.isAudioNode(item)
        ? 'audio'
        : 'texts';
      summary[modality] += 1;
      return summary;
    }, { texts: 0, images: 0, audio: 0 });
    this.setText('clapFieldMetric', `${field.length} nodos en el campo`);
    this.setText('clapSourceMetric', `${counts.texts} texto/documento · ${counts.images} imagen · ${counts.audio} audio`);
    if (profile && this.dom.regionProfile) {
      this.dom.regionProfile.hidden = false;
      this.setText('regionProfileTitle', profile.title);
      this.setText('regionProfileSummary', profile.summary);
      this.setText('regionProfileMethod', profile.method);
      this.dom.regionProfileConcepts.innerHTML = profile.concepts.length
        ? profile.concepts.map((item) => `<span>${this.escapeHtml(item.term)} <small>×${item.frequency}</small></span>`).join('')
        : '<span>sin términos dominantes</span>';
    }
    this.setText(
      'clapStatus',
      this.externalServiceConfigured
        ? 'Campo listo. MPI lo enviará directamente a la GPU y reincorporará la música verificada.'
        : 'Campo listo, pero falta conectar una GPU externa desde el Constructor.'
    );
    this.dom.prepareClapJob.disabled = !this.localApiAvailable
      || !this.externalServiceConfigured
      || Boolean(this.historicalSnapshotId);
  }

  setClapProgress({ visible = true, percent = 0, stage = 'Preparando…', detail = '', elapsed = 0 } = {}) {
    if (!this.dom.clapProgress) return;
    this.dom.clapProgress.hidden = !visible;
    this.dom.clapStage.textContent = stage;
    this.dom.clapElapsed.textContent = `${Math.max(0, Math.round(elapsed))} s`;
    this.dom.clapProgressFill.style.width = `${Math.max(0, Math.min(100, Number(percent) || 0))}%`;
    this.dom.clapProgressDetail.textContent = detail || stage;
  }

  resetIntermodalTrace() {
    if (!this.dom.clapTrace) return;
    const defaults = {
      materials: 'Esperando selección.',
      relations: 'Esperando análisis.',
      clap: 'Esperando cálculo externo.',
      generation: 'Esperando RunPod.',
      publication: 'Esperando resultado validado.',
    };
    for (const item of this.dom.clapTrace.querySelectorAll('[data-clap-step]')) {
      item.classList.remove('is-active', 'is-complete', 'is-error');
      const detail = item.querySelector('small');
      if (detail) detail.textContent = defaults[item.dataset.clapStep] || 'Esperando.';
    }
    if (this.dom.clapEvidence) {
      this.dom.clapEvidence.hidden = true;
      this.dom.clapEvidence.innerHTML = '';
    }
    if (this.dom.clapProcessLog) this.dom.clapProcessLog.innerHTML = '';
    if (this.dom.clapProcessDetails) this.dom.clapProcessDetails.open = false;
  }

  appendIntermodalProcess(message, status = 'confirmed') {
    if (!this.dom.clapProcessLog || !message) return;
    const item = document.createElement('li');
    item.dataset.status = status;
    const stamp = this.clapStartedAt
      ? `+${Math.max(0, Math.round((Date.now() - this.clapStartedAt) / 1000))} s`
      : 'preparación';
    item.innerHTML = `<span>${this.escapeHtml(stamp)}</span><p>${this.escapeHtml(message)}</p>`;
    this.dom.clapProcessLog.appendChild(item);
  }

  updateIntermodalTrace(step, details = {}, state = 'active') {
    if (!this.dom.clapTrace) return;
    const order = ['materials', 'relations', 'clap', 'generation', 'publication'];
    const current = order.indexOf(step);
    for (const item of this.dom.clapTrace.querySelectorAll('[data-clap-step]')) {
      const index = order.indexOf(item.dataset.clapStep);
      item.classList.toggle('is-complete', current >= 0 && index < current);
      item.classList.toggle('is-active', index === current && state === 'active');
      item.classList.toggle('is-error', index === current && state === 'error');
      const detail = item.querySelector('small');
      if (detail && Object.prototype.hasOwnProperty.call(details, item.dataset.clapStep)) {
        detail.textContent = details[item.dataset.clapStep];
      }
    }
  }

  showIntermodalEvidence(result) {
    if (!this.dom.clapEvidence) return;
    const evidence = result.evidence || {};
    const score = Number(result.clap?.score);
    const rows = [
      ['Materiales vinculados', `${evidence.sourceNodeCount ?? '—'} nodos`],
      ['Relaciones creadas', `${evidence.createdRelationCount ?? '—'}`],
      ['Modelo CLAP', result.clap?.model || '—'],
      ['Similitud coseno', Number.isFinite(score) ? score.toFixed(3) : '—'],
      ['Dimensión CLAP', result.clap?.dimension ?? '—'],
      ['Variantes comparadas', evidence.candidateCount ?? '—'],
      ['Modelo generador', result.generator?.model || '—'],
      ['Nodo publicado', result.node?.id || '—'],
    ];
    this.dom.clapEvidence.innerHTML = rows
      .map(([label, value]) => `<div><span>${this.escapeHtml(label)}</span><strong>${this.escapeHtml(value)}</strong></div>`)
      .join('');
    this.dom.clapEvidence.hidden = false;
  }

  async prepareIntermodalJob() {
    if (!this.world || !this.currentNode || !this.localApiAvailable) return;
    if (this.historicalSnapshotId) {
      this.setText('clapStatus', 'Vuelve a la versión activa antes de generar una música.');
      return;
    }
    if (!this.externalServiceConfigured) {
      this.setText('clapStatus', 'Abre el Constructor y conecta primero el servicio GPU externo.');
      return;
    }
    const profile = this.world.regionProfile(this.currentNode, 24);
    const field = profile?.field || this.world.groupFor(this.currentNode, 24);
    const prompt = this.world.promptFor(this.currentNode);
    const relations = this.world.visibleRelations(
      this.currentNode,
      field.map((node) => node.id),
      48
    ).map((relation) => ({
      id: relation.id,
      type: relation.type,
      source: relation.source,
      target: relation.target,
      weight: relation.weight,
    }));
    this.dom.prepareClapJob.disabled = true;
    this.clapStartedAt = Date.now();
    this.lastClapLoggedState = null;
    this.resetIntermodalTrace();
    const materialCounts = field.reduce((summary, item) => {
      const key = item.type === 'image' ? 'images' : this.world.isAudioNode(item) ? 'audio' : 'texts';
      summary[key] += 1;
      return summary;
    }, { texts: 0, images: 0, audio: 0 });
    this.updateIntermodalTrace('materials', {
      materials: `${field.length} nodos: ${materialCounts.texts} texto/documento · ${materialCounts.images} imagen · ${materialCounts.audio} audio`,
      relations: `${relations.length} relaciones tipadas preparadas`,
    });
    this.appendIntermodalProcess(
      `Campo “${profile?.title || this.currentNode.region || 'sin nombre'}” seleccionado: ${field.length} materiales (${materialCounts.texts} texto/documento, ${materialCounts.images} imagen y ${materialCounts.audio} audio).`
    );
    this.appendIntermodalProcess(
      `La singularidad se ha estimado mediante términos frecuentes, modalidades y relación dominante${profile?.dominantRelation?.label ? `: ${profile.dominantRelation.label}` : ''}.`,
      'interpretive'
    );
    this.appendIntermodalProcess(
      `Se prepararon ${relations.length} relaciones tipadas; sus pesos orientan la contribución de cada nodo al centro intermodal.`
    );
    this.setClapProgress({ percent: 4, stage: 'Enviando región', detail: `${field.length} nodos · ${this.dom.clapVariants.value} variantes`, elapsed: 0 });
    this.setText('clapStatus', 'Enviando textos, imágenes, audios y relaciones a la GPU externa…');
    try {
      const result = await this.fetchApi('/api/intermodal/jobs/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          world: this.world.id,
          rootNodeId: this.currentNode.id,
          sourceNodeIds: field.map((node) => node.id),
          relations,
          promptId: prompt?.id || null,
          prompt: prompt?.prompt || this.world.shortLabel(this.currentNode, 18, 220),
          durationSeconds: Number(this.dom.clapDuration.value),
          variants: Number(this.dom.clapVariants.value),
          fieldProfile: profile ? {
            title: profile.title,
            region: profile.region,
            concepts: profile.concepts.map((item) => item.term),
            dominantRelation: profile.dominantRelation?.type || null,
          } : null,
        }),
      });
      this.activeGpuJob = result.job;
      this.updateIntermodalTrace('relations', {
        materials: `${result.job.field.nodeCount} materiales recibidos por RunPod`,
        relations: `${relations.length} relaciones forman el campo de partida`,
      });
      this.setClapProgress({ percent: 12, stage: 'Trabajo aceptado', detail: `RunPod recibió ${result.job.field.nodeCount} nodos`, elapsed: (Date.now() - this.clapStartedAt) / 1000 });
      this.setText(
        'clapStatus',
        `${result.job.field.nodeCount} nodos enviados. La GPU conceptualizará imágenes, calculará CLAP y generará ${result.job.field.variants} variantes.`
      );
      this.appendIntermodalProcess(
        `RunPod aceptó el trabajo con ${result.job.field.nodeCount} nodos y ${result.job.field.variants} variantes previstas. Los estados posteriores proceden de la información comunicada por el servicio.`
      );
      this.recorder.add('intermodal-job-submitted', {
        jobId: result.job.id,
        rootNodeId: this.currentNode.id,
        sourceNodeIds: field.map((node) => node.id),
        durationSeconds: result.job.field.durationSeconds,
        variants: result.job.field.variants,
      });
      const publication = await this.waitForExternalIntermodalJob(result.job.id);
      await this.openExternalIntermodalResult(publication);
    } catch (error) {
      const failedStep = this.activeGpuJob?.status === 'IN_PROGRESS' ? 'generation' : 'relations';
      this.updateIntermodalTrace(failedStep, { [failedStep]: error.message }, 'error');
      this.setClapProgress({ percent: 100, stage: 'Error', detail: error.message, elapsed: this.clapStartedAt ? (Date.now() - this.clapStartedAt) / 1000 : 0 });
      this.setText('clapStatus', `No se pudo completar la composición intermodal: ${error.message}`);
    } finally {
      this.activeGpuJob = null;
      this.dom.prepareClapJob.disabled = !this.currentNode
        || !this.externalServiceConfigured
        || Boolean(this.historicalSnapshotId);
    }
  }

  async waitForExternalIntermodalJob(jobId) {
    for (let attempt = 0; attempt < 2400; attempt += 1) {
      const response = await this.fetchApi(`/api/intermodal/jobs/status?id=${encodeURIComponent(jobId)}`);
      const job = response.job;
      this.activeGpuJob = job;
      const seconds = this.clapStartedAt ? (Date.now() - this.clapStartedAt) / 1000 : 0;
      const gpuSeconds = job.executionTime != null ? Math.round(Number(job.executionTime) / 1000) : null;
      const state = String(job.status || '').toUpperCase();
      const stages = {
        IN_QUEUE: [22, 'Esperando GPU'],
        IN_PROGRESS: [58, 'Generando música'],
        COMPLETED: [90, 'Verificando resultado'],
      };
      const [percent, stage] = stages[state] || [35, job.stage || 'Procesando'];
      const detail = `${job.message || job.stage || state}${gpuSeconds != null ? ` · ${gpuSeconds} s GPU` : ''}`;
      if (state === 'IN_QUEUE') {
        this.updateIntermodalTrace('clap', {
          clap: `En cola para calcular el objetivo común de ${job.field?.nodeCount ?? 'los'} materiales`,
        });
        if (this.lastClapLoggedState !== state) {
          this.appendIntermodalProcess('Trabajo en cola. La GPU todavía no ha confirmado el comienzo del cálculo.', 'estimated');
        }
      } else if (state === 'IN_PROGRESS') {
        this.updateIntermodalTrace('generation', {
          clap: 'CLAP compara textos, descripciones conceptuales de imágenes y audios en un espacio común',
          generation: `${job.field?.variants ?? '—'} variantes de ${job.field?.durationSeconds ?? '—'} s en proceso${gpuSeconds != null ? ` · ${gpuSeconds} s GPU` : ''}`,
        });
        if (this.lastClapLoggedState !== state) {
          this.appendIntermodalProcess(
            'Proceso GPU iniciado: las imágenes se incorporan mediante descripciones conceptuales; textos y audios se representan en CLAP; se calcula un centro ponderado y se generan las variantes musicales.'
          );
        }
      } else if (state === 'COMPLETED') {
        this.updateIntermodalTrace('publication', {
          generation: 'Audio y vectores recibidos; validando procedencia',
          publication: 'Comprobando CLAP, archivo sonoro y reinserción',
        });
        if (this.lastClapLoggedState !== state) {
          this.appendIntermodalProcess('RunPod devolvió audio y vectores. MPI verifica integridad, similitud y procedencia antes de publicar el nodo.');
        }
      }
      this.lastClapLoggedState = state;
      this.setClapProgress({ percent, stage, detail, elapsed: seconds });
      this.setText('clapStatus', detail);
      if (job.status === 'COMPLETED' && response.result) return response.result;
      if (['FAILED', 'TIMED_OUT', 'CANCELLED'].includes(job.status)) {
        throw new Error(job.error || job.message || 'El servicio GPU detuvo el proceso.');
      }
      await new Promise((resolve) => window.setTimeout(resolve, 2000));
    }
    throw new Error('La GPU sigue trabajando, pero MPI dejó de esperar la respuesta.');
  }

  async openExternalIntermodalResult(result) {
    const registry = await this.loader.loadRegistry(`worlds/index.json?version=${Date.now()}`);
    this.populateWorlds(registry.worlds);
    const updated = registry.worlds.find((item) => item.id === result.world.id);
    if (!updated) throw new Error('La versión enriquecida no aparece en la biblioteca de mundos.');
    await this.loadWorld(`${updated.manifestUrl}?version=${Date.now()}`, { historicalSnapshotId: null });
    this.dom.world.value = updated.manifestUrl;
    const generatedNode = this.world.getNode(result.node.id);
    if (generatedNode) {
      this.renderer?.confirmNode(generatedNode, 'clap-result');
      this.switchPanelTab('texts');
    }
    this.updateIntermodalTrace('publication', {
      clap: `${result.clap.model} · similitud ${Number(result.clap.score).toFixed(3)} · ${result.clap.dimension} dimensiones`,
      generation: `${result.evidence?.candidateCount ?? '—'} variantes comparadas · ${result.generator.model}`,
      publication: `${result.node.id} incorporado con ${result.evidence?.createdRelationCount ?? '—'} relaciones trazables`,
    });
    for (const item of this.dom.clapTrace?.querySelectorAll('[data-clap-step]') || []) {
      item.classList.remove('is-active');
      item.classList.add('is-complete');
    }
    this.showIntermodalEvidence(result);
    this.appendIntermodalProcess(
      `${result.evidence?.candidateCount ?? '—'} variantes fueron comparadas. Se seleccionó la de similitud CLAP ${Number(result.clap.score).toFixed(3)}.`
    );
    this.appendIntermodalProcess(
      `Nodo “${result.node.label || result.node.id}” incorporado como audio-generated con ${result.evidence?.createdRelationCount ?? '—'} relaciones hacia sus fuentes.`
    );
    this.setClapProgress({ percent: 100, stage: 'Nodo incorporado', detail: `${result.node.id} · ${this.world.nodes.length} nodos en el mundo`, elapsed: this.clapStartedAt ? (Date.now() - this.clapStartedAt) / 1000 : 0 });
    this.setText(
      'clapStatus',
      `Nuevo nodo sonoro ${result.node.id} incorporado · CLAP ${Number(result.clap.score).toFixed(3)} · ${result.clap.model}. Puedes volver a generar desde esta u otra región.`
    );
    this.recorder.add('intermodal-result-imported', {
      jobId: result.jobId,
      nodeId: result.node.id,
      clapModel: result.clap.model,
      clapScore: result.clap.score,
      generatorModel: result.generator.model,
      transport: 'external-gpu',
    });
  }

  switchPanelTab(tab = 'explore') {
    const target = tab === 'texts' ? 'texts' : 'explore';
    this.activePanelTab = target;
    if (this.dom.exploreTab) {
      this.dom.exploreTab.hidden = target !== 'explore';
      this.dom.exploreTab.classList.toggle('is-active', target === 'explore');
    }
    if (this.dom.textsTab) {
      this.dom.textsTab.hidden = target !== 'texts';
      this.dom.textsTab.classList.toggle('is-active', target === 'texts');
    }
    for (const button of document.querySelectorAll('[data-panel-tab]')) {
      button.classList.toggle('is-active', button.dataset.panelTab === target);
      button.setAttribute('aria-selected', button.dataset.panelTab === target ? 'true' : 'false');
    }
    if (target === 'texts' && this.currentNode) this.updateTextReader(this.currentNode);
  }

  updateTextReader(node) {
    if (!node || !this.dom.textNodeBody) return;
    const metadata = node.metadata || {};
    const page = metadata.page ?? metadata.pageNumber ?? metadata.page_number;
    const source = metadata.source || metadata.sourceId || metadata.sourceFile || node.region || '—';
    this.setText('textNodeTitle', this.world.shortLabel(node, 10, 100));
    const pageLabel = metadata.pageLabel;
    const pageReference = page !== undefined
      ? ` · ${this.language === 'en' ? 'p.' : 'p.'} ${pageLabel || page}`
      : '';
    this.setText('textNodeMeta', `${node.id} · ${node.type}${pageReference} · ${source}`);
    this.setText('textNodeBody', String(node.text || node.label || 'Este nodo no contiene texto transcrito.'));

    this.dom.textGroupList.innerHTML = '';
    const groupNodes = this.world.groupFor(node, 18)
      .filter((item) => ['text-fragment', 'document-page', 'document'].includes(item.type))
      .slice(0, 14);
    if (!groupNodes.length) {
      this.dom.textGroupList.innerHTML = '<span class="empty-note">Este campo no contiene fragmentos textuales.</span>';
      return;
    }
    for (const item of groupNodes) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'text-fragment-button';
      if (String(item.id) === String(node.id)) button.classList.add('is-current');
      const itemPage = item.metadata?.page ?? item.metadata?.pageNumber ?? item.metadata?.page_number;
      button.innerHTML = `<span>${this.escapeHtml(this.world.shortLabel(item, 12, 128))}</span><small>${this.escapeHtml(String(item.id))}${itemPage !== undefined ? ` · p. ${this.escapeHtml(String(itemPage))}` : ''}</small>`;
      button.addEventListener('click', () => {
        this.renderer?.confirmNode(item, 'text-panel');
        this.switchPanelTab('texts');
      });
      this.dom.textGroupList.appendChild(button);
    }
  }

  clearTextReader() {
    this.currentNode = null;
    if (this.dom.generatedBadge) this.dom.generatedBadge.hidden = true;
    this.setText('textNodeTitle', 'Ningún fragmento seleccionado');
    this.setText('textNodeMeta', '—');
    this.setText('textNodeBody', 'Selecciona un vector textual.');
    if (this.dom.textGroupList) this.dom.textGroupList.innerHTML = '<span class="empty-note">—</span>';
  }

  updateNavigationContext() {
    if (!this.dom.navigationContext) return;
    const workspace = this.dom.workspaceMode?.selectedOptions?.[0]?.textContent || 'Investigación';
    const scale = this.dom.knowledgeScale?.selectedOptions?.[0]?.textContent || 'Escala automática';
    const color = this.dom.colorMode?.selectedOptions?.[0]?.textContent || 'Color';
    this.setText('navigationContext', `${workspace} · ${scale} · ${color}`);
  }

  updateResearchNodeCard(node) {
    if (!node || !this.world || !this.dom.researchNodeCard) return;
    const profile = this.world.researchProfile(node, 10);
    if (!profile) return;
    this.setText('researchNodeTitle', this.world.shortLabel(node, 12, 118));
    this.setText('researchWhat', profile.what);
    this.setText('researchRegion', `${profile.region} · ${this.world.relationGroup(node).label}`);
    this.setText('researchWhy', profile.why);

    this.dom.researchNodeKinds.innerHTML = '';
    for (const label of [profile.modality, node.id, profile.generated ? 'GENERADO · TRAZABLE' : 'ARCHIVO']) {
      const badge = document.createElement('span');
      badge.textContent = String(label);
      if (profile.generated) badge.classList.add('is-generated');
      this.dom.researchNodeKinds.appendChild(badge);
    }

    this.dom.researchSource.innerHTML = '';
    if (profile.source.node) {
      const sourceButton = document.createElement('button');
      sourceButton.type = 'button';
      sourceButton.className = 'research-source-button';
      sourceButton.innerHTML = `<strong>${this.escapeHtml(profile.source.label)}</strong><small>${this.escapeHtml(profile.source.detail)}</small>`;
      sourceButton.addEventListener('click', () => this.focusAndConfirmNode(profile.source.node, 'research-source'));
      this.dom.researchSource.appendChild(sourceButton);
    } else {
      const sourceText = document.createElement('div');
      sourceText.className = 'research-source-static';
      sourceText.innerHTML = `<strong>${this.escapeHtml(profile.source.label)}</strong><small>${this.escapeHtml(profile.source.detail)}</small>`;
      this.dom.researchSource.appendChild(sourceText);
    }
    const traceability = node.metadata?.traceability || {};
    const sourceUrl = this.world.sourceUrl(node);
    const sourceFile = traceability.sourceFile || node.metadata?.sourceFile || profile.source.node?.metadata?.sourceFile;
    if (sourceUrl && sourceFile) {
      const page = traceability.pageNumber ?? node.metadata?.page ?? node.metadata?.pageNumber;
      const extractionMethod = traceability.extractionMethod || node.metadata?.extractionMethod;
      const extractionVersion = traceability.extractionMethodVersion
        || node.metadata?.extractionMethodVersion
        || profile.source.node?.metadata?.extractionMethodVersion;
      const representation = traceability.representation
        || node.metadata?.representation
        || node.representations?.[0]?.id;
      const pageFragment = traceability.fragmentOnPage ?? node.metadata?.pageFragment;
      const importedAt = traceability.extractedAt || node.metadata?.importedAt;
      const documentMetadata = profile.source.node?.metadata || (node.type === 'document' ? node.metadata : {});
      const ocrStatus = node.metadata?.ocrStatus || traceability.ocrStatus || documentMetadata.ocrStatus;
      const trace = document.createElement('div');
      trace.className = 'research-traceability';
      const status = ocrStatus === 'required'
        ? 'OCR pendiente'
        : ocrStatus === 'review-pages'
        ? 'OCR parcial'
        : 'Texto digital';
      trace.innerHTML = [
        page !== undefined && page !== null
          ? `<span><strong>Página</strong><small>${this.escapeHtml(String(traceability.pageLabel || page))}</small></span>`
          : '',
        extractionMethod
          ? `<span><strong>${this.language === 'en' ? 'Extraction' : 'Extracción'}</strong><small>${this.escapeHtml(String(extractionMethod))}${extractionVersion ? ` · ${this.escapeHtml(String(extractionVersion))}` : ''}</small></span>`
          : '',
        representation
          ? `<span><strong>${this.language === 'en' ? 'Representation' : 'Representación'}</strong><small>${this.escapeHtml(String(representation))}</small></span>`
          : '',
        pageFragment !== undefined && pageFragment !== null
          ? `<span><strong>${this.language === 'en' ? 'Page fragment' : 'Fragmento de página'}</strong><small>${this.escapeHtml(String(pageFragment))}</small></span>`
          : '',
        documentMetadata.documentFormat === 'pdf' || node.type === 'document-page'
          ? `<span><strong>${this.language === 'en' ? 'Status' : 'Estado'}</strong><small>${this.escapeHtml(status)}</small></span>`
          : '',
        documentMetadata.documentFormat === 'pdf' || node.type === 'document-page'
          ? `<span><strong>${this.language === 'en' ? 'Facsimile' : 'Facsímil'}</strong><small>${this.language === 'en' ? 'Visible on selection' : 'Visible al seleccionar'}</small></span>`
          : '',
        importedAt
          ? `<span><strong>${this.language === 'en' ? 'Imported' : 'Incorporado'}</strong><small>${this.escapeHtml(String(importedAt).slice(0, 19).replace('T', ' '))}</small></span>`
          : '',
        traceability.sha256 || documentMetadata.sha256
          ? `<span><strong>Huella SHA-256</strong><small>${this.escapeHtml(String(traceability.sha256 || documentMetadata.sha256).slice(0, 16))}…</small></span>`
          : '',
      ].filter(Boolean).join('');
      this.dom.researchSource.appendChild(trace);

      const openSource = document.createElement('a');
      openSource.className = 'research-source-open';
      openSource.href = sourceUrl;
      openSource.target = '_blank';
      openSource.rel = 'noopener';
      openSource.textContent = /\.pdf(?:#|$)/i.test(sourceUrl) ? 'Abrir PDF original' : 'Abrir fuente original';
      this.dom.researchSource.appendChild(openSource);
    }

    this.dom.researchRelations.innerHTML = '';
    if (!profile.relations.length) {
      this.dom.researchRelations.innerHTML = '<span class="empty-note">No hay relaciones disponibles.</span>';
      return;
    }
    for (const item of profile.relations) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'research-relation-button';
      button.dataset.evidence = item.evidence;
      button.innerHTML = `
        <span><strong>${this.escapeHtml(this.world.shortLabel(item.node, 8, 82))}</strong><em>${this.escapeHtml(item.evidence)}</em></span>
        <small>${this.escapeHtml(item.label)} · ${this.escapeHtml(item.explanation)}</small>
      `;
      button.addEventListener('click', () => this.focusAndConfirmNode(item.node, `research-relation-${item.type}`));
      this.dom.researchRelations.appendChild(button);
    }
  }

  clearResearchNodeCard() {
    this.setText('researchNodeTitle', 'Ningún nodo seleccionado');
    this.setText('researchWhat', 'Selecciona un nodo para examinarlo.');
    this.setText('researchRegion', '—');
    this.setText('researchWhy', '—');
    if (this.dom.researchNodeKinds) this.dom.researchNodeKinds.innerHTML = '';
    if (this.dom.researchSource) this.dom.researchSource.innerHTML = '<span class="empty-note">—</span>';
    if (this.dom.researchRelations) this.dom.researchRelations.innerHTML = '';
    this.researchBackStack = [];
    this.updateResearchBackButton();
  }

  focusAndConfirmNode(node, source = 'research-relation') {
    if (!node || !this.renderer) return;
    this.renderer.confirmNode(node, source);
    void this.renderer.focusNode(node);
  }

  backToPreviousResearchNode() {
    const previous = this.researchBackStack.pop();
    if (!previous || !this.renderer) return;
    this.researchNavigatingBack = true;
    try {
      this.renderer.confirmNode(previous, 'research-back');
      void this.renderer.focusNode(previous);
    } finally {
      this.researchNavigatingBack = false;
      this.updateResearchBackButton();
    }
  }

  updateResearchBackButton() {
    if (!this.dom.researchBack) return;
    this.dom.researchBack.disabled = !this.researchBackStack.length;
    this.dom.researchBack.textContent = this.researchBackStack.length
      ? `← Anterior (${this.researchBackStack.length})`
      : '← Anterior';
  }

  escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[character]));
  }

  restoreVisualPreferences() {
    const choices = {
      imageScale: { key: 'image-scale', fallback: '1' },
      representationMode: { key: 'representation-mode', fallback: 'nodes' },
    };
    for (const [id, preference] of Object.entries(choices)) {
      const select = this.dom[id];
      if (!select) continue;
      let value = preference.fallback;
      try {
        value = window.localStorage?.getItem(`mpi.visual.${preference.key}`) || value;
      } catch {
        // La aplicación sigue funcionando si el navegador bloquea el almacenamiento local.
      }
      const available = [...select.options].some((option) => option.value === value);
      select.value = available ? value : preference.fallback;
    }
    try {
      const legacyRepresentation = window.localStorage?.getItem('mpi.visual.representation-mode');
      const materialPreference = window.localStorage?.getItem('mpi.visual.material-overlay');
      if (legacyRepresentation === 'materials') this.dom.representationMode.value = 'nodes';
      this.dom.showMaterials.checked = materialPreference === 'on'
        || (materialPreference === null && legacyRepresentation === 'materials');
    } catch {
      this.dom.showMaterials.checked = false;
    }
    try {
      const storedTemperature = Number(window.localStorage?.getItem('mpi.visual.visual-temperature'));
      this.dom.visualTemperature.value = Number.isFinite(storedTemperature) && storedTemperature >= 0
        ? String(Math.min(100, storedTemperature))
        : '42';
      this.dom.visualTemperatureMetric.textContent = `${this.dom.visualTemperature.value} %`;
    } catch {
      this.dom.visualTemperature.value = '42';
      this.dom.visualTemperatureMetric.textContent = '42 %';
    }
  }

  saveVisualPreference(key, value) {
    try {
      window.localStorage?.setItem(`mpi.visual.${key}`, String(value));
    } catch {
      // La preferencia es opcional; la exploración no depende de su persistencia.
    }
  }

  restoreLanguagePreference() {
    try {
      const stored = window.localStorage?.getItem('mpi.interface.language');
      this.language = stored === 'es' ? 'es' : 'en';
    } catch {
      this.language = 'en';
    }
  }

  uiText(spanish, english) {
    return this.language === 'en' ? english : spanish;
  }

  applyLanguage(language = 'es', options = {}) {
    this.language = language === 'en' ? 'en' : 'es';
    document.documentElement.lang = this.language;
    document.body.dataset.language = this.language;
    for (const element of document.querySelectorAll('[data-en]')) {
      if (!element.dataset.es) element.dataset.es = element.textContent.trim();
      element.textContent = this.language === 'en' ? element.dataset.en : element.dataset.es;
    }
    for (const element of document.querySelectorAll('[data-placeholder-en]')) {
      if (!element.dataset.placeholderEs) element.dataset.placeholderEs = element.getAttribute('placeholder') || '';
      element.setAttribute(
        'placeholder',
        this.language === 'en' ? element.dataset.placeholderEn : element.dataset.placeholderEs
      );
    }
    this.translateInterfaceTree(document.body);
    if (this.dom.languageToggle) {
      this.dom.languageToggle.textContent = 'EN / ES';
      this.dom.languageToggle.dataset.activeLanguage = this.language;
      this.dom.languageToggle.title = this.language === 'en' ? 'Cambiar a español' : 'Switch to English';
      this.dom.languageToggle.setAttribute('aria-label', this.language === 'en' ? 'Cambiar a español' : 'Switch to English');
    }
    for (const menu of document.querySelectorAll('.tool-menu[open]')) {
      const first = menu.querySelector('[data-context-help]');
      if (first) this.updatePopoverExplanation(first);
    }
    this.setAudioControlState(this.audioEnabled);
    if (this.dom.workspaceMode) this.applyWorkspaceMode(this.dom.workspaceMode.value);
    if (options.persist) {
      try {
        window.localStorage?.setItem('mpi.interface.language', this.language);
      } catch {
        // El idioma sigue activo durante la sesión.
      }
    }
  }

  bindInterfaceTranslationObserver() {
    if (this.interfaceTranslationObserver) return;
    this.interfaceTranslationObserver = new MutationObserver((mutations) => {
      if (this.translatingInterface || this.language !== 'en') return;
      for (const mutation of mutations) {
        if (mutation.type === 'characterData') {
          this.translateInterfaceNode(mutation.target);
          continue;
        }
        for (const node of mutation.addedNodes) {
          if (node.nodeType === Node.TEXT_NODE) this.translateInterfaceNode(node);
          else if (node.nodeType === Node.ELEMENT_NODE) this.translateInterfaceTree(node);
        }
      }
    });
    this.interfaceTranslationObserver.observe(document.body, {
      childList: true,
      characterData: true,
      subtree: true,
    });
  }

  translateInterfaceTree(root) {
    if (!root) return;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    for (const node of nodes) this.translateInterfaceNode(node);
  }

  translateInterfaceNode(node) {
    const parent = node?.parentElement;
    if (!parent || parent.closest('script,style,svg,[data-en]')) return;
    if (parent.closest(
      '#plot,#active,#promptText,#textNodeBody,#textGroupList,#researchWhat,#researchSource,#researchWhy,#researchRelations,#mediaTitle,#regionProfileTitle,#regionProfileConcepts'
    )) return;
    if (this.language === 'es') {
      const original = this.interfaceSpanishText.get(node);
      if (original === undefined || node.nodeValue === original) return;
      this.translatingInterface = true;
      node.nodeValue = original;
      this.translatingInterface = false;
      return;
    }
    const original = node.nodeValue;
    const translated = this.translateInterfaceText(original);
    if (translated === original) return;
    this.interfaceSpanishText.set(node, original);
    this.translatingInterface = true;
    node.nodeValue = translated;
    this.translatingInterface = false;
  }

  translateInterfaceText(value) {
    const raw = String(value ?? '');
    const leading = raw.match(/^\s*/)?.[0] || '';
    const trailing = raw.match(/\s*$/)?.[0] || '';
    const text = raw.trim();
    if (!text) return raw;
    const exact = UI_TRANSLATIONS[text];
    if (exact) return `${leading}${exact}${trailing}`;
    let translated = text
      .replace(/\b(\d+) nodos en el campo\b/g, '$1 nodes in the field')
      .replace(/\b(\d+) \/ (\d+) nodos\b/g, '$1 / $2 nodes')
      .replace(/\b(\d+) nodos nuevos\b/g, '$1 new nodes')
      .replace(/\b(\d+) nodos añadidos\b/g, '$1 nodes added')
      .replace(/\b(\d+) nodos\b/g, '$1 nodes')
      .replace(/\b(\d+) regiones\b/g, '$1 regions')
      .replace(/\b(\d+) visibles\b/g, '$1 visible')
      .replace(/\b(\d+) materiales\b/g, '$1 materials')
      .replace(/\b(\d+) material\b/g, '$1 material')
      .replace(/\btexto\/documento\b/g, 'text/document')
      .replace(/\bimagen\b/g, 'image')
      .replace(/\baudio activo\b/g, 'audio on')
      .replace(/\ben espera\b/g, 'waiting')
      .replace(/\blisto\b/g, 'ready')
      .replace(/\bselección\b/g, 'selection')
      .replace(/\bregiones\b/g, 'regions')
      .replace(/\bautomática\b/g, 'automatic')
      .replace(/\bterritorial\b/g, 'territorial')
      .replace(/\bdocumental\b/g, 'documentary')
      .replace(/\bsonora\b/g, 'sonic');
    return translated === text ? raw : `${leading}${translated}${trailing}`;
  }

  setAudioControlState(enabled) {
    if (!this.dom.audioUnlock) return;
    this.dom.audioUnlock.textContent = enabled
      ? this.uiText('Audio activo', 'Audio on')
      : this.uiText('Activar audio', 'Enable audio');
    this.dom.audioUnlock.classList.toggle('audio-active', Boolean(enabled));
    this.dom.audioUnlock.setAttribute('aria-pressed', String(Boolean(enabled)));
  }


  updateCoordinates(node) {
    const x = Number(node?.x || 0).toFixed(4);
    const y = Number(node?.y || 0).toFixed(4);
    const z = Number(node?.z || 0).toFixed(4);
    this.setText('coordX', x);
    this.setText('coordY', y);
    this.setText('coordZ', z);
    this.setText('coordinateHud', `x ${x} · y ${y} · z ${z}`);
  }

  clearMediaPreview() {
    this.pdfPreviewRequest = (this.pdfPreviewRequest || 0) + 1;
    this.dom.mediaPreview.hidden = true;
    this.dom.mediaImage.removeAttribute('src');
    this.dom.mediaImage.alt = '';
    this.dom.mediaTitle.textContent = '';
    this.dom.mediaText.textContent = '';
  }

  setPrompt(prompt) {
    if (!prompt) {
      this.dom.promptText.textContent = '—';
      this.dom.promptStatus.textContent = 'Este campo todavía no tiene un prompt musical asociado.';
      this.dom.copyPrompt.disabled = true;
      return;
    }
    this.dom.promptText.textContent = prompt.prompt || '—';
    const status = prompt.status === 'pending-external-generation'
      ? `Preparado para el Constructor · salida prevista: ${prompt.expectedOutput || 'audio generado'}`
      : (prompt.status || 'disponible');
    this.dom.promptStatus.textContent = status;
    this.dom.copyPrompt.disabled = false;
  }

  provenanceLabel(item) {
    const provenance = item.provenance || {};
    if (item.audioType === 'bell-field-synthesis') return `masa de campanas: ${item.variant || item.relationType}`;
    if (item.audioType === 'synthesis-relational') return `síntesis relacional: ${item.relationType}`;
    if (item.audioType === 'audio-generated') return `generado: ${provenance.generator || provenance.method || 'procedencia declarada'}`;
    if (item.audioType === 'audio-recorded') return `grabado: ${provenance.source || provenance.recorder || 'procedencia declarada'}`;
    if (item.audioType === 'audio-original') return `original: ${provenance.source || 'procedencia declarada'}`;
    return item.audioType || '';
  }

  async runSearch(query) {
    if (!this.renderer) return;
    this.searchMatches = await this.renderer.search(query, this.dom.nodeScope?.value || 'all');
    this.dom.search.dataset.matches = String(this.searchMatches.length);
    this.dom.search.title = this.searchMatches.length
      ? `${this.searchMatches.length} coincidencias. Pulsa Enter para activar la primera.`
      : 'Sin coincidencias';
  }

  routeItem(node) {
    const item = document.createElement('li');
    item.textContent = `${this.world.shortLabel(node, 7, 58)} [${node.type}]`;
    this.dom.route.prepend(item);
    while (this.dom.route.children.length > 8) this.dom.route.lastChild.remove();
  }

  async toggleRecording() {
    if (!this.displayCaptureAvailable) {
      this.setText('active', this.uiText(
        'La grabación de la sesión está disponible desde un navegador de escritorio compatible.',
        'Session recording is available from a compatible desktop browser.'
      ));
      return;
    }
    if (!this.audio || !this.world || !this.renderer || this.recordStopping) return;
    if (this.recording) {
      await this.stopExperienceRecording('botón-stop');
      return;
    }

    this.dom.record.disabled = true;
    this.setText('recordLabel', 'ELIGE VENTANA…');
    this.setText('recordState', 'esperando selección de ventana');
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filenameBase = `${this.world.id}-experiencia-${stamp}`;
    this.recordingFilenameBase = filenameBase;

    try {
      const audioStream = await this.audio.recordingStream();
      const capture = await this.experienceRecorder.start({
        audioStream,
        filenameBase,
        onDisplayEnded: () => {
          if (this.recording && !this.recordStopping) void this.stopExperienceRecording('captura-finalizada');
        },
      });
      this.recorder.start({
        worldId: this.world.id,
        world: this.world.name,
        worldVersion: this.world.manifest.version,
        worldFormat: this.world.manifest.format,
        method: this.world.method,
        projection: this.world.activeProjection,
        sonificationVersion: this.world.sonification.version || 'unspecified',
        sonificationMode: this.audio.mode,
        randomSeed: this.audio.seed,
        renderer: this.renderer.performanceProfile(),
        workspaceMode: this.dom.workspaceMode.value,
        knowledgeScale: this.renderer.currentKnowledgeScale(),
        videoMimeType: capture.mimeType,
      });
      this.recording = true;
      this.recordingStartedAt = performance.now();
      this.dom.world.disabled = true;
      this.dom.record.disabled = false;
      this.dom.record.setAttribute('aria-pressed', 'true');
      this.dom.record.classList.add('recording');
      this.updateRecordingClock();
      this.recordingClock = window.setInterval(() => this.updateRecordingClock(), 1000);
      this.setText('recordState', `pantalla + audio · ${capture.label}`);
    } catch (error) {
      this.resetRecordingUi();
      console.error(error);
      this.setText('recordState', 'no iniciado');
      this.setText('active', error.message);
    }
  }

  async stopExperienceRecording(source = 'botón-stop') {
    if (!this.recording || this.recordStopping) return;
    this.recordStopping = true;
    this.recording = false;
    window.clearInterval(this.recordingClock);
    this.recordingClock = 0;
    this.dom.record.disabled = true;
    this.setText('recordLabel', 'GUARDANDO…');
    this.setText('recordState', 'cerrando vídeo');

    let result = null;
    let failure = null;
    try {
      this.recorder.add('record-stop', { source });
      this.recorder.stop();
      this.recorder.download(`${this.recordingFilenameBase || 'mpi-experiencia'}-session.json`);
      result = await this.experienceRecorder.stop();
    } catch (error) {
      failure = error;
      this.showError(error);
    } finally {
      this.recordStopping = false;
      this.resetRecordingUi();
    }
    if (failure) {
      this.setText('recordState', 'error al guardar');
    } else if (result?.blob?.size) {
      this.setText('recordState', `${result.label} guardado · ${(result.blob.size / 1048576).toFixed(1)} MB`);
    } else if (!result) {
      this.setText('recordState', 'grabación finalizada');
    }
  }

  updateRecordingClock() {
    if (!this.recording) return;
    const elapsed = Math.max(0, Math.floor((performance.now() - this.recordingStartedAt) / 1000));
    const minutes = String(Math.floor(elapsed / 60)).padStart(2, '0');
    const seconds = String(elapsed % 60).padStart(2, '0');
    this.setText('recordLabel', `STOP ${minutes}:${seconds}`);
  }

  resetRecordingUi() {
    window.clearInterval(this.recordingClock);
    this.recordingClock = 0;
    this.recording = false;
    this.recordingStartedAt = 0;
    this.recordingFilenameBase = '';
    this.dom.world.disabled = false;
    this.dom.record.disabled = false;
    this.dom.record.setAttribute('aria-pressed', 'false');
    this.dom.record.classList.remove('recording');
    this.setText('recordLabel', 'REC');
  }

  updatePerformance(name, summary) {
    const map = {
      worldLoad: 'perfWorld', render: 'perfRender', search: 'perfSearch', sonic: 'perfSonic',
      audioDecode: 'perfDecode', audioStart: 'perfAudioStart', ui: 'perfUi',
    };
    const id = map[name];
    if (id) this.setText(id, PerformanceMonitor.format(summary));
  }

  setText(id, value) {
    if (!this.dom[id]) return;
    this.dom[id].textContent = this.language === 'en' ? this.translateInterfaceText(value) : value;
  }

  setLoading(active, text = '') {
    this.dom.loadingOverlay.hidden = !active;
    if (text) this.dom.loadingText.textContent = text;
  }

  showError(error) {
    console.error(error);
    this.setText('loadState', 'error');
    this.setText('active', `Error: ${error.message}`);
    this.setLoading(false);
  }
}

window.addEventListener('DOMContentLoaded', () => {
  const app = new App();
  window.__SSE_APP__ = app;
  void app.init();
});
