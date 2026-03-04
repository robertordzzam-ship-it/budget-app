import { useState, useEffect, useMemo, useRef, useCallback } from "react";

const INCOME_CATS = [
  { id:"job",         label:"Job",         icon:"💼", color:"#34d399" },
  { id:"investments", label:"Investments", icon:"📈", color:"#60a5fa" },
  { id:"other_inc",   label:"Other Income",icon:"💡", color:"#a78bfa" },
];
const FIXED_CATS = [
  { id:"rent",          label:"Rent/Housing",  icon:"🏠", color:"#f97316" },
  { id:"subscriptions", label:"Subscriptions", icon:"📱", color:"#fb7185" },
  { id:"utilities",     label:"Utilities",     icon:"⚡", color:"#facc15" },
];
const VARIABLE_CATS = [
  { id:"food",          label:"Food & Dining",  icon:"🍜", color:"#f59e0b" },
  { id:"transport",     label:"Transport",      icon:"🚇", color:"#38bdf8" },
  { id:"shopping",      label:"Shopping",       icon:"🛍️", color:"#e879f9" },
  { id:"health",        label:"Health",         icon:"🩺", color:"#4ade80" },
  { id:"entertainment", label:"Entertainment",  icon:"🎮", color:"#c084fc" },
  { id:"personal",      label:"Personal Care",  icon:"✨", color:"#f0abfc" },
  { id:"travel",        label:"Travel",         icon:"✈️", color:"#67e8f9" },
];
const ALL_CATS = [...INCOME_CATS, ...FIXED_CATS, ...VARIABLE_CATS];
const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const PROFILES = [
  { id:"roberto", name:"Roberto", color:"#818cf8", avatar:"R" },
  { id:"alexia",  name:"Alexia",  color:"#f0abfc", avatar:"A" },
];

function fmt(n) {
  return new Intl.NumberFormat("en-US",{style:"currency",currency:"USD",maximumFractionDigits:0}).format(n||0);
}
function monthKey(d=new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;
}
function getCat(id) {
  return ALL_CATS.find(c=>c.id===id)||{id,label:id,icon:"📦",color:"#94a3b8"};
}
function getProfile(id) {
  return PROFILES.find(p=>p.id===id)||PROFILES[0];
}

const STORAGE_KEY = "budget_roberto_alexia_v1";

async function loadData() {
  try {
    if (window.storage) {
      const result = await window.storage.get(STORAGE_KEY, true);
      if (result?.value) return JSON.parse(result.value);
    }
  } catch {}
  try {
    const local = localStorage.getItem(STORAGE_KEY);
    if (local) return JSON.parse(local);
  } catch {}
  return { txns: [], goals: [] };
}

async function saveData(data) {
  try {
    if (window.storage) {
      await window.storage.set(STORAGE_KEY, JSON.stringify(data), true);
      return;
    }
  } catch {}
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {}
}

async function categorizeTxns(rawTxns) {
  const prompt = `You are a personal finance categorizer. Categorize each transaction.

Available categoryIds:
INCOME (kind="income"): job, investments, other_inc
FIXED (kind="fixed"): rent, subscriptions, utilities
VARIABLE (kind="variable"): food, transport, shopping, health, entertainment, personal, travel

Transactions:
${rawTxns.map((t,i)=>`${i}. "${t.description}" $${t.amount} on ${t.date}`).join("\n")}

Respond ONLY with JSON array: [{"index":0,"catId":"food","kind":"variable"},...]
No markdown, no explanation.`;
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages",{
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({model:"claude-sonnet-4-20250514",max_tokens:1000,messages:[{role:"user",content:prompt}]})
    });
    const data = await res.json();
    const text = data.content?.[0]?.text||"[]";
    return JSON.parse(text.replace(/```json|```/g,"").trim());
  } catch {
    return rawTxns.map((_,i)=>({index:i,catId:"shopping",kind:"variable"}));
  }
}

