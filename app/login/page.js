'use client';
import { useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useRouter } from 'next/navigation';

export default function Login() {
  const [email, setEmail]     = useState('');
  const [password, setPassword] = useState('');
  const [error, setError]     = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) { setError(error.message); setLoading(false); return; }
    router.push('/');
  };

  return (
    <div style={{ minHeight: '100vh', background: '#0B0B14', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'SF Pro Display', -apple-system, sans-serif" }}>
      <div style={{ background: '#13131F', border: '1px solid #222235', borderRadius: 14, padding: 40, width: 380 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 32 }}>
          <div style={{ width: 36, height: 36, background: 'linear-gradient(135deg, #5EEBEB, #C983F3)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 18, color: '#fff' }}>U</div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 16, color: '#E0E0EC' }}>UpSurge Social Engine</div>
            <div style={{ fontSize: 12, color: '#6B6B8A' }}>Sign in to continue</div>
          </div>
        </div>
        <form onSubmit={handleLogin}>
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#8888AA', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Email</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} required
              style={{ width: '100%', background: '#0B0B14', border: '1px solid #222235', borderRadius: 7, padding: '10px 12px', color: '#E0E0EC', fontSize: 14, outline: 'none', boxSizing: 'border-box' }} />
          </div>
          <div style={{ marginBottom: 24 }}>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#8888AA', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Password</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} required
              style={{ width: '100%', background: '#0B0B14', border: '1px solid #222235', borderRadius: 7, padding: '10px 12px', color: '#E0E0EC', fontSize: 14, outline: 'none', boxSizing: 'border-box' }} />
          </div>
          {error && <p style={{ color: '#EF4444', fontSize: 13, marginBottom: 16 }}>{error}</p>}
          <button type="submit" disabled={loading}
            style={{ width: '100%', background: loading ? '#1A1A2E' : 'linear-gradient(135deg, #5EEBEB, #C983F3)', border: 'none', color: loading ? '#6B6B8A' : '#fff', borderRadius: 8, padding: 12, cursor: loading ? 'default' : 'pointer', fontSize: 14, fontWeight: 800 }}>
            {loading ? 'Signing in…' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  );
}