import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { Link } from "react-router-dom";
import { listPnlEntries, upsertPnlEntry, deletePnlEntry } from "./api/pnlEntries";

// ── DESIGN TOKENS ─────────────────────────────────────────────
const C = {
  bg:"#0A0B0D", surface:"#111318", card:"#16191F",
  border:"#1E2330", border2:"#252B3A", text:"#E2DFD8",
  muted:"#6B7080", dim:"#3A3F50",
  green:"#1A9E75", greenDim:"#0D3D2E",
  red:"#C43B3B",   redDim:"#3D1212",
  amber:"#B87333", amberDim:"#3D2A10",
  purple:"#5A4ABA",purpleDim:"#1E1A40",
  blue:"#2D6FA8",  teal:"#1A8E8E",
};

const MONTH_NAMES = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const DOW = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

// ── DATE HELPERS ──────────────────────────────────────────────
const pad = (n) => String(n).padStart(2,"0");
const fmtDate = (d) => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
const todayStr = () => fmtDate(new Date());
const parseDate = (s) => { const [y,m,d] = s.split("-").map(Number); return new Date(y,m-1,d); };

function buildMonthWeeks(year, month) {
  const firstOfMonth = new Date(year, month, 1);
  const lastOfMonth  = new Date(year, month+1, 0);
  const start = new Date(firstOfMonth); start.setDate(start.getDate() - start.getDay());
  const end   = new Date(lastOfMonth);  end.setDate(end.getDate() + (6 - end.getDay()));
  const weeks = [];
  let cur = new Date(start);
  const today = todayStr();
  while (cur <= end) {
    const week = [];
    for (let i=0;i<7;i++) {
      const ds = fmtDate(cur);
      week.push({ date: ds, day: cur.getDate(), otherMonth: cur.getMonth()!==month, isToday: ds===today });
      cur.setDate(cur.getDate()+1);
    }
    weeks.push(week);
  }
  return weeks;
}

// ── STATS HELPERS ─────────────────────────────────────────────
function toEntries(days) {
  return Object.entries(days)
    .map(([date, d]) => ({ date, pnl: Number(d.pnl)||0, trades: Number(d.trades)||0, notes: d.notes||"" }))
    .sort((a,b)=>a.date.localeCompare(b.date));
}

function computeStats(entries) {
  const total   = entries.reduce((a,e)=>a+e.pnl,0);
  const wins    = entries.filter(e=>e.pnl>0);
  const losses  = entries.filter(e=>e.pnl<0);
  const winSum  = wins.reduce((a,e)=>a+e.pnl,0);
  const lossSum = losses.reduce((a,e)=>a+e.pnl,0);
  const best  = entries.reduce((b,e)=>!b||e.pnl>b.pnl?e:b, null);
  const worst = entries.reduce((w,e)=>!w||e.pnl<w.pnl?e:w, null);

  let peak=0, cum=0, maxDD=0;
  const curve = entries.map(e=>{ cum+=e.pnl; if(cum>peak) peak=cum; maxDD=Math.max(maxDD,peak-cum); return {date:e.date,equity:cum}; });

  let longestWin=0, longestLoss=0, curWin=0, curLoss=0;
  entries.forEach(e=>{
    if (e.pnl>0) { curWin++; curLoss=0; longestWin=Math.max(longestWin,curWin); }
    else if (e.pnl<0) { curLoss++; curWin=0; longestLoss=Math.max(longestLoss,curLoss); }
    else { curWin=0; curLoss=0; }
  });
  let current=0, sign=0;
  for (let i=entries.length-1;i>=0;i--) {
    const s = entries[i].pnl>0?1:entries[i].pnl<0?-1:0;
    if (s===0) break;
    if (sign===0) { sign=s; current=1; }
    else if (s===sign) current++;
    else break;
  }

  return {
    total, count: entries.length,
    winDays: wins.length, lossDays: losses.length, beDays: entries.length-wins.length-losses.length,
    winRate: (wins.length+losses.length) ? Math.round(wins.length/(wins.length+losses.length)*100) : null,
    avgPerDay: entries.length ? total/entries.length : 0,
    avgWin: wins.length ? winSum/wins.length : 0,
    avgLoss: losses.length ? lossSum/losses.length : 0,
    profitFactor: lossSum!==0 ? Math.abs(winSum/lossSum) : (winSum>0?Infinity:null),
    best, worst, maxDD, curve,
    longestWin, longestLoss, currentStreak: current, currentSign: sign,
  };
}

