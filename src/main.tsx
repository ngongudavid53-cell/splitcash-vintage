import { Toaster } from "@/components/ui/sonner";
import { RequireAuth } from "@/components/RequireAuth";
import { VlyToolbar } from "../vly-toolbar-readonly.tsx";
import { AuthProvider } from "@/hooks/use-auth";
import React, { StrictMode, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { HashRouter, Link, Route, Routes, useLocation } from "react-router";
import "./index.css";
import Landing from "./pages/Landing";
import AuthPage from "./pages/Auth";
import ForgotPassword from "./pages/ForgotPassword";
import Help from "./pages/Help";
import Dashboard from "./pages/Dashboard";
import GroupView from "./pages/GroupView";
import NotFound from "./pages/NotFound";

class ToolbarErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean }> {
  state = { hasError: false };
  static getDerivedStateFromError() { return { hasError: true }; }
  componentDidCatch(err: Error) { console.warn("[VlyToolbar] Caught error, toolbar disabled:", err.message); }
  render() { return this.state.hasError ? null : this.props.children; }
}

class RootErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; message: string; stack: string }
> {
  state = { hasError: false, message: "", stack: "" };
  static getDerivedStateFromError(error: Error) { return { hasError: true, message: error.message || "Unknown runtime error", stack: error.stack || "" }; }
  componentDidCatch(err: Error) { console.error("[WebContainer preview] Root crash:", err); }
  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-background text-foreground p-6">
          <div className="max-w-lg text-center">
            <p className="text-sm font-semibold">Preview runtime error</p>
            <p className="mt-2 text-xs text-muted-foreground break-words">{this.state.message}</p>
            {this.state.stack && <pre className="mt-3 text-left text-[10px] leading-4 text-muted-foreground/80 max-h-40 overflow-auto rounded border border-border/60 p-2">{this.state.stack}</pre>}
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
    const path = location.pathname + location.search;
    window.parent.postMessage({ type: "iframe-route-change", path }, "*");
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

function AuthUtilityLink() {
  const location = useLocation();
  if (location.pathname !== "/auth") return null;
  return (
    <div className="fixed bottom-4 left-0 right-0 z-40 flex justify-center px-4 pointer-events-none">
      <Link
        to="/forgot-password"
        className="pointer-events-auto rounded-full border border-border bg-card/95 px-4 py-2 text-xs font-semibold text-muted-foreground shadow-sm backdrop-blur hover:text-primary"
      >
        Forgot password?
      </Link>
    </div>
  );
}

if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch((err) => {
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
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/help" element={<Help />} />
        <Route path="/app" element={<RequireAuth><Dashboard /></RequireAuth>} />
        <Route path="/app/g/:groupId" element={<RequireAuth><GroupView /></RequireAuth>} />
        <Route path="*" element={<NotFound />} />
      </Routes>
      <AuthUtilityLink />
    </HashRouter>
  );
  return <><>{router}</><Toaster /></>;
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RootErrorBoundary>
      <ToolbarErrorBoundary><VlyToolbar /></ToolbarErrorBoundary>
      <AuthProvider><AppShell /></AuthProvider>
    </RootErrorBoundary>
  </StrictMode>,
);
