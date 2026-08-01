import { useState, useCallback, useRef } from "react";
import { Link } from "react-router-dom";

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

// ── CONFIG ────────────────────────────────────────────────────
const DEFAULT_CONFIG = {
  totalTrades:   100,
  riskPerTrade:  100,   // $ per trade (1R)
  winProb:       50,    // % — pure random = 50
  commission:    1.30,  // per trade (MNQ default)
  rrRatio:       1.0,   // reward:risk
};

// ── HELPERS ───────────────────────────────────────────────────
const rnd = (p) => Math.random() * 100 < p; // true = win

function runSimulation(config, seed) {
  const { totalTrades, riskPerTrade, winProb, commission, rrRatio } = config;
  const reward = riskPerTrade * rrRatio;
  const trades = [];
  let equity = 0;
  let peak   = 0;
  let maxDD  = 0;
  let streak = 0;
  let maxWinStreak = 0;
  let maxLoseStreak = 0;
  let curWinStreak  = 0;
  let curLoseStreak = 0;

  for (let i = 0; i < totalTrades; i++) {
    const win  = rnd(winProb);
    const gross = win ? reward : -riskPerTrade;
    const net   = gross - commission;
    equity += net;

    if (equity > peak) peak = equity;
    const dd = peak - equity;
    if (dd > maxDD) maxDD = dd;

    streak = win ? (streak > 0 ? streak + 1 : 1) : (streak < 0 ? streak - 1 : -1);
    if (win)  { curWinStreak++;  curLoseStreak=0; maxWinStreak  = Math.max(maxWinStreak,  curWinStreak);  }
    else      { curLoseStreak++; curWinStreak=0;  maxLoseStreak = Math.max(maxLoseStreak, curLoseStreak); }

    trades.push({
      n:      i + 1,
      win,
      gross,
      net,
      equity: Math.round(equity * 100) / 100,
      streak,
    });
  }

  const wins   = trades.filter(t=>t.win).length;
  const losses = trades.filter(t=>!t.win).length;
  const grossPnl = wins * reward - losses * riskPerTrade;
  const totalComm = totalTrades * commission;
  const netPnl = grossPnl - totalComm;

  // Consecutive streaks analysis
  const streaks = { win: [], lose: [] };
  let cur = null, len = 0;
  trades.forEach(t => {
    const type = t.win ? "win" : "lose";
    if (type === cur) { len++; }
    else { if (cur) streaks[cur].push(len); cur = type; len = 1; }
  });
  if (cur) streaks[cur].push(len);

  return {
    trades, wins, losses, netPnl: Math.round(netPnl*100)/100,
    grossPnl: Math.round(grossPnl*100)/100, totalComm,
    winRate: Math.round(wins/totalTrades*100),
    maxDD: Math.round(maxDD*100)/100, maxWinStreak, maxLoseStreak,
    streaks, peak: Math.round(peak*100)/100,
    finalEquity: Math.round(equity*100)/100,
  };
}

function runMultiple(config, n=1000) {
  const results = Array.from({length:n}, () => runSimulation(config));
  const netPnls    = results.map(r=>r.netPnl).sort((a,b)=>a-b);
  const winRates   = results.map(r=>r.winRate);
  const maxDDs     = results.map(r=>r.maxDD);
  const maxLoseSt  = results.map(r=>r.maxLoseStreak);

  const pct = (arr, p) => arr[Math.floor(arr.length * p / 100)];
  const avg = (arr) => arr.reduce((a,b)=>a+b,0)/arr.length;

  return {
    profitable:  results.filter(r=>r.netPnl>0).length,
    breakeven:   results.filter(r=>r.netPnl===0).length,
    loss:        results.filter(r=>r.netPnl<0).length,
    p5:   pct(netPnls, 5),   p25: pct(netPnls, 25),
    p50:  pct(netPnls, 50),  p75: pct(netPnls, 75),
    p95:  pct(netPnls, 95),
    avgNetPnl:   Math.round(avg(netPnls)*100)/100,
    avgWinRate:  Math.round(avg(winRates)*10)/10,
    avgMaxDD:    Math.round(avg(maxDDs)*100)/100,
    avgMaxLose:  Math.round(avg(maxLoseSt)*10)/1,
    worstDD:     Math.round(Math.max(...maxDDs)*100)/100,
    bestResult:  Math.round(Math.max(...netPnls)*100)/100,
    worstResult: Math.round(Math.min(...netPnls)*100)/100,
    netPnls,     winRates, maxDDs, maxLoseSt,
  };
}

