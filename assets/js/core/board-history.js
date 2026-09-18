function clone(value){ if(typeof structuredClone==='function') return structuredClone(value); return JSON.parse(JSON.stringify(value)); }
export class BoardHistory {
  constructor(limit=80){ this.limit=Math.max(1,Number(limit)||80); this.past=[]; this.future=[]; }
  checkpoint(snapshot,label=''){ this.past.push({snapshot:clone(snapshot),label:String(label||'')}); if(this.past.length>this.limit)this.past.shift(); this.future=[]; }
  undo(current){ if(!this.past.length)return null; const entry=this.past.pop(); this.future.push({snapshot:clone(current),label:entry.label}); return clone(entry.snapshot); }
  redo(current){ if(!this.future.length)return null; const entry=this.future.pop(); this.past.push({snapshot:clone(current),label:entry.label}); return clone(entry.snapshot); }
  clear(){ this.past=[]; this.future=[]; }
  get canUndo(){ return this.past.length>0; }
  get canRedo(){ return this.future.length>0; }
}
