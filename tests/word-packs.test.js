import test from 'node:test';
import assert from 'node:assert/strict';
import curatedPacks from '../word-packs.json' with {type:'json'};
import {freshRoom,newBoard,validatePacks,normWord} from '../worker/engine.js';

const rng=()=>{let x=0x4a6f7963;return ()=>((x=(Math.imul(x,1664525)+1013904223)>>>0)/4294967296);};

test('production curated packs: exactly 400 valid unique words per category',()=>{
  const packs=validatePacks(curatedPacks);
  assert.equal(packs.family.length,400);
  assert.equal(packs.nsfw.length,400);
  assert.equal(new Set(packs.family.map(normWord)).size,400);
  assert.equal(new Set(packs.nsfw.map(normWord)).size,400);
});

test('production Mixed Bag: 10 boards with 10–15 NSFW cards, 25 unique, no early session repeats',()=>{
  const random=rng();
  const room=freshRoom({code:'ABCDEF',hostToken:'TEST_HOST',mode:'mixed',packs:curatedPacks,rand:random});
  const seen=new Set();
  for(let game=0;game<10;game++){
    const board=newBoard(room,random).board;
    assert.equal(board.length,25);
    assert.ok(board.filter(c=>c.source==='nsfw').length>=10);
    assert.ok(board.filter(c=>c.source==='nsfw').length<=15);
    assert.equal(new Set(board.map(c=>normWord(c.word))).size,25);
    for(const card of board){
      const key=normWord(card.word);
      assert.equal(seen.has(key),false,`Word repeated before pack cycling on board ${game+1}: ${card.word}`);
      seen.add(key);
    }
  }
  assert.equal(seen.size,250);
});

test('overlapping synthetic packs cannot repeat words across packs before cycle',()=>{
  const family=Array.from({length:400},(_,i)=>`CLEAN_${i}`);
  const nsfw=[...family.slice(0,30),...Array.from({length:370},(_,i)=>`ADULT_${i}`)];
  const random=rng();
  const room=freshRoom({code:'ABCDEF',hostToken:'TEST_HOST',mode:'mixed',packs:{family,nsfw},rand:random});
  const seen=new Set();
  for(let game=0;game<10;game++){
    const board=newBoard(room,random).board;
    for(const card of board){
      const normalized=normWord(card.word);
      assert.equal(seen.has(normalized),false,`Cross-pack early reuse: ${card.word}`);
      seen.add(normalized);
    }
  }
  assert.equal(seen.size,250);
});
