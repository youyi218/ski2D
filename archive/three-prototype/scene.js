import * as THREE from 'three';
import { heightAt, sampleRoute, seededRandom, lerp } from './core.js';
import { treeTexture, hutTexture, skierTexture, shadowTexture, poleTexture, snowTexture } from './art.js';

export const COLORS = { green: '#47876a', blue: '#5c91b5', red: '#c37565', black: '#535a64', unknown: '#9e998a' };
const vec = p => new THREE.Vector3(p[0], p[2], -p[1]);

export class MountainScene {
  constructor(container, data, routes, lifts) {
    this.container = container; this.data = data; this.routes = routes; this.lifts = lifts;
    this.terrain = data.terrain; this.yaw = .7; this.targetYaw = this.yaw;
    this.view = 690; this.targetView = 690; this.center = new THREE.Vector3();
    this.target = new THREE.Vector3(); this.overview = false;
    this.renderer = new THREE.WebGLRenderer({ antialias: false, alpha: false, powerPreference: 'high-performance' });
    this.renderer.setClearColor('#c8deda');
    this.renderer.setPixelRatio(1);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.domElement.setAttribute('aria-label', 'Saint-Lary 像素雪场，使用方向键滑行，Q 和 E 旋转视角');
    container.prepend(this.renderer.domElement);
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#c9dedb');
    this.camera = new THREE.OrthographicCamera(-500,500,500,-500,1,18000);
    this.scene.add(new THREE.HemisphereLight('#fffbed', '#a8b9c4', 2.3));
    const sun = new THREE.DirectionalLight('#fff7dd', 2.2); sun.position.set(-3000,6000,3000);this.scene.add(sun);
    this.makeTerrain(); this.makeTrails(); this.makeScenery(); this.makeLifts();
    this.skierMaps = [-2,0,2].map(skierTexture);
    this.skier = new THREE.Sprite(new THREE.SpriteMaterial({map:this.skierMaps[1],depthTest:false}));
    this.skier.center.set(.5,.05);this.skier.scale.set(25,31,1);this.skier.renderOrder=20;this.scene.add(this.skier);
    this.shadow = new THREE.Sprite(new THREE.SpriteMaterial({map:shadowTexture(),depthTest:false}));
    this.shadow.scale.set(34,17,1);this.shadow.renderOrder=19;this.scene.add(this.shadow);
    this.resizeObserver = new ResizeObserver(()=>this.resize());this.resizeObserver.observe(container);this.resize();
  }

