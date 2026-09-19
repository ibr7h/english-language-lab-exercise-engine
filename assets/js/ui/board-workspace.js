const WORKSPACE_STORAGE_KEY='englishLab.boardWorkspace.v1';
const INK_STORAGE_KEY='englishLab.boardInk.v4';
const LEGACY_INK_V3_KEY='englishLab.boardInk.v3';
const LEGACY_INK_V2_KEY='englishLab.boardInk.v2';
const LEGACY_INK_V1_KEY='englishLab.boardInk.v1';

function safeParse(raw,fallback){
  if(!raw)return fallback;
  try{return JSON.parse(raw);}catch(_){return fallback;}
}
function clone(value){
  if(typeof structuredClone==='function')return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}
function clamp(n,min,max){return Math.max(min,Math.min(max,n));}
function uid(prefix='ink'){
  if(globalThis.crypto?.randomUUID)return `${prefix}_${crypto.randomUUID()}`;
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2,9)}`;
}

export class BoardWorkspace {
  constructor(board,{alphabet=[],digraphs=[],vowelTeams=[]}={}){
    this.board=board;
    this.alphabet=[...alphabet];
    this.digraphs=[...digraphs];
    this.vowelTeams=[...vowelTeams];

    this.section=document.querySelector('#magnetic-board');
    this.canvasHost=document.querySelector('#englishBoardCanvas');
    this.inkSvg=document.querySelector('#englishInkSvg');
    this.inkLayer=document.querySelector('#englishInkObjects');
    this.selectionLayer=document.querySelector('#englishInkSelection');
    this.lassoLayer=document.querySelector('#englishInkLasso');
    this.guideLayer=document.querySelector('#englishWritingGuides');
    this.toolbox=document.querySelector('#englishWorkspaceToolbox');
    this.strip=document.querySelector('#englishWorkspaceLetterStrip');
    this.stripScroller=document.querySelector('#englishWorkspaceStripScroller');

    this.settings={
      tool:'move',
      guide:'blank',
      penColor:'#172132',
      penWidth:5,
      strip:'letters',
      toolboxOpen:true,
      ...safeParse(localStorage.getItem(WORKSPACE_STORAGE_KEY),{})
    };

    this.strokes=[];
    this.selectedStrokeId=null;
    this.selectedStrokeIds=new Set();
    this.activeStroke=null;
    this.activeLasso=null;
    this.strokeDrag=null;
    this.inkPast=[];
    this.inkFuture=[];
    this.inkHistoryLimit=80;
    this.resizeObserver=null;
    this.isWorkspace=false;
    this.nativeFullscreenRequested=false;
    this.pendingLegacyInk=null;
    this.legacyInkMigrated=false;

    this.loadInk();
  }

  loadInk(){
    const current=safeParse(localStorage.getItem(INK_STORAGE_KEY),null);
    if(current?.version===4&&Array.isArray(current.strokes)){
      this.strokes=current.strokes.map(stroke=>this.normalizeStroke(stroke)).filter(Boolean);
      return;
    }

    const legacyV3=safeParse(localStorage.getItem(LEGACY_INK_V3_KEY),null);
    if(legacyV3?.version===3&&Array.isArray(legacyV3.strokes)){
      this.pendingLegacyInk={version:3,strokes:legacyV3.strokes};
      return;
    }

    const legacyV2=safeParse(localStorage.getItem(LEGACY_INK_V2_KEY),null);
    if(legacyV2?.version===2&&Array.isArray(legacyV2.strokes)){
      this.pendingLegacyInk={version:2,strokes:legacyV2.strokes};
      return;
    }

    const legacyV1=safeParse(localStorage.getItem(LEGACY_INK_V1_KEY),null);
    if(legacyV1?.strokes&&Array.isArray(legacyV1.strokes)){
      this.pendingLegacyInk={
        version:1,
        strokes:legacyV1.strokes.filter(stroke=>stroke&&stroke.tool!=='erase')
      };
    }
  }

  normalizeStroke(stroke){
    if(!stroke||!Array.isArray(stroke.localPoints)||!stroke.localPoints.length)return null;
    return {
      id:String(stroke.id||uid('ink')),
      color:String(stroke.color||'#172132'),
      width:clamp(Number(stroke.width)||5,1,40),
      anchorX:Number(stroke.anchorX)||0,
      anchorY:Number(stroke.anchorY)||0,
      localPoints:stroke.localPoints.map(point=>({
        x:Number(point.x)||0,
        y:Number(point.y)||0,
        pressure:clamp(Number(point.pressure)||.5,0,1)
      })),
      scale:clamp(Number(stroke.scale)||1,.25,4),
      groupId:stroke.groupId==null?null:String(stroke.groupId)
    };
  }

  migrateLegacyInk(){
    if(!this.pendingLegacyInk?.strokes?.length)return false;
    const rect=this.inkSvg.getBoundingClientRect();
    if(rect.width<2||rect.height<2)return false;
    const base=Math.max(1,Math.min(rect.width,rect.height));

    const migrated=[];

    if(this.pendingLegacyInk.version===3){
      for(const raw of this.pendingLegacyInk.strokes){
        if(!raw||!Array.isArray(raw.localPoints)||!raw.localPoints.length)continue;
        migrated.push({
          id:String(raw.id||uid('ink')),
          color:String(raw.color||'#172132'),
          width:clamp(Number(raw.width)||5,1,40),
          anchorX:(Number(raw.anchorX)||0)*rect.width,
          anchorY:(Number(raw.anchorY)||0)*rect.height,
          localPoints:raw.localPoints.map(point=>({
            x:(Number(point.x)||0)*base,
            y:(Number(point.y)||0)*base,
            pressure:clamp(Number(point.pressure)||.5,0,1)
          })),
          scale:clamp(Number(raw.scale)||1,.25,4),
          groupId:raw.groupId==null?null:String(raw.groupId)
        });
      }
    }else{
      for(const raw of this.pendingLegacyInk.strokes){
        if(!raw||!Array.isArray(raw.points)||!raw.points.length)continue;

        const points=raw.points.map(point=>({
          x:clamp(Number(point.x)||0,0,1),
          y:clamp(Number(point.y)||0,0,1),
          pressure:clamp(Number(point.pressure)||.5,0,1)
        }));

        const xs=points.map(point=>point.x);
        const ys=points.map(point=>point.y);
        const centerX=(Math.min(...xs)+Math.max(...xs))/2;
        const centerY=(Math.min(...ys)+Math.max(...ys))/2;
        const legacyScale=clamp(Number(raw.scale)||1,.25,4);
        const tx=Number(raw.tx)||0;
        const ty=Number(raw.ty)||0;

        migrated.push({
          id:String(raw.id||uid('ink')),
          color:String(raw.color||'#172132'),
          width:clamp(Number(raw.width)||5,1,40),
          anchorX:(centerX+tx)*rect.width,
          anchorY:(centerY+ty)*rect.height,
          localPoints:points.map(point=>({
            x:(point.x-centerX)*rect.width,
            y:(point.y-centerY)*rect.height,
            pressure:point.pressure
          })),
          scale:legacyScale,
          groupId:null
        });
      }
    }

    this.strokes=migrated;
    this.pendingLegacyInk=null;
    this.legacyInkMigrated=true;
    return true;
  }

  init(){
    if(!this.section||!this.canvasHost||!this.inkSvg||!this.inkLayer||!this.selectionLayer||!this.lassoLayer)return;

    this.bindControls();
    this.applyGuide(this.settings.guide,false);
    this.setTool(this.settings.tool,false);
    this.setPenColor(this.settings.penColor,false);
    this.setPenWidth(this.settings.penWidth,false);
    this.setStrip(this.settings.strip,false);
    this.setToolboxOpen(this.settings.toolboxOpen,false);
    this.renderStrip();
    this.syncCaseButtons();
    this.resizeInkSvg();

    if(this.migrateLegacyInk()){
      this.persistInk();
    }

    requestAnimationFrame(()=>{
      this.renderInk();
      this.updateFoamToolState();
    });

    if('ResizeObserver'in window){
      this.resizeObserver=new ResizeObserver(()=>{
        this.resizeInkSvg();
        this.renderInk();
        if(this.isWorkspace)this.board.renderBoard();
      });
      this.resizeObserver.observe(this.canvasHost);
    }else{
      window.addEventListener('resize',()=>{
        this.resizeInkSvg();
        this.renderInk();
      });
    }

    document.addEventListener('fullscreenchange',()=>{
      if(this.nativeFullscreenRequested&&!document.fullscreenElement&&this.isWorkspace){
        this.exit({skipNative:true});
      }
    });
  }

  bindControls(){
    document.querySelector('#englishFullscreenBoard')?.addEventListener('click',()=>this.enter());
    document.querySelector('#englishWorkspaceExit')?.addEventListener('click',()=>this.exit());
    document.querySelector('#englishWorkspaceToolboxToggle')?.addEventListener('click',()=>this.setToolboxOpen(!this.settings.toolboxOpen));

    document.querySelectorAll('[data-board-action]').forEach(btn=>{
      btn.addEventListener('click',()=>{
        if(btn.dataset.boardAction==='add')this.board.addBoard();
        if(btn.dataset.boardAction==='delete')this.board.deleteActiveBoard();
      });
    });
    document.querySelectorAll('[data-board-surface]').forEach(btn=>{
      btn.addEventListener('click',()=>this.board.setBoardSurface(btn.dataset.boardSurface));
    });

    document.querySelectorAll('[data-workspace-tool]').forEach(btn=>{
      btn.addEventListener('click',()=>this.setTool(btn.dataset.workspaceTool));
    });
    document.querySelectorAll('[data-guide-mode]').forEach(btn=>{
      btn.addEventListener('click',()=>this.applyGuide(btn.dataset.guideMode));
    });
    document.querySelectorAll('[data-workspace-case]').forEach(btn=>{
      btn.addEventListener('click',()=>this.setCase(btn.dataset.workspaceCase));
    });
    document.querySelectorAll('[data-strip-kind]').forEach(btn=>{
      btn.addEventListener('click',()=>this.setStrip(btn.dataset.stripKind));
    });
    document.querySelectorAll('[data-ink-color]').forEach(btn=>{
      btn.addEventListener('click',()=>this.setPenColor(btn.dataset.inkColor));
    });

    document.querySelector('#englishPenWidth')?.addEventListener('input',event=>this.setPenWidth(Number(event.target.value)||5));
    document.querySelector('#englishInkUndo')?.addEventListener('click',()=>this.undoInk());
    document.querySelector('#englishInkRedo')?.addEventListener('click',()=>this.redoInk());
    document.querySelector('#englishClearInk')?.addEventListener('click',()=>this.clearInk());
    document.querySelector('#englishInkGroup')?.addEventListener('click',()=>this.groupSelectedInk());
    document.querySelector('#englishInkUngroup')?.addEventListener('click',()=>this.ungroupSelectedInk());
    document.querySelector('#englishWorkspaceInkGroup')?.addEventListener('click',()=>this.groupSelectedInk());
    document.querySelector('#englishWorkspaceInkUngroup')?.addEventListener('click',()=>this.ungroupSelectedInk());

    document.querySelector('#englishWorkspaceSmaller')?.addEventListener('click',()=>this.resizeSelected(-.1));
    document.querySelector('#englishWorkspaceResetSize')?.addEventListener('click',()=>this.resetSelectedSize());
    document.querySelector('#englishWorkspaceLarger')?.addEventListener('click',()=>this.resizeSelected(.1));
    document.querySelector('#englishWorkspaceDuplicate')?.addEventListener('click',()=>this.duplicateSelected());
    document.querySelector('#englishWorkspaceDelete')?.addEventListener('click',()=>this.deleteSelected());
    document.querySelector('#englishWorkspaceAlign')?.addEventListener('click',()=>this.board.autoAlignRows());
    document.querySelector('#englishWorkspaceScatter')?.addEventListener('click',()=>this.board.scatterPieces());
    document.querySelector('#englishWorkspaceBoardUndo')?.addEventListener('click',()=>this.undoSelectedDomain());
    document.querySelector('#englishWorkspaceBoardRedo')?.addEventListener('click',()=>this.redoSelectedDomain());

    document.querySelector('#englishStripPrev')?.addEventListener('click',()=>this.scrollStrip(-1));
    document.querySelector('#englishStripNext')?.addEventListener('click',()=>this.scrollStrip(1));

    this.inkSvg.addEventListener('pointerdown',event=>{
      if(this.settings.tool==='pen'){
        if(event.target.closest?.('.ink-object'))return;
        this.beginStroke(event);
        return;
      }
      if(this.settings.tool==='lasso'){
        this.beginLasso(event);
      }
    });
    this.inkSvg.addEventListener('pointermove',event=>{
      if(this.activeStroke)this.extendStroke(event);
      if(this.activeLasso)this.extendLasso(event);
    });
    this.inkSvg.addEventListener('pointerup',event=>{
      if(this.activeStroke)this.endStroke(event);
      if(this.activeLasso)this.endLasso(event);
    });
    this.inkSvg.addEventListener('pointercancel',event=>{
      if(this.activeStroke)this.endStroke(event);
      if(this.activeLasso)this.cancelLasso(event);
    });

    document.addEventListener('keydown',event=>{
      if(event.key==='Escape'&&this.isWorkspace){
        event.preventDefault();
        this.exit();
        return;
      }

      const tag=document.activeElement?.tagName;
      if(['INPUT','TEXTAREA','SELECT'].includes(tag))return;

      if((event.key==='Delete'||event.key==='Backspace')&&this.selectedStrokeIds.size){
        event.preventDefault();
        this.deleteSelectedInk();
      }
    });
  }

  exportInkState(){
    return clone(this.strokes);
  }

  importInkState(strokes=[]){
    this.strokes=Array.isArray(strokes)?clone(strokes).map(stroke=>this.normalizeStroke(stroke)).filter(Boolean):[];
    this.selectedStrokeId=null;
    this.selectedStrokeIds.clear();
    this.activeStroke=null;
    this.activeLasso=null;
    this.strokeDrag=null;
    this.inkPast=[];
    this.inkFuture=[];
    this.persistInk();
    this.renderInk();
    this.updateFoamToolState();
  }

  persistSettings(){
    try{localStorage.setItem(WORKSPACE_STORAGE_KEY,JSON.stringify(this.settings));}catch(_){}
  }

  persistInk(){
    try{
      localStorage.setItem(INK_STORAGE_KEY,JSON.stringify({
        version:4,
        savedAt:Date.now(),
        strokes:this.strokes
      }));
    }catch(_){}
    this.board?.persistBoards?.();
  }

  checkpointInk(label='INK'){
    this.inkPast.push({label,snapshot:clone(this.strokes)});
    if(this.inkPast.length>this.inkHistoryLimit)this.inkPast.shift();
    this.inkFuture=[];
  }

  undoInk(){
    if(!this.inkPast.length)return;
    this.inkFuture.push({snapshot:clone(this.strokes)});
    const entry=this.inkPast.pop();
    this.strokes=clone(entry.snapshot);
    this.pruneInkSelection();
    this.persistInk();
    this.renderInk();
    this.updateFoamToolState();
  }

  redoInk(){
    if(!this.inkFuture.length)return;
    this.inkPast.push({snapshot:clone(this.strokes)});
    const entry=this.inkFuture.pop();
    this.strokes=clone(entry.snapshot);
    this.pruneInkSelection();
    this.persistInk();
    this.renderInk();
    this.updateFoamToolState();
  }

  undoSelectedDomain(){
    if(this.selectedStrokeIds.size||this.settings.tool==='pen'||this.settings.tool==='eraser'||this.settings.tool==='lasso'){
      this.undoInk();
      return;
    }
    this.board.undo();
  }

  redoSelectedDomain(){
    if(this.selectedStrokeIds.size||this.settings.tool==='pen'||this.settings.tool==='eraser'||this.settings.tool==='lasso'){
      this.redoInk();
      return;
    }
    this.board.redo();
  }

  async enter(){
    this.isWorkspace=true;
    document.body.classList.add('board-workspace-active');
    this.section.classList.add('is-board-workspace');
    document.querySelector('#englishWorkspaceChrome')?.setAttribute('aria-hidden','false');
    this.setToolboxOpen(this.settings.toolboxOpen,false);
    this.renderStrip();
    this.syncCaseButtons();

    requestAnimationFrame(()=>{
      this.resizeInkSvg();
      this.renderInk();
      this.board.renderBoard();
    });

    if(this.section.requestFullscreen&&!document.fullscreenElement){
      try{
        this.nativeFullscreenRequested=true;
        await this.section.requestFullscreen({navigationUI:'hide'});
      }catch(_){
        this.nativeFullscreenRequested=false;
      }
    }
  }

  async exit({skipNative=false}={}){
    this.isWorkspace=false;
    document.body.classList.remove('board-workspace-active');
    this.section.classList.remove('is-board-workspace');
    document.querySelector('#englishWorkspaceChrome')?.setAttribute('aria-hidden','true');

    if(!skipNative&&document.fullscreenElement&&document.exitFullscreen){
      try{await document.exitFullscreen();}catch(_){}
    }

    this.nativeFullscreenRequested=false;
    requestAnimationFrame(()=>{
      this.resizeInkSvg();
      this.renderInk();
      this.board.renderBoard();
    });
  }

  setToolboxOpen(open,persist=true){
    this.settings.toolboxOpen=Boolean(open);
    this.section.classList.toggle('workspace-toolbox-collapsed',!this.settings.toolboxOpen);
    const button=document.querySelector('#englishWorkspaceToolboxToggle');
    if(button)button.setAttribute('aria-expanded',String(this.settings.toolboxOpen));
    if(persist)this.persistSettings();
  }

  setTool(tool,persist=true){
    const next=['move','pen','eraser','lasso'].includes(tool)?tool:'move';
    this.settings.tool=next;
    this.canvasHost.dataset.workspaceTool=next;
    document.querySelectorAll('[data-workspace-tool]').forEach(btn=>btn.classList.toggle('active',btn.dataset.workspaceTool===next));

    if(next!=='move'){
      this.clearInkSelection(false);
      this.board.clearSelection(false);
      this.board.renderBoard();
    }

    this.renderInk();
    this.updateFoamToolState();
    if(persist)this.persistSettings();
  }

  setCase(mode){
    this.board.setTrayCase(mode);
  }

  syncCaseButtons(){
    document.querySelectorAll('[data-workspace-case]').forEach(btn=>btn.classList.toggle('active',btn.dataset.workspaceCase===this.board.caseMode));
  }

  setStrip(kind,persist=true){
    const next=['letters','digraphs','vowel-teams'].includes(kind)?kind:'letters';
    this.settings.strip=next;
    document.querySelectorAll('[data-strip-kind]').forEach(btn=>btn.classList.toggle('active',btn.dataset.stripKind===next));
    this.renderStrip();
    if(persist)this.persistSettings();
  }

  stripItems(){
    if(this.settings.strip==='digraphs')return this.digraphs.map(token=>({token,role:'digraph'}));
    if(this.settings.strip==='vowel-teams')return this.vowelTeams.map(token=>({token,role:'vowel-team'}));
    return this.alphabet.map(token=>({token,role:'letter'}));
  }

  renderStrip(){
    if(!this.stripScroller)return;
    this.stripScroller.innerHTML='';

    this.stripItems().forEach(({token,role})=>{
      const btn=document.createElement('button');
      btn.type='button';
      btn.className='workspace-letter-piece';

      const resolvedRole=role==='letter'?(/[AEIOU]/.test(token)?'vowel':'consonant'):role;
      const color=this.board.colorForToken(token,resolvedRole);

      btn.innerHTML=`<span class="foam-glyph ${color}">${this.board.escape(this.board.display(token))}</span>`;
      btn.title=`Add ${token}`;
      btn.setAttribute('aria-label',`Add foam ${token}`);

      btn.addEventListener('click',()=>{
        if(role==='letter')this.board.addLetter(token);
        else this.board.addGrapheme(token,role);
      });

      this.stripScroller.appendChild(btn);
    });
  }

  scrollStrip(direction){
    if(!this.stripScroller)return;
    const amount=Math.max(220,this.stripScroller.clientWidth*.72);
    this.stripScroller.scrollBy({left:direction*amount,behavior:'smooth'});
  }

  applyGuide(guide,persist=true){
    const next=['blank','baseline','primary','four-line'].includes(guide)?guide:'blank';
    this.settings.guide=next;

    if(this.guideLayer){
      this.guideLayer.dataset.guide=next;
      this.guideLayer.innerHTML='';

      const line=(top,kind='normal')=>{
        const span=document.createElement('span');
        span.className=`workspace-guide-line ${kind}`;
        span.style.top=top;
        this.guideLayer.appendChild(span);
      };

      if(next==='baseline')line('70%','baseline');
      if(next==='primary'){
        line('30%','topline');
        line('50%','midline');
        line('70%','baseline');
      }
      if(next==='four-line'){
        line('22%','topline');
        line('40%','midline');
        line('58%','baseline');
        line('76%','descender');
      }
    }

    document.querySelectorAll('[data-guide-mode]').forEach(btn=>btn.classList.toggle('active',btn.dataset.guideMode===next));
    if(persist)this.persistSettings();
  }

  setPenColor(color,persist=true){
    const allowed=['#172132','#dc2626','#2563eb','#15803d'];
    this.settings.penColor=allowed.includes(color)?color:'#172132';
    document.querySelectorAll('[data-ink-color]').forEach(btn=>btn.classList.toggle('active',btn.dataset.inkColor===this.settings.penColor));
    if(persist)this.persistSettings();
  }

  setPenWidth(width,persist=true){
    this.settings.penWidth=clamp(Number(width)||5,2,18);
    const input=document.querySelector('#englishPenWidth');
    if(input)input.value=String(this.settings.penWidth);
    const value=document.querySelector('#englishPenWidthValue');
    if(value)value.textContent=`${this.settings.penWidth}px`;
    if(persist)this.persistSettings();
  }

  resizeInkSvg(){
    if(!this.inkSvg||!this.canvasHost)return;
    const rect=this.canvasHost.getBoundingClientRect();
    if(rect.width<2||rect.height<2)return;
    this.inkSvg.setAttribute('viewBox',`0 0 ${rect.width} ${rect.height}`);
  }

  pointFromEvent(event){
    const rect=this.inkSvg.getBoundingClientRect();
    return {
      x:clamp(event.clientX-rect.left,0,rect.width),
      y:clamp(event.clientY-rect.top,0,rect.height),
      pressure:Number.isFinite(event.pressure)&&event.pressure>0?event.pressure:.5
    };
  }

  beginStroke(event){
    if(this.settings.tool!=='pen')return;
    if(event.pointerType==='mouse'&&event.button!==0)return;

    event.preventDefault();
    event.stopPropagation();
    this.checkpointInk('DRAW');

    this.clearInkSelection(false);
    this.board.clearSelection(false);
    this.board.renderBoard();

    this.activeStroke={
      id:uid('ink'),
      color:this.settings.penColor,
      width:this.settings.penWidth,
      draftPoints:[this.pointFromEvent(event)]
    };

    this.inkSvg.setPointerCapture?.(event.pointerId);
  }

  extendStroke(event){
    if(!this.activeStroke||this.settings.tool!=='pen')return;
    event.preventDefault();

    const point=this.pointFromEvent(event);
    const points=this.activeStroke.draftPoints;
    const prev=points[points.length-1];
    if(prev&&Math.hypot(point.x-prev.x,point.y-prev.y)<1.25)return;

    points.push(point);
    this.renderActiveStroke();
  }

  endStroke(event){
    if(!this.activeStroke)return;
    event.preventDefault();

    if(this.activeStroke.draftPoints.length===1){
      const p=this.activeStroke.draftPoints[0];
      this.activeStroke.draftPoints.push({...p,x:p.x+1,y:p.y+1});
    }

    const finalized=this.finalizeDraftStroke(this.activeStroke);
    if(finalized){
      this.strokes.push(finalized);
      this.selectedStrokeId=finalized.id;
      this.selectedStrokeIds=new Set([finalized.id]);
    }
    this.activeStroke=null;
    this.persistInk();
    this.renderInk();
    this.updateFoamToolState();
  }

  findStroke(id){
    return this.strokes.find(stroke=>stroke.id===id)||null;
  }

  selectedInkStrokes(){
    return this.strokes.filter(stroke=>this.selectedStrokeIds.has(stroke.id));
  }

  pruneInkSelection(){
    const existing=new Set(this.strokes.map(stroke=>stroke.id));
    this.selectedStrokeIds=new Set([...this.selectedStrokeIds].filter(id=>existing.has(id)));
    if(this.selectedStrokeId&&!existing.has(this.selectedStrokeId))this.selectedStrokeId=null;
    if(!this.selectedStrokeId&&this.selectedStrokeIds.size){
      this.selectedStrokeId=this.selectedStrokeIds.values().next().value||null;
    }
  }

  expandInkSelection(ids){
    const expanded=new Set((ids||[]).filter(id=>this.findStroke(id)));
    const groupIds=new Set(
      [...expanded]
        .map(id=>this.findStroke(id)?.groupId)
        .filter(Boolean)
    );
    if(groupIds.size){
      this.strokes.forEach(stroke=>{
        if(stroke.groupId&&groupIds.has(stroke.groupId))expanded.add(stroke.id);
      });
    }
    return expanded;
  }

  setInkSelection(ids,activeId=null,{render=true}={}){
    const expanded=this.expandInkSelection(ids);
    this.board.clearSelection(false);
    this.selectedStrokeIds=expanded;
    this.selectedStrokeId=activeId&&expanded.has(activeId)
      ?activeId
      :(expanded.values().next().value||null);
    if(render){
      this.renderInk();
      this.board.renderBoard();
    }
    this.updateFoamToolState();
  }

  selectionBounds(strokes=this.selectedInkStrokes()){
    if(!strokes.length)return null;
    const boxes=strokes.map(stroke=>this.strokeBounds(stroke));
    const left=Math.min(...boxes.map(box=>box.x));
    const top=Math.min(...boxes.map(box=>box.y));
    const right=Math.max(...boxes.map(box=>box.x+box.width));
    const bottom=Math.max(...boxes.map(box=>box.y+box.height));
    return {x:left,y:top,width:right-left,height:bottom-top,cx:(left+right)/2,cy:(top+bottom)/2};
  }

  groupSelectedInk(){
    const selected=this.selectedInkStrokes();
    if(selected.length<2)return;
    const groupIds=new Set(selected.map(stroke=>stroke.groupId).filter(Boolean));
    const alreadySingleGroup=groupIds.size===1&&selected.every(stroke=>stroke.groupId&&groupIds.has(stroke.groupId));
    if(alreadySingleGroup)return;

    this.checkpointInk('GROUP_INK');
    const groupId=uid('inkgroup');
    selected.forEach(stroke=>{stroke.groupId=groupId;});
    this.persistInk();
    this.renderInk();
    this.updateFoamToolState();
  }

  ungroupSelectedInk(){
    const selected=this.selectedInkStrokes();
    const groupIds=new Set(selected.map(stroke=>stroke.groupId).filter(Boolean));
    if(!groupIds.size)return;

    this.checkpointInk('UNGROUP_INK');
    this.strokes.forEach(stroke=>{
      if(stroke.groupId&&groupIds.has(stroke.groupId))stroke.groupId=null;
    });
    this.persistInk();
    this.renderInk();
    this.updateFoamToolState();
  }

  pointInPolygon(point,polygon){
    let inside=false;
    for(let i=0,j=polygon.length-1;i<polygon.length;j=i++){
      const a=polygon[i],b=polygon[j];
      const crosses=((a.y>point.y)!==(b.y>point.y)) &&
        (point.x<(b.x-a.x)*(point.y-a.y)/((b.y-a.y)||1e-9)+a.x);
      if(crosses)inside=!inside;
    }
    return inside;
  }

  segmentIntersects(a,b,c,d){
    const cross=(p,q,r)=>(q.x-p.x)*(r.y-p.y)-(q.y-p.y)*(r.x-p.x);
    const ab1=cross(a,b,c),ab2=cross(a,b,d),cd1=cross(c,d,a),cd2=cross(c,d,b);
    return ((ab1===0||ab2===0||Math.sign(ab1)!==Math.sign(ab2)) &&
            (cd1===0||cd2===0||Math.sign(cd1)!==Math.sign(cd2)));
  }

  strokeHitsPolygon(stroke,polygon){
    const points=this.renderedPoints(stroke);
    if(points.some(point=>this.pointInPolygon(point,polygon)))return true;

    const bounds=this.strokeBounds(stroke);
    if(this.pointInPolygon({x:bounds.x+bounds.width/2,y:bounds.y+bounds.height/2},polygon))return true;

    for(let i=1;i<points.length;i++){
      const a=points[i-1],b=points[i];
      for(let j=0;j<polygon.length;j++){
        const c=polygon[j],d=polygon[(j+1)%polygon.length];
        if(this.segmentIntersects(a,b,c,d))return true;
      }
    }
    return false;
  }

  beginLasso(event){
    if(this.settings.tool!=='lasso')return;
    if(event.pointerType==='mouse'&&event.button!==0)return;
    event.preventDefault();
    event.stopPropagation();

    this.clearInkSelection(false);
    this.board.clearSelection(false);
    this.board.renderBoard();

    this.activeLasso={
      pointerId:event.pointerId,
      points:[this.pointFromEvent(event)]
    };
    this.inkSvg.setPointerCapture?.(event.pointerId);
    this.renderLasso();
  }

  extendLasso(event){
    const lasso=this.activeLasso;
    if(!lasso||lasso.pointerId!==event.pointerId)return;
    event.preventDefault();

    const point=this.pointFromEvent(event);
    const prev=lasso.points[lasso.points.length-1];
    if(prev&&Math.hypot(point.x-prev.x,point.y-prev.y)<2.5)return;
    lasso.points.push(point);
    this.renderLasso();
  }

  endLasso(event){
    const lasso=this.activeLasso;
    if(!lasso||lasso.pointerId!==event.pointerId)return;
    event.preventDefault();

    const polygon=lasso.points;
    this.activeLasso=null;
    this.renderLasso();

    const ids=polygon.length>=3
      ?this.strokes.filter(stroke=>this.strokeHitsPolygon(stroke,polygon)).map(stroke=>stroke.id)
      :[];

    this.setInkSelection(ids,ids[0]||null,{render:false});
    this.setTool('move');
    this.renderInk();
    this.updateFoamToolState();
  }

  cancelLasso(event){
    if(!this.activeLasso)return;
    if(event&&this.activeLasso.pointerId!==event.pointerId)return;
    this.activeLasso=null;
    this.renderLasso();
    this.setTool('move');
  }

  renderLasso(){
    if(!this.lassoLayer)return;
    this.lassoLayer.innerHTML='';
    const points=this.activeLasso?.points||[];
    if(points.length<2)return;

    const path=document.createElementNS('http://www.w3.org/2000/svg','path');
    path.classList.add('ink-lasso-path');
    const d=points.map((point,index)=>`${index?'L':'M'} ${point.x} ${point.y}`).join(' ')+' Z';
    path.setAttribute('d',d);
    this.lassoLayer.appendChild(path);
  }

  finalizeDraftStroke(draft){
    const points=draft?.draftPoints;
    if(!Array.isArray(points)||!points.length)return null;

    const xs=points.map(point=>point.x);
    const ys=points.map(point=>point.y);
    const centerX=(Math.min(...xs)+Math.max(...xs))/2;
    const centerY=(Math.min(...ys)+Math.max(...ys))/2;

    return {
      id:String(draft.id||uid('ink')),
      color:String(draft.color||'#172132'),
      width:clamp(Number(draft.width)||5,1,40),
      anchorX:centerX,
      anchorY:centerY,
      localPoints:points.map(point=>({
        x:point.x-centerX,
        y:point.y-centerY,
        pressure:point.pressure
      })),
      scale:1,
      groupId:null
    };
  }

  renderedPoints(stroke){
    const cx=Number(stroke.anchorX)||0;
    const cy=Number(stroke.anchorY)||0;
    const scale=Number(stroke.scale)||1;

    return stroke.localPoints.map(point=>({
      x:cx+(Number(point.x)||0)*scale,
      y:cy+(Number(point.y)||0)*scale,
      pressure:point.pressure
    }));
  }

  pathFromPoints(points){
    if(!points.length)return '';
    if(points.length===1)return `M ${points[0].x} ${points[0].y}`;
    if(points.length===2)return `M ${points[0].x} ${points[0].y} L ${points[1].x} ${points[1].y}`;

    let d=`M ${points[0].x} ${points[0].y}`;
    for(let i=1;i<points.length-1;i++){
      const current=points[i];
      const next=points[i+1];
      const mx=(current.x+next.x)/2;
      const my=(current.y+next.y)/2;
      d+=` Q ${current.x} ${current.y} ${mx} ${my}`;
    }

    const last=points[points.length-1];
    d+=` Q ${last.x} ${last.y} ${last.x} ${last.y}`;
    return d;
  }

  pathData(stroke){
    return this.pathFromPoints(this.renderedPoints(stroke));
  }

  strokeBounds(stroke){
    const points=this.renderedPoints(stroke);
    const xs=points.map(point=>point.x);
    const ys=points.map(point=>point.y);
    const pad=Math.max(8,(stroke.width||5)*(stroke.scale||1)*1.6);

    return {
      x:Math.min(...xs)-pad,
      y:Math.min(...ys)-pad,
      width:Math.max(18,Math.max(...xs)-Math.min(...xs)+pad*2),
      height:Math.max(18,Math.max(...ys)-Math.min(...ys)+pad*2)
    };
  }

  renderActiveStroke(){
    const old=this.inkLayer.querySelector('[data-active-ink="true"]');
    old?.remove();
    if(!this.activeStroke?.draftPoints?.length)return;

    const path=document.createElementNS('http://www.w3.org/2000/svg','path');
    path.classList.add('ink-object');
    path.dataset.activeInk='true';
    path.setAttribute('d',this.pathFromPoints(this.activeStroke.draftPoints));
    path.setAttribute('fill','none');
    path.setAttribute('stroke',this.activeStroke.color||'#172132');
    path.setAttribute('stroke-width',String(this.activeStroke.width||5));
    path.setAttribute('stroke-linecap','round');
    path.setAttribute('stroke-linejoin','round');
    path.setAttribute('pointer-events','none');
    this.inkLayer.appendChild(path);
  }

  createStrokePath(stroke,{active=false}={}){
    const path=document.createElementNS('http://www.w3.org/2000/svg','path');
    path.classList.add('ink-object');
    if(this.selectedStrokeIds.has(stroke.id))path.classList.add('is-selected');
    if(active)path.dataset.activeInk='true';

    path.dataset.strokeId=stroke.id;
    path.setAttribute('d',this.pathData(stroke));
    path.setAttribute('fill','none');
    path.setAttribute('stroke',stroke.color||'#172132');
    path.setAttribute('stroke-width',String((stroke.width||5)*(stroke.scale||1)));
    path.setAttribute('stroke-linecap','round');
    path.setAttribute('stroke-linejoin','round');
    path.setAttribute('vector-effect','non-scaling-stroke');

    if(!active){
      path.addEventListener('pointerdown',event=>this.onStrokePointerDown(event,stroke.id));
      path.addEventListener('pointermove',event=>this.onStrokePointerMove(event,stroke.id));
      path.addEventListener('pointerup',event=>this.onStrokePointerEnd(event,stroke.id));
      path.addEventListener('pointercancel',event=>this.onStrokePointerEnd(event,stroke.id));
      path.addEventListener('lostpointercapture',event=>{
        if(this.strokeDrag?.pointerId===event.pointerId)this.onStrokePointerEnd(event,stroke.id);
      });
    }

    return path;
  }

  renderInk(){
    if(!this.inkLayer||!this.selectionLayer)return;
    this.resizeInkSvg();
    this.inkLayer.innerHTML='';

    this.strokes.forEach(stroke=>{
      this.inkLayer.appendChild(this.createStrokePath(stroke));
    });

    if(this.activeStroke)this.renderActiveStroke();
    this.renderInkSelection();
    this.updateInkButtons();
  }

  renderInkSelection(){
    this.selectionLayer.innerHTML='';
    const selected=this.selectedInkStrokes();
    if(!selected.length)return;

    const bounds=this.selectionBounds(selected);
    if(!bounds)return;

    const rect=document.createElementNS('http://www.w3.org/2000/svg','rect');
    rect.classList.add('ink-selection-box');
    rect.setAttribute('x',String(bounds.x));
    rect.setAttribute('y',String(bounds.y));
    rect.setAttribute('width',String(bounds.width));
    rect.setAttribute('height',String(bounds.height));
    rect.setAttribute('rx','7');
    this.selectionLayer.appendChild(rect);

    if(selected.length>1){
      const label=document.createElementNS('http://www.w3.org/2000/svg','text');
      label.classList.add('ink-selection-label');
      label.setAttribute('x',String(bounds.x+8));
      label.setAttribute('y',String(Math.max(14,bounds.y-6)));
      const grouped=selected.every(stroke=>stroke.groupId&&stroke.groupId===selected[0].groupId);
      label.textContent=grouped?`${selected.length} strokes · group`:`${selected.length} strokes`;
      this.selectionLayer.appendChild(label);
    }
  }

  syncInkSelectionDom(){
    if(!this.inkLayer||!this.selectionLayer)return;
    this.inkLayer.querySelectorAll('.ink-object[data-stroke-id]').forEach(node=>{
      node.classList.toggle('is-selected',this.selectedStrokeIds.has(node.dataset.strokeId||''));
    });
    this.selectionLayer.removeAttribute('transform');
    this.renderInkSelection();
    this.updateFoamToolState();
  }

  onStrokePointerDown(event,id){
    const stroke=this.findStroke(id);
    if(!stroke)return;

    if(this.settings.tool==='eraser'){
      event.preventDefault();
      event.stopPropagation();
      this.checkpointInk('ERASE_STROKE');
      const eraseIds=stroke.groupId
        ?new Set(this.strokes.filter(item=>item.groupId===stroke.groupId).map(item=>item.id))
        :new Set([id]);
      this.strokes=this.strokes.filter(item=>!eraseIds.has(item.id));
      eraseIds.forEach(strokeId=>this.selectedStrokeIds.delete(strokeId));
      this.pruneInkSelection();
      this.persistInk();
      this.renderInk();
      this.updateFoamToolState();
      return;
    }

    if(this.settings.tool!=='move')return;

    event.preventDefault();
    event.stopPropagation();

    // Keep the live SVG path in place: selection styling is synchronized
    // without rebuilding the ink layer before pointer capture.
    this.setInkSelection([id],id,{render:false});
    this.board.syncPieceSelectionDom?.();
    this.syncInkSelectionDom();

    const selected=this.selectedInkStrokes();
    this.strokeDrag={
      id,
      pointerId:event.pointerId,
      startX:event.clientX,
      startY:event.clientY,
      origins:selected.map(item=>({
        id:item.id,
        anchorX:Number(item.anchorX)||0,
        anchorY:Number(item.anchorY)||0,
        node:this.inkLayer.querySelector(`[data-stroke-id="${CSS.escape(item.id)}"]`)
      })),
      dx:0,
      dy:0,
      moved:false,
      checkpointed:false,
      raf:0
    };

    event.currentTarget.classList.add('is-dragging');
    event.currentTarget.setPointerCapture?.(event.pointerId);
  }

  onStrokePointerMove(event,id){
    const drag=this.strokeDrag;
    if(!drag||drag.id!==id||drag.pointerId!==event.pointerId)return;

    const samples=typeof event.getCoalescedEvents==='function'?event.getCoalescedEvents():null;
    const latest=samples?.length?samples[samples.length-1]:event;
    const dx=latest.clientX-drag.startX;
    const dy=latest.clientY-drag.startY;

    if(!drag.moved&&Math.hypot(dx,dy)<2.5)return;
    if(!drag.moved){
      drag.moved=true;
      if(!drag.checkpointed){
        this.checkpointInk('MOVE_STROKE');
        drag.checkpointed=true;
      }
    }

    event.preventDefault();
    drag.dx=dx;
    drag.dy=dy;

    if(drag.raf)return;
    drag.raf=requestAnimationFrame(()=>{
      drag.raf=0;
      if(this.strokeDrag!==drag)return;
      const tx=drag.dx,ty=drag.dy;
      drag.origins.forEach(origin=>{
        if(!origin.node?.isConnected)return;
        origin.node.classList.add('is-dragging');
        origin.node.setAttribute('transform',`translate(${tx} ${ty})`);
      });
      this.selectionLayer.setAttribute('transform',`translate(${tx} ${ty})`);
    });
  }

  onStrokePointerEnd(event,id){
    const drag=this.strokeDrag;
    if(!drag||drag.id!==id||drag.pointerId!==event.pointerId)return;

    event.preventDefault();

    if(drag.raf){
      cancelAnimationFrame(drag.raf);
      drag.raf=0;
    }

    if(drag.moved&&Number.isFinite(event.clientX)&&Number.isFinite(event.clientY)){
      drag.dx=event.clientX-drag.startX;
      drag.dy=event.clientY-drag.startY;
    }

    if(drag.moved){
      drag.origins.forEach(origin=>{
        const target=this.findStroke(origin.id);
        if(!target)return;
        target.anchorX=origin.anchorX+drag.dx;
        target.anchorY=origin.anchorY+drag.dy;
      });
    }

    drag.origins.forEach(origin=>{
      if(!origin.node?.isConnected)return;
      origin.node.classList.remove('is-dragging');
      origin.node.removeAttribute('transform');
    });
    this.selectionLayer.removeAttribute('transform');

    this.strokeDrag=null;
    if(drag.moved)this.persistInk();
    this.renderInk();
    this.updateFoamToolState();
  }

  selectInk(id){
    if(!this.findStroke(id))return;
    this.setInkSelection([id],id);
  }

  clearInkSelection(render=true){
    if(!this.selectedStrokeIds.size&&!this.selectedStrokeId)return;
    this.selectedStrokeId=null;
    this.selectedStrokeIds.clear();
    if(render)this.renderInk();
    this.updateFoamToolState();
  }

  resizeSelected(delta){
    if(this.selectedStrokeIds.size){
      this.resizeSelectedInk(delta);
      return;
    }
    this.board.resizeSelected(delta);
  }

  resetSelectedSize(){
    if(this.selectedStrokeIds.size){
      this.resetSelectedInkSize();
      return;
    }
    this.board.resetSelectedSize();
  }

  duplicateSelected(){
    if(this.selectedStrokeIds.size){
      this.duplicateSelectedInk();
      return;
    }
    this.board.duplicateSelected();
  }

  deleteSelected(){
    if(this.selectedStrokeIds.size){
      this.deleteSelectedInk();
      return;
    }
    this.board.deleteSelected();
  }

  resizeInkSelectionByFactor(factor,label='RESIZE_INK'){
    const selected=this.selectedInkStrokes();
    if(!selected.length)return;

    const bounds=this.selectionBounds(selected);
    if(!bounds)return;

    let safeFactor=Number(factor)||1;
    if(safeFactor>1){
      safeFactor=Math.min(safeFactor,...selected.map(stroke=>4/Math.max(.001,Number(stroke.scale)||1)));
    }else if(safeFactor<1){
      safeFactor=Math.max(safeFactor,...selected.map(stroke=>.25/Math.max(.001,Number(stroke.scale)||1)));
    }
    if(Math.abs(safeFactor-1)<.0001)return;

    this.checkpointInk(label);
    selected.forEach(stroke=>{
      const ax=Number(stroke.anchorX)||0;
      const ay=Number(stroke.anchorY)||0;
      stroke.anchorX=bounds.cx+(ax-bounds.cx)*safeFactor;
      stroke.anchorY=bounds.cy+(ay-bounds.cy)*safeFactor;
      stroke.scale=clamp((Number(stroke.scale)||1)*safeFactor,.25,4);
    });

    this.persistInk();
    this.renderInk();
    this.updateFoamToolState();
  }

  resizeSelectedInk(delta){
    const factor=delta>0?1.1:delta<0?.9:1;
    this.resizeInkSelectionByFactor(factor,'RESIZE_INK');
  }

  resetSelectedInkSize(){
    const selected=this.selectedInkStrokes();
    if(!selected.length)return;
    const reference=Number(selected[0].scale)||1;
    if(Math.abs(reference-1)<.001&&selected.every(stroke=>Math.abs((Number(stroke.scale)||1)-1)<.001))return;
    this.resizeInkSelectionByFactor(1/reference,'RESET_INK_SIZE');
  }

  duplicateSelectedInk(){
    const selected=this.selectedInkStrokes();
    if(!selected.length)return;

    this.checkpointInk('DUPLICATE_INK');
    const newGroupId=selected.length>1?uid('inkgroup'):null;
    const copies=selected.map(stroke=>{
      const copy=clone(stroke);
      copy.id=uid('ink');
      copy.anchorX=(Number(copy.anchorX)||0)+24;
      copy.anchorY=(Number(copy.anchorY)||0)+24;
      copy.groupId=newGroupId;
      return copy;
    });

    this.strokes.push(...copies);
    this.selectedStrokeIds=new Set(copies.map(stroke=>stroke.id));
    this.selectedStrokeId=copies[0]?.id||null;
    this.persistInk();
    this.renderInk();
    this.updateFoamToolState();
  }

  deleteSelectedInk(){
    const ids=new Set(this.selectedStrokeIds);
    if(!ids.size)return;

    this.checkpointInk('DELETE_INK');
    this.strokes=this.strokes.filter(stroke=>!ids.has(stroke.id));
    this.selectedStrokeId=null;
    this.selectedStrokeIds.clear();
    this.persistInk();
    this.renderInk();
    this.updateFoamToolState();
  }

  clearInk(){
    if(!this.strokes.length)return;
    this.checkpointInk('CLEAR_INK');
    this.strokes=[];
    this.selectedStrokeId=null;
    this.selectedStrokeIds.clear();
    this.persistInk();
    this.renderInk();
    this.updateFoamToolState();
  }

  updateInkButtons(){
    const undo=document.querySelector('#englishInkUndo');
    const redo=document.querySelector('#englishInkRedo');
    const clear=document.querySelector('#englishClearInk');
    if(undo)undo.disabled=this.inkPast.length===0;
    if(redo)redo.disabled=this.inkFuture.length===0;
    if(clear)clear.disabled=this.strokes.length===0;
  }

  updateFoamToolState(){
    const selectedInk=this.selectedInkStrokes();
    const inkSelected=selectedInk.length>0;
    const foamSelectedCount=this.board?.selectedIds?.size||0;
    const selectedCount=inkSelected?selectedInk.length:foamSelectedCount;
    const totalFoam=this.board?.items?.length||0;
    const activeFoam=this.board?.items?.find?.(item=>item.id===this.board.activeItemId)||null;
    const activeInk=inkSelected?(this.findStroke(this.selectedStrokeId)||selectedInk[0]):null;

    const needsSelection=[
      '#englishWorkspaceSmaller',
      '#englishWorkspaceResetSize',
      '#englishWorkspaceLarger',
      '#englishWorkspaceDuplicate',
      '#englishWorkspaceDelete'
    ];

    needsSelection.forEach(selector=>{
      const button=document.querySelector(selector);
      if(button)button.disabled=selectedCount===0;
    });

    const align=document.querySelector('#englishWorkspaceAlign');
    const scatter=document.querySelector('#englishWorkspaceScatter');
    if(align)align.disabled=totalFoam===0;
    if(scatter)scatter.disabled=totalFoam===0;

    const useInkDomain=inkSelected||this.settings.tool==='pen'||this.settings.tool==='eraser'||this.settings.tool==='lasso';
    const undo=document.querySelector('#englishWorkspaceBoardUndo');
    const redo=document.querySelector('#englishWorkspaceBoardRedo');

    if(undo)undo.disabled=useInkDomain?this.inkPast.length===0:!this.board?.history?.canUndo;
    if(redo)redo.disabled=useInkDomain?this.inkFuture.length===0:!this.board?.history?.canRedo;

    const scale=document.querySelector('#englishWorkspaceScaleValue');
    if(scale){
      if(inkSelected&&selectedInk.length>1){
        const values=selectedInk.map(stroke=>Number(stroke.scale)||1);
        const same=values.every(value=>Math.abs(value-values[0])<.01);
        scale.textContent=same?`${Math.round(values[0]*100)}%`:'Multi';
      }else{
        const value=activeInk?.scale??activeFoam?.scale??1;
        scale.textContent=`${Math.round(value*100)}%`;
      }
    }

    const duplicate=document.querySelector('#englishWorkspaceDuplicate');
    const remove=document.querySelector('#englishWorkspaceDelete');
    if(duplicate){
      duplicate.title=inkSelected
        ?`Duplicate selected drawing${selectedInk.length>1?'s':''}`
        :'Duplicate selected letter';
      duplicate.setAttribute('aria-label',duplicate.title);
    }
    if(remove){
      remove.title=inkSelected
        ?`Delete selected drawing${selectedInk.length>1?'s':''}`
        :'Delete selected letter';
      remove.setAttribute('aria-label',remove.title);
    }

    const groupIds=new Set(selectedInk.map(stroke=>stroke.groupId).filter(Boolean));
    const alreadyOneGroup=selectedInk.length>1&&groupIds.size===1&&selectedInk.every(stroke=>stroke.groupId===selectedInk[0].groupId);
    const canGroup=selectedInk.length>=2&&!alreadyOneGroup;
    const canUngroup=selectedInk.some(stroke=>Boolean(stroke.groupId));

    ['#englishInkGroup','#englishWorkspaceInkGroup'].forEach(selector=>{
      const button=document.querySelector(selector);
      if(button)button.disabled=!canGroup;
    });
    ['#englishInkUngroup','#englishWorkspaceInkUngroup'].forEach(selector=>{
      const button=document.querySelector(selector);
      if(button)button.disabled=!canUngroup;
    });
  }
}
