import { useState, useCallback } from "react";
import { Link } from "react-router-dom";

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

// ── SIMULATION ENGINE ─────────────────────────────────────────
// Simulates a single trade path as a random walk
// Returns an array of price steps from entry
function simulatePath(stopPts, targetPts, steps = 2000) {
  const path = [0];
  let price = 0;
  for (let i = 0; i < steps; i++) {
    price += (Math.random() > 0.5 ? 1 : -1);
    path.push(price);
    if (price >= targetPts || price <= -stopPts) break;
  }
  return path;
}

// ── BEHAVIOR DEFINITIONS ──────────────────────────────────────
const BEHAVIORS = {
  hold: {
    name: "Hold to target/stop",
    color: C.blue,
    desc: "Original stop and target unchanged. The pure 1:1 baseline.",
    simulate(path, stop, target) {
      for (let i = 1; i < path.length; i++) {
        if (path[i] >= target) return { outcome: "target", exitAt: path[i], i };
        if (path[i] <= -stop)  return { outcome: "stop",   exitAt: path[i], i };
      }
      return { outcome: "timeout", exitAt: path[path.length-1], i: path.length };
    }
  },
  be: {
    name: "Move to breakeven",
    color: C.teal,
    desc: "When price reaches +50% of target, stop moves to entry (breakeven). Eliminates most losses — but creates BE exits when price retraces.",
    simulate(path, stop, target) {
      const beTrigger = target * 0.5;
      let stopLevel = -stop;
      let triggered = false;
      for (let i = 1; i < path.length; i++) {
        if (!triggered && path[i] >= beTrigger) {
          stopLevel = 0;
          triggered = true;
        }
        if (path[i] >= target) return { outcome: "target", exitAt: path[i], i, modified: triggered };
        if (path[i] <= stopLevel) return { outcome: triggered ? "be" : "stop", exitAt: path[i], i, modified: triggered };
      }
      return { outcome: "timeout", exitAt: path[path.length-1], i: path.length };
    }
  },
  trail: {
    name: "Trail stop (half ATR)",
    color: C.amber,
    desc: "Stop trails 50% of target distance behind the highest price reached. Locks in partial profit on strong moves — but gives back on pullbacks.",
    simulate(path, stop, target) {
      let stopLevel = -stop;
      let peak = 0;
      for (let i = 1; i < path.length; i++) {
        if (path[i] > peak) {
          peak = path[i];
          stopLevel = Math.max(stopLevel, peak - target * 0.5);
        }
        if (path[i] >= target) return { outcome: "target", exitAt: path[i], i, peak };
        if (path[i] <= stopLevel) return { outcome: stopLevel > -stop ? "trail" : "stop", exitAt: path[i], i, peak };
      }
      return { outcome: "timeout", exitAt: path[path.length-1], i: path.length };
    }
  },
  early: {
    name: "Early exit at 50% target",
    color: C.purple,
    desc: "Exits at 50% of target when price gets there — taking the 'sure thing'. Classic fear-based behaviour. Converts 1:1 into 0.5:1 effective R:R.",
    simulate(path, stop, target) {
      const earlyExit = target * 0.5;
      for (let i = 1; i < path.length; i++) {
        if (path[i] >= earlyExit) return { outcome: "early", exitAt: earlyExit, i };
        if (path[i] <= -stop)    return { outcome: "stop",  exitAt: path[i], i };
      }
      return { outcome: "timeout", exitAt: path[path.length-1], i: path.length };
    }
  },
  wider: {
    name: "Widen stop (fear)",
    color: C.red,
    desc: "When stop is approached (price within 20% of stop), stop widens by 30%. Classic loss-aversion behaviour. Increases losses when wrong.",
    simulate(path, stop, target) {
      let currentStop = stop;
      let widened = false;
      for (let i = 1; i < path.length; i++) {
        if (!widened && path[i] <= -(currentStop * 0.8)) {
          currentStop = currentStop * 1.3;
          widened = true;
        }
        if (path[i] >= target)         return { outcome: "target", exitAt: path[i], i, widened };
        if (path[i] <= -currentStop)   return { outcome: widened ? "widened" : "stop", exitAt: path[i], i, widened };
      }
      return { outcome: "timeout", exitAt: path[path.length-1], i: path.length };
    }
  },
  partial: {
    name: "Partial exit at 50%",
    color: C.green,
    desc: "Exit half position at 50% target, move stop to BE, let remainder run. Splits the trade into a locked partial + free runner.",
    simulate(path, stop, target) {
      const partialAt = target * 0.5;
      let stopLevel = -stop;
      let partialed = false;
      for (let i = 1; i < path.length; i++) {
        if (!partialed && path[i] >= partialAt) {
          partialed = true;
          stopLevel = 0;
        }
        if (path[i] >= target) return { outcome: "full", exitAt: path[i], i, partialed };
        if (path[i] <= stopLevel) return { outcome: partialed ? "partial_be" : "stop", exitAt: path[i], i, partialed };
      }
      return { outcome: "timeout", exitAt: path[path.length-1], i: path.length };
    }
  },
};

