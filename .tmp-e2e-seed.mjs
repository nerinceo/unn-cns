import { readFileSync, writeFileSync } from "fs";
import { createClient } from "@supabase/supabase-js";
const env=Object.fromEntries(readFileSync(".env","utf8").split("\n").filter(l=>l.includes("=")&&!l.startsWith("#")).map(l=>[l.slice(0,l.indexOf("=")).trim(),l.slice(l.indexOf("=")+1).trim().replace(/^"(.*)"$/,"$1")]));
const db=createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}});
const s=Date.now().toString().slice(-6);
const PW=`E2e!${s}xX7`;

async function user(tag, role){
  const email=`e2e.${tag}.${s}@example.com`;
  const {data:u,error}=await db.auth.admin.createUser({email,password:PW,email_confirm:true});
  if(error) throw error;
  await db.from("users").upsert({id:u.user.id,email,full_name:`E2E ${tag}`,...(role?{role}:{})},{onConflict:"id"});
  return {tag,email,password:PW,uid:u.user.id};
}

const member   = await user("nurse");
const recruiter= await user("recruiter");
const admin    = await user("admin","platform_admin");

const {data:emp,error:ee}=await db.from("cns_employers").insert({
  name:`E2E Hospital ${s}`, slug:`e2e-hospital-${s}`, employer_type:"hospital",
  country:"IN", city:"Bengaluru", status:"approved", verification_status:"approved",
  description:"Seeded for an end-to-end test run.", created_by:recruiter.uid,
}).select("id,slug").single();
if(ee) throw ee;
await db.from("cns_employer_members").insert({employer_id:emp.id,user_id:recruiter.uid,role:"owner",status:"approved"});

writeFileSync(".tmp-e2e.json",JSON.stringify({member,recruiter,admin,employer:emp,stamp:s},null,2));
console.log("member    ", member.email);
console.log("recruiter ", recruiter.email);
console.log("admin     ", admin.email);
console.log("password  ", PW);
console.log("employer  ", emp.id, "/", emp.slug);
