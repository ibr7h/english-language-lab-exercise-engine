import { BoardState, saveBoardState, loadBoardState } from './core/board-state.js';
import { BoardHistory } from './core/board-history.js';
import { BOARD_COMMANDS, applyBoardCommand } from './core/board-commands.js';
import { createLetterPiece, pieceCan, BOARD_CAPABILITIES } from './core/board-piece.js';
import { detectPlatformProfile } from './core/platform-profile.js';
import { createPlatformAdapter } from './core/platform-adapter.js';
import { decorateBoardPieceElement } from './ui/board-piece-view.js';

const APP_VERSION='0.14';
const STORAGE_KEY='englishLab.board';
const STORAGE_SCHEMA_VERSION=2;
const LEGACY_STORAGE_KEYS=['englishLab.board.v0.13','englishLab.board.v0.8'];
const ALPHABET='ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
const VOWELS=new Set(['A','E','I','O','U']);
const PHONICS_COLORS=Object.freeze({
  consonant:'glyph-blue',
  vowel:'glyph-red',
  digraph:'glyph-green',
  vowelTeam:'glyph-yellow',
  silentE:'glyph-purple'
});
const DIGRAPHS=['SH','CH','TH','WH','PH','CK','NG','QU'];
const VOWEL_TEAMS=['IGH','AI','AY','EE','EA','OA','OE','OO','OU','OW','OI','OY','UE','UI','IE'];
const KIT_DIGRAPHS=['SH','CH','TH','WH','PH','CK','NG','QU'];
const KIT_VOWEL_TEAMS=['AI','AY','EE','EA','OA','OO','OI','OY','OW','IGH'];

const RECORDED_AUDIO_KEYS=new Set([]);
const SOUND_PROFILES=Object.freeze({
  A:{sound:'/æ/',example:'apple'}, B:{sound:'/b/',example:'ball'}, C:{sound:'/k/',example:'cat'},
  D:{sound:'/d/',example:'dog'}, E:{sound:'/ɛ/',example:'egg'}, F:{sound:'/f/',example:'fish'},
  G:{sound:'/g/',example:'goat'}, H:{sound:'/h/',example:'hat'}, I:{sound:'/ɪ/',example:'igloo'},
  J:{sound:'/dʒ/',example:'jam'}, K:{sound:'/k/',example:'kite'}, L:{sound:'/l/',example:'lion'},
  M:{sound:'/m/',example:'moon'}, N:{sound:'/n/',example:'net'}, O:{sound:'/ɑ/',example:'octopus'},
  P:{sound:'/p/',example:'pig'}, Q:{sound:'/kw/',example:'queen'}, R:{sound:'/ɹ/',example:'rain'},
  S:{sound:'/s/',example:'sun'}, T:{sound:'/t/',example:'top'}, U:{sound:'/ʌ/',example:'umbrella'},
  V:{sound:'/v/',example:'van'}, W:{sound:'/w/',example:'web'}, X:{sound:'/ks/',example:'fox'},
  Y:{sound:'/j/',example:'yes'}, Z:{sound:'/z/',example:'zebra'},
  SH:{sound:'/ʃ/',example:'ship'}, CH:{sound:'/tʃ/',example:'chip'}, TH:{sound:'/θ/',example:'thin'},
  WH:{sound:'/w/',example:'whale'}, PH:{sound:'/f/',example:'phone'}, CK:{sound:'/k/',example:'duck'},
  NG:{sound:'/ŋ/',example:'ring'}, QU:{sound:'/kw/',example:'queen'},
  AI:{sound:'/eɪ/',example:'rain'}, AY:{sound:'/eɪ/',example:'play'}, EE:{sound:'/iː/',example:'see'},
  EA:{sound:'/iː/',example:'sea'}, OA:{sound:'/oʊ/',example:'boat'}, OO:{sound:'/uː/',example:'moon'},
  OI:{sound:'/ɔɪ/',example:'coin'}, OY:{sound:'/ɔɪ/',example:'boy'}, OW:{sound:'/aʊ/',example:'cow'},
  IGH:{sound:'/aɪ/',example:'light'}
});
const $=s=>document.querySelector(s);
const $$=s=>[...document.querySelectorAll(s)];

function speak(text,{rate=.82}={}){
  if(!text||!('speechSynthesis'in window))return;
  speechSynthesis.cancel();
  const u=new SpeechSynthesisUtterance(text);
  u.lang='en-US';u.rate=rate;speechSynthesis.speak(u);
}
function audioAssetUrl(kind,key){
  return `./assets/audio/${kind}/${String(key||'').toLowerCase()}.mp3`;
}
async function playStructuredAudio(kind,key){
  const token=String(key||'').toUpperCase();
  if(!token)return;
  const profile=SOUND_PROFILES[token]||{};
  const recordingKey=`${kind}:${token}`;
  if(RECORDED_AUDIO_KEYS.has(recordingKey)){
    const audio=new Audio(audioAssetUrl(kind,token));
    try{await audio.play();return;}catch(_){}
  }
  if(kind==='name'){
    const spokenName=token.length>1?token.split('').join(' '):token;
    speak(spokenName,{rate:.72});
    return;
  }
  if(kind==='sound'){
    // Safe prototype fallback. Recorded phoneme files will replace this cue when installed.
    speak(profile.example||token,{rate:.68});
    return;
  }
  if(kind==='example'){speak(profile.example||token,{rate:.78});}
}
function colorFor(letter){
  const upper=String(letter||'').toUpperCase();
  return VOWELS.has(upper) ? PHONICS_COLORS.vowel : PHONICS_COLORS.consonant;
}
function normalizeLegacyColor(color, letter=''){
  const map={
    'foam-coral':'glyph-red',
    'foam-blue':'glyph-blue',
    'foam-green':'glyph-green',
    'foam-yellow':'glyph-yellow',
    'foam-purple':'glyph-purple'
  };
  return map[color] || color || colorFor(letter);
}
function analyzeWordPhonics(word){
  const text=String(word||'').toUpperCase().replace(/[^A-Z]/g,'');
  const result=[...text].map(letter=>({
    letter,
    role:VOWELS.has(letter)?'vowel':'consonant',
    color:colorFor(letter)
  }));

  const markPattern=(pattern,role,color)=>{
    let from=0;
    while(from<=text.length-pattern.length){
      const index=text.indexOf(pattern,from);
      if(index<0)break;
      for(let i=0;i<pattern.length;i++){
        result[index+i]={...result[index+i],role,color};
      }
      from=index+pattern.length;
    }
  };

  [...VOWEL_TEAMS].sort((a,b)=>b.length-a.length)
    .forEach(pattern=>markPattern(pattern,'vowel-team',PHONICS_COLORS.vowelTeam));
  DIGRAPHS.forEach(pattern=>markPattern(pattern,'digraph',PHONICS_COLORS.digraph));

  if(text.length>=3 && text.endsWith('E')){
    const last=text.length-1;
    const previousRole=result[last]?.role;
    if(previousRole!=='vowel-team'){
      result[last]={...result[last],role:'silent-e',color:PHONICS_COLORS.silentE};
    }
  }
  return result;
}
function clamp(n,min,max){return Math.max(min,Math.min(max,n));}

