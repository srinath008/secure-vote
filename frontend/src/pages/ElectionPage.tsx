import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { fsmApi } from '../api/fsm';
import { useAuth } from '../App';

const SLOT_COLORS = [
  { color: 'from-blue-600 to-blue-400',     bgLight: 'bg-blue-50',    border: 'border-blue-200' },
  { color: 'from-purple-600 to-purple-400', bgLight: 'bg-purple-50',  border: 'border-purple-200' },
  { color: 'from-emerald-600 to-emerald-400', bgLight: 'bg-emerald-50', border: 'border-emerald-200' },
  { color: 'from-rose-600 to-rose-400',     bgLight: 'bg-rose-50',    border: 'border-rose-200' },
];

type Candidate = {
  id: string; name: string; slot: number;
  tagline?: string | null; promises: string[];
};
type ElectionState = {
  title: string; status: string;
  candidates: Candidate[];
} | null;

export default function ElectionPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [election, setElection] = useState<ElectionState>(null);
  const [loading, setLoading] = useState(true);
  const [noElection, setNoElection] = useState(false);

  useEffect(() => {
    fsmApi.getState()
      .then(s => {
        setElection({
          title: s.election.title,
          status: s.election.status,
          candidates: s.candidates,
        });
      })
      .catch((err: any) => {
        if (err?.code === 'NO_ELECTION' || err?.status === 404) {
          setNoElection(true);
        }
      })
      .finally(() => setLoading(false));
  }, []);

  const electionStatus = election?.status ?? '';

  return (
    <div className="min-h-screen bg-gray-50">
      {/* ── Hero ─────────────────────────────────────────────────── */}
      <div className="bg-gradient-to-br from-gray-900 via-gray-800 to-emerald-900 text-white">
        <div className="max-w-5xl mx-auto px-6 py-16">
          <div className="flex items-center gap-2 mb-4">
            <span className={`text-xs font-semibold px-3 py-1 rounded-full ${
              electionStatus === 'OPEN'   ? 'bg-emerald-500/20 text-emerald-300 ring-1 ring-emerald-500/30' :
              electionStatus === 'CLOSED' ? 'bg-red-500/20 text-red-300 ring-1 ring-red-500/30' :
              'bg-gray-500/20 text-gray-300 ring-1 ring-gray-500/30'
            }`}>
              {loading ? 'Loading…' : noElection ? 'No Active Election' : electionStatus}
            </span>
            <span className="text-gray-500 text-xs">·</span>
            <span className="text-gray-400 text-xs font-mono">AY 2025–26</span>
          </div>

          <h1 className="text-4xl md:text-5xl font-bold leading-tight mb-4">
            {loading ? 'Loading…' : noElection ? 'No Election Currently' : election?.title ?? 'Election'}
            {!loading && !noElection && electionStatus === 'OPEN' && (
              <><br /><span className="text-emerald-400">Cast Your Vote</span></>
            )}
          </h1>
          <p className="text-gray-300 text-lg max-w-2xl leading-relaxed">
            {noElection
              ? 'There is no active election at the moment. Please check back later or contact the admin.'
              : 'Your CR will be your voice in faculty meetings, grievance committees, and institutional decisions. Choose wisely.'}
          </p>

          {!noElection && election && (
            <div className="flex flex-wrap gap-6 mt-8 text-sm">
              <div>
                <div className="text-gray-400">Candidates</div>
                <div className="text-white font-bold text-xl">{election.candidates.length}</div>
              </div>
              <div>
                <div className="text-gray-400">Voting Method</div>
                <div className="text-white font-bold text-xl">FSM-EVM</div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Body ─────────────────────────────────────────────────── */}
      <div className="max-w-5xl mx-auto px-6 py-12">

        {/* No election state */}
        {!loading && noElection && (
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-12 text-center">
            <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
            <h3 className="text-xl font-bold text-gray-900 mb-2">No Election Currently</h3>
            <p className="text-gray-500 text-sm">The admin hasn't created or opened an election yet. Please check back soon.</p>
          </div>
        )}

        {/* Candidates grid */}
        {!loading && election && election.candidates.length > 0 && (
          <>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Meet the Candidates</h2>
            <p className="text-gray-500 text-sm mb-8">Read each candidate's promises before casting your vote.</p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {election.candidates.map(c => {
                const style = SLOT_COLORS[c.slot] ?? SLOT_COLORS[0];
                const initials = c.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
                return (
                  <div
                    key={c.id}
                    className={`rounded-2xl border ${style.border} bg-white shadow-sm hover:shadow-md transition-shadow overflow-hidden`}
                  >
                    {/* card header */}
                    <div className={`bg-gradient-to-r ${style.color} p-6 flex items-center gap-4`}>
                      <div className="w-14 h-14 rounded-full bg-white/20 backdrop-blur flex items-center justify-center text-white font-bold text-lg">
                        {initials}
                      </div>
                      <div>
                        <div className="text-white font-bold text-lg">{c.name}</div>
                        {c.tagline && <div className="text-white/70 text-sm">{c.tagline}</div>}
                      </div>
                      <div className="ml-auto">
                        <span className="bg-white/20 text-white text-xs font-mono px-2 py-1 rounded-full">
                          Slot {c.slot}
                        </span>
                      </div>
                    </div>

                    {/* promises */}
                    <div className={`p-5 ${style.bgLight}`}>
                      {c.promises.length > 0 ? (
                        <>
                          <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Campaign Promises</div>
                          <ul className="space-y-2">
                            {c.promises.map((p, i) => (
                              <li key={i} className="text-sm text-gray-700 flex items-start gap-2">
                                <span>• {p}</span>
                              </li>
                            ))}
                          </ul>
                        </>
                      ) : (
                        <p className="text-sm text-gray-400 italic">No promises listed.</p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}

        {/* ── CTA ─────────────────────────────────────────────────── */}
        {!loading && !noElection && (
          <div className="mt-12 bg-white rounded-2xl border border-gray-200 shadow-sm p-8 text-center">
            {electionStatus === 'OPEN' ? (
              <>
                <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-4">
                  <svg className="w-8 h-8 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                  </svg>
                </div>
                <h3 className="text-xl font-bold text-gray-900 mb-2">Ready to Vote?</h3>
                <p className="text-gray-500 text-sm mb-6">
                  The election is live. You can cast exactly one vote.
                  Your ballot is anonymous — no one can link your vote to your name.
                </p>
                <button
                  onClick={() => navigate('/vote')}
                  className="inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold px-8 py-3 rounded-xl text-sm transition-colors"
                >
                  Proceed to Vote
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
                  </svg>
                </button>
              </>
            ) : electionStatus === 'CLOSED' ? (
              <>
                <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-4">
                  <svg className="w-8 h-8 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                </div>
                <h3 className="text-xl font-bold text-gray-900 mb-2">Election Closed</h3>
                <p className="text-gray-500 text-sm mb-6">Voting has ended. Check the final results.</p>
                <button
                  onClick={() => navigate('/results')}
                  className="inline-flex items-center gap-2 bg-gray-800 hover:bg-gray-900 text-white font-semibold px-8 py-3 rounded-xl text-sm transition-colors"
                >
                  View Results →
                </button>
              </>
            ) : (
              <>
                <div className="w-16 h-16 rounded-full bg-yellow-100 flex items-center justify-center mx-auto mb-4">
                  <svg className="w-8 h-8 text-yellow-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <h3 className="text-xl font-bold text-gray-900 mb-2">Election Not Yet Open</h3>
                <p className="text-gray-500 text-sm">The admin hasn't opened the election yet. Check back soon.</p>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