// ── PRIMITIVE COMPONENTS ──────────────────────────────────────
const Label = ({c, children}) => (
  <div style={{fontSize:9,fontWeight:800,color:c||C.muted,
    textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:3}}>{children}</div>
);

const Stat = ({label, value, sub, color}) => (
  <div style={{background:C.surface,border:`1px solid ${C.border2}`,
    borderRadius:8,padding:"12px 14px",textAlign:"center"}}>
    <div style={{fontSize:22,fontWeight:700,color:color||C.text,
      fontFamily:"'JetBrains Mono',monospace",lineHeight:1}}>{value}</div>
    <div style={{fontSize:9,color:C.muted,marginTop:4,textTransform:"uppercase",
      letterSpacing:"0.06em"}}>{label}</div>
    {sub && <div style={{fontSize:10,color:C.dim,marginTop:2}}>{sub}</div>}
  </div>
);

const SecHead = ({children, color}) => (
  <div style={{fontSize:9,fontWeight:800,letterSpacing:"0.1em",textTransform:"uppercase",
    color:color||C.muted,marginBottom:10,paddingBottom:5,
    borderBottom:`1px solid ${C.border}`}}>{children}</div>
);

// ── EQUITY CURVE ──────────────────────────────────────────────
function EquityCurve({ trades, height=200 }) {
  if (!trades.length) return null;
  const equities = trades.map(t=>t.equity);
  const min = Math.min(0, ...equities);
  const max = Math.max(0, ...equities);
  const range = max - min || 1;
  const W = 600, H = height, PAD = 30;
  const iW = W - PAD * 2, iH = H - PAD * 2;

  const x = (i) => PAD + (i / (trades.length - 1)) * iW;
  const y = (v) => PAD + iH - ((v - min) / range) * iH;

  const pts = trades.map((t,i) => `${x(i)},${y(t.equity)}`).join(" ");
  const area = `M${PAD},${y(0)} ` + trades.map((t,i)=>`L${x(i)},${y(t.equity)}`).join(" ") + ` L${x(trades.length-1)},${y(0)} Z`;

  const zero_y = y(0);
  const finalColor = trades[trades.length-1]?.equity >= 0 ? C.green : C.red;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{width:"100%",height,display:"block"}}>
      <defs>
        <linearGradient id="eq_grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={finalColor} stopOpacity="0.3"/>
          <stop offset="100%" stopColor={finalColor} stopOpacity="0.02"/>
        </linearGradient>
        <clipPath id="above"><rect x={PAD} y={PAD} width={iW} height={zero_y - PAD}/></clipPath>
        <clipPath id="below"><rect x={PAD} y={zero_y} width={iW} height={PAD + iH - zero_y}/></clipPath>
      </defs>

      {/* Grid lines */}
      {[0.25,0.5,0.75].map(p=>{
        const gy = PAD + iH * p;
        return <line key={p} x1={PAD} x2={W-PAD} y1={gy} y2={gy} stroke={C.border} strokeWidth="0.5"/>;
      })}

      {/* Zero line */}
      <line x1={PAD} x2={W-PAD} y1={zero_y} y2={zero_y} stroke={C.border2} strokeWidth="1" strokeDasharray="4 3"/>

      {/* Area fill */}
      <path d={area} fill="url(#eq_grad)" clipPath="url(#above)"/>
      <path d={area} fill={C.redDim} fillOpacity="0.3" clipPath="url(#below)"/>

      {/* Equity line */}
      <polyline points={pts} fill="none" stroke={finalColor} strokeWidth="1.5" strokeLinejoin="round"/>

      {/* Trade dots — wins/losses */}
      {trades.filter((_,i)=>i%5===0).map((t,_,arr,i=trades.indexOf(t))=>(
        <circle key={i} cx={x(i)} cy={y(t.equity)} r="2"
          fill={t.win ? C.green : C.red} fillOpacity="0.7"/>
      ))}

      {/* Labels */}
      <text x={PAD-4} y={y(max)+4} fontSize="9" fill={C.muted} textAnchor="end">${Math.round(max)}</text>
      <text x={PAD-4} y={y(min)+4} fontSize="9" fill={C.muted} textAnchor="end">${Math.round(min)}</text>
      <text x={PAD-4} y={zero_y+4} fontSize="9" fill={C.border2} textAnchor="end">$0</text>
      <text x={PAD} y={H-4} fontSize="9" fill={C.muted}>Trade 1</text>
      <text x={W-PAD} y={H-4} fontSize="9" fill={C.muted} textAnchor="end">Trade {trades.length}</text>
    </svg>
  );
}

