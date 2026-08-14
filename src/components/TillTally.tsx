import { Paper } from "@/components/bits";
import { TallyIcon } from "@/components/icons";
import { useServerStats } from "@/lib/server";
import { formatMoney } from "@/lib/money";

function TallyCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-sm border border-dashed border-border/70 bg-secondary/30 px-3 py-2.5">
      <p className="font-display text-xl tabular-nums leading-none">{value}</p>
      <p className="mt-1 text-[0.58rem] font-bold uppercase tracking-[0.2em] text-muted-foreground">
        {label}
      </p>
    </div>
  );
}

/** "Till tally" — the backend's in-memory usage counts since it woke up:
 *  questions asked, ad requests, checkouts settled. Polls /api/stats. */
export function TillTally() {
  const stats = useServerStats(30_000);

  return (
    <Paper className="flex flex-col px-5 py-4">
      <div className="flex items-center gap-2.5">
        <span className="flex size-8 items-center justify-center rounded-full border border-border bg-secondary text-foreground">
          <TallyIcon className="h-4 w-4" />
        </span>
        <div>
          <p className="font-display text-base font-semibold leading-tight">
            Till tally
          </p>
          <p className="text-[0.58rem] font-bold uppercase tracking-[0.22em] text-muted-foreground">
            Since the backend woke
          </p>
        </div>
      </div>

      {!stats ? (
        <p className="mt-3 rounded-sm border border-dashed border-border/70 bg-secondary/30 px-3 py-3 text-xs leading-5 text-muted-foreground">
          The till is quiet — nothing counted yet. These numbers live on the
          app&rsquo;s backend and reset whenever it restarts.
        </p>
      ) : (
        <div className="mt-3 grid grid-cols-2 gap-2">
          <TallyCell label="Questions" value={String(stats.assistant.requests)} />
          <TallyCell label="Ad requests" value={String(stats.ads.requests)} />
          <TallyCell label="Ads served" value={String(stats.ads.served)} />
          <TallyCell
            label="Checkouts paid"
            value={String(stats.stripe?.verified ?? 0)}
          />
          <div className="col-span-2 flex items-center justify-between rounded-sm border border-dashed border-border/70 bg-secondary/30 px-3 py-2">
            <p className="text-[0.58rem] font-bold uppercase tracking-[0.2em] text-muted-foreground">
              Keeper since
            </p>
            <p className="text-xs text-foreground/80">
              {new Date(stats.startedAt).toLocaleString("en-US", {
                month: "short",
                day: "numeric",
                hour: "numeric",
                minute: "2-digit",
              })}
            </p>
          </div>
        </div>
      )}
    </Paper>
  );
}
