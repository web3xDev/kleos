"use client";

// A card the mascot hides behind. Each host has its own mascot: it peeks
// out once when the card enters the viewport and leans further on hover.
// It never follows the scroll or moves on its own.

import { useState, type ReactNode } from "react";
import { Mascot, MascotHand } from "@/components/mascot";
import { useInView } from "@/components/reveal";

export function MascotHost({
  side = "left",
  top = "26%",
  children,
  className = "",
}: {
  side?: "left" | "right" | "top";
  top?: string;
  children: ReactNode;
  className?: string;
}) {
  const [ref, inView] = useInView<HTMLDivElement>("0px 0px -12% 0px");
  const [hover, setHover] = useState(false);
  const left = side === "left";

  if (side === "top") {
    // Rises from behind the card's top edge, over its right half. The hand
    // grips the edge from above.
    const on = inView;
    const up = hover ? "translateY(-34px)" : "translateY(0)";
    const down = "translateY(86px)";
    return (
      <div ref={ref} className={`relative ${className}`} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
        <div className="absolute right-[22%] z-0 hidden md:block" style={{ top: -82 }} aria-hidden>
          <Mascot
            size={112}
            className="transition-transform duration-[360ms] ease-out"
            style={{ transform: on ? up : down, transitionDelay: hover ? "0ms" : "140ms" }}
          />
        </div>
        {/* two hands on the edge, one each side of the head */}
        <MascotHand
          size={24}
          className="absolute z-20 hidden transition-[opacity,transform] duration-[220ms] md:block"
          style={{
            right: "calc(22% + 92px)",
            top: -8,
            opacity: on ? 1 : 0,
            transform: `rotate(90deg) scaleY(-1) ${on && hover ? "translateX(-4px)" : ""}`,
          }}
        />
        <MascotHand
          size={24}
          className="absolute z-20 hidden transition-[opacity,transform] duration-[220ms] md:block"
          style={{
            right: "calc(22% - 4px)",
            top: -8,
            opacity: on ? 1 : 0,
            transform: `rotate(90deg) ${on && hover ? "translateX(-4px)" : ""}`,
          }}
        />
        <div className="relative z-10">{children}</div>
      </div>
    );
  }

  // The wrapper mirrors the sprite for the right side; inside it the motion
  // is always "peek from the left". In = 72px towards the card, fully behind.
  const out = "translateX(0) rotate(-10deg)";
  const outMore = "translateX(-22px) rotate(-16deg)";
  const inn = "translateX(72px) rotate(0deg)";
  const on = inView;

  return (
    <div ref={ref} className={`relative ${className}`} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
      <div className={`absolute z-0 ${left ? "-left-[66px]" : "-right-[66px] -scale-x-100"}`} style={{ top }} aria-hidden>
        <Mascot
          size={112}
          className="origin-bottom-right transition-transform duration-[360ms] ease-out"
          style={{ transform: on ? (hover ? outMore : out) : inn, transitionDelay: hover ? "0ms" : "140ms" }}
        />
      </div>
      <MascotHand
        size={24}
        className={`absolute z-20 transition-[opacity,transform] duration-[220ms] ${left ? "-left-[6px]" : "-right-[6px]"}`}
        style={{
          top: `calc(${top} + 100px)`,
          opacity: on ? 1 : 0,
          transform: left ? (on && hover ? "translateX(-4px)" : "translateX(0)") : on && hover ? "translateX(4px) scaleX(-1)" : "scaleX(-1)",
          transitionDelay: hover ? "0ms" : "140ms",
        }}
      />
      <div className="relative z-10">{children}</div>
    </div>
  );
}
