const { letters, words } = window.ENGLISH_LAB_CONTENT;
const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

const state = {
  caseMode: 'both',
  builderMode: 'unscramble',
  wordIndex: 0,
  tiles: [],
  answer: [],
  selected: null,
  drag: null,
  ignoreClickUntil: 0,
  currentSolved: false,
  practiceIndex: 0,
  completed: Number(localStorage.getItem('englishLab.completed') || 0)
};

function speak(text) {
  if (!('speechSynthesis' in window)) return;
  speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'en-US';
  utterance.rate = 0.82;
  speechSynthesis.speak(utterance);
}

function renderProgress() {
  $('#progressCount').textContent = state.completed;
}

function addProgress() {
  state.completed += 1;
  localStorage.setItem('englishLab.completed', state.completed);
  renderProgress();
}

function renderLetters() {
  const grid = $('#letterGrid');
  grid.innerHTML = '';
  letters.forEach((item) => {
    const button = document.createElement('button');
    button.className = 'letter-card';
    const glyph = state.caseMode === 'upper'
      ? item.upper
      : state.caseMode === 'lower'
        ? item.lower
        : `${item.upper}${item.lower}`;

    button.innerHTML = `
      <div class="letter-glyph">${glyph}</div>
      <div class="letter-phoneme">${item.phoneme}</div>
      <div class="letter-example">${item.example}</div>
    `;
    button.addEventListener('click', () => openLetter(item));
    grid.appendChild(button);
  });
}

function openLetter(item) {
  $('#dialogContent').innerHTML = `
    <p class="eyebrow">Letter focus</p>
    <div class="dialog-letter">${item.upper}${item.lower}</div>
    <p><strong>Common sound:</strong> ${item.phoneme}</p>
    <p class="dialog-example"><strong>Example:</strong> ${item.example}</p>
    <button id="dialogSpeakLetter" class="secondary-btn">Hear letter name</button>
    <button id="dialogSpeakWord" class="primary-btn">Hear example word</button>
    <p class="dialog-note">Device speech synthesis is a temporary fallback for names and words. Production phonics should use curated recorded phoneme audio.</p>
  `;
  $('#dialogSpeakLetter').addEventListener('click', () => speak(item.upper));
  $('#dialogSpeakWord').addEventListener('click', () => speak(item.example));
  $('#letterDialog').showModal();
}

