# English Language Lab — Exercise Engine

A standalone English-first PWA built around a physical-style magnetic whiteboard and movable foam letters, with phonics, spelling and a structured early reading curriculum.

## v0.15 — Classroom Whiteboard Mode

The primary student experience now mirrors the original foam-letter kit: a magnetic whiteboard, a full A–Z foam tray, free placement, duplication, deletion, scattering and alignment. The structured curriculum remains underneath it with the hierarchy:

`Level → Unit → Lesson → Activity → Exercise`

The curriculum is data-driven and lives in:

`src/data/exercises.json`

Its schema is now version 2. The same reusable engine renders the lesson path, activities and exercise interactions.

### v0.15 Classroom Whiteboard Mode

- Full-board workspace uses the existing magnetic-board state; it does not create another board engine.
- App-style full screen works even when the browser does not expose native Fullscreen API, with native fullscreen requested when supported.
- Collapsible floating toolbox overlays the board without shrinking it.
- Bottom horizontal foam strip supports touch scrolling, arrow scrolling, A–Z, Digraphs and Vowel Teams.
- ABC / abc controls update both existing board pieces and newly added pieces.
- Move / Pen / Eraser interaction modes prevent drawing from accidentally moving foam letters.
- Ink is stored as normalized vector strokes and persists locally; ink Undo, Redo and Clear are separate from board Undo/Redo.
- Writing guides: Blank, Baseline, Primary 3-Line and Handwriting 4-Line.
- Pen colors: black, red, blue and green, with adjustable width.
- Ink and guide layers remain independent from foam pieces and exercise state.

### v0.14.2 navigation repair

- Uses native `document.querySelectorAll(...).forEach(...)` for main-view switching.
- Removes the selector-helper substitution failure that broke Letters, Word Builder, Practice and Learning Path.
- Keeps delegated tab routing and the unified magnetic-board Word Builder.

### v0.14.1 navigation regression repair

- Replaces the broken single-element `$('.tab').forEach(...)` navigation binding with delegated navigation on the tabs container.
- Restores Letters, Word Builder, Practice and Learning Path navigation.
- Word Builder continues to use Build mode in the unified magnetic-board engine.
- Adds a runtime `mainNavReady` diagnostic so future regressions can be detected from Teacher Diagnostics.
- Preserves a requested board mode if a tab is tapped before the module finishes initialization.

### v0.14 stability architecture

- The Word Builder navigation now opens Build mode inside the magnetic-board engine instead of exposing the legacy builder as a second interaction system.
- The obsolete v0.5 magnetic foam-board implementation was removed from `app.js`.
- Board persistence now uses the stable key `englishLab.board`; old `englishLab.board.v0.13` and `englishLab.board.v0.8` data are migrated automatically.
- Saved board metadata restores mode, case, color mode and Student/Teacher mode.
- Teacher Diagnostics checks required UI, A and SH board models, Segment & Blend tokenization, local storage, Undo/Redo, Pointer Events, Service Worker and current PWA cache.
- Reset App Data clears English Lab local data and app caches only after explicit confirmation.
- The runtime diagnostics run once silently at startup and can be opened from Teacher tools.

### v0.13.1 regression repair

- Restores collection selectors that accidentally broke board initialization in v0.13.
- Migrates saved v0.12 board pieces from the legacy storage key.
- Restores the missing Reset Size control.
- Makes audio fallbacks immediate when recorded MP3 assets are not installed.
- Adds a visible Student Mode notice with a one-tap return to Teacher Mode.

### v0.13 Foam Kit 2.0

- A–Z tray remains an unlimited source: tapping the same letter creates another board piece.
- Digraph tray: SH, CH, TH, WH, PH, CK, NG, QU.
- Vowel-team tray: AI, AY, EE, EA, OA, OO, OI, OY, OW, IGH.
- Phonics color mode and Classic single-color mode.
- Multi-letter graphemes are first-class movable board pieces.
- Selected-piece audio architecture has separate Name, Sound and Example channels. It first looks for recorded MP3 assets under `assets/audio/{name|sound|example}/` and falls back to speech synthesis when recordings are not present.
- Segment & Blend uses the same foam pieces on the magnetic board. Graphemes spread apart for segmentation and move together for blending.
- Student Mode hides teacher controls while preserving the board, foam kit and learning actions.

### Expanded educational fonts

v0.9 adds educational typefaces intended for early literacy and classroom use:

- Teachers
- Andika
- ABeeZee
- Lexend
- Atkinson Hyperlegible
- Fredoka
- Nunito
- Comic Neue
- Patrick Hand
- Schoolbell

The previous device fallbacks remain available. The selected teaching font applies to the foam-letter kit, board pieces, target words and movable exercise tokens. Google-hosted font files are cached by the service worker after first use so subsequent offline sessions can reuse them when available.

