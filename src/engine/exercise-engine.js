(function () {
  'use strict';

  const SUPPORTED_TYPES = new Set([
    'word-build',
    'letter-order',
    'missing-letter',
    'phoneme-match',
    'word-family',
    'sentence-build'
  ]);

  function shuffled(items) {
    const copy = [...items];
    for (let i = copy.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  }

  function normalizeToken(value) {
    return String(value ?? '').trim();
  }

  function arraysEqual(a, b) {
    return a.length === b.length && a.every((value, index) => value === b[index]);
  }

  function createId(prefix, index) {
    if (window.crypto?.randomUUID) return crypto.randomUUID();
    return `${prefix}-${index}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function speak(text) {
    if (!text || !('speechSynthesis' in window)) return;
    speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'en-US';
    utterance.rate = 0.82;
    speechSynthesis.speak(utterance);
  }

  class Manipulator {
    constructor(root, config) {
      this.root = root;
      this.answer = config.answer.map(normalizeToken);
      this.bankSeed = (config.bank?.length ? config.bank : config.answer).map(normalizeToken);
      this.onChange = config.onChange || (() => {});
      this.largeTokens = Boolean(config.largeTokens);
      this.state = {
        slots: Array(this.answer.length).fill(null),
        bank: [],
        selected: null,
        drag: null,
        ignoreClickUntil: 0
      };
      this.reset(true);
    }

    reset(first = false) {
      const items = this.bankSeed.map((token, index) => ({
        id: createId('token', index),
        token
      }));
      this.state.slots = Array(this.answer.length).fill(null);
      this.state.bank = first ? [...items] : shuffled(items);
      this.state.selected = null;
      this.render();
      this.onChange();
    }

    value() {
      return this.state.slots.map(item => item?.token || '');
    }

    isComplete() {
      return this.state.slots.every(Boolean);
    }

    isCorrect() {
      return arraysEqual(this.value(), this.answer);
    }

    originEquals(a, b) {
      if (!a || !b || a.kind !== b.kind) return false;
      if (a.kind === 'bank') return a.id === b.id;
      return a.index === b.index && a.id === b.id;
    }

    getAtOrigin(origin) {
      if (!origin) return null;
      if (origin.kind === 'bank') return this.state.bank.find(item => item.id === origin.id) || null;
      const item = this.state.slots[origin.index];
      return item?.id === origin.id ? item : null;
    }

    extract(origin) {
      if (origin.kind === 'bank') {
        const index = this.state.bank.findIndex(item => item.id === origin.id);
        if (index < 0) return null;
        return this.state.bank.splice(index, 1)[0];
      }

      const item = this.state.slots[origin.index];
      if (!item || item.id !== origin.id) return null;
      this.state.slots[origin.index] = null;
      return item;
    }

    putInBank(item) {
      if (!item) return;
      if (!this.state.bank.some(existing => existing.id === item.id)) this.state.bank.push(item);
    }

    move(origin, destination) {
      if (!origin || !destination) return;
      if (destination.kind === 'slot' && origin.kind === 'slot' && destination.index === origin.index) {
        this.state.selected = null;
        this.render();
        return;
      }

      const item = this.extract(origin);
      if (!item) {
        this.state.selected = null;
        this.render();
        return;
      }

      if (destination.kind === 'bank') {
        this.putInBank(item);
      } else {
        const displaced = this.state.slots[destination.index];
        this.state.slots[destination.index] = item;

        if (displaced) {
          if (origin.kind === 'slot' && this.state.slots[origin.index] === null) {
            this.state.slots[origin.index] = displaced;
          } else {
            this.putInBank(displaced);
          }
        }
      }

      this.state.selected = null;
      this.render();
      this.onChange();
    }

    select(origin) {
      if (performance.now() < this.state.ignoreClickUntil) return;

      if (!this.state.selected) {
        this.state.selected = origin;
        this.render();
        return;
      }

      if (this.originEquals(this.state.selected, origin)) {
        this.state.selected = null;
        this.render();
        return;
      }

      if (origin.kind === 'slot') {
        this.move(this.state.selected, { kind: 'slot', index: origin.index });
        return;
      }

      this.state.selected = origin;
      this.render();
    }

    dropTarget(element) {
      const zone = element?.closest?.('[data-engine-drop]');
      if (!zone || !this.root.contains(zone)) return null;
      if (zone.dataset.engineDrop === 'bank') return { kind: 'bank' };
      if (zone.dataset.engineDrop === 'slot') {
        return { kind: 'slot', index: Number(zone.dataset.slotIndex) };
      }
      return null;
    }

    clearDrag() {
      const drag = this.state.drag;
      if (!drag) return;
      drag.ghost?.remove();
      drag.hover?.classList.remove('drop-hover');
      document.body.classList.remove('is-dragging');
    }

    finishDrag(event, cancelled = false) {
      const drag = this.state.drag;
      if (!drag || drag.pointerId !== event.pointerId) return;

      let destination = null;
      if (drag.moved && !cancelled) {
        destination = this.dropTarget(document.elementFromPoint(event.clientX, event.clientY));
        this.state.ignoreClickUntil = performance.now() + 350;
      }

      this.clearDrag();
      this.state.drag = null;
      if (drag.moved && destination) this.move(drag.origin, destination);
    }

    attachDrag(button, origin, label) {
      button.addEventListener('pointerdown', event => {
        if (event.pointerType === 'mouse' && event.button !== 0) return;
        this.state.drag = {
          pointerId: event.pointerId,
          origin,
          label,
          startX: event.clientX,
          startY: event.clientY,
          moved: false,
          ghost: null,
          hover: null
        };
        button.setPointerCapture?.(event.pointerId);
      });

      button.addEventListener('pointermove', event => {
        const drag = this.state.drag;
        if (!drag || drag.pointerId !== event.pointerId) return;

        const distance = Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY);
        if (!drag.moved && distance < 7) return;

        if (!drag.moved) {
          drag.moved = true;
          drag.ghost = document.createElement('div');
          drag.ghost.className = `drag-ghost engine-drag-ghost${this.largeTokens ? ' is-wide' : ''}`;
          drag.ghost.textContent = label;
          document.body.appendChild(drag.ghost);
          document.body.classList.add('is-dragging');
        }

        event.preventDefault();
        drag.ghost.style.left = `${event.clientX}px`;
        drag.ghost.style.top = `${event.clientY}px`;

        const zone = document.elementFromPoint(event.clientX, event.clientY)?.closest?.('[data-engine-drop]') || null;
        if (zone !== drag.hover) {
          drag.hover?.classList.remove('drop-hover');
          if (zone && this.root.contains(zone)) zone.classList.add('drop-hover');
          drag.hover = zone && this.root.contains(zone) ? zone : null;
        }
      });

      button.addEventListener('pointerup', event => this.finishDrag(event));
      button.addEventListener('pointercancel', event => this.finishDrag(event, true));
    }

    tokenButton(item, origin) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `letter-tile engine-token${this.largeTokens ? ' is-wide' : ''}`;
      button.textContent = item.token;

      const selected = this.originEquals(this.state.selected, origin);
      button.classList.toggle('selected', selected);
      button.setAttribute('aria-pressed', String(selected));
      button.setAttribute('aria-label', `${selected ? 'Selected' : 'Select'} ${item.token}`);
      button.addEventListener('click', () => this.select(origin));
      this.attachDrag(button, origin, item.token);
      return button;
    }

    render() {
      this.root.innerHTML = '';

      const slots = document.createElement('div');
      slots.className = `engine-slots${this.largeTokens ? ' is-wide' : ''}`;

      this.state.slots.forEach((item, index) => {
        const slot = document.createElement('div');
        slot.className = `engine-slot${this.largeTokens ? ' is-wide' : ''}`;
        slot.dataset.engineDrop = 'slot';
        slot.dataset.slotIndex = String(index);
        slot.tabIndex = 0;
        slot.setAttribute('role', 'button');
        slot.setAttribute('aria-label', item ? `Position ${index + 1}: ${item.token}` : `Empty position ${index + 1}`);

        if (item) {
          slot.appendChild(this.tokenButton(item, { kind: 'slot', index, id: item.id }));
        } else {
          const marker = document.createElement('span');
          marker.className = 'slot-marker';
          marker.textContent = String(index + 1);
          slot.appendChild(marker);
        }

        slot.addEventListener('click', event => {
          if (event.target.closest('.engine-token') || !this.state.selected) return;
          this.move(this.state.selected, { kind: 'slot', index });
        });

        slot.addEventListener('keydown', event => {
          if (!this.state.selected || !['Enter', ' '].includes(event.key)) return;
          event.preventDefault();
          this.move(this.state.selected, { kind: 'slot', index });
        });

        slots.appendChild(slot);
      });

      const bankLabel = document.createElement('div');
      bankLabel.className = 'engine-bank-label';
      const selectedItem = this.getAtOrigin(this.state.selected);
      bankLabel.innerHTML = `<span>Bank</span><span>${selectedItem ? `Selected: ${selectedItem.token}` : 'Drag or tap'}</span>`;

      const bank = document.createElement('div');
      bank.className = 'engine-bank';
      bank.dataset.engineDrop = 'bank';
      this.state.bank.forEach(item => {
        bank.appendChild(this.tokenButton(item, { kind: 'bank', id: item.id }));
      });

      bank.addEventListener('click', event => {
        if (event.target.closest('.engine-token') || !this.state.selected) return;
        this.move(this.state.selected, { kind: 'bank' });
      });

      this.root.append(slots, bankLabel, bank);
    }
  }

  class ExerciseEngine {
    constructor(options) {
      this.root = options.root;
      this.data = options.data;
      this.onSolved = options.onSolved || (() => {});
      this.setIndex = 0;
      this.exerciseIndex = 0;
      this.solved = new Set(JSON.parse(localStorage.getItem('englishLab.engineSolved') || '[]'));
      this.manipulator = null;
      this.validateData();
    }

    validateData() {
      if (!this.data?.sets?.length) throw new Error('Exercise data must contain at least one set.');
      this.data.sets.forEach(set => {
        if (!set.id || !Array.isArray(set.exercises)) throw new Error('Invalid exercise set.');
        set.exercises.forEach(exercise => {
          if (!exercise.id || !SUPPORTED_TYPES.has(exercise.type)) {
            throw new Error(`Unsupported or invalid exercise: ${exercise.id || 'unknown'}`);
          }
        });
      });
    }

    currentSet() {
      return this.data.sets[this.setIndex];
    }

    currentExercise() {
      return this.currentSet().exercises[this.exerciseIndex];
    }

    totalExercises() {
      return this.currentSet().exercises.length;
    }

    persistSolved() {
      localStorage.setItem('englishLab.engineSolved', JSON.stringify([...this.solved]));
    }

    markSolved(exercise) {
      if (this.solved.has(exercise.id)) return false;
      this.solved.add(exercise.id);
      this.persistSolved();
      this.onSolved(exercise);
      return true;
    }

    setSet(index) {
      this.setIndex = Math.max(0, Math.min(index, this.data.sets.length - 1));
      this.exerciseIndex = 0;
      this.render();
    }

    next() {
      const count = this.totalExercises();
      this.exerciseIndex = (this.exerciseIndex + 1) % count;
      this.render();
    }

    previous() {
      const count = this.totalExercises();
      this.exerciseIndex = (this.exerciseIndex - 1 + count) % count;
      this.render();
    }

    renderShell(exercise) {
      const set = this.currentSet();
      const solvedCount = set.exercises.filter(item => this.solved.has(item.id)).length;

      this.root.innerHTML = `
        <div class="engine-toolbar">
          <label class="compact-control">Lesson
            <select id="engineSetSelect">
              ${this.data.sets.map((item, index) => `
                <option value="${index}" ${index === this.setIndex ? 'selected' : ''}>${item.title}</option>
              `).join('')}
            </select>
          </label>
          <span class="engine-counter">${this.exerciseIndex + 1} / ${this.totalExercises()}</span>
        </div>

        <div class="engine-set-meta">
          <strong>${set.title}</strong>
          <span>${set.description || ''}</span>
          <span>${solvedCount}/${set.exercises.length} solved</span>
        </div>

        <article class="engine-card">
          <div class="engine-card-top">
            <div>
              <p class="eyebrow">${exercise.type.replaceAll('-', ' ')}</p>
              <h3>${exercise.title || 'Exercise'}</h3>
              <p class="engine-instruction">${exercise.instruction || ''}</p>
            </div>
            ${exercise.audio ? '<button id="engineAudioBtn" class="round-btn" aria-label="Hear prompt">🔊</button>' : ''}
          </div>

          <div id="enginePrompt" class="engine-prompt"></div>
          <div id="engineInteraction"></div>

          <div class="engine-feedback-row">
            <p id="engineFeedback" class="feedback" aria-live="polite"></p>
          </div>

          <div class="engine-actions">
            <button id="enginePrevBtn" class="secondary-btn">Previous</button>
            <button id="engineResetBtn" class="secondary-btn">Reset</button>
            <button id="engineCheckBtn" class="primary-btn">Check</button>
            <button id="engineNextBtn" class="secondary-btn">Next</button>
          </div>
        </article>
      `;

      this.root.querySelector('#engineSetSelect').addEventListener('change', event => this.setSet(Number(event.target.value)));
      this.root.querySelector('#enginePrevBtn').addEventListener('click', () => this.previous());
      this.root.querySelector('#engineNextBtn').addEventListener('click', () => this.next());
      this.root.querySelector('#engineAudioBtn')?.addEventListener('click', () => speak(exercise.audio));
    }

    renderPrompt(exercise) {
      const prompt = this.root.querySelector('#enginePrompt');
      const parts = [];

      if (exercise.emoji) parts.push(`<span class="engine-emoji" aria-hidden="true">${exercise.emoji}</span>`);
      if (exercise.display) parts.push(`<strong class="engine-display">${exercise.display}</strong>`);
      if (exercise.clue) parts.push(`<span class="engine-clue">${exercise.clue}</span>`);
      if (exercise.examples?.length) parts.push(`<span class="engine-examples">Examples: ${exercise.examples.join(', ')}</span>`);

      prompt.innerHTML = parts.join('');
    }

    renderManipulator(exercise) {
      const host = this.root.querySelector('#engineInteraction');
      this.manipulator = new Manipulator(host, {
        answer: exercise.answer,
        bank: exercise.bank,
        largeTokens: exercise.type === 'sentence-build',
        onChange: () => this.setFeedback('', '')
      });
    }

    renderChoices(exercise) {
      const host = this.root.querySelector('#engineInteraction');
      host.innerHTML = '<div class="engine-choice-grid"></div>';
      const wrap = host.querySelector('.engine-choice-grid');

      exercise.choices.forEach(choice => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'engine-choice';
        button.textContent = choice;
        button.dataset.value = choice;
        button.addEventListener('click', () => {
          wrap.querySelectorAll('.engine-choice').forEach(item => item.classList.remove('selected'));
          button.classList.add('selected');
          button.setAttribute('aria-pressed', 'true');
          this.setFeedback('', '');
        });
        wrap.appendChild(button);
      });
    }

    selectedChoice() {
      return this.root.querySelector('.engine-choice.selected')?.dataset.value || null;
    }

    setFeedback(message, type) {
      const feedback = this.root.querySelector('#engineFeedback');
      if (!feedback) return;
      feedback.textContent = message;
      feedback.className = `feedback${type ? ` ${type}` : ''}`;
    }

    check() {
      const exercise = this.currentExercise();
      let correct = false;
      let incomplete = false;

      if (Array.isArray(exercise.answer)) {
        incomplete = !this.manipulator?.isComplete();
        correct = this.manipulator?.isCorrect() || false;
      } else {
        const selected = this.selectedChoice();
        incomplete = !selected;
        correct = selected === String(exercise.answer);
      }

      if (incomplete) {
        this.setFeedback('Complete the exercise first.', 'bad');
        return;
      }

      if (!correct) {
        this.setFeedback('Not yet. Try again.', 'bad');
        return;
      }

      this.markSolved(exercise);
      this.setFeedback('Correct! Great work.', 'good');
      if (exercise.audio) speak(exercise.audio);
    }

    reset() {
      const exercise = this.currentExercise();
      this.setFeedback('', '');
      if (Array.isArray(exercise.answer)) {
        this.manipulator?.reset();
      } else {
        this.root.querySelectorAll('.engine-choice').forEach(button => {
          button.classList.remove('selected', 'correct', 'wrong');
          button.setAttribute('aria-pressed', 'false');
        });
      }
    }

    render() {
      const exercise = this.currentExercise();
      this.manipulator = null;
      this.renderShell(exercise);
      this.renderPrompt(exercise);

      if (Array.isArray(exercise.answer)) this.renderManipulator(exercise);
      else this.renderChoices(exercise);

      this.root.querySelector('#engineCheckBtn').addEventListener('click', () => this.check());
      this.root.querySelector('#engineResetBtn').addEventListener('click', () => this.reset());

      if (this.solved.has(exercise.id)) {
        this.setFeedback('Completed previously.', 'good');
      }
    }
  }

  window.EnglishExerciseEngine = ExerciseEngine;
})();
