import 'dotenv/config'
import cors from 'cors'
import express from 'express'
import Stripe from 'stripe'

const app = express()
const port = Number(process.env.PORT || 8787)
const stripeSecretKey = process.env.STRIPE_SECRET_KEY
const stripeWebhookSecret = process.env.STRIPE_WEBHOOK_SECRET
const paypalClientId = process.env.PAYPAL_CLIENT_ID
const paypalClientSecret = process.env.PAYPAL_CLIENT_SECRET
const paypalEnvironment = process.env.PAYPAL_ENVIRONMENT === 'live' ? 'live' : 'sandbox'
const footballDataProvider = process.env.FOOTBALL_DATA_PROVIDER === 'football-data' ? 'football-data' : 'espn'
const footballDataApiKey = process.env.FOOTBALL_DATA_API_KEY
const paypalBaseUrl =
  paypalEnvironment === 'live' ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com'
const allowedOrigins = (process.env.APP_ORIGIN || 'http://127.0.0.1:5173')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean)
const primaryAppOrigin = allowedOrigins[0] || 'http://127.0.0.1:5173'
const confirmedStripeDeposits = new Map()
const supportedLiveLeagues = {
  'eng.1': {
    label: 'Premier League',
    espnPath: 'eng.1',
    footballDataCompetition: 'PL',
  },
  'esp.1': {
    label: 'La Liga',
    espnPath: 'esp.1',
    footballDataCompetition: 'PD',
  },
  'ita.1': {
    label: 'Serie A',
    espnPath: 'ita.1',
    footballDataCompetition: 'SA',
  },
  'fra.1': {
    label: 'Ligue 1',
    espnPath: 'fra.1',
    footballDataCompetition: 'FL1',
  },
}

function getStripeClient() {
  if (!stripeSecretKey) {
    throw new Error('Stripe card deposits are not configured yet on the backend.')
  }

  return new Stripe(stripeSecretKey)
}

function rememberConfirmedStripeDeposit(paymentIntent) {
  confirmedStripeDeposits.set(paymentIntent.id, {
    id: paymentIntent.id,
    amount: typeof paymentIntent.amount_received === 'number' ? paymentIntent.amount_received : paymentIntent.amount,
    currency: paymentIntent.currency,
    username: paymentIntent.metadata?.username || 'guest-user',
    status: paymentIntent.status,
    receivedAt: new Date().toISOString(),
  })
}

function isPaypalConfigured() {
  return Boolean(paypalClientId && paypalClientSecret)
}

async function getPaypalAccessToken() {
  if (!paypalClientId || !paypalClientSecret) {
    throw new Error('PayPal credentials are not configured.')
  }

  const response = await fetch(`${paypalBaseUrl}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${paypalClientId}:${paypalClientSecret}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`PayPal token request failed: ${errorText}`)
  }

  const payload = await response.json()
  return payload.access_token
}

async function paypalRequest(path, options = {}) {
  const accessToken = await getPaypalAccessToken()
  const response = await fetch(`${paypalBaseUrl}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`PayPal request failed: ${errorText}`)
  }

  return response.json()
}

function formatMatchKickoff(date) {
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(date))
}

function formatUpdatedAt(date = new Date()) {
  return new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(date)
}

async function fetchEspnLiveScores(leagueKey, leagueConfig) {
  const response = await fetch(`https://site.api.espn.com/apis/site/v2/sports/soccer/${leagueConfig.espnPath}/scoreboard`)

  if (!response.ok) {
    throw new Error('Live score request failed.')
  }

  const data = await response.json()
  const matches =
    data.events?.slice(0, 8).map((event) => {
      const competition = event.competitions?.[0]
      const home = competition?.competitors?.find((team) => team.homeAway === 'home')
      const away = competition?.competitors?.find((team) => team.homeAway === 'away')
      const summaryLink = event.links?.find((link) => link.text === 'Summary')?.href || ''

      return {
        id: event.id,
        homeTeam: home?.team?.displayName || 'Home team',
        awayTeam: away?.team?.displayName || 'Away team',
        homeScore: home?.score || '-',
        awayScore: away?.score || '-',
        status: competition?.status?.type?.detail || competition?.status?.type?.description || 'Scheduled',
        kickoff: formatMatchKickoff(event.date),
        venue: competition?.venue?.fullName || 'Venue pending',
        detailsUrl: summaryLink,
        homeLogo: home?.team?.logo || '',
        awayLogo: away?.team?.logo || '',
      }
    }) || []

  return {
    provider: 'espn',
    league: leagueKey,
    leagueLabel: leagueConfig.label,
    updatedAt: formatUpdatedAt(),
    matches,
  }
}

