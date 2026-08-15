import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/use-auth";
import { getAuthClient, isFirebaseConfigured } from "@/lib/firebase";
import {
  clearStaleRedirectState,
  errorCode,
  getGoogleRedirectResult,
  signInAsGuest,
  signInWithEmail,
  signInWithGoogle,
  signInWithGooglePopup,
  signUpWithEmail,
} from "@/lib/auth";
import { cn } from "@/lib/utils";
import { BrandMark, Paper, Rule, Stamp } from "@/components/bits";
import { ArrowIcon, CheckIcon, SparkIcon } from "@/components/icons";
import { SetupNotice } from "@/components/SetupNotice";

function resolveRedirect(returnTo: string | null, fallback = "/app") {
  if (returnTo?.startsWith("/") && !returnTo.startsWith("//")) return returnTo;
  return fallback;
}

/** True when the app is embedded inside the preview pane (an iframe) rather
 *  than running in its own browser tab. */
function inPreviewFrame(): boolean {
  return typeof window !== "undefined" && window.self !== window.top;
}

/** Prefer the popup Google flow whenever a full-page redirect round-trip is
 *  risky: inside the preview frame, or on a preview/dev pod hostname whose URL
 *  can change mid-flight (landing back on the shell's home page instead of
 *  this app). In a normal deployed tab the redirect flow is used instead. */
function usePopupGoogle(): boolean {
  if (inPreviewFrame()) return true;
  const host =
    typeof window !== "undefined" ? window.location.hostname : "";
  return (
    /\.vly\.sh$/i.test(host) ||
    /preview\./i.test(host) ||
    host === "localhost" ||
    host === "127.0.0.1"
  );
}

/** DEV-only trace so a report like "Google took me somewhere" can be pinned
 *  to the exact code path from the browser console. */
function traceGoogle(message: string): void {
  if (import.meta.env.DEV) {
    console.info(`[PotAuth] ${message}`);
  }
}

/** Errors that mean "a Google attempt was interrupted at some earlier point"
 *  — a ghost, not a problem with what the member is doing right now (they may
 *  be signing in with email and password instead). These must never be shown
 *  as a red prompt from the background redirect resolver. */
const REDIRECT_NOISE_CODES = new Set([
  "auth/redirect-cancelled-by-user",
  "auth/popup-closed-by-user",
  "auth/cancelled-popup-request",
]);

/** How long to wait before retrying a popup that tripped over a previous
 *  attempt still winding down (Firebase's auth iframe can report
 *  `cancelled-popup-request` until the earlier request settles). */
const POPUP_RETRY_DELAY_MS = 1_400;

/** Google failures that mean "the environment closed or blocked the window"
 *  rather than anything the member did. Inside the preview pane these are
 *  shown as a calm note (never a red error) — the pane's sandbox is the one
 *  interfering, and the email form right below still works. */
const POPUP_ENVIRONMENT_CODES = new Set([
  "auth/popup-closed-by-user",
  "auth/popup-blocked",
  "auth/popup-timed-out",
  "auth/cancelled-popup-request",
  "auth/operation-not-supported-in-this-environment",
]);

/** The calm note shown when Google can't complete inside the preview pane.
 *  Warm in tone, dismissible, and it clears itself the moment the member
 *  starts using the email form — so it never stands between them and signing
 *  up. */
const PREVIEW_GOOGLE_NOTICE =
  "Google can't open its window from inside this preview pane — that's the " +
  "pane's doing, not yours. The email form above works right now, or open " +
  "the published app in a normal browser tab and Google will work there.";

const charter = [
  "Rule the first — the payer is always right, at least until the receipts.",
  "Rule the second — round up, never down, when it's a friend.",
  "Rule the third — settle before the next trip's first drink.",
];

