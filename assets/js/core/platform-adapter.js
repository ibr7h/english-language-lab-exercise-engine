export class PlatformAdapter {
  constructor(profile={}) { this.profile={...profile}; this.id=profile.id||'desktop'; this.minTarget=(this.id==='ios'||this.id==='android')?44:36; this.moveStep=this.id==='webos'?18:12; }
  actionForKey(key) {
    const step=this.moveStep;
    if(key==='ArrowRight') return {type:'move',dx:step,dy:0};
    if(key==='ArrowLeft') return {type:'move',dx:-step,dy:0};
    if(key==='ArrowUp') return {type:'move',dx:0,dy:-step};
    if(key==='ArrowDown') return {type:'move',dx:0,dy:step};
    if(key==='Enter'||key===' ') return {type:'activate'};
    if(key==='Delete'||key==='Backspace') return {type:'delete'};
    return null;
  }
  describe() {
    if(this.id==='webos') return 'Remote/D-pad + OK';
    if(this.id==='ios') return 'iOS touch';
    if(this.id==='android') return 'Android touch';
    return 'Mouse + keyboard';
  }
}
export function createPlatformAdapter(profile){ return new PlatformAdapter(profile); }
