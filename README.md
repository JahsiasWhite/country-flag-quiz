# ISSUES

1. onclick should not trigger when dragging/stop dragging
2. The globe/scene should encompass the entire screen. But no overflow

# TODO

1. Option to show names/flags directly on the country on the globe
2. Option to change the quiz type instead of doing all types at once

# Globe Country Data Setup

This project fetches country metadata and flags from the REST Countries API, prepares JSON files, and downloads all SVG flags locally for use in interactive globe applications.

It also includes a globe component to visualize countries, their names, capitals, and flags in real-time. Includes an additional quiz feature

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