const money = (v, decimals=0) => `${v<0?"-":""}$${Math.abs(v).toFixed(decimals)}`;
const pnlColor = (v) => v>0?C.green:v<0?C.red:C.muted;

// ── PRIMITIVES ────────────────────────────────────────────────
const Label = ({children, color}) => (
  <div style={{fontSize:9,fontWeight:800,color:color||C.muted,textTransform:"uppercase",
    letterSpacing:"0.08em",marginBottom:3}}>{children}</div>
);

const SecHead = ({children, color}) => (
  <div style={{fontSize:9,fontWeight:800,letterSpacing:"0.1em",textTransform:"uppercase",
    color:color||C.muted,marginBottom:10,paddingBottom:5,borderBottom:`1px solid ${C.border}`}}>{children}</div>
);

const Inp = ({value, onChange, placeholder, type="text", mono=false, step}) => (
  <input value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder} type={type} step={step}
    style={{background:C.surface,border:`1px solid ${C.border2}`,borderRadius:4,
      color:C.text,fontSize:12,padding:"5px 8px",width:"100%",outline:"none",boxSizing:"border-box",
      fontFamily:mono?"'JetBrains Mono','Fira Code',monospace":"inherit"}}/>
);

const Area = ({value, onChange, placeholder, rows=2}) => (
  <textarea value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder} rows={rows}
    style={{background:C.surface,border:`1px solid ${C.border2}`,borderRadius:4,
      color:C.text,fontSize:12,padding:"5px 8px",width:"100%",outline:"none",
      resize:"vertical",fontFamily:"inherit",lineHeight:1.5,boxSizing:"border-box"}}/>
);

const StatBox = ({label, value, color, sub}) => (
  <div style={{background:C.surface,border:`1px solid ${C.border2}`,borderRadius:8,
    padding:"10px 12px",textAlign:"center"}}>
    <div style={{fontSize:17,fontWeight:700,color:color||C.text,
      fontFamily:"'JetBrains Mono',monospace",lineHeight:1}}>{value}</div>
    <div style={{fontSize:9,color:C.muted,marginTop:4,textTransform:"uppercase",letterSpacing:"0.06em"}}>{label}</div>
    {sub && <div style={{fontSize:10,color:C.dim,marginTop:2}}>{sub}</div>}
  </div>
);

// ── STATS BAR ─────────────────────────────────────────────────
function StatsBar({ stats }) {
  const stat = (label, value, color=C.text) => (
    <div style={{textAlign:"center",padding:"0 14px",borderRight:`1px solid ${C.border}`}}>
      <div style={{fontSize:18,fontWeight:700,color,fontFamily:"'JetBrains Mono',monospace",lineHeight:1}}>{value}</div>
      <div style={{fontSize:9,color:C.muted,marginTop:4,textTransform:"uppercase",letterSpacing:"0.06em"}}>{label}</div>
    </div>
  );
  return (
    <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:10,
      padding:"14px 20px",marginBottom:16,display:"flex",alignItems:"center",
      flexWrap:"wrap",gap:0,overflowX:"auto"}}>
      {stat("Days Logged", stats.count)}
      {stat("Total P&L", stats.count?money(stats.total):"—", stats.total>=0?C.green:C.red)}
      {stat("Win Rate", stats.winRate!==null?`${stats.winRate}%`:"—",
        stats.winRate===null?C.muted:stats.winRate>=55?C.green:stats.winRate>=45?C.amber:C.red)}
      {stat("Avg/Day", stats.count?money(stats.avgPerDay):"—", stats.avgPerDay>=0?C.green:C.red)}
      {stat("Best Day", stats.best?money(stats.best.pnl):"—", C.green)}
      {stat("Worst Day", stats.worst?money(stats.worst.pnl):"—", C.red)}
      {stat("Max Drawdown", stats.count?money(stats.maxDD):"—", C.red)}
      <div style={{textAlign:"center",padding:"0 14px"}}>
        <div style={{fontSize:18,fontWeight:700,
          color:stats.currentSign>0?C.green:stats.currentSign<0?C.red:C.muted,
          fontFamily:"'JetBrains Mono',monospace",lineHeight:1}}>
          {stats.currentStreak>0 ? `${stats.currentStreak}${stats.currentSign>0?"W":"L"}` : "—"}
        </div>
        <div style={{fontSize:9,color:C.muted,marginTop:4,textTransform:"uppercase",letterSpacing:"0.06em"}}>Current Streak</div>
      </div>
    </div>
  );
}

