import { useState, useEffect, useMemo } from "react";

// ─── Supabase ─────────────────────────────────────────────────────────────────
const SB_URL = "https://xljglqiifogyxefhszwa.supabase.co";
const SB_KEY = "sb_publishable_sjP2pkelZOMSDR45qwyH_g_v6KSB41k";
const SB_H   = {"Content-Type":"application/json","apikey":SB_KEY,"Authorization":`Bearer ${SB_KEY}`};

async function sbGet(t,f=""){const r=await fetch(`${SB_URL}/rest/v1/${t}?${f}`,{headers:SB_H});if(!r.ok)throw new Error(await r.text());return r.json();}
async function sbPatch(t,f,d){const r=await fetch(`${SB_URL}/rest/v1/${t}?${f}`,{method:"PATCH",headers:{...SB_H,"Prefer":"return=minimal"},body:JSON.stringify(d)});if(!r.ok)throw new Error(await r.text());}
async function sbPost(t,d){const r=await fetch(`${SB_URL}/rest/v1/${t}`,{method:"POST",headers:{...SB_H,"Prefer":"return=minimal"},body:JSON.stringify(d)});if(!r.ok)throw new Error(await r.text());}

async function sbSignUp(email,password){
  const r=await fetch(`${SB_URL}/auth/v1/signup`,{method:"POST",headers:SB_H,body:JSON.stringify({email,password})});
  const d=await r.json();if(d.error)throw new Error(d.error.message||d.error);return d;
}
async function sbSignIn(email,password){
  const r=await fetch(`${SB_URL}/auth/v1/token?grant_type=password`,{method:"POST",headers:SB_H,body:JSON.stringify({email,password})});
  const d=await r.json();if(d.error)throw new Error(d.error.message||d.error);return d;
}
async function uploadCertPhoto(file,workerId,certKey){
  const ext=file.name.split(".").pop();
  const path=`${workerId}/${certKey}.${ext}`;
  const r=await fetch(`${SB_URL}/storage/v1/object/cert-photos/${path}`,{method:"POST",headers:{"apikey":SB_KEY,"Authorization":`Bearer ${SB_KEY}`,"Content-Type":file.type,"x-upsert":"true"},body:file});
  if(!r.ok)throw new Error(await r.text());
  return `${SB_URL}/storage/v1/object/public/cert-photos/${path}`;
}

// ─── Constants ────────────────────────────────────────────────────────────────
const BASE_DAYS=["Mon","Tue","Wed","Thu","Fri"];
const WEEKEND_DAYS=["Sat","Sun"];
const ALL_DAYS=[...BASE_DAYS,...WEEKEND_DAYS];
const DEFAULT_HOURS=9;
const POSITIONS=["Welder","Fixer","Fitter","Semiskilled","Supervisor","Labourer","Manager","Driver"];
const COMPANIES=["Bright Metalwork","Dodi Metalwork","External"];
const CERTS=[
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
function fmtDate(d){return d?new Date(d).toLocaleDateString("en-GB",{day:"2-digit",month:"short",year:"numeric"}):"—";}
function calcPay(w,days,siteHours={}){
  const rate=w.agreedRate||0,tax=w.taxRate||0,otM=w.overtimeMultiplier||1.5;
  let stdH=0,otH=0,gross=0;const bd={};
  days.forEach(d=>{
    const site=w.days?.[d];if(!site||isOff(site))return;
    const sk=site.trim(),hrs=siteHours[sk]?.hours||w.hoursPerDay?.[d]||DEFAULT_HOURS,ot=w.overtimeHours?.[d]||0;
    const stdPay=hrs*rate,otPay=ot*rate*otM,g=stdPay+otPay;
    stdH+=hrs;otH+=ot;gross+=g;
    bd[d]={site:sk,hours:hrs,ot,stdPay,otPay,gross:g};
  });
  const taxAmt=gross*tax,net=gross-taxAmt;
  return{stdH,otH,gross,taxAmt,net,bd};
}
function certStatus(cert,w){
  const v=w.certs?.[cert.key];if(!v||!v.held)return "missing";
  if(!cert.hasExpiry||!v.expiry)return "valid";
  const d=(new Date(v.expiry)-new Date())/86400000;
  return d<0?"expired":d<30?"expiring":"valid";
}

// ─── Colours ──────────────────────────────────────────────────────────────────
const C={bg:"#0a0e1a",card:"#1a1f2e",border:"#1e2535",accent:"#3b82f6",green:"#34d399",yellow:"#fbbf24",red:"#f87171",purple:"#a78bfa",muted:"#64748b",text:"#f1f5f9",sub:"#94a3b8"};
const DAY_COLORS=["#3b82f6","#8b5cf6","#06b6d4","#10b981","#f59e0b","#ef4444","#f97316"];
function siteColor(name,allSites=[]){if(!name?.trim())return C.muted;const f=allSites.find(s=>s.name===name.trim());if(f)return f.color;let h=0;for(let i=0;i<name.length;i++)h=(h*31+name.charCodeAt(i))&0xffff;return DAY_COLORS[h%DAY_COLORS.length];}

// ─── UI Primitives ────────────────────────────────────────────────────────────
const Card=({children,style={}})=><div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:14,padding:16,...style}}>{children}</div>;
const Lbl=({children,required})=><div style={{fontSize:10,color:C.muted,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:5}}>{children}{required&&<span style={{color:C.red}}> *</span>}</div>;
const Badge=({label,color})=><span style={{display:"inline-block",padding:"3px 10px",borderRadius:20,fontSize:11,fontWeight:700,background:color+"22",color,border:`1px solid ${color}44`,whiteSpace:"nowrap"}}>{label}</span>;
const KPI=({label,value,color,sub})=><div style={{background:C.bg,borderRadius:10,padding:"10px 12px",textAlign:"center",border:`1px solid ${color}22`}}><div style={{fontSize:9,color:C.muted,fontWeight:700,textTransform:"uppercase",marginBottom:2}}>{label}</div><div style={{fontSize:18,fontWeight:900,color}}>{value}</div>{sub&&<div style={{fontSize:10,color:C.muted,marginTop:1}}>{sub}</div>}</div>;

