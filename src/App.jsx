import { useState, useEffect, useMemo } from "react";

// ─── Supabase ─────────────────────────────────────────────────────────────────
const SB_URL = "https://xljglqiifogyxefhszwa.supabase.co";
const SB_KEY = "sb_publishable_sjP2pkelZOMSDR45qwyH_g_v6KSB41k";
const SB_H   = {"Content-Type":"application/json","apikey":SB_KEY,"Authorization":`Bearer ${SB_KEY}`};

async function sbGet(t,f=""){const r=await fetch(`${SB_URL}/rest/v1/${t}?${f}`,{headers:SB_H});if(!r.ok)throw new Error(await r.text());return r.json();}
async function sbUpsert(t,d){const r=await fetch(`${SB_URL}/rest/v1/${t}`,{method:"POST",headers:{...SB_H,"Prefer":"resolution=merge-duplicates"},body:JSON.stringify(d)});if(!r.ok)throw new Error(await r.text());}

// Auth helpers
async function sbSignUp(email,password){
  const r=await fetch(`${SB_URL}/auth/v1/signup`,{method:"POST",headers:SB_H,body:JSON.stringify({email,password})});
  const d=await r.json();if(d.error)throw new Error(d.error.message||d.error);return d;
}
async function sbSignIn(email,password){
  const r=await fetch(`${SB_URL}/auth/v1/token?grant_type=password`,{method:"POST",headers:SB_H,body:JSON.stringify({email,password})});
  const d=await r.json();if(d.error)throw new Error(d.error.message||d.error);return d;
}

// Storage upload
async function uploadCertPhoto(file, workerId, certKey){
  const ext=file.name.split(".").pop();
  const path=`${workerId}/${certKey}.${ext}`;
  const r=await fetch(`${SB_URL}/storage/v1/object/cert-photos/${path}`,{
    method:"POST",
    headers:{"apikey":SB_KEY,"Authorization":`Bearer ${SB_KEY}`,"Content-Type":file.type,"x-upsert":"true"},
    body:file
  });
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
    const site=w.days?.[d];if(!site||isOff(site))return;
    const sk=site.trim(),hrs=siteHours[sk]?.hours||w.hoursPerDay?.[d]||DEFAULT_HOURS,ot=w.overtimeHours?.[d]||0;
    const stdPay=hrs*rate,otPay=ot*rate*otM,g=stdPay+otPay;
    stdH+=hrs;otH+=ot;gross+=g;
    bd[d]={site:sk,hours:hrs,ot,stdPay,otPay,gross:g};
  });
  const taxAmt=gross*tax,net=gross-taxAmt;
  return{stdH,otH,gross,taxAmt,net,bd};
}

// ─── Colours ──────────────────────────────────────────────────────────────────
const C={bg:"#0a0e1a",surface:"#111827",card:"#1a1f2e",border:"#1e2535",accent:"#3b82f6",green:"#34d399",yellow:"#fbbf24",red:"#f87171",purple:"#a78bfa",muted:"#64748b",text:"#f1f5f9",sub:"#94a3b8"};
const CERT_C={valid:C.green,expiring:C.yellow,expired:C.red,missing:"#2d3555"};
const DAY_COLORS=["#3b82f6","#8b5cf6","#06b6d4","#10b981","#f59e0b","#ef4444","#f97316"];
function siteColor(name,allSites=[]){if(!name?.trim())return C.muted;const found=allSites.find(s=>s.name===name.trim());if(found)return found.color;let h=0;for(let i=0;i<name.length;i++)h=(h*31+name.charCodeAt(i))&0xffff;return DAY_COLORS[h%DAY_COLORS.length];}

// ─── UI Primitives ────────────────────────────────────────────────────────────
function Card({children,style={}}){return <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:14,padding:16,...style}}>{children}</div>;}
function Lbl({children}){return <div style={{fontSize:10,color:C.muted,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:5}}>{children}</div>;}
function Badge({label,color}){return <span style={{display:"inline-block",padding:"3px 10px",borderRadius:20,fontSize:12,fontWeight:700,background:color+"22",color,border:`1px solid ${color}44`,whiteSpace:"nowrap"}}>{label}</span>;}
function KPI({label,value,color,sub}){return <div style={{background:C.bg,borderRadius:10,padding:"10px 12px",textAlign:"center",border:`1px solid ${color}22`}}><div style={{fontSize:10,color:C.muted,fontWeight:700,textTransform:"uppercase",marginBottom:2}}>{label}</div><div style={{fontSize:20,fontWeight:900,color}}>{value}</div>{sub&&<div style={{fontSize:10,color:C.muted,marginTop:1}}>{sub}</div>}</div>;}
function Inp({label,value,onChange,type="text",placeholder="",required=false,hint=""}){
  return <div style={{marginBottom:14}}>
    <label style={{fontSize:11,color:C.sub,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.05em",display:"block",marginBottom:5}}>{label}{required&&<span style={{color:C.red}}> *</span>}</label>
    <input type={type} value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder}
      style={{width:"100%",background:C.bg,border:`1px solid ${C.border}`,borderRadius:9,padding:"11px 13px",color:C.text,fontSize:14,outline:"none",boxSizing:"border-box"}}/>
    {hint&&<div style={{fontSize:11,color:C.muted,marginTop:4}}>{hint}</div>}
  </div>;
}
function Sel({label,value,onChange,options,required=false}){
  return <div style={{marginBottom:14}}>
    <label style={{fontSize:11,color:C.sub,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.05em",display:"block",marginBottom:5}}>{label}{required&&<span style={{color:C.red}}> *</span>}</label>
    <select value={value} onChange={e=>onChange(e.target.value)} style={{width:"100%",background:C.bg,border:`1px solid ${C.border}`,borderRadius:9,padding:"11px 13px",color:value?C.text:C.muted,fontSize:14,outline:"none",boxSizing:"border-box",cursor:"pointer"}}>
      <option value="">— Select —</option>
      {options.map(o=><option key={o} value={o}>{o}</option>)}
    </select>
  </div>;
}

// ─── Step indicator ───────────────────────────────────────────────────────────
function Steps({current,total,labels}){
  return <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:0,marginBottom:24}}>
    {labels.map((l,i)=>{
      const done=i<current,active=i===current;
      return <div key={i} style={{display:"flex",alignItems:"center"}}>
        <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:4}}>
          <div style={{width:28,height:28,borderRadius:"50%",background:done?C.green:active?"#1e3a5f":C.card,border:`2px solid ${done?C.green:active?C.accent:C.border}`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,fontWeight:800,color:done?"#fff":active?C.accent:C.muted}}>
            {done?"✓":i+1}
          </div>
          <div style={{fontSize:9,color:active?C.accent:done?C.green:C.muted,fontWeight:active||done?700:400,whiteSpace:"nowrap"}}>{l}</div>
        </div>
        {i<total-1&&<div style={{width:32,height:2,background:done?C.green:C.border,marginBottom:14,flexShrink:0}}/>}
      </div>;
    })}
  </div>;
}

