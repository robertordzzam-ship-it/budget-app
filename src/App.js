import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import SEED_TXNS from "./transactions";

// ── Categories ────────────────────────────────────────────────────────────────
const INCOME_CATS = [
  { id:"job",        label:"Work",         icon:"💼" },
  { id:"other_inc",  label:"Other Income", icon:"💡" },
];
const FIXED_CATS = [
  { id:"rent",        label:"Rent",           icon:"🏠" },
  { id:"utilities",   label:"Utilities",      icon:"⚡" },
  { id:"groceries",   label:"Groceries",      icon:"🛒" },
  { id:"digital_subs",label:"Digital Subs",   icon:"💻" },
  { id:"gym",         label:"Gym",            icon:"🏋️" },
  { id:"campestre",   label:"Campestre",      icon:"🏌️" },
];
const VARIABLE_CATS = [
  { id:"eating_out",  label:"Eating & Dining", icon:"🍜" },
  { id:"travel",      label:"Travel",          icon:"✈️" },
  { id:"sports",      label:"Sports & Fitness",icon:"🎾" },
  { id:"transport",   label:"Transport",       icon:"🚇" },
  { id:"shopping",    label:"Shopping",        icon:"🛍️" },
  { id:"social",      label:"Social & Events", icon:"🎉" },
  { id:"mba",         label:"MBA / School",    icon:"🎓" },
];
const ALL_CATS = [...INCOME_CATS, ...FIXED_CATS, ...VARIABLE_CATS];
const EXPENSE_CATS = [...FIXED_CATS, ...VARIABLE_CATS];
const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const PROFILES = [
  { id:"roberto", name:"Roberto", color:"#e2e8f0", avatar:"R" },
  { id:"alexia",  name:"Alexia",  color:"#94a3b8", avatar:"A" },
];
const BANKS = ["AMEX","BofA","BBVA","Cash","Family"];
const FX_RATE = 18.5;
const PIN = "9462";

// Default budgets per category per month (USD)
const DEFAULT_BUDGETS = {
  rent:900, utilities:120, groceries:400, digital_subs:80,
  gym:50, campestre:120, eating_out:600, travel:300,
  sports:200, transport:100, shopping:200, social:150, mba:100,
};

function fmt(n) {
  return new Intl.NumberFormat("en-US",{style:"currency",currency:"USD",maximumFractionDigits:0}).format(n||0);
}
function monthKey(d=new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;
}
function getCat(id) {
  return ALL_CATS.find(c=>c.id===id)||{id,label:id,icon:"📦"};
}
function getProfile(id) { return PROFILES.find(p=>p.id===id)||PROFILES[0]; }

const STORE = "padlans_budget_v3";
async function loadData() {
  try { if(window.storage){const r=await window.storage.get(STORE,true);if(r?.value)return JSON.parse(r.value);} } catch {}
  try { const l=localStorage.getItem(STORE);if(l)return JSON.parse(l); } catch {}
  return null;
}
async function saveData(data) {
  try { if(window.storage){await window.storage.set(STORE,JSON.stringify(data),true);return;} } catch {}
  try { localStorage.setItem(STORE,JSON.stringify(data)); } catch {}
}