function Inp({label,value,onChange,type="text",placeholder="",required=false,hint="",disabled=false}){
  return <div style={{marginBottom:13}}>
    <Lbl required={required}>{label}</Lbl>
    <input type={type} value={value||""} onChange={e=>onChange(e.target.value)} placeholder={placeholder} disabled={disabled}
      style={{width:"100%",background:disabled?"#0f1421":C.bg,border:`1px solid ${C.border}`,borderRadius:9,padding:"11px 13px",color:disabled?C.muted:C.text,fontSize:14,outline:"none",boxSizing:"border-box",cursor:disabled?"not-allowed":"text"}}/>
    {hint&&<div style={{fontSize:11,color:C.muted,marginTop:4}}>{hint}</div>}
  </div>;
}
function Sel({label,value,onChange,options,required=false}){
  return <div style={{marginBottom:13}}>
    <Lbl required={required}>{label}</Lbl>
    <select value={value||""} onChange={e=>onChange(e.target.value)} style={{width:"100%",background:C.bg,border:`1px solid ${C.border}`,borderRadius:9,padding:"11px 13px",color:value?C.text:C.muted,fontSize:14,outline:"none",boxSizing:"border-box",cursor:"pointer"}}>
      <option value="">— Select —</option>
      {options.map(o=><option key={o} value={o}>{o}</option>)}
    </select>
  </div>;
}

// ─── Steps indicator ──────────────────────────────────────────────────────────
function Steps({current,labels}){
  return <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:0,marginBottom:22}}>
    {labels.map((l,i)=>{
      const done=i<current,active=i===current;
      return <div key={i} style={{display:"flex",alignItems:"center"}}>
        <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:3}}>
          <div style={{width:26,height:26,borderRadius:"50%",background:done?C.green:active?"#1e3a5f":C.card,border:`2px solid ${done?C.green:active?C.accent:C.border}`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:800,color:done?"#fff":active?C.accent:C.muted}}>{done?"✓":i+1}</div>
          <div style={{fontSize:9,color:active?C.accent:done?C.green:C.muted,fontWeight:active||done?700:400,whiteSpace:"nowrap"}}>{l}</div>
        </div>
        {i<labels.length-1&&<div style={{width:28,height:2,background:done?C.green:C.border,marginBottom:14,flexShrink:0}}/>}
      </div>;
    })}
  </div>;
}

// ─── Payslip PDF generator ────────────────────────────────────────────────────
function printPayslip(worker,weekLabel,gross,net,taxAmt,taxPct,bd,activeDays){
  const html=`<!DOCTYPE html><html><head><meta charset="utf-8"/><title>Payslip ${weekLabel}</title>
<style>*{margin:0;padding:0;box-sizing:border-box;}body{font-family:Arial,sans-serif;font-size:11px;padding:24px;color:#111;}
.hdr{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:20px;padding-bottom:14px;border-bottom:2px solid #1a3a5f;}
.logo{background:#1a3a5f;border-radius:5px;padding:6px 12px;display:inline-block;}<br/>.logo-name{font-size:11px;font-weight:900;color:#fff;letter-spacing:0.08em;}
.logo-sub{font-size:7px;color:#93c5fd;letter-spacing:0.12em;}
h1{font-size:20px;font-weight:900;color:#1a3a5f;margin-bottom:3px;}
.meta{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px;}
.meta-box{background:#f8fafc;border-radius:7px;padding:10px 12px;border:1px solid #e2e8f0;}
.meta-label{font-size:9px;color:#64748b;font-weight:700;text-transform:uppercase;margin-bottom:3px;}
.meta-value{font-size:13px;font-weight:700;color:#111;}
table{width:100%;border-collapse:collapse;margin-bottom:14px;}
th{background:#1a3a5f;color:#fff;padding:7px 9px;text-align:left;font-size:10px;font-weight:700;}
th.r{text-align:right;}td{padding:7px 9px;border-bottom:1px solid #f1f5f9;font-size:11px;}
td.r{text-align:right;}tr:nth-child(even)td{background:#f8fafc;}
.totals{display:flex;justify-content:flex-end;}
.tot-box{width:220px;background:#f8fafc;border-radius:8px;padding:12px 14px;border:1px solid #e2e8f0;}
.tot-row{display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid #e2e8f0;font-size:11px;}
.tot-final{border-top:2px solid #1a3a5f;border-bottom:none;padding-top:8px;margin-top:4px;}
.ft{margin-top:20px;padding-top:10px;border-top:1px solid #e2e8f0;font-size:9px;color:#94a3b8;display:flex;justify-content:space-between;}
@media print{body{padding:10px;}@page{margin:8mm;size:A4;}}</style></head><body>
<div class="hdr">
  <div><h1>PAYSLIP</h1><div style="font-size:11px;color:#64748b">Week Commencing: <strong>${weekLabel}</strong></div></div>
  <div class="logo"><div class="logo-name">BRIGHT METALWORK</div><div class="logo-sub">PASSION SHAPED INTO PERFECTION</div></div>
</div>
<div class="meta">
  <div class="meta-box"><div class="meta-label">Employee</div><div class="meta-value">${worker.name||"—"}</div></div>
  <div class="meta-box"><div class="meta-label">Position</div><div class="meta-value">${worker.position||"—"}</div></div>
  <div class="meta-box"><div class="meta-label">Company</div><div class="meta-value">${worker.company||"—"}</div></div>
  <div class="meta-box"><div class="meta-label">NI Number</div><div class="meta-value">${worker.niNumber||"—"}</div></div>
</div>
<table>
  <thead><tr><th>Day</th><th>Site</th><th class="r">Std Hrs</th><th class="r">OT Hrs</th><th class="r">Std Pay</th><th class="r">OT Pay</th><th class="r">Day Total</th></tr></thead>
  <tbody>
    ${activeDays.map(d=>{const b=bd[d];const site=worker.days?.[d];const off=!site||isOff(site);return`<tr><td style="font-weight:600">${d}</td><td>${off?"—":b?.site||"—"}</td><td class="r">${b?b.hours:""}</td><td class="r">${b&&b.ot>0?b.ot:""}</td><td class="r">${b?"£"+b.stdPay.toFixed(2):""}</td><td class="r">${b&&b.ot>0?"£"+b.otPay.toFixed(2):""}</td><td class="r" style="font-weight:700">${b?"£"+b.gross.toFixed(2):"—"}</td></tr>`;}).join("")}
  </tbody>
</table>
<div class="totals"><div class="tot-box">
  <div class="tot-row"><span>Gross Pay</span><span style="font-weight:700">£${gross.toFixed(2)}</span></div>
  <div class="tot-row"><span>Tax (${taxPct}%)</span><span style="font-weight:700;color:#ef4444">-£${taxAmt.toFixed(2)}</span></div>
  <div class="tot-row tot-final"><span style="font-weight:800;font-size:13px">NET PAY</span><span style="font-weight:900;font-size:16px;color:#16a34a">£${net.toFixed(2)}</span></div>
</div></div>
${worker.bankName||worker.accountNo?`<div style="margin-top:14px;padding:10px 14px;background:#f0fdf4;border-radius:8px;border:1px solid #bbf7d0;font-size:11px;color:#166534"><strong>Payment to:</strong> ${worker.bankName||""} ${worker.sortCode?"· Sort Code: "+worker.sortCode:""} ${worker.accountNo?"· Account: "+worker.accountNo:""}</div>`:""}
<div class="ft"><span>Bright Metalwork Ltd · CRN: 12020937</span><span>Payslip WC ${weekLabel} · ${worker.name}</span></div>
<script>window.onload=function(){window.print();}</script></body></html>`;
  const b=new Blob([html],{type:"text/html"});const u=URL.createObjectURL(b);
  const win=window.open(u,"_blank","width=900,height=800");
  if(!win){const a=document.createElement("a");a.href=u;a.download=`Payslip_${weekLabel}_${worker.name}.html`;a.click();}
  setTimeout(()=>URL.revokeObjectURL(u),5000);
}

