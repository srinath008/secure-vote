import { useEffect, useState } from 'react';
import { adminApi } from '../api/fsm';

type Election = { id: string; title: string; status: string; openedAt: string | null; closedAt: string | null };
type Turnout = { total: number; voted: number; notVoted: number; percentage: string };
type AuditLog = {
  id: string; createdAt: string; fromState: number; toState: number;
  inputsJson: string; commitFlag: boolean; note: string | null;
};
type AuditRes = { total: number; logs: AuditLog[] };

const STATE_NAMES = ['S0_IDLE', 'S1_ENABLED', 'S2_LOCKED', 'S3_CONFIRM'];

export default function AdminPage() {
  const [election, setElection] = useState<Election | null>(null);
  const [turnout, setTurnout] = useState<Turnout | null>(null);
  const [audit, setAudit] = useState<AuditRes | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  const fetchData = async () => {
    try {
      const [el, tr, au] = await Promise.all([
        adminApi.getCurrentElection(),
        adminApi.getTurnout(),
        adminApi.getAudit(1, 50),
      ]);
      setElection(el as unknown as Election);
      setTurnout(tr);
      setAudit(au as unknown as AuditRes);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 5000);
    return () => clearInterval(interval);
  }, []);

  const changeStatus = async (status: 'OPEN' | 'CLOSED') => {
    if (!election) return;
    if (status === 'CLOSED' && !window.confirm('Are you sure you want to close the election? This cannot be undone.')) return;
    
    setActionLoading(true);
    try {
      await adminApi.updateStatus(election.id, status);
      await fetchData();
    } catch (e) {
      alert('Failed to update status');
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) return <div className="p-8 text-gray-500">Loading admin dashboard...</div>;
  if (!election) return <div className="p-8 text-red-500">Error loading election data.</div>;

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col md:flex-row">
      {/* ── Sidebar ──────────────────────────────────────────────────────── */}
      <aside className="w-full md:w-64 bg-white border-r border-gray-200 flex-shrink-0">
        <div className="p-6 border-b border-gray-200">
          <h2 className="text-sm font-bold text-gray-900 uppercase tracking-wider">Control Panel</h2>
          <p className="text-xs text-gray-500 mt-1">Tallie Workspace</p>
        </div>
        <nav className="p-4 space-y-1">
          <a href="#" className="flex items-center gap-3 bg-gray-100 text-gray-900 px-3 py-2 rounded-lg text-sm font-medium">
            <svg className="w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
            </svg>
            Overview
          </a>
          <a href="#audit" className="flex items-center gap-3 text-gray-600 hover:bg-gray-50 px-3 py-2 rounded-lg text-sm font-medium transition-colors">
            <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            Audit Log
          </a>
        </nav>
      </aside>

      {/* ── Main Content ─────────────────────────────────────────────────── */}
      <main className="flex-1 p-6 md:p-8 max-w-6xl mx-auto w-full">
        <header className="mb-8 flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{election.title}</h1>
            <p className="text-sm text-gray-500 mt-1">
              Election ID: <span className="font-mono text-xs">{election.id}</span>
            </p>
          </div>
          
          <div className="flex items-center gap-3 bg-white border border-gray-200 px-4 py-2 rounded-lg shadow-sm">
            <span className="text-sm text-gray-500 font-medium">Status:</span>
            <span className={`flex items-center gap-2 text-sm font-bold ${
              election.status === 'OPEN' ? 'text-emerald-600' :
              election.status === 'CLOSED' ? 'text-red-600' :
              'text-gray-600'
            }`}>
              <div className={`w-2 h-2 rounded-full ${
                election.status === 'OPEN' ? 'bg-emerald-500 animate-pulse' :
                election.status === 'CLOSED' ? 'bg-red-500' :
                'bg-gray-400'
              }`} />
              {election.status}
            </span>
          </div>
        </header>

        {/* ── Control Panel ──────────────────────────────────────────────── */}
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm mb-8 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
            <h3 className="text-base font-bold text-gray-900">Election Controls</h3>
          </div>
          <div className="p-6 flex flex-col md:flex-row gap-6 items-center justify-between">
            <p className="text-sm text-gray-600 max-w-xl">
              {election.status === 'SETUP' && "The election is currently in setup mode. Open it to allow students to cast their votes. Once opened, it cannot go back to setup."}
              {election.status === 'OPEN' && "Voting is currently live. Students can cast their votes. Close the election to reveal results. This action is permanent."}
              {election.status === 'CLOSED' && "This election is permanently closed. Results are now public. No further votes can be cast."}
            </p>
            <div className="flex gap-3">
              <button
                disabled={actionLoading || election.status !== 'SETUP'}
                onClick={() => changeStatus('OPEN')}
                className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:hover:bg-emerald-600 text-white text-sm font-semibold rounded-lg transition-colors shadow-sm"
              >
                Open Election
              </button>
              <button
                disabled={actionLoading || election.status !== 'OPEN'}
                onClick={() => changeStatus('CLOSED')}
                className="px-5 py-2.5 bg-red-600 hover:bg-red-700 disabled:opacity-50 disabled:hover:bg-red-600 text-white text-sm font-semibold rounded-lg transition-colors shadow-sm"
              >
                Close Election
              </button>
            </div>
          </div>
        </div>

        {/* ── Metrics Row ────────────────────────────────────────────────── */}
        {turnout && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
            <div className="bg-white border border-gray-200 p-5 rounded-xl shadow-sm">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Total Eligible</p>
              <p className="text-2xl font-bold text-gray-900">{turnout.total}</p>
            </div>
            <div className="bg-white border border-gray-200 p-5 rounded-xl shadow-sm">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Votes Cast</p>
              <p className="text-2xl font-bold text-emerald-600">{turnout.voted}</p>
            </div>
            <div className="bg-white border border-gray-200 p-5 rounded-xl shadow-sm">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Pending</p>
              <p className="text-2xl font-bold text-gray-900">{turnout.notVoted}</p>
            </div>
            <div className="bg-white border border-gray-200 p-5 rounded-xl shadow-sm">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Turnout</p>
              <div className="flex items-end gap-2">
                <p className="text-2xl font-bold text-blue-600">{turnout.percentage}%</p>
                <div className="w-16 h-2 bg-gray-100 rounded-full mb-1.5 overflow-hidden">
                  <div className="h-full bg-blue-500" style={{ width: `${turnout.percentage}%` }} />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── Audit Log Table ────────────────────────────────────────────── */}
        <div id="audit" className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200 bg-gray-50 flex items-center justify-between">
            <h3 className="text-base font-bold text-gray-900">Security Audit Log</h3>
            <span className="text-xs text-gray-500 font-mono">Latest 50 events</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm whitespace-nowrap">
              <thead className="bg-gray-50/50 text-gray-500 text-xs uppercase tracking-wider">
                <tr>
                  <th className="px-6 py-3 font-medium border-b border-gray-200">Timestamp</th>
                  <th className="px-6 py-3 font-medium border-b border-gray-200">Transition</th>
                  <th className="px-6 py-3 font-medium border-b border-gray-200">Inputs (E, V, S, A)</th>
                  <th className="px-6 py-3 font-medium border-b border-gray-200">Commit</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-gray-700 font-mono text-xs">
                {audit?.logs.map(log => {
                  const ins = JSON.parse(log.inputsJson);
                  const dt = new Date(log.createdAt);
                  return (
                    <tr key={log.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-3 text-gray-500">
                        {dt.toLocaleDateString()} {dt.toLocaleTimeString()}
                      </td>
                      <td className="px-6 py-3 flex items-center gap-2">
                        <span className="px-2 py-1 rounded bg-gray-100">{STATE_NAMES[log.fromState]}</span>
                        <span className="text-gray-400">→</span>
                        <span className={`px-2 py-1 rounded ${log.fromState !== log.toState ? 'bg-blue-50 text-blue-700' : 'bg-gray-100'}`}>
                          {STATE_NAMES[log.toState]}
                        </span>
                      </td>
                      <td className="px-6 py-3">
                        <span className={ins.EN ? 'text-gray-900 font-bold' : 'text-gray-400'}>E:{ins.EN}</span>{' '}
                        <span className={ins.V ? 'text-gray-900 font-bold' : 'text-gray-400'}>V:{ins.V}</span>{' '}
                        <span className={ins.SEL !== null ? 'text-blue-600 font-bold' : 'text-gray-400'}>S:{ins.SEL ?? '-'}</span>{' '}
                        <span className={ins.ACK ? 'text-gray-900 font-bold' : 'text-gray-400'}>A:{ins.ACK}</span>
                      </td>
                      <td className="px-6 py-3">
                        {log.commitFlag ? (
                          <span className="inline-flex items-center gap-1 bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded font-bold">
                            ⚡ COMMIT
                          </span>
                        ) : (
                          <span className="text-gray-300">-</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {audit?.logs.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-6 py-8 text-center text-gray-500 font-sans text-sm">
                      No events recorded yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  );
}