  makeTerrain() {
    const t=this.terrain, nx=(t.cols-1)*2, ny=(t.rows-1)*2;
    const geom=new THREE.PlaneGeometry((t.cols-1)*t.stepX,(t.rows-1)*t.stepY,nx,ny);
    geom.rotateX(-Math.PI/2);
    const pos=geom.attributes.position, uv=geom.attributes.uv, colors=[];
    const snow=new THREE.Color('#f3f4e8'), rock=new THREE.Color('#a2aaa9');
    for(let i=0;i<pos.count;i++){
      const x=t.minX+(uv.getX(i))*(t.cols-1)*t.stepX;
      const y=t.minY+uv.getY(i)*(t.rows-1)*t.stepY;
      const z=heightAt(t,x,y);pos.setXYZ(i,x,z,-y);
      const steep=Math.hypot(heightAt(t,x+30,y)-heightAt(t,x-30,y),heightAt(t,x,y+30)-heightAt(t,x,y-30))/60;
      const c=snow.clone().lerp(rock,Math.max(0,Math.min(.5,(steep-.55)*.75)));
      colors.push(c.r,c.g,c.b);
    }
    geom.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));geom.computeVertexNormals();
    const texture=snowTexture();texture.wrapS=texture.wrapT=THREE.RepeatWrapping;texture.repeat.set(110,55);
    this.scene.add(new THREE.Mesh(geom,new THREE.MeshLambertMaterial({map:texture,vertexColors:true,side:THREE.DoubleSide})));
  }

  ribbon(route,width,color,offset=.8,opacity=1) {
    const positions=[], indices=[];const count=Math.ceil(route.length/9);
    for(let i=0;i<=count;i++){
      const {position:p,tangent:n}=sampleRoute(route,route.length*i/count);
      for(const side of [-1,1]){
        const x=p[0]+n[1]*width*.5*side,y=p[1]-n[0]*width*.5*side;
        positions.push(x,heightAt(this.terrain,x,y)+offset,-y);
      }
      if(i<count){const a=i*2;indices.push(a,a+1,a+2,a+1,a+3,a+2);}
    }
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setIndex(indices);g.computeVertexNormals();
    return new THREE.Mesh(g,new THREE.MeshBasicMaterial({color,side:THREE.DoubleSide,transparent:opacity<1,opacity,depthWrite:opacity===1}));
  }

  makeTrails() {
    this.routeLines=new Map();this.posts=new THREE.Group();this.scene.add(this.posts);
    const poles=Object.fromEntries(Object.entries(COLORS).map(([k,v])=>[k,new THREE.SpriteMaterial({map:poleTexture(v)})]));
    for(const r of this.routes){
      this.scene.add(this.ribbon(r,38,'#bacdd3',.6));
      this.scene.add(this.ribbon(r,32,'#fbfcf1',1.3));
      const line=this.ribbon(r,2,COLORS[r.difficulty]||COLORS.unknown,2.5,.5);this.scene.add(line);this.routeLines.set(r.id,line);
      if(r.length>300)for(let d=45;d<r.length;d+=90){
        const {position:p,tangent:n}=sampleRoute(r,d);
        for(const s of [-1,1]){
          const x=p[0]+n[1]*19*s,y=p[1]-n[0]*19*s;
          const pole=new THREE.Sprite(poles[r.difficulty]||poles.unknown);pole.position.set(x,heightAt(this.terrain,x,y)+9,-y);pole.scale.set(7,16,1);this.posts.add(pole);
        }
      }
    }
    this.trailGroup=new THREE.Group();this.scene.add(this.trailGroup);
    this.trackPositions=[];this.trackLine=null;
  }

  makeScenery() {
    const rand=seededRandom(2400),t=this.terrain;
    // Exclude illustrative trees from piste corridors, using spatial bins.
    const cells=new Map(),cellKey=(x,y)=>`${Math.floor(x/50)},${Math.floor(y/50)}`;
    for(const r of this.routes)for(let d=0;d<=r.length;d+=18){
      const p=sampleRoute(r,d).position,key=cellKey(p[0],p[1]);
      if(!cells.has(key))cells.set(key,[]);cells.get(key).push(p);
    }
    const clear=(x,y)=>{
      for(let a=-1;a<=1;a++)for(let b=-1;b<=1;b++){
        for(const p of cells.get(cellKey(x+a*50,y+b*50))||[])if(Math.hypot(p[0]-x,p[1]-y)<32)return false;
      }return true;
    };
    const groups=[[],[]];
    for(let i=0;i<14500;i++){
      const x=t.minX+rand()*(t.cols-1)*t.stepX,y=t.minY+rand()*(t.rows-1)*t.stepY,z=heightAt(t,x,y);
      if(z<1450||z>2180||!clear(x,y))continue;
      if(z>1940&&rand()>.24)continue;
      const patch=Math.sin(x*.008)*Math.cos(y*.009);if(patch<-.45&&rand()>.14)continue;
      const size=20+rand()*18;groups[i%2].push({x,y,z,size});
    }
    this.treeBatches=[];
    groups.forEach((trees,i)=>{
      const mesh=new THREE.InstancedMesh(new THREE.PlaneGeometry(1,1),new THREE.MeshBasicMaterial({map:treeTexture(i),alphaTest:.4,side:THREE.DoubleSide}),trees.length);
      mesh.frustumCulled=false;this.scene.add(mesh);this.treeBatches.push({mesh,trees});
    });
    this.billboardYaw=Infinity;
  }

  makeLifts() {
    const cableMat=new THREE.LineBasicMaterial({color:'#657875',transparent:true,opacity:.65});this.liftCars=[];
    const hutMat=new THREE.SpriteMaterial({map:hutTexture()});
    for(const lift of this.lifts){
      const points=[];
      for(let d=0;d<=lift.length;d+=30){const p=sampleRoute(lift,d).position;points.push(new THREE.Vector3(p[0],heightAt(this.terrain,p[0],p[1])+23,-p[1]));}
      const last=lift.points.at(-1);points.push(new THREE.Vector3(last[0],heightAt(this.terrain,last[0],last[1])+23,-last[1]));
      this.scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(points),cableMat));
      if(lift.length>200){
        for(let d=50;d<lift.length;d+=190){
          const p=sampleRoute(lift,d).position;
          const pole=new THREE.Mesh(new THREE.BoxGeometry(2,24,2),new THREE.MeshLambertMaterial({color:'#6e8178'}));
          pole.position.set(p[0],heightAt(this.terrain,p[0],p[1])+12,-p[1]);this.scene.add(pole);
          const bar=new THREE.Mesh(new THREE.BoxGeometry(14,2,2),pole.material);bar.position.copy(pole.position);bar.position.y+=11;this.scene.add(bar);
        }
        for(let j=0;j<4;j++){
          const car=new THREE.Mesh(new THREE.BoxGeometry(9,7,7),new THREE.MeshLambertMaterial({color:'#c9815e'}));
          this.scene.add(car);this.liftCars.push({car,lift,offset:j/4});
        }
      }
      for(const p of [lift.points[0],lift.points.at(-1)]){
        const hut=new THREE.Sprite(hutMat);hut.center.set(.5,.05);hut.scale.set(48,42,1);hut.position.set(p[0]+23,heightAt(this.terrain,p[0]+23,p[1])+1,-p[1]);this.scene.add(hut);
      }
    }
  }

  selectRoute(route) {
    this.route=route;
    for(const [id,line] of this.routeLines){line.material.opacity=id===route.id?.9:.3;}
    if(this.selectedRibbon){this.scene.remove(this.selectedRibbon);this.selectedRibbon.geometry.dispose();this.selectedRibbon.material.dispose();}
    this.selectedRibbon=this.ribbon(route,4,COLORS[route.difficulty]||COLORS.blue,3,.8);this.scene.add(this.selectedRibbon);
    this.trackPositions=[];if(this.trackLine){this.scene.remove(this.trackLine);this.trackLine.geometry.dispose();this.trackLine.material.dispose();this.trackLine=null;}
    const p=route.points[0];this.center.copy(vec([p[0],p[1],heightAt(this.terrain,p[0],p[1])]));this.target.copy(this.center);
    this.overview=false;this.targetView=690;
  }

  rotate(direction) {this.targetYaw+=direction*Math.PI/2;}
  get rotating(){return Math.abs(this.targetYaw-this.yaw)>.015;}
  zoom(factor){this.targetView=Math.max(320,Math.min(1800,this.targetView*factor));this.overview=false;}
  toggleOverview(){this.overview=!this.overview;this.targetView=this.overview?3600:690;}

  resize() {
    const {width,height}=this.container.getBoundingClientRect();this.width=width;this.height=height;
    this.renderer.setSize(Math.max(1,Math.round(width*.65)),Math.max(1,Math.round(height*.65)),false);
    this.renderer.domElement.style.width='100%';this.renderer.domElement.style.height='100%';
  }

  project(position) {
    const p=vec(position).project(this.camera);
    return {x:(p.x*.5+.5)*this.width,y:(-.5*p.y+.5)*this.height,visible:p.z<1&&Math.abs(p.x)<.92&&Math.abs(p.y)<.9};
  }

  update(dt,position,input,time,status) {
    this.yaw=lerp(this.yaw,this.targetYaw,Math.min(1,dt*8));this.view=lerp(this.view,this.targetView,Math.min(1,dt*5));
    this.target.copy(vec(position));
    if(this.overview)this.target.set(-450,1800,150);
    this.center.lerp(this.target,Math.min(1,dt*5));
    const aspect=this.width/this.height;this.camera.left=-this.view*aspect*.5;this.camera.right=this.view*aspect*.5;
    this.camera.top=this.view*.5;this.camera.bottom=-this.view*.5;this.camera.updateProjectionMatrix();
    this.camera.position.set(this.center.x+Math.sin(this.yaw)*3600,this.center.y+3700,this.center.z+Math.cos(this.yaw)*3600);
    this.camera.lookAt(this.center);this.camera.updateMatrixWorld();
    if(Math.abs(this.billboardYaw-this.yaw)>.012){
      const obj=new THREE.Object3D();
      for(const {mesh,trees} of this.treeBatches){trees.forEach((t,i)=>{
        obj.position.set(t.x,t.z+t.size*.48,-t.y);obj.quaternion.copy(this.camera.quaternion);obj.scale.set(t.size*.67,t.size,1);obj.updateMatrix();mesh.setMatrixAt(i,obj.matrix);
      });mesh.instanceMatrix.needsUpdate=true;}
      this.billboardYaw=this.yaw;
    }
    this.skier.position.copy(vec(position));this.skier.position.y+=5;
    this.skier.material.map=this.skierMaps[(input.steer||0)+1];
    const size=Math.max(23,this.view/25);this.skier.scale.set(size,size*1.25,1);
    this.shadow.position.copy(vec(position));this.shadow.position.y+=2;this.shadow.scale.set(size*1.3,size*.65,1);
    for(const {car,lift,offset} of this.liftCars){
      const p=sampleRoute(lift,((time*.003+offset)%1)*lift.length).position;
      car.position.set(p[0],heightAt(this.terrain,p[0],p[1])+19,-p[1]);
    }
    if(status==='skiing'&&(!this.trackPositions.length||this.skier.position.distanceTo(this.trackPositions.at(-1))>4)){
      this.trackPositions.push(new THREE.Vector3(position[0],position[2]+3,-position[1]));
      if(this.trackPositions.length>600)this.trackPositions.shift();
      if(!this.trackLine){this.trackLine=new THREE.Line(new THREE.BufferGeometry(),new THREE.LineBasicMaterial({color:'#81999d',transparent:true,opacity:.55}));this.scene.add(this.trackLine);}
      this.trackLine.geometry.dispose();this.trackLine.geometry=new THREE.BufferGeometry().setFromPoints(this.trackPositions);
    }
    this.renderer.render(this.scene,this.camera);
  }
}
