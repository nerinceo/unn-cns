import "server-only";
import { createClient } from "@/lib/supabase/server";

/**
 * Learning progress reads.
 *
 * The grader (cns_submit_attempt) maintains cns_user_topic_progress cumulatively
 * on every submit — questions_seen, questions_correct and mastery per topic —
 * precisely so a dashboard never has to scan the response rows. So subject and
 * topic accuracy come from there; the attempt list comes from cns_attempts.
 *
 * All reads are the user's own client, and RLS scopes both tables to
 * user_id = auth.uid().
 */

export type SubjectProgress = {
  subjectId: string;
  name: string;
  seen: number;
  correct: number;
  accuracy: number; // 0..100
  topics: number;
};

export type WeakTopic = {
  topicId: string;
  name: string;
  subject: string;
  seen: number;
  mastery: number;
};

export type RecentAttempt = {
  id: string;
  title: string;
  correct: number;
  total: number;
  scorePct: number;
  when: string;
};

export type Progress = {
  hasData: boolean;
  totals: { seen: number; correct: number; accuracy: number; topics: number; attempts: number };
  subjects: SubjectProgress[];
  weakTopics: WeakTopic[];
  recent: RecentAttempt[];
};

export async function getProgress(): Promise<Progress> {
  const supabase = await createClient();

  const [{ data: tp }, { data: attempts }] = await Promise.all([
    supabase
      .from("cns_user_topic_progress")
      .select("topic_id,subject_id,questions_seen,questions_correct,mastery")
      .order("last_practiced_at", { ascending: false }),
    supabase
      .from("cns_attempts")
      .select("id,set_id,subject_id,correct_count,total_questions,score,max_score,submitted_at")
      .eq("status", "submitted")
      .order("submitted_at", { ascending: false })
      .limit(10),
  ]);

  const rows = tp ?? [];
  const attemptRows = attempts ?? [];

  if (!rows.length && !attemptRows.length) {
    return {
      hasData: false,
      totals: { seen: 0, correct: 0, accuracy: 0, topics: 0, attempts: 0 },
      subjects: [],
      weakTopics: [],
      recent: [],
    };
  }

  // Resolve the names we need in as few round trips as possible.
  const subjectIds = Array.from(new Set(rows.map((r) => r.subject_id as string).filter(Boolean)));
  const topicIds = rows.map((r) => r.topic_id as string);
  const setIds = Array.from(new Set(attemptRows.map((a) => a.set_id as string).filter(Boolean)));

  const [{ data: subjectRows }, { data: topicRows }, { data: setRows }] = await Promise.all([
    subjectIds.length ? supabase.from("cns_subjects").select("id,name").in("id", subjectIds) : Promise.resolve({ data: [] }),
    topicIds.length ? supabase.from("cns_topics").select("id,name").in("id", topicIds) : Promise.resolve({ data: [] }),
    setIds.length ? supabase.from("cns_question_sets").select("id,title").in("id", setIds) : Promise.resolve({ data: [] }),
  ]);

  const subjectName = new Map((subjectRows ?? []).map((s) => [s.id as string, s.name as string]));
  const topicName = new Map((topicRows ?? []).map((t) => [t.id as string, t.name as string]));
  const setTitle = new Map((setRows ?? []).map((s) => [s.id as string, s.title as string]));

  // Aggregate topic progress into per-subject accuracy.
  const bySubject = new Map<string, { seen: number; correct: number; topics: number }>();
  let totalSeen = 0;
  let totalCorrect = 0;
  for (const r of rows) {
    const sid = (r.subject_id as string) ?? "unknown";
    const seen = (r.questions_seen as number) ?? 0;
    const correct = (r.questions_correct as number) ?? 0;
    totalSeen += seen;
    totalCorrect += correct;
    const agg = bySubject.get(sid) ?? { seen: 0, correct: 0, topics: 0 };
    agg.seen += seen;
    agg.correct += correct;
    agg.topics += 1;
    bySubject.set(sid, agg);
  }

  const subjects: SubjectProgress[] = Array.from(bySubject.entries())
    .map(([subjectId, a]) => ({
      subjectId,
      name: subjectName.get(subjectId) ?? "Other",
      seen: a.seen,
      correct: a.correct,
      accuracy: a.seen ? Math.round((100 * a.correct) / a.seen) : 0,
      topics: a.topics,
    }))
    .sort((a, b) => b.seen - a.seen);

  // Weak topics: lowest mastery among topics actually practised more than once,
  // so a single unlucky question does not dominate the "revise next" list.
  const weakTopics: WeakTopic[] = rows
    .filter((r) => ((r.questions_seen as number) ?? 0) >= 2)
    .map((r) => ({
      topicId: r.topic_id as string,
      name: topicName.get(r.topic_id as string) ?? "Topic",
      subject: subjectName.get(r.subject_id as string) ?? "",
      seen: (r.questions_seen as number) ?? 0,
      mastery: Number(r.mastery ?? 0),
    }))
    .sort((a, b) => a.mastery - b.mastery)
    .slice(0, 6);

  const recent: RecentAttempt[] = attemptRows.map((a) => ({
    id: a.id as string,
    title: setTitle.get(a.set_id as string) ?? "Practice",
    correct: (a.correct_count as number) ?? 0,
    total: (a.total_questions as number) ?? 0,
    scorePct: (a.max_score as number) ? Math.round((100 * (a.score as number)) / (a.max_score as number)) : 0,
    when: a.submitted_at as string,
  }));

  return {
    hasData: true,
    totals: {
      seen: totalSeen,
      correct: totalCorrect,
      accuracy: totalSeen ? Math.round((100 * totalCorrect) / totalSeen) : 0,
      topics: rows.length,
      attempts: attemptRows.length,
    },
    subjects,
    weakTopics,
    recent,
  };
}
