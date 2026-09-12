'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import dsaQuestions from '@/lib/dsaQuestions.json';
import placementQuestions from '@/lib/placementQuestions.json';
import placementTestCasesJson from '@/lib/placementTestCases.json';
const PLACEMENT_TESTCASES:Record<number,TestCase[]> = Object.fromEntries((placementTestCasesJson as any[]).map(x=>[x.id,x.testCases]));
import dsaTestCasesJson from '@/lib/dsaTestCases.json';
const DSA_TESTCASES:Record<number,TestCase[]> = Object.fromEntries((dsaTestCasesJson as any[]).map(x=>[x.id,x.testCases]));
import dsaDescriptionsJson from '@/lib/dsaDescriptions.json';
import placementDescriptionsJson from '@/lib/placementDescriptions.json';
import dsaHowJson from '@/lib/dsaHow.json';
import placementHowJson from '@/lib/placementHow.json';
const DSA_DESCRIPTIONS:Record<number,string> = Object.fromEntries((dsaDescriptionsJson as any[]).map(x=>[x.id,x.description]));
const PLACEMENT_DESCRIPTIONS:Record<number,string> = Object.fromEntries((placementDescriptionsJson as any[]).map(x=>[x.id,x.description]));
const DSA_HOW:Record<number,string> = Object.fromEntries((dsaHowJson as any[]).map(x=>[x.id,x.how]));
const PLACEMENT_HOW:Record<number,string> = Object.fromEntries((placementHowJson as any[]).map(x=>[x.id,x.how]));
function parseHowSteps(how?:string):string[]{
  if(!how) return [];
  return how.split(/\d+\.\s+/).map(s=>s.trim()).filter(Boolean);
}
import { supabaseBrowser } from '@/lib/supabase';
import type { CustomQuestion, DsaQuestion, PlacementQuestion, ProgressRow, TestCase } from '@/lib/types';
import { format, subDays } from 'date-fns';
import {
  Archive, ArrowLeft, ArrowRight, BookOpen, Check, ChevronDown, ClipboardList,
  Code2, Eye, Filter, Flame, Grid2X2, Lightbulb, ListFilter, LogOut, Menu, Palette,
  NotebookPen, Play, Plus, RefreshCw, RotateCcw, Search, Settings, Sparkles, Target, WifiOff, X, Zap
} from 'lucide-react';
import dynamic from 'next/dynamic';
const MonacoEditor=dynamic(()=>import('@monaco-editor/react'),{ssr:false,loading:()=><div className="editor-loading">Loading editor…</div>});
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

type Module = 'dashboard'|'dsa'|'placement'|'notes'|'progress'|'settings'|'my';
// ---------- Offline-first: local cache + write outbox ----------
type OutboxItem = { key:string; table:string; row:any; ts:number };
function cacheKey(uid:string){ return `dph_cache_${uid}`; }
function outboxKey(uid:string){ return `dph_outbox_${uid}`; }
function saveCache(uid:string,data:any){ try{ localStorage.setItem(cacheKey(uid),JSON.stringify(data)); }catch{} }
function loadCache(uid:string):any|null{ try{ const raw=localStorage.getItem(cacheKey(uid)); return raw?JSON.parse(raw):null; }catch{ return null; } }
function loadOutbox(uid:string):OutboxItem[]{ try{ return JSON.parse(localStorage.getItem(outboxKey(uid))||'[]'); }catch{ return []; } }
function saveOutbox(uid:string,items:OutboxItem[]){ try{ localStorage.setItem(outboxKey(uid),JSON.stringify(items)); }catch{} }
function queueWrite(uid:string,table:string,row:any){
  const items=loadOutbox(uid);
  // Merge (not replace) queued writes for the same table+row so that, e.g., an
  // offline hint/solved toggle and a separately-queued code save for the same
  // question both survive as one consolidated upsert instead of one clobbering
  // the other.
  const idKey=`${table}:${row.question_id ?? row.date}`;
  const existingIdx=items.findIndex(i=>`${i.table}:${i.row.question_id ?? i.row.date}`===idKey);
  if(existingIdx>=0){ items[existingIdx]={key:idKey,table,row:{...items[existingIdx].row,...row},ts:Date.now()}; }
  else { items.push({key:idKey,table,row,ts:Date.now()}); }
  saveOutbox(uid,items);
}
function isOfflineError(error:any):boolean{
  if(typeof navigator!=='undefined' && !navigator.onLine) return true;
  const msg=(error?.message||'').toLowerCase();
  return msg.includes('fetch')||msg.includes('network')||msg.includes('failed to fetch');
}

type Filters = { difficulty:string; section:string; pattern:string; source:string; search:string; status:string; priority:string };
const EMPTY_FILTERS:Filters={difficulty:'All',section:'All',pattern:'All',source:'All',search:'',status:'All',priority:'All'};
function priorityTone(p?:string){return p==='TOP PRIORITY'?'top':p==='HIGH'?'high':p==='MEDIUM'?'medprio':p==='LOW'?'low':'unranked';}


function themeFromLocal():Theme { if(typeof window==='undefined') return 'sepia'; const v=localStorage.getItem('dph-theme'); return (THEMES.includes(v as Theme)?v:'sepia') as Theme; }
type Theme='light'|'mist'|'sepia'|'coffee'|'dark';
const THEMES:Theme[]=['light','mist','sepia','coffee','dark'];
const THEME_LABEL:Record<Theme,string>={light:'Light',mist:'Mist',sepia:'Sepia',coffee:'Coffee',dark:'Dark'};
function ThemeSwatches({current,onPick}:{current:Theme;onPick:(t:Theme)=>void}){return <div className="theme-swatch-grid">{THEMES.map(t=><button key={t} className={`theme-swatch swatch-${t} ${current===t?'active':''}`} onClick={()=>onPick(t)}><span className="swatch-preview"/><span className="swatch-name">{THEME_LABEL[t]}</span>{current===t&&<Check size={13} className="swatch-check"/>}</button>)}</div>}
function ThemeMenu({current,onPick,onClose}:{current:Theme;onPick:(t:Theme)=>void;onClose:()=>void}){return <><div className="theme-menu-backdrop" onClick={onClose}/><div className="theme-menu"><div className="theme-menu-head"><strong>Appearance</strong><span>Tap to apply</span></div><ThemeSwatches current={current} onPick={onPick}/></div></>}

function Badge({children,tone='muted'}:{children:React.ReactNode;tone?:'green'|'amber'|'red'|'muted'|'purple'|'top'|'high'|'medprio'|'low'|'unranked'}){
  return <span className={`badge badge-${tone}`}>{children}</span>;
}
function PriorityBadge({priority}:{priority?:string}){if(!priority||priority==='Unranked')return <span/>;return <Badge tone={priorityTone(priority) as any}>{priority}</Badge>;}

function StatusButtons({p,onToggle}:{p:ProgressRow|undefined;onToggle:(key:'solved'|'hint_used'|'solution_seen')=>void}){
  return <div className="status-buttons">
    <button aria-label="Solved" className={p?.solved?'status active solved':'status'} onClick={()=>onToggle('solved')}><Check size={15}/></button>
    <button aria-label="Hint used" className={p?.hint_used?'status active hint':'status'} onClick={()=>onToggle('hint_used')}><Lightbulb size={15}/></button>
    <button aria-label="Solution seen" className={p?.solution_seen?'status active solution':'status'} onClick={()=>onToggle('solution_seen')}><Eye size={15}/></button>
  </div>
}

const HEAT_START=new Date(2026,8,11); // 11 Sep 2026
const HEAT_END=new Date(2027,8,1);    // 1 Sep 2027
function buildHeatWeeks(activity:Record<string,number>){
  const gridStart=new Date(HEAT_START); gridStart.setDate(gridStart.getDate()-gridStart.getDay());
  const gridEnd=new Date(HEAT_END); gridEnd.setDate(gridEnd.getDate()+(6-gridEnd.getDay()));
  const weeks:{date:Date;key:string;count:number;inRange:boolean}[][]=[];
  let cur=new Date(gridStart);
  while(cur<=gridEnd){
    const week:{date:Date;key:string;count:number;inRange:boolean}[]=[];
    for(let d=0;d<7;d++){
      const key=format(cur,'yyyy-MM-dd');
      week.push({date:new Date(cur),key,count:activity[key]||0,inRange:cur>=HEAT_START&&cur<=HEAT_END});
      cur=new Date(cur); cur.setDate(cur.getDate()+1);
    }
    weeks.push(week);
  }
  return weeks;
}
function Heatmap({activity}:{activity:Record<string,number>}){
  const weeks=useMemo(()=>buildHeatWeeks(activity),[activity]);
  const monthLabels=useMemo(()=>{let lastMonth=-1;return weeks.map(week=>{const first=week.find(d=>d.date.getDate()<=7)||week[0];const m=first.date.getMonth();if(m!==lastMonth){lastMonth=m;return format(first.date,'MMM').toUpperCase();}return '';});},[weeks]);
  const wrapRef=useRef<HTMLDivElement>(null);
  const [tip,setTip]=useState<{x:number;y:number;label:string;pinned:boolean}|null>(null);
  const showTip=(e:React.MouseEvent,d:{date:Date;count:number},pinned:boolean)=>{
    const x=Math.min(Math.max(e.clientX,70),window.innerWidth-70);
    setTip({x, y:e.clientY-14, label:`${format(d.date,'dd MMM yyyy')} • ${d.count} solved`, pinned});
  };
  return <div className="heatmap-wrap" ref={wrapRef}>
    <div className="heatmap-months" style={{gridTemplateColumns:`repeat(${weeks.length},1fr)`}}>{monthLabels.map((m,i)=><span key={i}>{m}</span>)}</div>
    <div className="heatmap-grid-weeks" style={{gridTemplateColumns:`repeat(${weeks.length},1fr)`}}>
      {weeks.map((week,wi)=><div className="heat-col" key={wi}>{week.map(d=><div key={d.key} className={`heat ${d.inRange?`c${Math.min(4,d.count)}`:'out-range'}`}
        title={d.inRange?`${format(d.date,'dd MMM yyyy')} • ${d.count} solved`:undefined}
        onMouseEnter={(e)=>d.inRange&&showTip(e,d,false)}
        onMouseMove={(e)=>d.inRange&&setTip(t=>t&&!t.pinned?{...t,x:Math.min(Math.max(e.clientX,70),window.innerWidth-70),y:e.clientY-14}:t)}
        onMouseLeave={()=>setTip(t=>t&&!t.pinned?null:t)}
        onClick={(e)=>d.inRange&&showTip(e,d,true)}
      /> )}</div>)}
    </div>
    {tip && <div className="heat-tooltip" style={{left:tip.x,top:tip.y}} onClick={()=>setTip(null)}>{tip.label}</div>}
    <div className="legend"><span>Less</span><i className="heat c0"/><i className="heat c1"/><i className="heat c2"/><i className="heat c3"/><i className="heat c4"/><span>More</span></div>
  </div>
}

