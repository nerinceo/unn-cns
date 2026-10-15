import "server-only";
import { unstable_cache } from "next/cache";
import { contentClient } from "@/lib/cns/bank-source";

/**
 * Question Bank Pro (Naveen, 2026-10-14): the nerusalem.in bank — 23,922
 * questions across 8 semesters, previous years, most important, mock and viva
 * exams, exam hacks and practice taplets — sold beside the RGUHS bank.
 *
 * Its own institution key, so it can never unlock (or be unlocked by) the
 * RGUHS bank: every existing check filters on institution 'rguhs', and
 * qbank_products is unique on (institution, course).
 *
 * Content lives in CONTENT schema qbank2 and is read only through the
 * server-only public.qbank2_* functions (supabase/content/0002).
 */
export const PRO = { institution: "rguhs-pro", course: "bsc-nursing" } as const;

async function call<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await contentClient().rpc(fn, args);
  if (error) throw new Error(`${fn}: ${error.message}`);
  return data as T;
}

export interface ProPage {
  html: string;
  sha256: string;
  taplet_semester: number | null;
}

/** One copied page. The pages are static copies, so an hour of caching is safe. */
export const getProPage = unstable_cache(
  async (path: string): Promise<ProPage | null> => {
    const rows = await call<ProPage[]>("qbank2_page", { p_path: path });
    return rows?.[0] ?? null;
  },
  ["qbank2-page"],
  { revalidate: 3600, tags: ["qbank2"] },
);

/** semester + max score of a mock (written) or viva exam; null when there is none. */
export const getExamInfo = unstable_cache(
  async (kind: "written" | "viva", examId: number): Promise<{ semester: number; max_score: number } | null> => {
    const rows = await call<{ semester: number; max_score: number }[]>("qbank2_exam_semester", {
      p_kind: kind,
      p_exam_id: examId,
    });
    return rows?.[0] ?? null;
  },
  ["qbank2-exam-info"],
  { revalidate: 3600, tags: ["qbank2"] },
);

/** The free sample exam ids, as "written:3" → 17. */
export const getSampleExams = unstable_cache(
  async (): Promise<Record<string, number>> => {
    const rows = await call<{ kind: string; semester: number; exam_id: number }[]>("qbank2_sample_exams", {});
    return Object.fromEntries((rows ?? []).map((r) => [`${r.kind}:${r.semester}`, Number(r.exam_id)]));
  },
  ["qbank2-sample-exams"],
  { revalidate: 3600, tags: ["qbank2"] },
);

/** One of the 12 read functions, exactly as the page expects it (see qbank2_rpc). */
export function proRead(fn: string, args: Record<string, unknown>): Promise<unknown> {
  return call("qbank2_rpc", { p_fn: fn, p_args: args });
}

export interface Attempt {
  submitted_at: string;
  self_score: number | null;
  max_score: number;
}

export async function getAttempt(userId: string, kind: "written" | "viva", examId: number): Promise<Attempt | null> {
  const rows = await call<Attempt[]>("qbank2_attempt_get", { p_user: userId, p_kind: kind, p_exam_id: examId });
  return rows?.[0] ?? null;
}

export async function submitAttempt(userId: string, kind: "written" | "viva", examId: number): Promise<Attempt> {
  const rows = await call<Attempt[]>("qbank2_attempt_submit", { p_user: userId, p_kind: kind, p_exam_id: examId });
  return rows[0];
}

export async function saveAttemptScore(
  userId: string,
  kind: "written" | "viva",
  examId: number,
  score: number,
): Promise<Attempt> {
  const rows = await call<Attempt[]>("qbank2_attempt_score", {
    p_user: userId,
    p_kind: kind,
    p_exam_id: examId,
    p_score: score,
  });
  return rows[0];
}
