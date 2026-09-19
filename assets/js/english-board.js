import { BoardState, saveBoardState, loadBoardState } from './core/board-state.js';
import { BoardHistory } from './core/board-history.js';
import { BOARD_COMMANDS, applyBoardCommand } from './core/board-commands.js';
import { createLetterPiece, pieceCan, BOARD_CAPABILITIES } from './core/board-piece.js';
import { detectPlatformProfile } from './core/platform-profile.js';
import { createPlatformAdapter } from './core/platform-adapter.js';
import { decorateBoardPieceElement } from './ui/board-piece-view.js';
import { BoardWorkspace } from './ui/board-workspace.js';

const APP_VERSION='0.25.1';
const STORAGE_KEY='englishLab.board';
const STORAGE_SCHEMA_VERSION=3;
const BOARDS_STORAGE_KEY='englishLab.boards.v1';
const SAVED_LESSON_KEY='englishLab.savedLesson.v1';
const CURRENT_LESSON_NAME_KEY='englishLab.currentLessonName';
const LESSON_FORMAT='english-language-lab-lesson';
const LESSON_FORMAT_VERSION=1;
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
    this.keyboardGrabbed=false;
    this.workspace=null;
    this.boards=[];
    this.activeBoardId=null;
    this.boardSurface='current';
    this.boardsReady=false;
    this.loadingBoardRecord=false;
    this.foamMarquee=null;
    this.foamResize=null;
    // Foam coordinates are persisted together with the canvas size they were
    // authored against. When Normal / Full Board changes the canvas geometry,
    // positions are remapped proportionally instead of being clamped to an edge.
    this.foamCanvasSpace=null;
    const savedSnap=localStorage.getItem('englishLab.buildSnapMode');
    this.buildSnapModeSetting=['off','inside','strong'].includes(savedSnap)?savedSnap:'inside';
    this.buildCaseMattersSetting=localStorage.getItem('englishLab.buildCaseMatters')==='true';
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
    this.syncBuildOptionControls();

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

  currentLessonName(){
    const current=localStorage.getItem(CURRENT_LESSON_NAME_KEY);
    if(current)return String(current).slice(0,80);
    return this.activeBoardRecord()?.name||'English lesson';
  }

  lessonSnapshot(name=this.currentLessonName()){
    this.captureActiveBoard();
    return {
      format:LESSON_FORMAT,
      version:LESSON_FORMAT_VERSION,
      appVersion:APP_VERSION,
      name:String(name||'English lesson').trim().slice(0,80)||'English lesson',
      savedAt:new Date().toISOString(),
      activeBoardId:this.activeBoardId,
      settings:{
        colorMode:this.colorMode,
        interfaceMode:this.interfaceMode,
        letterFont:localStorage.getItem('englishLab.letterFont')||'teachers',
        uiFont:localStorage.getItem('englishLab.uiFont')||'system',
        workspace:this.workspace?.exportWorkspaceSettings?.()||deepClone(this.workspace?.settings||{})
      },
      boards:deepClone(this.boards)
    };
  }

  validateLessonPayload(payload){
    if(!payload||typeof payload!=='object')throw new Error('Lesson file is empty or invalid');
    if(payload.format!==LESSON_FORMAT)throw new Error('This is not an English Language Lab lesson file');
    if(Number(payload.version)!==LESSON_FORMAT_VERSION)throw new Error('Unsupported lesson file version');
    if(!Array.isArray(payload.boards)||payload.boards.length<1)throw new Error('Lesson has no boards');
    if(payload.boards.length>50)throw new Error('Lesson contains too many boards');

    payload.boards.forEach((record,index)=>{
      if(!record||typeof record!=='object')throw new Error(`Board ${index+1} is invalid`);
      if(record.items!=null&&!Array.isArray(record.items))throw new Error(`Board ${index+1} has invalid foam data`);
      if(record.ink!=null&&!Array.isArray(record.ink))throw new Error(`Board ${index+1} has invalid ink data`);
      if((record.items?.length||0)>3000||(record.ink?.length||0)>3000)throw new Error(`Board ${index+1} is too large`);
    });

    return payload;
  }

  applyLessonSettings(settings={}){
    this.colorMode=settings.colorMode==='classic'?'classic':'phonics';
    localStorage.setItem('englishLab.colorMode',this.colorMode);
    const colorSelect=$('#englishColorMode');if(colorSelect)colorSelect.value=this.colorMode;

    this.interfaceMode=settings.interfaceMode==='student'?'student':'teacher';
    localStorage.setItem('englishLab.interfaceMode',this.interfaceMode);
    document.body.dataset.interfaceMode=this.interfaceMode;
    $('#studentModeBtn')?.classList.toggle('active',this.interfaceMode==='student');
    $('#teacherModeBtn')?.classList.toggle('active',this.interfaceMode==='teacher');

    const applyFont=(id,key)=>{
      if(!key)return;
      const select=$(id);if(!select)return;
      if([...select.options].some(option=>option.value===key)){
        select.value=key;
        select.dispatchEvent(new Event('change',{bubbles:true}));
      }
    };
    applyFont('#letterFontPicker',settings.letterFont);
    applyFont('#uiFontPicker',settings.uiFont);

    this.workspace?.importWorkspaceSettings?.(settings.workspace||{});
  }

  restoreLesson(payload,{toast=true}={}){
    const lesson=this.validateLessonPayload(payload);
    const sourceBoards=lesson.boards;
    const activeIndex=Math.max(0,sourceBoards.findIndex(record=>record?.id===lesson.activeBoardId));

    const imported=sourceBoards.map((record,index)=>this.normalizeBoardRecord({
      ...deepClone(record),
      id:this.boardId()
    },index));

    this.boards=imported;
    this.activeBoardId=imported[Math.min(activeIndex,imported.length-1)]?.id||imported[0].id;

    this.loadingBoardRecord=true;
    try{
      this.applyLessonSettings(lesson.settings||{});
    }finally{
      this.loadingBoardRecord=false;
    }

    localStorage.setItem(CURRENT_LESSON_NAME_KEY,String(lesson.name||'English lesson').slice(0,80));
    const active=this.activeBoardRecord()||this.boards[0];
    this.loadBoardRecord(active,{persist:false,toast:false});
    this.persistBoards();
    this.persist();

    if(toast)this.toast(`Lesson loaded: ${lesson.name||'English lesson'}`);
    return true;
  }

  saveLessonLocal(){
    const current=this.currentLessonName();
    const value=window.prompt('Lesson name',current);
    if(value==null)return;
    const name=String(value).trim().replace(/\s+/g,' ').slice(0,80);
    if(!name)return;

    const snapshot=this.lessonSnapshot(name);
    try{
      localStorage.setItem(SAVED_LESSON_KEY,JSON.stringify(snapshot));
      localStorage.setItem(CURRENT_LESSON_NAME_KEY,name);
      this.toast(`Lesson saved: ${name}`);
    }catch(_){
      this.toast('Could not save the lesson on this device');
    }
  }

  loadSavedLesson(){
    let snapshot=null;
    try{snapshot=JSON.parse(localStorage.getItem(SAVED_LESSON_KEY)||'null');}catch(_){}
    if(!snapshot){
      this.toast('No saved lesson on this device');
      return;
    }
    if(!window.confirm(`Load "${snapshot.name||'saved lesson'}" and replace the current boards?`))return;
    try{
      this.restoreLesson(snapshot);
    }catch(error){
      this.toast(error?.message||'Saved lesson could not be loaded');
    }
  }

  safeLessonFilename(name){
    const clean=String(name||'english-lesson')
      .trim()
      .replace(/[^A-Za-z0-9 _-]+/g,'')
      .replace(/\s+/g,'-')
      .replace(/-+/g,'-')
      .slice(0,60);
    return (clean||'english-lesson')+'.englishlab.json';
  }

  async exportLesson(){
    const snapshot=this.lessonSnapshot();
    const json=JSON.stringify(snapshot,null,2);
    const filename=this.safeLessonFilename(snapshot.name);
    const blob=new Blob([json],{type:'application/json'});
    const shareFile=typeof File==='function'?new File([blob],filename,{type:'application/json'}):null;

    try{
      if(shareFile&&navigator.share&&navigator.canShare?.({files:[shareFile]})){
        await navigator.share({files:[shareFile],title:snapshot.name});
        this.toast('Lesson shared');
        return;
      }
    }catch(error){
      if(error?.name==='AbortError')return;
    }

    const url=URL.createObjectURL(blob);
    const anchor=document.createElement('a');
    anchor.href=url;
    anchor.download=filename;
    anchor.rel='noopener';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(()=>URL.revokeObjectURL(url),1500);
    this.toast('Lesson exported');
  }

  requestLessonImport(){
    const input=$('#englishLessonImport');
    if(!input)return;
    input.value='';
    input.click();
  }

  readLessonFileText(file){
    if(file?.text)return file.text();
    return new Promise((resolve,reject)=>{
      const reader=new FileReader();
      reader.onload=()=>resolve(String(reader.result||''));
      reader.onerror=()=>reject(reader.error||new Error('Could not read lesson file'));
      reader.readAsText(file);
    });
  }

  async importLessonFile(file){
    if(!file)return;
    if(file.size>10*1024*1024){
      this.toast('Lesson file is too large');
      return;
    }

    try{
      const text=await this.readLessonFileText(file);
      const payload=this.validateLessonPayload(JSON.parse(text));
      if(!window.confirm(`Import "${payload.name||file.name}" and replace the current boards?`))return;
      this.restoreLesson(payload);
    }catch(error){
      this.toast(error?.message||'Lesson file could not be imported');
    }
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
      segmentState:record?.segmentState?deepClone(record.segmentState):null,
      startState:record?.startState?deepClone(record.startState):null,
      foamSpace:this.normalizeFoamSpace(record?.foamSpace)
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
        segmentState:this.segmentState||null,
        foamSpace:this.currentFoamSpace()
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
    record.foamSpace=deepClone(this.foamCanvasSpace||this.currentFoamSpace());
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
      this.foamCanvasSpace=this.normalizeFoamSpace(record.foamSpace);
      this.boardSurface=BOARD_SURFACES.has(record.surface)?record.surface:'current';
      this.caseMode=record.caseMode==='lower'?'lower':'upper';
      this.exercise=record.exercise?deepClone(record.exercise):null;
      this.normalizeBuildExercise();
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
        if(hint)hint.textContent=this.buildHintText();
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
      this.syncBuildOptionControls();

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
      segmentState:null,
      startState:null
    },this.boards.length);
    this.boards.push(record);
    this.activeBoardId=record.id;
    this.loadBoardRecord(record);
  }

  activityStateFromCurrent(){
    return {
      items:this.state.snapshot(),
      ink:this.workspace?.exportInkState?.()||[],
      surface:this.boardSurface,
      mode:this.mode,
      caseMode:this.caseMode,
      exercise:this.exercise?deepClone(this.exercise):null,
      segmentState:this.segmentState?deepClone(this.segmentState):null,
      foamSpace:deepClone(this.foamCanvasSpace||this.currentFoamSpace())
    };
  }

  applyActivityStateToRecord(record,state){
    if(!record||!state)return false;
    record.items=Array.isArray(state.items)?deepClone(state.items):[];
    record.ink=Array.isArray(state.ink)?deepClone(state.ink):[];
    record.surface=BOARD_SURFACES.has(state.surface)?state.surface:'current';
    record.mode=['free','build','completed','segment'].includes(state.mode)?state.mode:'free';
    record.caseMode=state.caseMode==='lower'?'lower':'upper';
    record.exercise=state.exercise?deepClone(state.exercise):null;
    record.segmentState=state.segmentState?deepClone(state.segmentState):null;
    record.foamSpace=this.normalizeFoamSpace(state.foamSpace);
    return true;
  }

  setActivityStartState(){
    const record=this.activeBoardRecord();
    if(!record)return;
    this.captureActiveBoard();
    record.startState=deepClone(this.activityStateFromCurrent());
    this.persistBoards();
    this.renderBoardManager();
    this.toast(`Start state saved for ${record.name}`);
  }

  resetCurrentActivity({toast=true}={}){
    const record=this.activeBoardRecord();
    if(!record?.startState){
      if(toast)this.toast('Set a Start State for this board first');
      return false;
    }

    this.applyActivityStateToRecord(record,record.startState);
    this.loadBoardRecord(record,{persist:true,toast:false});
    if(toast)this.toast(`${record.name} reset to Start State`);
    return true;
  }

  resetWholeLesson(){
    this.captureActiveBoard();
    const prepared=this.boards.filter(record=>record.startState);
    if(!prepared.length){
      this.toast('No boards have a Start State yet');
      return;
    }
    if(!window.confirm(`Reset ${prepared.length} prepared board${prepared.length===1?'':'s'} to their Start State?`))return;

    prepared.forEach(record=>this.applyActivityStateToRecord(record,record.startState));
    const active=this.activeBoardRecord()||this.boards[0];
    this.loadBoardRecord(active,{persist:false,toast:false});
    this.persistBoards();
    this.toast(`Reset ${prepared.length} prepared board${prepared.length===1?'':'s'}`);
  }

  studentBoardStep(delta){
    if(this.boards.length<2)return;
    const index=Math.max(0,this.boards.findIndex(record=>record.id===this.activeBoardId));
    const nextIndex=clamp(index+(Number(delta)||0),0,this.boards.length-1);
    if(nextIndex===index)return;
    this.switchBoard(this.boards[nextIndex].id);
  }

  renameActiveBoard(){
    const record=this.activeBoardRecord();
    if(!record)return;
    const current=record.name||'Board';
    const value=window.prompt('Board name',current);
    if(value==null)return;
    const clean=String(value).trim().replace(/\s+/g,' ').slice(0,40);
    if(!clean||clean===current)return;
    record.name=clean;
    this.renderBoardManager();
    this.persistBoards();
    this.toast(`Renamed to ${clean}`);
  }

  duplicateActiveBoard(){
    this.captureActiveBoard();
    const source=this.activeBoardRecord();
    if(!source)return;

    const base=`${source.name||'Board'} copy`;
    const used=new Set(this.boards.map(record=>record.name));
    let name=base;
    let n=2;
    while(used.has(name))name=`${base} ${n++}`;

    const copy=this.normalizeBoardRecord({
      ...deepClone(source),
      id:this.boardId(),
      name
    },this.boards.length);

    this.boards.push(copy);
    this.activeBoardId=copy.id;
    this.loadBoardRecord(copy);
    this.toast(`Duplicated: ${name}`);
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
        button.classList.toggle('has-start-state',Boolean(record.startState));
        button.dataset.prepared=record.startState?'true':'false';
        button.textContent=record.name||`Board ${index+1}`;
        const boardLabel=`${record.startState?'Prepared activity · ':''}Open ${button.textContent}`;
        button.removeAttribute('title');
        button.setAttribute('aria-label',boardLabel);
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

    const active=this.activeBoardRecord();
    const hasStart=Boolean(active?.startState);
    const anyStart=this.boards.some(record=>record.startState);
    document.querySelectorAll('[data-activity-action="reset-board"]').forEach(button=>{
      button.disabled=!hasStart;
    });
    document.querySelectorAll('[data-activity-action="reset-lesson"]').forEach(button=>{
      button.disabled=!anyStart;
    });

    const index=Math.max(0,this.boards.findIndex(record=>record.id===this.activeBoardId));
    const name=active?.name||'Board';
    const studentName=$('#studentBoardName');if(studentName)studentName.textContent=name;
    const workspaceName=$('#englishWorkspaceStudentBoardName');if(workspaceName)workspaceName.textContent=name;
    document.querySelectorAll('[data-student-board-step="-1"]').forEach(button=>{button.disabled=index<=0;});
    document.querySelectorAll('[data-student-board-step="1"]').forEach(button=>{button.disabled=index>=this.boards.length-1;});
  }
  historySnapshot(){
    return {
      items:this.state.snapshot(),
      exercise:this.exercise?deepClone(this.exercise):null,
      segmentState:this.segmentState?deepClone(this.segmentState):null,
      foamSpace:deepClone(this.foamCanvasSpace||this.currentFoamSpace())
    };
  }

  restoreHistorySnapshot(snapshot){
    if(Array.isArray(snapshot)){
      this.state.restore(snapshot);
      return;
    }
    this.state.restore(Array.isArray(snapshot?.items)?snapshot.items:[]);
    this.foamCanvasSpace=this.normalizeFoamSpace(snapshot?.foamSpace)||this.foamCanvasSpace;
    this.exercise=snapshot?.exercise?deepClone(snapshot.exercise):null;
    this.normalizeBuildExercise();
    this.segmentState=snapshot?.segmentState?deepClone(snapshot.segmentState):null;
  }

  checkpoint(label){this.history.checkpoint(this.historySnapshot(),label);}
  undo(){
    const snap=this.history.undo(this.historySnapshot());if(!snap)return;
    this.restoreHistorySnapshot(snap);
    this.clearSelection(false);
    this.syncBuildOptionControls();
    this.renderBoard();
    this.toast('Undo');
  }
  redo(){
    const snap=this.history.redo(this.historySnapshot());if(!snap)return;
    this.restoreHistorySnapshot(snap);
    this.clearSelection(false);
    this.syncBuildOptionControls();
    this.renderBoard();
    this.toast('Redo');
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
      if(hint)hint.textContent=this.buildHintText();
    }else if(next==='completed'){
      if(title)title.textContent='Completed words — move the word or detach its letters';
      if(hint)hint.textContent='First tap selects the whole word. Detach lets you move each letter separately.';
    }else{
      if(title)title.textContent='Segment & Blend — move graphemes from sounds to a whole word';
      if(hint)hint.textContent='Spread the foam graphemes to hear the parts, then blend them together to read the word.';
    }
    this.persist();this.renderBoard();this.syncWorkspaceBuildControls();
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
    $('#englishLockSelected')?.addEventListener('click',()=>this.workspace?.lockSelected());
    $('#englishUnlockSelected')?.addEventListener('click',()=>this.workspace?.unlockSelected());
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
    $('#englishWorkspaceBuildReshuffle')?.addEventListener('click',()=>this.reshuffleExercise());
    $('#englishWorkspaceBuildCheck')?.addEventListener('click',()=>this.checkExercise());
    $('#englishWorkspaceBuildHint')?.addEventListener('click',()=>this.hintExercise());
    $('#englishShowTarget')?.addEventListener('change',event=>this.setBuildShowTarget(Boolean(event.target.checked)));
    $('#englishBuildSnapMode')?.addEventListener('change',event=>this.setBuildSnapMode(event.target.value));
    $('#englishCaseMatters')?.addEventListener('change',event=>this.setBuildCaseMatters(Boolean(event.target.checked)));
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
    document.querySelectorAll('[data-activity-action]').forEach(button=>{
      button.addEventListener('click',()=>{
        const action=button.dataset.activityAction;
        if(action==='set-start')this.setActivityStartState();
        if(action==='reset-board')this.resetCurrentActivity();
        if(action==='reset-lesson')this.resetWholeLesson();
        if(action==='play')this.applyInterfaceMode('student');
        button.closest('details')?.removeAttribute('open');
      });
    });
    document.querySelectorAll('[data-student-board-step]').forEach(button=>{
      button.addEventListener('click',()=>this.studentBoardStep(Number(button.dataset.studentBoardStep)||0));
    });
    document.querySelectorAll('[data-lesson-action]').forEach(button=>{
      button.addEventListener('click',()=>{
        const action=button.dataset.lessonAction;
        if(action==='save')this.saveLessonLocal();
        if(action==='load')this.loadSavedLesson();
        if(action==='export')this.exportLesson();
        if(action==='import')this.requestLessonImport();
      });
    });
    $('#englishLessonImport')?.addEventListener('change',event=>{
      const file=event.target.files?.[0];
      if(file)this.importLessonFile(file);
    });
    const boardCanvas=$('#englishBoardCanvas');
    boardCanvas?.addEventListener('pointerdown',e=>this.beginFoamMarquee(e));
    boardCanvas?.addEventListener('pointermove',e=>this.moveFoamMarquee(e));
    boardCanvas?.addEventListener('pointerup',e=>this.endFoamMarquee(e));
    boardCanvas?.addEventListener('pointercancel',e=>this.cancelFoamMarquee(e));
    boardCanvas?.addEventListener('lostpointercapture',e=>{
      if(this.foamMarquee?.pointerId===e.pointerId)this.endFoamMarquee(e);
    });
    document.querySelectorAll('[data-foam-resize]').forEach(handle=>{
      handle.addEventListener('pointerdown',e=>this.beginFoamResize(e,handle.dataset.foamResize));
      handle.addEventListener('pointermove',e=>this.moveFoamResize(e));
      handle.addEventListener('pointerup',e=>this.endFoamResize(e));
      handle.addEventListener('pointercancel',e=>this.endFoamResize(e));
      handle.addEventListener('lostpointercapture',e=>{
        if(this.foamResize?.pointerId===e.pointerId)this.endFoamResize(e);
      });
    });
    window.addEventListener('keydown',e=>this.handleKeyboard(e));
  }
  handleKeyboard(event){
    const tag=document.activeElement?.tagName;
    if(['INPUT','TEXTAREA','SELECT'].includes(tag))return;

    if(event.key==='Escape'&&this.keyboardGrabbed){
      event.preventDefault();
      this.keyboardGrabbed=false;
      this.toast('Keyboard move released');
      return;
    }

    const action=this.platform.actionForKey(event.key);
    const focusedPiece=document.activeElement?.closest?.('.free-foam-piece');

    if(action?.type==='activate'&&focusedPiece){
      event.preventDefault();
      const id=focusedPiece.dataset.pieceId;
      const item=this.state.find(id);
      if(!item)return;
      if(item.locked){
        this.toast('Object locked');
        return;
      }

      if(this.keyboardGrabbed&&this.activeItemId===id){
        this.keyboardGrabbed=false;
        this.toast('Letter released · choose a slot or another control');
      }else{
        this.setSelection([id],'letter',id);
        this.keyboardGrabbed=true;
        this.syncPieceSelectionDom();
        this.renderFoamSelectionOverlay();
        this.toast('Letter selected · use arrow keys to move · OK to release');
      }
      return;
    }

    if(!action||!this.activeItemId)return;
    if(action.type==='delete'){
      event.preventDefault();
      this.keyboardGrabbed=false;
      this.deleteSelected();
      return;
    }
    if(action.type==='move'){
      if(this.platform.id==='webos'&&!this.keyboardGrabbed)return;
      event.preventDefault();
      const moving=this.items.filter(i=>this.selectedIds.has(i.id));
      if(!moving.length)return;
      if(moving.some(i=>i.locked)){this.toast('Unlock selected objects before moving them');return;}
      this.checkpoint('KEY_MOVE');
      moving.forEach(i=>{i.x+=action.dx;i.y+=action.dy;});
      const activeId=this.activeItemId;
      this.renderBoard();
      requestAnimationFrame(()=>{
        if(!activeId)return;
        const node=document.querySelector('.free-foam-piece[data-piece-id="'+CSS.escape(activeId)+'"]');
        node?.focus?.();
      });
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
      this.bindTrayDirectDrag(b,letter,'letter');
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
        this.bindTrayDirectDrag(b,token,role);
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

    if(this.interfaceMode==='student'){
      this.clearSelection(false);
      this.workspace?.clearInkSelection(false);
      this.workspace?.setTool?.('move',false);
      this.renderBoard();
    }
    this.renderBoardManager();
    if(!silent)this.toast(this.interfaceMode==='student'?'Student Play':'Teacher tools');
    this.persist();
  }
  recolorAllPieces(){
    this.items.forEach(item=>{
      item.color=this.colorForToken(item.logicalChar,item.phonicsRole);
    });
  }
  canvasRect(){return $('#englishBoardCanvas')?.getBoundingClientRect()||{width:700,height:500,left:0,top:0};}

  normalizeFoamSpace(space){
    const width=Number(space?.width)||0;
    const height=Number(space?.height)||0;
    return width>=2&&height>=2?{width,height}:null;
  }

  currentFoamSpace(rect=this.canvasRect()){
    const width=Number(rect?.width)||0;
    const height=Number(rect?.height)||0;
    return width>=2&&height>=2?{width,height}:null;
  }

  syncFoamCoordinatesToCanvas(rect=this.canvasRect()){
    const next=this.currentFoamSpace(rect);
    if(!next)return false;

    const previous=this.normalizeFoamSpace(this.foamCanvasSpace);
    if(!previous){
      this.foamCanvasSpace=next;
      return false;
    }

    if(Math.abs(previous.width-next.width)<1&&Math.abs(previous.height-next.height)<1){
      this.foamCanvasSpace=next;
      return false;
    }

    const previousMaxX=Math.max(4,previous.width-72);
    const previousMaxY=Math.max(4,previous.height-82);
    const nextMaxX=Math.max(4,next.width-72);
    const nextMaxY=Math.max(4,next.height-82);
    const previousSpanX=Math.max(1,previousMaxX-4);
    const previousSpanY=Math.max(1,previousMaxY-4);
    const nextSpanX=Math.max(1,nextMaxX-4);
    const nextSpanY=Math.max(1,nextMaxY-4);

    this.items.forEach(item=>{
      if(item.type!=='letter')return;
      const x=clamp(Number(item.x)||4,4,previousMaxX);
      const y=clamp(Number(item.y)||4,4,previousMaxY);
      item.x=4+((x-4)/previousSpanX)*nextSpanX;
      item.y=4+((y-4)/previousSpanY)*nextSpanY;
    });

    this.foamCanvasSpace=next;
    return true;
  }

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
  addTokenAtPosition(token,role,x,y){
    if(this.mode==='build'&&this.exercise){
      this.toast('Finish the build activity first');
      return false;
    }

    const rect=this.canvasRect();
    const px=clamp(Number(x)||0,4,Math.max(4,rect.width-72));
    const py=clamp(Number(y)||0,4,Math.max(4,rect.height-82));
    const resolvedRole=role==='letter'
      ?(VOWELS.has(token)?'vowel':'consonant')
      :role;

    this.checkpoint(role==='letter'?'DROP_LETTER':'DROP_GRAPHEME');
    const piece=this.createPiece(token,px,py,{
      phonicsRole:resolvedRole,
      color:this.colorForToken(token,resolvedRole),
      locked:false
    });
    applyBoardCommand(this.state,{type:BOARD_COMMANDS.ADD_PIECE,piece});
    this.setSelection([piece.id],'letter',piece.id);
    this.renderBoard();
    this.updateSelectedAudio();
    return true;
  }

  bindTrayDirectDrag(button,token,role='letter'){
    if(!button)return;
    button.style.touchAction='none';

    let drag=null;
    let suppressClick=false;

    button.addEventListener('pointerdown',event=>{
      if(event.pointerType==='mouse'&&event.button!==0)return;
      drag={
        pointerId:event.pointerId,
        startX:event.clientX,
        startY:event.clientY,
        x:event.clientX,
        y:event.clientY,
        moved:false,
        ghost:null,
        raf:0
      };
      button.setPointerCapture?.(event.pointerId);
    });

    button.addEventListener('pointermove',event=>{
      if(!drag||drag.pointerId!==event.pointerId)return;
      const samples=typeof event.getCoalescedEvents==='function'?event.getCoalescedEvents():null;
      const latest=samples?.length?samples[samples.length-1]:event;
      drag.x=latest.clientX;
      drag.y=latest.clientY;

      if(!drag.moved&&Math.hypot(drag.x-drag.startX,drag.y-drag.startY)<6)return;
      if(!drag.moved){
        drag.moved=true;
        suppressClick=true;
        drag.ghost=document.createElement('div');
        drag.ghost.className='tray-drag-ghost';
        const resolvedRole=role==='letter'?(VOWELS.has(token)?'vowel':'consonant'):role;
        drag.ghost.innerHTML=`<span class="foam-glyph ${this.colorForToken(token,resolvedRole)}">${this.escape(this.display(token))}</span>`;
        const ghostHost=this.workspace?.isWorkspace?$('#magnetic-board'):document.body;
        ghostHost?.appendChild(drag.ghost);
      }

      event.preventDefault();
      if(drag.raf)return;
      drag.raf=requestAnimationFrame(()=>{
        drag.raf=0;
        if(!drag?.ghost)return;
        drag.ghost.style.transform=`translate3d(${drag.x}px,${drag.y}px,0) translate(-50%,-50%)`;
      });
    });

    const finish=event=>{
      if(!drag||drag.pointerId!==event.pointerId)return;
      if(drag.raf)cancelAnimationFrame(drag.raf);
      const wasMoved=drag.moved;
      const x=Number.isFinite(event.clientX)?event.clientX:drag.x;
      const y=Number.isFinite(event.clientY)?event.clientY:drag.y;
      drag.ghost?.remove();
      drag=null;

      if(wasMoved){
        const rect=this.canvasRect();
        const inside=x>=rect.left&&x<=rect.left+rect.width&&y>=rect.top&&y<=rect.top+rect.height;
        if(inside){
          this.addTokenAtPosition(token,role,x-rect.left-35,y-rect.top-38);
        }
        setTimeout(()=>{suppressClick=false;},0);
      }
    };

    button.addEventListener('pointerup',finish);
    button.addEventListener('pointercancel',finish);
    button.addEventListener('lostpointercapture',event=>{
      if(drag?.pointerId===event.pointerId)finish(event);
    });

    button.addEventListener('click',event=>{
      if(suppressClick){
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    },true);
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
  clearSelection(render=true){this.keyboardGrabbed=false;this.setSelection([], 'none', null);if(render)this.renderBoard();}
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
    this.renderFoamSelectionOverlay();
  }

  foamSelectionBounds(){
    const canvas=$('#englishBoardCanvas');
    if(!canvas||!this.selectedIds.size)return null;
    const canvasRect=canvas.getBoundingClientRect();
    const rects=[...this.selectedIds].map(id=>{
      const node=canvas.querySelector(`.free-foam-piece[data-piece-id="${CSS.escape(id)}"]`);
      const visual=node?.querySelector('.foam-piece-glyph')||node;
      return visual?.getBoundingClientRect?.()||null;
    }).filter(Boolean);
    if(!rects.length)return null;

    const pad=10;
    const left=Math.min(...rects.map(rect=>rect.left))-canvasRect.left-pad;
    const top=Math.min(...rects.map(rect=>rect.top))-canvasRect.top-pad;
    const right=Math.max(...rects.map(rect=>rect.right))-canvasRect.left+pad;
    const bottom=Math.max(...rects.map(rect=>rect.bottom))-canvasRect.top+pad;
    return {
      left,top,right,bottom,
      width:Math.max(24,right-left),
      height:Math.max(24,bottom-top),
      cx:(left+right)/2,
      cy:(top+bottom)/2
    };
  }

  renderFoamSelectionOverlay(bounds=null){
    const overlay=$('#englishFoamSelectionOverlay');if(!overlay)return;
    const tool=this.workspace?.settings?.tool||'move';
    const selection=this.selectedFoamItems();
    const box=bounds||this.foamSelectionBounds();
    const visible=tool==='move'&&selection.length>0&&box;

    overlay.hidden=!visible;
    overlay.setAttribute('aria-hidden',visible?'false':'true');
    if(!visible){
      overlay.style.transform='';
      return;
    }

    overlay.style.left=`${box.left}px`;
    overlay.style.top=`${box.top}px`;
    overlay.style.width=`${box.width}px`;
    overlay.style.height=`${box.height}px`;
    overlay.style.transform='';
    overlay.classList.toggle('is-locked',selection.some(item=>item.locked));
    overlay.dataset.count=String(selection.length);

    const label=overlay.querySelector('.foam-selection-label');
    if(label){
      const locked=selection.some(item=>item.locked);
      label.textContent=selection.length===1
        ?(locked?'🔒 Locked':'1 selected')
        :`${selection.length} selected${locked?' · 🔒':''}`;
    }
  }

  marqueeElement(){return $('#englishFoamMarquee');}

  beginFoamMarquee(event){
    if(this.workspace?.settings?.tool!=='move')return;
    if(event.pointerType==='mouse'&&event.button!==0)return;
    if(event.target.closest?.('.free-foam-piece,[data-foam-resize],.english-assembly-zone,.foam-selection-overlay'))return;
    if(event.target.closest?.('.ink-object'))return;

    const canvas=$('#englishBoardCanvas');if(!canvas)return;
    const rect=canvas.getBoundingClientRect();
    const x=clamp(event.clientX-rect.left,0,rect.width);
    const y=clamp(event.clientY-rect.top,0,rect.height);

    this.foamMarquee={
      pointerId:event.pointerId,
      startX:x,startY:y,
      x,y,
      moved:false,
      additive:Boolean(event.shiftKey||event.ctrlKey||event.metaKey),
      baseIds:new Set(this.selectedIds)
    };
    canvas.setPointerCapture?.(event.pointerId);
  }

  moveFoamMarquee(event){
    const drag=this.foamMarquee;
    if(!drag||drag.pointerId!==event.pointerId)return;
    const canvas=$('#englishBoardCanvas');if(!canvas)return;
    const rect=canvas.getBoundingClientRect();
    const samples=typeof event.getCoalescedEvents==='function'?event.getCoalescedEvents():null;
    const latest=samples?.length?samples[samples.length-1]:event;
    drag.x=clamp(latest.clientX-rect.left,0,rect.width);
    drag.y=clamp(latest.clientY-rect.top,0,rect.height);

    if(!drag.moved&&Math.hypot(drag.x-drag.startX,drag.y-drag.startY)<5)return;
    if(!drag.moved){
      drag.moved=true;
      this.workspace?.clearInkSelection(false);
      const marquee=this.marqueeElement();
      if(marquee)marquee.hidden=false;
    }

    event.preventDefault();
    const left=Math.min(drag.startX,drag.x);
    const top=Math.min(drag.startY,drag.y);
    const width=Math.abs(drag.x-drag.startX);
    const height=Math.abs(drag.y-drag.startY);
    const marquee=this.marqueeElement();
    if(marquee){
      marquee.style.left=`${left}px`;
      marquee.style.top=`${top}px`;
      marquee.style.width=`${width}px`;
      marquee.style.height=`${height}px`;
    }
  }

  endFoamMarquee(event){
    const drag=this.foamMarquee;
    if(!drag||drag.pointerId!==event.pointerId)return;
    const canvas=$('#englishBoardCanvas');
    const marquee=this.marqueeElement();
    if(marquee)marquee.hidden=true;
    this.foamMarquee=null;

    if(!drag.moved){
      this.workspace?.clearInkSelection(false);
      this.setSelection([], 'none', null);
      this.syncPieceSelectionDom();
      this.renderFoamSelectionOverlay();
      return;
    }
    if(!canvas)return;

    const left=Math.min(drag.startX,drag.x);
    const right=Math.max(drag.startX,drag.x);
    const top=Math.min(drag.startY,drag.y);
    const bottom=Math.max(drag.startY,drag.y);
    const canvasRect=canvas.getBoundingClientRect();

    const hits=this.items.filter(item=>{
      if(item.type!=='letter'||!pieceCan(item,BOARD_CAPABILITIES.SELECTABLE))return false;
      const node=canvas.querySelector(`.free-foam-piece[data-piece-id="${CSS.escape(item.id)}"]`);
      if(!node)return false;
      const rect=node.getBoundingClientRect();
      const cx=(rect.left+rect.right)/2-canvasRect.left;
      const cy=(rect.top+rect.bottom)/2-canvasRect.top;
      return cx>=left&&cx<=right&&cy>=top&&cy<=bottom;
    }).map(item=>item.id);

    const ids=drag.additive?[...new Set([...drag.baseIds,...hits])]:hits;
    this.setSelection(ids,ids.length===1?'letter':'multi',ids[0]||null);
    this.syncPieceSelectionDom();
    this.renderFoamSelectionOverlay();
  }

  cancelFoamMarquee(event){
    if(!this.foamMarquee||this.foamMarquee.pointerId!==event.pointerId)return;
    this.foamMarquee=null;
    const marquee=this.marqueeElement();if(marquee)marquee.hidden=true;
  }

  foamResizeAnchor(corner,bounds){
    if(corner==='nw')return {x:bounds.right,y:bounds.bottom};
    if(corner==='ne')return {x:bounds.left,y:bounds.bottom};
    if(corner==='sw')return {x:bounds.right,y:bounds.top};
    return {x:bounds.left,y:bounds.top};
  }

  beginFoamResize(event,corner){
    if(!['nw','ne','se','sw'].includes(corner))return;
    const selected=this.selectedFoamItems();
    if(!selected.length)return;
    if(selected.some(item=>item.locked)){
      this.toast('Unlock selected objects before resizing');
      return;
    }

    const bounds=this.foamSelectionBounds();
    const canvas=$('#englishBoardCanvas');if(!bounds||!canvas)return;
    event.preventDefault();
    event.stopPropagation();

    const canvasRect=canvas.getBoundingClientRect();
    const anchor=this.foamResizeAnchor(corner,bounds);
    const startX=event.clientX-canvasRect.left;
    const startY=event.clientY-canvasRect.top;
    const startDistance=Math.max(8,Math.hypot(startX-anchor.x,startY-anchor.y));
    const baseFont=canvasRect.width<640?52:66;

    const origins=selected.map(item=>({
      id:item.id,
      x:Number(item.x)||0,
      y:Number(item.y)||0,
      scale:Number(item.scale)||1,
      node:canvas.querySelector(`.free-foam-piece[data-piece-id="${CSS.escape(item.id)}"]`)
    }));

    let maxFactor=Math.min(...origins.map(origin=>2.5/Math.max(.001,origin.scale)));
    const minFactor=Math.max(...origins.map(origin=>.5/Math.max(.001,origin.scale)));

    origins.forEach(origin=>{
      const cx=origin.x+35,cy=origin.y+38;
      const dx=cx-anchor.x,dy=cy-anchor.y;
      if(dx>0)maxFactor=Math.min(maxFactor,(canvasRect.width-37-anchor.x)/dx);
      if(dx<0)maxFactor=Math.min(maxFactor,(39-anchor.x)/dx);
      if(dy>0)maxFactor=Math.min(maxFactor,(canvasRect.height-44-anchor.y)/dy);
      if(dy<0)maxFactor=Math.min(maxFactor,(42-anchor.y)/dy);
    });
    if(!Number.isFinite(maxFactor)||maxFactor<minFactor)maxFactor=Math.max(minFactor,1);

    this.foamResize={
      pointerId:event.pointerId,
      corner,
      bounds,
      anchor,
      startDistance,
      minFactor:Math.max(.2,minFactor),
      maxFactor:Math.max(minFactor,maxFactor),
      factor:1,
      origins,
      baseFont,
      moved:false,
      checkpointed:false,
      raf:0
    };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  }

  applyFoamResizeFrame(drag,factor){
    drag.factor=factor;
    drag.origins.forEach(origin=>{
      const target=this.state.find(origin.id);if(!target)return;
      const cx=origin.x+35,cy=origin.y+38;
      const nextCx=drag.anchor.x+(cx-drag.anchor.x)*factor;
      const nextCy=drag.anchor.y+(cy-drag.anchor.y)*factor;
      target.x=nextCx-35;
      target.y=nextCy-38;
      target.scale=clamp(origin.scale*factor,.5,2.5);
      if(origin.node?.isConnected){
        origin.node.style.left=`${target.x}px`;
        origin.node.style.top=`${target.y}px`;
        origin.node.style.fontSize=`${Math.round(drag.baseFont*target.scale)}px`;
      }
    });

    const box=drag.bounds;
    const left=drag.anchor.x+(box.left-drag.anchor.x)*factor;
    const top=drag.anchor.y+(box.top-drag.anchor.y)*factor;
    const right=drag.anchor.x+(box.right-drag.anchor.x)*factor;
    const bottom=drag.anchor.y+(box.bottom-drag.anchor.y)*factor;
    this.renderFoamSelectionOverlay({
      left:Math.min(left,right),
      top:Math.min(top,bottom),
      right:Math.max(left,right),
      bottom:Math.max(top,bottom),
      width:Math.abs(right-left),
      height:Math.abs(bottom-top),
      cx:(left+right)/2,
      cy:(top+bottom)/2
    });
  }

  moveFoamResize(event){
    const drag=this.foamResize;
    if(!drag||drag.pointerId!==event.pointerId)return;
    const canvas=$('#englishBoardCanvas');if(!canvas)return;
    const rect=canvas.getBoundingClientRect();
    const samples=typeof event.getCoalescedEvents==='function'?event.getCoalescedEvents():null;
    const latest=samples?.length?samples[samples.length-1]:event;
    const x=latest.clientX-rect.left,y=latest.clientY-rect.top;
    let factor=Math.hypot(x-drag.anchor.x,y-drag.anchor.y)/drag.startDistance;
    factor=clamp(factor,drag.minFactor,drag.maxFactor);

    if(!drag.moved&&Math.abs(factor-1)<.018)return;
    if(!drag.moved){
      drag.moved=true;
      if(!drag.checkpointed){
        this.checkpoint('RESIZE_SELECTION');
        drag.checkpointed=true;
      }
    }

    event.preventDefault();
    drag.factor=factor;
    if(drag.raf)return;
    drag.raf=requestAnimationFrame(()=>{
      drag.raf=0;
      if(this.foamResize!==drag)return;
      this.applyFoamResizeFrame(drag,drag.factor);
    });
  }

  endFoamResize(event){
    const drag=this.foamResize;
    if(!drag||drag.pointerId!==event.pointerId)return;
    if(drag.raf){
      cancelAnimationFrame(drag.raf);
      drag.raf=0;
      if(drag.moved)this.applyFoamResizeFrame(drag,drag.factor);
    }
    this.foamResize=null;
    this.renderBoard();
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
    const rect=this.canvasRect();
    this.syncFoamCoordinatesToCanvas(rect);
    canvas.querySelectorAll('.free-foam-piece').forEach(el=>el.remove());
    const mobile=rect.width<640;
    this.items.forEach(item=>{
      if(item.type!=='letter')return;
      if(!['upper','lower'].includes(item.letterCase))item.letterCase=this.caseMode;
      if(typeof item.locked!=='boolean')item.locked=false;
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
      el.classList.toggle('is-locked',Boolean(item.locked));
      el.dataset.locked=item.locked?'true':'false';
      el.title=item.locked?`${item.wordLabel||item.logicalChar} · locked`:(item.wordLabel||item.logicalChar);
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
    this.renderFoamSelectionOverlay();
  }
  bindPiece(el,item){
    el.addEventListener('pointerdown',e=>{
      if(e.pointerType==='mouse'&&e.button!==0)return;
      e.preventDefault();

      const additive=e.shiftKey||e.metaKey||e.ctrlKey;
      if(this.mode==='build'&&this.exercise){
        this.setSelection([item.id],'letter',item.id);
      }else if(this.selectedIds.has(item.id)&&this.selectedIds.size>1&&!additive){
        this.activeItemId=item.id;
        this.updateSelectedAudio();
      }else{
        this.selectForInteraction(item,{additive});
      }
      this.syncPieceSelectionDom();

      const start=this.state.find(item.id);
      if(!start)return;
      if(start.locked){
        this.toast('Object locked');
        return;
      }

      if(this.mode==='build'&&this.exercise){
        this.exercise.feedback=null;
        this.exercise.hintIndex=null;
        this.exercise.completed=false;
        this.renderAssemblySlots();
      }

      const rect=this.canvasRect();
      const targets=this.selectedIds.has(item.id)&&this.selectedIds.size>1
        ?this.items.filter(x=>this.selectedIds.has(x.id))
        :[start];

      if(targets.some(target=>target.locked)){
        this.toast('Unlock selected objects before moving them');
        return;
      }

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
        sourceId:item.id,
        selectionOverlay:$('#englishFoamSelectionOverlay'),
        buildSlots:this.mode==='build'&&this.exercise?this.slotGeometry():null,
        buildCandidateIndex:null
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

      if(d.buildSlots?.length&&d.origins.length===1){
        const origin=d.origins[0];
        d.buildCandidateIndex=this.previewBuildDrop(origin.x+d.dx,origin.y+d.dy,d.buildSlots);
      }

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
        if(d.selectionOverlay&&!d.selectionOverlay.hidden){
          d.selectionOverlay.style.transform=`translate3d(${tx}px,${ty}px,0)`;
        }
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
      if(d.selectionOverlay)d.selectionOverlay.style.transform='';

      this.drag=null;
      this.clearBuildDropPreview();

      if(d.moved&&this.mode==='build'&&this.exercise){
        this.snapDraggedToNearestSlot(d.sourceId,d.buildSlots);
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
    const active=this.items.find(i=>i.id===this.activeItemId);
    label.textContent=`${token}${profile.sound?' · '+profile.sound:''}${profile.example?' · '+profile.example:''}${active?.locked?' · 🔒 Locked':''}`;
  }
  playSelectedAudio(kind){
    const token=this.selectedToken();
    if(!token){this.toast('Select a foam letter first');return;}
    playStructuredAudio(kind,token);
  }
  selectedFoamItems(){
    return this.items.filter(item=>this.selectedIds.has(item.id));
  }

  selectedFoamLocked(){
    return this.selectedFoamItems().some(item=>item.locked);
  }

  lockSelectedFoam(){
    const selected=this.selectedFoamItems();
    if(!selected.length)return;
    this.checkpoint('LOCK_OBJECT');
    selected.forEach(item=>{item.locked=true;});
    this.renderBoard();
    this.toast(selected.length>1?'Objects locked':'Object locked');
  }

  unlockSelectedFoam(){
    const selected=this.selectedFoamItems();
    if(!selected.length)return;
    this.checkpoint('UNLOCK_OBJECT');
    selected.forEach(item=>{item.locked=false;});
    this.renderBoard();
    this.toast(selected.length>1?'Objects unlocked':'Object unlocked');
  }

  resizeSelected(delta){
    const selected=this.items.filter(i=>this.selectedIds.has(i.id)&&pieceCan(i,BOARD_CAPABILITIES.SCALABLE));
    if(selected.some(i=>i.locked)){this.toast('Unlock selected objects before resizing');return;}
    if(!selected.length)return;
    this.checkpoint('RESIZE');
    applyBoardCommand(this.state,{type:BOARD_COMMANDS.RESIZE_PIECES,ids:selected.map(i=>i.id),delta,min:.5,max:2.5});
    this.renderBoard();
  }
  resetSelectedSize(){
    const selected=this.items.filter(i=>this.selectedIds.has(i.id));if(!selected.length)return;
    if(selected.some(i=>i.locked)){this.toast('Unlock selected objects before resizing');return;}
    this.checkpoint('RESET_SIZE');selected.forEach(i=>i.scale=1);this.renderBoard();
  }
  duplicateSelected(){
    const selected=this.selectedFoamItems();
    if(!selected.length)return;
    if(selected.some(item=>item.locked)){this.toast('Unlock selected objects before duplicating');return;}

    this.checkpoint('DUPLICATE');
    const wordMap=new Map();
    const copies=selected.map(src=>{
      let wordId=null;
      if(src.wordId){
        if(!wordMap.has(src.wordId))wordMap.set(src.wordId,`word_copy_${Date.now()}_${Math.random().toString(36).slice(2,7)}`);
        wordId=wordMap.get(src.wordId);
      }
      return this.createPiece(src.logicalChar,src.x+28,src.y+28,{
        scale:src.scale,
        rotation:0,
        color:src.color,
        phonicsRole:src.phonicsRole||null,
        letterCase:src.letterCase||'upper',
        locked:false,
        wordId,
        wordLabel:src.wordLabel||null,
        detachedFrom:src.detachedFrom||null,
        detachedLabel:src.detachedLabel||null
      });
    });

    copies.forEach(piece=>applyBoardCommand(this.state,{type:BOARD_COMMANDS.ADD_PIECE,piece}));
    this.setSelection(copies.map(piece=>piece.id),copies.length===1?'letter':'multi',copies[0]?.id||null);
    this.renderBoard();
  }
  deleteSelected(){
    if(!this.selectedIds.size)return;
    if(this.selectedFoamLocked()){this.toast('Unlock selected objects before deleting');return;}
    this.checkpoint('DELETE');
    const deleting=new Set(this.selectedIds);
    if(this.exercise?.slots){
      this.exercise.slots=this.exercise.slots.map(id=>deleting.has(id)?null:id);
      this.exercise.feedback=null;
      this.exercise.hintIndex=null;
      this.exercise.completed=false;
    }
    applyBoardCommand(this.state,{type:BOARD_COMMANDS.DELETE_PIECES,ids:[...this.selectedIds]});
    this.clearSelection(false);this.renderBoard();
  }
  clearBoard(){
    if(!this.items.length)return;
    const locked=this.items.filter(item=>item.locked);
    const removable=this.items.length-locked.length;
    if(!removable){
      this.toast('Locked template objects are protected');
      return;
    }
    this.checkpoint('CLEAR');
    this.state.replace(locked);
    this.exercise=null;
    this.segmentState=null;
    this.clearSelection(false);
    this.renderBoard();
    this.toast(locked.length?'Board cleared · locked objects kept':'Board cleared');
  }
  scatterPieces(){
    const targets=this.selectedIds.size?this.items.filter(i=>this.selectedIds.has(i.id)):this.items;
    if(!targets.length)return;
    if(targets.some(i=>i.locked)){this.toast('Unlock objects before scattering');return;}
    this.checkpoint('SCATTER');const rect=this.canvasRect();
    targets.forEach(i=>{i.x=20+Math.random()*Math.max(30,rect.width-105);i.y=35+Math.random()*Math.max(30,rect.height-120);i.rotation=0;});
    this.renderBoard();
  }
  autoAlignRows(){
    if(!this.items.length)return;
    const targets=this.selectedIds.size?this.items.filter(i=>this.selectedIds.has(i.id)):this.items;
    if(!targets.length)return;
    if(targets.some(i=>i.locked)){this.toast('Unlock objects before aligning');return;}
    this.checkpoint('ALIGN');const rect=this.canvasRect();
    const groups=new Map();
    targets.forEach(i=>{const key=i.wordId||'__free__';if(!groups.has(key))groups.set(key,[]);groups.get(key).push(i);});
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
  validBuildSnapMode(mode){
    return ['off','inside','strong'].includes(mode)?mode:'inside';
  }

  normalizeBuildExercise(){
    const ex=this.exercise;
    if(!ex)return null;

    ex.word=String(ex.word||ex.sourceWord||'').toUpperCase().replace(/[^A-Z]/g,'').slice(0,14);
    ex.sourceWord=String(ex.sourceWord||ex.word).replace(/[^A-Za-z]/g,'').slice(0,14)||ex.word;
    ex.letters=Array.isArray(ex.letters)&&ex.letters.length===ex.word.length?[...ex.letters]:[...ex.word];
    ex.slots=Array.isArray(ex.slots)&&ex.slots.length===ex.word.length?[...ex.slots]:Array(ex.word.length).fill(null);
    ex.slots=ex.slots.map(id=>id&&this.state.find(id)?id:null);
    ex.snapMode=this.validBuildSnapMode(ex.snapMode||'inside');
    ex.caseMatters=Boolean(ex.caseMatters);
    ex.showTarget=typeof ex.showTarget==='boolean'?ex.showTarget:true;
    ex.expectedCases=Array.isArray(ex.expectedCases)&&ex.expectedCases.length===ex.word.length
      ?ex.expectedCases.map(value=>value==='lower'?'lower':'upper')
      :[...ex.sourceWord].map(char=>char===char.toLowerCase()?'lower':'upper');
    ex.attempts=Math.max(0,Number(ex.attempts)||0);
    ex.feedback=Array.isArray(ex.feedback)&&ex.feedback.length===ex.word.length?[...ex.feedback]:null;
    ex.hintIndex=Number.isInteger(ex.hintIndex)&&ex.hintIndex>=0&&ex.hintIndex<ex.word.length?ex.hintIndex:null;
    ex.completed=Boolean(ex.completed);
    return ex;
  }

  buildHintText(){
    const mode=this.validBuildSnapMode(this.exercise?.snapMode||this.buildSnapModeSetting);
    if(mode==='off')return 'Move letters freely. Drop inside a slot to assign it; the letter stays exactly where you release it.';
    if(mode==='strong')return 'Move letters freely. Nearby slots attract the letter when you release it.';
    return 'Move letters freely. A letter snaps only when you drop it inside an answer slot.';
  }

  syncWorkspaceBuildControls(){
    const active=this.mode==='build'&&Boolean(this.exercise);
    const actions=$('#englishWorkspaceBuildActions');
    if(actions)actions.classList.toggle('hidden',!active);

    const status=$('#englishWorkspaceBuildStatus');
    const normalStatus=$('#englishExerciseStatus');
    if(status){
      status.textContent=active?(normalStatus?.textContent||'Build the word.'):'';
      status.dataset.type=normalStatus?.dataset.type||'info';
    }
  }

  syncBuildOptionControls(){
    this.normalizeBuildExercise();
    const snap=this.exercise?.snapMode||this.buildSnapModeSetting;
    const caseMatters=typeof this.exercise?.caseMatters==='boolean'
      ?this.exercise.caseMatters
      :this.buildCaseMattersSetting;

    const snapSelect=$('#englishBuildSnapMode');
    if(snapSelect)snapSelect.value=this.validBuildSnapMode(snap);
    const caseToggle=$('#englishCaseMatters');
    if(caseToggle)caseToggle.checked=Boolean(caseMatters);
    const showTargetToggle=$('#englishShowTarget');
    if(showTargetToggle)showTargetToggle.checked=this.exercise?.showTarget!==false;

    if(this.exercise?.sourceWord){
      const input=$('#englishBuildWord');
      if(input)input.value=this.exercise.sourceWord;
    }

    if(this.mode==='build'){
      const hint=$('#englishBoardHint');
      if(hint)hint.textContent=this.buildHintText();
    }
    this.syncWorkspaceBuildControls();
  }

  setBuildSnapMode(mode){
    const next=this.validBuildSnapMode(mode);
    this.buildSnapModeSetting=next;
    localStorage.setItem('englishLab.buildSnapMode',next);
    if(this.exercise){
      this.exercise.snapMode=next;
      this.exercise.feedback=null;
      this.exercise.hintIndex=null;
      this.exercise.completed=false;
      this.renderAssemblySlots();
      this.persist();
    }
    this.syncBuildOptionControls();
    const label=next==='off'?'Off':next==='strong'?'Strong':'Inside';
    this.toast(`Build snap: ${label}`);
  }

  setBuildShowTarget(enabled){
    const next=Boolean(enabled);
    if(this.exercise){
      this.exercise.showTarget=next;
      this.renderAssemblySlots();
      this.persist();
    }
    this.syncBuildOptionControls();
  }

  setBuildCaseMatters(enabled){
    const next=Boolean(enabled);
    this.buildCaseMattersSetting=next;
    localStorage.setItem('englishLab.buildCaseMatters',String(next));
    if(this.exercise){
      this.exercise.caseMatters=next;
      this.exercise.feedback=null;
      this.exercise.hintIndex=null;
      this.exercise.completed=false;
      this.renderAssemblySlots();
      this.persist();
    }
    this.syncBuildOptionControls();
    this.toast(next?'Case matters: on':'Case matters: off');
  }

  startBuild(){
    const input=$('#englishBuildWord');
    const sourceWord=String(input?.value||'').replace(/[^A-Za-z]/g,'').slice(0,14);
    if(!sourceWord){this.toast('Type an English word first');return;}

    const word=sourceWord.toUpperCase();
    const snapMode=this.validBuildSnapMode($('#englishBuildSnapMode')?.value||this.buildSnapModeSetting);
    const caseMatters=Boolean($('#englishCaseMatters')?.checked);
    this.buildSnapModeSetting=snapMode;
    this.buildCaseMattersSetting=caseMatters;
    localStorage.setItem('englishLab.buildSnapMode',snapMode);
    localStorage.setItem('englishLab.buildCaseMatters',String(caseMatters));

    if(this.mode!=='build')this.setMode('build',true);
    this.checkpoint('START_EXERCISE');
    this.state.replace([]);
    this.clearSelection(false);

    const expectedCases=[...sourceWord].map(char=>char===char.toLowerCase()?'lower':'upper');
    this.exercise={
      id:`exercise_${Date.now()}`,
      word,
      sourceWord,
      expectedCases,
      letters:[...word],
      slots:Array(word.length).fill(null),
      attempts:0,
      snapMode,
      caseMatters,
      showTarget:Boolean($('#englishShowTarget')?.checked!==false),
      feedback:null,
      hintIndex:null,
      completed:false
    };

    const order=[...this.exercise.letters.keys()];
    for(let i=order.length-1;i>0;i--){
      const j=Math.floor(Math.random()*(i+1));
      [order[i],order[j]]=[order[j],order[i]];
    }

    const rect=this.canvasRect();
    const phonics=analyzeWordPhonics(word);
    order.forEach((targetIndex,k)=>{
      const cols=Math.max(2,Math.min(word.length,Math.floor((rect.width-50)/90)));
      const col=k%cols,row=Math.floor(k/cols);
      const role=phonics[targetIndex]||{
        color:colorFor(word[targetIndex]),
        role:VOWELS.has(word[targetIndex])?'vowel':'consonant'
      };
      const piece=this.createPiece(word[targetIndex],35+col*90+(Math.random()*18-9),65+row*100+(Math.random()*18-9),{
        exerciseId:this.exercise.id,
        exerciseTargetIndex:targetIndex,
        color:role.color,
        phonicsRole:role.role,
        letterCase:expectedCases[targetIndex]
      });
      applyBoardCommand(this.state,{type:BOARD_COMMANDS.ADD_PIECE,piece});
    });

    $('#englishAssemblyZone')?.classList.remove('hidden');
    this.syncBuildOptionControls();
    this.renderBoard();
    const snapLabel=snapMode==='off'?'Snap off':snapMode==='strong'?'Strong snap':'Inside snap';
    this.setExerciseStatus(`Scattered ${word.length} foam letters · ${snapLabel}${caseMatters?' · case matters':''}.`);
  }

  reshuffleExercise(){
    if(!this.exercise){this.startBuild();return;}
    this.normalizeBuildExercise();
    this.checkpoint('RESHUFFLE_EXERCISE');
    this.clearSelection(false);
    this.exercise.slots=Array(this.exercise.word.length).fill(null);
    this.exercise.feedback=null;
    this.exercise.hintIndex=null;
    this.exercise.completed=false;
    this.items.forEach(item=>{if(item.exerciseId===this.exercise.id)item.exerciseSlot=null;});

    const pieces=this.items.filter(item=>item.exerciseId===this.exercise.id);
    const rect=this.canvasRect();
    pieces.forEach((item,index)=>{
      const cols=Math.max(2,Math.min(pieces.length,Math.floor((rect.width-50)/90)));
      const col=index%cols,row=Math.floor(index/cols);
      item.x=35+col*90+(Math.random()*18-9);
      item.y=65+row*100+(Math.random()*18-9);
      item.rotation=0;
    });

    this.renderBoard();
    this.setExerciseStatus('Letters scattered again. Build the word when you are ready.');
  }

  slotGeometry(){
    const canvas=this.canvasRect();
    const zone=$('#englishAssemblySlots');if(!zone)return[];
    return [...zone.querySelectorAll('.english-answer-slot')].map((el,index)=>{
      const rect=el.getBoundingClientRect();
      return {
        index,
        left:rect.left-canvas.left,
        top:rect.top-canvas.top,
        width:rect.width,
        height:rect.height,
        cx:rect.left-canvas.left+rect.width/2,
        cy:rect.top-canvas.top+rect.height/2
      };
    });
  }

  findBuildSlotCandidate(pieceX,pieceY,slots=this.slotGeometry(),mode=this.exercise?.snapMode){
    if(!Array.isArray(slots)||!slots.length)return null;
    const snapMode=this.validBuildSnapMode(mode||this.exercise?.snapMode||'inside');
    const px=Number(pieceX)||0;
    const py=Number(pieceY)||0;
    const cx=px+35,cy=py+38;

    const exact=slots.find(slot=>
      cx>=slot.left&&cx<=slot.left+slot.width&&
      cy>=slot.top&&cy<=slot.top+slot.height
    );
    if(exact)return exact;
    if(snapMode!=='strong')return null;

    const margin=42;
    const nearby=slots.filter(slot=>
      cx>=slot.left-margin&&cx<=slot.left+slot.width+margin&&
      cy>=slot.top-margin&&cy<=slot.top+slot.height+margin
    );
    if(!nearby.length)return null;
    nearby.sort((a,b)=>Math.hypot(cx-a.cx,cy-a.cy)-Math.hypot(cx-b.cx,cy-b.cy));
    return nearby[0]||null;
  }

  clearBuildDropPreview(){
    document.querySelectorAll('.english-answer-slot.drop-target,.english-answer-slot.drop-target-strong,.english-answer-slot.drop-target-off')
      .forEach(slot=>slot.classList.remove('drop-target','drop-target-strong','drop-target-off'));
  }

  previewBuildDrop(pieceX,pieceY,slots){
    if(!this.exercise)return null;
    const candidate=this.findBuildSlotCandidate(pieceX,pieceY,slots,this.exercise.snapMode);
    this.clearBuildDropPreview();
    if(candidate){
      const slot=$(`.english-answer-slot[data-slot="${candidate.index}"]`);
      if(slot){
        slot.classList.add('drop-target');
        if(this.exercise.snapMode==='strong')slot.classList.add('drop-target-strong');
        if(this.exercise.snapMode==='off')slot.classList.add('drop-target-off');
      }
    }
    return candidate?.index??null;
  }

  displaceBuildPiece(piece,slot){
    if(!piece||!slot)return;
    const rect=this.canvasRect();
    piece.exerciseSlot=null;
    piece.x=clamp(slot.left,4,Math.max(4,rect.width-72));
    piece.y=clamp(slot.top-92,4,Math.max(4,rect.height-82));
  }

  snapDraggedToNearestSlot(pieceId,slots=null){
    if(!this.exercise)return;
    this.normalizeBuildExercise();
    const item=this.state.find(pieceId);if(!item)return;
    const geometry=Array.isArray(slots)&&slots.length?slots:this.slotGeometry();
    if(!geometry.length){this.renderBoard();return;}

    this.exercise.slots=this.exercise.slots.map(id=>id===pieceId?null:id);
    item.exerciseSlot=null;

    const target=this.findBuildSlotCandidate(item.x,item.y,geometry,this.exercise.snapMode);
    if(target){
      const displacedId=this.exercise.slots[target.index];
      if(displacedId&&displacedId!==pieceId){
        this.displaceBuildPiece(this.state.find(displacedId),target);
      }

      this.exercise.slots[target.index]=pieceId;
      item.exerciseSlot=target.index;

      if(this.exercise.snapMode!=='off'){
        item.x=target.left+(target.width-70)/2;
        item.y=target.top+(target.height-76)/2;
      }
    }

    this.exercise.feedback=null;
    this.exercise.hintIndex=null;
    this.exercise.completed=false;
    this.renderBoard();
    this.updateBuildProgressStatus(Boolean(target));
  }

  buildSlotEvaluation(index,pieceId=this.exercise?.slots?.[index]){
    const ex=this.normalizeBuildExercise();
    if(!ex||!pieceId)return 'empty';
    const item=this.state.find(pieceId);
    if(!item)return 'empty';

    const expectedChar=ex.word[index]||'';
    if(String(item.logicalChar||'').toUpperCase()!==expectedChar)return 'wrong';

    if(ex.caseMatters){
      const expectedCase=ex.expectedCases[index]||'upper';
      const actualCase=item.letterCase==='lower'?'lower':'upper';
      if(actualCase!==expectedCase)return 'case';
    }
    return 'correct';
  }

  expectedBuildGlyph(index){
    const ex=this.normalizeBuildExercise();
    if(!ex)return '';
    const char=ex.word[index]||'';
    return (ex.expectedCases[index]==='lower')?char.toLowerCase():char.toUpperCase();
  }

  updateBuildProgressStatus(droppedIntoSlot=false){
    const ex=this.normalizeBuildExercise();if(!ex)return;
    const placed=ex.slots.filter(Boolean).length;
    if(placed===ex.word.length){
      this.setExerciseStatus('All letters are placed. Press Check order.');
      return;
    }
    if(droppedIntoSlot){
      this.setExerciseStatus(`Placed ${placed} of ${ex.word.length} letters. ${ex.word.length-placed} to go.`);
    }else{
      this.setExerciseStatus(`${placed} of ${ex.word.length} letters are in slots.`);
    }
  }

  placeSelectedBuildPieceInSlot(index){
    const ex=this.normalizeBuildExercise();
    if(!ex||!Number.isInteger(index)||index<0||index>=ex.word.length)return false;

    const piece=this.state.find(this.activeItemId);
    if(!piece||piece.exerciseId!==ex.id){
      this.toast('Select one of the scattered build letters first');
      return false;
    }
    if(piece.locked){
      this.toast('Object locked');
      return false;
    }

    const geometry=this.slotGeometry();
    const target=geometry.find(slot=>slot.index===index);
    if(!target)return false;

    this.checkpoint('PLACE_BUILD_PIECE');
    ex.slots=ex.slots.map(id=>id===piece.id?null:id);
    piece.exerciseSlot=null;

    const displacedId=ex.slots[index];
    if(displacedId&&displacedId!==piece.id){
      this.displaceBuildPiece(this.state.find(displacedId),target);
    }

    ex.slots[index]=piece.id;
    piece.exerciseSlot=index;
    piece.x=target.left+(target.width-70)/2;
    piece.y=target.top+(target.height-76)/2;
    ex.feedback=null;
    ex.hintIndex=null;
    ex.completed=false;
    this.keyboardGrabbed=false;
    this.renderBoard();
    this.updateBuildProgressStatus(true);
    return true;
  }

  renderAssemblySlots(){
    const zone=$('#englishAssemblyZone'),slots=$('#englishAssemblySlots'),target=$('#englishTargetBadge');
    if(!zone||!slots)return;
    const ex=this.normalizeBuildExercise();
    if(!ex){zone.classList.add('hidden');return;}

    zone.classList.remove('hidden');
    zone.dataset.snapMode=ex.snapMode;
    zone.classList.toggle('build-complete',Boolean(ex.completed));

    if(target){
      target.textContent=ex.showTarget?ex.sourceWord:`${ex.word.length} letters`;
    }

    slots.innerHTML='';
    ex.word.split('').forEach((letter,index)=>{
      const el=document.createElement('div');
      el.className='english-answer-slot';
      el.dataset.slot=String(index);
      el.tabIndex=0;
      el.setAttribute('role','button');

      const pieceId=ex.slots[index];
      const item=pieceId?this.state.find(pieceId):null;
      if(item){
        el.classList.add('filled');
        if(ex.snapMode==='off'){
          el.innerHTML='<span class="slot-accepted" aria-hidden="true">✓</span>';
        }else{
          el.textContent=this.displayPiece(item);
        }
      }else{
        el.innerHTML='<span>'+String(index+1)+'</span>';
      }

      const feedback=ex.feedback?.[index];
      if(['correct','wrong','case','empty'].includes(feedback)){
        el.classList.add(`feedback-${feedback}`);
      }
      if(ex.hintIndex===index)el.classList.add('hint-target');

      const expected=this.expectedBuildGlyph(index);
      el.setAttribute('aria-label',item
        ?`Position ${index+1}, filled. Select a letter then activate this slot to replace it.`
        :`Position ${index+1}, expected ${expected}. Select a letter then activate this slot.`);
      el.addEventListener('click',()=>this.placeSelectedBuildPieceInSlot(index));
      el.addEventListener('keydown',event=>{
        if(!['Enter',' '].includes(event.key))return;
        event.preventDefault();
        this.placeSelectedBuildPieceInSlot(index);
      });
      slots.appendChild(el);
    });
  }

  checkExercise(){
    const ex=this.normalizeBuildExercise();if(!ex)return;
    ex.attempts++;
    ex.hintIndex=null;

    const evaluations=ex.slots.map((pieceId,index)=>this.buildSlotEvaluation(index,pieceId));
    ex.feedback=evaluations;
    const correct=evaluations.filter(value=>value==='correct').length;
    const empty=evaluations.filter(value=>value==='empty').length;
    const caseErrors=evaluations.filter(value=>value==='case').length;
    const wrong=evaluations.filter(value=>value==='wrong').length;

    if(correct===ex.word.length){
      ex.completed=true;
      this.renderAssemblySlots();
      const display=ex.sourceWord||ex.word;
      this.setExerciseStatus(`Correct! ${display} is complete ✓ · attempt ${ex.attempts}.`,'good');
      speak(display);
    }else if(empty){
      ex.completed=false;
      this.renderAssemblySlots();
      this.setExerciseStatus(
        `Place ${empty} more letter${empty===1?'':'s'} · ${correct} of ${ex.word.length} positions are correct so far.`,
        'bad'
      );
    }else{
      ex.completed=false;
      this.renderAssemblySlots();
      let detail=`${correct} of ${ex.word.length} positions are correct.`;
      if(wrong)detail+=` ${wrong} need${wrong===1?'s':''} a different letter.`;
      if(caseErrors)detail+=` ${caseErrors} ${caseErrors===1?'has':'have'} the right letter but wrong case.`;
      this.setExerciseStatus(detail,'bad');
    }
    this.persist();
  }

  hintExercise(){
    const ex=this.normalizeBuildExercise();if(!ex)return;
    const index=ex.slots.findIndex((pieceId,i)=>this.buildSlotEvaluation(i,pieceId)!=='correct');
    if(index<0){this.checkExercise();return;}

    const needed=ex.word[index];
    const expectedCase=ex.expectedCases[index]||'upper';
    const candidate=this.items.find(item=>
      item.exerciseId===ex.id&&
      String(item.logicalChar||'').toUpperCase()===needed&&
      item.exerciseSlot!==index&&
      (!ex.caseMatters||(item.letterCase==='lower'?'lower':'upper')===expectedCase)
    );

    ex.hintIndex=index;
    this.renderAssemblySlots();
    if(candidate){
      this.setSelection([candidate.id],'letter',candidate.id);
      this.renderBoard();
    }
    const glyph=this.expectedBuildGlyph(index);
    this.setExerciseStatus(`Hint: move ${glyph} to position ${index+1}.`);
  }

  setExerciseStatus(message,type='info'){
    const el=$('#englishExerciseStatus');
    if(el){el.textContent=message;el.dataset.type=type;}
    const workspace=$('#englishWorkspaceBuildStatus');
    if(workspace){workspace.textContent=message;workspace.dataset.type=type;}
    this.syncWorkspaceBuildControls();
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
    add('Full-board Build controls',Boolean(
      $('#englishWorkspaceBuildActions')&&
      $('#englishWorkspaceBuildCheck')&&
      $('#englishWorkspaceBuildHint')&&
      $('#englishWorkspaceBuildReshuffle')
    ),'Check / Hint / Reshuffle remain available in Full Board');
    add('Foam canvas-space remapping',typeof this.syncFoamCoordinatesToCanvas==='function','Preserves relative foam positions across Normal / Full Board');
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
    add('Upright foam letters',this.items.every(item=>item.type!=='letter'||Math.abs(Number(item.rotation)||0)<.001),'All rendered foam letters should remain at 0°');
    add('Full Board side toolbox',Boolean($('#englishWorkspaceToolbox')),'Scrollable side toolbox with all board tools');
    add('Board rename / duplicate',document.querySelectorAll('[data-board-action="rename"]').length>=2&&document.querySelectorAll('[data-board-action="duplicate"]').length>=2,'Normal + Full Board');
    add('Object locking',Boolean($('#englishLockSelected')&&$('#englishWorkspaceLockSelected')),'Foam and vector ink');
    add('Direct tray drag',typeof this.bindTrayDirectDrag==='function','Tray / grapheme / Full Board strip');
    add('Lesson save / transfer',document.querySelectorAll('[data-lesson-action]').length>=8&&Boolean($('#englishLessonImport')),'Save / Load / Export / Import');
    add('Per-board Start State',document.querySelectorAll('[data-activity-action="set-start"]').length>=2,'Set / Reset current / Reset lesson');
    add('Student Play navigation',document.querySelectorAll('[data-student-board-step]').length>=4,'Previous / Start over / Next');
    add('Rectangle foam selection',Boolean($('#englishFoamMarquee'))&&typeof this.beginFoamMarquee==='function','Drag empty board in Move mode');
    add('Foam selection bounding box',Boolean($('#englishFoamSelectionOverlay'))&&document.querySelectorAll('[data-foam-resize]').length===4,'Direct corner resize handles');
    add('Group direct manipulation',typeof this.applyFoamResizeFrame==='function','Move/resize/duplicate selected foam as one group');
    add('Board surfaces',document.querySelectorAll('[data-board-surface]').length>=8,'Current / Squares / Notebook / English');
    const snapProbe={index:0,left:100,top:100,width:60,height:60,cx:130,cy:130};
    const snapInsideExact=this.findBuildSlotCandidate(100,100,[snapProbe],'inside')?.index===0;
    const snapInsideRejectsNear=this.findBuildSlotCandidate(60,100,[snapProbe],'inside')===null;
    const snapStrongCapturesNear=this.findBuildSlotCandidate(60,100,[snapProbe],'strong')?.index===0;
    add('Build free movement',snapInsideExact&&snapInsideRejectsNear,'Inside snap only captures when the piece center enters a slot');
    add('Build 2.0 snap modes',Boolean($('#englishBuildSnapMode')&&$('#englishCaseMatters'))&&snapStrongCapturesNear,'Off / Inside / Strong + Case Matters');
    add('Build slot feedback',typeof this.buildSlotEvaluation==='function'&&typeof this.previewBuildDrop==='function','Live target + correct/wrong/case feedback');
    add('Tap / keyboard slot placement',typeof this.placeSelectedBuildPieceInSlot==='function','Selected build letters can be placed without precision dragging');
    add('Keyboard / webOS activation',this.platform.actionForKey('Enter')?.type==='activate','OK selects/releases foam objects; arrows move selected objects');
    add('Exercise-aware Undo / Redo',typeof this.historySnapshot==='function','Foam + Build slots + Segment state');
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
