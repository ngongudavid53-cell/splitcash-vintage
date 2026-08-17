import { useEffect, useRef, useState, type RefObject } from "react";
import { useAdTracking, type AdResponse } from "@gravity-ai/react";
import { Button } from "@/components/ui/button";
import { ArrowIcon, NoteIcon, SparkIcon } from "@/components/icons";
import { Paper } from "@/components/bits";
import { useServerConfig } from "@/lib/server";
import { cn } from "@/lib/utils";
import {
  isAssistantConfigured,
  useLedgerAssistant,
  type ChatMessage,
} from "@/hooks/use-assistant";
import { isGravityConfigured, requestAd } from "@/lib/gravity";
import type { Expense, Group, Settlement } from "@/lib/types";

const suggestions = [
  "Who owes what?",
  "Did anyone pay for the hotel?",
  "Am I owed anything?",
];

function initials(name: string): string {
  return (
    name
      .trim()
      .split(/\s+/)
      .map((p) => p[0])
      .slice(0, 2)
      .join("")
      .toUpperCase() || "?"
  );
}

/** "Ask the books" — a chat panel that answers real questions about this
 *  ledger, with a contextual ad slot below each exchange (Gravity). The
 *  Gemini + Gravity keys live on the server (main.ts proxies), auto-detected
 *  here via /api/config; client-side keys remain a fallback for previews. */
export function AskTheBooks({
  group,
  expenses,
  settlements,
  userId,
  displayName,
}: {
  group: Group;
  expenses: Expense[];
  settlements: Settlement[];
  userId: string;
  displayName: string;
}) {
  const { messages, busy, streaming, error, send } = useLedgerAssistant(
    group,
    expenses,
    settlements,
  );
  const { config: serverConfig, ready: serverReady } = useServerConfig();
  const [draft, setDraft] = useState("");
  const [ad, setAd] = useState<AdResponse | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const aiReady = serverConfig.assistant || isAssistantConfigured();
  const adsReady = serverConfig.ads || isGravityConfigured();

  // After each completed exchange, ask Gravity for one contextual ad.
  // Guarded on `streaming` so we never fire a request per chunk while the
  // reply is still being typed out — only once it has fully landed.
  useEffect(() => {
    const last = messages[messages.length - 1];
    if (!last || last.role !== "assistant" || streaming || !adsReady) return;
    let cancelled = false;
    void requestAd({
      sessionId: `ask-${group.id}-${userId}`,
      userId,
      messages: messages.slice(-4).map((m) => ({
        role: m.role,
        content: m.text,
      })),
    }).then((a) => {
      if (!cancelled) setAd(a as AdResponse | null);
    });
    return () => {
      cancelled = true;
    };
  }, [messages, streaming, adsReady, group.id, userId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, busy, ad]);

  function handleSend(text: string) {
    const t = text.trim();
    if (!t || busy) return;
    setDraft("");
    setAd(null);
    void send(t);
  }

  return (
    <Paper className="flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 border-b border-dashed border-border/70 px-4 py-3">
        <div className="flex items-center gap-2.5">
          <span className="flex size-8 items-center justify-center rounded-full border border-border bg-secondary text-foreground">
            <NoteIcon className="h-4 w-4" />
          </span>
          <div>
            <p className="font-display text-base font-semibold leading-tight">
              Ask the books
            </p>
            <p className="text-[0.58rem] font-bold uppercase tracking-[0.22em] text-muted-foreground">
              The keeper · knows this ledger
            </p>
          </div>
        </div>
        <SparkIcon className="h-4 w-4 text-accent" strokeWidth={1.6} />
      </div>

      {!serverReady ? (
        <div className="p-4">
          <p className="text-xs italic text-muted-foreground">
            Consulting the till…
          </p>
        </div>
      ) : !aiReady ? (
        <div className="p-4">
          <div className="rounded-sm border border-dashed border-border/80 bg-secondary/30 px-3.5 py-3 text-xs leading-5 text-foreground/75">
            The keeper is waiting for a server-side{" "}
            <code className="rounded-sm bg-card px-1 py-0.5 font-mono text-[0.7rem]">
              GEMINI_API_KEY
            </code>{" "}
            configuration. Add it to the backend&rsquo;s secret settings, then
            refresh the app. Provider keys are never accepted in the browser.
          </div>
        </div>
      ) : (
        <>
          {/* Conversation */}
          <div className="max-h-[380px] space-y-3.5 overflow-y-auto px-4 py-4">
            {messages.length === 0 ? (
              <div className="pt-1">
                <p className="text-sm leading-6 text-foreground/75">
                  Ask about this ledger — who owes what, what something cost,
                  whether you&rsquo;re square. It only knows what&rsquo;s
                  written here.
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {suggestions.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => handleSend(s)}
                      className="rounded-sm border border-dashed border-border bg-card px-2.5 py-1.5 text-xs text-foreground/80 transition-colors hover:border-primary/50 hover:text-primary"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              messages.map((m, i) => (
                <MessageBubble
                  key={i}
                  message={m}
                  displayName={displayName}
                  streaming={streaming && i === messages.length - 1}
                />
              ))
            )}
            {/* Typing dots only while waiting for the first chunk — once the
                reply starts streaming in, the live bubble replaces them. */}
            {busy && !streaming && <Typing />}
            <div ref={bottomRef} />
          </div>

          {/* Contextual ad, when one comes back */}
          {ad && <AdSlot ad={ad} />}

          {error && (
            <p className="mx-4 mb-3 rounded-sm border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs leading-5 text-destructive">
              {error}
            </p>
          )}

          {/* Composer */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSend(draft);
            }}
            className="flex items-center gap-2 border-t border-dashed border-border/70 p-3"
          >
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="e.g. Who owes what for the hotel?"
              className="min-w-0 flex-1 rounded-sm border border-input bg-card px-3 py-2 text-sm outline-none placeholder:text-muted-foreground/70 focus:border-ring focus:ring-1 focus:ring-ring/40"
            />
            <Button
              type="submit"
              size="icon"
              disabled={!draft.trim() || busy}
              className="shrink-0 bg-primary text-primary-foreground hover:bg-primary/90"
              aria-label="Ask the keeper"
            >
              <ArrowIcon className="h-4 w-4" />
            </Button>
          </form>
        </>
      )}
    </Paper>
  );
}

