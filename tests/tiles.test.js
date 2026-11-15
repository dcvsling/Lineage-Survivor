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


test('every forest motif stays inside its opaque 16px cell and retains all five ground types', () => {
  const commands = [];
  let color = '';
  const ctx = {
    set fillStyle(value) { color = value; },
    fillRect(x, y, w, h) { commands.push({x, y, w, h, color}); }
  };
  const ground = new TileGround({createCanvas: () => ({getContext: () => ctx})});
  ground.makeChunk(-2, 3);
  const bases = commands.filter(({w, h}) => w === TILE_SIZE && h === TILE_SIZE);
  assert.equal(bases.length, CHUNK_TILES ** 2, 'each cell must begin with one complete opaque base fill');
  assert.equal(new Set(bases.map(({color}) => color)).size, 5);
  assert.equal(new Set(bases.map(({x, y}) => x + ',' + y)).size, CHUNK_TILES ** 2);
  assert.ok(commands.length > bases.length * 2, 'ground motifs should have visible pixel details');
  for (const {x, y, w, h, color} of commands) {
    assert.ok([x, y, w, h].every(Number.isInteger));
    assert.ok(w > 0 && h > 0 && x >= 0 && y >= 0);
    assert.ok(x + w <= (Math.floor(x / TILE_SIZE) + 1) * TILE_SIZE,
      'motif must not bleed into the neighboring tile horizontally');
    assert.ok(y + h <= (Math.floor(y / TILE_SIZE) + 1) * TILE_SIZE,
      'motif must not bleed into the neighboring tile vertically');
    assert.ok(/^#[0-9a-f]{6}$/i.test(color), 'motif colors remain fully opaque');
  }
});

test('tile rasterization remains identical after cache eviction and chunk pan has no gaps', () => {
  const createCanvas = () => {
    const commands = [];
    let color = '';
    const ctx = {
      set fillStyle(value) { color = value; },
      fillRect(...args) { commands.push([color, ...args]); }
    };
    return {commands, getContext: () => ctx};
  };
  const ground = new TileGround({createCanvas, cacheLimit:1});
  const first = ground.getChunk(-1, 2).commands;
  ground.getChunk(0, 2);
  assert.deepEqual(ground.getChunk(-1, 2).commands, first,
    'eviction must not change random detail placement');
  const drawn = [];
  ground.draw({drawImage(image, x, y) { drawn.push([x, y]); }}, -260, -1, 270, 257);
  assert.equal(drawn.length, 12);
  const positions = new Set(drawn.map(([x, y]) => x + ',' + y));
  assert.equal(positions.size, 12);
  for (let y = -1; y <= 1; y++) {
    for (let x = -2; x <= 1; x++) {
      assert.ok(positions.has(x * CHUNK_SIZE + ',' + y * CHUNK_SIZE),
        'negative, zero and positive chunks must tessellate without missing cells');
    }
  }
});
