import { Link } from "react-router";
import { Button } from "@/components/ui/button";
import { BrandMark, Paper, Rule } from "@/components/bits";
import { ArrowIcon, CheckIcon, PeopleIcon, ReceiptIcon, WalletIcon, SparkIcon } from "@/components/icons";

const sections = [
  { icon: PeopleIcon, title: "1. Create your first book", body: "Open a ledger for a trip, flat share, dinner club, festival, or any shared spend. Give it a clear name so everyone knows what the pot is for.", bullets: ["Open the books from the home page.", "Choose a name for the ledger.", "Share the invite code with the people who should join."] },
  { icon: PeopleIcon, title: "2. Invite friends", body: "A ledger is shared through its invite code. Friends can join from their own account and see the same book.", bullets: ["Copy the invite code from the ledger.", "Send it to the people who should be members.", "Ask each person to check that their name is correct after joining."] },
  { icon: ReceiptIcon, title: "3. Add an expense", body: "Record who actually paid, the amount, and who should share that cost. Common Pot then keeps the running balances up to date.", bullets: ["Enter a short description.", "Enter the amount and select the payer.", "Choose the members included in the split."] },
  { icon: ReceiptIcon, title: "4. Use equal or custom splits", body: "Equal splits are quickest when everyone shares the same amount. Use the custom split controls when people owe different amounts.", bullets: ["Use equal when the cost is shared evenly.", "Use custom amounts when people consumed or agreed to different shares.", "Check the split total before saving."] },
  { icon: WalletIcon, title: "5. See who owes whom", body: "The ledger turns all recorded expenses into balances. The settlement view reduces those balances into a small set of payments.", bullets: ["Open the ledger balance section.", "Review each member's position.", "Use the suggested transfers as the simplest way to settle."] },
  { icon: WalletIcon, title: "6. Record settlements", body: "When someone has paid what they owe, mark the suggested settlement as done. This keeps the ledger's outstanding balances clear.", bullets: ["Agree the payment with the other member.", "Record or mark the settlement in the ledger.", "Recheck the balances after settling."] },
  { icon: ReceiptIcon, title: "7. Receipt scanning", body: "When the Keeper is configured, receipt scanning can read the useful details from a receipt and help you turn them into an expense. Always check the extracted values before saving.", bullets: ["Take a clear photo of the receipt.", "Review the extracted description and amount.", "Correct anything that is wrong before saving the expense."] },
  { icon: CheckIcon, title: "8. CSV export", body: "Use CSV export when you want a portable copy of a ledger's daybook for your own records or further analysis.", bullets: ["Open the ledger you want to export.", "Choose CSV export.", "Keep the exported file somewhere you trust."] },
];

export default function Help() {
  return (
    <div className="min-h-screen">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-5 py-6 sm:px-8">
        <Link to="/"><BrandMark /></Link>
        <div className="flex items-center gap-3"><Button asChild variant="ghost" size="sm"><Link to="/auth">Sign in</Link></Button><Button asChild size="sm"><Link to="/">Back home</Link></Button></div>
      </header>
      <main className="mx-auto max-w-5xl px-5 pb-20 sm:px-8">
        <section className="py-10 sm:py-16">
          <p className="text-[0.62rem] font-bold uppercase tracking-[0.3em] text-primary">The Common Pot handbook</p>
          <h1 className="mt-4 max-w-3xl text-4xl leading-tight sm:text-5xl">How to use Common Pot</h1>
          <p className="mt-5 max-w-2xl text-base leading-7 text-foreground/75 sm:text-lg">A short guide from opening your first book to settling the last payment. Keep this page handy when a friend asks, "Okay, but how does this work?"</p>
          <div className="mt-7 flex flex-wrap gap-3"><Button asChild><Link to="/auth">Open a ledger <ArrowIcon className="ml-2 h-4 w-4" /></Link></Button><Button asChild variant="outline"><Link to="/">See how it works</Link></Button></div>
        </section>
        <Rule label="The quick guide" />
        <section className="mt-10 grid gap-6 md:grid-cols-2">
          {sections.map(({ icon: Icon, title, body, bullets }) => <Paper key={title} className="p-7"><div className="flex items-start gap-4"><Icon className="mt-0.5 h-6 w-6 shrink-0 text-primary" strokeWidth={1.6} /><div><h2 className="text-xl">{title}</h2><p className="mt-2 text-sm leading-6 text-foreground/70">{body}</p><ul className="mt-4 space-y-2 text-sm leading-6 text-foreground/80">{bullets.map((bullet) => <li key={bullet} className="flex gap-2"><CheckIcon className="mt-1 h-4 w-4 shrink-0 text-primary" />{bullet}</li>)}</ul></div></div></Paper>)}
        </section>
        <section className="mt-10"><Paper className="p-7 sm:p-9"><div className="flex gap-4"><SparkIcon className="mt-1 h-5 w-5 shrink-0 text-accent" /><div><h2 className="text-xl">Account and sign-in help</h2><p className="mt-2 text-sm leading-6 text-foreground/70">You can sign in with email and password or with Google. If you forget an email-account password, use the "Forgot password?" option on the sign-in page to request a reset email. If an account was originally created with Google, continue with Google instead of creating a second account.</p><div className="mt-5 flex flex-wrap gap-3"><Button asChild><Link to="/auth">Go to sign in</Link></Button><Button asChild variant="outline"><Link to="/">Back to Common Pot</Link></Button></div></div></div></Paper></section>
      </main>
    </div>
  );
}
