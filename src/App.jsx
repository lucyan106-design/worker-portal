import { useState, useEffect, useMemo } from "react";

// ─── Supabase (same database as main app) ────────────────────────────────────
const SB_URL = "https://xljglqiifogyxefhszwa.supabase.co";
const SB_KEY = "sb_publishable_sjP2pkelZOMSDR45qwyH_g_v6KSB41k";
const SB_H   = { "Content-Type":"application/json","apikey":SB_KEY,"Authorization":`Bearer ${SB_KEY}` };
async function sbGet(t,f=""){const r=await fetch(`${SB_URL}/rest/v1/${t}?${f}`,{headers:SB_H});if(!r.ok)throw new Error(await r.text());return r.json();}
async function sbUpsert(t,d){const r=await fetch(`${SB_URL}/rest/v1/${t}`,{method:"POST",headers:{...SB_H,"Prefer":"resolution=merge-duplicates"},body:JSON.stringify(d)});if(!r.ok)throw new Error(await r.text());}

// ─── Constants (mirror of main app) ──────────────────────────────────────────
const BASE_DAYS    = ["Mon","Tue","Wed","Thu","Fri"];
const WEEKEND_DAYS = ["Sat","Sun"];
const ALL_DAYS     = [...BASE_DAYS,...WEEKEND_DAYS];
const DEFAULT_HOURS = 9;

const CERTS = [
  {key:"cscs",label:"CSCS Card",hasExpiry:true},{key:"nvq2",label:"NVQ 2 Fenestration",hasExpiry:false},
  {key:"nvq3",label:"NVQ 3 Supervisor",hasExpiry:false},{key:"nvq4",label:"Level 4 NVQ",hasExpiry:false},
  {key:"schuco",label:"Schuco Skills Card",hasExpiry:true},{key:"healthSafety",label:"Health & Safety",hasExpiry:true},
  {key:"harness",label:"Harness & Leading Edge",hasExpiry:true},{key:"manualHandling",label:"Manual Handling",hasExpiry:true},
  {key:"ipaf3",label:"IPAF 3a/3b",hasExpiry:true},{key:"ipaf1b",label:"IPAF 1b",hasExpiry:true},
  {key:"ipafMast",label:"IPAF Mast Climber",hasExpiry:true},{key:"pasma",label:"PASMA",hasExpiry:true},
  {key:"abrasiveWheel",label:"Abrasive Wheel",hasExpiry:true},{key:"trafficMarshal",label:"Traffic Marshal",hasExpiry:true},
  {key:"firstAid",label:"First Aid",hasExpiry:true},{key:"fireSafety",label:"Fire Safety Marshall",hasExpiry:true},
  {key:"faceFit",label:"Face Fit Testing",hasExpiry:true},{key:"iosh",label:"IOSH Managing Safely",hasExpiry:false},
  {key:"smsts",label:"SMSTS Certificate",hasExpiry:true},{key:"sssts",label:"SSSTS Certificate",hasExpiry:true},
  {key:"asbestos",label:"Asbestos Awareness",hasExpiry:true},{key:"spiderCrane",label:"Spider Crane",hasExpiry:true},
  {key:"vacuumLifter",label:"Vacuum Lifter",hasExpiry:true},
];

// ─── Helpers ──────────────────────────────────────────────────────────────────
function isOff(s){if(!s)return true;const x=s.toLowerCase();return x.includes("off")||x.includes("holiday")||x.includes("storage")||!x.trim();}
function certStatus(cert,w){
  const v=w.certs?.[cert.key];if(!v||!v.held)return "missing";
  if(!cert.hasExpiry||!v.expiry)return "valid";
  const d=(new Date(v.expiry)-new Date())/86400000;
  return d<0?"expired":d<30?"expiring":"valid";
}
function fmtDate(d){return d?new Date(d).toLocaleDateString("en-GB",{day:"2-digit",month:"short",year:"numeric"}):"—";}
function calcPay(w,days,siteHours={}){
  const rate=w.agreedRate||0,tax=w.taxRate||0,otM=w.customOTRate||(w.overtimeMultiplier||1.5);
  let stdH=0,otH=0,gross=0;const bd={};
  days.forEach(d=>{
    const site=w.days[d];if(!site||isOff(site))return;
    const sk=site.trim(),hrs=siteHours[sk]?.hours||w.hoursPerDay?.[d]||DEFAULT_HOURS,ot=w.overtimeHours?.[d]||0;
    const stdPay=hrs*rate,otPay=ot*rate*otM,g=stdPay+otPay;
    stdH+=hrs;otH+=ot;gross+=g;
    bd[d]={site:sk,hours:hrs,ot,stdPay,otPay,gross:g};
  });
  const taxAmt=gross*tax,net=gross-taxAmt;
  return{stdH,otH,gross,taxAmt,net,bd};
}

