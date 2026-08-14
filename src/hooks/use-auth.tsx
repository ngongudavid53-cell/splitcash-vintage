import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { onAuthStateChanged, type User } from "firebase/auth";
import { getAuthClient, isFirebaseConfigured } from "@/lib/firebase";
import { getGoogleRedirectResult, signOutUser } from "@/lib/auth";

export interface UserProfile {
  name: string;
  email: string;
}

interface AuthContextValue {
  isLoading: boolean;
  isAuthenticated: boolean;
  /** The Firebase user — pages use `uid`, `displayName` and `email` on it. */
  user: User | null;
  profile: UserProfile | null;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/** Watches Firebase auth state and hands it down to the app. When the
 *  Firebase keys aren't configured yet, we simply report "signed out" and
 *  let the pages show the setup notice. */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!isFirebaseConfigured) {
      setIsLoading(false);
      return;
    }
    const unsubscribe = onAuthStateChanged(getAuthClient(), (next) => {
      setUser(next);
      setIsLoading(false);
    });
    return unsubscribe;
  }, []);

  // Safety net for the full-page Google redirect flow. `signInWithRedirect`
  // navigates the browser to Google and back, and the pending result is only
  // ever picked up on the auth page — but preview shells sometimes swallow or
  // rewrite the return URL, landing the member back on `/` or another page
  // where nothing ever calls `getRedirectResult`. Resolving it here, on every
  // app load, means the sign-in completes no matter which route the round-trip
  // lands on. It's a no-op when there's no pending result, and the auth
  // listener above reflects the finished sign-in.
  useEffect(() => {
    if (!isFirebaseConfigured) return;
    let cancelled = false;
    getGoogleRedirectResult()
      .then((user) => {
        if (cancelled) return;
        if (import.meta.env.DEV) {
          console.info(
            `[PotAuth] pending redirect on boot: ${user ? "user" : "none"}`,
          );
        }
        if (!user) return;
        console.info("[Common Pot] Finished a pending Google sign-in.");
      })
      .catch((err) => {
        if (cancelled) return;
        console.warn(
          "[Common Pot] A pending Google sign-in didn't complete:",
          err,
        );
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const value = useMemo<AuthContextValue>(() => {
    const profile: UserProfile | null = user
      ? {
          name: user.displayName ?? user.email?.split("@")[0] ?? "Friend",
          email: user.email ?? "",
        }
      : null;
    return {
      isLoading,
      isAuthenticated: user !== null,
      user,
      profile,
      signOut: async () => {
        if (isFirebaseConfigured) await signOutUser();
      },
    };
  }, [isLoading, user]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
