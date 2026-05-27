import 'dotenv/config'
import cors from 'cors'
import express from 'express'
import Stripe from 'stripe'

const app = express()
const port = Number(process.env.PORT || 8787)
const stripeSecretKey = process.env.STRIPE_SECRET_KEY
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
    paypalConfigured: isPaypalConfigured(),
  })
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
    const stripe = new Stripe(stripeSecretKey)
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
    const stripe = new Stripe(stripeSecretKey)
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
    const stripe = new Stripe(stripeSecretKey)
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