(function () {
  'use strict';

  const SUPPORTED_TYPES = new Set([
    'letter-intro',
    'letter-recognition',
    'case-match',
    'beginning-sound',
    'word-build',
    'letter-order',
    'missing-letter',
    'phoneme-match',
    'word-family',
    'sentence-build'
  ]);

  const INFO_TYPES = new Set(['letter-intro']);

  const STORAGE_KEY = 'englishLab.curriculumProgress.v1';

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

  function safeJsonParse(value, fallback) {
    try {
      const parsed = JSON.parse(value);
      return parsed ?? fallback;
    } catch {
      return fallback;
    }
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
      if (origin.kind === 'bank') {
        return this.state.bank.find(item => item.id === origin.id) || null;
      }
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
      if (!this.state.bank.some(existing => existing.id === item.id)) {
        this.state.bank.push(item);
      }
    }

    move(origin, destination) {
      if (!origin || !destination) return;

      if (
        destination.kind === 'slot' &&
        origin.kind === 'slot' &&
        destination.index === origin.index
      ) {
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
        return {
          kind: 'slot',
          index: Number(zone.dataset.slotIndex)
        };
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
        destination = this.dropTarget(
          document.elementFromPoint(event.clientX, event.clientY)
        );
        this.state.ignoreClickUntil = performance.now() + 350;
      }

      this.clearDrag();
      this.state.drag = null;

      if (drag.moved && destination) {
        this.move(drag.origin, destination);
      }
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

        const distance = Math.hypot(
          event.clientX - drag.startX,
          event.clientY - drag.startY
        );
        if (!drag.moved && distance < 7) return;

        if (!drag.moved) {
          drag.moved = true;
          drag.ghost = document.createElement('div');
          drag.ghost.className =
            `drag-ghost engine-drag-ghost${this.largeTokens ? ' is-wide' : ''}`;
          drag.ghost.textContent = label;
          document.body.appendChild(drag.ghost);
          document.body.classList.add('is-dragging');
        }

        event.preventDefault();
        drag.ghost.style.left = `${event.clientX}px`;
        drag.ghost.style.top = `${event.clientY}px`;

        const zone =
          document.elementFromPoint(event.clientX, event.clientY)
            ?.closest?.('[data-engine-drop]') || null;

        if (zone !== drag.hover) {
          drag.hover?.classList.remove('drop-hover');
          if (zone && this.root.contains(zone)) {
            zone.classList.add('drop-hover');
          }
          drag.hover = zone && this.root.contains(zone) ? zone : null;
        }
      });

      button.addEventListener('pointerup', event => this.finishDrag(event));
      button.addEventListener('pointercancel', event =>
        this.finishDrag(event, true)
      );
    }

    tokenButton(item, origin) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className =
        `letter-tile engine-token${this.largeTokens ? ' is-wide' : ''}`;
      button.textContent = item.token;

      const selected = this.originEquals(this.state.selected, origin);
      button.classList.toggle('selected', selected);
      button.setAttribute('aria-pressed', String(selected));
      button.setAttribute(
        'aria-label',
        `${selected ? 'Selected' : 'Select'} ${item.token}`
      );

      button.addEventListener('click', () => this.select(origin));
      this.attachDrag(button, origin, item.token);
      return button;
    }

    render() {
      this.root.innerHTML = '';

      const slots = document.createElement('div');
      slots.className =
        `engine-slots${this.largeTokens ? ' is-wide' : ''}`;

      this.state.slots.forEach((item, index) => {
        const slot = document.createElement('div');
        slot.className =
          `engine-slot${this.largeTokens ? ' is-wide' : ''}`;
        slot.dataset.engineDrop = 'slot';
        slot.dataset.slotIndex = String(index);
        slot.tabIndex = 0;
        slot.setAttribute('role', 'button');
        slot.setAttribute(
          'aria-label',
          item
            ? `Position ${index + 1}: ${item.token}`
            : `Empty position ${index + 1}`
        );

        if (item) {
          slot.appendChild(
            this.tokenButton(item, {
              kind: 'slot',
              index,
              id: item.id
            })
          );
        } else {
          const marker = document.createElement('span');
          marker.className = 'slot-marker';
          marker.textContent = String(index + 1);
          slot.appendChild(marker);
        }

        slot.addEventListener('click', event => {
          if (event.target.closest('.engine-token') || !this.state.selected) {
            return;
          }
          this.move(this.state.selected, { kind: 'slot', index });
        });

        slot.addEventListener('keydown', event => {
          if (
            !this.state.selected ||
            !['Enter', ' '].includes(event.key)
          ) {
            return;
          }
          event.preventDefault();
          this.move(this.state.selected, { kind: 'slot', index });
        });

        slots.appendChild(slot);
      });

      const bankLabel = document.createElement('div');
      bankLabel.className = 'engine-bank-label';
      const selectedItem = this.getAtOrigin(this.state.selected);
      bankLabel.innerHTML = `
        <span>Bank</span>
        <span>${
          selectedItem
            ? `Selected: ${selectedItem.token}`
            : 'Drag or tap'
        }</span>
      `;

      const bank = document.createElement('div');
      bank.className = 'engine-bank';
      bank.dataset.engineDrop = 'bank';

      this.state.bank.forEach(item => {
        bank.appendChild(
          this.tokenButton(item, {
            kind: 'bank',
            id: item.id
          })
        );
      });

      bank.addEventListener('click', event => {
        if (event.target.closest('.engine-token') || !this.state.selected) {
          return;
        }
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
      this.manipulator = null;
      this.progress = this.loadProgress();
      this.location = {
        level: 0,
        unit: 0,
        lesson: 0,
        activity: 0,
        exercise: 0
      };

      this.validateData();
      this.restoreLocation();
    }

    loadProgress() {
      const fallback = {
        solved: [],
        attempts: {},
        lastLocation: null,
        lastIds: null
      };

      const stored = safeJsonParse(
        localStorage.getItem(STORAGE_KEY),
        fallback
      );

      return {
        solved: Array.isArray(stored.solved) ? stored.solved : [],
        attempts:
          stored.attempts && typeof stored.attempts === 'object'
            ? stored.attempts
            : {},
        lastLocation:
          stored.lastLocation &&
          typeof stored.lastLocation === 'object'
            ? stored.lastLocation
            : null,
        lastIds:
          stored.lastIds &&
          typeof stored.lastIds === 'object'
            ? stored.lastIds
            : null
      };
    }

    locationIds(location = this.location) {
      const level = this.data.levels[location.level];
      const unit = level?.units?.[location.unit];
      const lesson = unit?.lessons?.[location.lesson];
      const activity = lesson?.activities?.[location.activity];
      const exercise = activity?.exercises?.[location.exercise];
      if (!level || !unit || !lesson || !activity || !exercise) return null;
      return {
        levelId: level.id,
        unitId: unit.id,
        lessonId: lesson.id,
        activityId: activity.id,
        exerciseId: exercise.id
      };
    }

    locationFromIds(ids) {
      if (!ids) return null;
      const level = this.data.levels.findIndex(item => item.id === ids.levelId);
      if (level < 0) return null;
      const unit = this.data.levels[level].units.findIndex(item => item.id === ids.unitId);
      if (unit < 0) return null;
      const lesson = this.data.levels[level].units[unit].lessons.findIndex(item => item.id === ids.lessonId);
      if (lesson < 0) return null;
      const activity = this.data.levels[level].units[unit].lessons[lesson].activities.findIndex(item => item.id === ids.activityId);
      if (activity < 0) return null;
      const exercise = this.data.levels[level].units[unit].lessons[lesson].activities[activity].exercises.findIndex(item => item.id === ids.exerciseId);
      if (exercise < 0) return null;
      return { level, unit, lesson, activity, exercise };
    }

    saveProgress() {
      this.progress.lastLocation = { ...this.location };
      this.progress.lastIds = this.locationIds();
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.progress));
    }

    solvedSet() {
      return new Set(this.progress.solved);
    }

    validateData() {
      if (!Array.isArray(this.data?.levels) || !this.data.levels.length) {
        throw new Error('Curriculum must contain at least one level.');
      }

      const seenExerciseIds = new Set();

      this.data.levels.forEach(level => {
        if (!level.id || !Array.isArray(level.units) || !level.units.length) {
          throw new Error('Invalid level in curriculum.');
        }

        level.units.forEach(unit => {
          if (!unit.id || !Array.isArray(unit.lessons) || !unit.lessons.length) {
            throw new Error(`Invalid unit: ${unit.id || 'unknown'}`);
          }

          unit.lessons.forEach(lesson => {
            if (
              !lesson.id ||
              !Array.isArray(lesson.activities) ||
              !lesson.activities.length
            ) {
              throw new Error(`Invalid lesson: ${lesson.id || 'unknown'}`);
            }

            lesson.activities.forEach(activity => {
              if (
                !activity.id ||
                !Array.isArray(activity.exercises) ||
                !activity.exercises.length
              ) {
                throw new Error(
                  `Invalid activity: ${activity.id || 'unknown'}`
                );
              }

              activity.exercises.forEach(exercise => {
                if (
                  !exercise.id ||
                  !SUPPORTED_TYPES.has(exercise.type)
                ) {
                  throw new Error(
                    `Unsupported or invalid exercise: ${exercise.id || 'unknown'}`
                  );
                }

                if (seenExerciseIds.has(exercise.id)) {
                  throw new Error(
                    `Duplicate exercise id: ${exercise.id}`
                  );
                }
                seenExerciseIds.add(exercise.id);
              });
            });
          });
        });
      });
    }

    restoreLocation() {
      const byIds = this.locationFromIds(this.progress.lastIds);
      if (byIds && this.locationExists(byIds)) {
        const lessonRef = this.lessonRefFromLocation(byIds);
        if (lessonRef && this.isLessonUnlockedById(lessonRef.lesson.id)) {
          this.location = byIds;
          return;
        }
      }

      const saved = this.progress.lastLocation;
      if (!saved) return;

      let candidate = {
        level: Number(saved.level) || 0,
        unit: Number(saved.unit) || 0,
        lesson: Number(saved.lesson) || 0,
        activity: Number(saved.activity) || 0,
        exercise: Number(saved.exercise) || 0
      };

      // v1 progress stored only numeric indexes when the legacy Foundations
      // level was the first/only level. Remap that location after inserting
      // Alphabet Foundations ahead of it.
      if (!this.progress.lastIds && Number(saved.level) === 0) {
        const legacyLevel = this.data.levels.findIndex(
          level => level.id === 'level-1-foundations'
        );
        if (legacyLevel > 0) candidate = { ...candidate, level: legacyLevel };
      }

      if (this.locationExists(candidate)) {
        const lessonRef = this.lessonRefFromLocation(candidate);
        if (lessonRef && this.isLessonUnlockedById(lessonRef.lesson.id)) {
          this.location = candidate;
        }
      }
    }

    locationExists(location) {
      const level = this.data.levels[location.level];
      const unit = level?.units?.[location.unit];
      const lesson = unit?.lessons?.[location.lesson];
      const activity = lesson?.activities?.[location.activity];
      const exercise = activity?.exercises?.[location.exercise];
      return Boolean(level && unit && lesson && activity && exercise);
    }

    currentLevel() {
      return this.data.levels[this.location.level];
    }

    currentUnit() {
      return this.currentLevel().units[this.location.unit];
    }

    currentLesson() {
      return this.currentUnit().lessons[this.location.lesson];
    }

    currentActivity() {
      return this.currentLesson().activities[this.location.activity];
    }

    currentExercise() {
      return this.currentActivity().exercises[this.location.exercise];
    }

    allLessonRefs() {
      const refs = [];

      this.data.levels.forEach((level, levelIndex) => {
        level.units.forEach((unit, unitIndex) => {
          unit.lessons.forEach((lesson, lessonIndex) => {
            refs.push({
              level,
              unit,
              lesson,
              levelIndex,
              unitIndex,
              lessonIndex
            });
          });
        });
      });

      return refs;
    }

    lessonRefFromLocation(location = this.location) {
      const level = this.data.levels[location.level];
      const unit = level?.units?.[location.unit];
      const lesson = unit?.lessons?.[location.lesson];

      if (!level || !unit || !lesson) return null;

      return {
        level,
        unit,
        lesson,
        levelIndex: location.level,
        unitIndex: location.unit,
        lessonIndex: location.lesson
      };
    }

    lessonExerciseIds(lesson) {
      return lesson.activities.flatMap(activity =>
        activity.exercises.map(exercise => exercise.id)
      );
    }

    isLessonComplete(lesson) {
      const solved = this.solvedSet();
      const ids = this.lessonExerciseIds(lesson);
      return ids.length > 0 && ids.every(id => solved.has(id));
    }

    lessonProgress(lesson) {
      const solved = this.solvedSet();
      const ids = this.lessonExerciseIds(lesson);
      const completed = ids.filter(id => solved.has(id)).length;
      return {
        completed,
        total: ids.length,
        percent: ids.length
          ? Math.round((completed / ids.length) * 100)
          : 0
      };
    }

    isLessonUnlockedById(lessonId) {
      const refs = this.allLessonRefs();
      const index = refs.findIndex(ref => ref.lesson.id === lessonId);
      if (index < 0) return false;

      const lesson = refs[index].lesson;
      const progress = this.lessonProgress(lesson);

      // Never relock work a learner already started before a curriculum update.
      if (progress.completed > 0) return true;

      const prerequisites = Array.isArray(lesson.prerequisites)
        ? lesson.prerequisites.filter(Boolean)
        : [];

      if (prerequisites.length) {
        return prerequisites.every(id => {
          const required = refs.find(ref => ref.lesson.id === id)?.lesson;
          return required ? this.isLessonComplete(required) : false;
        });
      }

      if (index === 0) return true;
      return this.isLessonComplete(refs[index - 1].lesson);
    }

    nextLessonRef() {
      const refs = this.allLessonRefs();
      const currentId = this.currentLesson().id;
      const index = refs.findIndex(ref => ref.lesson.id === currentId);
      return refs[index + 1] || null;
    }

    previousLessonRef() {
      const refs = this.allLessonRefs();
      const currentId = this.currentLesson().id;
      const index = refs.findIndex(ref => ref.lesson.id === currentId);
      return index > 0 ? refs[index - 1] : null;
    }

    lessonSequence(lesson = this.currentLesson()) {
      return lesson.activities.flatMap((activity, activityIndex) =>
        activity.exercises.map((exercise, exerciseIndex) => ({
          activity,
          exercise,
          activityIndex,
          exerciseIndex
        }))
      );
    }

    currentSequenceIndex() {
      const sequence = this.lessonSequence();
      return sequence.findIndex(
        item =>
          item.activityIndex === this.location.activity &&
          item.exerciseIndex === this.location.exercise
      );
    }

    setLocation(next, shouldRender = true) {
      this.location = { ...this.location, ...next };
      this.saveProgress();
      if (shouldRender) this.render();
    }

    goToLesson(ref) {
      if (!ref || !this.isLessonUnlockedById(ref.lesson.id)) return;

      this.location = {
        level: ref.levelIndex,
        unit: ref.unitIndex,
        lesson: ref.lessonIndex,
        activity: 0,
        exercise: 0
      };
      this.saveProgress();
      this.render();
    }

    chooseLevel(levelIndex) {
      const level = this.data.levels[levelIndex];
      if (!level) return;

      const candidateRefs = this.allLessonRefs().filter(
        ref => ref.levelIndex === levelIndex
      );
      const target =
        candidateRefs.find(ref =>
          this.isLessonUnlockedById(ref.lesson.id)
        ) || candidateRefs[0];

      if (target) this.goToLesson(target);
    }

    chooseUnit(unitIndex) {
      const level = this.currentLevel();
      const unit = level.units[unitIndex];
      if (!unit) return;

      const refs = this.allLessonRefs().filter(
        ref =>
          ref.levelIndex === this.location.level &&
          ref.unitIndex === unitIndex
      );

      const target =
        refs.find(ref => this.isLessonUnlockedById(ref.lesson.id)) ||
        refs[0];

      if (target && this.isLessonUnlockedById(target.lesson.id)) {
        this.goToLesson(target);
      } else {
        this.render();
      }
    }

    next() {
      const sequence = this.lessonSequence();
      const index = this.currentSequenceIndex();

      if (index >= 0 && index < sequence.length - 1) {
        const next = sequence[index + 1];
        this.setLocation({
          activity: next.activityIndex,
          exercise: next.exerciseIndex
        });
        return;
      }

      if (!this.isLessonComplete(this.currentLesson())) {
        this.setFeedback(
          'Complete all exercises in this lesson before moving on.',
          'bad'
        );
        return;
      }

      const nextLesson = this.nextLessonRef();
      if (nextLesson && this.isLessonUnlockedById(nextLesson.lesson.id)) {
        this.goToLesson(nextLesson);
        return;
      }

      this.setFeedback('Lesson complete. Great work!', 'good');
    }

    previous() {
      const sequence = this.lessonSequence();
      const index = this.currentSequenceIndex();

      if (index > 0) {
        const previous = sequence[index - 1];
        this.setLocation({
          activity: previous.activityIndex,
          exercise: previous.exerciseIndex
        });
        return;
      }

      const previousLesson = this.previousLessonRef();
      if (!previousLesson) return;

      const previousSequence = this.lessonSequence(previousLesson.lesson);
      const last = previousSequence[previousSequence.length - 1];

      this.location = {
        level: previousLesson.levelIndex,
        unit: previousLesson.unitIndex,
        lesson: previousLesson.lessonIndex,
        activity: last.activityIndex,
        exercise: last.exerciseIndex
      };
      this.saveProgress();
      this.render();
    }

    incrementAttempt(exerciseId) {
      this.progress.attempts[exerciseId] =
        Number(this.progress.attempts[exerciseId] || 0) + 1;
      this.saveProgress();
    }

    markSolved(exercise) {
      if (this.progress.solved.includes(exercise.id)) return false;
      this.progress.solved.push(exercise.id);
      this.saveProgress();
      this.onSolved(exercise);
      return true;
    }

    overallProgress() {
      const all = this.data.levels.flatMap(level =>
        level.units.flatMap(unit =>
          unit.lessons.flatMap(lesson =>
            lesson.activities.flatMap(activity =>
              activity.exercises.map(exercise => exercise.id)
            )
          )
        )
      );

      const solved = this.solvedSet();
      const completed = all.filter(id => solved.has(id)).length;

      return {
        completed,
        total: all.length,
        percent: all.length
          ? Math.round((completed / all.length) * 100)
          : 0
      };
    }

    renderCurriculumHeader() {
      const level = this.currentLevel();
      const unit = this.currentUnit();
      const overall = this.overallProgress();

      return `
        <div class="curriculum-toolbar">
          <label class="compact-control curriculum-control">
            Level
            <select id="engineLevelSelect">
              ${this.data.levels
                .map(
                  (item, index) => `
                    <option value="${index}" ${
                      index === this.location.level ? 'selected' : ''
                    }>${item.title}</option>
                  `
                )
                .join('')}
            </select>
          </label>

          <label class="compact-control curriculum-control">
            Unit
            <select id="engineUnitSelect">
              ${level.units
                .map(
                  (item, index) => `
                    <option value="${index}" ${
                      index === this.location.unit ? 'selected' : ''
                    }>${item.title}</option>
                  `
                )
                .join('')}
            </select>
          </label>

          <div class="curriculum-overall" aria-label="Overall curriculum progress">
            <span>${overall.completed}/${overall.total} complete</span>
            <div class="curriculum-progress-track">
              <span style="width:${overall.percent}%"></span>
            </div>
          </div>
        </div>

        <div class="curriculum-context">
          <div>
            <p class="eyebrow">${level.title}</p>
            <h3>${unit.title}</h3>
            <p>${unit.description || level.description || ''}</p>
          </div>
        </div>
      `;
    }

    renderLessonRail() {
      const unit = this.currentUnit();

      return `
        <div class="lesson-rail" aria-label="Lessons">
          ${unit.lessons
            .map((lesson, lessonIndex) => {
              const progress = this.lessonProgress(lesson);
              const unlocked = this.isLessonUnlockedById(lesson.id);
              const active = lessonIndex === this.location.lesson;
              const complete = this.isLessonComplete(lesson);

              return `
                <button
                  type="button"
                  class="lesson-chip
                    ${active ? 'is-active' : ''}
                    ${complete ? 'is-complete' : ''}
                    ${!unlocked ? 'is-locked' : ''}"
                  data-lesson-index="${lessonIndex}"
                  ${!unlocked ? 'disabled' : ''}
                >
                  <span class="lesson-chip-status">
                    ${complete ? '✓' : unlocked ? progress.completed + '/' + progress.total : '🔒'}
                  </span>
                  <span>
                    <strong>${lesson.title}</strong>
                    <small>${lesson.objective || ''}</small>
                  </span>
                </button>
              `;
            })
            .join('')}
        </div>
      `;
    }

    renderActivityStepper() {
      const lesson = this.currentLesson();
      const solved = this.solvedSet();

      return `
        <div class="activity-stepper" aria-label="Lesson activities">
          ${lesson.activities
            .map((activity, activityIndex) => {
              const ids = activity.exercises.map(exercise => exercise.id);
              const completed = ids.filter(id => solved.has(id)).length;
              const active = activityIndex === this.location.activity;

              return `
                <button
                  type="button"
                  class="activity-step ${active ? 'is-active' : ''}"
                  data-activity-index="${activityIndex}"
                >
                  <span>${activityIndex + 1}</span>
                  <strong>${activity.title}</strong>
                  <small>${completed}/${ids.length}</small>
                </button>
              `;
            })
            .join('')}
        </div>
      `;
    }

    renderShell(exercise) {
      const lesson = this.currentLesson();
      const activity = this.currentActivity();
      const lessonProgress = this.lessonProgress(lesson);
      const sequence = this.lessonSequence();
      const currentIndex = this.currentSequenceIndex();

      this.root.innerHTML = `
        ${this.renderCurriculumHeader()}
        ${this.renderLessonRail()}

        <section class="lesson-workspace">
          <div class="lesson-workspace-head">
            <div>
              <p class="eyebrow">Current lesson</p>
              <h3>${lesson.title}</h3>
              <p>${lesson.objective || ''}</p>
            </div>

            <div class="lesson-progress-box">
              <span>${lessonProgress.percent}%</span>
              <small>${lessonProgress.completed}/${lessonProgress.total} exercises</small>
            </div>
          </div>

          ${this.renderActivityStepper()}

          <article class="engine-card">
            <div class="exercise-meta-row">
              <span>Activity: ${activity.title}</span>
              <span>Exercise ${currentIndex + 1} of ${sequence.length}</span>
            </div>

            <div class="engine-card-top">
              <div>
                <p class="eyebrow">${exercise.type.replaceAll('-', ' ')}</p>
                <h3>${exercise.title || 'Exercise'}</h3>
                <p class="engine-instruction">${exercise.instruction || ''}</p>
              </div>
              ${
                exercise.audio
                  ? '<button id="engineAudioBtn" class="round-btn" aria-label="Hear prompt">🔊</button>'
                  : ''
              }
            </div>

            <div id="enginePrompt" class="engine-prompt"></div>
            <div id="engineInteraction"></div>

            <div class="engine-feedback-row">
              <p id="engineFeedback" class="feedback" aria-live="polite"></p>
            </div>

            <div class="engine-actions">
              <button id="enginePrevBtn" class="secondary-btn">Previous</button>
              <button id="engineResetBtn" class="secondary-btn" ${INFO_TYPES.has(exercise.type) ? 'hidden' : ''}>Reset</button>
              <button id="engineCheckBtn" class="primary-btn">${INFO_TYPES.has(exercise.type) ? 'I’m ready ✓' : 'Check'}</button>
              <button id="engineNextBtn" class="secondary-btn">Next</button>
            </div>
          </article>
        </section>
      `;

      this.root
        .querySelector('#engineLevelSelect')
        .addEventListener('change', event =>
          this.chooseLevel(Number(event.target.value))
        );

      this.root
        .querySelector('#engineUnitSelect')
        .addEventListener('change', event =>
          this.chooseUnit(Number(event.target.value))
        );

      this.root
        .querySelectorAll('.lesson-chip:not(:disabled)')
        .forEach(button => {
          button.addEventListener('click', () => {
            const lessonIndex = Number(button.dataset.lessonIndex);
            const ref = this.allLessonRefs().find(
              item =>
                item.levelIndex === this.location.level &&
                item.unitIndex === this.location.unit &&
                item.lessonIndex === lessonIndex
            );
            this.goToLesson(ref);
          });
        });

      this.root.querySelectorAll('.activity-step').forEach(button => {
        button.addEventListener('click', () => {
          const activityIndex = Number(button.dataset.activityIndex);
          const activity = this.currentLesson().activities[activityIndex];
          if (!activity) return;

          this.setLocation({
            activity: activityIndex,
            exercise: 0
          });
        });
      });

      this.root
        .querySelector('#enginePrevBtn')
        .addEventListener('click', () => this.previous());

      this.root
        .querySelector('#engineNextBtn')
        .addEventListener('click', () => this.next());

      this.root
        .querySelector('#engineAudioBtn')
        ?.addEventListener('click', () => speak(exercise.audio));
    }

    renderPrompt(exercise) {
      const prompt = this.root.querySelector('#enginePrompt');
      const parts = [];

      if (exercise.emoji) {
        parts.push(
          `<span class="engine-emoji" aria-hidden="true">${exercise.emoji}</span>`
        );
      }

      if (exercise.display) {
        parts.push(
          `<strong class="engine-display">${exercise.display}</strong>`
        );
      }

      if (exercise.clue) {
        parts.push(
          `<span class="engine-clue">${exercise.clue}</span>`
        );
      }

      if (exercise.examples?.length) {
        parts.push(
          `<span class="engine-examples">Examples: ${exercise.examples.join(', ')}</span>`
        );
      }

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

    renderLetterIntro(exercise) {
      const host = this.root.querySelector('#engineInteraction');
      const upper = String(exercise.uppercase || '').slice(0, 4);
      const lower = String(exercise.lowercase || '').slice(0, 4);
      const letterName = String(exercise.letterName || upper);
      const sound = String(exercise.sound || '');
      const keyword = String(exercise.keyword || '');
      const emoji = String(exercise.emoji || '');

      host.innerHTML = `
        <div class="alphabet-intro-card">
          <div class="alphabet-letter-pair" aria-label="Uppercase ${upper} and lowercase ${lower}">
            <span class="alphabet-upper">${upper}</span>
            <span class="alphabet-lower">${lower}</span>
          </div>
          <div class="alphabet-intro-facts">
            <span><small>Letter name</small><strong>${letterName}</strong></span>
            ${sound ? `<span><small>Sound</small><strong>${sound}</strong></span>` : ''}
            ${keyword ? `<span><small>Example</small><strong>${emoji ? emoji + ' ' : ''}${keyword}</strong></span>` : ''}
          </div>
          <div class="alphabet-intro-audio">
            <button type="button" class="secondary-btn" data-letter-speak="name">🔤 Hear ${letterName}</button>
            ${keyword ? `<button type="button" class="secondary-btn" data-letter-speak="example">🔊 Hear ${keyword}</button>` : ''}
          </div>
        </div>
      `;

      host.querySelector('[data-letter-speak="name"]')
        ?.addEventListener('click', () => speak(exercise.nameAudio || letterName));
      host.querySelector('[data-letter-speak="example"]')
        ?.addEventListener('click', () => speak(exercise.soundAudio || keyword));
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
        button.setAttribute('aria-pressed', 'false');

        button.addEventListener('click', () => {
          wrap.querySelectorAll('.engine-choice').forEach(item => {
            item.classList.remove('selected');
            item.setAttribute('aria-pressed', 'false');
          });

          button.classList.add('selected');
          button.setAttribute('aria-pressed', 'true');
          this.setFeedback('', '');
        });

        wrap.appendChild(button);
      });
    }

    selectedChoice() {
      return (
        this.root.querySelector('.engine-choice.selected')?.dataset.value ||
        null
      );
    }

    setFeedback(message, type) {
      const feedback = this.root.querySelector('#engineFeedback');
      if (!feedback) return;

      feedback.textContent = message;
      feedback.className =
        `feedback${type ? ` ${type}` : ''}`;
    }

    check() {
      const exercise = this.currentExercise();
      this.incrementAttempt(exercise.id);

      if (INFO_TYPES.has(exercise.type)) {
        const firstSolve = this.markSolved(exercise);
        const lessonComplete = this.isLessonComplete(this.currentLesson());
        this.setFeedback(
          lessonComplete
            ? 'Great! This lesson step is complete.'
            : firstSolve
              ? 'Great! You are ready for the next step.'
              : 'Completed previously. You can review it again.',
          'good'
        );
        this.refreshProgressVisuals();
        return;
      }

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

      const firstSolve = this.markSolved(exercise);
      const lessonComplete = this.isLessonComplete(this.currentLesson());

      if (exercise.audio) speak(exercise.audio);

      if (lessonComplete) {
        this.setFeedback(
          'Correct! Lesson complete — the next lesson is now unlocked.',
          'good'
        );
      } else if (firstSolve) {
        this.setFeedback('Correct! Progress saved.', 'good');
      } else {
        this.setFeedback('Correct! Completed previously.', 'good');
      }

      this.refreshProgressVisuals();
    }

    refreshProgressVisuals() {
      const lesson = this.currentLesson();
      const progress = this.lessonProgress(lesson);

      const progressBox = this.root.querySelector('.lesson-progress-box');
      if (progressBox) {
        progressBox.innerHTML = `
          <span>${progress.percent}%</span>
          <small>${progress.completed}/${progress.total} exercises</small>
        `;
      }

      const overall = this.overallProgress();
      const overallBox = this.root.querySelector('.curriculum-overall');
      if (overallBox) {
        overallBox.innerHTML = `
          <span>${overall.completed}/${overall.total} complete</span>
          <div class="curriculum-progress-track">
            <span style="width:${overall.percent}%"></span>
          </div>
        `;
      }

      const unit = this.currentUnit();
      this.root.querySelectorAll('.lesson-chip').forEach(button => {
        const lessonIndex = Number(button.dataset.lessonIndex);
        const item = unit.lessons[lessonIndex];
        if (!item) return;

        const itemProgress = this.lessonProgress(item);
        const unlocked = this.isLessonUnlockedById(item.id);
        const complete = this.isLessonComplete(item);

        button.classList.toggle('is-complete', complete);
        button.classList.toggle('is-locked', !unlocked);
        button.disabled = !unlocked;

        const status = button.querySelector('.lesson-chip-status');
        if (status) {
          status.textContent = complete
            ? '✓'
            : unlocked
              ? `${itemProgress.completed}/${itemProgress.total}`
              : '🔒';
        }
      });

      const activity = this.currentActivity();
      const solved = this.solvedSet();
      const activeStep = this.root.querySelector(
        `.activity-step[data-activity-index="${this.location.activity}"]`
      );

      if (activeStep) {
        const ids = activity.exercises.map(exercise => exercise.id);
        const completed = ids.filter(id => solved.has(id)).length;
        const small = activeStep.querySelector('small');
        if (small) small.textContent = `${completed}/${ids.length}`;
      }
    }

    reset() {
      const exercise = this.currentExercise();
      this.setFeedback('', '');

      if (INFO_TYPES.has(exercise.type)) return;

      if (Array.isArray(exercise.answer)) {
        this.manipulator?.reset();
      } else {
        this.root
          .querySelectorAll('.engine-choice')
          .forEach(button => {
            button.classList.remove(
              'selected',
              'correct',
              'wrong'
            );
            button.setAttribute('aria-pressed', 'false');
          });
      }
    }

    render() {
      const exercise = this.currentExercise();
      this.manipulator = null;

      this.renderShell(exercise);
      this.renderPrompt(exercise);

      if (INFO_TYPES.has(exercise.type)) {
        this.renderLetterIntro(exercise);
      } else if (Array.isArray(exercise.answer)) {
        this.renderManipulator(exercise);
      } else {
        this.renderChoices(exercise);
      }

      this.root
        .querySelector('#engineCheckBtn')
        .addEventListener('click', () => this.check());

      this.root
        .querySelector('#engineResetBtn')
        .addEventListener('click', () => this.reset());

      if (this.progress.solved.includes(exercise.id)) {
        this.setFeedback('Completed previously. You can practise again.', 'good');
      }

      this.saveProgress();
    }
  }

  window.EnglishExerciseEngine = ExerciseEngine;
})();
