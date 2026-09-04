(() => {
  'use strict';

  const STORAGE_KEY = 'canvas-de-negocio.v1';
  const MAX_LOGO_BYTES = 2 * 1024 * 1024;
  const BLOCKS = [
    ['segments', 'Segmentos de clientes', '¿Quién te va a comprar?', '01'],
    ['value', 'Propuesta de valor', '¿Qué problema le estás resolviendo?', '02'],
    ['channels', 'Canales', '¿Cómo se va a enterar de que existes?', '03'],
    ['relationships', 'Relaciones con clientes', '¿Cómo harás para que se quede?', '04'],
    ['revenue', 'Fuentes de ingresos', '¿Cómo vas a ganar plata?', '05'],
    ['resources', 'Recursos clave', '¿Qué necesitas para que funcione?', '06'],
    ['activities', 'Actividades clave', '¿Qué tienes que hacer sí o sí?', '07'],
    ['partners', 'Socios clave', '¿Quiénes te tienen que ayudar?', '08'],
    ['costs', 'Estructura de costos', '¿En qué se te va a ir la plata?', '09']
  ];
  const BLOCK_META = Object.fromEntries(BLOCKS.map(([key, label, question, number]) => [key, { label, question, number }]));
  const BLOCK_COLORS = {
    segments: ['#004f91', '#e6f0ff'],
    value: ['#d94e80', '#ffedf3'],
    channels: ['#1684c2', '#eaf6fd'],
    relationships: ['#829800', '#f4f7dc'],
    revenue: ['#829800', '#f4f7dc'],
    resources: ['#e18447', '#fff1e8'],
    activities: ['#01869f', '#e6f6f8'],
    partners: ['#004f91', '#e6f0ff'],
    costs: ['#555b61', '#f0f1f2']
  };

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
    exportToggle: document.querySelector('#exportToggle'),
    exportMenu: document.querySelector('#exportMenu'),
    printButton: document.querySelector('#printButton'),
    pngButton: document.querySelector('#pngButton'),
    shareWhatsapp: document.querySelector('#shareWhatsapp'),
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

  function downloadBlob(filename, blob) {
    const link = document.createElement('a');
    const objectUrl = URL.createObjectURL(blob);
    link.href = objectUrl;
    link.download = filename;
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
  }

  function download(filename, content, type) {
    downloadBlob(filename, new Blob([content], { type }));
  }

  function safeFilename() {
    const raw = state.businessName.trim() || 'mi-negocio';
    return raw.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50) || 'mi-negocio';
  }

  function roundedRect(context, x, y, width, height, radius) {
    const r = Math.min(radius, width / 2, height / 2);
    context.beginPath();
    context.moveTo(x + r, y);
    context.lineTo(x + width - r, y);
    context.quadraticCurveTo(x + width, y, x + width, y + r);
    context.lineTo(x + width, y + height - r);
    context.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
    context.lineTo(x + r, y + height);
    context.quadraticCurveTo(x, y + height, x, y + height - r);
    context.lineTo(x, y + r);
    context.quadraticCurveTo(x, y, x + r, y);
    context.closePath();
  }

  function wrapText(context, text, maxWidth) {
    const lines = [];
    const paragraphs = String(text || '').split(/\n/);
    paragraphs.forEach((paragraph, paragraphIndex) => {
      const words = paragraph.trim().split(/\s+/).filter(Boolean);
      if (!words.length) {
        if (paragraphIndex < paragraphs.length - 1) lines.push('');
        return;
      }
      let line = words.shift();
      words.forEach((word) => {
        const candidate = `${line} ${word}`;
        if (context.measureText(candidate).width <= maxWidth) line = candidate;
        else {
          lines.push(line);
          line = word;
        }
      });
      lines.push(line);
      if (paragraphIndex < paragraphs.length - 1) lines.push('');
    });
    return lines;
  }

  function drawTextLines(context, lines, x, y, lineHeight, maxLines = lines.length) {
    const visible = lines.slice(0, maxLines);
    visible.forEach((line, index) => context.fillText(line, x, y + (index * lineHeight)));
    return y + (visible.length * lineHeight);
  }

  function drawExportBlock(context, key, x, y, width, height) {
    const meta = BLOCK_META[key];
    const isMono = state.mode === 'mono';
    const [brandColor, tintColor] = isMono ? ['#515866', '#f0f1f3'] : BLOCK_COLORS[key];
    const innerX = x + 30;
    const innerWidth = width - 60;

    context.save();
    roundedRect(context, x, y, width, height, 16);
    context.fillStyle = '#ffffff';
    context.fill();
    context.strokeStyle = '#cbd5da';
    context.lineWidth = 2;
    context.stroke();

    context.fillStyle = brandColor;
    roundedRect(context, x, y, 10, height, 6);
    context.fill();

    context.fillStyle = tintColor;
    roundedRect(context, innerX, y + 27, 58, 48, 10);
    context.fill();
    context.fillStyle = brandColor;
    context.font = '800 20px Barlow, Arial, sans-serif';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(meta.number, innerX + 29, y + 51);

    context.textAlign = 'left';
    context.textBaseline = 'alphabetic';
    context.fillStyle = '#222222';
    context.font = 'italic 800 27px Barlow, Arial, sans-serif';
    const titleLines = wrapText(context, meta.label, innerWidth - 76);
    drawTextLines(context, titleLines, innerX + 76, y + 52, 31, 2);

    context.fillStyle = '#4f5f6d';
    context.font = '600 22px Barlow, Arial, sans-serif';
    const questionLines = wrapText(context, meta.question, innerWidth);
    let cursorY = drawTextLines(context, questionLines, innerX, y + 108, 28, 3) + 12;

    const notes = state.notes[key].map((note) => note.text.trim()).filter(Boolean);
    const bottom = y + height - 28;
    if (!notes.length) {
      context.fillStyle = '#8a959f';
      context.font = 'italic 500 19px Barlow, Arial, sans-serif';
      context.fillText('Sin ideas añadidas todavía', innerX, cursorY + 14);
      context.restore();
      return;
    }

    context.font = '500 20px Barlow, Arial, sans-serif';
    context.fillStyle = '#263146';
    let drawnNotes = 0;
    for (let noteIndex = 0; noteIndex < notes.length; noteIndex += 1) {
      const noteLines = wrapText(context, notes[noteIndex], innerWidth - 28);
      const availableLines = Math.floor((bottom - cursorY - 14) / 25);
      if (availableLines < 1) break;
      const visibleLines = noteLines.slice(0, Math.min(noteLines.length, availableLines, 7));
      if (visibleLines.length < noteLines.length && visibleLines.length) {
        const lastIndex = visibleLines.length - 1;
        visibleLines[lastIndex] = `${visibleLines[lastIndex].replace(/[.…]+$/, '')}…`;
      }
      context.fillStyle = brandColor;
      context.beginPath();
      context.arc(innerX + 4, cursorY + 8, 4, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = '#263146';
      cursorY = drawTextLines(context, visibleLines, innerX + 22, cursorY + 14, 25) + 10;
      drawnNotes += 1;
      if (visibleLines.length < noteLines.length) break;
    }

    if (drawnNotes < notes.length && bottom - cursorY >= 20) {
      context.fillStyle = brandColor;
      context.font = '700 18px Barlow, Arial, sans-serif';
      context.fillText(`+${notes.length - drawnNotes} ideas más`, innerX, Math.min(bottom, cursorY + 12));
    }
    context.restore();
  }

  function loadExportImage(source) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = reject;
      image.src = source;
    });
  }

  async function exportPng() {
    elements.pngButton.disabled = true;
    elements.pngButton.setAttribute('aria-busy', 'true');
    showToast('Preparando la imagen PNG…');

    try {
      if (document.fonts?.ready) await document.fonts.ready;
      const canvas = document.createElement('canvas');
      canvas.width = 3000;
      canvas.height = 2000;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Canvas no disponible');

      context.fillStyle = '#f5f7f9';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.fillStyle = '#004f91';
      context.fillRect(0, 0, canvas.width, 238);
      context.fillStyle = '#afca0b';
      context.fillRect(0, 228, canvas.width, 10);

      context.fillStyle = '#ffffff';
      context.font = 'italic 800 56px Barlow, Arial, sans-serif';
      context.fillText('BUSINESS MODEL CANVAS', 72, 90);
      context.fillStyle = '#dcefff';
      context.font = '600 25px Barlow, Arial, sans-serif';
      context.fillText(`Idea de Negocio: ${state.businessName.trim() || 'Sin nombre'}`, 72, 146);
      context.fillText(`Elaborado por: ${state.authorName.trim() || 'Sin indicar'}`, 72, 188);

      if (state.logo) {
        try {
          const logo = await loadExportImage(state.logo);
          const maxWidth = 260;
          const maxHeight = 130;
          const scale = Math.min(maxWidth / logo.naturalWidth, maxHeight / logo.naturalHeight, 1);
          const logoWidth = logo.naturalWidth * scale;
          const logoHeight = logo.naturalHeight * scale;
          context.fillStyle = '#ffffff';
          roundedRect(context, canvas.width - logoWidth - 102, 42, logoWidth + 44, logoHeight + 30, 12);
          context.fill();
          context.drawImage(logo, canvas.width - logoWidth - 80, 57, logoWidth, logoHeight);
        } catch { /* El resto del canvas se exporta aunque el logo no pueda renderizarse. */ }
      }

      const gridX = 60;
      const gridY = 268;
      const gridWidth = canvas.width - 120;
      const gridHeight = canvas.height - gridY - 56;
      const columnWidth = gridWidth / 5;
      const topRowHeight = (gridHeight * 0.69) / 2;
      const bottomHeight = gridHeight - (topRowHeight * 2);
      const gap = 7;
      const cell = (key, column, row, columnSpan = 1, rowSpan = 1) => {
        const x = gridX + (column * columnWidth) + (gap / 2);
        const y = gridY + (row * topRowHeight) + (gap / 2);
        const width = (columnWidth * columnSpan) - gap;
        const height = (topRowHeight * rowSpan) - gap;
        drawExportBlock(context, key, x, y, width, height);
      };

      cell('partners', 0, 0, 1, 2);
      cell('activities', 1, 0);
      cell('resources', 1, 1);
      cell('value', 2, 0, 1, 2);
      cell('relationships', 3, 0);
      cell('channels', 3, 1);
      cell('segments', 4, 0, 1, 2);
      drawExportBlock(context, 'costs', gridX + (gap / 2), gridY + (topRowHeight * 2) + (gap / 2), (gridWidth / 2) - gap, bottomHeight - gap);
      drawExportBlock(context, 'revenue', gridX + (gridWidth / 2) + (gap / 2), gridY + (topRowHeight * 2) + (gap / 2), (gridWidth / 2) - gap, bottomHeight - gap);

      const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
      if (!blob) throw new Error('No se pudo generar la imagen');
      downloadBlob(`canvas-${safeFilename()}.png`, blob);
      showToast('Imagen PNG descargada.');
    } catch {
      showToast('No se pudo crear el PNG en este navegador.');
    } finally {
      elements.pngButton.disabled = false;
      elements.pngButton.removeAttribute('aria-busy');
    }
  }

  function setExportMenu(open) {
    elements.exportMenu.hidden = !open;
    elements.exportToggle.setAttribute('aria-expanded', String(open));
  }

  function shareOnWhatsApp() {
    const pageUrl = new URL(window.location.href);
    pageUrl.hash = '';
    const message = `🚀 *Oye 👋 estoy usando esta herramienta para ordenar mi idea de negocio y pensé en ti 😊*\n\nSi estás emprendiendo o tienes una idea, creo que te puede servir 🚀\n\nTe la paso por aquí: ${pageUrl.href}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, '_blank', 'noopener,noreferrer');
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

  elements.exportToggle.addEventListener('click', (event) => {
    event.stopPropagation();
    setExportMenu(elements.exportMenu.hidden);
  });
  elements.exportMenu.addEventListener('click', (event) => event.stopPropagation());
  document.addEventListener('click', () => setExportMenu(false));
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      setExportMenu(false);
      elements.exportToggle.focus();
    }
  });
  elements.printButton.addEventListener('click', () => {
    setExportMenu(false);
    window.print();
  });
  elements.pngButton.addEventListener('click', () => {
    setExportMenu(false);
    exportPng();
  });
  elements.shareWhatsapp.addEventListener('click', shareOnWhatsApp);
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
