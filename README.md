# Football Live Bet Tracker

A simple football companion app for tracking your own bet ideas, entering custom stake and odds, and watching live score updates in one screen.

## Live Demo

- Repository: https://github.com/zebibu/football-live-bet-tracker
- GitHub Pages: https://zebibu.github.io/football-live-bet-tracker/

## Preview

![Football Live Bet Tracker preview](./.github/assets/app-preview.png)

## Features

- Live football scoreboard feed with league switching.
- Quick calculator for your own stake, odds, return, and profit.
- Friendly featured match cards with league, team, and date filters.
- Mobile-friendly layout built with React, TypeScript, and Vite.

## Live Data Source

The live panel currently uses ESPN public scoreboard JSON endpoints for:

- Premier League
- La Liga
- Serie A
- Ligue 1

The integration surface is isolated in `src/services/football.ts`, so the provider can be swapped later.

## Run Locally

```bash
npm install
npm run dev
```

Then open `http://localhost:5173`.

## Build

```bash
npm run build
```

## Deploy

This repository includes a GitHub Pages workflow in `.github/workflows/deploy.yml`.
Every push to `main` triggers a production build and deploys the app to GitHub Pages.
