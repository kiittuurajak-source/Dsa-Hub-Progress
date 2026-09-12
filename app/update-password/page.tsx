'use client';
import { useState } from 'react';
import { Sparkles } from 'lucide-react';
import { supabaseBrowser } from '@/lib/supabase';
export default function UpdatePassword(){const supa=supabaseBrowser();const [p,setP]=useState('');const [msg,setMsg]=useState('');const save=async()=>{if(!supa)return;const {error}=await supa.auth.updateUser({password:p});setMsg(error?.message||'Password updated. You can return to the dashboard.');};return <div className="auth-screen"><div className="auth-card"><div className="brand auth-brand"><div className="brand-mark"><Sparkles size={17}/></div><div><strong>DSA Progress Hub</strong><small>Set a new password</small></div></div><h2>Reset password</h2><p>Choose a new password for your account.</p><input type="password" placeholder="New password" value={p} onChange={e=>setP(e.target.value)}/><button className="primary wide" disabled={!p} onClick={save}>Update password</button>{msg&&<p className="auth-msg">{msg}</p>}</div></div>}
