import {test, expect} from '@playwright/test';

test('real Canvas rasterizes opaque 16px forest tiles identically after cache eviction', async ({page}) => {
  await page.goto('/');
  const result = await page.evaluate(async () => {
    const {TileGround, CHUNK_SIZE, TILE_SIZE} = await import('/tiles.js');
    const ground = new TileGround({cacheLimit:1});
    const first = ground.getChunk(-1, 0);
    const read = canvas => canvas.getContext('2d').getImageData(0, 0, CHUNK_SIZE, CHUNK_SIZE).data;
    const before = read(first);
    ground.getChunk(0, 0);
    const second = ground.getChunk(-1, 0);
    const after = read(second);
    let transparent = 0, changedChannels = 0;
    for (let i = 0; i < before.length; i += 4) {
      if (before[i + 3] !== 255 || after[i + 3] !== 255) transparent++;
      for (let channel = 0; channel < 4; channel++) {
        if (before[i + channel] !== after[i + channel]) changedChannels++;
      }
    }
    const kinds = new Set();
    for (let y = 0; y < CHUNK_SIZE; y += TILE_SIZE) {
      for (let x = 0; x < CHUNK_SIZE; x += TILE_SIZE) {
        const i = (y * CHUNK_SIZE + x) * 4;
        kinds.add(Array.from(after.slice(i, i + 3)).join(','));
      }
    }
    return {width:second.width, height:second.height, transparent, changedChannels, groundColors:kinds.size};
  });
  expect(result).toEqual({
    width:256, height:256, transparent:0, changedChannels:0, groundColors:5
  });
});
