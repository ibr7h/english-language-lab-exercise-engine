const WORKSPACE_STORAGE_KEY='englishLab.boardWorkspace.v1';
const INK_STORAGE_KEY='englishLab.boardInk.v2';
const LEGACY_INK_STORAGE_KEY='englishLab.boardInk.v1';

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
    this.activeStroke=null;
    this.strokeDrag=null;
    this.inkPast=[];
    this.inkFuture=[];
    this.inkHistoryLimit=80;
    this.resizeObserver=null;
    this.isWorkspace=false;
    this.nativeFullscreenRequested=false;
    this.legacyInkMigrated=false;

    this.loadInk();
  }

  loadInk(){
    const current=safeParse(localStorage.getItem(INK_STORAGE_KEY),null);
    if(current?.version===2&&Array.isArray(current.strokes)){
      this.strokes=current.strokes.map(stroke=>this.normalizeStroke(stroke)).filter(Boolean);
      return;
    }

    const legacy=safeParse(localStorage.getItem(LEGACY_INK_STORAGE_KEY),null);
    if(legacy?.strokes&&Array.isArray(legacy.strokes)){
      this.strokes=legacy.strokes
        .filter(stroke=>stroke&&stroke.tool!=='erase'&&Array.isArray(stroke.points)&&stroke.points.length)
        .map(stroke=>this.normalizeStroke({
          id:stroke.id||uid('ink'),
          color:stroke.color||'#172132',
          width:Number(stroke.width)||5,
          points:stroke.points,
          tx:0,
          ty:0,
          scale:1
        }))
        .filter(Boolean);
      this.legacyInkMigrated=true;
    }
  }

  normalizeStroke(stroke){
    if(!stroke||!Array.isArray(stroke.points)||!stroke.points.length)return null;
    return {
      id:String(stroke.id||uid('ink')),
      color:String(stroke.color||'#172132'),
      width:clamp(Number(stroke.width)||5,1,40),
      points:stroke.points.map(point=>({
        x:clamp(Number(point.x)||0,0,1),
        y:clamp(Number(point.y)||0,0,1),
        pressure:clamp(Number(point.pressure)||.5,0,1)
      })),
      tx:Number(stroke.tx)||0,
      ty:Number(stroke.ty)||0,
      scale:clamp(Number(stroke.scale)||1,.25,4)
    };
  }

  init(){
    if(!this.section||!this.canvasHost||!this.inkSvg||!this.inkLayer||!this.selectionLayer)return;

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

    requestAnimationFrame(()=>{
      this.renderInk();
      this.updateFoamToolState();
    });

    if(this.legacyInkMigrated){
      this.persistInk();
    }

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
      if(this.settings.tool!=='pen')return;
      if(event.target.closest?.('.ink-object'))return;
      this.beginStroke(event);
    });
    this.inkSvg.addEventListener('pointermove',event=>this.extendStroke(event));
    this.inkSvg.addEventListener('pointerup',event=>this.endStroke(event));
    this.inkSvg.addEventListener('pointercancel',event=>this.endStroke(event));

    document.addEventListener('keydown',event=>{
      if(event.key==='Escape'&&this.isWorkspace){
        event.preventDefault();
        this.exit();
        return;
      }

      const tag=document.activeElement?.tagName;
      if(['INPUT','TEXTAREA','SELECT'].includes(tag))return;

      if((event.key==='Delete'||event.key==='Backspace')&&this.selectedStrokeId){
        event.preventDefault();
        this.deleteSelectedInk();
      }
    });
  }

  persistSettings(){
    try{localStorage.setItem(WORKSPACE_STORAGE_KEY,JSON.stringify(this.settings));}catch(_){}
  }

  persistInk(){
    try{
      localStorage.setItem(INK_STORAGE_KEY,JSON.stringify({
        version:2,
        savedAt:Date.now(),
        strokes:this.strokes
      }));
    }catch(_){}
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
    if(this.selectedStrokeId&&!this.findStroke(this.selectedStrokeId))this.selectedStrokeId=null;
    this.persistInk();
    this.renderInk();
    this.updateFoamToolState();
  }

  redoInk(){
    if(!this.inkFuture.length)return;
    this.inkPast.push({snapshot:clone(this.strokes)});
    const entry=this.inkFuture.pop();
    this.strokes=clone(entry.snapshot);
    if(this.selectedStrokeId&&!this.findStroke(this.selectedStrokeId))this.selectedStrokeId=null;
    this.persistInk();
    this.renderInk();
    this.updateFoamToolState();
  }

  undoSelectedDomain(){
    if(this.selectedStrokeId||this.settings.tool==='pen'||this.settings.tool==='eraser'){
      this.undoInk();
      return;
    }
    this.board.undo();
  }

  redoSelectedDomain(){
    if(this.selectedStrokeId||this.settings.tool==='pen'||this.settings.tool==='eraser'){
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
    const next=['move','pen','eraser'].includes(tool)?tool:'move';
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
      x:clamp((event.clientX-rect.left)/Math.max(1,rect.width),0,1),
      y:clamp((event.clientY-rect.top)/Math.max(1,rect.height),0,1),
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
      points:[this.pointFromEvent(event)],
      tx:0,
      ty:0,
      scale:1
    };

    this.inkSvg.setPointerCapture?.(event.pointerId);
  }

  extendStroke(event){
    if(!this.activeStroke||this.settings.tool!=='pen')return;
    event.preventDefault();

    const point=this.pointFromEvent(event);
    const points=this.activeStroke.points;
    const prev=points[points.length-1];
    if(prev&&Math.hypot(point.x-prev.x,point.y-prev.y)<.0015)return;

    points.push(point);
    this.renderActiveStroke();
  }

  endStroke(event){
    if(!this.activeStroke)return;
    event.preventDefault();

    if(this.activeStroke.points.length===1){
      const p=this.activeStroke.points[0];
      this.activeStroke.points.push({
        ...p,
        x:clamp(p.x+.0012,0,1),
        y:clamp(p.y+.0012,0,1)
      });
    }

    this.strokes.push(this.activeStroke);
    this.selectedStrokeId=this.activeStroke.id;
    this.activeStroke=null;
    this.persistInk();
    this.renderInk();
    this.updateFoamToolState();
  }

  findStroke(id){
    return this.strokes.find(stroke=>stroke.id===id)||null;
  }

  strokeCenter(stroke){
    const xs=stroke.points.map(point=>point.x);
    const ys=stroke.points.map(point=>point.y);
    return {
      x:(Math.min(...xs)+Math.max(...xs))/2,
      y:(Math.min(...ys)+Math.max(...ys))/2
    };
  }

  transformedPoints(stroke){
    const center=this.strokeCenter(stroke);
    const scale=Number(stroke.scale)||1;
    const tx=Number(stroke.tx)||0;
    const ty=Number(stroke.ty)||0;

    return stroke.points.map(point=>({
      x:center.x+(point.x-center.x)*scale+tx,
      y:center.y+(point.y-center.y)*scale+ty,
      pressure:point.pressure
    }));
  }

  pathData(stroke){
    const rect=this.inkSvg.getBoundingClientRect();
    const points=this.transformedPoints(stroke).map(point=>({
      x:point.x*rect.width,
      y:point.y*rect.height
    }));

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

  strokeBounds(stroke){
    const rect=this.inkSvg.getBoundingClientRect();
    const points=this.transformedPoints(stroke);
    const xs=points.map(point=>point.x*rect.width);
    const ys=points.map(point=>point.y*rect.height);
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
    if(!this.activeStroke)return;

    const path=this.createStrokePath(this.activeStroke,{active:true});
    this.inkLayer.appendChild(path);
  }

  createStrokePath(stroke,{active=false}={}){
    const path=document.createElementNS('http://www.w3.org/2000/svg','path');
    path.classList.add('ink-object');
    if(this.selectedStrokeId===stroke.id)path.classList.add('is-selected');
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

    if(this.activeStroke)this.inkLayer.appendChild(this.createStrokePath(this.activeStroke,{active:true}));
    this.renderInkSelection();
    this.updateInkButtons();
  }

  renderInkSelection(){
    this.selectionLayer.innerHTML='';
    const stroke=this.findStroke(this.selectedStrokeId);
    if(!stroke)return;

    const bounds=this.strokeBounds(stroke);
    const rect=document.createElementNS('http://www.w3.org/2000/svg','rect');
    rect.classList.add('ink-selection-box');
    rect.setAttribute('x',String(bounds.x));
    rect.setAttribute('y',String(bounds.y));
    rect.setAttribute('width',String(bounds.width));
    rect.setAttribute('height',String(bounds.height));
    rect.setAttribute('rx','7');
    this.selectionLayer.appendChild(rect);
  }

  onStrokePointerDown(event,id){
    const stroke=this.findStroke(id);
    if(!stroke)return;

    if(this.settings.tool==='eraser'){
      event.preventDefault();
      event.stopPropagation();
      this.checkpointInk('ERASE_STROKE');
      this.strokes=this.strokes.filter(item=>item.id!==id);
      if(this.selectedStrokeId===id)this.selectedStrokeId=null;
      this.persistInk();
      this.renderInk();
      this.updateFoamToolState();
      return;
    }

    if(this.settings.tool!=='move')return;

    event.preventDefault();
    event.stopPropagation();
    this.selectInk(id);
    this.checkpointInk('MOVE_STROKE');

    this.strokeDrag={
      id,
      pointerId:event.pointerId,
      startX:event.clientX,
      startY:event.clientY,
      tx:Number(stroke.tx)||0,
      ty:Number(stroke.ty)||0
    };

    event.currentTarget.setPointerCapture?.(event.pointerId);
  }

  onStrokePointerMove(event,id){
    const drag=this.strokeDrag;
    if(!drag||drag.id!==id||drag.pointerId!==event.pointerId)return;

    event.preventDefault();
    const stroke=this.findStroke(id);
    if(!stroke)return;

    const rect=this.inkSvg.getBoundingClientRect();
    stroke.tx=drag.tx+(event.clientX-drag.startX)/Math.max(1,rect.width);
    stroke.ty=drag.ty+(event.clientY-drag.startY)/Math.max(1,rect.height);

    const path=event.currentTarget;
    path.setAttribute('d',this.pathData(stroke));
    this.renderInkSelection();
  }

  onStrokePointerEnd(event,id){
    const drag=this.strokeDrag;
    if(!drag||drag.id!==id||drag.pointerId!==event.pointerId)return;

    event.preventDefault();
    this.strokeDrag=null;
    this.persistInk();
    this.renderInk();
    this.updateFoamToolState();
  }

  selectInk(id){
    if(!this.findStroke(id))return;
    this.board.clearSelection(false);
    this.selectedStrokeId=id;
    this.renderInk();
    this.board.renderBoard();
    this.updateFoamToolState();
  }

  clearInkSelection(render=true){
    if(!this.selectedStrokeId)return;
    this.selectedStrokeId=null;
    if(render)this.renderInk();
    this.updateFoamToolState();
  }

  resizeSelected(delta){
    if(this.selectedStrokeId){
      this.resizeSelectedInk(delta);
      return;
    }
    this.board.resizeSelected(delta);
  }

  resetSelectedSize(){
    if(this.selectedStrokeId){
      const stroke=this.findStroke(this.selectedStrokeId);
      if(!stroke)return;
      this.checkpointInk('RESET_INK_SIZE');
      stroke.scale=1;
      this.persistInk();
      this.renderInk();
      this.updateFoamToolState();
      return;
    }
    this.board.resetSelectedSize();
  }

  duplicateSelected(){
    if(this.selectedStrokeId){
      this.duplicateSelectedInk();
      return;
    }
    this.board.duplicateSelected();
  }

  deleteSelected(){
    if(this.selectedStrokeId){
      this.deleteSelectedInk();
      return;
    }
    this.board.deleteSelected();
  }

  resizeSelectedInk(delta){
    const stroke=this.findStroke(this.selectedStrokeId);
    if(!stroke)return;
    this.checkpointInk('RESIZE_INK');
    stroke.scale=clamp((Number(stroke.scale)||1)+delta,.25,4);
    this.persistInk();
    this.renderInk();
    this.updateFoamToolState();
  }

  duplicateSelectedInk(){
    const stroke=this.findStroke(this.selectedStrokeId);
    if(!stroke)return;

    this.checkpointInk('DUPLICATE_INK');
    const copy=clone(stroke);
    copy.id=uid('ink');
    copy.tx=(Number(copy.tx)||0)+.025;
    copy.ty=(Number(copy.ty)||0)+.025;

    this.strokes.push(copy);
    this.selectedStrokeId=copy.id;
    this.persistInk();
    this.renderInk();
    this.updateFoamToolState();
  }

  deleteSelectedInk(){
    if(!this.selectedStrokeId)return;

    this.checkpointInk('DELETE_INK');
    const id=this.selectedStrokeId;
    this.strokes=this.strokes.filter(stroke=>stroke.id!==id);
    this.selectedStrokeId=null;
    this.persistInk();
    this.renderInk();
    this.updateFoamToolState();
  }

  clearInk(){
    if(!this.strokes.length)return;
    this.checkpointInk('CLEAR_INK');
    this.strokes=[];
    this.selectedStrokeId=null;
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
    const inkSelected=Boolean(this.selectedStrokeId&&this.findStroke(this.selectedStrokeId));
    const foamSelectedCount=this.board?.selectedIds?.size||0;
    const selectedCount=inkSelected?1:foamSelectedCount;
    const totalFoam=this.board?.items?.length||0;
    const activeFoam=this.board?.items?.find?.(item=>item.id===this.board.activeItemId)||null;
    const activeInk=inkSelected?this.findStroke(this.selectedStrokeId):null;

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

    const useInkDomain=inkSelected||this.settings.tool==='pen'||this.settings.tool==='eraser';
    const undo=document.querySelector('#englishWorkspaceBoardUndo');
    const redo=document.querySelector('#englishWorkspaceBoardRedo');

    if(undo)undo.disabled=useInkDomain?this.inkPast.length===0:!this.board?.history?.canUndo;
    if(redo)redo.disabled=useInkDomain?this.inkFuture.length===0:!this.board?.history?.canRedo;

    const scale=document.querySelector('#englishWorkspaceScaleValue');
    if(scale){
      const value=activeInk?.scale??activeFoam?.scale??1;
      scale.textContent=`${Math.round(value*100)}%`;
    }

    const duplicate=document.querySelector('#englishWorkspaceDuplicate');
    const remove=document.querySelector('#englishWorkspaceDelete');
    if(duplicate){
      duplicate.title=inkSelected?'Duplicate selected drawing':'Duplicate selected letter';
      duplicate.setAttribute('aria-label',duplicate.title);
    }
    if(remove){
      remove.title=inkSelected?'Delete selected drawing':'Delete selected letter';
      remove.setAttribute('aria-label',remove.title);
    }
  }
}
