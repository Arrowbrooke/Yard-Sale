const DEG=111320;
function inRing(point,ring){
  let inside=false;
  for(let i=0,j=ring.length-1;i<ring.length;j=i++){
    const a=ring[i],b=ring[j];
    if((a[1]>point[1])!==(b[1]>point[1])&&point[0]<(b[0]-a[0])*(point[1]-a[1])/(b[1]-a[1])+a[0])inside=!inside;
  }
  return inside;
}
export function distanceToHome(geometry,lng,lat){
  const polygons=geometry?.type==='Polygon'?[geometry.coordinates]:geometry?.type==='MultiPolygon'?geometry.coordinates:[];
  let best=Infinity;
  const xScale=DEG*Math.cos(lat*Math.PI/180);
  for(const polygon of polygons){
    if(inRing([lng,lat],polygon[0])&&!polygon.slice(1).some(r=>inRing([lng,lat],r)))return 0;
    for(const ring of polygon)for(let i=1;i<ring.length;i++){
      const a=[(ring[i-1][0]-lng)*xScale,(ring[i-1][1]-lat)*DEG],b=[(ring[i][0]-lng)*xScale,(ring[i][1]-lat)*DEG];
      const dx=b[0]-a[0],dy=b[1]-a[1],den=dx*dx+dy*dy;
      const t=den?Math.max(0,Math.min(1,-(a[0]*dx+a[1]*dy)/den)):0;
      best=Math.min(best,Math.hypot(a[0]+t*dx,a[1]+t*dy));
    }
  }
  return best;
}
export function homeCenter(geometry){
  const rings=geometry.type==='Polygon'?geometry.coordinates:geometry.coordinates.flat();
  const points=rings.flat();
  const xs=points.map(p=>p[0]),ys=points.map(p=>p[1]);
  return [(Math.min(...ys)+Math.max(...ys))/2,(Math.min(...xs)+Math.max(...xs))/2];
}
export function homeKey(geometry){return JSON.stringify(geometry.coordinates);}
export function findHome(features,lng,lat,maxDistance=18,used=new Set()){
  let best=null,distance=maxDistance;
  for(const feature of features){
    const source=feature.geometry;
    // Vector tiles may pack a whole block into one MultiPolygon feature.
    // Each Polygon component is an individual home, never the entire tile feature.
    const parts=source?.type==='MultiPolygon'?source.coordinates.map(coordinates=>({type:'Polygon',coordinates})):source?.type==='Polygon'?[source]:[];
    for(const geometry of parts){
      const key=homeKey(geometry);if(used.has(key))continue;
      const d=distanceToHome(geometry,lng,lat);
      if(d<=distance){best=geometry;distance=d;if(d===0)return best;}
    }
  }
  return best;
}