// ── DAY EDITOR ────────────────────────────────────────────────
function DayEditor({ date, entry, onSave, onDelete, onClose }) {
  const [pnl, setPnl]       = useState(entry?.pnl ?? "");
  const [trades, setTrades] = useState(entry?.trades ?? "");
  const [notes, setNotes]   = useState(entry?.notes ?? "");
  const [savedFlash, setSavedFlash] = useState(false);

  useEffect(() => {
    setPnl(entry?.pnl ?? ""); setTrades(entry?.trades ?? ""); setNotes(entry?.notes ?? "");
    setSavedFlash(false);
  }, [date]); // eslint-disable-line react-hooks/exhaustive-deps

  const isValid = pnl !== "" && !isNaN(parseFloat(pnl));

  const save = () => {
    if (!isValid) return;
    onSave(date, { pnl: parseFloat(pnl), trades: trades===""?0:parseInt(trades,10), notes });
    setSavedFlash(true);
    setTimeout(()=>setSavedFlash(false), 1500);
  };

  return (
    <div style={{background:C.card,border:`1px solid ${C.border2}`,borderLeft:`3px solid ${C.purple}`,
      borderRadius:10,padding:"14px 16px",marginTop:14}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10}}>
        <div style={{fontSize:13,fontWeight:700,color:C.text,fontFamily:"monospace"}}>{date}</div>
        <button onClick={onClose} style={{fontSize:11,color:C.muted,background:"transparent",
          border:`1px solid ${C.border}`,borderRadius:4,padding:"2px 8px",cursor:"pointer"}}>✕ Close</button>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 2fr",gap:10,marginBottom:10}}>
        <div>
          <Label color={pnl!==""&&!isValid?C.red:undefined}>P&L ($)</Label>
          <Inp value={pnl} onChange={setPnl} placeholder="±0.00" type="number" step="0.01" mono/>
        </div>
        <div><Label>Trades</Label><Inp value={trades} onChange={setTrades} placeholder="0" type="number" mono/></div>
        <div><Label>Notes</Label><Inp value={notes} onChange={setNotes} placeholder="Session notes…"/></div>
      </div>
      <div style={{display:"flex",gap:8,alignItems:"center"}}>
        <button onClick={save} disabled={!isValid} style={{padding:"6px 16px",borderRadius:6,fontSize:12,fontWeight:700,
          background:isValid?C.green:C.border,color:isValid?"#fff":C.muted,border:"none",
          cursor:isValid?"pointer":"not-allowed"}}>Save Entry</button>
        {entry && (
          <button onClick={()=>onDelete(date)} style={{padding:"6px 16px",borderRadius:6,fontSize:12,fontWeight:600,
            background:C.redDim,color:C.red,border:`1px solid ${C.red}44`,cursor:"pointer"}}>Delete</button>
        )}
        {!isValid && pnl==="" && (
          <span style={{fontSize:11,color:C.muted}}>Enter a P&amp;L amount to save</span>
        )}
        {savedFlash && (
          <span style={{fontSize:11,color:C.green,fontWeight:600}}>✓ Saved</span>
        )}
      </div>
    </div>
  );
}

