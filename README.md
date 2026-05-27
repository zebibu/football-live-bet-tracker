# Betting

A simple, friendly football betting companion built with React, TypeScript, and Vite.

## What it does

- Shows a clean dashboard for featured football picks.
- Includes league, team, and date filters for the featured match cards.
- Polls live football scoreboard data for major leagues.
- Lets you enter your own stake and odds instead of depending on a bookmaker app.

## Run locally

1. Open the folder `C:/Users/zebib/Desktop/betting` in VS Code.
2. Run `npm install` if dependencies are missing.
3. Start the app with `npm run dev`.
4. Open the local URL shown by Vite, usually `http://localhost:5173`.

You can also use the included VS Code tasks:

- `dev`
- `build`

## Live football source

The live panel currently uses ESPN public scoreboard JSON endpoints for leagues such as:

- Premier League
- La Liga
- Serie A
- Ligue 1

If you later switch to another football provider, the change should stay mostly inside `src/services/football.ts`.
