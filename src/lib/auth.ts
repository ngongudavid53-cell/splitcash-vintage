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

function assertConfigured(): void {
  if (!isFirebaseConfigured) throw new Error("Firebase isn't configured yet. Add the VITE_FIREBASE_* keys (see .env.example).");
}

export const POPUP_TIMEOUT_CODE = "auth/popup-timed-out";
const POPUP_TIMEOUT_MS = 90_000;

function withTimeout<T>(promise: Promise<T>, ms: number, code: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(Object.assign(new Error(code), { code })), ms);
    promise.then((value) => { clearTimeout(timer); resolve(value); }, (err) => { clearTimeout(timer); reject(err); });
  });
}

export function clearStaleRedirectState(): void {
  try {
    const doomed: string[] = [];
    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i);
      if (key && key.startsWith("firebase:redirect_")) doomed.push(key);
    }
    for (const key of doomed) sessionStorage.removeItem(key);
  } catch { /* sessionStorage may be unavailable */ }
}

export function errorCode(err: unknown): string {
  return typeof err === "object" && err !== null && "code" in err
    ? String((err as { code?: unknown }).code ?? "")
    : "";
}

export async function signInWithEmail(email: string, password: string): Promise<User> {
  assertConfigured();
  return (await signInWithEmailAndPassword(getAuthClient(), email.trim(), password)).user;
}

export async function sendPasswordReset(email: string): Promise<void> {
  assertConfigured();
  await sendPasswordResetEmail(getAuthClient(), email.trim());
}

export async function signUpWithEmail(email: string, password: string, name?: string): Promise<User> {
  assertConfigured();
  const cred = await createUserWithEmailAndPassword(getAuthClient(), email.trim(), password);
  const user = cred.user;
  const display = name?.trim();
  if (display) {
    try { await updateProfile(user, { displayName: display }); } catch { /* optional */ }
  }
  await writeUserRecord(user, display || undefined);
  return user;
}

/** Production Google sign-in uses a popup so the live app does not depend on a
 * redirect round-trip returning to the exact same hash route. */
export async function signInWithGoogle(): Promise<void> {
  assertConfigured();
  const user = (await withTimeout(
    signInWithPopup(getAuthClient(), new GoogleAuthProvider()),
    POPUP_TIMEOUT_MS,
    POPUP_TIMEOUT_CODE,
  )).user;
  await writeUserRecord(user, user.displayName ?? undefined);
}

export async function signInWithGooglePopup(): Promise<User> {
  assertConfigured();
  const cred = await withTimeout(signInWithPopup(getAuthClient(), new GoogleAuthProvider()), POPUP_TIMEOUT_MS, POPUP_TIMEOUT_CODE);
  const user = cred.user;
  await writeUserRecord(user, user.displayName ?? undefined);
  return user;
}

export async function getGoogleRedirectResult(): Promise<User | null> {
  assertConfigured();
  let result;
  try {
    result = await getRedirectResult(getAuthClient());
  } catch (err) {
    const code = errorCode(err);
    if (code === "auth/redirect-cancelled-by-user" || code === "auth/cancelled-popup-request") clearStaleRedirectState();
    throw err;
  }
  if (!result) return null;
  const user = result.user;
  await writeUserRecord(user, user.displayName ?? undefined);
  return user;
}

export async function signInAsGuest(): Promise<User> {
  assertConfigured();
  return (await signInAnonymously(getAuthClient())).user;
}

export async function signOutUser(): Promise<void> {
  if (isFirebaseConfigured) await firebaseSignOut(getAuthClient());
}

export async function writeUserRecord(user: User, name?: string): Promise<void> {
  if (!isFirebaseConfigured) return;
  try {
    const ref = doc(getDb(), "users", user.uid);
    const display = name ?? user.displayName ?? user.email?.split("@")[0] ?? "Friend";
    const snap = await getDoc(ref);
    if (snap.exists()) await updateDoc(ref, { name: display, email: user.email ?? "" });
    else await setDoc(ref, { name: display, email: user.email ?? "", premium: false, createdAt: serverTimestamp() });
  } catch (err) {
    console.warn("[Common Pot] Couldn't write the user record:", err);
  }
}
