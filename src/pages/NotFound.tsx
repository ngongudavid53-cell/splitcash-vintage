import { Link } from "react-router";
import { Button } from "@/components/ui/button";
import { BrandMark, Rule, Stamp } from "@/components/bits";
import { PotIcon } from "@/components/icons";

export default function NotFound() {
  return (
    <div className="min-h-screen">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-5 py-6 sm:px-8">
        <Link to="/" aria-label="Common Pot home">
          <BrandMark />
        </Link>
        <Stamp tone="accent">404</Stamp>
      </header>

      <main className="mx-auto grid max-w-6xl gap-10 px-5 pb-24 sm:px-8 lg:grid-cols-12 lg:pt-16">
        <div className="lg:col-span-6">
          <p className="text-[0.62rem] font-bold uppercase tracking-[0.3em] text-primary">
            Leaf missing from the ledger
          </p>
          <h1 className="mt-4 text-4xl leading-tight sm:text-5xl">
            This page isn&rsquo;t in the books.
          </h1>
          <p className="mt-5 max-w-md text-base leading-7 text-foreground/75">
            Either the address was mis-typed, or the entry was struck out.
            Either way, the pot is fine — head back and pick up where you left
            off.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button asChild className="bg-primary text-primary-foreground hover:bg-primary/90">
              <Link to="/app">Your ledgers</Link>
            </Button>
            <Button asChild variant="outline">
              <Link to="/">Front page</Link>
            </Button>
          </div>
        </div>
        <div className="hidden lg:col-span-6 lg:block">
          <div className="flex justify-center">
            <div className="rotate-3">
              <Rule className="w-64" />
              <PotIcon
                className="mt-8 h-40 w-40 text-border"
                strokeWidth={1.2}
              />
              <p className="mt-4 text-center font-display text-2xl italic text-muted-foreground">
                mislaid, not lost
              </p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
