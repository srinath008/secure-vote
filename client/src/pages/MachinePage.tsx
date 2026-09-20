import { useState, useEffect, useRef } from 'react';
import { fsmApi, adminApi, type FsmState, type AuditEntry } from '../api/fsm';

// ── Types ──────────────────────────────────────────────────────────────────
interface ParsedInputs { EN: number; V: number; SEL: number; ACK: number }

const STATE_NAMES = ['S0_IDLE', 'S1_ENABLED', 'S2_LOCKED', 'S3_CONFIRM'];
const STATE_COLORS = ['#1d4ed8', '#0891b2', '#d97706', '#059669']; // blue, cyan, amber, green

// ── LED indicator ──────────────────────────────────────────────────────────
function LED({ on, label, color = 'green' }: { on: boolean; label: string; color?: 'green' | 'amber' | 'red' }) {
  const colors = {
    green: on ? '#00ff41' : '#1a2e1a',
    amber: on ? '#fbbf24' : '#2a2000',
    red:   on ? '#f87171' : '#2a0000',
  };
  return (
    <div className="flex items-center gap-2">
      <svg width="14" height="14" viewBox="0 0 14 14">
        <circle cx="7" cy="7" r="6" fill={colors[color]} />
        {on && <circle cx="5" cy="5" r="2" fill="white" opacity="0.3" />}
      </svg>
      <span className="text-xs font-mono text-green-300">{label}</span>
    </div>
  );
}

