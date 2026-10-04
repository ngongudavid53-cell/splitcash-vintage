import { Link } from "react-router";

export default function HowToUse() {
  return (
    <div className="min-h-screen bg-background text-foreground p-6 md:p-12">
      <div className="max-w-2xl mx-auto">
        <header className="mb-8">
          <h1 className="text-3xl font-bold mb-4">How to Use Common Pot</h1>
          <p className="text-muted-foreground text-sm">
            A quick guide to starting and settling a shared expense pot.
          </p>
        </header>

        <main className="space-y-6">
          <section>
            <h2 className="text-xl font-semibold mb-2">1. Create or join a pot</h2>
            <p className="text-foreground/80 leading-6">
              Sign in, create a pot for your group, or use an invite code to join an existing one.
            </p>
          </section>
          <section>
            <h2 className="text-xl font-semibold mb-2">2. Add expenses</h2>
            <p className="text-foreground/80 leading-6">
              Record what was paid, who paid it, the amount, and which members should share it.
            </p>
          </section>
          <section>
            <h2 className="text-xl font-semibold mb-2">3. Check the balances</h2>
            <p className="text-foreground/80 leading-6">
              Common Pot keeps the shared ledger so your group can see who has paid and who owes.
            </p>
          </section>
          <section>
            <h2 className="text-xl font-semibold mb-2">4. Settle up</h2>
            <p className="text-foreground/80 leading-6">
              Record settlements as your group pays balances back, keeping the ledger up to date.
            </p>
          </section>
        </main>

        <footer className="mt-12 pt-6 border-t border-border">
          <Link to="/" className="text-muted-foreground hover:text-foreground transition-colors">
            &larr; Back to Common Pot
          </Link>
        </footer>
      </div>
    </div>
  );
}