class EnglishMagneticBoard {
  constructor(){
    this.state=new BoardState([]);
    this.history=new BoardHistory(80);
    this.selectedIds=new Set();
    this.selectionMode='none';
    this.activeItemId=null;
    this.mode='free';
    this.caseMode='upper';
    this.colorMode=localStorage.getItem('englishLab.colorMode')||'phonics';
    this.interfaceMode=localStorage.getItem('englishLab.interfaceMode')||'teacher';
    this.wordCounter=0;
    this.exercise=null;
    this.platform=createPlatformAdapter(detectPlatformProfile());
    this.drag=null;
  }
  get items(){return this.state.items;}
  set items(value){this.state.replace(value);}
  init(){
    let restored=loadBoardState(localStorage,STORAGE_KEY);
    let migratedFrom=null;

    if(!restored?.items?.length){
      for(const legacyKey of LEGACY_STORAGE_KEYS){
        const legacy=loadBoardState(localStorage,legacyKey);
        if(legacy?.items?.length){
          restored=legacy;
          migratedFrom=legacyKey;
          break;
        }
      }
    }

    if(restored?.items?.length){
      restored.items.forEach(item=>{
        item.color=normalizeLegacyColor(item.color,item.logicalChar||item.displayGlyph||'');
      });
      this.state.replace(restored.items);

      const meta=restored.meta||{};
      if(['upper','lower'].includes(meta.caseMode))this.caseMode=meta.caseMode;
      if(['phonics','classic'].includes(meta.colorMode))this.colorMode=meta.colorMode;
      if(['student','teacher'].includes(meta.interfaceMode))this.interfaceMode=meta.interfaceMode;
      if(['free','build','completed','segment'].includes(meta.mode))this.mode=meta.mode;
    }

    this.bindControls();
    this.renderTray();
    this.renderGraphemeTrays();
    this.applyInterfaceMode(this.interfaceMode,true);

    const caseSelect=$('#englishCase'); if(caseSelect)caseSelect.value=this.caseMode;
    const colorSelect=$('#englishColorMode'); if(colorSelect)colorSelect.value=this.colorMode;

    this.setMode(this.mode||'free',true);
    this.renderBoard();
    this.updatePlatformBadge();

    const saved=this.persist();
    if(saved&&migratedFrom){
      try{localStorage.removeItem(migratedFrom);}catch(_){}
    }

    this.runDiagnostics(false);
    window.addEventListener('resize',()=>this.renderBoard());
  }
  persist(){
    return saveBoardState(localStorage,STORAGE_KEY,this.state,{
      schemaVersion:STORAGE_SCHEMA_VERSION,
      appVersion:APP_VERSION,
      mode:this.mode,
      caseMode:this.caseMode,
      colorMode:this.colorMode,
      interfaceMode:this.interfaceMode
    });
  }
  checkpoint(label){this.history.checkpoint(this.state.snapshot(),label);}
  undo(){
    const snap=this.history.undo(this.state.snapshot());if(!snap)return;
    this.state.restore(snap);this.clearSelection(false);this.renderBoard();this.toast('Undo');
  }
  redo(){
    const snap=this.history.redo(this.state.snapshot());if(!snap)return;
    this.state.restore(snap);this.clearSelection(false);this.renderBoard();this.toast('Redo');
  }
  updatePlatformBadge(){
    const el=$('#englishPlatformBadge');
    if(el)el.textContent=`${this.platform.profile.label} · ${this.platform.describe()}`;
  }
  setMode(mode,silent=false){
    const next=['free','build','completed','segment'].includes(mode)?mode:'free';
    this.mode=next;
    document.body.dataset.englishBoardMode=next;
    [['free','#englishModeFree'],['build','#englishModeBuild'],['completed','#englishModeCompleted'],['segment','#englishModeSegment']]
      .forEach(([key,sel])=>$(sel)?.classList.toggle('active',key===next));
    $('#englishBuildControls')?.classList.toggle('hidden',next!=='build');
    $('#englishCompletedControls')?.classList.toggle('hidden',next!=='completed');
    $('#englishSegmentControls')?.classList.toggle('hidden',next!=='segment');
    $('#englishAssemblyZone')?.classList.toggle('hidden',!(next==='build'&&this.exercise));
    const title=$('#englishBoardModeTitle'),hint=$('#englishBoardHint');
    if(next==='free'){
      if(title)title.textContent='Free magnetic board — every letter is independent';
      if(hint)hint.textContent='Pick a foam letter, move it anywhere, resize it, duplicate it, or build freely.';
    }else if(next==='build'){
      if(title)title.textContent='Build a word — scattered foam letters + answer slots';
      if(hint)hint.textContent='Scatter the target word, then drag each foam letter into the correct slot.';
    }else if(next==='completed'){
      if(title)title.textContent='Completed words — move the word or detach its letters';
      if(hint)hint.textContent='First tap selects the whole word. Detach lets you move each letter separately.';
    }else{
      if(title)title.textContent='Segment & Blend — move graphemes from sounds to a whole word';
      if(hint)hint.textContent='Spread the foam graphemes to hear the parts, then blend them together to read the word.';
    }
    this.persist();this.renderBoard();
    if(!silent)this.toast(next==='free'?'Free board':next==='build'?'Build word mode':next==='completed'?'Completed words mode':'Segment & Blend');
  }
  bindControls(){
    $('#englishModeFree')?.addEventListener('click',()=>this.setMode('free'));
    $('#englishModeBuild')?.addEventListener('click',()=>this.setMode('build'));
    $('#englishModeCompleted')?.addEventListener('click',()=>this.setMode('completed'));
    $('#englishModeSegment')?.addEventListener('click',()=>this.setMode('segment'));
    $('#englishUndo')?.addEventListener('click',()=>this.undo());
    $('#englishRedo')?.addEventListener('click',()=>this.redo());
    $('#englishSelectAll')?.addEventListener('click',()=>this.selectAll());
    $('#englishClearSelection')?.addEventListener('click',()=>this.clearSelection());
    $('#englishDetach')?.addEventListener('click',()=>this.detachSelectedWord());
    $('#englishRegroup')?.addEventListener('click',()=>this.regroupSelection());
    $('#englishSmaller')?.addEventListener('click',()=>this.resizeSelected(-.1));
    $('#englishResetSize')?.addEventListener('click',()=>this.resetSelectedSize());
    $('#englishLarger')?.addEventListener('click',()=>this.resizeSelected(.1));
    $('#englishDuplicate')?.addEventListener('click',()=>this.duplicateSelected());
    $('#englishDelete')?.addEventListener('click',()=>this.deleteSelected());
    $('#englishAlign')?.addEventListener('click',()=>this.autoAlignRows());
    $('#englishScatter')?.addEventListener('click',()=>this.scatterPieces());
    $('#englishSpeak')?.addEventListener('click',()=>this.pronounceBoard());
    $('#englishClear')?.addEventListener('click',()=>this.clearBoard());
    $('#englishCase')?.addEventListener('change',e=>{this.caseMode=e.target.value;this.renderTray();this.renderGraphemeTrays();this.renderBoard();this.persist();});
    $('#englishColorMode')?.addEventListener('change',e=>{
      this.colorMode=e.target.value==='classic'?'classic':'phonics';
      localStorage.setItem('englishLab.colorMode',this.colorMode);
      this.recolorAllPieces();
      this.renderTray();this.renderGraphemeTrays();this.renderBoard();
    });
    $('#studentModeBtn')?.addEventListener('click',()=>this.applyInterfaceMode('student'));
    $('#teacherModeBtn')?.addEventListener('click',()=>this.applyInterfaceMode('teacher'));
    $('#studentReturnTeacher')?.addEventListener('click',()=>this.applyInterfaceMode('teacher'));
    $('#englishStartBuild')?.addEventListener('click',()=>this.startBuild());
    $('#englishBuildWord')?.addEventListener('keydown',e=>{if(e.key==='Enter')this.startBuild();});
    $('#englishReshuffle')?.addEventListener('click',()=>this.reshuffleExercise());
    $('#englishCheck')?.addEventListener('click',()=>this.checkExercise());
    $('#englishHintBtn')?.addEventListener('click',()=>this.hintExercise());
    $('#englishShowTarget')?.addEventListener('change',()=>this.renderAssemblySlots());
    $('#englishAddCompleted')?.addEventListener('click',()=>this.addCompletedFromInput());
    $('#englishCompletedWord')?.addEventListener('keydown',e=>{if(e.key==='Enter')this.addCompletedFromInput();});
    $$('.english-preset-word').forEach(btn=>btn.addEventListener('click',()=>this.addCompletedWord(btn.dataset.word||'')));
    $('#englishStartSegment')?.addEventListener('click',()=>this.startSegmentBlend());
    $('#englishSegmentWord')?.addEventListener('keydown',e=>{if(e.key==='Enter')this.startSegmentBlend();});
    $$('.segment-presets [data-segment-word]').forEach(btn=>btn.addEventListener('click',()=>{
      const input=$('#englishSegmentWord'); if(input)input.value=btn.dataset.segmentWord||'';
      this.startSegmentBlend();
    }));
    $('#englishSpreadSegments')?.addEventListener('click',()=>this.spreadSegments());
    $('#englishBlendSegments')?.addEventListener('click',()=>this.blendSegments());
    $('#englishPlaySegmentWord')?.addEventListener('click',()=>{if(this.segmentState?.word)speak(this.segmentState.word);});
    $('#englishPlayName')?.addEventListener('click',()=>this.playSelectedAudio('name'));
    $('#englishPlaySound')?.addEventListener('click',()=>this.playSelectedAudio('sound'));
    $('#englishPlayExample')?.addEventListener('click',()=>this.playSelectedAudio('example'));
    $('#englishDiagnosticsBtn')?.addEventListener('click',()=>this.runDiagnostics(true));
    $('#englishRunDiagnostics')?.addEventListener('click',()=>this.runDiagnostics(true));
    $('#englishCloseDiagnostics')?.addEventListener('click',()=>$('#englishDiagnosticsPanel')?.classList.add('hidden'));
    $('#englishResetAppData')?.addEventListener('click',()=>this.resetAppData());
    $('#englishBoardCanvas')?.addEventListener('pointerdown',e=>{
      if(e.target.closest('.free-foam-piece'))return;
      if(this.selectedIds.size){this.clearSelection();}
    });
    window.addEventListener('keydown',e=>this.handleKeyboard(e));
  }
  handleKeyboard(event){
    const tag=document.activeElement?.tagName;
    if(['INPUT','TEXTAREA','SELECT'].includes(tag))return;
    const action=this.platform.actionForKey(event.key);
    if(!action||!this.activeItemId)return;
    if(action.type==='delete'){event.preventDefault();this.deleteSelected();return;}
    if(action.type==='move'){
      event.preventDefault();
      const moving=this.items.filter(i=>this.selectedIds.has(i.id));
      if(!moving.length)return;
      this.checkpoint('KEY_MOVE');
      moving.forEach(i=>{i.x+=action.dx;i.y+=action.dy;});
      this.renderBoard();
    }
  }
  display(letter){return this.caseMode==='lower'?String(letter).toLowerCase():String(letter).toUpperCase();}
  colorForToken(token,role=null){
    if(this.colorMode==='classic')return PHONICS_COLORS.consonant;
    if(role==='digraph')return PHONICS_COLORS.digraph;
    if(role==='vowel-team')return PHONICS_COLORS.vowelTeam;
    if(role==='silent-e')return PHONICS_COLORS.silentE;
    return colorFor(token);
  }
  renderTray(){
    const tray=$('#englishLetterTray');if(!tray)return;
    tray.innerHTML='';
    ALPHABET.forEach(letter=>{
      const b=document.createElement('button');b.type='button';
      const freeRole=VOWELS.has(letter)?'vowel':'consonant';
      b.className='foam-tray-letter';
      b.innerHTML=`<span class="foam-glyph ${this.colorForToken(letter,freeRole)}">${this.escape(this.display(letter))}</span>`;
      b.dataset.phonicsRole=freeRole;
      b.title=`${letter} · ${freeRole}`;
      b.setAttribute('aria-label',`Add foam letter ${letter}, ${freeRole}`);
      b.addEventListener('click',()=>this.addLetter(letter));
      tray.appendChild(b);
    });
  }
  renderGraphemeTrays(){
    const render=(selector,tokens,role)=>{
      const tray=$(selector);if(!tray)return;
      tray.innerHTML='';
      tokens.forEach(token=>{
        const b=document.createElement('button');b.type='button';b.className='grapheme-piece-btn';
        b.innerHTML=`<span class="foam-glyph ${this.colorForToken(token,role)}">${this.escape(this.display(token))}</span>`;
        b.title=`${token} · ${role}`;
        b.setAttribute('aria-label',`Add ${role} ${token}`);
        b.addEventListener('click',()=>this.addGrapheme(token,role));
        tray.appendChild(b);
      });
    };
    render('#englishDigraphTray',KIT_DIGRAPHS,'digraph');
    render('#englishVowelTeamTray',KIT_VOWEL_TEAMS,'vowel-team');
  }
  applyInterfaceMode(mode,silent=false){
    this.interfaceMode=mode==='student'?'student':'teacher';
    localStorage.setItem('englishLab.interfaceMode',this.interfaceMode);
    document.body.dataset.interfaceMode=this.interfaceMode;
    $('#studentModeBtn')?.classList.toggle('active',this.interfaceMode==='student');
    $('#teacherModeBtn')?.classList.toggle('active',this.interfaceMode==='teacher');
    if(!silent)this.toast(this.interfaceMode==='student'?'Student mode':'Teacher mode');
    this.persist();
  }
  recolorAllPieces(){
    this.items.forEach(item=>{
      item.color=this.colorForToken(item.logicalChar,item.phonicsRole);
    });
  }
  canvasRect(){return $('#englishBoardCanvas')?.getBoundingClientRect()||{width:700,height:500,left:0,top:0};}
  createPiece(letter,x,y,extra={}){
    return createLetterPiece({
      logicalChar:letter,displayGlyph:this.display(letter),
      color:extra.color||this.colorForToken(letter,extra.phonicsRole||null),
      x,y,rotation:(Math.random()*6-3),...extra
    });
  }
  addGrapheme(token,role){
    if(this.mode==='build'&&this.exercise){this.toast('Finish the build activity first');return;}
    const rect=this.canvasRect(),count=this.items.length;
    const x=30+((count*91)%Math.max(120,rect.width-140));
    const y=50+((Math.floor(count/6)*96)%Math.max(120,rect.height-135));
    this.checkpoint('ADD_GRAPHEME');
    const p=this.createPiece(token,x,y,{phonicsRole:role,color:this.colorForToken(token,role)});
    applyBoardCommand(this.state,{type:BOARD_COMMANDS.ADD_PIECE,piece:p});
    this.setSelection([p.id],'letter',p.id);this.renderBoard();
    this.updateSelectedAudio();
  }
  addLetter(letter){
    if(this.mode==='build'&&this.exercise){this.toast('Use the scattered exercise letters in Build mode');return;}
    const rect=this.canvasRect();
    const count=this.items.length;
    const x=30+((count*83)%Math.max(120,rect.width-120));
    const y=50+((Math.floor(count/7)*92)%Math.max(120,rect.height-130));
    this.checkpoint('ADD_PIECE');
    const role=VOWELS.has(letter)?'vowel':'consonant';
    const p=this.createPiece(letter,x,y,{phonicsRole:role,color:this.colorForToken(letter,role)});
    applyBoardCommand(this.state,{type:BOARD_COMMANDS.ADD_PIECE,piece:p});
    this.setSelection([p.id],'letter',p.id);this.renderBoard();speak(letter);
  }
  setSelection(ids,mode='multi',activeId=null){
    this.selectedIds=new Set((ids||[]).filter(Boolean));
    this.selectionMode=this.selectedIds.size?mode:'none';
    this.activeItemId=activeId&&this.selectedIds.has(activeId)?activeId:(this.selectedIds.values().next().value||null);
    this.updateSelectedAudio?.();
  }
  clearSelection(render=true){this.setSelection([], 'none', null);if(render)this.renderBoard();}
  selectAll(){
    const selectable=this.items.filter(i=>pieceCan(i,BOARD_CAPABILITIES.SELECTABLE));
    this.setSelection(selectable.map(i=>i.id),'all',selectable[0]?.id||null);this.renderBoard();this.toast(`${selectable.length} pieces selected`);
  }
  getWordIds(wordId){return wordId?this.items.filter(i=>i.wordId===wordId).map(i=>i.id):[];}
  isWholeWordSelected(item){
    if(!item?.wordId||this.selectionMode!=='word')return false;
    const ids=this.getWordIds(item.wordId);
    return ids.length>1&&ids.length===this.selectedIds.size&&ids.every(id=>this.selectedIds.has(id));
  }
  selectForInteraction(item,{additive=false}={}){
    if(additive){
      const next=new Set(this.selectedIds);next.has(item.id)?next.delete(item.id):next.add(item.id);
      this.setSelection([...next],next.size===1?'letter':'multi',item.id);return;
    }
    if(this.mode==='completed'&&item.wordId){
      if(this.isWholeWordSelected(item))this.setSelection([item.id],'letter',item.id);
      else this.setSelection(this.getWordIds(item.wordId),'word',item.id);
    }else this.setSelection([item.id],'letter',item.id);
  }
  renderBoard(){
    const canvas=$('#englishBoardCanvas');if(!canvas)return;
    const empty=canvas.querySelector('.english-board-empty');
    canvas.querySelectorAll('.free-foam-piece').forEach(el=>el.remove());
    const rect=this.canvasRect();
    const mobile=rect.width<640;
    this.items.forEach(item=>{
      if(item.type!=='letter')return;
      item.displayGlyph=this.display(item.logicalChar);
      item.x=clamp(Number(item.x)||0,4,Math.max(4,rect.width-72));
      item.y=clamp(Number(item.y)||0,4,Math.max(4,rect.height-82));
      const el=document.createElement('button');
      const legacyColor=normalizeLegacyColor(item.color,item.logicalChar||item.displayGlyph||'');
      item.color=this.colorMode==='classic'
        ? PHONICS_COLORS.consonant
        : (item.phonicsRole ? this.colorForToken(item.logicalChar,item.phonicsRole) : legacyColor);
      const visibleColor=item.color;
      const pieceHtml=`<span class="foam-piece-glyph foam-glyph ${visibleColor} pointer-events-none">${this.escape(this.display(item.logicalChar))}</span>`;
      decorateBoardPieceElement(el,{
        item,selected:this.selectedIds.has(item.id),selectionMode:this.selectionMode,mobile,
        minTouchTarget:this.platform.minTarget,contentHtml:pieceHtml
      });
      el.dataset.phonicsRole=item.phonicsRole||'';
      el.title=item.wordLabel||item.logicalChar;
      this.bindPiece(el,item);
      canvas.appendChild(el);
    });
    if(empty)empty.hidden=this.items.length>0;
    const count=$('#englishPieceCount');if(count)count.textContent=`${this.items.length} pieces`;
    const scale=$('#englishScaleValue');
    if(scale){
      const active=this.items.find(i=>i.id===this.activeItemId);
      scale.textContent=`${Math.round((active?.scale||1)*100)}%`;
    }
    this.persist();this.renderAssemblySlots();this.updateSelectedAudio();
  }
  bindPiece(el,item){
    el.addEventListener('pointerdown',e=>{
      if(e.pointerType==='mouse'&&e.button!==0)return;
      e.preventDefault();
      this.selectForInteraction(item,{additive:e.shiftKey||e.metaKey||e.ctrlKey});
      this.renderBoard();
      const start=this.state.find(item.id);if(!start)return;
      const rect=this.canvasRect();
      const targets=this.selectedIds.has(item.id)&&this.selectedIds.size>1
        ?this.items.filter(x=>this.selectedIds.has(x.id))
        :[start];
      const origins=targets.map(x=>({id:x.id,x:x.x,y:x.y}));
      const anchor={x:e.clientX,y:e.clientY};
      this.drag={pointerId:e.pointerId,anchor,origins,moved:false};
      el.setPointerCapture?.(e.pointerId);
    });
    el.addEventListener('pointermove',e=>{
      const d=this.drag;if(!d||d.pointerId!==e.pointerId)return;
      const dx=e.clientX-d.anchor.x,dy=e.clientY-d.anchor.y;
      if(!d.moved&&Math.hypot(dx,dy)<4)return;
      if(!d.moved){d.moved=true;this.checkpoint('MOVE_PIECE');}
      e.preventDefault();
      const rect=this.canvasRect();
      d.origins.forEach(o=>{
        const target=this.state.find(o.id);if(!target)return;
        target.x=clamp(o.x+dx,4,Math.max(4,rect.width-72));
        target.y=clamp(o.y+dy,4,Math.max(4,rect.height-82));
        const node=document.querySelector(`.free-foam-piece[data-piece-id="${CSS.escape(o.id)}"]`);
        if(node){node.style.left=`${target.x}px`;node.style.top=`${target.y}px`;node.classList.add('is-dragging');}
      });
    });
    const end=e=>{
      if(!this.drag||this.drag.pointerId!==e.pointerId)return;
      const drag=this.drag;
      const moved=drag.moved;
      drag.origins.forEach(o=>document.querySelector(`.free-foam-piece[data-piece-id="${CSS.escape(o.id)}"]`)?.classList.remove('is-dragging'));
      this.drag=null;
      if(moved&&this.mode==='build'&&this.exercise)this.snapDraggedToNearestSlot(item.id);
      this.renderBoard();
    };
    el.addEventListener('pointerup',end);el.addEventListener('pointercancel',end);
    el.addEventListener('dblclick',()=>speak(item.logicalChar));
  }
  selectedToken(){
    const item=this.items.find(i=>i.id===this.activeItemId);
    return item?.logicalChar||'';
  }
  updateSelectedAudio(){
    const label=$('#englishSelectedAudioLabel');if(!label)return;
    const token=this.selectedToken();
    if(!token){label.textContent='Select a letter or grapheme.';return;}
    const profile=SOUND_PROFILES[token]||{};
    label.textContent=`${token}${profile.sound?' · '+profile.sound:''}${profile.example?' · '+profile.example:''}`;
  }
  playSelectedAudio(kind){
    const token=this.selectedToken();
    if(!token){this.toast('Select a foam letter first');return;}
    playStructuredAudio(kind,token);
  }
  resizeSelected(delta){
    const selected=this.items.filter(i=>this.selectedIds.has(i.id)&&pieceCan(i,BOARD_CAPABILITIES.SCALABLE));
    if(!selected.length)return;
    this.checkpoint('RESIZE');
    applyBoardCommand(this.state,{type:BOARD_COMMANDS.RESIZE_PIECES,ids:selected.map(i=>i.id),delta,min:.5,max:2.5});
    this.renderBoard();
  }
  resetSelectedSize(){
    const selected=this.items.filter(i=>this.selectedIds.has(i.id));if(!selected.length)return;
    this.checkpoint('RESET_SIZE');selected.forEach(i=>i.scale=1);this.renderBoard();
  }
  duplicateSelected(){
    const src=this.items.find(i=>i.id===this.activeItemId);if(!src)return;
    this.checkpoint('DUPLICATE');
    const p=this.createPiece(src.logicalChar,src.x+28,src.y+28,{scale:src.scale,rotation:src.rotation,color:src.color,phonicsRole:src.phonicsRole||null});
    applyBoardCommand(this.state,{type:BOARD_COMMANDS.ADD_PIECE,piece:p});
    this.setSelection([p.id],'letter',p.id);this.renderBoard();
  }
  deleteSelected(){
    if(!this.selectedIds.size)return;
    this.checkpoint('DELETE');
    applyBoardCommand(this.state,{type:BOARD_COMMANDS.DELETE_PIECES,ids:[...this.selectedIds]});
    this.clearSelection(false);this.renderBoard();
  }
  clearBoard(){
    if(!this.items.length)return;
    this.checkpoint('CLEAR');this.state.replace([]);this.exercise=null;this.clearSelection(false);this.renderBoard();this.toast('Board cleared');
  }
  scatterPieces(){
    const targets=this.selectedIds.size?this.items.filter(i=>this.selectedIds.has(i.id)):this.items;
    if(!targets.length)return;
    this.checkpoint('SCATTER');const rect=this.canvasRect();
    targets.forEach(i=>{i.x=20+Math.random()*Math.max(30,rect.width-105);i.y=35+Math.random()*Math.max(30,rect.height-120);i.rotation=Math.random()*12-6;});
    this.renderBoard();
  }
  autoAlignRows(){
    if(!this.items.length)return;
    this.checkpoint('ALIGN');const rect=this.canvasRect();
    const groups=new Map();
    this.items.forEach(i=>{const key=i.wordId||'__free__';if(!groups.has(key))groups.set(key,[]);groups.get(key).push(i);});
    let row=0;
    groups.forEach(group=>{
      group.sort((a,b)=>a.x-b.x);
      const gap=Math.min(82,Math.max(55,(rect.width-100)/Math.max(group.length,1)));
      const total=(group.length-1)*gap;
      let x=Math.max(20,(rect.width-total-70)/2);const y=45+row*100;
      group.forEach(i=>{i.x=x;i.y=y;i.rotation=0;x+=gap;});row++;
    });
    this.renderBoard();
  }
  addCompletedFromInput(){
    const input=$('#englishCompletedWord');const value=input?.value||'';
    this.addCompletedWord(value);if(input)input.value='';
  }
  addCompletedWord(word){
    const clean=String(word||'').toUpperCase().replace(/[^A-Z\s]/g,'').trim().replace(/\s+/g,' ');
    if(!clean)return;
    this.checkpoint('ADD_WORD');const rect=this.canvasRect();
    const words=clean.split(' ');let rowY=45+new Set(this.items.filter(i=>i.wordId).map(i=>i.wordId)).size*100;
    words.forEach(token=>{
      const wordId=`word_${++this.wordCounter}_${Date.now()}`;
      const spacing=Math.min(80,Math.max(54,(rect.width-120)/Math.max(token.length,1)));
      const total=(token.length-1)*spacing;let x=Math.max(18,(rect.width-total-70)/2);
      const phonics=analyzeWordPhonics(token);
      [...token].forEach((letter,index)=>{
        const role=phonics[index]||{color:colorFor(letter),role:VOWELS.has(letter)?'vowel':'consonant'};
        const p=this.createPiece(letter,x,rowY,{wordId,wordLabel:token,rotation:0,color:role.color,phonicsRole:role.role});
        applyBoardCommand(this.state,{type:BOARD_COMMANDS.ADD_PIECE,piece:p});x+=spacing;
      });rowY+=100;
    });
    this.clearSelection(false);this.renderBoard();speak(clean);
  }
  detachSelectedWord(){
    const active=this.items.find(i=>i.id===this.activeItemId);
    const wordId=active?.wordId||this.items.find(i=>this.selectedIds.has(i.id)&&i.wordId)?.wordId;
    if(!wordId){this.toast('Select a completed word first');return;}
    const members=this.items.filter(i=>i.wordId===wordId);if(members.length<2)return;
    this.checkpoint('DETACH');
    const label=members[0].wordLabel||members.map(i=>i.logicalChar).join('');
    members.forEach(i=>{i.detachedFrom=wordId;i.detachedLabel=label;i.wordId=null;i.wordLabel=null;});
    this.setSelection(members.map(i=>i.id),'multi',members[0].id);this.renderBoard();this.toast('Word detached into independent foam letters');
  }
  regroupSelection(){
    let members=this.items.filter(i=>this.selectedIds.has(i.id)&&i.type==='letter');
    let key=null;
    if(members.length===1&&members[0].detachedFrom){
      key=members[0].detachedFrom;members=this.items.filter(i=>i.detachedFrom===key);
    }else{
      const keys=new Set(members.map(i=>i.detachedFrom).filter(Boolean));if(keys.size===1)key=[...keys][0];
    }
    if(members.length<2){this.toast('Select at least two letters');return;}
    this.checkpoint('REGROUP');
    members.sort((a,b)=>a.x-b.x);
    const label=members[0].detachedLabel||members.map(i=>i.logicalChar).join('');
    const wordId=key||`word_${++this.wordCounter}_${Date.now()}`;
    members.forEach(i=>{i.wordId=wordId;i.wordLabel=label;delete i.detachedFrom;delete i.detachedLabel;});
    this.setSelection(members.map(i=>i.id),'word',members[0].id);this.renderBoard();this.toast('Letters regrouped as one word');
  }
  pronounceBoard(){
    const groups=new Map();
    this.items.filter(i=>i.type==='letter').forEach(i=>{const key=i.wordId||'__free__';if(!groups.has(key))groups.set(key,[]);groups.get(key).push(i);});
    const text=[...groups.values()].map(g=>g.sort((a,b)=>a.x-b.x).map(i=>i.logicalChar).join('')).join(' ').trim();
    if(text)speak(text);
  }
  segmentGraphemes(word){
    const text=String(word||'').toUpperCase().replace(/[^A-Z]/g,'');
    const patterns=[...VOWEL_TEAMS,...DIGRAPHS].sort((a,b)=>b.length-a.length);
    const out=[];let i=0;
    while(i<text.length){
      const pattern=patterns.find(p=>text.startsWith(p,i));
      if(pattern){out.push(pattern);i+=pattern.length;}
      else{out.push(text[i]);i+=1;}
    }
    return out;
  }
  startSegmentBlend(){
    const input=$('#englishSegmentWord');
    const word=String(input?.value||'').toUpperCase().replace(/[^A-Z]/g,'').slice(0,14);
    if(!word){this.toast('Type a word first');return;}
    this.setMode('segment',true);
    this.checkpoint('START_SEGMENT');
    this.state.replace([]);this.clearSelection(false);
    const graphemes=this.segmentGraphemes(word);
    const phonics=analyzeWordPhonics(word);
    let cursor=0;
    const ids=[];
    const rect=this.canvasRect();
    graphemes.forEach((token,index)=>{
      const start=cursor,end=cursor+token.length;
      const roles=phonics.slice(start,end).map(x=>x.role);
      const role=roles.includes('vowel-team')?'vowel-team'
        :roles.includes('digraph')?'digraph'
        :roles.includes('silent-e')?'silent-e'
        :(VOWELS.has(token)?'vowel':'consonant');
      const p=this.createPiece(token,40+index*100,rect.height*.34,{
        rotation:0,phonicsRole:role,color:this.colorForToken(token,role),
        segmentIndex:index,segmentWord:word
      });
      applyBoardCommand(this.state,{type:BOARD_COMMANDS.ADD_PIECE,piece:p});
      ids.push(p.id);cursor=end;
    });
    this.segmentState={word,graphemes,ids,blended:false};
    this.spreadSegments(false);
    this.setSegmentStatus(`${graphemes.length} sound-spelling pieces: ${graphemes.join(' · ')}`);
    this.renderBoard();
  }
  spreadSegments(checkpoint=true){
    if(!this.segmentState)return;
    if(checkpoint)this.checkpoint('SPREAD_SEGMENTS');
    const rect=this.canvasRect(),pieces=this.segmentState.ids.map(id=>this.state.find(id)).filter(Boolean);
    const gap=Math.min(145,Math.max(90,(rect.width-120)/Math.max(pieces.length,1)));
    const total=(pieces.length-1)*gap;
    let x=Math.max(24,(rect.width-total-90)/2);
    const y=Math.max(90,rect.height*.34);
    pieces.forEach(piece=>{piece.x=x;piece.y=y;piece.rotation=0;x+=gap;});
    this.segmentState.blended=false;
    this.renderBoard();
  }
  blendSegments(){
    if(!this.segmentState)return;
    this.checkpoint('BLEND_SEGMENTS');
    const rect=this.canvasRect(),pieces=this.segmentState.ids.map(id=>this.state.find(id)).filter(Boolean);
    const gap=58;
    const total=(pieces.length-1)*gap;
    let x=Math.max(24,(rect.width-total-90)/2);
    const y=Math.max(90,rect.height*.34);
    pieces.forEach(piece=>{piece.x=x;piece.y=y;piece.rotation=0;x+=gap;});
    this.segmentState.blended=true;
    this.renderBoard();
    this.setSegmentStatus(`Blend: ${this.segmentState.word}`,'good');
    setTimeout(()=>speak(this.segmentState?.word||''),260);
  }
  setSegmentStatus(message,type='info'){
    const el=$('#englishSegmentStatus');if(!el)return;
    el.textContent=message;el.dataset.type=type;
  }
  startBuild(){
    const input=$('#englishBuildWord');const word=String(input?.value||'').toUpperCase().replace(/[^A-Z]/g,'').slice(0,14);
    if(!word){this.toast('Type an English word first');return;}
    if(this.mode!=='build')this.setMode('build',true);
    this.checkpoint('START_EXERCISE');this.state.replace([]);this.clearSelection(false);
    this.exercise={id:`exercise_${Date.now()}`,word,letters:[...word],slots:Array(word.length).fill(null),attempts:0};
    const order=[...this.exercise.letters.keys()];
    for(let i=order.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[order[i],order[j]]=[order[j],order[i]];}
    const rect=this.canvasRect();
    const phonics=analyzeWordPhonics(word);
    order.forEach((targetIndex,k)=>{
      const cols=Math.max(2,Math.min(word.length,Math.floor((rect.width-50)/90)));
      const col=k%cols,row=Math.floor(k/cols);
      const role=phonics[targetIndex]||{color:colorFor(word[targetIndex]),role:VOWELS.has(word[targetIndex])?'vowel':'consonant'};
      const p=this.createPiece(word[targetIndex],35+col*90+(Math.random()*18-9),65+row*100+(Math.random()*18-9),{
        exerciseId:this.exercise.id,exerciseTargetIndex:targetIndex,color:role.color,phonicsRole:role.role
      });
      applyBoardCommand(this.state,{type:BOARD_COMMANDS.ADD_PIECE,piece:p});
    });
    $('#englishAssemblyZone')?.classList.remove('hidden');this.renderBoard();this.setExerciseStatus(`Scattered ${word.length} foam letters. Arrange them in the slots.`);
  }
  reshuffleExercise(){
    if(!this.exercise){this.startBuild();return;}
    this.exercise.slots=Array(this.exercise.word.length).fill(null);
    this.items.forEach(i=>i.exerciseSlot=null);this.scatterPieces();this.renderAssemblySlots();this.setExerciseStatus('Letters scattered again.');
  }
  slotGeometry(){
    const canvas=this.canvasRect();const zone=$('#englishAssemblySlots');if(!zone)return[];
    const zoneRect=zone.getBoundingClientRect();
    return [...zone.querySelectorAll('.english-answer-slot')].map((el,index)=>{
      const r=el.getBoundingClientRect();
      return {index,left:r.left-canvas.left,top:r.top-canvas.top,width:r.width,height:r.height,cx:r.left-canvas.left+r.width/2,cy:r.top-canvas.top+r.height/2};
    });
  }
  snapDraggedToNearestSlot(pieceId){
    if(!this.exercise)return;
    const item=this.state.find(pieceId);if(!item)return;
    const slots=this.slotGeometry();if(!slots.length)return;
    const px=item.x+35,py=item.y+38;
    let best=null,dist=Infinity;
    slots.forEach(s=>{const d=Math.hypot(px-s.cx,py-s.cy);if(d<dist){dist=d;best=s;}});
    if(best&&dist<105){
      this.exercise.slots=this.exercise.slots.map(id=>id===pieceId?null:id);
      const displaced=this.exercise.slots[best.index];
      if(displaced){const old=this.state.find(displaced);if(old)old.exerciseSlot=null;}
      this.exercise.slots[best.index]=pieceId;item.exerciseSlot=best.index;
      item.x=best.left+(best.width-70)/2;item.y=best.top+(best.height-76)/2;
      this.renderBoard();
    }
  }
  renderAssemblySlots(){
    const zone=$('#englishAssemblyZone'),slots=$('#englishAssemblySlots'),target=$('#englishTargetBadge');
    if(!zone||!slots)return;
    if(!this.exercise){zone.classList.add('hidden');return;}
    zone.classList.remove('hidden');
    if(target){
      const show=$('#englishShowTarget')?.checked!==false;
      target.textContent=show?this.exercise.word:`${this.exercise.word.length} letters`;
    }
    slots.innerHTML='';
    this.exercise.word.split('').forEach((letter,index)=>{
      const el=document.createElement('div');el.className='english-answer-slot';el.dataset.slot=String(index);
      const pieceId=this.exercise.slots[index],item=pieceId?this.state.find(pieceId):null;
      if(item){el.classList.add('filled');el.textContent=this.display(item.logicalChar);}
      else el.innerHTML='<span>'+String(index+1)+'</span>';
      slots.appendChild(el);
    });
  }
  checkExercise(){
    if(!this.exercise)return;
    this.exercise.attempts++;
    const actual=this.exercise.slots.map(id=>id?this.state.find(id)?.logicalChar||'':'').join('');
    if(actual===this.exercise.word){this.setExerciseStatus('Correct! The word is complete.','good');speak(this.exercise.word);}
    else if(actual.length<this.exercise.word.length||this.exercise.slots.some(x=>!x)){this.setExerciseStatus('Place every foam letter into a slot first.','bad');}
    else{
      const correct=this.exercise.word.split('').filter((c,i)=>c===actual[i]).length;
      this.setExerciseStatus(`Not yet — ${correct} of ${this.exercise.word.length} letters are in the correct position.`,'bad');
    }
  }
  hintExercise(){
    if(!this.exercise)return;
    const index=this.exercise.slots.findIndex((id,i)=>!id||this.state.find(id)?.logicalChar!==this.exercise.word[i]);
    if(index<0){this.checkExercise();return;}
    const needed=this.exercise.word[index];
    const candidate=this.items.find(i=>i.logicalChar===needed&&i.exerciseSlot!==index);
    if(!candidate)return;
    this.setSelection([candidate.id],'letter',candidate.id);this.renderBoard();this.setExerciseStatus(`Hint: move ${needed} to position ${index+1}.`);
  }
  setExerciseStatus(message,type='info'){
    const el=$('#englishExerciseStatus');if(!el)return;
    el.textContent=message;el.dataset.type=type;
  }
  async runDiagnostics(showPanel=true){
    const checks=[];
    const add=(name,ok,detail='')=>checks.push({name,ok:Boolean(ok),detail:String(detail||'')});

    add('Magnetic board canvas',Boolean($('#englishBoardCanvas')),'Required UI');
    add('Letter tray',Boolean($('#englishLetterTray')),'A–Z source');
    add('Digraph tray',Boolean($('#englishDigraphTray')),'SH / CH / TH…');
    add('Vowel-team tray',Boolean($('#englishVowelTeamTray')),'AI / EE / OA…');
    add('Build mode controls',Boolean($('#englishBuildControls')),'Shared board builder');
    add('Segment & Blend controls',Boolean($('#englishSegmentControls')),'Phonics manipulative');
    add('Student / Teacher switch',Boolean($('#studentModeBtn')&&$('#teacherModeBtn')),'Experience modes');

    try{
      const a=createLetterPiece({logicalChar:'A'});
      add('Single-letter board model',a.logicalChar==='A','createLetterPiece(A)');
    }catch(error){add('Single-letter board model',false,error.message);}

    try{
      const sh=createLetterPiece({logicalChar:'SH'});
      add('Multi-letter grapheme model',sh.logicalChar==='SH','createLetterPiece(SH)');
    }catch(error){add('Multi-letter grapheme model',false,error.message);}

    try{
      const segments=this.segmentGraphemes('SHIP');
      add('Segment tokenizer',segments.join('|')==='SH|I|P',segments.join(' · '));
    }catch(error){add('Segment tokenizer',false,error.message);}

    try{
      const probe='englishLab.__diagnostic__';
      localStorage.setItem(probe,'ok');
      const ok=localStorage.getItem(probe)==='ok';
      localStorage.removeItem(probe);
      add('Local storage',ok,ok?'Read/write available':'Unavailable');
    }catch(error){add('Local storage',false,error.message);}

    add('Stable board storage',STORAGE_KEY==='englishLab.board',STORAGE_KEY);
    add('Undo / Redo engine',Boolean(this.history&&typeof this.undo==='function'&&typeof this.redo==='function'),'BoardHistory');
    add('Pointer board interactions',typeof PointerEvent!=='undefined','Pointer Events');

    let swDetail='Not supported';
    let swOk=false;
    if('serviceWorker'in navigator){
      try{
        const registration=await navigator.serviceWorker.getRegistration();
        swOk=Boolean(registration);
        swDetail=registration?(navigator.serviceWorker.controller?'registered + controlling':'registered, activation pending'):'not registered';
      }catch(error){swDetail=error.message;}
    }
    add('Service Worker',swOk,swDetail);

    let cacheDetail='Cache API unavailable';
    let cacheOk=false;
    if('caches'in window){
      try{
        const names=await caches.keys();
        const current=names.find(name=>name.includes('english-language-lab-v14'));
        cacheOk=Boolean(current);
        cacheDetail=current||names.join(', ')||'no cache yet';
      }catch(error){cacheDetail=error.message;}
    }
    add('Current PWA cache',cacheOk,cacheDetail);

    this.lastDiagnostics=checks;
    const passed=checks.filter(check=>check.ok).length;
    const list=$('#englishDiagnosticsList');
    if(list){
      list.innerHTML=checks.map(check=>`
        <div class="diagnostic-row ${check.ok?'pass':'fail'}">
          <span class="diagnostic-icon">${check.ok?'✓':'!'}</span>
          <div><strong>${this.escape(check.name)}</strong><small>${this.escape(check.detail)}</small></div>
        </div>`).join('');
    }

    const version=$('#englishDiagVersion');if(version)version.textContent=`v${APP_VERSION}`;
    const platform=$('#englishDiagPlatform');if(platform)platform.textContent=this.platform.profile.label;
    const pieces=$('#englishDiagPieces');if(pieces)pieces.textContent=String(this.items.length);

    const panel=$('#englishDiagnosticsPanel');
    if(panel){
      panel.dataset.status=passed===checks.length?'pass':'attention';
      if(showPanel)panel.classList.remove('hidden');
    }
    return {passed,total:checks.length,checks};
  }
  async resetAppData(){
    const confirmed=window.confirm('Reset English Language Lab data on this device? This clears the board, progress, settings and cached app files.');
    if(!confirmed)return;

    try{
      Object.keys(localStorage).filter(key=>key.startsWith('englishLab.')).forEach(key=>localStorage.removeItem(key));
    }catch(_){}

    if('caches'in window){
      try{
        const names=await caches.keys();
        await Promise.all(names.filter(name=>name.startsWith('english-language-lab-')).map(name=>caches.delete(name)));
      }catch(_){}
    }

    this.toast('App data reset');
    setTimeout(()=>window.location.reload(),350);
  }
  escape(s){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
  toast(message){
    const el=$('#englishBoardToast');if(!el)return;
    el.textContent=message;el.classList.add('show');clearTimeout(this.toastTimer);
    this.toastTimer=setTimeout(()=>el.classList.remove('show'),1600);
  }
}

const englishBoard=new EnglishMagneticBoard();
window.englishBoard=englishBoard;
window.addEventListener('DOMContentLoaded',()=>englishBoard.init());
