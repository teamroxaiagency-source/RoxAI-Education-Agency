import type { CSSProperties } from "react";
import type { School } from "@/types/database";

/**
 * Per-school theming. Each client school picks a brand color pair and a
 * font "voice" in the dashboard; every screen that renders on their
 * behalf — the staff Kanban and the parent-facing booking page alike —
 * reads these CSS custom properties instead of hardcoding RoxAI's own
 * colors, so the same components serve every school's brand without a
 * fork.
 */

const FONT_STACKS: Record<string, string> = {
  Inter: '"Inter", ui-sans-serif, system-ui, -apple-system, sans-serif',
  "Source Serif 4": '"Source Serif 4", ui-serif, Georgia, "Times New Roman", serif',
  "Fraunces": '"Fraunces", ui-serif, Georgia, serif',
  "Plus Jakarta Sans": '"Plus Jakarta Sans", ui-sans-serif, system-ui, sans-serif',
  "JetBrains Mono": '"JetBrains Mono", ui-monospace, "SF Mono", monospace',
};

const DEFAULT_FONT_STACK = FONT_STACKS.Inter;

export function schoolThemeStyle(school: Pick<School, "brand_primary_color" | "brand_secondary_color" | "brand_font_family">): CSSProperties {
  return {
    "--brand-primary": school.brand_primary_color,
    "--brand-secondary": school.brand_secondary_color,
    "--brand-font": FONT_STACKS[school.brand_font_family] ?? DEFAULT_FONT_STACK,
  } as CSSProperties;
}

export const AVAILABLE_BRAND_FONTS = Object.keys(FONT_STACKS);
