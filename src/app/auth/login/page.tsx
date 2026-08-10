'use client';

import { useState } from 'react';
import { Bot, Mail, Lock, ArrowRight } from 'lucide-react';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [mode, setMode] = useState<'login' | 'signup'>('login');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const { createClient } = await import('@/lib/supabase');
      const supabase = createClient();
      if (!supabase) {
        setError('ระบบยังไม่ได้เชื่อมต่อฐานข้อมูล');
        return;
      }

      if (mode === 'signup') {
        const { error: signUpError } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: `${window.location.origin}/api/auth/callback` },
        });
        if (signUpError) throw signUpError;
        setError('ส่ง email ยืนยันแล้ว กรุณาตรวจสอบ inbox');
      } else {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (signInError) throw signInError;
        window.location.href = '/dashboard';
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'เกิดข้อผิดพลาด');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center noise-bg">
      <div className="w-full max-w-md p-8">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="relative w-16 h-16 rounded-2xl bg-gradient-to-br from-accent-glow to-accent-hot flex items-center justify-center mx-auto mb-4">
            <Bot className="w-8 h-8 text-white" />
            <div className="absolute -bottom-1 -right-1 w-5 h-5 bg-emerald-400 rounded-full border-3 border-surface-1" />
          </div>
          <h1 className="font-display text-2xl text-white">Trading AI</h1>
          <p className="text-sm text-gray-500 mt-1">
            {mode === 'login' ? 'เข้าสู่ระบบ' : 'สร้างบัญชีใหม่'}
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-xs text-gray-400 mb-1.5 block">Email</label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="input-field pl-10"
                placeholder="you@example.com"
              />
            </div>
          </div>

          <div>
            <label className="text-xs text-gray-400 mb-1.5 block">Password</label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
              <input
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="input-field pl-10"
                placeholder="••••••••"
              />
            </div>
          </div>

          {error && (
            <p className={`text-xs ${error.includes('ส่ง email') ? 'text-emerald-400' : 'text-red-400'} bg-red-500/10 rounded-xl p-3`}>
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="btn-primary w-full flex items-center justify-center gap-2"
          >
            {loading ? (
              <span className="animate-spin w-4 h-4 border-2 border-white/30 border-t-white rounded-full" />
            ) : (
              <>
                {mode === 'login' ? 'เข้าสู่ระบบ' : 'สร้างบัญชี'}
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </form>

        <div className="mt-6 text-center">
          <button
            onClick={() => setMode(mode === 'login' ? 'signup' : 'login')}
            className="text-sm text-gray-400 hover:text-accent-glow transition-colors"
          >
            {mode === 'login' ? 'ยังไม่มีบัญชี? สร้างใหม่' : 'มีบัญชีแล้ว? เข้าสู่ระบบ'}
          </button>
        </div>
      </div>
    </div>
  );
}
