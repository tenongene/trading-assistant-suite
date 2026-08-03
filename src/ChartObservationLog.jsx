import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { Link } from "react-router-dom";
import { listLogs, upsertLog, deleteLog } from "./api/tradingLogs";
import { getRecommendation, generateRecommendation } from "./api/recommendations";

// ── DESIGN TOKENS ─────────────────────────────────────────────
const C = {
  bg:       "#0A0B0D", surface:  "#111318", card:     "#16191F",
  border:   "#1E2330", border2:  "#252B3A", text:     "#E2DFD8",
  muted:    "#6B7080", dim:      "#3A3F50",
  green:    "#1A9E75", greenDim: "#0D3D2E",
  red:      "#C43B3B", redDim:   "#3D1212",
  amber:    "#B87333", amberDim: "#3D2A10",
  purple:   "#5A4ABA", purpleDim:"#1E1A40",
  blue:     "#2D6FA8", blueDim:  "#0D2035",
  teal:     "#1A8E8E", tealDim:  "#0A2D2D",
};

// ── OPTION SETS ───────────────────────────────────────────────
const SESSION_TYPES = ["Trending ↑","Trending ↓","Ranging","Choppy","Undecided"];
const OPEN_TYPES    = ["Large Bull","Large Bear","Gap Up","Gap Down","Inside","Neutral"];
const DELTA_BIAS    = ["Strongly +","Mildly +","Neutral","Mildly −","Strongly −","Mixed"];
const SIGNALS       = ["FVG Retest","CHoCH Long","CHoCH Short","pdVAH Fade","pdVAL Fade","LVN Rejection","Vol Climax","Compression Coil","Delta Div","dPOC Test","Sweep+Rev","OB Entry"];
const OUTCOMES      = ["Target Hit","Partial","BE","Stop Out","Not Taken","Missed"];
const DIRECTIONS    = ["Long","Short"];
const ATR_STATES    = ["Trending ↑","Trending ↓","Flip Long","Flip Short","Choppy"];
const QUALITY       = ["A","B","C","Skip"];
const REGIMES       = ["RTH Only","Overnight Gap","London Driven","News Driven"];

// ── DATE HELPERS ──────────────────────────────────────────────
const MONTH_NAMES = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const DOW = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
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

// ── EMPTY TRADE ───────────────────────────────────────────────
let tradeCounter = 0;
const emptyTrade = () => ({
  id:        ++tradeCounter,
  time:      "",
  direction: "",
  signals:   [],
  entry:     "",
  stop:      "",
  target:    "",
  outcome:   "",
  pnl:       "",
  quality:   "",
  rr:        "",
  notes:     "",
  lesson:    "",
});

// ── EMPTY DAY DATA ────────────────────────────────────────────
const emptyDayData = () => ({
  sessionType: "",
  openType:    "",
  regime:      "",
  atrState:    "",
  deltaBias:   "",
  // VP levels
  pdVAH:"", pdVAL:"", pdPOC:"",
  vah:"",   val:"",   poc:"",   lvn:"",
  // Conditions
  volSpike:    false,
  rangeExpand: false,
  sweep:       false,
  sessionClassCorrect: "",
  dayNotes:    "",
  bestSetup:   "",
  trades:      [],
});

// ── HELPERS ───────────────────────────────────────────────────
const outcomeColor = (o) => {
  if (o==="Target Hit") return C.green;
  if (o==="Stop Out")   return C.red;
  if (o==="Missed")     return C.amber;
  if (o==="BE")         return C.teal;
  if (o==="Partial")    return C.blue;
  return C.muted;
};
const qualityColor = (q) => {
  if (q==="A") return C.green;
  if (q==="B") return C.blue;
  if (q==="C") return C.amber;
  if (q==="Skip") return C.muted;
  return C.dim;
};
const dirColor = (d) => d==="Long" ? C.green : d==="Short" ? C.red : C.muted;
const sessionBg = (sessionType) => !sessionType ? "transparent"
  : sessionType.includes("Trend") ? C.greenDim
  : sessionType==="Ranging" ? C.purpleDim
  : sessionType==="Choppy"  ? C.redDim : C.blueDim;
const sessionTxt = (sessionType) => !sessionType ? C.muted
  : sessionType.includes("Trend") ? C.green
  : sessionType==="Ranging" ? "#A090E0"
  : sessionType==="Choppy"  ? C.red : "#6AAEDC";

// ── PRIMITIVE COMPONENTS ──────────────────────────────────────
const Label = ({children, color}) => (
  <div style={{fontSize:9,fontWeight:800,color:color||C.muted,textTransform:"uppercase",
    letterSpacing:"0.08em",marginBottom:3}}>{children}</div>
);

const Inp = ({value, onChange, placeholder, width="100%", mono=false, type="text"}) => (
  <input value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder} type={type}
    style={{background:C.surface,border:`1px solid ${C.border2}`,borderRadius:4,
      color:C.text,fontSize:12,padding:"4px 7px",width,outline:"none",boxSizing:"border-box",
      colorScheme:"dark",
      fontFamily:mono?"'JetBrains Mono','Fira Code',monospace":"inherit"}}/>
);

const Sel = ({value, onChange, options, placeholder}) => (
  <select value={value} onChange={e=>onChange(e.target.value)}
    style={{background:C.surface,border:`1px solid ${C.border2}`,borderRadius:4,
      color:value?C.text:C.muted,fontSize:12,padding:"4px 7px",outline:"none",
      cursor:"pointer",width:"100%",boxSizing:"border-box"}}>
    <option value="">{placeholder}</option>
    {options.map(o=><option key={o} value={o}>{o}</option>)}
  </select>
);

