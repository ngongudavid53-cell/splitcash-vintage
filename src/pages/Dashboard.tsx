import { useState, type FormEvent } from "react";
import { format } from "date-fns";
import { Link, useNavigate } from "react-router";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/use-auth";
import { useMyGroups } from "@/hooks/use-realtime";
import { isFirebaseConfigured } from "@/lib/firebase";
import { createGroup, joinGroupByCode } from "@/lib/firestore";
import { BrandMark, Monogram, Paper, Rule, Stamp } from "@/components/bits";
import {
  ArrowIcon,
  CopyIcon,
  LogoutIcon,
  PeopleIcon,
  PlusIcon,
  PotIcon,
} from "@/components/icons";
import { SetupNotice } from "@/components/SetupNotice";
import { SeasonalBanner } from "@/components/SeasonalBanner";
import { SupportPot } from "@/components/SupportPot";
import { TillStatus } from "@/components/TillStatus";
import { TillTally } from "@/components/TillTally";
import { PremiumCard } from "@/components/PremiumCard";

export default function Dashboard() {
  const { user, profile, signOut } = useAuth();
  const navigate = useNavigate();
  const { data: groups, loaded, error: groupsError } = useMyGroups(user?.uid);

  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);

  const [joinOpen, setJoinOpen] = useState(false);
  const [joinCode, setJoinCode] = useState("");
  const [joinError, setJoinError] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);

  const displayName =
    profile?.name ?? user?.displayName ?? user?.email?.split("@")[0] ?? "Friend";
  const me = user?.uid ? { uid: user.uid, name: displayName } : null;

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    if (!me || !newName.trim()) return;
    setCreating(true);
    try {
      const id = await createGroup(newName, me);
      toast.success("Ledger opened — share the code with your people");
      navigate(`/app/g/${id}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't open that ledger");
      setCreating(false);
    }
  }

  async function handleJoin(e: FormEvent) {
    e.preventDefault();
    if (!me) return;
    setJoining(true);
    setJoinError(null);
    try {
      const id = await joinGroupByCode(joinCode, me);
      toast.success("Welcome to the ledger");
      navigate(`/app/g/${id}`);
    } catch (err) {
      setJoinError(err instanceof Error ? err.message : "Couldn't join with that code");
      setJoining(false);
    }
  }

  async function handleSignOut() {
    try {
      await signOut();
      navigate("/");
    } catch {
      toast.error("Couldn't sign out just now");
    }
  }

  return (
    <div className="min-h-screen">
      {/* App bar */}
      <header className="mx-auto flex max-w-6xl items-center justify-between px-5 py-6 sm:px-8">
        <Link to="/app" aria-label="Your ledgers">
          <BrandMark compact />
        </Link>
        <div className="flex items-center gap-3">
          <span className="hidden items-center gap-2 sm:flex">
            <Monogram name={displayName} size="sm" />
            <span className="max-w-32 truncate text-sm font-medium">
              {displayName}
            </span>
          </span>
          <Link
            to="/how-to-use"
            className="text-sm font-medium text-muted-foreground hover:text-foreground"
          >
            How to use
          </Link>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-1.5 border-border bg-card"
            onClick={handleSignOut}
          >
            <LogoutIcon className="h-4 w-4" />
            Sign out
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-5 pb-24 sm:px-8">
        {!isFirebaseConfigured ? (
          <div className="pt-10">
            <SetupNotice />
          </div>
        ) : (
          <>
            {/* Heading */}
            <div className="mt-6 flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
              <div>
                <p className="text-[0.62rem] font-bold uppercase tracking-[0.3em] text-primary">
                  The books
                </p>
                <h1 className="mt-2 text-4xl sm:text-5xl">Your ledgers</h1>
                <p className="mt-3 max-w-md text-sm leading-6 text-foreground/70">
                  Every trip, flat share and dinner club gets its own book.
                  Open a new one, or join a friend&rsquo;s with their code.
                </p>
              </div>
              <div className="flex flex-wrap gap-3">
                <Button
                  type="button"
                  className="gap-2 bg-primary text-primary-foreground hover:bg-primary/90"
                  onClick={() => setCreateOpen(true)}
                >
                  <PlusIcon className="h-4 w-4" />
                  Open a new ledger
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="gap-2 border-border bg-card"
                  onClick={() => setJoinOpen(true)}
                >
                  <CopyIcon className="h-4 w-4" />
                  Join with a code
                </Button>
                <SupportPot />
              </div>
            </div>

            <Rule label="Index of ledgers" className="mt-10 mb-6" />

            {groupsError && (
              <div className="mb-6 rounded-sm border border-destructive/40 bg-destructive/10 px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-destructive">
                  The shelves are locked
                </p>
                <p className="mt-1 text-xs leading-5 text-foreground/80">
                  Firestore is refusing to read your ledgers. If you&rsquo;ve
                  just set up Firebase, publish the rules from the{" "}
                  <code className="rounded-sm bg-secondary px-1 py-0.5 font-mono">
                    firestore.rules
                  </code>{" "}
                  file (Firestore Database → Rules → Publish), then refresh.
                </p>
              </div>
            )}

            {/* Ledger list */}
            {!loaded ? (
              <div className="space-y-3">
                {[0, 1, 2].map((i) => (
                  <div
                    key={i}
                    className="h-20 animate-pulse rounded-sm border border-border/60 bg-card/50"
                  />
                ))}
              </div>
            ) : groups && groups.length > 0 ? (
              <ul className="space-y-3">
                {groups.map((g) => (
                  <li key={g.id}>
                    <Link
                      to={`/app/g/${g.id}`}
                      className="group flex items-center gap-4 rounded-sm border border-border/80 bg-card px-5 py-4 transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-[0_14px_30px_-18px_rgba(56,43,29,0.5)]"
                    >
                      <div className="flex -space-x-2">
                        {g.members.slice(0, 4).map((m) => (
                          <Monogram
                            key={m.uid}
                            name={m.name}
                            size="sm"
                            className="ring-2 ring-card"
                          />
                        ))}
                        {g.members.length > 4 && (
                          <span className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-border bg-secondary text-[10px] font-semibold ring-2 ring-card">
                            +{g.members.length - 4}
                          </span>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-display text-lg leading-snug">
                          {g.name}
                        </p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {g.members.length} member
                          {g.members.length === 1 ? "" : "s"} · code{" "}
                          <span className="font-semibold tracking-[0.18em] text-foreground/80">
                            {g.inviteCode}
                          </span>{" "}
                          · opened{" "}
                          {g.createdAt ? format(new Date(g.createdAt), "d MMM yyyy") : "recently"}
                        </p>
                      </div>
                      <ArrowIcon className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-1 group-hover:text-primary" />
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="rounded-sm border border-dashed border-border bg-card/60 px-6 py-16 text-center">
                <PotIcon className="mx-auto h-9 w-9 text-muted-foreground/50" strokeWidth={1.5} />
                <p className="mt-4 font-display text-2xl">The shelves are empty</p>
                <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted-foreground">
                  No ledgers yet. Open one for the trip you keep postponing, or
                  ask a friend for their six-letter code.
                </p>
                <Button
                  type="button"
                  className="mt-6 gap-2 bg-primary text-primary-foreground hover:bg-primary/90"
                  onClick={() => setCreateOpen(true)}
                >
                  <PlusIcon className="h-4 w-4" />
                  Open your first ledger
                </Button>
              </div>
            )}

            {/* The till — wiring status, live tallies, premium */}
            <Rule label="The till" className="mt-12 mb-6" />
            <div className="grid gap-3 md:grid-cols-3">
              <TillStatus />
              <TillTally />
              <PremiumCard />
            </div>
          </>
        )}
      </main>

      {/* Create dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="paper-texture max-w-sm rounded-sm border-border/80 bg-card">
          <DialogHeader>
            <div className="flex items-center gap-3">
              <span className="flex size-10 items-center justify-center rounded-full border border-border bg-secondary text-foreground">
                <PeopleIcon className="h-5 w-5" />
              </span>
              <div>
                <DialogTitle className="font-display text-xl">
                  Open a new ledger
                </DialogTitle>
                <DialogDescription>
                  For the trip, the flat, the club…
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>
          <form onSubmit={handleCreate} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-[0.62rem] font-bold uppercase tracking-[0.22em] text-muted-foreground">
                Ledger name
              </label>
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Lisbon, June '26"
                className="rounded-sm border-input bg-card"
                autoFocus
                required
              />
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setCreateOpen(false)}
                disabled={creating}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                className="bg-primary text-primary-foreground hover:bg-primary/90"
                disabled={creating || !newName.trim()}
              >
                {creating ? "Opening…" : "Open it"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Join dialog */}
      <Dialog open={joinOpen} onOpenChange={setJoinOpen}>
        <DialogContent className="paper-texture max-w-sm rounded-sm border-border/80 bg-card">
          <DialogHeader>
            <div className="flex items-center gap-3">
              <span className="flex size-10 items-center justify-center rounded-full border border-border bg-secondary text-foreground">
                <CopyIcon className="h-5 w-5" />
              </span>
              <div>
                <DialogTitle className="font-display text-xl">
                  Join with a code
                </DialogTitle>
                <DialogDescription>
                  Six letters and numbers, straight from a friend.
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>
          <form onSubmit={handleJoin} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-[0.62rem] font-bold uppercase tracking-[0.22em] text-muted-foreground">
                Invite code
              </label>
              <Input
                value={joinCode}
                onChange={(e) =>
                  setJoinCode(e.target.value.toUpperCase().slice(0, 6))
                }
                placeholder="POT-42"
                className="rounded-sm border-input bg-card text-center font-display text-xl tracking-[0.35em]"
                autoFocus
                required
              />
            </div>
            {joinError && (
              <p className="rounded-sm border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                {joinError}
              </p>
            )}
            <div className="flex justify-end gap-2 pt-1">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setJoinOpen(false)}
                disabled={joining}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                className="bg-primary text-primary-foreground hover:bg-primary/90"
                disabled={joining || joinCode.length !== 6}
              >
                {joining ? "Looking…" : "Join"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
