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
const paypalBaseUrl =
  paypalEnvironment === 'live' ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com'
const allowedOrigins = (process.env.APP_ORIGIN || 'http://127.0.0.1:5173')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean)
const primaryAppOrigin = allowedOrigins[0] || 'http://127.0.0.1:5173'
const confirmedStripeDeposits = new Map()

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
app.use(express.json())

app.get('/api/health', (_request, response) => {
  response.json({
    ok: true,
    stripeConfigured: Boolean(stripeSecretKey),
    stripeWebhookConfigured: Boolean(stripeWebhookSecret),
    paypalConfigured: isPaypalConfigured(),
  })
})

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