// ── MONTH CALENDAR ────────────────────────────────────────────
function MonthCalendar({ days, year, month, onPrev, onNext, onToday, selectedDate, onSelect }) {
  const weeks = useMemo(()=>buildMonthWeeks(year,month), [year,month]);
  const monthTotal = useMemo(()=>{
    let t=0, win=0, loss=0;
    Object.entries(days).forEach(([d,e])=>{
      const dt = parseDate(d);
      if (dt.getFullYear()===year && dt.getMonth()===month) {
        t += Number(e.pnl)||0;
        if (e.pnl>0) win++; else if (e.pnl<0) loss++;
      }
    });
    return { t, win, loss };
  }, [days, year, month]);

  const maxAbs = useMemo(()=>{
    let m=1;
    Object.values(days).forEach(e=>{ m = Math.max(m, Math.abs(Number(e.pnl)||0)); });
    return m;
  }, [days]);

  const cellBg = (pnl) => {
    if (!pnl) return "transparent";
    const intensity = Math.min(0.85, 0.18 + Math.abs(pnl)/maxAbs*0.55);
    return pnl>0 ? `rgba(26,158,117,${intensity})` : `rgba(196,59,59,${intensity})`;
  };

  return (
    <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:10,padding:"16px 18px"}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:14}}>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <button onClick={onPrev} style={{width:26,height:26,borderRadius:6,background:C.surface,
            color:C.muted,border:`1px solid ${C.border2}`,cursor:"pointer",fontSize:13}}>‹</button>
          <div style={{fontSize:15,fontWeight:700,color:C.text,minWidth:150,textAlign:"center"}}>
            {MONTH_NAMES[month]} {year}
          </div>
          <button onClick={onNext} style={{width:26,height:26,borderRadius:6,background:C.surface,
            color:C.muted,border:`1px solid ${C.border2}`,cursor:"pointer",fontSize:13}}>›</button>
          <button onClick={onToday} style={{marginLeft:4,padding:"4px 10px",borderRadius:6,fontSize:10,
            fontWeight:600,background:"transparent",color:C.purple,border:`1px solid ${C.purple}55`,cursor:"pointer"}}>Today</button>
        </div>
        <div style={{display:"flex",gap:14,alignItems:"center"}}>
          <span style={{fontSize:11,color:C.muted}}>{monthTotal.win}W / {monthTotal.loss}L</span>
          <span style={{fontSize:16,fontWeight:700,fontFamily:"monospace",color:pnlColor(monthTotal.t)}}>
            {monthTotal.t?money(monthTotal.t):"—"}
          </span>
        </div>
      </div>

      <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr) 90px",gap:4,marginBottom:4}}>
        {DOW.map(d=>(
          <div key={d} style={{fontSize:9,fontWeight:700,color:C.muted,textAlign:"center",
            textTransform:"uppercase",letterSpacing:"0.06em",padding:"2px 0"}}>{d}</div>
        ))}
        <div style={{fontSize:9,fontWeight:700,color:C.muted,textAlign:"center",
          textTransform:"uppercase",letterSpacing:"0.06em",padding:"2px 0"}}>Week</div>
      </div>

      {weeks.map((week,wi)=>{
        const weekTotal = week.reduce((a,c)=>a+(Number(days[c.date]?.pnl)||0),0);
        return (
          <div key={wi} style={{display:"grid",gridTemplateColumns:"repeat(7,1fr) 90px",gap:4,marginBottom:4}}>
            {week.map(cell=>{
              const entry = days[cell.date];
              const isSelected = cell.date===selectedDate;
              return (
                <div key={cell.date} onClick={()=>onSelect(cell.date)}
                  style={{
                    minHeight:56,borderRadius:6,padding:"5px 6px",cursor:"pointer",
                    background: isSelected ? `${C.purple}22` : cellBg(entry?.pnl),
                    border:`1px solid ${isSelected?C.purple:cell.isToday?C.amber:"transparent"}`,
                    opacity: cell.otherMonth?0.35:1,
                    display:"flex",flexDirection:"column",justifyContent:"space-between",
                  }}>
                  <div style={{fontSize:10,color:cell.isToday?C.amber:C.muted,fontWeight:cell.isToday?800:600}}>{cell.day}</div>
                  {entry && (
                    <div style={{fontSize:11,fontWeight:700,fontFamily:"monospace",color:pnlColor(entry.pnl)}}>
                      {money(entry.pnl)}
                    </div>
                  )}
                </div>
              );
            })}
            <div style={{display:"flex",alignItems:"center",justifyContent:"center",
              background:C.surface,borderRadius:6,fontSize:11,fontWeight:700,
              fontFamily:"monospace",color:pnlColor(weekTotal)}}>
              {weekTotal?money(weekTotal):"—"}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── YEARLY OVERVIEW ───────────────────────────────────────────
function YearlyOverview({ days, year, onPrev, onNext, onJumpMonth }) {
  const monthly = useMemo(()=>{
    const arr = Array.from({length:12},()=>({t:0,win:0,loss:0}));
    Object.entries(days).forEach(([d,e])=>{
      const dt = parseDate(d);
      if (dt.getFullYear()===year) {
        const m = dt.getMonth();
        arr[m].t += Number(e.pnl)||0;
        if (e.pnl>0) arr[m].win++; else if (e.pnl<0) arr[m].loss++;
      }
    });
    return arr;
  }, [days, year]);

  const yearTotal = monthly.reduce((a,m)=>a+m.t,0);
  const maxAbs = Math.max(1, ...monthly.map(m=>Math.abs(m.t)));

  return (
    <div style={{display:"flex",flexDirection:"column",gap:14}}>
      <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:10,padding:"16px 18px"}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:16}}>
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            <button onClick={onPrev} style={{width:26,height:26,borderRadius:6,background:C.surface,
              color:C.muted,border:`1px solid ${C.border2}`,cursor:"pointer",fontSize:13}}>‹</button>
            <div style={{fontSize:15,fontWeight:700,color:C.text,minWidth:70,textAlign:"center"}}>{year}</div>
            <button onClick={onNext} style={{width:26,height:26,borderRadius:6,background:C.surface,
              color:C.muted,border:`1px solid ${C.border2}`,cursor:"pointer",fontSize:13}}>›</button>
          </div>
          <div>
            <span style={{fontSize:11,color:C.muted,marginRight:10}}>Year total</span>
            <span style={{fontSize:18,fontWeight:700,fontFamily:"monospace",color:pnlColor(yearTotal)}}>
              {yearTotal?money(yearTotal):"—"}
            </span>
          </div>
        </div>

        <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:10}}>
          {monthly.map((m,i)=>(
            <div key={i} onClick={()=>onJumpMonth(i)} style={{
              background:C.surface,border:`1px solid ${C.border2}`,borderRadius:8,
              padding:"10px 12px",cursor:"pointer"
            }}>
              <div style={{fontSize:11,fontWeight:700,color:C.text,marginBottom:6}}>{MONTH_NAMES[i]}</div>
              <div style={{fontSize:15,fontWeight:700,fontFamily:"monospace",color:pnlColor(m.t)}}>
                {m.t?money(m.t):"—"}
              </div>
              <div style={{height:4,background:C.border,borderRadius:2,margin:"6px 0"}}>
                <div style={{width:`${Math.min(100,Math.abs(m.t)/maxAbs*100)}%`,height:"100%",
                  borderRadius:2,background:pnlColor(m.t)}}/>
              </div>
              <div style={{fontSize:10,color:C.muted}}>{m.win}W / {m.loss}L</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── EQUITY CURVE ──────────────────────────────────────────────
function EquityCurve({ curve, height=200 }) {
  if (!curve.length) return <div style={{fontSize:12,color:C.muted,padding:"20px 0"}}>No data yet.</div>;
  const vals = curve.map(c=>c.equity);
  const min = Math.min(0,...vals), max = Math.max(0,...vals);
  const range = max-min || 1;
  const W=680, H=height, PAD=34;
  const iW=W-PAD*2, iH=H-PAD*2;
  const x = (i)=> curve.length>1 ? PAD + (i/(curve.length-1))*iW : PAD+iW/2;
  const y = (v)=> PAD + iH - ((v-min)/range)*iH;
  const pts = curve.map((c,i)=>`${x(i)},${y(c.equity)}`).join(" ");
  const zeroY = y(0);
  const finalColor = curve[curve.length-1].equity>=0 ? C.green : C.red;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{width:"100%",height,display:"block"}}>
      {[0.25,0.5,0.75].map(p=>{
        const gy = PAD+iH*p;
        return <line key={p} x1={PAD} x2={W-PAD} y1={gy} y2={gy} stroke={C.border} strokeWidth="0.5"/>;
      })}
      <line x1={PAD} x2={W-PAD} y1={zeroY} y2={zeroY} stroke={C.border2} strokeWidth="1" strokeDasharray="4 3"/>
      <polyline points={pts} fill="none" stroke={finalColor} strokeWidth="1.5" strokeLinejoin="round"/>
      <text x={PAD-4} y={y(max)+4} fontSize="9" fill={C.muted} textAnchor="end">{money(max)}</text>
      <text x={PAD-4} y={y(min)+4} fontSize="9" fill={C.muted} textAnchor="end">{money(min)}</text>
      <text x={PAD-4} y={zeroY+4} fontSize="9" fill={C.border2} textAnchor="end">$0</text>
    </svg>
  );
}

// ── SUMMARY TAB ───────────────────────────────────────────────
function SummaryTab({ days, entries, stats }) {
  if (!entries.length) return (
    <div style={{textAlign:"center",padding:"60px 20px",color:C.muted}}>
      No data yet — log your first day in the Calendar or Log tab.
    </div>
  );

  return (
    <div style={{display:"flex",flexDirection:"column",gap:14}}>
      <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:10}}>
        <StatBox label="Win Rate" value={stats.winRate!==null?`${stats.winRate}%`:"—"}
          color={stats.winRate>=55?C.green:stats.winRate>=45?C.amber:C.red}
          sub={`${stats.winDays}W / ${stats.lossDays}L / ${stats.beDays}BE`}/>
        <StatBox label="Profit Factor" value={stats.profitFactor===Infinity?"∞":stats.profitFactor!==null?stats.profitFactor.toFixed(2):"—"}
          color={C.purple}/>
        <StatBox label="Avg Win Day" value={money(stats.avgWin)} color={C.green}/>
        <StatBox label="Avg Loss Day" value={money(stats.avgLoss)} color={C.red}/>
        <StatBox label="Longest Win Streak" value={`${stats.longestWin} days`} color={C.green}/>
        <StatBox label="Longest Loss Streak" value={`${stats.longestLoss} days`} color={C.red}/>
        <StatBox label="Best Day" value={stats.best?money(stats.best.pnl):"—"} color={C.green}
          sub={stats.best?.date}/>
        <StatBox label="Worst Day" value={stats.worst?money(stats.worst.pnl):"—"} color={C.red}
          sub={stats.worst?.date}/>
      </div>

      <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:10,padding:"16px 18px"}}>
        <SecHead color={C.blue}>Cumulative Equity Curve — all logged days</SecHead>
        <EquityCurve curve={stats.curve}/>
      </div>
    </div>
  );
}