// ─── REGISTER SCREEN ──────────────────────────────────────────────────────────
function RegisterScreen({onBack}){
  const [step,setStep]=useState(0);
  const [submitting,setSubmitting]=useState(false);
  const [done,setDone]=useState(false);
  const [err,setErr]=useState("");
  const [name,setName]=useState("");
  const [phone,setPhone]=useState("");
  const [address,setAddress]=useState("");
  const [position,setPosition]=useState("");
  const [company,setCompany]=useState("");
  const [niNumber,setNiNumber]=useState("");
  const [dob,setDob]=useState("");
  const [emergencyName,setEmergencyName]=useState("");
  const [emergencyPhone,setEmergencyPhone]=useState("");
  const [bankName,setBankName]=useState("");
  const [sortCode,setSortCode]=useState("");
  const [accountNo,setAccountNo]=useState("");
  const [certs,setCerts]=useState({});
  const [uploading,setUploading]=useState({});
  const [email,setEmail]=useState("");
  const [password,setPassword]=useState("");
  const [password2,setPassword2]=useState("");
  const tempId=useMemo(()=>"reg_"+Date.now(),[]);

  const toggleCert=key=>setCerts(c=>({...c,[key]:{...c[key],held:!c[key]?.held}}));
  const setCertExpiry=(key,val)=>setCerts(c=>({...c,[key]:{...c[key],expiry:val}}));
  const handlePhotoUpload=async(key,file)=>{
    if(!file)return;setUploading(u=>({...u,[key]:true}));
    try{const url=await uploadCertPhoto(file,tempId,key);setCerts(c=>({...c,[key]:{...c[key],photoUrl:url}}));}
    catch(e){setErr("Photo upload failed: "+e.message);}
    setUploading(u=>({...u,[key]:false}));
  };

  const validate=()=>{
    setErr("");
    if(step===0){if(!name.trim())return setErr("Full name is required.")||false;if(!position)return setErr("Position is required.")||false;if(!company)return setErr("Company is required.")||false;return true;}
    if(step===1)return true;
    if(step===2){if(!email.trim())return setErr("Email is required.")||false;if(password.length<6)return setErr("Password must be at least 6 characters.")||false;if(password!==password2)return setErr("Passwords do not match.")||false;return true;}
    return true;
  };
  const next=()=>{if(validate())setStep(s=>s+1);};
  const back=()=>{setErr("");setStep(s=>s-1);};

  const submit=async()=>{
    if(!validate())return;setSubmitting(true);setErr("");
    try{
      await sbSignUp(email,password);
      const workerData={id:tempId,name:name.trim(),phone,address,position,company,niNumber,dob,emergencyName,emergencyPhone,bankName,sortCode,accountNo,email,authEmail:email,
        certs:Object.fromEntries(Object.entries(certs).filter(([,v])=>v?.held).map(([k,v])=>[k,{held:true,expiry:v.expiry||"",photoUrl:v.photoUrl||""}])),
        days:{Mon:"",Tue:"",Wed:"",Thu:"",Fri:"",Sat:"",Sun:""},hoursPerDay:{},overtimeHours:{},agreedRate:0,taxRate:0.20,
        registeredAt:new Date().toISOString(),detailsHistory:[],payslips:[]};
      await sbPost("pending_workers",{status:"pending",data:workerData});
      setDone(true);
    }catch(e){setErr(e.message||"Registration failed. Please try again.");}
    setSubmitting(false);
  };

  if(done)return(
    <div style={{minHeight:"100vh",background:C.bg,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:24,fontFamily:"system-ui,sans-serif",textAlign:"center"}}>
      <div style={{fontSize:56,marginBottom:16}}>🎉</div>
      <div style={{fontSize:22,fontWeight:900,color:C.text,marginBottom:8}}>Registration Submitted!</div>
      <div style={{fontSize:14,color:C.sub,maxWidth:320,lineHeight:1.6,marginBottom:24}}>Your details have been sent to Bright Metalwork. Once approved by an administrator you can sign in with your email and password.</div>
      <div style={{background:C.card,border:`1px solid ${C.green}44`,borderRadius:12,padding:"12px 20px",marginBottom:24,fontSize:13,color:C.green,fontWeight:600}}>✓ Account created for {email}</div>
      <button onClick={onBack} style={{background:"linear-gradient(135deg,#1e3a5f,#3b82f6)",border:"none",borderRadius:10,padding:"12px 28px",color:"#fff",fontSize:15,fontWeight:800,cursor:"pointer"}}>← Back to Sign In</button>
    </div>
  );

  return(
    <div style={{minHeight:"100vh",background:C.bg,fontFamily:"system-ui,sans-serif",padding:16,paddingBottom:40}}>
      <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:20,paddingTop:8}}>
        <button onClick={step===0?onBack:back} style={{background:"none",border:"none",color:C.muted,cursor:"pointer",fontSize:20,padding:"4px 8px"}}>←</button>
        <div><div style={{fontSize:18,fontWeight:900,color:C.text}}>Create Account</div><div style={{fontSize:12,color:C.muted}}>Bright Metalwork Worker Portal</div></div>
      </div>
      <div style={{maxWidth:480,margin:"0 auto"}}>
        <Steps current={step} labels={["Personal","Certs","Account"]}/>
        {err&&<div style={{background:"#2d1515",border:`1px solid ${C.red}44`,borderRadius:9,padding:"10px 14px",color:C.red,fontSize:13,marginBottom:16}}>⚠ {err}</div>}

        {step===0&&<Card>
          <div style={{fontSize:15,fontWeight:800,color:C.text,marginBottom:14}}>👤 Personal Information</div>
          <Inp label="Full Name" value={name} onChange={setName} placeholder="e.g. John Smith" required/>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"0 12px"}}>
            <Sel label="Position" value={position} onChange={setPosition} options={POSITIONS} required/>
            <Sel label="Company" value={company} onChange={setCompany} options={COMPANIES} required/>
          </div>
          <Inp label="Phone Number" value={phone} onChange={setPhone} type="tel" placeholder="+44 7700 000000"/>
          <Inp label="Date of Birth" value={dob} onChange={setDob} type="date"/>
          <Inp label="NI Number" value={niNumber} onChange={setNiNumber} placeholder="AB 12 34 56 C"/>
          <Inp label="Home Address" value={address} onChange={setAddress} placeholder="Full home address"/>
          <div style={{borderTop:`1px solid ${C.border}`,paddingTop:14,marginTop:2,marginBottom:14}}>
            <div style={{fontSize:12,fontWeight:700,color:C.sub,marginBottom:10}}>🏦 Bank Details</div>
            <Inp label="Bank Name" value={bankName} onChange={setBankName} placeholder="e.g. HSBC, Barclays"/>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"0 12px"}}>
              <Inp label="Sort Code" value={sortCode} onChange={setSortCode} placeholder="00-00-00"/>
              <Inp label="Account Number" value={accountNo} onChange={setAccountNo} placeholder="12345678"/>
            </div>
          </div>
          <div style={{borderTop:`1px solid ${C.border}`,paddingTop:14}}>
            <div style={{fontSize:12,fontWeight:700,color:C.sub,marginBottom:10}}>🆘 Emergency Contact</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"0 12px"}}>
              <Inp label="Contact Name" value={emergencyName} onChange={setEmergencyName} placeholder="Full name"/>
              <Inp label="Contact Phone" value={emergencyPhone} onChange={setEmergencyPhone} type="tel"/>
            </div>
          </div>
          <button onClick={next} style={{width:"100%",background:"linear-gradient(135deg,#1e3a5f,#3b82f6)",border:"none",borderRadius:10,padding:"13px",color:"#fff",fontSize:14,fontWeight:800,cursor:"pointer",marginTop:4}}>Next: Certifications →</button>
        </Card>}

        {step===1&&<div>
          <Card style={{marginBottom:12}}>
            <div style={{fontSize:15,fontWeight:800,color:C.text,marginBottom:4}}>🛡 Certifications</div>
            <div style={{fontSize:12,color:C.muted,marginBottom:14}}>Tick each cert you hold, add the expiry date and upload a photo. All optional.</div>
            <div style={{display:"flex",flexDirection:"column",gap:8}}>
              {CERTS.map(cert=>{
                const held=certs[cert.key]?.held||false,expiry=certs[cert.key]?.expiry||"",photoUrl=certs[cert.key]?.photoUrl||"",isUp=uploading[cert.key];
                return <div key={cert.key} style={{background:C.bg,borderRadius:10,border:`1px solid ${held?C.accent+"44":C.border}`,overflow:"hidden"}}>
                  <div onClick={()=>toggleCert(cert.key)} style={{display:"flex",alignItems:"center",gap:10,padding:"10px 13px",cursor:"pointer"}}>
                    <div style={{width:20,height:20,borderRadius:5,background:held?C.accent:C.card,border:`2px solid ${held?C.accent:C.border}`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                      {held&&<span style={{color:"#fff",fontSize:12,fontWeight:900}}>✓</span>}
                    </div>
                    <div style={{flex:1}}><div style={{fontSize:13,fontWeight:held?700:400,color:held?C.text:C.sub}}>{cert.label}</div></div>
                    {held&&photoUrl&&<span style={{fontSize:10,color:C.green,fontWeight:700}}>📷</span>}
                  </div>
                  {held&&<div style={{padding:"0 13px 12px",borderTop:`1px solid ${C.border}`}}>
                    {cert.hasExpiry&&<div style={{marginTop:10}}>
                      <Lbl>Expiry Date</Lbl>
                      <input type="date" value={expiry} onChange={e=>setCertExpiry(cert.key,e.target.value)} style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:7,padding:"8px 10px",color:C.text,fontSize:13,outline:"none",width:"100%",boxSizing:"border-box"}}/>
                    </div>}
                    <div style={{marginTop:10}}>
                      <Lbl>Photo of Certificate</Lbl>
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
          <div style={{fontSize:15,fontWeight:800,color:C.text,marginBottom:4}}>🔐 Create Your Account</div>
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
            <button onClick={submit} disabled={submitting} style={{flex:2,background:"linear-gradient(135deg,#14532d,#16a34a)",border:"none",borderRadius:10,padding:"13px",color:"#fff",fontSize:14,fontWeight:800,cursor:submitting?"not-allowed":"pointer",opacity:submitting?0.7:1}}>
              {submitting?"Submitting…":"✓ Submit Registration"}
            </button>
          </div>
        </Card>}
      </div>
    </div>
  );
}

// ─── LOGIN SCREEN ─────────────────────────────────────────────────────────────
function LoginScreen({onLoginSuccess}){
  const [email,setEmail]=useState("");
  const [password,setPassword]=useState("");
  const [err,setErr]=useState("");
  const [loading,setLoading]=useState(false);
  const [showRegister,setShowRegister]=useState(false);

  if(showRegister)return <RegisterScreen onBack={()=>setShowRegister(false)}/>;

  const handleLogin=async()=>{
    setErr("");setLoading(true);
    try{
      const data=await sbSignIn(email,password);
      // Find worker by auth email in workers table
      const rows=await sbGet("workers",`select=id,data&data->>authEmail=eq.${encodeURIComponent(email)}`);
      if(rows.length>0){
        onLoginSuccess({...rows[0].data,id:rows[0].id},data.access_token);
      } else {
        // Also try matching by email field
        const rows2=await sbGet("workers",`select=id,data&data->>email=eq.${encodeURIComponent(email)}`);
        if(rows2.length>0) onLoginSuccess({...rows2[0].data,id:rows2[0].id},data.access_token);
        else setErr("Account found but not yet approved. Please wait for admin approval.");
      }
    }catch(e){setErr(e.message==="Invalid login credentials"?"Incorrect email or password.":e.message||"Sign in failed.");}
    setLoading(false);
  };

  return(
    <div style={{minHeight:"100vh",background:C.bg,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:20,fontFamily:"system-ui,sans-serif"}}>
      <div style={{marginBottom:28,textAlign:"center"}}>
        <div style={{width:64,height:64,background:"linear-gradient(135deg,#1a3a5f,#3b82f6)",borderRadius:18,display:"flex",alignItems:"center",justifyContent:"center",fontSize:28,margin:"0 auto 12px"}}>🏗</div>
        <div style={{fontSize:22,fontWeight:900,color:C.text,letterSpacing:"-0.02em"}}>Bright Metalwork</div>
        <div style={{fontSize:13,color:C.muted,marginTop:3}}>Worker Portal</div>
      </div>
      <div style={{width:"100%",maxWidth:380}}>
        <Card style={{marginBottom:12}}>
          <div style={{fontSize:15,fontWeight:800,color:C.text,marginBottom:16}}>Sign In</div>
          <Inp label="Email Address" value={email} onChange={setEmail} type="email" placeholder="your@email.com" required/>
          <Inp label="Password" value={password} onChange={setPassword} type="password" placeholder="Your password" required/>
          {err&&<div style={{background:"#2d1515",border:`1px solid ${C.red}44`,borderRadius:8,padding:"9px 12px",color:C.red,fontSize:12,marginBottom:12}}>{err}</div>}
          <button onClick={handleLogin} disabled={loading} onKeyDown={e=>e.key==="Enter"&&handleLogin()}
            style={{width:"100%",background:"linear-gradient(135deg,#1e3a5f,#3b82f6)",border:"none",borderRadius:10,padding:"13px",color:"#fff",fontSize:15,fontWeight:800,cursor:loading?"not-allowed":"pointer",opacity:loading?0.7:1}}>
            {loading?"Signing in…":"Sign In →"}
          </button>
        </Card>
        <div style={{textAlign:"center"}}>
          <span style={{fontSize:13,color:C.muted}}>New to Bright Metalwork? </span>
          <button onClick={()=>setShowRegister(true)} style={{background:"none",border:"none",color:C.accent,fontSize:13,fontWeight:700,cursor:"pointer",textDecoration:"underline"}}>Register here</button>
        </div>
        <div style={{textAlign:"center",fontSize:11,color:C.muted,marginTop:10}}>Bright Metalwork Ltd · Worker Portal</div>
      </div>
    </div>
  );
}

// ─── TIMESHEET VIEW ───────────────────────────────────────────────────────────
function TimesheetView({worker,weekLabel,siteHours,allSites,payslips}){
  const activeDays=useMemo(()=>{const hw=WEEKEND_DAYS.some(d=>worker.days?.[d]&&!isOff(worker.days[d]));return hw?ALL_DAYS:BASE_DAYS;},[worker]);
  const {stdH,otH,gross,taxAmt,net,bd}=useMemo(()=>calcPay(worker,activeDays,siteHours),[worker,activeDays,siteHours]);
  const taxPct=Math.round((worker.taxRate||0)*100);
  const currentPayslip=payslips.find(p=>p.weekLabel===weekLabel);

  return <div style={{padding:14}}>
    {/* Current week header */}
    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12,flexWrap:"wrap",gap:8}}>
      <div>
        <div style={{fontSize:13,fontWeight:800,color:C.text}}>Current Week</div>
        <div style={{fontSize:11,color:C.muted}}>WC {weekLabel}</div>
      </div>
      <button onClick={()=>printPayslip(worker,weekLabel,gross,net,taxAmt,taxPct,bd,activeDays)}
        style={{padding:"7px 13px",background:"#1a2535",border:`1px solid ${C.red}44`,borderRadius:8,color:C.red,cursor:"pointer",fontSize:12,fontWeight:700}}>📄 Print Timesheet</button>
    </div>
    {/* KPIs */}
    <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:7,marginBottom:14}}>
      <KPI label="Std Hours" value={stdH+"h"} color={C.accent}/>
      <KPI label="OT Hours" value={otH>0?otH+"h":"—"} color={C.yellow}/>
      <KPI label="Gross" value={"£"+gross.toFixed(0)} color={C.green}/>
      <KPI label="Net" value={"£"+net.toFixed(0)} color={C.purple}/>
    </div>
    {/* Daily rows */}
    <div style={{display:"flex",flexDirection:"column",gap:7,marginBottom:16}}>
      {activeDays.map(d=>{
        const site=worker.days?.[d],b=bd[d],col=siteColor(site,allSites),off=!site||isOff(site);
        return <Card key={d} style={{borderLeft:`3px solid ${off?"#1e2535":col}`,padding:"10px 13px"}}>
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            <div style={{fontSize:12,fontWeight:800,color:off?C.muted:C.text,minWidth:32}}>{d}</div>
            {off?<span style={{fontSize:12,color:C.muted,fontStyle:"italic",flex:1}}>{site||"Not allocated"}</span>
              :<><div style={{flex:1}}><Badge label={site.trim()} color={col}/></div>
                <span style={{fontSize:11,color:C.muted}}>{b?.hours}h{b?.ot>0?` +${b.ot}ot`:""}</span>
                <span style={{fontSize:13,fontWeight:700,color:C.green,minWidth:55,textAlign:"right"}}>£{b?.gross.toFixed(2)}</span>
              </>}
          </div>
        </Card>;
      })}
    </div>
    {/* Pay summary */}
    <Card style={{background:"linear-gradient(135deg,#0d2218,#1a3020)",border:`1px solid ${C.green}44`}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
        <div style={{fontSize:11,color:C.muted,fontWeight:700,textTransform:"uppercase"}}>Week Summary</div>
        {currentPayslip&&<Badge label={currentPayslip.status==="paid"?"✓ PAID":"Pending"} color={currentPayslip.status==="paid"?C.green:C.yellow}/>}
      </div>
      {[["Gross Pay","£"+gross.toFixed(2),C.green],[`Tax (${taxPct}%)`,"-£"+taxAmt.toFixed(2),C.red],["Net Pay","£"+net.toFixed(2),C.purple]].map(([l,v,c])=>
        <div key={l} style={{display:"flex",justifyContent:"space-between",padding:"5px 0",borderBottom:`1px solid ${C.border}`}}>
          <span style={{fontSize:12,color:C.muted}}>{l}</span><span style={{fontSize:13,fontWeight:700,color:c}}>{v}</span>
        </div>
      )}
      <div style={{display:"flex",justifyContent:"space-between",padding:"8px 0 0"}}>
        <span style={{fontSize:13,fontWeight:800,color:C.sub}}>NET TO ACCOUNT</span>
        <span style={{fontSize:20,fontWeight:900,color:C.green}}>£{net.toFixed(2)}</span>
      </div>
    </Card>
  </div>;
}