// ─── REGISTRATION FLOW ────────────────────────────────────────────────────────
function RegisterScreen({onBack}){
  const [step,setStep]=useState(0);
  const [submitting,setSubmitting]=useState(false);
  const [done,setDone]=useState(false);
  const [err,setErr]=useState("");

  // Step 1 — Personal info
  const [name,setName]=useState("");
  const [phone,setPhone]=useState("");
  const [address,setAddress]=useState("");
  const [position,setPosition]=useState("");
  const [company,setCompany]=useState("");
  const [niNumber,setNiNumber]=useState("");
  const [dob,setDob]=useState("");
  const [emergencyName,setEmergencyName]=useState("");
  const [emergencyPhone,setEmergencyPhone]=useState("");

  // Step 2 — Certifications
  const [certs,setCerts]=useState({}); // {key:{held,expiry,photoFile,photoUrl}}
  const [uploading,setUploading]=useState({});

  // Step 3 — Account
  const [email,setEmail]=useState("");
  const [password,setPassword]=useState("");
  const [password2,setPassword2]=useState("");

  const tempId=useMemo(()=>"reg_"+Date.now(),[]);

  const toggleCert=(key)=>{
    setCerts(c=>({...c,[key]:{...c[key],held:!c[key]?.held}}));
  };
  const setCertExpiry=(key,val)=>setCerts(c=>({...c,[key]:{...c[key],expiry:val}}));

  const handlePhotoUpload=async(key,file)=>{
    if(!file)return;
    setUploading(u=>({...u,[key]:true}));
    try{
      const url=await uploadCertPhoto(file,tempId,key);
      setCerts(c=>({...c,[key]:{...c[key],photoUrl:url,photoFile:null}}));
    }catch(e){setErr("Photo upload failed: "+e.message);}
    setUploading(u=>({...u,[key]:false}));
  };

  const validateStep=()=>{
    setErr("");
    if(step===0){
      if(!name.trim())return setErr("Full name is required.")||false;
      if(!position)return setErr("Position is required.")||false;
      if(!company)return setErr("Company is required.")||false;
      return true;
    }
    if(step===1) return true; // certs optional
    if(step===2){
      if(!email.trim())return setErr("Email is required.")||false;
      if(!password)return setErr("Password is required.")||false;
      if(password.length<6)return setErr("Password must be at least 6 characters.")||false;
      if(password!==password2)return setErr("Passwords do not match.")||false;
      return true;
    }
    return true;
  };

  const next=()=>{if(validateStep())setStep(s=>s+1);};
  const back=()=>{setErr("");setStep(s=>s-1);};

  const submit=async()=>{
    if(!validateStep())return;
    setSubmitting(true);setErr("");
    try{
      // 1. Create Supabase Auth account
      await sbSignUp(email,password);

      // 2. Build worker data object
      const workerData={
        id:tempId,
        name:name.trim(),
        phone,address,position,company,niNumber,dob,
        emergencyName,emergencyPhone,
        email,
        certs:Object.fromEntries(Object.entries(certs).filter(([,v])=>v?.held).map(([k,v])=>[k,{held:true,expiry:v.expiry||"",photoUrl:v.photoUrl||""}])),
        days:{Mon:"",Tue:"",Wed:"",Thu:"",Fri:"",Sat:"",Sun:""},
        hoursPerDay:{},overtimeHours:{},agreedRate:0,taxRate:0.20,
        registeredAt:new Date().toISOString(),
        authEmail:email,
      };

      // 3. Insert into pending_workers
      await fetch(`${SB_URL}/rest/v1/pending_workers`,{
        method:"POST",
        headers:{...SB_H,"Prefer":"return=minimal"},
        body:JSON.stringify({status:"pending",data:workerData})
      });

      setDone(true);
    }catch(e){
      setErr(e.message||"Registration failed. Please try again.");
    }
    setSubmitting(false);
  };

  if(done) return(
    <div style={{minHeight:"100vh",background:C.bg,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:24,fontFamily:"system-ui,sans-serif",textAlign:"center"}}>
      <div style={{fontSize:56,marginBottom:16}}>🎉</div>
      <div style={{fontSize:22,fontWeight:900,color:C.text,marginBottom:8}}>Registration Submitted!</div>
      <div style={{fontSize:14,color:C.sub,maxWidth:320,lineHeight:1.6,marginBottom:24}}>Your details have been sent to Bright Metalwork. Once approved by an administrator you'll be able to sign in with your email and password.</div>
      <div style={{background:C.card,border:`1px solid ${C.green}44`,borderRadius:12,padding:"12px 20px",marginBottom:24,fontSize:13,color:C.green,fontWeight:600}}>✓ Account created for {email}</div>
      <button onClick={onBack} style={{background:"linear-gradient(135deg,#1e3a5f,#3b82f6)",border:"none",borderRadius:10,padding:"12px 28px",color:"#fff",fontSize:15,fontWeight:800,cursor:"pointer"}}>← Back to Sign In</button>
    </div>
  );

  const STEP_LABELS=["Personal","Certs","Account"];

  return(
    <div style={{minHeight:"100vh",background:C.bg,fontFamily:"system-ui,sans-serif",padding:16,paddingBottom:40}}>
      {/* Header */}
      <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:20,paddingTop:8}}>
        <button onClick={step===0?onBack:back} style={{background:"none",border:"none",color:C.muted,cursor:"pointer",fontSize:20,padding:"4px 8px"}}>←</button>
        <div>
          <div style={{fontSize:18,fontWeight:900,color:C.text}}>Register</div>
          <div style={{fontSize:12,color:C.muted}}>Bright Metalwork Worker Portal</div>
        </div>
      </div>

      <div style={{maxWidth:480,margin:"0 auto"}}>
        <Steps current={step} total={3} labels={STEP_LABELS}/>

        {err&&<div style={{background:"#2d1515",border:`1px solid ${C.red}44`,borderRadius:9,padding:"10px 14px",color:C.red,fontSize:13,marginBottom:16}}>⚠ {err}</div>}

        {/* ── STEP 0: Personal Info ── */}
        {step===0&&<Card>
          <div style={{fontSize:15,fontWeight:800,color:C.text,marginBottom:16}}>👤 Personal Information</div>
          <Inp label="Full Name" value={name} onChange={setName} placeholder="e.g. John Smith" required/>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"0 12px"}}>
            <Sel label="Position" value={position} onChange={setPosition} options={POSITIONS} required/>
            <Sel label="Company" value={company} onChange={setCompany} options={COMPANIES} required/>
          </div>
          <Inp label="Phone Number" value={phone} onChange={setPhone} type="tel" placeholder="+44 7700 000000"/>
          <Inp label="Date of Birth" value={dob} onChange={setDob} type="date"/>
          <Inp label="NI Number" value={niNumber} onChange={setNiNumber} placeholder="AB 12 34 56 C" hint="National Insurance number"/>
          <Inp label="Home Address" value={address} onChange={setAddress} placeholder="Full home address"/>
          <div style={{borderTop:`1px solid ${C.border}`,paddingTop:14,marginTop:4}}>
            <div style={{fontSize:13,fontWeight:700,color:C.sub,marginBottom:10}}>🆘 Emergency Contact</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"0 12px"}}>
              <Inp label="Contact Name" value={emergencyName} onChange={setEmergencyName} placeholder="Full name"/>
              <Inp label="Contact Phone" value={emergencyPhone} onChange={setEmergencyPhone} type="tel" placeholder="+44 7700 000000"/>
            </div>
          </div>
          <button onClick={next} style={{width:"100%",background:"linear-gradient(135deg,#1e3a5f,#3b82f6)",border:"none",borderRadius:10,padding:"13px",color:"#fff",fontSize:15,fontWeight:800,cursor:"pointer",marginTop:4}}>Next: Certifications →</button>
        </Card>}

        {/* ── STEP 1: Certifications ── */}
        {step===1&&<div>
          <Card style={{marginBottom:12}}>
            <div style={{fontSize:15,fontWeight:800,color:C.text,marginBottom:4}}>🛡 Certifications</div>
            <div style={{fontSize:12,color:C.muted,marginBottom:16}}>Tick each certification you hold, add the expiry date and upload a photo of the card. All optional — you can add more later.</div>
            <div style={{display:"flex",flexDirection:"column",gap:10}}>
              {CERTS.map(cert=>{
                const held=certs[cert.key]?.held||false;
                const expiry=certs[cert.key]?.expiry||"";
                const photoUrl=certs[cert.key]?.photoUrl||"";
                const isUploading=uploading[cert.key];
                return <div key={cert.key} style={{background:C.bg,borderRadius:10,border:`1px solid ${held?C.accent+"44":C.border}`,overflow:"hidden"}}>
                  {/* Cert toggle row */}
                  <div onClick={()=>toggleCert(cert.key)} style={{display:"flex",alignItems:"center",gap:10,padding:"11px 13px",cursor:"pointer"}}>
                    <div style={{width:20,height:20,borderRadius:5,background:held?C.accent:C.card,border:`2px solid ${held?C.accent:C.border}`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,transition:"all 0.15s"}}>
                      {held&&<span style={{color:"#fff",fontSize:13,fontWeight:900}}>✓</span>}
                    </div>
                    <div style={{flex:1}}>
                      <div style={{fontSize:13,fontWeight:held?700:400,color:held?C.text:C.sub}}>{cert.label}</div>
                      {cert.hasExpiry&&<div style={{fontSize:10,color:C.muted}}>Has expiry date</div>}
                    </div>
                    {held&&photoUrl&&<span style={{fontSize:10,color:C.green,fontWeight:700}}>📷 uploaded</span>}
                  </div>
                  {/* Expanded: expiry + photo */}
                  {held&&<div style={{padding:"0 13px 13px",borderTop:`1px solid ${C.border}`}}>
                    {cert.hasExpiry&&<div style={{marginTop:10}}>
                      <Lbl>Expiry Date</Lbl>
                      <input type="date" value={expiry} onChange={e=>setCertExpiry(cert.key,e.target.value)}
                        style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:7,padding:"8px 10px",color:C.text,fontSize:13,outline:"none",width:"100%",boxSizing:"border-box"}}/>
                    </div>}
                    <div style={{marginTop:10}}>
                      <Lbl>Photo of Certificate</Lbl>
                      <label style={{display:"flex",alignItems:"center",gap:10,padding:"9px 12px",background:C.card,border:`1px dashed ${photoUrl?C.green:C.border}`,borderRadius:8,cursor:"pointer"}}>
                        <span style={{fontSize:16}}>{isUploading?"⏳":photoUrl?"✅":"📷"}</span>
                        <span style={{fontSize:12,color:photoUrl?C.green:C.muted,fontWeight:photoUrl?700:400}}>
                          {isUploading?"Uploading…":photoUrl?"Photo uploaded — tap to replace":"Tap to upload photo"}
                        </span>
                        <input type="file" accept="image/*,application/pdf" style={{display:"none"}} onChange={e=>handlePhotoUpload(cert.key,e.target.files[0])}/>
                      </label>
                      {photoUrl&&<img src={photoUrl} alt={cert.label} style={{marginTop:8,width:"100%",maxHeight:120,objectFit:"cover",borderRadius:7,border:`1px solid ${C.green}44`}}/>}
                    </div>
                  </div>}
                </div>;
              })}
            </div>
          </Card>
          <div style={{display:"flex",gap:10}}>
            <button onClick={back} style={{flex:1,background:C.card,border:`1px solid ${C.border}`,borderRadius:10,padding:"13px",color:C.sub,fontSize:14,fontWeight:700,cursor:"pointer"}}>← Back</button>
            <button onClick={next} style={{flex:2,background:"linear-gradient(135deg,#1e3a5f,#3b82f6)",border:"none",borderRadius:10,padding:"13px",color:"#fff",fontSize:14,fontWeight:800,cursor:"pointer"}}>Next: Create Account →</button>
          </div>
        </div>}

        {/* ── STEP 2: Account ── */}
        {step===2&&<Card>
          <div style={{fontSize:15,fontWeight:800,color:C.text,marginBottom:4}}>🔐 Create Your Account</div>
          <div style={{fontSize:12,color:C.muted,marginBottom:16}}>You'll use this email and password to sign in to the worker portal once your account is approved.</div>
          <Inp label="Email Address" value={email} onChange={setEmail} type="email" placeholder="your@email.com" required/>
          <Inp label="Password" value={password} onChange={setPassword} type="password" placeholder="Minimum 6 characters" required hint="Choose a strong password you'll remember"/>
          <Inp label="Confirm Password" value={password2} onChange={setPassword2} type="password" placeholder="Repeat your password" required/>
          {/* Summary */}
          <div style={{background:C.bg,borderRadius:10,padding:"12px 14px",marginBottom:16,border:`1px solid ${C.border}`}}>
            <div style={{fontSize:11,color:C.muted,fontWeight:700,textTransform:"uppercase",marginBottom:8}}>Registration Summary</div>
            <div style={{display:"flex",flexDirection:"column",gap:5}}>
              {[["Name",name||"—"],["Position",position||"—"],["Company",company||"—"],["Certs held",Object.values(certs).filter(c=>c?.held).length+" selected"]].map(([l,v])=>
                <div key={l} style={{display:"flex",justifyContent:"space-between",fontSize:12}}>
                  <span style={{color:C.muted}}>{l}</span>
                  <span style={{color:C.text,fontWeight:600}}>{v}</span>
                </div>
              )}
            </div>
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
function LoginScreen({workers,onLogin,onLoginEmail,loading,error}){
  const [mode,setMode]=useState("name"); // "name" | "email"
  const [search,setSearch]=useState("");
  const [selected,setSelected]=useState(null);
  const [pin,setPin]=useState("");
  const [pinError,setPinError]=useState("");
  const [email,setEmail]=useState("");
  const [password,setPassword]=useState("");
  const [authErr,setAuthErr]=useState("");
  const [authLoading,setAuthLoading]=useState(false);
  const [showRegister,setShowRegister]=useState(false);

  const filtered=useMemo(()=>{if(!search.trim())return workers;return workers.filter(w=>w.name.toLowerCase().includes(search.toLowerCase()));},[workers,search]);

  const handleSelect=(w)=>{setSelected(w);setPin("");setPinError("");};
  const handleNameLogin=()=>{
    if(!selected)return;
    if(selected.pin&&selected.pin.toString().trim()){
      if(pin!==selected.pin.toString()){setPinError("Incorrect PIN. Try again.");setPin("");return;}
    }
    onLogin(selected);
  };
  const handleEmailLogin=async()=>{
    setAuthErr("");setAuthLoading(true);
    try{
      const data=await sbSignIn(email,password);
      // Find matching worker by auth email
      const matched=workers.find(w=>w.authEmail===email||w.email===email);
      if(matched)onLoginEmail(matched,data.access_token);
      else setAuthErr("Account found but no approved worker profile yet. Please wait for admin approval.");
    }catch(e){setAuthErr(e.message||"Sign in failed.");}
    setAuthLoading(false);
  };

  if(showRegister) return <RegisterScreen onBack={()=>setShowRegister(false)}/>;

  return(
    <div style={{minHeight:"100vh",background:C.bg,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:20,fontFamily:"system-ui,sans-serif"}}>
      {/* Logo */}
      <div style={{marginBottom:28,textAlign:"center"}}>
        <div style={{width:64,height:64,background:"linear-gradient(135deg,#1a3a5f,#3b82f6)",borderRadius:18,display:"flex",alignItems:"center",justifyContent:"center",fontSize:28,margin:"0 auto 12px"}}>🏗</div>
        <div style={{fontSize:22,fontWeight:900,color:C.text,letterSpacing:"-0.02em"}}>Bright Metalwork</div>
        <div style={{fontSize:13,color:C.muted,marginTop:3}}>Worker Portal</div>
      </div>

      <div style={{width:"100%",maxWidth:400}}>
        {/* Mode toggle */}
        <div style={{display:"flex",background:C.card,borderRadius:10,padding:4,gap:4,marginBottom:16}}>
          {[["name","Find my name"],["email","Email & Password"]].map(([v,l])=>
            <button key={v} onClick={()=>{setMode(v);setSelected(null);setAuthErr("");}} style={{flex:1,padding:"8px",background:mode===v?"#1e3a5f":"transparent",border:mode===v?`1px solid ${C.accent}`:"1px solid transparent",borderRadius:7,color:mode===v?C.accent:C.muted,cursor:"pointer",fontSize:12,fontWeight:mode===v?700:400}}>{l}</button>
          )}
        </div>

        {/* Name login */}
        {mode==="name"&&<>
          {!selected?<Card style={{marginBottom:12}}>
            <Lbl>Find your name</Lbl>
            <div style={{position:"relative",marginBottom:12}}>
              <span style={{position:"absolute",left:11,top:"50%",transform:"translateY(-50%)",fontSize:16,color:C.muted}}>🔍</span>
              <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Type your name…" autoFocus
                style={{width:"100%",background:C.bg,border:`1px solid ${C.border}`,borderRadius:9,padding:"11px 11px 11px 36px",color:C.text,fontSize:15,outline:"none",boxSizing:"border-box"}}/>
            </div>
            {loading&&<div style={{textAlign:"center",color:C.muted,fontSize:13,padding:16}}>Loading…</div>}
            {error&&<div style={{textAlign:"center",color:C.red,fontSize:13,padding:8}}>{error}</div>}
            <div style={{maxHeight:260,overflowY:"auto",display:"flex",flexDirection:"column",gap:6}}>
              {filtered.map(w=>(
                <button key={w.id} onClick={()=>handleSelect(w)}
                  style={{width:"100%",background:C.bg,border:`1px solid ${C.border}`,borderRadius:9,padding:"11px 14px",color:C.text,cursor:"pointer",textAlign:"left",display:"flex",alignItems:"center",gap:12}}
                  onMouseEnter={e=>e.currentTarget.style.borderColor=C.accent}
                  onMouseLeave={e=>e.currentTarget.style.borderColor=C.border}>
                  <div style={{width:36,height:36,borderRadius:"50%",background:"linear-gradient(135deg,#1e3a5f,#3b82f6)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:14,fontWeight:800,color:"#fff",flexShrink:0}}>
                    {w.name?.split(" ").map(n=>n[0]).join("").slice(0,2).toUpperCase()||"?"}
                  </div>
                  <div><div style={{fontWeight:700,fontSize:14}}>{w.name}</div><div style={{fontSize:12,color:C.muted,marginTop:1}}>{w.position||"—"} · {w.company||"—"}</div></div>
                  <div style={{marginLeft:"auto",fontSize:18,color:C.muted}}>›</div>
                </button>
              ))}
              {!loading&&filtered.length===0&&<div style={{textAlign:"center",color:C.muted,padding:20,fontSize:13}}>No workers found.</div>}
            </div>
          </Card>
          :<Card style={{marginBottom:12}}>
            <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:16}}>
              <div style={{width:48,height:48,borderRadius:"50%",background:"linear-gradient(135deg,#1e3a5f,#3b82f6)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,fontWeight:800,color:"#fff",flexShrink:0}}>
                {selected.name?.split(" ").map(n=>n[0]).join("").slice(0,2).toUpperCase()||"?"}
              </div>
              <div><div style={{fontWeight:800,fontSize:16,color:C.text}}>{selected.name}</div><div style={{fontSize:12,color:C.muted}}>{selected.position||"—"} · {selected.company||"—"}</div></div>
            </div>
            {selected.pin&&selected.pin.toString().trim()?<>
              <Lbl>Enter your PIN</Lbl>
              <input type="password" inputMode="numeric" maxLength={6} value={pin} onChange={e=>setPin(e.target.value.replace(/\D/g,""))} onKeyDown={e=>e.key==="Enter"&&handleNameLogin()} placeholder="• • • • • •" autoFocus
                style={{width:"100%",background:C.bg,border:`2px solid ${pinError?C.red:C.border}`,borderRadius:9,padding:"12px",color:C.text,fontSize:22,textAlign:"center",letterSpacing:"0.3em",outline:"none",boxSizing:"border-box",marginBottom:8}}/>
              {pinError&&<div style={{color:C.red,fontSize:12,textAlign:"center",marginBottom:10}}>{pinError}</div>}
            </>:<div style={{fontSize:12,color:C.muted,marginBottom:16,padding:"8px 12px",background:C.bg,borderRadius:8}}>No PIN set — tap below to sign in.</div>}
            <button onClick={handleNameLogin} style={{width:"100%",background:"linear-gradient(135deg,#1e3a5f,#3b82f6)",border:"none",borderRadius:10,padding:"13px",color:"#fff",fontSize:15,fontWeight:800,cursor:"pointer",marginBottom:10}}>Sign In →</button>
            <button onClick={()=>{setSelected(null);setPinError("");setPin("");}} style={{width:"100%",background:"none",border:`1px solid ${C.border}`,borderRadius:10,padding:"10px",color:C.muted,fontSize:13,cursor:"pointer"}}>← Back</button>
          </Card>}
        </>}

        {/* Email login */}
        {mode==="email"&&<Card style={{marginBottom:12}}>
          <Lbl>Email Address</Lbl>
          <input value={email} onChange={e=>setEmail(e.target.value)} type="email" placeholder="your@email.com"
            style={{width:"100%",background:C.bg,border:`1px solid ${C.border}`,borderRadius:9,padding:"11px 13px",color:C.text,fontSize:14,outline:"none",boxSizing:"border-box",marginBottom:12}}/>
          <Lbl>Password</Lbl>
          <input value={password} onChange={e=>setPassword(e.target.value)} type="password" placeholder="Your password" onKeyDown={e=>e.key==="Enter"&&handleEmailLogin()}
            style={{width:"100%",background:C.bg,border:`1px solid ${C.border}`,borderRadius:9,padding:"11px 13px",color:C.text,fontSize:14,outline:"none",boxSizing:"border-box",marginBottom:14}}/>
          {authErr&&<div style={{color:C.red,fontSize:12,marginBottom:10,padding:"8px 12px",background:"#2d1515",borderRadius:7}}>{authErr}</div>}
          <button onClick={handleEmailLogin} disabled={authLoading} style={{width:"100%",background:"linear-gradient(135deg,#1e3a5f,#3b82f6)",border:"none",borderRadius:10,padding:"13px",color:"#fff",fontSize:15,fontWeight:800,cursor:"pointer",opacity:authLoading?0.7:1}}>
            {authLoading?"Signing in…":"Sign In →"}
          </button>
        </Card>}

        {/* Register link */}
        <div style={{textAlign:"center",marginTop:12}}>
          <span style={{fontSize:13,color:C.muted}}>New to Bright Metalwork? </span>
          <button onClick={()=>setShowRegister(true)} style={{background:"none",border:"none",color:C.accent,fontSize:13,fontWeight:700,cursor:"pointer",textDecoration:"underline"}}>Register here</button>
        </div>
        <div style={{textAlign:"center",fontSize:11,color:C.muted,marginTop:12}}>Bright Metalwork Ltd · Worker Portal · Read-only access</div>
      </div>
    </div>
  );
}

// ─── DASHBOARD (unchanged) ────────────────────────────────────────────────────
function Dashboard({worker,weekLabel,siteHours,allSites,onLogout}){
  const [tab,setTab]=useState("schedule");
  const activeDays=useMemo(()=>{const hasWeekend=WEEKEND_DAYS.some(d=>worker.days?.[d]&&!isOff(worker.days[d]));return hasWeekend?ALL_DAYS:BASE_DAYS;},[worker]);
  const {stdH,otH,gross,taxAmt,net,bd}=useMemo(()=>calcPay(worker,activeDays,siteHours),[worker,activeDays,siteHours]);
  const taxPct=Math.round((worker.taxRate||0)*100);
  const heldCerts=CERTS.filter(c=>worker.certs?.[c.key]?.held);
  const certAlerts=CERTS.filter(c=>{const s=certStatus(c,worker);return s==="expired"||s==="expiring";});
  const initials=worker.name?.split(" ").map(n=>n[0]).join("").slice(0,2).toUpperCase()||"?";

  return(
    <div style={{minHeight:"100vh",background:C.bg,fontFamily:"system-ui,sans-serif",color:C.text,maxWidth:480,margin:"0 auto"}}>
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
        {certAlerts.length>0&&<div style={{marginTop:10,background:"#2d1515",border:`1px solid ${C.red}44`,borderRadius:8,padding:"8px 12px",fontSize:12,color:C.red,display:"flex",alignItems:"center",gap:8}}>
          <span style={{fontSize:16}}>⚠️</span><span><strong>{certAlerts.length}</strong> certification{certAlerts.length!==1?"s":""} need{certAlerts.length===1?"s":""} attention</span>
        </div>}
      </div>

      <div style={{display:"flex",background:"#111827",borderBottom:`1px solid ${C.border}`,padding:"6px 8px",gap:4}}>
        {[["schedule","📅 Schedule"],["payslip","💷 Payslip"],["certs","🛡 Certs"+(certAlerts.length>0?" ⚠️":"")]].map(([v,l])=>(
          <button key={v} onClick={()=>setTab(v)} style={{flex:1,padding:"8px 4px",background:tab===v?"#1e3a5f":"transparent",border:tab===v?`1px solid ${C.accent}`:"1px solid transparent",borderRadius:7,color:tab===v?C.accent:C.muted,cursor:"pointer",fontSize:12,fontWeight:tab===v?700:400}}>{l}</button>
        ))}
      </div>

      <div style={{padding:14}}>
        {tab==="schedule"&&<div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,marginBottom:16}}>
            <KPI label="Days On" value={Object.values(bd).length} color={C.accent}/>
            <KPI label="Total Hours" value={stdH+(otH>0?"+"+otH+"ot":"")} color={C.green}/>
            <KPI label="Sites" value={[...new Set(Object.values(bd).map(b=>b.site))].length} color={C.purple}/>
          </div>
          <div style={{display:"flex",flexDirection:"column",gap:8}}>
            {activeDays.map(d=>{
              const site=worker.days?.[d];const b=bd[d];const col=siteColor(site,allSites);const off=!site||isOff(site);
              return <Card key={d} style={{borderLeft:`3px solid ${off?"#1e2535":col}`,padding:"12px 14px"}}>
                <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                  <div style={{fontSize:13,fontWeight:800,color:off?C.muted:C.text,minWidth:36}}>{d}</div>
                  {off?<span style={{fontSize:12,color:C.muted,fontStyle:"italic"}}>{site||"— not allocated —"}</span>
                    :<div style={{display:"flex",alignItems:"center",gap:8,flex:1,justifyContent:"flex-end",flexWrap:"wrap"}}>
                      <Badge label={site.trim()} color={col}/>
                      {b&&<span style={{fontSize:11,color:C.muted}}>{b.hours}h{b.ot>0?` + ${b.ot}h OT`:""}</span>}
                    </div>}
                </div>
                {b&&<div style={{marginTop:8,paddingTop:8,borderTop:`1px solid ${C.border}`,display:"flex",gap:14}}>
                  <span style={{fontSize:11,color:C.muted}}>Std: <span style={{color:C.green,fontWeight:700}}>£{b.stdPay.toFixed(2)}</span></span>
                  {b.ot>0&&<span style={{fontSize:11,color:C.muted}}>OT: <span style={{color:C.yellow,fontWeight:700}}>£{b.otPay.toFixed(2)}</span></span>}
                  <span style={{fontSize:11,color:C.muted}}>Day total: <span style={{color:C.text,fontWeight:700}}>£{b.gross.toFixed(2)}</span></span>
                </div>}
              </Card>;
            })}
          </div>
        </div>}

        {tab==="payslip"&&<div>
          {!worker.agreedRate?<Card style={{textAlign:"center",padding:32}}><div style={{fontSize:32,marginBottom:10}}>💷</div><div style={{color:C.muted,fontSize:13}}>No rate set. Contact your supervisor.</div></Card>:<>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:14}}>
              <KPI label="Gross Pay" value={"£"+gross.toFixed(2)} color={C.green}/>
              <KPI label="Net Pay" value={"£"+net.toFixed(2)} color={C.purple}/>
              <KPI label={`Tax (${taxPct}%)`} value={"£"+taxAmt.toFixed(2)} color={C.red}/>
              <KPI label="Hours" value={stdH+"h"+(otH>0?" +"+otH:"")} color={C.accent} sub={otH>0?"incl. overtime":"standard"}/>
            </div>
            <Card style={{marginBottom:14}}>
              <Lbl>Pay Details</Lbl>
              <div style={{display:"flex",flexDirection:"column",gap:6}}>
                {[["Hourly Rate",worker.agreedRate?"£"+worker.agreedRate+"/hr":"Not set",C.green],["OT Rate",worker.customOTRate?"£"+worker.customOTRate+"/hr":"×"+(worker.overtimeMultiplier||1.5),C.yellow],["Tax Rate",taxPct+"%",taxPct>=30?C.red:taxPct>=20?C.yellow:C.green],["Week",weekLabel,C.accent]].map(([l,v,c])=>(
                  <div key={l} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"6px 0",borderBottom:`1px solid ${C.border}`}}>
                    <span style={{fontSize:12,color:C.muted}}>{l}</span><span style={{fontSize:13,fontWeight:700,color:c}}>{v}</span>
                  </div>
                ))}
              </div>
            </Card>
            <Card>
              <Lbl>Daily Breakdown</Lbl>
              {activeDays.map(d=>{const b=bd[d];const site=worker.days?.[d];const off=!site||isOff(site);return(
                <div key={d} style={{display:"flex",alignItems:"center",gap:10,padding:"9px 0",borderBottom:`1px solid ${C.border}`}}>
                  <div style={{fontSize:12,fontWeight:800,color:off?C.muted:C.sub,minWidth:32}}>{d}</div>
                  {off?<span style={{fontSize:12,color:C.muted,fontStyle:"italic",flex:1}}>{site||"Off"}</span>:<>
                    <span style={{fontSize:11,color:C.sub,flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{b?.site||"—"}</span>
                    <span style={{fontSize:11,color:C.muted}}>{b?.hours||0}h</span>
                    <span style={{fontSize:13,fontWeight:700,color:C.green,minWidth:60,textAlign:"right"}}>{b?"£"+b.gross.toFixed(2):"—"}</span>
                  </>}
                </div>
              );})}
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 0 0"}}>
                <span style={{fontSize:12,fontWeight:800,color:C.sub}}>TOTAL</span>
                <span style={{fontSize:16,fontWeight:900,color:C.green}}>£{gross.toFixed(2)}</span>
              </div>
            </Card>
            <div style={{marginTop:12,background:"linear-gradient(135deg,#0d2218,#1a3020)",border:`1px solid ${C.green}44`,borderRadius:14,padding:"18px 20px",textAlign:"center"}}>
              <div style={{fontSize:12,color:C.muted,marginBottom:4,textTransform:"uppercase",letterSpacing:"0.07em",fontWeight:700}}>💷 Net Pay to Account</div>
              <div style={{fontSize:36,fontWeight:900,color:C.green,letterSpacing:"-0.02em"}}>£{net.toFixed(2)}</div>
              <div style={{fontSize:11,color:C.muted,marginTop:4}}>After {taxPct}% tax · WC {weekLabel}</div>
            </div>
          </>}
        </div>}

        {tab==="certs"&&<div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr",gap:6,marginBottom:14}}>
            {[["Held",heldCerts.length,C.accent],["Valid",CERTS.filter(c=>certStatus(c,worker)==="valid").length,C.green],["Soon",CERTS.filter(c=>certStatus(c,worker)==="expiring").length,C.yellow],["Expired",CERTS.filter(c=>certStatus(c,worker)==="expired").length,C.red]].map(([l,v,c])=><KPI key={l} label={l} value={v} color={c}/>)}
          </div>
          {certAlerts.length>0&&<div style={{marginBottom:14}}>
            <Lbl>⚠️ Needs Attention</Lbl>
            <div style={{display:"flex",flexDirection:"column",gap:6}}>
              {certAlerts.map(cert=>{const s=certStatus(cert,worker);const val=worker.certs?.[cert.key];return(
                <Card key={cert.key} style={{borderLeft:`3px solid ${CERT_C[s]}`,padding:"10px 14px"}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                    <span style={{fontSize:13,fontWeight:700,color:C.text}}>{cert.label}</span><Badge label={s.toUpperCase()} color={CERT_C[s]}/>
                  </div>
                  {cert.hasExpiry&&val?.expiry&&<div style={{fontSize:11,color:C.muted,marginTop:4}}>Expiry: <span style={{color:CERT_C[s],fontWeight:600}}>{fmtDate(val.expiry)}</span></div>}
                </Card>
              );})}
            </div>
          </div>}
          {heldCerts.length>0&&<div style={{marginBottom:14}}>
            <Lbl>All Certifications ({heldCerts.length} held)</Lbl>
            <div style={{display:"flex",flexDirection:"column",gap:6}}>
              {heldCerts.map(cert=>{const s=certStatus(cert,worker);const val=worker.certs?.[cert.key];const photoUrl=val?.photoUrl;return(
                <Card key={cert.key} style={{borderLeft:`3px solid ${CERT_C[s]}44`,padding:"10px 14px"}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:photoUrl?8:0}}>
                    <span style={{fontSize:13,fontWeight:600,color:C.text}}>{cert.label}</span><Badge label={s==="valid"?"✓ Valid":s.toUpperCase()} color={CERT_C[s]}/>
                  </div>
                  {cert.hasExpiry&&val?.expiry&&<div style={{fontSize:11,color:C.muted,marginTop:3}}>Expires: <span style={{color:s==="valid"?C.green:CERT_C[s],fontWeight:600}}>{fmtDate(val.expiry)}</span></div>}
                  {photoUrl&&<img src={photoUrl} alt={cert.label} style={{marginTop:8,width:"100%",maxHeight:100,objectFit:"cover",borderRadius:6,border:`1px solid ${C.border}`,cursor:"pointer"}} onClick={()=>window.open(photoUrl,"_blank")}/>}
                </Card>
              );})}
            </div>
          </div>}
          {heldCerts.length===0&&<Card style={{textAlign:"center",padding:32}}><div style={{fontSize:32,marginBottom:10}}>🛡</div><div style={{color:C.muted,fontSize:13}}>No certifications recorded yet.</div></Card>}
          <div style={{marginTop:8,padding:"10px 12px",background:C.card,borderRadius:8,border:`1px solid ${C.border}`,fontSize:11,color:C.muted}}>To update certifications contact your supervisor. Records are managed in the admin portal.</div>
        </div>}
      </div>
      <div style={{padding:"12px 18px",textAlign:"center",fontSize:11,color:C.muted,borderTop:`1px solid ${C.border}`,marginTop:8}}>Bright Metalwork Ltd · Worker Portal · Read-only</div>
    </div>
  );
}

