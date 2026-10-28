// Resorts the game can load. Each one's data is a separate chunk, fetched only when chosen.
// The choice lives in the URL (?resort=isola) so a link opens the right mountain.
export const RESORTS = {
  'saint-lary': {
    title: 'Saint-Lary', place: 'Saint-Lary-Soulan · Pyrénées',
    note: '按官方雪道图修正',
    load: () => Promise.all([import('../data/resort.json'), import('../data/scenery.json')]),
  },
  isola: {
    title: 'Isola 2000', place: 'Isola 2000 · Alpes-Maritimes',
    note: '名称与难度按 OSM，尚未对照官方雪道图',
    load: () => Promise.all([import('../data/isola/resort.json'), import('../data/isola/scenery.json')]),
  },
};
export const DEFAULT_RESORT = 'saint-lary';

export function chosenResort() {
  const id = new URLSearchParams(location.search).get('resort');
  return RESORTS[id] ? id : DEFAULT_RESORT;
}
