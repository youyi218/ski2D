// Resorts the game can load. Each one's data is a separate chunk, fetched only when chosen.
// The choice lives in the URL (?resort=isola) so a link opens the right mountain; no choice = the landing page.
// card() is a small summary (stats + thumbnail) for the landing page, built by scripts/build_cards.py.
export const RESORTS = {
  'saint-lary': {
    title: 'Saint-Lary', place: 'Saint-Lary-Soulan · Pyrénées', region: '比利牛斯山 · 法国西南',
    note: '按官方雪道图修正',
    load: () => Promise.all([import('../data/resort.json'), import('../data/scenery.json')]),
    card: () => import('../data/card.json'),
  },
  isola: {
    title: 'Isola 2000', place: 'Isola 2000 · Alpes-Maritimes', region: '滨海阿尔卑斯 · 尼斯以北',
    note: '已对照官方雪道图和 OpenSkiMap 修正',
    load: () => Promise.all([import('../data/isola/resort.json'), import('../data/isola/scenery.json')]),
    card: () => import('../data/isola/card.json'),
  },
  'serre-chevalier': {
    title: 'Serre Chevalier', place: 'Serre Chevalier · Hautes-Alpes', region: '上阿尔卑斯 · Briançon',
    note: '已对照官方雪道图和 OpenSkiMap 修正',
    load: () => Promise.all([import('../data/serre-chevalier/resort.json'), import('../data/serre-chevalier/scenery.json')]),
    card: () => import('../data/serre-chevalier/card.json'),
  },
  'alpe-d-huez': {
    title: "Alpe d'Huez", place: "Alpe d'Huez Grand Domaine · Isère", region: '伊泽尔 · Oisans',
    note: '已对照官方雪道图和 OpenSkiMap 修正',
    load: () => Promise.all([import('../data/alpe-d-huez/resort.json'), import('../data/alpe-d-huez/scenery.json')]),
    card: () => import('../data/alpe-d-huez/card.json'),
  },
  chamrousse: {
    title: 'Chamrousse', place: 'Chamrousse · Isère', region: '伊泽尔 · Grenoble 以东',
    note: '已对照官方雪道图和 OpenSkiMap 修正',
    load: () => Promise.all([import('../data/chamrousse/resort.json'), import('../data/chamrousse/scenery.json')]),
    card: () => import('../data/chamrousse/card.json'),
  },
};

export function chosenResort() {
  const id = new URLSearchParams(location.search).get('resort');
  return RESORTS[id] ? id : null;
}

// The last resort played, remembered per browser so the landing page can point back to it.
export const LAST_KEY = 'ski2d.resort';