export default function Home(){
  const supa=supabaseBrowser();
  const [session,setSession]=useState<any>(null);
  const [module,setModule]=useState<Module>('dashboard');
  const [theme,setTheme]=useState<Theme>(themeFromLocal());
  const [themeOpen,setThemeOpen]=useState(false);
  const [filters,setFilters]=useState<Filters>(EMPTY_FILTERS);
  const [placementFilters,setPlacementFilters]=useState<Filters>(EMPTY_FILTERS);
  const [progress,setProgress]=useState<Record<string,ProgressRow>>({});
  const [placementProgress,setPlacementProgress]=useState<Record<string,ProgressRow>>({});
  const [activity,setActivity]=useState<Record<string,number>>({});
  const [placementActivity,setPlacementActivity]=useState<Record<string,number>>({});
  const [notes,setNotes]=useState<Record<string,string>>({});
  const [custom,setCustom]=useState<CustomQuestion[]>([]);
  const [customProgress,setCustomProgress]=useState<Record<string,ProgressRow>>({});
  const [loading,setLoading]=useState(true);
  const [notice,setNotice]=useState('');
  const [selected,setSelected]=useState<{type:'dsa'|'placement'|'custom';id:string}|null>(null);
  const [notesOpen,setNotesOpen]=useState(false);
  const [editorSel,setEditorSel]=useState<{type:'dsa'|'placement';id:string}|null>(null);
  const [addOpen,setAddOpen]=useState(false);
  const [editOpen,setEditOpen]=useState(false);
  const [mobileOpen,setMobileOpen]=useState(false);
  const [displayName,setDisplayName]=useState('Student');
  const [online,setOnline]=useState(true);
  const dsa=dsaQuestions as unknown as DsaQuestion[];
  const placement=placementQuestions as unknown as PlacementQuestion[];

  useEffect(()=>{ document.documentElement.dataset.theme=theme; localStorage.setItem('dph-theme',theme); },[theme]);
  useEffect(()=>{
    if('serviceWorker' in navigator){ navigator.serviceWorker.register('/sw.js').catch(()=>{}); }
    setOnline(navigator.onLine);
    const goOnline=()=>{ setOnline(true); if(session?.user?.id) syncPull(session.user.id); };
    const goOffline=()=>setOnline(false);
    window.addEventListener('online',goOnline); window.addEventListener('offline',goOffline);
    // Cross-device sync: pull the latest server state whenever the tab/app
    // regains focus (e.g. switching from phone back to laptop) and on a
    // background interval while online, so both devices converge without
    // needing a manual refresh.
    const onFocus=()=>{ if(navigator.onLine && session?.user?.id) syncPull(session.user.id); };
    const onVisible=()=>{ if(document.visibilityState==='visible') onFocus(); };
    window.addEventListener('focus',onFocus);
    document.addEventListener('visibilitychange',onVisible);
    const interval=setInterval(()=>{ if(navigator.onLine && session?.user?.id) syncPull(session.user.id); },45000);
    return ()=>{
      window.removeEventListener('online',goOnline); window.removeEventListener('offline',goOffline);
      window.removeEventListener('focus',onFocus); document.removeEventListener('visibilitychange',onVisible);
      clearInterval(interval);
    };
  },[session?.user?.id]);
  useEffect(()=>{
    if(!supa){setLoading(false);return;}
    supa.auth.getSession().then(({data}:any)=>{setSession(data.session); if(data.session){load(data.session.user.id); flushOutbox(data.session.user.id);} else setLoading(false);});
    const {data:listener}=supa.auth.onAuthStateChange((_e:any,s:any)=>{setSession(s); if(s){load(s.user.id); flushOutbox(s.user.id);}});
    return ()=>listener.subscription.unsubscribe();
  },[]);

  // Pull-sync: if we have pending local changes, push them first (flushOutbox
  // already refetches after a successful push); otherwise just pull the
  // latest server state so a change made on another device shows up here.
  async function syncPull(uid:string){
    if(loadOutbox(uid).length>0){ await flushOutbox(uid); } else { await load(uid,{silent:true}); }
  }

  async function flushOutbox(uid:string){
    if(!supa) return;
    const items=loadOutbox(uid);
    if(items.length===0) return;
    const remaining:OutboxItem[]=[];
    let anySynced=false;
    for(const item of items){
      try{
        // Conflict guard: if another device already wrote a NEWER version of
        // this same row while we were offline, drop our stale queued write
        // instead of clobbering it — the upcoming load(uid) will pick up
        // whatever the server currently has. Code writes are timestamped via
        // code_updated_at independently of the row's other progress fields.
        const tsCol = item.row.code!==undefined ? 'code_updated_at' : (item.table.endsWith('_notes') ? 'updated_at' : (item.table.endsWith('_progress') ? 'last_viewed_at' : null));
        if(tsCol && item.row.question_id!==undefined){
          const {data:serverRow}=await supa.from(item.table).select(tsCol).eq('user_id',uid).eq('question_id',item.row.question_id).maybeSingle();
          const serverTs=(serverRow as any)?.[tsCol];
          const localTs=item.row[tsCol];
          if(serverTs && localTs && new Date(serverTs) > new Date(localTs)){ continue; }
        }
        const {error}=await supa.from(item.table).upsert(item.row);
        if(error) remaining.push(item); else anySynced=true;
      }catch{ remaining.push(item); }
    }
    saveOutbox(uid,remaining);
    if(anySynced){ setNotice('Synced offline changes'); setTimeout(()=>setNotice(''),1500); }
    if(anySynced || remaining.length<items.length){ load(uid); }
  }

  async function load(uid:string,opts?:{silent?:boolean}){
    if(!opts?.silent) setLoading(true);
    try{
      const [profile,dprog,pprog,dact,pact,dnotes,pnotes,cq,cp]=await Promise.all([
        supa!.from('profiles').select('*').eq('id',uid).maybeSingle(),
        supa!.from('dsa_progress').select('*').eq('user_id',uid),
        supa!.from('placement_progress').select('*').eq('user_id',uid),
        supa!.from('activity_log').select('*').eq('user_id',uid),
        supa!.from('placement_activity').select('*').eq('user_id',uid),
        supa!.from('dsa_notes').select('*').eq('user_id',uid),
        supa!.from('placement_notes').select('*').eq('user_id',uid),
        supa!.from('custom_questions').select('*').eq('user_id',uid).order('created_at',{ascending:false}),
        supa!.from('custom_question_progress').select('*').eq('user_id',uid)
      ]);
      if(profile.data?.display_name) setDisplayName(profile.data.display_name);
      const nextProgress=Object.fromEntries((dprog.data||[]).map((r:any)=>[String(r.question_id),{question_id:r.question_id,solved:r.solved,hint_used:r.hint_used,solution_seen:r.solution_seen,solved_at:r.solved_at,last_viewed_at:r.last_viewed_at,code:r.code,code_updated_at:r.code_updated_at}] ));
      const nextPlacementProgress=Object.fromEntries((pprog.data||[]).map((r:any)=>[String(r.question_id),{question_id:r.question_id,solved:r.solved,hint_used:r.hint_used,solution_seen:r.solution_seen,solved_at:r.solved_at,last_viewed_at:r.last_viewed_at,code:r.code,code_updated_at:r.code_updated_at}] ));
      const nextActivity=Object.fromEntries((dact.data||[]).map((r:any)=>[r.date,r.dsa_solved_count]));
      const nextPlacementActivity=Object.fromEntries((pact.data||[]).map((r:any)=>[r.date,r.placement_solved_count]));
      const nextNotes=Object.fromEntries([...(dnotes.data||[]).map((r:any)=>[`dsa-${r.question_id}`,r.note_text]),...(pnotes.data||[]).map((r:any)=>[`placement-${r.question_id}`,r.note_text])]);
      const nextCustom=cq.data||[];
      const nextCustomProgress=Object.fromEntries((cp.data||[]).map((r:any)=>[r.question_id,r]));
      setDisplayName(profile.data?.display_name||displayName);
      setProgress(nextProgress); setPlacementProgress(nextPlacementProgress); setActivity(nextActivity); setPlacementActivity(nextPlacementActivity); setNotes(nextNotes); setCustom(nextCustom); setCustomProgress(nextCustomProgress);
      saveCache(uid,{displayName:profile.data?.display_name||displayName,progress:nextProgress,placementProgress:nextPlacementProgress,activity:nextActivity,placementActivity:nextPlacementActivity,notes:nextNotes,custom:nextCustom,customProgress:nextCustomProgress});
    }catch(e){
      // offline or network failure — fall back to last synced local copy so the app stays usable
      const cached=loadCache(uid);
      if(cached){
        setDisplayName(cached.displayName||'Student'); setProgress(cached.progress||{}); setPlacementProgress(cached.placementProgress||{}); setActivity(cached.activity||{}); setPlacementActivity(cached.placementActivity||{}); setNotes(cached.notes||{}); setCustom(cached.custom||[]); setCustomProgress(cached.customProgress||{});
        if(!opts?.silent){ setNotice('Offline — showing your last synced data'); setTimeout(()=>setNotice(''),2000); }
      }
    }
    if(!opts?.silent) setLoading(false);
  }

  async function toggleStatus(type:'dsa'|'placement'|'custom',id:string,key:'solved'|'hint_used'|'solution_seen'){
    if(!session){setNotice('Connect Supabase + login to persist progress.'); return;}
    const source=type==='dsa'?progress:type==='placement'?placementProgress:customProgress;
    const old=source[id]||{question_id:id,solved:false,hint_used:false,solution_seen:false,solved_at:null,last_viewed_at:null};
    const col=key==='solved'?'solved':key;
    const next=!Boolean((old as any)[col]);
    let solved=old.solved,hint_used=old.hint_used,solution_seen=old.solution_seen;
    if(key==='solved'){solved=next;if(next){hint_used=false;solution_seen=false;}}
    if(key==='hint_used'){hint_used=next;if(next)solution_seen=false;}
    if(key==='solution_seen'){solution_seen=next;if(next)hint_used=false;}
    const now=new Date().toISOString();
    const row={user_id:session.user.id,question_id:type==='custom'?id:Number(id),solved,hint_used,solution_seen,solved_at:key==='solved'?(next?now:null):old.solved_at,last_viewed_at:now};
    const table=type==='dsa'?'dsa_progress':type==='placement'?'placement_progress':'custom_question_progress';
    const nextRow:any={question_id:id,solved:row.solved,hint_used:row.hint_used,solution_seen:row.solution_seen,solved_at:row.solved_at,last_viewed_at:row.last_viewed_at};
    if(type==='dsa') setProgress(v=>({...v,[id]:nextRow})); else if(type==='placement') setPlacementProgress(v=>({...v,[id]:nextRow})); else setCustomProgress(v=>({...v,[id]:nextRow}));
    const {error}=await supa!.from(table).upsert(row);
    if(error){
      if(isOfflineError(error)){ queueWrite(session.user.id,table,row); }
      else { setNotice(error.message); return; }
    }
    if(key==='solved') await syncActivity(type, old.solved, next, old.solved_at);
    setNotice(next?'Updated':'Updated'); setTimeout(()=>setNotice(''),1400);
  }
  async function markSolved(type:'dsa'|'placement'|'custom',id:string,code?:string){
    if(!session) return;
    const source=type==='dsa'?progress:type==='placement'?placementProgress:customProgress;
    const old=source[id]||{question_id:id,solved:false,hint_used:false,solution_seen:false,solved_at:null,last_viewed_at:null};
    const now=new Date().toISOString();
    if(old.solved && code===undefined) return;
    const row:any={user_id:session.user.id,question_id:type==='custom'?id:Number(id),solved:true,hint_used:false,solution_seen:false,solved_at:old.solved_at||now,last_viewed_at:now};
    if(code!==undefined && code.trim()!==''){ row.code=code; row.code_updated_at=now; }
    const table=type==='dsa'?'dsa_progress':type==='placement'?'placement_progress':'custom_question_progress';
    const nextRow:any={...old,question_id:id,solved:true,hint_used:false,solution_seen:false,solved_at:row.solved_at,last_viewed_at:now,...(row.code!==undefined?{code:row.code,code_updated_at:row.code_updated_at}:{})};
    if(type==='dsa') setProgress(v=>({...v,[id]:nextRow})); else if(type==='placement') setPlacementProgress(v=>({...v,[id]:nextRow})); else setCustomProgress(v=>({...v,[id]:nextRow}));
    const {error}=await supa!.from(table).upsert(row);
    if(error){ if(isOfflineError(error)) queueWrite(session.user.id,table,row); else setNotice(error.message); }
    if(!old.solved) await syncActivity(type, old.solved, true, old.solved_at);
  }
  async function saveCode(type:'dsa'|'placement',id:string,code:string){
    if(!session || !code || !code.trim()) return;
    const table=type==='dsa'?'dsa_progress':'placement_progress';
    const now=new Date().toISOString();
    const source=type==='dsa'?progress:placementProgress;
    const old=source[id]||{question_id:id,solved:false,hint_used:false,solution_seen:false,solved_at:null,last_viewed_at:null};
    const row:any={user_id:session.user.id,question_id:Number(id),code,code_updated_at:now};
    const nextRow:any={...old,question_id:id,code,code_updated_at:now};
    if(type==='dsa') setProgress(v=>({...v,[id]:nextRow})); else setPlacementProgress(v=>({...v,[id]:nextRow}));
    const {error}=await supa!.from(table).upsert(row);
    if(error){ if(isOfflineError(error)) queueWrite(session.user.id,table,row); }
  }
  async function syncActivity(type:'dsa'|'placement'|'custom',oldSolved:boolean,newSolved:boolean,oldSolvedAt:string|null){
    if(type==='custom' || oldSolved===newSolved) return;
    const table=type==='dsa'?'activity_log':'placement_activity';
    const field=type==='dsa'?'dsa_solved_count':'placement_solved_count';
    const targetDate=newSolved?format(new Date(),'yyyy-MM-dd'):oldSolvedAt?format(new Date(oldSolvedAt),'yyyy-MM-dd'):format(new Date(),'yyyy-MM-dd');
    const current=type==='dsa'?(activity[targetDate]||0):(placementActivity[targetDate]||0);
    const count=Math.max(0,current+(newSolved?1:-1));
    const row={user_id:session.user.id,date:targetDate,[field]:count};
    if(type==='dsa') setActivity(v=>({...v,[targetDate]:count})); else setPlacementActivity(v=>({...v,[targetDate]:count}));
    const {error}=await supa!.from(table).upsert(row);
    if(error){ if(isOfflineError(error)) queueWrite(session.user.id,table,row); else setNotice(error.message); }
  }
  async function saveNote(type:'dsa'|'placement'|'custom',id:string,text:string){
    if(!session){setNotice('Login required for notes.');return;}
    const table=type==='dsa'?'dsa_notes':type==='placement'?'placement_notes':'custom_question_notes';
    const row={user_id:session.user.id,question_id:type==='custom'?id:Number(id),note_text:text,updated_at:new Date().toISOString()};
    setNotes(v=>({...v,[`${type}-${id}`]:text}));
    const {error}=await supa!.from(table).upsert(row);
    if(error){ if(isOfflineError(error)){ queueWrite(session.user.id,table,row); setNotice('Saved locally — will sync when online'); } else setNotice(error.message); }
    else setNotice('Saved');
    setTimeout(()=>setNotice(''),1400);
  }
  async function logout(){await supa?.auth.signOut();setSession(null);}

  const dsaSolved=dsa.filter(q=>progress[String(q.id)]?.solved).length;
  const placementSolved=placement.filter(q=>placementProgress[String(q.id)]?.solved).length;
  const customSolved=custom.filter(q=>customProgress[q.id]?.solved).length;
  const dsaStreak=streak(activity); const pStreak=streak(placementActivity);
  const lastDsa=dsa.filter(q=>progress[String(q.id)]?.solved).sort((a,b)=>(progress[String(b.id)].solved_at||'').localeCompare(progress[String(a.id)].solved_at||''))[0];
  const lastPlacement=placement.filter(q=>placementProgress[String(q.id)]?.solved).sort((a,b)=>(placementProgress[String(b.id)].solved_at||'').localeCompare(placementProgress[String(a.id)].solved_at||''))[0];

  const dsaFiltered=useMemo(()=>filterQuestions(dsa,filters,progress,'dsa'),[filters,progress]);
  const pFiltered=useMemo(()=>filterQuestions(placement,placementFilters,placementProgress,'placement'),[placementFilters,placementProgress]);
  const cFiltered=useMemo(()=>filterCustom(custom,filters,customProgress),[custom,filters,customProgress]);

  const dsaChart=sectionChart(dsa,progress,'section'); const pChart=sectionChart(placement,placementProgress,'topic');
  const combinedActivity:Record<string,number>={};Object.keys({...activity,...placementActivity}).forEach(k=>{combinedActivity[k]=(activity[k]||0)+(placementActivity[k]||0)});

  if(!supa) return <AuthRequired onRefresh={()=>location.reload()}/>;
  if(!session) return <Login supa={supa}/>;
  if(loading) return <div className="loading-screen"><div className="spinner"/>Loading your workspace…</div>;

  function openDetail(type:'dsa'|'placement'|'custom',id:string){setSelected({type,id});}
  const selectedQuestion=selected ? (selected.type==='dsa'?dsa.find(x=>String(x.id)===selected.id):selected.type==='placement'?placement.find(x=>String(x.id)===selected.id):custom.find(x=>x.id===selected.id)) : null;

  return <div className="app-shell">
    <aside className={`sidebar ${mobileOpen?'open':''}`}>
      <div className="brand"><div className="brand-mark"><Sparkles size={17}/></div><div><strong>DSA Progress Hub</strong><small>Placement-ready practice</small></div></div>
      <nav>
        <NavButton active={module==='dashboard'} icon={<Grid2X2 size={18}/>} text="Dashboard" onClick={()=>{setModule('dashboard');setMobileOpen(false)}}/>
        <NavButton active={module==='dsa'} icon={<Target size={18}/>} text="DSA Problems" onClick={()=>{setModule('dsa');setMobileOpen(false)}}/>
        <NavButton active={module==='placement'} icon={<Flame size={18}/>} text="Placement" onClick={()=>{setModule('placement');setMobileOpen(false)}}/>
        <NavButton active={module==='notes'} icon={<NotebookPen size={18}/>} text="Bookmarks / Notes" onClick={()=>{setModule('notes');setMobileOpen(false)}}/>
        <NavButton active={module==='progress'} icon={<Archive size={18}/>} text="Progress" onClick={()=>{setModule('progress');setMobileOpen(false)}}/>
        <NavButton active={module==='my'} icon={<ClipboardList size={18}/>} text="My Questions" onClick={()=>{setModule('my');setMobileOpen(false)}}/>
        <NavButton active={module==='settings'} icon={<Settings size={18}/>} text="Settings" onClick={()=>{setModule('settings');setMobileOpen(false)}}/>
      </nav>
      <div className="sidebar-bottom"><button className="nav-button logout" onClick={logout}><LogOut size={18}/><span>Logout</span></button></div>
    </aside>
    <main className="main">
      <header className="topbar"><button className="mobile-menu" onClick={()=>setMobileOpen(v=>!v)}><Menu size={21}/></button><div className="crumb">{module==='dashboard'?'Overview':module==='dsa'?'DSA Problems':module==='placement'?'Placement Preparation':module==='my'?'My Questions':module==='progress'?'Progress':module==='notes'?'Bookmarks / Notes':'Settings'}</div><div className="topbar-actions">{!online && <span className="offline-badge" title="You're offline — changes are saved locally and will sync automatically"><WifiOff size={13}/> Offline</span>}<span className="user-pill">{session.user.email}</span><div className="theme-menu-wrap"><button className="icon-btn" onClick={()=>setThemeOpen(v=>!v)} title="Appearance"><Palette size={17}/></button>{themeOpen && <ThemeMenu current={theme} onPick={(t)=>{setTheme(t);setThemeOpen(false)}} onClose={()=>setThemeOpen(false)}/>}</div><div className="avatar">{displayName.slice(0,2).toUpperCase()}</div></div></header>
      <div className="content">
        {module==='dashboard' && <Dashboard displayName={displayName} dsaSolved={dsaSolved} placementSolved={placementSolved} dsaStreak={dsaStreak} placementStreak={pStreak} lastDsa={lastDsa} lastPlacement={lastPlacement} dsaChart={dsaChart} pChart={pChart} combinedActivity={combinedActivity} setModule={setModule}/>}        
        {module==='dsa' && <ProblemPage title="DSA Problems" subtitle="355 curated" questions={dsaFiltered} progress={progress} filters={filters} setFilters={setFilters} type="dsa" onToggle={toggleStatus} onNotes={(id:any)=>{setSelected({type:'dsa',id:String(id)});setNotesOpen(true)}} onDetail={(id:any)=>openDetail('dsa',String(id))} onEditor={(id:any)=>setEditorSel({type:'dsa',id:String(id)})}/>} 
        {module==='placement' && <ProblemPage title="Placement Preparation" subtitle="Unthinkable Solutions LLP • Daffodil Software" badge="281 curated questions" questions={pFiltered} progress={placementProgress} filters={placementFilters} setFilters={setPlacementFilters} type="placement" onToggle={toggleStatus} onNotes={(id:any)=>{setSelected({type:'placement',id:String(id)});setNotesOpen(true)}} onDetail={(id:any)=>openDetail('placement',String(id))} onEditor={(id:any)=>setEditorSel({type:'placement',id:String(id)})}/>} 
        {module==='my' && <ProblemPage title="My Questions" subtitle="Practice and track any additional questions you want to add." badge={`${custom.length} total`} questions={cFiltered} progress={customProgress} filters={filters} setFilters={setFilters} type="custom" onToggle={toggleStatus} onNotes={(id:any)=>{setSelected({type:'custom',id:String(id)});setNotesOpen(true)}} onDetail={(id:any)=>openDetail('custom',String(id))} addQuestion={()=>setAddOpen(true)}/>} 
        {module==='notes' && <NotesPage dsa={dsa} placement={placement} custom={custom} progress={progress} placementProgress={placementProgress} customProgress={customProgress} notes={notes} onOpen={(type:any,id:any)=>{setSelected({type,id:String(id)});setNotesOpen(true)}}/>}
        {module==='progress' && <ProgressPage dsa={dsa} placement={placement} progress={progress} placementProgress={placementProgress} activity={activity} placementActivity={placementActivity} />}
        {module==='settings' && <SettingsPage theme={theme} setTheme={setTheme} displayName={displayName}/>}      
      </div>
    </main>
    {notice && <div className="toast"><Zap size={15}/>{notice}</div>}
    {selectedQuestion && !notesOpen && <DetailDrawer selected={selected!} q={selectedQuestion as any} p={selected!.type==='dsa'?progress[selected!.id]:selected!.type==='placement'?placementProgress[selected!.id]:customProgress[selected!.id]} note={notes[`${selected!.type}-${selected!.id}`]||''} onClose={()=>setSelected(null)} onToggle={toggleStatus} onOpenNotes={()=>setNotesOpen(true)} onEdit={selected?.type==='custom'?()=>setEditOpen(true):undefined}/>}    
    {selectedQuestion && notesOpen && <NotesDrawer selected={selected!} q={selectedQuestion as any} initial={notes[`${selected!.type}-${selected!.id}`]||''} onClose={()=>{setNotesOpen(false);setSelected(null)}} onSave={saveNote}/>}
    {editOpen && selected?.type==='custom' && selectedQuestion && <EditQuestion q={selectedQuestion as CustomQuestion} onClose={()=>setEditOpen(false)} onSave={async(values:any)=>{const {data,error}=await supa!.from('custom_questions').update(values).eq('id',selected.id).eq('user_id',session.user.id).select().single();if(error){setNotice(error.message);return;}setCustom(v=>v.map(x=>x.id===selected.id?data:x));setEditOpen(false);setNotice('Question updated');setTimeout(()=>setNotice(''),1400)}} onDelete={async()=>{const {error}=await supa!.from('custom_questions').delete().eq('id',selected.id).eq('user_id',session.user.id);if(error){setNotice(error.message);return;}setCustom(v=>v.filter(x=>x.id!==selected.id));setEditOpen(false);setSelected(null);setNotice('Question deleted');setTimeout(()=>setNotice(''),1400)}}/>}
    {addOpen && <AddQuestion onClose={()=>setAddOpen(false)} onSave={async(q:any)=>{const {data,error}=await supa!.from('custom_questions').insert({...q,user_id:session.user.id}).select().single();if(error){setNotice(error.message);return;}setCustom(v=>[data,...v]);setAddOpen(false);setNotice('Question added');setTimeout(()=>setNotice(''),1500)}}/>}
    {editorSel && (editorSel.type==='dsa'?dsa.find(x=>String(x.id)===editorSel.id):placement.find(x=>String(x.id)===editorSel.id)) && <CodeEditorDrawer q={(editorSel.type==='dsa'?dsa.find(x=>String(x.id)===editorSel.id):placement.find(x=>String(x.id)===editorSel.id)) as any} qType={editorSel.type} p={(editorSel.type==='dsa'?progress:placementProgress)[editorSel.id]} testCases={(editorSel.type==='dsa'?DSA_TESTCASES:PLACEMENT_TESTCASES)[Number(editorSel.id)]||[]} theme={theme} userId={session.user.id} onClose={()=>setEditorSel(null)} onSaveCode={(code:string)=>saveCode(editorSel.type,editorSel.id,code)} onSubmitSolved={async(code:string)=>{ await markSolved(editorSel.type,editorSel.id,code); setEditorSel(null); }}/>}
  </div>
}

