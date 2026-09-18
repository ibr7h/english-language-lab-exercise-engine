export const BOARD_COMMANDS=Object.freeze({
  ADD_PIECE:'ADD_PIECE', DELETE_PIECES:'DELETE_PIECES', RESIZE_PIECES:'RESIZE_PIECES',
  MOVE_PIECE:'MOVE_PIECE', MOVE_MANY:'MOVE_MANY', REPLACE_ALL:'REPLACE_ALL'
});
function clamp(n,min,max){ return Math.max(min,Math.min(max,n)); }
export function applyBoardCommand(state, command) {
  if (!state?.items || !command?.type) throw new Error('INVALID_BOARD_COMMAND');
  const items=state.items;
  switch(command.type){
    case BOARD_COMMANDS.ADD_PIECE:
      if(!command.piece?.id) throw new Error('ADD_PIECE_REQUIRES_ID');
      items.push(command.piece); break;
    case BOARD_COMMANDS.DELETE_PIECES: {
      const ids=new Set(command.ids||[]); state.items=items.filter(x=>!ids.has(x.id)); break;
    }
    case BOARD_COMMANDS.RESIZE_PIECES: {
      const ids=new Set(command.ids||[]), delta=Number(command.delta)||0, min=Number(command.min)||.35, max=Number(command.max)||3;
      for(const item of items) if(ids.has(item.id)) item.scale=clamp((Number(item.scale)||1)+delta,min,max);
      break;
    }
    case BOARD_COMMANDS.MOVE_PIECE: {
      const item=items.find(x=>x.id===command.id); if(item){item.x=Number(command.x)||0;item.y=Number(command.y)||0;} break;
    }
    case BOARD_COMMANDS.MOVE_MANY:
      for(const move of command.moves||[]){const item=items.find(x=>x.id===move.id);if(item){item.x=Number(move.x)||0;item.y=Number(move.y)||0;}} break;
    case BOARD_COMMANDS.REPLACE_ALL:
      state.replace(command.items||[]); break;
    default: throw new Error('UNKNOWN_BOARD_COMMAND:'+command.type);
  }
  return state.items;
}