// ─── Colours ──────────────────────────────────────────────────────────────────
const C = {
  bg:      "#0a0e1a",
  surface: "#111827",
  card:    "#1a1f2e",
  border:  "#1e2535",
  accent:  "#3b82f6",
  green:   "#34d399",
  yellow:  "#fbbf24",
  red:     "#f87171",
  purple:  "#a78bfa",
  muted:   "#64748b",
  text:    "#f1f5f9",
  sub:     "#94a3b8",
};

// ─── Cert status colours ──────────────────────────────────────────────────────
const CERT_C = {valid:C.green, expiring:C.yellow, expired:C.red, missing:"#2d3555"};

// ─── Day colour helper ────────────────────────────────────────────────────────
const DAY_COLORS = ["#3b82f6","#8b5cf6","#06b6d4","#10b981","#f59e0b","#ef4444","#f97316"];
function siteColor(name, allSites=[]){
  if(!name?.trim()) return C.muted;
  const found = allSites.find(s=>s.name===name.trim());
  if(found) return found.color;
  let h=0; for(let i=0;i<name.length;i++) h=(h*31+name.charCodeAt(i))&0xffff;
  return DAY_COLORS[h%DAY_COLORS.length];
}

// ─── Small reusable components ────────────────────────────────────────────────
function Card({children, style={}}){
  return <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:14,padding:16,...style}}>{children}</div>;
}
function Label({children}){
  return <div style={{fontSize:10,color:C.muted,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:4}}>{children}</div>;
}
function Badge({label, color}){
  return <span style={{display:"inline-block",padding:"3px 10px",borderRadius:20,fontSize:12,fontWeight:700,background:color+"22",color,border:`1px solid ${color}44`,whiteSpace:"nowrap"}}>{label}</span>;
}
function KPI({label, value, color, sub}){
  return <div style={{background:C.bg,borderRadius:10,padding:"10px 12px",textAlign:"center",border:`1px solid ${color}22`}}>
    <div style={{fontSize:10,color:C.muted,fontWeight:700,textTransform:"uppercase",marginBottom:2}}>{label}</div>
    <div style={{fontSize:20,fontWeight:900,color}}>{value}</div>
    {sub&&<div style={{fontSize:10,color:C.muted,marginTop:1}}>{sub}</div>}
  </div>;
}