function streak(activity:Record<string,number>){
  let day=new Date(); const today=format(day,'yyyy-MM-dd'); const start=(activity[today]||0)>0?day:subDays(day,1); let count=0;
  for(let i=0;i<370;i++){const k=format(subDays(start,i),'yyyy-MM-dd');if((activity[k]||0)>0)count++;else break;} return count;
}
function sectionChart(qs:any[], ps:Record<string,ProgressRow>, key:'section'|'topic'){const map=new Map<string,{name:string,solved:number,remaining:number}>();qs.forEach(q=>{const label=q[key];const item=map.get(label)||{name:label,solved:0,remaining:0};ps[String(q.id)]?.solved?item.solved++:item.remaining++;map.set(label,item)});return [...map.values()];}
function filterQuestions(qs:any[],f:Filters,ps:Record<string,ProgressRow>,type:'dsa'|'placement'){
  return qs.filter(q=>{const p=ps[String(q.id)];if(f.difficulty!=='All'&&q.difficulty!==f.difficulty)return false;const section=(q.section||q.topic);if(f.section!=='All'&&section!==f.section)return false;if(f.pattern!=='All'&&q.pattern!==f.pattern)return false;if(type==='placement'&&f.source!=='All'&&q.source!==f.source)return false;if(type==='placement'&&f.priority&&f.priority!=='All'&&(q.priority||'Unranked')!==f.priority)return false;if(f.status==='Solved'&&!p?.solved)return false;if(f.status==='Unsolved'&&p?.solved)return false;if(f.status==='Hint Used'&&!p?.hint_used)return false;if(f.status==='Solution Seen'&&!p?.solution_seen)return false;if(f.search){const hay=[q.title,q.pattern,q.section,q.topic,q.source].filter(Boolean).join(' ').toLowerCase();if(!hay.includes(f.search.toLowerCase()))return false;}return true;});
}
function filterCustom(qs:CustomQuestion[],f:Filters,ps:Record<string,ProgressRow>){return qs.filter(q=>{const p=ps[q.id];if(f.difficulty!=='All'&&q.difficulty!==f.difficulty)return false;if(f.section!=='All'&&q.topic!==f.section)return false;if(f.pattern!=='All'&&q.pattern!==f.pattern)return false;if(f.status==='Solved'&&!p?.solved)return false;if(f.status==='Unsolved'&&p?.solved)return false;if(f.status==='Hint Used'&&!p?.hint_used)return false;if(f.status==='Solution Seen'&&!p?.solution_seen)return false;const hay=[q.title,q.topic,q.pattern,q.statement,(q.tags||[]).join(' ')].join(' ').toLowerCase();return !f.search||hay.includes(f.search.toLowerCase())});}

