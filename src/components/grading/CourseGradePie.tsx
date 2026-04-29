import * as React from "react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";

export interface PieSlice {
  name: string;
  value: number;
  color: string;
}

interface Props {
  data: PieSlice[];
  centerLabel: string;
  centerSub?: string;
  height?: number;
}

/**
 * Donut chart with a label rendered in the center.
 * Used for letter-grade distribution and per-course average %.
 */
export function CourseGradePie({ data, centerLabel, centerSub, height = 220 }: Props) {
  const filtered = data.filter((d) => d.value > 0);
  const empty = filtered.length === 0;

  return (
    <div className="relative w-full" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={empty ? [{ name: "No data", value: 1, color: "hsl(var(--muted))" }] : filtered}
            dataKey="value"
            nameKey="name"
            innerRadius="60%"
            outerRadius="90%"
            paddingAngle={empty ? 0 : 2}
            stroke="hsl(var(--background))"
            strokeWidth={2}
          >
            {(empty ? [{ color: "hsl(var(--muted))" }] : filtered).map((slice, i) => (
              <Cell key={i} fill={slice.color} />
            ))}
          </Pie>
          {!empty && (
            <Tooltip
              contentStyle={{
                background: "hsl(var(--popover))",
                border: "1px solid hsl(var(--border))",
                borderRadius: 8,
                fontSize: 12,
              }}
              formatter={(v: number, n: string) => [v, n]}
            />
          )}
        </PieChart>
      </ResponsiveContainer>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
        <div className="text-2xl font-semibold tabular-nums">{centerLabel}</div>
        {centerSub && (
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{centerSub}</div>
        )}
      </div>
    </div>
  );
}

export const LETTER_COLORS: Record<string, string> = {
  "A+": "hsl(152 70% 50%)",
  A: "hsl(200 80% 55%)",
  B: "hsl(40 90% 55%)",
  C: "hsl(350 75% 55%)",
};

// Stable course color palette
const COURSE_PALETTE = [
  "hsl(200 80% 55%)",
  "hsl(280 65% 60%)",
  "hsl(152 70% 50%)",
  "hsl(40 90% 55%)",
  "hsl(350 75% 55%)",
  "hsl(180 65% 50%)",
  "hsl(25 85% 55%)",
  "hsl(260 70% 60%)",
  "hsl(120 55% 50%)",
  "hsl(310 65% 60%)",
  "hsl(220 75% 60%)",
  "hsl(60 80% 55%)",
];
export function courseColor(index: number): string {
  return COURSE_PALETTE[index % COURSE_PALETTE.length];
}
