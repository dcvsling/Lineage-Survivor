import {test, expect} from '@playwright/test';

// Chromium touch emulation sends real PointerEvent(pointerType='touch') sequences.
// This complements, but does not replace, testing on physical mobile hardware.
test.use({
  viewport: {width:390, height:844},
  isMobile: true,
  hasTouch: true,
  deviceScaleFactor: 2
});

async function beginRun(page) {
  await page.goto('/');
  await expect(page.locator('#classes .class-card')).toHaveCount(3);
  await page.locator('#start').click();
  await expect(page.locator('#modal')).toBeVisible();
  await page.getByRole('button', {name:'我準備好了，出發'}).click();
  await expect(page.locator('#hud')).toBeVisible();
  await expect(page.locator('#modal')).toBeHidden();
}

async function readPausedPlayerX(page) {
  const diagnostics = page.locator('#modal details.diagnostics');
  await diagnostics.locator('summary').click();
  await diagnostics.locator('input').fill('player');
  await diagnostics.getByRole('button', {name:'查詢'}).click();
  const text = await diagnostics.locator('output').textContent();
  const x = Number(text.match(/座標: \((-?\d+),\s*-?\d+\)/)?.[1]);
  expect(Number.isFinite(x), text).toBe(true);
  return x;
}

async function dispatchTouch(client, type, points) {
  await client.send('Input.dispatchTouchEvent', {
    type, touchPoints:points.map(({x,y})=>({x,y,radiusX:1,radiusY:1,force:1}))
  });
}

test('portrait touch drag moves player and releasing stops the joystick', async ({page}) => {
  const errors = [];
  page.on('pageerror', err=>errors.push(err.message));
  await beginRun(page);
  await page.locator('#pause').click();
  const before = await readPausedPlayerX(page);
  await page.getByRole('button', {name:'繼續遠征'}).click();

  const joystick = page.locator('#joystick');
  await expect(joystick).toBeVisible();
  await expect(joystick).toHaveCSS('touch-action','none');
  const bounds = await joystick.boundingBox();
  expect(bounds).not.toBeNull();
  const origin = {x:bounds.x + bounds.width/2,y:bounds.y + bounds.height/2};
  const dragged = {x:origin.x+28,y:origin.y};
  const client = await page.context().newCDPSession(page);
  try {
    await dispatchTouch(client,'touchStart',[origin]);
    await dispatchTouch(client,'touchMove',[dragged]);
    await expect.poll(()=>joystick.locator('div').evaluate(el=>el.style.transform)).not.toBe('translate(0px, 0px)');
    await page.waitForTimeout(450);
  } finally {
    await dispatchTouch(client,'touchEnd',[]);
    await client.detach();
  }

  await expect.poll(()=>joystick.locator('div').evaluate(el=>el.style.transform)).toBe('translate(0px, 0px)');
  await page.locator('#pause').click();
  const after = await readPausedPlayerX(page);
  expect(after).toBeGreaterThan(before+15);
  expect(errors).toEqual([]);
});

test('secondary mobile touch cannot take joystick ownership; cancel resets input', async ({page}) => {
  await beginRun(page);
  const joystick = page.locator('#joystick');
  const bounds = await joystick.boundingBox();
  expect(bounds).not.toBeNull();
  const origin = {x:bounds.x+bounds.width/2,y:bounds.y+bounds.height/2};
  const moved = {x:origin.x+25,y:origin.y};
  const other = {x:230,y:300};
  const knob = joystick.locator('div');
  const client = await page.context().newCDPSession(page);
  try {
    await dispatchTouch(client,'touchStart',[origin]);
    await dispatchTouch(client,'touchMove',[moved]);
    await expect.poll(()=>knob.evaluate(el=>el.style.transform)).not.toBe('translate(0px, 0px)');
    const first = await knob.evaluate(el=>el.style.transform);

    await dispatchTouch(client,'touchStart',[moved,other]);
    await expect(knob).toHaveAttribute('style',/translate/);
    expect(await knob.evaluate(el=>el.style.transform)).toBe(first);
  } finally {
    await dispatchTouch(client,'touchCancel',[]);
    await client.detach();
  }
  await expect.poll(()=>knob.evaluate(el=>el.style.transform)).toBe('translate(0px, 0px)');
});

test('landscape touch viewport keeps pause, joystick and abilities usable', async ({page}) => {
  const errors = [];
  page.on('pageerror', err=>errors.push(err.message));
  await page.setViewportSize({width:844,height:390});
  await beginRun(page);
  await expect.poll(()=>page.locator('#world').evaluate(canvas=>({
    width:canvas.width,height:canvas.height,smoothing:canvas.getContext('2d').imageSmoothingEnabled
  }))).toEqual({width:422,height:195,smoothing:false});
  for (const selector of ['#joystick','#pause','#ability','#heal']) {
    await expect(page.locator(selector)).toBeVisible();
  }
  await page.locator('#ability').click();
  await expect(page.locator('#ability-cooldown')).not.toHaveText('就緒');
  await page.locator('#pause').click();
  await expect(page.locator('#modal')).toBeVisible();
  await page.getByRole('button',{name:'繼續遠征'}).click();
  await expect(page.locator('#modal')).toBeHidden();
  expect(errors).toEqual([]);
});