// ── STREAK CHART ──────────────────────────────────────────────
function StreakViz({ trades }) {
  return (
    <div style={{display:"flex",flexWrap:"wrap",gap:2}}>
      {trades.map((t,i)=>(
        <div key={i} title={`Trade ${i+1}: ${t.win?"WIN":"LOSS"} (${t.net>=0?"+":""}$${t.net.toFixed(0)})`}
          style={{
            width:14, height:14, borderRadius:2,
            background: t.win ? C.green : C.red,
            opacity: 0.85,
            flexShrink:0,
          }}/>
      ))}
    </div>
  );
}

// ── DISTRIBUTION BAR ──────────────────────────────────────────
function DistBar({ label, value, max, color, pct }) {
  return (
    <div style={{marginBottom:5}}>
      <div style={{display:"flex",justifyContent:"space-between",marginBottom:2}}>
        <span style={{fontSize:11,color:C.muted}}>{label}</span>
        <span style={{fontSize:11,fontWeight:600,color,fontFamily:"monospace"}}>{value} {pct&&`(${pct}%)`}</span>
      </div>
      <div style={{height:5,background:C.border,borderRadius:3,overflow:"hidden"}}>
        <div style={{width:`${max?Math.min(100,(value/max)*100):0}%`,
          height:"100%",borderRadius:3,background:color,transition:"width 0.4s"}}/>
      </div>
    </div>
  );
}

// ── CONFIG SLIDER ─────────────────────────────────────────────
function ConfigRow({ label, value, min, max, step, onChange, format, color, note }) {
  return (
    <div>
      <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
        <span style={{fontSize:11,fontWeight:600,color:C.text}}>{label}</span>
        <span style={{fontSize:12,fontWeight:700,color:color||C.purple,fontFamily:"monospace"}}>
          {format ? format(value) : value}
        </span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={e=>onChange(Number(e.target.value))}
        style={{width:"100%",accentColor:color||C.purple,cursor:"pointer"}}/>
      {note && <div style={{fontSize:10,color:C.dim,marginTop:2}}>{note}</div>}
    </div>
  );
}