// ─── Screen: Login ────────────────────────────────────────────────────────────
function LoginScreen({workers, onLogin, loading, error}){
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState(null);
  const [pin, setPin] = useState("");
  const [pinError, setPinError] = useState("");

  const filtered = useMemo(()=>{
    if(!search.trim()) return workers;
    return workers.filter(w=>w.name.toLowerCase().includes(search.toLowerCase()));
  },[workers, search]);

  const handleSelect = (w) => {
    setSelected(w);
    setPin("");
    setPinError("");
  };

  const handleLogin = () => {
    if(!selected) return;
    // PIN check: if worker has a pin set, verify it; otherwise allow through
    if(selected.pin && selected.pin.toString().trim()){
      if(pin !== selected.pin.toString()){
        setPinError("Incorrect PIN. Try again.");
        setPin("");
        return;
      }
    }
    onLogin(selected);
  };

  return (
    <div style={{minHeight:"100vh",background:C.bg,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:20,fontFamily:"system-ui,'Segoe UI',sans-serif"}}>
      {/* Logo */}
      <div style={{marginBottom:32,textAlign:"center"}}>
        <div style={{width:64,height:64,background:"linear-gradient(135deg,#1a3a5f,#3b82f6)",borderRadius:18,display:"flex",alignItems:"center",justifyContent:"center",fontSize:28,margin:"0 auto 12px"}}>🏗</div>
        <div style={{fontSize:22,fontWeight:900,color:C.text,letterSpacing:"-0.02em"}}>Bright Metalwork</div>
        <div style={{fontSize:13,color:C.muted,marginTop:3}}>Worker Portal</div>
      </div>

      <div style={{width:"100%",maxWidth:400}}>
        {!selected ? <>
          {/* Search */}
          <Card style={{marginBottom:16}}>
            <Label>Find your name</Label>
            <div style={{position:"relative",marginBottom:12}}>
              <span style={{position:"absolute",left:11,top:"50%",transform:"translateY(-50%)",fontSize:16,color:C.muted}}>🔍</span>
              <input
                value={search}
                onChange={e=>setSearch(e.target.value)}
                placeholder="Type your name…"
                style={{width:"100%",background:C.bg,border:`1px solid ${C.border}`,borderRadius:9,padding:"11px 11px 11px 36px",color:C.text,fontSize:15,outline:"none",boxSizing:"border-box"}}
                autoFocus
              />
            </div>
            {loading && <div style={{textAlign:"center",color:C.muted,fontSize:13,padding:16}}>Loading workers…</div>}
            {error && <div style={{textAlign:"center",color:C.red,fontSize:13,padding:8}}>{error}</div>}
            <div style={{maxHeight:280,overflowY:"auto",display:"flex",flexDirection:"column",gap:6}}>
              {filtered.map(w=>(
                <button key={w.id} onClick={()=>handleSelect(w)}
                  style={{width:"100%",background:C.bg,border:`1px solid ${C.border}`,borderRadius:9,padding:"11px 14px",color:C.text,cursor:"pointer",textAlign:"left",display:"flex",alignItems:"center",gap:12,transition:"border-color 0.15s"}}
                  onMouseEnter={e=>e.currentTarget.style.borderColor=C.accent}
                  onMouseLeave={e=>e.currentTarget.style.borderColor=C.border}
                >
                  <div style={{width:36,height:36,borderRadius:"50%",background:"linear-gradient(135deg,#1e3a5f,#3b82f6)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:15,fontWeight:800,color:"#fff",flexShrink:0}}>
                    {w.name?.split(" ").map(n=>n[0]).join("").slice(0,2).toUpperCase()||"?"}
                  </div>
                  <div>
                    <div style={{fontWeight:700,fontSize:14}}>{w.name}</div>
                    <div style={{fontSize:12,color:C.muted,marginTop:1}}>{w.position||"—"} · {w.company||"—"}</div>
                  </div>
                  <div style={{marginLeft:"auto",fontSize:18,color:C.muted}}>›</div>
                </button>
              ))}
              {!loading&&filtered.length===0&&<div style={{textAlign:"center",color:C.muted,padding:20,fontSize:13}}>No workers found.</div>}
            </div>
          </Card>
        </> : <>
          {/* Selected worker — confirm / PIN */}
          <Card style={{marginBottom:16}}>
            <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:selected.pin?16:20}}>
              <div style={{width:48,height:48,borderRadius:"50%",background:"linear-gradient(135deg,#1e3a5f,#3b82f6)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,fontWeight:800,color:"#fff",flexShrink:0}}>
                {selected.name?.split(" ").map(n=>n[0]).join("").slice(0,2).toUpperCase()||"?"}
              </div>
              <div>
                <div style={{fontWeight:800,fontSize:16,color:C.text}}>{selected.name}</div>
                <div style={{fontSize:12,color:C.muted}}>{selected.position||"—"} · {selected.company||"—"}</div>
              </div>
            </div>

            {selected.pin && selected.pin.toString().trim() ? <>
              <Label>Enter your PIN</Label>
              <input
                type="password"
                inputMode="numeric"
                maxLength={6}
                value={pin}
                onChange={e=>setPin(e.target.value.replace(/\D/g,""))}
                onKeyDown={e=>e.key==="Enter"&&handleLogin()}
                placeholder="• • • • • •"
                autoFocus
                style={{width:"100%",background:C.bg,border:`2px solid ${pinError?C.red:C.border}`,borderRadius:9,padding:"12px",color:C.text,fontSize:22,textAlign:"center",letterSpacing:"0.3em",outline:"none",boxSizing:"border-box",marginBottom:8}}
              />
              {pinError&&<div style={{color:C.red,fontSize:12,textAlign:"center",marginBottom:10}}>{pinError}</div>}
            </> : <div style={{fontSize:12,color:C.muted,marginBottom:16,padding:"8px 12px",background:C.bg,borderRadius:8}}>No PIN set — tap below to sign in.</div>}

            <button onClick={handleLogin}
              style={{width:"100%",background:"linear-gradient(135deg,#1e3a5f,#3b82f6)",border:"none",borderRadius:10,padding:"13px",color:"#fff",fontSize:15,fontWeight:800,cursor:"pointer",marginBottom:10}}>
              Sign In →
            </button>
            <button onClick={()=>{setSelected(null);setPinError("");setPin("");}}
              style={{width:"100%",background:"none",border:`1px solid ${C.border}`,borderRadius:10,padding:"10px",color:C.muted,fontSize:13,cursor:"pointer"}}>
              ← Back
            </button>
          </Card>
        </>}

        <div style={{textAlign:"center",fontSize:11,color:C.muted,marginTop:12}}>
          Bright Metalwork Ltd · Worker Portal · Read-only access
        </div>
      </div>
    </div>
  );
}

// ─── Screen: Dashboard ────────────────────────────────────────────────────────
function Dashboard({worker, weekLabel, siteHours, allSites, onLogout}){
  const [tab, setTab] = useState("schedule");

  const activeDays = useMemo(()=>{
    // show weekend days only if worker is allocated on them
    const hasWeekend = WEEKEND_DAYS.some(d=>worker.days?.[d]&&!isOff(worker.days[d]));
    return hasWeekend ? ALL_DAYS : BASE_DAYS;
  },[worker]);

  const {stdH,otH,gross,taxAmt,net,bd} = useMemo(()=>calcPay(worker,activeDays,siteHours),[worker,activeDays,siteHours]);
  const taxPct = Math.round((worker.taxRate||0)*100);

  const heldCerts  = CERTS.filter(c=>worker.certs?.[c.key]?.held);
  const certAlerts = CERTS.filter(c=>{const s=certStatus(c,worker);return s==="expired"||s==="expiring";});

  const initials = worker.name?.split(" ").map(n=>n[0]).join("").slice(0,2).toUpperCase()||"?";

  return (
    <div style={{minHeight:"100vh",background:C.bg,fontFamily:"system-ui,'Segoe UI',sans-serif",color:C.text,maxWidth:480,margin:"0 auto"}}>

      {/* Header */}
      <div style={{background:"linear-gradient(135deg,#0f172a,#1a1f2e)",borderBottom:`1px solid ${C.border}`,padding:"16px 18px"}}>
        <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:12}}>
          <div style={{width:44,height:44,borderRadius:"50%",background:"linear-gradient(135deg,#1e3a5f,#3b82f6)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:17,fontWeight:900,color:"#fff",flexShrink:0}}>{initials}</div>
          <div style={{flex:1}}>
            <div style={{fontSize:17,fontWeight:800,letterSpacing:"-0.01em"}}>{worker.name}</div>
            <div style={{fontSize:12,color:C.muted,marginTop:1}}>{worker.position||"—"} · {worker.company||"—"}</div>
          </div>
          <button onClick={onLogout} style={{background:"#1e2535",border:`1px solid ${C.border}`,borderRadius:8,padding:"6px 11px",color:C.muted,cursor:"pointer",fontSize:12,fontWeight:600}}>Sign out</button>
        </div>
        <div style={{fontSize:11,color:C.muted}}>Week commencing <span style={{color:C.accent,fontWeight:700}}>{weekLabel}</span></div>
        {certAlerts.length>0&&(
          <div style={{marginTop:10,background:"#2d1515",border:`1px solid ${C.red}44`,borderRadius:8,padding:"8px 12px",fontSize:12,color:C.red,display:"flex",alignItems:"center",gap:8}}>
            <span style={{fontSize:16}}>⚠️</span>
            <span><strong>{certAlerts.length}</strong> certification{certAlerts.length!==1?"s":""} need{certAlerts.length===1?"s":""} attention</span>
          </div>
        )}
      </div>

      {/* Tab bar */}
      <div style={{display:"flex",background:"#111827",borderBottom:`1px solid ${C.border}`,padding:"6px 8px",gap:4}}>
        {[["schedule","📅 Schedule"],["payslip","💷 Payslip"],["certs","🛡 Certs"+(certAlerts.length>0?" ⚠️":"")]].map(([v,l])=>(
          <button key={v} onClick={()=>setTab(v)}
            style={{flex:1,padding:"8px 4px",background:tab===v?"#1e3a5f":"transparent",border:tab===v?`1px solid ${C.accent}`:"1px solid transparent",borderRadius:7,color:tab===v?C.accent:C.muted,cursor:"pointer",fontSize:12,fontWeight:tab===v?700:400}}>
            {l}
          </button>
        ))}
      </div>

      {/* Content */}
      <div style={{padding:14}}>

        {/* ── SCHEDULE ── */}
        {tab==="schedule"&&<div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,marginBottom:16}}>
            <KPI label="Days On" value={Object.values(bd).length} color={C.accent}/>
            <KPI label="Total Hours" value={stdH+(otH>0?"+"+otH+"ot":"")} color={C.green}/>
            <KPI label="Sites" value={[...new Set(Object.values(bd).map(b=>b.site))].length} color={C.purple}/>
          </div>

          <div style={{display:"flex",flexDirection:"column",gap:8}}>
            {activeDays.map(d=>{
              const site = worker.days?.[d];
              const b    = bd[d];
              const col  = siteColor(site, allSites);
              const off  = !site||isOff(site);
              return (
                <Card key={d} style={{borderLeft:`3px solid ${off?"#1e2535":col}`,padding:"12px 14px"}}>
                  <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                    <div style={{fontSize:13,fontWeight:800,color:off?C.muted:C.text,minWidth:36}}>{d}</div>
                    {off
                      ? <span style={{fontSize:12,color:C.muted,fontStyle:"italic"}}>{site||"— not allocated —"}</span>
                      : <div style={{display:"flex",alignItems:"center",gap:8,flex:1,justifyContent:"flex-end",flexWrap:"wrap"}}>
                          <Badge label={site.trim()} color={col}/>
                          {b&&<span style={{fontSize:11,color:C.muted}}>{b.hours}h{b.ot>0?` + ${b.ot}h OT`:""}</span>}
                        </div>
                    }
                  </div>
                  {b&&<div style={{marginTop:8,paddingTop:8,borderTop:`1px solid ${C.border}`,display:"flex",gap:14}}>
                    <span style={{fontSize:11,color:C.muted}}>Std: <span style={{color:C.green,fontWeight:700}}>£{b.stdPay.toFixed(2)}</span></span>
                    {b.ot>0&&<span style={{fontSize:11,color:C.muted}}>OT: <span style={{color:C.yellow,fontWeight:700}}>£{b.otPay.toFixed(2)}</span></span>}
                    <span style={{fontSize:11,color:C.muted}}>Day total: <span style={{color:C.text,fontWeight:700}}>£{b.gross.toFixed(2)}</span></span>
                  </div>}
                </Card>
              );
            })}
          </div>
        </div>}

        {/* ── PAYSLIP ── */}
        {tab==="payslip"&&<div>
          {!worker.agreedRate
            ? <Card style={{textAlign:"center",padding:32}}><div style={{fontSize:32,marginBottom:10}}>💷</div><div style={{color:C.muted,fontSize:13}}>No rate set. Contact your supervisor.</div></Card>
            : <>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:14}}>
                <KPI label="Gross Pay" value={"£"+gross.toFixed(2)} color={C.green}/>
                <KPI label="Net Pay" value={"£"+net.toFixed(2)} color={C.purple}/>
                <KPI <KPI label={`Tax (${taxPct}%)`} value={"£"+taxAmt.toFixed(2)} color={C.red}/>"+taxPct+"%)" value={"£"+taxAmt.toFixed(2)} color={C.red}/>
                <KPI label="Hours" value={stdH+"h"+(otH>0?" +"+otH:"") } color={C.accent} sub={otH>0?"incl. overtime":"standard"}/>
              </div>

              {/* Pay rate info */}
              <Card style={{marginBottom:14}}>
                <Label>Pay Details</Label>
                <div style={{display:"flex",flexDirection:"column",gap:6}}>
                  {[
                    ["Hourly Rate", worker.agreedRate?"£"+worker.agreedRate+"/hr":"Not set", C.green],
                    ["OT Rate", worker.customOTRate?"£"+worker.customOTRate+"/hr (custom)":"×"+(worker.overtimeMultiplier||1.5)+" standard", C.yellow],
                    ["Tax Rate", taxPct+"%", taxPct>=30?C.red:taxPct>=20?C.yellow:C.green],
                    ["Week", weekLabel, C.accent],
                  ].map(([l,v,c])=>(
                    <div key={l} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"6px 0",borderBottom:`1px solid ${C.border}`}}>
                      <span style={{fontSize:12,color:C.muted}}>{l}</span>
                      <span style={{fontSize:13,fontWeight:700,color:c}}>{v}</span>
                    </div>
                  ))}
                </div>
              </Card>

              {/* Daily breakdown */}
              <Card>
                <Label>Daily Breakdown</Label>
                <div style={{display:"flex",flexDirection:"column",gap:0}}>
                  {activeDays.map(d=>{
                    const b=bd[d];const site=worker.days?.[d];const off=!site||isOff(site);
                    return <div key={d} style={{display:"flex",alignItems:"center",gap:10,padding:"9px 0",borderBottom:`1px solid ${C.border}`}}>
                      <div style={{fontSize:12,fontWeight:800,color:off?C.muted:C.sub,minWidth:32}}>{d}</div>
                      {off
                        ? <span style={{fontSize:12,color:C.muted,fontStyle:"italic",flex:1}}>{site||"Off"}</span>
                        : <>
                            <span style={{fontSize:11,color:C.sub,flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{b?.site||"—"}</span>
                            <span style={{fontSize:11,color:C.muted}}>{b?.hours||0}h</span>
                            <span style={{fontSize:13,fontWeight:700,color:C.green,minWidth:60,textAlign:"right"}}>{b?"£"+b.gross.toFixed(2):"—"}</span>
                          </>
                      }
                    </div>;
                  })}
                  {/* Totals row */}
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 0 0"}}>
                    <span style={{fontSize:12,fontWeight:800,color:C.sub}}>TOTAL</span>
                    <span style={{fontSize:16,fontWeight:900,color:C.green}}>£{gross.toFixed(2)}</span>
                  </div>
                </div>
              </Card>

              {/* Net pay highlight */}
              <div style={{marginTop:12,background:"linear-gradient(135deg,#0d2218,#1a3020)",border:`1px solid ${C.green}44`,borderRadius:14,padding:"18px 20px",textAlign:"center"}}>
                <div style={{fontSize:12,color:C.muted,marginBottom:4,textTransform:"uppercase",letterSpacing:"0.07em",fontWeight:700}}>💷 Net Pay to Account</div>
                <div style={{fontSize:36,fontWeight:900,color:C.green,letterSpacing:"-0.02em"}}>£{net.toFixed(2)}</div>
                <div style={{fontSize:11,color:C.muted,marginTop:4}}>After {taxPct}% tax · WC {weekLabel}</div>
              </div>
            </>
          }
        </div>}

        {/* ── CERTS ── */}
        {tab==="certs"&&<div>
          {/* Summary */}
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr",gap:6,marginBottom:14}}>
            {[
              ["Held",   heldCerts.length,                                             C.accent],
              ["Valid",  CERTS.filter(c=>certStatus(c,worker)==="valid").length,       C.green],
              ["Soon",   CERTS.filter(c=>certStatus(c,worker)==="expiring").length,    C.yellow],
              ["Expired",CERTS.filter(c=>certStatus(c,worker)==="expired").length,     C.red],
            ].map(([l,v,c])=><KPI key={l} label={l} value={v} color={c}/>)}
          </div>

          {/* Alerts first */}
          {certAlerts.length>0&&<div style={{marginBottom:14}}>
            <Label>⚠️ Needs Attention</Label>
            <div style={{display:"flex",flexDirection:"column",gap:6}}>
              {certAlerts.map(cert=>{
                const s=certStatus(cert,worker);
                const val=worker.certs?.[cert.key];
                return <Card key={cert.key} style={{borderLeft:`3px solid ${CERT_C[s]}`,padding:"10px 14px"}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                    <span style={{fontSize:13,fontWeight:700,color:C.text}}>{cert.label}</span>
                    <Badge label={s.toUpperCase()} color={CERT_C[s]}/>
                  </div>
                  {cert.hasExpiry&&val?.expiry&&<div style={{fontSize:11,color:C.muted,marginTop:4}}>Expiry: <span style={{color:CERT_C[s],fontWeight:600}}>{fmtDate(val.expiry)}</span></div>}
                </Card>;
              })}
            </div>
          </div>}

          {/* All held certs */}
          {heldCerts.length>0&&<div style={{marginBottom:14}}>
            <Label>All Certifications ({heldCerts.length} held)</Label>
            <div style={{display:"flex",flexDirection:"column",gap:6}}>
              {heldCerts.map(cert=>{
                const s=certStatus(cert,worker);
                const val=worker.certs?.[cert.key];
                return <Card key={cert.key} style={{borderLeft:`3px solid ${CERT_C[s]}44`,padding:"10px 14px"}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                    <span style={{fontSize:13,fontWeight:600,color:C.text}}>{cert.label}</span>
                    <Badge label={s==="valid"?"✓ Valid":s.toUpperCase()} color={CERT_C[s]}/>
                  </div>
                  {cert.hasExpiry&&val?.expiry&&<div style={{fontSize:11,color:C.muted,marginTop:3}}>Expires: <span style={{color:s==="valid"?C.green:CERT_C[s],fontWeight:600}}>{fmtDate(val.expiry)}</span></div>}
                  {!cert.hasExpiry&&<div style={{fontSize:11,color:C.muted,marginTop:3}}>No expiry</div>}
                </Card>;
              })}
            </div>
          </div>}

          {heldCerts.length===0&&<Card style={{textAlign:"center",padding:32}}>
            <div style={{fontSize:32,marginBottom:10}}>🛡</div>
            <div style={{color:C.muted,fontSize:13}}>No certifications recorded yet.</div>
            <div style={{color:C.muted,fontSize:12,marginTop:4}}>Contact your supervisor to update your records.</div>
          </Card>}

          <div style={{marginTop:8,padding:"10px 12px",background:C.card,borderRadius:8,border:`1px solid ${C.border}`,fontSize:11,color:C.muted}}>
            To update certifications, contact your supervisor or manager. Records are managed in the admin portal.
          </div>
        </div>}

      </div>

      {/* Footer */}
      <div style={{padding:"12px 18px",textAlign:"center",fontSize:11,color:C.muted,borderTop:`1px solid ${C.border}`,marginTop:8}}>
        Bright Metalwork Ltd · Worker Portal · Read-only
      </div>
    </div>
  );
}