function NavButton({active,icon,text,onClick}:{active:boolean;icon:React.ReactNode;text:string;onClick:()=>void}){return <button className={`nav-button ${active?'active':''}`} onClick={onClick}>{icon}<span>{text}</span></button>}
function Dashboard({displayName,dsaSolved,placementSolved,dsaStreak,placementStreak,lastDsa,lastPlacement,dsaChart,pChart,combinedActivity,setModule}:any){return <div className="page-stack">
  <section className="hero"><div><div className="eyebrow">DAILY PROGRESS</div><h1>Welcome back, {displayName}!</h1><p>Track your DSA preparation, placement readiness, and consistency from one workspace.</p></div><div className="hero-date"><span>Today</span><strong>{format(new Date(),'dd MMM yyyy')}</strong></div></section>
  <div className="stats-grid"><StatCard title="DSA Problems Solved" value={`${dsaSolved} / 355`} meta={`${Math.round(dsaSolved/355*100)}% complete`} icon={<Target/>} tone="purple"/><StatCard title="Placement Solved" value={`${placementSolved} / 281`} meta={`${Math.round(placementSolved/281*100)}% complete`} icon={<Flame/>} tone="amber"/><StatCard title="DSA Streak" value={`${dsaStreak} days`} meta="active-day streak" icon={<Zap/>} tone="green"/><StatCard title="Placement Streak" value={`${placementStreak} days`} meta="active-day streak" icon={<Sparkles/>} tone="red"/></div>
  <div className="two-col"><ChartCard title="DSA Problem Overview" subtitle="Solved vs remaining by section" data={dsaChart}/><ChartCard title="Placement Overview" subtitle="Solved vs remaining by topic" data={pChart}/></div>
  <section className="panel"><div className="panel-head"><div><h2>Activity</h2><p>Combined DSA + Placement — 11 Sep 2026 to 1 Sep 2027</p></div><Badge>Less → More</Badge></div><Heatmap activity={combinedActivity}/></section>
  <section className="panel recent"><div className="panel-head"><div><h2>Continue where you left off</h2><p>Latest solved item across both tracks</p></div><button className="ghost" onClick={()=>setModule(lastPlacement?'placement':'dsa')}>Open track <ArrowRight size={15}/></button></div><div className="recent-grid">{lastDsa && <div className="recent-item"><Badge tone="purple">DSA</Badge><strong>Q{lastDsa.id} · {lastDsa.title}</strong><span>{lastDsa.section}</span></div>}{lastPlacement && <div className="recent-item"><Badge tone="amber">Placement</Badge><strong>Q{lastPlacement.id} · {lastPlacement.title}</strong><span>{lastPlacement.topic}</span></div>}{!lastDsa&&!lastPlacement&&<div className="empty">Solve your first question to populate this stream.</div>}</div></section>
</div>}
function StatCard({title,value,meta,icon,tone}:{title:string;value:string;meta:string;icon:React.ReactNode;tone:string}){return <div className={`stat-card tone-${tone}`}><div className="stat-icon">{icon}</div><div><span>{title}</span><strong>{value}</strong><small>{meta}</small></div></div>}
function ChartCard({title,subtitle,data}:any){return <section className="panel chart-panel"><div className="panel-head"><div><h2>{title}</h2><p>{subtitle}</p></div></div><div className="chart"><ResponsiveContainer width="100%" height="100%"><BarChart data={data} margin={{left:-16,right:12,top:8,bottom:30}}><CartesianGrid strokeDasharray="3 3" vertical={false}/><XAxis dataKey="name" angle={-30} textAnchor="end" height={55} tick={{fontSize:10}}/><YAxis tick={{fontSize:10}}/><Tooltip/><Bar dataKey="solved" stackId="a" name="Solved" fill="#1f5c3f" radius={[5,5,0,0]}/><Bar dataKey="remaining" stackId="a" name="Remaining" fill="#ece2c9" radius={[5,5,0,0]}/></BarChart></ResponsiveContainer></div></section>}