async function fetchFootballDataLiveScores(leagueKey, leagueConfig) {
  if (!footballDataApiKey) {
    throw new Error('FOOTBALL_DATA_API_KEY is required when FOOTBALL_DATA_PROVIDER=football-data.')
  }

  const response = await fetch(
    `https://api.football-data.org/v4/competitions/${leagueConfig.footballDataCompetition}/matches?status=LIVE,IN_PLAY,PAUSED,FINISHED,SCHEDULED`,
    {
      headers: {
        'X-Auth-Token': footballDataApiKey,
      },
    },
  )

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`football-data.org request failed: ${errorText}`)
  }

  const data = await response.json()
  const matches =
    data.matches?.slice(0, 8).map((match) => ({
      id: String(match.id),
      homeTeam: match.homeTeam?.name || 'Home team',
      awayTeam: match.awayTeam?.name || 'Away team',
      homeScore:
        typeof match.score?.fullTime?.home === 'number'
          ? String(match.score.fullTime.home)
          : match.status === 'SCHEDULED'
            ? '-'
            : String(match.score?.halfTime?.home ?? '-'),
      awayScore:
        typeof match.score?.fullTime?.away === 'number'
          ? String(match.score.fullTime.away)
          : match.status === 'SCHEDULED'
            ? '-'
            : String(match.score?.halfTime?.away ?? '-'),
      status: match.status || 'SCHEDULED',
      kickoff: formatMatchKickoff(match.utcDate),
      venue: match.venue || 'Venue pending',
      detailsUrl: '',
      homeLogo: match.homeTeam?.crest || '',
      awayLogo: match.awayTeam?.crest || '',
    })) || []

  return {
    provider: 'football-data',
    league: leagueKey,
    leagueLabel: leagueConfig.label,
    updatedAt: formatUpdatedAt(),
    matches,
  }
}

async function fetchLiveScores(leagueKey) {
  const leagueConfig = supportedLiveLeagues[leagueKey]

  if (!leagueConfig) {
    throw new Error('Unsupported live-score league.')
  }

  if (footballDataProvider === 'football-data') {
    return fetchFootballDataLiveScores(leagueKey, leagueConfig)
  }

  return fetchEspnLiveScores(leagueKey, leagueConfig)
}

app.use(
  cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true)
        return
      }

      callback(new Error('Origin not allowed by CORS'))
    },
  }),
)

app.post('/api/payments/stripe/webhook', express.raw({ type: 'application/json' }), (request, response) => {
  if (!stripeSecretKey || !stripeWebhookSecret) {
    response.status(503).json({ message: 'Stripe webhook is not configured yet on the backend.' })
    return
  }

  const signature = request.headers['stripe-signature']

  if (!signature || typeof signature !== 'string') {
    response.status(400).json({ message: 'Missing Stripe signature header.' })
    return
  }

  try {
    const stripe = getStripeClient()
    const event = stripe.webhooks.constructEvent(request.body, signature, stripeWebhookSecret)

    if (event.type === 'payment_intent.succeeded') {
      rememberConfirmedStripeDeposit(event.data.object)
    }

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object

      if (session.payment_status === 'paid') {
        confirmedStripeDeposits.set(session.id, {
          id: session.id,
          amount: session.amount_total,
          currency: session.currency,
          username: session.metadata?.username || 'guest-user',
          status: session.payment_status,
          receivedAt: new Date().toISOString(),
        })
      }
    }

    response.json({ received: true })
  } catch (error) {
    response.status(400).json({
      message: error instanceof Error ? error.message : 'Stripe webhook verification failed.',
    })
  }
})

app.use(express.json())

app.get('/api/health', (_request, response) => {
  response.json({
    ok: true,
    stripeConfigured: Boolean(stripeSecretKey),
    stripeWebhookConfigured: Boolean(stripeWebhookSecret),
    paypalConfigured: isPaypalConfigured(),
    footballDataProvider,
  })
})

app.get('/api/football/live', async (request, response) => {
  const league = String(request.query.league || 'eng.1')

  try {
    const overview = await fetchLiveScores(league)
    response.json(overview)
  } catch (error) {
    response.status(500).json({
      message: error instanceof Error ? error.message : 'Could not load live football results.',
    })
  }
})

app.post('/api/payments/create-payment-intent', async (request, response) => {
  const amount = Number(request.body?.amount)
  const username = String(request.body?.username || 'guest-user')

  if (!Number.isFinite(amount) || amount <= 0) {
    response.status(400).json({ message: 'Invalid deposit amount.' })
    return
  }

  if (!stripeSecretKey) {
    response.status(503).json({
      message: 'Stripe card deposits are not configured yet on the backend.',
    })
    return
  }

  try {
    const stripe = getStripeClient()
    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(amount * 100),
      currency: 'usd',
      payment_method_types: ['card'],
      metadata: {
        username,
        amount: amount.toFixed(2),
      },
    })

    response.json({ clientSecret: paymentIntent.client_secret })
  } catch (error) {
    response.status(500).json({
      message: error instanceof Error ? error.message : 'Stripe payment intent creation failed.',
    })
  }
})

