import test from 'node:test';
import assert from 'node:assert/strict';
import {Renderer} from '../dist/renderer.js';

// Exercise the actual character renderer, without constructing a DOM-backed game.
const subjects = [
  {type:'knight', hero:true}, {type:'elf', hero:true}, {type:'mage', hero:true},
  {type:'melee'}, {type:'fast'}, {type:'ranged'}, {type:'boss'}
];

function characterCommands(subject, t = 0) {
  const calls = [];
  let fillStyle = '';
  const ctx = {
    save() {}, restore() {}, beginPath() {}, ellipse() {}, fill() {},
    arc() {}, stroke() {}, scale() {},
    translate(x, y) { calls.push({kind:'translate', values:[x,y]}); },
    set fillStyle(color) { fillStyle = color; },
    fillRect(x, y, w, h) { calls.push({kind:'rect', values:[x,y,w,h], color:fillStyle}); }
  };
  const q = {x:64.35, y:76.6, hp:3.75, maxHp:10, hit:0, warning:0, ...subject};
  Renderer.prototype.character.call({ctx}, q, t);
  return calls;
}

test('all three class sprites and four enemy types use whole-pixel shapes across animation frames', () => {
  for (const subject of subjects) {
    for (const time of [0, .017, .113, .5, 1.37]) {
      const commands = characterCommands(subject, time);
      const rects = commands.filter(call => call.kind === 'rect');
      assert.ok(rects.length > 5, subject.type + ' must draw a sprite');
      for (const call of commands) {
        assert.ok(call.values.every(Number.isInteger),
          subject.type + ' emitted fractional ' + call.kind + ' coordinates at ' + time);
      }
    }
  }
});

test('hero classes and enemy types have seven distinct geometric/palette motifs', () => {
  const signatures = subjects.map(subject =>
    JSON.stringify(characterCommands(subject).filter(call => call.kind === 'rect')));
  assert.equal(new Set(signatures).size, subjects.length,
    'sprite types should remain visually distinguishable');
  for (const type of ['knight','elf','mage']) {
    const normal = characterCommands({type,hero:true,evolved:false});
    const evolved = characterCommands({type,hero:true,evolved:true});
    assert.notDeepEqual(evolved, normal, type + ' evolved weapon must remain visibly distinct');
  }
});

test('enemy health-bar fill is a bounded integer number of pixels', () => {
  const bar = hp => characterCommands({type:'ranged',hp})
    .find(call => call.kind === 'rect' && call.color === '#b87359');
  assert.equal(bar(3.75).values[2], 8);
  assert.equal(bar(-4).values[2], 0);
  assert.ok(bar(3.75).values.every(Number.isInteger));
});
