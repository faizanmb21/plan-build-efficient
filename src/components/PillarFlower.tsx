import * as React from "react";
import { PILLARS, PILLAR_RINGS, scoreToRings, type PillarScores } from "@/lib/pillars";
import { cn } from "@/lib/utils";

interface PillarFlowerProps {
  scores: PillarScores; // length 12, each in [0..1]
  size?: number;
  showLabels?: boolean;
  showLegend?: boolean;
  innerRadius?: number; // px
  outerRadius?: number; // px
  className?: string;
  onPillarClick?: (pillarIndex: number) => void;
}

/**
 * 12-pillar radial mastery chart.
 * - 12 wedges (petals), each split into PILLAR_RINGS concentric levels.
 * - Each filled ring = ~33% of that pillar mastered. Outer rings are darker.
 */
export function PillarFlower({
  scores,
  size = 360,
  showLabels = true,
  showLegend = false,
  innerRadius,
  outerRadius,
  className,
  onPillarClick,
}: PillarFlowerProps) {
  const cx = size / 2;
  const cy = size / 2;
  const padForLabels = showLabels ? 36 : 8;
  const rOuter = outerRadius ?? size / 2 - padForLabels;
  const rInner = innerRadius ?? Math.max(28, rOuter * 0.22);
  const ringWidth = (rOuter - rInner) / PILLAR_RINGS;
  const wedgeAngle = 360 / PILLARS.length;
  // small visual gap between wedges
  const gapDeg = 1.2;
  const [hovered, setHovered] = React.useState<number | null>(null);

  return (
    <div className={cn("relative inline-block", className)}>
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="block"
        aria-label="12-pillar mastery chart"
      >
        {/* Center subtle disc */}
        <circle cx={cx} cy={cy} r={rInner - 2} fill="var(--muted)" />
        <circle
          cx={cx}
          cy={cy}
          r={rInner - 2}
          fill="none"
          stroke="var(--border)"
          strokeWidth={1}
        />

        {PILLARS.map((p, i) => {
          const startAngle = -90 + i * wedgeAngle + gapDeg / 2;
          const endAngle = startAngle + wedgeAngle - gapDeg;
          const score = Math.max(0, Math.min(1, scores[i] ?? 0));
          const filled = scoreToRings(score);
          const isHover = hovered === i;
          return (
            <g
              key={p.title}
              onMouseEnter={() => setHovered(i)}
              onMouseLeave={() => setHovered((h) => (h === i ? null : h))}
              onClick={() => onPillarClick?.(i)}
              style={{ cursor: onPillarClick ? "pointer" : "default" }}
            >
              {Array.from({ length: PILLAR_RINGS }).map((_, ring) => {
                const r1 = rInner + ring * ringWidth;
                const r2 = r1 + ringWidth - 1.2; // small gap between rings
                const isFilled = ring < filled;
                // Outer rings = darker. opacity steps for the filled state.
                const fillOpacity = isFilled ? 0.45 + ring * 0.25 : 1;
                const fill = isFilled ? p.color : "var(--muted)";
                return (
                  <path
                    key={ring}
                    d={annularSector(cx, cy, r1, r2, startAngle, endAngle)}
                    fill={fill}
                    fillOpacity={isFilled ? fillOpacity : 0.45}
                    stroke="var(--background)"
                    strokeWidth={1}
                    style={{
                      transition: "fill-opacity 0.2s ease, transform 0.2s ease",
                      transformOrigin: `${cx}px ${cy}px`,
                    }}
                  />
                );
              })}

              {/* Pillar label outside the petal */}
              {showLabels && (
                <PillarLabel
                  cx={cx}
                  cy={cy}
                  radius={rOuter + 14}
                  midAngle={(startAngle + endAngle) / 2}
                  label={p.short}
                  active={isHover}
                />
              )}
            </g>
          );
        })}

        {/* Center text — overall % */}
        <text
          x={cx}
          y={cy - 4}
          textAnchor="middle"
          className="font-display"
          style={{
            fontSize: Math.round(size * 0.085),
            fill: "var(--foreground)",
            fontWeight: 700,
            letterSpacing: "-0.04em",
          }}
        >
          {Math.round(avg(scores) * 100)}%
        </text>
        <text
          x={cx}
          y={cy + Math.round(size * 0.05)}
          textAnchor="middle"
          style={{
            fontSize: Math.round(size * 0.032),
            fill: "var(--muted-foreground)",
            letterSpacing: "0.08em",
            textTransform: "uppercase",
          }}
        >
          Mastery
        </text>
      </svg>

      {hovered !== null && (
        <div
          className="pointer-events-none absolute left-1/2 top-2 z-10 -translate-x-1/2 rounded-md border bg-background/95 px-2.5 py-1 text-xs shadow-md"
          style={{ whiteSpace: "nowrap" }}
        >
          <span className="font-medium">{PILLARS[hovered].title}</span>
          <span className="ml-2 text-muted-foreground">
            {Math.round((scores[hovered] ?? 0) * 100)}%
          </span>
        </div>
      )}

      {showLegend && (
        <div className="mt-3 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
          <LegendDot opacity={0.45 + 0 * 0.25} label="Foundations" />
          <LegendDot opacity={0.45 + 1 * 0.25} label="Practice" />
          <LegendDot opacity={0.45 + 2 * 0.25} label="Mastery" />
        </div>
      )}
    </div>
  );
}

