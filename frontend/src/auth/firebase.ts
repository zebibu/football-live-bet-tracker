import { initializeApp } from 'firebase/app'
import {
  FacebookAuthProvider,
  GoogleAuthProvider,
  OAuthProvider,
  createUserWithEmailAndPassword,
  getAuth,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile,
  type User,
} from 'firebase/auth'

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
}

const hasFirebaseConfig = Object.values(firebaseConfig).every(
  (value) => typeof value === 'string' && value.trim().length > 0,
)

const firebaseApp = hasFirebaseConfig ? initializeApp(firebaseConfig) : null
const firebaseAuth = firebaseApp ? getAuth(firebaseApp) : null

function ensureAuth() {
  if (!firebaseAuth) {
    throw new Error('Firebase auth is not configured yet.')
  }

  return firebaseAuth
}

function buildProvider(providerName: 'google' | 'facebook' | 'apple') {
  if (providerName === 'google') {
    const provider = new GoogleAuthProvider()
    provider.setCustomParameters({ prompt: 'select_account' })
    return provider
  }

  if (providerName === 'facebook') {
    return new FacebookAuthProvider()
  }

  return new OAuthProvider('apple.com')
}

export type SocialProviderName = 'google' | 'facebook' | 'apple'

export type AuthProfile = {
  name: string
  email: string
  username: string
  photoUrl: string | null
}

export function isFirebaseAuthReady() {
  return hasFirebaseConfig
}

export function toAuthProfile(user: User): AuthProfile {
  const email = user.email || 'friend@example.com'
  const fallbackName = email.split('@')[0] || 'Friend User'

  return {
    name: user.displayName || fallbackName,
    email,
    username: email.split('@')[0] || fallbackName,
    photoUrl: user.photoURL,
  }
}

export function listenToAuthState(callback: (user: User | null) => void) {
  if (!firebaseAuth) {
    callback(null)
    return () => undefined
  }

  return onAuthStateChanged(firebaseAuth, callback)
}

export async function signInWithSocialProvider(providerName: SocialProviderName) {
  const auth = ensureAuth()
  const provider = buildProvider(providerName)
  const credentials = await signInWithPopup(auth, provider)
  return credentials.user
}

export async function signInWithEmail(email: string, password: string) {
  const auth = ensureAuth()
  const credentials = await signInWithEmailAndPassword(auth, email, password)
  return credentials.user
}

export async function signUpWithEmail(email: string, password: string, name: string) {
  const auth = ensureAuth()
  const credentials = await createUserWithEmailAndPassword(auth, email, password)

  if (name.trim().length > 0) {
    await updateProfile(credentials.user, { displayName: name.trim() })
  }

  return credentials.user
}

export async function sendResetPasswordEmail(email: string) {
  const auth = ensureAuth()
  await sendPasswordResetEmail(auth, email)
}

export function describeAuthError(error: unknown) {
  const code =
    typeof error === 'object' && error !== null && 'code' in error && typeof error.code === 'string'
      ? error.code
      : ''

  switch (code) {
    case 'auth/email-already-in-use':
      return 'That email is already registered. Try signing in instead.'
    case 'auth/invalid-email':
      return 'Enter a valid email address.'
    case 'auth/invalid-credential':
    case 'auth/invalid-login-credentials':
    case 'auth/user-not-found':
    case 'auth/wrong-password':
      return 'Wrong email or password.'
    case 'auth/weak-password':
      return 'Password must be at least 6 characters long.'
    case 'auth/popup-blocked':
      return 'Your browser blocked the sign-in popup. Allow popups and try again.'
    case 'auth/popup-closed-by-user':
      return 'The sign-in popup was closed before finishing.'
    case 'auth/account-exists-with-different-credential':
      return 'This email already uses a different sign-in method.'
    case 'auth/too-many-requests':
      return 'Too many attempts. Wait a moment and try again.'
    case 'auth/network-request-failed':
      return 'Network error. Check your connection and try again.'
    case 'auth/missing-email':
      return 'Enter your email first so a reset link can be sent.'
    default:
      return error instanceof Error ? error.message : 'Authentication failed.'
  }
}

export async function signOutUser() {
  const auth = ensureAuth()
  await signOut(auth)
}