// ─── Root App ─────────────────────────────────────────────────────────────────
export default function App(){
  const [workers,   setWorkers]   = useState([]);
  const [allSites,  setAllSites]  = useState([]);
  const [siteHours, setSiteHours] = useState({});
  const [weekLabel, setWeekLabel] = useState("");
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState(null);
  const [worker,    setWorker]    = useState(null); // logged-in worker

  useEffect(()=>{
    async function load(){
      try {
        setLoading(true);
        // Load workers
        const wRows = await sbGet("workers","select=id,data&order=data->name");
        const ws = wRows.map(r=>({...r.data, id:r.id})).filter(w=>w.name);
        setWorkers(ws);
        // Load config
        const cfgRows = await sbGet("app_config","select=key,value");
        const cfg = Object.fromEntries(cfgRows.map(r=>[r.key,r.value]));
        if(cfg.week_label)  setWeekLabel(cfg.week_label);
        if(cfg.all_sites)   setAllSites(cfg.all_sites);
        if(cfg.site_hours)  setSiteHours(cfg.site_hours);
      } catch(e){
        setError("Could not connect. Please try again.");
        console.error(e);
      } finally {
        setLoading(false);
      }
    }
    load();
  },[]);

  // When a worker logs in, reload their fresh data from DB
  const handleLogin = async (w) => {
    try {
      const rows = await sbGet("workers",`select=id,data&id=eq.${w.id}`);
      if(rows.length>0) setWorker({...rows[0].data, id:rows[0].id});
      else setWorker(w);
    } catch(e){
      setWorker(w);
    }
  };

  const handleLogout = () => setWorker(null);

  if(worker){
    return <Dashboard
      worker={worker}
      weekLabel={weekLabel}
      siteHours={siteHours}
      allSites={allSites}
      onLogout={handleLogout}
    />;
  }

  return <LoginScreen
    workers={workers}
    onLogin={handleLogin}
    loading={loading}
    error={error}
  />;
}
