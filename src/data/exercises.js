window.ENGLISH_LAB_EXERCISES = {
  schemaVersion: 1,
  appVersion: '0.3',
  sets: [
    {
      id: 'starter-phonics',
      title: 'Starter Phonics',
      description: 'A mixed lesson generated entirely from exercise data.',
      exercises: [
        {
          id: 'build-cat',
          type: 'word-build',
          title: 'Build the word',
          instruction: 'Use the clue and arrange the letters.',
          clue: 'A small animal that says “meow”.',
          emoji: '🐱',
          answer: ['C', 'A', 'T'],
          bank: ['T', 'C', 'A'],
          audio: 'CAT',
          tags: ['CVC', 'short-a']
        },
        {
          id: 'missing-sun',
          type: 'missing-letter',
          title: 'Missing letter',
          instruction: 'Choose the missing letter.',
          display: 'S _ N',
          answer: 'U',
          choices: ['A', 'U', 'O'],
          audio: 'SUN',
          emoji: '☀️',
          tags: ['CVC', 'short-u']
        },
        {
          id: 'phoneme-sh',
          type: 'phoneme-match',
          title: 'Match the sound',
          instruction: 'Which grapheme represents this sound?',
          display: '/ʃ/',
          answer: 'SH',
          choices: ['CH', 'SH', 'TH'],
          examples: ['SHIP', 'FISH'],
          tags: ['digraph']
        },
        {
          id: 'family-at',
          type: 'word-family',
          title: 'Word family',
          instruction: 'Which word belongs to the -AT family?',
          display: '-AT',
          answer: 'CAT',
          choices: ['CAT', 'DOG', 'SUN'],
          emoji: '🐱',
          tags: ['rime', 'short-a']
        },
        {
          id: 'order-abc',
          type: 'letter-order',
          title: 'Put letters in order',
          instruction: 'Arrange the letters in alphabetical order.',
          answer: ['A', 'B', 'C', 'D'],
          bank: ['C', 'A', 'D', 'B'],
          tags: ['alphabet']
        },
        {
          id: 'sentence-cat',
          type: 'sentence-build',
          title: 'Build the sentence',
          instruction: 'Arrange the words to make a correct sentence.',
          answer: ['I', 'SEE', 'A', 'CAT', '.'],
          bank: ['CAT', 'I', '.', 'A', 'SEE'],
          audio: 'I see a cat.',
          emoji: '🐱',
          tags: ['sentence']
        }
      ]
    },
    {
      id: 'short-vowels',
      title: 'Short Vowels',
      description: 'Data-only examples for CVC vowel discrimination.',
      exercises: [
        {
          id: 'missing-cat-a',
          type: 'missing-letter',
          title: 'Short A',
          instruction: 'Complete the word.',
          display: 'C _ T',
          answer: 'A',
          choices: ['A', 'E', 'I'],
          audio: 'CAT',
          emoji: '🐱',
          tags: ['CVC', 'short-a']
        },
        {
          id: 'missing-dog-o',
          type: 'missing-letter',
          title: 'Short O',
          instruction: 'Complete the word.',
          display: 'D _ G',
          answer: 'O',
          choices: ['A', 'O', 'U'],
          audio: 'DOG',
          emoji: '🐶',
          tags: ['CVC', 'short-o']
        },
        {
          id: 'build-sun',
          type: 'word-build',
          title: 'Build SUN',
          instruction: 'Listen and build the word.',
          clue: 'It shines in the sky.',
          emoji: '☀️',
          answer: ['S', 'U', 'N'],
          bank: ['N', 'S', 'U'],
          audio: 'SUN',
          tags: ['CVC', 'short-u']
        }
      ]
    }
  ]
};
