import * as React from "react";
import { CourseGradePie, LETTER_COLORS, type PieSlice } from "./CourseGradePie";
import type { GradeAggregate } from "@/lib/grade-utils";

interface Props {
  agg: GradeAggregate;
  size?: number;
  showLegend?: boolean;
  showStats?: boolean;
  centerSubLabel?: string;
}

/**
 * Self-contained grade visualization: donut showing A+/A/B/C
 * distribution with the average % in the center, and an optional
 * legend + stat row beneath.
 *
 * Used on every dashboard so member / franchise / org performance
 * is presented in exactly the same visual language.
 */
export function GradePieCard({
  agg,
  size = 200,
  showLegend = true,
  showStats = true,
  centerSubLabel = "Avg",
}: Props) {
  const slices: PieSlice[] = [
    { name: "A+", value: agg.aPlus, color: LETTER_COLORS["A+"] },
    { name: "A", value: agg.a, color: LETTER_COLORS["A"] },
    { name: "B", value: agg.b, color: LETTER_COLORS["B"] },
    { name: "C (Redo)", value: agg.c, color: LETTER_COLORS["C"] },
  ];

  const centerLabel = agg.total > 0 ? `${agg.averagePercent}%` : "—";

  return (
    <div className="flex flex-col items-center gap-3">
      <div style={{ width: size }}>
        <CourseGradePie
          data={slices}
          centerLabel={centerLabel}
          centerSub={centerSubLabel}
          height={size}
        />
      </div>

      {showLegend && (
        <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1.5 text-[11px]">
          <LegendChip color={LETTER_COLORS["A+"]} label="A+" count={agg.aPlus} />
          <LegendChip color={LETTER_COLORS["A"]} label="A" count={agg.a} />
          <LegendChip color={LETTER_COLORS["B"]} label="B" count={agg.b} />
          <LegendChip color={LETTER_COLORS["C"]} label="Redo" count={agg.c} />
        </div>
      )}

      {showStats && (
        <div className="flex items-center justify-center gap-4 text-[11px] text-muted-foreground">
          <span>
            <span className="font-semibold text-foreground tabular-nums">
              {agg.total}
            </span>{" "}
            graded
          </span>
          <span className="text-muted-foreground/50">·</span>
          <span>
            <span className="font-semibold text-foreground tabular-nums">
              {agg.passRate}%
            </span>{" "}
            pass
          </span>
          {agg.pending > 0 && (
            <>
              <span className="text-muted-foreground/50">·</span>
              <span>
                <span className="font-semibold text-amber-300 tabular-nums">
                  {agg.pending}
                </span>{" "}
                pending
              </span>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function LegendChip({
  color,
  label,
  count,
}: {
  color: string;
  label: string;
  count: number;
}) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className="h-2 w-2 rounded-sm"
        style={{ background: color }}
        aria-hidden
      />
      <span className="text-muted-foreground">{label}</span>
      <span className="tabular-nums font-medium text-foreground">{count}</span>
    </span>
  );
}