// ── MAIN APP ──────────────────────────────────────────────────
export default function App() {
  const [config,  setConfig]  = useState(DEFAULT_CONFIG);
  const [result,  setResult]  = useState(null);
  const [multi,   setMulti]   = useState(null);
  const [running, setRunning] = useState(false);
  const [tab,     setTab]     = useState("single");
  const [runCount, setRunCount] = useState(0);

  const upd = (k, v) => setConfig(c=>({...c,[k]:v}));

  const runSingle = useCallback(() => {
    setResult(runSimulation(config));
    setRunCount(n=>n+1);
    setTab("single");
  }, [config]);

  const runMonte = useCallback(() => {
    setRunning(true);
    setTimeout(() => {
      setMulti(runMultiple(config, 1000));
      setRunning(false);
      setTab("monte");
    }, 50);
  }, [config]);

  const r = result;

  // Lesson bullets — computed from result
  const lessons = r ? [
    r.winRate < 45
      ? `⚠ You hit ${r.winRate}% wins — below 50% even with pure randomness. This happens ${Math.round((1-0.5**50)*100)}% of the time over 100 trades. It feels like you're doing something wrong. You're not.`
      : r.winRate > 55
      ? `✓ You hit ${r.winRate}% wins — above 50% by luck alone. Over a real edge, this would look like skill. Over randomness, it's variance.`
      : `→ ${r.winRate}% win rate — very close to the true 50%. Long runs tend to converge to the mean.`,
    `Longest losing streak: ${r.maxLoseStreak} in a row. At 50% probability, a ${r.maxLoseStreak}-trade losing streak has a ${Math.round((1-(1-0.5**r.maxLoseStreak))**(r.maxLoseStreak)* 100) || "<1"}% chance per occurrence but is almost guaranteed to appear somewhere in 100 trades.`,
    `Longest winning streak: ${r.maxWinStreak} in a row. The same probability that creates losing streaks creates winning ones. Both are noise.`,
    r.netPnl < 0
      ? `Commission cost $${r.totalComm.toFixed(2)} — turned a ${r.grossPnl>=0?"+":""}$${r.grossPnl.toFixed(0)} gross result into $${r.netPnl.toFixed(0)} net. At 1:1 R:R with no edge, commission alone guarantees long-term losses.`
      : `Commission cost $${r.totalComm.toFixed(2)} this run. Even a profitable random run is being eroded by commission — scale this over 1000 runs and the edge belongs to the broker.`,
    `Max drawdown: $${r.maxDD.toFixed(0)} — ${Math.round(r.maxDD/config.riskPerTrade)} R from peak. Without a real edge, this drawdown has no structural end point. It can keep going.`,
    `The equity curve had ${r.trades.filter((t,i)=>i>0&&Math.sign(r.trades[i-1].equity)!==Math.sign(t.equity)).length} zero-line crossings. This is the hallmark of a random walk — no persistent trend.`,
  ] : [];

  return (
    <div style={{background:C.bg,color:C.text,minHeight:"100vh",
      fontFamily:"'Inter',system-ui,sans-serif",padding:"20px 18px",
      maxWidth:900,margin:"0 auto"}}>

      {/* Header */}
      <div style={{marginBottom:20}}>
        <Link to="/" style={{fontSize:11,color:C.muted,textDecoration:"none",
          display:"inline-block",marginBottom:8}}>← Home</Link>
        <div style={{fontSize:10,fontWeight:800,color:C.purple,
          textTransform:"uppercase",letterSpacing:"0.14em",marginBottom:4}}>
          Market Randomness Exercise
        </div>
        <h1 style={{margin:"0 0 6px",fontSize:22,fontWeight:700,color:C.text,lineHeight:1.2}}>
          100 Random Trades — 1:1 R:R Simulator
        </h1>
        <p style={{margin:0,fontSize:12,color:C.muted,lineHeight:1.65}}>
          No bias. No direction. Pure coin flip. Run it repeatedly to see what randomness actually looks like — 
          and why streaks, drawdowns, and even short-term "edges" can emerge from nothing.
        </p>
      </div>

      {/* Config */}
      <div style={{background:C.card,border:`1px solid ${C.border}`,
        borderRadius:10,padding:"16px 18px",marginBottom:16}}>
        <SecHead color={C.purple}>Configuration</SecHead>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:20}}>
          <ConfigRow label="Total Trades" value={config.totalTrades}
            min={20} max={500} step={10} onChange={v=>upd("totalTrades",v)}
            note="Default 100 — try 500 for smoother convergence"/>
          <ConfigRow label="Risk Per Trade ($)" value={config.riskPerTrade}
            min={10} max={500} step={10} onChange={v=>upd("riskPerTrade",v)}
            format={v=>`$${v}`} color={C.red}
            note="1R — your stop distance in dollars"/>
          <ConfigRow label="Win Probability" value={config.winProb}
            min={30} max={70} step={1} onChange={v=>upd("winProb",v)}
            format={v=>`${v}%`} color={C.amber}
            note="50% = pure random. Try 55% to see what real edge looks like"/>
          <ConfigRow label="R:R Ratio" value={config.rrRatio}
            min={0.5} max={5} step={0.5} onChange={v=>upd("rrRatio",v)}
            format={v=>`${v}:1`} color={C.green}
            note="Reward ÷ Risk. 1:1 = breakeven at 50% WR"/>
          <ConfigRow label="Commission ($)" value={config.commission}
            min={0} max={10} step={0.1} onChange={v=>upd("commission",v)}
            format={v=>`$${v.toFixed(2)}`} color={C.muted}
            note="Per trade. MNQ=$1.30, NQ=$4.36"/>
          <div style={{display:"flex",flexDirection:"column",gap:8,justifyContent:"flex-end"}}>
            <div style={{fontSize:10,color:C.muted,marginBottom:2}}>
              Theoretical edge: <span style={{
                fontWeight:700,fontFamily:"monospace",
                color: (config.winProb/100 * config.rrRatio * config.riskPerTrade - (1-config.winProb/100) * config.riskPerTrade - config.commission) >= 0 ? C.green : C.red
              }}>
                ${((config.winProb/100 * config.rrRatio * config.riskPerTrade) - ((1-config.winProb/100) * config.riskPerTrade) - config.commission).toFixed(2)}/trade
              </span>
            </div>
            <button onClick={runSingle} style={{
              padding:"10px",borderRadius:8,fontSize:13,fontWeight:700,
              background:C.green,color:"#fff",border:"none",cursor:"pointer"
            }}>▶ Run {config.totalTrades} Trades</button>
            <button onClick={runMonte} disabled={running} style={{
              padding:"8px",borderRadius:8,fontSize:12,fontWeight:600,
              background:running?C.border:C.purpleDim,color:running?C.muted:C.purple,
              border:`1px solid ${running?C.border:C.purple}`,cursor:running?"not-allowed":"pointer"
            }}>{running?"Running 1,000 simulations…":"📊 Monte Carlo (1,000 runs)"}</button>
          </div>
        </div>
      </div>

      {/* Tabs */}
      {(r || multi) && (
        <div style={{display:"flex",gap:6,marginBottom:14,
          borderBottom:`1px solid ${C.border}`,paddingBottom:10}}>
          {[["single","Single Run"],["monte","Monte Carlo (1k)"],["lessons","What This Teaches"]].map(([id,label])=>(
            (id!=="single"||r) && (id!=="monte"||multi) &&
            <button key={id} onClick={()=>setTab(id)} style={{
              padding:"6px 14px",borderRadius:6,fontSize:12,fontWeight:600,cursor:"pointer",
              background:tab===id?C.purple:"transparent",
              color:tab===id?"#fff":C.muted,
              border:`1px solid ${tab===id?C.purple:C.border}`
            }}>{label}</button>
          ))}
          {runCount>0 && (
            <span style={{marginLeft:"auto",fontSize:10,color:C.dim,alignSelf:"center"}}>
              Run #{runCount}
            </span>
          )}
        </div>
      )}

      {/* SINGLE RUN TAB */}
      {tab==="single" && r && (
        <div style={{display:"flex",flexDirection:"column",gap:14}}>

          {/* Key stats */}
          <div style={{display:"grid",gridTemplateColumns:"repeat(6,1fr)",gap:10}}>
            <Stat label="Net P&L" value={`$${r.netPnl}`}
              color={r.netPnl>=0?C.green:C.red}/>
            <Stat label="Win Rate" value={`${r.winRate}%`}
              color={r.winRate>=55?C.green:r.winRate>=45?C.amber:C.red}
              sub={`${r.wins}W / ${r.losses}L`}/>
            <Stat label="Max Drawdown" value={`$${r.maxDD}`} color={C.red}
              sub={`${Math.round(r.maxDD/config.riskPerTrade)}R`}/>
            <Stat label="Best Streak" value={`${r.maxWinStreak}W`} color={C.green}/>
            <Stat label="Worst Streak" value={`${r.maxLoseStreak}L`} color={C.red}/>
            <Stat label="Commission" value={`$${r.totalComm.toFixed(0)}`} color={C.muted}
              sub={`${Math.round(r.totalComm/Math.max(1,Math.abs(r.grossPnl))*100)}% of gross`}/>
          </div>

          {/* Equity curve */}
          <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:10,padding:"16px 18px"}}>
            <SecHead color={C.blue}>Equity Curve</SecHead>
            <EquityCurve trades={r.trades} height={200}/>
          </div>

          {/* Win/loss grid */}
          <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:10,padding:"16px 18px"}}>
            <SecHead color={C.teal}>Trade-by-Trade — Green=Win, Red=Loss</SecHead>
            <StreakViz trades={r.trades}/>
            <div style={{display:"flex",gap:16,marginTop:10}}>
              <div style={{fontSize:11,color:C.muted}}>
                Hover each square for trade detail. Notice how wins and losses cluster — this is what randomness looks like visually. It doesn't alternate neatly.
              </div>
            </div>
          </div>

          {/* Streak analysis */}
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
            <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:10,padding:"16px 18px"}}>
              <SecHead color={C.green}>Winning Streak Distribution</SecHead>
              {[1,2,3,4,5,6,7,8].map(len=>{
                const count = r.streaks.win.filter(s=>s===len).length;
                const total = r.streaks.win.length;
                return count>0 && (
                  <DistBar key={len} label={`${len} in a row`} value={count}
                    max={Math.max(...r.streaks.win.map(s=>r.streaks.win.filter(x=>x===s).length))}
                    color={C.green} pct={total?Math.round(count/total*100):0}/>
                );
              })}
            </div>
            <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:10,padding:"16px 18px"}}>
              <SecHead color={C.red}>Losing Streak Distribution</SecHead>
              {[1,2,3,4,5,6,7,8].map(len=>{
                const count = r.streaks.lose.filter(s=>s===len).length;
                const total = r.streaks.lose.length;
                return count>0 && (
                  <DistBar key={len} label={`${len} in a row`} value={count}
                    max={Math.max(...r.streaks.lose.map(s=>r.streaks.lose.filter(x=>x===s).length))}
                    color={C.red} pct={total?Math.round(count/total*100):0}/>
                );
              })}
            </div>
          </div>

        </div>
      )}

      {/* MONTE CARLO TAB */}
      {tab==="monte" && multi && (
        <div style={{display:"flex",flexDirection:"column",gap:14}}>

          <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:10,padding:"16px 18px"}}>
            <SecHead color={C.purple}>1,000 Simulations — Outcome Distribution</SecHead>
            <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:12,marginBottom:16}}>
              <div style={{textAlign:"center",padding:"14px",background:C.greenDim,borderRadius:8}}>
                <div style={{fontSize:28,fontWeight:700,color:C.green,fontFamily:"monospace"}}>{multi.profitable}</div>
                <div style={{fontSize:10,color:C.green,textTransform:"uppercase",letterSpacing:"0.06em",marginTop:4}}>Profitable runs</div>
                <div style={{fontSize:11,color:C.muted,marginTop:2}}>{Math.round(multi.profitable/10)}% of simulations</div>
              </div>
              <div style={{textAlign:"center",padding:"14px",background:C.border,borderRadius:8}}>
                <div style={{fontSize:28,fontWeight:700,color:C.muted,fontFamily:"monospace"}}>{multi.breakeven}</div>
                <div style={{fontSize:10,color:C.muted,textTransform:"uppercase",letterSpacing:"0.06em",marginTop:4}}>Breakeven</div>
              </div>
              <div style={{textAlign:"center",padding:"14px",background:C.redDim,borderRadius:8}}>
                <div style={{fontSize:28,fontWeight:700,color:C.red,fontFamily:"monospace"}}>{multi.loss}</div>
                <div style={{fontSize:10,color:C.red,textTransform:"uppercase",letterSpacing:"0.06em",marginTop:4}}>Loss runs</div>
                <div style={{fontSize:11,color:C.muted,marginTop:2}}>{Math.round(multi.loss/10)}% of simulations</div>
              </div>
            </div>

            <SecHead color={C.purple}>Net P&L Percentiles (across 1,000 runs)</SecHead>
            <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:10,marginBottom:16}}>
              {[["5th pct\n(worst 5%)",multi.p5,C.red],
                ["25th pct",multi.p25,C.amber],
                ["Median",multi.p50,C.muted],
                ["75th pct",multi.p75,C.green],
                ["95th pct\n(best 5%)",multi.p95,C.green]
              ].map(([label,val,color])=>(
                <div key={label} style={{textAlign:"center",background:C.surface,
                  borderRadius:8,padding:"10px 8px",border:`1px solid ${C.border2}`}}>
                  <div style={{fontSize:16,fontWeight:700,color,fontFamily:"monospace"}}>
                    {val>=0?"+":""}{val}
                  </div>
                  <div style={{fontSize:9,color:C.muted,marginTop:3,textTransform:"uppercase",
                    letterSpacing:"0.06em",whiteSpace:"pre-line"}}>{label}</div>
                </div>
              ))}
            </div>

            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr",gap:10}}>
              {[["Avg Net P&L",`$${multi.avgNetPnl}`,multi.avgNetPnl>=0?C.green:C.red],
                ["Avg Win Rate",`${multi.avgWinRate}%`,C.amber],
                ["Avg Max DD",`$${multi.avgMaxDD}`,C.red],
                ["Avg Max Lose Streak",`${multi.avgMaxLose} trades`,C.red],
              ].map(([label,value,color])=>(
                <div key={label} style={{background:C.surface,border:`1px solid ${C.border2}`,
                  borderRadius:8,padding:"10px 12px",textAlign:"center"}}>
                  <div style={{fontSize:18,fontWeight:700,color,fontFamily:"monospace"}}>{value}</div>
                  <div style={{fontSize:9,color:C.muted,marginTop:3,textTransform:"uppercase",
                    letterSpacing:"0.06em"}}>{label}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Distribution histogram */}
          <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:10,padding:"16px 18px"}}>
            <SecHead color={C.blue}>P&L Distribution Histogram (1,000 simulations)</SecHead>
            {(() => {
              const vals  = multi.netPnls;
              const min   = Math.floor(Math.min(...vals)/50)*50;
              const max   = Math.ceil(Math.max(...vals)/50)*50;
              const bins  = [];
              for (let b=min; b<max; b+=50) {
                const count = vals.filter(v=>v>=b&&v<b+50).length;
                bins.push({b, count});
              }
              const peak = Math.max(...bins.map(b=>b.count));
              return (
                <div style={{display:"flex",alignItems:"flex-end",gap:1,height:100,
                  borderBottom:`1px solid ${C.border2}`,marginBottom:4}}>
                  {bins.map(({b,count})=>(
                    <div key={b} title={`$${b} to $${b+50}: ${count} runs`}
                      style={{
                        flex:1,minWidth:4,
                        height:`${peak?(count/peak)*100:0}%`,
                        background: b<-multi.totalComm ? C.red :
                                    b>=0 ? C.green : C.amber,
                        opacity:0.8,borderRadius:"2px 2px 0 0",cursor:"default"
                      }}/>
                  ))}
                </div>
              );
            })()}
            <div style={{display:"flex",justifyContent:"space-between",fontSize:9,color:C.muted}}>
              <span>Worst: ${multi.worstResult}</span>
              <span style={{color:C.amber}}>0</span>
              <span>Best: ${multi.bestResult}</span>
            </div>
            <div style={{marginTop:8,fontSize:11,color:C.muted,lineHeight:1.6}}>
              Red bars = losing runs. Green bars = profitable runs. Amber = near-zero. Notice the distribution
              is centred slightly below $0 — that's the commission drag pulling the mean leftward even from a
              theoretically neutral 50/50 system.
            </div>
          </div>

        </div>
      )}

      {/* LESSONS TAB */}
      {tab==="lessons" && r && (
        <div style={{display:"flex",flexDirection:"column",gap:10}}>

          <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:10,padding:"16px 18px"}}>
            <SecHead color={C.amber}>What this run reveals</SecHead>
            {lessons.map((l,i)=>(
              <div key={i} style={{
                padding:"10px 12px",borderRadius:6,background:C.surface,
                marginBottom:8,fontSize:12,color:C.text,lineHeight:1.65,
                borderLeft:`2px solid ${C.amber}`
              }}>{l}</div>
            ))}
          </div>

          <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:10,padding:"16px 18px"}}>
            <SecHead color={C.purple}>The core lessons — always true regardless of this run</SecHead>
            {[
              ["Streaks are guaranteed, not lucky","At 50% win probability, a 7-trade losing streak has a 0.78% chance per occurrence. Over 100 trades there are ~94 possible starting points for a 7-streak. The expected number of 7+ losing streaks in 100 trades is 0.73 — meaning it happens roughly 3 out of 4 times. It is not bad luck. It is mathematics."],
              ["Short samples prove nothing","100 trades sounds like a lot. It isn't. The 95% confidence interval on a 50% win rate over 100 trades is ±9.8% — meaning you could see anything from 40% to 60% wins and still be perfectly consistent with a 50/50 coin flip. Your real-world trading samples are this size. Be humble about what they prove."],
              ["Commission destroys neutral systems","At 1:1 R:R with exactly 50% win rate, gross P&L is theoretically $0. Every dollar of commission turns that $0 into a loss. At $1.30/trade × 100 trades = $130 guaranteed drag. This is why 1:1 with no edge is a slow account-destruction mechanism regardless of how the individual trades feel."],
              ["Variance looks like skill over short periods","A 60% win rate over 20 trades is indistinguishable from luck at the 95% confidence level. Traders who see early success in a new strategy are often observing lucky variance, not proven edge. The Monte Carlo distribution shows you the full range of what randomness can produce."],
              ["Real edge is visible only in the aggregate","The difference between a 50% system and a 55% system is invisible in any single 20-trade run. Over 1,000 simulations the 55% system produces a rightward shift in the distribution. Your edge — if it exists — lives in that shift. No single session proves or disproves it."],
              ["Drawdowns are structural, not anomalies","Without a genuine edge, every drawdown has no natural floor. The random walk can take your account anywhere. With a real edge, drawdowns are temporary because the positive expected value per trade eventually asserts itself. This is why the Monte Carlo expected value is the number to manage around."],
            ].map(([title,body])=>(
              <div key={title} style={{marginBottom:12,padding:"12px 14px",
                background:C.surface,borderRadius:8,borderLeft:`2px solid ${C.purple}`}}>
                <div style={{fontSize:12,fontWeight:700,color:C.text,marginBottom:5}}>{title}</div>
                <div style={{fontSize:12,color:C.muted,lineHeight:1.65}}>{body}</div>
              </div>
            ))}
          </div>

          <div style={{background:C.purpleDim,border:`1px solid ${C.purple}44`,
            borderRadius:10,padding:"14px 16px"}}>
            <div style={{fontSize:12,fontWeight:700,color:C.text,marginBottom:6}}>
              The takeaway for your real trading
            </div>
            <div style={{fontSize:12,color:C.muted,lineHeight:1.7}}>
              When you observe a 5-trade losing streak in your volume profile + SMC system, 
              you cannot distinguish it from randomness without a large sample. 
              The kill switch and daily loss limit rules exist not to protect you from a broken strategy 
              — they exist to protect you from the inevitable variance that even a working strategy produces. 
              The question is never "did I just have bad luck" — at small samples you cannot know. 
              The question is "am I following the process correctly" — because that is the only variable you control.
            </div>
          </div>

        </div>
      )}

      {/* Initial prompt */}
      {!r && !multi && (
        <div style={{textAlign:"center",padding:"60px 20px",
          background:C.card,border:`1px solid ${C.border}`,borderRadius:10}}>
          <div style={{fontSize:40,marginBottom:12}}>🎲</div>
          <div style={{fontSize:14,fontWeight:600,color:C.text,marginBottom:8}}>
            Configure and press Run to start
          </div>
          <div style={{fontSize:12,color:C.muted,maxWidth:400,margin:"0 auto",lineHeight:1.65}}>
            Start with default settings (100 trades, 50% win probability, 1:1 R:R) 
            then run it 5–10 times to see how different each run looks despite being identical conditions.
          </div>
        </div>
      )}

    </div>
  );
}