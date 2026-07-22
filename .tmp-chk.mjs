import { readFileSync } from "fs";
import { createClient } from "@supabase/supabase-js";
const env=Object.fromEntries(readFileSync(".env","utf8").split("\n").filter(l=>l.includes("=")&&!l.startsWith("#")).map(l=>[l.slice(0,l.indexOf("=")).trim(),l.slice(l.indexOf("=")+1).trim().replace(/^"(.*)"$/,"$1")]));
const db=createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}});
const {employer}=JSON.parse(readFileSync(".tmp-e2e.json","utf8"));
const {data}=await db.from("cns_jobs")
  .select("id,title,status,employment_type,nursing_role,specialty,work_setting,experience_level,is_remote,work_mode,country,city,application_deadline,created_at")
  .eq("employer_id",employer.id).order("created_at",{ascending:false});
for(const j of data??[]) console.log(" ", JSON.stringify(j,null,1).replace(/\n\s*/g," "));
