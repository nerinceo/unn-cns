import { ShieldCheck } from "lucide-react";
import type { ResumeContent } from "@/lib/cns/resume";

/**
 * The rendered resume.
 *
 * ATS-SAFE BY CONSTRUCTION — these are not style preferences, they are what
 * real applicant tracking systems require:
 *
 *   - SINGLE COLUMN. A two-column layout makes parsers read left then right and
 *     interleave unrelated lines ("Senior Nurse | References available upon").
 *   - NO TABLES. Cell content is extracted out of document order.
 *   - NO TEXT BOXES. Most parsers treat them as floating objects and drop them
 *     entirely.
 *   - NO IMAGES carrying information. Not machine-readable.
 *   - SAFE FONTS ONLY. Decorative faces use ligatures that extract as garbage,
 *     breaking words like "efficient".
 *   - FULL FOUR-DIGIT YEARS. Some parsers read "'23" as a stray character.
 *   - CONVENTIONAL HEADINGS. "Work Experience", not "My Journey".
 *
 * Semantic source order is therefore the reading order, which is also what
 * print-to-PDF writes into the text layer.
 */

function fmtRange(start?: string, end?: string, current?: boolean) {
  const s = (start ?? "").trim();
  const e = current ? "Present" : (end ?? "").trim();
  if (!s && !e) return "";
  return [s, e].filter(Boolean).join(" – ");
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="resume-section">
      <h2>{title}</h2>
      {children}
    </section>
  );
}

export function ResumeDocument({
  content,
  verified,
  showVerifiedBadge = true,
}: {
  content: ResumeContent;
  verified?: boolean;
  showVerifiedBadge?: boolean;
}) {
  const c = content;
  const contact = [c.header.email, c.header.phone, c.header.location].filter(Boolean);

  return (
    <article className="resume-doc">
      <header>
        <h1>{c.header.full_name || "Your name"}</h1>
        {c.header.headline && <p className="headline">{c.header.headline}</p>}

        {contact.length > 0 && <p className="contact">{contact.join("  ·  ")}</p>}

        {c.header.links.length > 0 && (
          <p className="contact">
            {c.header.links.map((l, i) => (
              <span key={i}>
                {i > 0 && "  ·  "}
                {/* Plain text URL, not just an anchor: parsers strip href. */}
                {l.label}: {l.url}
              </span>
            ))}
          </p>
        )}

        {verified && showVerifiedBadge && (
          <p className="verified">
            <ShieldCheck className="icon" aria-hidden />
            {/* Spelled out because an icon alone conveys nothing to a parser. */}
            Identity and credentials verified by Nerusalem
          </p>
        )}
      </header>

      {c.summary?.trim() && (
        <Section title="Professional Summary">
          <p>{c.summary}</p>
        </Section>
      )}

      {c.registration.length > 0 && (
        <Section title="Professional Registration">
          {c.registration.map((r, i) => (
            <p key={i} className="line">
              <strong>{r.council}</strong>
              {r.number && ` — Registration No. ${r.number}`}
              {r.country && ` (${r.country})`}
              {r.expires && ` · Valid to ${r.expires}`}
            </p>
          ))}
        </Section>
      )}

      {c.experience.length > 0 && (
        <Section title="Work Experience">
          {c.experience.map((e, i) => (
            <div key={i} className="entry">
              <p className="entry-head">
                <strong>{e.title}</strong>
                {e.employer && <> — {e.employer}</>}
              </p>
              <p className="entry-meta">
                {[fmtRange(e.start, e.end, e.current), e.location].filter(Boolean).join("  ·  ")}
              </p>
              {e.bullets.filter(Boolean).length > 0 && (
                <ul>
                  {e.bullets.filter(Boolean).map((b, j) => (
                    <li key={j}>{b}</li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </Section>
      )}

      {c.education.length > 0 && (
        <Section title="Education">
          {c.education.map((e, i) => (
            <div key={i} className="entry">
              <p className="entry-head">
                <strong>
                  {e.degree}
                  {e.field && `, ${e.field}`}
                </strong>
              </p>
              <p className="entry-meta">
                {[e.institution, fmtRange(e.start, e.end), e.grade].filter(Boolean).join("  ·  ")}
              </p>
            </div>
          ))}
        </Section>
      )}

      {c.certifications.length > 0 && (
        <Section title="Certifications">
          {c.certifications.map((x, i) => (
            <p key={i} className="line">
              <strong>{x.name}</strong>
              {x.issuer && ` — ${x.issuer}`}
              {x.year && ` (${x.year})`}
              {x.credential_id && ` · ID ${x.credential_id}`}
            </p>
          ))}
        </Section>
      )}

      {c.specialties.length > 0 && (
        <Section title="Clinical Specialties">
          <p>{c.specialties.join(", ")}</p>
        </Section>
      )}

      {c.skills.length > 0 && (
        <Section title="Skills">
          {/* Comma-separated prose, NOT a grid or pill layout — a parser reads
              this as one clean list, whereas a CSS grid can scramble order. */}
          <p>{c.skills.join(", ")}</p>
        </Section>
      )}

      {c.languages.length > 0 && (
        <Section title="Languages">
          <p>
            {c.languages
              .map((l) => (l.level ? `${l.name} (${l.level})` : l.name))
              .join(", ")}
          </p>
        </Section>
      )}
    </article>
  );
}