// ─── ROOT APP ─────────────────────────────────────────────────────────────────
export default function App(){
  const [workers,setWorkers]=useState([]);
  const [allSites,setAllSites]=useState([]);
  const [siteHours,setSiteHours]=useState({});
  const [weekLabel,setWeekLabel]=useState("");
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState(null);
  const [worker,setWorker]=useState(null);

  useEffect(()=>{
    async function load(){
      try{
        setLoading(true);
        const wRows=await sbGet("workers","select=id,data&order=data->name");
        setWorkers(wRows.map(r=>({...r.data,id:r.id})).filter(w=>w.name));
        const cfgRows=await sbGet("app_config","select=key,value");
        const cfg=Object.fromEntries(cfgRows.map(r=>[r.key,r.value]));
        if(cfg.week_label) setWeekLabel(cfg.week_label);
        if(cfg.all_sites)  setAllSites(cfg.all_sites);
        if(cfg.site_hours) setSiteHours(cfg.site_hours);
      }catch(e){setError("Could not connect. Please try again.");}
      finally{setLoading(false);}
    }
    load();
  },[]);

  const handleLogin=async(w)=>{
    try{const rows=await sbGet("workers",`select=id,data&id=eq.${w.id}`);if(rows.length>0)setWorker({...rows[0].data,id:rows[0].id});else setWorker(w);}
    catch(e){setWorker(w);}
  };
  const handleLoginEmail=(w)=>handleLogin(w);
  const handleLogout=()=>setWorker(null);

  if(worker) return <Dashboard worker={worker} weekLabel={weekLabel} siteHours={siteHours} allSites={allSites} onLogout={handleLogout}/>;
  return <LoginScreen workers={workers} onLogin={handleLogin} onLoginEmail={handleLoginEmail} loading={loading} error={error}/>;
}