function shuffled(array) {
  const copy = [...array];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function tileId(index, letter) {
  if (window.crypto?.randomUUID) return crypto.randomUUID();
  return `${Date.now()}-${index}-${letter}-${Math.random().toString(16).slice(2)}`;
}

function makeWordTiles(word) {
  const ordered = word.split('').map((letter, index) => ({
    id: tileId(index, letter),
    letter
  }));

  let mixed = shuffled(ordered);
  if (word.length > 2 && mixed.map(tile => tile.letter).join('') === word) {
    mixed = [...mixed.slice(1), mixed[0]];
  }
  return mixed;
}

function currentEntry() {
  return words[state.wordIndex];
}

function renderTarget() {
  const entry = currentEntry();
  $('#targetEmoji').textContent = entry.emoji || '🔤';
  $('#patternHint').textContent = entry.pattern
    ? `Pattern: ${entry.pattern}${entry.family ? ` · Family: ${entry.family}` : ''}`
    : '';

  if (state.builderMode === 'copy') {
    $('#builderModeLabel').textContent = 'Copy the word';
    $('#targetWord').textContent = entry.word;
    $('#targetHint').textContent = entry.hint;
  } else if (state.builderMode === 'listen') {
    $('#builderModeLabel').textContent = 'Listen, then build';
    $('#targetWord').textContent = `${entry.word.length} letters`;
    $('#targetHint').textContent = 'Use the sound button. Build the word you hear.';
  } else {
    $('#builderModeLabel').textContent = 'Unscramble the letters';
    $('#targetWord').textContent = `${entry.word.length} letters`;
    $('#targetHint').textContent = entry.hint;
  }
}

function loadWord(index = state.wordIndex) {
  state.wordIndex = (index + words.length) % words.length;
  state.answer = Array(currentEntry().word.length).fill(null);
  state.tiles = makeWordTiles(currentEntry().word);
  state.selected = null;
  state.currentSolved = false;
  $('#builderFeedback').textContent = '';
  $('#builderFeedback').className = 'feedback';
  renderTarget();
  renderBuilder();
}

function originEquals(a, b) {
  if (!a || !b || a.kind !== b.kind) return false;
  if (a.kind === 'bank') return a.tileId === b.tileId;
  return a.index === b.index && a.tileId === b.tileId;
}

function getTileAtOrigin(origin) {
  if (!origin) return null;
  if (origin.kind === 'bank') {
    return state.tiles.find(tile => tile.id === origin.tileId) || null;
  }
  return state.answer[origin.index]?.id === origin.tileId
    ? state.answer[origin.index]
    : null;
}

function extractTile(origin) {
  if (origin.kind === 'bank') {
    const index = state.tiles.findIndex(tile => tile.id === origin.tileId);
    if (index < 0) return null;
    return state.tiles.splice(index, 1)[0];
  }

  const tile = state.answer[origin.index];
  if (!tile || tile.id !== origin.tileId) return null;
  state.answer[origin.index] = null;
  return tile;
}

function putInBank(tile) {
  if (!tile) return;
  if (!state.tiles.some(item => item.id === tile.id)) state.tiles.push(tile);
}

function moveTile(origin, destination) {
  if (!origin || !destination) return;
  if (destination.kind === 'slot' && origin.kind === 'slot' && destination.index === origin.index) {
    state.selected = null;
    renderBuilder();
    return;
  }

  const tile = extractTile(origin);
  if (!tile) {
    state.selected = null;
    renderBuilder();
    return;
  }

  if (destination.kind === 'bank') {
    putInBank(tile);
  } else {
    const displaced = state.answer[destination.index];
    state.answer[destination.index] = tile;

    if (displaced) {
      if (origin.kind === 'slot' && state.answer[origin.index] === null) {
        state.answer[origin.index] = displaced;
      } else {
        putInBank(displaced);
      }
    }
  }

  state.selected = null;
  $('#builderFeedback').textContent = '';
  $('#builderFeedback').className = 'feedback';
  renderBuilder();
}

function selectTile(origin) {
  if (performance.now() < state.ignoreClickUntil) return;

  if (!state.selected) {
    state.selected = origin;
    renderBuilder();
    return;
  }

  if (originEquals(state.selected, origin)) {
    state.selected = null;
    renderBuilder();
    return;
  }

  if (origin.kind === 'slot') {
    moveTile(state.selected, { kind: 'slot', index: origin.index });
    return;
  }

  state.selected = origin;
  renderBuilder();
}

function slotActivate(index) {
  if (!state.selected) return;
  moveTile(state.selected, { kind: 'slot', index });
}

function parseDropTarget(element) {
  const zone = element?.closest?.('[data-drop-zone]');
  if (!zone) return null;
  if (zone.dataset.dropZone === 'bank') return { kind: 'bank' };
  if (zone.dataset.dropZone === 'slot') {
    return { kind: 'slot', index: Number(zone.dataset.slotIndex) };
  }
  return null;
}

function clearDragVisuals() {
  if (!state.drag) return;
  state.drag.ghost?.remove();
  state.drag.hoverZone?.classList.remove('drop-hover');
  document.body.classList.remove('is-dragging');
}

function finishDrag(event, cancelled = false) {
  const drag = state.drag;
  if (!drag || drag.pointerId !== event.pointerId) return;

  let destination = null;
  if (drag.moved && !cancelled) {
    const hit = document.elementFromPoint(event.clientX, event.clientY);
    destination = parseDropTarget(hit);
    state.ignoreClickUntil = performance.now() + 350;
  }

  clearDragVisuals();
  state.drag = null;

  if (drag.moved && destination) {
    moveTile(drag.origin, destination);
  }
}

function attachPointerDrag(button, origin, letter) {
  button.addEventListener('pointerdown', (event) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;

    state.drag = {
      pointerId: event.pointerId,
      origin,
      letter,
      startX: event.clientX,
      startY: event.clientY,
      moved: false,
      ghost: null,
      hoverZone: null
    };

    button.setPointerCapture?.(event.pointerId);
  });

  button.addEventListener('pointermove', (event) => {
    const drag = state.drag;
    if (!drag || drag.pointerId !== event.pointerId) return;

    const distance = Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY);
    if (!drag.moved && distance < 7) return;

    if (!drag.moved) {
      drag.moved = true;
      drag.ghost = document.createElement('div');
      drag.ghost.className = 'drag-ghost';
      drag.ghost.textContent = drag.letter;
      document.body.appendChild(drag.ghost);
      document.body.classList.add('is-dragging');
    }

    event.preventDefault();
    drag.ghost.style.left = `${event.clientX}px`;
    drag.ghost.style.top = `${event.clientY}px`;

    const hit = document.elementFromPoint(event.clientX, event.clientY);
    const zone = hit?.closest?.('[data-drop-zone]') || null;
    if (zone !== drag.hoverZone) {
      drag.hoverZone?.classList.remove('drop-hover');
      zone?.classList.add('drop-hover');
      drag.hoverZone = zone;
    }
  });

  button.addEventListener('pointerup', event => finishDrag(event));
  button.addEventListener('pointercancel', event => finishDrag(event, true));
}

