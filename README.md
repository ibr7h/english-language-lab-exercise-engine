# English Language Lab — Exercise Engine

A fresh English-first learning application inspired by the educational concept of the Arabic Language Lab, but intentionally rebuilt from scratch for English phonics, spelling, letter manipulation and word building.

## Why a separate codebase?

English learning requires a different instructional model from Arabic. This project therefore does **not** inherit the Arabic engine architecture. It treats English graphemes, phonemes, word families, blends, digraphs and spelling patterns as first-class concepts.

## v0.1 prototype

- A–Z uppercase/lowercase explorer
- Common sound + example word per letter
- Word builder with **individually movable letter tiles**
- Shuffle, reset and answer validation
- Beginning-letter practice
- Device speech synthesis for prototype pronunciation
- Offline PWA shell
- Local progress counter
- Mobile-first layout for iPhone / Android / web

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

## Important audio note

`SpeechSynthesis` is included only as a prototype fallback. For production phonics instruction, use curated recorded phoneme audio. Isolated phoneme production must not depend on generic TTS.

## Local run

Use any static web server. Service workers require HTTP(S), not `file://`.

```bash
python3 -m http.server 8080
```

Then open `http://localhost:8080`.

## Copyright

Copyright © 2026 Ibrahim Alneami — All Rights Reserved.
No license is granted for resale, redistribution, or commercial reuse without written permission.
