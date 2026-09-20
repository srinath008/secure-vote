import { useEffect, useState } from 'react';
import { resultsApi } from '../api/fsm';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';

type Candidate = { id: string; name: string; slot: number; tally: number; percentage: string; isWinner: boolean };
type Election = { id: string; title: string; closedAt: string; totalVotes: number };
type ResultsData = { election: Election; candidates: Candidate[] };

const COLORS = ['#3b82f6', '#a855f7', '#10b981', '#f43f5e'];

export default function ResultsPage() {
  const [data, setData] = useState<ResultsData | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    resultsApi.getResults()
      .then(d => setData(d))
      .catch(e => setError(e instanceof Error ? e.message : 'Access denied'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="min-h-screen bg-gray-50 flex items-center justify-center text-gray-500">Loading analytics...</div>;
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
        <div className="bg-white border border-gray-200 rounded-2xl p-8 max-w-md w-full text-center shadow-sm">
          <div className="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">Results Locked</h2>
          <p className="text-gray-500 text-sm">
            {error.includes('closed') 
              ? 'The election is still ongoing. Tallies are cryptographically locked until the administrator closes the election.' 
              : error}
          </p>
        </div>
      </div>
    );
  }

  const { election, candidates } = data;
  const winners = candidates.filter(c => c.isWinner);

  return (
    <div className="min-h-screen bg-gray-50 pb-16">
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="bg-white border-b border-gray-200 px-6 py-10 mb-8">
        <div className="max-w-5xl mx-auto flex flex-col md:flex-row md:items-end justify-between gap-6">
          <div>
            <div className="flex items-center gap-2 mb-3">
              <span className="bg-emerald-100 text-emerald-800 text-xs font-bold px-2.5 py-1 rounded-full uppercase tracking-wider">
                Official Results
              </span>
              <span className="text-gray-400 text-sm font-mono">{election.id.split('-')[0]}</span>
            </div>
            <h1 className="text-3xl font-bold text-gray-900">{election.title}</h1>
            <p className="text-gray-500 mt-2 text-sm">Total verified votes cast: {election.totalVotes}</p>
          </div>
          
          {/* Winner Spotlight */}
          {winners.length > 0 && (
            <div className="bg-gradient-to-r from-amber-500 to-yellow-400 p-1 rounded-2xl shadow-lg w-full md:w-auto">
              <div className="bg-white rounded-xl px-6 py-4 flex items-center gap-4">
                <div className="w-12 h-12 bg-amber-100 rounded-full flex items-center justify-center text-2xl shadow-inner">
                  🏆
                </div>
                <div>
                  <p className="text-xs font-bold text-amber-600 uppercase tracking-wider">Winner</p>
                  <p className="text-lg font-bold text-gray-900">
                    {winners.map(w => w.name).join(' & ')}
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* ── Left Column: Candidate List ─────────────────────────────── */}
        <div className="lg:col-span-2 space-y-4">
          <h2 className="text-lg font-bold text-gray-900 mb-4">Detailed Tallies</h2>
          {candidates.map(c => (
            <div key={c.id} className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm flex flex-col sm:flex-row sm:items-center gap-6">
              
              <div className="flex items-center gap-4 min-w-[200px]">
                <div className={`w-12 h-12 rounded-full flex items-center justify-center text-white font-bold text-lg`} style={{ backgroundColor: COLORS[c.slot % COLORS.length] }}>
                  {c.name.charAt(0)}
                </div>
                <div>
                  <h3 className="font-bold text-gray-900 text-lg flex items-center gap-2">
                    {c.name}
                    {c.isWinner && <span className="text-xl" title="Winner">⭐</span>}
                  </h3>
                  <p className="text-sm font-mono text-gray-500">Slot {c.slot}</p>
                </div>
              </div>

              <div className="flex-1 w-full">
                <div className="flex justify-between text-sm mb-2 font-medium">
                  <span className="text-gray-900">{c.tally} votes</span>
                  <span className="text-gray-500">{c.percentage}%</span>
                </div>
                <div className="h-3 w-full bg-gray-100 rounded-full overflow-hidden">
                  <div 
                    className="h-full rounded-full transition-all duration-1000 ease-out"
                    style={{ width: `${c.percentage}%`, backgroundColor: COLORS[c.slot % COLORS.length] }}
                  />
                </div>
              </div>

            </div>
          ))}
        </div>

        {/* ── Right Column: Charts & Stats ────────────────────────────── */}
        <div className="space-y-6">
          <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm">
            <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wider mb-6">Vote Distribution</h3>
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={candidates} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                  <XAxis dataKey="name" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                  <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 10 }} />
                  <Tooltip 
                    cursor={{ fill: '#f3f4f6' }}
                    contentStyle={{ borderRadius: '8px', border: '1px solid #e5e7eb', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                  />
                  <Bar dataKey="tally" radius={[4, 4, 0, 0]}>
                    {candidates.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[entry.slot % COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="bg-gray-900 rounded-2xl p-6 shadow-sm text-white">
            <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-4">Security Verification</h3>
            <ul className="space-y-3 text-sm">
              <li className="flex items-center gap-3">
                <div className="w-5 h-5 rounded-full bg-emerald-500/20 flex items-center justify-center">
                  <div className="w-2 h-2 rounded-full bg-emerald-400" />
                </div>
                <span>FSM strict transition enforced</span>
              </li>
              <li className="flex items-center gap-3">
                <div className="w-5 h-5 rounded-full bg-emerald-500/20 flex items-center justify-center">
                  <div className="w-2 h-2 rounded-full bg-emerald-400" />
                </div>
                <span>Double-voting SR latch active</span>
              </li>
              <li className="flex items-center gap-3">
                <div className="w-5 h-5 rounded-full bg-emerald-500/20 flex items-center justify-center">
                  <div className="w-2 h-2 rounded-full bg-emerald-400" />
                </div>
                <span>Anonymity preserved (Ballot table)</span>
              </li>
            </ul>
          </div>
        </div>

      </div>
    </div>
  );
}