function makeTileButton(tile, origin) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'letter-tile';
  button.textContent = tile.letter;
  button.dataset.tileId = tile.id;
  button.dataset.source = origin.kind;
  if (origin.kind === 'slot') button.dataset.slotIndex = String(origin.index);

  const isSelected = originEquals(state.selected, origin);
  button.classList.toggle('selected', isSelected);
  button.setAttribute('aria-pressed', String(isSelected));
  button.setAttribute('aria-label', `${isSelected ? 'Selected' : 'Select'} letter ${tile.letter}`);

  button.addEventListener('click', () => selectTile(origin));
  attachPointerDrag(button, origin, tile.letter);
  return button;
}

function renderBuilder() {
  const slots = $('#answerSlots');
  const bank = $('#tileBank');
  slots.innerHTML = '';
  bank.innerHTML = '';

  state.answer.forEach((tile, index) => {
    const slot = document.createElement('div');
    slot.className = 'answer-slot';
    slot.dataset.dropZone = 'slot';
    slot.dataset.slotIndex = String(index);
    slot.tabIndex = 0;
    slot.setAttribute('role', 'button');
    slot.setAttribute('aria-label', tile
      ? `Position ${index + 1}, letter ${tile.letter}`
      : `Empty position ${index + 1}`);

    if (tile) {
      slot.appendChild(makeTileButton(tile, { kind: 'slot', index, tileId: tile.id }));
    } else {
      const marker = document.createElement('span');
      marker.className = 'slot-marker';
      marker.textContent = String(index + 1);
      slot.appendChild(marker);
    }

    slot.addEventListener('click', (event) => {
      if (event.target.closest('.letter-tile')) return;
      slotActivate(index);
    });

    slot.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      slotActivate(index);
    });

    slots.appendChild(slot);
  });

  state.tiles.forEach(tile => {
    bank.appendChild(makeTileButton(tile, { kind: 'bank', tileId: tile.id }));
  });

  const selectedTile = getTileAtOrigin(state.selected);
  $('#selectionStatus').textContent = selectedTile
    ? `Selected ${selectedTile.letter} — choose a space.`
    : '';
}

function checkWord() {
  const entry = currentEntry();
  const current = state.answer.map(tile => tile?.letter || '').join('');
  const feedback = $('#builderFeedback');

  if (current === entry.word) {
    feedback.textContent = `Correct — ${entry.word}!`;
    feedback.className = 'feedback good';
    speak(entry.word);
    if (!state.currentSolved) {
      state.currentSolved = true;
      addProgress();
    }
    return;
  }

  if (state.answer.some(tile => tile === null)) {
    feedback.textContent = 'Complete every space first.';
    feedback.className = 'feedback bad';
    return;
  }

  const correctPositions = state.answer.reduce(
    (total, tile, index) => total + Number(tile?.letter === entry.word[index]),
    0
  );
  feedback.textContent = `Not yet. ${correctPositions} of ${entry.word.length} letters are in the correct place.`;
  feedback.className = 'feedback bad';
}

function scrambleWord() {
  const allTiles = [...state.tiles, ...state.answer.filter(Boolean)];
  state.answer = Array(currentEntry().word.length).fill(null);
  state.tiles = shuffled(allTiles);
  state.selected = null;
  $('#builderFeedback').textContent = '';
  $('#builderFeedback').className = 'feedback';
  renderBuilder();
}

