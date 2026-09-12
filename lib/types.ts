export type Difficulty = 'Easy' | 'Medium' | 'Hard';
export type DsaQuestion = { id:number; section:string; title:string; difficulty:Difficulty; pattern:string };
export type Priority = 'TOP PRIORITY'|'HIGH'|'MEDIUM'|'LOW'|'Unranked';
export type PlacementQuestion = { id:number; topic:string; title:string; difficulty:'Easy'|'Medium'; pattern:string; source:string; priority:Priority };
export type TestCase = { input:any; expected:any };
export type ProgressRow = { question_id:number|string; solved:boolean; hint_used:boolean; solution_seen:boolean; solved_at:string|null; last_viewed_at:string|null };
export type CustomQuestion = { id:string; title:string; difficulty:Difficulty; topic:string; pattern:string; statement:string; source:string|null; link:string|null; tags:string[]|null; created_at:string; updated_at:string };
export type CustomProgress = { question_id:string; solved:boolean; hint_used:boolean; solution_seen:boolean; solved_at:string|null; last_viewed_at:string|null };