// ── RUN SIMULATION ─────────────────────────────────────────────
function runBehaviorSim(N, stopPts, targetPts, commission, risk) {
  const results = {};
  Object.keys(BEHAVIORS).forEach(key => {
    results[key] = { wins:0, losses:0, bes:0, partials:0, totalPnl:0,
      exitAmounts:[], outcomes:{}, pnlSeries:[] };
  });

  let cumPnl = {};
  Object.keys(BEHAVIORS).forEach(k => cumPnl[k] = 0);

  for (let n = 0; n < N; n++) {
    const path = simulatePath(stopPts, targetPts);
    Object.entries(BEHAVIORS).forEach(([key, beh]) => {
      const r = results[key];
      const res = beh.simulate(path, stopPts, targetPts);
      r.outcomes[res.outcome] = (r.outcomes[res.outcome] || 0) + 1;

      let pnl = 0;
      const reward = targetPts / stopPts * risk;

      switch (res.outcome) {
        case "target": pnl = reward - commission; r.wins++; break;
        case "full":   pnl = reward - commission; r.wins++; break;
        case "early":  pnl = reward * 0.5 - commission; r.wins++; break;
        case "stop":   pnl = -(risk + commission); r.losses++; break;
        case "widened":pnl = -(risk * 1.3 + commission); r.losses++; break;
        case "be":     pnl = -commission; r.bes++; break;
        case "trail":  pnl = (res.peak ? Math.min(res.peak, targetPts) * 0.5 / stopPts * risk : 0) - commission; break;
        case "partial_be": pnl = reward * 0.5 * 0.5 - commission; r.partials++; break;
        default:       pnl = res.exitAt / stopPts * risk - commission; break;
      }

      r.totalPnl += pnl;
      cumPnl[key] += pnl;
      r.exitAmounts.push(pnl);
      r.pnlSeries.push(Math.round(cumPnl[key] * 100) / 100);
    });
  }

  // Summary stats
  Object.entries(results).forEach(([key, r]) => {
    const total = r.wins + r.losses + r.bes + r.partials;
    r.winRate  = Math.round(r.wins / total * 100);
    r.avgPnl   = Math.round(r.totalPnl / N * 100) / 100;
    r.netPnl   = Math.round(r.totalPnl * 100) / 100;
    // Max drawdown
    let peak = 0, maxDD = 0, equity = 0;
    r.exitAmounts.forEach(p => {
      equity += p;
      if (equity > peak) peak = equity;
      const dd = peak - equity;
      if (dd > maxDD) maxDD = dd;
    });
    r.maxDD = Math.round(maxDD * 100) / 100;
  });

  return results;
}

