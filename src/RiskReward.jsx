import { useState, useMemo } from "react";
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

// Breakeven win rate for a given R:R
const beWR = (rr) => 1 / (1 + rr);

// Expected value per trade
const ev = (wr, rr, risk, comm) => (wr * rr * risk) - ((1-wr) * risk) - comm;

// How many R is target as multiple of stop
const rrFromPoints = (stop, target) => target / stop;

// Probability of price moving X points before Y points (random walk approximation)
// P(reach target before stop) = stop / (stop + target) — classic gambler's ruin
const probReach = (stopPts, targetPts) => stopPts / (stopPts + targetPts);

const Label = ({c, children}) => (
  <div style={{fontSize:9,fontWeight:800,color:c||C.muted,
    textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:3}}>{children}</div>
);

const SecHead = ({children, color}) => (
  <div style={{fontSize:9,fontWeight:800,letterSpacing:"0.1em",textTransform:"uppercase",
    color:color||C.muted,marginBottom:10,paddingBottom:5,
    borderBottom:`1px solid ${C.border}`}}>{children}</div>
);

function Slider({label, value, min, max, step, onChange, format, color, note}) {
  return (
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
}

function EVGauge({value, maxAbs=50}) {
  const pct = Math.min(100, Math.abs(value) / maxAbs * 50);
  const positive = value >= 0;
  return (
    <div style={{position:"relative",height:10,background:C.border,
      borderRadius:5,overflow:"hidden",margin:"6px 0"}}>
      <div style={{
        position:"absolute",
        left: positive ? "50%" : `${50-pct}%`,
        width:`${pct}%`,
        height:"100%",
        background: positive ? C.green : C.red,
        borderRadius:5,
        transition:"all 0.3s"
      }}/>
      <div style={{position:"absolute",left:"50%",top:0,
        width:1,height:"100%",background:C.muted}}/>
    </div>
  );
}

function StatBox({label, value, color, sub, large}) {
  return (
    <div style={{background:C.surface,border:`1px solid ${C.border2}`,
      borderRadius:8,padding:"10px 12px",textAlign:"center"}}>
      <div style={{fontSize:large?26:18,fontWeight:700,color:color||C.text,
        fontFamily:"'JetBrains Mono',monospace",lineHeight:1}}>{value}</div>
      <div style={{fontSize:9,color:C.muted,marginTop:3,textTransform:"uppercase",
        letterSpacing:"0.06em"}}>{label}</div>
      {sub&&<div style={{fontSize:10,color:C.dim,marginTop:2}}>{sub}</div>}
    </div>
  );
}

// The key table: win rates vs R:R showing EV
function EVTable({risk, comm}) {
  const rrs   = [0.5, 1.0, 1.5, 2.0, 2.5, 3.0, 4.0, 5.0];
  const wrs   = [0.30, 0.35, 0.40, 0.45, 0.50, 0.55, 0.60, 0.65, 0.70];

  return (
    <div style={{overflowX:"auto"}}>
      <table style={{width:"100%",borderCollapse:"collapse",fontSize:11}}>
        <thead>
          <tr>
            <th style={{padding:"6px 10px",background:C.surface,color:C.muted,
              fontSize:9,textTransform:"uppercase",letterSpacing:"0.06em",
              borderBottom:`1px solid ${C.border}`,textAlign:"left",position:"sticky",left:0}}>
              Win Rate ↓ / R:R →
            </th>
            {rrs.map(rr=>(
              <th key={rr} style={{padding:"6px 10px",background:C.surface,
                color:C.purple,fontSize:10,fontFamily:"monospace",
                borderBottom:`1px solid ${C.border}`,textAlign:"center"}}>
                {rr}:1
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {wrs.map(wr=>(
            <tr key={wr}>
              <td style={{padding:"5px 10px",background:C.surface,
                color:C.amber,fontWeight:700,fontSize:11,fontFamily:"monospace",
                borderBottom:`1px solid ${C.border}`,position:"sticky",left:0}}>
                {Math.round(wr*100)}%
              </td>
              {rrs.map(rr=>{
                const evVal = ev(wr, rr, risk, comm);
                const isPos = evVal >= 0;
                const intensity = Math.min(1, Math.abs(evVal) / (risk * 0.5));
                return (
                  <td key={rr} style={{
                    padding:"5px 8px",
                    background: isPos
                      ? `rgba(26,158,117,${0.08 + intensity*0.35})`
                      : `rgba(196,59,59,${0.08 + intensity*0.35})`,
                    color: isPos ? C.green : C.red,
                    fontWeight:600, fontFamily:"monospace",
                    borderBottom:`1px solid ${C.border}`,
                    textAlign:"center",
                    border: Math.abs(evVal) < 2 ? `1px solid ${C.amber}` : "none",
                  }}>
                    {evVal>=0?"+":""}{evVal.toFixed(0)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <div style={{fontSize:10,color:C.muted,marginTop:6}}>
        Each cell = expected value per trade in $ · Green = positive edge · Red = negative edge · 
        Amber border ≈ breakeven · Based on ${risk} risk per trade, ${comm} commission
      </div>
    </div>
  );
}

// Gambler's ruin probability chart
function ProbabilityChart({stopPts, targetPts}) {
  const stops   = [5,10,15,20,25,30,40,50,60,80,100];
  const targets = [10,20,30,40,50,60,80,100,120,150,200];

  // For current stop, show prob of reaching various targets
  const targetData = targets.map(t=>({
    t,
    prob: probReach(stopPts, t) * 100,
    rr:   (t/stopPts).toFixed(1)
  }));

  const maxProb = 100;

  return (
    <div>
      <div style={{fontSize:11,color:C.muted,marginBottom:10,lineHeight:1.55}}>
        With your current stop of <span style={{color:C.red,fontWeight:700}}>{stopPts} pts</span>,
        the theoretical probability of price reaching each target before the stop fires
        (pure random walk — Gambler's Ruin formula):
      </div>
      {targetData.map(({t, prob, rr})=>{
        const color = prob >= 50 ? C.green : prob >= 30 ? C.amber : C.red;
        return (
          <div key={t} style={{marginBottom:6}}>
            <div style={{display:"flex",justifyContent:"space-between",marginBottom:2,
              alignItems:"center"}}>
              <span style={{fontSize:11,color:C.muted,width:120}}>
                Target: <span style={{color:C.text,fontWeight:600}}>{t} pts</span>
                <span style={{color:C.dim,fontSize:10}}> ({rr}R)</span>
              </span>
              <div style={{flex:1,height:6,background:C.border,
                borderRadius:3,overflow:"hidden",margin:"0 10px"}}>
                <div style={{width:`${prob}%`,height:"100%",
                  borderRadius:3,background:color,transition:"width 0.3s"}}/>
              </div>
              <span style={{fontSize:12,fontWeight:700,color,
                fontFamily:"monospace",width:50,textAlign:"right"}}>
                {prob.toFixed(0)}%
              </span>
            </div>
          </div>
        );
      })}
      <div style={{marginTop:10,padding:"10px 12px",background:C.amberDim,
        borderRadius:8,border:`1px solid ${C.amber}44`}}>
        <div style={{fontSize:11,color:C.amber,fontWeight:700,marginBottom:4}}>
          The key insight
        </div>
        <div style={{fontSize:11,color:C.muted,lineHeight:1.65}}>
          A {stopPts}-pt stop with a {targetPts}-pt target gives you {probReach(stopPts,targetPts)*100 |0}% 
          win probability on a pure random walk. But the expected value is{" "}
          <span style={{
            color: probReach(stopPts,targetPts) * targetPts >= (1-probReach(stopPts,targetPts)) * stopPts
              ? C.green : C.red, fontWeight:700
          }}>
            {(probReach(stopPts,targetPts)*targetPts - (1-probReach(stopPts,targetPts))*stopPts).toFixed(1)} pts
          </span>
          {" "}per trade — mathematically zero before commission. Your real edge comes from
          having a win probability <em>above</em> this baseline through structural analysis.
        </div>
      </div>
    </div>
  );
}

// Win rate needed to be profitable at each R:R
function BreakevenChart({comm, risk}) {
  const rrs = Array.from({length:19},(_,i)=>(i+2)*0.25);
  return (
    <div>
      <div style={{fontSize:11,color:C.muted,marginBottom:12,lineHeight:1.55}}>
        The minimum win rate required to be profitable at each R:R ratio,
        after ${comm.toFixed(2)} commission per trade on ${risk} risk.
        Everything below the curve loses money long-term.
      </div>
      <div style={{position:"relative",height:180}}>
        <svg viewBox="0 0 560 160" style={{width:"100%",height:180}}>
          {/* Grid */}
          {[25,33,40,50,60,70].map(p=>(
            <g key={p}>
              <line x1="40" x2="540" y1={160-p*1.4} y2={160-p*1.4}
                stroke={C.border} strokeWidth="0.5"/>
              <text x="36" y={160-p*1.4+3} fontSize="8" fill={C.muted} textAnchor="end">{p}%</text>
            </g>
          ))}
          {/* R:R labels */}
          {[0.5,1,1.5,2,2.5,3,4,5].map((rr,i)=>{
            const x = 40 + (rr-0.5)/4.5*500;
            return <text key={rr} x={x} y="170" fontSize="8" fill={C.muted} textAnchor="middle">{rr}:1</text>;
          })}
          {/* Breakeven curve */}
          <polyline
            points={rrs.map((rr,i)=>{
              const x = 40 + (rr-0.5)/4.5*500;
              const bewr = (risk + comm) / (risk * (1 + rr));
              const y = 160 - bewr*100*1.4;
              return `${x},${y}`;
            }).join(" ")}
            fill="none" stroke={C.amber} strokeWidth="2"/>
          {/* 50% line */}
          <line x1="40" x2="540" y1={160-50*1.4} y2={160-50*1.4}
            stroke={C.muted} strokeWidth="1" strokeDasharray="4 3"/>
          <text x="542" y={160-50*1.4+3} fontSize="8" fill={C.muted}>50%</text>
          {/* Shade below curve = losing zone */}
          <defs>
            <linearGradient id="lose_grad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={C.red} stopOpacity="0.15"/>
              <stop offset="100%" stopColor={C.red} stopOpacity="0.05"/>
            </linearGradient>
          </defs>
          <path
            d={`M40,160 ` + rrs.map((rr)=>{
              const x = 40+(rr-0.5)/4.5*500;
              const bewr = (risk+comm)/(risk*(1+rr));
              const y = 160-bewr*100*1.4;
              return `L${x},${y}`;
            }).join(" ") + " L540,160 Z"}
            fill="url(#lose_grad)"/>
          {/* Labels */}
          <text x="290" y="90" fontSize="9" fill={C.red} textAnchor="middle">losing zone</text>
          <text x="290" y="40" fontSize="9" fill={C.green} textAnchor="middle">profitable zone</text>
        </svg>
      </div>
    </div>
  );
}

export default function App() {
  const [stopPts,   setStopPts]   = useState(30);
  const [targetPts, setTargetPts] = useState(90);
  const [winPct,    setWinPct]    = useState(40);
  const [risk,      setRisk]      = useState(100);
  const [comm,      setComm]      = useState(1.30);
  const [tab,       setTab]       = useState("explorer");

  const wr  = winPct / 100;
  const rr  = targetPts / stopPts;
  const evV = ev(wr, rr, risk, comm);
  const beW = beWR(rr);
  const randWR = probReach(stopPts, targetPts);
  const edge = wr - randWR;       // your edge above random
  const ev100 = evV * 100;        // over 100 trades

  const evColor = evV >= 0 ? C.green : C.red;
  const edgeColor = edge > 0.05 ? C.green : edge > 0 ? C.amber : C.red;

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
          Risk · Reward · Probability
        </div>
        <h1 style={{margin:"0 0 6px",fontSize:22,fontWeight:700,
          color:C.text,lineHeight:1.2}}>
          Does the math bear it out?
        </h1>
        <p style={{margin:0,fontSize:12,color:C.muted,lineHeight:1.65}}>
          Explore how stop distance, target distance, win rate and commission interact.
          The "target looks too far" feeling is a perception problem, not a math problem.
        </p>
      </div>

      {/* Live inputs */}
      <div style={{background:C.card,border:`1px solid ${C.border}`,
        borderRadius:10,padding:"16px 18px",marginBottom:14}}>
        <SecHead color={C.purple}>Your Setup</SecHead>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr 1fr",gap:18,marginBottom:16}}>
          <Slider label="Stop distance (pts)" value={stopPts} min={5} max={150} step={5}
            onChange={setStopPts} color={C.red}
            note={`$${(stopPts*0.5).toFixed(0)} per MNQ contract`}/>
          <Slider label="Target distance (pts)" value={targetPts} min={5} max={400} step={5}
            onChange={setTargetPts} color={C.green}
            note={`$${(targetPts*0.5).toFixed(0)} per MNQ contract`}/>
          <Slider label="Your win rate (%)" value={winPct} min={20} max={80} step={1}
            onChange={setWinPct} format={v=>`${v}%`} color={C.amber}
            note="Your actual observed rate"/>
          <Slider label="Risk per trade ($)" value={risk} min={10} max={500} step={10}
            onChange={setRisk} format={v=>`$${v}`} color={C.red}
            note="Dollar value of your stop"/>
          <Slider label="Commission ($)" value={comm} min={0} max={10} step={0.10}
            onChange={setComm} format={v=>`$${v.toFixed(2)}`} color={C.muted}
            note="Per trade round trip"/>
        </div>

        {/* Live readout */}
        <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:10}}>
          <StatBox label="R:R Ratio"
            value={`${rr.toFixed(1)}:1`} color={C.purple}/>
          <StatBox label="EV per trade"
            value={`${evV>=0?"+":""}$${evV.toFixed(0)}`} color={evColor}
            sub={evV>=0?"positive edge":"negative edge"}/>
          <StatBox label="EV over 100 trades"
            value={`${ev100>=0?"+":""}$${ev100.toFixed(0)}`}
            color={evColor} large/>
          <StatBox label="Breakeven WR"
            value={`${Math.round(beW*100)}%`} color={C.amber}
            sub={`you need >${Math.round(beW*100)}% to profit`}/>
          <StatBox label="Random walk WR"
            value={`${Math.round(randWR*100)}%`} color={C.muted}
            sub="no-edge baseline"/>
          <StatBox label="Your edge above random"
            value={`${edge>=0?"+":""}${Math.round(edge*100)}pp`}
            color={edgeColor}
            sub={edge>0?"genuine edge":"below random"}/>
          <StatBox label="Trades to prove edge"
            value={edge>0?Math.round(1/(edge*edge*4)):">5000"} color={C.dim}
            sub="min sample needed"/>
        </div>

        <EVGauge value={evV}/>
        <div style={{display:"flex",justifyContent:"space-between",
          fontSize:9,color:C.dim}}>
          <span>Maximum negative edge</span>
          <span style={{color:C.amber}}>breakeven</span>
          <span>Maximum positive edge</span>
        </div>
      </div>

      {/* Tabs */}
      <div style={{display:"flex",gap:6,marginBottom:14,
        borderBottom:`1px solid ${C.border}`,paddingBottom:10}}>
        {[["explorer","Probability Explorer"],["table","EV Table"],
          ["breakeven","Breakeven Curve"],["psychology","The Psychology Gap"]
        ].map(([id,label])=>(
          <button key={id} onClick={()=>setTab(id)} style={{
            padding:"6px 14px",borderRadius:6,fontSize:12,fontWeight:600,cursor:"pointer",
            background:tab===id?C.purple:"transparent",
            color:tab===id?"#fff":C.muted,
            border:`1px solid ${tab===id?C.purple:C.border}`
          }}>{label}</button>
        ))}
      </div>

      {/* EXPLORER TAB */}
      {tab==="explorer" && (
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}}>
          <div style={{background:C.card,border:`1px solid ${C.border}`,
            borderRadius:10,padding:"16px 18px"}}>
            <SecHead color={C.blue}>Random walk probability</SecHead>
            <ProbabilityChart stopPts={stopPts} targetPts={targetPts}/>
          </div>
          <div style={{background:C.card,border:`1px solid ${C.border}`,
            borderRadius:10,padding:"16px 18px"}}>
            <SecHead color={C.amber}>What your win rate implies</SecHead>
            <div style={{display:"flex",flexDirection:"column",gap:10}}>
              {[
                ["Random walk baseline (no edge)", Math.round(randWR*100), C.muted,
                  "Price equally likely to hit stop or target from entry point"],
                ["Your observed win rate", winPct, C.amber,
                  "What you've seen in actual trading"],
                ["Your edge above random", Math.round(edge*100), edgeColor,
                  edge>0 ? "This is what your structural analysis adds" : "Below random — review entry criteria"],
                ["Breakeven win rate", Math.round(beW*100), C.purple,
                  "Minimum needed to cover commission and break even"],
              ].map(([label, val, color, note])=>(
                <div key={label} style={{padding:"10px 12px",background:C.surface,
                  borderRadius:8,borderLeft:`2px solid ${color}`}}>
                  <div style={{display:"flex",justifyContent:"space-between",
                    alignItems:"center",marginBottom:3}}>
                    <span style={{fontSize:11,fontWeight:600,color:C.text}}>{label}</span>
                    <span style={{fontSize:16,fontWeight:700,color,
                      fontFamily:"monospace"}}>{val}%</span>
                  </div>
                  <div style={{height:4,background:C.border,borderRadius:2,marginBottom:4}}>
                    <div style={{width:`${val}%`,height:"100%",
                      borderRadius:2,background:color,transition:"width 0.3s"}}/>
                  </div>
                  <div style={{fontSize:10,color:C.dim}}>{note}</div>
                </div>
              ))}

              <div style={{padding:"12px",background:evV>=0?C.greenDim:C.redDim,
                borderRadius:8,border:`1px solid ${evV>=0?C.green:C.red}44`}}>
                <div style={{fontSize:11,fontWeight:700,
                  color:evV>=0?C.green:C.red,marginBottom:4}}>
                  {evV>=0 ? "✓ Positive expected value" : "✗ Negative expected value"}
                </div>
                <div style={{fontSize:11,color:C.muted,lineHeight:1.6}}>
                  At {winPct}% win rate, {rr.toFixed(1)}:1 R:R, ${risk} risk per trade:
                  expected outcome per trade is{" "}
                  <strong style={{color:evColor}}>
                    {evV>=0?"+":""}${evV.toFixed(2)}
                  </strong>.
                  Over 100 trades: <strong style={{color:evColor}}>
                    {ev100>=0?"+":""}${ev100.toFixed(0)}
                  </strong>.
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* EV TABLE TAB */}
      {tab==="table" && (
        <div style={{background:C.card,border:`1px solid ${C.border}`,
          borderRadius:10,padding:"16px 18px"}}>
          <SecHead color={C.teal}>Expected Value Table — $ per trade</SecHead>
          <div style={{fontSize:11,color:C.muted,marginBottom:12,lineHeight:1.55}}>
            Every combination of win rate and R:R ratio. Green = money made per trade on average.
            Red = money lost. Your current setup is highlighted.
            Notice how a lower win rate can be perfectly viable with a higher R:R.
          </div>
          <EVTable risk={risk} comm={comm}/>
        </div>
      )}

      {/* BREAKEVEN CURVE TAB */}
      {tab==="breakeven" && (
        <div style={{background:C.card,border:`1px solid ${C.border}`,
          borderRadius:10,padding:"16px 18px"}}>
          <SecHead color={C.amber}>Breakeven Win Rate by R:R Ratio</SecHead>
          <BreakevenChart comm={comm} risk={risk}/>
          <div style={{marginTop:16,display:"grid",
            gridTemplateColumns:"1fr 1fr 1fr",gap:10}}>
            {[[1.0,"1:1 R:R",50],[2.0,"2:1 R:R",34],[3.0,"3:1 R:R",26],
              [4.0,"4:1 R:R",21],[5.0,"5:1 R:R",17],[10,"10:1 R:R",10]
            ].map(([rr,label,approx])=>{
              const be = Math.round((risk+comm)/(risk*(1+rr))*100);
              return (
                <div key={rr} style={{background:C.surface,border:`1px solid ${C.border2}`,
                  borderRadius:8,padding:"10px 12px",textAlign:"center"}}>
                  <div style={{fontSize:18,fontWeight:700,color:C.amber,
                    fontFamily:"monospace"}}>{be}%</div>
                  <div style={{fontSize:10,color:C.muted,marginTop:2}}>{label} breakeven</div>
                  <div style={{fontSize:10,color:C.dim,marginTop:1}}>
                    win {100-be}% can be losers
                  </div>
                </div>
              );
            })}
          </div>
          <div style={{marginTop:12,padding:"12px 14px",
            background:C.purpleDim,borderRadius:8,
            border:`1px solid ${C.purple}44`}}>
            <div style={{fontSize:12,fontWeight:700,color:C.text,marginBottom:5}}>
              What this means practically
            </div>
            <div style={{fontSize:12,color:C.muted,lineHeight:1.7}}>
              At 3:1 R:R you only need to be right 26% of the time to break even.
              Your actual win rate on the best setups — the A-grade trades from the observation log —
              is almost certainly well above 26%. This means the math strongly supports taking
              high R:R setups even when the target "looks too far," because the rare wins
              more than compensate for the frequent small losses.
              The feeling that the target is too far is your brain counting future losses
              without counting future wins with their correct weight.
            </div>
          </div>
        </div>
      )}

      {/* PSYCHOLOGY TAB */}
      {tab==="psychology" && (
        <div style={{display:"flex",flexDirection:"column",gap:12}}>
          <div style={{background:C.card,border:`1px solid ${C.border}`,
            borderRadius:10,padding:"16px 18px"}}>
            <SecHead color={C.red}>Why "the target looks too far" — the cognitive mechanics</SecHead>
            {[
              ["Loss aversion (Kahneman & Tversky, 1979)",
               "Losses feel approximately 2-2.5× more painful than equivalent gains feel good. A $100 loss creates roughly the same emotional response as a $200-$250 gain. This means your brain is systematically overweighting the stop (loss) relative to the target (gain) even when they are mathematically equal in expected value.",
               C.red],
              ["Probability neglect",
               "When stakes are emotionally significant, people abandon probability calculations and focus on the vividness of the outcome. A close stop feels certain to fire because you can vividly imagine the specific loss. A far target feels uncertain because the path to it is abstract. The actual probabilities become secondary to the emotional salience of each outcome.",
               C.amber],
              ["Temporal discounting of gains",
               "The target is in the future — uncertain and distant. The stop is immediate — concrete and close. Humans systematically discount future gains more than future losses, meaning the target feels smaller than it mathematically is while the stop feels larger. This is why 'taking the sure thing' (closing early) feels rational even when it demonstrably destroys expected value.",
               C.amber],
              ["The specific fix for 'target looks too far'",
               "Before entering any trade, calculate the expected value per trade using the formula: (Win% × Reward) - (Loss% × Risk) - Commission. Write the number down. If it's positive, the trade has edge regardless of how the target looks on the chart. The chart appearance is a perception. The expected value is mathematics. Trust the number, not the picture.",
               C.green],
              ["Why your R:R of 3:1+ is correct",
               "Your observed best trades — the A-grade setups from your session analysis — likely hit their targets at 40-60% rates. At 3:1 R:R, you only need 27% wins to be profitable. If you're hitting 40%+ on A-grade setups at 3:1, your expected value per A-grade trade is substantially positive. The trades that feel uncertain are the exact trades the mathematics most strongly supports taking.",
               C.green],
            ].map(([title,body,color])=>(
              <div key={title} style={{padding:"12px 14px",background:C.surface,
                borderRadius:8,marginBottom:8,
                borderLeft:`2px solid ${color}`}}>
                <div style={{fontSize:12,fontWeight:700,color:C.text,
                  marginBottom:5}}>{title}</div>
                <div style={{fontSize:12,color:C.muted,lineHeight:1.65}}>{body}</div>
              </div>
            ))}
          </div>

          <div style={{background:C.card,border:`1px solid ${C.border}`,
            borderRadius:10,padding:"16px 18px"}}>
            <SecHead color={C.green}>The practical rule</SecHead>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
              {[
                ["Before the trade","Calculate EV. If positive, the target is not too far — your perception is miscalibrated. Place the trade as designed.","✓",C.green],
                ["During the trade","The target has not moved. The math has not changed. The only thing that changed is you can now see the interim price action, which is noise relative to the final outcome.","-",C.amber],
                ["On early exit urge","Ask: 'Am I exiting because my structural thesis is invalidated, or because I'm uncomfortable?' If the latter, you are letting emotion override a positive-EV decision.","⚠",C.amber],
                ["After the trade","Record the outcome against the expected value, not against the maximum possible profit. A $30 winner on a $90 target that was taken at the right price was a correct trade regardless of whether it hit target.","✓",C.green],
              ].map(([when,what,icon,color])=>(
                <div key={when} style={{padding:"12px",background:C.surface,
                  borderRadius:8,border:`1px solid ${C.border2}`}}>
                  <div style={{fontSize:11,fontWeight:700,color,marginBottom:5}}>
                    {icon} {when}
                  </div>
                  <div style={{fontSize:11,color:C.muted,lineHeight:1.6}}>{what}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

    </div>
  );
}