function renderPractice() {
  const entry = words[state.practiceIndex % words.length];
  $('#practiceWord').textContent = entry.word;
  $('#practiceFeedback').textContent = '';
  $('#practiceFeedback').className = 'feedback';

  const correct = entry.word[0];
  const distractors = letters.map(letter => letter.upper).filter(letter => letter !== correct);
  const choices = shuffled([correct, ...shuffled(distractors).slice(0, 2)]);
  const wrap = $('#practiceChoices');
  wrap.innerHTML = '';

  choices.forEach(letter => {
    const button = document.createElement('button');
    button.className = 'choice-btn';
    button.textContent = letter;

    button.addEventListener('click', () => {
      $$('.choice-btn').forEach(choice => { choice.disabled = true; });

      if (letter === correct) {
        button.classList.add('correct');
        $('#practiceFeedback').textContent = `Yes. ${entry.word} begins with ${correct}.`;
        $('#practiceFeedback').className = 'feedback good';
        addProgress();
      } else {
        button.classList.add('wrong');
        const correctButton = $$('.choice-btn').find(choice => choice.textContent === correct);
        correctButton?.classList.add('correct');
        $('#practiceFeedback').textContent = `This word begins with ${correct}.`;
        $('#practiceFeedback').className = 'feedback bad';
      }
    });

    wrap.appendChild(button);
  });
}

$$('.tab').forEach(tab => tab.addEventListener('click', () => {
  $$('.tab').forEach(item => item.classList.toggle('is-active', item === tab));
  $$('.view').forEach(view => view.classList.toggle('is-active', view.id === tab.dataset.view));
}));

$('#caseMode').addEventListener('change', event => {
  state.caseMode = event.target.value;
  renderLetters();
});

$('#builderMode').addEventListener('change', event => {
  state.builderMode = event.target.value;
  loadWord(state.wordIndex);
});

$('#newWordBtn').addEventListener('click', () => loadWord(state.wordIndex + 1));
$('#shuffleBtn').addEventListener('click', scrambleWord);
$('#resetBtn').addEventListener('click', scrambleWord);
$('#checkBtn').addEventListener('click', checkWord);
$('#speakWordBtn').addEventListener('click', () => speak(currentEntry().word));
$('#speakPracticeBtn').addEventListener('click', () => speak(words[state.practiceIndex % words.length].word));
$('#nextPracticeBtn').addEventListener('click', () => {
  state.practiceIndex = (state.practiceIndex + 1) % words.length;
  renderPractice();
});

$('#tileBank').addEventListener('click', event => {
  if (event.target.closest('.letter-tile') || !state.selected) return;
  moveTile(state.selected, { kind: 'bank' });
});

renderProgress();
renderLetters();
loadWord(0);
renderPractice();

async function initExerciseEngine() {
  const root = $('#exerciseEngineRoot');
  if (!root || !window.EnglishExerciseEngine) return;

  try {
    const response = await fetch('./src/data/exercises.json', { cache: 'no-cache' });
    if (!response.ok) throw new Error(`Exercise data request failed: ${response.status}`);

    const data = await response.json();
    const exerciseEngine = new window.EnglishExerciseEngine({
      root,
      data,
      onSolved: () => addProgress()
    });
    exerciseEngine.render();
  } catch (error) {
    console.error(error);
    root.innerHTML = `
      <article class="engine-card engine-error">
        <strong>Exercises could not be loaded.</strong>
        <p>Reload the app while online once so the PWA can cache the v0.3 exercise data.</p>
      </article>
    `;
  }
}

initExerciseEngine();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js'));
}


// ============================================================================
// v0.5 Magnetic Foam Letter Board
// ============================================================================
const foamBoardState = {
  caseMode: 'upper',
  nextId: 1,
  selectedId: null,
  trayDrag: null
};

const FOAM_COLORS = ['foam-coral', 'foam-blue', 'foam-yellow', 'foam-green', 'foam-purple'];
const VOWELS = new Set(['A', 'E', 'I', 'O', 'U']);