app.get('/api/payments/stripe/payment-intent/:paymentIntentId', async (request, response) => {
  if (!stripeSecretKey) {
    response.status(503).json({ message: 'Stripe card deposits are not configured yet on the backend.' })
    return
  }

  const { paymentIntentId } = request.params
  const confirmedDeposit = confirmedStripeDeposits.get(paymentIntentId)

  if (confirmedDeposit) {
    response.json({ confirmed: true, deposit: confirmedDeposit })
    return
  }

  try {
    const stripe = getStripeClient()
    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId)

    response.json({
      confirmed: paymentIntent.status === 'succeeded',
      deposit: {
        id: paymentIntent.id,
        amount: paymentIntent.amount_received || paymentIntent.amount,
        currency: paymentIntent.currency,
        username: paymentIntent.metadata?.username || 'guest-user',
        status: paymentIntent.status,
      },
    })
  } catch (error) {
    response.status(500).json({
      message: error instanceof Error ? error.message : 'Stripe payment intent lookup failed.',
    })
  }
})

app.post('/api/payments/checkout-session', async (request, response) => {
  const amount = Number(request.body?.amount)
  const username = String(request.body?.username || 'guest-user')

  if (!Number.isFinite(amount) || amount <= 0) {
    response.status(400).json({ message: 'Invalid deposit amount.' })
    return
  }

  if (!stripeSecretKey) {
    response.status(503).json({
      message: 'Stripe card deposits are not configured yet on the backend.',
    })
    return
  }

  try {
    const stripe = getStripeClient()
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      success_url: `${primaryAppOrigin}/?deposit=stripe-success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${primaryAppOrigin}/?deposit=cancelled`,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: 'usd',
            unit_amount: Math.round(amount * 100),
            product_data: {
              name: `Wallet deposit for ${username}`,
              description: 'Peer football betting wallet top-up',
            },
          },
        },
      ],
      metadata: {
        username,
        amount: amount.toFixed(2),
      },
    })

    response.json({ url: session.url })
  } catch (error) {
    response.status(500).json({
      message: error instanceof Error ? error.message : 'Stripe session creation failed.',
    })
  }
})

app.get('/api/payments/checkout-session/:sessionId', async (request, response) => {
  if (!stripeSecretKey) {
    response.status(503).json({ message: 'Stripe card deposits are not configured yet on the backend.' })
    return
  }

  try {
    const stripe = getStripeClient()
    const session = await stripe.checkout.sessions.retrieve(request.params.sessionId)

    response.json({
      paymentStatus: session.payment_status,
      amountTotal: session.amount_total,
      currency: session.currency,
    })
  } catch (error) {
    response.status(500).json({
      message: error instanceof Error ? error.message : 'Stripe session lookup failed.',
    })
  }
})

app.post('/api/payments/paypal/order', async (request, response) => {
  const amount = Number(request.body?.amount)
  const username = String(request.body?.username || 'guest-user')

  if (!Number.isFinite(amount) || amount <= 0) {
    response.status(400).json({ message: 'Invalid deposit amount.' })
    return
  }

  if (!isPaypalConfigured()) {
    response.status(503).json({ message: 'PayPal deposits are not configured yet on the backend.' })
    return
  }

  try {
    const order = await paypalRequest('/v2/checkout/orders', {
      method: 'POST',
      body: JSON.stringify({
        intent: 'CAPTURE',
        purchase_units: [
          {
            reference_id: username,
            description: 'Peer football betting wallet top-up',
            amount: {
              currency_code: 'USD',
              value: amount.toFixed(2),
            },
          },
        ],
        application_context: {
          return_url: `${primaryAppOrigin}/?deposit=paypal-success`,
          cancel_url: `${primaryAppOrigin}/?deposit=paypal-cancelled`,
          user_action: 'PAY_NOW',
        },
      }),
    })

    const approveUrl = order.links?.find((link) => link.rel === 'approve')?.href

    if (!approveUrl) {
      throw new Error('PayPal approval URL was not returned.')
    }

    response.json({ url: approveUrl, orderId: order.id })
  } catch (error) {
    response.status(500).json({
      message: error instanceof Error ? error.message : 'PayPal order creation failed.',
    })
  }
})

app.post('/api/payments/paypal/capture', async (request, response) => {
  const orderId = String(request.body?.orderId || '')

  if (!orderId) {
    response.status(400).json({ message: 'Missing PayPal order ID.' })
    return
  }

  if (!isPaypalConfigured()) {
    response.status(503).json({ message: 'PayPal deposits are not configured yet on the backend.' })
    return
  }

  try {
    const capture = await paypalRequest(`/v2/checkout/orders/${orderId}/capture`, {
      method: 'POST',
    })

    const amount = capture.purchase_units?.[0]?.payments?.captures?.[0]?.amount || null

    response.json({
      status: capture.status,
      amount,
    })
  } catch (error) {
    response.status(500).json({
      message: error instanceof Error ? error.message : 'PayPal capture failed.',
    })
  }
})

app.listen(port, () => {
  console.log(`Peer betting backend listening on http://127.0.0.1:${port}`)
})