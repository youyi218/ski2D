// Interface text in Chinese, English and French. The language is remembered per browser; the first
// visit follows the browser's own language (English when it is none of the three).
// Piste, lift and place names stay as the resorts write them.
export const LANGS = { zh: '中文', en: 'English', fr: 'Français' };
const KEY = 'ski2d.lang';

export const lang = (() => {
  try { const l = localStorage.getItem(KEY); if (LANGS[l]) return l; } catch {}
  const n = (navigator.language || '').slice(0, 2).toLowerCase();
  return LANGS[n] ? n : 'en';
})();
document.documentElement.lang = { zh: 'zh-CN', en: 'en', fr: 'fr' }[lang];

// Switching reloads the page: the game keeps its resort (in the URL) and settings, and every string is redrawn.
export function setLang(l) {
  try { localStorage.setItem(KEY, l); } catch {}
  location.reload();
}

// The language picker shown on the landing page and in the game menu.
export const langSwitch = () => `<div class="langs">${Object.entries(LANGS).map(([k, n]) =>
  `<button data-lang="${k}" class="${k === lang ? 'on' : ''}">${n}</button>`).join('')}</div>`;

// One value per language, e.g. a resort's region.
export const pick = o => o[lang] ?? o.en;

// t('key', { name }) fills {name} in the string.
export function t(key, vars = {}) {
  const s = STR[key]?.[lang] ?? STR[key]?.en ?? key;
  return s.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '');
}

