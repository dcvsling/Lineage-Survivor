/** Deterministic 16x16 original forest tiles, cached in bounded 256px chunks. */
export const TILE_SIZE = 16;
export const CHUNK_TILES = 16;
export const CHUNK_SIZE = TILE_SIZE * CHUNK_TILES;

function hashTile(x, y) {
  let h = Math.imul(x, 0x1f123bb5) ^ Math.imul(y, 0x5f356495) ^ 0x1965;
  h = Math.imul(h ^ (h >>> 16), 0x7feb352d);
  h = Math.imul(h ^ (h >>> 15), 0x846ca68b);
  return (h ^ (h >>> 16)) >>> 0;
}

export function tileKind(x, y) {
  const n = hashTile(x, y) % 100;
  return n < 52 ? 0 : n < 74 ? 1 : n < 88 ? 2 : n < 96 ? 3 : 4;
}

export function visibleChunkBounds(minX, minY, maxX, maxY) {
  if (![minX, minY, maxX, maxY].every(Number.isFinite) || minX > maxX || minY > maxY) {
    throw new RangeError('Invalid visible world bounds');
  }
  return {
    left: Math.floor(minX / CHUNK_SIZE), right: Math.floor(maxX / CHUNK_SIZE),
    top: Math.floor(minY / CHUNK_SIZE), bottom: Math.floor(maxY / CHUNK_SIZE)
  };
}

const TILE_COLORS = Object.freeze(['#182b20', '#1b3022', '#203628', '#192d21', '#25362b']);

/** Render a complete opaque 16×16 forest cell; every detail stays inside its cell. */
function paintTile(c, x, y, kind, seed) {
  c.fillStyle = TILE_COLORS[kind];
  c.fillRect(x, y, TILE_SIZE, TILE_SIZE);
  const flip = seed & 1;
  if (kind === 0) {
    // Dark leaf litter, deliberately sparse to retain a readable battlefield.
    c.fillStyle = '#22372a'; c.fillRect(x + 3 + 8 * flip, y + 11, 2, 1);
    c.fillStyle = '#14271d'; c.fillRect(x + 9 - 5 * flip, y + 4, 3, 1);
  } else if (kind === 1) {
    // Ferns: staggered fronds echo the same low-resolution silhouette.
    c.fillStyle = '#314934'; c.fillRect(x + 5, y + 9, 2, 4); c.fillRect(x + 9, y + 6, 2, 5);
    c.fillStyle = '#40583b'; c.fillRect(x + 4, y + 8, 4, 1); c.fillRect(x + 8, y + 5, 4, 1);
  } else if (kind === 2) {
    c.fillStyle = '#2a4431'; c.fillRect(x + 2, y + 3, 7, 3); c.fillRect(x + 9, y + 10, 5, 2);
    c.fillStyle = '#39503a'; c.fillRect(x + 4 + flip, y + 3, 3, 1);
  } else if (kind === 3) {
    c.fillStyle = '#3a513b'; c.fillRect(x + 7, y + 2, 2, 7); c.fillRect(x + 4, y + 8, 3, 2);
    c.fillStyle = '#496247'; c.fillRect(x + 6, y + 5, 1, 2); c.fillRect(x + 9, y + 4 + flip, 2, 1);
  } else {
    c.fillStyle = '#3f4c40'; c.fillRect(x + 3, y + 8, 9, 5);
    c.fillStyle = '#536052'; c.fillRect(x + 5, y + 7, 5, 2);
    c.fillStyle = '#61705d'; c.fillRect(x + 6 + flip, y + 7, 2, 1);
  }
}

export class TileGround {
  constructor({ createCanvas = () => document.createElement('canvas'), cacheLimit = 24 } = {}) {
    if (!Number.isInteger(cacheLimit) || cacheLimit < 1) throw new RangeError('Invalid chunk cache limit');
    this.createCanvas = createCanvas;
    this.cacheLimit = cacheLimit;
    this.cache = new Map();
  }

  makeChunk(chunkX, chunkY) {
    const canvas = this.createCanvas();
    canvas.width = canvas.height = CHUNK_SIZE;
    const c = canvas.getContext('2d');
    if (!c) throw new Error('2D tile context unavailable');
    c.imageSmoothingEnabled = false;
    for (let row = 0; row < CHUNK_TILES; row++) {
      for (let col = 0; col < CHUNK_TILES; col++) {
        const x = col * TILE_SIZE, y = row * TILE_SIZE;
        const worldX = chunkX * CHUNK_TILES + col, worldY = chunkY * CHUNK_TILES + row;
        paintTile(c, x, y, tileKind(worldX, worldY), hashTile(worldX, worldY));
      }
    }
    return canvas;
  }

  getChunk(x, y) {
    const key = `${x},${y}`;
    if (this.cache.has(key)) {
      const cached = this.cache.get(key);
      this.cache.delete(key);
      this.cache.set(key, cached);
      return cached;
    }
    const canvas = this.makeChunk(x, y);
    this.cache.set(key, canvas);
    if (this.cache.size > this.cacheLimit) this.cache.delete(this.cache.keys().next().value);
    return canvas;
  }

  draw(c, minX, minY, maxX, maxY) {
    const {left, right, top, bottom} = visibleChunkBounds(minX, minY, maxX, maxY);
    for (let y = top; y <= bottom; y++) {
      for (let x = left; x <= right; x++) {
        c.drawImage(this.getChunk(x, y), x * CHUNK_SIZE, y * CHUNK_SIZE);
      }
    }
  }
}