/** Turn Firebase's error codes into something a friend would say. */
function friendlyAuthError(err: unknown): string {
  const code = errorCode(err);
  switch (code) {
    case "auth/invalid-credential":
    case "auth/wrong-password":
    case "auth/user-not-found":
    case "auth/invalid-email":
      return "That email and password don't match a member. Check them, or open a new page in the ledger.";
    case "auth/email-already-in-use":
      return "That email already has a page in the ledger — sign in instead.";
    case "auth/weak-password":
      return "That password is too easy to guess. Give it at least six characters.";
    case "auth/redirect-cancelled-by-user":
    case "auth/popup-closed-by-user":
    case "auth/cancelled-popup-request":
      return "The sign-in was interrupted before you chose. Try again when you're ready.";
    case "auth/redirect-mapped-to-different-origin":
      return "The sign-in was interrupted because this page's address changed mid-flight. Try again — and if it keeps happening, sign in with your email and password, or open the published app in a normal browser tab and use Google there.";
    case "auth/popup-timed-out":
      return "Google's sign-in window didn't report back — some preview panes interfere with it. Close any stray tab it opened, then either try again, sign in with your email and password right here, or open the published app in a normal browser tab where Google works properly.";
    case "auth/popup-blocked":
      return "The browser blocked Google's sign-in window. Allow pop-ups for this site and try again — or just sign in with your email and password above.";
    case "auth/account-exists-with-different-credential":
      return "That email already has an account here, but it was opened with a different sign-in method. Sign in with that one instead, or use another email.";
    case "auth/operation-not-supported-in-this-environment":
      return "This preview pane blocks Google's sign-in window. Sign in with your email and password right here — or, once the app is deployed, open it in a normal browser tab and Google will work there.";
    case "auth/unauthorized-domain":
    case "auth/operation-not-allowed":
      return "This preview domain isn't in your Firebase allow-list yet — add it under Authentication → Settings → Authorized domains, and enable Email/Password + Google sign-in.";
    case "auth/admin-restricted-operation":
      return "Guest mode isn't switched on for this Firebase project — enable 'Anonymous' under Authentication → Sign-in method, or just sign up with an email instead.";
    case "auth/network-request-failed":
      return "We couldn't reach Firebase just now. Check your connection and try again.";
    case "auth/too-many-requests":
      return "Slow down a touch — too many attempts in a row. Give it a minute.";
    default:
      return err instanceof Error && err.message
        ? err.message
        : "Something went wrong — try again.";
  }
}

type Mode = "signin" | "signup";

