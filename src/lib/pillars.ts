// 12 IRM Academy skill pillars — order matters (index = pillar slot)
import {
  MousePointerClick,
  BookOpen,
  Clapperboard,
  Activity,
  Type,
  Palette,
  Captions,
  Volume2,
  Layers,
  Sparkles,
  Bot,
  FolderCog,
  type LucideIcon,
} from "lucide-react";

export interface PillarDef {
  title: string;
  short: string;
  icon: LucideIcon;
  color: string; // base color used for the petal palette
}

// Match this list to seed_demo_content() pillar_titles ORDER exactly.
export const PILLARS: PillarDef[] = [
  { title: "Software Operation", short: "Software", icon: MousePointerClick, color: "oklch(0.55 0.21 268)" },
  { title: "Comprehension", short: "Brief", icon: BookOpen, color: "oklch(0.55 0.20 290)" },
  { title: "Storyboarding & Pre-Production Thinking", short: "Storyboard", icon: Clapperboard, color: "oklch(0.55 0.20 320)" },
  { title: "Pacing & Editorial Rhythm", short: "Pacing", icon: Activity, color: "oklch(0.58 0.21 350)" },
  { title: "Typography & Text Design", short: "Type", icon: Type, color: "oklch(0.62 0.20 25)" },
  { title: "Color & Visual Consistency", short: "Color", icon: Palette, color: "oklch(0.65 0.18 55)" },
  { title: "Caption & Text Accuracy", short: "Captions", icon: Captions, color: "oklch(0.68 0.17 90)" },
  { title: "Sound Design & Audio", short: "Sound", icon: Volume2, color: "oklch(0.62 0.18 145)" },
  { title: "Format-Specific Editing", short: "Formats", icon: Layers, color: "oklch(0.58 0.18 175)" },
  { title: "Motion Graphics & Animation", short: "Motion", icon: Sparkles, color: "oklch(0.55 0.18 205)" },
  { title: "AI Tools & Workflow", short: "AI", icon: Bot, color: "oklch(0.52 0.20 235)" },
  { title: "File & Export Management", short: "Export", icon: FolderCog, color: "oklch(0.50 0.21 258)" },
];

// Ring count = number of sections per course. Seed creates 3 sections per course.
export const PILLAR_RINGS = 3;

/**
 * Per-pillar mastery in [0..1]. Index aligned with PILLARS.
 * Each pillar score = average completion percent across the course's lessons,
 * averaged across the included users.
 */
export type PillarScores = number[]; // length 12

/**
 * Quantize a 0..1 score into ring-fill levels (0..PILLAR_RINGS).
 * 0 → 0 rings, 1 → 3 rings.
 */
export function scoreToRings(score: number, rings: number = PILLAR_RINGS): number {
  if (score <= 0) return 0;
  if (score >= 1) return rings;
  // Map evenly: 1/3 → 1 ring, 2/3 → 2 rings, full → 3 rings
  return Math.min(rings, Math.max(1, Math.round(score * rings)));
}
