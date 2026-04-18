import * as React from "react";
import { cn } from "@/lib/utils";

interface AnimatedCapProps {
  size?: number;
  className?: string;
}

/**
 * A graduation cap that continuously fills with liquid,
 * cycling through brand colors (accent blue & primary near-black tones).
 * The liquid has a wave surface and slowly rises, drains, and refills.
 */
export function AnimatedCap({ size = 28, className }: AnimatedCapProps) {
  const id = React.useId().replace(/:/g, "");
  const clipId = `cap-clip-${id}`;
  const waveId = `cap-wave-${id}`;
  const gradId = `cap-grad-${id}`;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      className={cn("block", className)}
      aria-hidden="true"
    >
      <defs>
        {/* Liquid color cycles through brand tones */}
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--accent)">
            <animate
              attributeName="stop-color"
              values="oklch(0.45 0.27 268); oklch(0.55 0.27 268); oklch(0.35 0.22 268); oklch(0.45 0.27 268)"
              dur="6s"
              repeatCount="indefinite"
            />
          </stop>
          <stop offset="100%" stopColor="var(--primary)">
            <animate
              attributeName="stop-color"
              values="oklch(0.18 0.02 260); oklch(0.28 0.05 268); oklch(0.18 0.02 260)"
              dur="6s"
              repeatCount="indefinite"
            />
          </stop>
        </linearGradient>

        {/* Clip path = the inside cavity of the cap (mortarboard base + below) */}
        <clipPath id={clipId}>
          {/* Cap board (top) */}
          <path d="M2 22 L32 10 L62 22 L32 34 Z" />
          {/* Cap base under the board where liquid pools */}
          <path d="M14 26 L14 40 Q14 50 32 50 Q50 50 50 40 L50 26 Z" />
        </clipPath>

        {/* Wave shape — wider than viewport so we can translate it */}
        <path
          id={waveId}
          d="M0 10 Q 8 4 16 10 T 32 10 T 48 10 T 64 10 T 80 10 T 96 10 T 112 10 T 128 10 V 60 H 0 Z"
        />
      </defs>

      {/* Cap outline (always visible — the "glass") */}
      <g
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinejoin="round"
        strokeLinecap="round"
      >
        <path d="M2 22 L32 10 L62 22 L32 34 Z" />
        <path d="M50 26 L50 40 Q50 50 32 50 Q14 50 14 40 L14 26" />
        {/* Tassel */}
        <path d="M58 22 L58 38" />
        <circle cx="58" cy="40" r="2" fill="currentColor" />
      </g>

      {/* Liquid — clipped to the cap interior */}
      <g clipPath={`url(#${clipId})`}>
        {/* Background fill so the cap looks "filled" with the gradient */}
        <rect x="0" y="0" width="64" height="64" fill={`url(#${gradId})`} opacity="0.92">
          {/* Liquid level rises and falls */}
          <animate
            attributeName="y"
            values="50; -2; -2; 50; 50"
            keyTimes="0; 0.4; 0.6; 0.95; 1"
            dur="5s"
            repeatCount="indefinite"
          />
        </rect>

        {/* Wave surface — sits on top of the rising liquid */}
        <g>
          <use href={`#${waveId}`} fill={`url(#${gradId})`} opacity="0.95">
            <animateTransform
              attributeName="transform"
              type="translate"
              values="0 50; 0 -2; 0 -2; 0 50; 0 50"
              keyTimes="0; 0.4; 0.6; 0.95; 1"
              dur="5s"
              repeatCount="indefinite"
              additive="sum"
            />
            <animateTransform
              attributeName="transform"
              type="translate"
              values="0 0; -64 0"
              dur="2.5s"
              repeatCount="indefinite"
              additive="sum"
            />
          </use>

          {/* Second wave layer for depth */}
          <use href={`#${waveId}`} fill={`url(#${gradId})`} opacity="0.6">
            <animateTransform
              attributeName="transform"
              type="translate"
              values="0 52; 0 0; 0 0; 0 52; 0 52"
              keyTimes="0; 0.4; 0.6; 0.95; 1"
              dur="5s"
              repeatCount="indefinite"
              additive="sum"
            />
            <animateTransform
              attributeName="transform"
              type="translate"
              values="-64 0; 0 0"
              dur="3.2s"
              repeatCount="indefinite"
              additive="sum"
            />
          </use>
        </g>
      </g>
    </svg>
  );
}
