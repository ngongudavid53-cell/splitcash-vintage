import {
    GoogleAuthProvider,
    createUserWithEmailAndPassword,
    getRedirectResult,
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

/** Send the member over to Google. This navigates the whole page away (a
 *  redirect — no popup, so no cross-origin `window.closed` games), and the
 *  member comes back to the same URL. Pick up the result on return with
 *  `getGoogleRedirectResult()`. Use this in a normal browser tab. */
export async function signInWithGoogle(): Promise<void> {
    assertConfigured();
    await signInWithRedirect(getAuthClient(), new GoogleAuthProvider());
}

/** Google sign-in in a popup window that reports straight back to this page.
 *  Use this where a full-page redirect can't round-trip — e.g. inside the
 *  preview pane: navigating that frame away would strand the app, and opening
 *  the preview URL in a new tab lands on the shell's home page instead of the
 *  app. With the popup, the sign-in happens in a small window and the auth
 *  listener on this page carries the member into the ledger with no page
 *  change at all.
 *
 *  Some preview shells swallow the popup's reply (their sandbox blocks the
 *  postMessage the Google handler sends back). Without a timeout that leaves
 *  the page stuck on "Opening Google…" forever, so we give up after a while
 *  and let the caller say what went wrong. */
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

/** Called on every load of the auth page, straight after the Google redirect
 *  lands the member back. Resolves with the user when a sign-in actually
 *  happened, or `null` when this page load has no pending result. Keeps their
 *  `users/{uid}` record fresh, and throws on real errors (like an
 *  unauthorized domain) so the page can say so. */
export async function getGoogleRedirectResult(): Promise<User | null> {
    assertConfigured();
    let result;
    try {
          result = await getRedirectResult(getAuthClient());
    } catch (err) {
          // An interrupted attempt leaves a "cancelled" marker behind. Clear it so
      // the same ghost error doesn't resurface on every later visit — the caller
      // still sees the original error and can decide what to show.
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

/** Keep the `users/{uid}` page in step with the auth profile. New members get
 *  a fresh record with a timestamp; returning members are just touched up.
 *  Non-fatal — the ledger works even if this write fails (e.g. rules). */
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
