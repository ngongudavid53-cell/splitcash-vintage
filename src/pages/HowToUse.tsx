import { Link } from "react-router";
import { BrandMark, Paper, Rule } from "@/components/bits";
import {
  ArrowIcon,
  CheckIcon,
  PeopleIcon,
  PotIcon,
  ReceiptIcon,
  SparkIcon,
  WalletIcon,
} from "@/components/icons";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";

const tutorialSteps = [
  {
    n: "1",
    icon: PotIcon,
    title: "Create a pot",
    detail: "Start a ledger for your trip, dinner, or shared expenses.",
  },
  {
    n: "2",
    icon: PeopleIcon,
    title: "Invite friends",
    detail: "Share the pot code with everyone involved.",
  },
  {
    n: "3",
    icon: ReceiptIcon,
    title: "Add expenses",
    detail: "Record what was paid, how much, and who paid.",
  },
  {
    n: "4",
    icon: SparkIcon,
    title: "Split the cost",
    detail: "Choose who should share each expense.",
  },
  {
    n: "5",
    icon: WalletIcon,
    title: "Check balances",
    detail: "Common Pot calculates who owes whom.",
  },
  {
    n: "6",
    icon: CheckIcon,
    title: "Settle up",
    detail: "Pay back what you owe and mark it settled.",
  },
  {
    n: "7",
    icon: ArrowIcon,
    title: "You're done",
    detail: "Keep using the pot until everything is settled.",
  },
] as const;

export default function HowToUse() {
  const { isAuthenticated } = useAuth();
  const home = isAuthenticated ? "/app" : "/auth";

  return (
    <div className="min-h-screen">
      {/* Masthead */}
      <header className="mx-auto flex max-w-6xl items-center justify-between px-5 py-6 sm:px-8">
        <Link to="/" aria-label="Common Pot home">
          <BrandMark />
        </Link>
        <div className="flex items-center gap-4">
          <Link
            to={home}
            className="text-sm font-medium underline decoration-dotted underline-offset-4 hover:text-primary"
          >
            {isAuthenticated ? "Your ledgers" : "Sign in"}
          </Link>
          <Button asChild size="sm" className="bg-primary text-primary-foreground hover:bg-primary/90">
            <Link to={home}>{isAuthenticated ? "Your ledgers" : "Open a ledger"}</Link>
          </Button>
        </div>
      </header>

      {/* Main Guide Header */}
      <main className="mx-auto max-w-3xl px-5 pb-24 sm:px-8">
        <div className="pt-6 text-center sm:pt-10">
          <p className="text-[0.62rem] font-bold uppercase tracking-[0.3em] text-primary">
            Quick Start
          </p>
          <h1 className="mt-2 text-3xl font-display sm:text-4xl">How to Use Common Pot</h1>
          <p className="mx-auto mt-2 max-w-md text-sm text-foreground/75 sm:text-base">
            Simple 7-step guide to splitting bills and settling up with friends.
          </p>
        </div>

        <Rule label="How It Works" className="my-8" />

        {/* Concise Step List */}
        <div className="space-y-4">
          {tutorialSteps.map((step) => (
            <Paper key={step.n} className="p-5 sm:p-6">
              <div className="flex items-center gap-4 sm:gap-5">
                <div className="flex size-10 shrink-0 items-center justify-center rounded-full border border-border bg-secondary text-primary font-display font-semibold text-base">
                  {step.n}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <step.icon className="h-4 w-4 shrink-0 text-primary" strokeWidth={1.8} />
                    <h2 className="font-display text-lg font-semibold leading-tight">{step.title}</h2>
                  </div>
                  <p className="mt-1 text-xs text-foreground/80 sm:text-sm">
                    {step.detail}
                  </p>
                </div>
              </div>
            </Paper>
          ))}
        </div>

        {/* CTA Footer */}
        <div className="mt-10 text-center">
          <Paper className="p-6">
            <h3 className="font-display text-xl">Ready to get started?</h3>
            <p className="mt-1 text-xs text-foreground/70 sm:text-sm">
              Open your first pot in under a minute.
            </p>
            <div className="mt-5 flex justify-center gap-3">
              <Button asChild size="default" className="bg-primary px-7 text-primary-foreground hover:bg-primary/90">
                <Link to={home}>{isAuthenticated ? "Go to your ledgers" : "Open a ledger now"}</Link>
              </Button>
            </div>
          </Paper>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-dashed border-border/70">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-6 sm:px-8">
          <div className="flex items-center gap-2">
            <PotIcon className="h-5 w-5 text-primary" />
            <span className="font-display font-semibold">Common Pot</span>
          </div>
          <Link to="/" className="text-xs text-muted-foreground hover:text-foreground">
            Back to Home
          </Link>
        </div>
      </footer>
    </div>
  );
}
