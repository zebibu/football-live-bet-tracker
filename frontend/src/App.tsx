import { Elements } from '@stripe/react-stripe-js'
import { loadStripe } from '@stripe/stripe-js'
import { useEffect, useMemo, useRef, useState } from 'react'
import './App.css'
import {
  fetchLiveScoreOverview,
  liveLeagueOptions,
  type LiveScoreOverview,
} from './services/football'
import {
  describeAuthError,
  isFirebaseAuthReady,
  listenToAuthState,
  sendResetPasswordEmail,
  signInWithEmail,
  signInWithSocialProvider,
  signOutUser,
  signUpWithEmail,
  toAuthProfile,
  type SocialProviderName,
} from './auth/firebase'
import { StripeCardDepositForm } from './components/StripeCardDepositForm'

type Screen = 'lobby' | 'deposit' | 'withdrawal' | 'profile'
type AuthMode = 'signin' | 'signup'
type GameTab = 'today' | 'tomorrow' | 'upcoming'
type DepositMethod = 'card' | 'paypal'

type UserProfile = {
  name: string
  email: string
  username: string
  photoUrl?: string | null
}

type BetGame = {
  id: string
  league: string
  kickoff: string
  dayLabel: GameTab
  dateLabel: string
  home: string
  away: string
  marketHint: string
}

type Offer = {
  id: string
  gameId: string
  gameLabel: string
  offeredBy: string
  proposedOdds: number
  stake: number
  note: string
  creatorFunded: boolean
  status: 'open' | 'matched'
}

type Deal = {
  id: string
  gameLabel: string
  opponent: string
  agreedOdds: number
  stake: number
  status: 'locked' | 'settled'
}

const betGames: BetGame[] = [
  {
    id: 'g1',
    league: 'Premier League',
    kickoff: '20:00',
    dayLabel: 'today',
    dateLabel: 'Today',
    home: 'Arsenal',
    away: 'Brighton',
    marketHint: 'Match winner',
  },
  {
    id: 'g2',
    league: 'Serie A',
    kickoff: '21:00',
    dayLabel: 'today',
    dateLabel: 'Today',
    home: 'Inter',
    away: 'Napoli',
    marketHint: 'Both teams to score',
  },
  {
    id: 'g3',
    league: 'La Liga',
    kickoff: '19:30',
    dayLabel: 'tomorrow',
    dateLabel: 'Tomorrow',
    home: 'Real Madrid',
    away: 'Sevilla',
    marketHint: 'Over 2.5 goals',
  },
  {
    id: 'g4',
    league: 'Ligue 1',
    kickoff: '18:30',
    dayLabel: 'tomorrow',
    dateLabel: 'Tomorrow',
    home: 'PSG',
    away: 'Monaco',
    marketHint: 'Double chance',
  },
  {
    id: 'g5',
    league: 'Premier League',
    kickoff: '17:00',
    dayLabel: 'upcoming',
    dateLabel: 'This weekend',
    home: 'Liverpool',
    away: 'Chelsea',
    marketHint: 'Correct score',
  },
  {
    id: 'g6',
    league: 'Serie A',
    kickoff: '20:45',
    dayLabel: 'upcoming',
    dateLabel: 'This weekend',
    home: 'Juventus',
    away: 'Roma',
    marketHint: 'First goal scorer',
  },
]

const seedOffers: Offer[] = [
  {
    id: 'o1',
    gameId: 'g1',
    gameLabel: 'Arsenal vs Brighton',
    offeredBy: 'Samuel',
    proposedOdds: 1.92,
    stake: 25,
    note: 'I take Arsenal, you take the draw or Brighton.',
    creatorFunded: true,
    status: 'open',
  },
  {
    id: 'o2',
    gameId: 'g3',
    gameLabel: 'Real Madrid vs Sevilla',
    offeredBy: 'Marta',
    proposedOdds: 2.15,
    stake: 18,
    note: 'Offer is ready if you want the goals side.',
    creatorFunded: true,
    status: 'open',
  },
]

const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL || '/api').replace(/\/$/, '')
const acceptedCardBrands = ['Visa', 'Mastercard']
const stripePublishableKey = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY || ''
const stripePromise = stripePublishableKey ? loadStripe(stripePublishableKey) : null