function foamColorClass(letter) {
  const upper = String(letter).toUpperCase();
  if (VOWELS.has(upper)) return 'foam-coral';
  const code = upper.charCodeAt(0) || 65;
  return FOAM_COLORS[(code - 65) % FOAM_COLORS.length];
}

function foamGlyph(letter) {
  return foamBoardState.caseMode === 'lower'
    ? String(letter).toLowerCase()
    : String(letter).toUpperCase();
}

function foamBoardElement() {
  return $('#magneticFoamBoard');
}

function updateFoamBoardMeta() {
  const board = foamBoardElement();
  if (!board) return;
  const count = board.querySelectorAll('.foam-board-piece').length;
  $('#foamBoardCount').textContent = `${count} ${count === 1 ? 'piece' : 'pieces'}`;
  board.classList.toggle('has-pieces', count > 0);
}

function selectFoamPiece(piece) {
  $$('.foam-board-piece.is-selected').forEach(item => item.classList.remove('is-selected'));
  foamBoardState.selectedId = piece?.dataset.pieceId || null;
  piece?.classList.add('is-selected');
}

function clearFoamSelection() {
  selectFoamPiece(null);
}

function clampFoamPosition(x, y, pieceWidth = 72, pieceHeight = 78) {
  const board = foamBoardElement();
  if (!board) return { x: 0, y: 0 };
  const maxX = Math.max(8, board.clientWidth - pieceWidth - 8);
  const maxY = Math.max(8, board.clientHeight - pieceHeight - 8);
  return {
    x: Math.max(8, Math.min(x, maxX)),
    y: Math.max(8, Math.min(y, maxY))
  };
}

function createFoamPiece(letter, x, y, options = {}) {
  const board = foamBoardElement();
  if (!board) return null;

  const piece = document.createElement('button');
  const pieceId = `foam-${foamBoardState.nextId++}`;
  const rotation = options.rotation ?? (Math.random() * 8 - 4);
  const position = clampFoamPosition(x, y);

  piece.type = 'button';
  piece.className = `foam-board-piece ${foamColorClass(letter)}`;
  piece.dataset.pieceId = pieceId;
  piece.dataset.letter = String(letter).toUpperCase();
  piece.style.left = `${position.x}px`;
  piece.style.top = `${position.y}px`;
  piece.style.setProperty('--foam-rotation', `${rotation}deg`);
  piece.textContent = foamGlyph(letter);
  piece.setAttribute('aria-label', `Movable foam letter ${String(letter).toUpperCase()}`);

  attachFoamPieceDrag(piece);
  board.appendChild(piece);
  updateFoamBoardMeta();
  if (options.select !== false) selectFoamPiece(piece);
  return piece;
}

function attachFoamPieceDrag(piece) {
  piece.addEventListener('pointerdown', event => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    event.preventDefault();

    const board = foamBoardElement();
    const pieceRect = piece.getBoundingClientRect();
    const boardRect = board.getBoundingClientRect();

    const drag = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      moved: false,
      offsetX: event.clientX - pieceRect.left,
      offsetY: event.clientY - pieceRect.top,
      boardLeft: boardRect.left,
      boardTop: boardRect.top
    };

    piece.dataset.dragging = 'true';
    piece.setPointerCapture?.(event.pointerId);

    const onMove = moveEvent => {
      if (moveEvent.pointerId !== drag.pointerId) return;
      const distance = Math.hypot(moveEvent.clientX - drag.startX, moveEvent.clientY - drag.startY);
      if (!drag.moved && distance < 5) return;
      drag.moved = true;
      moveEvent.preventDefault();

      const next = clampFoamPosition(
        moveEvent.clientX - drag.boardLeft - drag.offsetX,
        moveEvent.clientY - drag.boardTop - drag.offsetY,
        piece.offsetWidth,
        piece.offsetHeight
      );

      piece.style.left = `${next.x}px`;
      piece.style.top = `${next.y}px`;
      piece.classList.add('is-dragging');
    };

    const onEnd = endEvent => {
      if (endEvent.pointerId !== drag.pointerId) return;
      piece.removeEventListener('pointermove', onMove);
      piece.removeEventListener('pointerup', onEnd);
      piece.removeEventListener('pointercancel', onEnd);
      piece.classList.remove('is-dragging');
      delete piece.dataset.dragging;

      if (!drag.moved) {
        selectFoamPiece(piece);
      }
    };

    piece.addEventListener('pointermove', onMove);
    piece.addEventListener('pointerup', onEnd);
    piece.addEventListener('pointercancel', onEnd);
  });

  piece.addEventListener('dblclick', () => speak(piece.dataset.letter));
}

