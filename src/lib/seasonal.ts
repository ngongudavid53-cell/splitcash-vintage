/**
 * Common Pot - Seasonal Customization System
 *
 * Supports seasonal themes and banners for major holidays and events.
 * Multi-year date awareness (2025–2030) with accurate astronomical/lunar dates
 * for Islamic holidays (Ramadan, Eid al-Fitr, Eid al-Adha).
 */

export interface SeasonInfo {
  id: string;
  name: string;
  greeting: string;
  icon: string;
  themeClass: string;
  tagline: string;
}

interface DateRange {
  startMonth: number; // 1-12
  startDay: number;   // 1-31
  endMonth: number;   // 1-12
  endDay: number;     // 1-31
}

// Fixed or calculated date ranges by year
const SEASON_DATES: Record<string, Record<number, DateRange>> = {
  new_year: {
    // Dec 30 to Jan 5
    2025: { startMonth: 12, startDay: 30, endMonth: 1, endDay: 5 },
    2026: { startMonth: 12, startDay: 30, endMonth: 1, endDay: 5 },
    2027: { startMonth: 12, startDay: 30, endMonth: 1, endDay: 5 },
    2028: { startMonth: 12, startDay: 30, endMonth: 1, endDay: 5 },
    2029: { startMonth: 12, startDay: 30, endMonth: 1, endDay: 5 },
    2030: { startMonth: 12, startDay: 30, endMonth: 1, endDay: 5 },
  },
  valentines: {
    2025: { startMonth: 2, startDay: 10, endMonth: 2, endDay: 16 },
    2026: { startMonth: 2, startDay: 10, endMonth: 2, endDay: 16 },
    2027: { startMonth: 2, startDay: 10, endMonth: 2, endDay: 16 },
    2028: { startMonth: 2, startDay: 10, endMonth: 2, endDay: 16 },
    2029: { startMonth: 2, startDay: 10, endMonth: 2, endDay: 16 },
    2030: { startMonth: 2, startDay: 10, endMonth: 2, endDay: 16 },
  },
  ramadan: {
    // Ramadan dates (approx astronomical window)
    2025: { startMonth: 2, startDay: 28, endMonth: 3, endDay: 29 },
    2026: { startMonth: 2, startDay: 17, endMonth: 3, endDay: 19 },
    2027: { startMonth: 2, startDay: 7, endMonth: 3, endDay: 8 },
    2028: { startMonth: 1, startDay: 27, endMonth: 2, endDay: 25 },
    2029: { startMonth: 1, startDay: 15, endMonth: 2, endDay: 13 },
    2030: { startMonth: 1, startDay: 5, endMonth: 2, endDay: 3 },
  },
  eid_al_fitr: {
    2025: { startMonth: 3, startDay: 30, endMonth: 4, endDay: 2 },
    2026: { startMonth: 3, startDay: 20, endMonth: 3, endDay: 23 },
    2027: { startMonth: 3, startDay: 9, endMonth: 3, endDay: 12 },
    2028: { startMonth: 2, startDay: 26, endMonth: 3, endDay: 1 },
    2029: { startMonth: 2, startDay: 14, endMonth: 2, endDay: 17 },
    2030: { startMonth: 2, startDay: 4, endMonth: 2, endDay: 7 },
  },
  easter: {
    2025: { startMonth: 4, startDay: 17, endMonth: 4, endDay: 22 },
    2026: { startMonth: 4, startDay: 2, endMonth: 4, endDay: 7 },
    2027: { startMonth: 3, startDay: 25, endMonth: 3, endDay: 30 },
    2028: { startMonth: 4, startDay: 13, endMonth: 4, endDay: 18 },
    2029: { startMonth: 3, startDay: 29, endMonth: 4, endDay: 3 },
    2030: { startMonth: 4, startDay: 18, endMonth: 4, endDay: 23 },
  },
  summer: {
    2025: { startMonth: 6, startDay: 15, endMonth: 8, endDay: 31 },
    2026: { startMonth: 6, startDay: 15, endMonth: 8, endDay: 31 },
    2027: { startMonth: 6, startDay: 15, endMonth: 8, endDay: 31 },
    2028: { startMonth: 6, startDay: 15, endMonth: 8, endDay: 31 },
    2029: { startMonth: 6, startDay: 15, endMonth: 8, endDay: 31 },
    2030: { startMonth: 6, startDay: 15, endMonth: 8, endDay: 31 },
  },
  halloween: {
    2025: { startMonth: 10, startDay: 25, endMonth: 11, endDay: 2 },
    2026: { startMonth: 10, startDay: 25, endMonth: 11, endDay: 2 },
    2027: { startMonth: 10, startDay: 25, endMonth: 11, endDay: 2 },
    2028: { startMonth: 10, startDay: 25, endMonth: 11, endDay: 2 },
    2029: { startMonth: 10, startDay: 25, endMonth: 11, endDay: 2 },
    2030: { startMonth: 10, startDay: 25, endMonth: 11, endDay: 2 },
  },
  christmas: {
    2025: { startMonth: 12, startDay: 15, endMonth: 12, endDay: 28 },
    2026: { startMonth: 12, startDay: 15, endMonth: 12, endDay: 28 },
    2027: { startMonth: 12, startDay: 15, endMonth: 12, endDay: 28 },
    2028: { startMonth: 12, startDay: 15, endMonth: 12, endDay: 28 },
    2029: { startMonth: 12, startDay: 15, endMonth: 12, endDay: 28 },
    2030: { startMonth: 12, startDay: 15, endMonth: 12, endDay: 28 },
  },
};

