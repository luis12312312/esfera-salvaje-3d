/* Procedural art and postprocessing. No textures, models or network required. */
function createForestGraphics({THREE:T,scene,renderer,camera,sun,terrain,water,grass,sky,clouds,W,H,WL,rnd,items,player}) {
  const uniforms={time:{value:0}}, animated=[], contacts=[];
  const range=(a,b)=>a+rnd()*(b-a);
  const quality={bloom:true,density:1};
  scene.fog.color.set(0xb8c9ab);
  sun.color.set(0xffdf9d);sun.intensity=1.65;
  sun.shadow.normalBias=.025;sun.shadow.radius=3;
  scene.children.filter(o=>o.isHemisphereLight).forEach(l=>{l.color.set(0xc6e3db);l.groundColor.set(0x3d5631);l.intensity=.55});
  const fill=new T.DirectionalLight(0xc9eadf,.25);fill.position.set(-50,35,-60);scene.add(fill);
  renderer.toneMappingExposure=.96;

  // A painted HDR-like studio sky supplies actual reflections on the gelatin.
  const ec=document.createElement('canvas');ec.width=512;ec.height=256;
  const ex=ec.getContext('2d'),gradient=ex.createLinearGradient(0,0,0,256);
  gradient.addColorStop(0,'#79a9b8');gradient.addColorStop(.45,'#d8e4c5');gradient.addColorStop(.53,'#f9e7b4');gradient.addColorStop(.64,'#5a7450');gradient.addColorStop(1,'#213e2d');
  ex.fillStyle=gradient;ex.fillRect(0,0,512,256);
  const glow=ex.createRadialGradient(360,90,0,360,90,65);glow.addColorStop(0,'rgba(255,250,220,1)');glow.addColorStop(.12,'rgba(255,248,219,.95)');glow.addColorStop(1,'rgba(255,248,219,0)');ex.fillStyle=glow;ex.fillRect(280,10,160,160);
  ex.fillStyle='rgba(255,255,240,.8)';ex.fillRect(130,36,85,12);
  const envTexture=new T.CanvasTexture(ec);envTexture.mapping=T.EquirectangularReflectionMapping;envTexture.encoding=T.sRGBEncoding;
  const generator=new T.PMREMGenerator(renderer),environment=generator.fromEquirectangular(envTexture);
  scene.environment=environment.texture;envTexture.dispose();generator.dispose();

  sky.material=new T.ShaderMaterial({side:T.BackSide,depthWrite:false,toneMapped:false,
    vertexShader:'varying vec3 vDirection;void main(){vDirection=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader:`varying vec3 vDirection;void main(){vec3 d=normalize(vDirection);float h=max(0.,d.y);vec3 c=mix(vec3(.76,.82,.66),vec3(.22,.48,.57),pow(h,.45));vec3 sd=normalize(vec3(.5,.42,-.7));float s=max(0.,dot(d,sd));c+=vec3(1.,.74,.35)*(pow(s,12.)*.2+pow(s,300.)*.75);gl_FragColor=vec4(c,1.);}`});
  clouds.forEach(c=>{c.material.opacity=.27;c.material.color.set(0xfff7db)});

  // World-space ground detail remains crisp both at grass and giant scale.
  terrain.material.onBeforeCompile=shader=>{
    shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 vGround;').replace('#include <begin_vertex>','#include <begin_vertex>\nvGround=position;');
    shader.fragmentShader=shader.fragmentShader.replace('#include <common>',`#include <common>
      varying vec3 vGround;
      float hashGround(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
      float groundNoise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hashGround(i),hashGround(i+vec2(1,0)),f.x),mix(hashGround(i+vec2(0,1)),hashGround(i+vec2(1,1)),f.x),f.y);}`)
      .replace('#include <color_fragment>',`#include <color_fragment>
      float groundPatch=groundNoise(vGround.xz*.17);
      float fine=groundNoise(vGround.xz*5.);
      float scatter=groundNoise(vGround.xz*1.4);
      float grit=groundNoise(vGround.xz*14.);
      diffuseColor.rgb*=mix(vec3(.66,.81,.54),vec3(1.24,1.13,.85),groundPatch)*(.80+fine*.26+scatter*.18);
      float pathOffset=abs(vGround.z-30.*sin(vGround.x*.02))+(scatter-.5)*1.7;
      float path=1.-smoothstep(1.2,4.4,pathOffset);
      vec3 dust=mix(vec3(.115,.077,.033),vec3(.31,.235,.117),.33*scatter+.67*grit);
      diffuseColor.rgb=mix(diffuseColor.rgb,dust,path*.72);`);
  };

  // Curved grass blades, lit on both sides, with wind based on world position.
  const blade=new T.BufferGeometry(),blades=[],bladeIndices=[];
  for(let i=0;i<3;i++){
    const angle=i*2.094,vertices=[[-.055,0,0],[.055,0,0],[-.035,.36,.04],[.035,.36,.04],[.04,.7+i*.055,.12]];
    for(const [x,y,z]of vertices)blades.push(x*Math.cos(angle)+z*Math.sin(angle),y,-x*Math.sin(angle)+z*Math.cos(angle));
    bladeIndices.push(...[0,1,2,2,1,3,2,3,4].map(n=>n+i*5));
  }
  blade.setAttribute('position',new T.Float32BufferAttribute(blades,3));
  blade.setIndex(bladeIndices);blade.computeVertexNormals();grass.geometry.dispose();grass.geometry=blade;
  grass.material.side=T.DoubleSide;grass.material.roughness=.9;
  grass.material.onBeforeCompile=shader=>{
    shader.uniforms.forestTime=uniforms.time;
    shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nuniform float forestTime;').replace('#include <begin_vertex>',`#include <begin_vertex>
      vec3 root=(instanceMatrix*vec4(position,1.)).xyz;
      transformed.x+=sin(forestTime*1.6+root.x*.4+root.z*.26)*position.y*position.y*.18;
      transformed.z+=cos(forestTime+root.x*.21)*position.y*.07;`);
  };

  // Ripples, shore foam and reflected sky, all animated on the GPU.
  water.geometry.dispose();water.geometry=new T.PlaneGeometry(W*2.4,W*2.4,110,110);
  water.material.dispose();
  water.material=new T.ShaderMaterial({transparent:true,depthWrite:false,uniforms:{time:uniforms.time},
    vertexShader:`uniform float time;varying vec3 vWorld;void main(){vec3 p=position;p.z+=sin(p.x*.45+time*.9)*.045+cos(p.y*.55+time*.6)*.035;vec4 world=modelMatrix*vec4(p,1.);vWorld=world.xyz;gl_Position=projectionMatrix*viewMatrix*world;}`,
    fragmentShader:`uniform float time;varying vec3 vWorld;
      void main(){vec2 p=vWorld.xz;float wave=sin(p.x*1.7+sin(p.y*1.2+time)*1.6+time*1.3)*cos(p.y*1.5-time*.8);float line=pow(max(0.,wave),12.);vec3 view=normalize(cameraPosition-vWorld);float fresnel=pow(1.-max(0.,view.y),3.);vec3 c=mix(vec3(.045,.27,.23),vec3(.48,.69,.55),fresnel);c+=vec3(.45,.62,.35)*line*.35;float sparkle=pow(max(0.,sin(p.x*5.+time)*cos(p.y*4.-time*.7)),30.);c+=vec3(1.,.86,.55)*sparkle*.32;gl_FragColor=vec4(c,.88);
      #include <tonemapping_fragment>
      #include <encodings_fragment>
      }`});

  // Distant ridgelines give the world a horizon instead of an exposed plane.
  const positions=[],colors=[],indices=[],c=new T.Color(),rings=12,segments=144;
  for(let r=0;r<=rings;r++)for(let i=0;i<=segments;i++){
    const angle=i/segments*Math.PI*2,d=W+8+r*21;
    const peak=23+Math.sin(angle*5.2)*15+Math.sin(angle*11.7)*12;
    const height=-4+Math.sin(r/rings*Math.PI*.87)*peak+Math.sin(angle*22+r*.5)*r*.45;
    positions.push(Math.cos(angle)*d,height,Math.sin(angle)*d);
    c.setHSL(.29+Math.sin(angle*3)*.025,.16,.28+height*.003+r*.004);colors.push(c.r,c.g,c.b);
    if(r<rings&&i<segments){const a=r*(segments+1)+i,b=a+segments+1;indices.push(a,b,a+1,b,b+1,a+1)}
  }
  const ridgeGeometry=new T.BufferGeometry();ridgeGeometry.setAttribute('position',new T.Float32BufferAttribute(positions,3));ridgeGeometry.setAttribute('color',new T.Float32BufferAttribute(colors,3));ridgeGeometry.setIndex(indices);ridgeGeometry.computeVertexNormals();
  const ridge=new T.Mesh(ridgeGeometry,new T.MeshStandardMaterial({vertexColors:true,roughness:1,flatShading:true}));scene.add(ridge);

  // Low vegetation in the starting grove makes the first meter feel alive.
  const petals=new T.IcosahedronGeometry(.13,0),flowerGeometry=new T.BufferGeometry();
  const flowerPositions=[],flowerColors=[];
  for(let i=0;i<620;i++){
    const a=range(0,Math.PI*2),d=range(3,62),x=Math.cos(a)*d,z=Math.sin(a)*d,h=H(x,z);
    if(h<WL+.8||Math.abs(z-30*Math.sin(x*.02))<2)continue;
    const color=new T.Color([0xf3dda0,0xeac5c5,0xc9c2ec,0xf4eac7][i%4]),size=range(.6,1.3);
    for(let k=0;k<5;k++){
      const aa=k*Math.PI*.4,m=new T.Matrix4().compose(new T.Vector3(x+Math.cos(aa)*.12,h+range(.3,.5),z+Math.sin(aa)*.12),new T.Quaternion(),new T.Vector3(size,.5*size,size));
      const g=petals.clone().applyMatrix4(m);flowerPositions.push(...g.attributes.position.array);
      for(let j=0;j<g.attributes.position.count;j++)flowerColors.push(color.r,color.g,color.b);g.dispose();
    }
  }
  flowerGeometry.setAttribute('position',new T.Float32BufferAttribute(flowerPositions,3));flowerGeometry.setAttribute('color',new T.Float32BufferAttribute(flowerColors,3));flowerGeometry.computeVertexNormals();
  const meadow=new T.Mesh(flowerGeometry,new T.MeshStandardMaterial({vertexColors:true,roughness:.8,side:T.DoubleSide}));scene.add(meadow);petals.dispose();

  // Broad fern fronds add a second vegetation silhouette at the forest floor.
  const fernGeo=new T.BufferGeometry(),fp=[],fc=[];
  for(let n=0;n<190;n++){
    const a=range(0,6.283),d=range(5,120),x=Math.cos(a)*d,z=Math.sin(a)*d,y=H(x,z);if(y<WL+1)continue;
    const scale=range(.45,1.15);
    for(let j=0;j<7;j++)for(let k=1;k<6;k++){
      const angle=j*.897+n,t=k/6,center=new T.Vector3(x+Math.cos(angle)*t*scale,y+Math.sin(t*Math.PI*.7)*scale*.8,z+Math.sin(angle)*t*scale),width=(1-t)*scale*.29;
      for(const sign of [-1,1]){const leaf=center.clone().add(new T.Vector3(Math.cos(angle+sign*1.15)*width,0,Math.sin(angle+sign*1.15)*width));fp.push(center.x,center.y,center.z,leaf.x,leaf.y,leaf.z,center.x+Math.cos(angle)*.16*scale,center.y+.07*scale,center.z+Math.sin(angle)*.16*scale);for(let q=0;q<3;q++)fc.push(.11+t*.09,.25+t*.18,.075+t*.04)}
    }
  }
  fernGeo.setAttribute('position',new T.Float32BufferAttribute(fp,3));fernGeo.setAttribute('color',new T.Float32BufferAttribute(fc,3));fernGeo.computeVertexNormals();const ferns=new T.Mesh(fernGeo,new T.MeshStandardMaterial({vertexColors:true,side:T.DoubleSide,roughness:.9}));scene.add(ferns);

  const pebble=new T.InstancedMesh(new T.IcosahedronGeometry(1,0),new T.MeshStandardMaterial({color:0x777b5e,roughness:1}),600),pebbleMatrix=new T.Matrix4();
  for(let i=0;i<600;i++){const a=range(0,6.283),d=range(2,70),x=Math.cos(a)*d,z=Math.sin(a)*d,s=range(.035,.12);pebbleMatrix.compose(new T.Vector3(x,H(x,z)+s*.2,z),new T.Quaternion().setFromEuler(new T.Euler(0,a,0)),new T.Vector3(s,s*.5,s*.8));pebble.setMatrixAt(i,pebbleMatrix)}scene.add(pebble);

  // Very soft shafts of sunlight between the canopy and the clearing.
  const beams=[];
  const beamMaterial=new T.ShaderMaterial({transparent:true,depthWrite:false,side:T.DoubleSide,blending:T.AdditiveBlending,toneMapped:false,uniforms:{time:uniforms.time,nightAmount:{value:0}},
    vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader:'varying vec2 vUv;uniform float time;uniform float nightAmount;void main(){float a=pow(sin(vUv.x*3.14159),3.)*sin(vUv.y*3.14159)*.035;a*=(.87+sin(time*.45+vUv.y*5.)*.13)*(1.-nightAmount);gl_FragColor=vec4(1.,.9,.6,a);}'});
  for(let i=0;i<4;i++){const beam=new T.Mesh(new T.PlaneGeometry(2.4+i,32),beamMaterial);beam.position.set(9+i*6,13,-9-i*7);beam.rotation.z=-.48;scene.add(beam);beams.push(beam)}

  // Soft contact shadows ground the characters even at the lowest quality.
  const shadowCanvas=document.createElement('canvas');shadowCanvas.width=shadowCanvas.height=64;
  const sx=shadowCanvas.getContext('2d'),sg=sx.createRadialGradient(32,32,1,32,32,32);sg.addColorStop(0,'rgba(8,24,15,.6)');sg.addColorStop(.4,'rgba(8,24,15,.35)');sg.addColorStop(1,'rgba(8,24,15,0)');sx.fillStyle=sg;sx.fillRect(0,0,64,64);
  const shadowTexture=new T.CanvasTexture(shadowCanvas),shadowGeo=new T.PlaneGeometry(1,1);shadowGeo.rotateX(-Math.PI/2);
  function addContact(slime){
    const shadow=new T.Mesh(shadowGeo,new T.MeshBasicMaterial({map:shadowTexture,transparent:true,depthWrite:false,opacity:.8,polygonOffset:true,polygonOffsetFactor:-2}));scene.add(shadow);contacts.push({slime,shadow});
    const body=slime.b.children[0];body.material.emissiveIntensity=.045;body.material.envMapIntensity=1.1;body.material.roughness=.19;body.material.metalness=.03;body.material.clearcoat=1;body.material.clearcoatRoughness=.1;
    // Specular flecks have volume, so they move with the bouncing body.
    const glint=new T.Mesh(new T.SphereGeometry(.18,16,12),new T.MeshBasicMaterial({color:0xf3ffe1,transparent:true,opacity:.5}));glint.position.set(-.4,.62,.61);glint.scale.set(.65,1,.15);glint.rotation.z=-.45;slime.b.add(glint);
  }
  const halo=new T.Mesh(new T.RingGeometry(.93,1.015,80),new T.MeshBasicMaterial({color:0xd9f9a2,transparent:true,opacity:.48,side:T.DoubleSide,depthWrite:false}));halo.rotation.x=-Math.PI/2;scene.add(halo);

  // Butterfly wings are geometry, not flat particles, and react to the breeze.
  const wingGeometry=new T.CircleGeometry(.14,8);wingGeometry.translate(.11,0,0);
  for(let i=0;i<14;i++){
    const group=new T.Group(),mat=new T.MeshStandardMaterial({color:[0xf9df99,0xd4bdf3,0xc4dfd0][i%3],side:T.DoubleSide,emissive:0x61502d,emissiveIntensity:.12});
    const left=new T.Mesh(wingGeometry,mat),right=new T.Mesh(wingGeometry,mat);right.rotation.y=Math.PI;group.add(left,right);group.scale.setScalar(range(.8,1.4));scene.add(group);animated.push({group,left,right,phase:range(0,6.283),radius:range(3,22),height:range(.6,3)});
  }

  // Quarter-resolution bloom plus filmic color, vignette, and subtle film grain.
  const target=new T.WebGLRenderTarget(1,1,{minFilter:T.LinearFilter,magFilter:T.LinearFilter,depthBuffer:true});
  const bloomTarget=new T.WebGLRenderTarget(1,1,{minFilter:T.LinearFilter,magFilter:T.LinearFilter,depthBuffer:false});
  const screenScene=new T.Scene(),screenCamera=new T.OrthographicCamera(-1,1,1,-1,0,1);
  const screen=new T.Mesh(new T.PlaneGeometry(2,2),null);screenScene.add(screen);
  const vertex='varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}';
  const bright=new T.ShaderMaterial({depthTest:false,depthWrite:false,toneMapped:false,uniforms:{source:{value:target.texture},pixel:{value:new T.Vector2()}},vertexShader:vertex,
    fragmentShader:`varying vec2 vUv;uniform sampler2D source;uniform vec2 pixel;vec3 bright(vec2 uv){vec3 c=texture2D(source,uv).rgb;float l=max(c.r,max(c.g,c.b));return c*smoothstep(.65,1.05,l);}void main(){vec3 c=bright(vUv)*.227027;for(int i=1;i<5;i++){float f=float(i);float w=exp(-f*f/8.)*.19;c+=(bright(vUv+vec2(pixel.x*f*2.,0.))+bright(vUv-vec2(pixel.x*f*2.,0.)))*w;}gl_FragColor=vec4(c,1.);}`});
  const composite=new T.ShaderMaterial({depthTest:false,depthWrite:false,toneMapped:false,uniforms:{source:{value:target.texture},bloom:{value:bloomTarget.texture},pixel:{value:new T.Vector2()},scenePixel:{value:new T.Vector2()},amount:{value:.2},time:uniforms.time},vertexShader:vertex,
    fragmentShader:`varying vec2 vUv;uniform sampler2D source;uniform sampler2D bloom;uniform vec2 pixel;uniform vec2 scenePixel;uniform float amount;uniform float time;
      vec3 antialias(vec2 uv){
        vec3 nw=texture2D(source,uv+vec2(-1.,-1.)*scenePixel).rgb,ne=texture2D(source,uv+vec2(1.,-1.)*scenePixel).rgb,sw=texture2D(source,uv+vec2(-1.,1.)*scenePixel).rgb,se=texture2D(source,uv+vec2(1.,1.)*scenePixel).rgb,mid=texture2D(source,uv).rgb;
        vec3 lum=vec3(.299,.587,.114);float a=dot(nw,lum),b=dot(ne,lum),c=dot(sw,lum),d=dot(se,lum),m=dot(mid,lum);vec2 dir=vec2(-((a+b)-(c+d)),(a+c)-(b+d));float reduce=max((a+b+c+d)*.03125,.0078125);dir=clamp(dir/(min(abs(dir.x),abs(dir.y))+reduce),vec2(-8.),vec2(8.))*scenePixel;
        vec3 ca=.5*(texture2D(source,uv+dir*(-.166667)).rgb+texture2D(source,uv+dir*.166667).rgb);vec3 cb=ca*.5+.25*(texture2D(source,uv-dir*.5).rgb+texture2D(source,uv+dir*.5).rgb);float l=dot(cb,lum);return l<min(m,min(min(a,b),min(c,d)))||l>max(m,max(max(a,b),max(c,d)))?ca:cb;
      }
      void main(){vec3 c=antialias(vUv);vec3 b=texture2D(bloom,vUv).rgb*.227027;for(int i=1;i<5;i++){float f=float(i);float w=exp(-f*f/8.)*.19;b+=(texture2D(bloom,vUv+vec2(0.,pixel.y*f*2.)).rgb+texture2D(bloom,vUv-vec2(0.,pixel.y*f*2.)).rgb)*w;}c+=b*amount;c=mix(vec3(dot(c,vec3(.2126,.7152,.0722))),c,1.065);vec2 uv=vUv*(1.-vUv.yx);float vignette=pow(clamp(uv.x*uv.y*18.,0.,1.),.16);c*=mix(.8,1.,vignette);c=pow(max(c,vec3(0.)),vec3(1./2.2));float grain=fract(sin(dot(vUv+fract(time),vec2(12.9898,78.233)))*43758.5453)-.5;c+=grain*.008;gl_FragColor=vec4(c,1.);}`});
  // Artist-authored colors are sRGB; Three r128 expects linear material input.
  const colorGeometries=new Set(),colorMaterials=new Set(),linearColor=new T.Color();
  scene.traverse(object=>{
    if(object.geometry&&!colorGeometries.has(object.geometry)){
      colorGeometries.add(object.geometry);const attr=object.geometry.getAttribute('color');
      if(attr){for(let i=0;i<attr.count;i++){linearColor.setRGB(attr.getX(i),attr.getY(i),attr.getZ(i)).convertSRGBToLinear();attr.setXYZ(i,linearColor.r,linearColor.g,linearColor.b)}attr.needsUpdate=true}
    }
    const mat=object.material;
    if(mat&&mat.isMeshStandardMaterial&&!colorMaterials.has(mat)){colorMaterials.add(mat);mat.color.convertSRGBToLinear();mat.envMapIntensity=object===terrain?.3:.4;}
  });
  if(grass.instanceColor){for(let i=0;i<grass.instanceColor.count;i++){grass.getColorAt(i,linearColor);linearColor.convertSRGBToLinear();grass.setColorAt(i,linearColor)}grass.instanceColor.needsUpdate=true}
  let size=new T.Vector2();
  return {
    addContact,
    setNight(value){beamMaterial.uniforms.nightAmount.value=value;for(const cloud of clouds)cloud.material.opacity=.27*(1-value*.75);},
    setQuality(name){quality.bloom=name!=='BAJA';quality.density=['BAJA','MEDIA','ALTA','ULTRA'].indexOf(name);composite.uniforms.amount.value=name==='ULTRA'?.3:.21;meadow.visible=true;ferns.visible=name!=='BAJA';beams.forEach(b=>b.visible=name==='ALTA'||name==='ULTRA');animated.forEach((o,i)=>o.group.visible=i<(name==='BAJA'?4:14));this.resize();},
    resize(){renderer.getDrawingBufferSize(size);target.setSize(size.x,size.y);bloomTarget.setSize(Math.max(1,Math.floor(size.x/4)),Math.max(1,Math.floor(size.y/4)));bright.uniforms.pixel.value.set(4/size.x,4/size.y);composite.uniforms.pixel.value.copy(bright.uniforms.pixel.value);composite.uniforms.scenePixel.value.set(1/size.x,1/size.y);},
    update(dt,time,state){
      uniforms.time.value=time;
      const menu=state==='menu'||state==='options';
      for(const it of items)if(it.state===0){
        const closeToCamera=it.m.position.distanceTo(camera.position)<Math.max(.6,it.r*1.5);
        const blockedMenuForeground=menu&&Math.hypot(it.x,it.z)<(it.type==='ball'?43:14);
        it.m.visible=!closeToCamera&&!blockedMenuForeground;
      }
      contacts.forEach(({slime:s,shadow})=>{const r=s===player&&menu?(innerWidth>800?1.3:1):s.r;if(s!==player&&!s.dead)s.g.visible=!(menu&&Math.hypot(s.x,s.z)<42+s.r*3);shadow.visible=!s.dead&&s.g.visible;shadow.position.set(s.x,H(s.x,s.z)+.075,s.z);shadow.scale.setScalar(r*3.2);shadow.material.opacity=.85-Math.min(.45,(s.jy||0)*.15)});
      halo.visible=!player.dead&&state==='play';halo.position.set(player.x,H(player.x,player.z)+.085,player.z);halo.scale.setScalar(player.r*1.22);halo.material.opacity=.3+Math.sin(time*2)*.08;
      animated.forEach((o,i)=>{if(!o.group.visible)return;const a=time*.12+o.phase,x=player.x+Math.sin(a)*o.radius,z=player.z+Math.cos(a*.9)*o.radius;const y=H(x,z)+o.height+Math.sin(time*1.3+i)*.5;o.group.position.set(x,y,z);o.group.rotation.y=-a;o.left.rotation.y=Math.sin(time*11+i)*.65;o.right.rotation.y=Math.PI-Math.sin(time*11+i)*.65;});
    },
    render(){
      if(!quality.bloom){renderer.render(scene,camera);return;}
      const encoding=renderer.outputEncoding;renderer.outputEncoding=T.LinearEncoding;
      renderer.setRenderTarget(target);renderer.render(scene,camera);
      screen.material=bright;renderer.setRenderTarget(bloomTarget);renderer.render(screenScene,screenCamera);
      screen.material=composite;renderer.setRenderTarget(null);renderer.render(screenScene,screenCamera);renderer.outputEncoding=encoding;
    }
  };
}
