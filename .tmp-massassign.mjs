import { readFileSync, writeFileSync } from "fs";
import { createClient } from "@supabase/supabase-js";
const env=Object.fromEntries(readFileSync(".env","utf8").split("\n").filter(l=>l.includes("=")&&!l.startsWith("#")).map(l=>[l.slice(0,l.indexOf("=")).trim(),l.slice(l.indexOf("=")+1).trim().replace(/^"(.*)"$/,"$1")]));
const db=createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}});
const {recruiter,employer,stamp}=JSON.parse(readFileSync(".tmp-e2e.json","utf8"));

// A valid draft, using the new vocabulary the DB now enforces.
const {data:job,error}=await db.from("cns_jobs").insert({
  employer_id:employer.id, slug:`e2e-icu-${stamp}`, title:"Staff Nurse — Intensive Care",
  description:"Seeded draft for the mass-assignment check. ".repeat(6),
  employment_type:"full-time", nursing_role:"staff-nurse", specialty:"icu-critical-care",
  work_setting:"hospital", experience_level:"1-3", country:"india", city:"Bengaluru",
  status:"draft", created_by:recruiter.uid, application_deadline:"2026-10-31",
}).select("id,status").single();
if(error) throw error;
writeFileSync(".tmp-job.json",JSON.stringify(job));
console.log("  draft created:", job.id, "status:", job.status);

// The recruiter's own session — exactly the privileges saveJob runs with.
const as=createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY,{auth:{persistSession:false}});
await as.auth.signInWithPassword({email:recruiter.email,password:recruiter.password});

const {error:upErr}=await as.from("cns_jobs")
  .update({status:"active", published_at:new Date().toISOString()}).eq("id",job.id);
const {data:after}=await db.from("cns_jobs").select("status,published_at").eq("id",job.id).single();
console.log("  employer self-publishes  :", upErr ? `refused (${upErr.code})` : "NO ERROR");
console.log("  status now               :", after.status, after.status==="active" ? " <- SELF-PUBLISHED, admin bypassed" : "(still gated)");

// If it is live, is it publicly readable? That confirms the policy uses 'active'.
const anon=createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY,{auth:{persistSession:false}});
const {data:pub}=await anon.from("cns_jobs").select("id,title").eq("id",job.id).maybeSingle();
console.log("  anonymous visitor sees it:", pub ? "YES — live on the public board" : "no");

// Reset for the rest of the run.
await db.from("cns_jobs").update({status:"draft",published_at:null}).eq("id",job.id);
console.log("  reset to draft for the remaining tests");
