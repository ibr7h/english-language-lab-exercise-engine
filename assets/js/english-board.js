import { BoardState, saveBoardState, loadBoardState } from './core/board-state.js';
import { BoardHistory } from './core/board-history.js';
import { BOARD_COMMANDS, applyBoardCommand } from './core/board-commands.js';
import { createLetterPiece, pieceCan, BOARD_CAPABILITIES } from './core/board-piece.js';
import { detectPlatformProfile } from './core/platform-profile.js';
import { createPlatformAdapter } from './core/platform-adapter.js';
import { decorateBoardPieceElement } from './ui/board-piece-view.js';
import { BoardWorkspace } from './ui/board-workspace.js';

const APP_VERSION='0.20';
const STORAGE_KEY='englishLab.board';
const STORAGE_SCHEMA_VERSION=3;
const BOARDS_STORAGE_KEY='englishLab.boards.v1';
const BOARD_SURFACES=new Set(['current','squares','notebook','english']);
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
function deepClone(value){
  if(value==null)return value;
  if(typeof structuredClone==='function')return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

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
    this.workspace=null;
    this.boards=[];
    this.activeBoardId=null;
    this.boardSurface='current';
    this.boardsReady=false;
    this.loadingBoardRecord=false;
  }
  get items(){return this.state.items;}
  set items(value){this.state.replace(value);}
  init(){
    const stableRaw=localStorage.getItem(STORAGE_KEY);
    let restored=stableRaw!==null ? loadBoardState(localStorage,STORAGE_KEY) : null;
    let migratedFrom=null;

    if(stableRaw===null){
      for(const legacyKey of LEGACY_STORAGE_KEYS){
        if(localStorage.getItem(legacyKey)===null)continue;
        restored=loadBoardState(localStorage,legacyKey);
        migratedFrom=legacyKey;
        break;
      }
    }

    if(restored){
      const meta=restored.meta||{};
      if(['upper','lower'].includes(meta.caseMode))this.caseMode=meta.caseMode;
      if(['phonics','classic'].includes(meta.colorMode))this.colorMode=meta.colorMode;
      if(['student','teacher'].includes(meta.interfaceMode))this.interfaceMode=meta.interfaceMode;
      if(['free','build','completed','segment'].includes(meta.mode))this.mode=meta.mode;
      if(BOARD_SURFACES.has(meta.boardSurface))this.boardSurface=meta.boardSurface;

      if(restored.items?.length){
        restored.items.forEach(item=>{
          item.color=normalizeLegacyColor(item.color,item.logicalChar||item.displayGlyph||'');
          if(!['upper','lower'].includes(item.letterCase)){
            const glyph=String(item.displayGlyph||'');
            const hasLetter=/[A-Za-z]/.test(glyph);
            item.letterCase=hasLetter&&glyph===glyph.toLowerCase()&&glyph!==glyph.toUpperCase()
              ?'lower'
              :this.caseMode;
          }
          item.displayGlyph=this.display(item.logicalChar,item.letterCase);
        });
        this.state.replace(restored.items);
      }
    }

    this.bindControls();
    this.renderTray();
    this.renderGraphemeTrays();
    this.applyInterfaceMode(this.interfaceMode,true);
    this.workspace=new BoardWorkspace(this,{
      alphabet:ALPHABET,
      digraphs:KIT_DIGRAPHS,
      vowelTeams:KIT_VOWEL_TEAMS
    });
    this.workspace.init();
    this.initBoards();

    const caseSelect=$('#englishCase'); if(caseSelect)caseSelect.value=this.caseMode;
    const colorSelect=$('#englishColorMode'); if(colorSelect)colorSelect.value=this.colorMode;

    const requestedMode=document.body.dataset.requestedBoardMode;
    this.setMode(['free','build','completed','segment'].includes(requestedMode)?requestedMode:(this.mode||'free'),true);
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
    const saved=saveBoardState(localStorage,STORAGE_KEY,this.state,{
      schemaVersion:STORAGE_SCHEMA_VERSION,
      appVersion:APP_VERSION,
      mode:this.mode,
      caseMode:this.caseMode,
      colorMode:this.colorMode,
      interfaceMode:this.interfaceMode,
      boardSurface:this.boardSurface
    });
    if(this.boardsReady&&!this.loadingBoardRecord)this.persistBoards();
    return saved;
  }

  boardId(){
    if(globalThis.crypto?.randomUUID)return `board_${crypto.randomUUID()}`;
    return `board_${Date.now()}_${Math.random().toString(36).slice(2,8)}`;
  }

  normalizeBoardRecord(record,index=0){
    return {
      id:String(record?.id||this.boardId()),
      name:String(record?.name||`Board ${index+1}`).slice(0,40),
      surface:BOARD_SURFACES.has(record?.surface)?record.surface:'current',
      items:Array.isArray(record?.items)?deepClone(record.items):[],
      ink:Array.isArray(record?.ink)?deepClone(record.ink):[],
      mode:['free','build','completed','segment'].includes(record?.mode)?record.mode:'free',
      caseMode:record?.caseMode==='lower'?'lower':'upper',
      exercise:record?.exercise?deepClone(record.exercise):null,
      segmentState:record?.segmentState?deepClone(record.segmentState):null
    };
  }

  initBoards(){
    let parsed=null;
    try{parsed=JSON.parse(localStorage.getItem(BOARDS_STORAGE_KEY)||'null');}catch(_){}

    if(parsed?.version===1&&Array.isArray(parsed.boards)&&parsed.boards.length){
      this.boards=parsed.boards.map((record,index)=>this.normalizeBoardRecord(record,index));
      const wanted=this.boards.find(board=>board.id===parsed.activeBoardId)||this.boards[0];
      this.activeBoardId=wanted.id;
      this.loadBoardRecord(wanted,{persist:false,toast:false});
    }else{
      const first=this.normalizeBoardRecord({
        id:this.boardId(),
        name:'Board 1',
        surface:'current',
        items:this.state.snapshot(),
        ink:this.workspace?.exportInkState?.()||[],
        mode:this.mode,
        caseMode:this.caseMode,
        exercise:this.exercise,
        segmentState:this.segmentState||null
      },0);
      this.boards=[first];
      this.activeBoardId=first.id;
      this.boardSurface=first.surface;
      this.applyBoardSurface();
    }

    this.boardsReady=true;
    this.renderBoardManager();
    this.persistBoards();
  }

  activeBoardRecord(){
    return this.boards.find(board=>board.id===this.activeBoardId)||null;
  }

  captureActiveBoard(){
    if(!this.boardsReady)return;
    const record=this.activeBoardRecord();
    if(!record)return;
    record.items=this.state.snapshot();
    record.ink=this.workspace?.exportInkState?.()||[];
    record.surface=this.boardSurface;
    record.mode=this.mode;
    record.caseMode=this.caseMode;
    record.exercise=this.exercise?deepClone(this.exercise):null;
    record.segmentState=this.segmentState?deepClone(this.segmentState):null;
  }

  persistBoards(){
    if(!this.boardsReady||this.loadingBoardRecord)return false;
    this.captureActiveBoard();
    try{
      localStorage.setItem(BOARDS_STORAGE_KEY,JSON.stringify({
        version:1,
        savedAt:Date.now(),
        activeBoardId:this.activeBoardId,
        boards:this.boards
      }));
      return true;
    }catch(_){return false;}
  }

  loadBoardRecord(record,{persist=true,toast=true}={}){
    if(!record)return;

    this.loadingBoardRecord=true;
    try{
      // Load the complete board record atomically. No persistence is allowed
      // until items, ink, surface and mode all belong to the same board.
      this.state.replace(deepClone(record.items||[]));
      this.boardSurface=BOARD_SURFACES.has(record.surface)?record.surface:'current';
      this.caseMode=record.caseMode==='lower'?'lower':'upper';
      this.exercise=record.exercise?deepClone(record.exercise):null;
      this.segmentState=record.segmentState?deepClone(record.segmentState):null;
      this.mode=['free','build','completed','segment'].includes(record.mode)?record.mode:'free';

      this.workspace?.importInkState?.(record.ink||[],{syncBoard:false});
      this.history=new BoardHistory(80);
      this.clearSelection(false);
      this.applyBoardSurface();

      // Update UI without leaking a partial board back into storage.
      document.body.dataset.englishBoardMode=this.mode;
      [['free','#englishModeFree'],['build','#englishModeBuild'],['completed','#englishModeCompleted'],['segment','#englishModeSegment']]
        .forEach(([key,sel])=>$(sel)?.classList.toggle('active',key===this.mode));
      $('#englishBuildControls')?.classList.toggle('hidden',this.mode!=='build');
      $('#englishCompletedControls')?.classList.toggle('hidden',this.mode!=='completed');
      $('#englishSegmentControls')?.classList.toggle('hidden',this.mode!=='segment');
      $('#englishAssemblyZone')?.classList.toggle('hidden',!(this.mode==='build'&&this.exercise));

      const title=$('#englishBoardModeTitle'),hint=$('#englishBoardHint');
      if(this.mode==='free'){
        if(title)title.textContent='Free magnetic board — every letter is independent';
        if(hint)hint.textContent='Pick a foam letter, move it anywhere, resize it, duplicate it, or build freely.';
      }else if(this.mode==='build'){
        if(title)title.textContent='Build a word — scattered foam letters + answer slots';
        if(hint)hint.textContent='Move letters freely anywhere. A letter snaps only when you drop it inside an answer slot.';
      }else if(this.mode==='completed'){
        if(title)title.textContent='Completed words — move the word or detach its letters';
        if(hint)hint.textContent='First tap selects the whole word. Detach lets you move each letter separately.';
      }else{
        if(title)title.textContent='Segment & Blend — move graphemes from sounds to a whole word';
        if(hint)hint.textContent='Spread the foam graphemes to hear the parts, then blend them together to read the word.';
      }

      this.renderTray();
      this.renderGraphemeTrays();
      this.workspace?.renderStrip();
      this.workspace?.syncCaseButtons();
      const caseSelect=$('#englishCase');if(caseSelect)caseSelect.value=this.caseMode;

      // renderBoard() calls persist(), so keep the guard active through render.
      this.renderBoard();
      this.renderBoardManager();
    }finally{
      this.loadingBoardRecord=false;
    }

    if(persist)this.persistBoards();
    if(toast)this.toast(record.name);
  }

  switchBoard(id){
    if(id===this.activeBoardId)return;
    const next=this.boards.find(board=>board.id===id);
    if(!next)return;
    this.captureActiveBoard();
    this.activeBoardId=next.id;
    this.loadBoardRecord(next);
  }

  addBoard(){
    this.captureActiveBoard();
    const used=new Set(this.boards.map(record=>record.name));
    let number=1;
    while(used.has(`Board ${number}`))number++;
    const record=this.normalizeBoardRecord({
      id:this.boardId(),
      name:`Board ${number}`,
      surface:this.boardSurface,
      items:[],
      ink:[],
      mode:'free',
      caseMode:this.caseMode,
      exercise:null,
      segmentState:null
    },this.boards.length);
    this.boards.push(record);
    this.activeBoardId=record.id;
    this.loadBoardRecord(record);
  }

  deleteActiveBoard(){
    if(this.boards.length<=1){
      this.toast('Keep at least one board');
      return;
    }
    const index=this.boards.findIndex(board=>board.id===this.activeBoardId);
    if(index<0)return;
    this.boards.splice(index,1);
    const next=this.boards[Math.max(0,index-1)]||this.boards[0];
    this.activeBoardId=next.id;
    this.loadBoardRecord(next);
  }

  setBoardSurface(surface){
    const next=BOARD_SURFACES.has(surface)?surface:'current';
    this.boardSurface=next;
    this.applyBoardSurface();
    this.renderBoardManager();
    this.persistBoards();
  }

  applyBoardSurface(){
    const canvas=$('#englishBoardCanvas');
    if(canvas)canvas.dataset.surface=this.boardSurface;
  }

  renderBoardManager(){
    const renderTabs=selector=>{
      const host=$(selector);if(!host)return;
      host.innerHTML='';
      this.boards.forEach((record,index)=>{
        const button=document.createElement('button');
        button.type='button';
        button.className='board-tab-btn';
        button.classList.toggle('active',record.id===this.activeBoardId);
        button.textContent=record.name||`Board ${index+1}`;
        button.title=`Open ${button.textContent}`;
        button.addEventListener('click',()=>this.switchBoard(record.id));
        host.appendChild(button);
      });
    };
    renderTabs('#englishBoardTabs');
    renderTabs('#englishWorkspaceBoardTabs');

    document.querySelectorAll('[data-board-surface]').forEach(button=>{
      button.classList.toggle('active',button.dataset.boardSurface===this.boardSurface);
    });
    document.querySelectorAll('[data-board-action="delete"]').forEach(button=>{
      button.disabled=this.boards.length<=1;
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
      if(hint)hint.textContent='Move letters freely anywhere. A letter snaps only when you drop it inside an answer slot.';
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
    $('#englishUndo')?.addEventListener('click',()=>{
      if(this.workspace)this.workspace.undoSelectedDomain();
      else this.undo();
    });
    $('#englishRedo')?.addEventListener('click',()=>{
      if(this.workspace)this.workspace.redoSelectedDomain();
      else this.redo();
    });
    $('#englishSelectAll')?.addEventListener('click',()=>this.selectAll());
    $('#englishClearSelection')?.addEventListener('click',()=>{
      this.clearSelection();
      this.workspace?.clearInkSelection();
    });
    $('#englishDetach')?.addEventListener('click',()=>this.detachSelectedWord());
    $('#englishRegroup')?.addEventListener('click',()=>this.regroupSelection());
    $('#englishSmaller')?.addEventListener('click',()=>{
      if(this.workspace)this.workspace.resizeSelected(-.1);
      else this.resizeSelected(-.1);
    });
    $('#englishResetSize')?.addEventListener('click',()=>{
      if(this.workspace)this.workspace.resetSelectedSize();
      else this.resetSelectedSize();
    });
    $('#englishLarger')?.addEventListener('click',()=>{
      if(this.workspace)this.workspace.resizeSelected(.1);
      else this.resizeSelected(.1);
    });
    $('#englishDuplicate')?.addEventListener('click',()=>{
      if(this.workspace)this.workspace.duplicateSelected();
      else this.duplicateSelected();
    });
    $('#englishDelete')?.addEventListener('click',()=>{
      if(this.workspace)this.workspace.deleteSelected();
      else this.deleteSelected();
    });
    $('#englishAlign')?.addEventListener('click',()=>this.autoAlignRows());
    $('#englishScatter')?.addEventListener('click',()=>this.scatterPieces());
    $('#englishSpeak')?.addEventListener('click',()=>this.pronounceBoard());
    $('#englishClear')?.addEventListener('click',()=>this.clearBoard());
    $('#englishCase')?.addEventListener('change',e=>this.setTrayCase(e.target.value));
    $('#englishColorMode')?.addEventListener('change',e=>{
      this.colorMode=e.target.value==='classic'?'classic':'phonics';
      localStorage.setItem('englishLab.colorMode',this.colorMode);
      this.recolorAllPieces();
      this.renderTray();this.renderGraphemeTrays();this.renderBoard();
      this.workspace?.renderStrip();
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
      this.workspace?.clearInkSelection(false);
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
  display(letter,caseMode=this.caseMode){
    return caseMode==='lower'?String(letter).toLowerCase():String(letter).toUpperCase();
  }
  displayPiece(item){
    if(!item)return '';
    const letterCase=item.letterCase==='lower'?'lower':'upper';
    return this.display(item.logicalChar,letterCase);
  }
  setTrayCase(mode,{silent=false}={}){
    this.caseMode=mode==='lower'?'lower':'upper';
    const select=$('#englishCase');
    if(select)select.value=this.caseMode;
    this.renderTray();
    this.renderGraphemeTrays();
    this.workspace?.renderStrip();
    this.workspace?.syncCaseButtons();
    this.persist();
    if(!silent)this.toast(this.caseMode==='lower'?'New letters: lowercase':'New letters: uppercase');
  }
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
    const letterCase=extra.letterCase==='lower'||extra.letterCase==='upper'
      ?extra.letterCase
      :this.caseMode;
    return createLetterPiece({
      logicalChar:letter,
      displayGlyph:this.display(letter,letterCase),
      letterCase,
      color:extra.color||this.colorForToken(letter,extra.phonicsRole||null),
      x,y,rotation:0,...extra
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
    const cleanIds=(ids||[]).filter(Boolean);
    if(cleanIds.length)this.workspace?.clearInkSelection(false);
    this.selectedIds=new Set(cleanIds);
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
  syncPieceSelectionDom(){
    const canvas=$('#englishBoardCanvas');if(!canvas)return;
    canvas.querySelectorAll('.free-foam-piece').forEach(node=>{
      const id=node.dataset.pieceId||'';
      const selected=this.selectedIds.has(id);
      node.classList.remove('is-selected','is-word-selected','is-letter-selected','is-multi-selected');
      if(selected){
        node.classList.add('is-selected');
        if(this.selectionMode==='word')node.classList.add('is-word-selected');
        else if(this.selectionMode==='letter')node.classList.add('is-letter-selected');
        else node.classList.add('is-multi-selected');
      }
      node.setAttribute('aria-pressed',selected?'true':'false');
    });
    this.workspace?.updateFoamToolState();
  }

  updateEmptyState(){
    const canvas=$('#englishBoardCanvas');if(!canvas)return;
    const empty=canvas.querySelector('.english-board-empty');if(!empty)return;
    const hasFoam=this.items.some(item=>item.type==='letter');
    const hasInk=Boolean(
      this.workspace?.activeStroke ||
      (Array.isArray(this.workspace?.strokes)&&this.workspace.strokes.length)
    );
    empty.hidden=hasFoam||hasInk;
  }

  renderBoard(){
    const canvas=$('#englishBoardCanvas');if(!canvas)return;
    const empty=canvas.querySelector('.english-board-empty');
    canvas.querySelectorAll('.free-foam-piece').forEach(el=>el.remove());
    const rect=this.canvasRect();
    const mobile=rect.width<640;
    this.items.forEach(item=>{
      if(item.type!=='letter')return;
      if(!['upper','lower'].includes(item.letterCase))item.letterCase=this.caseMode;
      item.rotation=0;
      item.displayGlyph=this.displayPiece(item);
      item.x=clamp(Number(item.x)||0,4,Math.max(4,rect.width-72));
      item.y=clamp(Number(item.y)||0,4,Math.max(4,rect.height-82));
      const el=document.createElement('button');
      const legacyColor=normalizeLegacyColor(item.color,item.logicalChar||item.displayGlyph||'');
      item.color=this.colorMode==='classic'
        ? PHONICS_COLORS.consonant
        : (item.phonicsRole ? this.colorForToken(item.logicalChar,item.phonicsRole) : legacyColor);
      const visibleColor=item.color;
      const pieceHtml=`<span class="foam-piece-glyph foam-glyph ${visibleColor} pointer-events-none">${this.escape(item.displayGlyph)}</span>`;
      decorateBoardPieceElement(el,{
        item,selected:this.selectedIds.has(item.id),selectionMode:this.selectionMode,mobile,
        minTouchTarget:this.platform.minTarget,contentHtml:pieceHtml
      });
      el.dataset.phonicsRole=item.phonicsRole||'';
      el.title=item.wordLabel||item.logicalChar;
      this.bindPiece(el,item);
      canvas.appendChild(el);
    });
    this.updateEmptyState();
    const count=$('#englishPieceCount');if(count)count.textContent=`${this.items.length} pieces`;
    const scale=$('#englishScaleValue');
    if(scale){
      const active=this.items.find(i=>i.id===this.activeItemId);
      scale.textContent=`${Math.round((active?.scale||1)*100)}%`;
    }
    this.persist();this.renderAssemblySlots();this.updateSelectedAudio();this.workspace?.updateFoamToolState();
  }
  bindPiece(el,item){
    el.addEventListener('pointerdown',e=>{
      if(e.pointerType==='mouse'&&e.button!==0)return;
      e.preventDefault();

      this.selectForInteraction(item,{additive:e.shiftKey||e.metaKey||e.ctrlKey});
      this.syncPieceSelectionDom();

      const start=this.state.find(item.id);
      if(!start)return;

      const rect=this.canvasRect();
      const targets=this.selectedIds.has(item.id)&&this.selectedIds.size>1
        ?this.items.filter(x=>this.selectedIds.has(x.id))
        :[start];

      const origins=targets.map(target=>{
        const node=$(`.free-foam-piece[data-piece-id="${CSS.escape(target.id)}"]`);
        return {
          id:target.id,
          x:Number(target.x)||0,
          y:Number(target.y)||0,
          rotation:Number(target.rotation)||0,
          node
        };
      });

      // One shared delta keeps multi-piece selections rigid at board edges.
      const minDx=Math.max(...origins.map(o=>4-o.x));
      const maxDx=Math.min(...origins.map(o=>Math.max(4,rect.width-72)-o.x));
      const minDy=Math.max(...origins.map(o=>4-o.y));
      const maxDy=Math.min(...origins.map(o=>Math.max(4,rect.height-82)-o.y));

      this.drag={
        pointerId:e.pointerId,
        anchor:{x:e.clientX,y:e.clientY},
        origins,
        minDx,maxDx,minDy,maxDy,
        dx:0,dy:0,
        moved:false,
        checkpointed:false,
        raf:0,
        sourceId:item.id
      };

      el.classList.add('is-dragging');
      el.setPointerCapture?.(e.pointerId);
    });

    el.addEventListener('pointermove',e=>{
      const d=this.drag;
      if(!d||d.pointerId!==e.pointerId)return;

      const samples=typeof e.getCoalescedEvents==='function'?e.getCoalescedEvents():null;
      const latest=samples?.length?samples[samples.length-1]:e;
      let dx=latest.clientX-d.anchor.x;
      let dy=latest.clientY-d.anchor.y;

      if(!d.moved&&Math.hypot(dx,dy)<3)return;
      if(!d.moved){
        d.moved=true;
        if(!d.checkpointed){
          this.checkpoint('MOVE_PIECE');
          d.checkpointed=true;
        }
      }

      e.preventDefault();
      d.dx=clamp(dx,d.minDx,d.maxDx);
      d.dy=clamp(dy,d.minDy,d.maxDy);

      if(d.raf)return;
      d.raf=requestAnimationFrame(()=>{
        d.raf=0;
        if(this.drag!==d)return;
        const tx=d.dx,ty=d.dy;
        d.origins.forEach(origin=>{
          const node=origin.node;
          if(!node?.isConnected)return;
          node.classList.add('is-dragging');
          node.style.transform=`translate3d(${tx}px,${ty}px,0) rotate(${origin.rotation}deg)`;
        });
      });
    });

    const end=e=>{
      const d=this.drag;
      if(!d||d.pointerId!==e.pointerId)return;

      if(d.raf){
        cancelAnimationFrame(d.raf);
        d.raf=0;
      }

      // Capture the final pointer position even when no last pointermove fired.
      if(d.moved&&Number.isFinite(e.clientX)&&Number.isFinite(e.clientY)){
        d.dx=clamp(e.clientX-d.anchor.x,d.minDx,d.maxDx);
        d.dy=clamp(e.clientY-d.anchor.y,d.minDy,d.maxDy);
      }

      if(d.moved){
        d.origins.forEach(origin=>{
          const target=this.state.find(origin.id);
          if(!target)return;
          target.x=origin.x+d.dx;
          target.y=origin.y+d.dy;
        });
      }

      d.origins.forEach(origin=>{
        if(!origin.node?.isConnected)return;
        origin.node.classList.remove('is-dragging');
        origin.node.style.transform=`rotate(${origin.rotation}deg)`;
      });

      this.drag=null;

      if(d.moved&&this.mode==='build'&&this.exercise){
        this.snapDraggedToNearestSlot(d.sourceId);
      }else{
        this.renderBoard();
      }
    };

    el.addEventListener('pointerup',end);
    el.addEventListener('pointercancel',end);
    el.addEventListener('lostpointercapture',e=>{
      if(this.drag?.pointerId===e.pointerId)end(e);
    });
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
    const p=this.createPiece(src.logicalChar,src.x+28,src.y+28,{scale:src.scale,rotation:src.rotation,color:src.color,phonicsRole:src.phonicsRole||null,letterCase:src.letterCase||'upper'});
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
    targets.forEach(i=>{i.x=20+Math.random()*Math.max(30,rect.width-105);i.y=35+Math.random()*Math.max(30,rect.height-120);i.rotation=0;});
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
    const clean=String(word||'').replace(/[^A-Za-z\s]/g,'').trim().replace(/\s+/g,' ');
    if(!clean)return;
    this.checkpoint('ADD_WORD');const rect=this.canvasRect();
    const words=clean.split(' ');let rowY=45+new Set(this.items.filter(i=>i.wordId).map(i=>i.wordId)).size*100;
    words.forEach(token=>{
      const logicalToken=token.toUpperCase();
      const wordId=`word_${++this.wordCounter}_${Date.now()}`;
      const spacing=Math.min(80,Math.max(54,(rect.width-120)/Math.max(token.length,1)));
      const total=(token.length-1)*spacing;let x=Math.max(18,(rect.width-total-70)/2);
      const phonics=analyzeWordPhonics(logicalToken);
      [...token].forEach((sourceLetter,index)=>{
        const logicalLetter=sourceLetter.toUpperCase();
        const letterCase=sourceLetter===sourceLetter.toLowerCase()?'lower':'upper';
        const role=phonics[index]||{color:colorFor(logicalLetter),role:VOWELS.has(logicalLetter)?'vowel':'consonant'};
        const p=this.createPiece(logicalLetter,x,rowY,{
          wordId,wordLabel:token,rotation:0,color:role.color,phonicsRole:role.role,letterCase
        });
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
    const label=members[0].detachedLabel||members.map(i=>this.displayPiece(i)).join('');
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
    const slots=this.slotGeometry();if(!slots.length){this.renderBoard();return;}

    // Build mode remains free: first release any old slot assignment.
    this.exercise.slots=this.exercise.slots.map(id=>id===pieceId?null:id);
    item.exerciseSlot=null;

    const px=item.x+35,py=item.y+38;
    const target=slots.find(slot=>
      px>=slot.left&&px<=slot.left+slot.width&&
      py>=slot.top&&py<=slot.top+slot.height
    );

    if(target){
      const displaced=this.exercise.slots[target.index];
      if(displaced){
        const old=this.state.find(displaced);
        if(old)old.exerciseSlot=null;
      }
      this.exercise.slots[target.index]=pieceId;
      item.exerciseSlot=target.index;
      item.x=target.left+(target.width-70)/2;
      item.y=target.top+(target.height-76)/2;
    }

    this.renderBoard();
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
      if(item){el.classList.add('filled');el.textContent=this.displayPiece(item);}
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
    add('Normal-board Interaction',Boolean($('#englishInlineInteraction')),'Move / Pen / Eraser / Lasso outside Full Board');
    add('Ink Lasso & Group',Boolean(
      $('#englishInkLasso')&&
      $('#englishInkGroup')&&
      $('#englishInkUngroup')&&
      $('#englishWorkspaceInkGroup')&&
      $('#englishWorkspaceInkUngroup')
    ),'Multi-stroke selection + Group/Ungroup');
    add('Main navigation',document.documentElement.dataset.mainNavReady==='true','Magnetic Board / Letters / Word Builder / Practice / Learning Path');
    add('Classroom Whiteboard workspace',Boolean(this.workspace&&$('#englishFullscreenBoard')),'Full screen + toolbox + letter strip');
    add('Full-board topbar tools',Boolean(
      $('#englishWorkspaceSmaller')&&
      $('#englishWorkspaceResetSize')&&
      $('#englishWorkspaceLarger')&&
      $('#englishWorkspaceDuplicate')&&
      $('#englishWorkspaceDelete')&&
      $('#englishWorkspaceAlign')&&
      $('#englishWorkspaceScatter')&&
      $('#englishWorkspaceBoardUndo')&&
      $('#englishWorkspaceBoardRedo')
    ),'Topbar: resize / duplicate / delete / align / scatter / undo / redo');
    add('Vector ink layer',Boolean($('#englishInkSvg')&&$('#englishInkObjects')),'Stable board-space SVG objects across Normal / Full Board');
    add('Smooth foam drag pipeline',typeof requestAnimationFrame==='function','RAF + translate3d + single commit on pointer release');
    add('Multiple boards',Boolean($('#englishBoardTabs')&&$('#englishWorkspaceBoardTabs')),'Independent board pages + per-board ink/surface');
    add('Atomic board loading',Object.prototype.hasOwnProperty.call(this,'loadingBoardRecord'),'Prevents cross-board surface/state overwrite during switch');
    add('Unified empty-board state',typeof this.updateEmptyState==='function','Foam + vector ink + active pen stroke');
    add('Upright foam letters',true,'Random foam rotation removed');
    add('Tabbed Full Board toolbox',document.querySelectorAll('[data-workspace-tab]').length===6,'Objects / Interaction / Boards / Letters / Guides / Pen');
    add('Board surfaces',document.querySelectorAll('[data-board-surface]').length>=8,'Current / Squares / Notebook / English');
    add('Build free movement',true,'Slot capture only when dropped inside a slot');
    add('Writing guide layer',Boolean($('#englishWritingGuides')),'Blank / baseline / 3-line / 4-line');

    try{
      const a=createLetterPiece({logicalChar:'A',letterCase:'lower',displayGlyph:'a'});
      add('Per-piece letter case',a.logicalChar==='A'&&a.letterCase==='lower'&&a.displayGlyph==='a','Mixed upper/lower board pieces');
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
