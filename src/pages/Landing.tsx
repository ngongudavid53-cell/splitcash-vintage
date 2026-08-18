import { motion } from "framer-motion";
import { Link } from "react-router";
import { Button } from "@/components/ui/button";
import {
  computeBalances,
  memberName,
  potTotal,
  settleUp,
} from "@/lib/balances";
import { formatMoney } from "@/lib/money";
import type { Expense, Group } from "@/lib/types";
import { useAuth } from "@/hooks/use-auth";
import { BrandMark, Monogram, Paper, Rule, Stamp } from "@/components/bits";
import {
  ArrowIcon,
  CheckIcon,
  PeopleIcon,
  PotIcon,
  ReceiptIcon,
  SparkIcon,
  WalletIcon,
} from "@/components/icons";
import { SupportPot } from "@/components/SupportPot";
import { BraintreeTipJar } from "@/components/BraintreeTipJar";
import { SeasonalBanner } from "@/components/SeasonalBanner";

const fade = {
  initial: { opacity: 0, y: 18 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: "-70px" },
  transition: { duration: 0.55, ease: [0.22, 1, 0.36, 1] as const },
};

/* A working specimen — this is the real arithmetic, painted onto paper. */
const specimenMembers = [
  { uid: "maya", name: "Maya" },
  { uid: "alex", name: "Alex" },
  { uid: "theo", name: "Theo" },
];

const mockGroup: Group = {
  id: "mock",
  name: "Lisbon, June '26",
  inviteCode: "POT-42",
  members: specimenMembers,
  memberIds: ["maya", "alex", "theo"],
  createdBy: "maya",
  createdAt: Date.now(),
};

const mockExpenses: Expense[] = [
  {
    id: "1",
    description: "Dinner at the tasca",
    amount: 84.6,
    paidBy: "maya",
    splitBetween: ["maya", "alex", "theo"],
    splitMode: "equal",
    createdBy: "maya",
    createdAt: Date.now() - 1000 * 60 * 60 * 26,
  },
  {
    id: "2",
    description: "Metro cards",
    amount: 21,
    paidBy: "alex",
    splitBetween: ["maya", "alex", "theo"],
    splitMode: "equal",
    createdBy: "alex",
    createdAt: Date.now() - 1000 * 60 * 60 * 20,
  },
  {
    id: "3",
    description: "The hotel, 2 nights",
    amount: 240,
    paidBy: "maya",
    splitBetween: ["maya", "alex"],
    splitMode: "equal",
    createdBy: "maya",
    createdAt: Date.now() - 1000 * 60 * 60 * 5,
  },
];

function SpecimenLedger() {
  const balances = computeBalances(mockGroup, mockExpenses);
  const transfers = settleUp(balances);
  const total = potTotal(mockExpenses);
  const [first, ...rest] = transfers;

  return (
    <Paper className="rotate-[1.3deg] p-6 sm:p-7">
      {/* tape corners */}
      <span className="absolute -top-2 -left-3 h-6 w-16 -rotate-12 rounded-sm bg-secondary/80 shadow-sm" />
      <span className="absolute -top-2 -right-3 h-6 w-16 rotate-12 rounded-sm bg-secondary/80 shadow-sm" />

      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[0.6rem] font-bold uppercase tracking-[0.25em] text-muted-foreground">
            Ledger № 4 · Vol. I
          </p>
          <p className="mt-1 font-display text-2xl">{mockGroup.name}</p>
        </div>
        <div className="flex -space-x-2">
          {specimenMembers.map((m) => (
            <Monogram
              key={m.uid}
              name={m.name}
              size="sm"
              className="ring-2 ring-card"
            />
          ))}
        </div>
      </div>

      <div className="mt-5 space-y-2.5">
        {mockExpenses.map((e) => (
          <div key={e.id} className="flex items-baseline justify-between gap-3 text-sm">
            <span className="truncate text-foreground/85">
              {e.description}
              <span className="ml-1.5 text-xs italic text-muted-foreground">
                — {memberName(mockGroup, e.paidBy)} paid
              </span>
            </span>
            <span className="shrink-0 font-display tabular-nums">
              {formatMoney(e.amount)}
            </span>
          </div>
        ))}
      </div>

      <div className="mt-4 flex items-center justify-between border-t border-dashed border-border pt-3">
        <span className="text-[0.62rem] font-bold uppercase tracking-[0.25em] text-muted-foreground">
          In the pot
        </span>
        <span className="font-display text-lg tabular-nums">
          {formatMoney(total)}
        </span>
      </div>

      {first && (
        <div className="mt-4 rounded-sm border border-border bg-secondary/40 px-3.5 py-3">
          <div className="flex items-center gap-2.5">
            <Monogram name={memberName(mockGroup, first.from)} size="sm" />
            <ArrowIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
            <Monogram name={memberName(mockGroup, first.to)} size="sm" />
            <p className="ml-1 flex-1 truncate text-sm">
              <span className="font-medium">{memberName(mockGroup, first.from)}</span>
              <span className="text-muted-foreground"> pays </span>
              <span className="font-medium">{memberName(mockGroup, first.to)}</span>
            </p>
            <span className="font-display tabular-nums">
              {formatMoney(first.amount)}
            </span>
          </div>
        </div>
      )}

      {rest.map((t) => (
        <div
          key={`${t.from}-${t.to}`}
          className="mt-2 flex items-center justify-between rounded-sm border border-dashed border-border/70 px-3.5 py-2.5 opacity-70"
        >
          <p className="truncate text-xs text-foreground/75">
            {memberName(mockGroup, t.from)} pays {memberName(mockGroup, t.to)}
          </p>
          <span className="font-display text-sm tabular-nums">
            {formatMoney(t.amount)}
          </span>
        </div>
      ))}

      <div className="mt-4 flex items-end justify-between">
        <span className="font-display text-xl italic text-foreground/80">
          tick, done — obrigada!
        </span>
        <Stamp tone="paid">Settled ✓</Stamp>
      </div>
    </Paper>
  );
}

