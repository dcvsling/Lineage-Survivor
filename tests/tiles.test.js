import test from 'node:test';
import assert from 'node:assert/strict';
import { TILE_SIZE, CHUNK_SIZE, CHUNK_TILES, tileKind, visibleChunkBounds, TileGround } from '../dist/tiles.js';

test('forest tile variants are deterministic across positive and negative world cells', () => {
  assert.equal(TILE_SIZE, 16);
  assert.equal(CHUNK_SIZE, TILE_SIZE * CHUNK_TILES);
  const coords = [[0,0], [15,15], [-1,-1], [1023,-314], [100000,-100000]];
  const first = coords.map(([x,y]) => tileKind(x,y));
  assert.deepEqual(coords.map(([x,y]) => tileKind(x,y)), first);
  assert.ok(first.every(n => Number.isInteger(n) && n >= 0 && n <= 4));
  assert.ok(new Set(Array.from({length:100}, (_,x) => tileKind(x,0))).size >= 3);
});

test('visible chunk calculation handles tile boundaries and invalid bounds', () => {
  assert.deepEqual(visibleChunkBounds(0,0,255,255), {left:0,right:0,top:0,bottom:0});
  assert.deepEqual(visibleChunkBounds(-1,-257,256,-1), {left:-1,right:1,top:-2,bottom:-1});
  assert.throws(() => visibleChunkBounds(10,0,2,20), RangeError);
  assert.throws(() => visibleChunkBounds(NaN,0,2,20), RangeError);
});

test('16px tiles render into bounded, reusable, fully populated chunks', () => {
  const created = [];
  const createCanvas = () => {
    const context = {fills:0, fillRect(){this.fills++;}};
    const canvas = {width:0,height:0,getContext:()=>context};
    created.push({canvas,context});
    return canvas;
  };
  const ground = new TileGround({createCanvas,cacheLimit:2});
  const output = {images:[],drawImage(canvas,x,y){this.images.push({canvas,x,y});}};
  ground.draw(output,0,0,100,100);
  ground.draw(output,0,0,100,100);
  assert.equal(created.length,1);
  assert.equal(output.images.length,2);
  assert.equal(created[0].canvas.width,CHUNK_SIZE);
  assert.equal(created[0].canvas.height,CHUNK_SIZE);
  assert.ok(created[0].context.fills >= CHUNK_TILES ** 2);
  ground.draw(output,300,0,400,100);
  ground.draw(output,600,0,700,100);
  assert.equal(ground.cache.size,2);
  assert.equal(created.length,3);
  ground.draw(output,0,0,100,100);
  assert.equal(created.length,4, 'least recently used chunk should be rebuilt');
  assert.throws(() => new TileGround({cacheLimit:0}),RangeError);
});
