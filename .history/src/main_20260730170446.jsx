import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import HomePage from './HomePage'
import ChartObservationLog from './ChartObservationLog'
import RiskReward from './RiskReward'
import StopBehaviorSim from './StopBehaviorSim'
import RandomSimulator from './RandomSimulator'
import PnlTracker from './PnlTracker'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/random-simulator" element={<RandomSimulator />} />
        <Route path="/risk-reward" element={<RiskReward />} />
        <Route path="/stop-behavior" element={<StopBehaviorSim />} />
        <Route path="/chart-observation-log" element={<ChartObservationLog />} />
        <Route path="/pnl-tracker" element={<PnlTracker />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
)
