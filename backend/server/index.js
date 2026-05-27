import 'dotenv/config'
import cors from 'cors'
import express from 'express'
import Stripe from 'stripe'

const app = express()
const port = Number(process.env.PORT || 8787)
const stripeSecretKey = process.env.STRIPE_SECRET_KEY
const appOrigin = process.env.APP_ORIGIN || 'http://127.0.0.1:5173'

app.use(cors({ origin: appOrigin }))
app.use(express.json())

app.get('/api/health', (_request, response) => {
  response.json({ ok: true, stripeConfigured: Boolean(stripeSecretKey) })
})

app.post('/api/payments/checkout-session', async (request, response) => {
  const amount = Number(request.body?.amount)
  const username = String(request.body?.username || 'guest-user')

  if (!Number.isFinite(amount) || amount <= 0) {
    response.status(400).json({ message: 'Invalid deposit amount.' })
    return
  }

  if (!stripeSecretKey) {
    response.json({
      message: 'Stripe secret key is not configured, so the frontend can simulate deposits while you wire your local .env.',
    })
    return
  }

  try {
    const stripe = new Stripe(stripeSecretKey)
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      success_url: `${appOrigin}/?deposit=success`,
      cancel_url: `${appOrigin}/?deposit=cancelled`,
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
      },
    })

    response.json({ url: session.url })
  } catch (error) {
    response.status(500).json({
      message: error instanceof Error ? error.message : 'Stripe session creation failed.',
    })
  }
})

app.listen(port, () => {
  console.log(`Peer betting backend listening on http://127.0.0.1:${port}`)
})