function randomFoamPosition() {
  const board = foamBoardElement();
  if (!board) return { x: 20, y: 20 };
  return {
    x: 18 + Math.random() * Math.max(40, board.clientWidth - 110),
    y: 24 + Math.random() * Math.max(50, board.clientHeight - 125)
  };
}

function addFoamLetter(letter, coordinates = null) {
  const pos = coordinates || randomFoamPosition();
  return createFoamPiece(letter, pos.x, pos.y);
}

function renderFoamTray() {
  const tray = $('#foamLetterTray');
  if (!tray) return;
  tray.innerHTML = '';

  letters.forEach(item => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `foam-tray-letter ${foamColorClass(item.upper)}`;
    button.dataset.letter = item.upper;
    button.textContent = foamGlyph(item.upper);
    button.setAttribute('aria-label', `Foam letter ${item.upper}`);

    let drag = null;

    button.addEventListener('pointerdown', event => {
      if (event.pointerType === 'mouse' && event.button !== 0) return;

      drag = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        moved: false,
        ghost: null
      };

      button.setPointerCapture?.(event.pointerId);
    });

    button.addEventListener('pointermove', event => {
      if (!drag || event.pointerId !== drag.pointerId) return;
      const distance = Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY);
      if (!drag.moved && distance < 7) return;

      if (!drag.moved) {
        drag.moved = true;
        drag.ghost = document.createElement('div');
        drag.ghost.className = `foam-drag-ghost ${foamColorClass(item.upper)}`;
        drag.ghost.textContent = foamGlyph(item.upper);
        document.body.appendChild(drag.ghost);
      }

      event.preventDefault();
      drag.ghost.style.left = `${event.clientX}px`;
      drag.ghost.style.top = `${event.clientY}px`;
    });

    const finishTrayDrag = event => {
      if (!drag || event.pointerId !== drag.pointerId) return;

      const board = foamBoardElement();
      const boardRect = board?.getBoundingClientRect();
      const wasMoved = drag.moved;

      drag.ghost?.remove();

      if (
        wasMoved &&
        boardRect &&
        event.clientX >= boardRect.left &&
        event.clientX <= boardRect.right &&
        event.clientY >= boardRect.top &&
        event.clientY <= boardRect.bottom
      ) {
        addFoamLetter(item.upper, {
          x: event.clientX - boardRect.left - 36,
          y: event.clientY - boardRect.top - 38
        });
      } else if (!wasMoved) {
        addFoamLetter(item.upper);
      }

      drag = null;
    };

    button.addEventListener('pointerup', finishTrayDrag);
    button.addEventListener('pointercancel', event => {
      drag?.ghost?.remove();
      drag = null;
    });

    tray.appendChild(button);
  });
}

function clearFoamBoard() {
  const board = foamBoardElement();
  if (!board) return;
  board.querySelectorAll('.foam-board-piece').forEach(piece => piece.remove());
  foamBoardState.selectedId = null;
  updateFoamBoardMeta();
}

function scatterFoamPieces() {
  $$('.foam-board-piece').forEach(piece => {
    const pos = randomFoamPosition();
    const next = clampFoamPosition(pos.x, pos.y, piece.offsetWidth, piece.offsetHeight);
    piece.style.left = `${next.x}px`;
    piece.style.top = `${next.y}px`;
    piece.style.setProperty('--foam-rotation', `${Math.random() * 12 - 6}deg`);
  });
}

function alignFoamPieces() {
  const board = foamBoardElement();
  if (!board) return;

  const pieces = [...board.querySelectorAll('.foam-board-piece')];
  if (!pieces.length) return;

  const gap = 8;
  const pieceWidth = 70;
  const totalWidth = pieces.length * pieceWidth + (pieces.length - 1) * gap;
  let startX = Math.max(14, (board.clientWidth - totalWidth) / 2);
  const y = Math.max(36, board.clientHeight * 0.42);

  pieces.forEach((piece, index) => {
    const x = startX + index * (pieceWidth + gap);
    const next = clampFoamPosition(x, y, piece.offsetWidth, piece.offsetHeight);
    piece.style.left = `${next.x}px`;
    piece.style.top = `${next.y}px`;
    piece.style.setProperty('--foam-rotation', '0deg');
  });
}