function ProblemPage({title,subtitle,badge,questions,progress,filters,setFilters,type,onToggle,onNotes,onDetail,onEditor,addQuestion}:any){const topics=[...new Set(questions.map((q:any)=>q.section||q.topic))] as string[];const patterns=[...new Set(questions.map((q:any)=>q.pattern))] as string[];const sources=(type==='placement'?[...new Set(questions.map((q:any)=>q.source))]:[]) as string[];return <div className="page-stack"><div className="page-title-row"><div><div className="eyebrow">{type==='placement'?'COMPANY TRACK':'PRACTICE TRACK'}</div><h1>{title}</h1><p>{subtitle}</p></div><div className="title-actions">{badge&&<Badge tone="purple">{badge}</Badge>}{addQuestion&&<button className="primary" onClick={addQuestion}><Plus size={17}/> Add Question</button>}</div></div><section className="panel filters"><div className="filter-search"><Search size={17}/><input placeholder="Search title, topic, pattern…" value={filters.search} onChange={e=>setFilters((v:any)=>({...v,search:e.target.value}))}/></div><Select label="Difficulty" value={filters.difficulty} options={['All','Easy','Medium','Hard']} onChange={(v)=>setFilters((x:any)=>({...x,difficulty:v}))}/><Select label={type==='placement'?'Topic':'Section'} value={filters.section} options={['All',...topics]} onChange={(v)=>setFilters((x:any)=>({...x,section:v}))}/><Select label="Pattern" value={filters.pattern} options={['All',...patterns]} onChange={(v)=>setFilters((x:any)=>({...x,pattern:v}))}/>{type==='placement'&&<Select label="Source" value={filters.source} options={['All',...sources]} onChange={(v)=>setFilters((x:any)=>({...x,source:v}))}/>}{type==='placement'&&<Select label="Priority" value={filters.priority} options={['All','TOP PRIORITY','HIGH','MEDIUM','LOW']} onChange={(v)=>setFilters((x:any)=>({...x,priority:v}))}/>}<Select label="Status" value={filters.status} options={['All','Unsolved','Solved','Hint Used','Solution Seen']} onChange={(v)=>setFilters((x:any)=>({...x,status:v}))}/><button className="icon-reset" onClick={()=>setFilters(EMPTY_FILTERS)} title="Reset filters"><RefreshCw size={16}/></button></section><div className="list-meta"><span>{questions.length} results</span><span><Filter size={14}/> filters combine live</span></div><section className="panel question-list">{questions.length===0?<div className="empty">No questions match your filters.</div>:questions.map((q:any)=><QuestionRow key={q.id} q={q} p={progress[String(q.id)]} type={type} onToggle={onToggle} onNotes={onNotes} onDetail={onDetail} onEditor={onEditor}/>)}</section></div>}
function Select({label,value,options,onChange}:{label:string;value:string;options:string[];onChange:(v:string)=>void}){return <label className="select-wrap"><span>{label}</span><select value={value} onChange={e=>onChange(e.target.value)}>{options.map(o=><option key={o}>{o}</option>)}</select><ChevronDown size={14}/></label>}
function QuestionRow({q,p,type,onToggle,onNotes,onDetail,onEditor}:any){const rowClass=`question-row ${(type==='placement'||type==='dsa')?'has-editor':''} ${p?.solved?'solved-row':p?.solution_seen?'solution-seen':p?.hint_used?'hint-seen':''}`;return <div className={rowClass}><StatusButtons p={p} onToggle={(k)=>onToggle(type,String(q.id),k)}/><div className="qid">{type==='custom'?String(q.id).slice(0,8):`Q${q.id}`}</div><div className="qmain"><strong>{q.title}</strong><div className="chips"><Badge tone="muted">{q.section||q.topic}</Badge><Badge>{q.pattern}</Badge>{type==='placement'&&<Badge tone="purple">{q.source}</Badge>}{type==='custom'&&q.source&&<Badge tone="purple">{q.source}</Badge>}</div></div>{type==='placement'?<PriorityBadge priority={q.priority}/>:<span/>}<Badge tone={q.difficulty==='Easy'?'green':q.difficulty==='Medium'?'amber':'red'}>{q.difficulty}</Badge><div className="row-actions"><button className="notes-btn" onClick={()=>onNotes(q.id)}><NotebookPen size={15}/> Notes</button>{(type==='placement'||type==='dsa')&&<button className="notes-btn editor-btn" onClick={()=>onEditor(q.id)}><Code2 size={15}/> Editor</button>}</div><button className="row-arrow" onClick={()=>onDetail(q.id)}><ArrowRight size={16}/></button></div>}

