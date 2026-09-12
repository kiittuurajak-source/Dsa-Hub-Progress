import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';

// tsx/node don't auto-load .env.local like Next.js does — read it manually.
const envPath = path.join(process.cwd(), '.env.local');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
const key=process.env.SUPABASE_SERVICE_ROLE_KEY;
if(!url||!key) throw new Error('Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY before seeding.');
const supabase=createClient(url,key,{auth:{persistSession:false}});
const root=path.join(process.cwd(),'lib');
const dsa=JSON.parse(fs.readFileSync(path.join(root,'dsaQuestions.json'),'utf8'));
const placement=JSON.parse(fs.readFileSync(path.join(root,'placementQuestions.json'),'utf8'));

const chunk=async(table:string,rows:any[])=>{for(let i=0;i<rows.length;i+=500){const {error}=await supabase.from(table).upsert(rows.slice(i,i+500),{onConflict:'id'});if(error)throw error;}}
await chunk('dsa_questions',dsa);
await chunk('placement_questions',placement);
console.log(`Seeded ${dsa.length} DSA + ${placement.length} Placement questions.`);
