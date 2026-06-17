import { useState, useEffect, useRef, useMemo, useCallback } from "react";

// ─────────────────────────────────────────────────────────────────────────────
// SUPABASE CONFIG
// ─────────────────────────────────────────────────────────────────────────────
const SB_URL  = "https://xljglqiifogyxefhszwa.supabase.co";
const SB_ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhsamdscWlpZm9neXhlZmhzendhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEwMTY2MTQsImV4cCI6MjA5NjU5MjYxNH0.asql85bUrgL5JuzqYoU0ZtizIWJ1yU6NYTt3yMUW5us";

// ─────────────────────────────────────────────────────────────────────────────
// SESSION — persist JWT across page reloads
// ─────────────────────────────────────────────────────────────────────────────
const SK         = "bm_wp_v2";
const saveSession  = d  => { try { localStorage.setItem(SK, JSON.stringify(d)); } catch {} };
const loadSession  = () => { try { return JSON.parse(localStorage.getItem(SK) || "null"); } catch { return null; } };
const clearSession = () => { try { localStorage.removeItem(SK); } catch {} };
const getToken     = () => loadSession()?.token ?? SB_ANON;

// ─────────────────────────────────────────────────────────────────────────────
// SUPABASE HELPERS — all use live session token
// ─────────────────────────────────────────────────────────────────────────────
const H = (x = {}) => ({ "Content-Type":"application/json", "apikey":SB_ANON, "Authorization":`Bearer ${getToken()}`, ...x });

async function sbGet(t, f = "") {
  const r = await fetch(`${SB_URL}/rest/v1/${t}?${f}`, { headers: H() });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}
async function sbPatch(t, f, d) {
  const r = await fetch(`${SB_URL}/rest/v1/${t}?${f}`, { method:"PATCH", headers:H({"Prefer":"return=minimal"}), body:JSON.stringify(d) });
  if (!r.ok) throw new Error(await r.text());
}
async function sbPost(t, d) {
  const r = await fetch(`${SB_URL}/rest/v1/${t}`, { method:"POST", headers:H({"Prefer":"return=minimal"}), body:JSON.stringify(d) });
  if (!r.ok) throw new Error(await r.text());
}
async function sbUpsert(t, d) {
  const r = await fetch(`${SB_URL}/rest/v1/${t}`, { method:"POST", headers:H({"Prefer":"resolution=merge-duplicates"}), body:JSON.stringify(d) });
  if (!r.ok) throw new Error(await r.text());
}

// Auth calls always use the anon key, never the user token
async function sbSignUp(email, password) {
  const r = await fetch(`${SB_URL}/auth/v1/signup`, {
    method:"POST", headers:{"Content-Type":"application/json","apikey":SB_ANON},
    body:JSON.stringify({email, password}),
  });
  const d = await r.json();
  if (d.error) throw new Error(d.error.message || d.error);
  return d;
}
async function sbSignIn(email, password) {
  const r = await fetch(`${SB_URL}/auth/v1/token?grant_type=password`, {
    method:"POST", headers:{"Content-Type":"application/json","apikey":SB_ANON},
    body:JSON.stringify({email, password}),
  });
  const d = await r.json();
  if (d.error) throw new Error(d.error.message || d.error);
  saveSession({ token:d.access_token, refreshToken:d.refresh_token, userId:d.user?.id, email, at:Date.now() });
  return d;
}
async function sbRefreshSession() {
  const s = loadSession();
  if (!s?.refreshToken) throw new Error("No session to refresh");
  const r = await fetch(`${SB_URL}/auth/v1/token?grant_type=refresh_token`, {
    method:"POST", headers:{"Content-Type":"application/json","apikey":SB_ANON},
    body:JSON.stringify({ refresh_token: s.refreshToken }),
  });
  const d = await r.json();
  if (d.error) throw new Error(d.error.message || d.error);
  saveSession({ ...s, token:d.access_token, refreshToken:d.refresh_token, at:Date.now() });
  return d;
}
async function sbResetPassword(email) {
  const r = await fetch(`${SB_URL}/auth/v1/recover`, {
    method:"POST", headers:{"Content-Type":"application/json","apikey":SB_ANON},
    body:JSON.stringify({ email }),
  });
  const d = await r.json();
  if (d?.error?.message) throw new Error(d.error.message);
}
async function uploadCertPhoto(file, workerId, certKey) {
  const ext  = file.name.split(".").pop();
  const path = `${workerId}/${certKey}.${ext}`;
  const r = await fetch(`${SB_URL}/storage/v1/object/cert-photos/${path}`, {
    method:"POST",
    headers:{ "apikey":SB_ANON, "Authorization":`Bearer ${getToken()}`, "Content-Type":file.type, "x-upsert":"true" },
    body: file,
  });
  if (!r.ok) throw new Error(await r.text());
  return `${SB_URL}/storage/v1/object/public/cert-photos/${path}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────────────────────
const BASE_DAYS    = ["Mon","Tue","Wed","Thu","Fri"];
const WEEKEND_DAYS = ["Sat","Sun"];
const ALL_DAYS     = [...BASE_DAYS, ...WEEKEND_DAYS];
const DEFAULT_HOURS = 9;
const POSITIONS = ["Welder","Fixer","Fitter","Semiskilled","Supervisor","Labourer","Manager","Driver"];
const COMPANIES = ["Bright Metalwork","Dodi Metalwork","External"];

const CERTS = [
  {key:"cscs",label:"CSCS Card",hasExpiry:true},
  {key:"nvq2",label:"NVQ 2 Fenestration",hasExpiry:false},
  {key:"nvq3",label:"NVQ 3 Supervisor",hasExpiry:false},
  {key:"nvq4",label:"Level 4 NVQ",hasExpiry:false},
  {key:"schuco",label:"Schuco Skills Card",hasExpiry:true},
  {key:"healthSafety",label:"Health & Safety",hasExpiry:true},
  {key:"harness",label:"Harness & Leading Edge",hasExpiry:true},
  {key:"manualHandling",label:"Manual Handling",hasExpiry:true},
  {key:"ipaf3",label:"IPAF 3a/3b",hasExpiry:true},
  {key:"ipaf1b",label:"IPAF 1b",hasExpiry:true},
  {key:"ipafMast",label:"IPAF Mast Climber",hasExpiry:true},
  {key:"pasma",label:"PASMA",hasExpiry:true},
  {key:"abrasiveWheel",label:"Abrasive Wheel",hasExpiry:true},
  {key:"trafficMarshal",label:"Traffic Marshal",hasExpiry:true},
  {key:"firstAid",label:"First Aid",hasExpiry:true},
  {key:"fireSafety",label:"Fire Safety Marshall",hasExpiry:true},
  {key:"faceFit",label:"Face Fit Testing",hasExpiry:true},
  {key:"iosh",label:"IOSH Managing Safely",hasExpiry:false},
  {key:"smsts",label:"SMSTS Certificate",hasExpiry:true},
  {key:"sssts",label:"SSSTS Certificate",hasExpiry:true},
  {key:"asbestos",label:"Asbestos Awareness",hasExpiry:true},
  {key:"spiderCrane",label:"Spider Crane",hasExpiry:true},
  {key:"vacuumLifter",label:"Vacuum Lifter",hasExpiry:true},
];

// ─────────────────────────────────────────────────────────────────────────────
// TERMS & CONDITIONS
// ─────────────────────────────────────────────────────────────────────────────
const TERMS_SECTIONS = [
  {title:"NEW STARTER AGREEMENT",content:`Labour engagement agreement between Bright Metalwork Ltd (The Contractor) and the individual worker. By accepting these terms, you confirm you have read and understood the information provided including the Privacy Notice (BM-DOC-001), Company Policies (BM-POL-001 to BM-POL-030), Employment Terms and Conditions (BM-DOC-002), and Company Induction (BM-DOC-003).`},
  {title:"1. TERMS AND CONDITIONS OF ENGAGEMENT",content:`In the case of a Sub-Contractor, he/she acknowledges entering into a contract for services with the Contractor and acknowledges this agreement shall not constitute a contract of employment. The declared intention of both parties is that the relationship will be one of self-employment. The Contractor shall be entitled to terminate this agreement forthwith and without notice.\n\nThe individual is under no obligation to accept an offer of an assignment, but if he/she does so, he/she shall at all times comply with the following conditions:\n• Not to engage in any conduct detrimental to the interests of the Contractor.\n• To be present during the times or for the total number of hours agreed.\n• To take all reasonable steps to safeguard his/her own health, safety & welfare.\n• To comply with any disciplinary rules or obligations in force at the premises.\n• To comply with all reasonable instructions and requests within the scope of the agreed service.\n• To comply with the Contractor's policies and procedures at all times.\n\nThe Contractor shall be responsible for making all statutory deductions relating to National Insurance, Income Tax and any employee pension contribution. The individual must present a current CSCS/CPCS competence card on their first day of work.`},
  {title:"2. WORKING TIME OPT-OUT",content:`The individual agrees with Bright Metalwork Ltd that the limit in regulation 4(1) of the Working Time Regulations 1998 shall not apply, and that the average working time may therefore exceed 48 hours for each 7-day period. This agreement shall apply from the commencement date. This agreement can be terminated by providing a minimum of 1 week's notice in writing.\n\nAll employees are required by law to provide suitable identification documents to enable the Company to make appropriate checks to ensure their authenticity and entitlement to work in the UK. Only original documents shall be accepted.`},
  {title:"3. CLOTHING AND PPE",content:`The Contractor will issue free of charge: 1x PAD Contractors Hard Hat, 1x PAD Contractors High Visibility Vest. Other PPE will be issued as required based on risk assessment.\n\nIndividual workers agree not to utilise PAD branded PPE on any project other than that for which they are contractually engaged.\n\nMinimum PPE must be worn at all times on site: Hard Hat, High Visibility Vest, and Safety Boots conforming to BSEN345 or EN ISO 20345 classification S3.\n\nMinimum dress code: T-Shirt and Trousers. No shorts, cut down/rolled up trousers, sleeveless tops or bare chests. Jewellery is not advised. Loose clothing, hoodies and scarves are not permitted.`},
  {title:"4. SAFETY & WELFARE RULES",content:`• You are responsible for your own health & safety and the health & safety of others who may be affected by your acts or omissions whilst at work.\n• Do not take unacceptable risks or work in an unsafe manner. Report any unforeseen risk or hazardous condition to your supervisor.\n• Never carry out any task that you are not competent to complete safely.\n• Only use equipment for its intended purposes. Never cut corners or modify work equipment.\n• Never attempt to manually lift anything that is too heavy or awkward.\n• Do not block access/egress. Keep them clean and safe.\n• Always stack/store items safely.\n• Never go beyond a guardrail/edge protection without instruction from your supervisor.\n• Ladders are for use only where all other methods of working at height have been considered impractical.\n• Only smoke and eat in designated areas at designated break periods.\n• If sick/absent, you must inform your supervisor on the day of absence.\n• Mobile phones can only be used in designated welfare/canteen/office facilities.\n• All accidents and near miss events are to be reported to the line supervisor.`},
  {title:"5. DISCIPLINARY PROCEDURES",content:`Bright Metalwork carries out fair disciplinary procedures in accordance with statutory and employment laws. The following constitute Gross Misconduct and may result in immediate and permanent dismissal:\n\n• Theft from the company, its employees, agents, clients, staff or premises.\n• Forgery or falsification of company documents.\n• Fighting, threatening or hitting employees, client's staff or visiting persons.\n• Refusal to carry out reasonable instructions from a supervisor or senior manager.\n• Being under the influence of alcohol or drugs while on duty or on company/client premises.\n• Unauthorised possession of or wilful damage to company property.\n• Flagrant disregard to safety, health, environmental precautions or procedures.\n• Actions constituting a criminal offence.\n• Deliberate disregard of previous warnings given as part of the disciplinary procedure.\n• Unauthorised removal of property belonging to the company, clients or their agents.\n• Acting in a manner that results in commercial loss for the company, including working directly for a client of Bright Metalwork within two weeks of termination of this agreement.`},
  {title:"6. CUSTOMERS & CLIENTS",content:`All staff coming into contact with customers are ambassadors of Bright Metalwork and are expected to be polite and courteous. The employee should never argue with a customer — complaints must be referred to the supervisor/site management. Breaches of this rule may result in unilateral termination of this agreement without notice.\n\nFoul or obscene language will not be tolerated and will be classed as gross misconduct, leading to immediate termination.\n\nAll staff must attend site induction and adhere to local site rules at all times.`},
  {title:"7. WORKER DECLARATION",content:`By signing below, I confirm that:\n\n• I have read and understood the terms of this Agreement outlined in this pack and agree they accurately reflect the terms under which I provide the Services.\n• I agree that the limit in regulation 4(1) of the Working Time Regulations 1998 shall not apply to me.\n• I confirm that I do not suffer from any medical or other condition that will prevent me from carrying out the services in accordance with this Agreement.\n• I confirm that I am suitably competent in terms of appropriate training, knowledge and experience to carry out the service in accordance with this agreement.\n• I confirm that I have appropriate legal entitlement to work within the UK.\n• In signing, I confirm that I have read and understand how, why and what types of personally identifiable information the company controls and may process about me, and that I consent to the control and processing of my PII in accordance with GDPR.`},
];

// ─────────────────────────────────────────────────────────────────────────────
// GPS HELPERS
// ─────────────────────────────────────────────────────────────────────────────
function getDistanceMetres(lat1, lng1, lat2, lng2) {
  const R = 6371000, dLat = (lat2-lat1)*Math.PI/180, dLng = (lng2-lng1)*Math.PI/180;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLng/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}
