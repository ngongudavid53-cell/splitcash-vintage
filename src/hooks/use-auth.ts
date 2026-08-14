// Resolution bridge: bundlers prefer `.ts` over `.tsx` for the same basename,
// and the running Vite dev server's module graph may still hold this URL from
// before. Re-export the real implementation in `use-auth.tsx` so a request
// for `@/hooks/use-auth` always serves valid JavaScript — otherwise the dev
// server falls back to index.html and the browser throws
// "Unexpected token '<'". Importers may switch to `@/hooks/use-auth.tsx`
// explicitly, and then this bridge can be removed.
export * from "./use-auth.tsx";