const Area = ({value, onChange, placeholder, rows=2}) => (
  <textarea value={value} onChange={e=>onChange(e.target.value)}
    placeholder={placeholder} rows={rows}
    style={{background:C.surface,border:`1px solid ${C.border2}`,borderRadius:4,
      color:C.text,fontSize:12,padding:"5px 8px",width:"100%",outline:"none",
      resize:"vertical",fontFamily:"inherit",lineHeight:1.5,boxSizing:"border-box"}}/>
);

const Pill = ({label, active, color, onClick}) => (
  <button onClick={onClick} style={{
    padding:"2px 8px",borderRadius:4,fontSize:11,fontWeight:600,cursor:"pointer",
    background:active?color:"transparent",color:active?"#fff":C.muted,
    border:`1px solid ${active?color:C.border2}`,transition:"all 0.12s",whiteSpace:"nowrap"
  }}>{label}</button>
);

const Tog = ({label, value, onChange, color}) => (
  <button onClick={()=>onChange(!value)} style={{
    padding:"3px 10px",borderRadius:4,fontSize:11,fontWeight:600,cursor:"pointer",
    background:value?`${color}33`:"transparent",color:value?color:C.muted,
    border:`1px solid ${value?color:C.border2}`,transition:"all 0.12s"
  }}>{value?"✓ ":""}{label}</button>
);

const SecHead = ({children, color}) => (
  <div style={{fontSize:9,fontWeight:800,letterSpacing:"0.1em",textTransform:"uppercase",
    color:color||C.muted,marginBottom:8,paddingBottom:5,borderBottom:`1px solid ${C.border}`}}>
    {children}
  </div>
);