function NotesPage({dsa,placement,custom,progress,placementProgress,customProgress,notes,onOpen}:any){const rows=[...dsa.filter((q:any)=>notes[`dsa-${q.id}`]).map((q:any)=>({type:'dsa',id:q.id,title:q.title,meta:q.section})),...placement.filter((q:any)=>notes[`placement-${q.id}`]).map((q:any)=>({type:'placement',id:q.id,title:q.title,meta:q.topic})),...custom.filter((q:any)=>notes[`custom-${q.id}`]).map((q:any)=>({type:'custom',id:q.id,title:q.title,meta:q.topic}))];return <div className="page-stack"><div className="page-title-row"><div><div className="eyebrow">PRIVATE WORKSPACE</div><h1>Bookmarks / Notes</h1><p>Your saved notes across DSA, Placement and My Questions.</p></div></div><section className="panel notes-list">{rows.length===0?<div className="empty">No saved notes yet. Open any question and start writing.</div>:rows.map(r=><button key={`${r.type}-${r.id}`} className="saved-note" onClick={()=>onOpen(r.type,r.id)}><NotebookPen size={17}/><div><strong>{r.title}</strong><span>{r.meta}</span></div><ArrowRight size={16}/></button>)}</section></div>}
function ProgressPage({dsa,placement,progress,placementProgress,activity,placementActivity}:any){const easy=dsa.filter((q:any)=>q.difficulty==='Easy'&&progress[String(q.id)]?.solved).length;const med=dsa.filter((q:any)=>q.difficulty==='Medium'&&progress[String(q.id)]?.solved).length;const hard=dsa.filter((q:any)=>q.difficulty==='Hard'&&progress[String(q.id)]?.solved).length;const pe=placement.filter((q:any)=>placementProgress[String(q.id)]?.solved).length;return <div className="page-stack"><div className="page-title-row"><div><div className="eyebrow">ANALYTICS</div><h1>Progress</h1><p>Official DSA and Placement metrics stay completely independent.</p></div></div><div className="stats-grid"><StatCard title="DSA solved" value={`${Object.values(progress).filter((p:any)=>p.solved).length} / 355`} meta={`${Math.round(Object.values(progress).filter((p:any)=>p.solved).length/355*100)}%`} icon={<Target/>} tone="purple"/><StatCard title="Easy / Medium / Hard" value={`${easy} / ${med} / ${hard}`} meta="DSA solved by difficulty" icon={<ListFilter/>} tone="green"/><StatCard title="Placement solved" value={`${pe} / 281`} meta={`${Math.round(pe/281*100)}%`} icon={<Flame/>} tone="amber"/><StatCard title="Active days" value={`${Object.values(activity).filter(Boolean).length} / ${Object.values(placementActivity).filter(Boolean).length}`} meta="DSA / Placement" icon={<Zap/>} tone="red"/></div><div className="two-col"><section className="panel"><div className="panel-head"><div><h2>DSA completion by section</h2><p>Real-time from your progress rows.</p></div></div><ProgressBars items={dsa} progress={progress}/></section><section className="panel"><div className="panel-head"><div><h2>Placement completion by topic</h2><p>Real-time from your placement rows.</p></div></div><ProgressBars items={placement} placement progress={placementProgress}/></section></div></div>}
function ProgressBars({items,progress}:any){const groups:any={};items.forEach((q:any)=>{const k=q.section||q.topic;if(!groups[k])groups[k]={total:0,solved:0};groups[k].total++;if(progress[String(q.id)]?.solved)groups[k].solved++;});return <div className="progress-bars">{Object.entries(groups).map(([k,v]:any)=><div className="bar-row" key={k}><div className="bar-label"><span>{k}</span><strong>{v.solved}/{v.total}</strong></div><div className="track"><div className="fill" style={{width:`${v.solved/v.total*100}%`}}/></div></div>)}</div>}
function SettingsPage({theme,setTheme,displayName}:any){return <div className="page-stack"><div className="page-title-row"><div><div className="eyebrow">PREFERENCES</div><h1>Settings</h1><p>Theme and workspace preferences.</p></div></div><section className="panel settings-panel"><div className="setting-row settings-appearance"><div><strong>Appearance</strong><span>Remembered on this device.</span></div></div><ThemeSwatches current={theme} onPick={setTheme}/><div className="setting-row"><div><strong>Display name</strong><span>Shown in your dashboard greeting.</span></div><Badge tone="purple">{displayName}</Badge></div></section></div>}
function WhatToDo({steps}:{steps:string[]}){
  const [open,setOpen]=useState(false);
  if(steps.length===0) return null;
  return <div className="what-to-do">
    <button className="what-to-do-toggle" onClick={()=>setOpen(v=>!v)}><ChevronDown size={15} className={open?'chev open':'chev'}/> What to Do</button>
    {open && <ol className="what-to-do-steps">{steps.map((s,i)=><li key={i}>{s}</li>)}</ol>}
  </div>;
}
function DetailDrawer({selected,q,p,note,onClose,onToggle,onOpenNotes,onEdit}:any){
  const description=selected.type==='dsa'?DSA_DESCRIPTIONS[Number(selected.id)]:selected.type==='placement'?PLACEMENT_DESCRIPTIONS[Number(selected.id)]:null;
  const howSteps=selected.type==='dsa'?parseHowSteps(DSA_HOW[Number(selected.id)]):selected.type==='placement'?parseHowSteps(PLACEMENT_HOW[Number(selected.id)]):[];
  return <div className="overlay"><aside className="drawer"><div className="drawer-head"><div><div className="eyebrow">QUESTION DETAIL</div><h2>{q.title}</h2></div><button className="close" onClick={onClose}><X size={18}/></button></div><div className="drawer-meta">{selected.type==='placement'&&<PriorityBadge priority={q.priority}/>}<Badge tone={q.difficulty==='Easy'?'green':q.difficulty==='Medium'?'amber':'red'}>{q.difficulty}</Badge><Badge>{q.section||q.topic}</Badge><Badge>{q.pattern}</Badge>{q.source&&<Badge tone="purple">{q.source}</Badge>}</div>{description && <div className="statement"><h3>Description</h3><p>{description}</p></div>}<WhatToDo steps={howSteps}/>{selected.type==='custom'&&<div className="statement"><h3>Problem statement</h3><p>{q.statement||'No problem statement added.'}</p>{q.link&&<a href={q.link} target="_blank">Open external link</a>}</div>}<div className="drawer-actions"><StatusButtons p={p} onToggle={(k)=>onToggle(selected.type,selected.id,k)}/><div className="drawer-action-right"><button className="primary" onClick={onOpenNotes}><NotebookPen size={16}/> Open notes</button>{onEdit&&<button className="danger-btn" onClick={onEdit}>Edit</button>}</div></div><div className="timestamp">Last activity: {p?.last_viewed_at?format(new Date(p.last_viewed_at),'dd MMM yyyy, HH:mm'):'Not yet viewed'}</div></aside></div>}
function NotesDrawer({selected,q,initial,onClose,onSave}:any){const [value,setValue]=useState(initial);const [saved,setSaved]=useState(true);useEffect(()=>{if(value===initial)return;setSaved(false);const t=setTimeout(async()=>{await onSave(selected.type,selected.id,value);setSaved(true)},650);return()=>clearTimeout(t)},[value]);return <div className="overlay"><aside className="drawer notes-drawer"><div className="drawer-head"><div><div className="eyebrow">PRIVATE NOTES</div><h2>{q.title}</h2></div><button className="close" onClick={onClose}><X size={18}/></button></div><div className="drawer-meta">{selected.type==='placement'&&<PriorityBadge priority={q.priority}/>}<Badge tone={q.difficulty==='Easy'?'green':q.difficulty==='Medium'?'amber':'red'}>{q.difficulty}</Badge><Badge>{q.section||q.topic}</Badge><Badge>{q.pattern}</Badge>{q.source&&<Badge tone="purple">{q.source}</Badge>}</div><textarea value={value} onChange={e=>setValue(e.target.value)} placeholder="Write your approach, edge cases, hints…"/><div className="save-line">{saved?'Saved':'Saving…'}</div></aside></div>}