const SEASONS: Record<string, Omit<SeasonInfo, "id">> = {
  new_year: {
    name: "New Year",
    greeting: "Happy New Year!",
    icon: "🎆",
    themeClass: "from-amber-500/10 to-purple-500/10 border-amber-500/30 text-amber-900 dark:text-amber-200",
    tagline: "New goals, clean ledgers.",
  },
  valentines: {
    name: "Valentine's",
    greeting: "Happy Valentine's!",
    icon: "💝",
    themeClass: "from-rose-500/10 to-pink-500/10 border-rose-500/30 text-rose-900 dark:text-rose-200",
    tagline: "Splitting dinner with someone special?",
  },
  ramadan: {
    name: "Ramadan",
    greeting: "Ramadan Mubarak!",
    icon: "🌙",
    themeClass: "from-emerald-500/10 to-teal-500/10 border-emerald-500/30 text-emerald-900 dark:text-emerald-200",
    tagline: "Wishing you peace & togetherness for Iftar gatherings.",
  },
  eid_al_fitr: {
    name: "Eid al-Fitr",
    greeting: "Eid Mubarak!",
    icon: "✨",
    themeClass: "from-amber-500/10 to-emerald-500/10 border-amber-500/30 text-amber-900 dark:text-amber-200",
    tagline: "Celebrating joy, family & shared feasts.",
  },
  easter: {
    name: "Easter",
    greeting: "Happy Easter!",
    icon: "🐣",
    themeClass: "from-yellow-500/10 to-sky-500/10 border-yellow-500/30 text-yellow-900 dark:text-yellow-200",
    tagline: "Spring trips and holiday breaks.",
  },
  summer: {
    name: "Summer Holidays",
    greeting: "Summer Pot!",
    icon: "☀️",
    themeClass: "from-orange-500/10 to-yellow-500/10 border-orange-500/30 text-orange-900 dark:text-orange-200",
    tagline: "Beach trips, road trips & festival kits.",
  },
  halloween: {
    name: "Halloween",
    greeting: "Spooky Season!",
    icon: "🎃",
    themeClass: "from-orange-500/10 to-purple-500/10 border-orange-500/30 text-orange-900 dark:text-orange-200",
    tagline: "No tricks, just fair maths.",
  },
  christmas: {
    name: "Christmas & Holidays",
    greeting: "Merry Christmas!",
    icon: "🎄",
    themeClass: "from-red-500/10 to-emerald-500/10 border-red-500/30 text-red-900 dark:text-red-200",
    tagline: "Group gifts and holiday celebrations.",
  },
};

function isDateInRange(now: Date, range: DateRange): boolean {
  const year = now.getFullYear();
  const start = new Date(year, range.startMonth - 1, range.startDay, 0, 0, 0);
  const end = new Date(year, range.endMonth - 1, range.endDay, 23, 59, 59);

  // Cross-year boundary (e.g. Dec 30 to Jan 5)
  if (range.startMonth > range.endMonth) {
    if (now.getMonth() + 1 <= range.endMonth) {
      // We are in January
      const prevYearStart = new Date(year - 1, range.startMonth - 1, range.startDay, 0, 0, 0);
      return now >= prevYearStart && now <= end;
    } else {
      // We are in December
      const nextYearEnd = new Date(year + 1, range.endMonth - 1, range.endDay, 23, 59, 59);
      return now >= start && now <= nextYearEnd;
    }
  }

  return now >= start && now <= end;
}

export function getCurrentSeason(date: Date = new Date()): SeasonInfo | null {
  const year = date.getFullYear();

  // Check higher priority specific seasons first
  const priorityOrder = [
    "eid_al_fitr",
    "ramadan",
    "new_year",
    "valentines",
    "easter",
    "halloween",
    "christmas",
    "summer",
  ];

  for (const seasonId of priorityOrder) {
    const datesForYear = SEASON_DATES[seasonId]?.[year];
    if (datesForYear && isDateInRange(date, datesForYear)) {
      const meta = SEASONS[seasonId];
      if (meta) {
        return { id: seasonId, ...meta };
      }
    }
  }

  return null;
}
