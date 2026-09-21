import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { authApi } from '../api/fsm';
import { useAuth } from '../App';

export default function LoginPage() {
  const { setUser } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState<'ROLL' | 'PASSWORD' | 'OTP'>('ROLL');
  const [roll, setRoll] = useState('');
  const [pwd, setPwd] = useState('');
  const [otp, setOtp] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  const handleNext = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setMessage('');
    const cleanRoll = roll.trim().toUpperCase();

    if (cleanRoll.startsWith('ADMIN')) {
      setStep('PASSWORD');
      return;
    }

    // Voter flow - Send OTP
    setLoading(true);
    try {
      const res = await authApi.sendOtp(cleanRoll);
      setMessage(res.message);
      setStep('OTP');
    } catch (err: any) {
      setError(err.message || 'Failed to send OTP.');
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const u = await authApi.login(roll.trim().toUpperCase(), pwd, otp);
      setUser(u);
      navigate(u.role === 'ADMIN' ? '/admin' : '/election');
    } catch (err: any) {
      setError(err.message || 'Invalid credentials.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex">
      {/* --- Left panel: branding --- */}
      <div className="hidden lg:flex lg:w-2/5 bg-gray-950 flex-col justify-between p-12 relative overflow-hidden">
        {/* decorative grid */}
        <div className="absolute inset-0 opacity-5"
          style={{
            backgroundImage: 'linear-gradient(#fff 1px,transparent 1px),linear-gradient(90deg,#fff 1px,transparent 1px)',
            backgroundSize: '40px 40px',
          }}
        />
        {/* logo */}
        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-9 h-9 rounded-lg bg-emerald-500 flex items-center justify-center">
              <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
            </div>
            <span className="text-white font-bold text-xl tracking-tight">SecureVote</span>
          </div>
          <p className="text-gray-500 text-xs mt-1 font-mono">FSM-Based Electronic Voting System</p>
        </div>

        {/* centre content */}
        <div className="relative z-10 space-y-8">
          <div>
            <h1 className="text-white text-3xl font-bold leading-tight">
              Your vote.<br />
              <span className="text-emerald-400">Secured by hardware logic.</span>
            </h1>
            <p className="text-gray-400 mt-4 text-sm leading-relaxed">
              Every vote passes through a real Finite State Machine – the same
              Boolean logic as a physical EVM. Tamper-evident. Verifiable.
              Anonymous by construction.
            </p>
          </div>

          {/* FSM state indicators */}
          <div className="space-y-2">
            {[
              { s: 'S0', label: 'IDLE', color: 'bg-blue-500' },
              { s: 'S1', label: 'ENABLED', color: 'bg-cyan-500' },
              { s: 'S2', label: 'LOCKED → COMMIT', color: 'bg-amber-500' },
              { s: 'S3', label: 'CONFIRM', color: 'bg-emerald-500' },
            ].map(({ s, label, color }) => (
              <div key={s} className="flex items-center gap-3">
                <div className={`w-2 h-2 rounded-full ${color}`} />
                <span className="text-gray-400 text-xs font-mono">{s} – {label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* bottom attribution */}
        <div className="relative z-10">
          <p className="text-gray-600 text-xs">Amrita School of Engineering • EOC Project</p>
        </div>
      </div>

      {/* --- Right panel: form --- */}
      <div className="flex-1 flex items-center justify-center bg-gray-50 p-6">
        <div className="w-full max-w-sm">
          {/* mobile logo */}
          <div className="lg:hidden flex items-center gap-2 mb-8">
            <div className="w-8 h-8 rounded-lg bg-emerald-500 flex items-center justify-center">
              <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
            </div>
            <span className="font-bold text-lg">SecureVote</span>
          </div>

          <h2 className="text-2xl font-bold text-gray-900 mb-1">Sign in</h2>
          <p className="text-gray-500 text-sm mb-8">
            {step === 'ROLL' ? 'Enter your institution roll number.' :
             step === 'PASSWORD' ? 'Enter your admin password.' : 
             'Check your Outlook email for the OTP.'}
          </p>

          <form onSubmit={step === 'ROLL' ? handleNext : handleLogin} className="space-y-5">
            {step === 'ROLL' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5" htmlFor="roll">
                  Roll Number
                </label>
                <input
                  id="roll"
                  type="text"
                  value={roll}
                  onChange={e => setRoll(e.target.value)}
                  placeholder="CB25001 or ADMIN001"
                  required
                  className="w-full px-4 py-2.5 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent bg-white placeholder-gray-400 font-mono uppercase"
                />
              </div>
            )}

            {step === 'PASSWORD' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5" htmlFor="pwd">
                  Admin Password
                </label>
                <input
                  id="pwd"
                  type="password"
                  value={pwd}
                  onChange={e => setPwd(e.target.value)}
                  placeholder="••••••••"
                  required
                  autoFocus
                  className="w-full px-4 py-2.5 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent bg-white"
                />
              </div>
            )}

            {step === 'OTP' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5" htmlFor="otp">
                  6-Digit OTP
                </label>
                <input
                  id="otp"
                  type="text"
                  value={otp}
                  onChange={e => setOtp(e.target.value)}
                  placeholder="123456"
                  required
                  autoFocus
                  maxLength={6}
                  className="w-full px-4 py-2.5 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent bg-white font-mono text-center tracking-widest text-lg"
                />
              </div>
            )}

            {message && (
              <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm px-4 py-2.5 rounded-lg">
                <svg className="w-4 h-4 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                {message}
              </div>
            )}

            {error && (
              <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-2.5 rounded-lg">
                <svg className="w-4 h-4 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white font-semibold rounded-lg text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2"
            >
              {step === 'ROLL' ? (loading ? 'Sending OTP...' : 'Next →') : (loading ? 'Signing in...' : 'Sign in')}
            </button>
            
            {step !== 'ROLL' && (
              <button
                type="button"
                onClick={() => { setStep('ROLL'); setError(''); setMessage(''); setOtp(''); setPwd(''); }}
                className="w-full py-2 text-sm text-gray-500 hover:text-gray-700"
              >
                ← Back
              </button>
            )}
          </form>

          <div className="mt-8 pt-6 border-t border-gray-200">
            <p className="text-xs text-gray-400 text-center">
              Secured by FSM-enforced voting logic • Neon PostgreSQL • JWT Auth
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
