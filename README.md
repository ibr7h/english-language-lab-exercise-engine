# English Language Lab — Exercise Engine

A standalone English-first learning application for phonics, spelling, letter manipulation and word building.

The codebase is deliberately separate from the Arabic Language Lab. English grapheme–phoneme relationships, CVC structures, blends, digraphs, word families and spelling patterns require their own instructional model.

## v0.2 — movable letter engine

The word builder is now a reusable manipulation engine rather than a fixed click-to-fill exercise.

### Interaction model

- Drag any individual letter from the bank to any answer slot.
- Drag a placed letter to another slot.
- Drag a placed letter back to the letter bank.
- Swap two placed letters directly.
- iPhone/iPad-friendly Pointer Events instead of relying on HTML5 drag-and-drop.
- Touch fallback: tap a letter to select it, then tap the target slot.
- Visual selected/drop states and keyboard-accessible slots.
- A wrong full answer reports how many positions are correct without exposing the answer.

### Exercise modes

1. **Unscramble** — the target spelling is hidden; the learner uses the clue/image and rearranges the supplied letters.
2. **Copy** — the full word remains visible for early learners.
3. **Listen & Build** — the spelling is hidden and the learner builds from audio.

Current prototype word metadata includes an emoji clue, phonics pattern and word family where applicable.

## Other prototype features

- A–Z uppercase/lowercase explorer
- Common sound + example word per letter
- Beginning-letter practice
- Device speech synthesis for prototype pronunciation
- Offline PWA shell
- Local completion counter
- Mobile-first layout for iPhone, Android and web

## Planned learning architecture

1. Letter recognition
2. Letter names
3. Core phoneme recognition
4. CVC word building
5. Short vowels
6. Consonant blends
7. Digraphs (sh, ch, th, wh, ph)
8. Word families / rimes
9. Long vowels and silent-e
10. Vowel teams
11. Spelling from audio
12. Sentence construction

## Audio constraint

`SpeechSynthesis` is only a prototype fallback. Production phonics instruction should use curated recorded phoneme audio. Generic TTS is not reliable enough for isolated phoneme production.

## Local run

Service workers require HTTP(S), not `file://`.

```bash
python3 -m http.server 8080
```

Then open `http://localhost:8080`.

## Copyright

Copyright © 2026 Ibrahim Alneami — All Rights Reserved.

No license is granted for resale, redistribution, or commercial reuse without written permission.