// ── LOG TAB ───────────────────────────────────────────────────
function LogTab({ days, onSave, onDelete, exportData, importData, clearAll }) {
  const [date, setDate]     = useState(todayStr());
  const [pnl, setPnl]       = useState("");
  const [trades, setTrades] = useState("");
  const [notes, setNotes]   = useState("");
  const [filter, setFilter] = useState("");

  const entries = useMemo(()=>toEntries(days).reverse(), [days]);
  const filtered = filter
    ? entries.filter(e=>e.date.includes(filter)||e.notes.toLowerCase().includes(filter.toLowerCase()))
    : entries;

  const submit = () => {
    if (!date || pnl==="" || isNaN(parseFloat(pnl))) return;
    onSave(date, { pnl: parseFloat(pnl), trades: trades===""?0:parseInt(trades,10), notes });
    setPnl(""); setTrades(""); setNotes("");
  };

  const loadForEdit = (e) => { setDate(e.date); setPnl(e.pnl); setTrades(e.trades||""); setNotes(e.notes||""); };

  return (
    <div style={{display:"flex",flexDirection:"column",gap:14}}>
      <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:10,padding:"16px 18px"}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10}}>
          <SecHead color={C.purple}>Add / Edit Daily Entry</SecHead>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"140px 140px 100px 1fr auto",gap:10,alignItems:"end"}}>
          <div><Label>Date</Label><Inp value={date} onChange={setDate} type="date" mono/></div>
          <div><Label>P&L ($)</Label><Inp value={pnl} onChange={setPnl} placeholder="±0.00" type="number" step="0.01" mono/></div>
          <div><Label>Trades</Label><Inp value={trades} onChange={setTrades} placeholder="0" type="number" mono/></div>
          <div><Label>Notes</Label><Inp value={notes} onChange={setNotes} placeholder="Optional session notes…"/></div>
          <button onClick={submit} style={{padding:"7px 18px",borderRadius:6,fontSize:12,fontWeight:700,
            background:C.green,color:"#fff",border:"none",cursor:"pointer",height:30}}>Save</button>
        </div>
      </div>

      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:10,flexWrap:"wrap"}}>
        <input value={filter} onChange={e=>setFilter(e.target.value)} placeholder="Search date or notes…"
          style={{background:C.surface,border:`1px solid ${C.border2}`,borderRadius:6,
            color:C.text,fontSize:12,padding:"6px 12px",width:240,outline:"none"}}/>
        <div style={{display:"flex",gap:6}}>
          {[["⬆ Export",exportData,C.teal],["⬇ Import",importData,C.blue],["✕ Clear",clearAll,C.red]]
            .map(([label,fn,color])=>(
              <button key={label} onClick={fn} style={{
                padding:"5px 12px",borderRadius:6,fontSize:11,fontWeight:600,cursor:"pointer",
                background:`${color}22`,color,border:`1px solid ${color}44`
              }}>{label}</button>
            ))}
        </div>
      </div>

      <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:10,overflow:"hidden"}}>
        <div style={{display:"grid",gridTemplateColumns:"110px 100px 70px 1fr 70px",gap:8,
          padding:"8px 14px",background:C.surface,borderBottom:`1px solid ${C.border}`}}>
          {["Date","P&L","Trades","Notes",""].map(h=>(
            <div key={h} style={{fontSize:9,fontWeight:800,color:C.muted,textTransform:"uppercase",letterSpacing:"0.06em"}}>{h}</div>
          ))}
        </div>
        {filtered.length===0 && (
          <div style={{padding:"30px",textAlign:"center",fontSize:12,color:C.muted}}>No entries logged yet.</div>
        )}
        {filtered.map(e=>(
          <div key={e.date} style={{display:"grid",gridTemplateColumns:"110px 100px 70px 1fr 70px",gap:8,
            padding:"8px 14px",borderBottom:`1px solid ${C.border}`,alignItems:"center"}}>
            <div style={{fontSize:12,fontFamily:"monospace",color:C.text}}>{e.date}</div>
            <div style={{fontSize:12,fontWeight:700,fontFamily:"monospace",color:pnlColor(e.pnl)}}>{money(e.pnl,2)}</div>
            <div style={{fontSize:12,color:C.muted}}>{e.trades||"—"}</div>
            <div style={{fontSize:12,color:C.muted,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{e.notes||"—"}</div>
            <div style={{display:"flex",gap:4}}>
              <button onClick={()=>loadForEdit(e)} title="Edit" style={{fontSize:10,color:C.blue,
                background:"transparent",border:`1px solid ${C.border2}`,borderRadius:4,padding:"2px 6px",cursor:"pointer"}}>✎</button>
              <button onClick={()=>onDelete(e.date)} title="Delete" style={{fontSize:10,color:C.red,
                background:"transparent",border:`1px solid ${C.border2}`,borderRadius:4,padding:"2px 6px",cursor:"pointer"}}>✕</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── MAIN APP ──────────────────────────────────────────────────
export default function PnlTracker() {
  const [days, setDays] = useState({});
  const [loading, setLoading] = useState(true);

  const [tab, setTab] = useState("calendar");
  const [saveStatus, setSaveStatus] = useState("saved");
  const today = new Date();
  const [calYear, setCalYear]   = useState(today.getFullYear());
  const [calMonth, setCalMonth] = useState(today.getMonth());
  const [ovYear, setOvYear]     = useState(today.getFullYear());
  const [selectedDate, setSelectedDate] = useState(null);

  const saveTimersRef = useRef({});

  // Initial load from the API
  useEffect(()=>{
    let cancelled = false;
    (async ()=>{
      try {
        const items = await listPnlEntries();
        if (cancelled) return;
        const map = {};
        items.forEach(item => { map[item.date] = { pnl: item.pnl, trades: item.trades, notes: item.notes }; });
        setDays(map);
      } catch(e) {
        console.error("Failed to load P&L entries", e);
        setSaveStatus("error");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return ()=>{ cancelled = true; };
  },[]);

  const entries = useMemo(()=>toEntries(days), [days]);
  const stats   = useMemo(()=>computeStats(entries), [entries]);

  const saveEntry = useCallback((date, data) => {
    setDays(d => ({ ...d, [date]: data }));
    clearTimeout(saveTimersRef.current[date]);
    saveTimersRef.current[date] = setTimeout(async () => {
      setSaveStatus("saving");
      try {
        await upsertPnlEntry({ date, ...data });
        setSaveStatus("saved");
      } catch(e) {
        console.error("Failed to save P&L entry", e);
        setSaveStatus("error");
      }
    }, 500);
  }, []);
  const deleteEntry = useCallback((date) => {
    setDays(d => { const n = {...d}; delete n[date]; return n; });
    setSelectedDate(s => s===date ? null : s);
    clearTimeout(saveTimersRef.current[date]);
    deletePnlEntry(date).catch(e=>console.error("Failed to delete P&L entry", e));
  }, []);

  const prevMonth = () => { calMonth===0 ? (setCalMonth(11), setCalYear(y=>y-1)) : setCalMonth(m=>m-1); };
  const nextMonth = () => { calMonth===11 ? (setCalMonth(0), setCalYear(y=>y+1)) : setCalMonth(m=>m+1); };
  const goToday   = () => { setCalYear(today.getFullYear()); setCalMonth(today.getMonth()); setSelectedDate(todayStr()); };
  const jumpMonth = (m) => { setCalYear(ovYear); setCalMonth(m); setTab("calendar"); };

  const exportData = useCallback(()=>{
    const blob = new Blob([JSON.stringify(days,null,2)],{type:"application/json"});
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href=url; a.download=`pnl_tracker_${todayStr()}.json`;
    a.click(); URL.revokeObjectURL(url);
  },[days]);

  const importData = useCallback(()=>{
    const input = document.createElement("input");
    input.type="file"; input.accept=".json";
    input.onchange = e => {
      const file = e.target.files[0]; if(!file) return;
      const reader = new FileReader();
      reader.onload = ev => {
        try {
          const parsed = JSON.parse(ev.target.result);
          if (parsed && typeof parsed==="object") {
            setDays(parsed);
            Object.entries(parsed).forEach(([date,data]) => saveEntry(date, data));
          }
        } catch { alert("Invalid file."); }
      };
      reader.readAsText(file);
    };
    input.click();
  },[saveEntry]);

  const clearAll = useCallback(()=>{
    if (window.confirm("Clear all P&L data? This cannot be undone.")) {
      Object.values(saveTimersRef.current).forEach(clearTimeout);
      saveTimersRef.current = {};
      Object.keys(days).forEach(date => deletePnlEntry(date).catch(e=>console.error("Failed to delete P&L entry", e)));
      setDays({});
    }
  },[days]);

  const statusColor = saveStatus==="saved"?C.green:saveStatus==="saving"?C.amber:C.red;
  const statusLabel = saveStatus==="saved"?"Auto-saved":saveStatus==="saving"?"Saving…":"Save error";

  if (loading) {
    return (
      <div style={{
        background:C.bg,color:C.muted,minHeight:"100vh",
        display:"flex",alignItems:"center",justifyContent:"center",
        fontFamily:"'Inter',system-ui,sans-serif",fontSize:13
      }}>
        Loading P&amp;L data…
      </div>
    );
  }

  return (
    <div style={{background:C.bg,color:C.text,minHeight:"100vh",
      fontFamily:"'Inter',system-ui,sans-serif",padding:"20px 18px",maxWidth:1000,margin:"0 auto"}}>

      {/* Header */}
      <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",
        gap:12,flexWrap:"wrap",marginBottom:20}}>
        <div>
          <Link to="/" style={{fontSize:11,color:C.muted,textDecoration:"none",
            display:"inline-block",marginBottom:8}}>← Home</Link>
          <div style={{fontSize:10,fontWeight:800,color:C.purple,
            textTransform:"uppercase",letterSpacing:"0.14em",marginBottom:4}}>
            FUTURES TRADING
          </div>
          <h1 style={{margin:"0 0 4px",fontSize:22,fontWeight:700,color:C.text,lineHeight:1.2}}>
            P&amp;L Tracker
          </h1>
          <p style={{margin:0,fontSize:12,color:C.muted,lineHeight:1.6}}>
            Daily P&amp;L logging with calendarized weekly, monthly, and annual views
          </p>
        </div>
        <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:6}}>
          <div style={{display:"flex",alignItems:"center",gap:6}}>
            <div style={{width:7,height:7,borderRadius:"50%",background:statusColor,transition:"background 0.3s"}}/>
            <span style={{fontSize:10,fontWeight:600,textTransform:"uppercase",
              letterSpacing:"0.06em",color:statusColor}}>{statusLabel}</span>
          </div>
          <div style={{fontSize:10,color:C.dim}}>Synced to AWS</div>
        </div>
      </div>

      <StatsBar stats={stats}/>

      {/* Tabs */}
      <div style={{display:"flex",gap:6,marginBottom:14,
        borderBottom:`1px solid ${C.border}`,paddingBottom:10,flexWrap:"wrap"}}>
        {[["calendar","Calendar"],["yearly","Yearly Overview"],["summary","Summary"],["log","Log"]].map(([id,label])=>(
          <button key={id} onClick={()=>setTab(id)} style={{
            padding:"6px 14px",borderRadius:6,fontSize:12,fontWeight:600,cursor:"pointer",
            background:tab===id?C.purple:"transparent",
            color:tab===id?"#fff":C.muted,
            border:`1px solid ${tab===id?C.purple:C.border}`
          }}>{label}</button>
        ))}
      </div>

      {tab==="calendar" && (
        <div>
          <MonthCalendar days={days} year={calYear} month={calMonth}
            onPrev={prevMonth} onNext={nextMonth} onToday={goToday}
            selectedDate={selectedDate} onSelect={setSelectedDate}/>
          {selectedDate && (
            <DayEditor date={selectedDate} entry={days[selectedDate]}
              onSave={saveEntry} onDelete={deleteEntry} onClose={()=>setSelectedDate(null)}/>
          )}
        </div>
      )}

      {tab==="yearly" && (
        <YearlyOverview days={days} year={ovYear}
          onPrev={()=>setOvYear(y=>y-1)} onNext={()=>setOvYear(y=>y+1)}
          onJumpMonth={jumpMonth}/>
      )}

      {tab==="summary" && <SummaryTab days={days} entries={entries} stats={stats}/>}

      {tab==="log" && (
        <LogTab days={days} onSave={saveEntry} onDelete={deleteEntry}
          exportData={exportData} importData={importData} clearAll={clearAll}/>
      )}

    </div>
  );
}
