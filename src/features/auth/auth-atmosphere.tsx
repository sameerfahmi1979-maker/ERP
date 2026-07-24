"use client";

import { useEffect, useRef } from "react";
import gsap from "gsap";

/**
 * Signature ambient backdrop for the auth route group.
 *
 * Depicts an abstracted Gulf trade-lane network — arcs connecting port
 * nodes — as a slow, looping, low-key animation. This is the "hero as
 * thesis" for a transport & construction ERP: the login screen sits on
 * top of the same network the business runs on, rather than a generic
 * gradient blob.
 *
 * Only rendered when no admin-uploaded login background image is set
 * (see (auth)/layout.tsx). Fully inert when the user prefers reduced
 * motion — the network still renders, just without the flowing dashes
 * or drift.
 */
export function AuthAtmosphere() {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    const prefersReducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;
    if (prefersReducedMotion || !svgRef.current) return;

    const ctx = gsap.context(() => {
      const lanes = gsap.utils.toArray<SVGPathElement>(".auth-atmo-lane");
      lanes.forEach((lane, i) => {
        const length = lane.getTotalLength();
        gsap.set(lane, { strokeDasharray: `${length * 0.14} ${length}` });
        gsap.to(lane, {
          strokeDashoffset: -length,
          duration: 14 + i * 4,
          ease: "none",
          repeat: -1,
        });
      });

      const nodes = gsap.utils.toArray<SVGCircleElement>(".auth-atmo-node");
      gsap.to(nodes, {
        opacity: 0.35,
        scale: 1.6,
        transformOrigin: "center",
        duration: 2.4,
        ease: "sine.inOut",
        stagger: { each: 0.5, from: "random" },
        repeat: -1,
        yoyo: true,
      });

      gsap.to(".auth-atmo-mesh", {
        backgroundPosition: "+=6% -=4%",
        duration: 24,
        ease: "sine.inOut",
        repeat: -1,
        yoyo: true,
      });
    }, svgRef);

    return () => ctx.revert();
  }, []);

  return (
    <div className="fixed inset-0 -z-10 overflow-hidden bg-[#070c14]" aria-hidden>
      <div
        className="auth-atmo-mesh absolute inset-0 opacity-90"
        style={{
          backgroundImage: `
            radial-gradient(60% 50% at 82% 12%, rgba(45,212,191,0.14) 0%, transparent 60%),
            radial-gradient(55% 45% at 12% 88%, rgba(245,165,36,0.12) 0%, transparent 60%),
            linear-gradient(180deg, #0b1220 0%, #070c14 55%, #05080f 100%)
          `,
          backgroundSize: "160% 160%, 160% 160%, 100% 100%",
        }}
      />
      <svg
        ref={svgRef}
        viewBox="0 0 1440 900"
        preserveAspectRatio="xMidYMid slice"
        className="absolute inset-0 h-full w-full opacity-70"
      >
        <defs>
          <linearGradient id="authLaneAmber" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#f5a524" stopOpacity="0" />
            <stop offset="50%" stopColor="#f5a524" stopOpacity="0.9" />
            <stop offset="100%" stopColor="#f5a524" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="authLaneTeal" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#2dd4bf" stopOpacity="0" />
            <stop offset="50%" stopColor="#2dd4bf" stopOpacity="0.85" />
            <stop offset="100%" stopColor="#2dd4bf" stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* Faint static network (always visible, even with reduced motion) */}
        <g stroke="#94a3b8" strokeOpacity="0.14" strokeWidth="1" fill="none">
          <path d="M120,620 Q420,420 760,540 T1320,300" />
          <path d="M180,180 Q520,260 640,520 T1180,760" />
          <path d="M60,340 Q380,300 700,180 T1380,220" />
        </g>

        {/* Animated flowing lanes */}
        <g fill="none" strokeWidth="2" strokeLinecap="round">
          <path
            className="auth-atmo-lane"
            d="M120,620 Q420,420 760,540 T1320,300"
            stroke="url(#authLaneAmber)"
          />
          <path
            className="auth-atmo-lane"
            d="M180,180 Q520,260 640,520 T1180,760"
            stroke="url(#authLaneTeal)"
          />
          <path
            className="auth-atmo-lane"
            d="M60,340 Q380,300 700,180 T1380,220"
            stroke="url(#authLaneAmber)"
          />
        </g>

        {/* Port nodes */}
        <g fill="#f5a524">
          <circle className="auth-atmo-node" cx="120" cy="620" r="3.5" />
          <circle className="auth-atmo-node" cx="760" cy="540" r="3" />
          <circle className="auth-atmo-node" cx="1320" cy="300" r="3.5" />
        </g>
        <g fill="#2dd4bf">
          <circle className="auth-atmo-node" cx="180" cy="180" r="3" />
          <circle className="auth-atmo-node" cx="640" cy="520" r="3.5" />
          <circle className="auth-atmo-node" cx="1180" cy="760" r="3" />
        </g>
      </svg>
    </div>
  );
}