// ---------- Placement code editor ----------
const MONACO_THEME_MAP:Record<Theme,{base:'vs'|'vs-dark';name:string;colors:Record<string,string>}> = {
  light:{base:'vs',name:'dph-light',colors:{'editor.background':'#ffffff','editor.foreground':'#1c1f19'}},
  mist:{base:'vs',name:'dph-mist',colors:{'editor.background':'#fbfcfe','editor.foreground':'#1e2531'}},
  sepia:{base:'vs',name:'dph-sepia',colors:{'editor.background':'#fffdf7','editor.foreground':'#26291f'}},
  coffee:{base:'vs-dark',name:'dph-coffee',colors:{'editor.background':'#2e2018','editor.foreground':'#f1e4d0'}},
  dark:{base:'vs-dark',name:'dph-dark',colors:{'editor.background':'#171c17','editor.foreground':'#eef1ea'}},
};
function starterCodeFor(q:any,sampleCase?:TestCase){
  const cat=q.topic||q.section;
  let decl='';
  if(sampleCase){
    const inp=sampleCase.input;
    if(inp && typeof inp==='object' && !Array.isArray(inp)){
      decl=Object.entries(inp).map(([k,v])=>`let ${k} = ${JSON.stringify(v)};`).join('\n');
    } else {
      decl=`let input = ${JSON.stringify(inp)};`;
    }
  }
  return `// ${q.title}\n// ${cat?`Topic: ${cat} · `:''}Pattern: ${q.pattern}\n\n${decl}\n\n// Write your code here — use console.log() to print your answer\n\n`;
}
function hintsFor(q:any){
  return [
    `Think about the "${q.pattern}" approach — what does it usually track or compare as it moves through the input?`,
    `Break it down: identify what you read on each step, what you update (a running value, a map, a pointer), and when you stop.`,
    `Trace "${q.title}" by hand on a tiny example first, then translate each hand-step into one line of code — start with the simplest case.`,
  ];
}
function outputMatchesExpected(logs:string[],expected:any):boolean{
  if(expected===undefined||expected===null) return false;
  const text=logs.join('\n');
  if(typeof expected==='object' && !Array.isArray(expected)){
    return Object.values(expected).every(v=>text.includes(typeof v==='object'?JSON.stringify(v):String(v)));
  }
  const asStr=Array.isArray(expected)?JSON.stringify(expected):String(expected);
  return text.includes(asStr);
}
const WORKER_PREAMBLE_LINES=4;
function extractErrorLine(stack:string|undefined):number|null{
  if(!stack) return null;
  const firstFrame=stack.split('\n')[1]||stack.split('\n')[0]||'';
  const matches=[...firstFrame.matchAll(/:(\d+):(\d+)/g)];
  if(matches.length===0) return null;
  const raw=parseInt(matches[matches.length-1][1],10);
  const line=raw-WORKER_PREAMBLE_LINES;
  return line>0?line:null;
}
function runInWorker(code:string,timeoutMs=3000):Promise<{ok:boolean;logs:string[];error?:string;line?:number|null}>{
  return new Promise((resolve)=>{
    let done=false;
    // NOTE: exactly WORKER_PREAMBLE_LINES lines before user code — keep in sync with extractErrorLine offset
    const wrapped=`self.fetch=undefined;self.importScripts=undefined;self.XMLHttpRequest=undefined;
const __logs=[];
self.console={log:(...a)=>__logs.push(a.map(x=>{try{return typeof x==='object'?JSON.stringify(x):String(x)}catch(e){return String(x)}}).join(' ')),error:(...a)=>__logs.push('ERR: '+a.map(String).join(' ')),warn:(...a)=>__logs.push('WARN: '+a.map(String).join(' '))};
try{
${code}
self.postMessage({ok:true,logs:__logs});
}catch(e){ self.postMessage({ok:false,logs:__logs,error:(e&&e.message)||String(e),stack:(e&&e.stack)||''}); }`;
    let worker:Worker; let url:string;
    try{ const blob=new Blob([wrapped],{type:'application/javascript'}); url=URL.createObjectURL(blob); worker=new Worker(url); }
    catch(e:any){ resolve({ok:false,logs:[],error:'Could not start execution sandbox: '+(e?.message||e)}); return; }
    const finish=(res:any)=>{ if(done)return; done=true; clearTimeout(timer); try{worker.terminate()}catch{}; try{URL.revokeObjectURL(url)}catch{}; resolve({...res,line:res.stack?extractErrorLine(res.stack):null}); };
    const timer=setTimeout(()=>finish({ok:false,logs:[],error:'Execution timed out (possible infinite loop).'}),timeoutMs);
    worker.onmessage=(e)=>finish(e.data);
    worker.onerror=(e)=>finish({ok:false,logs:[],error:e.message,stack:e.filename?`:${e.lineno}:${e.colno}`:''});
  });
}
function CodeEditorDrawer({q,qType,p,testCases,theme,userId,onClose,onSaveCode,onSubmitSolved}:{q:any;qType:'dsa'|'placement';p?:ProgressRow;testCases:TestCase[];theme:Theme;userId:string;onClose:()=>void;onSaveCode:(code:string)=>void;onSubmitSolved:(code:string)=>void}){
  const storageKey=`${qType}_editor_${userId}_${q.id}`;
  const examples=testCases.slice(0,3);
  const sampleCase=testCases[0];
  const description=qType==='dsa'?DSA_DESCRIPTIONS[Number(q.id)]:PLACEMENT_DESCRIPTIONS[Number(q.id)];
  const howSteps=useMemo(()=>parseHowSteps(qType==='dsa'?DSA_HOW[Number(q.id)]:PLACEMENT_HOW[Number(q.id)]),[qType,q.id]);
  const [code,setCode]=useState<string>('');
  const [loaded,setLoaded]=useState(false);
  const [output,setOutput]=useState<{ok:boolean;logs:string[];error?:string;line?:number|null}|null>(null);
  const [lastRunCode,setLastRunCode]=useState<string|null>(null);
  const [running,setRunning]=useState(false);
  const [saveState,setSaveState]=useState<'saved'|'saving'>('saved');
  const [hintIndex,setHintIndex]=useState(0);
  const [confirmReset,setConfirmReset]=useState(false);
  const hints=useMemo(()=>hintsFor(q),[q]);
  const editorRef=useRef<any>(null);
  const skipNextSaveRef=useRef(true);
  // Resolve the correct starting code ONCE per question: compare the last
  // Supabase-synced code (p.code / p.code_updated_at, from any device) against
  // this browser's own unsynced local draft, and use whichever is newer.
  // Never falls back to the starter template while either a server or local
  // saved value exists — avoids the "saved code disappears" class of bugs.
  useEffect(()=>{
    let draft:{code:string;updatedAt:string}|null=null;
    try{ const raw=localStorage.getItem(storageKey); draft=raw?JSON.parse(raw):null; }catch{ draft=null; }
    const serverCode=p?.code||null; const serverTs=p?.code_updated_at||null;
    let initial:string;
    if(serverCode && draft?.code){
      initial=(serverTs && draft.updatedAt && new Date(serverTs)>new Date(draft.updatedAt))?serverCode:draft.code;
    } else if(serverCode){ initial=serverCode; }
    else if(draft?.code){ initial=draft.code; }
    else { initial=starterCodeFor(q,sampleCase); }
    skipNextSaveRef.current=true;
    setCode(initial);
    setOutput(null); setLastRunCode(null); setHintIndex(0);
    setLoaded(true);
  },[storageKey]);
  useEffect(()=>{
    if(!loaded) return;
    if(skipNextSaveRef.current){ skipNextSaveRef.current=false; return; }
    setSaveState('saving');
    const t=setTimeout(()=>{
      const now=new Date().toISOString();
      try{ localStorage.setItem(storageKey,JSON.stringify({code,updatedAt:now})); }catch{}
      if(code.trim()) onSaveCode(code);
      setSaveState('saved');
    },700);
    return ()=>clearTimeout(t);
  },[code,loaded,storageKey]);
  const run=async()=>{
    setRunning(true); setOutput(null);
    const res=await runInWorker(code);
    setOutput(res); setLastRunCode(code); setRunning(false);
  };
  const doReset=()=>{
    const starter=starterCodeFor(q,sampleCase);
    skipNextSaveRef.current=true;
    setCode(starter); setOutput(null); setLastRunCode(null); setConfirmReset(false);
    try{ localStorage.setItem(storageKey,JSON.stringify({code:starter,updatedAt:new Date().toISOString()})); }catch{}
  };
  const beforeMount=(monaco:any)=>{ Object.values(MONACO_THEME_MAP).forEach(t=>monaco.editor.defineTheme(t.name,{base:t.base,inherit:true,rules:[],colors:t.colors})); monaco.languages.typescript.javascriptDefaults.setDiagnosticsOptions({noSemanticValidation:false,noSyntaxValidation:false}); };
  const monacoThemeName=MONACO_THEME_MAP[theme]?.name||'dph-sepia';
  const matched=output?.ok && sampleCase && code===lastRunCode ? outputMatchesExpected(output.logs,sampleCase.expected) : false;
  return <div className="overlay editor-overlay"><div className="editor-modal">
    <button className="close editor-modal-close" onClick={onClose}><X size={18}/></button>
    <div className="editor-left">
      <div className="eyebrow">Q{q.id} · {q.difficulty?.toUpperCase()}</div>
      <h2>{q.title}</h2>
      <div className="chips editor-left-chips">{qType==='placement'&&<PriorityBadge priority={q.priority}/>}<Badge>{q.topic||q.section}</Badge><Badge>{q.pattern}</Badge>{q.source&&<Badge tone="purple">{q.source}</Badge>}</div>
      {description && <p className="editor-description">{description}</p>}
      <WhatToDo steps={howSteps}/>
      {examples.length===0 && <div className="info-box"><span className="ghost">No sample examples available for this question yet.</span></div>}
      {examples.map((ex,i)=><div className="info-box example-box" key={i}>
        <div className="info-label">EXAMPLE {i+1}</div>
        <div className="example-line"><strong>Input:</strong> <code>{JSON.stringify(ex.input)}</code></div>
        <div className="example-line"><strong>Output:</strong> <code>{JSON.stringify(ex.expected)}</code></div>
      </div>)}
      <div className="info-box hint-preview-box"><div className="info-label"><Lightbulb size={13}/> HINT AVAILABLE</div><p>{hints[0]}</p></div>
    </div>
    <div className="editor-right">
      <div className="editor-tabs-row">
        <span className="editor-lang">JavaScript</span>
        <button className="primary" disabled={running} onClick={run}><Play size={15}/> {running?'Running…':'Run Code'}</button>
      </div>
      <div className="editor-shell">
        <MonacoEditor
          height="100%"
          language="javascript"
          theme={monacoThemeName}
          value={code}
          beforeMount={beforeMount}
          onMount={(editor:any)=>{ editorRef.current=editor; editor.addCommand(2048|3,()=>run()); }}
          onChange={(v:string|undefined)=>setCode(v||'')}
          options={{minimap:{enabled:false},fontSize:13,tabSize:2,automaticLayout:true,scrollBeyondLastLine:false,wordWrap:'on'}}
        />
      </div>
      <div className="editor-io-panel">
        <div className="editor-io-label">OUTPUT {matched && <span className="match-tick"><Check size={13}/> Matches expected output</span>}</div>
        <div className="editor-io-box editor-output">
          {!output && <span className="ghost">Run your code to see output here.</span>}
          {output && output.ok && <><div className={`output-status ${matched?'ok':''}`}>{matched?<><Check size={13}/> Code executed successfully</>:'Code executed'}</div>{output.logs.length===0?<div className="ghost">(no console output — use console.log to print your answer)</div>:output.logs.map((l,i)=><div key={i}>{l}</div>)}</>}
          {output && !output.ok && <><div className="output-status err">⚠ {output.error}{output.line?` (around line ${output.line} in your code)`:''}</div>{output.logs.map((l,i)=><div key={i}>{l}</div>)}</>}
        </div>
      </div>
      <div className="smart-hint-panel"><div className="info-label"><Lightbulb size={13}/> SMART HINT</div><p>{hintIndex===0?'Click "Show next hint" below for a progressive hint — it won\'t give away the full solution.':hints[hintIndex-1]}</p></div>
      <div className="editor-hint-row">
        <span className="save-line">{saveState==='saving'?'Saving…':'Saved ✓'}</span>
        <div className="editor-hint-actions">
          {hintIndex<hints.length && <button className="notes-btn" onClick={()=>setHintIndex(v=>v+1)}><Lightbulb size={14}/> Show next hint ({hintIndex}/{hints.length})</button>}
          {!confirmReset && <button className="notes-btn" onClick={()=>setConfirmReset(true)}><RotateCcw size={14}/> Reset Code</button>}
          {confirmReset && <span className="reset-confirm">Reset your code? <button className="notes-btn" onClick={()=>setConfirmReset(false)}>Cancel</button><button className="danger-btn" onClick={doReset}>Reset</button></span>}
          <button className="primary submit-btn" disabled={!matched} title={matched?'Mark this question solved':'Run your code and match the expected output first'} onClick={()=>onSubmitSolved(code)}><Check size={15}/> Submit</button>
        </div>
      </div>
    </div>
  </div></div>;
}

