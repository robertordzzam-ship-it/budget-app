import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import SEED_TXNS from "./transactions";

// ── Categories ────────────────────────────────────────────────────────────────
const INCOME_CATS = [
  { id:"job",       label:"Work",         icon:"💼", color:"#34d399" },
  { id:"other_inc", label:"Other Income", icon:"💡", color:"#a78bfa" },
];
const FIXED_CATS = [
  { id:"rent",       label:"Rent",             icon:"🏠", color:"#f97316" },
  { id:"utilities",  label:"Utilities",        icon:"⚡", color:"#facc15" },
  { id:"groceries",  label:"Groceries",        icon:"🛒", color:"#4ade80" },
  { id:"digital_subs",label:"Digital Subs",   icon:"💻", color:"#60a5fa" },
  { id:"gym",        label:"Gym",              icon:"🏋️", color:"#fb7185" },
  { id:"campestre",  label:"Campestre",        icon:"🏌️", color:"#86efac" },
];
const VARIABLE_CATS = [
  { id:"eating_out", label:"Eating & Dining",  icon:"🍜", color:"#f59e0b" },
  { id:"travel",     label:"Travel",           icon:"✈️", color:"#67e8f9" },
  { id:"sports",     label:"Sports & Fitness", icon:"🎾", color:"#c084fc" },
  { id:"transport",  label:"Transport",        icon:"🚇", color:"#38bdf8" },
  { id:"shopping",   label:"Shopping",         icon:"🛍️", color:"#e879f9" },
  { id:"social",     label:"Social & Events",  icon:"🎉", color:"#fbbf24" },
  { id:"mba",        label:"MBA / School",     icon:"🎓", color:"#818cf8" },
];
const ALL_CATS = [...INCOME_CATS, ...FIXED_CATS, ...VARIABLE_CATS];
const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const PROFILES = [
  { id:"roberto", name:"Roberto", color:"#818cf8", avatar:"R" },
  { id:"alexia",  name:"Alexia",  color:"#f0abfc", avatar:"A" },
];
const BANKS = ["AMEX","BofA","BBVA","Cash","Family"];
const FX_RATE = 18.5;
const MBA_END = new Date("2026-07-01");
const PIN = "9462"; // hashed would be better but this is client-side

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
function mbaMonthsLeft() {
  const now = new Date();
  return Math.max(0, Math.round((MBA_END - now) / (1000*60*60*24*30.5)));
}

const STORE = "padlans_budget_v1";
async function loadData() {
  try {
    if (window.storage) {
      const r = await window.storage.get(STORE, true);
      if (r?.value) return JSON.parse(r.value);
    }
  } catch {}
  try {
    const l = localStorage.getItem(STORE);
    if (l) return JSON.parse(l);
  } catch {}
  return null;
}
async function saveData(data) {
  try {
    if (window.storage) { await window.storage.set(STORE, JSON.stringify(data), true); return; }
  } catch {}
  try { localStorage.setItem(STORE, JSON.stringify(data)); } catch {}
}

function parseCSV(text) {
  const lines = text.trim().split("\n").filter(Boolean);
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map(h=>h.replace(/"/g,"").trim().toLowerCase());
  const find = (...keys) => { for(const k of keys){const i=headers.findIndex(h=>h.includes(k));if(i>=0)return i;} return -1; };
  const dateIdx=find("date","posted"), descIdx=find("description","merchant","memo"), amtIdx=find("amount","debit");
  return lines.slice(1).map(line=>{
    const cols=line.match(/(".*?"|[^,]+)/g)?.map(c=>c.replace(/"/g,"").trim())||[];
    const amt=parseFloat((cols[amtIdx]||"0").replace(/[$,\-]/g,""))||0;
    const desc=cols[descIdx]||"Unknown";
    let date=cols[dateIdx]||new Date().toISOString().split("T")[0];
    try{const p=new Date(date);if(!isNaN(p))date=p.toISOString().split("T")[0];}catch{}
    return {description:desc,amount:Math.abs(amt),date};
  }).filter(t=>t.amount>0&&t.description!=="Unknown");
}

async function aiCategorize(rawTxns) {
  const prompt = `Categorize each bank transaction into one of these categories:
INCOME (kind="income"): job, other_inc
FIXED (kind="fixed"): rent, utilities, groceries, digital_subs, gym, campestre
VARIABLE (kind="variable"): eating_out, travel, sports, transport, shopping, social, mba

Transactions:
${rawTxns.map((t,i)=>`${i}. "${t.description}" $${t.amount}`).join("\n")}

Return ONLY JSON array: [{"index":0,"catId":"eating_out","kind":"variable"}]`;
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages",{
      method:"POST", headers:{"Content-Type":"application/json"},
      body:JSON.stringify({model:"claude-sonnet-4-20250514",max_tokens:1000,messages:[{role:"user",content:prompt}]})
    });
    const data = await res.json();
    return JSON.parse((data.content?.[0]?.text||"[]").replace(/```json|```/g,"").trim());
  } catch { return rawTxns.map((_,i)=>({index:i,catId:"shopping",kind:"variable"})); }
}

// ── Sub-components ────────────────────────────────────────────────────────────
function Bar({val,max,color,height=6}) {
  const w=max>0?Math.min(100,(val/max)*100):0;
  return (
    <div style={{background:"#0f172a",borderRadius:99,height,flex:1}}>
      <div style={{background:color,borderRadius:99,height,width:`${w}%`,transition:"width .5s ease"}}/>
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
      fontSize:size*0.38,fontWeight:800,color:active?"#0f172a":profile.color,
      flexShrink:0,transition:"all .2s"}}>
      {profile.avatar}
    </div>
  );
}