const STR = {
  app: { zh: '滑雪日记', en: 'Ski Diary', fr: 'Journal de ski' },
  tagline: {
    zh: '在像素雪山里，提前认识真实雪道。选一个雪场开始。',
    en: 'Get to know real pistes on a pixel mountain before you go. Pick a resort to start.',
    fr: 'Découvrez de vraies pistes sur une montagne en pixels avant d’y aller. Choisissez une station.',
  },
  credits: {
    zh: '雪道、缆车、树林和建筑：© OpenStreetMap contributors（ODbL）。地形：Mapzen Terrain Tiles / EU-DEM。',
    en: 'Pistes, lifts, forests and buildings: © OpenStreetMap contributors (ODbL). Terrain: Mapzen Terrain Tiles / EU-DEM.',
    fr: 'Pistes, remontées, forêts et bâtiments : © OpenStreetMap contributors (ODbL). Relief : Mapzen Terrain Tiles / EU-DEM.',
  },
  disclaimer: {
    zh: '非官方、非实时，仅供熟悉地形。',
    en: 'Unofficial and not live — only for getting to know the terrain.',
    fr: 'Non officiel et pas en temps réel — seulement pour découvrir le terrain.',
  },
  thumbLabel: { zh: '{name} 雪道示意图', en: 'Piste sketch of {name}', fr: 'Plan des pistes de {name}' },
  lastVisited: { zh: '上次去过', en: 'Last visited', fr: 'Dernière visite' },
  statPistes: { zh: '雪道', en: 'Pistes', fr: 'Pistes' },
  statPistesUnit: { zh: '条', en: '', fr: '' },
  statLifts: { zh: '缆车', en: 'Lifts', fr: 'Remontées' },
  statLiftsUnit: { zh: '部', en: '', fr: '' },
  statAlt: { zh: '海拔', en: 'Altitude', fr: 'Altitude' },
  dataAsOf: { zh: '数据截至 {date}', en: 'Data as of {date}', fr: 'Données au {date}' },
  go: { zh: '开始滑 →', en: 'Start skiing →', fr: 'Skier →' },
  loading: { zh: '正在铺好雪道', en: 'Grooming the pistes', fr: 'Damage des pistes' },

  // Resort notes (resorts.js).
  noteOfficial: { zh: '按官方雪道图修正', en: 'corrected against the official piste map', fr: 'corrigé d’après le plan officiel des pistes' },
  noteOfficialOsm: { zh: '已对照官方雪道图和 OpenSkiMap 修正', en: 'checked against the official piste map and OpenSkiMap', fr: 'vérifié avec le plan officiel et OpenSkiMap' },

  // Difficulty: short (landing legend) and as a run type.
  short_green: { zh: '绿', en: 'Green', fr: 'Verte' },
  short_blue: { zh: '蓝', en: 'Blue', fr: 'Bleue' },
  short_red: { zh: '红', en: 'Red', fr: 'Rouge' },
  short_black: { zh: '黑', en: 'Black', fr: 'Noire' },
  diff_green: { zh: '绿道', en: 'Green run', fr: 'Piste verte' },
  diff_blue: { zh: '蓝道', en: 'Blue run', fr: 'Piste bleue' },
  diff_red: { zh: '红道', en: 'Red run', fr: 'Piste rouge' },
  diff_black: { zh: '黑道', en: 'Black run', fr: 'Piste noire' },
  diff_connection: { zh: '连接道', en: 'Link', fr: 'Liaison' },
  diff_unknown: { zh: '未标难度', en: 'Unrated', fr: 'Non classée' },
  estimated: { zh: '位置为估计（按官方地图手画）', en: 'approximate (drawn from the official map)', fr: 'approximative (tracée d’après le plan officiel)' },

  // Palettes.
  pal_warm: { zh: '暖阳', en: 'Sunny', fr: 'Soleil' },
  pal_pastel: { zh: '粉彩', en: 'Pastel', fr: 'Pastel' },
  pal_dusk: { zh: '黄昏', en: 'Dusk', fr: 'Crépuscule' },

  // Top bar.
  sound: { zh: '声音', en: 'Sound', fr: 'Son' },
  muted: { zh: '静音', en: 'Muted', fr: 'Muet' },
  soundOn: { zh: '打开声音（M）', en: 'Turn sound on (M)', fr: 'Activer le son (M)' },
  soundOff: { zh: '静音（M）', en: 'Mute (M)', fr: 'Couper le son (M)' },
  viewTop: { zh: '俯视', en: 'Map', fr: 'Carte' },
  view3d: { zh: '3D', en: '3D', fr: '3D' },
  viewTitle: { zh: '切换视角（V）', en: 'Switch view (V)', fr: 'Changer de vue (V)' },

  // Maps.
  minimapTitle: { zh: '点开大地图（Tab）', en: 'Open the resort map (Tab)', fr: 'Ouvrir le plan (Tab)' },
  mapHelp: { zh: '滚轮缩放 · 拖动平移', en: 'Scroll to zoom · drag to move', fr: 'Molette pour zoomer · glisser pour déplacer' },
  mapMe: { zh: '定位到我', en: 'Find me', fr: 'Me trouver' },
  mapClose: { zh: '✕ 关闭（Tab）', en: '✕ Close (Tab)', fr: '✕ Fermer (Tab)' },

  // Key hints along the bottom.
  hint_arcade: {
    zh: '← → 转弯 · ↓ 压低加速 · ↑ / 空格 刹车 · 不按键 = 顺着雪道滑 · 缆车站 回车 上车 · V 3D 视角 · Tab 大地图 · Shift 快进 · M 声音 · Esc 菜单 · / 搜雪道 · 1/2/3 画风',
    en: '← → turn · ↓ tuck · ↑ / Space brake · no keys = follow the piste · Enter at a lift to ride · V 3D view · Tab map · Shift fast-forward · M sound · Esc menu · / search · 1/2/3 colours',
    fr: '← → tourner · ↓ recherche de vitesse · ↑ / Espace freiner · sans touche = suivre la piste · Entrée à une remontée pour monter · V vue 3D · Tab plan · Maj accélérer · M son · Échap menu · / chercher · 1/2/3 couleurs',
  },
  hint_real: {
    zh: '不按键 = 顺着雪道滑 · 方向键 = 想往屏幕哪边滑（会慢慢转过去）· 空格 刹车 · 缆车站 回车 上车 · V 3D 视角 · Tab 大地图 · Shift 快进 · M 声音 · Esc 菜单 · / 搜雪道 · 1/2/3 画风',
    en: 'no keys = follow the piste · arrows = where on screen to ski (turns gradually) · Space brake · Enter at a lift to ride · V 3D view · Tab map · Shift fast-forward · M sound · Esc menu · / search · 1/2/3 colours',
    fr: 'sans touche = suivre la piste · flèches = où aller à l’écran (virage progressif) · Espace freiner · Entrée à une remontée pour monter · V vue 3D · Tab plan · Maj accélérer · M son · Échap menu · / chercher · 1/2/3 couleurs',
  },
  hint_arcade3d: {
    zh: '← → 转弯 · ↑ 压低加速 · ↓ / 空格 刹车 · 不按键 = 顺着雪道滑 · 缆车站 回车 上车 · V 切回俯视 · Tab 大地图 · Shift 快进 · M 声音 · Esc 菜单',
    en: '← → turn · ↑ tuck · ↓ / Space brake · no keys = follow the piste · Enter at a lift to ride · V map view · Tab map · Shift fast-forward · M sound · Esc menu',
    fr: '← → tourner · ↑ recherche de vitesse · ↓ / Espace freiner · sans touche = suivre la piste · Entrée à une remontée pour monter · V vue carte · Tab plan · Maj accélérer · M son · Échap menu',
  },
  hint_real3d: {
    zh: '← → 转弯 · ↑ 慢速时蹬雪 · ↓ / 空格 刹车 · 不按键 = 顺着雪道滑 · 缆车站 回车 上车 · V 切回俯视 · Tab 大地图 · Shift 快进 · M 声音 · Esc 菜单',
    en: '← → turn · ↑ push off when slow · ↓ / Space brake · no keys = follow the piste · Enter at a lift to ride · V map view · Tab map · Shift fast-forward · M sound · Esc menu',
    fr: '← → tourner · ↑ pousser à basse vitesse · ↓ / Espace freiner · sans touche = suivre la piste · Entrée à une remontée pour monter · V vue carte · Tab plan · Maj accélérer · M son · Échap menu',
  },

  // Menu.
  allResorts: { zh: '← 全部雪场', en: '← All resorts', fr: '← Toutes les stations' },
  resume: { zh: '▶ 继续滑', en: '▶ Keep skiing', fr: '▶ Reprendre' },
  resumeSub: { zh: '回到刚才的位置（也可以按 Esc）', en: 'back where you were (or press Esc)', fr: 'là où vous étiez (ou Échap)' },
  intro: {
    zh: '选一条雪道作为起点，之后就可以自由滑了：往哪拐就进哪条雪道，到了缆车站按回车上缆车。镜头会一直朝向下坡，滑行时右上角的小地图跟着你转，前进方向朝上；点它或按 Tab 打开整个雪场的大地图。',
    en: 'Pick a piste to start on, then ski wherever you like: turn into any piste, and press Enter at a lift station to ride up. The camera always faces downhill; while you ski, the minimap at the top right turns with you, the way ahead pointing up. Click it or press Tab for the whole resort map.',
    fr: 'Choisissez une piste de départ, puis skiez librement : tournez dans la piste de votre choix et appuyez sur Entrée à une gare pour monter. La caméra regarde toujours vers l’aval ; en descente, la mini-carte en haut à droite tourne avec vous, la direction suivie vers le haut. Cliquez dessus ou appuyez sur Tab pour le plan complet.',
  },
  arcade: { zh: '畅玩', en: 'Arcade', fr: 'Arcade' },
  arcadeSub: { zh: '转弯利落、更快、能压低加速', en: 'snappy turns, faster, tuck for speed', fr: 'virages vifs, plus rapide, recherche de vitesse' },
  real: { zh: '真实', en: 'Realistic', fr: 'Réaliste' },
  realSub: { zh: '真实物理和速度', en: 'real physics and speed', fr: 'physique et vitesse réelles' },
  timeScale: { zh: '速度倍数', en: 'Speed', fr: 'Vitesse' },
  timeScaleSub: { zh: '1× = 真实速度；游戏中按住 Shift 再快 {n} 倍', en: '1× = real speed; hold Shift in game for {n}× more', fr: '1× = vitesse réelle ; Maj en jeu pour ×{n} de plus' },
  search: { zh: '🔍 搜索雪道名（按 / 跳到这里）', en: '🔍 Search pistes (press / to jump here)', fr: '🔍 Chercher une piste (/ pour venir ici)' },
  noMatch: { zh: '没有叫“{q}”的雪道', en: 'No piste called “{q}”', fr: 'Aucune piste nommée « {q} »' },
  fine: {
    zh: '雪道、缆车、树林和建筑：© OpenStreetMap contributors（ODbL），数据截至 {date}，{note}。地形：Mapzen Terrain Tiles / EU-DEM。非官方、非实时，仅供熟悉地形。',
    en: 'Pistes, lifts, forests and buildings: © OpenStreetMap contributors (ODbL), data as of {date}, {note}. Terrain: Mapzen Terrain Tiles / EU-DEM. Unofficial and not live — only for getting to know the terrain.',
    fr: 'Pistes, remontées, forêts et bâtiments : © OpenStreetMap contributors (ODbL), données au {date}, {note}. Relief : Mapzen Terrain Tiles / EU-DEM. Non officiel et pas en temps réel — seulement pour découvrir le terrain.',
  },

  // HUD and prompts.
  stationTop: { zh: '顶站', en: 'top station', fr: 'gare du haut' },
  stationBottom: { zh: '底站', en: 'bottom station', fr: 'gare du bas' },
  plaza: { zh: '缆车站广场', en: 'Lift station', fr: 'Gare de remontée' },
  plaza3d: { zh: '← → 转向，↑ 蹬出去', en: '← → turn, ↑ push off', fr: '← → tourner, ↑ pousser' },
  plaza2d: { zh: '按方向键蹬向想去的雪道入口', en: 'arrow keys to push toward the piste you want', fr: 'flèches pour pousser vers la piste voulue' },
  forest: { zh: '🌲 树林里', en: '🌲 In the trees', fr: '🌲 En forêt' },
  offPiste: { zh: '❄️ 雪道外', en: '❄️ Off piste', fr: '❄️ Hors piste' },
  forestArcade: { zh: '树林里滑不快，找路出去', en: 'slow going in the trees — find a way out', fr: 'on avance lentement en forêt — trouvez une sortie' },
  offArcade: { zh: '野雪也能滑，小心树林', en: 'off-piste is fine — mind the trees', fr: 'le hors-piste est permis — attention aux arbres' },
  offReal: { zh: '深雪会减速，回到雪道上吧', en: 'deep snow slows you down — head back to the piste', fr: 'la neige profonde ralentit — revenez sur la piste' },
  tuck: { zh: '压低', en: 'tuck', fr: 'recherche' },
  speedX: { zh: '画面 ×{x}', en: '×{x} speed', fr: 'vitesse ×{x}' },
  altitude: { zh: '海拔 {m} m', en: 'altitude {m} m', fr: 'altitude {m} m' },
  holdShift: { zh: '按住 Shift 快进', en: 'hold Shift to fast-forward', fr: 'Maj pour accélérer' },
  board: {
    zh: '🚡 <b>{lift}</b> · 按 <b>回车</b> 上缆车（{m} m 爬升），不上就继续滑',
    en: '🚡 <b>{lift}</b> · press <b>Enter</b> to ride up ({m} m climb), or just keep skiing',
    fr: '🚡 <b>{lift}</b> · <b>Entrée</b> pour monter ({m} m de dénivelé), sinon continuez',
  },
  liftAhead: {
    zh: '前方 🚡 <b>{lift}</b> 缆车 · 滑进站台按回车上车',
    en: 'Lift ahead: 🚡 <b>{lift}</b> · ski into the station and press Enter',
    fr: 'Remontée devant : 🚡 <b>{lift}</b> · entrez dans la gare et appuyez sur Entrée',
  },
};
