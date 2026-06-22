import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import {
  initializeAuth, getReactNativePersistence, getAuth,
  signInAnonymously, onAuthStateChanged,
} from 'firebase/auth';
import AsyncStorage from '@react-native-async-storage/async-storage';

const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
};

const app = initializeApp(firebaseConfig);

// Auth with AsyncStorage persistence so the anonymous user survives restarts.
// Wrapped in try/catch because initializeAuth throws if it's already been
// initialized (e.g. Fast Refresh) — fall back to getAuth in that case.
let auth;
try {
  auth = initializeAuth(app, {
    persistence: getReactNativePersistence(AsyncStorage),
  });
} catch {
  auth = getAuth(app);
}

// Sign in anonymously so Firestore rules can require `request.auth != null`.
// This is non-blocking: if the Anonymous provider isn't enabled yet, it fails
// quietly and the app keeps working (writes that need auth will retry via the
// SyncQueue once auth succeeds). Enable Anonymous auth in each Firebase project
// BEFORE deploying the auth-required firestore.rules.
onAuthStateChanged(auth, (user) => {
  if (!user) {
    signInAnonymously(auth).catch((e) => {
      console.warn('Anonymous sign-in failed:', e?.code || e);
    });
  }
});

export { auth };
export const db = getFirestore(app);
export default app;
