# ISSUES

# TODO

1. Add loading indicator when app first starts
2. When you enter quiz mode, onHOver should stop showing the hoverInfo
3. Option to show names/flags directly on the country on the globe
4. We already have partial wikipedia integration. Now we should have a "Show More" button for the countries. It will open a "card" that has the wiki info on it for easy fact viewing
5. When you finish the question, all wrong guesses that had their border changed red should reset back to default
6. When you get a question wrong it zooms in on the correct country. It should also flash red
7. The findLocation uses the middle point of a location. Some island chains have it wrong then. something by australia is really messed up

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