const steps = [
  {
    n: "01",
    icon: PeopleIcon,
    title: "Open a ledger",
    body: "A ledger for the trip, the flat, the dinner club. Friends join with a six-letter code — no friend requests, no fuss.",
  },
  {
    n: "02",
    icon: ReceiptIcon,
    title: "Log the expenses",
    body: "Who paid, how much, and how it splits — equally, or however you actually agreed. The bookkeeping takes care of itself.",
  },
  {
    n: "03",
    icon: WalletIcon,
    title: "Settle up, simply",
    body: "We work out who owes whom and trim it to the fewest transfers. One tap marks it settled. That's the whole job.",
  },
] as const;

const fieldNotes = [
  {
    title: "Write it down",
    body: "Nobody remembers who paid for the ferry. The ledger remembers.",
  },
  {
    title: "Equal isn't always fair",
    body: "Split by amount or percentage when the wine list disagreed with you.",
  },
  {
    title: "Fewer transfers",
    body: "One payment beats four. We trim the maths so you don't have to.",
  },
];

export default function Landing() {
  const { isAuthenticated } = useAuth();
  const home = isAuthenticated ? "/app" : "/auth";

  return (
    <div className="min-h-screen">
      {/* Masthead */}
      <header className="mx-auto flex max-w-6xl items-center justify-between px-5 py-6 sm:px-8">
        <Link to="/" aria-label="Common Pot home">
          <BrandMark />
        </Link>
        <div className="flex items-center gap-5 sm:gap-7">
          <span className="hidden text-[0.62rem] font-semibold uppercase tracking-[0.28em] text-muted-foreground md:block">
            Est. today — a ledger for friends
          </span>
          <Link
            to={home}
            className="text-sm font-medium underline decoration-dotted underline-offset-4 hover:text-primary"
          >
            {isAuthenticated ? "Your ledgers" : "Sign in"}
          </Link>
          <Button asChild size="sm" className="bg-primary text-primary-foreground hover:bg-primary/90">
            <Link to={home}>
              {isAuthenticated ? "Your ledgers" : "Open a ledger"}
            </Link>
          </Button>
        </div>
      </header>

      {/* Hero — set left, like a book page */}
      <section className="mx-auto grid max-w-6xl gap-14 px-5 pb-16 sm:px-8 lg:grid-cols-12 lg:gap-8 lg:pb-24">
        <div className="lg:col-span-12">
          <SeasonalBanner />
        </div>
        <div className="lg:col-span-7 lg:pt-16">
          <motion.div {...fade}>
            <p className="text-[0.62rem] font-bold uppercase tracking-[0.3em] text-primary">
              Split · Log · Settle
            </p>
            <h1 className="mt-4 max-w-xl text-4xl leading-[1.05] sm:text-5xl lg:text-[3.6rem]">
              Friends don&rsquo;t let friends do{" "}
              <em className="italic text-primary">mental maths</em> at dinner.
            </h1>
            <p className="mt-6 max-w-xl text-base leading-7 text-foreground/75 sm:text-lg sm:leading-8">
              Common Pot keeps a quiet, honest ledger for every trip, flat
              share, dinner club and festival kit. Who paid, who owes, and
              what to actually transfer — trimmed to the fewest transactions
              and updated as you log.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Button
                asChild
                size="lg"
                className="bg-primary px-7 text-primary-foreground hover:bg-primary/90"
              >
                <Link to={home}>
                  {isAuthenticated ? "Your ledgers" : "Open the books"}
                </Link>
              </Button>
              <Button
                type="button"
                size="lg"
                variant="outline"
                onClick={() =>
                  document
                    .getElementById("how")
                    ?.scrollIntoView({ behavior: "smooth" })
                }
              >
                How it works
              </Button>
            </div>
            <p className="mt-5 max-w-md text-xs italic text-muted-foreground">
              No fees. No card-linking. No &ldquo;I think you still owe
              me&rdquo; energy. Just arithmetic.
            </p>
          </motion.div>
        </div>

        <div className="lg:col-span-5">
          <motion.div {...fade} className="lg:mt-20">
            <SpecimenLedger />
          </motion.div>
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="mx-auto max-w-6xl px-5 pb-20 sm:px-8 lg:pb-28">
        <motion.div {...fade}>
          <Rule label="How it works" />
        </motion.div>
        <div className="mt-10 grid gap-8 md:grid-cols-3 md:gap-6">
          {steps.map((step, i) => (
            <motion.div
              key={step.n}
              {...fade}
              className={
                i === 0
                  ? "md:mt-6"
                  : i === 2
                    ? "md:mt-14"
                    : "md:mt-0"
              }
            >
              <Paper className="h-full p-7">
                <div className="flex items-center justify-between">
                  <step.icon className="h-7 w-7 text-primary" strokeWidth={1.5} />
                  <span className="font-display text-3xl font-semibold text-border">
                    {step.n}
                  </span>
                </div>
                <h3 className="mt-6 text-xl">{step.title}</h3>
                <p className="mt-2.5 text-sm leading-6 text-foreground/70">
                  {step.body}
                </p>
              </Paper>
            </motion.div>
          ))}
        </div>
      </section>

      {/* Field notes */}
      <section className="mx-auto max-w-6xl px-5 pb-20 sm:px-8 lg:pb-28">
        <div className="grid gap-6 md:grid-cols-3">
          {fieldNotes.map((note, i) => (
            <motion.div key={note.title} {...fade} className={i === 1 ? "md:-translate-y-4" : ""}>
              <div className="flex gap-4">
                <SparkIcon className="mt-1 h-4 w-4 shrink-0 text-accent" strokeWidth={1.8} />
                <div>
                  <p className="font-display text-base italic">{note.title}</p>
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">
                    {note.body}
                  </p>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </section>

      {/* Closing CTA */}
      <section className="mx-auto max-w-6xl px-5 pb-24 sm:px-8">
        <motion.div {...fade}>
          <Paper className="relative overflow-hidden px-7 py-12 sm:px-12">
            <div className="flex flex-col items-start gap-8 md:flex-row md:items-end md:justify-between">
              <div className="max-w-lg">
                <p className="text-[0.62rem] font-bold uppercase tracking-[0.28em] text-primary">
                  Begin with an empty page
                </p>
                <h2 className="mt-3 text-3xl leading-tight sm:text-4xl">
                  Start your first ledger — it takes about a minute.
                </h2>
                <p className="mt-4 text-sm leading-6 text-foreground/70">
                  Create a pot for the trip, hand a friend the code, and log
                  the first expense before anyone claims they paid for the
                  wine.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <Button
                  asChild
                  size="lg"
                  className="bg-primary px-7 text-primary-foreground hover:bg-primary/90"
                >
                  <Link to={home}>
                    {isAuthenticated ? "Your ledgers" : "Open the books"}
                  </Link>
                </Button>
                <span className="text-xs italic text-muted-foreground">
                  {isAuthenticated
                    ? "Straight to your ledgers"
                    : "Sign in with email or Google"}
                </span>
                <SupportPot />
                <BraintreeTipJar />
              </div>
            </div>
            <CheckIcon className="pointer-events-none absolute -bottom-4 -right-3 h-24 w-24 rotate-12 text-border" />
          </Paper>
        </motion.div>
      </section>

      {/* Footer */}
      <footer className="border-t border-dashed border-border/70">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-5 py-8 sm:flex-row sm:items-center sm:justify-between sm:px-8">
          <div className="flex items-center gap-2.5">
            <PotIcon className="h-5 w-5 text-primary" strokeWidth={1.8} />
            <span className="font-display font-semibold">Common Pot</span>
            <span className="text-xs text-muted-foreground">· Vol. I, est. today</span>
          </div>
          <p className="max-w-sm text-xs leading-5 text-muted-foreground">
            Hand-set in Fraunces &amp; Archivo on aged paper. No tracking, no
            fees — it&rsquo;s just a ledger.
          </p>
        </div>
      </footer>
    </div>
  );
}
