# Country Flag Quiz

An interactive 3D globe that helps users study basic country data, including location, capital city, and flags. Can be ran locally or accessed online at: [countryflagquiz.com](https://www.countryflagquiz.com)

![Country Flag Quiz Example](/countryflagquizexample.png)

## Installing

Clone this repo

## Downloading country data

1. Ensure you have **Node.js** installed.
2. Install dependencies:

```bash
npm install node-fetch@3
```

- Downloads **all country flags** as SVGs into a `flags` folder.
- Generates **two JSON files**:

  1. `countries-array.json` – array of country objects (`name`, `capital`, `flag`).
  2. `countries-map.json` – object keyed by country name

```bash
node DownloadCountryData.js
```

## Usage

```bash
cd wikipedia-globe
```

```bash
npm i
```

```bash
npm run dev
```

```bash
npm run build
```

## Sources

This project fetches border data from the geo-countries dataset. All country data and earth textures are installed locally.

Earth Textures:

- https://github.com/Siqister/files
- https://www.visibleearth.nasa.gov/collection/1484/blue-marble.?page=1

Country Data:

- https://restcountries.com/v3.1/all?fields=name,capital,flags,cca2

Border Data:

- https://raw.githubusercontent.com/datasets/geo-countries/master/data/countries.geojson

Favicon:

- https://www.svgrepo.com/svg/471481/globe-06

# ISSUES

1. Vatican is in the border dataset but not in the quiz country list (no flag asset yet)

# TODO

1. Option to show names/flags directly on the country on the globe
2. We already have partial wikipedia integration. Now we should have a "Show More" button for the countries. It will open a "card" that has the wiki info on it for easy fact viewing
3. Global leaderboard
4. Multiplayer lobbies. Can just use websockets?
