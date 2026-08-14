import { GoogleGenerativeAI, type Content } from "@google/generative-ai";
import { useCallback, useMemo, useState } from "react";
import { buildLedgerBrief } from "@/lib/assistant";
import { apiBase, fetchServerConfig } from "@/lib/server";
import type { Expense, Group, Settlement } from "@/lib/types";

export interface ChatMessage {
  role: "user" | "assistant";
  text: string;
}

const API_KEY = import.meta.env.VITE_GEMINI_API_KEY as string | undefined;
/** Newest first; we fall back to an older model if one is unavailable. */
const MODELS = ["gemini-2.5-flash", "gemini-2.0-flash"];

const BLANK_REPLY = "The keeper drew a blank — try asking in a different way.";

const ASSISTANT_SYSTEM = (brief: string) =>
  [
    "You are the keeper of the books for Common Pot, a shared expense ledger.",
    "Answer questions about THIS ledger. Be warm, brief and plain — no lectures.",
    "Use ONLY the numbers and entries given below. Never invent expenses, people, or amounts.",
    "If a question goes beyond the ledger, say in one line that it's outside the books.",
    "Keep money in the same format as the brief.",
    "THE LEDGER:",
    brief,
  ].join("\n");

/** True when a client-side key exists — the fallback path for previews without
 *  the backend proxy. The proxy (server-side key) is detected separately via
 *  the backend config. */
export function isAssistantConfigured(): boolean {
  return Boolean(API_KEY);
}

/** Stream an answer through the app's own backend (/api/assistant on the
 *  Convex till), which holds the Gemini key. Yields cumulative text via
 *  onChunk; throws on transport/status errors so the caller can fall back to
 *  the direct path. */
async function streamViaProxy(
  history: ChatMessage[],
  brief: string,
  onChunk: (full: string) => void,
): Promise<string> {
  const res = await fetch(`${apiBase()}/api/assistant`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal: AbortSignal.timeout(60_000),
    body: JSON.stringify({
      messages: history.map((m) => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: m.text }],
      })),
      brief,
    }),
  });
  if (!res.ok || !res.body) throw new Error(`proxy_error_${res.status}`);

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let acc = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let sep: number;
    while ((sep = buffer.indexOf("\n\n")) !== -1) {
      const event = buffer.slice(0, sep);
      buffer = buffer.slice(sep + 2);
      for (const line of event.split("\n")) {
        if (!line.startsWith("data:")) continue;
        const payload = line.slice(5).trim();
        if (!payload) continue;
        let parsed: { text?: string; message?: string };
        try {
          parsed = JSON.parse(payload) as { text?: string; message?: string };
        } catch {
          continue;
        }
        if (typeof parsed.text === "string" && parsed.text) {
          acc += parsed.text;
          onChunk(acc);
        } else if (parsed.message) {
          throw new Error(parsed.message);
        }
      }
    }
  }
  return acc;
}

/** Stream straight to Gemini from the browser (client key). Same chunk
 *  contract, with model fallback for unavailable models. */
async function streamViaGemini(
  history: ChatMessage[],
  brief: string,
  onChunk: (full: string) => void,
): Promise<string> {
  if (!API_KEY) throw new Error("no_gemini_key");
  const genAI = new GoogleGenerativeAI(API_KEY);
  const contents: Content[] = history.map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.text }],
  }));
  const systemInstruction = ASSISTANT_SYSTEM(brief);

  let lastError: unknown = null;
  let acc = "";
  let started = false;
  for (const model of MODELS) {
    // Never switch models mid-stream — a partial reply stays visible.
    if (started) break;
    try {
      const gemini = genAI.getGenerativeModel({ model, systemInstruction });
      const result = await gemini.generateContentStream({ contents });
      for await (const chunk of result.stream) {
        try {
          acc += chunk.text();
        } catch {
          // A blocked chunk — skip it rather than failing the turn.
        }
        if (!acc) continue;
        started = true;
        onChunk(acc);
      }
      lastError = null;
      break;
    } catch (err) {
      lastError = err;
    }
  }
  if (lastError && !started) throw lastError;
  return acc;
}

export function useLedgerAssistant(
  group: Group | undefined,
  expenses: Expense[],
  settlements: Settlement[],
) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [busy, setBusy] = useState(false);
  /** True while a partial assistant reply is being typed out on screen. */
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const brief = useMemo(
    () => (group ? buildLedgerBrief(group, expenses, settlements) : ""),
    [group, expenses, settlements],
  );

  const send = useCallback(
    async (raw: string) => {
      const text = raw.trim();
      if (!text || busy) return;
      const history: ChatMessage[] = [...messages, { role: "user", text }];
      setMessages(history);
      setBusy(true);
      setStreaming(false);
      setError(null);

      let acc = "";
      let started = false;
      const onChunk = (full: string) => {
        if (!started) {
          started = true;
          setStreaming(true);
          setMessages((prev) => [...prev, { role: "assistant", text: full }]);
        } else {
          // Patch the live bubble in place as the reply grows.
          setMessages((prev) => {
            const next = prev.slice();
            next[next.length - 1] = { role: "assistant", text: full };
            return next;
          });
        }
      };

      try {
        let lastError: unknown = null;
        const config = await fetchServerConfig();

        // Preferred path: the app's own backend (key stays server-side).
        if (config.assistant) {
          try {
            acc = await streamViaProxy(history, brief, onChunk);
            lastError = null;
          } catch (err) {
            lastError = err;
          }
        }

        // Fallback: direct browser call with a client key (preview/dev).
        if (!started && API_KEY) {
          try {
            acc = await streamViaGemini(history, brief, onChunk);
            lastError = null;
          } catch (err) {
            lastError = err;
          }
        }

        if (lastError && !started) throw lastError;

        const reply = acc.trim();
        setMessages((prev) => {
          const next = prev.slice();
          if (started) {
            next[next.length - 1] = {
              role: "assistant",
              text: reply || BLANK_REPLY,
            };
          } else {
            next.push({ role: "assistant", text: BLANK_REPLY });
          }
          return next;
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : "";
        setError(
          /proxy_error_|no_gemini_key/.test(msg)
            ? "The keeper couldn't reach the bookshelf. Set GEMINI_API_KEY in the project's Keys tab, or add VITE_GEMINI_API_KEY for a client-side trial."
            : err instanceof Error
              ? err.message
              : "The keeper nodded off. Try again in a moment.",
        );
      } finally {
        setStreaming(false);
        setBusy(false);
      }
    },
    [messages, busy, brief],
  );

  return { messages, busy, streaming, error, send };
}
