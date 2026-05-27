import { CardCvcElement, CardExpiryElement, CardNumberElement, useElements, useStripe } from '@stripe/react-stripe-js'
import { useState } from 'react'

type StripeCardDepositFormProps = {
  amount: string
  userId: string
  username: string
  cardholderName: string
  apiBaseUrl: string
  busy: boolean
  onSuccess: (amount: number) => void
  onError: (message: string) => void
}

const elementOptions = {
  style: {
    base: {
      fontSize: '16px',
      color: '#1c2f28',
      '::placeholder': {
        color: '#7f8c84',
      },
    },
    invalid: {
      color: '#b94a48',
    },
  },
}

export function StripeCardDepositForm({
  amount,
  userId,
  username,
  cardholderName,
  apiBaseUrl,
  busy,
  onSuccess,
  onError,
}: StripeCardDepositFormProps) {
  const stripe = useStripe()
  const elements = useElements()
  const [nameOnCard, setNameOnCard] = useState(cardholderName)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const depositAmount = Number(amount)

    if (!Number.isFinite(depositAmount) || depositAmount <= 0) {
      onError('Enter a valid deposit amount first.')
      return
    }

    if (!stripe || !elements) {
      onError('Stripe card fields are still loading. Try again in a moment.')
      return
    }

    const cardNumberElement = elements.getElement(CardNumberElement)

    if (!cardNumberElement) {
      onError('Card input is not ready yet.')
      return
    }

    try {
      setSubmitting(true)

      const paymentIntentResponse = await fetch(`${apiBaseUrl}/payments/create-payment-intent`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          amount: depositAmount,
          uid: userId,
          username,
        }),
      })

      const paymentIntentData = (await paymentIntentResponse.json()) as {
        clientSecret?: string
        message?: string
      }

      if (!paymentIntentResponse.ok || !paymentIntentData.clientSecret) {
        throw new Error(paymentIntentData.message || 'Could not start the Stripe payment.')
      }

      const result = await stripe.confirmCardPayment(paymentIntentData.clientSecret, {
        payment_method: {
          card: cardNumberElement,
          billing_details: {
            name: nameOnCard.trim() || cardholderName || username,
          },
        },
      })

      if (result.error) {
        throw new Error(result.error.message || 'Card payment failed.')
      }

      if (result.paymentIntent?.status === 'succeeded') {
        const confirmationResponse = await fetch(`${apiBaseUrl}/payments/stripe/payment-intent/${result.paymentIntent.id}`)
        const confirmationData = (await confirmationResponse.json()) as { confirmed?: boolean; message?: string }

        if (!confirmationResponse.ok || !confirmationData.confirmed) {
          throw new Error(confirmationData.message || 'The backend could not confirm the Stripe deposit.')
        }

        onSuccess(depositAmount)
        return
      }

      onError(`Card payment is in ${result.paymentIntent?.status || 'processing'} state.`)
    } catch (error) {
      onError(error instanceof Error ? error.message : 'Card payment failed.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form className="payment-panel stack-gap" onSubmit={handleSubmit}>
      <div className="brand-strip">
        <span className="brand-pill">Visa</span>
        <span className="brand-pill">Mastercard</span>
      </div>

      <div className="card-placeholder-shell">
        <div className="card-placeholder-grid">
          <label className="field-block">
            <span>Cardholder name</span>
            <input value={nameOnCard} onChange={(event) => setNameOnCard(event.target.value)} placeholder="John Smith" autoComplete="cc-name" />
          </label>

          <label className="field-block card-field-wide">
            <span>Card number</span>
            <div className="stripe-element-shell">
              <CardNumberElement options={{ ...elementOptions, placeholder: '1234 5678 9012 3456' }} />
            </div>
          </label>

          <label className="field-block">
            <span>Expiry date</span>
            <div className="stripe-element-shell">
              <CardExpiryElement options={{ ...elementOptions, placeholder: 'MM / YY' }} />
            </div>
          </label>

          <label className="field-block">
            <span>CVC</span>
            <div className="stripe-element-shell">
              <CardCvcElement options={{ ...elementOptions, placeholder: '123' }} />
            </div>
          </label>
        </div>
      </div>

      <p className="helper-copy">
        Card details are encrypted by Stripe Elements. This app does not store raw Visa or Mastercard numbers.
      </p>

      <button type="submit" className="primary-button" disabled={busy || submitting || !stripe}>
        {submitting ? 'Processing card payment...' : 'Pay with Visa or Mastercard'}
      </button>
    </form>
  )
}