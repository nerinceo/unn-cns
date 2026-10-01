import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { CategoryArt } from "@/components/library/CategoryArt";
import {
  categoryDelay,
  categoryMesh,
  categoryMotif,
  categoryPalette,
} from "@/lib/cns/library-visuals";

/**
 * A category tile — the library's primary navigation unit.
 *
 * The cover carries generated artwork AND the title. The archive has no images
 * of its own (not one across 9,244 articles), so the cover is built from the
 * category's name: a radial-gradient mesh, a grain pass, and a piece of
 * subject-specific line art — an ECG trace for cardiac sections, filled tubes
 * for lab work, a petri dish for microbiology. See lib/cns/library-visuals.ts
 * for why all of that is deterministic.
 *
 * The title sits in white over the mesh, whose bottom anchor is dark enough to
 * carry it (7:1+). No black scrim is laid over the artwork to achieve that.
 *
 * Motion is two CSS animations, both in globals.css and both compositor-only.
 * Idle is a single slow drift; the sheen and the art's parallax fire on hover,
 * where one card animates at a time. That budget exists because the Procedures
 * archive puts 48 of these on one screen.
 */
export function CategoryCard({
  name,
  href,
  subtopics,
  articles,
  previewTopics = [],
}: {
  name: string;
  href: string;
  subtopics: number;
  articles: number;
  /** A few child names, to hint at what the section covers before a click. */
  previewTopics?: string[];
}) {
  const motif = categoryMotif(name);
  const mesh = categoryMesh(name);
  const palette = categoryPalette(name);
  const delay = categoryDelay(name);
  const shown = previewTopics.slice(0, 3);
  const rest = Math.max(0, subtopics - shown.length);

  return (
    <Link
      href={href}
      className="library-card group flex flex-col overflow-hidden rounded-3xl border border-border bg-card shadow-card transition-all duration-300 ease-out hover:-translate-y-1 hover:border-primary/30 hover:shadow-card-hover"
    >
      <div className="relative h-48 overflow-hidden" style={{ backgroundImage: mesh }}>
        <span aria-hidden className="library-grain absolute inset-0" />

        {/* Drifting highlight — the entire idle animation. One element, one
            transform, staggered from the name so the grid never pulses as one. */}
        <span
          aria-hidden
          className="library-card-drift absolute -left-12 -top-16 h-48 w-48 rounded-full"
          style={{ backgroundColor: `${palette.spark}33`, animationDelay: delay }}
        />

        {/* The subject artwork, offset right and scaled past the frame so it
            reads as a crop of something larger rather than a centred glyph. */}
        <CategoryArt
          motif={motif}
          className="absolute -right-4 top-1 h-32 w-52 text-white/[0.28] transition-transform duration-500 ease-out group-hover:-translate-y-1 group-hover:scale-105"
        />

        {/* Hover sheen. */}
        <span
          aria-hidden
          className="library-card-sweep absolute inset-y-0 -left-1/3 w-1/3 bg-white/20 opacity-0"
        />

        <div className="absolute inset-x-0 bottom-0 p-5">
          {/* Glass count chip. backdrop-blur only over artwork, never over
              text, so it costs one small composited layer. */}
          <span className="inline-flex items-center rounded-full bg-white/15 px-2.5 py-1 text-[12px] font-semibold uppercase tracking-wide text-white ring-1 ring-inset ring-white/25 backdrop-blur-sm">
            {articles.toLocaleString("en-GB")} {articles === 1 ? "article" : "articles"}
          </span>

          <h3 className="mt-2.5 text-[20px] font-semibold leading-tight tracking-tight text-white">
            {name}
          </h3>

          {subtopics > 0 ? (
            <p className="mt-1 text-[14px] font-medium text-white/80">
              {subtopics} {subtopics === 1 ? "subtopic" : "subtopics"}
            </p>
          ) : null}
        </div>
      </div>

      {/* Preview strip. Fixed minimum height so a card with no subtopics lines
          up with its neighbours instead of standing short in the grid. */}
      <div className="flex min-h-[3.5rem] flex-1 items-center justify-between gap-3 px-5 py-3">
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          {shown.map((topic) => (
            <span
              key={topic}
              className="max-w-[8.5rem] truncate rounded-full bg-muted px-2.5 py-1 text-[12px] font-medium text-muted-foreground"
            >
              {topic}
            </span>
          ))}
          {rest > 0 ? (
            <span className="text-[12px] font-semibold text-muted-foreground">+{rest}</span>
          ) : null}
        </div>

        <span className="inline-flex shrink-0 items-center gap-1 text-sm font-semibold text-primary">
          {subtopics > 0 ? "Browse" : "Open"}
          <ArrowRight className="h-3.5 w-3.5 transition-transform duration-300 group-hover:translate-x-1" />
        </span>
      </div>
    </Link>
  );
}
