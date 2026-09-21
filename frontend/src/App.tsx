import { BrowserRouter, Routes, Route, Navigate, NavLink, useNavigate } from 'react-router-dom';
import { useState, useEffect, createContext, useContext } from 'react';
import { authApi } from './api/fsm';
import LoginPage from './pages/LoginPage';
import ElectionPage from './pages/ElectionPage';
import VotePage from './pages/VotePage';
import ResultsPage from './pages/ResultsPage';
import AdminPage from './pages/AdminPage';
import MachinePage from './pages/MachinePage';

// ── Auth context ───────────────────────────────────────────────────────────

interface User { id: string; name: string; role: string }
interface AuthCtx { user: User | null; setUser: (u: User | null) => void }

const AuthContext = createContext<AuthCtx>({ user: null, setUser: () => {} });
export const useAuth = () => useContext(AuthContext);

// ── Nav ────────────────────────────────────────────────────────────────────

function Nav() {
  const { user, setUser } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await authApi.logout().catch(() => {});
    setUser(null);
    navigate('/login');
  };

  if (!user) return null;

  const link = 'text-sm font-medium hover:text-emerald-600 transition-colors px-3 py-2 rounded-md hover:bg-emerald-50';
  const activeLink = `${link} text-emerald-700 bg-emerald-50 font-semibold`;

  return (
    <nav className="sticky top-0 z-50 bg-white border-b border-gray-200 shadow-sm">
      <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded bg-emerald-500 flex items-center justify-center">
            <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
          </div>
          <span className="font-bold text-lg tracking-tight text-gray-900">SecureVote</span>
        </div>
        <div className="flex items-center gap-2 md:gap-4">
          <NavLink to="/election" className={({ isActive }) => isActive ? activeLink : link}>Info</NavLink>
          <NavLink to="/vote"    className={({ isActive }) => isActive ? activeLink : link}>Vote</NavLink>
          <NavLink to="/results" className={({ isActive }) => isActive ? activeLink : link}>Results</NavLink>
          <NavLink to="/machine" className={({ isActive }) => isActive ? activeLink : link}>Machine</NavLink>
          {user.role === 'ADMIN' && (
            <NavLink to="/admin" className={({ isActive }) => isActive ? activeLink : link}>Admin</NavLink>
          )}
          <div className="w-px h-6 bg-gray-200 mx-2" />
          <button onClick={handleLogout} className="text-sm font-medium text-gray-500 hover:text-red-600 transition-colors px-2">
            Logout ({user.name.split(' ')[0]})
          </button>
        </div>
      </div>
    </nav>
  );
}

// ── Protected route ────────────────────────────────────────────────────────

function Protected({ children, adminOnly = false }: { children: React.ReactNode; adminOnly?: boolean }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (adminOnly && user.role !== 'ADMIN') return <Navigate to="/election" replace />;
  return <>{children}</>;
}

// ── App ────────────────────────────────────────────────────────────────────

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    authApi.me()
      .then(u => setUser(u))
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50 text-emerald-600 gap-4">
        <div className="w-10 h-10 border-4 border-emerald-200 border-t-emerald-600 rounded-full animate-spin" />
        <span className="text-sm font-medium text-gray-500 font-mono">Initializing SecureVote...</span>
      </div>
    );
  }

  return (
    <AuthContext.Provider value={{ user, setUser }}>
      <BrowserRouter>
        <Nav />
        <Routes>
          <Route path="/login"    element={<LoginPage />} />
          <Route path="/election" element={<Protected><ElectionPage /></Protected>} />
          <Route path="/vote"     element={<Protected><VotePage /></Protected>} />
          <Route path="/results"  element={<Protected><ResultsPage /></Protected>} />
          <Route path="/machine"  element={<Protected><MachinePage /></Protected>} />
          <Route path="/admin"    element={<Protected adminOnly><AdminPage /></Protected>} />
          <Route path="*"         element={<Navigate to={user ? '/election' : '/login'} replace />} />
        </Routes>
      </BrowserRouter>
    </AuthContext.Provider>
  );
}
