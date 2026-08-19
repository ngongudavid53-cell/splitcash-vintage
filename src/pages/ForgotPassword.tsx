import { useState, type FormEvent } from "react";
import { Link } from "react-router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { BrandMark, Paper } from "@/components/bits";
import { sendPasswordReset } from "@/lib/auth";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await sendPasswordReset(email);
      setSent(true);
    } catch (err) {
      const code = typeof err === "object" && err !== null && "code" in err
        ? String((err as { code?: unknown }).code ?? "")
        : "";
      setError(code === "auth/invalid-email"
        ? "Enter a valid email address."
        : "We couldn't send the reset email. Check the address and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-5 py-6 sm:px-8">
        <Link to="/" aria-label="Common Pot home"><BrandMark /></Link>
        <Link to="/auth" className="text-sm underline decoration-dotted underline-offset-4">Back to sign in</Link>
      </header>
      <main className="mx-auto flex max-w-6xl justify-center px-5 pb-20 pt-12 sm:px-8">
        <Paper className="w-full max-w-md p-7 sm:p-9">
          <p className="text-[0.62rem] font-bold uppercase tracking-[0.28em] text-muted-foreground">Account help</p>
          <h1 className="mt-3 text-3xl">Reset your password</h1>
          {sent ? (
            <div className="mt-5 space-y-4">
              <p className="text-sm leading-6 text-foreground/75">If an email account exists for that address, Firebase has sent a password-reset message. Check your inbox and spam folder, then follow the link in the email.</p>
              <Button asChild className="w-full"><Link to="/auth">Return to sign in</Link></Button>
            </div>
          ) : (
            <>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">Enter the email you used for your Common Pot account.</p>
              <form onSubmit={handleSubmit} className="mt-6 space-y-4">
                <div className="space-y-1.5">
                  <label className="text-[0.62rem] font-bold uppercase tracking-[0.22em] text-muted-foreground">Email</label>
                  <Input value={email} onChange={(e) => setEmail(e.target.value)} type="email" required autoComplete="email" placeholder="you@example.com" />
                </div>
                {error && <p className="rounded-sm border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs leading-5 text-destructive">{error}</p>}
                <Button type="submit" className="w-full" disabled={busy || !email.trim()}>{busy ? "Sending…" : "Send reset email"}</Button>
              </form>
            </>
          )}
        </Paper>
      </main>
    </div>
  );
}
