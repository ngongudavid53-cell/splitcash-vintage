import { Toaster } from "@/components/ui/sonner";
import { RequireAuth } from "@/components/RequireAuth";
import { VlyToolbar } from "../vly-toolbar-readonly.tsx";
import { AuthProvider } from "@/hooks/use-auth";
import React, { StrictMode, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { HashRouter, Route, Routes, useLocation } from "react-router";
import "./index.css";
import Landing from "./pages/Landing";
import AuthPage from "./pages/Auth";
import Dashboard from "./pages/Dashboard";
import GroupView from "./pages/GroupView";
import NotFound from "./pages/NotFound";
import TermsOfService from "./pages/Terms";
import PrivacyPolicy from "./pages/Privacy";

// All route pages are imported eagerly. The preview proxy has trouble
// fetching dynamically-imported chunks at navigation time ("Failed to fetch
// dynamically imported module"), and for an app this size code-splitting
// buys nothing — so everything ships in the entry bundle instead.

/** Silent error boundary — if VlyToolbar crashes it renders nothing instead of
 *  crashing the whole app (e.g. hook errors in WebContainer environment). */
class ToolbarErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false };
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(err: Error) {
    console.warn("[VlyToolbar] Caught error, toolbar disabled:", err.message);
  }
  render() {
    return this.state.hasError ? null : this.props.children;
  }
}

/** Hard guard so runtime errors never leave the preview as a blank page. */
class RootErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; message: string; stack: string }
> {
  state = { hasError: false, message: "", stack: "" };
  static getDerivedStateFromError(error: Error) {
    return {
      hasError: true,
      message: error.message || "Unknown runtime error",
      stack: error.stack || "",
    };
  }
  componentDidCatch(err: Error) {
    console.error("[WebContainer preview] Root crash:", err);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-background text-foreground p-6">
          <div className="max-w-lg text-center">
            <p className="text-sm font-semibold">Preview runtime error</p>
            <p className="mt-2 text-xs text-muted-foreground break-words">
              {this.state.message}
            </p>
            {this.state.stack && (
              <pre className="mt-3 text-left text-[10px] leading-4 text-muted-foreground/80 max-h-40 overflow-auto rounded border border-border/60 p-2">
                {this.state.stack}
              </pre>
            )}
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

function RouteSyncer() {
  const location = useLocation();
  useEffect(() => {
    // HashRouter keeps the path inside the URL fragment, so report the hash
    // path (without the leading #) so the preview shell can track routes.
    const path = location.pathname + location.search;
    window.parent.postMessage(
      { type: "iframe-route-change", path },
      "*",
    );
  }, [location.pathname, location.search]);

  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      if (event.data?.type === "navigate") {
        if (event.data.direction === "back") window.history.back();
        if (event.data.direction === "forward") window.history.forward();
      }
    }
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  return null;
}

// PWA: register the hand-written service worker in production builds only.
// The URL is relative to Vite's base, so it also works when the app is served
// from a subpath (preview pod, project pages, etc.).
if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register(
        `${import.meta.env.BASE_URL}sw.js`
      )
      .catch((err) => {
        console.warn("[Common Pot] service worker registration failed:", err);
      });
  });
}

function AppShell() {
  const router = (
    <HashRouter>
      <RouteSyncer />
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/auth" element={<AuthPage redirectAfterAuth="/app" />} />
        <Route path="/terms" element={<TermsOfService />} />
        <Route path="/privacy" element={<PrivacyPolicy />} />
        <Route
          path="/app"
          element={
            <RequireAuth>
              <Dashboard />
            </RequireAuth>
          }
        />
        <Route
          path="/app/g/:groupId"
          element={
            <RequireAuth>
              <GroupView />
            </RequireAuth>
          }
        />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </HashRouter>
  );
  return (
    <>
      {router}
      <Toaster />
    </>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RootErrorBoundary>
      <ToolbarErrorBoundary>
        <VlyToolbar />
      </ToolbarErrorBoundary>
      <AuthProvider>
        <AppShell />
      </AuthProvider>
    </RootErrorBoundary>
  </StrictMode>,
);