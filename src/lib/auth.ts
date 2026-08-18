import {
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  getRedirectResult,
  sendPasswordResetEmail,
  signInAnonymously,
  signInWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  signOut as firebaseSignOut,
  updateProfile,
  type User,
} from "firebase/auth";
import { doc, getDoc, serverTimestamp, setDoc, updateDoc } from "firebase/firestore";
import { getAuthClient, getDb, isFirebaseConfigured } from "./firebase";

/** All the auth helpers assume the Firebase keys are present; the pages
 *  check `isFirebaseConfigured` before rendering them. */
function assertConfigured(): void {
  if (!isFirebaseConfigured) {
    throw new Error("Firebase isn't configured yet. Add the VITE_FIREBASE_* keys (see .env.example).");
  }
}

/** Fired when the Google popup never reports back (see `signInWithGooglePopup`). */
export const POPUP_TIMEOUT_CODE = "auth/popup-timed-out";

/** How long we'll wait for Google's popup window to finish before giving up. */
const POPUP_TIMEOUT_MS = 90_000;

/** Race a promise against a timer; on timeout, reject with a synthetic
 *  Firebase-style error so callers can map it through `friendlyAuthError`. */
function withTimeout<T>(promise: Promise<T>, ms: number, code: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(Object.assign(new Error(code), { code }));
    }, ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

/** sessionStorage keys the Firebase SDK uses for the redirect flow. After an
 *  interrupted attempt (popup closed, redirect cancelled) a "cancelled" marker
 *  can linger, and `getRedirectResult` keeps reporting it on later visits —
 *  which surfaced as a confusing red error on the email/password form. We clear
 *  our own keys (never anything else) so the ghost can't nag twice. Also called
 *  before a fresh Google attempt so leftover state can't poison it. */
export function clearStaleRedirectState(): void {
  try {
    const doomed: string[] = [];
    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i);
      if (key && key.startsWith("firebase:redirect_")) doomed.push(key);
    }
    for (const key of doomed) sessionStorage.removeItem(key);
  } catch {
    /* sessionStorage can be unavailable in sandboxed frames — ignore */
  }
}

/** Extract the Firebase error code from a thrown value, or "". */
export function errorCode(err: unknown): string {
  return typeof err === "object" && err !== null && "code" in err
    ? String((err as { code?: unknown }).code ?? "")
    : "";
}

/** Sign in with email + password. */
export async function signInWithEmail(
  email: string,
  password: string,
): Promise<User> {
  assertConfigured();
  const cred = await signInWithEmailAndPassword(
    getAuthClient(),
    email.trim(),
    password,
  );
  return cred.user;
}

/** Send a password reset email for an email/password account. */
export async function sendPasswordReset(email: string): Promise<void> {
  assertConfigured();
  await sendPasswordResetEmail(getAuthClient(), email.trim());
}

/** Create an account with email + password, set the display name, and make
 *  their page in the `users` collection. */
export async function signUpWithEmail(
  email: string,
  password: string,
  name?: string,
): Promise<User> {
  assertConfigured();
  const cred = await createUserWithEmailAndPassword(
    getAuthClient(),
    email.trim(),
    password,
  );
  const user = cred.user;
  const display = name?.trim();
  if (display) {
    try {
      await updateProfile(user, { displayName: display });
    } catch {
      /* a name is a nicety, not a requirement */
    }
  }
  await writeUserRecord(user, display || undefined);
  return user;
}

/** Sign in with Google using a full-page redirect in a normal browser tab. */
export async function signInWithGoogle(): Promise<void> {
  assertConfigured();
  await signInWithRedirect(getAuthClient(), new GoogleAuthProvider());
}

/** Google sign-in in a popup window that reports straight back to this page. */
export async function signInWithGooglePopup(): Promise<User> {
  assertConfigured();
  const cred = await withTimeout(
    signInWithPopup(getAuthClient(), new GoogleAuthProvider()),
    POPUP_TIMEOUT_MS,
    POPUP_TIMEOUT_CODE,
  );
  const user = cred.user;
  await writeUserRecord(user, user.displayName ?? undefined);
  return user;
}

/** Resolve a pending Google redirect on the auth page. */
export async function getGoogleRedirectResult(): Promise<User | null> {
  assertConfigured();
  let result;
  try {
    result = await getRedirectResult(getAuthClient());
  } catch (err) {
    const code = errorCode(err);
    if (
      code === "auth/redirect-cancelled-by-user" ||
      code === "auth/cancelled-popup-request"
    ) {
      clearStaleRedirectState();
    }
    throw err;
  }
  if (!result) return null;
  const user = result.user;
  await writeUserRecord(user, user.displayName ?? undefined);
  return user;
}

/** Wander in as a guest — no email, no password, no record. */
export async function signInAsGuest(): Promise<User> {
  assertConfigured();
  return (await signInAnonymously(getAuthClient())).user;
}

export async function signOutUser(): Promise<void> {
  if (isFirebaseConfigured) await firebaseSignOut(getAuthClient());
}

/** Keep the `users/{uid}` page in step with the auth profile. */
export async function writeUserRecord(user: User, name?: string): Promise<void> {
  if (!isFirebaseConfigured) return;
  try {
    const ref = doc(getDb(), "users", user.uid);
    const display =
      name ??
      user.displayName ??
      user.email?.split("@")[0] ??
      "Friend";
    const snap = await getDoc(ref);
    if (snap.exists()) {
      await updateDoc(ref, { name: display, email: user.email ?? "" });
    } else {
      await setDoc(ref, {
        name: display,
        email: user.email ?? "",
        premium: false,
        createdAt: serverTimestamp(),
      });
    }
  } catch (err) {
    console.warn("[Common Pot] Couldn't write the user record:", err);
  }
}
