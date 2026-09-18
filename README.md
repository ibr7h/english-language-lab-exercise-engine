# English Language Lab — Exercise Engine

A standalone English-first PWA built around a physical-style magnetic whiteboard and movable foam letters, with phonics, spelling and a structured early reading curriculum.

## v0.5 — magnetic foam letter kit + curriculum path

The primary student experience now mirrors the original foam-letter kit: a magnetic whiteboard, a full A–Z foam tray, free placement, duplication, deletion, scattering and alignment. The structured curriculum remains underneath it with the hierarchy:

`Level → Unit → Lesson → Activity → Exercise`

The curriculum is data-driven and lives in:

`src/data/exercises.json`

Its schema is now version 2. The same reusable engine renders the lesson path, activities and exercise interactions.

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

The v0.5 service worker uses cache `english-language-lab-v5` and stores the curriculum JSON and exercise engine for offline use after the first successful load.

## Audio

Browser `SpeechSynthesis` is still a prototype fallback for words and prompts. Production phonics should use curated recorded phoneme audio because generic TTS is not sufficiently controlled for isolated phonemes.

## Local run

JSON loading and service workers require HTTP(S):

```bash
python3 -m http.server 8080
```

Then open `http://localhost:8080`.

## Copyright

Copyright © 2026 Ibrahim Alneami — All Rights Reserved. · Version v0.5

No license is granted for resale, redistribution, or commercial reuse without written permission.
