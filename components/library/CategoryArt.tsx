import type { Motif } from "@/lib/cns/library-visuals";

/**
 * Subject-specific cover artwork.
 *
 * One drawing per motif — an ECG trace for cardiac sections, filled tubes for
 * lab work, a petri dish for microbiology. A single generic glyph reused
 * across 579 categories reads as a placeholder; a drawing that matches the
 * subject reads as a page someone designed.
 *
 * Rules every motif follows:
 *   - `currentColor` only, so the caller sets opacity and the art always sits
 *     correctly on its own mesh.
 *   - One 160x100 viewBox, so they are interchangeable and can be swapped
 *     without touching layout.
 *   - Strokes, not fills, wherever possible — a line drawing survives being
 *     scaled down to a 96px card far better than a filled illustration.
 *   - No animation inside the SVG. Movement comes from the parent's transform
 *     on hover, which is one compositor operation for the whole card rather
 *     than however many the artwork happens to contain.
 */

const S = { fill: "none", stroke: "currentColor", strokeLinecap: "round", strokeLinejoin: "round" } as const;

function Art({ motif }: { motif: Motif }) {
  switch (motif) {
    case "ecg":
      return (
        <>
          <path {...S} strokeWidth="2.5" d="M2 60h30l8-26 10 52 9-38 8 20h14l6-12 7 24 9-30 8 10h37" />
          <path {...S} strokeWidth="1" opacity="0.5" d="M2 80h156M2 40h156M2 20h156" />
        </>
      );

    case "blood":
      return (
        <>
          <path {...S} strokeWidth="2.5" d="M52 22c0 0-18 20-18 31a18 18 0 0 0 36 0c0-11-18-31-18-31Z" />
          <path {...S} strokeWidth="2" d="M104 40c0 0-13 15-13 23a13 13 0 0 0 26 0c0-8-13-23-13-23Z" />
          <circle {...S} strokeWidth="1.8" cx="132" cy="34" r="9" />
          <circle {...S} strokeWidth="1.8" cx="24" cy="72" r="11" />
          <circle {...S} strokeWidth="1.5" cx="82" cy="82" r="7" />
        </>
      );

    case "lab":
      return (
        <>
          {[36, 68, 100].map((x, i) => (
            <g key={x}>
              <path {...S} strokeWidth="2.2" d={`M${x - 9} 16h18M${x - 7} 16v56a7 7 0 0 0 14 0V16`} />
              <path {...S} strokeWidth="2" opacity="0.85" d={`M${x - 7} ${44 + i * 9}h14`} />
            </g>
          ))}
          <path {...S} strokeWidth="2" d="M126 30h22l-11 18 11 26h-22l-11-26 11-18Z" />
        </>
      );

    case "micro":
      return (
        <>
          <circle {...S} strokeWidth="2.5" cx="62" cy="50" r="38" />
          <circle {...S} strokeWidth="1.5" cx="62" cy="50" r="31" opacity="0.6" />
          <circle {...S} strokeWidth="2" cx="48" cy="38" r="7" />
          <circle {...S} strokeWidth="2" cx="74" cy="44" r="5" />
          <circle {...S} strokeWidth="2" cx="56" cy="66" r="6" />
          <circle {...S} strokeWidth="2" cx="80" cy="66" r="4" />
          <path {...S} strokeWidth="2" d="M118 26c10 8 10 22 0 30s-10 22 0 30" />
          <path {...S} strokeWidth="2" opacity="0.6" d="M140 30c9 7 9 20 0 27s-9 20 0 27" />
        </>
      );

    case "imaging":
      return (
        <>
          <circle {...S} strokeWidth="2.5" cx="70" cy="50" r="34" />
          <circle {...S} strokeWidth="1.6" cx="70" cy="50" r="23" opacity="0.7" />
          <circle {...S} strokeWidth="1.6" cx="70" cy="50" r="12" opacity="0.5" />
          <path {...S} strokeWidth="2" d="M70 4v18M70 78v18M24 50h18M98 50h18" />
          <path {...S} strokeWidth="2" d="M120 22h22v14M120 78h22V64" opacity="0.8" />
        </>
      );

    case "pill":
      return (
        <>
          <g transform="rotate(-35 46 44)">
            <rect {...S} strokeWidth="2.5" x="18" y="30" width="56" height="28" rx="14" />
            <path {...S} strokeWidth="2.5" d="M46 30v28" />
          </g>
          <circle {...S} strokeWidth="2.5" cx="112" cy="40" r="18" />
          <path {...S} strokeWidth="2" d="M99 27 125 53" />
          <g transform="rotate(20 78 82)">
            <rect {...S} strokeWidth="2" x="58" y="72" width="40" height="20" rx="10" />
            <path {...S} strokeWidth="2" d="M78 72v20" />
          </g>
        </>
      );

    case "syringe":
      return (
        <>
          <g transform="rotate(-28 80 50)">
            <path {...S} strokeWidth="2.5" d="M34 42h58v16H34z" />
            <path {...S} strokeWidth="2.5" d="M92 46h14v8H92zM106 50h26" />
            <path {...S} strokeWidth="2.5" d="M34 38v24M22 50h12M22 44v12" />
            <path {...S} strokeWidth="1.6" opacity="0.7" d="M50 42v16M62 42v16M74 42v16" />
          </g>
          <path {...S} strokeWidth="2" d="M138 68c0 0-7 8-7 12a7 7 0 0 0 14 0c0-4-7-12-7-12Z" />
        </>
      );

    case "calc":
      return (
        <>
          <rect {...S} strokeWidth="2.5" x="24" y="10" width="60" height="80" rx="8" />
          <rect {...S} strokeWidth="2" x="34" y="20" width="40" height="16" rx="3" />
          {[0, 1, 2].map((r) =>
            [0, 1, 2].map((c) => (
              <circle key={`${r}-${c}`} {...S} strokeWidth="1.8" cx={40 + c * 14} cy={50 + r * 14} r="3.5" />
            ))
          )}
          <path {...S} strokeWidth="2.5" d="M104 30h32M120 14v32" opacity="0.9" />
          <path {...S} strokeWidth="2.5" d="M104 70h32" />
          <path {...S} strokeWidth="2.5" d="M108 84h24" opacity="0.6" />
        </>
      );

    case "abbrev":
      return (
        <>
          <rect {...S} strokeWidth="2.5" x="14" y="24" width="40" height="40" rx="7" />
          <path {...S} strokeWidth="2.5" d="M26 54l8-20 8 20M29 47h10" />
          <rect {...S} strokeWidth="2.5" x="62" y="38" width="40" height="40" rx="7" opacity="0.85" />
          <path {...S} strokeWidth="2.5" d="M74 68V48h9a6 6 0 0 1 0 12h-9m9 0 8 8" />
          <rect {...S} strokeWidth="2.5" x="110" y="16" width="38" height="38" rx="7" opacity="0.7" />
          <path {...S} strokeWidth="2.5" d="M138 26a10 10 0 1 0 0 18" />
        </>
      );

    case "neuro":
      return (
        <>
          <path {...S} strokeWidth="1.6" opacity="0.7" d="M34 30 72 20 110 40 140 26M34 30 56 62 72 20M56 62 110 40M56 62 96 80 110 40M96 80 140 26M96 80 132 76" />
          <circle {...S} strokeWidth="2.5" cx="34" cy="30" r="7" />
          <circle {...S} strokeWidth="2.5" cx="72" cy="20" r="5" />
          <circle {...S} strokeWidth="2.5" cx="56" cy="62" r="8" />
          <circle {...S} strokeWidth="2.5" cx="110" cy="40" r="6" />
          <circle {...S} strokeWidth="2.5" cx="96" cy="80" r="5" />
          <circle {...S} strokeWidth="2.5" cx="140" cy="26" r="7" />
          <circle {...S} strokeWidth="2" cx="132" cy="76" r="4" />
        </>
      );

    case "breath":
      return (
        <>
          <path {...S} strokeWidth="2.5" d="M80 14v34" />
          <path {...S} strokeWidth="2.5" d="M80 34c-6-10-18-14-26-8-9 7-8 24-6 36 2 11 8 20 16 20 9 0 16-9 16-22z" />
          <path {...S} strokeWidth="2.5" d="M80 34c6-10 18-14 26-8 9 7 8 24 6 36-2 11-8 20-16 20-9 0-16-9-16-22z" />
          <path {...S} strokeWidth="1.6" opacity="0.55" d="M2 92q20-14 40 0t40 0 40 0 36 0" />
        </>
      );

    case "vitals":
      return (
        <>
          <path {...S} strokeWidth="2.5" d="M78 84C60 70 30 56 30 36a22 22 0 0 1 48-14 22 22 0 0 1 48 14c0 20-30 34-48 48Z" />
          <path {...S} strokeWidth="2.2" opacity="0.9" d="M40 44h20l7-13 10 26 8-16 6 3h22" />
        </>
      );

    case "chart":
      return (
        <>
          <path {...S} strokeWidth="2" opacity="0.5" d="M22 88h124M22 88V12M22 66h124M22 44h124M22 22h124" />
          <rect {...S} strokeWidth="2.5" x="34" y="52" width="18" height="36" rx="3" />
          <rect {...S} strokeWidth="2.5" x="62" y="32" width="18" height="56" rx="3" />
          <rect {...S} strokeWidth="2.5" x="90" y="60" width="18" height="28" rx="3" />
          <rect {...S} strokeWidth="2.5" x="118" y="20" width="18" height="68" rx="3" />
        </>
      );

    case "doc":
      return (
        <>
          <path {...S} strokeWidth="2" opacity="0.5" d="M46 10h50l18 18v52a6 6 0 0 1-6 6H46a6 6 0 0 1-6-6V16a6 6 0 0 1 6-6Z" transform="translate(14 6)" />
          <path {...S} strokeWidth="2.5" d="M40 6h50l18 18v56a6 6 0 0 1-6 6H40a6 6 0 0 1-6-6V12a6 6 0 0 1 6-6Z" />
          <path {...S} strokeWidth="2.2" d="M90 6v18h18" />
          <path {...S} strokeWidth="2" d="M48 44h44M48 58h44M48 72h28" opacity="0.85" />
        </>
      );

    case "shield":
      return (
        <>
          <path {...S} strokeWidth="2.5" d="M80 8 40 22v28c0 22 17 36 40 44 23-8 40-22 40-44V22Z" />
          <path {...S} strokeWidth="2.8" d="M64 50l12 13 22-25" />
          <path {...S} strokeWidth="1.6" opacity="0.5" d="M14 30h14M8 50h20M14 70h14M132 30h14M132 50h20M132 70h14" />
        </>
      );

    case "people":
      return (
        <>
          <circle {...S} strokeWidth="2.5" cx="52" cy="30" r="14" />
          <path {...S} strokeWidth="2.5" d="M26 82c0-15 12-24 26-24s26 9 26 24" />
          <circle {...S} strokeWidth="2.2" cx="106" cy="36" r="11" opacity="0.85" />
          <path {...S} strokeWidth="2.2" d="M86 82c0-12 9-20 20-20s20 8 20 20" opacity="0.85" />
          <circle {...S} strokeWidth="2" cx="140" cy="46" r="8" opacity="0.6" />
        </>
      );

    case "bone":
      return (
        <>
          <g transform="rotate(-20 80 50)">
            <path {...S} strokeWidth="2.5" d="M42 34a11 11 0 1 0-8 18l0 0 84 0a11 11 0 1 0 8-18 11 11 0 1 0-19-9l-54 0a11 11 0 1 0-11 9Z" />
          </g>
          <path {...S} strokeWidth="1.6" opacity="0.5" d="M20 86h120" />
        </>
      );

    case "infant":
      return (
        <>
          <circle {...S} strokeWidth="2.5" cx="72" cy="40" r="26" />
          <circle {...S} strokeWidth="2" cx="63" cy="38" r="2.5" />
          <circle {...S} strokeWidth="2" cx="82" cy="38" r="2.5" />
          <path {...S} strokeWidth="2.2" d="M64 50a10 10 0 0 0 16 0" />
          <path {...S} strokeWidth="2.5" d="M40 86c0-16 14-24 32-24s32 8 32 24" />
          <path {...S} strokeWidth="2" opacity="0.6" d="M120 22c8 0 14 6 14 14s-6 14-14 14" />
        </>
      );

    default:
      return (
        <>
          <circle {...S} strokeWidth="2.5" cx="80" cy="50" r="36" />
          <circle {...S} strokeWidth="1.8" cx="80" cy="50" r="24" opacity="0.7" />
          <path {...S} strokeWidth="2" opacity="0.55" d="M8 74q26-24 52 0t52 0 44-14" />
          <path {...S} strokeWidth="2" opacity="0.4" d="M8 88q26-24 52 0t52 0 44-14" />
        </>
      );
  }
}

/** Positioned art layer for a cover. */
export function CategoryArt({ motif, className }: { motif: Motif; className?: string }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 160 100"
      fill="none"
      className={className}
      preserveAspectRatio="xMidYMid meet"
    >
      <Art motif={motif} />
    </svg>
  );
}
