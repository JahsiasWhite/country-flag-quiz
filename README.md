# ISSUES

1. Fix the hoverInfo. If you move the mouse too quick, it ends up on top of it
2. After you end quiz, the border colors should reset

# TODO

1. Option to show names/flags directly on the country on the globe
2. Fix quiz mode timer
3. In quiz mode, when getting a wrong answer, maybe it should move the globe or highlight the correct country or direction?
4. In quiz mode, button that says "Show location" and it moves and centers above the country.
5. Load 21k textures only if requested. load 8k by default
6. Show summary after clicking "End Quiz"

# Globe Country Data Setup

This project fetches country metadata and flags from the REST Countries API, prepares JSON files, and downloads all SVG flags locally for use in interactive globe applications.

It also includes a globe component to visualize countries, their names, capitals, and flags in real-time. Includes an additional quiz feature

Images from:

- https://github.com/Siqister/files
- https://www.visibleearth.nasa.gov/collection/1484/blue-marble.?page=1

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
