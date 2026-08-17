'use client';

import { useEffect, useState } from 'react';
import { Bot, Mail, Lock, ArrowRight, Wand2, KeyRound } from 'lucide-react';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  // โหมดกรอกรหัส 6 หลักจากอีเมล — ทางเข้าหลักที่ทนทุกสภาพ
  // (ลิงก์ในเมลพังได้หลายทาง: Hotmail/Outlook สแกนลิงก์แล้ว "ใช้" ลิงก์แบบครั้งเดียวทิ้งก่อนผู้ใช้กด,
  // ลิงก์ถูกเปิดคนละเบราว์เซอร์กับที่ขอ ทำให้ PKCE แลก session ไม่ได้ — เจอจริงกับผู้ใช้จริงมาแล้ว)
  const [otpSent, setOtpSent] = useState(false);
  const [otpCode, setOtpCode] = useState('');

  // error จาก callback (ลิงก์เสีย/ถูกใช้แล้ว) ถูกส่งกลับมาทาง query — เดิมถูกกลืนเงียบ
  // ผู้ใช้กดลิงก์แล้วเด้งกลับหน้า login โดยไม่รู้ว่าเกิดอะไรขึ้น
  useEffect(() => {
    const err = new URLSearchParams(window.location.search).get('error');
    if (err) {
      setError(`ลิงก์ในอีเมลใช้ไม่ได้ (${err}) — ขอรหัสใหม่แล้วกรอกรหัส 6 หลักแทน วิธีนี้ชัวร์กว่า`);
    }
  }, []);

  /**
   * เข้าระบบแบบไม่ใช้รหัสผ่าน — ส่งอีเมลที่มีทั้งลิงก์และรหัส 6 หลัก
   * ครั้งแรกระบบสร้างบัญชีให้เองจากอีเมลนั้น (ไม่ต้องสมัครแยก ไม่ต้องตั้งรหัส)
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
      setOtpSent(true);
      setNotice('ส่งอีเมลแล้ว — เอา "รหัส 6 หลัก" ในอีเมลมากรอกช่องด้านล่างนี้ (แนะนำ) หรือจะกดลิงก์ในอีเมลก็ได้');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'ส่งอีเมลไม่สำเร็จ');
    } finally {
      setLoading(false);
    }
  };

  /** ยืนยันรหัส 6 หลักจากอีเมล — สร้าง session ในเบราว์เซอร์นี้ตรง ๆ ไม่พึ่งลิงก์เลย */
  const handleVerifyOtp = async () => {
    setError('');
    const code = otpCode.trim();
    if (!/^\d{6}$/.test(code)) {
      setError('รหัสต้องเป็นตัวเลข 6 หลักตามที่อยู่ในอีเมล');
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
      // ชนิดของ token ต่างกันตามที่มา: รหัสจาก signInWithOtp เป็น 'email'
      // ส่วนรหัสที่ออกด้วย admin generateLink เป็น 'magiclink'
      // ผู้ใช้แยกไม่ออกว่ารหัสในมือมาจากทางไหน จึงลองให้ครบทั้งสองแบบ
      // (ลองผิดไม่ทำให้รหัสถูกเผา — Supabase ปฏิเสธเฉย ๆ เมื่อชนิดไม่ตรง)
      const types = ['email', 'magiclink'] as const;
      let lastError: unknown = null;
      for (const type of types) {
        const { error: verifyError } = await supabase.auth.verifyOtp({
          email: email.trim(),
          token: code,
          type,
        });
        if (!verifyError) {
          window.location.href = '/dashboard';
          return;
        }
        lastError = verifyError;
      }
      throw lastError;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(
        msg.includes('expired') || msg.includes('invalid')
          ? 'รหัสไม่ถูกต้องหรือหมดอายุแล้ว — ขอรหัสใหม่อีกครั้ง (รหัสเก่าใช้ไม่ได้ทันทีที่ขอใหม่)'
          : msg.includes('rate limit')
          ? 'ส่งอีเมลบ่อยเกินไป — Supabase จำกัดไว้ราว 3-4 ฉบับต่อชั่วโมง รอสักครู่แล้วลองใหม่'
          : msg
      );
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    // ใส่เมลแต่ไม่ใส่รหัส = ตั้งใจเข้าแบบไม่ใช้รหัส → ส่งลิงก์ให้เลย
    // (ของจริงเกิดแล้ว: ผู้ใช้เห็น placeholder จุด ๆ ในช่องรหัสแล้วเข้าใจว่าไม่ต้องกรอก
    // กดปุ่มใหญ่แล้วโดนเบราว์เซอร์ทวงรหัส ทั้งที่ปุ่มลิงก์อีเมลอยู่ถัดลงไปนิดเดียว)
    if (mode === 'login' && !password.trim()) {
      setLoading(false);
      await handleMagicLink();
      return;
    }

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
              {/* required เฉพาะโหมดสมัคร — โหมดเข้าระบบเว้นว่างได้ (= ขอลิงก์ทางอีเมลแทน)
                  placeholder ห้ามเป็นจุด ๆ เด็ดขาด: ผู้ใช้จริงเคยเข้าใจว่ามีรหัสอยู่ในช่องแล้ว */}
              <input
                type="password"
                required={mode === 'signup'}
                minLength={mode === 'signup' ? 6 : undefined}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="input-field pl-10"
                placeholder={mode === 'signup' ? 'ตั้งรหัสอย่างน้อย 6 ตัว' : 'เว้นว่างได้ — ระบบจะส่งลิงก์เข้าอีเมลแทน'}
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

          {/* ช่องกรอกรหัส 6 หลัก — โผล่หลังกดขออีเมลแล้วเท่านั้น
              วางไว้ "เหนือ" ปุ่มเข้าสู่ระบบ ให้เป็นสิ่งแรกที่สายตาเจอหลังเปิดอีเมล */}
          {otpSent && (
            <div className="space-y-2 rounded-xl border border-accent-glow/30 bg-accent-glow/5 p-3">
              <label className="text-xs text-accent-glow flex items-center gap-1.5">
                <KeyRound className="w-3.5 h-3.5" />
                รหัส 6 หลักจากอีเมล
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  value={otpCode}
                  onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ''))}
                  className="input-field font-mono text-center tracking-[0.5em]"
                  placeholder="000000"
                />
                <button
                  type="button"
                  onClick={handleVerifyOtp}
                  disabled={loading || otpCode.length !== 6}
                  className="btn-primary px-5 flex-shrink-0 disabled:opacity-40"
                >
                  ยืนยัน
                </button>
              </div>
              <p className="text-[11px] text-gray-500">
                ไม่เจออีเมล? เช็คโฟลเดอร์ Junk/สแปม หรือกดปุ่มด้านล่างขอรหัสใหม่
              </p>
            </div>
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
            ขอรหัสเข้าระบบทางอีเมล — ไม่ต้องใช้รหัสผ่าน
          </button>
          {/* ทางเข้าสำหรับคนที่มีรหัสอยู่แล้วโดยไม่ได้กดขอจากหน้านี้
              (เช่นรหัสที่ออกให้จากฝั่งผู้ดูแลระบบตอนโควตาอีเมลเต็ม) */}
          {!otpSent && (
            <button
              type="button"
              onClick={() => { setOtpSent(true); setError(''); }}
              className="w-full text-xs text-gray-400 hover:text-accent-glow transition-colors"
            >
              มีรหัส 6 หลักอยู่แล้ว? กรอกที่นี่
            </button>
          )}
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
