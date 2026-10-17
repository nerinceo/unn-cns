import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Where the question bank is read from.
 *
 *   legacy  — the cns_study_questions / cns_questions copy in the UNN main
 *             project, imported once in July 2026. The default, so deploying
 *             this code changes nothing until QB_SOURCE is set.
 *   content — the source bank itself, schema `qbank` in the unn-content
 *             project (ref gspamgemgxwthpcvqjwo, ap-south-1 Mumbai since 2026-10-17), read through five server-only
 *             functions (qbank_subjects / _questions / _question / _types /
 *             _topics). Always current: questions the generator adds or edits
 *             appear without an import.
 *
 * Rolling back is setting QB_SOURCE=legacy and redeploying — the legacy tables
 * are left untouched for exactly that reason.
 */
export type BankSource = "legacy" | "content";

export function bankSource(): BankSource {
  return process.env.QB_SOURCE === "content" ? "content" : "legacy";
}

let client: SupabaseClient | null = null;

/**
 * Service client for the content project.
 *
 * The key is a secret key that can do exactly one thing there: EXECUTE the
 * qbank_* functions (anon/authenticated are revoked on all of them, and have no
 * access to the qbank schema at all). It must never reach the browser, which is
 * why this module is server-only and the variable has no NEXT_PUBLIC_ prefix.
 */
export function contentClient(): SupabaseClient {
  if (client) return client;
  const url = process.env.CONTENT_SUPABASE_URL;
  const key = process.env.CONTENT_SUPABASE_SECRET_KEY;
  if (!url || !key) {
    throw new Error(
      "QB_SOURCE=content needs CONTENT_SUPABASE_URL and CONTENT_SUPABASE_SECRET_KEY"
    );
  }
  client = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return client;
}
