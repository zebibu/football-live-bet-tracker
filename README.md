# Football Live Bet Tracker

A peer-to-peer football betting prototype where friends can sign in, browse games for today and tomorrow, offer custom odds to each other, lock a deal only after both sides are funded, and monitor live score updates through the backend from a free score provider.

## Project Structure

- `frontend/` contains the React, Vite, and Firebase client.
- `backend/` contains the Express and Stripe API.
- the root `package.json` runs both folders through npm workspaces.

## Live Demo

- Repository: https://github.com/zebibu/football-live-bet-tracker

## Preview

![Football Live Bet Tracker preview](./.github/assets/app-preview.png)

## Features

- Sign-in and sign-up entry screen.
- Peer bet lobby with today, tomorrow, and upcoming football games.
- Custom offer flow where one friend proposes odds and another accepts the deal.
- Deposit and withdrawal screens with a Stripe-backed deposit server scaffold.
- Deposit methods for Visa, Mastercard, and PayPal.
- Live football scoreboard feed with league switching.
- Profile view with wallet and locked deals.

## Live Data Source

The live panel now loads through the backend at `/api/football/live`, so the frontend only talks to your own API in local development and production.

By default the backend uses ESPN public scoreboard JSON endpoints for:

- Premier League
- La Liga
- Serie A
- Ligue 1

If you want to switch the backend to football-data.org, set:

```env
FOOTBALL_DATA_PROVIDER=football-data
FOOTBALL_DATA_API_KEY=your_football_data_api_key
```

The frontend integration surface stays isolated in `frontend/src/services/football.ts`, and the provider selection now lives in `backend/server/index.js`.

## Run Locally

```bash
npm install
npm run dev:full
```

This starts:

- the Vite frontend at `http://127.0.0.1:5173`
- the local backend at `http://127.0.0.1:8787`

## Stripe setup

Do not reuse any secret key that was pasted into chat. Revoke it in Stripe and create a fresh one.

Copy `backend/.env.example` to `backend/.env` and set:

```env
APP_ORIGIN=http://127.0.0.1:5173,https://your-vercel-app.vercel.app
STRIPE_SECRET_KEY=your_fresh_secret_key_here
STRIPE_WEBHOOK_SECRET=your_stripe_webhook_signing_secret
PAYPAL_CLIENT_ID=your_paypal_client_id
PAYPAL_CLIENT_SECRET=your_paypal_client_secret
PAYPAL_ENVIRONMENT=sandbox
FOOTBALL_DATA_PROVIDER=espn
```

Card deposits require Stripe. PayPal deposits require a PayPal REST app. Both payment methods redirect the user to the provider and return to the app after approval.

### Stripe webhook setup

The backend now includes a verified Stripe webhook endpoint at `/api/payments/stripe/webhook`.

Use Stripe CLI locally:

```bash
stripe listen --forward-to http://127.0.0.1:8787/api/payments/stripe/webhook
```

Stripe will print a signing secret that starts with `whsec_`. Put that only in `backend/.env` as `STRIPE_WEBHOOK_SECRET`.

The webhook currently confirms successful Stripe payments server-side and keeps recent confirmations in backend memory. For a production build, the next step after this is persisting those confirmations in a database-backed wallet ledger.

## Social sign-in setup

The app now has email/password, Google, Facebook, and Apple sign-in through Firebase Authentication.

Copy `frontend/.env.example` to `frontend/.env` and add these values:

```env
VITE_API_BASE_URL=http://127.0.0.1:8787/api
VITE_STRIPE_PUBLISHABLE_KEY=your_stripe_publishable_key
VITE_FIREBASE_API_KEY=your_firebase_web_api_key
VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your-project-id
VITE_FIREBASE_APP_ID=your-firebase-app-id
```

Then enable the providers in Firebase Authentication:

- Email/Password
- Google
- Facebook
- Apple

Facebook and Apple also require provider credentials configured in the Firebase console before the popup flow will work.

The sign-in screen also includes:

- friendlier Firebase auth errors
- a `Forgot password?` reset email action

## Payment methods

The deposit screen now supports:

- Visa via Stripe Elements
- Mastercard via Stripe Elements
- PayPal via PayPal Orders API

The app redirects the user to the selected provider and confirms the payment when the provider returns to the app.
Stripe payments now also have a server-side webhook confirmation path.

## Build

```bash
npm run build
```

## Deploy

### Render backend

- `render.yaml` is included at the repo root.
- Create a new Render Web Service from this repo.
- Render will use `backend/` as the service root, run `npm install`, and start with `npm start`.
- Render health check uses `/api/health`.
- Set `APP_ORIGIN` to your allowed frontend URLs, separated by commas.
- Set `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, and the PayPal env values in Render if you want both payment methods live.
- Leave `FOOTBALL_DATA_PROVIDER=espn` for the default free provider, or switch to `football-data` and add `FOOTBALL_DATA_API_KEY`.

Example:

```env
APP_ORIGIN=http://127.0.0.1:5173,https://your-vercel-app.vercel.app
```

After Render gives you a backend URL such as `https://football-live-bet-backend.onrender.com`, use it as the frontend API base URL.

### Vercel frontend

- Import this repository into Vercel.
- Set the project root directory to `frontend`.
- Vercel should detect the Vite build automatically. If it does not, use `npm run build` as the build command and `dist` as the output directory.
- Add these Vercel environment variables:

```env
VITE_API_BASE_URL=https://football-live-bet-backend.onrender.com/api
VITE_STRIPE_PUBLISHABLE_KEY=your_stripe_publishable_key
VITE_FIREBASE_API_KEY=your_firebase_web_api_key
VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your-project-id
VITE_FIREBASE_APP_ID=your-firebase-app-id
```

Recommended Vercel + Render flow:

1. Create the Render web service from this repo.
2. Set `APP_ORIGIN`, Stripe, and PayPal variables in Render.
3. Copy the Render backend URL.
4. In Vercel, set `VITE_API_BASE_URL` to that backend URL plus `/api`.
5. Deploy the frontend from the `frontend` directory in Vercel.

### Railway backend

- `railway.json` is included at the repo root.
- In Railway, set the service root directory to `backend`.
- Railway will run `npm install` and `npm start`.
- Set the same `APP_ORIGIN` and `STRIPE_SECRET_KEY` environment variables.

### Frontend production env

When the backend is deployed, point the frontend to it in `frontend/.env`:

```env
VITE_API_BASE_URL=https://your-backend-domain/api
```

That is the cleanest setup when Vercel serves the frontend and Render serves the backend separately.