export default function AuthPage({
  redirectAfterAuth = "/app",
}: {
  redirectAfterAuth?: string;
}) {
  const { isLoading, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const redirect = resolveRedirect(searchParams.get("returnTo"), redirectAfterAuth);

  const [mode, setMode] = useState<Mode>("signin");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  // A calm, warm note (never a red error) for environment-caused Google
  // failures inside the preview pane. Cleared the moment the member types,
  // switches tabs, or submits — it must never block the email path.
  const [googleNotice, setGoogleNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      navigate(redirect, { replace: true });
    }
  }, [isLoading, isAuthenticated, navigate, redirect]);

  // When Google redirects us back here, resolve the pending sign-in and let
  // the auth listener above carry us into the ledger. Runs on every page load;
  // it's a no-op when there's no pending redirect.
  useEffect(() => {
    if (!isFirebaseConfigured) return;
    let cancelled = false;
    getGoogleRedirectResult()
      .then((user) => {
        if (cancelled) return;
        traceGoogle(
          `redirect result on /auth: ${user ? "user" : "none"}`,
        );
        if (!user) return;
        toast.success("Signed in with Google — welcome to the books");
      })
      .catch((err) => {
        if (cancelled) return;
        const code = errorCode(err);
        traceGoogle(`redirect result error: ${code || "unknown"}`);
        if (REDIRECT_NOISE_CODES.has(code)) {
          // A stale "interrupted" marker from an earlier Google attempt is not
          // this member's problem right now — especially when they're signing
          // in with email and password instead. Wipe any earlier ghost error
          // (e.g. left on screen by a previous code version) so it can't
          // linger, and stay silent.
          setError(null);
        } else {
          // Real errors (e.g. the domain isn't allowed yet) need an action.
          setError(friendlyAuthError(err));
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setGoogleNotice(null);
    try {
      if (mode === "signin") {
        await signInWithEmail(email, password);
        toast.success("Welcome back to the books");
      } else {
        await signUpWithEmail(email, password, name);
        toast.success("Your page in the ledger is open");
      }
      // The auth listener flips `isAuthenticated` and the effect above
      // carries us to the ledger.
    } catch (err) {
      setError(friendlyAuthError(err));
      setBusy(false);
    }
  }

  async function handleGoogle() {
    setBusy(true);
    setError(null);
    setGoogleNotice(null);
    traceGoogle(
      `clicked at ${window.location.href} (popup=${usePopupGoogle()})`,
    );
    try {
      if (usePopupGoogle()) {
        // Drop any leftover redirect markers so they can't poison this
        // attempt, then open the popup. Two hiccups get one silent retry:
        // - `cancelled-popup-request` — a previous popup is still winding down
        //   in Firebase's auth iframe; it usually settles in a second.
        // - `popup-closed-by-user` inside the preview frame — the pane
        //   sometimes auto-closes the very first popup; a fresh attempt after
        //   a pause usually goes through.
        clearStaleRedirectState();
        try {
          await signInWithGooglePopup();
        } catch (firstErr) {
          const firstCode = errorCode(firstErr);
          const retryable =
            firstCode === "auth/cancelled-popup-request" ||
            (firstCode === "auth/popup-closed-by-user" && inPreviewFrame());
          if (retryable) {
            traceGoogle(`popup hiccup (${firstCode}) — retrying once`);
            await new Promise((resolve) => setTimeout(resolve, POPUP_RETRY_DELAY_MS));
            await signInWithGooglePopup();
          } else {
            throw firstErr;
          }
        }
        traceGoogle("popup sign-in resolved");
        setBusy(false);
        toast.success("Signed in with Google — welcome to the books");
      } else {
        // In a normal tab, send the member over to Google; we come back to
        // this same URL and the redirect effect above resolves the result.
        traceGoogle("starting full-page redirect");
        await signInWithGoogle();
      }
    } catch (err) {
      const code = errorCode(err);
      const authClient = getAuthClient();
      const authDomain =
        (authClient as { config?: { authDomain?: string } })?.config
          ?.authDomain ?? "unknown";
      traceGoogle(
        `Google flow error: ${code || "unknown"} ` +
          `(origin=${window.location.origin}, ` +
          `inFrame=${inPreviewFrame()}, authDomain=${authDomain})`,
      );
      // Inside the preview pane, a Google window that closed on its own is the
      // pane's doing, not the member's. Show a calm, dismissible note instead
      // of a red error — and the note vanishes as soon as they type in the
      // email form, so it never stands between them and signing up.
      if (inPreviewFrame() && POPUP_ENVIRONMENT_CODES.has(code)) {
        setGoogleNotice(PREVIEW_GOOGLE_NOTICE);
      } else {
        setError(friendlyAuthError(err));
      }
      setBusy(false);
    }
  }

  async function joinAsGuest() {
    setBusy(true);
    setError(null);
    setGoogleNotice(null);
    try {
      await signInAsGuest();
    } catch (err) {
      setError(friendlyAuthError(err));
      setBusy(false);
    }
  }

  const card = (
    <Paper className="w-full max-w-md p-7 sm:p-9">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[0.62rem] font-bold uppercase tracking-[0.28em] text-muted-foreground">
          Membership card
        </p>
        <Stamp tone="accent">№ {mode === "signin" ? "002" : "001"}</Stamp>
      </div>
      <h1 className="mt-3 text-3xl">
        {mode === "signin" ? "Welcome back" : "Join the ledger"}
      </h1>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">
        {mode === "signin"
          ? "Sign in with your email and password — no codes, no fuss. Or slip in as a guest."
          : "One minute of signing up, years of not doing mental maths."}
      </p>

      <div className="mt-6 flex rounded-sm border border-border bg-secondary/40 p-0.5">
        {(
          [
            ["signin", "Sign in"],
            ["signup", "New member"],
          ] as [Mode, string][]
        ).map(([m, label]) => (
          <button
            key={m}
            type="button"
            onClick={() => {
              setMode(m);
              setError(null);
              setGoogleNotice(null);
            }}
            className={cn(
              "flex-1 rounded-sm px-3 py-2 text-sm font-semibold transition-colors",
              mode === m
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      <form onSubmit={handleSubmit} className="mt-5 space-y-4">
        {mode === "signup" && (
          <div className="space-y-1.5">
            <label className="text-[0.62rem] font-bold uppercase tracking-[0.22em] text-muted-foreground">
              What should we call you?
            </label>
            <Input
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setGoogleNotice(null);
              }}
              placeholder="Maya"
              className="rounded-sm border-input bg-card"
              autoComplete="name"
            />
          </div>
        )}
        <div className="space-y-1.5">
          <label className="text-[0.62rem] font-bold uppercase tracking-[0.22em] text-muted-foreground">
            Email
          </label>
          <Input
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              setGoogleNotice(null);
            }}
            type="email"
            required
            placeholder="maya@example.com"
            className="rounded-sm border-input bg-card"
            autoComplete="email"
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-[0.62rem] font-bold uppercase tracking-[0.22em] text-muted-foreground">
            Password
          </label>
          <Input
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              setGoogleNotice(null);
            }}
            type="password"
            required
            minLength={6}
            placeholder="••••••••"
            className="rounded-sm border-input bg-card"
            autoComplete={mode === "signin" ? "current-password" : "new-password"}
          />
        </div>

        {googleNotice && (
          <div className="flex items-start gap-2 rounded-sm border border-accent/50 bg-accent/10 px-3 py-2 text-xs leading-5 text-foreground/85">
            <p className="flex-1">{googleNotice}</p>
            <button
              type="button"
              onClick={() => setGoogleNotice(null)}
              aria-label="Dismiss note"
              className="text-muted-foreground transition-colors hover:text-foreground"
            >
              <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" aria-hidden="true">
                <path
                  d="M6 6l12 12M18 6L6 18"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          </div>
        )}

        {error && (
          <p className="rounded-sm border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs leading-5 text-destructive">
            {error}
          </p>
        )}

        <Button
          type="submit"
          className="w-full gap-2 bg-primary text-primary-foreground hover:bg-primary/90"
          disabled={busy || isLoading || !email.trim() || password.length < 6}
        >
          {busy ? "Checking the books…" : mode === "signin" ? "Sign in" : "Open my page"}
          {!busy && <ArrowIcon className="h-4 w-4" />}
        </Button>
      </form>

      <div className="my-5">
        <Rule label="or" />
      </div>

      <Button
        type="button"
        variant="outline"
        className="w-full gap-2.5 border-border bg-card hover:bg-secondary/60"
        onClick={handleGoogle}
        disabled={busy}
      >
        {busy ? (
          <span className="text-sm font-semibold">Opening Google…</span>
        ) : (
          <span className="text-sm font-semibold">Continue with Google</span>
        )}
        <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
          <path
            fill="#4285F4"
            d="M23.5 12.27c0-.85-.08-1.66-.22-2.45H12v4.64h6.45a5.52 5.52 0 0 1-2.39 3.62v3h3.87c2.26-2.09 3.57-5.16 3.57-8.81z"
          />
          <path
            fill="#34A853"
            d="M12 24c3.24 0 5.96-1.07 7.94-2.91l-3.87-3c-1.08.72-2.45 1.15-4.07 1.15-3.13 0-5.78-2.11-6.73-4.96H1.29v3.1A12 12 0 0 0 12 24z"
          />
          <path
            fill="#FBBC05"
            d="M5.27 14.28A7.2 7.2 0 0 1 4.91 12c0-.79.14-1.56.36-2.28V6.62H1.29a12 12 0 0 0 0 10.76l3.98-3.1z"
          />
          <path
            fill="#EA4335"
            d="M12 4.77c1.76 0 3.35.61 4.6 1.8l3.42-3.42A11.97 11.97 0 0 0 12 0 12 12 0 0 0 1.29 6.62l3.98 3.1C6.22 6.88 8.87 4.77 12 4.77z"
          />
        </svg>
      </Button>

      <Button
        type="button"
        variant="ghost"
        className="mt-2 w-full gap-2 text-muted-foreground hover:text-foreground"
        onClick={joinAsGuest}
        disabled={busy}
      >
        <SparkIcon className="h-4 w-4 text-accent" strokeWidth={1.8} />
        Browse as a guest — no email, no password
      </Button>

      <p className="mt-5 text-center text-xs text-muted-foreground">
        By joining you agree to be pleasant about the next round.{" "}
        <Link to="/" className="underline decoration-dotted underline-offset-2 hover:text-primary">
          Back to the front page
        </Link>
      </p>
    </Paper>
  );

  return (
    <div className="min-h-screen">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-5 py-6 sm:px-8">
        <Link to="/" aria-label="Common Pot home">
          <BrandMark />
        </Link>
        <span className="text-[0.62rem] font-semibold uppercase tracking-[0.28em] text-muted-foreground">
          The charter
        </span>
      </header>

      <main className="mx-auto grid max-w-6xl gap-14 px-5 pb-20 sm:px-8 lg:grid-cols-12 lg:gap-10">
        <div className="lg:col-span-5">
          <div className="lg:pt-16">
            <p className="text-[0.62rem] font-bold uppercase tracking-[0.3em] text-primary">
              The Common Pot charter
            </p>
            <h2 className="mt-4 text-3xl leading-tight sm:text-4xl">
              Three rules keep a ledger friendly.
            </h2>
            <ul className="mt-8 space-y-6">
              {charter.map((rule, i) => (
                <li key={rule} className="flex gap-4">
                  <span className="font-display text-2xl font-semibold text-border">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <p className="pt-1 text-sm leading-6 text-foreground/75">
                    {rule}
                  </p>
                </li>
              ))}
            </ul>
            <div className="mt-10 hidden items-center gap-3 lg:flex">
              <SparkIcon className="h-5 w-5 text-accent" strokeWidth={1.8} />
              <p className="max-w-xs text-sm italic leading-6 text-muted-foreground">
                &ldquo;The best time to split a bill is before the second
                bottle. The second best time is now.&rdquo;
              </p>
            </div>
          </div>
        </div>

        <div className="lg:col-span-7 lg:pt-10">
          <div className="flex justify-center">
            {isFirebaseConfigured ? (
              card
            ) : (
              <SetupNotice />
            )}
          </div>
        </div>
      </main>

      <footer className="mx-auto flex max-w-6xl items-center gap-2 px-5 pb-10 sm:px-8">
        <CheckIcon className="h-4 w-4 text-primary" />
        <p className="text-xs text-muted-foreground">
          {isFirebaseConfigured
            ? "Sign in with your email and password, or Google — kept in your own Firebase project."
            : "Add your Firebase keys to light the pot — the form appears on its own."}
        </p>
      </footer>
    </div>
  );
}
