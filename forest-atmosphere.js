/* Edition 03: lighting, planar water reflections and responsive character effects. */
function createForestAtmosphere({THREE:T,scene,renderer,camera,sun,sky,water,grass,items,slimes,player,H,W,WL,rnd,emit,ct}) {
  const clamp=T.MathUtils.clamp,lerp=T.MathUtils.lerp;
  const color=hex=>new T.Color(hex).convertSRGBToLinear();
  const presets={
    ALBA:{label:'El claro del alba',top:0x3c748b,horizon:0xe8e4bb,fog:0xb8c9ab,sun:0xffe4ac,ambient:0xc6e3db,ground:0x4f623e,power:1.65,hemi:.58,exposure:.96,night:0,direction:[.5,.78,.35]},
    DORADO:{label:'La hora dorada',top:0x657c8d,horizon:0xf3c391,fog:0xb9b7a1,sun:0xffce91,ambient:0xc7d9dc,ground:0x655437,power:1.85,hemi:.48,exposure:1.01,night:0,direction:[-.65,.56,-.4]},
    NOCHE:{label:'El bosque de luciérnagas',top:0x0e1d35,horizon:0x4b657e,fog:0x354e61,sun:0xc2deff,ambient:0xa2c4e9,ground:0x38595a,power:.8,hemi:.65,exposure:.91,night:1,direction:[.4,.7,-.6]}
  };
  const prepared={};
  for(const [key,p]of Object.entries(presets)){prepared[key]={...p};for(const k of ['top','horizon','fog','sun','ambient','ground'])prepared[key][k]=color(p[k]);prepared[key].direction=new T.Vector3(...p.direction).normalize()}
  const current={...prepared.DORADO};for(const k of ['top','horizon','fog','sun','ambient','ground','direction'])current[k]=current[k].clone();
  const cycleTarget={...prepared.ALBA};for(const key of ['top','horizon','fog','sun','ambient','ground','direction'])cycleTarget[key]=cycleTarget[key].clone();
  let mode='DORADO',target=prepared.DORADO,clock=0,cycleClock=0,quality='ALTA',reflections=true,reflectionFrames=0,reflectionTick=0;
  let previousRound=-1,previousLevel=0,previousJump=0,trailTimer=0;
  const time={value:0},night={value:0},hero={value:new T.Vector4(0,0,.6,0)};
  const hemi=scene.children.find(o=>o.isHemisphereLight),fill=scene.children.filter(o=>o.isDirectionalLight&&o!==sun)[0];
  const originalMaterialIntensities=new Map();
  scene.traverse(o=>{if(o.material&&o.material.isMeshStandardMaterial&&!originalMaterialIntensities.has(o.material))originalMaterialIntensities.set(o.material,{env:o.material.envMapIntensity,emissive:o.material.emissiveIntensity})});

  sky.material.dispose();
  sky.material=new T.ShaderMaterial({side:T.BackSide,depthWrite:false,toneMapped:false,
    uniforms:{time,night,topColor:{value:current.top},horizonColor:{value:current.horizon},lightDirection:{value:current.direction}},
    vertexShader:'varying vec3 vDirection;void main(){vDirection=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader:`varying vec3 vDirection;uniform vec3 topColor;uniform vec3 horizonColor;uniform vec3 lightDirection;uniform float time;uniform float night;
      float skyHash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
      float skyNoise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(skyHash(i),skyHash(i+vec2(1,0)),f.x),mix(skyHash(i+vec2(0,1)),skyHash(i+vec2(1,1)),f.x),f.y);}
      void main(){vec3 d=normalize(vDirection);float h=max(0.,d.y);vec3 c=mix(horizonColor,topColor,pow(h,.42));float sd=max(0.,dot(d,lightDirection));
        c+=mix(vec3(.38,.18,.05),vec3(.1,.18,.3),night)*pow(sd,18.);
        float disk=smoothstep(mix(.9994,.9997,night),1.,sd);c+=mix(vec3(1.4,1.1,.65),vec3(.7,.87,1.),night)*disk;
        vec2 starUv=vec2(atan(d.z,d.x)*.159155+.5,asin(clamp(d.y,-1.,1.))*.63662)*vec2(1000.,360.);
        vec2 cell=floor(starUv);float starSeed=skyHash(cell);float star=pow(max(0.,1.-length(fract(starUv)-.5)*2.),7.)*step(.991,starSeed)*smoothstep(.02,.3,d.y);
        c+=vec3(.55,.73,1.)*star*night*(.7+.3*sin(time*(1.+starSeed)+starSeed*63.));
        vec2 cloudUv=d.xz/max(.18,d.y+.25)*2.7+vec2(time*.006,0.);float cloud=skyNoise(cloudUv)*.65+skyNoise(cloudUv*2.3)*.35;
        float cloudAlpha=smoothstep(.53,.78,cloud)*smoothstep(.04,.4,d.y)*.32;c=mix(c,mix(vec3(.75,.7,.55),vec3(.12,.18,.25),night),cloudAlpha);
        gl_FragColor=vec4(c,1.);
        #include <encodings_fragment>
      }`});

  // The terrain height map lets foam follow the actual lake shore.
  const mapSize=256,heightData=new Uint8Array(mapSize*mapSize*4);
  for(let z=0;z<mapSize;z++)for(let x=0;x<mapSize;x++){
    const h=H((x/(mapSize-1)-.5)*W*2,(z/(mapSize-1)-.5)*W*2),i=(z*mapSize+x)*4;
    heightData[i]=clamp(Math.round((h+24)/48*255),0,255);heightData[i+3]=255;
  }
  const heightMap=new T.DataTexture(heightData,mapSize,mapSize,T.RGBAFormat);heightMap.minFilter=T.LinearFilter;heightMap.magFilter=T.LinearFilter;heightMap.needsUpdate=true;
  const reflectionTarget=new T.WebGLRenderTarget(512,512,{minFilter:T.LinearFilter,magFilter:T.LinearFilter,depthBuffer:true});
  const mirrorCamera=new T.PerspectiveCamera(),mirrorMatrix=new T.Matrix4(),bias=new T.Matrix4().set(.5,0,0,.5,0,.5,0,.5,0,0,.5,.5,0,0,0,1);
  const direction=new T.Vector3(),mirrorTarget=new T.Vector3(),clipPlane=new T.Plane(new T.Vector3(0,1,0),-WL-.025);
  const waterUniforms={time,night,heightMap:{value:heightMap},reflectionMap:{value:reflectionTarget.texture},mirrorMatrix:{value:mirrorMatrix},reflectionEnabled:{value:1},worldSize:{value:W*2},waterLevel:{value:WL},horizonColor:{value:current.horizon},lightDirection:{value:current.direction},lightColor:{value:current.sun}};
  water.material.dispose();
  water.material=new T.ShaderMaterial({transparent:true,depthWrite:false,uniforms:waterUniforms,
    vertexShader:`uniform float time;uniform mat4 mirrorMatrix;varying vec3 vWorld;varying vec4 vMirror;
      void main(){vec3 p=position;p.z+=sin(p.x*.6+time)*.025+cos(p.y*.5-time*.7)*.025;vec4 world=modelMatrix*vec4(p,1.);vWorld=world.xyz;vMirror=mirrorMatrix*world;gl_Position=projectionMatrix*viewMatrix*world;}`,
    fragmentShader:`uniform float time;uniform float night;uniform float worldSize;uniform float waterLevel;uniform float reflectionEnabled;uniform sampler2D heightMap;uniform sampler2D reflectionMap;uniform vec3 horizonColor;uniform vec3 lightDirection;uniform vec3 lightColor;varying vec3 vWorld;varying vec4 vMirror;
      void main(){vec2 p=vWorld.xz;vec2 mapUv=clamp(p/worldSize+.5,vec2(0.),vec2(1.));float floorHeight=texture2D(heightMap,mapUv).r*48.-24.;float depth=max(0.,waterLevel-floorHeight);
        vec3 viewDir=normalize(cameraPosition-vWorld);
        vec2 wave=vec2(sin(p.x*1.1+time*.8+sin(p.y*.7)),cos(p.y*1.3-time*.6+sin(p.x*.6)));
        vec2 wind=vec2(cos(dot(p,vec2(3.7,2.4))-time*2.),sin(dot(p,vec2(-1.7,4.4))+time*1.5));
        float detail=1.-smoothstep(16.,72.,length(cameraPosition-vWorld));
        vec2 slope=wave*.136+wind*.075*detail;
        vec3 waveNormal=normalize(vec3(slope.x,1.,slope.y));
        float fresnel=pow(1.-clamp(dot(waveNormal,viewDir),0.,1.),4.);
        vec3 halfDir=normalize(lightDirection+viewDir);
        float specular=pow(max(0.,dot(waveNormal,halfDir)),128.)+pow(max(0.,dot(waveNormal,halfDir)),28.)*.21;
        vec3 shallow=mix(vec3(.12,.31,.22),vec3(.035,.095,.14),night),deep=mix(vec3(.015,.13,.115),vec3(.012,.04,.075),night);vec3 c=mix(shallow,deep,smoothstep(.1,4.,depth));c=mix(c,horizonColor*.65,fresnel*.65);
        float caustic=pow(max(0.,sin(p.x*3.+wave.y)*cos(p.y*2.8+wave.x)),9.);c+=vec3(.1,.14,.065)*caustic*exp(-depth*.6)*(1.-night*.8);
        float crest=.5+.5*sin(depth*25.-time*2.+wave.x+wave.y*.5);
        float foam=(1.-smoothstep(.08,.48,depth))*smoothstep(.72,.98,crest);
        c+=mix(vec3(.27,.29,.21),vec3(.065,.09,.13),night)*foam;
        c+=lightColor*specular*mix(.8,.33,night);
        gl_FragColor=vec4(c,mix(.7,.97,smoothstep(0.,1.,depth)));
        #include <tonemapping_fragment>
        vec2 reflectionUv=vMirror.xy/max(.0001,vMirror.w);reflectionUv+=slope*.037;float edge=smoothstep(0.,.04,reflectionUv.x)*smoothstep(0.,.04,reflectionUv.y)*smoothstep(0.,.04,1.-reflectionUv.x)*smoothstep(0.,.04,1.-reflectionUv.y);
        vec3 reflected=texture2D(reflectionMap,clamp(reflectionUv,vec2(.001),vec2(.999))).rgb;gl_FragColor.rgb=mix(gl_FragColor.rgb,reflected,(.28+fresnel*.55)*reflectionEnabled*edge);
        #include <encodings_fragment>
      }`});

  const oldGrassCompile=grass.material.onBeforeCompile;
  grass.material.onBeforeCompile=shader=>{
    oldGrassCompile(shader);shader.uniforms.heroPosition=hero;
    shader.vertexShader=shader.vertexShader.replace('uniform float forestTime;','uniform float forestTime;\nuniform vec4 heroPosition;').replace('transformed.z+=cos(forestTime+root.x*.21)*position.y*.07;',`transformed.z+=cos(forestTime+root.x*.21)*position.y*.07;
      vec2 away=root.xz-heroPosition.xy;float distToHero=length(away);float bend=(1.-smoothstep(heroPosition.z*.6,heroPosition.z*1.7+.5,distToHero))*heroPosition.w;
      transformed.xz+=away/max(.1,distToHero)*position.y*bend*.8;transformed.y*=1.-bend*.55;`);
  };
  grass.material.needsUpdate=true;

  // Vary the internal gel tint in local space so the color follows the squash and stretch.
  for(const s of slimes){
    const body=s.b.children[0],gelColor=s.col.clone().convertSRGBToLinear();
    body.material.onBeforeCompile=shader=>{
      shader.uniforms.gelNight=night;shader.uniforms.gelColor={value:gelColor};shader.uniforms.gelTime=time;
      shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 vGelLocal;').replace('#include <begin_vertex>','#include <begin_vertex>\nvGelLocal=position;');
      shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nuniform float gelNight;uniform vec3 gelColor;uniform float gelTime;varying vec3 vGelLocal;').replace('#include <color_fragment>',`#include <color_fragment>
        float layer=smoothstep(-.7,.72,vGelLocal.y+.095*sin(vGelLocal.x*7.+vGelLocal.z*4.-gelTime*.85));
        diffuseColor.rgb*=mix(vec3(.36,.68,.78),vec3(1.03,1.,.92),layer);`).replace('#include <emissivemap_fragment>',`#include <emissivemap_fragment>
        float gelRim=pow(1.-abs(dot(normalize(vNormal),normalize(vViewPosition))),3.);
        totalEmissiveRadiance+=mix(gelColor,vec3(.25,.56,.46),.20)*gelRim*(.16+gelNight*.38);`);
    };body.material.needsUpdate=true;
  }
  const fleckGeo=new T.BufferGeometry(),fleckPositions=[];
  for(let i=0;i<48;i++){const y=rnd()*2-1,a=rnd()*Math.PI*2,r=Math.sqrt(1-y*y)*1.004;fleckPositions.push(Math.cos(a)*r,y*1.004,Math.sin(a)*r)}
  fleckGeo.setAttribute('position',new T.Float32BufferAttribute(fleckPositions,3));
  const flecks=new T.Points(fleckGeo,new T.PointsMaterial({color:0xeaffcf,size:.025,transparent:true,opacity:.24,depthWrite:false,blending:T.AdditiveBlending}));player.b.add(flecks);
  const playerLight=new T.PointLight(0xb4fca5,0,10,2);scene.add(playerLight);

  // Fireflies and low mist are localized to the current forest clearing.
  const fireCount=100,firePositions=new Float32Array(fireCount*3),fireSeeds=[];
  for(let i=0;i<fireCount;i++)fireSeeds.push({x:(rnd()-.5)*95,z:(rnd()-.5)*95,y:.4+rnd()*4,phase:rnd()*6.283,speed:.15+rnd()*.3});
  const fireGeo=new T.BufferGeometry();fireGeo.setAttribute('position',new T.BufferAttribute(firePositions,3));
  const fireMaterial=new T.ShaderMaterial({transparent:true,depthWrite:false,blending:T.AdditiveBlending,uniforms:{time,night},
    vertexShader:`uniform float time;uniform float night;varying float vBlink;void main(){vec4 p=modelViewMatrix*vec4(position,1.);vBlink=.35+.65*pow(.5+.5*sin(time*1.8+position.x*.7+position.z),3.);gl_PointSize=clamp(85./max(1.,-p.z),1.5,9.);gl_Position=projectionMatrix*p;}`,
    fragmentShader:`uniform float night;varying float vBlink;void main(){float d=length(gl_PointCoord-.5)*2.;if(d>1.)discard;float a=exp(-d*d*5.)*vBlink*(.08+night*.9);gl_FragColor=vec4(mix(vec3(.9,.67,.22),vec3(.85,1.,.32),night),a);}`});
  const fireflies=new T.Points(fireGeo,fireMaterial);fireflies.frustumCulled=false;scene.add(fireflies);
  const mist=[];
  for(let i=0;i<12;i++){const a=rnd()*6.283,d=28+rnd()*95,sprite=new T.Sprite(new T.SpriteMaterial({map:ct,color:current.fog,transparent:true,opacity:.06,depthWrite:false}));sprite.scale.set(23+rnd()*20,3+rnd()*3,1);scene.add(sprite);mist.push({sprite,x:Math.cos(a)*d,z:Math.sin(a)*d,phase:a})}

  // A reusable ring pool avoids allocation when landing or levelling up.
  const rings=[],ringGeometry=new T.RingGeometry(.91,1,64);
  for(let i=0;i<8;i++){const mesh=new T.Mesh(ringGeometry,new T.MeshBasicMaterial({color:0xdcffae,transparent:true,opacity:0,side:T.DoubleSide,depthWrite:false,blending:T.AdditiveBlending}));mesh.rotation.x=-Math.PI/2;mesh.visible=false;scene.add(mesh);rings.push({mesh,age:10,duration:.8,radius:1})}
  let ringCursor=0;
  function ripple(strong=false){const ring=rings[ringCursor++%rings.length];ring.age=0;ring.duration=strong?1.3:.75;ring.radius=player.r;ring.mesh.position.set(player.x,H(player.x,player.z)+.12,player.z);ring.mesh.material.color.set(strong?0xffdf8f:0xcfffb6);ring.mesh.visible=true;}
  const trailCount=34,trailPositions=new Float32Array(trailCount*2*3),trailColors=new Float32Array(trailCount*2*3),trailIndices=[],history=[];
  for(let i=0;i<trailCount;i++){history.push(new T.Vector3());if(i<trailCount-1)trailIndices.push(i*2,i*2+1,i*2+2,i*2+1,i*2+3,i*2+2)}
  const trailGeo=new T.BufferGeometry();trailGeo.setAttribute('position',new T.BufferAttribute(trailPositions,3).setUsage(T.DynamicDrawUsage));trailGeo.setAttribute('color',new T.BufferAttribute(trailColors,3));trailGeo.setIndex(trailIndices);
  for(let i=0;i<trailCount;i++)for(let side=0;side<2;side++){const f=Math.pow(1-i/(trailCount-1),1.5);trailColors.set([.5*f,.85*f,.28*f],(i*2+side)*3)}
  const trail=new T.Mesh(trailGeo,new T.MeshBasicMaterial({vertexColors:true,side:T.DoubleSide,transparent:true,opacity:.5,depthWrite:false,blending:T.AdditiveBlending}));trail.frustumCulled=false;scene.add(trail);
  let trailFade=0;const sideVector=new T.Vector3(),viewVector=new T.Vector3(),tangent=new T.Vector3();
  const size=new T.Vector2();
  function resetEffects(){for(const r of rings){r.age=10;r.mesh.visible=false}history.forEach(p=>p.copy(player.g.position));trailFade=0;trail.visible=false;previousJump=0;previousLevel=0;trailTimer=0;}
  function resizeReflection(){renderer.getDrawingBufferSize(size);const factor=quality==='ULTRA'?.75:.45,max=quality==='ULTRA'?1400:900,scale=Math.min(factor,max/Math.max(size.x,size.y));reflectionTarget.setSize(Math.max(1,Math.floor(size.x*scale)),Math.max(1,Math.floor(size.y*scale)));}
  return {
    get night(){return current.night},
    get mode(){return mode},
    get stats(){return {reflections,reflectionFrames,activeRings:rings.filter(r=>r.mesh.visible).length,trailVisible:trail.visible,night:current.night}},
    setMode(value){if(value!=='VIVO'&&!prepared[value])return;mode=value;cycleClock=0;if(prepared[value])target=prepared[value];const label=value==='VIVO'?'El ritmo del bosque':presets[value].label;document.getElementById('ambiencepill').textContent=label.toUpperCase();const location=document.querySelector('#location div');if(location&&location.firstChild)location.firstChild.nodeValue=label.toUpperCase();},
    setQuality(value){quality=value;reflections=value==='ALTA'||value==='ULTRA';waterUniforms.reflectionEnabled.value=reflections?1:0;fireGeo.setDrawRange(0,value==='BAJA'?35:fireCount);mist.forEach((m,i)=>m.sprite.visible=i<(value==='BAJA'?3:12));resizeReflection();},
    resize:resizeReflection,
    update(dt,gameTime,state,round,level){
      const simDt=state==='pause'?0:dt;clock+=simDt;cycleClock+=simDt;time.value=clock;
      if(round!==previousRound){previousRound=round;resetEffects();}
      if(mode==='VIVO'){
        const phase=(cycleClock%360)/120,index=Math.floor(phase),keys=['ALBA','DORADO','NOCHE','ALBA'],a=prepared[keys[index]],b=prepared[keys[index+1]],f=phase-index;
        for(const key of ['top','horizon','fog','sun','ambient','ground','direction'])cycleTarget[key].copy(a[key]).lerp(b[key],f);for(const key of ['power','hemi','exposure','night'])cycleTarget[key]=lerp(a[key],b[key],f);cycleTarget.direction.normalize();target=cycleTarget;
      }
      const ease=1-Math.exp(-dt*2.8);
      for(const key of ['top','horizon','fog','sun','ambient','ground','direction'])current[key].lerp(target[key],ease);
      for(const key of ['power','hemi','exposure','night'])current[key]=lerp(current[key],target[key],ease);
      night.value=current.night;scene.fog.color.copy(current.fog);sun.color.copy(current.sun);sun.intensity=current.power;renderer.toneMappingExposure=current.exposure;
      sun.position.copy(player.g.position).addScaledVector(current.direction,140+player.r*12);sun.target.position.set(player.x,H(player.x,player.z),player.z);
      if(hemi){hemi.color.copy(current.ambient);hemi.groundColor.copy(current.ground);hemi.intensity=current.hemi}if(fill)fill.intensity=.2+current.night*.12;
      for(const [material,base]of originalMaterialIntensities){material.envMapIntensity=base.env*(1-current.night*.65);if(base.emissive>0)material.emissiveIntensity=base.emissive+current.night*.13;}
      hero.value.set(player.x,player.z,player.r,player.dead?0:Math.max(.25,1-(player.jy||0)*.2));
      playerLight.position.copy(player.g.position);playerLight.intensity=current.night*(quality==='BAJA'?0:1.8);playerLight.distance=6+player.r*4;
      const blinkPhase=clock%4.8,blink=blinkPhase>4.55?Math.max(.04,Math.abs(blinkPhase-4.675)/.125):1;
      for(const eye of player.eyes)eye.scale.y=eye.scale.x*blink;
      const scared=state==='play'&&slimes.some(s=>s!==player&&!s.dead&&s.r>player.r*1.18&&Math.hypot(s.x-player.x,s.z-player.z)<12+player.r*2);
      if(scared){player.mo.scale.set(.7,1.8,.7);player.mo.rotation.z=0}else player.mo.rotation.z=Math.PI;
      for(let i=0;i<fireCount;i++){const f=fireSeeds[i],x=Math.floor(player.x/40)*40+f.x+Math.sin(clock*f.speed+f.phase)*3,z=Math.floor(player.z/40)*40+f.z+Math.cos(clock*f.speed+f.phase)*3;firePositions.set([x,H(x,z)+f.y+Math.sin(clock+f.phase)*.3,z],i*3)}fireGeo.attributes.position.needsUpdate=true;
      mist.forEach(m=>{const x=player.x+m.x+Math.sin(clock*.04+m.phase)*7,z=player.z+m.z;m.sprite.position.set(x,H(x,z)+2,z);m.sprite.material.color.copy(current.fog);m.sprite.material.opacity=.028+current.night*.04});
      if(state==='play'&&!player.dead){
        if(previousJump>0&&player.jy===0){ripple();emit(new T.Vector3(player.x,H(player.x,player.z)+.1,player.z),new T.Color(.65,.8,.42),12,player.r*2.5,1,.55)}
        if(level>previousLevel)ripple(true);previousLevel=level;previousJump=player.jy;
      }
      for(const ring of rings){ring.age+=simDt;const f=ring.age/ring.duration;ring.mesh.visible=f<1;if(f<1){ring.mesh.scale.setScalar(ring.radius*(1+f*2.4));ring.mesh.material.opacity=(1-f)*(1-f)*.65}}
      const boosting=state==='play'&&!player.dead&&player.boosting;trailFade=clamp(trailFade+(boosting?simDt*5:-simDt*2.5),0,1);trail.visible=trailFade>.01;
      if(state!=='pause'){
        trailTimer+=simDt;
        if(trailTimer>=1/45){trailTimer=0;for(let i=history.length-1;i>0;i--)history[i].copy(history[i-1]);history[0].copy(player.g.position).add(new T.Vector3(0,-player.r*.2,0));}
        for(let i=0;i<trailCount;i++){const point=history[i],next=history[Math.max(0,i-1)];tangent.subVectors(point,next);if(tangent.lengthSq()<.00001)tangent.set(0,0,1);viewVector.subVectors(camera.position,point);sideVector.crossVectors(tangent,viewVector).normalize().multiplyScalar(player.r*.3*(1-i/trailCount)*trailFade);trailPositions.set([point.x-sideVector.x,point.y-sideVector.y,point.z-sideVector.z,point.x+sideVector.x,point.y+sideVector.y,point.z+sideVector.z],i*6)}trailGeo.attributes.position.needsUpdate=true;
      }
      trail.material.opacity=trailFade*.48;
    },
    renderReflection(){
      if(!reflections||camera.position.y<water.position.y+.1||(quality==='ALTA'&&reflectionTick++%2))return;
      camera.updateMatrixWorld();mirrorCamera.copy(camera,false);mirrorCamera.position.copy(camera.position);mirrorCamera.position.y=2*water.position.y-camera.position.y;camera.getWorldDirection(direction);direction.y=-direction.y;mirrorTarget.copy(mirrorCamera.position).add(direction);mirrorCamera.up.set(0,-1,0);mirrorCamera.lookAt(mirrorTarget);mirrorCamera.updateMatrixWorld();mirrorCamera.matrixWorldInverse.copy(mirrorCamera.matrixWorld).invert();mirrorMatrix.copy(bias).multiply(mirrorCamera.projectionMatrix).multiply(mirrorCamera.matrixWorldInverse);
      const renderTarget=renderer.getRenderTarget(),encoding=renderer.outputEncoding,clipping=renderer.clippingPlanes,shadowUpdate=renderer.shadowMap.autoUpdate,skyPosition=sky.position.clone();
      try{water.visible=false;sky.position.copy(mirrorCamera.position);renderer.clippingPlanes=[clipPlane];renderer.shadowMap.autoUpdate=false;renderer.outputEncoding=T.LinearEncoding;renderer.setRenderTarget(reflectionTarget);renderer.render(scene,mirrorCamera);reflectionFrames++;}
      finally{water.visible=true;sky.position.copy(skyPosition);renderer.clippingPlanes=clipping;renderer.shadowMap.autoUpdate=shadowUpdate;renderer.outputEncoding=encoding;renderer.setRenderTarget(renderTarget);}
    }
  };
}
