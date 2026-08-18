import { getCurrentSeason } from "@/lib/seasonal";

export function SeasonalBanner() {
  const season = getCurrentSeason();
  if (!season) return null;

  return (
    <div
      className={`mb-4 flex items-center justify-between rounded-sm border bg-gradient-to-r p-3 text-xs shadow-xs transition-all ${season.themeClass}`}
    >
      <div className="flex items-center gap-2">
        <span className="text-base" role="img" aria-label={season.name}>
          {season.icon}
        </span>
        <div>
          <span className="font-bold">{season.greeting}</span>{" "}
          <span className="opacity-90">{season.tagline}</span>
        </div>
      </div>
    </div>
  );
}