// ─── PAYSLIP HISTORY VIEW ─────────────────────────────────────────────────────
function PayslipHistory({worker,payslips,siteHours,allSites}){
  const [openId,setOpenId]=useState(null);
  if(payslips.length===0)return(
    <div style={{padding:24,textAlign:"center"}}>
      <div style={{fontSize:32,marginBottom:10}}>📋</div>
      <div style={{color:C.muted,fontSize:13}}>No payslip history yet. Past weeks will appear here once saved by the system.</div>
    </div>
  );
  return <div style={{padding:14}}>
    <div style={{fontSize:11,color:C.muted,marginBottom:12}}>All payslips are saved automatically by the system each week.</div>
    <div style={{display:"flex",flexDirection:"column",gap:8}}>
      {[...payslips].sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt)).map(ps=>{
        const isPaid=ps.status==="paid",isOpen=openId===ps.id;
        return <Card key={ps.id} style={{border:`1px solid ${isPaid?C.green+"44":C.border}`}}>
          <div style={{display:"flex",alignItems:"center",gap:10,cursor:"pointer"}} onClick={()=>setOpenId(isOpen?null:ps.id)}>
            <div style={{flex:1}}>
              <div style={{fontSize:13,fontWeight:700,color:C.text}}>WC {ps.weekLabel}</div>
              <div style={{fontSize:11,color:C.muted,marginTop:2}}>{fmtDate(ps.createdAt)}</div>
            </div>
            <div style={{textAlign:"right",marginRight:8}}>
              <div style={{fontSize:15,fontWeight:800,color:isPaid?C.green:C.yellow}}>£{ps.net?.toFixed(2)||"—"}</div>
              <div style={{fontSize:10,color:C.muted}}>net</div>
            </div>
            <Badge label={isPaid?"✓ Paid":"Pending"} color={isPaid?C.green:C.yellow}/>
            <span style={{color:C.muted,fontSize:14}}>{isOpen?"▲":"▼"}</span>
          </div>
          {isOpen&&<div style={{marginTop:12,paddingTop:12,borderTop:`1px solid ${C.border}`}}>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:7,marginBottom:10}}>
              <KPI label="Gross" value={"£"+(ps.gross||0).toFixed(2)} color={C.green}/>
              <KPI label="Tax" value={"£"+(ps.taxAmt||0).toFixed(2)} color={C.red}/>
              <KPI label="Net" value={"£"+(ps.net||0).toFixed(2)} color={C.purple}/>
            </div>
            {isPaid&&<div style={{background:"#0d2218",borderRadius:8,padding:"8px 12px",marginBottom:10,fontSize:12,color:C.green}}>
              ✓ Paid on {fmtDate(ps.paidAt)} {ps.paidNote?`· ${ps.paidNote}`:""}
            </div>}
            <button onClick={()=>printPayslip(worker,ps.weekLabel,ps.gross||0,ps.net||0,ps.taxAmt||0,Math.round((worker.taxRate||0)*100),ps.bd||{},Object.keys(ps.bd||{}).length>5?ALL_DAYS:BASE_DAYS)}
              style={{width:"100%",padding:"9px",background:"#1a2535",border:`1px solid ${C.red}44`,borderRadius:8,color:C.red,cursor:"pointer",fontSize:12,fontWeight:700}}>
              📄 Print Payslip
            </button>
          </div>}
        </Card>;
      })}
    </div>
  </div>;
}

