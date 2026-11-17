/* Geometry for the ancient grove, shared between the live world and its reflection. */
function createGroveModels(THREE, merge, mossRock) {
  const {Vector3, Quaternion, Matrix4, Color} = THREE;
  const up = new Vector3(0, 1, 0);
  const color = hex => new Color(hex);
  const transform = (position, scale, rotation = new Quaternion()) =>
    new Matrix4().compose(new Vector3(...position), rotation, new Vector3(...scale));

  function branch(parts, start, end, bottom, top, shade) {
    const a = new Vector3(...start), b = new Vector3(...end);
    const direction = b.clone().sub(a);
    const rotation = new Quaternion().setFromUnitVectors(up, direction.clone().normalize());
    const matrix = new Matrix4().compose(a.lerp(b, .5), rotation, new Vector3(1, 1, 1));
    parts.push([new THREE.CylinderGeometry(top, bottom, direction.length(), 7), matrix, shade]);
  }

  function oak(hue, bark, variant) {
    const parts = [], wood = bark || color(0x694630);
    const leaf = (offset, brightness) => new Color().setHSL(hue + offset, .54, brightness);
    const lean = .13 * Math.sin(variant * 2);
    branch(parts, [0,-.08,0], [lean,1.35,0], .24,.14,wood);
    branch(parts, [lean,1.35,0], [-lean,2.75,.1], .15,.055,wood);
    for (let i = 0; i < 5; i++) {
      const angle = i * 2.399 + variant;
      const x = Math.cos(angle), z = Math.sin(angle);
      branch(parts, [x*.47,-.055,z*.47], [0,.48,0], .07,.13,wood);
      branch(parts, [lean,1.22+i*.17,0], [x*.94,2.34+i*.12,z*.94], .093,.035,wood);
      parts.push([mossRock(.85,2,.13), transform([x*.79,2.53+i*.13,z*.79],[1,.72,.96]),leaf(i*.008-.02,.29+i*.032)]);
      parts.push([mossRock(.53,1,.14), transform([x*1.24,2.47+i*.14,z*1.24],[1,.68,1]),leaf(i*.005-.014,.36+i*.025)]);
    }
    parts.push([mossRock(1.02,2,.13),transform([lean,3.27,0],[1,.83,1]),leaf(.008,.5)]);
    return merge(parts);
  }

  function arch() {
    const parts = [], stone = [0x6e7468,0x848c79,0x999789,0x757b72];
    for (const side of [-1,1]) {
      parts.push([mossRock(1,1,.14),transform([side*.92,.17,0],[.53,.31,.57]),color(0x687364)]);
      for (let i=0;i<5;i++) {
        const turn = new Quaternion().setFromAxisAngle(up, side * (.10 + Math.sin(i*4)*.08));
        parts.push([mossRock(1,1,.055),transform([side*.89,.24+i*.29,0],[.38,.25,.36],turn),color(stone[i%4])]);
      }
      for (let i=0;i<3;i++) {
        parts.push([mossRock(1,1,.16),transform([side*(1.27+i*.15),.12,-.2+i*.25],[.32,.22,.26]),color(0x65754e)]);
      }
    }
    for (let i=0;i<9;i++) {
      const angle = i * Math.PI / 8;
      const turn = new Quaternion().setFromAxisAngle(new Vector3(0,0,1),angle-Math.PI/2);
      const center = [Math.cos(angle)*.88,1.43+Math.sin(angle)*.87,0];
      parts.push([mossRock(1,1,.065),transform(center,[.235,.31,.34],turn),color(stone[(i+1)%4])]);
      if(i>1&&i<7)parts.push([mossRock(1,1,.16),transform([center[0]*1.16,center[1]+.20,.02],[.25,.10,.29],turn),color(i%2?0x687d3e:0x556838)]);
    }
    for(let i=0;i<3;i++) {
      parts.push([mossRock(1,1,.05),transform([0,.06,i*.49],[1.3,.09,.38]),color(stone[i])]);
    }
    return merge(parts);
  }

  return {oak,arch};
}

function addShorePlants(THREE, scene, heightAt, waterLevel) {
  const {Vector3, Quaternion, Matrix4, Color} = THREE;
  let seed = 4571;
  const random = () => ((seed = Math.imul(seed,1664525) + 1013904223 >>> 0) / 4294967296);
  const blades = [], pads = [];
  for(let i=0;i<8000&&blades.length<660;i++) {
    const x=(random()-.5)*160,z=(random()-.5)*160,y=heightAt(x,z);
    if(y<waterLevel-.19||y>waterLevel+.32)continue;
    for(let k=0;k<5;k++) blades.push([x+(random()-.5)*1.2,y,z+(random()-.5)*1.2,.5+random()*.85]);
    if(random()<.56&&pads.length<140){
      const radius=.23+random()*.39;
      for(let k=0;k<8;k++){
        const angle=k*Math.PI/4,px=x+Math.cos(angle)*1.3,pz=z+Math.sin(angle)*1.3;
        if(heightAt(px,pz)<waterLevel-.22){pads.push([px,pz,radius]);break;}
      }
    }
  }
  const reedsGeometry = new THREE.BufferGeometry();
  reedsGeometry.setAttribute('position',new THREE.Float32BufferAttribute([
    -.035,0,0, .035,0,0, -.11,.62,.04, -.11,.62,.04, .035,0,0, -.035,1,.12,
    -.065,0,0, .025,.66,-.06, .14,.97,-.13, -.065,0,0, .14,.97,-.13, .025,0,0
  ],3));
  reedsGeometry.computeVertexNormals();
  const padGeometry = new THREE.CircleGeometry(1,12,.3,Math.PI*1.79);
  padGeometry.rotateX(-Math.PI/2);
  const reeds = new THREE.InstancedMesh(reedsGeometry,new THREE.MeshStandardMaterial({side:THREE.DoubleSide,roughness:.8}),blades.length);
  const lilies = new THREE.InstancedMesh(padGeometry,new THREE.MeshStandardMaterial({side:THREE.DoubleSide,roughness:.37}),pads.length);
  const matrix = new Matrix4(), rotation = new Quaternion(), up = new Vector3(0,1,0), position = new Vector3(), scale = new Vector3(), shade = new Color();
  blades.forEach(([x,y,z,h],i)=>{
    rotation.setFromAxisAngle(up,random()*Math.PI*2);
    matrix.compose(position.set(x,y,z),rotation,scale.set(h,h,h));
    reeds.setMatrixAt(i,matrix);
    reeds.setColorAt(i,shade.setHSL(.17+random()*.08,.53,.31+random()*.16).convertSRGBToLinear());
  });
  pads.forEach(([x,z,radius],i)=>{
    rotation.setFromAxisAngle(up,random()*Math.PI*2);
    matrix.compose(position.set(x,waterLevel+.075+random()*.015,z),rotation,scale.set(radius,1,radius));
    lilies.setMatrixAt(i,matrix);
    lilies.setColorAt(i,shade.setHSL(.19+random()*.10,.51,.32+random()*.14).convertSRGBToLinear());
  });
  reeds.receiveShadow = lilies.receiveShadow = true;
  scene.add(reeds,lilies);
}
