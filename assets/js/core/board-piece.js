export const BOARD_PIECE_TYPES = Object.freeze({
  LETTER:'letter',
  SPACE:'space'
});
export const BOARD_CAPABILITIES = Object.freeze({
  SELECTABLE:'selectable',
  MOVABLE:'movable',
  SCALABLE:'scalable',
  DELETABLE:'deletable',
  ATTACHABLE:'attachable'
});
function id(prefix='piece'){ return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2,8)}`; }
export function createLetterPiece(data={}) {
  const logicalChar=String(data.logicalChar??'').toUpperCase();
  if(!/^[A-Z]$/.test(logicalChar)) throw new Error('LETTER_REQUIRES_A_Z');
  return {
    id:String(data.id||id('letter')),
    type:'letter',
    logicalChar,
    displayGlyph:String(data.displayGlyph??logicalChar),
    x:Number(data.x)||0,
    y:Number(data.y)||0,
    scale:Math.max(.35,Number(data.scale)||1),
    rotation:Number(data.rotation)||0,
    zIndex:Number(data.zIndex)||0,
    color:String(data.color||data.colorClass||'glyph-blue'),
    phonicsRole:data.phonicsRole==null?null:String(data.phonicsRole),
    wordId:data.wordId==null?null:String(data.wordId),
    wordLabel:data.wordLabel==null?null:String(data.wordLabel),
    detachedFrom:data.detachedFrom==null?null:String(data.detachedFrom),
    detachedLabel:data.detachedLabel==null?null:String(data.detachedLabel),
    exerciseId:data.exerciseId==null?null:String(data.exerciseId),
    exerciseTargetIndex:Number.isInteger(data.exerciseTargetIndex)?data.exerciseTargetIndex:null,
    exerciseSlot:Number.isInteger(data.exerciseSlot)?data.exerciseSlot:null,
    capabilities:{selectable:true,movable:true,scalable:true,deletable:true,attachable:true}
  };
}
export function createSpacePiece(data={}) {
  return {
    id:String(data.id||id('space')), type:'space', x:Number(data.x)||0, y:Number(data.y)||0,
    scale:1, rotation:0, zIndex:Number(data.zIndex)||0, width:Math.max(.5,Number(data.width)||1),
    wordId:data.wordId==null?null:String(data.wordId), wordLabel:data.wordLabel==null?null:String(data.wordLabel),
    capabilities:{selectable:true,movable:true,scalable:false,deletable:true,attachable:false}
  };
}
export function pieceCan(piece,capability){ return Boolean(piece?.capabilities?.[capability]); }