// ── TRADE ROW ─────────────────────────────────────────────────
function TradeRow({ trade, index, onChange, onDelete }) {
  const [open, setOpen] = useState(true);
  const upd = (k,v) => onChange({...trade,[k]:v});
  const toggleSig = (s) => upd("signals",
    trade.signals.includes(s) ? trade.signals.filter(x=>x!==s) : [...trade.signals,s]);

  const oc = outcomeColor(trade.outcome);
  const qc = qualityColor(trade.quality);
  const dc = dirColor(trade.direction);

  // Auto-calc R:R when entry/stop/target filled
  const calcRR = () => {
    const e = parseFloat(trade.entry), s = parseFloat(trade.stop), t = parseFloat(trade.target);
    if (!isNaN(e) && !isNaN(s) && !isNaN(t) && e!==s) {
      const risk   = Math.abs(e-s);
      const reward = Math.abs(t-e);
      const rr     = (reward/risk).toFixed(1);
      if (trade.rr !== rr) upd("rr", rr);
    }
  };

  return (
    <div style={{
      background:C.surface,border:`1px solid ${C.border2}`,
      borderLeft:`2px solid ${trade.outcome?oc:C.border2}`,
      borderRadius:8,marginBottom:8,overflow:"hidden"
    }}>
      {/* Trade header */}
      <div onClick={()=>setOpen(!open)} style={{
        display:"flex",alignItems:"center",gap:8,padding:"8px 12px",
        cursor:"pointer",userSelect:"none",background:`${C.card}80`
      }}>
        <div style={{
          width:20,height:20,borderRadius:4,background:C.border,
          display:"flex",alignItems:"center",justifyContent:"center",
          fontSize:10,fontWeight:700,color:C.muted,flexShrink:0
        }}>{index+1}</div>

        {/* Summary chips */}
        <div style={{flex:1,display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>
          {trade.time && <span style={{fontSize:11,color:C.muted,fontFamily:"monospace"}}>{trade.time}</span>}
          {trade.direction && (
            <span style={{fontSize:11,fontWeight:700,padding:"1px 6px",borderRadius:3,
              background:`${dc}22`,color:dc}}>{trade.direction}</span>
          )}
          {trade.signals.length>0 && (
            <span style={{fontSize:10,color:C.teal}}>{trade.signals[0]}{trade.signals.length>1?` +${trade.signals.length-1}`:""}</span>
          )}
          {trade.quality && (
            <span style={{fontSize:11,fontWeight:800,padding:"1px 6px",borderRadius:3,
              background:`${qc}22`,color:qc}}>{trade.quality}</span>
          )}
          {trade.outcome && (
            <span style={{fontSize:11,fontWeight:600,padding:"1px 6px",borderRadius:3,
              background:`${oc}22`,color:oc}}>{trade.outcome}</span>
          )}
          {trade.pnl && (
            <span style={{fontSize:12,fontWeight:700,color:parseFloat(trade.pnl)>=0?C.green:C.red,
              fontFamily:"monospace"}}>{parseFloat(trade.pnl)>=0?"+":""}{trade.pnl}</span>
          )}
          {trade.rr && (
            <span style={{fontSize:10,color:C.muted}}>R:R {trade.rr}</span>
          )}
        </div>

        <div style={{display:"flex",gap:4,alignItems:"center"}}>
          <button onClick={e=>{e.stopPropagation();onDelete();}} title="Delete trade" style={{
            fontSize:10,color:C.muted,background:"transparent",
            border:`1px solid ${C.border}`,borderRadius:4,padding:"1px 6px",cursor:"pointer"
          }}>✕</button>
          <span style={{fontSize:14,color:C.muted}}>{open?"▾":"▸"}</span>
        </div>
      </div>

      {/* Trade body */}
      {open && (
        <div style={{padding:"10px 12px",display:"flex",flexDirection:"column",gap:10}}>

          {/* Row 1: Time, Direction, Quality, Outcome */}
          <div style={{display:"grid",gridTemplateColumns:"100px 1fr 1fr 1fr",gap:8}}>
            <div><Label>Time (CT)</Label><Inp value={trade.time} onChange={v=>upd("time",v)} type="time" mono/></div>
            <div>
              <Label>Direction</Label>
              <div style={{display:"flex",gap:4}}>
                {DIRECTIONS.map(d=>(
                  <Pill key={d} label={d} active={trade.direction===d}
                    color={dirColor(d)} onClick={()=>upd("direction",d)}/>
                ))}
              </div>
            </div>
            <div><Label>Outcome</Label><Sel value={trade.outcome} onChange={v=>upd("outcome",v)} options={OUTCOMES} placeholder="Result…"/></div>
            <div>
              <Label>Quality</Label>
              <div style={{display:"flex",gap:4}}>
                {QUALITY.map(q=>(
                  <Pill key={q} label={q} active={trade.quality===q}
                    color={qualityColor(q)} onClick={()=>upd("quality",q)}/>
                ))}
              </div>
            </div>
          </div>

          {/* Row 2: Entry / Stop / Target / R:R / P&L */}
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 80px 100px",gap:8}}>
            <div><Label>Entry</Label><Inp value={trade.entry} onChange={v=>{upd("entry",v);}} onBlur={calcRR} placeholder="29820.25" mono/></div>
            <div><Label>Stop</Label><Inp value={trade.stop} onChange={v=>upd("stop",v)} placeholder="29795.00" mono/></div>
            <div><Label>Target</Label><Inp value={trade.target} onChange={v=>upd("target",v)} placeholder="29900.00" mono/></div>
            <div>
              <Label>R:R</Label>
              <div style={{display:"flex",gap:4,alignItems:"center"}}>
                <Inp value={trade.rr} onChange={v=>upd("rr",v)} placeholder="—" mono/>
                <button onClick={calcRR} title="Auto-calculate" style={{
                  flexShrink:0,padding:"4px 6px",borderRadius:4,fontSize:10,
                  background:C.border,color:C.muted,border:"none",cursor:"pointer"
                }}>⟳</button>
              </div>
            </div>
            <div><Label>P&L ($)</Label><Inp value={trade.pnl} onChange={v=>upd("pnl",v)} placeholder="±0.00" mono/></div>
          </div>

          {/* Row 3: Signals */}
          <div>
            <Label color={C.teal}>ICT / SMC Signals</Label>
            <div style={{display:"flex",flexWrap:"wrap",gap:5,marginTop:2}}>
              {SIGNALS.map(s=>(
                <Pill key={s} label={s} active={trade.signals.includes(s)}
                  color={C.teal} onClick={()=>toggleSig(s)}/>
              ))}
            </div>
          </div>

          {/* Row 4: Notes + Lesson */}
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
            <div>
              <Label>Trade Notes</Label>
              <Area value={trade.notes} onChange={v=>upd("notes",v)}
                placeholder="Entry trigger, delta at entry, bar speed, structural level…" rows={2}/>
            </div>
            <div>
              <Label>Lesson (one sentence)</Label>
              <Area value={trade.lesson} onChange={v=>upd("lesson",v)}
                placeholder="What this trade taught you — be specific about the signal and outcome." rows={2}/>
            </div>
          </div>

        </div>
      )}
    </div>
  );
}

// ── DAY EDITOR ────────────────────────────────────────────────
function DayEditor({ date, day, hasEntry, onChange, onDelete, onClose }) {
  const upd = (k,v) => onChange({...day,[k]:v});

  const updateTrade = (id, updated) =>
    upd("trades", day.trades.map(t=>t.id===id?updated:t));
  const deleteTrade = (id) =>
    upd("trades", day.trades.filter(t=>t.id!==id));
  const addTrade = () =>
    upd("trades", [...day.trades, emptyTrade()]);

  const wins   = day.trades.filter(t=>t.outcome==="Target Hit").length;
  const losses = day.trades.filter(t=>t.outcome==="Stop Out").length;
  const total  = wins+losses;
  const wr     = total ? Math.round(wins/total*100) : null;
  const dayPnl = day.trades.reduce((a,t)=>a+(parseFloat(t.pnl)||0),0);

  return (
    <div style={{
      background:C.card,border:`1px solid ${C.border2}`,
      borderLeft:`3px solid ${day.sessionType ? sessionBg(day.sessionType) : C.purple}`,
      borderRadius:10,padding:"14px 16px",marginTop:14
    }}>
      {/* Header */}
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",
        marginBottom:12,flexWrap:"wrap",gap:8}}>
        <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
          <div style={{fontSize:14,fontWeight:700,color:C.text,fontFamily:"monospace"}}>{date}</div>
          {day.sessionType && (
            <span style={{fontSize:11,fontWeight:600,padding:"2px 8px",borderRadius:4,
              background:sessionBg(day.sessionType),color:sessionTxt(day.sessionType)}}>{day.sessionType}</span>
          )}
          {day.trades.length>0 && (
            <span style={{fontSize:11,color:C.muted}}>{day.trades.length} trade{day.trades.length!==1?"s":""}</span>
          )}
          {wr!==null && (
            <span style={{fontSize:11,fontWeight:600,color:wr>=60?C.green:wr>=40?C.amber:C.red}}>{wr}% WR</span>
          )}
          {dayPnl!==0 && (
            <span style={{fontSize:12,fontWeight:700,fontFamily:"monospace",
              color:dayPnl>=0?C.green:C.red}}>{dayPnl>=0?"+":""}{dayPnl.toFixed(0)}</span>
          )}
          {day.sessionClassCorrect && (
            <span style={{fontSize:10,padding:"1px 5px",borderRadius:3,
              background:day.sessionClassCorrect==="Yes"?C.greenDim:C.redDim,
              color:day.sessionClassCorrect==="Yes"?C.green:C.red}}>
              Class: {day.sessionClassCorrect}
            </span>
          )}
        </div>
        <div style={{display:"flex",gap:6,flexShrink:0}}>
          {hasEntry && (
            <button onClick={onDelete} style={{fontSize:11,color:C.red,
              background:C.redDim,border:`1px solid ${C.red}44`,borderRadius:4,
              padding:"3px 10px",cursor:"pointer"}}>✕ Delete Day</button>
          )}
          <button onClick={onClose} style={{fontSize:11,color:C.muted,background:"transparent",
            border:`1px solid ${C.border}`,borderRadius:4,padding:"3px 10px",cursor:"pointer"}}>Close</button>
        </div>
      </div>

      <div style={{display:"flex",flexDirection:"column",gap:14}}>

        {/* Session context */}
        <div>
          <SecHead color={C.purple}>Session Context</SecHead>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr",gap:10,marginBottom:10}}>
            <div><Label>Session Type</Label><Sel value={day.sessionType} onChange={v=>upd("sessionType",v)} options={SESSION_TYPES} placeholder="Classify…"/></div>
            <div><Label>Open Type</Label><Sel value={day.openType} onChange={v=>upd("openType",v)} options={OPEN_TYPES} placeholder="Open…"/></div>
            <div><Label>ATR State</Label><Sel value={day.atrState} onChange={v=>upd("atrState",v)} options={ATR_STATES} placeholder="ATR…"/></div>
            <div><Label>Delta Bias</Label><Sel value={day.deltaBias} onChange={v=>upd("deltaBias",v)} options={DELTA_BIAS} placeholder="Delta…"/></div>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
            <div><Label>Regime</Label><Sel value={day.regime} onChange={v=>upd("regime",v)} options={REGIMES} placeholder="Regime…"/></div>
            <div style={{display:"flex",gap:8,alignItems:"flex-end"}}>
              <div style={{flex:1}}>
                <Label>Session Class Correct?</Label>
                <div style={{display:"flex",gap:5}}>
                  {["Yes","No","N/A"].map(opt=>(
                    <Pill key={opt} label={opt} active={day.sessionClassCorrect===opt}
                      color={opt==="Yes"?C.green:opt==="No"?C.red:C.amber}
                      onClick={()=>upd("sessionClassCorrect",opt)}/>
                  ))}
                </div>
              </div>
              <div style={{display:"flex",gap:5}}>
                <Tog label="Vol Spike" value={day.volSpike} onChange={v=>upd("volSpike",v)} color={C.green}/>
                <Tog label="Range Expand" value={day.rangeExpand} onChange={v=>upd("rangeExpand",v)} color={C.amber}/>
                <Tog label="Sweep" value={day.sweep} onChange={v=>upd("sweep",v)} color={C.red}/>
              </div>
            </div>
          </div>
        </div>

        {/* VP levels */}
        <div>
          <SecHead color={C.purple}>Volume Profile Levels</SecHead>
          <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:8}}>
            {[["pdVAH","pdVAH"],["pdVAL","pdVAL"],["pdPOC","pdPOC"],
              ["VAH","vah"],["VAL","val"],["POC","poc"],["LVN","lvn"]
            ].map(([label,key])=>(
              <div key={key}>
                <Label>{label}</Label>
                <Inp value={day[key]} onChange={v=>upd(key,v)} placeholder="—" mono/>
              </div>
            ))}
          </div>
        </div>

        {/* Trades section */}
        <div>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:8}}>
            <SecHead color={C.green}>Trades ({day.trades.length})</SecHead>
            <button onClick={addTrade} style={{
              padding:"4px 12px",borderRadius:6,fontSize:11,fontWeight:600,
              background:C.greenDim,color:C.green,border:`1px solid ${C.green}44`,
              cursor:"pointer",marginBottom:8
            }}>+ Add Trade</button>
          </div>
          {day.trades.length===0 && (
            <div style={{fontSize:12,color:C.muted,padding:"10px 0"}}>No trades logged for this day yet.</div>
          )}
          {day.trades.map((trade,i)=>(
            <TradeRow key={trade.id} trade={trade} index={i}
              onChange={updated=>updateTrade(trade.id,updated)}
              onDelete={()=>deleteTrade(trade.id)}/>
          ))}
        </div>

        {/* Day summary */}
        <div>
          <SecHead color={C.amber}>Day Summary</SecHead>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
            <div>
              <Label>Best Setup of the Day</Label>
              <Area value={day.bestSetup} onChange={v=>upd("bestSetup",v)}
                placeholder="Describe the one highest-quality setup — taken or missed." rows={2}/>
            </div>
            <div>
              <Label>Day Notes / Observations</Label>
              <Area value={day.dayNotes} onChange={v=>upd("dayNotes",v)}
                placeholder="Overall session character, unusual behaviour, patterns noticed." rows={2}/>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}

