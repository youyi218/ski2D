import * as THREE from 'three';

// Original tiny sprites. No downloaded game assets or satellite imagery.
function texture(w, h, paint) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d'); g.imageSmoothingEnabled = false; paint(g);
  const t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function treeTexture(variant = 0) {
  return texture(32, 48, g => {
    g.fillStyle = '#70584a'; g.fillRect(14, 33, 5, 13);
    const tiers = [[14, 2, 4, 4], [11, 6, 10, 5], [8, 11, 16, 6], [5, 17, 22, 7], [2, 24, 28, 8], [5, 32, 23, 7]];
    for (const [x,y,w,h] of tiers) {
      g.fillStyle = variant ? '#345b59' : '#376354'; g.fillRect(x,y,w,h);
      g.fillStyle = variant ? '#264548' : '#254d43'; g.fillRect(16,y,w/2,h);
      g.fillStyle = '#a3c0b4'; g.fillRect(x,y,w-3,2);
      g.fillStyle = '#e7f1e9'; g.fillRect(x+1,y,w/2+2,2);
    }
    g.fillStyle = '#729985'; g.fillRect(8,28,3,3); g.fillRect(12,16,2,3);
  });
}

export function hutTexture() {
  return texture(64, 56, g => {
    g.fillStyle = '#514e49'; g.fillRect(10,29,43,23);
    g.fillStyle = '#b28d65'; g.fillRect(11,29,26,22);
    g.fillStyle = '#86694d'; g.fillRect(38,29,14,22);
    for(let y=31;y<51;y+=5){g.fillStyle='#967854';g.fillRect(11,y,26,1);}
    g.fillStyle = '#4d605c'; g.fillRect(4,25,55,5); g.fillRect(9,20,45,5);g.fillRect(14,15,35,5);g.fillRect(19,10,25,5);
    g.fillStyle = '#fcf8e9'; g.fillRect(4,22,55,3);g.fillRect(9,17,45,5);g.fillRect(14,12,35,5);g.fillRect(19,7,25,5);
    g.fillStyle = '#806654';g.fillRect(43,4,5,10);g.fillStyle='#d4ded6';g.fillRect(42,3,7,2);
    g.fillStyle = '#f4cf83';g.fillRect(15,33,9,8);g.fillRect(40,33,7,7);
    g.fillStyle = '#6a604b';g.fillRect(19,33,1,8);g.fillRect(15,37,9,1);
    g.fillStyle = '#3b534d';g.fillRect(28,36,7,15);g.fillStyle='#d7c8a7';g.fillRect(32,42,1,2);
    g.fillStyle = '#f0eee0';g.fillRect(8,51,47,3);
  });
}

export function skierTexture(facing = 0) {
  return texture(32, 40, g => {
    const lean = facing;
    g.fillStyle = '#263e43';g.fillRect(6+lean,29,3,10);g.fillRect(21+lean,29,3,10);
    g.fillStyle = '#e2b552';g.fillRect(6+lean,30,2,8);g.fillRect(21+lean,30,2,8);
    g.fillStyle = '#354c56';g.fillRect(10+lean,25,5,8);g.fillRect(18+lean,25,5,8);
    g.fillStyle = '#a94d3f';g.fillRect(9+lean,15,15,12);
    g.fillStyle = '#e67e5a';g.fillRect(9+lean,15,10,11);g.fillRect(6+lean,18,4,8);g.fillRect(23+lean,18,4,8);
    g.fillStyle = '#f4b27c';g.fillRect(10+lean,15,3,9);
    g.fillStyle = '#e6c4a3';g.fillRect(12+lean,8,10,7);
    g.fillStyle = '#df6a4d';g.fillRect(11+lean,3,12,7);g.fillRect(13+lean,1,7,3);
    g.fillStyle = '#f5ddac';g.fillRect(11+lean,7,12,2);g.fillRect(14+lean,1,4,2);
    g.fillStyle = '#284952';g.fillRect(12+lean,10,10,3);
    g.fillStyle = '#9dd0ca';g.fillRect(13+lean,10,4,2);
    g.fillStyle = '#536467';g.fillRect(3+lean,25,1,11);g.fillRect(28+lean,25,1,11);
    g.fillStyle = '#303f43';g.fillRect(4+lean,23,4,3);g.fillRect(25+lean,23,4,3);
  });
}

export function shadowTexture() {
  return texture(32, 16, g => {
    g.fillStyle='rgba(54,82,95,0.22)';g.fillRect(6,4,20,8);g.fillRect(2,6,28,4);
  });
}

export function poleTexture(color) {
  return texture(14, 32, g => {
    g.fillStyle='#708078';g.fillRect(6,10,2,21);g.fillStyle='#eef5ed';g.fillRect(6,17,2,5);
    g.fillStyle='#fbf7e9';g.fillRect(2,1,10,10);
    g.fillStyle=color;g.fillRect(3,2,8,8);g.fillStyle='#f5f5dc';g.fillRect(6,4,2,4);
  });
}

export function snowTexture() {
  return texture(128, 128, g => {
    g.fillStyle='#edf4ee';g.fillRect(0,0,128,128);
    let seed=31;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
    for(let i=0;i<220;i++){
      g.fillStyle=i%4===0?'#dbe7e5':'#f4f7ed';
      g.fillRect(Math.floor(random()*128),Math.floor(random()*128),i%3+1,1);
    }
  });
}
