export interface Trade {
  id: number;
  time: string;
  direction: string;
  signals: string[];
  entry: string;
  stop: string;
  target: string;
  outcome: string;
  pnl: string;
  quality: string;
  rr: string;
  notes: string;
  lesson: string;
}

export interface TradingLog {
  date: string;
  sessionType: string;
  openType: string;
  regime: string;
  atrState: string;
  deltaBias: string;
  pdVAH: string;
  pdVAL: string;
  pdPOC: string;
  vah: string;
  val: string;
  poc: string;
  lvn: string;
  volSpike: boolean;
  rangeExpand: boolean;
  sweep: boolean;
  sessionClassCorrect: string;
  dayNotes: string;
  bestSetup: string;
  trades: Trade[];
}