function parseCSV(text) {
  const lines=text.trim().split("\n").filter(Boolean);
  if(lines.length<2)return[];
  const headers=lines[0].split(",").map(h=>h.replace(/"/g,"").trim().toLowerCase());
  const find=(...keys)=>{for(const k of keys){const i=headers.findIndex(h=>h.includes(k));if(i>=0)return i;}return -1;};
  const dateIdx=find("date","posted"),descIdx=find("description","merchant","memo"),amtIdx=find("amount","debit");
  return lines.slice(1).map(line=>{
    const cols=line.match(/(".*?"|[^,]+)/g)?.map(c=>c.replace(/"/g,"").trim())||[];
    const amt=parseFloat((cols[amtIdx]||"0").replace(/[$,\-]/g,""))||0;
    const desc=cols[descIdx]||"Unknown";
    let date=cols[dateIdx]||new Date().toISOString().split("T")[0];
    try{const p=new Date(date);if(!isNaN(p))date=p.toISOString().split("T")[0];}catch{}
    return{description:desc,amount:Math.abs(amt),date};
  }).filter(t=>t.amount>0&&t.description!=="Unknown");
}

async function aiCategorize(rawTxns) {
  const prompt=`Categorize each transaction:
INCOME (kind="income"): job, other_inc
FIXED (kind="fixed"): rent, utilities, groceries, digital_subs, gym, campestre
VARIABLE (kind="variable"): eating_out, travel, sports, transport, shopping, social, mba
Transactions:
${rawTxns.map((t,i)=>`${i}. "${t.description}" $${t.amount}`).join("\n")}
Return ONLY JSON: [{"index":0,"catId":"eating_out","kind":"variable"}]`;
  try {
    const res=await fetch("https://api.anthropic.com/v1/messages",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({model:"claude-sonnet-4-20250514",max_tokens:1000,messages:[{role:"user",content:prompt}]})});
    const d=await res.json();
    return JSON.parse((d.content?.[0]?.text||"[]").replace(/```json|```/g,"").trim());
  } catch { return rawTxns.map((_,i)=>({index:i,catId:"shopping",kind:"variable"})); }
}

// ── Sub-components ─────────────────────────────────────────────────────────
function Avatar({profile,size=26,active}) {
  return (
    <div style={{width:size,height:size,borderRadius:"50%",
      background:active?"#e2e8f0":"#1e293b",
      border:`2px solid ${active?"#e2e8f0":"#334155"}`,
      display:"flex",alignItems:"center",justifyContent:"center",
      fontSize:size*0.38,fontWeight:800,color:active?"#0f172a":"#64748b",
      flexShrink:0,transition:"all .2s"}}>
      {profile.avatar}
    </div>
  );
}

function PinScreen({onUnlock}) {
  const [entered,setEntered]=useState("");
  const [shake,setShake]=useState(false);
  const press=(d)=>{
    if(entered.length>=4)return;
    const next=entered+d;
    setEntered(next);
    if(next.length===4){
      if(next===PIN){setTimeout(()=>onUnlock(),200);}
      else{setShake(true);setTimeout(()=>{setEntered("");setShake(false);},600);}
    }
  };
  return (
    <div style={{maxWidth:430,margin:"0 auto",minHeight:"100vh",background:"#000",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",fontFamily:"'DM Sans','Segoe UI',sans-serif"}}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;600;700;800;900&display=swap');
        @keyframes shake{0%,100%{transform:translateX(0)}25%{transform:translateX(-8px)}75%{transform:translateX(8px)}}`}</style>
      <div style={{fontSize:32,marginBottom:10}}>💰</div>
      <div style={{fontSize:20,fontWeight:900,color:"#e2e8f0",marginBottom:4}}>Padlans Budget</div>
      <div style={{fontSize:12,color:"#475569",marginBottom:40}}>Enter PIN to continue</div>
      <div style={{display:"flex",gap:14,marginBottom:48,animation:shake?"shake 0.4s ease":"none"}}>
        {[0,1,2,3].map(i=>(
          <div key={i} style={{width:13,height:13,borderRadius:"50%",background:entered.length>i?"#e2e8f0":"#1e293b",border:`2px solid ${entered.length>i?"#e2e8f0":"#334155"}`,transition:"all .15s"}}/>
        ))}
      </div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(3,70px)",gap:10}}>
        {[1,2,3,4,5,6,7,8,9,"",0,"⌫"].map((k,i)=>(
          <button key={i} onClick={()=>k==="⌫"?setEntered(e=>e.slice(0,-1)):k!==""?press(String(k)):null}
            style={{width:70,height:70,borderRadius:"50%",border:"none",background:k===""?"transparent":"#111827",
              color:"#e2e8f0",fontSize:k==="⌫"?18:22,fontWeight:700,cursor:k===""?"default":"pointer"}}>
            {k}
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Main App ───────────────────────────────────────────────────────────────
export default function App() {
  const [unlocked,setUnlocked]=useState(false);
  const [data,setData]=useState(null);
  const [loaded,setLoaded]=useState(false);
  const [syncing,setSyncing]=useState(false);
  const [activeUser,setActiveUser]=useState("roberto");
  const [tab,setTab]=useState("summary");
  const [toast,setToast]=useState(null);
  const syncTimer=useRef(null);

  // Summary state
  const [selMonth,setSelMonth]=useState(monthKey());
  const [viewMode,setViewMode]=useState("month"); // month | ytd
  const [personFilter,setPersonFilter]=useState("both");

  // History state
  const [histSort,setHistSort]=useState("date"); // date | month | category
  const [histKind,setHistKind]=useState("expense"); // expense | income
  const [histPerson,setHistPerson]=useState("both");
  const [histMonth,setHistMonth]=useState("all");

  // Add form
  const [mode,setMode]=useState("expense");
  const [expType,setExpType]=useState("variable");
  const [amount,setAmount]=useState("");
  const [currency,setCurrency]=useState("USD");
  const [catId,setCatId]=useState("eating_out");
  const [note,setNote]=useState("");
  const [date,setDate]=useState(new Date().toISOString().split("T")[0]);
  const [bank,setBank]=useState("AMEX");
  const [isOneOff,setIsOneOff]=useState(false);

  // Budget state (stored in data)
  const [editingBudget,setEditingBudget]=useState(null);
  const [budgetVal,setBudgetVal]=useState("");

  // Goals
  const [gName,setGName]=useState("");const [gIcon,setGIcon]=useState("🎯");
  const [gTarget,setGTarget]=useState("");const [gSaved,setGSaved]=useState({roberto:0,alexia:0});

  // Import
  const [importStep,setImportStep]=useState("idle");
  const [importRows,setImportRows]=useState([]);
  const [reviewRows,setReviewRows]=useState([]);
  const [importSource,setImportSource]=useState("");
  const fileRef=useRef();

  useEffect(()=>{
    loadData().then(d=>{
      if(d){setData(d);}
      else{setData({txns:SEED_TXNS,goals:[],budgets:DEFAULT_BUDGETS});}
      setLoaded(true);
    });
  },[]);

  const persistData=useCallback((nd)=>{
    setData(nd);
    clearTimeout(syncTimer.current);
    syncTimer.current=setTimeout(async()=>{setSyncing(true);await saveData(nd);setSyncing(false);},800);
  },[]);

  useEffect(()=>{
    if(!loaded)return;
    const iv=setInterval(async()=>{const r=await loadData();if(r)setData(prev=>JSON.stringify(r)!==JSON.stringify(prev)?r:prev);},15000);
    return()=>clearInterval(iv);
  },[loaded]);

  const showToast=(msg,err)=>{setToast({msg,err});setTimeout(()=>setToast(null),2600);};

  const budgets = useMemo(()=>({...DEFAULT_BUDGETS,...(data?.budgets||{})}),[data?.budgets]);

  // ── Stats helpers ──────────────────────────────────────────────────────
  const calcStats=useCallback((txns)=>{
    const income=txns.filter(t=>t.kind==="income").reduce((s,t)=>s+t.amount,0);
    const fixed=txns.filter(t=>t.kind==="fixed").reduce((s,t)=>s+t.amount,0);
    const variable=txns.filter(t=>t.kind==="variable").reduce((s,t)=>s+t.amount,0);
    const savings=income>0?Math.round(((income-fixed-variable)/income)*100):0;
    return{income,fixed,variable,expenses:fixed+variable,net:income-fixed-variable,savings};
  },[]);

  // All months in data for YTD
  const currentYear=new Date().getFullYear();
  const ytdMonths=useMemo(()=>
    Array.from({length:new Date().getMonth()+1},(_,i)=>`${currentYear}-${String(i+1).padStart(2,"0")}`)
  ,[currentYear]);

  const monthTxns=useMemo(()=>(data?.txns||[]).filter(t=>t.date.startsWith(selMonth)),[data?.txns,selMonth]);
  const ytdTxns=useMemo(()=>(data?.txns||[]).filter(t=>t.date.startsWith(String(currentYear))),[data?.txns,currentYear]);

  const activeTxns=viewMode==="ytd"?ytdTxns:monthTxns;
  const filteredTxns=useMemo(()=>personFilter==="both"?activeTxns:activeTxns.filter(t=>t.owner===personFilter),[activeTxns,personFilter]);

  const sharedStats=useMemo(()=>calcStats(filteredTxns),[filteredTxns,calcStats]);
  const robertoStats=useMemo(()=>calcStats(filteredTxns.filter(t=>t.owner==="roberto")),[filteredTxns,calcStats]);
  const alexiaStats=useMemo(()=>calcStats(filteredTxns.filter(t=>t.owner==="alexia")),[filteredTxns,calcStats]);

  // YTD averages (divide by months with data)
  const ytdMonthsWithData=useMemo(()=>{
    if(viewMode!=="ytd")return 1;
    const months=new Set(ytdTxns.map(t=>t.date.slice(0,7)));
    return Math.max(1,months.size);
  },[viewMode,ytdTxns]);

  const catBreakdown=useMemo(()=>{
    const map={};
    filteredTxns.filter(t=>t.kind!=="income").forEach(t=>{map[t.catId]=(map[t.catId]||0)+t.amount;});
    return Object.entries(map).sort((a,b)=>b[1]-a[1]);
  },[filteredTxns]);

  // 6-month chart
  const sixMonthData=useMemo(()=>
    Array.from({length:6},(_,i)=>{
      const d=new Date();d.setMonth(d.getMonth()-(5-i));
      const key=monthKey(d);
      const txns=(data?.txns||[]).filter(t=>t.date.startsWith(key));
      return{label:MONTHS[d.getMonth()],key,
        income:txns.filter(t=>t.kind==="income").reduce((s,t)=>s+t.amount,0),
        exp:txns.filter(t=>t.kind!=="income").reduce((s,t)=>s+t.amount,0)};
    }),[data?.txns]);
  const barMax=Math.max(...sixMonthData.flatMap(d=>[d.income,d.exp]),1);

  // Run rate: current cash / avg monthly expenses
  const currentCash=90682;
  const avgMonthlyExp=useMemo(()=>{
    const months=new Set((data?.txns||[]).map(t=>t.date.slice(0,7)));
    const n=Math.max(1,months.size);
    const total=(data?.txns||[]).filter(t=>t.kind!=="income").reduce((s,t)=>s+t.amount,0);
    return total/n;
  },[data?.txns]);
  const runRateMonths=useMemo(()=>avgMonthlyExp>0?Math.round(currentCash/avgMonthlyExp):0,[avgMonthlyExp,currentCash]);

  // History
  const allMonths=useMemo(()=>[...new Set((data?.txns||[]).map(t=>t.date.slice(0,7)))].sort((a,b)=>b.localeCompare(a)),[data?.txns]);
  const filteredHist=useMemo(()=>{
    let txns=(data?.txns||[]).filter(t=>histKind==="income"?t.kind==="income":t.kind!=="income");
    if(histPerson!=="both")txns=txns.filter(t=>t.owner===histPerson);
    if(histMonth!=="all")txns=txns.filter(t=>t.date.startsWith(histMonth));
    if(histSort==="date")txns=[...txns].sort((a,b)=>b.date.localeCompare(a.date));
    else if(histSort==="month")txns=[...txns].sort((a,b)=>b.date.slice(0,7).localeCompare(a.date.slice(0,7)));
    else if(histSort==="category")txns=[...txns].sort((a,b)=>a.catId.localeCompare(b.catId));
    return txns.slice(0,150);
  },[data?.txns,histKind,histPerson,histMonth,histSort]);

  // ── Actions ────────────────────────────────────────────────────────────
  const addTxn=()=>{
    const amt=parseFloat(amount);
    if(!amt||isNaN(amt))return showToast("Enter a valid amount",true);
    const usdAmt=currency==="MXN"?parseFloat((amt/FX_RATE).toFixed(2)):amt;
    const kind=mode==="income"?"income":expType;
    persistData({...data,txns:[{id:Date.now(),kind,catId,amount:usdAmt,note,date,owner:activeUser,bank,currency,origAmount:amt,oneOff:isOneOff},...(data?.txns||[])]});
    setAmount("");setNote("");setIsOneOff(false);
    showToast("Saved!");setTab("summary");
  };
  const delTxn=id=>{persistData({...data,txns:(data?.txns||[]).filter(t=>t.id!==id)});showToast("Deleted");};

  const saveBudget=(catId,val)=>{
    const nb={...(data?.budgets||{}), [catId]:parseFloat(val)||0};
    persistData({...data,budgets:nb});
    setEditingBudget(null);setBudgetVal("");
    showToast("Budget updated");
  };

  const addGoal=()=>{
    if(!gName||!gTarget)return showToast("Name and target required",true);
    persistData({...data,goals:[...(data?.goals||[]),{id:Date.now(),name:gName,icon:gIcon,target:+gTarget,saved:{roberto:+(gSaved.roberto||0),alexia:+(gSaved.alexia||0)}}]});
    setGName("");setGIcon("🎯");setGTarget("");setGSaved({roberto:0,alexia:0});
    showToast("Goal added!");
  };
  const updateGoal=(id,person,val)=>persistData({...data,goals:(data?.goals||[]).map(g=>g.id===id?{...g,saved:{...g.saved,[person]:+val||0}}:g)});
  const delGoal=id=>{persistData({...data,goals:(data?.goals||[]).filter(g=>g.id!==id)});};

  const handleFile=async(e)=>{
    const file=e.target.files?.[0];if(!file)return;
    setImportSource(file.name);setImportStep("parsing");
    try{
      const raw=parseCSV(await file.text());
      if(!raw.length){showToast("Couldn't parse file",true);setImportStep("idle");return;}
      setImportRows(raw);setImportStep("categorizing");
      const allCats=[];
      for(let i=0;i<raw.length;i+=30){const c=await aiCategorize(raw.slice(i,i+30));allCats.push(...c);}
      setReviewRows(raw.map((t,i)=>{const ai=allCats.find(c=>c.index===i)||{catId:"shopping",kind:"variable"};return{...t,catId:ai.catId,kind:ai.kind,selected:true,id:Date.now()+i,owner:activeUser,bank,currency:"USD",origAmount:t.amount,oneOff:false};}));
      setImportStep("reviewing");
    }catch(err){showToast("Error: "+err.message,true);setImportStep("idle");}
    e.target.value="";
  };
  const confirmImport=()=>{
    const toAdd=reviewRows.filter(r=>r.selected).map(r=>({id:r.id,kind:r.kind,catId:r.catId,amount:r.amount,note:r.description,date:r.date,owner:r.owner,bank:r.bank,currency:r.currency,origAmount:r.origAmount,oneOff:r.oneOff}));
    persistData({...data,txns:[...toAdd,...(data?.txns||[])]});
    showToast(`${toAdd.length} imported!`);setImportStep("idle");setReviewRows([]);setTab("summary");
  };

  const availableCats=mode==="income"?INCOME_CATS:expType==="fixed"?FIXED_CATS:VARIABLE_CATS;

  // ── Styles ─────────────────────────────────────────────────────────────
  const C = {
    bg:"#0a0a0a", card:"#111111", border:"#222222",
    text:"#e2e8f0", muted:"#64748b", dim:"#334155",
    white:"#ffffff", accent:"#e2e8f0",
  };
  const cs={
    wrap:{maxWidth:430,margin:"0 auto",minHeight:"100vh",background:C.bg,color:C.text,fontFamily:"'DM Sans','Segoe UI',sans-serif",paddingBottom:88},
    card:{background:C.card,border:`1px solid ${C.border}`,borderRadius:16,padding:"14px 16px",marginBottom:8},
    inp:{width:"100%",background:"#0d0d0d",border:`1px solid ${C.border}`,borderRadius:12,padding:"11px 14px",color:C.text,fontSize:15,outline:"none",boxSizing:"border-box"},
    lbl:{color:C.muted,fontSize:11,fontWeight:700,letterSpacing:".05em",textTransform:"uppercase",marginBottom:5,display:"block"},
    pill:(on)=>({border:`1px solid ${on?C.text:C.border}`,borderRadius:8,padding:"6px 14px",
      background:on?"#ffffff":"transparent",color:on?"#000000":C.muted,
      fontWeight:700,fontSize:12,cursor:"pointer",transition:"all .15s",whiteSpace:"nowrap"}),
    bigBtn:{width:"100%",background:C.white,border:"none",borderRadius:14,padding:14,color:"#000",fontWeight:800,fontSize:15,cursor:"pointer"},
    nav:{position:"fixed",bottom:0,left:"50%",transform:"translateX(-50%)",width:"100%",maxWidth:430,
      background:"#0a0a0a",borderTop:`1px solid ${C.border}`,display:"flex",zIndex:100},
    navBtn:on=>({flex:1,border:"none",background:"none",cursor:"pointer",padding:"10px 0 8px",
      display:"flex",flexDirection:"column",alignItems:"center",gap:3,
      color:on?C.white:C.dim,transition:"color .2s"}),
    seg:(on)=>({border:"none",borderRadius:8,padding:"7px 14px",cursor:"pointer",
      background:on?"#ffffff":"transparent",color:on?"#000000":C.muted,
      fontWeight:700,fontSize:13,transition:"all .15s"}),
  };

  if(!unlocked)return <PinScreen onUnlock={()=>setUnlocked(true)}/>;
  if(!loaded||!data)return(
    <div style={{...cs.wrap,display:"flex",alignItems:"center",justifyContent:"center",flexDirection:"column",gap:12}}>
      <div style={{fontSize:32}}>💰</div><div style={{fontWeight:800}}>Loading…</div>
    </div>
  );

  return(
    <div style={cs.wrap}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800;900&display=swap');
        *{-webkit-tap-highlight-color:transparent;box-sizing:border-box;}
        input[type=number]::-webkit-inner-spin-button{-webkit-appearance:none;}
        input::placeholder{color:#334155;}
        ::-webkit-scrollbar{display:none;}
        @keyframes pulse{0%,100%{opacity:.3}50%{opacity:1}}
        select option{background:#111111;}
      `}</style>

      {toast&&(
        <div style={{position:"fixed",top:20,left:"50%",transform:"translateX(-50%)",
          background:toast.err?"#1a0000":"#0a1a0a",border:`1px solid ${toast.err?"#7f1d1d":"#14532d"}`,
          color:toast.err?"#fca5a5":"#86efac",padding:"9px 20px",borderRadius:99,zIndex:999,
          fontWeight:700,fontSize:13,whiteSpace:"nowrap"}}>
          {toast.msg}
        </div>
      )}
      {syncing&&<div style={{position:"fixed",top:20,right:20,color:C.dim,fontSize:11,zIndex:998}}>↑</div>}

      {/* ── IMPORT OVERLAY ── */}
      {(importStep==="parsing"||importStep==="categorizing"||importStep==="reviewing")&&(
        <div style={{position:"fixed",inset:0,background:C.bg,zIndex:200,overflowY:"auto",maxWidth:430,margin:"0 auto"}}>
          <div style={{padding:"28px 16px"}}>
            <button onClick={()=>{setImportStep("idle");setReviewRows([]);}}
              style={{border:`1px solid ${C.border}`,background:"transparent",color:C.muted,borderRadius:8,padding:"6px 12px",cursor:"pointer",fontSize:13,marginBottom:20}}>← Back</button>
            {(importStep==="parsing"||importStep==="categorizing")&&(
              <div style={{textAlign:"center",padding:"60px 20px"}}>
                <div style={{fontSize:36,marginBottom:14}}>{importStep==="parsing"?"📄":"🤖"}</div>
                <div style={{fontWeight:700,fontSize:16,marginBottom:6}}>{importStep==="parsing"?"Reading…":"AI categorizing…"}</div>
                <div style={{display:"flex",justifyContent:"center",gap:6,marginTop:20}}>
                  {[0,1,2].map(i=><div key={i} style={{width:7,height:7,borderRadius:"50%",background:C.muted,animation:`pulse 1.2s ${i*0.2}s infinite`}}/>)}
                </div>
              </div>
            )}
            {importStep==="reviewing"&&(
              <>
                <div style={{fontWeight:800,fontSize:16,marginBottom:12}}>Review {reviewRows.length} transactions</div>
                {reviewRows.map((row,i)=>{
                  const cat=getCat(row.catId),owner=getProfile(row.owner);
                  return(
                    <div key={row.id} style={{...cs.card,padding:"10px 12px",opacity:row.selected?1:0.4}}>
                      <div style={{display:"flex",alignItems:"center",gap:8}}>
                        <input type="checkbox" checked={row.selected} onChange={()=>setReviewRows(r=>r.map((x,j)=>j===i?{...x,selected:!x.selected}:x))} style={{width:15,height:15,accentColor:C.white,cursor:"pointer",flexShrink:0}}/>
                        <span style={{fontSize:16,flexShrink:0}}>{cat.icon}</span>
                        <div style={{flex:1,minWidth:0}}>
                          <div style={{fontSize:12,fontWeight:600,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{row.description}</div>
                          <div style={{display:"flex",gap:5,marginTop:3}}>
                            <select value={row.catId} onChange={e=>{const nc=e.target.value;const nk=INCOME_CATS.find(c=>c.id===nc)?"income":FIXED_CATS.find(c=>c.id===nc)?"fixed":"variable";setReviewRows(r=>r.map((x,j)=>j===i?{...x,catId:nc,kind:nk}:x));}}
                              style={{background:"#0d0d0d",border:`1px solid ${C.border}`,borderRadius:6,color:C.muted,fontSize:10,padding:"2px 4px",cursor:"pointer",outline:"none"}}>
                              <optgroup label="Income">{INCOME_CATS.map(c=><option key={c.id} value={c.id}>{c.label}</option>)}</optgroup>
                              <optgroup label="Fixed">{FIXED_CATS.map(c=><option key={c.id} value={c.id}>{c.label}</option>)}</optgroup>
                              <optgroup label="Variable">{VARIABLE_CATS.map(c=><option key={c.id} value={c.id}>{c.label}</option>)}</optgroup>
                            </select>
                            <select value={row.owner} onChange={e=>setReviewRows(r=>r.map((x,j)=>j===i?{...x,owner:e.target.value}:x))}
                              style={{background:"#0d0d0d",border:`1px solid ${C.border}`,borderRadius:6,color:C.muted,fontSize:10,padding:"2px 4px",cursor:"pointer",outline:"none"}}>
                              {PROFILES.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}
                            </select>
                          </div>
                        </div>
                        <div style={{fontWeight:800,fontSize:13,color:row.kind==="income"?"#86efac":"#fca5a5",flexShrink:0}}>${row.amount}</div>
                      </div>
                    </div>
                  );
                })}
                <div style={{paddingTop:10,paddingBottom:20}}>
                  <button style={cs.bigBtn} onClick={confirmImport}>Import {reviewRows.filter(r=>r.selected).length} Transactions</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── SUMMARY ── */}
      {tab==="summary"&&(
        <div>
          <div style={{padding:"24px 16px 0",borderBottom:`1px solid ${C.border}`}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
              <div style={{fontSize:22,fontWeight:900,letterSpacing:-0.5}}>Summary</div>
              {/* Person filter */}
              <div style={{display:"flex",background:"#111111",borderRadius:10,padding:3,border:`1px solid ${C.border}`,gap:2}}>
                {[{id:"both",label:"Both"},...PROFILES.map(p=>({id:p.id,label:p.name}))].map(p=>(
                  <button key={p.id} style={cs.seg(personFilter===p.id)} onClick={()=>setPersonFilter(p.id)}>{p.label}</button>
                ))}
              </div>
            </div>

            {/* Month / YTD toggle */}
            <div style={{display:"flex",gap:8,marginBottom:12}}>
              <div style={{display:"flex",background:"#111111",borderRadius:10,padding:3,border:`1px solid ${C.border}`,gap:2}}>
                <button style={cs.seg(viewMode==="month")} onClick={()=>setViewMode("month")}>Month</button>
                <button style={cs.seg(viewMode==="ytd")} onClick={()=>setViewMode("ytd")}>YTD {currentYear}</button>
              </div>
            </div>

            {/* Month selector (only in month mode) */}
            {viewMode==="month"&&(
              <div style={{display:"flex",gap:6,overflowX:"auto",paddingBottom:12}}>
                {sixMonthData.map(m=>(
                  <button key={m.key} style={{...cs.pill(selMonth===m.key),flexShrink:0,padding:"5px 12px",fontSize:12}} onClick={()=>setSelMonth(m.key)}>{m.label}</button>
                ))}
              </div>
            )}
          </div>

          <div style={{padding:"12px 16px 0"}}>
            {/* Net balance hero */}
            <div style={{...cs.card,background:"#111111",border:`1px solid ${C.border}`,marginBottom:10}}>
              <div style={{color:C.muted,fontSize:11,fontWeight:700,textTransform:"uppercase",letterSpacing:".05em",marginBottom:6}}>
                {viewMode==="ytd"?`YTD ${currentYear} · ${ytdMonthsWithData} months · avg/mo`:"Net Balance"}
              </div>
              <div style={{fontSize:34,fontWeight:900,letterSpacing:-1,color:sharedStats.net>=0?C.white:"#fca5a5"}}>
                {sharedStats.net>=0?"+":""}{fmt(viewMode==="ytd"?sharedStats.net/ytdMonthsWithData:sharedStats.net)}
                {viewMode==="ytd"&&<span style={{fontSize:14,color:C.muted,fontWeight:600}}>/mo avg</span>}
              </div>
              {sharedStats.income>0&&viewMode==="month"&&(
                <div style={{color:C.muted,fontSize:12,marginTop:4}}>Savings rate: <span style={{color:C.white,fontWeight:700}}>{sharedStats.savings}%</span></div>
              )}
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:6,marginTop:12}}>
                {[{l:"Income",v:sharedStats.income},{l:"Fixed",v:sharedStats.fixed},{l:"Variable",v:sharedStats.variable}].map(s=>(
                  <div key={s.l} style={{background:"#0d0d0d",borderRadius:10,padding:"8px",textAlign:"center"}}>
                    <div style={{color:C.muted,fontSize:10,fontWeight:700,textTransform:"uppercase"}}>{s.l}</div>
                    <div style={{fontWeight:800,fontSize:14,marginTop:2}}>
                      {fmt(viewMode==="ytd"?s.v/ytdMonthsWithData:s.v)}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Per-person */}
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:10}}>
              {PROFILES.map(p=>{
                const ps=p.id==="roberto"?robertoStats:alexiaStats;
                const isAct=personFilter===p.id;
                return(
                  <div key={p.id} onClick={()=>setPersonFilter(v=>v===p.id?"both":p.id)}
                    style={{...cs.card,border:`1px solid ${isAct?C.text:C.border}`,cursor:"pointer",marginBottom:0}}>
                    <div style={{display:"flex",alignItems:"center",gap:7,marginBottom:8}}>
                      <Avatar profile={p} size={22} active={isAct}/>
                      <span style={{fontWeight:700,fontSize:13,color:isAct?C.white:C.muted}}>{p.name}</span>
                    </div>
                    <div style={{fontSize:17,fontWeight:900,color:ps.net>=0?C.white:"#fca5a5"}}>{ps.net>=0?"+":""}{fmt(viewMode==="ytd"?ps.net/ytdMonthsWithData:ps.net)}</div>
                    <div style={{fontSize:11,color:C.dim,marginTop:2}}>↑{fmt(viewMode==="ytd"?ps.income/ytdMonthsWithData:ps.income)} ↓{fmt(viewMode==="ytd"?ps.expenses/ytdMonthsWithData:ps.expenses)}</div>
                  </div>
                );
              })}
            </div>

            {/* 6-month bar chart */}
            <div style={{...cs.card,marginBottom:10}}>
              <div style={{color:C.muted,fontSize:11,fontWeight:700,textTransform:"uppercase",letterSpacing:".05em",marginBottom:14}}>6-Month Overview</div>
              <div style={{display:"flex",alignItems:"flex-end",gap:4,height:80}}>
                {sixMonthData.map((m,i)=>{
                  const isSel=m.key===selMonth&&viewMode==="month";
                  return(
                    <div key={i} onClick={()=>{setSelMonth(m.key);setViewMode("month");}}
                      style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:3,height:"100%",justifyContent:"flex-end",cursor:"pointer"}}>
                      <div style={{width:"100%",display:"flex",flexDirection:"column",gap:1,justifyContent:"flex-end"}}>
                        <div style={{background:isSel?C.white:"#2a2a2a",borderRadius:"3px 3px 0 0",height:`${(m.income/barMax)*64}px`,minHeight:m.income>0?2:0,transition:"height .5s"}}/>
                        <div style={{background:isSel?"#64748b":"#1a1a1a",borderRadius:"3px 3px 0 0",height:`${(m.exp/barMax)*64}px`,minHeight:m.exp>0?2:0,transition:"height .5s"}}/>
                      </div>
                      <div style={{color:isSel?C.white:C.dim,fontSize:10,fontWeight:700}}>{m.label}</div>
                    </div>
                  );
                })}
              </div>
              <div style={{display:"flex",gap:12,marginTop:8}}>
                {[{c:C.white,l:"Income"},{c:"#64748b",l:"Expenses"}].map(x=>(
                  <div key={x.l} style={{display:"flex",alignItems:"center",gap:5}}>
                    <div style={{width:7,height:7,borderRadius:2,background:x.c}}/>
                    <span style={{fontSize:11,color:C.muted}}>{x.l}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Category breakdown */}
            <div style={{color:C.muted,fontSize:11,fontWeight:700,letterSpacing:".05em",textTransform:"uppercase",marginBottom:8}}>By Category</div>
            {catBreakdown.length===0
              ?<div style={{...cs.card,color:C.dim,textAlign:"center",fontSize:14,padding:20}}>No data for this period</div>
              :catBreakdown.map(([cid,val])=>{
                const cat=getCat(cid);
                const budget=budgets[cid]||0;
                const displayVal=viewMode==="ytd"?val/ytdMonthsWithData:val;
                const pct=budget>0?Math.min(100,Math.round((displayVal/budget)*100)):0;
                const over=budget>0&&displayVal>budget;
                return(
                  <div key={cid} style={{...cs.card,padding:"10px 14px"}}>
                    <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:budget>0?6:0}}>
                      <span style={{fontSize:17}}>{cat.icon}</span>
                      <span style={{flex:1,fontSize:13,fontWeight:700}}>{cat.label}</span>
                      <div style={{textAlign:"right"}}>
                        <div style={{fontWeight:800,fontSize:13,color:over?"#fca5a5":C.text}}>{fmt(displayVal)}</div>
                        {budget>0&&<div style={{fontSize:10,color:C.dim}}>of {fmt(budget)}</div>}
                      </div>
                    </div>
                    {budget>0&&(
                      <div style={{background:"#1a1a1a",borderRadius:99,height:4}}>
                        <div style={{background:over?"#7f1d1d":pct>80?"#78350f":C.white,borderRadius:99,height:4,width:`${pct}%`,transition:"width .5s"}}/>
                      </div>
                    )}
                  </div>
                );
              })
            }
          </div>
        </div>
      )}

      {/* ── ADD ── */}
      {tab==="add"&&(
        <div style={{padding:"28px 16px 0"}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:20}}>
            <div style={{fontSize:22,fontWeight:900,letterSpacing:-0.5}}>Add Transaction</div>
            {/* Who is adding */}
            <div style={{display:"flex",background:"#111111",borderRadius:10,padding:3,border:`1px solid ${C.border}`,gap:2}}>
              {PROFILES.map(p=>(
                <button key={p.id} onClick={()=>setActiveUser(p.id)} style={cs.seg(activeUser===p.id)}>{p.name}</button>
              ))}
            </div>
          </div>

          {/* Who is this expense aligned to */}
          <div style={{...cs.card,marginBottom:14,padding:"12px 14px"}}>
            <label style={cs.lbl}>This expense belongs to</label>
            <div style={{display:"flex",gap:8}}>
              {PROFILES.map(p=>(
                <button key={p.id} onClick={()=>setActiveUser(p.id)} style={{...cs.pill(activeUser===p.id),flex:1,display:"flex",alignItems:"center",justifyContent:"center",gap:6}}>
                  <Avatar profile={p} size={18} active={activeUser===p.id}/>
                  {p.name}
                </button>
              ))}
            </div>
          </div>

          <div style={{display:"flex",background:"#111111",borderRadius:12,padding:3,marginBottom:14,gap:2,border:`1px solid ${C.border}`}}>
            {[["expense","Expense"],["income","Income"]].map(([v,l])=>(
              <button key={v} style={{flex:1,border:"none",borderRadius:10,padding:"10px",cursor:"pointer",
                background:mode===v?"#ffffff":"transparent",color:mode===v?"#000":"#64748b",fontWeight:700,fontSize:14,transition:"all .2s"}}
                onClick={()=>{setMode(v);setCatId(v==="income"?"job":"eating_out");}}>
                {l}
              </button>
            ))}
          </div>

          {mode==="expense"&&(
            <div style={{display:"flex",gap:6,marginBottom:14}}>
              {[["fixed","Fixed"],["variable","Variable"]].map(([v,l])=>(
                <button key={v} style={{...cs.pill(expType===v),flex:1}} onClick={()=>{setExpType(v);setCatId(v==="fixed"?"rent":"eating_out");}}>{l}</button>
              ))}
            </div>
          )}

          <div style={{marginBottom:14}}>
            <label style={cs.lbl}>Amount</label>
            <div style={{display:"flex",gap:8}}>
              <div style={{position:"relative",flex:1}}>
                <span style={{position:"absolute",left:12,top:"50%",transform:"translateY(-50%)",color:C.muted,fontWeight:700,fontSize:18}}>$</span>
                <input style={{...cs.inp,paddingLeft:28,fontSize:22,fontWeight:800,textAlign:"center"}} type="number" placeholder="0" value={amount} onChange={e=>setAmount(e.target.value)}/>
              </div>
              <div style={{display:"flex",background:"#111111",borderRadius:10,padding:3,border:`1px solid ${C.border}`,gap:2}}>
                {["USD","MXN"].map(c=>(
                  <button key={c} style={cs.seg(currency===c)} onClick={()=>setCurrency(c)}>{c}</button>
                ))}
              </div>
            </div>
            {currency==="MXN"&&amount&&!isNaN(parseFloat(amount))&&(
              <div style={{color:C.dim,fontSize:12,marginTop:4,paddingLeft:4}}>≈ {fmt(parseFloat(amount)/FX_RATE)} USD</div>
            )}
          </div>

          <div style={{marginBottom:14}}>
            <label style={cs.lbl}>Category</label>
            <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:6}}>
              {availableCats.map(cat=>(
                <button key={cat.id} onClick={()=>setCatId(cat.id)} style={{
                  border:`1px solid ${catId===cat.id?C.text:C.border}`,borderRadius:12,padding:"8px 4px",cursor:"pointer",
                  background:catId===cat.id?"#1a1a1a":"transparent",color:C.text,
                  fontSize:11,fontWeight:600,display:"flex",flexDirection:"column",alignItems:"center",gap:3,transition:"all .15s"}}>
                  <span style={{fontSize:18}}>{cat.icon}</span>
                  <span style={{textAlign:"center",lineHeight:1.2,color:catId===cat.id?C.white:C.muted}}>{cat.label}</span>
                </button>
              ))}
            </div>
          </div>

          <div style={{marginBottom:10}}>
            <label style={cs.lbl}>Note (optional)</label>
            <input style={cs.inp} placeholder="e.g. Trader Joe's" value={note} onChange={e=>setNote(e.target.value)}/>
          </div>

          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:10}}>
            <div><label style={cs.lbl}>Date</label><input style={cs.inp} type="date" value={date} onChange={e=>setDate(e.target.value)}/></div>
            <div>
              <label style={cs.lbl}>Bank</label>
              <select value={bank} onChange={e=>setBank(e.target.value)} style={{...cs.inp,cursor:"pointer"}}>
                {BANKS.map(b=><option key={b} value={b}>{b}</option>)}
              </select>
            </div>
          </div>

          <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:20,...cs.card,padding:"11px 14px"}}>
            <input type="checkbox" id="oneoff" checked={isOneOff} onChange={e=>setIsOneOff(e.target.checked)} style={{width:16,height:16,accentColor:C.white,cursor:"pointer"}}/>
            <label htmlFor="oneoff" style={{cursor:"pointer",flex:1}}>
              <div style={{fontSize:13,fontWeight:700}}>One-off</div>
              <div style={{fontSize:11,color:C.muted}}>Wedding, travel, etc — won't affect run rate</div>
            </label>
          </div>

          <button style={cs.bigBtn} onClick={addTxn}>Save for {getProfile(activeUser).name}</button>
        </div>
      )}

      {/* ── HISTORY ── */}
      {tab==="history"&&(
        <div style={{padding:"24px 16px 0"}}>
          <div style={{fontSize:22,fontWeight:900,letterSpacing:-0.5,marginBottom:14}}>History</div>

          {/* Income / Expense toggle */}
          <div style={{display:"flex",background:"#111111",borderRadius:10,padding:3,marginBottom:10,border:`1px solid ${C.border}`,gap:2}}>
            <button style={{...cs.seg(histKind==="expense"),flex:1}} onClick={()=>setHistKind("expense")}>Expenses</button>
            <button style={{...cs.seg(histKind==="income"),flex:1}} onClick={()=>setHistKind("income")}>Income</button>
          </div>

          {/* Filters row */}
          <div style={{display:"flex",gap:6,marginBottom:8,overflowX:"auto",paddingBottom:4}}>
            <button style={{...cs.pill(histPerson==="both"),flexShrink:0}} onClick={()=>setHistPerson("both")}>Both</button>
            {PROFILES.map(p=>(
              <button key={p.id} style={{...cs.pill(histPerson===p.id),flexShrink:0}} onClick={()=>setHistPerson(p.id)}>{p.name}</button>
            ))}
          </div>

          {/* Month filter */}
          <div style={{display:"flex",gap:6,marginBottom:8,overflowX:"auto",paddingBottom:4}}>
            <button style={{...cs.pill(histMonth==="all"),flexShrink:0}} onClick={()=>setHistMonth("all")}>All months</button>
            {allMonths.map(m=>(
              <button key={m} style={{...cs.pill(histMonth===m),flexShrink:0}} onClick={()=>setHistMonth(m)}>{MONTHS[parseInt(m.slice(5))-1]} {m.slice(0,4)}</button>
            ))}
          </div>

          {/* Sort */}
          <div style={{display:"flex",gap:6,marginBottom:12}}>
            <span style={{color:C.muted,fontSize:11,fontWeight:700,alignSelf:"center",textTransform:"uppercase"}}>Sort:</span>
            {[{id:"date",l:"Date"},{id:"month",l:"Month"},{id:"category",l:"Category"}].map(s=>(
              <button key={s.id} style={{...cs.pill(histSort===s.id),flexShrink:0}} onClick={()=>setHistSort(s.id)}>{s.l}</button>
            ))}
          </div>

          <div style={{color:C.muted,fontSize:11,marginBottom:8}}>{filteredHist.length} transactions</div>

          {filteredHist.length===0
            ?<div style={{...cs.card,color:C.dim,textAlign:"center",fontSize:14,padding:20}}>No transactions found</div>
            :filteredHist.map(t=>{
              const cat=getCat(t.catId),owner=getProfile(t.owner),isInc=t.kind==="income";
              return(
                <div key={t.id} style={{...cs.card,padding:"10px 12px",display:"flex",alignItems:"center",gap:10}}>
                  <div style={{width:34,height:34,borderRadius:9,background:"#1a1a1a",display:"flex",alignItems:"center",justifyContent:"center",fontSize:17,flexShrink:0}}>{cat.icon}</div>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:13,fontWeight:600,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{t.note||cat.label}</div>
                    <div style={{display:"flex",alignItems:"center",gap:5,marginTop:2,flexWrap:"wrap"}}>
                      <div style={{width:12,height:12,borderRadius:"50%",background:"#2a2a2a",display:"flex",alignItems:"center",justifyContent:"center",fontSize:7,fontWeight:800,color:C.white,border:`1px solid ${C.border}`}}>{owner.avatar}</div>
                      <span style={{fontSize:11,color:C.dim}}>{owner.name} · {t.date}</span>
                      {t.bank&&<span style={{fontSize:10,background:"#1a1a1a",color:C.dim,borderRadius:4,padding:"1px 5px",border:`1px solid ${C.border}`}}>{t.bank}</span>}
                      {t.oneOff&&<span style={{fontSize:9,background:"#1a0000",color:"#fca5a5",borderRadius:4,padding:"1px 4px"}}>1x</span>}
                    </div>
                  </div>
                  <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:3}}>
                    <div style={{fontWeight:800,fontSize:13,color:isInc?"#86efac":"#fca5a5"}}>{isInc?"+":"-"}{fmt(t.amount)}</div>
                    {t.currency==="MXN"&&<div style={{fontSize:10,color:C.dim}}>{t.origAmount?.toLocaleString()} MXN</div>}
                    <button onClick={()=>delTxn(t.id)} style={{border:"none",background:"none",color:C.dim,cursor:"pointer",fontSize:12,padding:0}}>✕</button>
                  </div>
                </div>
              );
            })
          }
        </div>
      )}

      {/* ── BUDGET ── */}
      {tab==="budget"&&(
        <div style={{padding:"24px 16px 0"}}>
          <div style={{fontSize:22,fontWeight:900,letterSpacing:-0.5,marginBottom:4}}>Budget</div>
          <div style={{color:C.muted,fontSize:13,marginBottom:16}}>Monthly targets per category</div>

          {/* Run rate card */}
          <div style={{...cs.card,background:"#111111",border:`1px solid ${C.border}`,marginBottom:16}}>
            <div style={{color:C.muted,fontSize:11,fontWeight:700,textTransform:"uppercase",letterSpacing:".05em",marginBottom:8}}>Run Rate</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
              <div style={{background:"#0d0d0d",borderRadius:10,padding:"10px 12px"}}>
                <div style={{color:C.muted,fontSize:11,marginBottom:4}}>Current cash</div>
                <div style={{fontWeight:800,fontSize:18}}>{fmt(currentCash)}</div>
              </div>
              <div style={{background:"#0d0d0d",borderRadius:10,padding:"10px 12px"}}>
                <div style={{color:C.muted,fontSize:11,marginBottom:4}}>Avg monthly spend</div>
                <div style={{fontWeight:800,fontSize:18}}>{fmt(avgMonthlyExp)}</div>
              </div>
            </div>
            <div style={{marginTop:10,background:"#0d0d0d",borderRadius:10,padding:"10px 12px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <div style={{color:C.muted,fontSize:12}}>Months you can live on current cash</div>
              <div style={{fontWeight:900,fontSize:24,color:runRateMonths<6?"#fca5a5":runRateMonths<12?"#fbbf24":C.white}}>{runRateMonths}</div>
            </div>
          </div>

          {/* Budget by category */}
          <div style={{color:C.muted,fontSize:11,fontWeight:700,textTransform:"uppercase",letterSpacing:".05em",marginBottom:8}}>Monthly targets</div>
          {EXPENSE_CATS.map(cat=>{
            const bgt=budgets[cat.id]||0;
            const thisMonthSpend=(data?.txns||[]).filter(t=>t.date.startsWith(monthKey())&&t.catId===cat.id).reduce((s,t)=>s+t.amount,0);
            const pct=bgt>0?Math.min(100,Math.round((thisMonthSpend/bgt)*100)):0;
            const over=bgt>0&&thisMonthSpend>bgt;
            const isEditing=editingBudget===cat.id;
            return(
              <div key={cat.id} style={{...cs.card,padding:"12px 14px"}}>
                <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:6}}>
                  <span style={{fontSize:17}}>{cat.icon}</span>
                  <span style={{flex:1,fontSize:13,fontWeight:700}}>{cat.label}</span>
                  {isEditing?(
                    <div style={{display:"flex",gap:6,alignItems:"center"}}>
                      <input autoFocus type="number" value={budgetVal} onChange={e=>setBudgetVal(e.target.value)}
                        onKeyDown={e=>e.key==="Enter"&&saveBudget(cat.id,budgetVal)}
                        style={{...cs.inp,width:90,padding:"4px 8px",fontSize:13,textAlign:"right"}}
                        placeholder="0"/>
                      <button onClick={()=>saveBudget(cat.id,budgetVal)} style={{border:"none",background:C.white,color:"#000",borderRadius:6,padding:"4px 8px",cursor:"pointer",fontWeight:700,fontSize:12}}>✓</button>
                      <button onClick={()=>{setEditingBudget(null);setBudgetVal("");}} style={{border:`1px solid ${C.border}`,background:"transparent",color:C.muted,borderRadius:6,padding:"4px 8px",cursor:"pointer",fontSize:12}}>✕</button>
                    </div>
                  ):(
                    <div style={{display:"flex",alignItems:"center",gap:8}}>
                      <div style={{textAlign:"right"}}>
                        <div style={{fontSize:12,color:over?"#fca5a5":C.text,fontWeight:700}}>{fmt(thisMonthSpend)} <span style={{color:C.dim}}>/ {bgt>0?fmt(bgt):"—"}</span></div>
                        {bgt>0&&<div style={{fontSize:10,color:over?"#fca5a5":C.dim}}>{pct}% used</div>}
                      </div>
                      <button onClick={()=>{setEditingBudget(cat.id);setBudgetVal(String(bgt));}}
                        style={{border:`1px solid ${C.border}`,background:"transparent",color:C.muted,borderRadius:6,padding:"4px 8px",cursor:"pointer",fontSize:11}}>Edit</button>
                    </div>
                  )}
                </div>
                {bgt>0&&!isEditing&&(
                  <div style={{background:"#1a1a1a",borderRadius:99,height:4}}>
                    <div style={{background:over?"#7f1d1d":pct>80?"#78350f":C.white,borderRadius:99,height:4,width:`${pct}%`,transition:"width .5s"}}/>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── GOALS ── */}
      {tab==="goals"&&(
        <div style={{padding:"24px 16px 0"}}>
          <div style={{fontSize:22,fontWeight:900,letterSpacing:-0.5,marginBottom:16}}>Goals</div>

          {/* Honeymoon tracker */}
          <div style={{...cs.card,marginBottom:12}}>
            <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:12}}>
              <span style={{fontSize:22}}>🌍</span>
              <div><div style={{fontWeight:800,fontSize:14}}>Honeymoon — Africa & Maldives</div><div style={{color:C.muted,fontSize:12}}>Total: $35,613</div></div>
            </div>
            {[
              {label:"Flights & Africa package",amount:16333,due:"Nov 2025",paid:true},
              {label:"2nd Africa installment",amount:4894,due:"Feb 2026",paid:true},
              {label:"3rd Africa installment",amount:4894,due:"Mar 2026",paid:false},
              {label:"4th Africa installment",amount:4894,due:"Apr 2026",paid:false},
              {label:"Transfers & Fees",amount:4298,due:"May 2026",paid:false},
              {label:"Service Fee",amount:300,due:"Jun 2026",paid:false},
            ].map((p,i)=>(
              <div key={i} style={{display:"flex",alignItems:"center",gap:10,marginBottom:6,opacity:p.paid?0.45:1}}>
                <div style={{width:16,height:16,borderRadius:"50%",background:p.paid?"#1a2a1a":"#1a1a1a",border:`1px solid ${p.paid?"#14532d":C.border}`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:9,color:"#86efac",flexShrink:0}}>{p.paid?"✓":""}</div>
                <div style={{flex:1}}><div style={{fontSize:12,fontWeight:600}}>{p.label}</div><div style={{fontSize:11,color:C.dim}}>{p.due}</div></div>
                <div style={{fontWeight:700,fontSize:12}}>{fmt(p.amount)}</div>
              </div>
            ))}
          </div>

          {/* Custom goals */}
          <div style={cs.card}>
            <label style={cs.lbl}>New Goal</label>
            <div style={{display:"grid",gridTemplateColumns:"1fr auto",gap:8,marginBottom:8}}>
              <div><label style={cs.lbl}>Name</label><input style={cs.inp} placeholder="New apartment" value={gName} onChange={e=>setGName(e.target.value)}/></div>
              <div><label style={cs.lbl}>Icon</label><input style={{...cs.inp,width:50,textAlign:"center",fontSize:20}} value={gIcon} onChange={e=>setGIcon(e.target.value)}/></div>
            </div>
            <div style={{marginBottom:8}}><label style={cs.lbl}>Target ($)</label><input style={cs.inp} type="number" placeholder="10000" value={gTarget} onChange={e=>setGTarget(e.target.value)}/></div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:12}}>
              {PROFILES.map(p=>(
                <div key={p.id}><label style={{...cs.lbl}}>{p.name}'s share ($)</label>
                  <input style={cs.inp} type="number" placeholder="0" value={gSaved[p.id]||""} onChange={e=>setGSaved(s=>({...s,[p.id]:e.target.value}))}/>
                </div>
              ))}
            </div>
            <button style={cs.bigBtn} onClick={addGoal}>Add Goal</button>
          </div>

          {(data?.goals||[]).map(g=>{
            const total=(g.saved?.roberto||0)+(g.saved?.alexia||0);
            const pct=Math.min(100,Math.round((total/g.target)*100));
            return(
              <div key={g.id} style={cs.card}>
                <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:10}}>
                  <span style={{fontSize:28}}>{g.icon}</span>
                  <div style={{flex:1}}>
                    <div style={{display:"flex",justifyContent:"space-between"}}>
                      <div style={{fontWeight:800,fontSize:14}}>{g.name}</div>
                      <button onClick={()=>delGoal(g.id)} style={{border:"none",background:"none",color:C.dim,cursor:"pointer",fontSize:13,padding:0}}>✕</button>
                    </div>
                    <div style={{color:C.muted,fontSize:12,marginTop:2}}>{fmt(total)} of {fmt(g.target)} · {pct}%</div>
                  </div>
                </div>
                <div style={{background:"#1a1a1a",borderRadius:99,height:5,marginBottom:10}}>
                  <div style={{background:pct>=100?"#86efac":C.white,borderRadius:99,height:5,width:`${pct}%`,transition:"width .6s"}}/>
                </div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                  {PROFILES.map(p=>(
                    <div key={p.id}><label style={cs.lbl}>{p.name}</label>
                      <input style={cs.inp} type="number" value={g.saved?.[p.id]||0} onChange={e=>updateGoal(g.id,p.id,e.target.value)}/>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── IMPORT ── */}
      {tab==="import"&&(
        <div style={{padding:"24px 16px 0"}}>
          <div style={{fontSize:22,fontWeight:900,letterSpacing:-0.5,marginBottom:6}}>Import</div>
          <div style={{color:C.muted,fontSize:13,marginBottom:20}}>Upload a CSV from Amex, BofA, or BBVA.</div>
          <div style={{...cs.card,marginBottom:14}}>
            <label style={cs.lbl}>Importing for</label>
            <div style={{display:"flex",gap:8,marginBottom:14}}>
              {PROFILES.map(p=>(<button key={p.id} style={{...cs.pill(activeUser===p.id),flex:1}} onClick={()=>setActiveUser(p.id)}>{p.name}</button>))}
            </div>
            <label style={cs.lbl}>Bank</label>
            <div style={{display:"flex",gap:8}}>
              {["AMEX","BofA","BBVA"].map(b=>(<button key={b} style={{...cs.pill(bank===b),flex:1}} onClick={()=>setBank(b)}>{b}</button>))}
            </div>
          </div>
          <input ref={fileRef} type="file" accept=".csv" onChange={handleFile} style={{display:"none"}}/>
          <button style={cs.bigBtn} onClick={()=>fileRef.current?.click()}>Choose CSV File</button>
        </div>
      )}

      {/* ── Nav ── */}
      <nav style={cs.nav}>
        {[
          {id:"summary",icon:"◫",label:"Summary"},
          {id:"budget", icon:"◉",label:"Budget"},
          {id:"add",    icon:"+",label:"Add"},
          {id:"history",icon:"≡",label:"History"},
          {id:"goals",  icon:"◎",label:"Goals"},
        ].map(n=>(
          <button key={n.id} style={cs.navBtn(tab===n.id)} onClick={()=>setTab(n.id)}>
            <span style={{fontSize:n.id==="add"?26:17,fontWeight:900,lineHeight:1}}>{n.icon}</span>
            <span style={{fontSize:10,fontWeight:600}}>{n.label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}
