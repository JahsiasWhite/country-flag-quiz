// fetch_countries.js
import fs from 'fs';
import path from 'path';
import fetch from 'node-fetch';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const FLAGS_DIR = path.join(__dirname, 'flags');
if (!fs.existsSync(FLAGS_DIR)) fs.mkdirSync(FLAGS_DIR);

async function downloadSVG(url, dest) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status}`);
  const svg = await res.text();
  fs.writeFileSync(dest, svg, 'utf-8');
}

async function main() {
  const res = await fetch(
    'https://restcountries.com/v3.1/all?fields=name,capital,flags,cca2'
  );
  if (!res.ok) throw new Error(`Failed to fetch countries: ${res.status}`);
  const countries = await res.json();

  const arrayOutput = [];
  const mapOutput = {};

  for (const c of countries) {
    const name = c.name.common;
    const capital = c.capital?.[0] || '—';
    const iso2 = c.cca2.toLowerCase();
    const flagPath = `/flags/${iso2}.svg`;

    try {
      await downloadSVG(c.flags.svg, path.join(FLAGS_DIR, `${iso2}.svg`));
      console.log(`Downloaded flag for ${name}`);
    } catch (err) {
      console.error(`Failed to download flag for ${name}: ${err.message}`);
    }

    const countryData = { name, capital, flag: flagPath };
    arrayOutput.push(countryData);
    mapOutput[name] = { capital, flag: flagPath };
  }

  fs.writeFileSync(
    path.join(__dirname, 'countries-array.json'),
    JSON.stringify(arrayOutput, null, 2),
    'utf-8'
  );
  fs.writeFileSync(
    path.join(__dirname, 'countries-map.json'),
    JSON.stringify(mapOutput, null, 2),
    'utf-8'
  );

  console.log('Both countries-array.json and countries-map.json created!');
}

main().catch(console.error);