// ── PIN Screen ────────────────────────────────────────────────────────────────
function PinScreen({onUnlock}) {
  const [entered, setEntered] = useState("");
  const [shake, setShake]     = useState(false);

  const press = (d) => {
    if (entered.length >= 4) return;
    const next = entered + d;
    setEntered(next);
    if (next.length === 4) {
      if (next === PIN) {
        setTimeout(() => onUnlock(), 200);
      } else {
        setShake(true);
        setTimeout(() => { setEntered(""); setShake(false); }, 600);
      }
    }
  };
  const del = () => setEntered(e => e.slice(0,-1));

  return (
    <div style={{maxWidth:430,margin:"0 auto",minHeight:"100vh",background:"#080e1a",
      display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",
      fontFamily:"'DM Sans','Segoe UI',sans-serif",gap:0}}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;600;700;800;900&display=swap');
        @keyframes shake{0%,100%{transform:translateX(0)}25%{transform:translateX(-8px)}75%{transform:translateX(8px)}}
      `}</style>
      <div style={{fontSize:36,marginBottom:12}}>💰</div>
      <div style={{fontSize:22,fontWeight:900,color:"#e2e8f0",marginBottom:4}}>Padlans Budget</div>
      <div style={{fontSize:13,color:"#475569",marginBottom:40}}>Enter your PIN to continue</div>

      {/* Dots */}
      <div style={{display:"flex",gap:16,marginBottom:48,
        animation:shake?"shake 0.4s ease":"none"}}>
        {[0,1,2,3].map(i=>(
          <div key={i} style={{width:14,height:14,borderRadius:"50%",
            background:entered.length>i?"#818cf8":"#1e293b",
            border:`2px solid ${entered.length>i?"#818cf8":"#334155"}`,
            transition:"all .15s"}}/>
        ))}
      </div>

      {/* Keypad */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(3,72px)",gap:12}}>
        {[1,2,3,4,5,6,7,8,9,"",0,"⌫"].map((k,i)=>(
          <button key={i} onClick={()=>k==="⌫"?del():k!==""?press(String(k)):null}
            style={{width:72,height:72,borderRadius:"50%",border:"none",
              background:k===""?"transparent":"#111827",
              color:"#e2e8f0",fontSize:k==="⌫"?20:24,fontWeight:700,
              cursor:k===""?"default":"pointer",
              transition:"background .15s",
              boxShadow:k!==""?"0 2px 8px rgba(0,0,0,.3)":"none"}}>
            {k}
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Main App ──────────────────────────────────────────────────────────────────
export default function App() {
  const [unlocked, setUnlocked] = useState(false);
  const [data, setData]         = useState(null);
  const [loaded, setLoaded]     = useState(false);
  const [syncing, setSyncing]   = useState(false);
  const [activeUser, setActiveUser] = useState("roberto");
  const [tab, setTab]           = useState("summary");
  const [selMonth, setSelMonth] = useState(monthKey());
  const [toast, setToast]       = useState(null);
  const [trueFlow, setTrueFlow] = useState(false);   // exclude family rent
  const [exclOneOff, setExclOneOff] = useState(false); // exclude one-off
  const [personFilter, setPersonFilter] = useState("both");
  const [histFilter, setHistFilter] = useState("all");
  const syncTimer = useRef(null);

  // add form
  const [mode, setMode]       = useState("expense");
  const [expType, setExpType] = useState("variable");
  const [amount, setAmount]   = useState("");
  const [currency, setCurrency] = useState("USD");
  const [catId, setCatId]     = useState("eating_out");
  const [note, setNote]       = useState("");
  const [date, setDate]       = useState(new Date().toISOString().split("T")[0]);
  const [bank, setBank]       = useState("AMEX");
  const [isOneOff, setIsOneOff] = useState(false);

  // goal form
  const [gName,setGName]     = useState("");
  const [gIcon,setGIcon]     = useState("🎯");
  const [gTarget,setGTarget] = useState("");
  const [gSaved,setGSaved]   = useState({roberto:0,alexia:0});

  // import
  const [importStep, setImportStep] = useState("idle");
  const [importRows, setImportRows] = useState([]);
  const [reviewRows, setReviewRows] = useState([]);
  const [importSource, setImportSource] = useState("");
  const fileRef = useRef();

  useEffect(() => {
    loadData().then(d => {
      if (d) { setData(d); }
      else {
        // First time — seed with transactions from Excel
        setData({ txns: SEED_TXNS, goals: [] });
      }
      setLoaded(true);
    });
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
    const iv = setInterval(async () => {
      const remote = await loadData();
      if (remote) setData(prev => JSON.stringify(remote)!==JSON.stringify(prev)?remote:prev);
    }, 15000);
    return () => clearInterval(iv);
  }, [loaded]);

  const showToast = (msg,err) => { setToast({msg,err}); setTimeout(()=>setToast(null),2600); };

  // ── Derived ───────────────────────────────────────────────────────────────
  const monthTxns = useMemo(()=>
    (data?.txns||[]).filter(t=>t.date.startsWith(selMonth)),
    [data?.txns,selMonth]);

  const filteredTxns = useMemo(()=>{
    let txns = monthTxns;
    if (trueFlow) txns = txns.filter(t=>!(t.catId==="rent"&&t.bank==="Family"));
    if (exclOneOff) txns = txns.filter(t=>!t.oneOff);
    return txns;
  },[monthTxns,trueFlow,exclOneOff]);

  const calcStats = useCallback((txns)=>{
    const income   = txns.filter(t=>t.kind==="income").reduce((s,t)=>s+t.amount,0);
    const fixed    = txns.filter(t=>t.kind==="fixed").reduce((s,t)=>s+t.amount,0);
    const variable = txns.filter(t=>t.kind==="variable").reduce((s,t)=>s+t.amount,0);
    const savings  = income > 0 ? Math.round(((income-fixed-variable)/income)*100) : 0;
    return {income,fixed,variable,expenses:fixed+variable,net:income-fixed-variable,savings};
  },[]);

  const sharedStats  = useMemo(()=>calcStats(filteredTxns),[filteredTxns,calcStats]);
  const robertoStats = useMemo(()=>calcStats(filteredTxns.filter(t=>t.owner==="roberto")),[filteredTxns,calcStats]);
  const alexiaStats  = useMemo(()=>calcStats(filteredTxns.filter(t=>t.owner==="alexia")),[filteredTxns,calcStats]);

  const catBreakdown = useMemo(()=>{
    const src = personFilter==="both"?filteredTxns:filteredTxns.filter(t=>t.owner===personFilter);
    const map={};
    src.filter(t=>t.kind!=="income").forEach(t=>{map[t.catId]=(map[t.catId]||0)+t.amount;});
    return Object.entries(map).sort((a,b)=>b[1]-a[1]);
  },[filteredTxns,personFilter]);

  // 6-month chart
  const sixMonthData = useMemo(()=>
    Array.from({length:6},(_,i)=>{
      const d=new Date(); d.setMonth(d.getMonth()-(5-i));
      const key=monthKey(d);
      const txns=(data?.txns||[]).filter(t=>t.date.startsWith(key));
      const income=txns.filter(t=>t.kind==="income").reduce((s,t)=>s+t.amount,0);
      const exp=txns.filter(t=>t.kind!=="income").reduce((s,t)=>s+t.amount,0);
      return {label:MONTHS[d.getMonth()],key,income,exp,net:income-exp};
    }),[data?.txns]);
  const barMax=Math.max(...sixMonthData.flatMap(d=>[d.income,d.exp]),1);

  // MBA runway
  const mbaMonths = mbaMonthsLeft();
  const currentCash = 90682; // from Hypothetical Balance sheet
  const maxMonthlySpend = mbaMonths > 0 ? Math.round(currentCash / mbaMonths) : 0;

  // ── Actions ───────────────────────────────────────────────────────────────
  const addTxn = () => {
    const amt = parseFloat(amount);
    if(!amt||isNaN(amt)) return showToast("Enter a valid amount",true);
    const usdAmt = currency==="MXN" ? parseFloat((amt/FX_RATE).toFixed(2)) : amt;
    const kind = mode==="income"?"income":expType;
    const txn = {
      id:Date.now(), kind, catId, amount:usdAmt, note, date, owner:activeUser,
      bank, currency, origAmount:amt, oneOff:isOneOff
    };
    persistData({...data,txns:[txn,...(data?.txns||[])]});
    setAmount(""); setNote(""); setIsOneOff(false);
    showToast("Saved!"); setTab("summary");
  };

  const delTxn = id => { persistData({...data,txns:(data?.txns||[]).filter(t=>t.id!==id)}); showToast("Deleted"); };

  const addGoal = () => {
    if(!gName||!gTarget) return showToast("Name and target required",true);
    persistData({...data,goals:[...(data?.goals||[]),{id:Date.now(),name:gName,icon:gIcon,target:+gTarget,saved:{roberto:+(gSaved.roberto||0),alexia:+(gSaved.alexia||0)}}]});
    setGName(""); setGIcon("🎯"); setGTarget(""); setGSaved({roberto:0,alexia:0});
    showToast("Goal added!");
  };
  const updateGoal = (id,person,val) =>
    persistData({...data,goals:(data?.goals||[]).map(g=>g.id===id?{...g,saved:{...g.saved,[person]:+val||0}}:g)});
  const delGoal = id => { persistData({...data,goals:(data?.goals||[]).filter(g=>g.id!==id)}); showToast("Removed"); };

  // Import
  const handleFile = async (e) => {
    const file=e.target.files?.[0]; if(!file) return;
    setImportSource(file.name); setImportStep("parsing");
    try {
      const text=await file.text();
      const raw=parseCSV(text);
      if(!raw.length){showToast("Couldn't parse file",true);setImportStep("idle");return;}
      setImportRows(raw); setImportStep("categorizing");
      const batches=[];
      for(let i=0;i<raw.length;i+=30)batches.push(raw.slice(i,i+30));
      const allCats=[];
      for(const b of batches){const c=await aiCategorize(b);allCats.push(...c);}
      setReviewRows(raw.map((t,i)=>{
        const ai=allCats.find(c=>c.index===i)||{catId:"shopping",kind:"variable"};
        return {...t,catId:ai.catId,kind:ai.kind,selected:true,id:Date.now()+i,owner:activeUser,bank,currency:"USD",origAmount:t.amount,oneOff:false};
      }));
      setImportStep("reviewing");
    } catch(err){showToast("Error: "+err.message,true);setImportStep("idle");}
    e.target.value="";
  };
  const confirmImport = () => {
    const toAdd=reviewRows.filter(r=>r.selected).map(r=>({id:r.id,kind:r.kind,catId:r.catId,amount:r.amount,note:r.description,date:r.date,owner:r.owner,bank:r.bank,currency:r.currency,origAmount:r.origAmount,oneOff:r.oneOff}));
    persistData({...data,txns:[...toAdd,...(data?.txns||[])]});
    showToast(`${toAdd.length} transactions imported!`);
    setImportStep("idle");setReviewRows([]);setTab("summary");
  };

  const availableCats = mode==="income"?INCOME_CATS:expType==="fixed"?FIXED_CATS:VARIABLE_CATS;
  const filteredHist = (data?.txns||[])
    .filter(t=>histFilter==="all"||t.kind===histFilter)
    .filter(t=>personFilter==="both"||t.owner===personFilter)
    .slice(0,100);

  // ── Styles ────────────────────────────────────────────────────────────────
  const cs = {
    wrap:{maxWidth:430,margin:"0 auto",minHeight:"100vh",background:"#080e1a",
      color:"#e2e8f0",fontFamily:"'DM Sans','Segoe UI',sans-serif",paddingBottom:88},
    card:{background:"#111827",border:"1px solid #1e293b",borderRadius:20,padding:"16px 18px",marginBottom:10},
    inp:{width:"100%",background:"#0c1626",border:"1px solid #1e293b",borderRadius:14,
      padding:"11px 14px",color:"#e2e8f0",fontSize:15,outline:"none",boxSizing:"border-box"},
    lbl:{color:"#64748b",fontSize:11,fontWeight:700,letterSpacing:".05em",textTransform:"uppercase",marginBottom:6,display:"block"},
    pill:(on,bg="#6366f1")=>({border:on?"none":"1px solid #1e293b",borderRadius:99,padding:"7px 16px",
      background:on?bg:"#111827",color:on?"#fff":"#475569",fontWeight:700,fontSize:13,cursor:"pointer",transition:"all .2s",whiteSpace:"nowrap"}),
    bigBtn:{width:"100%",background:"linear-gradient(135deg,#6366f1,#a855f7)",border:"none",
      borderRadius:16,padding:15,color:"#fff",fontWeight:800,fontSize:16,cursor:"pointer"},
    nav:{position:"fixed",bottom:0,left:"50%",transform:"translateX(-50%)",width:"100%",maxWidth:430,
      background:"#0c1220",borderTop:"1px solid #1e293b",display:"flex",zIndex:100},
    navBtn:on=>({flex:1,border:"none",background:"none",cursor:"pointer",padding:"10px 0 8px",
      display:"flex",flexDirection:"column",alignItems:"center",gap:3,
      color:on?"#818cf8":"#334155",transition:"color .2s"}),
    toggle:(on)=>({border:"none",borderRadius:99,padding:"5px 12px",cursor:"pointer",
      background:on?"#1e3a5f":"#111827",color:on?"#60a5fa":"#475569",
      fontSize:12,fontWeight:700,border:`1px solid ${on?"#1e3a5f":"#1e293b"}`,transition:"all .2s"}),
  };

  if (!unlocked) return <PinScreen onUnlock={()=>setUnlocked(true)}/>;
  if (!loaded || !data) return (
    <div style={{...cs.wrap,display:"flex",alignItems:"center",justifyContent:"center",flexDirection:"column",gap:12}}>
      <div style={{fontSize:36}}>💰</div>
      <div style={{fontWeight:800}}>Loading your budget…</div>
    </div>
  );

  return (
    <div style={cs.wrap}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800;900&display=swap');
        *{-webkit-tap-highlight-color:transparent;box-sizing:border-box;}
        input[type=number]::-webkit-inner-spin-button{-webkit-appearance:none;}
        input::placeholder{color:#334155;}
        ::-webkit-scrollbar{display:none;}
        @keyframes pulse{0%,100%{transform:scale(1);opacity:.4}50%{transform:scale(1.4);opacity:1}}
        select option{background:#111827;}
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
        <div style={{position:"fixed",top:20,right:20,background:"#111827",border:"1px solid #334155",
          color:"#6366f1",padding:"5px 10px",borderRadius:99,zIndex:998,fontSize:11,fontWeight:700}}>↑</div>
      )}

      {/* ── IMPORT OVERLAY ─────────────────────────────────────────────── */}
      {(importStep==="parsing"||importStep==="categorizing"||importStep==="reviewing")&&(
        <div style={{position:"fixed",inset:0,background:"#080e1a",zIndex:200,overflowY:"auto",maxWidth:430,margin:"0 auto"}}>
          <div style={{padding:"28px 18px"}}>
            <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:20}}>
              <button onClick={()=>{setImportStep("idle");setReviewRows([]);}}
                style={{border:"none",background:"#111827",color:"#94a3b8",borderRadius:10,padding:"6px 12px",cursor:"pointer",fontSize:13}}>← Back</button>
              <div style={{fontSize:18,fontWeight:900}}>Import for {getProfile(activeUser).name}</div>
            </div>
            {(importStep==="parsing"||importStep==="categorizing")&&(
              <div style={{textAlign:"center",padding:"60px 20px"}}>
                <div style={{fontSize:40,marginBottom:16}}>{importStep==="parsing"?"📄":"🤖"}</div>
                <div style={{fontWeight:700,fontSize:18,marginBottom:8}}>
                  {importStep==="parsing"?"Reading…":"AI categorizing…"}
                </div>
                <div style={{color:"#475569",fontSize:14}}>{importStep==="categorizing"?`${importRows.length} transactions found`:""}</div>
                <div style={{marginTop:24,display:"flex",justifyContent:"center",gap:6}}>
                  {[0,1,2].map(i=><div key={i} style={{width:8,height:8,borderRadius:"50%",background:"#6366f1",animation:`pulse 1.2s ${i*0.2}s infinite`}}/>)}
                </div>
              </div>
            )}
            {importStep==="reviewing"&&(
              <>
                <div style={{...cs.card,background:"#0c1a2e",border:"1px solid #1e3a5f",marginBottom:12}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                    <div>
                      <div style={{fontWeight:700,fontSize:13}}>📁 {importSource}</div>
                      <div style={{color:"#475569",fontSize:12,marginTop:2}}>{reviewRows.filter(r=>r.selected).length} of {reviewRows.length} selected</div>
                    </div>
                    <div style={{display:"flex",gap:6}}>
                      {PROFILES.map(p=>(
                        <button key={p.id} onClick={()=>setReviewRows(r=>r.map(x=>({...x,owner:p.id})))}
                          style={{...cs.pill(reviewRows[0]?.owner===p.id,p.color),padding:"4px 10px",fontSize:11}}>{p.name}</button>
                      ))}
                    </div>
                  </div>
                </div>
                {reviewRows.map((row,i)=>{
                  const cat=getCat(row.catId),owner=getProfile(row.owner);
                  return (
                    <div key={row.id} style={{...cs.card,padding:"10px 12px",opacity:row.selected?1:0.4}}>
                      <div style={{display:"flex",alignItems:"center",gap:8}}>
                        <input type="checkbox" checked={row.selected}
                          onChange={()=>setReviewRows(r=>r.map((x,j)=>j===i?{...x,selected:!x.selected}:x))}
                          style={{width:16,height:16,accentColor:"#6366f1",cursor:"pointer",flexShrink:0}}/>
                        <div style={{width:30,height:30,borderRadius:8,background:cat.color+"18",display:"flex",alignItems:"center",justifyContent:"center",fontSize:15,flexShrink:0}}>{cat.icon}</div>
                        <div style={{flex:1,minWidth:0}}>
                          <div style={{fontSize:12,fontWeight:700,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{row.description}</div>
                          <div style={{display:"flex",gap:6,marginTop:3,flexWrap:"wrap"}}>
                            <select value={row.catId} onChange={e=>{const nc=e.target.value;const nk=INCOME_CATS.find(c=>c.id===nc)?"income":FIXED_CATS.find(c=>c.id===nc)?"fixed":"variable";setReviewRows(r=>r.map((x,j)=>j===i?{...x,catId:nc,kind:nk}:x));}}
                              style={{background:"#0c1626",border:"1px solid #1e293b",borderRadius:6,color:"#94a3b8",fontSize:10,padding:"2px 4px",cursor:"pointer",outline:"none"}}>
                              <optgroup label="Income">{INCOME_CATS.map(c=><option key={c.id} value={c.id}>{c.label}</option>)}</optgroup>
                              <optgroup label="Fixed">{FIXED_CATS.map(c=><option key={c.id} value={c.id}>{c.label}</option>)}</optgroup>
                              <optgroup label="Variable">{VARIABLE_CATS.map(c=><option key={c.id} value={c.id}>{c.label}</option>)}</optgroup>
                            </select>
                            <select value={row.owner} onChange={e=>setReviewRows(r=>r.map((x,j)=>j===i?{...x,owner:e.target.value}:x))}
                              style={{background:"#0c1626",border:`1px solid ${owner.color}44`,borderRadius:6,color:owner.color,fontSize:10,padding:"2px 4px",cursor:"pointer",outline:"none"}}>
                              {PROFILES.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}
                            </select>
                          </div>
                        </div>
                        <div style={{fontWeight:800,fontSize:13,color:row.kind==="income"?"#4ade80":"#f87171",flexShrink:0}}>
                          {row.kind==="income"?"+":"-"}${row.amount}
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

      {/* ── SUMMARY (Hero) ─────────────────────────────────────────────── */}
      {tab==="summary"&&(
        <div>
          {/* Header */}
          <div style={{padding:"24px 18px 0",background:"linear-gradient(180deg,#0c1626 0%,#080e1a 100%)"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
              <div>
                <div style={{color:"#475569",fontSize:11,fontWeight:700,letterSpacing:".07em",textTransform:"uppercase"}}>Family Budget</div>
                <div style={{fontSize:26,fontWeight:900,letterSpacing:-1,marginTop:2}}>Summary</div>
              </div>
              {/* Profile switcher */}
              <div style={{display:"flex",gap:6,background:"#111827",borderRadius:99,padding:4,border:"1px solid #1e293b"}}>
                {PROFILES.map(p=>(
                  <button key={p.id} onClick={()=>setActiveUser(p.id)}
                    style={{border:"none",background:activeUser===p.id?p.color:"transparent",borderRadius:99,
                      padding:"4px 12px",cursor:"pointer",color:activeUser===p.id?"#0f172a":"#475569",fontWeight:700,fontSize:12,transition:"all .2s"}}>
                    {p.name}
                  </button>
                ))}
              </div>
            </div>

            {/* 6-month selector */}
            <div style={{display:"flex",gap:8,overflowX:"auto",paddingBottom:12}}>
              {sixMonthData.map(m=>(
                <button key={m.key} style={{...cs.pill(selMonth===m.key),flexShrink:0,padding:"5px 14px",fontSize:12}}
                  onClick={()=>setSelMonth(m.key)}>{m.label}</button>
              ))}
            </div>
          </div>

          <div style={{padding:"8px 16px 0"}}>
            {/* Toggles */}
            <div style={{display:"flex",gap:8,marginBottom:12,flexWrap:"wrap"}}>
              <button style={cs.toggle(trueFlow)} onClick={()=>setTrueFlow(v=>!v)}>True Cash Flow</button>
              <button style={cs.toggle(exclOneOff)} onClick={()=>setExclOneOff(v=>!v)}>Excl. One-offs</button>
              <button style={cs.toggle(personFilter==="roberto")} onClick={()=>setPersonFilter(v=>v==="roberto"?"both":"roberto")}>Roberto only</button>
              <button style={cs.toggle(personFilter==="alexia")} onClick={()=>setPersonFilter(v=>v==="alexia"?"both":"alexia")}>Alexia only</button>
            </div>

            {/* MBA Runway card */}
            <div style={{...cs.card,background:"linear-gradient(135deg,#1e1b4b,#312e81)",border:"1px solid #4338ca",marginBottom:12}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <div>
                  <div style={{color:"#a5b4fc",fontSize:11,fontWeight:700,textTransform:"uppercase",letterSpacing:".05em"}}>🎓 MBA Runway</div>
                  <div style={{fontSize:28,fontWeight:900,marginTop:4,letterSpacing:-1}}>{mbaMonths} <span style={{fontSize:14,fontWeight:600,color:"#818cf8"}}>months left</span></div>
                  <div style={{color:"#818cf8",fontSize:12,marginTop:4}}>Max to spend: <span style={{color:"white",fontWeight:800}}>{fmt(maxMonthlySpend)}/mo</span></div>
                </div>
                <div style={{textAlign:"right"}}>
                  <div style={{color:"#a5b4fc",fontSize:11,fontWeight:700,textTransform:"uppercase"}}>Cash Available</div>
                  <div style={{fontSize:22,fontWeight:900,color:"#4ade80",marginTop:4}}>{fmt(currentCash)}</div>
                </div>
              </div>
            </div>

            {/* Net + stats */}
            <div style={{...cs.card,background:sharedStats.net>=0?"linear-gradient(135deg,#064e3b,#065f46)":"linear-gradient(135deg,#7f1d1d,#991b1b)",border:"none",marginBottom:10}}>
              <div style={{color:"#a7f3d0",fontSize:11,fontWeight:700,textTransform:"uppercase",letterSpacing:".05em"}}>Net Balance</div>
              <div style={{fontSize:36,fontWeight:900,letterSpacing:-1}}>{sharedStats.net>=0?"+":""}{fmt(sharedStats.net)}</div>
              {sharedStats.income>0&&(
                <div style={{color:"#86efac",fontSize:12,marginTop:4}}>Savings rate: <span style={{color:"white",fontWeight:800}}>{sharedStats.savings}%</span></div>
              )}
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,marginTop:12}}>
                {[{l:"Income",v:sharedStats.income,c:"#4ade80"},{l:"Fixed",v:sharedStats.fixed,c:"#f97316"},{l:"Variable",v:sharedStats.variable,c:"#fb7185"}].map(s=>(
                  <div key={s.l} style={{textAlign:"center"}}>
                    <div style={{color:s.c,fontSize:10,fontWeight:700,textTransform:"uppercase"}}>{s.l}</div>
                    <div style={{fontWeight:800,fontSize:15,marginTop:2}}>{fmt(s.v)}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Per-person cards */}
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:10}}>
              {PROFILES.map(p=>{
                const ps=p.id==="roberto"?robertoStats:alexiaStats;
                const isAct=activeUser===p.id;
                return (
                  <div key={p.id} onClick={()=>setActiveUser(p.id)}
                    style={{...cs.card,background:isAct?p.color+"18":"#111827",border:`1px solid ${isAct?p.color:"#1e293b"}`,cursor:"pointer",marginBottom:0}}>
                    <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
                      <Avatar profile={p} size={24} active={isAct}/>
                      <span style={{fontWeight:800,fontSize:13,color:isAct?p.color:"#94a3b8"}}>{p.name}</span>
                    </div>
                    <div style={{fontSize:18,fontWeight:900,color:ps.net>=0?"#4ade80":"#f87171"}}>{ps.net>=0?"+":""}{fmt(ps.net)}</div>
                    <div style={{fontSize:11,color:"#475569",marginTop:2}}>↑{fmt(ps.income)} ↓{fmt(ps.expenses)}</div>
                  </div>
                );
              })}
            </div>

            {/* Fixed vs variable bar */}
            {(sharedStats.fixed+sharedStats.variable)>0&&(
              <div style={{...cs.card,marginBottom:10}}>
                <div style={{display:"flex",justifyContent:"space-between",marginBottom:8}}>
                  <span style={{fontSize:13,fontWeight:700,color:"#94a3b8"}}>Expense Split</span>
                  <span style={{fontSize:13,fontWeight:700}}>{fmt(sharedStats.expenses)}</span>
                </div>
                <div style={{display:"flex",borderRadius:99,overflow:"hidden",height:10,gap:2,marginBottom:8}}>
                  {sharedStats.fixed>0&&<div style={{background:"#f97316",flex:sharedStats.fixed,minWidth:4}}/>}
                  {sharedStats.variable>0&&<div style={{background:"#fb7185",flex:sharedStats.variable,minWidth:4}}/>}
                </div>
                <div style={{display:"flex",gap:14}}>
                  {[{c:"#f97316",l:`Fixed ${fmt(sharedStats.fixed)}`},{c:"#fb7185",l:`Variable ${fmt(sharedStats.variable)}`}].map(x=>(
                    <div key={x.l} style={{display:"flex",alignItems:"center",gap:5}}>
                      <div style={{width:7,height:7,borderRadius:2,background:x.c}}/>
                      <span style={{fontSize:11,color:"#64748b"}}>{x.l}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 6-month bar chart */}
            <div style={cs.card}>
              <div style={{color:"#64748b",fontSize:11,fontWeight:700,textTransform:"uppercase",letterSpacing:".05em",marginBottom:14}}>6-Month Overview</div>
              <div style={{display:"flex",alignItems:"flex-end",gap:4,height:100}}>
                {sixMonthData.map((m,i)=>{
                  const isSelected = m.key===selMonth;
                  return (
                    <div key={i} onClick={()=>setSelMonth(m.key)}
                      style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:3,height:"100%",justifyContent:"flex-end",cursor:"pointer"}}>
                      <div style={{width:"100%",display:"flex",flexDirection:"column",gap:1,justifyContent:"flex-end"}}>
                        <div style={{background:isSelected?"#4ade80":"#1e4d35",borderRadius:"3px 3px 0 0",height:`${(m.income/barMax)*80}px`,minHeight:m.income>0?2:0,transition:"height .5s"}}/>
                        <div style={{background:isSelected?"#f87171":"#4c1d1d",borderRadius:"3px 3px 0 0",height:`${(m.exp/barMax)*80}px`,minHeight:m.exp>0?2:0,transition:"height .5s"}}/>
                      </div>
                      <div style={{color:isSelected?"#e2e8f0":"#334155",fontSize:10,fontWeight:700}}>{m.label}</div>
                    </div>
                  );
                })}
              </div>
              <div style={{display:"flex",gap:14,marginTop:10}}>
                {[{c:"#4ade80",l:"Income"},{c:"#f87171",l:"Expenses"}].map(x=>(
                  <div key={x.l} style={{display:"flex",alignItems:"center",gap:5}}>
                    <div style={{width:7,height:7,borderRadius:2,background:x.c}}/>
                    <span style={{fontSize:11,color:"#475569"}}>{x.l}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Category breakdown */}
            <div style={{color:"#475569",fontSize:11,fontWeight:700,letterSpacing:".06em",textTransform:"uppercase",marginBottom:8}}>By Category</div>
            {catBreakdown.length===0
              ?<div style={{...cs.card,color:"#334155",textAlign:"center",fontSize:14,padding:20}}>No data for this period</div>
              :catBreakdown.map(([cid,val])=>{
                const cat=getCat(cid);
                return (
                  <div key={cid} style={{...cs.card,padding:"10px 14px"}}>
                    <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:5}}>
                      <span style={{fontSize:18}}>{cat.icon}</span>
                      <span style={{flex:1,fontSize:13,fontWeight:700}}>{cat.label}</span>
                      <span style={{fontWeight:800,fontSize:13}}>{fmt(val)}</span>
                    </div>
                    <Bar val={val} max={catBreakdown[0][1]} color={cat.color}/>
                  </div>
                );
              })
            }
          </div>
        </div>
      )}

      {/* ── HOME (Recent + quick stats) ────────────────────────────────── */}
      {tab==="home"&&(
        <div>
          <div style={{padding:"24px 18px 0",background:"linear-gradient(180deg,#0c1626 0%,#080e1a 100%)"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
              <div>
                <div style={{color:"#475569",fontSize:11,fontWeight:700,letterSpacing:".07em",textTransform:"uppercase"}}>{MONTHS[new Date().getMonth()]} {new Date().getFullYear()}</div>
                <div style={{fontSize:26,fontWeight:900,letterSpacing:-1,marginTop:2}}>Overview</div>
              </div>
              <div style={{display:"flex",gap:6,background:"#111827",borderRadius:99,padding:4,border:"1px solid #1e293b"}}>
                {PROFILES.map(p=>(
                  <button key={p.id} onClick={()=>setActiveUser(p.id)}
                    style={{border:"none",background:activeUser===p.id?p.color:"transparent",borderRadius:99,padding:"4px 12px",cursor:"pointer",color:activeUser===p.id?"#0f172a":"#475569",fontWeight:700,fontSize:12,transition:"all .2s"}}>
                    {p.name}
                  </button>
                ))}
              </div>
            </div>

            {/* This month quick stats */}
            {(()=>{
              const thisMonth = monthKey();
              const thisTxns = (data?.txns||[]).filter(t=>t.date.startsWith(thisMonth));
              const s = calcStats(thisTxns);
              return (
                <div style={{background:"#111827",border:"1px solid #1e293b",borderRadius:20,padding:"14px 16px",marginTop:14,marginBottom:0}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
                    <div style={{color:"#475569",fontSize:11,fontWeight:700,textTransform:"uppercase",letterSpacing:".05em"}}>This Month</div>
                    <div style={{fontWeight:900,fontSize:18,color:s.net>=0?"#4ade80":"#f87171"}}>{s.net>=0?"+":""}{fmt(s.net)}</div>
                  </div>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:6}}>
                    {[{l:"Income",v:s.income,c:"#4ade80"},{l:"Fixed",v:s.fixed,c:"#f97316"},{l:"Variable",v:s.variable,c:"#fb7185"}].map(st=>(
                      <div key={st.l} style={{background:"#0c1626",borderRadius:12,padding:"8px 10px",textAlign:"center"}}>
                        <div style={{color:st.c,fontSize:10,fontWeight:700,textTransform:"uppercase"}}>{st.l}</div>
                        <div style={{fontWeight:800,fontSize:14,marginTop:2}}>{fmt(st.v)}</div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}

            {/* MBA mini card */}
            <div style={{background:"#111827",border:"1px solid #312e81",borderRadius:16,padding:"10px 14px",marginTop:10,marginBottom:0,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <div style={{color:"#818cf8",fontSize:12,fontWeight:700}}>🎓 {mbaMonths} months to graduation</div>
              <div style={{color:"#a5b4fc",fontSize:12,fontWeight:700}}>Max {fmt(maxMonthlySpend)}/mo</div>
            </div>
          </div>

          <div style={{padding:"10px 16px 0"}}>
            <div style={{color:"#475569",fontSize:11,fontWeight:700,letterSpacing:".06em",textTransform:"uppercase",marginBottom:8}}>Recent Transactions</div>
            {(data?.txns||[]).slice(0,8).map(t=>{
              const cat=getCat(t.catId),owner=getProfile(t.owner),isInc=t.kind==="income";
              return (
                <div key={t.id} style={{...cs.card,padding:"10px 12px",display:"flex",alignItems:"center",gap:10}}>
                  <div style={{width:36,height:36,borderRadius:10,background:cat.color+"18",display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,flexShrink:0}}>{cat.icon}</div>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:13,fontWeight:600,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{t.note||cat.label}</div>
                    <div style={{display:"flex",alignItems:"center",gap:5,marginTop:2}}>
                      <div style={{width:13,height:13,borderRadius:"50%",background:owner.color,display:"flex",alignItems:"center",justifyContent:"center",fontSize:7,fontWeight:800,color:"#0f172a"}}>{owner.avatar}</div>
                      <span style={{fontSize:11,color:"#334155"}}>{owner.name} · {t.date} · {t.bank||"AMEX"}</span>
                      {t.oneOff&&<span style={{fontSize:9,background:"#7f1d1d",color:"#fca5a5",borderRadius:4,padding:"1px 4px"}}>1x</span>}
                    </div>
                  </div>
                  <div style={{fontWeight:800,fontSize:13,color:isInc?"#4ade80":"#f87171",flexShrink:0,textAlign:"right"}}>
                    {isInc?"+":"-"}{fmt(t.amount)}
                    {t.currency==="MXN"&&<div style={{fontSize:10,color:"#475569"}}>{t.origAmount?.toLocaleString()} MXN</div>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── ADD ────────────────────────────────────────────────────────── */}
      {tab==="add"&&(
        <div style={{padding:"28px 18px 0"}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:20}}>
            <div style={{fontSize:22,fontWeight:900,letterSpacing:-0.5}}>Add Transaction</div>
            <div style={{display:"flex",gap:6,background:"#111827",borderRadius:99,padding:4,border:"1px solid #1e293b"}}>
              {PROFILES.map(p=>(
                <button key={p.id} onClick={()=>setActiveUser(p.id)}
                  style={{border:"none",background:activeUser===p.id?p.color:"transparent",borderRadius:99,padding:"4px 10px",cursor:"pointer",color:activeUser===p.id?"#0f172a":"#475569",fontWeight:700,fontSize:12,transition:"all .2s"}}>
                  {p.name}
                </button>
              ))}
            </div>
          </div>

          {/* Income/Expense */}
          <div style={{display:"flex",background:"#111827",borderRadius:14,padding:4,marginBottom:14,gap:4,border:"1px solid #1e293b"}}>
            {[["expense","💸 Expense"],["income","💰 Income"]].map(([v,l])=>(
              <button key={v} style={{flex:1,border:"none",borderRadius:11,padding:"10px",cursor:"pointer",
                background:mode===v?(v==="income"?"#166534":"#7f1d1d"):"transparent",
                color:mode===v?"#fff":"#475569",fontWeight:700,fontSize:14,transition:"all .2s"}}
                onClick={()=>{setMode(v);setCatId(v==="income"?"job":"eating_out");}}>
                {l}
              </button>
            ))}
          </div>

          {/* Fixed/Variable */}
          {mode==="expense"&&(
            <div style={{display:"flex",gap:8,marginBottom:14}}>
              {[["fixed","🔒 Fixed"],["variable","〰 Variable"]].map(([v,l])=>(
                <button key={v} style={cs.pill(expType===v,v==="fixed"?"#f97316":"#fb7185")}
                  onClick={()=>{setExpType(v);setCatId(v==="fixed"?"rent":"eating_out");}}>
                  {l}
                </button>
              ))}
            </div>
          )}

          {/* Amount + currency */}
          <div style={{marginBottom:14}}>
            <label style={cs.lbl}>Amount</label>
            <div style={{display:"flex",gap:8}}>
              <div style={{position:"relative",flex:1}}>
                <span style={{position:"absolute",left:12,top:"50%",transform:"translateY(-50%)",color:"#475569",fontWeight:700,fontSize:20}}>{currency==="USD"?"$":"$"}</span>
                <input style={{...cs.inp,paddingLeft:30,fontSize:24,fontWeight:800,textAlign:"center"}}
                  type="number" placeholder="0" value={amount} onChange={e=>setAmount(e.target.value)}/>
              </div>
              <div style={{display:"flex",background:"#111827",borderRadius:12,padding:3,border:"1px solid #1e293b",gap:3}}>
                {["USD","MXN"].map(c=>(
                  <button key={c} style={{border:"none",borderRadius:9,padding:"6px 10px",cursor:"pointer",
                    background:currency===c?"#1e293b":"transparent",color:currency===c?"#e2e8f0":"#475569",fontWeight:700,fontSize:12,transition:"all .2s"}}
                    onClick={()=>setCurrency(c)}>{c}</button>
                ))}
              </div>
            </div>
            {currency==="MXN"&&amount&&!isNaN(parseFloat(amount))&&(
              <div style={{color:"#64748b",fontSize:12,marginTop:4,paddingLeft:4}}>≈ {fmt(parseFloat(amount)/FX_RATE)} USD</div>
            )}
          </div>

          {/* Categories */}
          <div style={{marginBottom:14}}>
            <label style={cs.lbl}>Category</label>
            <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8}}>
              {availableCats.map(cat=>(
                <button key={cat.id} onClick={()=>setCatId(cat.id)} style={{
                  border:catId===cat.id?`2px solid ${cat.color}`:"1px solid #1e293b",
                  borderRadius:14,padding:"8px 4px",cursor:"pointer",
                  background:catId===cat.id?cat.color+"22":"#111827",
                  color:"#e2e8f0",fontSize:11,fontWeight:700,
                  display:"flex",flexDirection:"column",alignItems:"center",gap:3,transition:"all .2s"}}>
                  <span style={{fontSize:18}}>{cat.icon}</span>
                  <span style={{textAlign:"center",lineHeight:1.2}}>{cat.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Note */}
          <div style={{marginBottom:12}}>
            <label style={cs.lbl}>Note (optional)</label>
            <input style={cs.inp} placeholder="e.g. Trader Joe's run" value={note} onChange={e=>setNote(e.target.value)}/>
          </div>

          {/* Date + Bank */}
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:12}}>
            <div>
              <label style={cs.lbl}>Date</label>
              <input style={cs.inp} type="date" value={date} onChange={e=>setDate(e.target.value)}/>
            </div>
            <div>
              <label style={cs.lbl}>Bank</label>
              <select value={bank} onChange={e=>setBank(e.target.value)}
                style={{...cs.inp,cursor:"pointer"}}>
                {BANKS.map(b=><option key={b} value={b}>{b}</option>)}
              </select>
            </div>
          </div>

          {/* One-off toggle */}
          <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:22,...cs.card,padding:"12px 14px"}}>
            <input type="checkbox" id="oneoff" checked={isOneOff} onChange={e=>setIsOneOff(e.target.checked)}
              style={{width:18,height:18,accentColor:"#6366f1",cursor:"pointer"}}/>
            <label htmlFor="oneoff" style={{cursor:"pointer",flex:1}}>
              <div style={{fontSize:14,fontWeight:700}}>One-off transaction</div>
              <div style={{fontSize:12,color:"#475569"}}>Exclude from monthly run rate (e.g. wedding, trip)</div>
            </label>
          </div>

          <button style={cs.bigBtn} onClick={addTxn}>Save for {getProfile(activeUser).name}</button>
        </div>
      )}

      {/* ── HISTORY ─────────────────────────────────────────────────────── */}
      {tab==="history"&&(
        <div style={{padding:"28px 18px 0"}}>
          <div style={{fontSize:22,fontWeight:900,letterSpacing:-0.5,marginBottom:14}}>History</div>
          <div style={{display:"flex",gap:8,marginBottom:10,overflowX:"auto",paddingBottom:4}}>
            <button style={{...cs.pill(personFilter==="both"),flexShrink:0}} onClick={()=>setPersonFilter("both")}>Both</button>
            {PROFILES.map(p=>(
              <button key={p.id} style={{...cs.pill(personFilter===p.id,p.color),flexShrink:0}} onClick={()=>setPersonFilter(p.id)}>{p.name}</button>
            ))}
          </div>
          <div style={{display:"flex",gap:8,overflowX:"auto",paddingBottom:10,marginBottom:8}}>
            {[{id:"all",l:"All"},{id:"income",l:"Income"},{id:"fixed",l:"Fixed"},{id:"variable",l:"Variable"}].map(f=>(
              <button key={f.id} style={{...cs.pill(histFilter===f.id),flexShrink:0}} onClick={()=>setHistFilter(f.id)}>{f.l}</button>
            ))}
          </div>
          {filteredHist.length===0
            ?<div style={{...cs.card,color:"#334155",textAlign:"center",fontSize:14,padding:24}}>No transactions found</div>
            :filteredHist.map(t=>{
              const cat=getCat(t.catId),owner=getProfile(t.owner),isInc=t.kind==="income";
              return (
                <div key={t.id} style={{...cs.card,padding:"10px 12px",display:"flex",alignItems:"center",gap:10}}>
                  <div style={{width:36,height:36,borderRadius:10,background:cat.color+"18",display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,flexShrink:0}}>{cat.icon}</div>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:13,fontWeight:700,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{t.note||cat.label}</div>
                    <div style={{display:"flex",alignItems:"center",gap:5,marginTop:2,flexWrap:"wrap"}}>
                      <div style={{width:12,height:12,borderRadius:"50%",background:owner.color,display:"flex",alignItems:"center",justifyContent:"center",fontSize:7,fontWeight:800,color:"#0f172a"}}>{owner.avatar}</div>
                      <span style={{fontSize:11,color:"#334155"}}>{owner.name} · {t.date}</span>
                      {t.bank&&<span style={{fontSize:10,background:"#1e293b",color:"#64748b",borderRadius:4,padding:"1px 5px"}}>{t.bank}</span>}
                      {t.oneOff&&<span style={{fontSize:9,background:"#7f1d1d",color:"#fca5a5",borderRadius:4,padding:"1px 4px"}}>1x</span>}
                    </div>
                  </div>
                  <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:3}}>
                    <div style={{fontWeight:800,fontSize:13,color:isInc?"#4ade80":"#f87171"}}>{isInc?"+":"-"}{fmt(t.amount)}</div>
                    {t.currency==="MXN"&&<div style={{fontSize:10,color:"#475569"}}>{t.origAmount?.toLocaleString()} MXN</div>}
                    <button onClick={()=>delTxn(t.id)} style={{border:"none",background:"none",color:"#334155",cursor:"pointer",fontSize:13,padding:0,lineHeight:1}}>✕</button>
                  </div>
                </div>
              );
            })
          }
        </div>
      )}

      {/* ── GOALS ───────────────────────────────────────────────────────── */}
      {tab==="goals"&&(
        <div style={{padding:"28px 18px 0"}}>
          <div style={{fontSize:22,fontWeight:900,letterSpacing:-0.5,marginBottom:16}}>Goals</div>

          {/* Honeymoon tracker */}
          <div style={{...cs.card,background:"linear-gradient(135deg,#0c1a2e,#0f172a)",border:"1px solid #1e3a5f",marginBottom:14}}>
            <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:10}}>
              <span style={{fontSize:24}}>🌍</span>
              <div>
                <div style={{fontWeight:800,fontSize:15}}>Honeymoon — Africa & Maldives</div>
                <div style={{color:"#475569",fontSize:12}}>Total: $35,613</div>
              </div>
            </div>
            {[
              {label:"Flights & Africa package",amount:16333,due:"Nov 2025",paid:true},
              {label:"2nd Africa installment",amount:4894,due:"Feb 2026",paid:true},
              {label:"3rd Africa installment",amount:4894,due:"Mar 2026",paid:false},
              {label:"4th Africa installment",amount:4894,due:"Apr 2026",paid:false},
              {label:"Transfers & Fees",amount:4298,due:"May 2026",paid:false},
              {label:"Service Fee",amount:300,due:"Jun 2026",paid:false},
            ].map((p,i)=>(
              <div key={i} style={{display:"flex",alignItems:"center",gap:10,marginBottom:6,opacity:p.paid?0.5:1}}>
                <div style={{width:18,height:18,borderRadius:"50%",background:p.paid?"#166534":"#1e293b",border:`2px solid ${p.paid?"#22c55e":"#334155"}`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,flexShrink:0}}>
                  {p.paid?"✓":""}
                </div>
                <div style={{flex:1}}>
                  <div style={{fontSize:12,fontWeight:600,color:p.paid?"#475569":"#e2e8f0"}}>{p.label}</div>
                  <div style={{fontSize:11,color:"#334155"}}>{p.due}</div>
                </div>
                <div style={{fontWeight:700,fontSize:13,color:p.paid?"#475569":"#e2e8f0"}}>{fmt(p.amount)}</div>
              </div>
            ))}
          </div>

          {/* Expected income */}
          <div style={{...cs.card,background:"linear-gradient(135deg,#064e3b22,#0f172a)",border:"1px solid #14532d",marginBottom:14}}>
            <div style={{fontWeight:800,fontSize:14,color:"#4ade80",marginBottom:10}}>💼 Expected Income</div>
            {[
              {label:"McKinsey Signing Bonus",amount:25000,when:"Aug 2026"},
              {label:"Summer Internship",amount:10800,when:"Aug 2026"},
              {label:"Wedding Support",amount:35000,when:"May 2026"},
            ].map((e,i)=>(
              <div key={i} style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:6}}>
                <div>
                  <div style={{fontSize:13,fontWeight:600}}>{e.label}</div>
                  <div style={{fontSize:11,color:"#475569"}}>{e.when}</div>
                </div>
                <div style={{fontWeight:800,color:"#4ade80"}}>{fmt(e.amount)}</div>
              </div>
            ))}
            <div style={{borderTop:"1px solid #14532d",marginTop:8,paddingTop:8,display:"flex",justifyContent:"space-between"}}>
              <span style={{fontWeight:700,color:"#86efac"}}>Total Expected</span>
              <span style={{fontWeight:900,color:"#4ade80"}}>{fmt(70800)}</span>
            </div>
          </div>

          {/* Custom goals */}
          <div style={cs.card}>
            <label style={cs.lbl}>New Savings Goal</label>
            <div style={{display:"grid",gridTemplateColumns:"1fr auto",gap:8,marginBottom:8}}>
              <div><label style={cs.lbl}>Name</label><input style={cs.inp} placeholder="e.g. New apartment" value={gName} onChange={e=>setGName(e.target.value)}/></div>
              <div><label style={cs.lbl}>Icon</label><input style={{...cs.inp,width:52,textAlign:"center",fontSize:22}} value={gIcon} onChange={e=>setGIcon(e.target.value)}/></div>
            </div>
            <div style={{marginBottom:8}}><label style={cs.lbl}>Target ($)</label><input style={cs.inp} type="number" placeholder="10000" value={gTarget} onChange={e=>setGTarget(e.target.value)}/></div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:12}}>
              {PROFILES.map(p=>(
                <div key={p.id}>
                  <label style={{...cs.lbl,color:p.color}}>{p.name}'s share ($)</label>
                  <input style={{...cs.inp,borderColor:p.color+"44"}} type="number" placeholder="0" value={gSaved[p.id]||""} onChange={e=>setGSaved(s=>({...s,[p.id]:e.target.value}))}/>
                </div>
              ))}
            </div>
            <button style={cs.bigBtn} onClick={addGoal}>Add Goal</button>
          </div>

          {(data?.goals||[]).map(g=>{
            const total=(g.saved?.roberto||0)+(g.saved?.alexia||0);
            const pct=Math.min(100,Math.round((total/g.target)*100));
            const color=pct>=100?"#4ade80":pct>=60?"#818cf8":"#f97316";
            return (
              <div key={g.id} style={cs.card}>
                <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:12}}>
                  <div style={{position:"relative",flexShrink:0}}>
                    <ProgressRing pct={pct} color={color}/>
                    <div style={{position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center",fontSize:18}}>{g.icon}</div>
                  </div>
                  <div style={{flex:1}}>
                    <div style={{display:"flex",justifyContent:"space-between"}}>
                      <div style={{fontWeight:800,fontSize:15}}>{g.name}</div>
                      <button onClick={()=>delGoal(g.id)} style={{border:"none",background:"none",color:"#334155",cursor:"pointer",fontSize:14,padding:0}}>✕</button>
                    </div>
                    <div style={{color:"#475569",fontSize:12,marginTop:2}}>{fmt(total)} of {fmt(g.target)} · <span style={{color}}>{pct}%</span></div>
                  </div>
                </div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                  {PROFILES.map(p=>(
                    <div key={p.id}>
                      <label style={{...cs.lbl,color:p.color,marginBottom:4}}>{p.name}</label>
                      <input style={{...cs.inp,padding:"6px 10px",fontSize:13,borderColor:p.color+"44"}} type="number" value={g.saved?.[p.id]||0} onChange={e=>updateGoal(g.id,p.id,e.target.value)}/>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── IMPORT ──────────────────────────────────────────────────────── */}
      {tab==="import"&&(
        <div style={{padding:"28px 18px 0"}}>
          <div style={{fontSize:22,fontWeight:900,letterSpacing:-0.5,marginBottom:6}}>Import Statement</div>
          <div style={{color:"#475569",fontSize:14,marginBottom:20}}>Upload a CSV from Amex, BofA, or BBVA — AI auto-categorizes everything.</div>
          <div style={{...cs.card,marginBottom:14}}>
            <label style={cs.lbl}>Importing for</label>
            <div style={{display:"flex",gap:8,marginBottom:14}}>
              {PROFILES.map(p=>(<button key={p.id} style={{...cs.pill(activeUser===p.id,p.color),flex:1}} onClick={()=>setActiveUser(p.id)}>{p.name}</button>))}
            </div>
            <label style={cs.lbl}>Bank</label>
            <div style={{display:"flex",gap:8}}>
              {["AMEX","BofA","BBVA"].map(b=>(<button key={b} style={{...cs.pill(bank===b),flex:1}} onClick={()=>setBank(b)}>{b}</button>))}
            </div>
          </div>
          <input ref={fileRef} type="file" accept=".csv,.pdf" onChange={handleFile} style={{display:"none"}}/>
          <button style={cs.bigBtn} onClick={()=>fileRef.current?.click()}>📂 Choose CSV File</button>
          <div style={{...cs.card,marginTop:12,background:"#0c1a0c",border:"1px solid #14532d"}}>
            <div style={{fontWeight:700,fontSize:13,marginBottom:8,color:"#4ade80"}}>✓ How to export</div>
            {[
              "AMEX: Account → Statements → Export as CSV",
              "BofA: Activity → Download → CSV format",
              "BBVA: Movimientos → Descargar → CSV",
            ].map((s,i)=>(<div key={i} style={{color:"#86efac",fontSize:12,marginBottom:4}}>• {s}</div>))}
          </div>
        </div>
      )}

      {/* ── Bottom Nav ──────────────────────────────────────────────────── */}
      <nav style={cs.nav}>
        {[
          {id:"summary", icon:"📊", label:"Summary"},
          {id:"home",    icon:"⌂",  label:"Home"},
          {id:"add",     icon:"+",  label:"Add"},
          {id:"history", icon:"≡",  label:"History"},
          {id:"goals",   icon:"◎",  label:"Goals"},
        ].map(n=>(
          <button key={n.id} style={cs.navBtn(tab===n.id)} onClick={()=>setTab(n.id)}>
            <span style={{fontSize:n.id==="add"?28:18,fontWeight:900,lineHeight:1}}>{n.icon}</span>
            <span style={{fontSize:10,fontWeight:600}}>{n.label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}
