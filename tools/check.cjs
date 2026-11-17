const {chromium}=require('playwright-core');
const {createServer}=require('./serve.cjs');
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');

(async()=>{
  const server=createServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base=`http://127.0.0.1:${server.address().port}`;
  const executable=process.env.CHROME_PATH||['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(fs.existsSync);
  let browser;
  const errors=[];
  try{
    browser=await chromium.launch({executablePath:executable,headless:true,args:['--enable-webgl','--ignore-gpu-blocklist']});
    const page=await browser.newPage({viewport:{width:1440,height:900},deviceScaleFactor:1});
    page.on('pageerror',error=>errors.push(error.message));
    page.on('console',msg=>{if(msg.type()==='error')errors.push(msg.text())});
    page.on('dialog',d=>d.dismiss());
    const artifacts=path.resolve(__dirname,'../artifacts');fs.mkdirSync(artifacts,{recursive:true});
    await page.goto(base);await page.waitForFunction(()=>typeof loop!=='undefined'&&loop.ready,{timeout:30000});
    await page.waitForTimeout(1800);
    await page.screenshot({path:path.join(artifacts,'menu-desktop.png')});
    await page.click('#play');
    await page.waitForFunction(()=>state==='play');
    assert.equal(await page.locator('#hud').isVisible(),true);
    // Isolate mechanics from the autonomous predators for deterministic checks.
    await page.evaluate(()=>EN.forEach(e=>{e.dead=true;e.g.visible=false}));
    const before=await page.evaluate(()=>({x:P.x,z:P.z}));
    await page.keyboard.down('KeyW');await page.waitForTimeout(450);await page.keyboard.up('KeyW');
    const after=await page.evaluate(()=>({x:P.x,z:P.z}));
    assert.ok(Math.hypot(after.x-before.x,after.z-before.z)>.2,'W moves the player');
    await page.keyboard.down('Space');await page.waitForTimeout(120);
    assert.ok(await page.evaluate(()=>P.jy>0),'Jump lifts the player');await page.keyboard.up('Space');
    await page.waitForFunction(()=>P.jy===0&&atmosphere.stats.activeRings>0);
    await page.evaluate(()=>{const it=items.find(i=>!i.state&&i.r<P.r*.85);P.x=it.x;P.z=it.z;P.vx=P.vz=0});
    await page.waitForFunction(()=>score>0);assert.ok(await page.evaluate(()=>eaten>0),'Food adds score and mass');
    await page.keyboard.press('Escape');assert.equal(await page.evaluate(()=>state),'pause');
    const pausedTime=await page.evaluate(()=>tPlay);await page.waitForTimeout(250);assert.equal(await page.evaluate(()=>tPlay),pausedTime,'Pause freezes simulation');
    await page.click('#pauseopts');await page.selectOption('#q','ULTRA');assert.equal(await page.evaluate(()=>qn),'ULTRA');
    await page.selectOption('#q','BAJA');assert.equal(await page.evaluate(()=>sun.castShadow),false);
    await page.selectOption('#q','ALTA');await page.click('#ob');await page.click('#res');
    await page.evaluate(()=>{P.mass=12;P.r=Math.cbrt(12);P.x=0;P.z=0;P.vx=P.vz=0});await page.waitForTimeout(250);
    const mass=await page.evaluate(()=>{items.forEach(it=>{if(!it.state)it.state=3});return P.mass});
    await page.keyboard.down('KeyW');await page.keyboard.down('ShiftLeft');await page.waitForTimeout(250);await page.keyboard.up('ShiftLeft');await page.keyboard.up('KeyW');
    assert.ok(await page.evaluate(m=>P.mass<m,mass),'Boost consumes mass');
    assert.ok(await page.evaluate(()=>atmosphere.stats.trailVisible),'Boost draws a luminous trail');
    await page.evaluate(()=>items.forEach(it=>{if(it.state===3)it.state=0}));
    await page.waitForTimeout(900);await page.screenshot({path:path.join(artifacts,'game-desktop.png')});
    // A restart must also restore pickups whose eating animation was in flight.
    await page.evaluate(()=>{const it=items.find(i=>i.state===0&&i.r<P.r*.85);eatItem(P,it);toMenu();startGame()});
    assert.equal(await page.evaluate(()=>items.filter(i=>i.state!==0).length),0,'Restart restores food');
    assert.equal(await page.evaluate(()=>score),0,'Restart resets score');
    await page.evaluate(()=>{EN.forEach(e=>{e.dead=true;e.g.visible=false});const e=EN[0];e.dead=false;e.r=5;e.mass=125;e.x=P.x;e.z=P.z;animSl(e,.016,0,0);eatSlime(e,P)});
    await page.waitForFunction(()=>state==='over');assert.equal(await page.locator('#over').isVisible(),true);
    await page.click('#retry');assert.equal(await page.evaluate(()=>P.dead),false,'Retry revives the player');
    await page.evaluate(()=>toMenu());
    // All light presets compile, the reflected render restores renderer state,
    // and the live cycle advances without waiting six wall-clock minutes.
    await page.click('#opb');await page.selectOption('#atmosphere','NOCHE');
    await page.waitForFunction(()=>atmosphere.night>.97);await page.click('#ob');await page.waitForTimeout(1300);
    await page.screenshot({path:path.join(artifacts,'menu-night.png')});
    assert.ok(await page.evaluate(()=>atmosphere.stats.reflectionFrames>0),'Water reflects the scene');
    assert.ok(await page.evaluate(()=>ren.clippingPlanes.length===0&&ren.shadowMap.autoUpdate&&water.visible),'Reflection restores render state');
    await page.click('#play');await page.evaluate(()=>EN.forEach(e=>{e.dead=true;e.g.visible=false}));await page.waitForTimeout(600);
    await page.screenshot({path:path.join(artifacts,'game-night.png')});
    await page.keyboard.press('Escape');await page.click('#pauseopts');await page.selectOption('#atmosphere','ALBA');await page.waitForFunction(()=>atmosphere.night<.03);
    await page.selectOption('#q','MEDIA');const reflected=await page.evaluate(()=>atmosphere.stats.reflectionFrames);await page.waitForTimeout(120);assert.equal(await page.evaluate(()=>atmosphere.stats.reflectionFrames),reflected,'Medium quality skips planar reflection');
    await page.selectOption('#atmosphere','VIVO');await page.evaluate(()=>{for(let i=0;i<200;i++)atmosphere.update(1,T,'play',roundId,lvl)});
    assert.ok(await page.evaluate(()=>atmosphere.night>.5),'The live cycle reaches night');
    await page.selectOption('#atmosphere','DORADO');await page.waitForFunction(()=>atmosphere.night<.03);await page.click('#ob');await page.click('#p2m');
    const mobile=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:1});
    mobile.on('pageerror',error=>errors.push(error.message));
    mobile.on('console',msg=>{if(msg.type()==='error')errors.push(msg.text())});
    await mobile.goto(base);await mobile.waitForFunction(()=>typeof loop!=='undefined'&&loop.ready);await mobile.waitForTimeout(700);
    await mobile.screenshot({path:path.join(artifacts,'menu-mobile.png')});
    await mobile.click('#play');assert.equal(await mobile.locator('#joy').isVisible(),true);assert.equal(await mobile.locator('#jump').isVisible(),true);
    await mobile.evaluate(()=>EN.forEach(e=>{e.dead=true;e.g.visible=false}));
    await mobile.locator('#jump').tap();await mobile.waitForTimeout(100);assert.ok(await mobile.evaluate(()=>P.jy>0),'Mobile jump works');
    await mobile.screenshot({path:path.join(artifacts,'game-mobile.png')});
    await mobile.click('#pausebtn');assert.equal(await mobile.locator('#joy').isVisible(),false,'Touch controls hide while paused');
    await mobile.click('#p2m');assert.equal(await mobile.locator('#bst').isVisible(),false,'Touch controls hide in menu');
    assert.deepEqual(errors,[],'No JavaScript or WebGL errors');
    console.log('OK: rendering, movement, eating, growth, jump and landing effects, boost trail, pause, quality, restart, defeat, retry, night lighting, reflections, live cycle and mobile controls.');
    console.log('Screenshots: artifacts/');
  }catch(error){console.error('Browser errors:',errors);throw error}finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve))}
})().catch(e=>{console.error(e);process.exitCode=1});