function AddQuestion({onClose,onSave}:any){const [f,setF]=useState({title:'',difficulty:'Medium',topic:'',pattern:'',statement:'',source:'',link:'',tags:''});return <div className="overlay"><aside className="drawer add-drawer"><div className="drawer-head"><div><div className="eyebrow">CUSTOM PRACTICE</div><h2>Add question</h2></div><button className="close" onClick={onClose}><X size={18}/></button></div><div className="form-grid"><label>Question title<input value={f.title} onChange={e=>setF({...f,title:e.target.value})}/></label><label>Difficulty<select value={f.difficulty} onChange={e=>setF({...f,difficulty:e.target.value})}><option>Easy</option><option>Medium</option><option>Hard</option></select></label><label>Topic / Section<input value={f.topic} onChange={e=>setF({...f,topic:e.target.value})}/></label><label>Pattern<input value={f.pattern} onChange={e=>setF({...f,pattern:e.target.value})}/></label><label className="full">Problem statement<textarea value={f.statement} onChange={e=>setF({...f,statement:e.target.value})}/></label><label>Source<input value={f.source} onChange={e=>setF({...f,source:e.target.value})}/></label><label>Link<input value={f.link} onChange={e=>setF({...f,link:e.target.value})}/></label><label className="full">Tags<input value={f.tags} onChange={e=>setF({...f,tags:e.target.value})}/></label></div><button className="primary wide" disabled={!f.title.trim()} onClick={()=>onSave({title:f.title,difficulty:f.difficulty,topic:f.topic,pattern:f.pattern,statement:f.statement,source:f.source||null,link:f.link||null,tags:f.tags.split(',').map((x:string)=>x.trim()).filter(Boolean)})}><Plus size={17}/> Save Question</button></aside></div>}
function EditQuestion({q,onClose,onSave,onDelete}:any){const [f,setF]=useState({title:q.title,difficulty:q.difficulty,topic:q.topic,pattern:q.pattern,statement:q.statement||'',source:q.source||'',link:q.link||'',tags:(q.tags||[]).join(', ')});return <div className="overlay"><aside className="drawer add-drawer"><div className="drawer-head"><div><div className="eyebrow">CUSTOM PRACTICE</div><h2>Edit question</h2></div><button className="close" onClick={onClose}><X size={18}/></button></div><div className="form-grid"><label>Question title<input value={f.title} onChange={e=>setF({...f,title:e.target.value})}/></label><label>Difficulty<select value={f.difficulty} onChange={e=>setF({...f,difficulty:e.target.value})}><option>Easy</option><option>Medium</option><option>Hard</option></select></label><label>Topic / Section<input value={f.topic} onChange={e=>setF({...f,topic:e.target.value})}/></label><label>Pattern<input value={f.pattern} onChange={e=>setF({...f,pattern:e.target.value})}/></label><label className="full">Problem statement<textarea value={f.statement} onChange={e=>setF({...f,statement:e.target.value})}/></label><label>Source<input value={f.source} onChange={e=>setF({...f,source:e.target.value})}/></label><label>Link<input value={f.link} onChange={e=>setF({...f,link:e.target.value})}/></label><label className="full">Tags<input value={f.tags} onChange={e=>setF({...f,tags:e.target.value})}/></label></div><div className="edit-footer"><button className="danger-btn" onClick={onDelete}>Delete</button><button className="primary" disabled={!f.title.trim()} onClick={()=>onSave({title:f.title,difficulty:f.difficulty,topic:f.topic,pattern:f.pattern,statement:f.statement,source:f.source||null,link:f.link||null,tags:f.tags.split(',').map((x:string)=>x.trim()).filter(Boolean),updated_at:new Date().toISOString()})}>Save changes</button></div></aside></div>}

function Login({supa}:any){const [mode,setMode]=useState<'login'|'register'|'reset'>('login');const [email,setEmail]=useState('');const [password,setPassword]=useState('');const [name,setName]=useState('');const [msg,setMsg]=useState('');const submit=async()=>{setMsg('');let r:any;if(mode==='register')r=await supa.auth.signUp({email,password,options:{data:{display_name:name||'Student'}}});else if(mode==='reset')r=await supa.auth.resetPasswordForEmail(email,{redirectTo:`${location.origin}/update-password`});else r=await supa.auth.signInWithPassword({email,password});setMsg(r.error?.message|| (mode==='reset'?'Reset email sent. Check your inbox.':mode==='register'?'Account created — check email verification if enabled.':''));};return <div className="auth-screen"><div className="auth-card"><div className="brand auth-brand"><div className="brand-mark"><Sparkles size={17}/></div><div><strong>DSA Progress Hub</strong><small>DSA + Placement workspace</small></div></div><div className="auth-tabs"><button className={mode==='login'?'on':''} onClick={()=>setMode('login')}>Login</button><button className={mode==='register'?'on':''} onClick={()=>setMode('register')}>Register</button><button className={mode==='reset'?'on':''} onClick={()=>setMode('reset')}>Reset</button></div>{mode==='register'&&<input placeholder="Display name" value={name} onChange={e=>setName(e.target.value)}/>}<input type="email" placeholder="Email" value={email} onChange={e=>setEmail(e.target.value)}/>{mode!=='reset'&&<input type="password" placeholder="Password" value={password} onChange={e=>setPassword(e.target.value)}/>}<button className="primary wide" onClick={submit}>{mode==='login'?'Login':mode==='register'?'Create account':'Send reset email'}</button>{msg&&<p className="auth-msg">{msg}</p>}<p className="auth-foot">Your official DSA (355) and Placement (281) progress are stored separately.</p></div></div>}
function AuthRequired({onRefresh}:{onRefresh:()=>void}){return <div className="auth-screen"><div className="auth-card"><div className="brand auth-brand"><div className="brand-mark"><Sparkles size={17}/></div><div><strong>DSA Progress Hub</strong><small>Supabase connection required</small></div></div><h2>Connect your database</h2><p>Add <code>NEXT_PUBLIC_SUPABASE_URL</code> and <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code> from your Supabase project, then reload.</p><button className="primary wide" onClick={onRefresh}><RefreshCw size={17}/> Reload</button></div></div>}
