const API_BASE = (import.meta.env.VITE_API_URL as string | undefined) || '';

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    const err = Object.assign(new Error(body.error || 'Request failed'), {
      status: res.status,
      code: body.code,
    });
    throw err;
  }
  return res.json() as Promise<T>;
}

// ── FSM types ──────────────────────────────────────────────────────────────

export interface FsmState {
  state: { q1: 0|1; q0: 0|1; code: 0|1|2|3; name: string };
  outputs: { IDLE_LAMP: 0|1; BALLOT_ACTIVE: 0|1; COMMIT: 0|1; CONFIRM_LAMP: 0|1 };
  latch: boolean;
  selSlot: number | null;
  election: { id: string; title: string; status: string };
  candidates: { id: string; name: string; slot: number }[];
  note?: string;
}

export interface AuditEntry {
  id: string;
  sessionId: string;
  fromState: number;
  toState: number;
  inputsJson: string;
  commitFlag: boolean;
  createdAt: string;
}

export interface ResultsData {
  election: { id: string; title: string; closedAt: string; totalVotes: number };
  candidates: { id: string; name: string; slot: number; tally: number; percentage: string; isWinner: boolean }[];
}

export interface ElectionData {
  id: string; title: string; status: string;
  candidates: { id: string; name: string; slot: number; tally: number }[];
  openedAt?: string; closedAt?: string;
}

// ── API clients ────────────────────────────────────────────────────────────

export const authApi = {
  login:    (rollNumber: string, password: string) =>
    apiFetch<{ id: string; name: string; role: string }>('/api/auth/login', {
      method: 'POST', body: JSON.stringify({ rollNumber, password }),
    }),
  logout:   () => apiFetch('/api/auth/logout', { method: 'POST' }),
  register: (rollNumber: string, name: string, password: string) =>
    apiFetch('/api/auth/register', {
      method: 'POST', body: JSON.stringify({ rollNumber, name, password }),
    }),
  me: () => apiFetch<{ id: string; name: string; role: string }>('/api/auth/me'),
};

export const fsmApi = {
  getState: () => apiFetch<FsmState>('/api/fsm/state'),
  enable:   () => apiFetch<FsmState>('/api/fsm/enable', { method: 'POST' }),
  press:    (buttons: [boolean, boolean, boolean, boolean]) =>
    apiFetch<FsmState>('/api/fsm/press', {
      method: 'POST', body: JSON.stringify({ buttons }),
    }),
  ack: () => apiFetch<FsmState>('/api/fsm/ack', { method: 'POST' }),
};

export const resultsApi = {
  getResults: () => apiFetch<ResultsData>('/api/results'),
};

export const adminApi = {
  getCurrentElection: () => apiFetch<ElectionData>('/api/admin/election/current'),
  createElection: (title: string, candidates: { name: string; slot: number }[]) =>
    apiFetch<ElectionData>('/api/admin/election', {
      method: 'POST', body: JSON.stringify({ title, candidates }),
    }),
  updateStatus: (id: string, status: string) =>
    apiFetch<ElectionData>(`/api/admin/election/${id}/status`, {
      method: 'PATCH', body: JSON.stringify({ status }),
    }),
  getAudit: (page = 1, limit = 50) =>
    apiFetch<{ logs: AuditEntry[]; total: number; page: number; pages: number }>(
      `/api/admin/audit?page=${page}&limit=${limit}`
    ),
  getTurnout: () =>
    apiFetch<{ total: number; voted: number; notVoted: number; percentage: string }>('/api/admin/turnout'),
};
