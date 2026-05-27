import type { User } from 'firebase/auth'
import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  where,
  type Unsubscribe,
} from 'firebase/firestore'
import { firebaseDb, isFirestoreReady, toAuthProfile, type AuthProfile } from '../auth/firebase'

const openingWalletBalance = 40
const openingWalletBalanceCents = openingWalletBalance * 100

export type FirestoreUserProfile = AuthProfile & {
  walletBalance: number
}

export type FirestoreOffer = {
  id: string
  gameId: string
  gameLabel: string
  offeredBy: string
  offeredByUid: string
  proposedOdds: number
  stake: number
  note: string
  creatorFunded: boolean
  status: 'open' | 'matched'
}

export type FirestoreDeal = {
  id: string
  gameLabel: string
  opponent: string
  agreedOdds: number
  stake: number
  status: 'locked' | 'settled'
}

type CreateOfferInput = {
  gameId: string
  gameLabel: string
  proposedOdds: number
  stake: number
  note: string
}

function ensureDb() {
  if (!firebaseDb) {
    throw new Error('Firestore is not configured yet.')
  }

  return firebaseDb
}

function toNumber(value: unknown, fallback = 0) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function toWalletAmountCents(value: unknown) {
  return Math.round(toNumber(value, 0))
}

function toWalletBalanceValue(totalAmountCents: number) {
  return totalAmountCents / 100
}

function sumWalletTransactionCents(entries: Array<{ data: () => Record<string, unknown> }>) {
  return entries.reduce((total, entry) => total + toWalletAmountCents(entry.data().amount), 0)
}

async function getWalletBalanceForUser(uid: string) {
  const db = ensureDb()
  const snapshot = await getDocs(query(collection(db, 'walletTransactions'), where('uid', '==', uid)))
  return toWalletBalanceValue(sumWalletTransactionCents(snapshot.docs))
}

