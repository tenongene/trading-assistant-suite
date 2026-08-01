import { useNavigate } from "react-router-dom";

// ── DESIGN TOKENS ─────────────────────────────────────────────
const C = {
  bg:"#0A0B0D", surface:"#111318", card:"#16191F",
  border:"#1E2330", border2:"#252B3A", text:"#E2DFD8",
  muted:"#6B7080", dim:"#3A3F50",
  green:"#1A9E75", greenDim:"#0D3D2E",
  red:"#C43B3B",   redDim:"#3D1212",
  amber:"#B87333", amberDim:"#3D2A10",
  purple:"#5A4ABA",purpleDim:"#1E1A40",
  blue:"#2D6FA8",  blueDim:"#0D2035",
  teal:"#1A8E8E",  tealDim:"#0A2D2D",
};

const TOOLS = [
  {
    path: "/random-simulator",
    icon: "🎲",
    title: "Random Simulator",
    desc: "Run 100+ random trades at 1:1 R:R to see what pure chance looks like — streaks, drawdowns, and commission drag with zero edge.",
    color: C.purple,
    colorDim: C.purpleDim,
  },
  {
    path: "/risk-reward",
    icon: "⚖",
    title: "Risk Reward Simulator",
    desc: "Explore how stop distance, target distance, win rate and commission interact to produce positive or negative expected value.",
    color: C.blue,
    colorDim: C.blueDim,
  },
  {
    path: "/stop-behavior",
    icon: "📊",
    title: "Stop Behavior Simulator",
    desc: "Compare six stop management behaviours — hold, breakeven, trail, early exit, widen, partial — on identical random price paths.",
    color: C.amber,
    colorDim: C.amberDim,
  },
  {
    path: "/chart-observation-log",
    icon: "📓",
    title: "Chart Observation Log",
    desc: "30-day structured journal for session classification, ICT/SMC signals, volume profile levels, and trade-by-trade review.",
    color: C.teal,
    colorDim: C.tealDim,
  },
  {
    path: "/pnl-tracker",
    icon: "💰",
    title: "P&L Tracker",
    desc: "Daily P&L logging with a calendarized month view, yearly overview, streaks, drawdown, and profit factor.",
    color: C.green,
    colorDim: C.greenDim,
  },
];

function ToolCard({ tool, onOpen }) {
  return (
    <div
      onClick={onOpen}
      style={{
        background:C.card, border:`1px solid ${C.border2}`,
        borderLeft:`3px solid ${tool.color}`,
        borderRadius:10, padding:"18px 20px",
        cursor:"pointer", display:"flex", flexDirection:"column", gap:10,
        transition:"transform 0.12s, border-color 0.12s",
      }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = tool.color; }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = C.border2; e.currentTarget.style.borderLeftColor = tool.color; }}
    >
      <div style={{display:"flex", alignItems:"center", gap:12}}>
        <div style={{
          width:40, height:40, borderRadius:8, background:tool.colorDim,
          display:"flex", alignItems:"center", justifyContent:"center",
          fontSize:19, flexShrink:0,
        }}>{tool.icon}</div>
        <div style={{fontSize:15, fontWeight:700, color:C.text}}>{tool.title}</div>
      </div>
      <div style={{fontSize:12, color:C.muted, lineHeight:1.65, flex:1}}>{tool.desc}</div>
      <button onClick={onOpen} style={{
        alignSelf:"flex-start", padding:"6px 14px", borderRadius:6,
        fontSize:11, fontWeight:600, cursor:"pointer",
        background:`${tool.color}22`, color:tool.color,
        border:`1px solid ${tool.color}55`, transition:"all 0.15s",
      }}>Open →</button>
    </div>
  );
}

export default function HomePage() {
  const navigate = useNavigate();

  return (
    <div style={{
      background:C.bg, color:C.text, minHeight:"100vh",
      fontFamily:"'Inter',system-ui,sans-serif",
      padding:"20px 18px", maxWidth:1000, margin:"0 auto",
    }}>

      {/* Header */}
      <div style={{marginBottom:28}}>
        <div style={{fontSize:10, fontWeight:800, color:C.purple,
          textTransform:"uppercase", letterSpacing:"0.14em", marginBottom:4}}>
          FUTURES TRADING
        </div>
        <h1 style={{margin:"0 0 6px", fontSize:24, fontWeight:700, color:C.text, lineHeight:1.2}}>
          Trading Practice &amp; Analysis Suite
        </h1>
        <p style={{margin:0, fontSize:12, color:C.muted, lineHeight:1.65, maxWidth:640}}>
         Tools for building statistical intuition and reviewing structural setups.
          Pick a simulator to explore the math, or open the observation log to keep logging live sessions.
        </p>
      </div>

      {/* Tool grid */}
      <div style={{
        display:"grid", gridTemplateColumns:"1fr 1fr",
        gap:14,
      }}>
        {TOOLS.map(tool => (
          <ToolCard key={tool.path} tool={tool} onOpen={() => navigate(tool.path)} />
        ))}
      </div>

    </div>
  );
}
