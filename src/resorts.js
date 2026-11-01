// Resorts the game can load. Each one's data is a separate chunk, fetched only when chosen.
// The choice lives in the URL (?resort=isola) so a link opens the right mountain; no choice = the landing page.
// region is per language (i18n pick()); note is an i18n key.
// card() is a small summary (stats + thumbnail) for the landing page, built by scripts/build_cards.py.
export const RESORTS = {
  'saint-lary': {
    title: 'Saint-Lary', place: 'Saint-Lary-Soulan · Pyrénées', region: { zh: '比利牛斯山 · 法国西南', en: 'Pyrenees · southwest France', fr: 'Pyrénées · sud-ouest de la France' },
    note: 'noteOfficial',
    load: () => Promise.all([import('../data/resort.json'), import('../data/scenery.json')]),
    card: () => import('../data/card.json'),
  },
  isola: {
    title: 'Isola 2000', place: 'Isola 2000 · Alpes-Maritimes', region: { zh: '滨海阿尔卑斯 · 尼斯以北', en: 'Alpes-Maritimes · north of Nice', fr: 'Alpes-Maritimes · au nord de Nice' },
    note: 'noteOfficialOsm',
    load: () => Promise.all([import('../data/isola/resort.json'), import('../data/isola/scenery.json')]),
    card: () => import('../data/isola/card.json'),
  },
  'serre-chevalier': {
    title: 'Serre Chevalier', place: 'Serre Chevalier · Hautes-Alpes', region: { zh: '上阿尔卑斯 · Briançon', en: 'Hautes-Alpes · Briançon', fr: 'Hautes-Alpes · Briançon' },
    note: 'noteOfficialOsm',
    load: () => Promise.all([import('../data/serre-chevalier/resort.json'), import('../data/serre-chevalier/scenery.json')]),
    card: () => import('../data/serre-chevalier/card.json'),
  },
  'alpe-d-huez': {
    title: "Alpe d'Huez", place: "Alpe d'Huez Grand Domaine · Isère", region: { zh: '伊泽尔 · Oisans', en: 'Isère · Oisans', fr: 'Isère · Oisans' },
    note: 'noteOfficialOsm',
    load: () => Promise.all([import('../data/alpe-d-huez/resort.json'), import('../data/alpe-d-huez/scenery.json')]),
    card: () => import('../data/alpe-d-huez/card.json'),
  },
  chamrousse: {
    title: 'Chamrousse', place: 'Chamrousse · Isère', region: { zh: '伊泽尔 · Grenoble 以东', en: 'Isère · east of Grenoble', fr: 'Isère · à l’est de Grenoble' },
    note: 'noteOfficialOsm',
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
