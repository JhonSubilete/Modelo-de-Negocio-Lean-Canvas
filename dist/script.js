(() => {
  'use strict';

  const STORAGE_KEY = 'canvas-de-negocio.v1';
  const MAX_LOGO_BYTES = 2 * 1024 * 1024;
  const BLOCKS = [
    ['partners', 'Socios clave'],
    ['activities', 'Actividades clave'],
    ['resources', 'Recursos clave'],
    ['value', 'Propuesta de valor'],
    ['relationships', 'Relaciones con clientes'],
    ['channels', 'Canales'],
    ['segments', 'Segmentos de clientes'],
    ['costs', 'Estructura de costos'],
    ['revenue', 'Fuentes de ingresos']
  ];

  const emptyNotes = () => Object.fromEntries(BLOCKS.map(([key]) => [key, []]));
  const defaultState = () => ({
    version: 1,
    mode: 'color',
    businessName: '',
    authorName: '',
    logo: '',
    notes: emptyNotes()
  });

  const elements = {
    body: document.body,
    businessName: document.querySelector('#businessName'),
    authorName: document.querySelector('#authorName'),
    logoInput: document.querySelector('#logoInput'),
    logoPreview: document.querySelector('#logoPreview'),
    logoPlaceholder: document.querySelector('#logoPlaceholder'),
    removeLogoButton: document.querySelector('#removeLogoButton'),
    colorMode: document.querySelector('#colorMode'),
    monoMode: document.querySelector('#monoMode'),
    canvasGrid: document.querySelector('#canvasGrid'),
    completionValue: document.querySelector('#completionValue'),
    progressBar: document.querySelector('#progressBar'),
    saveState: document.querySelector('#saveState'),
    importButton: document.querySelector('#importButton'),
    importInput: document.querySelector('#importInput'),
    exportJsonButton: document.querySelector('#exportJsonButton'),
    printButton: document.querySelector('#printButton'),
    resetButton: document.querySelector('#resetButton'),
    resetDialog: document.querySelector('#resetDialog'),
    confirmReset: document.querySelector('#confirmReset'),
    toast: document.querySelector('#toast')
  };

  let state = loadState();
  let saveTimer = null;
  let toastTimer = null;
  let dragged = null;

  function uid() {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') return window.crypto.randomUUID();
    return `note-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function normalizeState(candidate) {
    const clean = defaultState();
    if (!candidate || typeof candidate !== 'object') return clean;
    clean.mode = candidate.mode === 'mono' ? 'mono' : 'color';
    clean.businessName = typeof candidate.businessName === 'string' ? candidate.businessName.slice(0, 80) : '';
    clean.authorName = typeof candidate.authorName === 'string' ? candidate.authorName.slice(0, 80) : '';
    clean.logo = typeof candidate.logo === 'string' && candidate.logo.startsWith('data:image/') ? candidate.logo : '';

    BLOCKS.forEach(([key]) => {
      const incoming = candidate.notes && Array.isArray(candidate.notes[key]) ? candidate.notes[key] : [];
      clean.notes[key] = incoming.slice(0, 80).map((note) => ({
        id: typeof note.id === 'string' ? note.id : uid(),
        text: typeof note.text === 'string' ? note.text.slice(0, 700) : ''
      }));
    });
    return clean;
  }

  function loadState() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return saved ? normalizeState(JSON.parse(saved)) : defaultState();
    } catch {
      return defaultState();
    }
  }

  function queueSave() {
    elements.saveState.classList.add('is-saving');
    elements.saveState.lastChild.textContent = ' Guardando…';
    window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(() => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
        elements.saveState.classList.remove('is-saving');
        elements.saveState.lastChild.textContent = ' Guardado en este dispositivo';
      } catch {
        elements.saveState.classList.remove('is-saving');
        elements.saveState.lastChild.textContent = ' No se pudo guardar';
        showToast('El navegador no permitió guardar los cambios localmente.');
      }
    }, 220);
  }

  function showToast(message) {
    window.clearTimeout(toastTimer);
    elements.toast.textContent = message;
    elements.toast.hidden = false;
    toastTimer = window.setTimeout(() => { elements.toast.hidden = true; }, 3300);
  }

  function autoResize(textarea) {
    textarea.style.height = 'auto';
    textarea.style.height = `${Math.max(38, textarea.scrollHeight)}px`;
  }

  function getBlockName(key) {
    return BLOCKS.find(([blockKey]) => blockKey === key)?.[1] || key;
  }

  function buildMoveSelect(noteId, currentKey) {
    const select = document.createElement('select');
    select.className = 'move-note';
    select.setAttribute('aria-label', 'Mover nota a otro bloque');
    const initial = document.createElement('option');
    initial.value = '';
    initial.textContent = 'Mover a…';
    select.append(initial);
    BLOCKS.filter(([key]) => key !== currentKey).forEach(([key, label]) => {
      const option = document.createElement('option');
      option.value = key;
      option.textContent = label;
      select.append(option);
    });
    select.addEventListener('change', () => {
      if (!select.value) return;
      moveNote(noteId, currentKey, select.value);
    });
    return select;
  }

  function createNoteElement(note, blockKey) {
    const noteElement = document.createElement('div');
    noteElement.className = 'canvas-note';
    noteElement.dataset.noteId = note.id;
    noteElement.dataset.blockKey = blockKey;

    const handle = document.createElement('button');
    handle.className = 'drag-handle';
    handle.type = 'button';
    handle.draggable = true;
    handle.title = 'Arrastrar nota';
    handle.setAttribute('aria-label', `Arrastrar nota de ${getBlockName(blockKey)}`);
    handle.textContent = '⠿';

    const textarea = document.createElement('textarea');
    textarea.className = 'note-text';
    textarea.maxLength = 700;
    textarea.rows = 2;
    textarea.placeholder = 'Escribe una idea…';
    textarea.value = note.text;
    textarea.setAttribute('aria-label', `Nota en ${getBlockName(blockKey)}`);
    textarea.addEventListener('input', () => {
      note.text = textarea.value;
      autoResize(textarea);
      queueSave();
      updateCompletion();
    });

    const remove = document.createElement('button');
    remove.className = 'delete-note';
    remove.type = 'button';
    remove.title = 'Eliminar nota';
    remove.setAttribute('aria-label', 'Eliminar nota');
    remove.textContent = '×';
    remove.addEventListener('click', () => {
      state.notes[blockKey] = state.notes[blockKey].filter((item) => item.id !== note.id);
      renderBlock(blockKey);
      queueSave();
      updateCompletion();
    });

    handle.addEventListener('dragstart', (event) => {
      dragged = { noteId: note.id, fromKey: blockKey };
      noteElement.classList.add('is-dragging');
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', note.id);
    });
    handle.addEventListener('dragend', () => {
      dragged = null;
      noteElement.classList.remove('is-dragging');
      document.querySelectorAll('.canvas-block.is-drag-over').forEach((block) => block.classList.remove('is-drag-over'));
    });

    noteElement.append(handle, textarea, remove, buildMoveSelect(note.id, blockKey));
    window.requestAnimationFrame(() => autoResize(textarea));
    return noteElement;
  }

  function renderBlock(key, focusLast = false) {
    const list = document.querySelector(`[data-notes="${key}"]`);
    list.replaceChildren(...state.notes[key].map((note) => createNoteElement(note, key)));
    if (focusLast) {
      window.requestAnimationFrame(() => list.lastElementChild?.querySelector('textarea')?.focus());
    }
  }

  function renderAllBlocks() {
    BLOCKS.forEach(([key]) => renderBlock(key));
  }

  function addNote(key) {
    state.notes[key].push({ id: uid(), text: '' });
    renderBlock(key, true);
    queueSave();
  }

  function moveNote(noteId, fromKey, toKey, targetId = '') {
    if (!state.notes[fromKey] || !state.notes[toKey]) return;
    const noteIndex = state.notes[fromKey].findIndex((item) => item.id === noteId);
    if (noteIndex < 0) return;
    const [note] = state.notes[fromKey].splice(noteIndex, 1);
    const targetIndex = targetId ? state.notes[toKey].findIndex((item) => item.id === targetId) : -1;
    if (targetIndex >= 0) state.notes[toKey].splice(targetIndex, 0, note);
    else state.notes[toKey].push(note);
    renderBlock(fromKey);
    if (fromKey !== toKey) renderBlock(toKey);
    else renderBlock(toKey);
    queueSave();
    updateCompletion();
    showToast(`Nota movida a ${getBlockName(toKey)}.`);
  }

  function updateCompletion() {
    const completed = BLOCKS.reduce((total, [key]) => total + (state.notes[key].some((note) => note.text.trim()) ? 1 : 0), 0);
    elements.completionValue.textContent = `${completed}/9`;
    elements.progressBar.style.width = `${(completed / 9) * 100}%`;
  }

  function setMode(mode, shouldSave = true) {
    state.mode = mode === 'mono' ? 'mono' : 'color';
    elements.body.dataset.mode = state.mode;
    const isColor = state.mode === 'color';
    elements.colorMode.classList.toggle('is-active', isColor);
    elements.monoMode.classList.toggle('is-active', !isColor);
    elements.colorMode.setAttribute('aria-pressed', String(isColor));
    elements.monoMode.setAttribute('aria-pressed', String(!isColor));
    if (shouldSave) queueSave();
  }

  function renderLogo() {
    const hasLogo = Boolean(state.logo);
    elements.logoPreview.hidden = !hasLogo;
    elements.logoPlaceholder.hidden = hasLogo;
    elements.removeLogoButton.hidden = !hasLogo;
    if (hasLogo) elements.logoPreview.src = state.logo;
    else elements.logoPreview.removeAttribute('src');
  }

  function download(filename, content, type) {
    const blob = new Blob([content], { type });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  }

  function safeFilename() {
    const raw = state.businessName.trim() || 'mi-negocio';
    return raw.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50) || 'mi-negocio';
  }

  function hydrate() {
    elements.businessName.value = state.businessName;
    elements.authorName.value = state.authorName;
    setMode(state.mode, false);
    renderLogo();
    renderAllBlocks();
    updateCompletion();
  }

  document.querySelectorAll('[data-add]').forEach((button) => {
    button.addEventListener('click', () => addNote(button.dataset.add));
  });

  document.querySelectorAll('.canvas-block').forEach((block) => {
    block.addEventListener('dragover', (event) => {
      if (!dragged) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';
      block.classList.add('is-drag-over');
    });
    block.addEventListener('dragleave', (event) => {
      if (!block.contains(event.relatedTarget)) block.classList.remove('is-drag-over');
    });
    block.addEventListener('drop', (event) => {
      event.preventDefault();
      block.classList.remove('is-drag-over');
      if (!dragged) return;
      const targetNote = event.target.closest('.canvas-note');
      moveNote(dragged.noteId, dragged.fromKey, block.dataset.key, targetNote?.dataset.noteId || '');
      dragged = null;
    });
  });

  elements.businessName.addEventListener('input', () => { state.businessName = elements.businessName.value; queueSave(); });
  elements.authorName.addEventListener('input', () => { state.authorName = elements.authorName.value; queueSave(); });
  elements.colorMode.addEventListener('click', () => setMode('color'));
  elements.monoMode.addEventListener('click', () => setMode('mono'));

  elements.logoInput.addEventListener('change', () => {
    const file = elements.logoInput.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { showToast('Selecciona un archivo de imagen válido.'); return; }
    if (file.size > MAX_LOGO_BYTES) { showToast('El logotipo supera el límite de 2 MB.'); elements.logoInput.value = ''; return; }
    const reader = new FileReader();
    reader.onload = () => {
      state.logo = typeof reader.result === 'string' ? reader.result : '';
      renderLogo();
      queueSave();
      showToast('Logotipo añadido.');
    };
    reader.onerror = () => showToast('No se pudo leer el logotipo.');
    reader.readAsDataURL(file);
  });

  elements.removeLogoButton.addEventListener('click', (event) => {
    event.preventDefault();
    state.logo = '';
    elements.logoInput.value = '';
    renderLogo();
    queueSave();
  });

  elements.exportJsonButton.addEventListener('click', () => {
    const exportState = { ...state, exportedAt: new Date().toISOString() };
    download(`canvas-${safeFilename()}.json`, JSON.stringify(exportState, null, 2), 'application/json');
    showToast('Archivo del lienzo descargado.');
  });

  elements.importButton.addEventListener('click', () => elements.importInput.click());
  elements.importInput.addEventListener('change', async () => {
    const file = elements.importInput.files?.[0];
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text());
      state = normalizeState(parsed);
      hydrate();
      queueSave();
      showToast('Lienzo importado correctamente.');
    } catch {
      showToast('El archivo no es un lienzo válido.');
    } finally {
      elements.importInput.value = '';
    }
  });

  elements.printButton.addEventListener('click', () => window.print());
  elements.resetButton.addEventListener('click', () => elements.resetDialog.showModal());
  elements.confirmReset.addEventListener('click', () => {
    state = defaultState();
    elements.logoInput.value = '';
    try { localStorage.removeItem(STORAGE_KEY); } catch { /* no-op */ }
    hydrate();
    showToast('El lienzo quedó vacío.');
  });

  window.addEventListener('beforeprint', () => {
    document.querySelectorAll('.note-text').forEach(autoResize);
  });

  hydrate();
})();
