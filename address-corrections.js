const removedAddressKeys = new Set([
  '891 PLEASANT KNOLL TRL',
  '903 WHITE WATER WAY',
  '602 ARROW BROOKE AVE',
  '603 ARROW BROOKE AVE',
  '797 ARROW BROOKE AVE',
  '1200 SARATOGA RD',
  '1233 ARROW BROOKE AVE',
  '1368 MORNING RIDGE TRL',
  '1442 PLEASANT KNOLL TRL',
  '1769 BLAKELY PL',
  '1904 ARROW BROOKE AVE',
  '1100 SARATOGA RD',
  '1151 ARROWWOOD DR',
  '2618 CLYDE PARK',
  '2722 CLYDE PARK',
  '2818 CLYDE PARK',
  '902 ARROW BROOKE AVE',
  '1108 ARROW BROOKE AVE',
  '1334 ARROW BROOKE AVE',
  '1462 ARROW BROOKE AVE',
  '2104 WINN RIDGE BLVD',
  '1602 BERRY RIDGE TRL',
  '2408 WHEELER AVE',
  '2412 WHEELER AVE',
  '2416 WHEELER AVE',
  '2500 WHEELER AVE',
  '2504 WHEELER AVE',
  '2508 WHEELER AVE',
  '2512 WHEELER AVE',
  '2516 WHEELER AVE',
  '2520 WHEELER AVE',
  '2524 WHEELER AVE',
  '2530 WINN RIDGE BLVD'
]);

const addedAddresses = [
  {
    type: 'Feature',
    properties: { number: '1455', street: 'WHITE WATER WAY', building_match_m: 0 },
    geometry: { type: 'Point', coordinates: [-96.9018221, 33.248491575] }
  },
  {
    type: 'Feature',
    properties: { number: '1501', street: 'BERRY RIDGE TRL', building_match_m: 0 },
    geometry: { type: 'Point', coordinates: [-96.901459, 33.250212] }
  }
];

const correctedCoordinates = new Map([
  ['3321 ANTELOPE VIEW', [-96.908904, 33.251195]],
  ['1321 COYOTE RIDGE', [-96.905416, 33.251282]],
  ['3330 ADOBE VISTA', [-96.905294, 33.251072]],
  ['3316 ADOBE VISTA', [-96.905206, 33.250916]],
  ['1500 BERRY RIDGE TRL', [-96.901469, 33.250024]],
  ['1505 BERRY RIDGE TRL', [-96.901315, 33.250375]],
  ['3324 GRANDE VIEW', [-96.897099, 33.250828]],
  ['1308 MORNING RIDGE TRL', [-96.906044, 33.250008]]
]);

const addressKey = (feature) => {
  const number = String(feature.properties?.number || '').trim();
  const street = String(feature.properties?.street || '').trim().toUpperCase();
  return `${number} ${street}`.trim();
};

export function applyAddressCorrections(collection) {
  const features = (collection.features || [])
    .filter((feature) => !removedAddressKeys.has(addressKey(feature)))
    .map((feature) => {
      const coordinates = correctedCoordinates.get(addressKey(feature));
      if (!coordinates) return feature;
      const corrected = structuredClone(feature);
      corrected.geometry.coordinates = [...coordinates];
      corrected.properties.building_match_m = 0;
      return corrected;
    });
  const existing = new Set(features.map(addressKey));
  for (const feature of addedAddresses) {
    if (!existing.has(addressKey(feature))) features.push(structuredClone(feature));
  }
  return { ...collection, features };
}