// ── COMPONENTS ────────────────────────────────────────────────
const Label = ({c,children}) => (
  <div style={{fontSize:9,fontWeight:800,color:c||C.muted,
    textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:3}}>{children}</div>
);

const SecHead = ({children,color}) => (
  <div style={{fontSize:9,fontWeight:800,letterSpacing:"0.1em",textTransform:"uppercase",
    color:color||C.muted,marginBottom:10,paddingBottom:5,
    borderBottom:`1px solid ${C.border}`}}>{children}</div>
);

const Slider = ({label,value,min,max,step,onChange,format,color,note}) => (
  <div>
    <div style={{display:"flex",justifyContent:"space-between",marginBottom:3}}>
      <span style={{fontSize:11,fontWeight:600,color:C.text}}>{label}</span>
      <span style={{fontSize:13,fontWeight:700,color:color||C.purple,
        fontFamily:"'JetBrains Mono',monospace"}}>{format?format(value):value}</span>
    </div>
    <input type="range" min={min} max={max} step={step} value={value}
      onChange={e=>onChange(Number(e.target.value))}
      style={{width:"100%",accentColor:color||C.purple,cursor:"pointer"}}/>
    {note&&<div style={{fontSize:10,color:C.dim,marginTop:2}}>{note}</div>}
  </div>
);