function deleteSelectedFoamPiece() {
  if (!foamBoardState.selectedId) return;
  const piece = document.querySelector(`.foam-board-piece[data-piece-id="${foamBoardState.selectedId}"]`);
  piece?.remove();
  foamBoardState.selectedId = null;
  updateFoamBoardMeta();
}

function duplicateSelectedFoamPiece() {
  if (!foamBoardState.selectedId) return;
  const piece = document.querySelector(`.foam-board-piece[data-piece-id="${foamBoardState.selectedId}"]`);
  if (!piece) return;
  addFoamLetter(piece.dataset.letter, {
    x: parseFloat(piece.style.left || '20') + 24,
    y: parseFloat(piece.style.top || '20') + 24
  });
}

function updateFoamTargetDisplay() {
  const input = $('#foamTargetInput');
  const display = $('#foamTargetDisplay');
  const checkbox = $('#foamShowTarget');
  if (!input || !display || !checkbox) return;

  const word = input.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 14);
  input.value = word;
  display.querySelector('strong').textContent = word || '—';
  display.hidden = !checkbox.checked;
}

function scatterTargetWord() {
  const input = $('#foamTargetInput');
  if (!input) return;

  const word = input.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 14);
  input.value = word;
  if (!word) return;

  clearFoamBoard();
  [...word].forEach((letter, index) => {
    const board = foamBoardElement();
    const columns = Math.max(1, Math.min(word.length, 7));
    const col = index % columns;
    const row = Math.floor(index / columns);
    const baseX = 30 + col * Math.max(72, (board.clientWidth - 100) / columns);
    const baseY = 70 + row * 105;
    createFoamPiece(
      letter,
      baseX + (Math.random() * 38 - 19),
      baseY + (Math.random() * 45 - 22),
      { select: false }
    );
  });
  scatterFoamPieces();
  updateFoamTargetDisplay();
}

function updateFoamCaseMode() {
  foamBoardState.caseMode = $('#foamCaseMode')?.value || 'upper';
  renderFoamTray();
  $$('.foam-board-piece').forEach(piece => {
    piece.textContent = foamGlyph(piece.dataset.letter);
  });
}

function initFoamBoard() {
  if (!foamBoardElement()) return;

  renderFoamTray();
  updateFoamTargetDisplay();
  updateFoamBoardMeta();

  $('#foamCaseMode')?.addEventListener('change', updateFoamCaseMode);
  $('#foamClearBtn')?.addEventListener('click', clearFoamBoard);
  $('#foamAlignBtn')?.addEventListener('click', alignFoamPieces);
  $('#foamScatterBtn')?.addEventListener('click', scatterFoamPieces);
  $('#foamDeleteBtn')?.addEventListener('click', deleteSelectedFoamPiece);
  $('#foamDuplicateBtn')?.addEventListener('click', duplicateSelectedFoamPiece);
  $('#foamScatterWordBtn')?.addEventListener('click', scatterTargetWord);
  $('#foamTargetInput')?.addEventListener('input', updateFoamTargetDisplay);
  $('#foamTargetInput')?.addEventListener('keydown', event => {
    if (event.key === 'Enter') scatterTargetWord();
  });
  $('#foamShowTarget')?.addEventListener('change', updateFoamTargetDisplay);

  foamBoardElement().addEventListener('pointerdown', event => {
    if (event.target === foamBoardElement()) clearFoamSelection();
  });

  window.addEventListener('keydown', event => {
    if ((event.key === 'Delete' || event.key === 'Backspace') && foamBoardState.selectedId) {
      const tag = document.activeElement?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      deleteSelectedFoamPiece();
    }
  });

  // Start with a small physical-kit demonstration instead of a blank digital canvas.
  ['C', 'A', 'T'].forEach((letter, index) => {
    createFoamPiece(letter, 82 + index * 95, 120 + (index % 2) * 34, { select: false });
  });
}

initFoamBoard();
