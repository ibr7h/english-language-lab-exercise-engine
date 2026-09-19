const WORKSPACE_STORAGE_KEY='englishLab.boardWorkspace.v1';
const INK_STORAGE_KEY='englishLab.boardInk.v1';

function safeParse(raw,fallback){
  if(!raw)return fallback;
  try{return JSON.parse(raw);}catch(_){return fallback;}
}
function clamp(n,min,max){return Math.max(min,Math.min(max,n));}

export class BoardWorkspace {
  constructor(board,{alphabet=[],digraphs=[],vowelTeams=[]}={}){
    this.board=board;
    this.alphabet=[...alphabet];
    this.digraphs=[...digraphs];
    this.vowelTeams=[...vowelTeams];
    this.section=document.querySelector('#magnetic-board');
    this.canvasHost=document.querySelector('#englishBoardCanvas');
    this.inkCanvas=document.querySelector('#englishInkCanvas');
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
    const ink=safeParse(localStorage.getItem(INK_STORAGE_KEY),{});
    this.strokes=Array.isArray(ink.strokes)?ink.strokes:[];
    this.redoStack=[];
    this.activeStroke=null;
    this.resizeObserver=null;
    this.isWorkspace=false;
    this.nativeFullscreenRequested=false;
  }

  init(){
    if(!this.section||!this.canvasHost||!this.inkCanvas)return;
    this.bindControls();
    this.applyGuide(this.settings.guide,false);
    this.setTool(this.settings.tool,false);
    this.setPenColor(this.settings.penColor,false);
    this.setPenWidth(this.settings.penWidth,false);
    this.setStrip(this.settings.strip,false);
    this.setToolboxOpen(this.settings.toolboxOpen,false);
    this.renderStrip();
    this.setupInkCanvas();
    this.syncCaseButtons();
    this.resizeInkCanvas();
    requestAnimationFrame(()=>this.redrawInk());

    if('ResizeObserver'in window){
      this.resizeObserver=new ResizeObserver(()=>{
        this.resizeInkCanvas();
        if(this.isWorkspace)this.board.renderBoard();
      });
      this.resizeObserver.observe(this.canvasHost);
    }else{
      window.addEventListener('resize',()=>this.resizeInkCanvas());
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
    document.querySelector('#englishWorkspaceBoardUndo')?.addEventListener('click',()=>this.board.undo());
    document.querySelector('#englishWorkspaceBoardRedo')?.addEventListener('click',()=>this.board.redo());

    document.querySelector('#englishStripPrev')?.addEventListener('click',()=>this.scrollStrip(-1));
    document.querySelector('#englishStripNext')?.addEventListener('click',()=>this.scrollStrip(1));

    document.addEventListener('keydown',event=>{
      if(event.key==='Escape'&&this.isWorkspace){
        event.preventDefault();
        this.exit();
      }
    });
  }

  persistSettings(){
    try{localStorage.setItem(WORKSPACE_STORAGE_KEY,JSON.stringify(this.settings));}catch(_){}
  }
  persistInk(){
    try{localStorage.setItem(INK_STORAGE_KEY,JSON.stringify({version:1,strokes:this.strokes}));}catch(_){}
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
      this.resizeInkCanvas();
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
      this.resizeInkCanvas();
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
    this.inkCanvas.style.pointerEvents=next==='move'?'none':'auto';
    document.querySelectorAll('[data-workspace-tool]').forEach(btn=>btn.classList.toggle('active',btn.dataset.workspaceTool===next));
    if(persist)this.persistSettings();
  }

  setCase(mode){
    const next=mode==='lower'?'lower':'upper';
    this.board.caseMode=next;
    const select=document.querySelector('#englishCase');
    if(select)select.value=next;
    this.board.renderTray();
    this.board.renderGraphemeTrays();
    this.board.renderBoard();
    this.renderStrip();
    this.syncCaseButtons();
    this.board.persist();
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
      const phonicsRole=role==='letter'?(this.board.constructor.isVowel?.(token)?'vowel':'consonant'):role;
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
        line('30%','topline');line('50%','midline');line('70%','baseline');
      }
      if(next==='four-line'){
        line('22%','topline');line('40%','midline');line('58%','baseline');line('76%','descender');
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

  setupInkCanvas(){
    this.inkCanvas.addEventListener('pointerdown',event=>this.beginStroke(event));
    this.inkCanvas.addEventListener('pointermove',event=>this.extendStroke(event));
    const end=event=>this.endStroke(event);
    this.inkCanvas.addEventListener('pointerup',end);
    this.inkCanvas.addEventListener('pointercancel',end);
  }

  resizeInkCanvas(){
    if(!this.inkCanvas||!this.canvasHost)return;
    const rect=this.canvasHost.getBoundingClientRect();
    if(rect.width<2||rect.height<2)return;
    const dpr=Math.min(window.devicePixelRatio||1,2.5);
    const width=Math.round(rect.width*dpr);
    const height=Math.round(rect.height*dpr);
    if(this.inkCanvas.width===width&&this.inkCanvas.height===height)return;
    this.inkCanvas.width=width;
    this.inkCanvas.height=height;
    this.inkCanvas.style.width=`${rect.width}px`;
    this.inkCanvas.style.height=`${rect.height}px`;
    this.redrawInk();
  }

  pointFromEvent(event){
    const rect=this.inkCanvas.getBoundingClientRect();
    return {
      x:clamp((event.clientX-rect.left)/Math.max(1,rect.width),0,1),
      y:clamp((event.clientY-rect.top)/Math.max(1,rect.height),0,1),
      pressure:Number.isFinite(event.pressure)&&event.pressure>0?event.pressure:.5
    };
  }

  beginStroke(event){
    if(this.settings.tool==='move')return;
    if(event.pointerType==='mouse'&&event.button!==0)return;
    event.preventDefault();
    this.inkCanvas.setPointerCapture?.(event.pointerId);
    this.activeStroke={
      id:`stroke_${Date.now()}_${Math.random().toString(36).slice(2,7)}`,
      tool:this.settings.tool==='eraser'?'erase':'pen',
      color:this.settings.penColor,
      width:this.settings.tool==='eraser'?Math.max(18,this.settings.penWidth*3.4):this.settings.penWidth,
      points:[this.pointFromEvent(event)]
    };
    this.redoStack=[];
  }

  extendStroke(event){
    if(!this.activeStroke)return;
    event.preventDefault();
    const point=this.pointFromEvent(event);
    const points=this.activeStroke.points;
    const prev=points[points.length-1];
    if(prev&&Math.hypot(point.x-prev.x,point.y-prev.y)<.001)return;
    points.push(point);
    this.drawStrokeSegment(this.activeStroke,points.length-2,points.length-1);
  }

  endStroke(event){
    if(!this.activeStroke)return;
    event.preventDefault();
    if(this.activeStroke.points.length===1){
      const p=this.activeStroke.points[0];
      this.activeStroke.points.push({...p,x:clamp(p.x+.0005,0,1)});
    }
    this.strokes.push(this.activeStroke);
    this.activeStroke=null;
    this.persistInk();
    this.updateInkButtons();
  }

  context(){
    const ctx=this.inkCanvas.getContext('2d');
    const rect=this.inkCanvas.getBoundingClientRect();
    const dpr=this.inkCanvas.width/Math.max(1,rect.width);
    ctx.setTransform(dpr,0,0,dpr,0,0);
    ctx.lineCap='round';
    ctx.lineJoin='round';
    return {ctx,rect};
  }

  drawStrokeSegment(stroke,fromIndex,toIndex){
    if(!stroke||!this.inkCanvas)return;
    const {ctx,rect}=this.context();
    const a=stroke.points[fromIndex],b=stroke.points[toIndex];
    if(!a||!b)return;
    ctx.save();
    ctx.globalCompositeOperation=stroke.tool==='erase'?'destination-out':'source-over';
    ctx.strokeStyle=stroke.color||'#172132';
    ctx.lineWidth=stroke.width||5;
    ctx.beginPath();
    ctx.moveTo(a.x*rect.width,a.y*rect.height);
    ctx.lineTo(b.x*rect.width,b.y*rect.height);
    ctx.stroke();
    ctx.restore();
  }

  drawStroke(stroke){
    if(!stroke?.points?.length)return;
    for(let i=1;i<stroke.points.length;i++)this.drawStrokeSegment(stroke,i-1,i);
  }

  redrawInk(){
    if(!this.inkCanvas)return;
    const ctx=this.inkCanvas.getContext('2d');
    ctx.setTransform(1,0,0,1,0,0);
    ctx.clearRect(0,0,this.inkCanvas.width,this.inkCanvas.height);
    this.strokes.forEach(stroke=>this.drawStroke(stroke));
    if(this.activeStroke)this.drawStroke(this.activeStroke);
    this.updateInkButtons();
  }

  undoInk(){
    const stroke=this.strokes.pop();
    if(!stroke)return;
    this.redoStack.push(stroke);
    this.persistInk();
    this.redrawInk();
  }

  redoInk(){
    const stroke=this.redoStack.pop();
    if(!stroke)return;
    this.strokes.push(stroke);
    this.persistInk();
    this.redrawInk();
  }

  clearInk(){
    if(!this.strokes.length)return;
    this.redoStack.push(...this.strokes.splice(0));
    this.persistInk();
    this.redrawInk();
  }

  updateInkButtons(){
    const undo=document.querySelector('#englishInkUndo');
    const redo=document.querySelector('#englishInkRedo');
    const clear=document.querySelector('#englishClearInk');
    if(undo)undo.disabled=this.strokes.length===0;
    if(redo)redo.disabled=this.redoStack.length===0;
    if(clear)clear.disabled=this.strokes.length===0;
  }
}