function parseCSV(text) {
  const lines = text.trim().split("\n").filter(Boolean);
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map(h=>h.replace(/"/g,"").trim().toLowerCase());
  const find = (...keys) => { for(const k of keys){const i=headers.findIndex(h=>h.includes(k));if(i>=0)return i;} return -1; };
  const dateIdx=find("date","posted","trans"), descIdx=find("description","merchant","memo","name","payee"), amtIdx=find("amount","debit","charge");
  return lines.slice(1).map(line=>{
    const cols=line.match(/(".*?"|[^,]+)/g)?.map(c=>c.replace(/"/g,"").trim())||[];
    const amt=parseFloat((cols[amtIdx]||"0").replace(/[$,\-]/g,""))||0;
    const desc=cols[descIdx]||"Unknown";
    let date=cols[dateIdx]||new Date().toISOString().split("T")[0];
    try{const p=new Date(date);if(!isNaN(p))date=p.toISOString().split("T")[0];}catch{}
    return {description:desc,amount:Math.abs(amt),date};
  }).filter(t=>t.amount>0&&t.description!=="Unknown");
}

function Bar({val,max,color}) {
  const w=max>0?Math.min(100,(val/max)*100):0;
  return (
    <div style={{background:"#0f172a",borderRadius:99,height:6,flex:1}}>
      <div style={{background:color,borderRadius:99,height:6,width:`${w}%`,transition:"width .5s ease"}}/>
    </div>
  );
}
function ProgressRing({pct,size=52,stroke=5,color="#34d399"}) {
  const r=(size-stroke)/2,circ=2*Math.PI*r,dash=Math.min(pct/100,1)*circ;
  return (
    <svg width={size} height={size} style={{transform:"rotate(-90deg)"}}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#1e293b" strokeWidth={stroke}/>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={stroke}
        strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"
        style={{transition:"stroke-dasharray .6s cubic-bezier(.4,0,.2,1)"}}/>
    </svg>
  );
}
function Avatar({profile,size=28,active}) {
  return (
    <div style={{width:size,height:size,borderRadius:"50%",
      background:active?profile.color:"#1e293b",
      border:`2px solid ${active?profile.color:"#334155"}`,
      display:"flex",alignItems:"center",justifyContent:"center",
      fontSize:size*0.4,fontWeight:800,color:active?"#0f172a":profile.color,
      transition:"all .2s",flexShrink:0}}>
      {profile.avatar}
    </div>
  );
}

export default function Budget() {
  const [data, setData]         = useState({ txns:[], goals:[] });
  const [loaded, setLoaded]     = useState(false);
  const [syncing, setSyncing]   = useState(false);
  const [activeUser, setActiveUser] = useState("roberto");
  const [tab, setTab]           = useState("home");
  const [selMonth, setSelMonth] = useState(monthKey());
  const [toast, setToast]       = useState(null);
  const [histFilter, setHistFilter] = useState("all");
  const [personFilter, setPersonFilter] = useState("both");
  const syncTimer = useRef(null);

  const [mode, setMode]       = useState("expense");
  const [expType, setExpType] = useState("variable");
  const [amount, setAmount]   = useState("");
  const [catId, setCatId]     = useState("food");
  const [note, setNote]       = useState("");
  const [date, setDate]       = useState(new Date().toISOString().split("T")[0]);

  const [gName,setGName]     = useState("");
  const [gIcon,setGIcon]     = useState("🎯");
  const [gTarget,setGTarget] = useState("");
  const [gSaved,setGSaved]   = useState({ roberto:0, alexia:0 });

  const [importStep, setImportStep] = useState("idle");
  const [importRows, setImportRows] = useState([]);
  const [reviewRows, setReviewRows] = useState([]);
  const [importSource, setImportSource] = useState("");
  const fileRef = useRef();

  useEffect(() => {
    loadData().then(d => { setData(d); setLoaded(true); });
  }, []);

  const persistData = useCallback((newData) => {
    setData(newData);
    clearTimeout(syncTimer.current);
    syncTimer.current = setTimeout(async () => {
      setSyncing(true);
      await saveData(newData);
      setSyncing(false);
    }, 800);
  }, []);

  useEffect(() => {
    if (!loaded) return;
    const interval = setInterval(async () => {
      const remote = await loadData();
      setData(prev => {
        if (JSON.stringify(remote) !== JSON.stringify(prev)) return remote;
        return prev;
      });
    }, 15000);
    return () => clearInterval(interval);
  }, [loaded]);

  const showToast = (msg, err) => { setToast({msg,err}); setTimeout(()=>setToast(null),2600); };

  const monthTxns = useMemo(()=>data.txns.filter(t=>t.date.startsWith(selMonth)),[data.txns,selMonth]);

  const calcStats = useCallback((txns) => {
    const income   = txns.filter(t=>t.kind==="income").reduce((s,t)=>s+t.amount,0);
    const fixed    = txns.filter(t=>t.kind==="fixed").reduce((s,t)=>s+t.amount,0);
    const variable = txns.filter(t=>t.kind==="variable").reduce((s,t)=>s+t.amount,0);
    return {income,fixed,variable,expenses:fixed+variable,net:income-fixed-variable};
  }, []);

  const sharedStats  = useMemo(()=>calcStats(monthTxns),[monthTxns,calcStats]);
  const robertoStats = useMemo(()=>calcStats(monthTxns.filter(t=>t.owner==="roberto")),[monthTxns,calcStats]);
  const alexiaStats  = useMemo(()=>calcStats(monthTxns.filter(t=>t.owner==="alexia")),[monthTxns,calcStats]);

  const catBreakdown = useMemo(()=>{
    const filtered = personFilter==="both" ? monthTxns : monthTxns.filter(t=>t.owner===personFilter);
    const map={};
    filtered.filter(t=>t.kind!=="income").forEach(t=>{ map[t.catId]=(map[t.catId]||0)+t.amount; });
    return Object.entries(map).sort((a,b)=>b[1]-a[1]);
  },[monthTxns,personFilter]);

  const barChartData = useMemo(()=>
    Array.from({length:5},(_,i)=>{
      const d=new Date(); d.setMonth(d.getMonth()-(4-i));
      const key=monthKey(d);
      const txns=data.txns.filter(t=>t.date.startsWith(key));
      return {
        label:MONTHS[d.getMonth()],
        income:txns.filter(t=>t.kind==="income").reduce((s,t)=>s+t.amount,0),
        exp:txns.filter(t=>t.kind!=="income").reduce((s,t)=>s+t.amount,0),
      };
    }),[data.txns]);
  const barMax=Math.max(...barChartData.flatMap(d=>[d.income,d.exp]),1);

  const addTxn = () => {
    const amt=parseFloat(amount);
    if(!amt||isNaN(amt)) return showToast("Enter a valid amount",true);
    const kind=mode==="income"?"income":expType;
    const txn={id:Date.now(),kind,catId,amount:amt,note,date,owner:activeUser};
    persistData({...data,txns:[txn,...data.txns]});
    setAmount(""); setNote("");
    showToast("Transaction saved!"); setTab("home");
  };

  const delTxn = id => { persistData({...data,txns:data.txns.filter(t=>t.id!==id)}); showToast("Deleted"); };

  const addGoal = () => {
    if(!gName||!gTarget) return showToast("Name and target required",true);
    const goal={id:Date.now(),name:gName,icon:gIcon,target:+gTarget,
      saved:{roberto:+(gSaved.roberto||0),alexia:+(gSaved.alexia||0)}};
    persistData({...data,goals:[...data.goals,goal]});
    setGName(""); setGIcon("🎯"); setGTarget(""); setGSaved({roberto:0,alexia:0});
    showToast("Goal added!");
  };

  const updateGoalSaved = (id,person,val) =>
    persistData({...data,goals:data.goals.map(g=>g.id===id?{...g,saved:{...g.saved,[person]:+val||0}}:g)});

  const delGoal = id => { persistData({...data,goals:data.goals.filter(g=>g.id!==id)}); showToast("Goal removed"); };

  const handleFile = async (e) => {
    const file=e.target.files?.[0]; if(!file) return;
    setImportSource(file.name); setImportStep("parsing");
    try {
      const text=await file.text();
      const rawTxns=parseCSV(text);
      if(rawTxns.length===0){showToast("Couldn't parse this file",true);setImportStep("idle");return;}
      setImportRows(rawTxns); setImportStep("categorizing");
      const batches=[];
      for(let i=0;i<rawTxns.length;i+=30)batches.push(rawTxns.slice(i,i+30));
      const allCats=[];
      for(const batch of batches){const cats=await categorizeTxns(batch);allCats.push(...cats);}
      const reviewed=rawTxns.map((t,i)=>{
        const ai=allCats.find(c=>c.index===i)||{catId:"shopping",kind:"variable"};
        return{...t,catId:ai.catId,kind:ai.kind,selected:true,id:Date.now()+i,owner:activeUser};
      });
      setReviewRows(reviewed); setImportStep("reviewing");
    } catch(err) { showToast("Error: "+err.message,true); setImportStep("idle"); }
    e.target.value="";
  };

  const confirmImport = () => {
    const toAdd=reviewRows.filter(r=>r.selected).map(r=>({
      id:r.id,kind:r.kind,catId:r.catId,amount:r.amount,note:r.description,date:r.date,owner:r.owner
    }));
    persistData({...data,txns:[...toAdd,...data.txns]});
    showToast(`${toAdd.length} transactions imported!`);
    setImportStep("idle"); setReviewRows([]); setTab("home");
  };

  const availableCats=mode==="income"?INCOME_CATS:expType==="fixed"?FIXED_CATS:VARIABLE_CATS;
  const filteredHist=data.txns
    .filter(t=>(histFilter==="all"||t.kind===histFilter))
    .filter(t=>(personFilter==="both"||t.owner===personFilter))
    .slice(0,80);

  const cs={
    wrap:{maxWidth:430,margin:"0 auto",minHeight:"100vh",background:"#080e1a",
      color:"#e2e8f0",fontFamily:"'DM Sans','Segoe UI',sans-serif",paddingBottom:88},
    card:{background:"#111827",border:"1px solid #1e293b",borderRadius:20,padding:"16px 18px",marginBottom:10},
    inp:{width:"100%",background:"#0c1626",border:"1px solid #1e293b",borderRadius:14,
      padding:"11px 14px",color:"#e2e8f0",fontSize:15,outline:"none",boxSizing:"border-box"},
    lbl:{color:"#64748b",fontSize:12,fontWeight:600,letterSpacing:".04em",textTransform:"uppercase",marginBottom:6,display:"block"},
    pill:(on,bg="#6366f1")=>({border:on?"none":"1px solid #1e293b",borderRadius:99,padding:"7px 16px",
      background:on?bg:"#111827",color:on?"#fff":"#475569",fontWeight:700,fontSize:13,cursor:"pointer",transition:"all .2s"}),
    bigBtn:{width:"100%",background:"linear-gradient(135deg,#6366f1,#a855f7)",border:"none",
      borderRadius:16,padding:15,color:"#fff",fontWeight:800,fontSize:16,cursor:"pointer"},
    nav:{position:"fixed",bottom:0,left:"50%",transform:"translateX(-50%)",width:"100%",maxWidth:430,
      background:"#0c1220",borderTop:"1px solid #1e293b",display:"flex",zIndex:100},
    navBtn:on=>({flex:1,border:"none",background:"none",cursor:"pointer",padding:"10px 0 8px",
      display:"flex",flexDirection:"column",alignItems:"center",gap:3,
      color:on?"#818cf8":"#334155",transition:"color .2s"}),
  };

  if (!loaded) return (
    <div style={{...cs.wrap,display:"flex",alignItems:"center",justifyContent:"center",flexDirection:"column",gap:16}}>
      <div style={{fontSize:40}}>💰</div>
      <div style={{fontWeight:800,fontSize:18}}>Loading your budget…</div>
      <div style={{color:"#475569",fontSize:13}}>Syncing Roberto & Alexia's data</div>
    </div>
  );

  return (
    <div style={cs.wrap}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800;900&display=swap');
        * { -webkit-tap-highlight-color: transparent; box-sizing: border-box; }
        input[type=number]::-webkit-inner-spin-button { -webkit-appearance: none; }
        input::placeholder { color: #334155; }
        ::-webkit-scrollbar { display: none; }
        @keyframes pulse { 0%,100%{transform:scale(1);opacity:.4} 50%{transform:scale(1.4);opacity:1} }
      `}</style>

      {toast&&(
        <div style={{position:"fixed",top:20,left:"50%",transform:"translateX(-50%)",
          background:toast.err?"#ef4444":"#111827",border:toast.err?"none":"1px solid #22c55e",
          color:toast.err?"#fff":"#22c55e",padding:"10px 22px",borderRadius:99,zIndex:999,
          fontWeight:700,fontSize:13,boxShadow:"0 8px 32px rgba(0,0,0,.5)",whiteSpace:"nowrap"}}>
          {toast.msg}
        </div>
      )}
      {syncing&&(
        <div style={{position:"fixed",top:20,right:20,background:"#111827",border:"1px solid #1e293b",
          color:"#6366f1",padding:"6px 12px",borderRadius:99,zIndex:998,fontSize:12,fontWeight:700}}>
          ↑ Syncing…
        </div>
      )}

      {/* IMPORT OVERLAY */}
      {(importStep==="parsing"||importStep==="categorizing"||importStep==="reviewing")&&(
        <div style={{position:"fixed",inset:0,background:"#080e1a",zIndex:200,overflowY:"auto",maxWidth:430,margin:"0 auto"}}>
          <div style={{padding:"28px 18px"}}>
            <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:20}}>
              <button onClick={()=>{setImportStep("idle");setReviewRows([]);}}
                style={{border:"none",background:"#111827",color:"#94a3b8",borderRadius:10,padding:"6px 12px",cursor:"pointer",fontSize:13}}>← Back</button>
              <div style={{fontSize:20,fontWeight:900}}>Import for {getProfile(activeUser).name}</div>
            </div>
            {(importStep==="parsing"||importStep==="categorizing")&&(
              <div style={{textAlign:"center",padding:"60px 20px"}}>
                <div style={{fontSize:40,marginBottom:16}}>{importStep==="parsing"?"📄":"🤖"}</div>
                <div style={{fontWeight:700,fontSize:18,marginBottom:8}}>
                  {importStep==="parsing"?"Reading statement…":"AI categorizing…"}
                </div>
                <div style={{color:"#475569",fontSize:14}}>
                  {importStep==="categorizing"?`${importRows.length} transactions found`:"Please wait"}
                </div>
                <div style={{marginTop:24,display:"flex",justifyContent:"center",gap:6}}>
                  {[0,1,2].map(i=>(
                    <div key={i} style={{width:8,height:8,borderRadius:"50%",background:"#6366f1",
                      animation:`pulse 1.2s ${i*0.2}s infinite`}}/>
                  ))}
                </div>
              </div>
            )}
            {importStep==="reviewing"&&(
              <>
                <div style={{...cs.card,background:"#0c1a2e",border:"1px solid #1e3a5f",marginBottom:16}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                    <div>
                      <div style={{fontWeight:700,fontSize:14}}>📁 {importSource}</div>
                      <div style={{color:"#475569",fontSize:12,marginTop:2}}>{reviewRows.filter(r=>r.selected).length} of {reviewRows.length} selected</div>
                    </div>
                    <div style={{display:"flex",gap:6}}>
                      {PROFILES.map(p=>(
                        <button key={p.id} onClick={()=>setReviewRows(r=>r.map(x=>({...x,owner:p.id})))}
                          style={{...cs.pill(reviewRows[0]?.owner===p.id,p.color),padding:"4px 10px",fontSize:11}}>
                          {p.name}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
                {reviewRows.map((row,i)=>{
                  const cat=getCat(row.catId), owner=getProfile(row.owner);
                  return (
                    <div key={row.id} style={{...cs.card,padding:"10px 14px",opacity:row.selected?1:0.4,transition:"opacity .2s"}}>
                      <div style={{display:"flex",alignItems:"center",gap:8}}>
                        <input type="checkbox" checked={row.selected}
                          onChange={()=>setReviewRows(r=>r.map((x,j)=>j===i?{...x,selected:!x.selected}:x))}
                          style={{width:16,height:16,accentColor:"#6366f1",flexShrink:0,cursor:"pointer"}}/>
                        <div style={{width:32,height:32,borderRadius:10,background:cat.color+"18",display:"flex",alignItems:"center",justifyContent:"center",fontSize:16,flexShrink:0}}>{cat.icon}</div>
                        <div style={{flex:1,minWidth:0}}>
                          <div style={{fontSize:12,fontWeight:700,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{row.description}</div>
                          <div style={{display:"flex",alignItems:"center",gap:6,marginTop:3}}>
                            <select value={row.catId}
                              onChange={e=>{
                                const nc=e.target.value;
                                const nk=INCOME_CATS.find(c=>c.id===nc)?"income":FIXED_CATS.find(c=>c.id===nc)?"fixed":"variable";
                                setReviewRows(r=>r.map((x,j)=>j===i?{...x,catId:nc,kind:nk}:x));
                              }}
                              style={{background:"#0c1626",border:"1px solid #1e293b",borderRadius:8,color:"#94a3b8",fontSize:10,padding:"2px 6px",cursor:"pointer",outline:"none"}}>
                              <optgroup label="Income">{INCOME_CATS.map(c=><option key={c.id} value={c.id}>{c.icon} {c.label}</option>)}</optgroup>
                              <optgroup label="Fixed">{FIXED_CATS.map(c=><option key={c.id} value={c.id}>{c.icon} {c.label}</option>)}</optgroup>
                              <optgroup label="Variable">{VARIABLE_CATS.map(c=><option key={c.id} value={c.id}>{c.icon} {c.label}</option>)}</optgroup>
                            </select>
                            <select value={row.owner}
                              onChange={e=>setReviewRows(r=>r.map((x,j)=>j===i?{...x,owner:e.target.value}:x))}
                              style={{background:"#0c1626",border:`1px solid ${owner.color}44`,borderRadius:8,color:owner.color,fontSize:10,padding:"2px 6px",cursor:"pointer",outline:"none"}}>
                              {PROFILES.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}
                            </select>
                          </div>
                        </div>
                        <div style={{fontWeight:800,fontSize:13,color:row.kind==="income"?"#4ade80":"#f87171",flexShrink:0}}>
                          {row.kind==="income"?"+":"-"}{fmt(row.amount)}
                        </div>
                      </div>
                    </div>
                  );
                })}
                <div style={{paddingTop:12,paddingBottom:20}}>
                  <button style={cs.bigBtn} onClick={confirmImport}>Import {reviewRows.filter(r=>r.selected).length} Transactions</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* HOME */}
      {tab==="home"&&(
        <div>
          <div style={{padding:"24px 20px 0",background:"linear-gradient(180deg,#0c1626 0%,#080e1a 100%)"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
              <div>
                <div style={{color:"#475569",fontSize:12,fontWeight:600,letterSpacing:".06em",textTransform:"uppercase"}}>
                  {MONTHS[new Date().getMonth()]} {new Date().getFullYear()}
                </div>
                <div style={{fontSize:26,fontWeight:900,letterSpacing:-1,marginTop:2}}>Family Budget</div>
              </div>
              <div style={{display:"flex",gap:6,background:"#111827",borderRadius:99,padding:4,border:"1px solid #1e293b"}}>
                {PROFILES.map(p=>(
                  <button key={p.id} onClick={()=>setActiveUser(p.id)}
                    style={{border:"none",background:activeUser===p.id?p.color:"transparent",
                      borderRadius:99,padding:"4px 12px",cursor:"pointer",
                      color:activeUser===p.id?"#0f172a":"#475569",fontWeight:700,fontSize:12,transition:"all .2s"}}>
                    {p.name}
                  </button>
                ))}
              </div>
            </div>
            <div style={{background:"#111827",border:"1px solid #1e293b",borderRadius:20,padding:"16px 18px",marginBottom:12}}>
              <div style={{color:"#475569",fontSize:11,fontWeight:700,textTransform:"uppercase",letterSpacing:".05em",marginBottom:6}}>Combined Net</div>
              <div style={{fontSize:34,fontWeight:900,letterSpacing:-1,color:sharedStats.net>=0?"#4ade80":"#f87171"}}>
                {sharedStats.net>=0?"+":""}{fmt(sharedStats.net)}
              </div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,marginTop:12}}>
                {[{label:"Income",val:sharedStats.income,color:"#4ade80"},{label:"Fixed",val:sharedStats.fixed,color:"#f97316"},{label:"Variable",val:sharedStats.variable,color:"#fb7185"}].map(s=>(
                  <div key={s.label} style={{textAlign:"center"}}>
                    <div style={{color:s.color,fontSize:10,fontWeight:700,textTransform:"uppercase"}}>{s.label}</div>
                    <div style={{fontWeight:800,fontSize:14,marginTop:2}}>{fmt(s.val)}</div>
                  </div>
                ))}
              </div>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,paddingBottom:16}}>
              {PROFILES.map(p=>{
                const ps=p.id==="roberto"?robertoStats:alexiaStats;
                const isActive=activeUser===p.id;
                return (
                  <div key={p.id} onClick={()=>setActiveUser(p.id)}
                    style={{background:isActive?p.color+"18":"#111827",border:`1px solid ${isActive?p.color:"#1e293b"}`,
                      borderRadius:16,padding:"12px 14px",cursor:"pointer",transition:"all .2s"}}>
                    <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
                      <Avatar profile={p} size={26} active={isActive}/>
                      <span style={{fontWeight:800,fontSize:14,color:isActive?p.color:"#94a3b8"}}>{p.name}</span>
                    </div>
                    <div style={{fontSize:18,fontWeight:900,color:ps.net>=0?"#4ade80":"#f87171"}}>{ps.net>=0?"+":""}{fmt(ps.net)}</div>
                    <div style={{fontSize:11,color:"#475569",marginTop:2}}>↑{fmt(ps.income)} ↓{fmt(ps.expenses)}</div>
                  </div>
                );
              })}
            </div>
          </div>
          <div style={{padding:"4px 16px 0"}}>
            {(sharedStats.fixed+sharedStats.variable)>0&&(
              <div style={{...cs.card,marginBottom:12}}>
                <div style={{display:"flex",justifyContent:"space-between",marginBottom:8}}>
                  <span style={{fontSize:13,fontWeight:700,color:"#94a3b8"}}>Expense Split</span>
                  <span style={{fontSize:13,fontWeight:700}}>{fmt(sharedStats.expenses)}</span>
                </div>
                <div style={{display:"flex",borderRadius:99,overflow:"hidden",height:8,gap:2}}>
                  {sharedStats.fixed>0&&<div style={{background:"#f97316",flex:sharedStats.fixed,minWidth:4}}/>}
                  {sharedStats.variable>0&&<div style={{background:"#fb7185",flex:sharedStats.variable,minWidth:4}}/>}
                </div>
                <div style={{display:"flex",gap:14,marginTop:8}}>
                  {[{c:"#f97316",l:`Fixed ${fmt(sharedStats.fixed)}`},{c:"#fb7185",l:`Variable ${fmt(sharedStats.variable)}`}].map(x=>(
                    <div key={x.l} style={{display:"flex",alignItems:"center",gap:5}}>
                      <div style={{width:7,height:7,borderRadius:2,background:x.c}}/>
                      <span style={{fontSize:11,color:"#64748b"}}>{x.l}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div style={{color:"#475569",fontSize:11,fontWeight:700,letterSpacing:".06em",textTransform:"uppercase",marginBottom:8}}>Recent</div>
            {data.txns.length===0
              ?<div style={{...cs.card,color:"#334155",textAlign:"center",fontSize:14,padding:24}}>No transactions yet — tap + to add one!</div>
              :data.txns.slice(0,6).map(t=>{
                const cat=getCat(t.catId),owner=getProfile(t.owner),isInc=t.kind==="income";
                return (
                  <div key={t.id} style={{...cs.card,padding:"10px 14px",display:"flex",alignItems:"center",gap:10}}>
                    <div style={{width:36,height:36,borderRadius:10,background:cat.color+"18",display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,flexShrink:0}}>{cat.icon}</div>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontSize:14,fontWeight:600,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{t.note||cat.label}</div>
                      <div style={{display:"flex",alignItems:"center",gap:6,marginTop:2}}>
                        <div style={{width:14,height:14,borderRadius:"50%",background:owner.color,display:"flex",alignItems:"center",justifyContent:"center",fontSize:8,fontWeight:800,color:"#0f172a"}}>{owner.avatar}</div>
                        <span style={{fontSize:11,color:"#334155"}}>{owner.name} · {t.date}</span>
                      </div>
                    </div>
                    <div style={{fontWeight:800,fontSize:14,color:isInc?"#4ade80":"#f87171",flexShrink:0}}>{isInc?"+":"-"}{fmt(t.amount)}</div>
                  </div>
                );
              })
            }
          </div>
        </div>
      )}

      {/* ADD */}
      {tab==="add"&&(
        <div style={{padding:"28px 18px 0"}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:20}}>
            <div style={{fontSize:24,fontWeight:900,letterSpacing:-0.5}}>Add Transaction</div>
            <div style={{display:"flex",gap:6,background:"#111827",borderRadius:99,padding:4,border:"1px solid #1e293b"}}>
              {PROFILES.map(p=>(
                <button key={p.id} onClick={()=>setActiveUser(p.id)}
                  style={{border:"none",background:activeUser===p.id?p.color:"transparent",
                    borderRadius:99,padding:"4px 10px",cursor:"pointer",
                    color:activeUser===p.id?"#0f172a":"#475569",fontWeight:700,fontSize:12,transition:"all .2s"}}>
                  {p.name}
                </button>
              ))}
            </div>
          </div>
          <div style={{display:"flex",background:"#111827",borderRadius:14,padding:4,marginBottom:16,gap:4,border:"1px solid #1e293b"}}>
            {[["expense","💸 Expense"],["income","💰 Income"]].map(([v,l])=>(
              <button key={v} style={{flex:1,border:"none",borderRadius:11,padding:"10px",cursor:"pointer",
                background:mode===v?(v==="income"?"#166534":"#7f1d1d"):"transparent",
                color:mode===v?"#fff":"#475569",fontWeight:700,fontSize:14,transition:"all .2s"}}
                onClick={()=>{setMode(v);setCatId(v==="income"?"job":"food");}}>
                {l}
              </button>
            ))}
          </div>
          {mode==="expense"&&(
            <div style={{display:"flex",gap:8,marginBottom:16}}>
              {[["fixed","🔒 Fixed"],["variable","〰 Variable"]].map(([v,l])=>(
                <button key={v} style={cs.pill(expType===v,v==="fixed"?"#f97316":"#fb7185")}
                  onClick={()=>{setExpType(v);setCatId(v==="fixed"?"rent":"food");}}>
                  {l}
                </button>
              ))}
            </div>
          )}
          <div style={{marginBottom:14}}>
            <label style={cs.lbl}>Amount</label>
            <div style={{position:"relative"}}>
              <span style={{position:"absolute",left:14,top:"50%",transform:"translateY(-50%)",color:"#475569",fontWeight:700,fontSize:22}}>$</span>
              <input style={{...cs.inp,paddingLeft:32,fontSize:26,fontWeight:800,textAlign:"center"}}
                type="number" placeholder="0" value={amount} onChange={e=>setAmount(e.target.value)}/>
            </div>
          </div>
          <div style={{marginBottom:14}}>
            <label style={cs.lbl}>Category</label>
            <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8}}>
              {availableCats.map(cat=>(
                <button key={cat.id} onClick={()=>setCatId(cat.id)} style={{
                  border:catId===cat.id?`2px solid ${cat.color}`:"1px solid #1e293b",
                  borderRadius:14,padding:"10px 6px",cursor:"pointer",
                  background:catId===cat.id?cat.color+"22":"#111827",
                  color:"#e2e8f0",fontSize:12,fontWeight:700,
                  display:"flex",flexDirection:"column",alignItems:"center",gap:4,transition:"all .2s"}}>
                  <span style={{fontSize:20}}>{cat.icon}</span>
                  <span>{cat.label.split(" ")[0]}</span>
                </button>
              ))}
            </div>
          </div>
          <div style={{marginBottom:14}}>
            <label style={cs.lbl}>Note (optional)</label>
            <input style={cs.inp} placeholder="e.g. Monthly rent" value={note} onChange={e=>setNote(e.target.value)}/>
          </div>
          <div style={{marginBottom:22}}>
            <label style={cs.lbl}>Date</label>
            <input style={cs.inp} type="date" value={date} onChange={e=>setDate(e.target.value)}/>
          </div>
          <button style={cs.bigBtn} onClick={addTxn}>Save for {getProfile(activeUser).name}</button>
        </div>
      )}

      {/* HISTORY */}
      {tab==="history"&&(
        <div style={{padding:"28px 18px 0"}}>
          <div style={{fontSize:24,fontWeight:900,letterSpacing:-0.5,marginBottom:14}}>History</div>
          <div style={{display:"flex",gap:8,marginBottom:10}}>
            <button style={cs.pill(personFilter==="both")} onClick={()=>setPersonFilter("both")}>Both</button>
            {PROFILES.map(p=>(
              <button key={p.id} style={cs.pill(personFilter===p.id,p.color)} onClick={()=>setPersonFilter(p.id)}>{p.name}</button>
            ))}
          </div>
          <div style={{display:"flex",gap:8,overflowX:"auto",paddingBottom:10,marginBottom:8}}>
            {[{id:"all",label:"All"},{id:"income",label:"Income"},{id:"fixed",label:"Fixed"},{id:"variable",label:"Variable"}].map(f=>(
              <button key={f.id} style={{...cs.pill(histFilter===f.id),flexShrink:0}} onClick={()=>setHistFilter(f.id)}>{f.label}</button>
            ))}
          </div>
          {filteredHist.length===0
            ?<div style={{...cs.card,color:"#334155",textAlign:"center",fontSize:14,padding:24}}>No transactions found</div>
            :filteredHist.map(t=>{
              const cat=getCat(t.catId),owner=getProfile(t.owner),isInc=t.kind==="income";
              return (
                <div key={t.id} style={{...cs.card,padding:"10px 14px",display:"flex",alignItems:"center",gap:10}}>
                  <div style={{width:36,height:36,borderRadius:10,background:cat.color+"18",display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,flexShrink:0}}>{cat.icon}</div>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:14,fontWeight:700,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{t.note||cat.label}</div>
                    <div style={{display:"flex",alignItems:"center",gap:5,marginTop:2}}>
                      <div style={{width:14,height:14,borderRadius:"50%",background:owner.color,display:"flex",alignItems:"center",justifyContent:"center",fontSize:8,fontWeight:800,color:"#0f172a"}}>{owner.avatar}</div>
                      <span style={{fontSize:11,color:"#334155"}}>{owner.name} · {t.date}</span>
                    </div>
                  </div>
                  <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:4}}>
                    <div style={{fontWeight:800,fontSize:14,color:isInc?"#4ade80":"#f87171"}}>{isInc?"+":"-"}{fmt(t.amount)}</div>
                    <button onClick={()=>delTxn(t.id)} style={{border:"none",background:"none",color:"#334155",cursor:"pointer",fontSize:13,padding:0}}>✕</button>
                  </div>
                </div>
              );
            })
          }
        </div>
      )}

      {/* GOALS */}
      {tab==="goals"&&(
        <div style={{padding:"28px 18px 0"}}>
          <div style={{fontSize:24,fontWeight:900,letterSpacing:-0.5,marginBottom:16}}>Shared Goals</div>
          <div style={cs.card}>
            <div style={{...cs.lbl,marginBottom:12}}>New Goal</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr auto",gap:8,marginBottom:8}}>
              <div><label style={cs.lbl}>Name</label><input style={cs.inp} placeholder="e.g. Europe trip" value={gName} onChange={e=>setGName(e.target.value)}/></div>
              <div><label style={cs.lbl}>Icon</label><input style={{...cs.inp,width:56,textAlign:"center",fontSize:22}} value={gIcon} onChange={e=>setGIcon(e.target.value)}/></div>
            </div>
            <div style={{marginBottom:10}}>
              <label style={cs.lbl}>Target ($)</label>
              <input style={cs.inp} type="number" placeholder="5000" value={gTarget} onChange={e=>setGTarget(e.target.value)}/>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:14}}>
              {PROFILES.map(p=>(
                <div key={p.id}>
                  <label style={{...cs.lbl,color:p.color}}>{p.name}'s share ($)</label>
                  <input style={{...cs.inp,borderColor:p.color+"44"}} type="number" placeholder="0"
                    value={gSaved[p.id]||""} onChange={e=>setGSaved(s=>({...s,[p.id]:e.target.value}))}/>
                </div>
              ))}
            </div>
            <button style={cs.bigBtn} onClick={addGoal}>Add Goal</button>
          </div>
          {data.goals.map(g=>{
            const totalSaved=(g.saved?.roberto||0)+(g.saved?.alexia||0);
            const pct=Math.min(100,Math.round((totalSaved/g.target)*100));
            const color=pct>=100?"#4ade80":pct>=60?"#818cf8":"#f97316";
            return (
              <div key={g.id} style={cs.card}>
                <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:12}}>
                  <div style={{position:"relative",flexShrink:0}}>
                    <ProgressRing pct={pct} color={color}/>
                    <div style={{position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center",fontSize:18}}>{g.icon}</div>
                  </div>
                  <div style={{flex:1}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                      <div style={{fontWeight:800,fontSize:15}}>{g.name}</div>
                      <button onClick={()=>delGoal(g.id)} style={{border:"none",background:"none",color:"#334155",cursor:"pointer",fontSize:15,padding:0}}>✕</button>
                    </div>
                    <div style={{color:"#475569",fontSize:12,marginTop:2}}>{fmt(totalSaved)} of {fmt(g.target)} · <span style={{color}}>{pct}%</span></div>
                  </div>
                </div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                  {PROFILES.map(p=>(
                    <div key={p.id}>
                      <label style={{...cs.lbl,color:p.color,marginBottom:4}}>{p.name}</label>
                      <input style={{...cs.inp,padding:"7px 10px",fontSize:13,borderColor:p.color+"44"}}
                        type="number" value={g.saved?.[p.id]||0} onChange={e=>updateGoalSaved(g.id,p.id,e.target.value)}/>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* SUMMARY */}
      {tab==="summary"&&(
        <div style={{padding:"28px 18px 0"}}>
          <div style={{fontSize:24,fontWeight:900,letterSpacing:-0.5,marginBottom:12}}>Summary</div>
          <div style={{display:"flex",gap:8,overflowX:"auto",paddingBottom:10,marginBottom:12}}>
            {Array.from({length:6},(_,i)=>{const d=new Date();d.setMonth(d.getMonth()-i);return d;}).map(d=>{
              const k=monthKey(d);
              return <button key={k} style={{...cs.pill(selMonth===k),flexShrink:0}} onClick={()=>setSelMonth(k)}>{MONTHS[d.getMonth()]} {d.getFullYear()}</button>;
            })}
          </div>
          <div style={{display:"flex",gap:8,marginBottom:12}}>
            <button style={cs.pill(personFilter==="both")} onClick={()=>setPersonFilter("both")}>Combined</button>
            {PROFILES.map(p=>(
              <button key={p.id} style={cs.pill(personFilter===p.id,p.color)} onClick={()=>setPersonFilter(p.id)}>{p.name}</button>
            ))}
          </div>
          {(()=>{
            const s=personFilter==="roberto"?robertoStats:personFilter==="alexia"?alexiaStats:sharedStats;
            return (
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:10}}>
                {[{label:"Income",val:s.income,color:"#4ade80"},{label:"Fixed",val:s.fixed,color:"#f97316"},
                  {label:"Variable",val:s.variable,color:"#fb7185"},{label:"Net",val:s.net,color:s.net>=0?"#4ade80":"#f87171"}].map(st=>(
                  <div key={st.label} style={{...cs.card,textAlign:"center",padding:"14px 10px"}}>
                    <div style={{color:"#475569",fontSize:11,fontWeight:700,textTransform:"uppercase",letterSpacing:".05em"}}>{st.label}</div>
                    <div style={{color:st.color,fontWeight:900,fontSize:20,marginTop:4,letterSpacing:-0.5}}>{fmt(st.val)}</div>
                  </div>
                ))}
              </div>
            );
          })()}
          <div style={cs.card}>
            <div style={{color:"#64748b",fontSize:12,fontWeight:700,textTransform:"uppercase",letterSpacing:".05em",marginBottom:14}}>Last 5 Months</div>
            <div style={{display:"flex",alignItems:"flex-end",gap:6,height:90}}>
              {barChartData.map((m,i)=>(
                <div key={i} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:3,height:"100%",justifyContent:"flex-end"}}>
                  <div style={{width:"100%",display:"flex",flexDirection:"column",gap:2,justifyContent:"flex-end"}}>
                    <div style={{background:"#4ade80",borderRadius:"4px 4px 0 0",height:`${(m.income/barMax)*72}px`,minHeight:2}}/>
                    <div style={{background:"#f87171",borderRadius:"4px 4px 0 0",height:`${(m.exp/barMax)*72}px`,minHeight:m.exp>0?2:0}}/>
                  </div>
                  <div style={{color:"#334155",fontSize:10,fontWeight:700}}>{m.label}</div>
                </div>
              ))}
            </div>
            <div style={{display:"flex",gap:16,marginTop:10}}>
              {[{c:"#4ade80",l:"Income"},{c:"#f87171",l:"Expenses"}].map(x=>(
                <div key={x.l} style={{display:"flex",alignItems:"center",gap:5}}>
                  <div style={{width:8,height:8,borderRadius:2,background:x.c}}/>
                  <span style={{fontSize:11,color:"#475569"}}>{x.l}</span>
                </div>
              ))}
            </div>
          </div>
          <div style={{color:"#475569",fontSize:11,fontWeight:700,letterSpacing:".06em",textTransform:"uppercase",marginBottom:8}}>By Category</div>
          {catBreakdown.length===0
            ?<div style={{...cs.card,color:"#334155",textAlign:"center",fontSize:14,padding:20}}>No expense data for this period</div>
            :catBreakdown.map(([cid,val])=>{
              const cat=getCat(cid);
              return (
                <div key={cid} style={{...cs.card,padding:"10px 14px"}}>
                  <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:6}}>
                    <span style={{fontSize:18}}>{cat.icon}</span>
                    <span style={{flex:1,fontSize:14,fontWeight:700}}>{cat.label}</span>
                    <span style={{fontWeight:800,fontSize:14}}>{fmt(val)}</span>
                  </div>
                  <Bar val={val} max={catBreakdown[0][1]} color={cat.color}/>
                </div>
              );
            })
          }
        </div>
      )}

      {/* IMPORT */}
      {tab==="import"&&(
        <div style={{padding:"28px 18px 0"}}>
          <div style={{fontSize:24,fontWeight:900,letterSpacing:-0.5,marginBottom:6}}>Import Statement</div>
          <div style={{color:"#475569",fontSize:14,marginBottom:20}}>Upload a CSV bank statement — AI will categorize and tag it automatically.</div>
          <div style={{...cs.card,marginBottom:16}}>
            <label style={cs.lbl}>Importing for</label>
            <div style={{display:"flex",gap:8}}>
              {PROFILES.map(p=>(
                <button key={p.id} style={{...cs.pill(activeUser===p.id,p.color),flex:1}} onClick={()=>setActiveUser(p.id)}>
                  {p.name}
                </button>
              ))}
            </div>
          </div>
          <input ref={fileRef} type="file" accept=".csv,.pdf" onChange={handleFile} style={{display:"none"}}/>
          <button style={cs.bigBtn} onClick={()=>fileRef.current?.click()}>📂 Choose Statement File</button>
          <div style={{...cs.card,marginTop:12,background:"#0c1a0c",border:"1px solid #14532d"}}>
            <div style={{fontWeight:700,fontSize:13,marginBottom:8,color:"#4ade80"}}>✓ How it works</div>
            {["Export CSV from Amex or BofA","Select whose statement it is","AI categorizes every transaction","Review, adjust, confirm — syncs to both devices"].map((s,i)=>(
              <div key={i} style={{display:"flex",gap:10,alignItems:"flex-start",marginBottom:6}}>
                <div style={{width:18,height:18,borderRadius:"50%",background:"#166534",display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,fontWeight:800,flexShrink:0,marginTop:1}}>{i+1}</div>
                <span style={{color:"#86efac",fontSize:13}}>{s}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Nav */}
      <nav style={cs.nav}>
        {[
          {id:"home",   icon:"⌂", label:"Home"},
          {id:"add",    icon:"+", label:"Add"},
          {id:"import", icon:"↑", label:"Import"},
          {id:"goals",  icon:"◎", label:"Goals"},
          {id:"summary",icon:"↗", label:"Summary"},
        ].map(n=>(
          <button key={n.id} style={cs.navBtn(tab===n.id)} onClick={()=>setTab(n.id)}>
            <span style={{fontSize:n.id==="add"?28:20,fontWeight:900,lineHeight:1}}>{n.icon}</span>
            <span style={{fontSize:10,fontWeight:600}}>{n.label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}