function BehaviorCard({bkey, beh, result, rank, n}) {
  const [expanded, setExpanded] = useState(false);
  if (!result) return null;
  const isBase = bkey === "hold";
  const diff = result.netPnl - (n * -4.36); // vs commission-only baseline
  const rankColors = ["#f5c842","#aaaaaa","#cd7f32","#888780","#888780","#888780"];

  return (
    <div style={{
      background:C.card, border:`1px solid ${C.border2}`,
      borderLeft:`3px solid ${beh.color}`,
      borderRadius:10, padding:"14px 16px", marginBottom:8
    }}>
      <div onClick={()=>setExpanded(!expanded)}
        style={{display:"flex",alignItems:"center",gap:10,cursor:"pointer",userSelect:"none"}}>
        <div style={{
          width:22,height:22,borderRadius:"50%",
          background:`${rankColors[rank-1]||C.dim}33`,
          border:`1px solid ${rankColors[rank-1]||C.dim}`,
          display:"flex",alignItems:"center",justifyContent:"center",
          fontSize:10,fontWeight:700,color:rankColors[rank-1]||C.dim,flexShrink:0
        }}>#{rank}</div>
        <div style={{flex:1}}>
          <div style={{fontSize:13,fontWeight:600,color:beh.color}}>{beh.name}</div>
          <div style={{fontSize:11,color:C.muted,marginTop:1}}>{beh.desc}</div>
        </div>
        <div style={{textAlign:"right",flexShrink:0}}>
          <div style={{fontSize:18,fontWeight:700,fontFamily:"monospace",
            color:result.netPnl>=0?C.green:C.red}}>
            {result.netPnl>=0?"+":""}{result.netPnl.toFixed(0)}
          </div>
          <div style={{fontSize:10,color:C.muted}}>net P&L over {n} trades</div>
        </div>
        <span style={{fontSize:14,color:C.muted,marginLeft:8}}>{expanded?"▾":"▸"}</span>
      </div>

      {expanded && (
        <div style={{marginTop:12,display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:8,
          borderTop:`1px solid ${C.border}`,paddingTop:12}}>
          {[
            ["Win rate",`${result.winRate}%`,result.winRate>=40?C.green:result.winRate>=30?C.amber:C.red],
            ["Avg trade",`${result.avgPnl>=0?"+":""}$${result.avgPnl.toFixed(0)}`,result.avgPnl>=0?C.green:C.red],
            ["Max DD",`$${result.maxDD.toFixed(0)}`,C.red],
            ["Outcomes",Object.entries(result.outcomes).map(([k,v])=>`${k}:${v}`).join(" | "),C.muted],
            ["vs baseline",`${diff>=0?"+":""}$${diff.toFixed(0)}`,diff>=0?C.green:C.red],
          ].map(([label,val,color])=>(
            <div key={label} style={{background:C.surface,borderRadius:8,padding:"8px 10px",textAlign:"center"}}>
              <div style={{fontSize:13,fontWeight:600,color,fontFamily:"monospace"}}>{val}</div>
              <div style={{fontSize:9,color:C.muted,marginTop:3,textTransform:"uppercase",
                letterSpacing:"0.06em"}}>{label}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── EQUITY CURVES ─────────────────────────────────────────────
function EquityCurves({results, n}) {
  const canvasRef = (canvas) => {
    if (!canvas || !results) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const W = canvas.width, H = canvas.height;
    ctx.clearRect(0,0,W,H);

    const PAD = 40;
    const iW = W - PAD * 2;
    const iH = H - PAD * 2;

    const allVals = Object.values(results).flatMap(r=>r.pnlSeries);
    const minV = Math.min(0,...allVals);
    const maxV = Math.max(0,...allVals);
    const range = maxV - minV || 1;

    const toX = (i) => PAD + (i / (n-1)) * iW;
    const toY = (v) => PAD + iH - ((v-minV)/range)*iH;

    // Grid
    ctx.strokeStyle = C.border;
    ctx.lineWidth = 0.5;
    [0.25,0.5,0.75].forEach(p=>{
      const y = PAD + iH*p;
      ctx.beginPath(); ctx.moveTo(PAD,y); ctx.lineTo(W-PAD,y); ctx.stroke();
    });

    // Zero line
    const zeroY = toY(0);
    ctx.strokeStyle = C.border2; ctx.lineWidth = 1; ctx.setLineDash([4,3]);
    ctx.beginPath(); ctx.moveTo(PAD,zeroY); ctx.lineTo(W-PAD,zeroY); ctx.stroke();
    ctx.setLineDash([]);

    // Labels
    ctx.fillStyle = C.muted; ctx.font = "9px system-ui"; ctx.textAlign = "right";
    ctx.fillText(`$${Math.round(maxV)}`, PAD-4, PAD+4);
    ctx.fillText(`$${Math.round(minV)}`, PAD-4, H-PAD+4);
    ctx.fillText("$0", PAD-4, zeroY+4);

    // Each behavior curve
    Object.entries(results).forEach(([key, r]) => {
      const beh = BEHAVIORS[key];
      ctx.strokeStyle = beh.color;
      ctx.lineWidth = key === "partial" ? 2.5 : 1.5;
      ctx.globalAlpha = 0.85;
      ctx.beginPath();
      r.pnlSeries.forEach((v,i)=>{
        i===0 ? ctx.moveTo(toX(i),toY(v)) : ctx.lineTo(toX(i),toY(v));
      });
      ctx.stroke();
      ctx.globalAlpha = 1;

      // Label at end
      const lastY = toY(r.pnlSeries[r.pnlSeries.length-1]);
      ctx.fillStyle = beh.color; ctx.textAlign = "left"; ctx.font = "9px system-ui";
      ctx.fillText(`${key}`, W-PAD+3, Math.min(H-PAD, Math.max(PAD, lastY+3)));
    });
  };

  return (
    <canvas ref={canvasRef} width={700} height={260}
      style={{width:"100%",height:260,display:"block"}}
      role="img" aria-label="Equity curves for all six stop management behaviors over the simulation period"/>
  );
}

// ── MAIN ──────────────────────────────────────────────────────
export default function App() {
  const [n,       setN]       = useState(200);
  const [stopPts, setStopPts] = useState(30);
  const [rrRatio, setRrRatio] = useState(2);
  const [risk,    setRisk]    = useState(100);
  const [comm,    setComm]    = useState(1.30);
  const [results, setResults] = useState(null);
  const [running, setRunning] = useState(false);
  const [tab,     setTab]     = useState("results");

  const targetPts = stopPts * rrRatio;

  const run = useCallback(() => {
    setRunning(true);
    setTimeout(() => {
      const res = runBehaviorSim(n, stopPts, targetPts, comm, risk);
      // Rank by net P&L
      const ranked = Object.entries(res)
        .sort((a,b)=>b[1].netPnl-a[1].netPnl)
        .map(([k],i)=>({key:k,rank:i+1}));
      setResults({data:res, ranked});
      setRunning(false);
      setTab("results");
    }, 50);
  }, [n, stopPts, targetPts, comm, risk]);

  const getRank = (key) => results?.ranked.find(r=>r.key===key)?.rank || 0;

  const insights = results ? [
    {
      title:"Moving stop to breakeven — the double-edged sword",
      color:C.teal,
      body:`The BE mechanic eliminates most full losses and feels extremely safe. But it creates a new category: the trade that moves 50%+ toward target then reverses — exiting at $0 (minus commission) instead of the original full loss. Over many trades, those zero-exits replace some wins (trades that would have continued to target if the stop hadn't moved) and some losses (trades that were already going to stop out). The net effect depends entirely on your specific win rate and path characteristics. At 50% random walk probability, BE typically improves net P&L modestly because it eliminates most full losses. But at higher win rates it can actually reduce P&L by stopping out trades that were heading to target.`
    },
    {
      title:"Trailing stop — capturing the middle without capturing the end",
      color:C.amber,
      body:`Trailing stops represent a genuine mathematical tradeoff. They guarantee capturing some profit on strong moves while reducing the chance of full target hits. The equity curve typically shows lower volatility than holding to target — more consistent but smaller wins. The key question your data must answer: does your strategy's win rate exceed the breakeven threshold for the effective R:R the trail creates? A 2:1 trade managed by a trail that exits at an average of 1.3R requires a 44% win rate to be profitable. If your structural entries win at 45%+, the trail adds value. If they win at 35%, the trail destroys value that the full target would have captured.`
    },
    {
      title:"Early exit — the most statistically destructive behaviour",
      color:C.purple,
      body:`Exiting at 50% of target converts a 2:1 R:R into 0.5:1 effective R:R while keeping the full stop exposure. The breakeven win rate jumps from 33% (at 2:1) to 67% (at 0.5:1). Almost no real trading system sustainably achieves 67% win rate. This is why early exits — driven by fear of giving back profit — are the single most mathematically destructive behaviour in retail trading. The exit feels safe in the moment because it locks in a win. The statistics prove it is actually the equivalent of switching from a profitable system to an unprofitable one.`
    },
    {
      title:"Widening stops — the asymmetric damage behaviour",
      color:C.red,
      body:`Widening stops when price approaches them is particularly destructive because it doesn't improve win rate — it only increases the dollar cost of losing trades. A trade that was going to be a $100 loss becomes a $130 loss. The extra $30 buys no additional probability of success because the widening typically happens right as the original thesis is being invalidated. Over many trades, wider losses with unchanged win rate produces a clearly worse expected value. This is the one behaviour in the set with no statistical argument in its favour.`
    },
    {
      title:"Partial exit — the most balanced behaviour mathematically",
      color:C.green,
      body:`Taking half off at 50% target and moving the stop to BE creates two separate sub-trades from each entry. The first half exits at 50% of target with near-certainty (close to the entry). The second half runs free from BE with no downside risk. This splits the probability distribution in a way that reduces variance without significantly sacrificing expected value. The partial exit typically shows the best risk-adjusted returns — lower max drawdown than holding, better net P&L than early exit, less stop-out noise than trailing. For a maturing system, this is usually the most sustainable stop management approach.`
    },
  ] : [];

  return (
    <div style={{background:C.bg,color:C.text,minHeight:"100vh",
      fontFamily:"'Inter',system-ui,sans-serif",padding:"20px 18px",
      maxWidth:960,margin:"0 auto"}}>

      {/* Header */}
      <div style={{marginBottom:20}}>
        <Link to="/" style={{fontSize:11,color:C.muted,textDecoration:"none",
          display:"inline-block",marginBottom:8}}>← Home</Link>
        <div style={{fontSize:10,fontWeight:800,color:C.purple,
          textTransform:"uppercase",letterSpacing:"0.14em",marginBottom:4}}>
          Stop Management Statistics
        </div>
        <h1 style={{margin:"0 0 6px",fontSize:22,fontWeight:700,
          color:C.text,lineHeight:1.2}}>
          How trader behaviours change the distribution
        </h1>
        <p style={{margin:0,fontSize:12,color:C.muted,lineHeight:1.65}}>
          Six stop management approaches simulated simultaneously on the same random paths.
          Every behaviour gets the same trades — only the exit rule changes.
          Watch what happens to net P&L, win rate, and drawdown.
        </p>
      </div>

      {/* Config */}
      <div style={{background:C.card,border:`1px solid ${C.border}`,
        borderRadius:10,padding:"16px 18px",marginBottom:14}}>
        <SecHead color={C.purple}>Configuration — same parameters apply to all 6 behaviours</SecHead>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr 1fr",gap:18,marginBottom:16}}>
          <Slider label="Simulated trades" value={n} min={50} max={1000} step={50}
            onChange={setN} note="More = more stable results"/>
          <Slider label="Stop distance (pts)" value={stopPts} min={10} max={100} step={5}
            onChange={setStopPts} color={C.red} note="Your structural stop"/>
          <Slider label="R:R Ratio" value={rrRatio} min={1} max={5} step={0.5}
            onChange={setRrRatio} format={v=>`${v}:1`} color={C.green}
            note={`Target = ${targetPts}pts`}/>
          <Slider label="Risk per trade ($)" value={risk} min={10} max={500} step={10}
            onChange={setRisk} format={v=>`$${v}`} color={C.red}/>
          <Slider label="Commission ($)" value={comm} min={0} max={10} step={0.1}
            onChange={setComm} format={v=>`$${v.toFixed(2)}`} color={C.muted}/>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:12}}>
          <button onClick={run} disabled={running} style={{
            padding:"10px 24px",borderRadius:8,fontSize:13,fontWeight:700,
            background:running?C.border:C.green,color:running?C.muted:"#fff",
            border:"none",cursor:running?"not-allowed":"pointer"
          }}>{running?"Simulating…":"▶ Run Simulation"}</button>
          <div style={{fontSize:11,color:C.muted}}>
            Baseline probability: <span style={{color:C.amber,fontWeight:700}}>
              {Math.round(stopPts/(stopPts+targetPts)*100)}%
            </span> hit rate on random walk at {rrRatio}:1 R:R
          </div>
        </div>
      </div>

      {/* Results */}
      {results && (
        <>
          <div style={{display:"flex",gap:6,marginBottom:14,
            borderBottom:`1px solid ${C.border}`,paddingBottom:10}}>
            {[["results","Ranked Results"],["curves","Equity Curves"],["insights","Statistical Insights"]].map(([id,label])=>(
              <button key={id} onClick={()=>setTab(id)} style={{
                padding:"6px 14px",borderRadius:6,fontSize:12,fontWeight:600,cursor:"pointer",
                background:tab===id?C.purple:"transparent",
                color:tab===id?"#fff":C.muted,
                border:`1px solid ${tab===id?C.purple:C.border}`
              }}>{label}</button>
            ))}
          </div>

          {tab==="results" && (
            <div>
              <div style={{fontSize:11,color:C.muted,marginBottom:12,lineHeight:1.6}}>
                Ranked by net P&L over {n} trades. All six behaviours received identical price paths — only the exit rule differed. Click any card to expand the full statistics.
              </div>
              {results.ranked.map(({key,rank})=>(
                <BehaviorCard key={key} bkey={key} beh={BEHAVIORS[key]}
                  result={results.data[key]} rank={rank} n={n}/>
              ))}
            </div>
          )}

          {tab==="curves" && (
            <div style={{background:C.card,border:`1px solid ${C.border}`,
              borderRadius:10,padding:"16px 18px"}}>
              <SecHead color={C.blue}>Equity Curves — all 6 behaviours on same random paths</SecHead>
              <EquityCurves results={results.data} n={n}/>
              <div style={{marginTop:12,display:"flex",flexWrap:"wrap",gap:10}}>
                {Object.entries(BEHAVIORS).map(([key,beh])=>(
                  <div key={key} style={{display:"flex",alignItems:"center",gap:6}}>
                    <div style={{width:20,height:3,background:beh.color,borderRadius:2}}/>
                    <span style={{fontSize:11,color:C.muted}}>{beh.name}</span>
                    <span style={{fontSize:11,fontWeight:700,color:results.data[key].netPnl>=0?C.green:C.red,
                      fontFamily:"monospace"}}>
                      {results.data[key].netPnl>=0?"+":""}${results.data[key].netPnl.toFixed(0)}
                    </span>
                  </div>
                ))}
              </div>
              <div style={{marginTop:10,padding:"10px 12px",background:C.purpleDim,
                borderRadius:8,border:`1px solid ${C.purple}44`,fontSize:11,
                color:C.muted,lineHeight:1.65}}>
                The spread between the best and worst equity curves is entirely caused by exit behaviour — not entry quality. Every curve started from the same entries at the same prices. This is the visual proof that how you manage trades once in them matters as much as when you enter them.
              </div>
            </div>
          )}

          {tab==="insights" && (
            <div>
              {insights.map(({title,color,body})=>(
                <div key={title} style={{background:C.card,border:`1px solid ${C.border2}`,
                  borderLeft:`3px solid ${color}`,borderRadius:10,
                  padding:"14px 16px",marginBottom:10}}>
                  <div style={{fontSize:13,fontWeight:600,color,marginBottom:8}}>{title}</div>
                  <div style={{fontSize:12,color:C.muted,lineHeight:1.7}}>{body}</div>
                </div>
              ))}
              <div style={{background:C.purpleDim,border:`1px solid ${C.purple}44`,
                borderRadius:10,padding:"14px 16px"}}>
                <div style={{fontSize:12,fontWeight:700,color:C.text,marginBottom:6}}>
                  The universal answer to your question
                </div>
                <div style={{fontSize:12,color:C.muted,lineHeight:1.7}}>
                  Yes — some trades that would have hit target will be stopped out early by any
                  stop management behaviour. That is not a flaw to be corrected. It is the price
                  paid for the benefit the behaviour provides. The only question worth asking is:
                  does the benefit (reduced drawdown, locked partial profit, eliminated full losses)
                  exceed the cost (missed target exits) across a large sample? The simulation
                  answers that question specifically for your stop size, R:R, and commission.
                  Run it at different settings and the optimal behaviour for your specific
                  system parameters will become visible.
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {!results && (
        <div style={{textAlign:"center",padding:"60px 20px",
          background:C.card,border:`1px solid ${C.border}`,borderRadius:10}}>
          <div style={{fontSize:40,marginBottom:12}}>📊</div>
          <div style={{fontSize:14,fontWeight:600,color:C.text,marginBottom:8}}>
            Configure and press Run
          </div>
          <div style={{fontSize:12,color:C.muted,maxWidth:460,margin:"0 auto",lineHeight:1.65}}>
            All six behaviours will run on identical random price paths.
            The only variable between them is the exit rule.
            Start with 200 trades at 2:1 R:R to match your current testing.
          </div>
        </div>
      )}

    </div>
  );
}