// ── State Diagram SVG ──────────────────────────────────────────────────────
function StateDiagram({ currentCode }: { currentCode: number }) {
  // Positions: S0 top-left, S1 top-right, S2 bottom-right, S3 bottom-left
  const states = [
    { code: 0, label: 'S0', sub: 'IDLE',    cx: 100, cy: 100 },
    { code: 1, label: 'S1', sub: 'ENABLED', cx: 300, cy: 100 },
    { code: 2, label: 'S2', sub: 'LOCKED',  cx: 300, cy: 280 },
    { code: 3, label: 'S3', sub: 'CONFIRM', cx: 100, cy: 280 },
  ];

  const r = 38;

  // Arrow path helper
  const arrowBetween = (
    from: { cx: number; cy: number },
    to:   { cx: number; cy: number },
    offset = 0
  ) => {
    const dx = to.cx - from.cx;
    const dy = to.cy - from.cy;
    const len = Math.sqrt(dx * dx + dy * dy);
    const ux = dx / len; const uy = dy / len;
    // Perpendicular
    const px = -uy * offset; const py = ux * offset;
    const x1 = from.cx + ux * r + px;
    const y1 = from.cy + uy * r + py;
    const x2 = to.cx - ux * r + px;
    const y2 = to.cy - uy * r + py;
    return `M ${x1} ${y1} L ${x2} ${y2}`;
  };

  return (
    <svg viewBox="-20 10 440 350" className="w-full" style={{ maxHeight: 280 }}>
      <defs>
        <marker id="ah" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
          <polygon points="0 0, 8 3, 0 6" fill="#4ade80" />
        </marker>
      </defs>

      {/* ── Transitions ── */}
      {/* S0→S1: EN=1 */}
      <path d={arrowBetween(states[0], states[1], -10)} fill="none" stroke="#4ade80" strokeWidth="1.5" markerEnd="url(#ah)" />
      <text x="200" y="78" fill="#86efac" fontSize="10" fontFamily="monospace" textAnchor="middle">EN=1</text>

      {/* S0 self-loop: EN=0 */}
      <path d="M 68 70 Q 30 30 80 68" fill="none" stroke="#4ade80" strokeWidth="1.5" markerEnd="url(#ah)" />
      <text x="30" y="48" fill="#86efac" fontSize="10" fontFamily="monospace">EN=0</text>

      {/* S1→S2: V=1 */}
      <path d={arrowBetween(states[1], states[2], -10)} fill="none" stroke="#4ade80" strokeWidth="1.5" markerEnd="url(#ah)" />
      <text x="320" y="200" fill="#86efac" fontSize="10" fontFamily="monospace">V=1</text>

      {/* S1 self-loop: V=0 */}
      <path d="M 328 70 Q 390 30 332 68" fill="none" stroke="#4ade80" strokeWidth="1.5" markerEnd="url(#ah)" />
      <text x="355" y="48" fill="#86efac" fontSize="10" fontFamily="monospace">V=0</text>

      {/* S2→S3: unconditional */}
      <path d={arrowBetween(states[2], states[3], -10)} fill="none" stroke="#fbbf24" strokeWidth="1.5" markerEnd="url(#ah)" />
      <text x="200" y="308" fill="#fde68a" fontSize="10" fontFamily="monospace" textAnchor="middle">1 (always)</text>

      {/* S3→S0: ACK=1 */}
      <path d={arrowBetween(states[3], states[0], -10)} fill="none" stroke="#4ade80" strokeWidth="1.5" markerEnd="url(#ah)" />
      <text x="-10" y="200" fill="#86efac" fontSize="10" fontFamily="monospace">ACK=1</text>

      {/* S3 self-loop: ACK=0 */}
      <path d="M 68 308 Q 30 360 80 312" fill="none" stroke="#4ade80" strokeWidth="1.5" markerEnd="url(#ah)" />
      <text x="5" y="368" fill="#86efac" fontSize="10" fontFamily="monospace">ACK=0</text>

      {/* ── State circles ── */}
      {states.map(s => {
        const active = s.code === currentCode;
        return (
          <g key={s.code}>
            <circle
              cx={s.cx} cy={s.cy} r={r}
              fill={active ? STATE_COLORS[s.code] + '33' : '#111827'}
              stroke={active ? STATE_COLORS[s.code] : '#374151'}
              strokeWidth={active ? 2.5 : 1.5}
            />
            {active && (
              <circle cx={s.cx} cy={s.cy} r={r + 5} fill="none"
                stroke={STATE_COLORS[s.code]} strokeWidth="1" opacity="0.4"
                style={{ animation: 'pulse 2s infinite' }} />
            )}
            <text x={s.cx} y={s.cy - 6} fill={active ? '#fff' : '#9ca3af'} fontSize="13"
              fontFamily="monospace" fontWeight="bold" textAnchor="middle">{s.label}</text>
            <text x={s.cx} y={s.cy + 11} fill={active ? '#d1fae5' : '#6b7280'} fontSize="9"
              fontFamily="monospace" textAnchor="middle">{s.sub}</text>
            <text x={s.cx} y={s.cy + 24} fill={active ? '#a7f3d0' : '#374151'} fontSize="8"
              fontFamily="monospace" textAnchor="middle">
              {['00','01','10','11'][s.code]}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

// ── Main machine page ──────────────────────────────────────────────────────
export default function MachinePage() {
  const [fsmState, setFsmState]     = useState<FsmState | null>(null);
  const [auditLog, setAuditLog]     = useState<AuditEntry[]>([]);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const refresh = async () => {
    const [s, a] = await Promise.allSettled([
      fsmApi.getState(),
      adminApi.getAudit(1, 20),
    ]);
    if (s.status === 'fulfilled') setFsmState(s.value);
    if (a.status === 'fulfilled') setAuditLog(a.value.logs);
  };

  useEffect(() => {
    refresh();
    intervalRef.current = setInterval(refresh, 3000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, []);

  if (!fsmState) {
    return (
      <div className="machine-panel min-h-screen flex items-center justify-center text-green-500 font-mono">
        INITIALIZING…
      </div>
    );
  }

  const { state, outputs, latch, selSlot, candidates, election } = fsmState;
  const { q1, q0, code, name } = state;

  // Derive encoder/decoder display values from selSlot
  const encoderBits: [number, number, number, number] = [0, 0, 0, 0];
  if (code === 2 || code === 3) {
    if (selSlot !== null && selSlot >= 0 && selSlot <= 3) encoderBits[selSlot] = 1;
  }
  const V    = encoderBits.some(b => b === 1) ? 1 : 0;
  const SEL1 = selSlot !== null ? (selSlot >> 1) & 1 : 0;
  const SEL0 = selSlot !== null ? selSlot & 1 : 0;

  const decoderOut: [number,number,number,number] = [0,0,0,0];
  if (selSlot !== null && selSlot >= 0 && selSlot <= 3) decoderOut[selSlot] = 1;

  const panel = 'bg-gray-900 border border-green-900 rounded-xl p-4 space-y-3';
  const panelTitle = 'text-xs font-mono uppercase tracking-widest text-green-600 border-b border-green-900 pb-1 mb-2';

  return (
    <div className="machine-panel min-h-screen p-4 md:p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-green-400 font-mono text-xl font-bold tracking-widest">
            SECUREVOTE / MACHINE VIEW
          </h1>
          <p className="text-green-700 font-mono text-xs mt-0.5">{election.title} · {election.status}</p>
        </div>
        <div className="text-right">
          <div className="text-green-400 font-mono text-xs">AUTO REFRESH 3s</div>
          <div className="led-on mt-1" />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">

        {/* ── State Register ── */}
        <div className={panel}>
          <div className={panelTitle}>State Register (Q1 Q0)</div>
          <div className="flex items-center gap-6">
            <div className="text-center">
              <LED on={q1 === 1} label="Q1" />
            </div>
            <div className="text-center">
              <LED on={q0 === 1} label="Q0" />
            </div>
            <div className="font-mono text-green-400 text-sm">
              <div className="text-xs text-green-700">Code</div>
              <div className="text-2xl font-bold">{String(q1)}{String(q0)}</div>
              <div className="text-xs text-green-500">{code}</div>
            </div>
          </div>
          <div className="font-mono text-green-300 text-sm font-bold mt-1">{name}</div>
        </div>

        {/* ── Moore Outputs ── */}
        <div className={panel}>
          <div className={panelTitle}>Moore Outputs (¬Q1·¬Q0 etc.)</div>
          <div className="space-y-1.5">
            <LED on={outputs.IDLE_LAMP     === 1} label="IDLE_LAMP     ¬Q1·¬Q0" />
            <LED on={outputs.BALLOT_ACTIVE === 1} label="BALLOT_ACTIVE ¬Q1·Q0"  color="amber" />
            <LED on={outputs.COMMIT        === 1} label="COMMIT        Q1·¬Q0"  color="red" />
            <LED on={outputs.CONFIRM_LAMP  === 1} label="CONFIRM_LAMP  Q1·Q0"   color="green" />
          </div>
        </div>

        {/* ── SR Latch ── */}
        <div className={panel}>
          <div className={panelTitle}>SR Latch (Voter Enable)</div>
          <div className="space-y-1.5">
            <LED on={latch}  label="Q (latch output = EN input)" color="amber" />
            <LED on={!latch} label="¬Q" />
          </div>
          <p className="text-green-800 font-mono text-xs mt-2">
            {latch ? 'SET — voter authorized' : 'RESET — no voter authorized'}
          </p>
        </div>

        {/* ── State Diagram ── */}
        <div className={`${panel} md:col-span-2`}>
          <div className={panelTitle}>State Diagram</div>
          <StateDiagram currentCode={code} />
          <style>{`@keyframes pulse { 0%,100%{opacity:.4} 50%{opacity:.9} }`}</style>
        </div>

        {/* ── Priority Encoder ── */}
        <div className={panel}>
          <div className={panelTitle}>Priority Encoder (74LS148)</div>
          <div className="space-y-1">
            {encoderBits.map((b, i) => (
              <LED key={i} on={b === 1} label={`B${i} (slot ${i})`} color="amber" />
            ))}
          </div>
          <div className="mt-3 space-y-1">
            <LED on={V === 1}    label={`valid (V) = ${V}`} color="green" />
            <LED on={SEL1 === 1} label={`SEL1 = ${SEL1}`} />
            <LED on={SEL0 === 1} label={`SEL0 = ${SEL0}`} />
          </div>
          {selSlot !== null && (
            <p className="text-green-500 font-mono text-xs mt-2">
              → sel={selSlot} ({candidates[selSlot]?.name ?? '?'})
            </p>
          )}
        </div>

        {/* ── Decoder 2→4 ── */}
        <div className={panel}>
          <div className={panelTitle}>Decoder 2→4</div>
          <div className="space-y-1">
            {decoderOut.map((b, i) => (
              <LED key={i} on={b === 1} label={`D${i} → ${candidates[i]?.name ?? `slot ${i}`}`} color={b === 1 ? 'amber' : 'green'} />
            ))}
          </div>
          <p className="text-green-800 font-mono text-xs mt-2">One-hot: exactly one line asserted</p>
        </div>

        {/* ── Transition Log ── */}
        <div className={`${panel} lg:col-span-2`}>
          <div className={panelTitle}>Transition Log (last 20 ticks)</div>
          {auditLog.length === 0 ? (
            <p className="text-green-800 font-mono text-xs">No transitions yet.</p>
          ) : (
            <div className="space-y-0.5 max-h-48 overflow-y-auto pr-1">
              {auditLog.map(entry => {
                const inputs = JSON.parse(entry.inputsJson) as ParsedInputs;
                return (
                  <div key={entry.id} className="font-mono text-xs flex gap-3 items-center">
                    <span className="text-green-800">{new Date(entry.createdAt).toLocaleTimeString()}</span>
                    <span className="text-green-600">{STATE_NAMES[entry.fromState]}</span>
                    <span className="text-green-400">→</span>
                    <span className="text-green-300 font-bold">{STATE_NAMES[entry.toState]}</span>
                    <span className="text-green-700">
                      EN={inputs.EN} V={inputs.V} SEL={inputs.SEL} ACK={inputs.ACK}
                    </span>
                    {entry.commitFlag && (
                      <span className="text-amber-400 font-bold">⚡COMMIT</span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

      </div>

      <p className="text-green-900 font-mono text-xs mt-6 text-center">
        SecureVote / Nand2Tetris EVM — FSM-Based Electronic Voting System
      </p>
    </div>
  );
}
