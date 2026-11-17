import {test, expect} from '@playwright/test';

test('Chromium Canvas paints distinct, repeatable class and enemy pixel sprites', async ({page}) => {
  await page.goto('/');
  const result = await page.evaluate(async () => {
    const {Renderer} = await import('/renderer.js');
    const subjects = [
      {type:'knight',hero:true}, {type:'elf',hero:true}, {type:'mage',hero:true},
      {type:'melee'}, {type:'fast'}, {type:'ranged'}, {type:'boss'}
    ];
    const draw = (subject, t = .23) => {
      const canvas = document.createElement('canvas');
      canvas.width = 128;
      canvas.height = 128;
      const ctx = canvas.getContext('2d', {willReadFrequently:true});
      ctx.imageSmoothingEnabled = false;
      Renderer.prototype.character.call({ctx}, {
        x:64.35, y:76.6, hp:10, maxHp:10, hit:0, warning:0, ...subject
      }, t);
      const pixels = ctx.getImageData(0, 0, 128, 128).data;
      let count = 0, left = 128, top = 128, right = -1, bottom = -1;
      for (let y = 0; y < 128; y++) {
        for (let x = 0; x < 128; x++) {
          if (!pixels[(y * 128 + x) * 4 + 3]) continue;
          count++;
          left = Math.min(left, x); top = Math.min(top, y);
          right = Math.max(right, x); bottom = Math.max(bottom, y);
        }
      }
      return {signature:canvas.toDataURL('image/png'), count,
        inBounds: left > 0 && top > 0 && right < 127 && bottom < 127};
    };
    const base = subjects.map(subject => draw(subject));
    const evolved = subjects.slice(0, 3).map(subject => draw({...subject, evolved:true}));
    return {
      uniqueSprites: new Set(base.map(sprite => sprite.signature)).size,
      repeatable: base.every((sprite, i) => sprite.signature === draw(subjects[i]).signature),
      evolvedDifferent: evolved.every((sprite, i) => sprite.signature !== base[i].signature),
      allVisible: base.every(sprite => sprite.count > 30 && sprite.inBounds)
    };
  });
  expect(result).toEqual({
    uniqueSprites:7, repeatable:true, evolvedDifferent:true, allVisible:true
  });
});