### Font support

The app separates the visual typeface used for learning letters from the typeface used by the interface.

**Teaching letter fonts**
- Rounded
- School Print
- Clean Sans
- Book Serif
- Mono
- System

**Interface fonts**
- System
- Rounded
- Clean Sans
- Book Serif

Both choices are saved locally and restored the next time the app opens. Teaching-font changes apply to foam pieces, the A–Z explorer, word targets and exercise tokens.

The current profiles use local device font stacks so the PWA remains offline-first. A later release can bundle licensed open fonts when identical rendering across iOS, Android and desktop is required.

### Semantic phonics color system

Colors now encode phonics information instead of being decorative:

- Coral / red = vowel
- Blue = consonant
- Green = digraph (for example SH, CH, TH)
- Yellow = vowel team (for example AI, OO, EA)
- Purple = silent-e

On the free A–Z board, vowels are coral and consonants are blue. When a word is created in Build or Completed Word mode, the word is analyzed and the more specific digraph, vowel-team and silent-e colors are applied automatically. A visible legend is included beside the foam-letter tray.

### Exact Arabic foam renderer

v0.11 removes the English-only pseudo-element foam simulation and uses the same rendering pattern as the Arabic project:

- transparent draggable holder;
- nested `foam-glyph` element as the visible letter;
- the same multi-layer EVA extrusion via `text-shadow`;
- the same `glyph-red`, `glyph-blue`, `glyph-green`, and `glyph-purple` classes;
- a matching `glyph-yellow` extrusion added only for English vowel teams;
- saved v0.10 color classes are migrated automatically.

### Cut-foam letter rendering

Foam letters are no longer drawn inside colored rectangles. The visible object is the letter glyph itself. v0.10 renders it as two aligned glyph layers: a darker offset EVA-foam edge/extrusion and a lighter front face, with a soft physical shadow. The touch target remains larger and invisible for reliable dragging on phones and tablets.

### Board parity with the Arabic project

v0.8 replaces the simplified English board with the same architectural pattern used by the Arabic project:

- DOM-independent board state and persistence.
- Undo/Redo history.
- Command-based add, move, resize and delete operations.
- Piece capabilities (selectable, movable, scalable, deletable).
- Single-letter, whole-word and multi-selection states.
- Completed words move as grouped foam letters.
- Completed words can be detached into individual pieces and regrouped.
- Free Board / Build a Word / Completed Words modes.
- Select all, duplicate, delete, resize, align, scatter, speak and clear actions.
- iOS, Android, desktop and webOS input profiles.
- Saved board state in local storage.
- Word-building exercises use the same board pieces rather than a separate tile widget.

### Magnetic foam board

- Full A–Z foam letter tray.
- Uppercase and lowercase display modes.
- Vowels use a consistent foam color cue.
- Drag a letter from the tray onto the magnetic board.
- Tap a tray letter to create another copy.
- Move placed pieces freely anywhere on the board.
- Select, duplicate or delete individual pieces.
- Scatter all pieces or align them into a row.
- Enter a target word and scatter only its letters for a hands-on spelling activity.
- Optional visible target word.
- The same foam visual language is used for movable tokens in word exercises.

### Current curriculum

**Level 1 · Foundations**

- Unit 1 · Short Vowels
  - Lesson 1 · Short A
  - Lesson 2 · Short O
  - Lesson 3 · Short U
- Unit 2 · Digraphs
  - Lesson 4 · SH
- Unit 3 · First Sentences
  - Lesson 5 · I see a cat.

### Progression rules

- The first lesson is available immediately.
- A later lesson remains locked until the previous lesson is completed.
- Exercise completion is stored locally.
- Attempts are counted per exercise.
- Lesson progress and overall curriculum progress are calculated automatically.
- The student's last Level / Unit / Lesson / Activity / Exercise position is saved and restored.
- Completing a lesson unlocks the next lesson.

### Supported exercise types

- `word-build`
- `letter-order`
- `missing-letter`
- `phoneme-match`
- `word-family`
- `sentence-build`

Array-answer exercises reuse one movable-token engine supporting drag, touch selection, slot swapping and returning tokens to the bank.

## PWA behavior

The v0.10 service worker uses cache `english-language-lab-v15` and stores the curriculum JSON and exercise engine for offline use after the first successful load.

## Audio

Browser `SpeechSynthesis` is still a prototype fallback for words and prompts. Production phonics should use curated recorded phoneme audio because generic TTS is not sufficiently controlled for isolated phonemes.

## Local run

JSON loading and service workers require HTTP(S):

```bash
python3 -m http.server 8080
```

Then open `http://localhost:8080`.

## Copyright

Copyright © 2026 Ibrahim Alneami — All Rights Reserved. · Version v0.15

No license is granted for resale, redistribution, or commercial reuse without written permission.