// ─── PERSONAL DETAILS VIEW ────────────────────────────────────────────────────
function PersonalView({worker,onSave}){
  const [editing,setEditing]=useState(false);
  const [saving,setSaving]=useState(false);
  const [err,setErr]=useState("");
  const [f,setF]=useState({name:worker.name||"",phone:worker.phone||"",address:worker.address||"",niNumber:worker.niNumber||"",emergencyName:worker.emergencyName||"",emergencyPhone:worker.emergencyPhone||"",bankName:worker.bankName||"",sortCode:worker.sortCode||"",accountNo:worker.accountNo||""});
  const set=(k,v)=>setF(x=>({...x,[k]:v}));

  const save=async()=>{
    setSaving(true);setErr("");
    try{
      const now=new Date().toISOString();
      const history=[...(worker.detailsHistory||[]),{changedAt:now,snapshot:{name:worker.name,phone:worker.phone,address:worker.address,niNumber:worker.niNumber,emergencyName:worker.emergencyName,emergencyPhone:worker.emergencyPhone,bankName:worker.bankName,sortCode:worker.sortCode,accountNo:worker.accountNo}}];
      const updated={...worker,...f,detailsHistory:history};
      await sbPatch("workers",`id=eq.${worker.id}`,{data:updated});
      onSave(updated);setEditing(false);
    }catch(e){setErr("Save failed: "+e.message);}
    setSaving(false);
  };

  const FIELDS=[["Full Name","name"],["Phone Number","phone"],["Home Address","address"],["NI Number","niNumber"],["Emergency Contact Name","emergencyName"],["Emergency Contact Phone","emergencyPhone"]];
  const BANK=[["Bank Name","bankName"],["Sort Code","sortCode"],["Account Number","accountNo"]];

  return <div style={{padding:14}}>
    {err&&<div style={{background:"#2d1515",border:`1px solid ${C.red}44`,borderRadius:8,padding:"9px 12px",color:C.red,fontSize:12,marginBottom:12}}>{err}</div>}

    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
      <div style={{fontSize:13,fontWeight:800,color:C.text}}>Personal Details</div>
      {!editing
        ?<button onClick={()=>setEditing(true)} style={{padding:"7px 13px",background:"#1e3a5f",border:`1px solid ${C.accent}`,borderRadius:8,color:C.accent,cursor:"pointer",fontSize:12,fontWeight:700}}>✏️ Edit</button>
        :<div style={{display:"flex",gap:8}}>
          <button onClick={()=>{setEditing(false);setF({name:worker.name||"",phone:worker.phone||"",address:worker.address||"",niNumber:worker.niNumber||"",emergencyName:worker.emergencyName||"",emergencyPhone:worker.emergencyPhone||"",bankName:worker.bankName||"",sortCode:worker.sortCode||"",accountNo:worker.accountNo||""});}} style={{padding:"7px 13px",background:C.card,border:`1px solid ${C.border}`,borderRadius:8,color:C.muted,cursor:"pointer",fontSize:12,fontWeight:700}}>Cancel</button>
          <button onClick={save} disabled={saving} style={{padding:"7px 13px",background:"#14532d",border:`1px solid ${C.green}`,borderRadius:8,color:C.green,cursor:"pointer",fontSize:12,fontWeight:700}}>{saving?"Saving…":"✓ Save"}</button>
        </div>}
    </div>

    <Card style={{marginBottom:12}}>
      <div style={{fontSize:11,fontWeight:700,color:C.accent,textTransform:"uppercase",marginBottom:12}}>Personal Information</div>
      {FIELDS.map(([label,key])=><div key={key} style={{marginBottom:editing?0:10}}>
        {editing?<Inp label={label} value={f[key]} onChange={v=>set(key,v)}/>
          :<div style={{display:"flex",justifyContent:"space-between",padding:"6px 0",borderBottom:`1px solid ${C.border}`}}>
            <span style={{fontSize:12,color:C.muted}}>{label}</span>
            <span style={{fontSize:13,fontWeight:600,color:f[key]?C.text:C.muted}}>{f[key]||"—"}</span>
          </div>}
      </div>)}
    </Card>

    <Card style={{marginBottom:12}}>
      <div style={{fontSize:11,fontWeight:700,color:C.green,textTransform:"uppercase",marginBottom:12}}>🏦 Bank Details</div>
      {BANK.map(([label,key])=><div key={key} style={{marginBottom:editing?0:10}}>
        {editing?<Inp label={label} value={f[key]} onChange={v=>set(key,v)}/>
          :<div style={{display:"flex",justifyContent:"space-between",padding:"6px 0",borderBottom:`1px solid ${C.border}`}}>
            <span style={{fontSize:12,color:C.muted}}>{label}</span>
            <span style={{fontSize:13,fontWeight:600,color:f[key]?C.text:C.muted}}>{key==="accountNo"&&f[key]?"••••"+f[key].slice(-4):f[key]||"—"}</span>
          </div>}
      </div>)}
    </Card>

    {/* Read-only pay info */}
    <Card style={{marginBottom:12}}>
      <div style={{fontSize:11,fontWeight:700,color:C.purple,textTransform:"uppercase",marginBottom:12}}>💷 Payment Info (Admin Set)</div>
      {[["Hourly Rate",worker.agreedRate?"£"+worker.agreedRate+"/hr":"Not set"],["Tax Rate",Math.round((worker.taxRate||0)*100)+"%"],["Position",worker.position||"—"],["Company",worker.company||"—"]].map(([l,v])=>
        <div key={l} style={{display:"flex",justifyContent:"space-between",padding:"6px 0",borderBottom:`1px solid ${C.border}`}}>
          <span style={{fontSize:12,color:C.muted}}>{l}</span><span style={{fontSize:13,fontWeight:600,color:C.text}}>{v}</span>
        </div>
      )}
    </Card>

    {/* Change history */}
    {(worker.detailsHistory||[]).length>0&&<Card>
      <div style={{fontSize:11,fontWeight:700,color:C.yellow,textTransform:"uppercase",marginBottom:10}}>📋 Change History</div>
      <div style={{display:"flex",flexDirection:"column",gap:6,maxHeight:200,overflowY:"auto"}}>
        {[...worker.detailsHistory].reverse().map((h,i)=><div key={i} style={{background:C.bg,borderRadius:7,padding:"8px 10px",fontSize:11}}>
          <div style={{color:C.muted,marginBottom:4}}>Changed on {fmtDate(h.changedAt)}</div>
          <div style={{color:C.sub}}>Name: {h.snapshot?.name||"—"} · Phone: {h.snapshot?.phone||"—"}</div>
        </div>)}
      </div>
    </Card>}
  </div>;
}

