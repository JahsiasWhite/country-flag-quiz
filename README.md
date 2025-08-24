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

# Globe Country Data Setup

This project fetches country metadata and flags from the REST Countries API, prepares JSON files, and downloads all SVG flags locally for use in interactive globe applications.

It also includes a globe component to visualize countries, their names, capitals, and flags in real-time. Includes an additional quiz feature

Images from:

- https://github.com/Siqister/files
- https://www.visibleearth.nasa.gov/collection/1484/blue-marble.?page=1

Favicon:
https://www.svgrepo.com/svg/471481/globe-06

Country Data:
https://raw.githubusercontent.com/datasets/geo-countries/master/data/countries.geojson

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
