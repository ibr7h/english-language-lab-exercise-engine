const { letters, words } = window.ENGLISH_LAB_CONTENT;
const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

const state = {
  caseMode: 'both',
  wordIndex: 0,
  tiles: [],
  answer: [],
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
    const glyph = state.caseMode === 'upper' ? item.upper : state.caseMode === 'lower' ? item.lower : `${item.upper}${item.lower}`;
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
    <p style="color:#657087;font-size:.9rem">The current prototype uses device speech synthesis for letter names and example words. Recorded phoneme audio should replace it for production phonics instruction.</p>
  `;
  $('#dialogSpeakLetter').addEventListener('click', () => speak(item.upper));
  $('#dialogSpeakWord').addEventListener('click', () => speak(item.example));
  $('#letterDialog').showModal();
}

function shuffled(array) {
  return [...array].sort(() => Math.random() - 0.5);
}

function loadWord(index = state.wordIndex) {
  state.wordIndex = (index + words.length) % words.length;
  const entry = words[state.wordIndex];
  state.answer = Array(entry.word.length).fill(null);
  state.tiles = shuffled(entry.word.split('').map((letter, i) => ({ id: `${Date.now()}-${i}-${letter}`, letter })));
  $('#targetWord').textContent = entry.word;
  $('#targetHint').textContent = entry.hint;
  $('#builderFeedback').textContent = '';
  $('#builderFeedback').className = 'feedback';
  renderBuilder();
}

function firstEmptySlot() {
  return state.answer.findIndex(v => v === null);
}

function placeTile(tileId) {
  const tileIndex = state.tiles.findIndex(t => t.id === tileId);
  if (tileIndex < 0) return;
  const slot = firstEmptySlot();
  if (slot < 0) return;
  const [tile] = state.tiles.splice(tileIndex, 1);
  state.answer[slot] = tile;
  renderBuilder();
}

function returnTile(slotIndex) {
  const tile = state.answer[slotIndex];
  if (!tile) return;
  state.answer[slotIndex] = null;
  state.tiles.push(tile);
  renderBuilder();
}

function renderBuilder() {
  const slots = $('#answerSlots');
  const bank = $('#tileBank');
  slots.innerHTML = '';
  bank.innerHTML = '';

  state.answer.forEach((tile, index) => {
    const slot = document.createElement('button');
    slot.className = 'answer-slot';
    slot.setAttribute('aria-label', tile ? `Remove ${tile.letter} from position ${index + 1}` : `Empty position ${index + 1}`);
    if (tile) {
      slot.innerHTML = `<span class="letter-tile">${tile.letter}</span>`;
      slot.addEventListener('click', () => returnTile(index));
    }
    slots.appendChild(slot);
  });

  state.tiles.forEach(tile => {
    const button = document.createElement('button');
    button.className = 'letter-tile';
    button.textContent = tile.letter;
    button.setAttribute('aria-label', `Place letter ${tile.letter}`);
    button.addEventListener('click', () => placeTile(tile.id));
    bank.appendChild(button);
  });
}

function checkWord() {
  const current = state.answer.map(x => x?.letter || '').join('');
  const target = words[state.wordIndex].word;
  const feedback = $('#builderFeedback');
  if (current === target) {
    feedback.textContent = `Correct — ${target}!`;
    feedback.className = 'feedback good';
    speak(target);
    addProgress();
  } else {
    feedback.textContent = current.length < target.length ? 'Complete every space first.' : 'Not yet. Move one letter at a time and try again.';
    feedback.className = 'feedback bad';
  }
}

function resetWord() {
  const allTiles = [...state.tiles, ...state.answer.filter(Boolean)];
  state.tiles = allTiles;
  state.answer = Array(words[state.wordIndex].word.length).fill(null);
  renderBuilder();
}

function renderPractice() {
  const entry = words[state.practiceIndex % words.length];
  $('#practiceWord').textContent = entry.word;
  $('#practiceFeedback').textContent = '';
  $('#practiceFeedback').className = 'feedback';
  const correct = entry.word[0];
  const distractors = letters.map(l => l.upper).filter(l => l !== correct);
  const choices = shuffled([correct, ...shuffled(distractors).slice(0, 2)]);
  const wrap = $('#practiceChoices');
  wrap.innerHTML = '';
  choices.forEach(letter => {
    const btn = document.createElement('button');
    btn.className = 'choice-btn';
    btn.textContent = letter;
    btn.addEventListener('click', () => {
      $$('.choice-btn').forEach(b => b.disabled = true);
      if (letter === correct) {
        btn.classList.add('correct');
        $('#practiceFeedback').textContent = `Yes. ${entry.word} begins with ${correct}.`;
        $('#practiceFeedback').className = 'feedback good';
        addProgress();
      } else {
        btn.classList.add('wrong');
        const correctBtn = $$('.choice-btn').find(b => b.textContent === correct);
        correctBtn?.classList.add('correct');
        $('#practiceFeedback').textContent = `This word begins with ${correct}.`;
        $('#practiceFeedback').className = 'feedback bad';
      }
    });
    wrap.appendChild(btn);
  });
}

$$('.tab').forEach(tab => tab.addEventListener('click', () => {
  $$('.tab').forEach(t => t.classList.toggle('is-active', t === tab));
  $$('.view').forEach(v => v.classList.toggle('is-active', v.id === tab.dataset.view));
}));

$('#caseMode').addEventListener('change', e => { state.caseMode = e.target.value; renderLetters(); });
$('#newWordBtn').addEventListener('click', () => loadWord(state.wordIndex + 1));
$('#shuffleBtn').addEventListener('click', () => { state.tiles = shuffled(state.tiles); renderBuilder(); });
$('#resetBtn').addEventListener('click', resetWord);
$('#checkBtn').addEventListener('click', checkWord);
$('#speakWordBtn').addEventListener('click', () => speak(words[state.wordIndex].word));
$('#speakPracticeBtn').addEventListener('click', () => speak(words[state.practiceIndex % words.length].word));
$('#nextPracticeBtn').addEventListener('click', () => { state.practiceIndex = (state.practiceIndex + 1) % words.length; renderPractice(); });

renderProgress();
renderLetters();
loadWord(0);
renderPractice();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js'));
}