function App() {
  const [authMode, setAuthMode] = useState<AuthMode>('signin')
  const [user, setUser] = useState<UserProfile | null>(null)
  const [authBusy, setAuthBusy] = useState<SocialProviderName | 'email' | 'reset' | null>(null)
  const [authName, setAuthName] = useState('')
  const [authEmail, setAuthEmail] = useState('')
  const [authPassword, setAuthPassword] = useState('')
  const [activeScreen, setActiveScreen] = useState<Screen>('lobby')
  const [walletBalance, setWalletBalance] = useState(40)
  const [selectedTab, setSelectedTab] = useState<GameTab>('today')
  const [selectedGameId, setSelectedGameId] = useState(betGames[0].id)
  const [offerOdds, setOfferOdds] = useState('1.95')
  const [offerStake, setOfferStake] = useState('15')
  const [offerNote, setOfferNote] = useState('')
  const [depositAmount, setDepositAmount] = useState('25')
  const [depositMethod, setDepositMethod] = useState<DepositMethod>('card')
  const [depositBusy, setDepositBusy] = useState<DepositMethod | 'confirm' | null>(null)
  const [withdrawAmount, setWithdrawAmount] = useState('10')
  const [statusMessage, setStatusMessage] = useState('')
  const [offers, setOffers] = useState<Offer[]>(seedOffers)
  const [deals, setDeals] = useState<Deal[]>([])
  const [footballOverview, setFootballOverview] = useState<LiveScoreOverview | null>(null)
  const [footballError, setFootballError] = useState('')
  const [selectedLiveLeague, setSelectedLiveLeague] = useState(liveLeagueOptions[0].slug)
  const [firebaseReady] = useState(isFirebaseAuthReady())
  const processedDepositRef = useRef<string | null>(null)

  const filteredGames = useMemo(
    () => betGames.filter((game) => game.dayLabel === selectedTab),
    [selectedTab],
  )
  const selectedGame = filteredGames.find((game) => game.id === selectedGameId) || filteredGames[0] || betGames[0]
  const selectedGameOffers = offers.filter((offer) => offer.gameId === selectedGame?.id && offer.status === 'open')

  useEffect(() => {
    if (filteredGames.length > 0 && !filteredGames.some((game) => game.id === selectedGameId)) {
      setSelectedGameId(filteredGames[0].id)
    }
  }, [filteredGames, selectedGameId])

  useEffect(() => {
    const unsubscribe = listenToAuthState((firebaseUser) => {
      if (!firebaseUser) {
        setUser(null)
        return
      }

      setUser(toAuthProfile(firebaseUser))
      setStatusMessage(`Welcome ${firebaseUser.displayName || firebaseUser.email || 'friend'}. Your peer betting lobby is ready.`)
    })

    return unsubscribe
  }, [])

  useEffect(() => {
    let active = true
    let timer: ReturnType<typeof setInterval> | undefined

    async function loadOverview() {
      try {
        const data = await fetchLiveScoreOverview(selectedLiveLeague)

        if (active) {
          setFootballOverview(data)
          setFootballError('')
        }
      } catch {
        if (active) {
          setFootballError('Live football info is unavailable right now.')
        }
      }
    }

    void loadOverview()
    timer = setInterval(() => {
      void loadOverview()
    }, 30000)

    return () => {
      active = false
      if (timer) {
        clearInterval(timer)
      }
    }
  }, [selectedLiveLeague])

  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search)
    const depositResult = searchParams.get('deposit')
    const stripeSessionId = searchParams.get('session_id')
    const paypalOrderId = searchParams.get('token')

    if (!depositResult) {
      return
    }

    const depositKey = `${depositResult}:${stripeSessionId || paypalOrderId || 'none'}`

    if (processedDepositRef.current === depositKey) {
      return
    }

    processedDepositRef.current = depositKey

    function clearDepositQuery() {
      const nextUrl = new URL(window.location.href)
      nextUrl.searchParams.delete('deposit')
      nextUrl.searchParams.delete('session_id')
      nextUrl.searchParams.delete('token')
      nextUrl.searchParams.delete('PayerID')
      window.history.replaceState({}, document.title, `${nextUrl.pathname}${nextUrl.search}${nextUrl.hash}`)
    }

    async function confirmDepositReturn() {
      if (depositResult === 'cancelled') {
        setStatusMessage('Card deposit was cancelled before payment was completed.')
        clearDepositQuery()
        return
      }

      if (depositResult === 'paypal-cancelled') {
        setStatusMessage('PayPal deposit was cancelled before approval.')
        clearDepositQuery()
        return
      }

      try {
        setDepositBusy('confirm')

        if (depositResult === 'stripe-success' && stripeSessionId) {
          const response = await fetch(`${apiBaseUrl}/payments/checkout-session/${stripeSessionId}`)
          const data = (await response.json()) as {
            message?: string
            paymentStatus?: string | null
            amountTotal?: number | null
          }

          if (!response.ok) {
            throw new Error(data.message || 'Could not confirm the Stripe card deposit.')
          }

          if (data.paymentStatus === 'paid' && typeof data.amountTotal === 'number') {
            const confirmedAmount = data.amountTotal
            setWalletBalance((current) => current + confirmedAmount / 100)
            setStatusMessage(`Card deposit confirmed. ${acceptedCardBrands.join(' and ')} payments are now live on your wallet.`)
          } else {
            setStatusMessage('Card payment is still processing. Refresh again in a few moments if your wallet does not update.')
          }

          clearDepositQuery()
          return
        }

        if (depositResult === 'paypal-success' && paypalOrderId) {
          const response = await fetch(`${apiBaseUrl}/payments/paypal/capture`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ orderId: paypalOrderId }),
          })
          const data = (await response.json()) as {
            message?: string
            status?: string
            amount?: { value?: string }
          }

          if (!response.ok) {
            throw new Error(data.message || 'Could not capture the PayPal deposit.')
          }

          if (data.status === 'COMPLETED' && data.amount?.value) {
            setWalletBalance((current) => current + Number(data.amount?.value || 0))
            setStatusMessage('PayPal deposit completed and added to your wallet.')
          } else {
            setStatusMessage('PayPal approved the deposit, but completion is still pending.')
          }

          clearDepositQuery()
        }
      } catch (error) {
        setStatusMessage(error instanceof Error ? error.message : 'Deposit confirmation failed.')
        clearDepositQuery()
      } finally {
        setDepositBusy(null)
      }
    }

    void confirmDepositReturn()
  }, [])

  async function handleAuthSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!firebaseReady) {
      setStatusMessage('Add your Firebase web config in .env and enable Email/Password in Firebase Authentication first.')
      return
    }

    try {
      setAuthBusy('email')
      const firebaseUser =
        authMode === 'signup'
          ? await signUpWithEmail(authEmail.trim(), authPassword, authName.trim())
          : await signInWithEmail(authEmail.trim(), authPassword)

      setUser(toAuthProfile(firebaseUser))
      setStatusMessage(`Welcome ${firebaseUser.displayName || firebaseUser.email || 'friend'}. Your peer betting lobby is ready.`)
      setAuthPassword('')
    } catch (error) {
      setStatusMessage(describeAuthError(error))
    } finally {
      setAuthBusy(null)
    }
  }

  async function handleSocialSignIn(providerName: SocialProviderName) {
    if (!firebaseReady) {
      setStatusMessage('Add your Firebase web config in .env before using Google, Facebook, or Apple sign-in.')
      return
    }

    try {
      setAuthBusy(providerName)
      const signedInUser = await signInWithSocialProvider(providerName)
      setUser(toAuthProfile(signedInUser))
      setStatusMessage(`Welcome ${signedInUser.displayName || signedInUser.email || 'friend'}. Your peer betting lobby is ready.`)
    } catch (error) {
      setStatusMessage(describeAuthError(error))
    } finally {
      setAuthBusy(null)
    }
  }

  async function handleForgotPassword() {
    if (!firebaseReady) {
      setStatusMessage('Add your Firebase web config in .env and enable Email/Password in Firebase Authentication first.')
      return
    }

    try {
      setAuthBusy('reset')
      await sendResetPasswordEmail(authEmail.trim())
      setStatusMessage(`Password reset email sent to ${authEmail.trim()}.`)
    } catch (error) {
      setStatusMessage(describeAuthError(error))
    } finally {
      setAuthBusy(null)
    }
  }

  async function signOut() {
    try {
      if (firebaseReady) {
        await signOutUser()
      }
    } catch {
      setStatusMessage('Sign out finished locally, but the social provider session may still need to be closed in the provider window.')
    }

    setUser(null)
    setActiveScreen('lobby')
    setStatusMessage('You have been signed out.')
  }

  function createOffer() {
    if (!selectedGame) {
      return
    }

    const stakeValue = Number(offerStake)
    const oddsValue = Number(offerOdds)

    if (!Number.isFinite(stakeValue) || stakeValue <= 0 || !Number.isFinite(oddsValue) || oddsValue < 1.01) {
      setStatusMessage('Enter a valid stake and odds before sending an offer.')
      return
    }

    if (walletBalance < stakeValue) {
      setStatusMessage('Deposit enough money before you can lock this offer.')
      setActiveScreen('deposit')
      return
    }

    setWalletBalance((current) => current - stakeValue)
    setOffers((current) => [
      {
        id: `offer-${Date.now()}`,
        gameId: selectedGame.id,
        gameLabel: `${selectedGame.home} vs ${selectedGame.away}`,
        offeredBy: user?.name || 'You',
        proposedOdds: oddsValue,
        stake: stakeValue,
        note: offerNote || 'Custom offer ready for a friend.',
        creatorFunded: true,
        status: 'open',
      },
      ...current,
    ])
    setOfferNote('')
    setStatusMessage('Your offer is live and your stake is locked until matched or cancelled.')
  }

  function acceptOffer(offer: Offer) {
    if (walletBalance < offer.stake) {
      setStatusMessage('You need to deposit before you can match this deal.')
      setActiveScreen('deposit')
      return
    }

    setWalletBalance((current) => current - offer.stake)
    setOffers((current) =>
      current.map((entry) => (entry.id === offer.id ? { ...entry, status: 'matched' } : entry)),
    )
    setDeals((current) => [
      {
        id: `deal-${offer.id}`,
        gameLabel: offer.gameLabel,
        opponent: offer.offeredBy,
        agreedOdds: offer.proposedOdds,
        stake: offer.stake,
        status: 'locked',
      },
      ...current,
    ])
    setStatusMessage('Deal matched. Both sides are funded and the bet is locked on that game.')
  }

  async function beginPayPalDeposit() {
    const amount = Number(depositAmount)

    if (!Number.isFinite(amount) || amount <= 0) {
      setStatusMessage('Enter a valid deposit amount first.')
      return
    }

    try {
      setDepositBusy('paypal')
      const response = await fetch(`${apiBaseUrl}/payments/paypal/order`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          amount,
          username: user?.username || 'guest-user',
        }),
      })
      const data = (await response.json()) as { url?: string; message?: string }

      if (!response.ok) {
        throw new Error(data.message || 'PayPal deposit request failed.')
      }

      if (data.url) {
        window.location.href = data.url
        return
      }

      throw new Error(data.message || 'PayPal did not return an approval URL.')
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : 'PayPal deposit request failed.')
    } finally {
      setDepositBusy(null)
    }
  }

  function requestWithdrawal() {
    const amount = Number(withdrawAmount)

    if (!Number.isFinite(amount) || amount <= 0) {
      setStatusMessage('Enter a valid withdrawal amount.')
      return
    }

    if (amount > walletBalance) {
      setStatusMessage('You cannot withdraw more than your available balance.')
      return
    }

    setWalletBalance((current) => current - amount)
    setStatusMessage('Withdrawal request queued. In a real build this would need payout verification on the backend.')
  }

  if (!user) {
    return (
      <main className="auth-shell">
        <section className="auth-hero">
          <span className="eyebrow">Peer football betting</span>
          <h1>Sign in, track scores, and make private deals with friends.</h1>
          <p>
            Pick a football game, offer your own price, wait for your friend to accept,
            and only lock the bet after both wallets are funded.
          </p>
        </section>

        <section className="auth-panel">
          <div className="auth-switcher">
            <button type="button" className={authMode === 'signin' ? 'active' : ''} onClick={() => setAuthMode('signin')}>
              Sign in
            </button>
            <button type="button" className={authMode === 'signup' ? 'active' : ''} onClick={() => setAuthMode('signup')}>
              Sign up
            </button>
          </div>

          <div className="social-auth-block">
            <p className="helper-copy">Use a social account for real sign-in, or use Firebase email/password below.</p>
            <div className="social-auth-grid">
              <button
                type="button"
                className="social-auth-button"
                onClick={() => void handleSocialSignIn('google')}
                disabled={authBusy !== null}
              >
                {authBusy === 'google' ? 'Opening Google...' : `${authMode === 'signin' ? 'Sign in' : 'Sign up'} with Google`}
              </button>
              <button
                type="button"
                className="social-auth-button"
                onClick={() => void handleSocialSignIn('facebook')}
                disabled={authBusy !== null}
              >
                {authBusy === 'facebook' ? 'Opening Facebook...' : `${authMode === 'signin' ? 'Sign in' : 'Sign up'} with Facebook`}
              </button>
              <button
                type="button"
                className="social-auth-button"
                onClick={() => void handleSocialSignIn('apple')}
                disabled={authBusy !== null}
              >
                {authBusy === 'apple' ? 'Opening Apple...' : `${authMode === 'signin' ? 'Sign in' : 'Sign up'} with Apple`}
              </button>
            </div>
            {!firebaseReady ? (
              <p className="helper-copy">Firebase is not configured yet. Add `VITE_FIREBASE_*` values in your local `.env` and enable Email/Password, Google, Facebook, and Apple in Firebase Authentication.</p>
            ) : null}
          </div>

          <form className="auth-form" onSubmit={handleAuthSubmit}>
            {authMode === 'signup' ? (
              <label>
                <span>Name</span>
                <input name="name" placeholder="Your full name" value={authName} onChange={(event) => setAuthName(event.target.value)} required />
              </label>
            ) : null}
            <label>
              <span>Email</span>
              <input name="email" type="email" placeholder="you@example.com" value={authEmail} onChange={(event) => setAuthEmail(event.target.value)} required />
            </label>
            <label>
              <span>Password</span>
              <input name="password" type="password" placeholder="Password" minLength={6} value={authPassword} onChange={(event) => setAuthPassword(event.target.value)} required />
            </label>
            {authMode === 'signin' ? (
              <button type="button" className="text-button" onClick={() => void handleForgotPassword()} disabled={authBusy !== null}>
                {authBusy === 'reset' ? 'Sending reset link...' : 'Forgot password?'}
              </button>
            ) : null}
            <button type="submit" disabled={authBusy !== null}>
              {authBusy === 'email' ? 'Opening...' : authMode === 'signin' ? 'Sign in with email' : 'Create account'}
            </button>
          </form>
        </section>
      </main>
    )
  }

  return (
    <main className="dashboard-shell">
      <aside className="side-menu">
        <div className="profile-card">
          <span className="eyebrow">Logged in</span>
          {user.photoUrl ? <img className="profile-avatar" src={user.photoUrl} alt={user.name} /> : null}
          <h2>{user.name}</h2>
          <p>@{user.username}</p>
          <strong>{walletBalance.toFixed(2)} balance</strong>
        </div>

        <nav className="menu-list">
          <button type="button" className={activeScreen === 'profile' ? 'active' : ''} onClick={() => setActiveScreen('profile')}>
            Profile
          </button>
          <button type="button" className={activeScreen === 'deposit' ? 'active' : ''} onClick={() => setActiveScreen('deposit')}>
            Deposit
          </button>
          <button type="button" className={activeScreen === 'withdrawal' ? 'active' : ''} onClick={() => setActiveScreen('withdrawal')}>
            Withdrawal
          </button>
          <button type="button" className={activeScreen === 'lobby' ? 'active' : ''} onClick={() => setActiveScreen('lobby')}>
            Lobby
          </button>
        </nav>

        <button type="button" className="signout-button" onClick={signOut}>
          Sign out
        </button>
      </aside>

      <section className="main-stage">
        <header className="top-banner">
          <div className="banner-copy stack-gap">
            <span className="eyebrow">Free live score source</span>
            <h1>Bet directly with your friends on football games.</h1>
            <p>
              Offer a price, wait for a friend to match it, and only lock the deal after both sides are funded.
            </p>
            <div className="stat-strip">
              <article className="stat-card">
                <span>Wallet available</span>
                <strong>{walletBalance.toFixed(2)}</strong>
              </article>
              <article className="stat-card">
                <span>Open offers</span>
                <strong>{offers.filter((offer) => offer.status === 'open').length}</strong>
              </article>
              <article className="stat-card">
                <span>Locked bets</span>
                <strong>{deals.length}</strong>
              </article>
            </div>
          </div>
          <div className="banner-note">{statusMessage || 'Ready for your next football deal.'}</div>
        </header>

        {activeScreen === 'profile' ? (
          <section className="content-card stack-gap">
            <h2>Profile</h2>
            <div className="info-grid">
              <article>
                <span>Name</span>
                <strong>{user.name}</strong>
              </article>
              <article>
                <span>Email</span>
                <strong>{user.email}</strong>
              </article>
              <article>
                <span>Username</span>
                <strong>@{user.username}</strong>
              </article>
              <article>
                <span>Wallet</span>
                <strong>{walletBalance.toFixed(2)}</strong>
              </article>
            </div>

            <div className="deals-list">
              <h3>Locked bets</h3>
              {deals.length === 0 ? <p>No locked deals yet.</p> : null}
              {deals.map((deal) => (
                <article key={deal.id} className="deal-card">
                  <strong>{deal.gameLabel}</strong>
                  <p>Against {deal.opponent}</p>
                  <p>Stake {deal.stake.toFixed(2)} at {deal.agreedOdds.toFixed(2)}</p>
                </article>
              ))}
            </div>
          </section>
        ) : null}

        {activeScreen === 'deposit' ? (
          <section className="content-card stack-gap">
            <h2>Deposit</h2>
            <p>Choose the payment method your friend will trust fastest. The wallet updates after the provider confirms the deposit.</p>
            <label className="field-block">
              <span>Deposit amount</span>
              <input type="number" min="1" step="0.01" value={depositAmount} onChange={(event) => setDepositAmount(event.target.value)} />
            </label>

            <div className="payment-method-grid">
              <button
                type="button"
                className={depositMethod === 'card' ? 'payment-method-card active' : 'payment-method-card'}
                onClick={() => setDepositMethod('card')}
              >
                <span>Bank card</span>
                <strong>Visa and Mastercard</strong>
                <p>Secure Stripe checkout with card entry on the hosted payment page.</p>
              </button>
              <button
                type="button"
                className={depositMethod === 'paypal' ? 'payment-method-card active' : 'payment-method-card'}
                onClick={() => setDepositMethod('paypal')}
              >
                <span>Wallet</span>
                <strong>PayPal</strong>
                <p>Redirect to PayPal, approve the deposit, then return to your wallet.</p>
              </button>
            </div>

            {depositMethod === 'card' ? (
              stripePromise ? (
                <Elements stripe={stripePromise}>
                  <StripeCardDepositForm
                    amount={depositAmount}
                    username={user?.username || 'guest-user'}
                    cardholderName={user?.name || ''}
                    apiBaseUrl={apiBaseUrl}
                    busy={depositBusy !== null}
                    onSuccess={(amount) => {
                      setWalletBalance((current) => current + amount)
                      setStatusMessage(`Card deposit confirmed. ${acceptedCardBrands.join(' and ')} payments are now live on your wallet.`)
                    }}
                    onError={(message) => {
                      setStatusMessage(message)
                    }}
                  />
                </Elements>
              ) : (
                <div className="payment-panel stack-gap">
                  <div className="brand-strip">
                    {acceptedCardBrands.map((brand) => (
                      <span key={brand} className="brand-pill">{brand}</span>
                    ))}
                  </div>
                  <p className="helper-copy">
                    Add `VITE_STRIPE_PUBLISHABLE_KEY` to `frontend/.env` so card deposits can load real Stripe fields.
                  </p>
                </div>
              )
            ) : null}

            {depositMethod === 'paypal' ? (
              <div className="payment-panel stack-gap">
                <p className="helper-copy">
                  PayPal opens in a secure approval page. After approval you are returned here and the wallet is updated.
                </p>
                <button type="button" className="primary-button" onClick={() => void beginPayPalDeposit()} disabled={depositBusy !== null}>
                  {depositBusy === 'paypal' ? 'Opening PayPal...' : 'Continue with PayPal'}
                </button>
              </div>
            ) : null}
            <p className="helper-copy">
              Real deposits require backend payment credentials. Card deposits use `STRIPE_SECRET_KEY`. PayPal deposits use `PAYPAL_CLIENT_ID` and `PAYPAL_CLIENT_SECRET`.
            </p>
          </section>
        ) : null}

        {activeScreen === 'withdrawal' ? (
          <section className="content-card stack-gap">
            <h2>Withdrawal</h2>
            <p>Send a withdrawal request when you want to move unlocked wallet money out of the app.</p>
            <label className="field-block">
              <span>Withdrawal amount</span>
              <input type="number" min="1" step="0.01" value={withdrawAmount} onChange={(event) => setWithdrawAmount(event.target.value)} />
            </label>
            <button type="button" className="primary-button" onClick={requestWithdrawal}>
              Request withdrawal
            </button>
          </section>
        ) : null}

        {activeScreen === 'lobby' ? (
          <section className="lobby-grid">
            <div className="content-card stack-gap">
              <div className="section-heading-row">
                <div>
                  <span className="eyebrow">Games to bet</span>
                  <h2>Today, tomorrow, and upcoming</h2>
                </div>
                <div className="tab-strip">
                  <button type="button" className={selectedTab === 'today' ? 'active' : ''} onClick={() => setSelectedTab('today')}>
                    Today
                  </button>
                  <button type="button" className={selectedTab === 'tomorrow' ? 'active' : ''} onClick={() => setSelectedTab('tomorrow')}>
                    Tomorrow
                  </button>
                  <button type="button" className={selectedTab === 'upcoming' ? 'active' : ''} onClick={() => setSelectedTab('upcoming')}>
                    Upcoming
                  </button>
                </div>
              </div>

              <div className="games-list">
                {filteredGames.map((game) => (
                  <button key={game.id} type="button" className={selectedGame?.id === game.id ? 'game-card active' : 'game-card'} onClick={() => setSelectedGameId(game.id)}>
                    <span>{game.league} • {game.dateLabel}</span>
                    <strong>{game.home} vs {game.away}</strong>
                    <p>{game.kickoff} • {game.marketHint}</p>
                  </button>
                ))}
              </div>

              <article className="offer-builder">
                <h3>Offer a price to a friend</h3>
                <p>
                  Selected game: {selectedGame.home} vs {selectedGame.away}
                </p>
                <div className="offer-form-grid">
                  <label className="field-block">
                    <span>Your odds</span>
                    <input type="number" min="1.01" step="0.01" value={offerOdds} onChange={(event) => setOfferOdds(event.target.value)} />
                  </label>
                  <label className="field-block">
                    <span>Stake to lock</span>
                    <input type="number" min="1" step="0.01" value={offerStake} onChange={(event) => setOfferStake(event.target.value)} />
                  </label>
                </div>
                <label className="field-block">
                  <span>Offer note</span>
                  <textarea value={offerNote} onChange={(event) => setOfferNote(event.target.value)} placeholder="Explain the side you want and what your friend gets." />
                </label>
                <button type="button" className="primary-button" onClick={createOffer}>
                  Lock and send offer
                </button>
              </article>
            </div>

            <div className="stack-column">
              <section className="content-card stack-gap">
                <div className="section-heading-row compact-row">
                  <div>
                    <span className="eyebrow">Open deals</span>
                    <h2>Match a friend offer</h2>
                  </div>
                </div>
                {selectedGameOffers.length === 0 ? <p>No open offers yet for this game.</p> : null}
                {selectedGameOffers.map((offer) => (
                  <article key={offer.id} className="deal-card">
                    <strong>{offer.gameLabel}</strong>
                    <p>{offer.offeredBy} offers {offer.proposedOdds.toFixed(2)} for stake {offer.stake.toFixed(2)}</p>
                    <p>{offer.note}</p>
                    <button type="button" className="secondary-button" onClick={() => acceptOffer(offer)}>
                      Fund and accept
                    </button>
                  </article>
                ))}
              </section>

              <section className="content-card stack-gap">
                <div className="section-heading-row compact-row">
                  <div>
                    <span className="eyebrow">Live score source</span>
                    <h2>Football results</h2>
                  </div>
                  <label className="field-inline">
                    <span>League</span>
                    <select value={selectedLiveLeague} onChange={(event) => setSelectedLiveLeague(event.target.value)}>
                      {liveLeagueOptions.map((league) => (
                        <option key={league.slug} value={league.slug}>{league.label}</option>
                      ))}
                    </select>
                  </label>
                </div>

                {footballOverview ? (
                  <>
                    <p className="helper-copy">{footballOverview.leagueLabel} refreshed at {footballOverview.updatedAt}</p>
                    <div className="score-list">
                      {footballOverview.matches.slice(0, 6).map((match) => (
                        <article key={match.id} className="score-card">
                          <strong>{match.homeTeam} {match.homeScore} - {match.awayScore} {match.awayTeam}</strong>
                          <p>{match.kickoff} • {match.status}</p>
                          <span>{match.venue}</span>
                        </article>
                      ))}
                    </div>
                  </>
                ) : (
                  <p>{footballError || 'Loading live football results...'}</p>
                )}
              </section>
            </div>
          </section>
        ) : null}
      </section>
    </main>
  )
}

export default App
