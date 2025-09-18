# ISSUES

1. The findLocation uses the middle point of a location. Some island chains have it wrong then. something by australia is really messed up
2. hoverInfo can get stuck on quiz menu. Be out of quiz, have hoverInfo go ontop, then start quiz. It is now stuck
3. Hovers over wrong location:

- United States minor outlying islands
- Kiribati
- Netherlands

# TODO

1. I should use my own countries.geojson (its a large file) because I've had to prune a lot of countries from countries-map which is more specific. Currently using restcountries for countries-map EX: countries-map has "Netherlands Islands" where this is just labeled as "Netherlands" on geojson.
2. Add loading indicator when app first starts
3. Option to show names/flags directly on the country on the globe
4. We already have partial wikipedia integration. Now we should have a "Show More" button for the countries. It will open a "card" that has the wiki info on it for easy fact viewing
5. When you finish the question, all wrong guesses that had their border changed red should reset back to default
6. findLocation should also flash red
7. default (white) borders should display over wrong/correct (red/green) borders. If a country is surrounded, it can be hard to know it hasn't been clicked

# Country Flag Quiz

An interactive 3D globe that helps users study basic country data, including location, capital city, and flags. Can be ran locally or accessed online at: [countryflagquiz.com](https://www.countryflagquiz.com)

![Country Flag Quiz Example](/public/countryflagquizexample.png)

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
