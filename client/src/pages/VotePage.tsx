import { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { fsmApi, authApi } from '../api/fsm';
import { useAuth } from '../App';

type FsmState = Awaited<ReturnType<typeof fsmApi.getState>>;

const CANDIDATE_COLORS = [
  { gradient: 'from-blue-600 to-blue-400', light: 'bg-blue-50', border: 'border-blue-300', ring: 'ring-blue-500', text: 'text-blue-700', initials: 'bg-blue-600' },
  { gradient: 'from-purple-600 to-purple-400', light: 'bg-purple-50', border: 'border-purple-300', ring: 'ring-purple-500', text: 'text-purple-700', initials: 'bg-purple-600' },
  { gradient: 'from-emerald-600 to-emerald-400', light: 'bg-emerald-50', border: 'border-emerald-300', ring: 'ring-emerald-500', text: 'text-emerald-700', initials: 'bg-emerald-600' },
  { gradient: 'from-rose-600 to-rose-400', light: 'bg-rose-50', border: 'border-rose-300', ring: 'ring-rose-500', text: 'text-rose-700', initials: 'bg-rose-600' },
];

function getInitials(name: string) {
  return name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
}

export default function VotePage() {
  const navigate = useNavigate();
  const { setUser } = useAuth();
  const [state, setState] = useState<FsmState | null>(null);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);
  const [note, setNote] = useState('');
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const hasAutoAuthorized = useRef(false);

  const refresh = async () => {
    try {
      const s = await fsmApi.getState();
      setState(s);
      setNote(s.note ?? '');
      
      // Auto-authorize if in S0, election is open, and not already voted
      if (s.state.code === 0 && !s.latch && !(s.note?.includes('already voted')) && s.election.status === 'OPEN' && !hasAutoAuthorized.current) {
        hasAutoAuthorized.current = true;
        doAction(() => fsmApi.enable());
      }
    } catch { /* ignore */ }
  };

  useEffect(() => {
    refresh().finally(() => setLoading(false));
    pollRef.current = setInterval(refresh, 5000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, []);

  const doAction = async (fn: () => Promise<FsmState>) => {
    setActing(true);
    setNote('');
    try {
      const s = await fn();
      setState(s);
      setNote(s.note ?? '');
      return s;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Error';
      setNote(msg);
      throw e;
    } finally {
      setActing(false);
    }
  };

  const authorize = () => doAction(() => fsmApi.enable());
  const selectCandidate = (slot: number) => {
    const buttons = [false, false, false, false];
    buttons[slot] = true;
    doAction(() => fsmApi.press(buttons as [boolean, boolean, boolean, boolean]));
  };
  const acknowledge = async () => {
    await doAction(() => fsmApi.ack());
    // Auto logout after acknowledging
    await authApi.logout().catch(() => {});
    setUser(null);
    navigate('/login');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-gray-400">
          <div className="w-8 h-8 border-2 border-gray-300 border-t-emerald-500 rounded-full animate-spin" />
          <span className="text-sm">Loading voting machine…</span>
        </div>
      </div>
    );
  }

  if (!state) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-red-500 text-sm">Could not connect to voting machine. Refresh to retry.</p>
      </div>
    );
  }

  const { state: fsm, election, candidates, latch, selSlot } = state;
  const code = fsm.code;

  // ── Detect "already voted" ─────────────────────────────────────────────
  const alreadyVoted = code === 0 && !latch && note?.includes('already voted');
  const electionNotOpen = election.status !== 'OPEN';

  // ── Selected candidate ─────────────────────────────────────────────────
  const selected = selSlot != null ? candidates.find(c => c.slot === selSlot) : null;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* top status bar */}
      <div className="bg-white border-b border-gray-200 px-6 py-3">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`w-2.5 h-2.5 rounded-full ${
              code === 0 ? 'bg-blue-400' :
              code === 1 ? 'bg-cyan-400 animate-pulse' :
              code === 2 ? 'bg-amber-400 animate-pulse' :
              'bg-emerald-400'
            }`} />
            <span className="text-sm font-mono font-medium text-gray-700">
              {fsm.name} (Q1={fsm.q1} Q0={fsm.q0})
            </span>
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
              election.status === 'OPEN'   ? 'bg-emerald-100 text-emerald-700' :
              election.status === 'CLOSED' ? 'bg-red-100 text-red-700' :
              'bg-gray-100 text-gray-500'
            }`}>
              {election.status}
            </span>
          </div>
          <span className="text-xs text-gray-400 font-mono">SR Latch: {latch ? 'SET' : 'RESET'}</span>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-6 py-10">

        {/* Election closed guard */}
        {electionNotOpen && (
          <div className="text-center py-20">
            <div className="w-20 h-20 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-4">
              <svg className="w-10 h-10 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            </div>
            <h2 className="text-xl font-bold text-gray-800 mb-2">
              {election.status === 'CLOSED' ? 'Election has ended' : 'Election not started yet'}
            </h2>
            <p className="text-gray-500 text-sm">
              {election.status === 'CLOSED'
                ? 'The voting period is over. Check the results page.'
                : 'The admin will open the election shortly.'}
            </p>
          </div>
        )}

        {/* ── S0: Already voted ──────────────────────────────────── */}
        {!electionNotOpen && code === 0 && alreadyVoted && (
          <div className="text-center py-20">
            <div className="w-24 h-24 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-6">
              <svg className="w-12 h-12 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Your vote is recorded</h2>
            <p className="text-gray-500 text-sm max-w-xs mx-auto">
              You have already cast your ballot. Each voter can only vote once.
              Results will be visible after the election closes.
            </p>
          </div>
        )}

        {/* ── S0: Ready to authorize ─────────────────────────────── */}
        {!electionNotOpen && code === 0 && !alreadyVoted && (
          <div className="text-center py-16">
            <div className="inline-flex items-center gap-2 bg-blue-50 text-blue-700 text-xs font-mono px-3 py-1.5 rounded-full mb-8 border border-blue-200">
              FSM STATE: S0_IDLE
            </div>
            <h2 className="text-3xl font-bold text-gray-900 mb-4">
              Initializing Secure Session...
            </h2>
            <p className="text-gray-500 text-sm max-w-md mx-auto mb-10 leading-relaxed">
              Authorizing your ballot (EN=1). You have 3 minutes to cast your vote.
            </p>
            <div className="flex justify-center">
              <div className="w-10 h-10 border-4 border-gray-200 border-t-blue-600 rounded-full animate-spin" />
            </div>
            {note && !note.includes('already voted') && (
              <p className="text-amber-600 text-xs mt-6 font-mono">{note}</p>
            )}
          </div>
        )}

        {/* ── S1: Select candidate ───────────────────────────────── */}
        {!electionNotOpen && code === 1 && (
          <div>
            <div className="text-center mb-10">
              <div className="inline-flex items-center gap-2 bg-cyan-50 text-cyan-700 text-xs font-mono px-3 py-1.5 rounded-full mb-4 border border-cyan-200">
                FSM STATE: S1_ENABLED · BALLOT ACTIVE
              </div>
              <h2 className="text-3xl font-bold text-gray-900 mb-3">Select your candidate</h2>
              <p className="text-gray-500 text-sm">Click a card to cast your vote. You have 3 minutes before the session expires.</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              {candidates.map(c => {
                const col = CANDIDATE_COLORS[c.slot % 4];
                return (
                  <button
                    key={c.slot}
                    onClick={() => selectCandidate(c.slot)}
                    disabled={acting}
                    className={`group text-left rounded-2xl border-2 ${col.border} bg-white hover:${col.light} disabled:opacity-60 transition-all shadow-sm hover:shadow-md hover:scale-[1.02] active:scale-[0.98] focus:outline-none focus:ring-4 ${col.ring}/20`}
                  >
                    <div className={`bg-gradient-to-r ${col.gradient} rounded-t-xl p-5 flex items-center gap-4`}>
                      <div className={`w-12 h-12 rounded-full ${col.initials} ring-4 ring-white/30 flex items-center justify-center text-white font-bold text-base`}>
                        {getInitials(c.name)}
                      </div>
                      <div>
                        <div className="text-white font-bold text-base">{c.name}</div>
                        <div className="text-white/60 text-xs font-mono">Slot {c.slot}</div>
                      </div>
                      <div className="ml-auto opacity-0 group-hover:opacity-100 transition-opacity">
                        <svg className="w-5 h-5 text-white/70" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
                        </svg>
                      </div>
                    </div>
                    <div className="p-4">
                      <span className={`text-xs font-medium ${col.text}`}>Tap to vote for {c.name.split(' ')[0]}</span>
                    </div>
                  </button>
                );
              })}
            </div>
            {note && (
              <p className="text-center text-amber-600 text-xs mt-6 font-mono">{note}</p>
            )}
          </div>
        )}

        {/* ── S3: Confirm ────────────────────────────────────────── */}
        {!electionNotOpen && code === 3 && (
          <div className="text-center py-16">
            <div className="inline-flex items-center gap-2 bg-emerald-50 text-emerald-700 text-xs font-mono px-3 py-1.5 rounded-full mb-8 border border-emerald-200">
              FSM STATE: S3_CONFIRM · VOTE COMMITTED
            </div>

            {/* big checkmark */}
            <div className="w-28 h-28 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-6 ring-8 ring-emerald-50">
              <svg className="w-14 h-14 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>

            <h2 className="text-2xl font-bold text-gray-900 mb-2">Vote Committed!</h2>
            {selected && (
              <div className="inline-flex items-center gap-2 bg-gray-100 rounded-full px-5 py-2 text-sm font-medium text-gray-700 mt-1 mb-4">
                <span>You voted for</span>
                <strong>{selected.name}</strong>
                <span className="text-gray-400 font-mono text-xs">(Slot {selected.slot})</span>
              </div>
            )}
            <p className="text-gray-500 text-sm max-w-xs mx-auto mb-10 leading-relaxed">
              Your ballot has been recorded anonymously. Click <strong>Done</strong> to
              finalize and return the machine to idle (ACK=1 → S3→S0).
            </p>
            <button
              onClick={acknowledge}
              disabled={acting}
              className="inline-flex items-center gap-3 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white font-semibold px-10 py-4 rounded-2xl text-base transition-all shadow-lg"
            >
              {acting ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              )}
              Done — Return Machine
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