function LegendDot({ opacity, label }: { opacity: number; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span
        className="inline-block h-2.5 w-2.5 rounded-sm"
        style={{ backgroundColor: "var(--accent)", opacity }}
      />
      {label}
    </span>
  );
}

function PillarLabel({
  cx,
  cy,
  radius,
  midAngle,
  label,
  active,
}: {
  cx: number;
  cy: number;
  radius: number;
  midAngle: number;
  label: string;
  active: boolean;
}) {
  const rad = (midAngle * Math.PI) / 180;
  const x = cx + radius * Math.cos(rad);
  const y = cy + radius * Math.sin(rad);
  // anchor based on side
  const anchor: "start" | "middle" | "end" =
    Math.cos(rad) > 0.2 ? "start" : Math.cos(rad) < -0.2 ? "end" : "middle";
  return (
    <text
      x={x}
      y={y}
      textAnchor={anchor}
      dominantBaseline="middle"
      style={{
        fontSize: 10.5,
        fill: active ? "var(--foreground)" : "var(--muted-foreground)",
        fontWeight: active ? 600 : 500,
        letterSpacing: "0.02em",
        transition: "fill 0.2s ease, font-weight 0.2s ease",
      }}
    >
      {label}
    </text>
  );
}

function avg(arr: number[]): number {
  if (arr.length === 0) return 0;
  return arr.reduce((s, n) => s + n, 0) / arr.length;
}

/**
 * Build an SVG path for an annular sector (a "ring slice").
 * angles in degrees, 0° = +x axis, +90° = +y (down). We adjust externally.
 */
function annularSector(
  cx: number,
  cy: number,
  rInner: number,
  rOuter: number,
  startDeg: number,
  endDeg: number,
): string {
  const start = (startDeg * Math.PI) / 180;
  const end = (endDeg * Math.PI) / 180;
  const largeArc = endDeg - startDeg > 180 ? 1 : 0;

  const x1 = cx + rOuter * Math.cos(start);
  const y1 = cy + rOuter * Math.sin(start);
  const x2 = cx + rOuter * Math.cos(end);
  const y2 = cy + rOuter * Math.sin(end);
  const x3 = cx + rInner * Math.cos(end);
  const y3 = cy + rInner * Math.sin(end);
  const x4 = cx + rInner * Math.cos(start);
  const y4 = cy + rInner * Math.sin(start);

  return [
    `M ${x1} ${y1}`,
    `A ${rOuter} ${rOuter} 0 ${largeArc} 1 ${x2} ${y2}`,
    `L ${x3} ${y3}`,
    `A ${rInner} ${rInner} 0 ${largeArc} 0 ${x4} ${y4}`,
    "Z",
  ].join(" ");
}