// ─── MAIN DASHBOARD ───────────────────────────────────────────────────────────
function Dashboard({worker:initialWorker,weekLabel,siteHours,allSites,payslips,onLogout}){
  const [worker,setWorker]=useState(initialWorker);
  const [tab,setTab]=useState("timesheet");
  const hasPaidNotif=payslips.some(p=>p.status==="paid"&&!p.workerAcknowledged);
  const certAlerts=CERTS.filter(c=>{const s=certStatus(c,worker);return s==="expired"||s==="expiring";});

  return(
    <div style={{minHeight:"100vh",background:C.bg,fontFamily:"system-ui,sans-serif",color:C.text,maxWidth:480,margin:"0 auto"}}>
      {/* Header */}
      <div style={{background:"linear-gradient(135deg,#0f172a,#1a1f2e)",borderBottom:`1px solid ${C.border}`,padding:"14px 16px"}}>
        <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:8}}>
          <div style={{width:42,height:42,borderRadius:"50%",background:"linear-gradient(135deg,#1e3a5f,#3b82f6)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:16,fontWeight:900,color:"#fff",flexShrink:0}}>
            {worker.name?.split(" ").map(n=>n[0]).join("").slice(0,2).toUpperCase()||"?"}
          </div>
          <div style={{flex:1}}>
            <div style={{fontSize:16,fontWeight:800}}>{worker.name}</div>
            <div style={{fontSize:11,color:C.muted}}>{worker.position||"—"} · {worker.company||"—"}</div>
          </div>
          <button onClick={onLogout} style={{background:"#1e2535",border:`1px solid ${C.border}`,borderRadius:8,padding:"6px 10px",color:C.muted,cursor:"pointer",fontSize:12,fontWeight:600}}>Sign out</button>
        </div>
        <div style={{fontSize:11,color:C.muted}}>Week commencing <span style={{color:C.accent,fontWeight:700}}>{weekLabel}</span></div>
        {/* Notifications */}
        {hasPaidNotif&&<div style={{marginTop:8,background:"#0d2218",border:`1px solid ${C.green}44`,borderRadius:8,padding:"8px 12px",fontSize:12,color:C.green,display:"flex",alignItems:"center",gap:8}}>
          <span>💷</span><span>You have a new paid payslip — check your History tab</span>
        </div>}
        {certAlerts.length>0&&<div style={{marginTop:6,background:"#2d1515",border:`1px solid ${C.red}44`,borderRadius:8,padding:"8px 12px",fontSize:12,color:C.red,display:"flex",alignItems:"center",gap:8}}>
          <span>⚠️</span><span>{certAlerts.length} certification{certAlerts.length!==1?"s":""} need attention</span>
        </div>}
      </div>

      {/* Tabs */}
      <div style={{display:"flex",background:"#111827",borderBottom:`1px solid ${C.border}`,padding:"6px 8px",gap:3}}>
        {[["timesheet","📅 Timesheet"],["history","📋 History"+(hasPaidNotif?" 🔴":"")],["certs","🛡 Certs"+(certAlerts.length>0?" ⚠️":"")],["profile","👤 Profile"]].map(([v,l])=>(
          <button key={v} onClick={()=>setTab(v)} style={{flex:1,padding:"7px 3px",background:tab===v?"#1e3a5f":"transparent",border:tab===v?`1px solid ${C.accent}`:"1px solid transparent",borderRadius:7,color:tab===v?C.accent:C.muted,cursor:"pointer",fontSize:11,fontWeight:tab===v?700:400}}>{l}</button>
        ))}
      </div>

      {/* Views */}
      {tab==="timesheet"&&<TimesheetView worker={worker} weekLabel={weekLabel} siteHours={siteHours} allSites={allSites} payslips={payslips}/>}
      {tab==="history"&&<PayslipHistory worker={worker} payslips={payslips} siteHours={siteHours} allSites={allSites}/>}
      {tab==="certs"&&<div style={{padding:14}}>
        <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:6,marginBottom:14}}>
          {[["Held",CERTS.filter(c=>worker.certs?.[c.key]?.held).length,C.accent],["Valid",CERTS.filter(c=>certStatus(c,worker)==="valid").length,C.green],["Soon",CERTS.filter(c=>certStatus(c,worker)==="expiring").length,C.yellow],["Expired",CERTS.filter(c=>certStatus(c,worker)==="expired").length,C.red]].map(([l,v,c])=><KPI key={l} label={l} value={v} color={c}/>)}
        </div>
        {CERTS.filter(c=>worker.certs?.[c.key]?.held).map(cert=>{
          const s=certStatus(cert,worker),val=worker.certs[cert.key],photoUrl=val?.photoUrl;
          return <Card key={cert.key} style={{borderLeft:`3px solid ${({valid:C.green,expiring:C.yellow,expired:C.red,missing:"#2d3555"})[s]}44`,padding:"10px 14px",marginBottom:7}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <span style={{fontSize:13,fontWeight:600,color:C.text}}>{cert.label}</span>
              <Badge label={s==="valid"?"✓ Valid":s.toUpperCase()} color={({valid:C.green,expiring:C.yellow,expired:C.red,missing:"#64748b"})[s]}/>
            </div>
            {cert.hasExpiry&&val?.expiry&&<div style={{fontSize:11,color:C.muted,marginTop:3}}>Expires: <span style={{fontWeight:600}}>{fmtDate(val.expiry)}</span></div>}
            {photoUrl&&<img src={photoUrl} alt={cert.label} style={{marginTop:8,width:"100%",maxHeight:90,objectFit:"cover",borderRadius:6,border:`1px solid ${C.border}`,cursor:"pointer"}} onClick={()=>window.open(photoUrl,"_blank")}/>}
          </Card>;
        })}
        {CERTS.filter(c=>worker.certs?.[c.key]?.held).length===0&&<Card style={{textAlign:"center",padding:28}}><div style={{fontSize:28,marginBottom:8}}>🛡</div><div style={{color:C.muted,fontSize:13}}>No certifications recorded yet.</div></Card>}
      </div>}
      {tab==="profile"&&<PersonalView worker={worker} onSave={updated=>setWorker(updated)}/>}

      <div style={{padding:"10px 16px",textAlign:"center",fontSize:11,color:C.muted,borderTop:`1px solid ${C.border}`,marginTop:8}}>Bright Metalwork Ltd · Worker Portal · Read-only scheduling</div>
    </div>
  );
}

