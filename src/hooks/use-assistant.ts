import { useCallback, useMemo, useState } from "react";
import { buildLedgerBrief } from "@/lib/assistant";
import { apiBase, fetchServerConfig } from "@/lib/server";
import type { Expense, Group, Settlement } from "@/lib/types";

export interface ChatMessage {
  role: "user" | "assistant";
  text: string;
}


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

/** The assistant is available only through the server proxy, which keeps the
 * provider credential out of the browser bundle. */
export function isAssistantConfigured(): boolean {
  return false;
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
            ? "The keeper couldn't reach the bookshelf. Configure GEMINI_API_KEY on the server, then try again."
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
