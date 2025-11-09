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
  padding = -80,
  inline = false,
  style,
}: GlowSpinnerProps) {
  const wrapperPad = padding; // Allow negative padding
  const wrapperWidth = size * 2 + wrapperPad;
  const wrapperHeight = size * 2 + wrapperPad;
  
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
      <div style={{ transform: "scale(1.5)", transformOrigin: "center" }}>
        <img
          src="/spinner.png"
          alt=""
          width={size * 2}
          height={size * 2}
          style={{
            width: size * 2,
            height: size * 2,
            objectFit: "contain",
            transformOrigin: "center",
          }}
          className="animate-spin"
          loading="eager"
          aria-label={ariaLabel}
        />
      </div>
    </div>
  );
}