// ─── ROOT ─────────────────────────────────────────────────────────────────────
export default function App(){
  const [worker,setWorker]=useState(null);
  const [appData,setAppData]=useState({weekLabel:"",siteHours:{},allSites:[],payslips:[]});
  const [loading,setLoading]=useState(false);

  const handleLoginSuccess=async(w,token)=>{
    setLoading(true);
    try{
      const cfgRows=await sbGet("app_config","select=key,value");
      const cfg=Object.fromEntries(cfgRows.map(r=>[r.key,r.value]));
      // Load payslips for this worker
      const payslips=(w.payslips||[]);
      setAppData({weekLabel:cfg.week_label||"",siteHours:cfg.site_hours||{},allSites:cfg.all_sites||[],payslips});
      setWorker(w);
    }catch(e){console.error(e);}
    setLoading(false);
  };

  if(loading)return(
    <div style={{minHeight:"100vh",background:C.bg,display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"system-ui,sans-serif"}}>
      <div style={{textAlign:"center"}}><div style={{fontSize:28,marginBottom:12}}>🏗</div><div style={{color:C.accent,fontWeight:700}}>Loading your portal…</div></div>
    </div>
  );
  if(worker)return <Dashboard worker={worker} weekLabel={appData.weekLabel} siteHours={appData.siteHours} allSites={appData.allSites} payslips={appData.payslips} onLogout={()=>setWorker(null)}/>;
  return <LoginScreen onLoginSuccess={handleLoginSuccess}/>;
}