export async function ensureUserProfileDocument(user: User) {
  if (!isFirestoreReady()) {
    return toAuthProfile(user)
  }

  const db = ensureDb()
  const profileRef = doc(db, 'users', user.uid)
  const openingBalanceRef = doc(db, 'walletTransactions', `opening_${user.uid}`)
  const profileSnapshot = await getDoc(profileRef)
  const openingBalanceSnapshot = await getDoc(openingBalanceRef)
  const baseProfile = toAuthProfile(user)

  if (!profileSnapshot.exists()) {
    await runTransaction(db, async (transaction) => {
      transaction.set(profileRef, {
        ...baseProfile,
        walletBalance: openingWalletBalance,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })

      transaction.set(openingBalanceRef, {
        uid: user.uid,
        username: baseProfile.username,
        amount: openingWalletBalanceCents,
        currency: 'USD',
        provider: 'system',
        providerPaymentId: `opening_${user.uid}`,
        kind: 'opening_balance',
        status: 'posted',
        metadata: {
          source: 'user_profile_setup',
        },
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })
    })

    return {
      ...baseProfile,
      walletBalance: openingWalletBalance,
    }
  }

  if (!openingBalanceSnapshot.exists()) {
    const walletTransactionSnapshot = await getDocs(
      query(collection(db, 'walletTransactions'), where('uid', '==', user.uid), limit(1)),
    )

    if (walletTransactionSnapshot.empty) {
      await runTransaction(db, async (transaction) => {
        transaction.set(openingBalanceRef, {
          uid: user.uid,
          username: baseProfile.username,
          amount: openingWalletBalanceCents,
          currency: 'USD',
          provider: 'system',
          providerPaymentId: `opening_${user.uid}`,
          kind: 'opening_balance',
          status: 'posted',
          metadata: {
            source: 'opening_balance_backfill',
          },
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        })
      })
    }
  }

  await runTransaction(db, async (transaction) => {
    transaction.set(
      profileRef,
      {
        name: baseProfile.name,
        email: baseProfile.email,
        username: baseProfile.username,
        photoUrl: baseProfile.photoUrl,
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    )
  })

  const existingProfile = profileSnapshot.data()

  return {
    uid: user.uid,
    name: String(existingProfile.name || baseProfile.name),
    email: String(existingProfile.email || baseProfile.email),
    username: String(existingProfile.username || baseProfile.username),
    photoUrl: typeof existingProfile.photoUrl === 'string' ? existingProfile.photoUrl : baseProfile.photoUrl,
    walletBalance: toNumber(existingProfile.walletBalance, openingWalletBalance),
  }
}

export function subscribeToUserProfile(uid: string, callback: (profile: FirestoreUserProfile | null) => void): Unsubscribe {
  const db = ensureDb()
  return onSnapshot(doc(db, 'users', uid), (snapshot) => {
    if (!snapshot.exists()) {
      callback(null)
      return
    }

    const data = snapshot.data()
    callback({
      uid,
      name: String(data.name || 'Friend User'),
      email: String(data.email || 'friend@example.com'),
      username: String(data.username || 'friend'),
      photoUrl: typeof data.photoUrl === 'string' ? data.photoUrl : null,
      walletBalance: toNumber(data.walletBalance, openingWalletBalance),
    })
  })
}

export function subscribeToWalletBalance(uid: string, callback: (walletBalance: number) => void): Unsubscribe {
  const db = ensureDb()
  return onSnapshot(query(collection(db, 'walletTransactions'), where('uid', '==', uid)), (snapshot) => {
    callback(toWalletBalanceValue(sumWalletTransactionCents(snapshot.docs)))
  })
}

export function subscribeToOffers(callback: (offers: FirestoreOffer[]) => void): Unsubscribe {
  const db = ensureDb()
  return onSnapshot(query(collection(db, 'offers'), orderBy('createdAt', 'desc')), (snapshot) => {
    callback(
      snapshot.docs.map((entry) => {
        const data = entry.data()
        return {
          id: entry.id,
          gameId: String(data.gameId || ''),
          gameLabel: String(data.gameLabel || ''),
          offeredBy: String(data.offeredBy || 'Friend'),
          offeredByUid: String(data.offeredByUid || ''),
          proposedOdds: toNumber(data.proposedOdds, 1.01),
          stake: toNumber(data.stake, 0),
          note: String(data.note || ''),
          creatorFunded: Boolean(data.creatorFunded),
          status: data.status === 'matched' ? 'matched' : 'open',
        }
      }),
    )
  })
}

export function subscribeToDeals(uid: string, callback: (deals: FirestoreDeal[]) => void): Unsubscribe {
  const db = ensureDb()
  return onSnapshot(query(collection(db, 'deals'), orderBy('createdAt', 'desc')), (snapshot) => {
    callback(
      snapshot.docs
        .map((entry) => {
          const data = entry.data()
          const createdByUid = String(data.createdByUid || '')
          const acceptedByUid = String(data.acceptedByUid || '')

          if (uid !== createdByUid && uid !== acceptedByUid) {
            return null
          }

          return {
            id: entry.id,
            gameLabel: String(data.gameLabel || ''),
            opponent: uid === createdByUid ? String(data.acceptedByName || 'Friend') : String(data.createdByName || 'Friend'),
            agreedOdds: toNumber(data.agreedOdds, 1.01),
            stake: toNumber(data.stake, 0),
            status: data.status === 'settled' ? 'settled' : 'locked',
          }
        })
        .filter((entry): entry is FirestoreDeal => entry !== null),
    )
  })
}

export async function createFirestoreOffer(user: FirestoreUserProfile, input: CreateOfferInput) {
  const db = ensureDb()
  const offerRef = doc(collection(db, 'offers'))
  const stakeLockRef = doc(db, 'walletTransactions', `offer_lock_${offerRef.id}`)
  const currentWalletBalance = await getWalletBalanceForUser(user.uid)

  if (currentWalletBalance < input.stake) {
    throw new Error('Deposit enough money before you can lock this offer.')
  }

  await runTransaction(db, async (transaction) => {
    transaction.set(offerRef, {
      ...input,
      offeredBy: user.name,
      offeredByUid: user.uid,
      creatorFunded: true,
      status: 'open',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })

    transaction.set(stakeLockRef, {
      uid: user.uid,
      username: user.username,
      amount: -Math.round(input.stake * 100),
      currency: 'USD',
      provider: 'app',
      providerPaymentId: offerRef.id,
      kind: 'stake_lock',
      status: 'locked',
      metadata: {
        offerId: offerRef.id,
        source: 'offer_create',
      },
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })
  })
}

export async function acceptFirestoreOffer(user: FirestoreUserProfile, offer: FirestoreOffer) {
  const db = ensureDb()
  const offerRef = doc(db, 'offers', offer.id)
  const dealRef = doc(collection(db, 'deals'))
  const stakeLockRef = doc(db, 'walletTransactions', `deal_lock_${dealRef.id}`)
  const currentWalletBalance = await getWalletBalanceForUser(user.uid)

  if (currentWalletBalance < offer.stake) {
    throw new Error('You need to deposit before you can match this deal.')
  }

  await runTransaction(db, async (transaction) => {
    const offerSnapshot = await transaction.get(offerRef)

    if (!offerSnapshot.exists()) {
      throw new Error('This offer is no longer available.')
    }

    const currentOffer = offerSnapshot.data()

    if (currentOffer.status !== 'open') {
      throw new Error('This offer has already been matched.')
    }

    if (String(currentOffer.offeredByUid || '') === user.uid) {
      throw new Error('You cannot accept your own offer.')
    }

    transaction.update(offerRef, {
      status: 'matched',
      matchedByUid: user.uid,
      matchedByName: user.name,
      updatedAt: serverTimestamp(),
    })

    transaction.set(dealRef, {
      gameLabel: offer.gameLabel,
      createdByUid: String(currentOffer.offeredByUid || ''),
      createdByName: String(currentOffer.offeredBy || 'Friend'),
      acceptedByUid: user.uid,
      acceptedByName: user.name,
      agreedOdds: toNumber(currentOffer.proposedOdds, offer.proposedOdds),
      stake: toNumber(currentOffer.stake, offer.stake),
      status: 'locked',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })

    transaction.set(stakeLockRef, {
      uid: user.uid,
      username: user.username,
      amount: -Math.round(offer.stake * 100),
      currency: 'USD',
      provider: 'app',
      providerPaymentId: dealRef.id,
      kind: 'stake_lock',
      status: 'locked',
      metadata: {
        dealId: dealRef.id,
        offerId: offer.id,
        source: 'offer_accept',
      },
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })
  })
}
