import simplify from 'simplify-geojson';

const getGeo = async (url) => {
  const p = fetch(url).then((r) => {
    if (!r.ok) throw new Error(`Failed ${r.status} for ${url}`);
    return r.json();
  });
  return p;
};

const url =
  'https://raw.githubusercontent.com/datasets/geo-countries/master/data/countries.geojson';
const geo = await getGeo(url);

const simplified = simplify(geo, 0.1);