// ── MONTH CALENDAR ────────────────────────────────────────────
function MonthCalendar({ days, year, month, onPrev, onNext, onToday, selectedDate, onSelect }) {
  const weeks = useMemo(()=>buildMonthWeeks(year,month), [year,month]);

  const monthStats = useMemo(()=>{
    let loggedDays=0, trades=0;
    Object.entries(days).forEach(([d,entry])=>{
      const dt = parseDate(d);
      if (dt.getFullYear()===year && dt.getMonth()===month) {
        loggedDays++;
        trades += entry.trades.length;
      }
    });
    return { loggedDays, trades };
  }, [days, year, month]);

  return (
    <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:10,padding:"16px 18px"}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:14,flexWrap:"wrap",gap:8}}>
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
        <div style={{fontSize:11,color:C.muted}}>
          {monthStats.loggedDays} day{monthStats.loggedDays!==1?"s":""} logged · {monthStats.trades} trade{monthStats.trades!==1?"s":""}
        </div>
      </div>

      <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:4,marginBottom:4}}>
        {DOW.map(d=>(
          <div key={d} style={{fontSize:9,fontWeight:700,color:C.muted,textAlign:"center",
            textTransform:"uppercase",letterSpacing:"0.06em",padding:"2px 0"}}>{d}</div>
        ))}
      </div>

      {weeks.map((week,wi)=>(
        <div key={wi} style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:4,marginBottom:4}}>
          {week.map(cell=>{
            const entry = days[cell.date];
            const isSelected = cell.date===selectedDate;
            return (
              <div key={cell.date} onClick={()=>onSelect(cell.date)}
                style={{
                  minHeight:64,borderRadius:6,padding:"6px 7px",cursor:"pointer",
                  background: isSelected ? `${C.purple}22` : sessionBg(entry?.sessionType),
                  border:`1px solid ${isSelected?C.purple:cell.isToday?C.amber:"transparent"}`,
                  opacity: cell.otherMonth?0.35:1,
                  display:"flex",flexDirection:"column",justifyContent:"space-between",
                }}>
                <div style={{fontSize:10,color:cell.isToday?C.amber:C.muted,fontWeight:cell.isToday?800:600}}>{cell.day}</div>
                {entry && (
                  <div style={{display:"flex",flexDirection:"column",gap:2}}>
                    {entry.trades.length>0 && (
                      <div style={{fontSize:10,fontWeight:600,color:C.muted}}>
                        {entry.trades.length} trade{entry.trades.length!==1?"s":""}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

// ── STATS BAR ─────────────────────────────────────────────────
function StatsBar({ days }) {
  const allTrades  = days.flatMap(d=>d.trades);
  const wins       = allTrades.filter(t=>t.outcome==="Target Hit").length;
  const losses     = allTrades.filter(t=>t.outcome==="Stop Out").length;
  const total      = wins+losses;
  const wr         = total ? Math.round(wins/total*100) : null;
  const netPnl     = allTrades.reduce((a,t)=>a+(parseFloat(t.pnl)||0),0);
  const aGrade     = allTrades.filter(t=>t.quality==="A").length;
  const daysLogged = days.length;
  const classified = days.filter(d=>d.sessionClassCorrect).length;
  const correct    = days.filter(d=>d.sessionClassCorrect==="Yes").length;
  const classAcc   = classified ? Math.round(correct/classified*100) : null;
  const avgPnl     = daysLogged ? (netPnl/daysLogged).toFixed(0) : null;

  const stat = (label, value, color=C.text) => (
    <div style={{textAlign:"center",padding:"0 14px",borderRight:`1px solid ${C.border}`}}>
      <div style={{fontSize:20,fontWeight:700,color,fontFamily:"'JetBrains Mono',monospace",lineHeight:1}}>{value}</div>
      <div style={{fontSize:9,color:C.muted,marginTop:4,textTransform:"uppercase",letterSpacing:"0.06em"}}>{label}</div>
    </div>
  );

  return (
    <div style={{
      background:C.card,border:`1px solid ${C.border}`,borderRadius:10,
      padding:"14px 20px",marginBottom:16,
      display:"flex",alignItems:"center",flexWrap:"wrap",gap:0,overflowX:"auto"
    }}>
      {stat("Days",daysLogged)}
      {stat("Trades",allTrades.length)}
      {stat("Win Rate",wr!==null?`${wr}%`:"—",wr===null?C.muted:wr>=60?C.green:wr>=40?C.amber:C.red)}
      {stat("Net P&L",netPnl!==0?`$${netPnl.toFixed(0)}`:"—",netPnl>=0?C.green:C.red)}
      {stat("Avg/Day",avgPnl?`$${avgPnl}`:"—",parseFloat(avgPnl)>=0?C.green:C.red)}
      {stat("A-Grade",aGrade,C.green)}
      {stat("Class Acc",classAcc!==null?`${classAcc}%`:"—",classAcc===null?C.muted:classAcc>=70?C.green:C.amber)}
    </div>
  );
}

// ── RECOMMENDATIONS CARD ──────────────────────────────────────
function RecommendationsCard() {
  const [rec, setRec] = useState(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");

  useEffect(()=>{
    let cancelled = false;
    (async ()=>{
      try {
        const data = await getRecommendation();
        if (!cancelled) setRec(data);
      } catch(e) {
        if (e.status !== 404) console.error("Failed to load recommendation", e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return ()=>{ cancelled = true; };
  },[]);

  const generate = async () => {
    setGenerating(true);
    setError("");
    try {
      const data = await generateRecommendation();
      setRec(data);
    } catch(e) {
      console.error("Failed to generate recommendation", e);
      setError(e.message || "Failed to generate recommendation.");
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:10,padding:"14px 16px"}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",
        marginBottom:12,paddingBottom:6,borderBottom:`1px solid ${C.border}`,flexWrap:"wrap",gap:8}}>
        <div style={{fontSize:10,fontWeight:800,color:C.purple,textTransform:"uppercase",letterSpacing:"0.08em"}}>
          Actionable Trading Recommendations
        </div>
        <button onClick={generate} disabled={generating} style={{
          padding:"5px 12px",borderRadius:6,fontSize:11,fontWeight:600,
          cursor:generating?"not-allowed":"pointer",
          background:`${C.purple}22`,color:C.purple,border:`1px solid ${C.purple}55`,
          opacity:generating?0.6:1,
        }}>{generating?"Generating…":rec?"↻ Regenerate":"Generate Recommendation"}</button>
      </div>

      {loading ? (
        <div style={{fontSize:12,color:C.muted}}>Loading…</div>
      ) : error ? (
        <div style={{fontSize:12,color:C.red}}>{error}</div>
      ) : rec ? (
        <div>
          <div style={{fontSize:12,color:C.text,lineHeight:1.7,whiteSpace:"pre-wrap"}}>{rec.text}</div>
          <div style={{fontSize:10,color:C.dim,marginTop:10}}>
            Generated {new Date(rec.generatedAt).toLocaleString()} · based on {rec.daysAnalyzed} logged day{rec.daysAnalyzed!==1?"s":""}
          </div>
        </div>
      ) : (
        <div style={{fontSize:12,color:C.muted}}>
          No recommendation generated yet — click "Generate Recommendation" to analyze your last 30 days.
        </div>
      )}
    </div>
  );
}

// ── SUMMARY TAB ───────────────────────────────────────────────
function SummaryTab({ days }) {
  const allTrades = days.flatMap(d=>d.trades);
  const daysLogged = days;

  // Signal frequency
  const sigCount = {};
  allTrades.forEach(t=>t.signals.forEach(s=>{ sigCount[s]=(sigCount[s]||0)+1; }));
  const topSigs = Object.entries(sigCount).sort((a,b)=>b[1]-a[1]);

  // Outcome distribution
  const outCount = {};
  OUTCOMES.forEach(o=>{ outCount[o]=0; });
  allTrades.forEach(t=>{ if(t.outcome) outCount[t.outcome]=(outCount[t.outcome]||0)+1; });

  // Session distribution
  const sessCount = {};
  SESSION_TYPES.forEach(s=>{ sessCount[s]=0; });
  daysLogged.forEach(d=>{ if(d.sessionType) sessCount[d.sessionType]=(sessCount[d.sessionType]||0)+1; });

  // Quality distribution
  const qualCount = {};
  QUALITY.forEach(q=>{ qualCount[q]=0; });
  allTrades.forEach(t=>{ if(t.quality) qualCount[t.quality]=(qualCount[t.quality]||0)+1; });

  // Win rate by quality
  const wrByQuality = {};
  QUALITY.forEach(q=>{
    const trades = allTrades.filter(t=>t.quality===q);
    const w = trades.filter(t=>t.outcome==="Target Hit").length;
    const l = trades.filter(t=>t.outcome==="Stop Out").length;
    wrByQuality[q] = w+l ? Math.round(w/(w+l)*100) : null;
  });

  // Recent lessons
  const lessons = allTrades
    .filter(t=>t.lesson.trim())
    .slice(-10)
    .reverse();

  const hasData = daysLogged.length>0;

  const Card = ({title, color, children}) => (
    <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:10,padding:"14px 16px"}}>
      <div style={{fontSize:10,fontWeight:800,color:color||C.muted,textTransform:"uppercase",
        letterSpacing:"0.08em",marginBottom:12,paddingBottom:6,borderBottom:`1px solid ${C.border}`}}>
        {title}
      </div>
      {children}
    </div>
  );

  const Bar = ({label, value, max, color}) => (
    <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:5}}>
      <div style={{fontSize:11,color:C.text,width:130,flexShrink:0}}>{label}</div>
      <div style={{flex:1,height:5,background:C.border,borderRadius:3,overflow:"hidden"}}>
        <div style={{width:`${max?Math.round(value/max*100):0}%`,height:"100%",
          borderRadius:3,background:color,transition:"width 0.4s"}}/>
      </div>
      <div style={{fontSize:11,color:C.muted,width:24,textAlign:"right"}}>{value}</div>
    </div>
  );

  return (
    <div style={{display:"flex",flexDirection:"column",gap:12}}>
      {!hasData && (
        <div style={{textAlign:"center",padding:"40px 20px",color:C.muted}}>
          No data in the last 30 days — log a day in the Calendar tab first.
        </div>
      )}
      {hasData && (
      <>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
        <Card title="Signal Frequency" color={C.teal}>
          {topSigs.length===0
            ? <div style={{fontSize:12,color:C.muted}}>No signals logged yet</div>
            : topSigs.map(([sig,cnt])=>(
              <Bar key={sig} label={sig} value={cnt} max={topSigs[0][1]} color={C.teal}/>
            ))
          }
        </Card>
        <Card title="Session Distribution" color={C.purple}>
          {SESSION_TYPES.map(s=>(
            <Bar key={s} label={s} value={sessCount[s]||0} max={daysLogged.length}
              color={s.includes("Trend")?C.green:s==="Ranging"?C.purple:s==="Choppy"?C.red:C.muted}/>
          ))}
        </Card>
        <Card title="Outcome Distribution" color={C.green}>
          {OUTCOMES.map(o=>(
            <Bar key={o} label={o} value={outCount[o]||0}
              max={Math.max(...Object.values(outCount))} color={outcomeColor(o)}/>
          ))}
        </Card>
        <Card title="Win Rate by Quality Grade" color={C.amber}>
          {QUALITY.map(q=>(
            <div key={q} style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
              <div style={{fontSize:13,fontWeight:800,color:qualityColor(q),width:30}}>{q}</div>
              <div style={{fontSize:12,color:C.muted,width:50}}>{qualCount[q]} trades</div>
              <div style={{flex:1,height:5,background:C.border,borderRadius:3,overflow:"hidden"}}>
                <div style={{
                  width:`${wrByQuality[q]||0}%`,height:"100%",
                  borderRadius:3,background:qualityColor(q)
                }}/>
              </div>
              <div style={{fontSize:12,fontWeight:700,color:qualityColor(q),width:36,textAlign:"right"}}>
                {wrByQuality[q]!==null?`${wrByQuality[q]}%`:"—"}
              </div>
            </div>
          ))}
        </Card>
      </div>

      {lessons.length>0 && (
        <Card title="Recent Lessons" color={C.amber}>
          {lessons.map((t,i)=>(
            <div key={i} style={{
              padding:"8px 10px",borderRadius:6,background:C.surface,
              marginBottom:6,fontSize:12,color:C.text,lineHeight:1.55,
              borderLeft:`2px solid ${C.amber}`
            }}>{t.lesson}</div>
          ))}
        </Card>
      )}
      </>
      )}

      <RecommendationsCard/>
    </div>
  );
}

// ── GUIDE TAB ─────────────────────────────────────────────────
function GuideTab() {
  const items = [
    ["Session Classification","Trending: 3+ large same-direction candles in first 30min, one-sided delta. Ranging: price oscillates inside clear VA, balanced delta. Choppy: alternating large candles, no net direction, mixed delta both sides. Undecided: ambiguous first 30min — wait before classifying."],
    ["Quality Grade","A: 3+ signals align, structural stop correctly placed, clear destination level, session classified correctly. B: 2 signals present, acceptable R:R, minor hesitation. C: 1 signal, marginal setup, entered despite uncertainty. Skip: conditions unclear, session untradeable, no valid setup visible."],
    ["ICT / SMC Signals","FVG Retest: enter on pullback to gap zone — trending days only. CHoCH: structural break confirmed by delta. LVN Rejection: fade only in ranging environments. Vol Climax: one enormous volume bar at structural level = exhaustion. Compression Coil: 6+ slow small bars then sharp resolution. Sweep+Rev: liquidity grab then immediate reversal."],
    ["Delta Bias Reading","Strongly +/−: one side overwhelmingly dominant. Mildly +/−: slight lean. Neutral: balanced. Mixed: large positive AND negative at same levels = two sides fighting = lower conviction = ranging or choppy day likely."],
    ["ATR State","Trending ↑/↓: trail stepping consistently in one direction, structural bias confirmed. Flip Long/Short: the CHoCH analogue — critical moment for entry or exit. Choppy: trail flipping both directions within short window = do not trade directionally."],
    ["Session Classification Accuracy","Record pre-session classification within first 30 minutes. Verify at EOD. Target 70%+ accuracy across 30 days. This single metric is the most important in the log — it measures the skill that prevents most overtrading losses."],
    ["Lesson Quality","One sentence only. Force specificity: not 'I should have been more patient' but 'I entered long at pdVAL without checking that delta on the rally was negative, meaning the bounce was distribution not accumulation.'"],
    ["R:R Auto-Calculation","Fill Entry, Stop, and Target fields then press ⟳ to auto-calculate the Risk:Reward ratio. 1.0 = break-even at 50% win rate. 3.0+ = target with 25% win rate. Your best historical trades should cluster around 3:1 or better."],
    ["Vol Spike / Range Expand","Vol Spike: single bar at a structural level with 3-5× surrounding volume = climax, all supply absorbed. Range Expand: session range expanding significantly beyond prior day range = potential trend day forming or news reaction."],
    ["Best Setup of the Day","One per day, regardless of whether you took it. Describing the best setup — even missed ones — trains pattern recognition faster than only recording trades taken. The missed setup is often more instructive than the taken one."],
  ];
  return (
    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
      {items.map(([title,body])=>(
        <div key={title} style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:10,padding:"14px 16px"}}>
          <div style={{fontSize:10,fontWeight:700,color:C.purple,marginBottom:6,
            textTransform:"uppercase",letterSpacing:"0.07em"}}>{title}</div>
          <div style={{fontSize:12,color:C.muted,lineHeight:1.65}}>{body}</div>
        </div>
      ))}
    </div>
  );
}

// ── MAIN APP ──────────────────────────────────────────────────
export default function App() {
  const [days, setDays] = useState({});
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("calendar");
  const [saveStatus, setSaveStatus] = useState("saved");
  const today = new Date();
  const [calYear, setCalYear]   = useState(today.getFullYear());
  const [calMonth, setCalMonth] = useState(today.getMonth());
  const [selectedDate, setSelectedDate] = useState(null);

  const saveTimersRef = useRef({});

  // Initial load from the API
  useEffect(()=>{
    let cancelled = false;
    (async ()=>{
      try {
        const items = await listLogs();
        if (cancelled) return;
        const map = {};
        items.forEach(item => {
          const { date, trades, ...rest } = item;
          map[date] = {
            ...emptyDayData(),
            ...rest,
            trades: (trades||[]).map(t=>({ ...t, id: ++tradeCounter })),
          };
        });
        setDays(map);
      } catch(e) {
        console.error("Failed to load trading logs", e);
        setSaveStatus("error");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return ()=>{ cancelled = true; };
  },[]);

  const daysArray = useMemo(()=>
    Object.entries(days).map(([date,d])=>({date,...d})),
  [days]);

  const rolling30 = useMemo(()=>{
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate()-29);
    const cutoffStr = fmtDate(cutoff);
    return daysArray.filter(d=>d.date>=cutoffStr).sort((a,b)=>a.date.localeCompare(b.date));
  }, [daysArray]);

  const saveDay = useCallback((date, dayData) => {
    clearTimeout(saveTimersRef.current[date]);
    saveTimersRef.current[date] = setTimeout(async () => {
      setSaveStatus("saving");
      try {
        await upsertLog({ date, ...dayData });
        setSaveStatus("saved");
      } catch(e) {
        console.error("Failed to save trading log", e);
        setSaveStatus("error");
      }
    }, 500);
  }, []);

  const updateDay = (date, updated) => {
    setDays(d => ({ ...d, [date]: updated }));
    saveDay(date, updated);
  };

  const deleteDay = (date) => {
    setDays(d => { const n = {...d}; delete n[date]; return n; });
    setSelectedDate(s => s===date ? null : s);
    clearTimeout(saveTimersRef.current[date]);
    deleteLog(date).catch(e=>console.error("Failed to delete trading log", e));
  };

  const prevMonth = () => { calMonth===0 ? (setCalMonth(11), setCalYear(y=>y-1)) : setCalMonth(m=>m-1); };
  const nextMonth = () => { calMonth===11 ? (setCalMonth(0), setCalYear(y=>y+1)) : setCalMonth(m=>m+1); };
  const goToday   = () => { setCalYear(today.getFullYear()); setCalMonth(today.getMonth()); setSelectedDate(todayStr()); };

  const exportData = useCallback(()=>{
    const blob = new Blob([JSON.stringify(days,null,2)],{type:"application/json"});
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href=url; a.download=`chart_observation_log_${todayStr()}.json`;
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
          if (!parsed || typeof parsed!=="object") { alert("Invalid file."); return; }
          let obj;
          if (Array.isArray(parsed)) {
            // Backward-compat with the old array-of-days export format.
            obj = {};
            // eslint-disable-next-line no-unused-vars
            parsed.forEach(d => { if (d.date) { const {id, date, ...rest} = d; obj[date] = rest; } });
          } else {
            obj = parsed;
          }
          setDays(obj);
          Object.entries(obj).forEach(([date,data]) => saveDay(date, data));
        } catch { alert("Invalid file."); }
      };
      reader.readAsText(file);
    };
    input.click();
  },[saveDay]);

  const clearAll = useCallback(()=>{
    if(window.confirm("Clear all data? This cannot be undone.")) {
      Object.values(saveTimersRef.current).forEach(clearTimeout);
      saveTimersRef.current = {};
      Object.keys(days).forEach(date => deleteLog(date).catch(e=>console.error("Failed to delete trading log", e)));
      setDays({});
      setSelectedDate(null);
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
        Loading trading logs…
      </div>
    );
  }

  return (
    <div style={{
      background:C.bg,color:C.text,minHeight:"100vh",
      fontFamily:"'Inter',system-ui,sans-serif",
      padding:"20px 18px",maxWidth:1000,margin:"0 auto"
    }}>

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
            Chart Observation Log
          </h1>
          <p style={{margin:0,fontSize:12,color:C.muted,lineHeight:1.6}}>
            Volume Profile · ICT/SMC · Delta · Session Classification · Multiple Trades Per Day
          </p>
        </div>

        <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:8}}>
          <div style={{display:"flex",alignItems:"center",gap:6}}>
            <div style={{width:7,height:7,borderRadius:"50%",background:statusColor,transition:"background 0.3s"}}/>
            <span style={{fontSize:10,fontWeight:600,textTransform:"uppercase",
              letterSpacing:"0.06em",color:statusColor}}>{statusLabel}</span>
          </div>
          <div style={{display:"flex",gap:6}}>
            {[["⬆ Export",exportData,C.teal],["⬇ Import",importData,C.blue],["✕ Clear",clearAll,C.red]]
              .map(([label,fn,color])=>(
                <button key={label} onClick={fn} style={{
                  padding:"5px 12px",borderRadius:6,fontSize:11,fontWeight:600,cursor:"pointer",
                  background:`${color}22`,color,border:`1px solid ${color}44`
                }}>{label}</button>
              ))
            }
          </div>
          <div style={{fontSize:10,color:C.dim}}>Synced to AWS</div>
        </div>
      </div>

      <StatsBar days={daysArray}/>

      {/* Tabs */}
      <div style={{display:"flex",gap:6,marginBottom:14,
        borderBottom:`1px solid ${C.border}`,paddingBottom:10,flexWrap:"wrap"}}>
        {[["calendar","Calendar"],["summary","30-Day Summary"],["guide","Field Guide"]].map(([id,label])=>(
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
            <DayEditor date={selectedDate} day={days[selectedDate] || emptyDayData()}
              hasEntry={!!days[selectedDate]}
              onChange={updated=>updateDay(selectedDate, updated)}
              onDelete={()=>deleteDay(selectedDate)}
              onClose={()=>setSelectedDate(null)}/>
          )}
        </div>
      )}

      {tab==="summary" && <SummaryTab days={rolling30}/>}
      {tab==="guide"   && <GuideTab/>}

    </div>
  );
}
