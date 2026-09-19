import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { BoardState } from '../assets/js/core/board-state.js';
import { BoardHistory } from '../assets/js/core/board-history.js';
import { BOARD_COMMANDS, applyBoardCommand } from '../assets/js/core/board-commands.js';
import { createLetterPiece } from '../assets/js/core/board-piece.js';
import { PlatformAdapter } from '../assets/js/core/platform-adapter.js';

test('letter pieces normalize logical char and preserve case', () => {
  const piece=createLetterPiece({logicalChar:'a',displayGlyph:'a',letterCase:'lower',x:12,y:34});
  assert.equal(piece.logicalChar,'A');
  assert.equal(piece.displayGlyph,'a');
  assert.equal(piece.letterCase,'lower');
  assert.equal(piece.x,12);
  assert.equal(piece.y,34);
});

test('board snapshots are deep copies', () => {
  const state=new BoardState([{id:'a',type:'letter',x:10,y:20}]);
  const snap=state.snapshot();
  snap[0].x=999;
  assert.equal(state.items[0].x,10);
});

test('history restores exercise-aware snapshots in order', () => {
  const history=new BoardHistory(5);
  const first={items:[{id:'a',x:10}],exercise:{slots:[null]},foamSpace:{width:700,height:500}};
  const second={items:[{id:'a',x:50}],exercise:{slots:['a']},foamSpace:{width:1200,height:700}};
  history.checkpoint(first,'MOVE');
  const undo=history.undo(second);
  assert.deepEqual(undo,first);
  const redo=history.redo(undo);
  assert.deepEqual(redo,second);
});

test('board commands move resize and delete pieces', () => {
  const state=new BoardState([
    createLetterPiece({id:'a',logicalChar:'A',x:0,y:0}),
    createLetterPiece({id:'b',logicalChar:'B',x:10,y:10})
  ]);
  applyBoardCommand(state,{type:BOARD_COMMANDS.MOVE_PIECE,id:'a',x:25,y:30});
  assert.deepEqual([state.find('a').x,state.find('a').y],[25,30]);
  applyBoardCommand(state,{type:BOARD_COMMANDS.RESIZE_PIECES,ids:['a'],delta:.5,min:.5,max:2});
  assert.equal(state.find('a').scale,1.5);
  applyBoardCommand(state,{type:BOARD_COMMANDS.DELETE_PIECES,ids:['b']});
  assert.equal(state.items.length,1);
});

test('platform adapter exposes OK activation and webOS movement', () => {
  const adapter=new PlatformAdapter({id:'webos'});
  assert.deepEqual(adapter.actionForKey('Enter'),{type:'activate'});
  assert.deepEqual(adapter.actionForKey('ArrowRight'),{type:'move',dx:18,dy:0});
});

test('v0.25.1 hardening UI contracts stay present', () => {
  const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
  const js=fs.readFileSync(new URL('../assets/js/english-board.js',import.meta.url),'utf8');
  const sw=fs.readFileSync(new URL('../sw.js',import.meta.url),'utf8');
  const css=fs.readFileSync(new URL('../styles.css',import.meta.url),'utf8');
  const curriculum=JSON.parse(fs.readFileSync(new URL('../src/data/exercises.json',import.meta.url),'utf8'));

  const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(match=>match[1]);
  assert.equal(new Set(ids).size,ids.length,'HTML IDs must be unique');

  for(const id of [
    'englishWorkspaceBuildActions',
    'englishWorkspaceBuildReshuffle',
    'englishWorkspaceBuildCheck',
    'englishWorkspaceBuildHint',
    'englishWorkspaceBuildStatus',
    'englishTrayCaseSwitch',
    'englishTrayPieceCount'
  ]){
    assert.ok(html.includes(`id="${id}"`),`missing ${id}`);
  }

  for(const mode of ['upper','lower','both']){
    assert.ok(html.includes(`data-tray-case="${mode}"`),`missing tray case ${mode}`);
    assert.ok(html.includes(`data-workspace-case="${mode}"`),`missing workspace case ${mode}`);
  }

  assert.ok(js.includes("const APP_VERSION='0.25.1'"));
  assert.ok(js.includes('syncFoamCoordinatesToCanvas'));
  assert.ok(js.includes('placeSelectedBuildPieceInSlot'));
  assert.ok(js.includes("this.trayCaseMode='upper'"));
  assert.ok(js.includes("this.trayCaseMode==='both'"));
  assert.ok(sw.includes("english-language-lab-v25-1"));
  assert.ok(css.includes(':not(.workspace-student-nav):not(.workspace-build-actions)'));
  assert.match(css,/#englishBuildWord,\s*#englishCompletedWord,\s*#englishSegmentWord\s*\{[^}]*text-transform\s*:\s*none;/s);
  assert.equal(curriculum.appVersion,'0.25.1');
});
