import { useCallback, useMemo, useState } from "react";
import { buildLedgerBrief } from "@/lib/assistant";
import { apiBase, fetchServerConfig } from "@/lib/server";
import type { Expense, Group, Settlement } from "@/lib/types";

export interface ChatMessage {
  role: "user" | "assistant";
  text: string;
}

const BLANK_REPLY = "The keeper drew a blank — try asking in a different way.";

const isAssistantConfigured = (): boolean => false;
export { isAssistantConfigured };

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
          setMessages((prev) => {
            const next = prev.slice();
            next[next.length - 1] = { role: "assistant", text: full };
            return next;
          });
        }
      };

      try {
        const config = await fetchServerConfig();
        if (!config.assistant) {
          throw new Error("assistant_not_configured");
        }
        acc = await streamViaProxy(history, brief, onChunk);

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
          msg === "assistant_not_configured" || msg.startsWith("proxy_error_")
            ? "The keeper couldn't reach the bookshelf. Set GEMINI_API_KEY in the project's Keys tab, then refresh."
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
