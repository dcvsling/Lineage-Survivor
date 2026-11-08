import test from 'node:test';
import assert from 'node:assert/strict';
import {cameraFrame, worldToCanvas, canvasToWorld} from '../dist/camera.js';

test('camera follows the player at canvas center for desktop and narrow viewports', () => {
  for (const [cssWidth, backingWidth, height, expectedScale] of [
    [1200, 600, 400, 0.72],
    [390, 195, 422, 0.6],
    [700, 350, 350, 0.72],
    [699, 350, 350, 0.6]
  ]) {
    const frame = cameraFrame({x:1200,y:800},backingWidth,height,cssWidth);
    assert.equal(frame.scale,expectedScale);
    assert.deepEqual(worldToCanvas(frame,1200,800),{x:backingWidth/2,y:height/2});
    assert.equal(frame.rx,backingWidth/(2*expectedScale)+100);
    assert.equal(frame.ry,height/(2*expectedScale)+100);
  }
});

test('world-canvas projections round trip after target movement and resize', () => {
  for (const frame of [
    cameraFrame({x:20,y:2380},195,422,390),
    cameraFrame({x:1900,y:1200},650,360,1300)
  ]) {
    for (const point of [{x:-200,y:0},{x:1480.25,y:1900.5},{x:2400,y:2400}]) {
      const projected = worldToCanvas(frame,point.x,point.y);
      const returned = canvasToWorld(frame,projected.x,projected.y);
      assert.ok(Math.abs(returned.x-point.x)<1e-9);
      assert.ok(Math.abs(returned.y-point.y)<1e-9);
    }
  }
});

test('camera rejects invalid coordinates and viewport sizes', () => {
  assert.throws(()=>cameraFrame({x:NaN,y:2},200,100,390),RangeError);
  assert.throws(()=>cameraFrame({x:0,y:0},0,100,390),RangeError);
  assert.throws(()=>cameraFrame({x:0,y:0},200,100,Infinity),RangeError);
});
