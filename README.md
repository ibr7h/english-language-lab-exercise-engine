# English Language Lab — Exercise Engine

A standalone English-first PWA for phonics, spelling, letter manipulation, word building and structured language practice.

The codebase is deliberately separate from the Arabic Language Lab. English grapheme–phoneme relationships, CVC structures, blends, digraphs, word families and spelling patterns require a different instructional model.

## v0.3 — data-driven exercise engine

v0.3 introduces a reusable exercise runtime. Exercise content now lives in:

`src/data/exercises.json`

The browser loads this JSON catalog and the same engine renders different exercise types without custom JavaScript for each lesson.

### Supported exercise types

- `word-build` — arrange letters to form a word.
- `letter-order` — sequence letters.
- `missing-letter` — choose a missing grapheme.
- `phoneme-match` — match a phoneme to a grapheme.
- `word-family` — identify a word in a target rime/family.
- `sentence-build` — arrange word tokens into a sentence.

### Manipulation model

For array-answer exercises, the same reusable manipulator supports:

- drag from bank to slot;
- drag between slots;
- swap occupied slots;
- return a token to the bank;
- touch fallback: tap a token, then tap the destination;
- keyboard-accessible destination slots.

Pointer Events are used for iPhone/iPad, Android, mouse and pen input.

### JSON example

```json
{
  "id": "build-cat",
  "type": "word-build",
  "title": "Build the word",
  "instruction": "Use the clue and arrange the letters.",
  "clue": "A small animal that says meow.",
  "emoji": "🐱",
  "answer": ["C", "A", "T"],
  "bank": ["T", "C", "A"],
  "audio": "CAT",
  "tags": ["CVC", "short-a"]
}
```

Adding another exercise of an existing type now requires content data only. The engine validates supported exercise types when it starts.

## v0.2 foundation

The original Word Builder remains available temporarily as a comparison/reference implementation while the JSON engine is tested. It supports Unscramble, Copy and Listen & Build modes with individual movable letters.

## Current prototype features

- A–Z uppercase/lowercase explorer
- Common sound + example word per letter
- Movable letter Word Builder
- Data-driven Exercise Engine
- Beginning-letter practice
- Local completion persistence
- Offline PWA cache
- Mobile-first layout

## Planned architecture

1. Letter recognition
2. Letter names
3. Core phoneme recognition
4. CVC word building
5. Short vowels
6. Consonant blends
7. Digraphs
8. Word families / rimes
9. Long vowels and silent-e
10. Vowel teams
11. Spelling from audio
12. Sentence construction

## Audio constraint

`SpeechSynthesis` is a prototype fallback for words and instructions. Production phonics should use curated recorded phoneme audio; generic TTS should not be relied on for isolated phoneme production.

## Local run

Service workers and JSON loading require HTTP(S).

```bash
python3 -m http.server 8080
```

Then open `http://localhost:8080`.

## Copyright

Copyright © 2026 Ibrahim Alneami — All Rights Reserved.

No license is granted for resale, redistribution, or commercial reuse without written permission.
