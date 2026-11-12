// A lookup runs only when a person confirms a pin. Coordinates go to Photon;
// the stop name, notes, visit history, and any manually entered address do not.
const cache = new Map();
export function suggestedAddress(feature) {
  const p=feature?.properties||{};
  const street=p.street||(p.osm_key==='highway'?p.name:'');
  if(!street)return null;
  return {text:[p.housenumber,street].filter(Boolean).join(' '),hasNumber:Boolean(p.housenumber)};
}
export async function lookupAddress(lat,lng,endpoint) {
  if(!endpoint)throw new Error('Address lookup is disabled');
  const key=lat.toFixed(5)+','+lng.toFixed(5);
  if(cache.has(key))return cache.get(key);
  try {
    const stored=JSON.parse(localStorage.getItem('arrowbrooke-address-'+key)||'null');
    if(stored&&Date.now()-stored.time<7*24*60*60*1000){cache.set(key,stored.result);return stored.result;}
  }catch{}
  const url=new URL(endpoint);
  url.searchParams.set('lat',lat);url.searchParams.set('lon',lng);
  url.searchParams.set('limit','3');url.searchParams.set('radius','0.1');url.searchParams.set('lang','en');
  const response=await fetch(url,{signal:AbortSignal.timeout(8000),credentials:'omit',referrerPolicy:'strict-origin-when-cross-origin'});
  if(!response.ok)throw new Error('Address lookup unavailable');
  const data=await response.json();
  const result=(data.features||[]).map(suggestedAddress).find(Boolean)||null;
  cache.set(key,result);
  try{localStorage.setItem('arrowbrooke-address-'+key,JSON.stringify({time:Date.now(),result}));}catch{}
  return result;
}
