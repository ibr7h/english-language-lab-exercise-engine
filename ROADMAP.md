# English Language Lab — Development Roadmap

This roadmap separates stable reference work from future feature development. Reference branches are immutable rollback points; new work continues on `main`.

## Stable references

- `reference-v0.20.1` — historical stable reference.
- `reference-v0.25` — Build a Word 2.0 reference.
- `reference-v0.25.1` — tested hardening reference.

## Near-term

### Board and Build hardening
- Continue practical browser/device testing after each significant UI change.
- Preserve Normal Board ↔ Full Board positional stability.
- Keep per-board settings isolated.
- Improve scale-aware Build snapping.
- Prevent reshuffle from occasionally returning the same order when a meaningful shuffle is possible.
- Remove or isolate obsolete legacy Word Builder code after regression verification.

### Case Matters 2.0
- Make mixed-case work pedagogically meaningful rather than only validating existing case.
- Add a controlled way to change a selected foam letter between uppercase and lowercase.
- Ensure Hint and Check understand wrong-case-but-correct-letter states.
- Preserve mixed-case target words exactly as authored.

## Planned later — Phonics Intelligence

Do not implement this phase until the current board/build workflow is stable.

### Phonics Inspector
- Tapping a word, grapheme, or letter should explain why it has its phonics classification.
- Show the detected pattern, role, and pronunciation cue where reliable.
- Examples: silent K in `KNOW`, vowel team `OW`, and the `TION` chunk in `STATION`.

### Visual grapheme grouping
- Visually connect letters that function as one sound/spelling unit.
- Examples:
  - `SHIP → SH | I | P`
  - `RAIN → R | AI | N`
  - `LIGHT → L | IGH | T`
  - `STATION → S | T | A | TION`
- Use grouping/underlining without removing the independent foam-object model.

### Silent-letter treatment
- Keep the silent-letter semantic color.
- Add a second non-color cue so the distinction remains understandable in grayscale/printing and for color-vision differences.
- Candidate treatment: subtle strike/mark/badge rather than relying on gray alone.

### Confidence-aware phonics analysis
- Record the matched rule/pattern and a confidence level internally.
- Apply automatic semantic classification only when the rule is sufficiently reliable.
- Avoid presenting ambiguous English spelling patterns as certain facts.

### Exception dictionary
- Add a curated dictionary for high-frequency irregular words that should not be forced through general rules.
- Candidate examples include `one`, `two`, `said`, `does`, `have`, `give`, and `come`.
- Keep dictionary entries explicit and testable.

### Segment & Blend integration
- Use the same phonics-pattern engine for segmentation, coloring, explanation, and blending.
- Animate grapheme units rather than treating every character as an unrelated sound.
- Keep longest-pattern-first matching for supported chunks.

### Phonics Challenge Mode
- Allow the teacher to hide semantic colors and ask the learner to identify:
  - vowels/consonants,
  - digraphs and sound chunks,
  - vowel teams,
  - silent-e,
  - other silent letters,
  - grapheme boundaries.
- Add Check/Reveal feedback.

### Curriculum expansion
Only after the engine is stable, add explicit Learning Path units for supported advanced patterns. Candidate progression:

`Digraphs → Trigraphs/Chunks → Vowel Teams → Silent Letters → Final-e → TCH/DGE → TION/SION/CIAN`

Recognition by the board engine must remain separate from curriculum completion: detecting an advanced spelling pattern does not mean the learner has completed a lesson on it.

## Later platform work

- PWA packaging polish for iOS, Android, and webOS.
- PNG and maskable icon set plus Apple touch icon.
- Device-specific input/focus testing, especially webOS remote spatial navigation.
- Recorded phoneme/word audio to replace generic TTS fallbacks where educational accuracy requires controlled pronunciation.

## Reporting and classroom integration

- Connect Build, Segment & Blend, and future Phonics Challenge results to teacher-facing activity reports.
- Preserve attempts, completion, hints, and relevant error types per activity.
- Keep student-facing interactions simple while exposing richer evidence to the teacher.