function MessageBubble({
  message,
  displayName,
  streaming = false,
}: {
  message: ChatMessage;
  displayName: string;
  streaming?: boolean;
}) {
  const isUser = message.role === "user";
  return (
    <div className={cn("flex items-start gap-2.5", isUser && "flex-row-reverse")}>
      <span
        className={cn(
          "flex size-7 shrink-0 items-center justify-center rounded-full border text-[10px] font-semibold",
          isUser
            ? "border-border bg-secondary text-foreground"
            : "border-border bg-card text-primary",
        )}
      >
        {isUser ? initials(displayName) : <SparkIcon className="h-3.5 w-3.5" />}
      </span>
      <div
        className={cn(
          "max-w-[85%] whitespace-pre-wrap rounded-sm border px-3 py-2 text-sm leading-6",
          isUser
            ? "border-border bg-secondary/60"
            : "border-border/80 bg-card",
        )}
      >
        {message.text}
        {/* A blinking caret while the keeper is still writing this reply. */}
        {streaming && (
          <span
            className="ml-0.5 inline-block h-3.5 w-1.5 animate-pulse bg-primary/70 align-text-bottom"
            aria-hidden
          />
        )}
      </div>
    </div>
  );
}

function Typing() {
  return (
    <div className="flex items-center gap-2.5">
      <span className="flex size-7 shrink-0 items-center justify-center rounded-full border border-border bg-card text-primary">
        <SparkIcon className="h-3.5 w-3.5" />
      </span>
      <span className="flex items-center gap-1 rounded-sm border border-border/80 bg-card px-3 py-2">
        <span className="size-1.5 animate-pulse rounded-full bg-muted-foreground" />
        <span className="size-1.5 animate-pulse rounded-full bg-muted-foreground [animation-delay:150ms]" />
        <span className="size-1.5 animate-pulse rounded-full bg-muted-foreground [animation-delay:300ms]" />
      </span>
      <span className="text-[0.68rem] italic text-muted-foreground">
        the keeper is tallying…
      </span>
    </div>
  );
}

/** A small hand-styled "Sponsored" card. Impression + click tracking come
 *  from the Gravity React hook (fires only when actually visible). */
function AdSlot({ ad }: { ad: AdResponse }) {
  const { containerRef, handleClick } = useAdTracking({ ad });
  const href = ad.clickUrl ?? ad.url;
  if (!href && !ad.adText) return null;
  return (
    <div className="px-4 pb-1">
      <div
        ref={containerRef as RefObject<HTMLDivElement | null>}
        className="rounded-sm border border-dashed border-accent/50 bg-accent/5 px-3.5 py-2.5"
      >
        <p className="text-[0.55rem] font-bold uppercase tracking-[0.22em] text-muted-foreground">
          Sponsored
        </p>
        <a
          href={href}
          onClick={handleClick}
          target="_blank"
          rel="noreferrer"
          className="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-xs leading-5 text-foreground/80 transition-colors hover:text-primary"
        >
          {ad.brandName && (
            <span className="font-semibold text-foreground">{ad.brandName}</span>
          )}
          {ad.title && <span className="font-display">{ad.title}</span>}
          <span>{ad.adText}</span>
          {ad.cta && (
            <span className="rounded-sm border border-accent/60 px-1.5 py-0.5 text-[0.62rem] font-bold uppercase tracking-wider text-accent">
              {ad.cta}
            </span>
          )}
        </a>
      </div>
    </div>
  );
}