function getLocation() {
  return new Promise((res, rej) => {
    if (!navigator.geolocation) { rej(new Error("Geolocation not supported on this device.")); return; }
    navigator.geolocation.getCurrentPosition(
      p => res(p.coords),
      e => {
        const msgs = { 1:"Location access denied. Please enable it in your browser settings.", 2:"GPS unavailable. Try stepping outside.", 3:"GPS timed out. Please try again." };
        rej(new Error(msgs[e.code] || "Could not get your location."));
      },
      { enableHighAccuracy:true, timeout:15000, maximumAge:0 }
    );
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// UTILITY HELPERS
// ─────────────────────────────────────────────────────────────────────────────
const isOff   = s => { if (!s) return true; const x = s.toLowerCase(); return x.includes("off")||x.includes("holiday")||x.includes("storage")||!x.trim(); };
const fmtDate = d => d ? new Date(d).toLocaleDateString("en-GB",{day:"2-digit",month:"short",year:"numeric"}) : "—";
const fmtTime = iso => iso ? new Date(iso).toLocaleTimeString("en-GB",{hour:"2-digit",minute:"2-digit"}) : "—";
const fmtMs   = ms => `${Math.floor(ms/3600000).toString().padStart(2,"0")}:${Math.floor((ms%3600000)/60000).toString().padStart(2,"0")}`;
const hoursFromMs = ms => Math.round((ms/3600000)*100)/100;
const certStatus  = (cert, w) => {
  const v = w.certs?.[cert.key];
  if (!v?.held) return "missing";
  if (!cert.hasExpiry || !v.expiry) return "valid";
  const d = (new Date(v.expiry) - new Date()) / 86400000;
  return d < 0 ? "expired" : d < 30 ? "expiring" : "valid";
};
const CERT_STATUS_ORDER = { expired:0, expiring:1, valid:2, missing:3 };

// ─────────────────────────────────────────────────────────────────────────────
// COLOURS
// ─────────────────────────────────────────────────────────────────────────────
const C = {
  bg:"#0a0e1a", card:"#1a1f2e", border:"#1e2535",
  accent:"#3b82f6", green:"#34d399", yellow:"#fbbf24",
  red:"#f87171", purple:"#a78bfa", muted:"#64748b",
  text:"#f1f5f9", sub:"#94a3b8",
};
const DAY_COLORS = ["#3b82f6","#8b5cf6","#06b6d4","#10b981","#f59e0b","#ef4444","#f97316"];
const siteColor  = (name, allSites = []) => {
  if (!name?.trim()) return C.muted;
  const f = allSites.find(s => s.name === name.trim());
  if (f) return f.color;
  let h = 0; for (let i = 0; i < name.length; i++) h = (h*31 + name.charCodeAt(i)) & 0xffff;
  return DAY_COLORS[h % DAY_COLORS.length];
};

// ─────────────────────────────────────────────────────────────────────────────
// UI PRIMITIVES
// ─────────────────────────────────────────────────────────────────────────────
const Card  = ({children,style={}}) => <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:14,padding:16,...style}}>{children}</div>;
const Lbl   = ({children,required}) => <div style={{fontSize:10,color:C.muted,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:5}}>{children}{required&&<span style={{color:C.red}}> *</span>}</div>;
const Badge = ({label,color})       => <span style={{display:"inline-block",padding:"3px 10px",borderRadius:20,fontSize:11,fontWeight:700,background:color+"22",color,border:`1px solid ${color}44`,whiteSpace:"nowrap"}}>{label}</span>;
const KPI   = ({label,value,color,sub}) => <div style={{background:C.bg,borderRadius:10,padding:"10px 12px",textAlign:"center",border:`1px solid ${color}22`}}><div style={{fontSize:9,color:C.muted,fontWeight:700,textTransform:"uppercase",marginBottom:2}}>{label}</div><div style={{fontSize:18,fontWeight:900,color}}>{value}</div>{sub&&<div style={{fontSize:10,color:C.muted,marginTop:1}}>{sub}</div>}</div>;
const Err   = ({msg}) => msg ? <div style={{background:"#2d1515",border:`1px solid ${C.red}44`,borderRadius:9,padding:"10px 14px",color:C.red,fontSize:13,marginBottom:14}}>⚠ {msg}</div> : null;

function Inp({label,value,onChange,type="text",placeholder="",required=false,hint="",disabled=false,style={}}) {
  return <div style={{marginBottom:13,...style}}>
    <Lbl required={required}>{label}</Lbl>
    <input type={type} value={value||""} onChange={e=>onChange(e.target.value)} placeholder={placeholder} disabled={disabled}
      style={{width:"100%",background:disabled?"#0f1421":C.bg,border:`1px solid ${C.border}`,borderRadius:9,padding:"11px 13px",color:disabled?C.muted:C.text,fontSize:14,outline:"none",boxSizing:"border-box"}}/>
    {hint&&<div style={{fontSize:11,color:C.muted,marginTop:4}}>{hint}</div>}
  </div>;
}
function Sel({label,value,onChange,options,required=false}) {
  return <div style={{marginBottom:13}}>
    <Lbl required={required}>{label}</Lbl>
    <select value={value||""} onChange={e=>onChange(e.target.value)}
      style={{width:"100%",background:C.bg,border:`1px solid ${C.border}`,borderRadius:9,padding:"11px 13px",color:value?C.text:C.muted,fontSize:14,outline:"none",boxSizing:"border-box",cursor:"pointer"}}>
      <option value="">— Select —</option>
      {options.map(o=><option key={o} value={o}>{o}</option>)}
    </select>
  </div>;
}
function Steps({current,labels}) {
  return <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:0,marginBottom:20}}>
    {labels.map((l,i)=>{
      const done=i<current,active=i===current;
      return <div key={i} style={{display:"flex",alignItems:"center"}}>
        <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:3}}>
          <div style={{width:24,height:24,borderRadius:"50%",background:done?C.green:active?"#1e3a5f":C.card,border:`2px solid ${done?C.green:active?C.accent:C.border}`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,fontWeight:800,color:done?"#fff":active?C.accent:C.muted}}>{done?"✓":i+1}</div>
          <div style={{fontSize:9,color:active?C.accent:done?C.green:C.muted,fontWeight:active||done?700:400,whiteSpace:"nowrap"}}>{l}</div>
        </div>
        {i<labels.length-1&&<div style={{width:20,height:2,background:done?C.green:C.border,marginBottom:14,flexShrink:0}}/>}
      </div>;
    })}
  </div>;
}

// Live timer — updates every 30 s so the "on site" counter ticks
function LiveTimer({ since }) {
  const [ms, setMs] = useState(() => Date.now() - new Date(since).getTime());
  useEffect(() => {
    const id = setInterval(() => setMs(Date.now() - new Date(since).getTime()), 30_000);
    return () => clearInterval(id);
  }, [since]);
  return <>{hoursFromMs(ms).toFixed(1)}h</>;
}

