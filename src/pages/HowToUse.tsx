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

const guideSteps = [
  {
    n: "01",
    icon: PotIcon,
    title: "Open or Create a Ledger",
    summary: "Every trip, flat share, or dinner club gets its own book.",
    detail:
      "Start by naming your pot (e.g., 'Lisbon Trip' or 'Flat 4B'). Your ledger is stored safely on the cloud and stays synced in real time across all members.",
  },
  {
    n: "02",
    icon: PeopleIcon,
    title: "Invite Your People",
    summary: "No friend requests, no social network fuss.",
    detail:
      "Share your unique six-letter invite code or direct invite link with your group. Friends enter the code on their device and instantly join the books.",
  },
  {
    n: "03",
    icon: ReceiptIcon,
    title: "Log Expenses & Scan Receipts",
    summary: "Record items in seconds or let Gemini AI read the bill.",
    detail:
      "Enter what was purchased, the cost, and who paid. Snap a photo of a physical receipt to auto-fill totals using Gemini vision OCR (5 free scans/month, unlimited on Pro).",
  },
  {
    n: "04",
    icon: SparkIcon,
    title: "Flexible Split Options",
    summary: "Split equally, by exact dollar amounts, or by custom percentage.",
    detail:
      "Not every bill is equal. Adjust splits per item when someone ordered extra or joined late. The ledger recalculates exact shares without float rounding errors.",
  },
  {
    n: "05",
    icon: WalletIcon,
    title: "Instant Net Balances",
    summary: "Always know who owes what at a glance.",
    detail:
      "Common Pot automatically nets all group transactions. Rather than making dozens of micro-payments, our settlement algorithm trims debt to the fewest possible transfers.",
  },
  {
    n: "06",
    icon: CheckIcon,
    title: "Settle Up cleanly",
    summary: "One tap marks a debt as settled.",
    detail:
      "When a friend pays you back via cash, bank transfer, or payment app, record the settlement in the ledger. Everyone's balance updates immediately.",
  },
  {
    n: "07",
    icon: ArrowIcon,
    title: "Export & Ask the Keeper",
    summary: "Full daybook CSV exports and AI assistant briefs.",
    detail:
      "Export your full expense history to CSV anytime. Use 'Ask the Keeper' AI assistant to query ledger history, check totals, or generate summary briefs.",
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
      <main className="mx-auto max-w-4xl px-5 pb-24 sm:px-8">
        <div className="pt-8 text-center sm:pt-12">
          <p className="text-[0.62rem] font-bold uppercase tracking-[0.3em] text-primary">
            User Guide &amp; Daybook Manual
          </p>
          <h1 className="mt-3 text-4xl sm:text-5xl">How to Use Common Pot</h1>
          <p className="mx-auto mt-4 max-w-xl text-base leading-7 text-foreground/75 sm:text-lg">
            A quiet, honest guide to keeping shared expenses simple, transparent, and hassle-free.
          </p>
        </div>

        <Rule label="7 Steps to Shared Balance" className="my-10" />

        {/* Step List */}
        <div className="space-y-6">
          {guideSteps.map((step) => (
            <Paper key={step.n} className="p-6 sm:p-8">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:gap-6">
                <div className="flex size-12 shrink-0 items-center justify-center rounded-full border border-border bg-secondary text-primary">
                  <step.icon className="h-6 w-6" strokeWidth={1.6} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <h2 className="font-display text-2xl">{step.title}</h2>
                    <span className="font-display text-2xl font-semibold text-border">
                      {step.n}
                    </span>
                  </div>
                  <p className="mt-1 font-medium text-primary text-sm">
                    {step.summary}
                  </p>
                  <p className="mt-2.5 text-sm leading-6 text-foreground/75">
                    {step.detail}
                  </p>
                </div>
              </div>
            </Paper>
          ))}
        </div>

        {/* CTA Footer */}
        <div className="mt-12 text-center">
          <Paper className="p-8">
            <h3 className="text-2xl">Ready to open your books?</h3>
            <p className="mt-2 text-sm text-foreground/70">
              Start your first shared ledger in under a minute — no credit card or complex setup required.
            </p>
            <div className="mt-6 flex justify-center gap-3">
              <Button asChild size="lg" className="bg-primary px-8 text-primary-foreground hover:bg-primary/90">
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
