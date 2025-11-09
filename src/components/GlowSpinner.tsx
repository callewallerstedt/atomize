"use client";

import type { CSSProperties } from "react";

type GlowSpinnerProps = {
  size?: number; // px
  ariaLabel?: string;
  className?: string;
  idSuffix?: string; // ensure unique ids if multiple on page
  padding?: number; // extra space around spinner to preserve glow
  inline?: boolean; // allow inline-flex layout for compact placements
  style?: CSSProperties;
};

export default function GlowSpinner({
  size = 160,
  ariaLabel = "Loading",
  className = "",
  idSuffix = "global",
  padding = 40,
  inline = false,
  style,
}: GlowSpinnerProps) {
  const w = size;
  const h = size;
  const wrapperPad = Math.max(0, padding);
  const wrapperWidth = w + wrapperPad;
  const wrapperHeight = h + wrapperPad;
  const idGrad = `grad-${idSuffix}`;
  const idMask = `outer-only-${idSuffix}`;
  const idBlurSoft = `blur-soft-${idSuffix}`;
  const idBlurWide = `blur-wide-${idSuffix}`;
  return (
    <div
      className={className}
      style={{
        width: wrapperWidth,
        height: wrapperHeight,
        display: inline ? "inline-flex" : "flex",
        alignItems: "center",
        justifyContent: "center",
        overflow: "visible",
        position: "relative",
        ...style,
      }}
    >
      <svg 
        viewBox="0 0 100 100" 
        role="img" 
        aria-label={ariaLabel} 
        width={w} 
        height={h} 
        overflow="visible" 
        style={{ 
          overflow: "visible",
          position: "relative",
          zIndex: 0,
        }}
      >
        <defs>
          <linearGradient id={idGrad} x1="0%" y1="0%" x2="100%" y2="0%" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#00E5FF" />
            <stop offset="100%" stopColor="#FF2D96" />
            <animateTransform attributeName="gradientTransform" type="rotate" from="0 50 50" to="360 50 50" dur="6s" repeatCount="indefinite" />
          </linearGradient>
          <mask id={idMask} maskUnits="userSpaceOnUse">
            <rect x="-1000" y="-1000" width="3000" height="3000" fill="white" />
            {/* Cut out the center so background shows through (no white center) */}
            <circle cx="50" cy="50" r="38" fill="black" />
          </mask>
          <filter id={idBlurSoft} filterUnits="userSpaceOnUse" x="-600" y="-600" width="1200" height="1200">
            <feGaussianBlur stdDeviation="4" edgeMode="duplicate" />
          </filter>
          <filter id={idBlurWide} filterUnits="userSpaceOnUse" x="-600" y="-600" width="1200" height="1200">
            <feGaussianBlur stdDeviation="8" edgeMode="duplicate" />
          </filter>
        </defs>
        <g style={{ transformOrigin: "50% 50%", animation: "spin 6s linear infinite" }}>
          <path d="M50,12 A38,38 0 1,1 49.99,12" fill="none" stroke={`url(#${idGrad})`} strokeWidth={12} strokeLinecap="round" filter={`url(#${idBlurWide})`} mask={`url(#${idMask})`} opacity="0.35" />
          <path d="M50,12 A38,38 0 1,1 49.99,12" fill="none" stroke={`url(#${idGrad})`} strokeWidth={10} strokeLinecap="round" filter={`url(#${idBlurSoft})`} mask={`url(#${idMask})`} opacity="0.55" />
          <path d="M50,12 A38,38 0 1,1 49.99,12" fill="none" stroke={`url(#${idGrad})`} strokeWidth={7} strokeLinecap="round" />
        </g>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </svg>
    </div>
  );
}
