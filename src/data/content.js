window.ENGLISH_LAB_CONTENT = {
  letters: [
    ['A','a','/æ/','apple'], ['B','b','/b/','ball'], ['C','c','/k/','cat'], ['D','d','/d/','dog'],
    ['E','e','/ɛ/','egg'], ['F','f','/f/','fish'], ['G','g','/g/','goat'], ['H','h','/h/','hat'],
    ['I','i','/ɪ/','igloo'], ['J','j','/dʒ/','jam'], ['K','k','/k/','kite'], ['L','l','/l/','lion'],
    ['M','m','/m/','moon'], ['N','n','/n/','nest'], ['O','o','/ɒ/','octopus'], ['P','p','/p/','pig'],
    ['Q','q','/kw/','queen'], ['R','r','/r/','rain'], ['S','s','/s/','sun'], ['T','t','/t/','top'],
    ['U','u','/ʌ/','umbrella'], ['V','v','/v/','van'], ['W','w','/w/','web'], ['X','x','/ks/','fox'],
    ['Y','y','/j/','yes'], ['Z','z','/z/','zebra']
  ].map(([upper, lower, phoneme, example]) => ({ upper, lower, phoneme, example })),

  words: [
    { word: 'CAT',  hint: 'A small animal that says “meow”.', emoji: '🐱', pattern: 'CVC', family: '-at' },
    { word: 'SUN',  hint: 'It shines in the sky during the day.', emoji: '☀️', pattern: 'CVC', family: '-un' },
    { word: 'DOG',  hint: 'A common pet that can bark.', emoji: '🐶', pattern: 'CVC', family: '-og' },
    { word: 'MAP',  hint: 'It helps you find places.', emoji: '🗺️', pattern: 'CVC', family: '-ap' },
    { word: 'FISH', hint: 'An animal that swims in water.', emoji: '🐟', pattern: 'CVC + digraph', family: '-ish' },
    { word: 'BOOK', hint: 'You read it.', emoji: '📘', pattern: 'vowel team', family: '-ook' },
    { word: 'MOON', hint: 'You can often see it at night.', emoji: '🌙', pattern: 'vowel team', family: '-oon' },
    { word: 'SHIP', hint: 'A large boat.', emoji: '🚢', pattern: 'digraph + CVC', family: '-ip' },
    { word: 'CHAT', hint: 'A friendly talk.', emoji: '💬', pattern: 'digraph + CVC', family: '-at' },
    { word: 'RAIN', hint: 'Water that falls from clouds.', emoji: '🌧️', pattern: 'vowel team', family: '-ain' }
  ]
};
