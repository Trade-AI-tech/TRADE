'use client';

import { useState } from 'react';
import { Bot, Mail, Lock, ArrowRight, Wand2 } from 'lucide-react';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [mode, setMode] = useState<'login' | 'signup'>('login');

  /**
   * เข้าระบบแบบไม่ใช้รหัสผ่าน — ส่งลิงก์เข้าอีเมลแล้วกดจากกล่องจดหมาย
   * ครั้งแรกระบบสร้างบัญชีให้เองจากอีเมลนั้น (ไม่ต้องสมัครแยก ไม่ต้องตั้งรหัส)
   * ข้อจำกัดของ PKCE: ต้องกดลิงก์ในเบราว์เซอร์เดียวกับที่กดปุ่มนี้ ไม่งั้นแลก session ไม่ได้
   */
  const handleMagicLink = async () => {
    setError('');
    setNotice('');
    if (!email.trim()) {
      setError('กรอกอีเมลในช่องด้านบนก่อน แล้วกดปุ่มนี้อีกครั้ง');
      return;
    }
    setLoading(true);
    try {
      const { createClient } = await import('@/lib/supabase');
      const supabase = createClient();
      if (!supabase) {
        setError('ระบบยังไม่ได้เชื่อมต่อฐานข้อมูล');
        return;
      }
      const { error: otpError } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: { emailRedirectTo: `${window.location.origin}/api/auth/callback` },
      });
      if (otpError) throw otpError;
      setNotice('ส่งลิงก์ไปที่อีเมลแล้ว — เปิดอีเมลแล้วกดลิงก์ ระบบจะพาเข้า dashboard เอง (ต้องกดลิงก์ในเบราว์เซอร์เดียวกันนี้)');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'ส่งลิงก์ไม่สำเร็จ');
    } finally {
      setLoading(false);
    }
  };

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
          {notice && (
            <p className="text-xs text-emerald-400 bg-emerald-500/10 rounded-xl p-3">
              {notice}
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

          {/* ทางเข้าแบบไม่ใช้รหัสผ่าน — สำหรับคนที่ไม่อยากตั้ง/จำรหัสเลย
              ใช้อีเมลจากช่องข้างบน ครั้งแรกระบบสร้างบัญชีให้อัตโนมัติ */}
          <div className="relative my-2">
            <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-white/10" /></div>
            <div className="relative flex justify-center"><span className="px-3 text-[11px] text-gray-500 bg-surface-1">หรือ</span></div>
          </div>
          <button
            type="button"
            onClick={handleMagicLink}
            disabled={loading}
            className="btn-ghost w-full flex items-center justify-center gap-2 text-sm"
          >
            <Wand2 className="w-4 h-4" />
            รับลิงก์เข้าระบบทางอีเมล — ไม่ต้องใช้รหัสผ่าน
          </button>
          <p className="text-[11px] text-gray-500 text-center">
            กรอกอีเมลข้างบนแล้วกดปุ่มนี้ ลิงก์จะพาเข้าระบบเลย ครั้งแรกระบบสร้างบัญชีให้อัตโนมัติ
          </p>
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
