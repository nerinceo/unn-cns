import { readFileSync } from "fs";
import { createClient } from "@supabase/supabase-js";
const env=Object.fromEntries(readFileSync(".env","utf8").split("\n").filter(l=>l.includes("=")&&!l.startsWith("#")).map(l=>[l.slice(0,l.indexOf("=")).trim(),l.slice(l.indexOf("=")+1).trim().replace(/^"(.*)"$/,"$1")]));
const db=createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}});
const ID="b3d5abf3-b1b0-47c2-b23c-c3b4c6bc0516";
const {data:j}=await db.from("cns_jobs").select("slug,status,published_at,reviewed_by,reviewed_at").eq("id",ID).single();
console.log("  job:", JSON.stringify(j));
const {data:a}=await db.from("cns_audit_logs").select("action,target_type,actor_id,created_at").order("created_at",{ascending:false}).limit(3);
console.log("  latest audit rows:", JSON.stringify(a));
