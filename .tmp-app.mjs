import { readFileSync } from "fs";
import { createClient } from "@supabase/supabase-js";
const env=Object.fromEntries(readFileSync(".env","utf8").split("\n").filter(l=>l.includes("=")&&!l.startsWith("#")).map(l=>[l.slice(0,l.indexOf("=")).trim(),l.slice(l.indexOf("=")+1).trim().replace(/^"(.*)"$/,"$1")]));
const db=createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}});
const {member}=JSON.parse(readFileSync(".tmp-e2e.json","utf8"));
const {data}=await db.from("cns_job_applications").select("id,status,profile_snapshot,created_at").eq("applicant_id",member.uid);
console.log("  applications:", data?.length ?? 0);
for(const a of data??[]){
  console.log("  status:", a.status);
  const snap=a.profile_snapshot ?? {};
  console.log("  snapshot keys:", Object.keys(snap).join(", "));
  const pii=["email","phone","date_of_birth","address"].filter(k=>k in snap);
  console.log("  PII in snapshot:", pii.length ? `LEAK -> ${pii.join(", ")}` : "none (correct)");
}
const {data:h}=await db.from("cns_application_status_history").select("status,actor_id").order("created_at");
console.log("  status history rows:", h?.length ?? 0, JSON.stringify(h));