// ─────────────────────────────────────────────────────────────────────────────
// PAYSLIP PDF PRINTER
// ─────────────────────────────────────────────────────────────────────────────
function printPayslip(worker, weekLabel, gross, net, taxAmt, taxPct, bd, activeDays) {
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>Payslip ${weekLabel}</title>
<style>*{margin:0;padding:0;box-sizing:border-box;}body{font-family:Arial,sans-serif;font-size:11px;padding:24px;color:#111;}
.hdr{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:20px;padding-bottom:14px;border-bottom:2px solid #1a3a5f;}
.logo{background:#1a3a5f;border-radius:5px;padding:6px 12px;}.logo-name{font-size:11px;font-weight:900;color:#fff;letter-spacing:0.08em;}.logo-sub{font-size:7px;color:#93c5fd;}
h1{font-size:20px;font-weight:900;color:#1a3a5f;margin-bottom:3px;}
.meta{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px;}
.meta-box{background:#f8fafc;border-radius:7px;padding:10px 12px;border:1px solid #e2e8f0;}
.ml{font-size:9px;color:#64748b;font-weight:700;text-transform:uppercase;margin-bottom:3px;}.mv{font-size:13px;font-weight:700;}
table{width:100%;border-collapse:collapse;margin-bottom:14px;}
th{background:#1a3a5f;color:#fff;padding:7px 9px;text-align:left;font-size:10px;font-weight:700;}th.r{text-align:right;}
td{padding:7px 9px;border-bottom:1px solid #f1f5f9;}td.r{text-align:right;}
tr:nth-child(even)td{background:#f8fafc;}
.tots{display:flex;justify-content:flex-end;}.tot-box{width:220px;background:#f8fafc;border-radius:8px;padding:12px 14px;border:1px solid #e2e8f0;}
.tot-row{display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid #e2e8f0;font-size:11px;}
.tot-final{border-top:2px solid #1a3a5f;border-bottom:none;padding-top:8px;margin-top:4px;}
.ft{margin-top:20px;padding-top:10px;border-top:1px solid #e2e8f0;display:flex;justify-content:space-between;font-size:9px;color:#94a3b8;}
@media print{body{padding:10px;}@page{margin:8mm;size:A4;}}</style></head><body>
<div class="hdr"><div><h1>PAYSLIP</h1><div style="font-size:11px;color:#64748b">Week Commencing: <strong>${weekLabel}</strong></div></div>
<div class="logo"><div class="logo-name">BRIGHT METALWORK</div><div class="logo-sub">PASSION SHAPED INTO PERFECTION</div></div></div>
<div class="meta"><div class="meta-box"><div class="ml">Employee</div><div class="mv">${worker.name||"—"}</div></div>
<div class="meta-box"><div class="ml">Position</div><div class="mv">${worker.position||"—"}</div></div>
<div class="meta-box"><div class="ml">Company</div><div class="mv">${worker.company||"—"}</div></div>
<div class="meta-box"><div class="ml">NI Number</div><div class="mv">${worker.niNumber||"—"}</div></div></div>
<table><thead><tr><th>Day</th><th>Site</th><th class="r">Std Hrs</th><th class="r">OT Hrs</th><th class="r">Std Pay</th><th class="r">OT Pay</th><th class="r">Total</th></tr></thead>
<tbody>${activeDays.map(d=>{const b=bd[d];return`<tr><td style="font-weight:600">${d}</td><td>${b?b.site:"—"}</td><td class="r">${b?b.hours.toFixed(1):""}</td><td class="r">${b&&b.ot>0?b.ot.toFixed(1):""}</td><td class="r">${b?"£"+b.stdPay.toFixed(2):""}</td><td class="r">${b&&b.ot>0?"£"+b.otPay.toFixed(2):""}</td><td class="r" style="font-weight:700">${b?"£"+b.gross.toFixed(2):"—"}</td></tr>`;}).join("")}</tbody></table>
<div class="tots"><div class="tot-box"><div class="tot-row"><span>Gross Pay</span><span style="font-weight:700">£${gross.toFixed(2)}</span></div><div class="tot-row"><span>Tax (${taxPct}%)</span><span style="font-weight:700;color:#ef4444">-£${taxAmt.toFixed(2)}</span></div><div class="tot-row tot-final"><span style="font-weight:800;font-size:13px">NET PAY</span><span style="font-weight:900;font-size:16px;color:#16a34a">£${net.toFixed(2)}</span></div></div></div>
${worker.bankName||worker.accountNo?`<div style="margin-top:14px;padding:10px 14px;background:#f0fdf4;border-radius:8px;border:1px solid #bbf7d0;font-size:11px;color:#166534"><strong>Payment to:</strong> ${worker.bankName||""} ${worker.sortCode?"· Sort Code: "+worker.sortCode:""} ${worker.accountNo?"· Account: "+worker.accountNo:""}</div>`:""}
<div class="ft"><span>Bright Metalwork Ltd · CRN: 12020937</span><span>Payslip WC ${weekLabel} · ${worker.name}</span></div>
<script>window.onload=function(){window.print();}</script></body></html>`;
  const b = new Blob([html],{type:"text/html"});
  const u = URL.createObjectURL(b);
  const win = window.open(u,"_blank","width=900,height=800");
  if (!win) { const a=document.createElement("a"); a.href=u; a.download=`Payslip_${weekLabel}_${worker.name}.html`; a.click(); }
  setTimeout(()=>URL.revokeObjectURL(u), 5000);
}

// ─────────────────────────────────────────────────────────────────────────────
// SIGNATURE PAD
// ─────────────────────────────────────────────────────────────────────────────
function SignaturePad({ onSign, onClear, signed }) {
  const canvasRef = useRef(null);
  const drawing   = useRef(false);
  const lastPos   = useRef({x:0,y:0});

  const getPos = (e, canvas) => {
    const rect = canvas.getBoundingClientRect();
    const sx = canvas.width/rect.width, sy = canvas.height/rect.height;
    if (e.touches) return {x:(e.touches[0].clientX-rect.left)*sx, y:(e.touches[0].clientY-rect.top)*sy};
    return {x:(e.clientX-rect.left)*sx, y:(e.clientY-rect.top)*sy};
  };
  const start = e => { e.preventDefault(); drawing.current=true; lastPos.current=getPos(e,canvasRef.current); };
  const draw  = e => {
    e.preventDefault(); if (!drawing.current) return;
    const canvas=canvasRef.current, ctx=canvas.getContext("2d");
    const pos=getPos(e,canvas);
    ctx.beginPath(); ctx.moveTo(lastPos.current.x,lastPos.current.y); ctx.lineTo(pos.x,pos.y);
    ctx.strokeStyle="#1a3a5f"; ctx.lineWidth=2.5; ctx.lineCap="round"; ctx.lineJoin="round"; ctx.stroke();
    lastPos.current=pos;
  };
  const end = e => { e.preventDefault(); drawing.current=false; onSign(canvasRef.current.toDataURL("image/png")); };
  const clear = () => { const c=canvasRef.current; c.getContext("2d").clearRect(0,0,c.width,c.height); onClear(); };

  return <div>
    <div style={{position:"relative",background:"#fff",borderRadius:10,border:`2px solid ${signed?C.green:C.border}`,overflow:"hidden"}}>
      <canvas ref={canvasRef} width={600} height={160}
        style={{width:"100%",height:140,display:"block",cursor:"crosshair",touchAction:"none"}}
        onMouseDown={start} onMouseMove={draw} onMouseUp={end} onMouseLeave={end}
        onTouchStart={start} onTouchMove={draw} onTouchEnd={end}/>
      {!signed&&<div style={{position:"absolute",top:"50%",left:"50%",transform:"translate(-50%,-50%)",fontSize:13,color:"#94a3b8",pointerEvents:"none",textAlign:"center"}}>
        <div style={{fontSize:20,marginBottom:4}}>✍️</div>Sign here with finger or mouse
      </div>}
    </div>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginTop:8}}>
      <button onClick={clear} style={{background:"none",border:`1px solid ${C.border}`,borderRadius:7,padding:"6px 14px",color:C.muted,cursor:"pointer",fontSize:12}}>Clear</button>
      {signed&&<span style={{fontSize:12,color:C.green,fontWeight:700}}>✓ Signature captured</span>}
    </div>
  </div>;
}

// ─────────────────────────────────────────────────────────────────────────────
// TERMS STEP
// ─────────────────────────────────────────────────────────────────────────────
function TermsStep({ workerData, onAccept, onBack }) {
  const [scrolled, setScrolled]   = useState(false);
  const [accepted, setAccepted]   = useState(false);
  const [sigData,  setSigData]    = useState(null);
  const [exporting,setExporting]  = useState(false);
  const scrollRef = useRef(null);

  const handleScroll = () => {
    const el = scrollRef.current;
    if (el && el.scrollHeight - el.scrollTop <= el.clientHeight + 40) setScrolled(true);
  };

  const exportPDF = () => {
    const signedAt    = new Date();
    const signedAtStr = signedAt.toLocaleString("en-GB",{dateStyle:"full",timeStyle:"short"});
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>Signed Agreement — ${workerData.name}</title>
<style>*{margin:0;padding:0;box-sizing:border-box;}body{font-family:Arial,sans-serif;font-size:11px;color:#111;padding:28px;}
.hdr{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:24px;padding-bottom:16px;border-bottom:3px solid #1a3a5f;}
.logo-box{background:#1a3a5f;border-radius:5px;padding:7px 14px;}.logo-name{font-size:12px;font-weight:900;color:#fff;}.logo-sub{font-size:7px;color:#93c5fd;}
h1{font-size:22px;font-weight:900;color:#1a3a5f;margin-bottom:4px;}.sub{font-size:11px;color:#555;}
.wb{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:20px;background:#f8fafc;border-radius:8px;padding:14px;border:1px solid #e2e8f0;}
.wfl{font-size:10px;color:#64748b;font-weight:700;text-transform:uppercase;margin-bottom:2px;}.wfv{font-size:12px;font-weight:700;color:#111;}
.section{margin-bottom:16px;page-break-inside:avoid;}
.sec-title{font-size:12px;font-weight:900;color:#1a3a5f;background:#eff6ff;padding:6px 10px;border-radius:5px;margin-bottom:8px;border-left:3px solid #3b82f6;}
.sec-body{font-size:10px;color:#333;line-height:1.7;white-space:pre-line;}
.sig-box{margin-top:24px;padding:16px;background:#f0fdf4;border-radius:10px;border:2px solid #16a34a;}
.sig-grid{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:14px;}
.sig-label{color:#64748b;font-weight:700;text-transform:uppercase;font-size:10px;margin-bottom:3px;}.sig-value{font-size:12px;font-weight:700;color:#111;padding:6px 0;border-bottom:1px solid #d1fae5;}
.stamp{display:inline-block;margin-top:10px;padding:6px 16px;background:#dcfce7;border:2px solid #16a34a;border-radius:20px;font-size:11px;font-weight:900;color:#166534;}
.ft{margin-top:20px;padding-top:10px;border-top:1px solid #e2e8f0;display:flex;justify-content:space-between;font-size:9px;color:#94a3b8;}
@media print{body{padding:12px;}@page{margin:8mm;size:A4;}}</style></head><body>
<div class="hdr"><div><h1>LABOUR ENGAGEMENT AGREEMENT</h1><p class="sub">New Starter Agreement — Bright Metalwork Ltd · BM-DOC-003</p></div>
<div class="logo-box"><div class="logo-name">BRIGHT METALWORK</div><div class="logo-sub">PASSION SHAPED INTO PERFECTION</div></div></div>
<div class="wb">${[["Full Name",workerData.name||"—"],["Position",workerData.position||"—"],["Company",workerData.company||"—"],["Date of Birth",workerData.dob?new Date(workerData.dob).toLocaleDateString("en-GB"):"—"],["NI Number",workerData.niNumber||"—"],["Phone",workerData.phone||"—"],["Email",workerData.email||"—"],["Address",workerData.address||"—"]].map(([l,v])=>`<div><div class="wfl">${l}</div><div class="wfv">${v}</div></div>`).join("")}</div>
${TERMS_SECTIONS.map(s=>`<div class="section"><div class="sec-title">${s.title}</div><div class="sec-body">${s.content.replace(/</g,"&lt;").replace(/>/g,"&gt;")}</div></div>`).join("")}
<div class="sig-box"><div style="font-size:13px;font-weight:900;color:#166534;margin-bottom:12px;">✅ DIGITALLY SIGNED — WORKER ACCEPTANCE</div>
<div class="sig-grid"><div><div class="sig-label">Full Name</div><div class="sig-value">${workerData.name||"—"}</div></div><div><div class="sig-label">Signed On</div><div class="sig-value">${signedAtStr}</div></div><div><div class="sig-label">Email</div><div class="sig-value">${workerData.email||"—"}</div></div><div><div class="sig-label">Position</div><div class="sig-value">${workerData.position||"—"}</div></div></div>
<div><div class="sig-label">Handwritten Signature</div><div style="border:1px solid #86efac;border-radius:7px;padding:8px;background:#fff;text-align:center;margin-top:8px;"><img src="${sigData}" style="max-height:100px;max-width:100%"/></div></div>
<div style="text-align:center"><span class="stamp">✓ ACCEPTED & SIGNED — ${signedAtStr}</span></div></div>
<div class="ft"><span>Bright Metalwork Ltd · CRN: 12020937 · BM-DOC-003</span><span>Signed by: ${workerData.name||"—"} on ${signedAtStr}</span></div>
<script>window.onload=function(){window.print();}</script></body></html>`;
    const blob = new Blob([html],{type:"text/html"});
    const url  = URL.createObjectURL(blob);
    const win  = window.open(url,"_blank","width=900,height=900");
    if (!win) { const a=document.createElement("a"); a.href=url; a.download=`Signed_Agreement_${workerData.name||"worker"}.html`; a.click(); }
    setTimeout(()=>URL.revokeObjectURL(url), 8000);
    return signedAt.toISOString();
  };

  const handleAccept = () => {
    if (!sigData) { alert("Please draw your signature before accepting."); return; }
    setExporting(true);
    const signedAt = exportPDF();
    setTimeout(() => { setExporting(false); onAccept(sigData, signedAt); }, 400);
  };

  return (
    <div style={{minHeight:"100vh",background:C.bg,fontFamily:"system-ui,sans-serif",padding:16,paddingBottom:40}}>
      <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:16,paddingTop:8}}>
        <button onClick={onBack} style={{background:"none",border:"none",color:C.muted,cursor:"pointer",fontSize:20,padding:"4px 8px"}}>←</button>
        <div><div style={{fontSize:17,fontWeight:900,color:C.text}}>Terms & Conditions</div><div style={{fontSize:12,color:C.muted}}>Read fully before signing</div></div>
      </div>
      <div style={{maxWidth:480,margin:"0 auto"}}>
        <Steps current={3} labels={["Personal","Certs","Account","T&Cs"]}/>
        {!scrolled&&<div style={{background:"#1e2535",border:`1px solid ${C.yellow}44`,borderRadius:8,padding:"9px 13px",marginBottom:12,fontSize:12,color:C.yellow,display:"flex",alignItems:"center",gap:8}}>
          <span>📜</span><span>Please scroll to the bottom to read the full agreement before signing.</span>
        </div>}
        <Card style={{marginBottom:14,padding:0,overflow:"hidden"}}>
          <div style={{background:"#1a3a5f",padding:"12px 16px"}}>
            <div style={{fontSize:13,fontWeight:800,color:"#fff"}}>BRIGHT METALWORK LTD</div>
            <div style={{fontSize:11,color:"#93c5fd"}}>Labour Engagement Agreement · BM-DOC-003</div>
          </div>
          <div ref={scrollRef} onScroll={handleScroll} style={{maxHeight:360,overflowY:"auto",padding:"14px 16px"}}>
            {TERMS_SECTIONS.map((s,i)=>(
              <div key={i} style={{marginBottom:18}}>
                <div style={{fontSize:12,fontWeight:800,color:C.accent,marginBottom:8,paddingBottom:4,borderBottom:`1px solid ${C.border}`}}>{s.title}</div>
                <div style={{fontSize:12,color:C.sub,lineHeight:1.75,whiteSpace:"pre-line"}}>{s.content}</div>
              </div>
            ))}
            <div onMouseEnter={()=>setScrolled(true)} style={{height:20,display:"flex",alignItems:"center",justifyContent:"center"}}>
              {!scrolled
                ?<button onClick={()=>setScrolled(true)} style={{background:"none",border:"none",color:C.muted,cursor:"pointer",fontSize:11,textDecoration:"underline"}}>Mark as read</button>
                :<span style={{fontSize:11,color:C.green,fontWeight:700}}>✓ End of document</span>}
            </div>
          </div>
        </Card>

        <Card style={{marginBottom:14}}>
          <div onClick={()=>scrolled&&setAccepted(a=>!a)} style={{display:"flex",alignItems:"flex-start",gap:12,cursor:scrolled?"pointer":"not-allowed",opacity:scrolled?1:0.4}}>
            <div style={{width:22,height:22,borderRadius:6,background:accepted?C.accent:C.bg,border:`2px solid ${accepted?C.accent:C.border}`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,marginTop:1}}>
              {accepted&&<span style={{color:"#fff",fontSize:14,fontWeight:900}}>✓</span>}
            </div>
            <div style={{fontSize:13,color:C.text,lineHeight:1.5}}>I have read and fully understood the Bright Metalwork Ltd Labour Engagement Agreement and agree to be bound by its terms and conditions.</div>
          </div>
        </Card>

        <Card style={{marginBottom:14,opacity:accepted?1:0.4}}>
          <div style={{fontSize:13,fontWeight:800,color:C.text,marginBottom:4}}>✍️ Your Signature</div>
          <div style={{fontSize:12,color:C.muted,marginBottom:12}}>{accepted?"Draw your signature below using your finger or mouse.":"Accept the terms above to unlock the signature pad."}</div>
          {accepted&&<SignaturePad onSign={setSigData} onClear={()=>setSigData(null)} signed={!!sigData}/>}
        </Card>

        <Card style={{marginBottom:16,background:C.bg}}>
          <div style={{fontSize:10,color:C.muted,fontWeight:700,textTransform:"uppercase",marginBottom:8}}>Agreement Parties</div>
          {[["Worker",workerData.name||"—"],["Position",workerData.position||"—"],["Contractor","Bright Metalwork Ltd"]].map(([l,v])=>
            <div key={l} style={{display:"flex",justifyContent:"space-between",fontSize:12,marginBottom:4}}><span style={{color:C.muted}}>{l}</span><span style={{color:C.text,fontWeight:700}}>{v}</span></div>
          )}
        </Card>

        <div style={{display:"flex",gap:10}}>
          <button onClick={onBack} style={{flex:1,background:C.card,border:`1px solid ${C.border}`,borderRadius:10,padding:"13px",color:C.sub,fontSize:14,fontWeight:700,cursor:"pointer"}}>← Back</button>
          <button onClick={handleAccept} disabled={!accepted||!sigData||exporting}
            style={{flex:2,background:accepted&&sigData?"linear-gradient(135deg,#14532d,#16a34a)":"#1e2535",border:`1px solid ${accepted&&sigData?C.green:C.border}`,borderRadius:10,padding:"13px",color:accepted&&sigData?"#fff":C.muted,fontSize:14,fontWeight:800,cursor:accepted&&sigData?"pointer":"not-allowed",opacity:exporting?0.7:1}}>
            {exporting?"Generating PDF…":"✓ Accept & Sign — Submit Registration"}
          </button>
        </div>
        <div style={{textAlign:"center",fontSize:11,color:C.muted,marginTop:10}}>A signed copy will be automatically downloaded upon submission.</div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// FORGOT PASSWORD SCREEN
// ─────────────────────────────────────────────────────────────────────────────
function ForgotPasswordScreen({ onBack }) {
  const [email,    setEmail]    = useState("");
  const [loading,  setLoading]  = useState(false);
  const [sent,     setSent]     = useState(false);
  const [err,      setErr]      = useState("");

  const handleReset = async () => {
    if (!email.trim()) { setErr("Please enter your email address."); return; }
    setErr(""); setLoading(true);
    try {
      await sbResetPassword(email.trim().toLowerCase());
      setSent(true);
    } catch (e) {
      setErr(e.message || "Failed to send reset email.");
    }
    setLoading(false);
  };

  if (sent) return (
    <div style={{minHeight:"100vh",background:C.bg,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:24,fontFamily:"system-ui,sans-serif",textAlign:"center"}}>
      <div style={{fontSize:48,marginBottom:16}}>📧</div>
      <div style={{fontSize:20,fontWeight:900,color:C.text,marginBottom:8}}>Check your email</div>
      <div style={{fontSize:14,color:C.sub,maxWidth:300,lineHeight:1.6,marginBottom:24}}>A password reset link has been sent to <strong style={{color:C.text}}>{email}</strong>. Check your inbox and spam folder.</div>
      <button onClick={onBack} style={{background:"linear-gradient(135deg,#1e3a5f,#3b82f6)",border:"none",borderRadius:10,padding:"12px 28px",color:"#fff",fontSize:14,fontWeight:800,cursor:"pointer"}}>← Back to Sign In</button>
    </div>
  );

  return (
    <div style={{minHeight:"100vh",background:C.bg,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:20,fontFamily:"system-ui,sans-serif"}}>
      <div style={{width:"100%",maxWidth:380}}>
        <button onClick={onBack} style={{background:"none",border:"none",color:C.muted,cursor:"pointer",fontSize:16,marginBottom:20,padding:0}}>← Back to Sign In</button>
        <div style={{marginBottom:24}}>
          <div style={{fontSize:20,fontWeight:900,color:C.text,marginBottom:6}}>Reset Password</div>
          <div style={{fontSize:13,color:C.muted}}>Enter your email and we'll send you a reset link.</div>
        </div>
        <Card>
          <Inp label="Email Address" value={email} onChange={setEmail} type="email" placeholder="your@email.com" required/>
          <Err msg={err}/>
          <button onClick={handleReset} disabled={loading}
            style={{width:"100%",background:"linear-gradient(135deg,#1e3a5f,#3b82f6)",border:"none",borderRadius:10,padding:"13px",color:"#fff",fontSize:14,fontWeight:800,cursor:loading?"not-allowed":"pointer",opacity:loading?0.7:1}}>
            {loading?"Sending…":"Send Reset Link →"}
          </button>
        </Card>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// REGISTER SCREEN — now writes to pending_workers for admin approval
// ─────────────────────────────────────────────────────────────────────────────
function RegisterScreen({ onBack }) {
  const [step, setStep]         = useState(0);
  const [submitting,setSubmitting] = useState(false);
  const [done, setDone]         = useState(false);
  const [err,  setErr]          = useState("");

  // Step 0 — Personal
  const [name,setName]=useState("");const [phone,setPhone]=useState("");const [address,setAddress]=useState("");
  const [position,setPosition]=useState("");const [company,setCompany]=useState("");const [niNumber,setNiNumber]=useState("");
  const [dob,setDob]=useState("");const [emergencyName,setEmergencyName]=useState("");const [emergencyPhone,setEmergencyPhone]=useState("");
  const [bankName,setBankName]=useState("");const [sortCode,setSortCode]=useState("");const [accountNo,setAccountNo]=useState("");

  // Step 1 — Certs
  const [certs,setCerts]=useState({});const [uploading,setUploading]=useState({});

  // Step 2 — Account
  const [email,setEmail]=useState("");const [password,setPassword]=useState("");const [password2,setPassword2]=useState("");

  const tempId = useMemo(()=>"reg_"+Date.now(),[]);
  const toggleCert   = key => setCerts(c=>({...c,[key]:{...c[key],held:!c[key]?.held}}));
  const setCertExpiry = (key,val) => setCerts(c=>({...c,[key]:{...c[key],expiry:val}}));
  const handlePhotoUpload = async (key, file) => {
    if (!file) return;
    setUploading(u=>({...u,[key]:true}));
    try { const url=await uploadCertPhoto(file,tempId,key); setCerts(c=>({...c,[key]:{...c[key],photoUrl:url}})); }
    catch(e) { setErr("Photo upload failed: "+e.message); }
    setUploading(u=>({...u,[key]:false}));
  };

  const validate = () => {
    setErr("");
    if (step===0) {
      if (!name.trim())   return setErr("Full name is required.")||false;
      if (!position)      return setErr("Position is required.")||false;
      if (!company)       return setErr("Company is required.")||false;
      return true;
    }
    if (step===1) return true;
    if (step===2) {
      if (!email.trim())       return setErr("Email is required.")||false;
      if (password.length<6)   return setErr("Password must be at least 6 characters.")||false;
      if (password!==password2) return setErr("Passwords do not match.")||false;
      return true;
    }
    return true;
  };
  const next = () => { if (validate()) setStep(s=>s+1); };
  const back = () => { setErr(""); setStep(s=>s-1); };

  const workerData = { id:tempId,name,phone,address,position,company,niNumber,dob,emergencyName,emergencyPhone,bankName,sortCode,accountNo,email,authEmail:email };

  const handleTermsAccept = async (sig, signedAt) => {
    setSubmitting(true); setErr("");
    try {
      // 1. Create the Supabase auth account
      await sbSignUp(email, password);
      // 2. Build the worker record
      const wd = {
        ...workerData,
        certs: Object.fromEntries(
          Object.entries(certs)
            .filter(([,v])=>v?.held)
            .map(([k,v])=>[k,{held:true,expiry:v.expiry||"",photoUrl:v.photoUrl||""}])
        ),
        days:{Mon:"",Tue:"",Wed:"",Thu:"",Fri:"",Sat:"",Sun:""},
        hoursPerDay:{}, overtimeHours:{}, agreedRate:0, taxRate:0.20,
        registeredAt:new Date().toISOString(), termsSignedAt:signedAt, termsAccepted:true,
        detailsHistory:[], payslips:[], leaveRequests:[], dismissedAnnouncements:[],
      };
      // 3. Write to pending_workers — awaits admin approval
      await sbPost("pending_workers", { id:wd.id, data:wd, status:"pending", submitted_at:new Date().toISOString() });
      setDone(true);
    } catch(e) {
      setErr(e.message || "Registration failed.");
      setStep(2);
    }
    setSubmitting(false);
  };

  if (done) return (
    <div style={{minHeight:"100vh",background:C.bg,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:24,fontFamily:"system-ui,sans-serif",textAlign:"center"}}>
      <div style={{fontSize:56,marginBottom:16}}>✅</div>
      <div style={{fontSize:22,fontWeight:900,color:C.text,marginBottom:8}}>Registration Submitted!</div>
      <div style={{fontSize:14,color:C.sub,maxWidth:320,lineHeight:1.6,marginBottom:20}}>Your application is now with the Bright Metalwork team for review. You'll be able to sign in once an admin approves your account.</div>
      <div style={{background:C.card,border:`1px solid ${C.green}44`,borderRadius:12,padding:"12px 20px",marginBottom:8,fontSize:13,color:C.green,fontWeight:600}}>✓ Signed agreement PDF was downloaded</div>
      <div style={{background:C.card,border:`1px solid ${C.yellow}44`,borderRadius:12,padding:"12px 20px",marginBottom:24,fontSize:13,color:C.yellow,fontWeight:600}}>⏳ Pending admin approval for {email}</div>
      <button onClick={onBack} style={{background:"linear-gradient(135deg,#1e3a5f,#3b82f6)",border:"none",borderRadius:10,padding:"12px 28px",color:"#fff",fontSize:15,fontWeight:800,cursor:"pointer"}}>← Back to Sign In</button>
    </div>
  );

  if (step===3) return <TermsStep workerData={workerData} onAccept={handleTermsAccept} onBack={back}/>;

  return (
    <div style={{minHeight:"100vh",background:C.bg,fontFamily:"system-ui,sans-serif",padding:16,paddingBottom:40}}>
      <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:16,paddingTop:8}}>
        <button onClick={step===0?onBack:back} style={{background:"none",border:"none",color:C.muted,cursor:"pointer",fontSize:20,padding:"4px 8px"}}>←</button>
        <div><div style={{fontSize:17,fontWeight:900,color:C.text}}>Create Account</div><div style={{fontSize:12,color:C.muted}}>Bright Metalwork Worker Portal</div></div>
      </div>
      <div style={{maxWidth:480,margin:"0 auto"}}>
        <Steps current={step} labels={["Personal","Certs","Account","T&Cs"]}/>
        <Err msg={err}/>

        {step===0&&<Card>
          <div style={{fontSize:14,fontWeight:800,color:C.text,marginBottom:14}}>👤 Personal Information</div>
          <Inp label="Full Name" value={name} onChange={setName} placeholder="e.g. John Smith" required/>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"0 12px"}}>
            <Sel label="Position" value={position} onChange={setPosition} options={POSITIONS} required/>
            <Sel label="Company" value={company} onChange={setCompany} options={COMPANIES} required/>
          </div>
          <Inp label="Phone Number" value={phone} onChange={setPhone} type="tel" placeholder="+44 7700 000000"/>
          <Inp label="Date of Birth" value={dob} onChange={setDob} type="date"/>
          <Inp label="NI Number" value={niNumber} onChange={setNiNumber} placeholder="AB 12 34 56 C"/>
          <Inp label="Home Address" value={address} onChange={setAddress} placeholder="Full home address"/>
          <div style={{borderTop:`1px solid ${C.border}`,paddingTop:14,marginTop:2,marginBottom:12}}>
            <div style={{fontSize:11,fontWeight:700,color:C.sub,marginBottom:10}}>🏦 Bank Details</div>
            <Inp label="Bank Name" value={bankName} onChange={setBankName} placeholder="e.g. HSBC, Barclays"/>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"0 12px"}}>
              <Inp label="Sort Code" value={sortCode} onChange={setSortCode} placeholder="00-00-00"/>
              <Inp label="Account Number" value={accountNo} onChange={setAccountNo} placeholder="12345678"/>
            </div>
          </div>
          <div style={{borderTop:`1px solid ${C.border}`,paddingTop:14}}>
            <div style={{fontSize:11,fontWeight:700,color:C.sub,marginBottom:10}}>🆘 Emergency Contact</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"0 12px"}}>
              <Inp label="Contact Name" value={emergencyName} onChange={setEmergencyName} placeholder="Full name"/>
              <Inp label="Contact Phone" value={emergencyPhone} onChange={setEmergencyPhone} type="tel"/>
            </div>
          </div>
          <button onClick={next} style={{width:"100%",background:"linear-gradient(135deg,#1e3a5f,#3b82f6)",border:"none",borderRadius:10,padding:"13px",color:"#fff",fontSize:14,fontWeight:800,cursor:"pointer",marginTop:4}}>Next: Certifications →</button>
        </Card>}

        {step===1&&<div>
          <Card style={{marginBottom:12}}>
            <div style={{fontSize:14,fontWeight:800,color:C.text,marginBottom:4}}>🛡 Certifications</div>
            <div style={{fontSize:12,color:C.muted,marginBottom:14}}>Tick each cert you hold. Add expiry dates and upload photos. All optional.</div>
            <div style={{display:"flex",flexDirection:"column",gap:8}}>
              {CERTS.map(cert=>{
                const held=certs[cert.key]?.held||false, expiry=certs[cert.key]?.expiry||"", photoUrl=certs[cert.key]?.photoUrl||"", isUp=uploading[cert.key];
                return <div key={cert.key} style={{background:C.bg,borderRadius:10,border:`1px solid ${held?C.accent+"44":C.border}`,overflow:"hidden"}}>
                  <div onClick={()=>toggleCert(cert.key)} style={{display:"flex",alignItems:"center",gap:10,padding:"10px 13px",cursor:"pointer"}}>
                    <div style={{width:20,height:20,borderRadius:5,background:held?C.accent:C.card,border:`2px solid ${held?C.accent:C.border}`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>{held&&<span style={{color:"#fff",fontSize:12,fontWeight:900}}>✓</span>}</div>
                    <div style={{flex:1}}><div style={{fontSize:13,fontWeight:held?700:400,color:held?C.text:C.sub}}>{cert.label}</div></div>
                    {held&&photoUrl&&<span style={{fontSize:10,color:C.green,fontWeight:700}}>📷</span>}
                  </div>
                  {held&&<div style={{padding:"0 13px 12px",borderTop:`1px solid ${C.border}`}}>
                    {cert.hasExpiry&&<div style={{marginTop:10}}><Lbl>Expiry Date</Lbl><input type="date" value={expiry} onChange={e=>setCertExpiry(cert.key,e.target.value)} style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:7,padding:"8px 10px",color:C.text,fontSize:13,outline:"none",width:"100%",boxSizing:"border-box"}}/></div>}
                    <div style={{marginTop:10}}><Lbl>Photo of Certificate</Lbl>
                      <label style={{display:"flex",alignItems:"center",gap:10,padding:"9px 12px",background:C.card,border:`1px dashed ${photoUrl?C.green:C.border}`,borderRadius:8,cursor:"pointer"}}>
                        <span style={{fontSize:16}}>{isUp?"⏳":photoUrl?"✅":"📷"}</span>
                        <span style={{fontSize:12,color:photoUrl?C.green:C.muted,fontWeight:photoUrl?700:400}}>{isUp?"Uploading…":photoUrl?"Uploaded — tap to replace":"Tap to upload"}</span>
                        <input type="file" accept="image/*,application/pdf" style={{display:"none"}} onChange={e=>handlePhotoUpload(cert.key,e.target.files[0])}/>
                      </label>
                    </div>
                  </div>}
                </div>;
              })}
            </div>
          </Card>
          <div style={{display:"flex",gap:10}}>
            <button onClick={back} style={{flex:1,background:C.card,border:`1px solid ${C.border}`,borderRadius:10,padding:"13px",color:C.sub,fontSize:14,fontWeight:700,cursor:"pointer"}}>← Back</button>
            <button onClick={next} style={{flex:2,background:"linear-gradient(135deg,#1e3a5f,#3b82f6)",border:"none",borderRadius:10,padding:"13px",color:"#fff",fontSize:14,fontWeight:800,cursor:"pointer"}}>Next: Account →</button>
          </div>
        </div>}

        {step===2&&<Card>
          <div style={{fontSize:14,fontWeight:800,color:C.text,marginBottom:4}}>🔐 Create Your Account</div>
          <div style={{fontSize:12,color:C.muted,marginBottom:14}}>You'll use this email and password to sign in once approved.</div>
          <Inp label="Email Address" value={email} onChange={setEmail} type="email" placeholder="your@email.com" required/>
          <Inp label="Password" value={password} onChange={setPassword} type="password" placeholder="Minimum 6 characters" required hint="Choose a strong password"/>
          <Inp label="Confirm Password" value={password2} onChange={setPassword2} type="password" placeholder="Repeat your password" required/>
          <div style={{background:C.bg,borderRadius:10,padding:"12px 14px",marginBottom:14,border:`1px solid ${C.border}`}}>
            <div style={{fontSize:10,color:C.muted,fontWeight:700,textTransform:"uppercase",marginBottom:8}}>Summary</div>
            {[["Name",name||"—"],["Position",position||"—"],["Company",company||"—"],["Certs",Object.values(certs).filter(c=>c?.held).length+" selected"]].map(([l,v])=>
              <div key={l} style={{display:"flex",justifyContent:"space-between",fontSize:12,padding:"3px 0"}}><span style={{color:C.muted}}>{l}</span><span style={{color:C.text,fontWeight:600}}>{v}</span></div>
            )}
          </div>
          <div style={{display:"flex",gap:10}}>
            <button onClick={back} style={{flex:1,background:C.card,border:`1px solid ${C.border}`,borderRadius:10,padding:"13px",color:C.sub,fontSize:14,fontWeight:700,cursor:"pointer"}}>← Back</button>
            <button onClick={next} style={{flex:2,background:"linear-gradient(135deg,#1e3a5f,#3b82f6)",border:"none",borderRadius:10,padding:"13px",color:"#fff",fontSize:14,fontWeight:800,cursor:"pointer"}}>Next: Read & Sign T&Cs →</button>
          </div>
        </Card>}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// LOGIN SCREEN
// ─────────────────────────────────────────────────────────────────────────────
function LoginScreen({ onLoginSuccess }) {
  const [email,   setEmail]    = useState("");
  const [password,setPassword] = useState("");
  const [err,     setErr]      = useState("");
  const [loading, setLoading]  = useState(false);
  const [screen,  setScreen]   = useState("login"); // "login" | "register" | "forgot"

  if (screen==="register") return <RegisterScreen onBack={()=>setScreen("login")}/>;
  if (screen==="forgot")   return <ForgotPasswordScreen onBack={()=>setScreen("login")}/>;

  const handleLogin = async () => {
    setErr(""); setLoading(true);
    try {
      await sbSignIn(email, password);
      // Look up the approved worker record
      const rows = await sbGet("workers", `select=id,data&data->>authEmail=eq.${encodeURIComponent(email)}`);
      if (rows.length > 0) {
        onLoginSuccess({ ...rows[0].data, id:rows[0].id });
      } else {
        // Try email field fallback
        const r2 = await sbGet("workers", `select=id,data&data->>email=eq.${encodeURIComponent(email)}`);
        if (r2.length > 0) {
          onLoginSuccess({ ...r2[0].data, id:r2[0].id });
        } else {
          // Check pending_workers
          const pending = await sbGet("pending_workers", `select=id,status&data->>authEmail=eq.${encodeURIComponent(email)}`);
          clearSession();
          if (pending.length > 0) {
            setErr("Your account is pending admin approval. You'll be notified once approved.");
          } else {
            setErr("Account not found. Please contact your supervisor.");
          }
        }
      }
    } catch(e) {
      setErr(e.message==="Invalid login credentials" ? "Incorrect email or password." : e.message||"Sign in failed.");
    }
    setLoading(false);
  };

  const handleKey = e => { if (e.key==="Enter") handleLogin(); };

  return (
    <div style={{minHeight:"100vh",background:C.bg,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:20,fontFamily:"system-ui,sans-serif"}}>
      <div style={{marginBottom:28,textAlign:"center"}}>
        <div style={{width:64,height:64,background:"linear-gradient(135deg,#1a3a5f,#3b82f6)",borderRadius:18,display:"flex",alignItems:"center",justifyContent:"center",fontSize:28,margin:"0 auto 12px"}}>🏗</div>
        <div style={{fontSize:22,fontWeight:900,color:C.text}}>Bright Metalwork</div>
        <div style={{fontSize:13,color:C.muted,marginTop:3}}>Worker Portal</div>
      </div>
      <div style={{width:"100%",maxWidth:380}}>
        <Card style={{marginBottom:12}}>
          <div style={{fontSize:15,fontWeight:800,color:C.text,marginBottom:16}}>Sign In</div>
          <Inp label="Email Address" value={email} onChange={setEmail} type="email" placeholder="your@email.com" required/>
          <div style={{marginBottom:4}}>
            <Inp label="Password" value={password} onChange={setPassword} type="password" placeholder="Your password" required/>
          </div>
          <div style={{textAlign:"right",marginBottom:12}}>
            <button onClick={()=>setScreen("forgot")} style={{background:"none",border:"none",color:C.accent,fontSize:12,cursor:"pointer",textDecoration:"underline"}}>Forgot password?</button>
          </div>
          <Err msg={err}/>
          <button onClick={handleLogin} onKeyDown={handleKey} disabled={loading}
            style={{width:"100%",background:"linear-gradient(135deg,#1e3a5f,#3b82f6)",border:"none",borderRadius:10,padding:"13px",color:"#fff",fontSize:15,fontWeight:800,cursor:loading?"not-allowed":"pointer",opacity:loading?0.7:1}}>
            {loading?"Signing in…":"Sign In →"}
          </button>
        </Card>
        <div style={{textAlign:"center",marginBottom:8}}>
          <span style={{fontSize:13,color:C.muted}}>New to Bright Metalwork? </span>
          <button onClick={()=>setScreen("register")} style={{background:"none",border:"none",color:C.accent,fontSize:13,fontWeight:700,cursor:"pointer",textDecoration:"underline"}}>Register here</button>
        </div>
        <div style={{textAlign:"center",fontSize:11,color:C.muted}}>Bright Metalwork Ltd · Worker Portal</div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ANNOUNCEMENTS PANEL — reads from app_config.announcements
// ─────────────────────────────────────────────────────────────────────────────
function AnnouncementsPanel({ announcements, worker, onDismiss }) {
  const TYPES = {
    urgent:  { color:C.red,    bg:"#2d1515", icon:"🚨" },
    warning: { color:C.yellow, bg:"#1a1500", icon:"⚠️" },
    info:    { color:C.accent, bg:"#0d1a2e", icon:"📢" },
  };
  const dismissed = worker.dismissedAnnouncements || [];
  const visible = (announcements || []).filter(a => a.active && !dismissed.includes(a.id));
  if (!visible.length) return null;

  return <div style={{marginBottom:14}}>
    {visible.map(a => {
      const t = TYPES[a.type] || TYPES.info;
      return <div key={a.id} style={{background:t.bg,border:`1px solid ${t.color}44`,borderRadius:10,padding:"11px 13px",marginBottom:7,display:"flex",alignItems:"flex-start",gap:10}}>
        <span style={{fontSize:16,flexShrink:0}}>{t.icon}</span>
        <div style={{flex:1}}>
          <div style={{fontSize:12,fontWeight:800,color:t.color,marginBottom:2}}>{a.title}</div>
          {a.body&&<div style={{fontSize:12,color:C.sub,lineHeight:1.5}}>{a.body}</div>}
          <div style={{fontSize:10,color:C.muted,marginTop:4}}>{fmtDate(a.date)}</div>
        </div>
        <button onClick={()=>onDismiss(a.id)} style={{background:"none",border:`1px solid ${C.border}`,borderRadius:6,padding:"3px 8px",color:C.muted,cursor:"pointer",fontSize:11,flexShrink:0}}>✓ OK</button>
      </div>;
    })}
  </div>;
}

// ─────────────────────────────────────────────────────────────────────────────
// SIGN IN / OUT VIEW (GPS, override, announcements)
// ─────────────────────────────────────────────────────────────────────────────
function SignInOutView({ worker, allSites, weekLabel, announcements, onUpdateWorker }) {
  const TODAY   = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"][new Date().getDay()];
  const [phase, setPhase]         = useState("idle"); // idle|detecting|confirm|signing|outside
  const [error, setError]         = useState("");
  const [saving,setSaving]        = useState(false);
  const [nearby,setNearby]        = useState([]);
  const [userCoords,setUserCoords]= useState(null);
  const [overrideData,setOverrideData] = useState(null); // {site,coords,dist} for GPS override

  const weekLogs  = useMemo(()=>(worker.attendanceLogs||[]).filter(l=>l.weekLabel===weekLabel),[worker,weekLabel]);
  const todayLogs = useMemo(()=>weekLogs.filter(l=>l.day===TODAY),[weekLogs,TODAY]);
  const activeLog = useMemo(()=>todayLogs.find(l=>l.signIn&&!l.signOut),[todayLogs]);
  const isSignedIn = !!activeLog;

  const gpsSites  = useMemo(()=>allSites.filter(s=>!isOff(s.name)&&s.lat&&s.lng),[allSites]);

  const todayTotal = todayLogs.reduce((a,l)=>{
    if (!l.signOut) return a + hoursFromMs(Date.now()-new Date(l.signIn).getTime());
    return a + hoursFromMs(new Date(l.signOut)-new Date(l.signIn));
  },0);
  const weekTotal = weekLogs.reduce((a,l)=>l.signOut?a+hoursFromMs(new Date(l.signOut)-new Date(l.signIn)):a,0);

  const routeNotifs = (worker.routeNotifications||[]).filter(n=>n.weekLabel===weekLabel&&!n.seen);
  const dismissNotif = async id => {
    const updated = {...worker,routeNotifications:(worker.routeNotifications||[]).map(n=>n.id===id?{...n,seen:true}:n)};
    onUpdateWorker(updated);
    try { await sbPatch("workers",`id=eq.${worker.id}`,{data:updated}); } catch {}
  };

  const dismissAnnouncement = async id => {
    const updated = {...worker,dismissedAnnouncements:[...(worker.dismissedAnnouncements||[]),id]};
    onUpdateWorker(updated);
    try { await sbPatch("workers",`id=eq.${worker.id}`,{data:updated}); } catch {}
  };

  // ── Detect nearby sites ────────────────────────────────────────────────────
  const detectSites = async () => {
    setError(""); setPhase("detecting"); setNearby([]); setOverrideData(null);
    try {
      const coords = await getLocation();
      setUserCoords(coords);
      const found = gpsSites
        .map(site => ({ site, dist:Math.round(getDistanceMetres(coords.latitude,coords.longitude,site.lat,site.lng)), within:false }))
        .map(x => ({ ...x, within:x.dist<=(x.site.radius||100) }))
        .filter(x => x.dist <= (x.site.radius||100)*3)
        .sort((a,b)=>a.dist-b.dist);

      if (!found.length) { setPhase("blocked"); setError("No registered sites detected nearby. Make sure GPS is enabled and you are at your work location."); return; }
      setNearby(found); setPhase("confirm");
    } catch(e) { setError(e.message); setPhase("idle"); }
  };

  // ── Confirm sign in ────────────────────────────────────────────────────────
  const confirmSignIn = async (site, dist) => {
    if (dist>(site.radius||100)) { setError(`${dist}m from ${site.name} — you must be within ${site.radius||100}m.`); return; }
    setPhase("signing"); setSaving(true); setError("");
    try {
      const now = new Date();
      const tsKey = `ts_${worker.id}_${weekLabel.replace(/\s+/g,"_")}`;
      const log = {
        id:`log_${Date.now()}`, day:TODAY, weekLabel,
        siteId:site.id, siteName:site.name,
        signIn:now.toISOString(), signOut:null,
        lat:userCoords.latitude, lng:userCoords.longitude, distanceAtSignIn:dist,
        entryNum:todayLogs.length+1,
      };
      const newLogs = [...(worker.attendanceLogs||[]),log];
      const existingTs = (worker.timesheets||[]).find(t=>t.id===tsKey);
      const ts = existingTs
        ? {...existingTs,updatedAt:now.toISOString()}
        : {id:tsKey,workerId:worker.id,workerName:worker.name,weekLabel,createdAt:now.toISOString(),updatedAt:now.toISOString(),status:"open",entries:[]};
      const timesheets = existingTs ? (worker.timesheets||[]).map(t=>t.id===tsKey?ts:t) : [...(worker.timesheets||[]),ts];
      const updated = {...worker,attendanceLogs:newLogs,timesheets};
      await sbPatch("workers",`id=eq.${worker.id}`,{data:updated});
      onUpdateWorker(updated); setPhase("idle"); setNearby([]);
    } catch(e) { setError(e.message); setPhase("idle"); }
    setSaving(false);
  };

  // ── Sign out (GPS check + override) ───────────────────────────────────────
  const handleSignOut = async () => {
    if (!activeLog) return;
    setError(""); setPhase("detecting");
    const site = allSites.find(s=>s.id===activeLog.siteId);
    if (!site?.lat||!site?.lng) { setError(`${site?.name||"This site"} has no GPS configured.`); setPhase("idle"); return; }
    try {
      const coords = await getLocation();
      const dist   = Math.round(getDistanceMetres(coords.latitude,coords.longitude,site.lat,site.lng));
      if (dist>(site.radius||100)) {
        // Outside perimeter — offer override
        setOverrideData({site,coords,dist});
        setPhase("outside");
        setError(`You are ${dist}m from ${site.name} (perimeter: ${site.radius||100}m). You must be within range to sign out, or use the override if you've already left site.`);
        return;
      }
      await doSignOut(activeLog, site, coords, dist, false);
    } catch(e) { setError(e.message); setPhase("idle"); }
  };

  const handleOverrideSignOut = async () => {
    if (!overrideData||!activeLog) return;
    const { site, coords, dist } = overrideData;
    await doSignOut(activeLog, site, coords, dist, true);
  };

  const doSignOut = async (log, site, coords, dist, isOverride) => {
    setPhase("signing"); setSaving(true); setError("");
    try {
      const signOutTime  = new Date().toISOString();
      const totalHrs     = hoursFromMs(new Date(signOutTime)-new Date(log.signIn));
      const otThreshold  = site.otThreshold||site.stdHours||DEFAULT_HOURS;
      const stdHrsWorked = Math.min(totalHrs,otThreshold);
      const otHrsWorked  = Math.max(0,Math.round((totalHrs-otThreshold)*100)/100);

      const newLogs = (worker.attendanceLogs||[]).map(l=>
        l.id===log.id
          ? {...l, signOut:signOutTime, signOutLat:coords.latitude, signOutLng:coords.longitude,
              distanceAtSignOut:dist, hoursWorked:totalHrs, stdHours:stdHrsWorked, otHours:otHrsWorked,
              signOutOverride:isOverride }
          : l
      );

      const tsKey = `ts_${worker.id}_${weekLabel.replace(/\s+/g,"_")}`;
      const timesheets = (worker.timesheets||[]).map(t => {
        if (t.id!==tsKey) return t;
        const entry = {
          logId:log.id, day:TODAY, siteId:site.id, siteName:site.name,
          signIn:log.signIn, signOut:signOutTime, hours:totalHrs,
          stdHours:stdHrsWorked, otHours:otHrsWorked, entryNum:log.entryNum||1,
          override:isOverride,
        };
        const existing = t.entries?.find(e=>e.logId===log.id);
        const entries  = existing ? t.entries.map(e=>e.logId===log.id?entry:e) : [...(t.entries||[]),entry];
        const dailyTotals = {};
        entries.forEach(e=>{dailyTotals[e.day]=(dailyTotals[e.day]||0)+e.hours;});
        return {...t, entries, dailyTotals, updatedAt:new Date().toISOString()};
      });

      const updated = {...worker,attendanceLogs:newLogs,timesheets};
      await sbPatch("workers",`id=eq.${worker.id}`,{data:updated});
      onUpdateWorker(updated); setPhase("idle"); setOverrideData(null);
    } catch(e) { setError(e.message); setPhase("idle"); }
    setSaving(false);
  };

  const forecastDays = ALL_DAYS.filter(d=>worker.days?.[d]&&worker.days[d].trim());

  // Calculate actual calendar date for each day of the week
  const weekDates = useMemo(()=>{
    const MONTHS = {Jan:0,Feb:1,Mar:2,Apr:3,May:4,Jun:5,Jul:6,Aug:7,Sep:8,Oct:9,Nov:10,Dec:11};
    const MNAMES = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    let monday = null;
    try {
      const parts = weekLabel.trim().split(/\s+/);
      if (parts.length >= 3) {
        const candidate = new Date(parseInt(parts[2]), MONTHS[parts[1]], parseInt(parts[0]));
        if (!isNaN(candidate.getTime())) monday = candidate;
      }
    } catch {}
    if (!monday) {
      // Fallback: compute Monday of current real week
      const now = new Date();
      const dow = now.getDay(); // 0=Sun
      monday = new Date(now);
      monday.setDate(now.getDate() - (dow===0 ? 6 : dow-1));
      monday.setHours(0,0,0,0);
    }
    return Object.fromEntries(ALL_DAYS.map((d,i)=>{
      const dt = new Date(monday);
      dt.setDate(monday.getDate()+i);
      return [d, dt.getDate()+" "+MNAMES[dt.getMonth()]];
    }));
  },[weekLabel]);

  return <div style={{padding:14}}>

    {/* Announcements */}
    <AnnouncementsPanel announcements={announcements} worker={worker} onDismiss={dismissAnnouncement}/>

    {/* Route change notifications */}
    {routeNotifs.length>0&&<div style={{marginBottom:14}}>
      {routeNotifs.map(n=><div key={n.id} style={{background:"#1a1500",border:`1px solid ${C.yellow}44`,borderRadius:10,padding:"10px 13px",marginBottom:7,display:"flex",alignItems:"flex-start",gap:10}}>
        <span style={{fontSize:16,flexShrink:0}}>🔔</span>
        <div style={{flex:1}}>
          <div style={{fontSize:12,fontWeight:700,color:C.yellow}}>Route Updated — WC {n.weekLabel}</div>
          <div style={{fontSize:12,color:C.sub,marginTop:2}}><strong>{n.day}</strong>: changed from <span style={{color:C.red}}>"{n.from}"</span> to <span style={{color:C.green}}>"{n.to}"</span></div>
          <div style={{fontSize:10,color:C.muted,marginTop:2}}>{new Date(n.changedAt).toLocaleString("en-GB",{dateStyle:"short",timeStyle:"short"})}</div>
        </div>
        <button onClick={()=>dismissNotif(n.id)} style={{background:"none",border:`1px solid ${C.border}`,borderRadius:6,padding:"3px 8px",color:C.muted,cursor:"pointer",fontSize:11}}>✓ OK</button>
      </div>)}
    </div>}

    {/* Week ahead forecast */}
    {forecastDays.length>0&&<Card style={{marginBottom:14,border:`1px solid ${C.accent}44`}}>
      <div style={{fontSize:12,fontWeight:800,color:C.text,marginBottom:10}}>🗺 My Week Ahead</div>
      <div style={{display:"flex",flexDirection:"column",gap:5}}>
        {ALL_DAYS.map(d=>{
          const site=worker.days?.[d], off=!site||isOff(site);
          const confirmed=(worker.attendanceLogs||[]).find(l=>l.day===d&&l.weekLabel===weekLabel&&l.signIn&&l.signOut);
          const active2=(worker.attendanceLogs||[]).find(l=>l.day===d&&l.weekLabel===weekLabel&&l.signIn&&!l.signOut);
          const col=siteColor(site,allSites), isToday=d===TODAY;
          if (off&&!isToday) return null;
          return <div key={d} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 10px",background:isToday?"#1a1f2e":C.bg,borderRadius:8,border:`1px solid ${isToday?C.accent+"44":confirmed?C.green+"33":C.border}`}}>
            <div style={{minWidth:82,flexShrink:0}}>
              <div style={{display:"flex",alignItems:"baseline",gap:6}}>
                <div style={{fontSize:12,fontWeight:isToday?800:700,color:isToday?C.accent:C.sub}}>{d}</div>
                <div style={{fontSize:11,fontWeight:600,color:isToday?C.text:C.sub}}>{weekDates[d]||""}</div>
              </div>
            </div>
            {off
              ?<span style={{fontSize:11,color:C.muted,fontStyle:"italic",flex:1}}>Off / Not allocated</span>
              :<><div style={{flex:1,display:"flex",alignItems:"center",gap:6}}>
                  <div style={{width:7,height:7,borderRadius:"50%",background:col,flexShrink:0}}/>
                  <span style={{fontSize:12,fontWeight:600,color:C.text}}>{site.trim()}</span>
                </div>
                <span style={{fontSize:11,fontWeight:700,color:confirmed?C.green:active2?C.yellow:C.muted}}>
                  {confirmed?"✅ Confirmed":active2?"● On site":"📋 Forecast"}
                </span>
              </>}
          </div>;
        }).filter(Boolean)}
      </div>
      <div style={{marginTop:8,fontSize:10,color:C.muted}}>✅ Confirmed = GPS logged · 📋 Forecast = scheduled but not yet signed in</div>
    </Card>}

    {/* Today status card */}
    <Card style={{marginBottom:14,border:`1px solid ${isSignedIn?C.green+"44":C.border}`}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10}}>
        <div>
          <div style={{fontSize:14,fontWeight:800,color:C.text}}>Today — {TODAY}{weekDates[TODAY]?" · "+weekDates[TODAY]:""}</div>
          <div style={{fontSize:11,color:C.muted}}>WC {weekLabel}</div>
        </div>
        {todayLogs.length>0&&<div style={{textAlign:"right"}}>
          <div style={{fontSize:18,fontWeight:900,color:C.green}}>{todayTotal.toFixed(1)}h</div>
          <div style={{fontSize:9,color:C.muted}}>today total</div>
        </div>}
      </div>

      {/* Active sign-in with live timer */}
      {isSignedIn&&<div style={{display:"flex",alignItems:"center",gap:9,padding:"9px 12px",background:C.bg,borderRadius:9,border:`1px solid ${C.green}44`,marginBottom:12}}>
        <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:0.5}}`}</style>
        <div style={{width:10,height:10,borderRadius:"50%",background:C.green,flexShrink:0,boxShadow:`0 0 8px ${C.green}`,animation:"pulse 2s infinite"}}/>
        <div style={{flex:1}}>
          <div style={{fontSize:12,fontWeight:700,color:C.green}}>● On Site — {activeLog.siteName}</div>
          <div style={{fontSize:10,color:C.muted}}>Signed in {fmtTime(activeLog.signIn)} · Entry #{activeLog.entryNum||1}</div>
        </div>
        <div style={{fontSize:14,fontWeight:800,color:C.yellow}}><LiveTimer since={activeLog.signIn}/></div>
      </div>}

      {/* Completed entries today */}
      {todayLogs.filter(l=>l.signOut).length>0&&<div style={{marginBottom:12}}>
        <div style={{fontSize:10,color:C.muted,fontWeight:700,textTransform:"uppercase",marginBottom:6}}>Today's Entries</div>
        {todayLogs.filter(l=>l.signOut).map((l,i)=>{
          const hrs = hoursFromMs(new Date(l.signOut)-new Date(l.signIn));
          return <div key={l.id} style={{display:"flex",alignItems:"center",gap:8,padding:"5px 8px",background:C.bg,borderRadius:7,marginBottom:4,fontSize:11}}>
            <span style={{color:C.muted,minWidth:18}}>#{l.entryNum||i+1}</span>
            <span style={{color:C.sub,flex:1}}>{l.siteName}</span>
            <span style={{color:C.muted}}>{fmtTime(l.signIn)} → {fmtTime(l.signOut)}</span>
            <span style={{color:C.green,fontWeight:700,minWidth:32,textAlign:"right"}}>
              {hrs.toFixed(1)}h
              {l.signOutOverride&&<span style={{color:C.yellow,fontSize:9,marginLeft:4}}>⚠override</span>}
            </span>
          </div>;
        })}
      </div>}

      {/* Error / blocked / outside-perimeter */}
      {error&&<div style={{background:"#2d1515",border:`1px solid ${C.red}44`,borderRadius:8,padding:"10px 12px",marginBottom:12,fontSize:12,color:C.red,lineHeight:1.5}}>
        {phase==="outside"?"📍 ":phase==="blocked"?"🚫 ":""}{error}
      </div>}

      {/* Idle — detect button */}
      {!isSignedIn&&phase==="idle"&&<button onClick={detectSites}
        style={{width:"100%",background:"linear-gradient(135deg,#1e3a5f,#3b82f6)",border:"none",borderRadius:10,padding:"14px",color:"#fff",fontSize:15,fontWeight:800,cursor:"pointer"}}>
        📍 Detect My Location & Sign In
      </button>}

      {/* Detecting spinner */}
      {phase==="detecting"&&<div style={{textAlign:"center",padding:"18px 0",color:C.accent,fontSize:13,fontWeight:600}}>
        <div style={{fontSize:28,marginBottom:8}}>📡</div>Getting your GPS location…
      </div>}

      {/* Site selection */}
      {phase==="confirm"&&nearby.length>0&&<div>
        <div style={{fontSize:12,fontWeight:700,color:C.text,marginBottom:10}}>
          {nearby.filter(x=>x.within).length>0?"Sites detected nearby — tap to sign in:":"No sites within perimeter. Closest sites:"}
        </div>
        <div style={{display:"flex",flexDirection:"column",gap:8,marginBottom:10}}>
          {nearby.slice(0,4).map(({site,dist,within})=>{
            const col=siteColor(site.name,allSites);
            return <button key={site.id} onClick={()=>within&&confirmSignIn(site,dist)} disabled={!within||saving}
              style={{display:"flex",alignItems:"center",gap:12,padding:"12px 14px",background:within?"#0d2218":"#1a1f2e",border:`2px solid ${within?C.green:C.border}`,borderRadius:10,cursor:within?"pointer":"not-allowed",textAlign:"left",opacity:within?1:0.5}}>
              <div style={{width:10,height:10,borderRadius:"50%",background:col,flexShrink:0}}/>
              <div style={{flex:1}}>
                <div style={{fontSize:13,fontWeight:700,color:within?C.text:C.muted}}>{site.name}</div>
                <div style={{fontSize:11,color:within?C.green:C.red,fontWeight:600}}>{within?`✓ ${dist}m — within ${site.radius||100}m`:`${dist}m — outside ${site.radius||100}m perimeter`}</div>
              </div>
              {within&&<div style={{fontSize:13,fontWeight:800,color:C.green}}>{saving?"…":"Sign In ✓"}</div>}
            </button>;
          })}
        </div>
        <button onClick={()=>{setPhase("idle");setNearby([]);setError("");}} style={{width:"100%",padding:"9px",background:C.bg,border:`1px solid ${C.border}`,borderRadius:8,color:C.muted,cursor:"pointer",fontSize:12}}>Cancel</button>
      </div>}

      {/* Sign out button */}
      {isSignedIn&&(phase==="idle"||phase==="outside")&&phase!=="confirm"&&<>
        {phase!=="outside"&&<button onClick={handleSignOut} disabled={phase==="detecting"||saving}
          style={{width:"100%",background:"linear-gradient(135deg,#2d1515,#7f1d1d)",border:`1px solid ${C.red}`,borderRadius:10,padding:"14px",color:C.red,fontSize:15,fontWeight:800,cursor:"pointer",marginBottom:phase==="outside"?8:0}}>
          🔴 Sign Out
        </button>}
        {phase==="outside"&&<>
          <button onClick={handleOverrideSignOut} disabled={saving}
            style={{width:"100%",background:"#1a1500",border:`1px solid ${C.yellow}`,borderRadius:10,padding:"13px",color:C.yellow,fontSize:14,fontWeight:800,cursor:"pointer",marginBottom:8}}>
            {saving?"Signing out…":"⚠️ Override — Sign Out (I've left site)"}
          </button>
          <button onClick={()=>{setPhase("idle");setError("");setOverrideData(null);}} style={{width:"100%",padding:"9px",background:C.bg,border:`1px solid ${C.border}`,borderRadius:8,color:C.muted,cursor:"pointer",fontSize:12}}>Cancel</button>
        </>}
      </>}

      {/* Sign in again hint */}
      {!isSignedIn&&phase==="idle"&&todayLogs.length>0&&<div style={{marginTop:10,textAlign:"center",fontSize:11,color:C.muted}}>Entry #{todayLogs.length+1} — tap above to sign in again</div>}
    </Card>

    {/* Weekly summary */}
    {weekLogs.length>0&&<div>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:8}}>
        <div style={{fontSize:10,color:C.muted,fontWeight:700,textTransform:"uppercase"}}>This Week's Timesheet</div>
        <div style={{fontSize:12,fontWeight:800,color:C.green}}>{weekTotal.toFixed(1)}h total</div>
      </div>
      {ALL_DAYS.map(day=>{
        const dayLogs = weekLogs.filter(l=>l.day===day);
        if (!dayLogs.length) return null;
        const dayTotal = dayLogs.reduce((a,l)=>l.signOut?a+hoursFromMs(new Date(l.signOut)-new Date(l.signIn)):a,0);
        const col = siteColor(dayLogs[0].siteName,allSites);
        return <Card key={day} style={{borderLeft:`3px solid ${col}`,padding:"10px 13px",marginBottom:7}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:dayLogs.length>1?7:0}}>
            <div>
              <div style={{fontSize:12,fontWeight:800,color:C.text}}>{day}</div>
              <div style={{fontSize:10,color:C.muted}}>{dayLogs[0].siteName}{dayLogs.length>1?` +${dayLogs.length-1} more`:""}</div>
            </div>
            <div style={{textAlign:"right"}}>
              <div style={{fontSize:14,fontWeight:800,color:C.green}}>{dayTotal>0?dayTotal.toFixed(1)+"h":"in progress"}</div>
              <div style={{fontSize:9,color:C.muted}}>{dayLogs.length} {dayLogs.length===1?"entry":"entries"}</div>
            </div>
          </div>
          {dayLogs.length>1&&<div style={{display:"flex",flexDirection:"column",gap:3}}>
            {dayLogs.map((l,i)=>{
              const hrs=l.signOut?hoursFromMs(new Date(l.signOut)-new Date(l.signIn)):null;
              return <div key={l.id} style={{display:"flex",alignItems:"center",gap:7,fontSize:10,color:C.muted,padding:"3px 6px",background:C.bg,borderRadius:5}}>
                <span style={{minWidth:14}}>#{l.entryNum||i+1}</span>
                <span style={{flex:1}}>{fmtTime(l.signIn)} → {l.signOut?fmtTime(l.signOut):"on site"}</span>
                <span style={{color:l.signOut?C.green:C.yellow,fontWeight:600}}>{hrs?hrs.toFixed(1)+"h":"live"}{l.otHours>0&&<span style={{color:C.yellow,fontSize:9,marginLeft:3}}>(+{l.otHours.toFixed(1)}h OT)</span>}</span>
                {l.signOutOverride&&<span style={{fontSize:9,color:C.yellow}}>⚠</span>}
              </div>;
            })}
          </div>}
        </Card>;
      }).filter(Boolean)}
    </div>}
  </div>;
}

// ─────────────────────────────────────────────────────────────────────────────
// TIMESHEET VIEW — fixed print with correct breakdown
// ─────────────────────────────────────────────────────────────────────────────
function TimesheetView({ worker, weekLabel, siteHours, allSites, payslips }) {
  const activeDays = useMemo(()=>{
    const hw = WEEKEND_DAYS.some(d=>worker.days?.[d]&&!isOff(worker.days[d]));
    return hw ? ALL_DAYS : BASE_DAYS;
  },[worker]);
  const taxPct    = Math.round((worker.taxRate||0)*100);
  const currentPs = payslips.find(p=>p.weekLabel===weekLabel);

  const confirmedLogs = useMemo(()=>
    (worker.attendanceLogs||[]).filter(l=>l.weekLabel===weekLabel&&l.signIn&&l.signOut),
    [worker,weekLabel]
  );

  // Build proper day-by-day breakdown for print
  const { confirmedPay, confirmedBd } = useMemo(()=>{
    const rate = worker.agreedRate||0;
    const otM  = worker.overtimeMultiplier||1.5;
    let gross=0,stdH=0,otH=0;
    const bd = {};
    confirmedLogs.forEach(l=>{
      const d    = l.day;
      const std  = l.stdHours||(l.hoursWorked||0);
      const ot   = l.otHours||0;
      if (!bd[d]) bd[d] = {site:l.siteName,hours:0,ot:0,stdPay:0,otPay:0,gross:0};
      bd[d].hours += std; bd[d].ot += ot;
      bd[d].stdPay = bd[d].hours*rate;
      bd[d].otPay  = bd[d].ot*rate*otM;
      bd[d].gross  = bd[d].stdPay+bd[d].otPay;
      stdH+=std; otH+=ot;
      gross+=std*rate+ot*rate*otM;
    });
    const taxAmt = gross*(worker.taxRate||0);
    return { confirmedPay:{gross,taxAmt,net:gross-taxAmt,stdH,otH}, confirmedBd:bd };
  },[confirmedLogs,worker]);

  return <div style={{padding:14}}>
    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12,flexWrap:"wrap",gap:8}}>
      <div>
        <div style={{fontSize:13,fontWeight:800,color:C.text}}>Timesheet — WC {weekLabel}</div>
        <div style={{fontSize:11,color:C.muted}}>GPS-confirmed entries only</div>
      </div>
      <button onClick={()=>printPayslip(worker,weekLabel,confirmedPay.gross,confirmedPay.net,confirmedPay.taxAmt,taxPct,confirmedBd,activeDays)}
        style={{padding:"7px 13px",background:"#1a2535",border:`1px solid ${C.red}44`,borderRadius:8,color:C.red,cursor:"pointer",fontSize:12,fontWeight:700}}>📄 Print</button>
    </div>

    <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:7,marginBottom:14}}>
      <KPI label="Conf. Hrs" value={confirmedPay.stdH.toFixed(1)+"h"} color={C.green} sub="GPS confirmed"/>
      <KPI label="OT Hrs"    value={confirmedPay.otH>0?confirmedPay.otH.toFixed(1)+"h":"—"} color={C.yellow}/>
      <KPI label="Gross"     value={"£"+confirmedPay.gross.toFixed(0)} color={C.green}/>
      <KPI label="Net"       value={"£"+confirmedPay.net.toFixed(0)} color={C.purple}/>
    </div>

    <div style={{display:"flex",flexDirection:"column",gap:6,marginBottom:16}}>
      {activeDays.map(d=>{
        const forecastSite = worker.days?.[d];
        const off          = !forecastSite||isOff(forecastSite);
        const dayLogs      = confirmedLogs.filter(l=>l.day===d);
        const isConfirmed  = dayLogs.length>0;
        const col          = siteColor(forecastSite,allSites);
        const dayTotal     = dayLogs.reduce((a,l)=>a+(l.hoursWorked||hoursFromMs(new Date(l.signOut)-new Date(l.signIn))),0);

        return <Card key={d} style={{borderLeft:`3px solid ${isConfirmed?C.green:off?"#1e2535":C.yellow+"88"}`,padding:"10px 13px",background:isConfirmed?"#0d221822":C.card}}>
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            <div style={{fontSize:12,fontWeight:800,color:isConfirmed?C.green:off?C.muted:C.yellow,minWidth:32}}>{d}</div>
            {off&&!isConfirmed
              ?<span style={{fontSize:12,color:C.muted,fontStyle:"italic",flex:1}}>Off / Not allocated</span>
              :<>
                <div style={{flex:1}}>
                  <div style={{display:"flex",alignItems:"center",gap:5,flexWrap:"wrap"}}>
                    {forecastSite&&<Badge label={forecastSite.trim()} color={col}/>}
                    <span style={{fontSize:10,fontWeight:700,color:isConfirmed?C.green:C.yellow}}>{isConfirmed?"✅ Confirmed":"📋 Forecast — not yet signed in"}</span>
                  </div>
                  {isConfirmed&&dayLogs.map((l,i)=><div key={l.id} style={{fontSize:10,color:C.muted,marginTop:3}}>
                    Entry #{l.entryNum||i+1}: {fmtTime(l.signIn)} → {fmtTime(l.signOut)}{l.otHours>0?` · OT: ${l.otHours.toFixed(1)}h`:""}
                    {l.signOutOverride&&<span style={{color:C.yellow,marginLeft:4}}>⚠ override</span>}
                  </div>)}
                </div>
                {isConfirmed&&<span style={{fontSize:13,fontWeight:800,color:C.green}}>{dayTotal.toFixed(1)}h</span>}
              </>}
          </div>
        </Card>;
      })}
    </div>

    <Card style={{background:"linear-gradient(135deg,#0d2218,#1a3020)",border:`1px solid ${C.green}44`}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
        <div style={{fontSize:11,color:C.muted,fontWeight:700,textTransform:"uppercase"}}>Week Summary</div>
        {currentPs&&<Badge label={currentPs.status==="paid"?"✓ PAID":"Pending"} color={currentPs.status==="paid"?C.green:C.yellow}/>}
      </div>
      {[["Gross Pay","£"+confirmedPay.gross.toFixed(2),C.green],[`Tax (${taxPct}%)`,"-£"+confirmedPay.taxAmt.toFixed(2),C.red],["Net Pay","£"+confirmedPay.net.toFixed(2),C.purple]].map(([l,v,c])=>
        <div key={l} style={{display:"flex",justifyContent:"space-between",padding:"5px 0",borderBottom:`1px solid ${C.border}`}}><span style={{fontSize:12,color:C.muted}}>{l}</span><span style={{fontSize:13,fontWeight:700,color:c}}>{v}</span></div>
      )}
      <div style={{display:"flex",justifyContent:"space-between",padding:"8px 0 0"}}><span style={{fontSize:13,fontWeight:800,color:C.sub}}>NET TO ACCOUNT</span><span style={{fontSize:20,fontWeight:900,color:C.green}}>£{confirmedPay.net.toFixed(2)}</span></div>
      {confirmedLogs.length===0&&<div style={{marginTop:8,fontSize:11,color:C.yellow,textAlign:"center"}}>No GPS confirmations yet this week — sign in on site to confirm your days.</div>}
    </Card>
  </div>;
}

// ─────────────────────────────────────────────────────────────────────────────
// PAYSLIP HISTORY
// ─────────────────────────────────────────────────────────────────────────────
function PayslipHistory({ worker, payslips }) {
  const [openId,setOpenId] = useState(null);
  if (!payslips.length) return <div style={{padding:24,textAlign:"center"}}><div style={{fontSize:32,marginBottom:10}}>📋</div><div style={{color:C.muted,fontSize:13}}>No payslip history yet. Past weeks will appear here once saved by the system.</div></div>;
  return <div style={{padding:14}}>
    <div style={{fontSize:11,color:C.muted,marginBottom:12}}>All payslips are saved automatically each week.</div>
    {[...payslips].sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt)).map(ps=>{
      const isPaid=ps.status==="paid", isOpen=openId===ps.id;
      return <Card key={ps.id} style={{marginBottom:8,border:`1px solid ${isPaid?C.green+"44":C.border}`}}>
        <div style={{display:"flex",alignItems:"center",gap:10,cursor:"pointer"}} onClick={()=>setOpenId(isOpen?null:ps.id)}>
          <div style={{flex:1}}><div style={{fontSize:13,fontWeight:700,color:C.text}}>WC {ps.weekLabel}</div><div style={{fontSize:11,color:C.muted,marginTop:2}}>{fmtDate(ps.createdAt)}</div></div>
          <div style={{textAlign:"right",marginRight:8}}><div style={{fontSize:15,fontWeight:800,color:isPaid?C.green:C.yellow}}>£{ps.net?.toFixed(2)||"—"}</div><div style={{fontSize:10,color:C.muted}}>net</div></div>
          <Badge label={isPaid?"✓ Paid":"Pending"} color={isPaid?C.green:C.yellow}/>
          <span style={{color:C.muted,fontSize:14}}>{isOpen?"▲":"▼"}</span>
        </div>
        {isOpen&&<div style={{marginTop:12,paddingTop:12,borderTop:`1px solid ${C.border}`}}>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:7,marginBottom:10}}>
            <KPI label="Gross" value={"£"+(ps.gross||0).toFixed(2)} color={C.green}/>
            <KPI label="Tax"   value={"£"+(ps.taxAmt||0).toFixed(2)} color={C.red}/>
            <KPI label="Net"   value={"£"+(ps.net||0).toFixed(2)} color={C.purple}/>
          </div>
          {isPaid&&<div style={{background:"#0d2218",borderRadius:8,padding:"8px 12px",marginBottom:10,fontSize:12,color:C.green}}>✓ Paid on {fmtDate(ps.paidAt)}{ps.paidNote?` · ${ps.paidNote}`:""}</div>}
          <button onClick={()=>printPayslip(worker,ps.weekLabel,ps.gross||0,ps.net||0,ps.taxAmt||0,Math.round((worker.taxRate||0)*100),ps.bd||{},Object.keys(ps.bd||{}).length>5?ALL_DAYS:BASE_DAYS)}
            style={{width:"100%",padding:"9px",background:"#1a2535",border:`1px solid ${C.red}44`,borderRadius:8,color:C.red,cursor:"pointer",fontSize:12,fontWeight:700}}>📄 Print Payslip</button>
        </div>}
      </Card>;
    })}
  </div>;
}

// ─────────────────────────────────────────────────────────────────────────────
// LEAVE REQUEST VIEW
// ─────────────────────────────────────────────────────────────────────────────
function LeaveRequestView({ worker, onSave }) {
  const [showForm, setShowForm] = useState(false);
  const [type,     setType]     = useState("");
  const [from,     setFrom]     = useState("");
  const [to,       setTo]       = useState("");
  const [reason,   setReason]   = useState("");
  const [saving,   setSaving]   = useState(false);
  const [err,      setErr]      = useState("");

  const requests = (worker.leaveRequests||[]).sort((a,b)=>new Date(b.submittedAt)-new Date(a.submittedAt));

  const LEAVE_TYPES = ["Sick","Holiday","Personal","Other"];
  const STATUS_COLORS = { pending:C.yellow, approved:C.green, declined:C.red };
  const STATUS_ICONS  = { pending:"⏳", approved:"✅", declined:"❌" };

  const submit = async () => {
    setErr("");
    if (!type)  return setErr("Please select a leave type.");
    if (!from)  return setErr("Please set a start date.");
    if (!to)    return setErr("Please set an end date.");
    if (new Date(to)<new Date(from)) return setErr("End date must be on or after start date.");
    setSaving(true);
    try {
      const req = { id:`leave_${Date.now()}`, type, fromDate:from, toDate:to, reason, status:"pending", submittedAt:new Date().toISOString() };
      const updated = {...worker, leaveRequests:[...(worker.leaveRequests||[]),req]};
      await sbPatch("workers",`id=eq.${worker.id}`,{data:updated});
      onSave(updated);
      setShowForm(false); setType(""); setFrom(""); setTo(""); setReason("");
    } catch(e) { setErr(e.message||"Failed to submit request."); }
    setSaving(false);
  };

  return <div style={{padding:14}}>
    {/* New request button */}
    {!showForm&&<button onClick={()=>setShowForm(true)}
      style={{width:"100%",background:"linear-gradient(135deg,#1e3a5f,#3b82f6)",border:"none",borderRadius:10,padding:"13px",color:"#fff",fontSize:14,fontWeight:800,cursor:"pointer",marginBottom:14}}>
      + Submit Leave / Absence Request
    </button>}

    {/* Request form */}
    {showForm&&<Card style={{marginBottom:14}}>
      <div style={{fontSize:14,fontWeight:800,color:C.text,marginBottom:14}}>📅 New Leave Request</div>
      <Sel label="Type" value={type} onChange={setType} options={LEAVE_TYPES} required/>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"0 12px"}}>
        <Inp label="From Date" value={from} onChange={setFrom} type="date" required/>
        <Inp label="To Date"   value={to}   onChange={setTo}   type="date" required/>
      </div>
      <div style={{marginBottom:13}}>
        <Lbl>Notes / Reason (optional)</Lbl>
        <textarea value={reason} onChange={e=>setReason(e.target.value)} placeholder="Any additional information…"
          style={{width:"100%",background:C.bg,border:`1px solid ${C.border}`,borderRadius:9,padding:"11px 13px",color:C.text,fontSize:13,outline:"none",boxSizing:"border-box",resize:"vertical",minHeight:72,fontFamily:"inherit"}}/>
      </div>
      <Err msg={err}/>
      <div style={{display:"flex",gap:10}}>
        <button onClick={()=>{setShowForm(false);setErr("");}} style={{flex:1,background:C.card,border:`1px solid ${C.border}`,borderRadius:10,padding:"11px",color:C.sub,fontSize:13,fontWeight:700,cursor:"pointer"}}>Cancel</button>
        <button onClick={submit} disabled={saving} style={{flex:2,background:"linear-gradient(135deg,#14532d,#16a34a)",border:"none",borderRadius:10,padding:"11px",color:"#fff",fontSize:13,fontWeight:800,cursor:saving?"not-allowed":"pointer",opacity:saving?0.7:1}}>{saving?"Submitting…":"✓ Submit Request"}</button>
      </div>
    </Card>}

    {/* Request history */}
    {!requests.length
      ?<div style={{textAlign:"center",padding:"28px 0"}}><div style={{fontSize:32,marginBottom:10}}>🏖</div><div style={{color:C.muted,fontSize:13}}>No leave requests yet. Submit one above.</div></div>
      :<div>
        <div style={{fontSize:10,color:C.muted,fontWeight:700,textTransform:"uppercase",marginBottom:10}}>Your Requests</div>
        {requests.map(r=>{
          const col = STATUS_COLORS[r.status]||C.muted;
          const days = Math.max(1,Math.round((new Date(r.toDate)-new Date(r.fromDate))/86400000)+1);
          return <Card key={r.id} style={{marginBottom:8,border:`1px solid ${col}22`}}>
            <div style={{display:"flex",alignItems:"flex-start",gap:10}}>
              <span style={{fontSize:20}}>{STATUS_ICONS[r.status]||"📋"}</span>
              <div style={{flex:1}}>
                <div style={{fontSize:13,fontWeight:700,color:C.text}}>{r.type}</div>
                <div style={{fontSize:11,color:C.muted,marginTop:2}}>
                  {fmtDate(r.fromDate)}{r.fromDate!==r.toDate?` → ${fmtDate(r.toDate)}`:""} · {days} day{days!==1?"s":""}
                </div>
                {r.reason&&<div style={{fontSize:11,color:C.sub,marginTop:3,fontStyle:"italic"}}>"{r.reason}"</div>}
                {r.reviewNote&&<div style={{fontSize:11,color:col,marginTop:4,fontWeight:600}}>Admin note: {r.reviewNote}</div>}
              </div>
              <Badge label={r.status.charAt(0).toUpperCase()+r.status.slice(1)} color={col}/>
            </div>
            <div style={{fontSize:10,color:C.muted,marginTop:8}}>Submitted {fmtDate(r.submittedAt)}</div>
          </Card>;
        })}
      </div>}
  </div>;
}

// ─────────────────────────────────────────────────────────────────────────────
// RECORDS VIEW — payslip history + leave (sub-tabs)
// ─────────────────────────────────────────────────────────────────────────────
function RecordsView({ worker, payslips, onSave }) {
  const [sub, setSub] = useState("payslips");
  const hasPaidNotif  = payslips.some(p=>p.status==="paid"&&!p.workerAcknowledged);
  const pendingLeave  = (worker.leaveRequests||[]).filter(r=>r.status==="pending").length;

  return <div>
    <div style={{display:"flex",background:"#111827",borderBottom:`1px solid ${C.border}`,padding:"6px 14px 0",gap:6}}>
      {[["payslips",`📋 Payslips${hasPaidNotif?" 🔴":""}`],["leave",`🏖 Leave${pendingLeave>0?` (${pendingLeave})`:""}`]].map(([v,l])=>(
        <button key={v} onClick={()=>setSub(v)} style={{padding:"8px 14px",background:sub===v?"#1e3a5f":"transparent",border:sub===v?`1px solid ${C.accent}`:"1px solid transparent",borderRadius:"7px 7px 0 0",color:sub===v?C.accent:C.muted,cursor:"pointer",fontSize:12,fontWeight:sub===v?700:400}}>{l}</button>
      ))}
    </div>
    {sub==="payslips"&&<PayslipHistory worker={worker} payslips={payslips}/>}
    {sub==="leave"&&<LeaveRequestView worker={worker} onSave={onSave}/>}
  </div>;
}

// ─────────────────────────────────────────────────────────────────────────────
// DOCUMENTS VIEW — reads from app_config.worker_documents
// ─────────────────────────────────────────────────────────────────────────────
function DocumentsView({ documents }) {
  const CATS = { policy:"📋 Policy", induction:"📚 Induction", method:"🔧 Method Statement", risk:"⚠️ Risk Assessment", other:"📄 Other" };
  const CATS_ORDER = ["induction","method","risk","policy","other"];
  const grouped = {};
  (documents||[]).forEach(d=>{ const c=d.category||"other"; if (!grouped[c]) grouped[c]=[]; grouped[c].push(d); });

  if (!documents?.length) return (
    <div style={{padding:24,textAlign:"center"}}>
      <div style={{fontSize:32,marginBottom:10}}>📂</div>
      <div style={{color:C.muted,fontSize:13}}>No documents available yet. Your admin will upload documents here.</div>
    </div>
  );

  return <div style={{padding:14}}>
    <div style={{fontSize:11,color:C.muted,marginBottom:14}}>Tap any document to view or download.</div>
    {CATS_ORDER.filter(c=>grouped[c]).map(cat=>(
      <div key={cat} style={{marginBottom:16}}>
        <div style={{fontSize:11,fontWeight:700,color:C.accent,textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:8}}>{CATS[cat]||cat}</div>
        {grouped[cat].map(doc=>(
          <a key={doc.id} href={doc.url} target="_blank" rel="noreferrer" style={{textDecoration:"none"}}>
            <Card style={{marginBottom:7,display:"flex",alignItems:"center",gap:12,padding:"12px 14px",cursor:"pointer"}}>
              <div style={{fontSize:22,flexShrink:0}}>📄</div>
              <div style={{flex:1}}>
                <div style={{fontSize:13,fontWeight:600,color:C.text}}>{doc.title}</div>
                <div style={{fontSize:10,color:C.muted,marginTop:2}}>{doc.size||""}{doc.size&&doc.updatedAt?" · ":""}{doc.updatedAt?`Updated ${fmtDate(doc.updatedAt)}`:""}</div>
              </div>
              <span style={{fontSize:14,color:C.accent}}>↗</span>
            </Card>
          </a>
        ))}
      </div>
    ))}
  </div>;
}

// ─────────────────────────────────────────────────────────────────────────────
// EDIT CERTS VIEW — shows only held certs; Add Cert button opens full list
// ─────────────────────────────────────────────────────────────────────────────
function EditCertsView({ worker, onSave }) {
  const [certs,       setCerts]       = useState({...(worker.certs||{})});
  const [uploading,   setUploading]   = useState({});
  const [saving,      setSaving]      = useState(false);
  const [saved,       setSaved]       = useState(false);
  const [showAddPanel,setShowAddPanel]= useState(false);

  const toggle    = key => setCerts(c=>({...c,[key]:{...c[key],held:!c[key]?.held}}));
  const setExpiry = (key,val) => setCerts(c=>({...c,[key]:{...c[key],expiry:val}}));
  const handlePhoto = async (key,file) => {
    if (!file) return; setUploading(u=>({...u,[key]:true}));
    try { const url=await uploadCertPhoto(file,worker.id,key); setCerts(c=>({...c,[key]:{...c[key],photoUrl:url}})); }
    catch(e) { alert("Upload failed: "+e.message); }
    setUploading(u=>({...u,[key]:false}));
  };
  const save = async () => {
    setSaving(true); setSaved(false);
    try {
      const updated={...worker,certs};
      await sbPatch("workers",`id=eq.${worker.id}`,{data:updated});
      onSave(updated); setSaved(true); setTimeout(()=>setSaved(false),3000);
    } catch(e) { alert("Save failed: "+e.message); }
    setSaving(false);
  };

  const CERT_C = {valid:C.green, expiring:C.yellow, expired:C.red};
  const getStatus = cert => {
    const v = certs[cert.key];
    if (!v?.held) return "missing";
    if (!cert.hasExpiry||!v.expiry) return "valid";
    const d = (new Date(v.expiry)-new Date())/86400000;
    return d<0?"expired":d<30?"expiring":"valid";
  };

  // Only held certs, sorted by urgency
  const heldCerts = [...CERTS]
    .filter(c => certs[c.key]?.held)
    .sort((a,b) => CERT_STATUS_ORDER[getStatus(a)]-CERT_STATUS_ORDER[getStatus(b)]);

  // Certs not yet added (for the Add panel)
  const notHeldCerts = CERTS.filter(c => !certs[c.key]?.held);

  // KPI counts (only from held certs)
  const counts = {valid:0, expiring:0, expired:0};
  heldCerts.forEach(c => { const s=getStatus(c); if (counts[s]!==undefined) counts[s]++; });

  const addCert = key => {
    setCerts(c=>({...c,[key]:{...c[key],held:true}}));
    setShowAddPanel(false);
  };
  const removeCert = key => setCerts(c=>({...c,[key]:{...c[key],held:false}}));

  // ── ADD PANEL ───────────────────────────────────────────────────────────────
  if (showAddPanel) return (
    <div style={{padding:14}}>
      <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:16,paddingBottom:12,borderBottom:`1px solid ${C.border}`}}>
        <button onClick={()=>setShowAddPanel(false)}
          style={{background:"none",border:`1px solid ${C.border}`,borderRadius:8,padding:"7px 12px",color:C.sub,cursor:"pointer",fontSize:13}}>← Back</button>
        <div>
          <div style={{fontSize:14,fontWeight:800,color:C.text}}>Add Certification</div>
          <div style={{fontSize:11,color:C.muted,marginTop:1}}>Tap a certification to add it to your profile</div>
        </div>
      </div>
      {notHeldCerts.length===0
        ?<div style={{textAlign:"center",padding:"28px 0"}}>
          <div style={{fontSize:32,marginBottom:10}}>🎉</div>
          <div style={{color:C.muted,fontSize:13}}>All certifications are already on your profile!</div>
          <button onClick={()=>setShowAddPanel(false)} style={{marginTop:14,padding:"8px 20px",background:"#1e3a5f",border:`1px solid ${C.accent}`,borderRadius:8,color:C.accent,cursor:"pointer",fontSize:12,fontWeight:700}}>← Back to my certs</button>
        </div>
        :<div style={{display:"flex",flexDirection:"column",gap:7}}>
          {notHeldCerts.map(cert=>(
            <div key={cert.key} onClick={()=>addCert(cert.key)}
              style={{display:"flex",alignItems:"center",gap:12,padding:"12px 14px",background:C.card,border:`1px solid ${C.border}`,borderRadius:10,cursor:"pointer"}}>
              <div style={{width:22,height:22,borderRadius:6,background:C.bg,border:`2px solid ${C.border}`,flexShrink:0}}/>
              <div style={{flex:1}}>
                <div style={{fontSize:13,color:C.sub}}>{cert.label}</div>
                {cert.hasExpiry&&<div style={{fontSize:10,color:C.muted,marginTop:1}}>Requires expiry date</div>}
              </div>
              <span style={{fontSize:13,color:C.accent,fontWeight:700}}>+ Add</span>
            </div>
          ))}
        </div>}
    </div>
  );

  // ── MAIN VIEW (held certs only) ─────────────────────────────────────────────
  return <div style={{padding:14}}>
    {/* Header */}
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
      <div style={{fontSize:13,fontWeight:800,color:C.text}}>🛡 My Certifications</div>
      <button onClick={save} disabled={saving}
        style={{padding:"7px 14px",background:"#14532d",border:`1px solid ${C.green}`,borderRadius:8,color:C.green,cursor:"pointer",fontSize:12,fontWeight:700,opacity:saving?0.7:1}}>
        {saving?"Saving…":saved?"✓ Saved!":"💾 Save"}
      </button>
    </div>

    {/* Summary KPIs — only if there are held certs */}
    {heldCerts.length>0&&<div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:7,marginBottom:14}}>
      {[["Valid",counts.valid,C.green],["Expiring",counts.expiring,C.yellow],["Expired",counts.expired,C.red]].map(([l,n,col])=>(
        <div key={l} style={{background:C.bg,borderRadius:8,padding:"8px 4px",textAlign:"center",border:`1px solid ${col}22`}}>
          <div style={{fontSize:18,fontWeight:900,color:col}}>{n}</div>
          <div style={{fontSize:9,color:C.muted,fontWeight:700,textTransform:"uppercase"}}>{l}</div>
        </div>
      ))}
    </div>}

    {/* Empty state */}
    {heldCerts.length===0&&<div style={{textAlign:"center",padding:"24px 0 16px"}}>
      <div style={{fontSize:36,marginBottom:10}}>🛡</div>
      <div style={{color:C.muted,fontSize:13,marginBottom:4}}>No certifications added yet.</div>
      <div style={{color:C.muted,fontSize:12}}>Tap the button below to add your qualifications.</div>
    </div>}

    {/* Held certs list */}
    <div style={{display:"flex",flexDirection:"column",gap:8,marginBottom:14}}>
      {heldCerts.map(cert=>{
        const expiry=certs[cert.key]?.expiry||"", photoUrl=certs[cert.key]?.photoUrl||"", isUp=uploading[cert.key];
        const s=getStatus(cert);
        return <div key={cert.key} style={{background:C.bg,borderRadius:10,border:`1px solid ${(CERT_C[s]||C.border)+"44"}`,overflow:"hidden"}}>
          {/* Cert header */}
          <div style={{display:"flex",alignItems:"center",gap:10,padding:"12px 13px"}}>
            <div style={{width:22,height:22,borderRadius:6,background:C.accent,border:`2px solid ${C.accent}`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
              <span style={{color:"#fff",fontSize:13,fontWeight:900}}>✓</span>
            </div>
            <div style={{flex:1}}>
              <div style={{fontSize:13,fontWeight:700,color:C.text}}>{cert.label}</div>
              {cert.hasExpiry&&!expiry&&<div style={{fontSize:10,color:C.yellow,marginTop:1}}>⚠ No expiry date set</div>}
            </div>
            <Badge label={s==="valid"?"✓ Valid":s==="expiring"?"⚠ Expiring":"✗ Expired"} color={CERT_C[s]||C.muted}/>
            <button onClick={()=>removeCert(cert.key)} title="Remove this cert"
              style={{background:"none",border:"none",color:C.muted,cursor:"pointer",fontSize:16,padding:"0 0 0 4px",lineHeight:1}}>×</button>
          </div>
          {/* Expiry + photo */}
          <div style={{padding:"0 13px 13px",borderTop:`1px solid ${C.border}`}}>
            {cert.hasExpiry&&<div style={{marginTop:10}}>
              <Lbl>Expiry Date</Lbl>
              <input type="date" value={expiry} onChange={e=>setExpiry(cert.key,e.target.value)}
                style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:7,padding:"8px 10px",color:C.text,fontSize:13,outline:"none",width:"100%",boxSizing:"border-box"}}/>
              {expiry&&s==="expiring"&&<div style={{fontSize:11,color:C.yellow,marginTop:4}}>⚠ Expiring soon — please renew</div>}
              {expiry&&s==="expired" &&<div style={{fontSize:11,color:C.red,  marginTop:4}}>✗ This certification has expired</div>}
            </div>}
            <div style={{marginTop:10}}>
              <Lbl>Photo of Certificate</Lbl>
              <label style={{display:"flex",alignItems:"center",gap:10,padding:"9px 12px",background:C.card,border:`1px dashed ${photoUrl?C.green:C.border}`,borderRadius:8,cursor:"pointer"}}>
                <span style={{fontSize:16}}>{isUp?"⏳":photoUrl?"✅":"📷"}</span>
                <span style={{fontSize:12,color:photoUrl?C.green:C.muted,fontWeight:photoUrl?700:400}}>{isUp?"Uploading…":photoUrl?"Uploaded — tap to replace":"Tap to upload photo"}</span>
                <input type="file" accept="image/*,application/pdf" style={{display:"none"}} onChange={e=>handlePhoto(cert.key,e.target.files[0])}/>
              </label>
              {photoUrl&&<img src={photoUrl} alt={cert.label} style={{marginTop:8,width:"100%",maxHeight:100,objectFit:"cover",borderRadius:6,border:`1px solid ${C.border}`,cursor:"pointer"}} onClick={()=>window.open(photoUrl,"_blank")}/>}
            </div>
          </div>
        </div>;
      })}
    </div>

    {/* Add Certification button */}
    <button onClick={()=>setShowAddPanel(true)}
      style={{width:"100%",padding:"13px",background:"#0d1a2e",border:`2px dashed ${C.accent}44`,borderRadius:10,color:C.accent,fontSize:14,fontWeight:700,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:8}}>
      <span style={{fontSize:18,fontWeight:400}}>+</span>
      Add Certification
      {notHeldCerts.length>0&&<span style={{fontSize:11,color:C.muted,fontWeight:400}}>({notHeldCerts.length} available)</span>}
    </button>
  </div>;
}

// ─────────────────────────────────────────────────────────────────────────────
// PERSONAL VIEW
// ─────────────────────────────────────────────────────────────────────────────
function PersonalView({ worker, onSave, documents }) {
  const [sub,     setSub]   = useState("details");
  const [editing, setEditing]= useState(false);
  const [saving,  setSaving] = useState(false);
  const [err,     setErr]    = useState("");
  const [f, setF] = useState({
    name:worker.name||"", phone:worker.phone||"", address:worker.address||"",
    niNumber:worker.niNumber||"", emergencyName:worker.emergencyName||"",
    emergencyPhone:worker.emergencyPhone||"", bankName:worker.bankName||"",
    sortCode:worker.sortCode||"", accountNo:worker.accountNo||"",
  });
  const set = (k,v) => setF(x=>({...x,[k]:v}));

  const save = async () => {
    setSaving(true); setErr("");
    try {
      const now = new Date().toISOString();
      const history = [...(worker.detailsHistory||[]), {changedAt:now, snapshot:{...f}}];
      const updated = {...worker,...f,detailsHistory:history};
      await sbPatch("workers",`id=eq.${worker.id}`,{data:updated});
      onSave(updated); setEditing(false);
    } catch(e) { setErr("Save failed: "+e.message); }
    setSaving(false);
  };

  const PERSONAL_FIELDS = [["Full Name","name"],["Phone Number","phone"],["Home Address","address"],["NI Number","niNumber"],["Emergency Contact Name","emergencyName"],["Emergency Contact Phone","emergencyPhone"]];
  const BANK_FIELDS     = [["Bank Name","bankName"],["Sort Code","sortCode"],["Account Number","accountNo"]];

  return <div>
    <div style={{display:"flex",background:"#111827",borderBottom:`1px solid ${C.border}`,padding:"6px 14px 0",gap:6}}>
      {[["details","👤 Details"],["docs","📄 Documents"]].map(([v,l])=>(
        <button key={v} onClick={()=>setSub(v)} style={{padding:"8px 14px",background:sub===v?"#1e3a5f":"transparent",border:sub===v?`1px solid ${C.accent}`:"1px solid transparent",borderRadius:"7px 7px 0 0",color:sub===v?C.accent:C.muted,cursor:"pointer",fontSize:12,fontWeight:sub===v?700:400}}>{l}</button>
      ))}
    </div>

    {sub==="docs"&&<DocumentsView documents={documents}/>}

    {sub==="details"&&<div style={{padding:14}}>
      <Err msg={err}/>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
        <div style={{fontSize:13,fontWeight:800,color:C.text}}>Personal Details</div>
        {!editing
          ?<button onClick={()=>setEditing(true)} style={{padding:"7px 13px",background:"#1e3a5f",border:`1px solid ${C.accent}`,borderRadius:8,color:C.accent,cursor:"pointer",fontSize:12,fontWeight:700}}>✏️ Edit</button>
          :<div style={{display:"flex",gap:8}}>
            <button onClick={()=>setEditing(false)} style={{padding:"7px 13px",background:C.card,border:`1px solid ${C.border}`,borderRadius:8,color:C.muted,cursor:"pointer",fontSize:12,fontWeight:700}}>Cancel</button>
            <button onClick={save} disabled={saving} style={{padding:"7px 13px",background:"#14532d",border:`1px solid ${C.green}`,borderRadius:8,color:C.green,cursor:"pointer",fontSize:12,fontWeight:700}}>{saving?"Saving…":"✓ Save"}</button>
          </div>}
      </div>
      <Card style={{marginBottom:12}}>
        <div style={{fontSize:10,fontWeight:700,color:C.accent,textTransform:"uppercase",marginBottom:10}}>Personal Information</div>
        {PERSONAL_FIELDS.map(([label,key])=><div key={key} style={{marginBottom:editing?0:8}}>
          {editing
            ?<Inp label={label} value={f[key]} onChange={v=>set(key,v)}/>
            :<div style={{display:"flex",justifyContent:"space-between",padding:"6px 0",borderBottom:`1px solid ${C.border}`}}><span style={{fontSize:12,color:C.muted}}>{label}</span><span style={{fontSize:13,fontWeight:600,color:f[key]?C.text:C.muted}}>{f[key]||"—"}</span></div>}
        </div>)}
      </Card>
      <Card style={{marginBottom:12}}>
        <div style={{fontSize:10,fontWeight:700,color:C.green,textTransform:"uppercase",marginBottom:10}}>🏦 Bank Details</div>
        {BANK_FIELDS.map(([label,key])=><div key={key} style={{marginBottom:editing?0:8}}>
          {editing
            ?<Inp label={label} value={f[key]} onChange={v=>set(key,v)}/>
            :<div style={{display:"flex",justifyContent:"space-between",padding:"6px 0",borderBottom:`1px solid ${C.border}`}}><span style={{fontSize:12,color:C.muted}}>{label}</span><span style={{fontSize:13,fontWeight:600,color:f[key]?C.text:C.muted}}>{key==="accountNo"&&f[key]?"••••"+f[key].slice(-4):f[key]||"—"}</span></div>}
        </div>)}
      </Card>
      <Card style={{marginBottom:12}}>
        <div style={{fontSize:10,fontWeight:700,color:C.purple,textTransform:"uppercase",marginBottom:10}}>💷 Payment Info (Admin Set)</div>
        {[["Hourly Rate",worker.agreedRate?"£"+worker.agreedRate+"/hr":"Not set"],["Tax Rate",Math.round((worker.taxRate||0)*100)+"%"],["Position",worker.position||"—"],["Company",worker.company||"—"]].map(([l,v])=>
          <div key={l} style={{display:"flex",justifyContent:"space-between",padding:"6px 0",borderBottom:`1px solid ${C.border}`}}><span style={{fontSize:12,color:C.muted}}>{l}</span><span style={{fontSize:13,fontWeight:600,color:C.text}}>{v}</span></div>
        )}
      </Card>
      {(worker.detailsHistory||[]).length>0&&<Card>
        <div style={{fontSize:10,fontWeight:700,color:C.yellow,textTransform:"uppercase",marginBottom:10}}>📋 Change History</div>
        <div style={{display:"flex",flexDirection:"column",gap:6,maxHeight:200,overflowY:"auto"}}>
          {[...worker.detailsHistory].reverse().map((h,i)=>(
            <div key={i} style={{background:C.bg,borderRadius:7,padding:"8px 10px",fontSize:11}}>
              <div style={{color:C.muted,marginBottom:3}}>Changed on {fmtDate(h.changedAt)}</div>
              <div style={{color:C.sub}}>Name: {h.snapshot?.name||"—"} · Phone: {h.snapshot?.phone||"—"}</div>
            </div>
          ))}
        </div>
      </Card>}
    </div>}
  </div>;
}

// ─────────────────────────────────────────────────────────────────────────────
// DASHBOARD
// ─────────────────────────────────────────────────────────────────────────────
function Dashboard({ worker:iw, weekLabel, siteHours, allSites, payslips, announcements, documents, onLogout, onRefresh, refreshing }) {
  const [worker, setWorker] = useState(iw);
  const [tab,    setTab]    = useState("attendance");

  // Sync if parent refreshes worker data
  useEffect(()=>{ setWorker(iw); },[iw]);

  const hasPaidNotif  = payslips.some(p=>p.status==="paid"&&!p.workerAcknowledged);
  const certAlerts    = CERTS.filter(c=>{const s=certStatus(c,worker);return s==="expired"||s==="expiring";});
  const initials      = worker.name?.split(" ").map(n=>n[0]).join("").slice(0,2).toUpperCase()||"?";
  const pendingLeave  = (worker.leaveRequests||[]).filter(r=>r.status==="pending").length;
  const unreadNotifs  = (worker.routeNotifications||[]).filter(n=>n.weekLabel===weekLabel&&!n.seen).length;
  const unseenAnnounce= (announcements||[]).filter(a=>a.active&&!(worker.dismissedAnnouncements||[]).includes(a.id)).length;

  const TABS = [
    { id:"attendance", label:`📍 Attend.${unreadNotifs>0||unseenAnnounce>0?" 🔔":""}` },
    { id:"timesheet",  label:"📅 Sheet" },
    { id:"records",    label:`📋 Records${hasPaidNotif?" 🔴":""}` },
    { id:"certs",      label:`🛡 Certs${certAlerts.length>0?" ⚠️":""}` },
    { id:"profile",    label:"👤 Profile" },
  ];

  return (
    <div style={{minHeight:"100vh",background:C.bg,fontFamily:"system-ui,sans-serif",color:C.text,maxWidth:480,margin:"0 auto"}}>
      {/* Header */}
      <div style={{background:"linear-gradient(135deg,#0f172a,#1a1f2e)",borderBottom:`1px solid ${C.border}`,padding:"14px 16px"}}>
        <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:8}}>
          <div style={{width:42,height:42,borderRadius:"50%",background:"linear-gradient(135deg,#1e3a5f,#3b82f6)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:16,fontWeight:900,color:"#fff",flexShrink:0}}>{initials}</div>
          <div style={{flex:1}}>
            <div style={{fontSize:16,fontWeight:800}}>{worker.name}</div>
            <div style={{fontSize:11,color:C.muted}}>{worker.position||"—"} · {worker.company||"—"}</div>
          </div>
          <button onClick={onRefresh} disabled={refreshing} title="Refresh data"
            style={{background:"#1e2535",border:`1px solid ${C.border}`,borderRadius:8,padding:"6px 8px",color:refreshing?C.muted:C.sub,cursor:"pointer",fontSize:14,marginRight:4,opacity:refreshing?0.6:1}}>
            {refreshing?"⏳":"🔄"}
          </button>
          <button onClick={onLogout} style={{background:"#1e2535",border:`1px solid ${C.border}`,borderRadius:8,padding:"6px 10px",color:C.muted,cursor:"pointer",fontSize:12,fontWeight:600}}>Sign out</button>
        </div>
        <div style={{fontSize:11,color:C.muted}}>Week commencing <span style={{color:C.accent,fontWeight:700}}>{weekLabel}</span></div>
        {hasPaidNotif&&<div style={{marginTop:8,background:"#0d2218",border:`1px solid ${C.green}44`,borderRadius:8,padding:"8px 12px",fontSize:12,color:C.green,display:"flex",alignItems:"center",gap:8}}><span>💷</span><span>New paid payslip — check Records</span></div>}
        {certAlerts.length>0&&<div style={{marginTop:6,background:"#2d1515",border:`1px solid ${C.red}44`,borderRadius:8,padding:"8px 12px",fontSize:12,color:C.red,display:"flex",alignItems:"center",gap:8}}><span>⚠️</span><span>{certAlerts.length} cert{certAlerts.length!==1?"s":""} need attention</span></div>}
      </div>

      {/* Tab bar */}
      <div style={{display:"flex",background:"#111827",borderBottom:`1px solid ${C.border}`,padding:"6px 8px",gap:3}}>
        {TABS.map(({id,label})=>(
          <button key={id} onClick={()=>setTab(id)}
            style={{flex:1,padding:"7px 2px",background:tab===id?"#1e3a5f":"transparent",border:tab===id?`1px solid ${C.accent}`:"1px solid transparent",borderRadius:7,color:tab===id?C.accent:C.muted,cursor:"pointer",fontSize:10,fontWeight:tab===id?700:400,lineHeight:1.3}}>
            {label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab==="attendance"&&<SignInOutView worker={worker} allSites={allSites} weekLabel={weekLabel} announcements={announcements} onUpdateWorker={setWorker}/>}
      {tab==="timesheet" &&<TimesheetView worker={worker} weekLabel={weekLabel} siteHours={siteHours} allSites={allSites} payslips={payslips}/>}
      {tab==="records"   &&<RecordsView  worker={worker} payslips={payslips} onSave={setWorker}/>}
      {tab==="certs"     &&<EditCertsView worker={worker} onSave={setWorker}/>}
      {tab==="profile"   &&<PersonalView  worker={worker} onSave={setWorker} documents={documents}/>}

      <div style={{padding:"10px 16px",textAlign:"center",fontSize:11,color:C.muted,borderTop:`1px solid ${C.border}`,marginTop:8}}>Bright Metalwork Ltd · Worker Portal v2</div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// APP ROOT — session restore + data loading
// ─────────────────────────────────────────────────────────────────────────────
export default function App() {
  const [worker,     setWorker]     = useState(null);
  const [appData,    setAppData]    = useState({ weekLabel:"", siteHours:{}, allSites:[], payslips:[], announcements:[], documents:[] });
  const [loading,    setLoading]    = useState(true);  // starts true to attempt session restore
  const [refreshing, setRefreshing] = useState(false);

  const loadAppData = async workerId => {
    const cfgRows = await sbGet("app_config","select=key,value");
    const cfg     = Object.fromEntries(cfgRows.map(r=>[r.key,r.value]));
    return {
      weekLabel:     cfg.week_label||"",
      siteHours:     cfg.site_hours||{},
      allSites:      cfg.all_sites||[],
      announcements: cfg.announcements||[],
      documents:     cfg.worker_documents||[],
    };
  };

  const handleLoginSuccess = async w => {
    setLoading(true);
    try {
      const data = await loadAppData(w.id);
      setAppData({ ...data, payslips:w.payslips||[] });
      setWorker(w);
    } catch(e) { console.error("Failed to load app data:", e); }
    setLoading(false);
  };

  // Attempt to restore session on mount
  useEffect(()=>{
    const restore = async () => {
      const session = loadSession();
      if (!session?.token) { setLoading(false); return; }
      try {
        // Refresh token if session is older than 50 minutes
        if (Date.now()-session.at > 50*60*1000) await sbRefreshSession();
        // Look up worker from stored email
        const email = session.email;
        if (!email) { clearSession(); setLoading(false); return; }
        const rows = await sbGet("workers",`select=id,data&data->>authEmail=eq.${encodeURIComponent(email)}`);
        if (!rows.length) { clearSession(); setLoading(false); return; }
        const w = {...rows[0].data, id:rows[0].id};
        const data = await loadAppData(w.id);
        setAppData({...data, payslips:w.payslips||[]});
        setWorker(w);
      } catch(e) {
        console.warn("Session restore failed:", e.message);
        clearSession();
      }
      setLoading(false);
    };
    restore();
  },[]);

  const handleRefresh = async () => {
    if (!worker) return;
    setRefreshing(true);
    try {
      const rows = await sbGet("workers",`select=id,data&id=eq.${worker.id}`);
      if (rows.length) {
        const w = {...rows[0].data, id:rows[0].id};
        const data = await loadAppData(w.id);
        setAppData({...data, payslips:w.payslips||[]});
        setWorker(w);
      }
    } catch(e) { console.warn("Refresh failed:", e.message); }
    setRefreshing(false);
  };

  const handleLogout = () => {
    clearSession();
    setWorker(null);
    setAppData({ weekLabel:"", siteHours:{}, allSites:[], payslips:[], announcements:[], documents:[] });
  };

  if (loading) return (
    <div style={{minHeight:"100vh",background:C.bg,display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"system-ui,sans-serif"}}>
      <div style={{textAlign:"center"}}>
        <div style={{fontSize:28,marginBottom:12}}>🏗</div>
        <div style={{color:C.accent,fontWeight:700,fontSize:14}}>Loading…</div>
      </div>
    </div>
  );

  if (worker) return (
    <Dashboard
      worker={worker} weekLabel={appData.weekLabel} siteHours={appData.siteHours}
      allSites={appData.allSites} payslips={appData.payslips}
      announcements={appData.announcements} documents={appData.documents}
      onLogout={handleLogout} onRefresh={handleRefresh} refreshing={refreshing}
    />
  );

  return <LoginScreen onLoginSuccess={handleLoginSuccess}/>;
}
