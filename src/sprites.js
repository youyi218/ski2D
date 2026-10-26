// Hand-placed pixel sprites. Each character maps to a palette key; '.' is transparent.
// Sprites stay upright while the ground rotates beneath them.
const KEYS = {
  o: 'ink', S: 'snowcap', L: 'leaf.0', M: 'leaf.1', D: 'leaf.2', T: 'trunk',
  W: 'wall', w: 'wallDark', R: 'roof', r: 'roofSnow', Y: 'window', G: 'stone',
  J: 'jacket', j: 'jacketDark', H: 'hat', P: 'pants', F: 'skin', C: 'cheek', K: 'ski',
  B: 'sign', b: 'signDark', Z: 'lift', X: 'accent',
};

const ART = {
  pine: [
    '......o......',
    '.....oSo.....',
    '....oSSSo....',
    '....oLSMo....',
    '...oSSSSSo...',
    '...oLLSMDo...',
    '..oSSSSSSSo..',
    '..oLLLSMMDo..',
    '..oLLMMMMDo..',
    '.oSSSSSSSSSo.',
    '.oLLLLSMMMDo.',
    'oLLLMMMMMDDDo',
    'oMMMMMMMDDDDo',
    '.ooooooooooo.',
    '.....oTTo....',
    '.....oTTo....',
    '......oo.....',
  ],
  pineSmall: [
    '....o....',
    '...oSo...',
    '..oSSSo..',
    '..oLSMo..',
    '.oSSSSSo.',
    '.oLLSMDo.',
    'oLLMMMDDo',
    'oMMMMDDDo',
    '.ooooooo.',
    '...oTo...',
    '....o....',
  ],
  skier: [
    '.....o.....',
    '....oHo....',
    '...oHHHo...',
    '..oHHHHHo..',
    '..ojjjjjo..',
    '..oFFFFFo..',
    '..oFoFoFo..',
    '..oCFFFCo..',
    '...oJJJo...',
    '..oJJjJJo..',
    '.oFJJjJJFo.',
    '..oPPoPPo..',
    '..oPo.oPo..',
    '..oKo.oKo..',
    '..oKo.oKo..',
    '...o...o...',
  ],
  chalet: [
    '.......o.......',
    '......oro......',
    '.....orrro.....',
    '....orrRrro....',
    '...orRRRRRro...',
    '..orRRRRRRRro..',
    '.oRRRRRRRRRRRo.',
    'ooooooooooooooo',
    '.oWWWWWWWWWWWo.',
    '.oWoooWWWoooWo.',
    '.oWoYoWoWoYoWo.',
    '.oWoooWowoooWo.',
    '.owwwwwowwwwwo.',
    '.ooooooooooooo.',
  ],
  station: [
    '.ooooooooooo.',
    'orrrrrrrrrrro',
    'ooooooooooooo',
    '.oGGGGGGGGGo.',
    '.oGoooGoooGo.',
    '.oGoYoGoYoGo.',
    '.oGoooGoooGo.',
    '.oGGGGGGGGGo.',
    '.ooooooooooo.',
  ],
  pylon: [
    'ooooo',
    'oZZZo',
    'ooZoo',
    '.oZo.', '.oZo.', '.oZo.', '.oZo.', '.oZo.', '.oZo.', '.oZo.', '.oZo.', '.oZo.',
    'oZZZo',
    'ooooo',
  ],
  pole: ['.o.', 'oXo', 'oXo', 'oSo', 'oXo', 'oXo', '.o.'],
  sign: [
    '.ooooooo.',
    'oBBBBBBBo',
    'oBXXXXXBo',
    'oBXXXXXBo',
    'obbbbbbbo',
    '.ooobooo.',
    '...obo...',
    '...obo...',
    '...ooo...',
  ],
  chair: ['..o..', '..o..', 'ooooo', 'oZZZo', 'o...o'],
};

function colorOf(pal, key, accent) {
  if (key === 'accent') return accent;
  const [k, i] = key.split('.');
  return i === undefined ? pal[k] : pal[k][+i];
}

function paint(rows, pal, accent, shift = () => 0) {
  const w = Math.max(...rows.map(r => r.length)) + 2, h = rows.length;
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d');
  rows.forEach((row, y) => [...row].forEach((ch, x) => {
    if (ch === '.') return;
    g.fillStyle = colorOf(pal, KEYS[ch], accent);
    g.fillRect(x + 1 + shift(y), y, 1, 1);
  }));
  return c;
}

function shadow(pal, w) {
  const c = document.createElement('canvas'); c.width = w; c.height = 3;
  const g = c.getContext('2d'); g.fillStyle = pal.ink; g.globalAlpha = .18;
  g.fillRect(2, 0, w - 4, 3); g.fillRect(0, 1, w, 1);
  return c;
}

// Returns { name: canvas } for one palette. Pole/sign variants per trail colour.
export function buildSprites(pal) {
  const s = {};
  for (const k of ['pine', 'pineSmall', 'chalet', 'station', 'pylon', 'chair']) s[k] = paint(ART[k], pal);
  // Skier leans by sliding the upper body one pixel; skis stay planted.
  s.skier = paint(ART.skier, pal);
  s.skierL = paint(ART.skier, pal, null, y => (y < 13 ? -1 : 0));
  s.skierR = paint(ART.skier, pal, null, y => (y < 13 ? 1 : 0));
  for (const [diff, col] of Object.entries(pal.trail)) {
    s['pole-' + diff] = paint(ART.pole, pal, col);
    s['sign-' + diff] = paint(ART.sign, pal, col);
  }
  s['sign-lift'] = paint(ART.sign, pal, pal.lift);
  s.shadowBig = shadow(pal, 13); s.shadowSmall = shadow(pal, 9);
  return s;
}
