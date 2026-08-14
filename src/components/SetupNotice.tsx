import { REQUIRED_FIREBASE_KEYS } from "@/lib/firebase";
import { Paper, Rule, Stamp } from "./bits";
import { CheckIcon } from "./icons";

/** Shown when the Firebase env keys haven't been added yet. */
export function SetupNotice() {
  return (
    <Paper className="mx-auto w-full max-w-xl p-8 sm:p-10">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[0.62rem] font-bold uppercase tracking-[0.25em] text-muted-foreground">
            Page 0 · The unopened ledger
          </p>
          <h2 className="mt-3 text-2xl sm:text-3xl">
            This pot isn&rsquo;t wired up yet
          </h2>
        </div>
        <Stamp tone="accent" className="mt-1 hidden shrink-0 sm:inline-flex">
          Awaiting keys
        </Stamp>
      </div>

      <p className="mt-5 text-sm leading-6 text-foreground/80">
        Common Pot runs on{" "}
        <span className="font-semibold text-foreground">
          Firebase&nbsp;Auth + Cloud&nbsp;Firestore
        </span>
        . The app is fully built — it just needs your project&rsquo;s web SDK
        config to come alive.
      </p>

      <ol className="mt-6 space-y-4 text-sm leading-6 text-foreground/80">
        <li className="flex gap-3">
          <span className="font-display text-lg font-semibold text-primary">
            1
          </span>
          <span>
            Create a Firebase project (or open an existing one) and add a{" "}
            <span className="font-semibold text-foreground">Web app</span> to
            it. Copy the config values it shows you.
          </span>
        </li>
        <li className="flex gap-3">
          <span className="font-display text-lg font-semibold text-primary">
            2
          </span>
          <span>
            In <span className="font-semibold text-foreground">Authentication</span>,
            enable the <span className="font-semibold text-foreground">Email/Password</span>{" "}
            and <span className="font-semibold text-foreground">Google</span>{" "}
            sign-in providers.
          </span>
        </li>
        <li className="flex gap-3">
          <span className="font-display text-lg font-semibold text-primary">
            3
          </span>
          <span>
            In <span className="font-semibold text-foreground">Firestore Database</span>,
            create the database and paste in the rules from the{" "}
            <code className="rounded-sm bg-secondary px-1.5 py-0.5 font-mono text-xs">
              firestore.rules
            </code>{" "}
            file in this project.
          </span>
        </li>
        <li className="flex gap-3">
          <span className="font-display text-lg font-semibold text-primary">
            4
          </span>
          <span>
            Paste the values into this project&rsquo;s{" "}
            <span className="font-semibold text-foreground">Keys / API keys</span>{" "}
            tab under these names:
          </span>
        </li>
      </ol>

      <div className="mt-5 grid gap-2">
        {REQUIRED_FIREBASE_KEYS.map((key) => (
          <code
            key={key}
            className="rounded-sm border border-border bg-secondary/60 px-2.5 py-1.5 font-mono text-xs text-foreground/90"
          >
            {key}
          </code>
        ))}
        <code className="rounded-sm border border-border bg-secondary/60 px-2.5 py-1.5 font-mono text-xs text-foreground/60">
          VITE_FIREBASE_STORAGE_BUCKET · VITE_FIREBASE_MESSAGING_SENDER_ID (optional)
        </code>
      </div>

      <Rule label="Once the keys are in" className="mt-8" />
      <p className="mt-4 flex items-center gap-2 text-sm text-foreground/70">
        <CheckIcon className="h-4 w-4 text-primary" />
        Refresh the page and the pot fills itself.
      </p>
    </Paper>
  );
}
