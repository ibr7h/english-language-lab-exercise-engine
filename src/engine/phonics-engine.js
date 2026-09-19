export const VOWELS=new Set(['A','E','I','O','U']);

export const PHONICS_COLORS=Object.freeze({
  consonant:'glyph-blue',
  vowel:'glyph-red',
  digraph:'glyph-green',
  soundChunk:'glyph-green',
  vowelTeam:'glyph-yellow',
  silentE:'glyph-purple',
  silentLetter:'glyph-gray'
});

export const DIGRAPHS=Object.freeze(['SH','CH','TH','WH','PH','CK','NG','QU']);
export const SOUND_CHUNKS=Object.freeze(['TION','SION','CIAN','TCH','DGE']);
export const VOWEL_TEAMS=Object.freeze(['IGH','AI','AY','EE','EA','OA','OE','OO','OU','OW','OI','OY','UE','UI','IE']);

const SILENT_INITIAL_PATTERNS=Object.freeze([
  {pattern:'KN',silentOffsets:[0]},
  {pattern:'WR',silentOffsets:[0]},
  {pattern:'GN',silentOffsets:[0]}
]);

const SILENT_FINAL_PATTERNS=Object.freeze([
  {pattern:'MB',silentOffsets:[1]}
]);

export function colorForLetter(letter){
  const upper=String(letter||'').toUpperCase();
  return VOWELS.has(upper)?PHONICS_COLORS.vowel:PHONICS_COLORS.consonant;
}

function markPattern(result,text,pattern,role,color){
  let from=0;
  while(from<=text.length-pattern.length){
    const index=text.indexOf(pattern,from);
    if(index<0)break;
    for(let offset=0;offset<pattern.length;offset++){
      result[index+offset]={...result[index+offset],role,color,pattern};
    }
    from=index+pattern.length;
  }
}

export function analyzeWordPhonics(word){
  const text=String(word||'').toUpperCase().replace(/[^A-Z]/g,'');
  const result=[...text].map(letter=>({
    letter,
    role:VOWELS.has(letter)?'vowel':'consonant',
    color:colorForLetter(letter),
    pattern:null
  }));

  [...VOWEL_TEAMS].sort((a,b)=>b.length-a.length)
    .forEach(pattern=>markPattern(result,text,pattern,'vowel-team',PHONICS_COLORS.vowelTeam));

  [...DIGRAPHS].sort((a,b)=>b.length-a.length)
    .forEach(pattern=>markPattern(result,text,pattern,'digraph',PHONICS_COLORS.digraph));

  // More specific/longer sound chunks run after digraphs so TCH wins over CH.
  [...SOUND_CHUNKS].sort((a,b)=>b.length-a.length)
    .forEach(pattern=>markPattern(result,text,pattern,'sound-chunk',PHONICS_COLORS.soundChunk));

  for(const rule of SILENT_INITIAL_PATTERNS){
    if(!text.startsWith(rule.pattern))continue;
    for(const offset of rule.silentOffsets){
      if(result[offset])result[offset]={
        ...result[offset],
        role:'silent-letter',
        color:PHONICS_COLORS.silentLetter,
        pattern:rule.pattern
      };
    }
  }

  for(const rule of SILENT_FINAL_PATTERNS){
    if(!text.endsWith(rule.pattern))continue;
    const base=text.length-rule.pattern.length;
    for(const offset of rule.silentOffsets){
      const index=base+offset;
      if(result[index])result[index]={
        ...result[index],
        role:'silent-letter',
        color:PHONICS_COLORS.silentLetter,
        pattern:rule.pattern
      };
    }
  }

  if(text.length>=3&&text.endsWith('E')){
    const last=text.length-1;
    const previousRole=result[last]?.role;
    if(!['vowel-team','sound-chunk','digraph'].includes(previousRole)){
      result[last]={
        ...result[last],
        role:'silent-e',
        color:PHONICS_COLORS.silentE,
        pattern:'final-e'
      };
    }
  }

  return result;
}

export function segmentPhonicsGraphemes(word){
  const text=String(word||'').toUpperCase().replace(/[^A-Z]/g,'');
  const patterns=[...SOUND_CHUNKS,...VOWEL_TEAMS,...DIGRAPHS]
    .sort((a,b)=>b.length-a.length||a.localeCompare(b));
  const out=[];
  let index=0;
  while(index<text.length){
    const pattern=patterns.find(candidate=>text.startsWith(candidate,index));
    if(pattern){
      out.push(pattern);
      index+=pattern.length;
    }else{
      out.push(text[index]);
      index+=1;
    }
  }
  return out;
}
