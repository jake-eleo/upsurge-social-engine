'use client';
import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import ELEOSocialEngine from '../components/ELEOSocialEngine';

export default function Home() {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });
    return () => subscription.unsubscribe();
  }, []);

  if (loading) return <div style={{ minHeight: '100vh', background: '#0B0B14', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6B6B8A' }}>Loading…</div>;

  if (!session) {
    window.location.href = '/login';
    return null;
  }

  return <ELEOSocialEngine />;
}