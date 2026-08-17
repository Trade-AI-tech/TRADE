'use client';

import { cn } from '@/lib/utils';
import {
  Bell, BellRing, User, Send, Bot, CheckCircle2, XCircle, Save, Key, Shield, Loader2, Lock,
} from 'lucide-react';
import { useCallback, useState, useEffect } from 'react';
import {
  pushSupportStatus, getExistingSubscription, enablePush, disablePush,
} from '@/lib/push-client';
import type { AlertPreferences } from '@/types';

// แจ้งเตือนบนเครื่องอยู่แท็บแรก — ผู้ใช้เทรดผ่านมือถือเป็นหลัก ช่องทางนี้ไม่ต้องตั้ง bot ก่อนเหมือน Telegram
const tabs = [
  { id: 'push', label: 'แจ้งเตือนบนเครื่อง', icon: BellRing },
  { id: 'telegram', label: 'Telegram Bot', icon: Send },
  { id: 'alerts', label: 'การแจ้งเตือน', icon: Bell },
  { id: 'account', label: 'บัญชี', icon: User },
  { id: 'api', label: 'API Keys', icon: Key },
];

/**
 * สถานะ push ของเครื่องนี้ — ต้องวัดใน useEffect เท่านั้น (อ่าน window/navigator)
 * ถ้าเดาตอน render แรกจะ hydration mismatch เพราะ server ไม่รู้จักเบราว์เซอร์ผู้ใช้
 * 'checking' = ยังไม่เคยวัด → UI ต้องโชว์กำลังตรวจสอบ ห้ามทึกทักว่าปิดอยู่
 */
type PushStatus = 'checking' | 'unsupported' | 'off' | 'on';

const DEFAULT_PREFS: AlertPreferences = {
  buy_signals: true,
  sell_signals: true,
  stop_loss_hit: true,
  take_profit_hit: true,
  news_alerts: true,
  strong_signals_only: false,
};

/**
 * รายการแจ้งเตือน
 * live = cron ใช้ค่านี้จริงตอนส่ง Telegram
 * ตัวที่ไม่ใช่ live ยังไม่มีงานเบื้องหลังคอยเฝ้า จึงล็อกไว้ไม่ให้เข้าใจผิดว่าเปิดแล้วจะได้รับ
 * allChannels = ค่านี้คุมทุกช่องทางพร้อมกัน (Telegram + แจ้งเตือนบนเครื่อง)
 * เพราะตัวส่งฝั่ง Supabase อ่าน alert_preferences ชุดเดียวกัน — ไม่มีสวิตช์แยกรายช่องทาง
 */
const ALERT_ROWS: { key: keyof AlertPreferences; label: string; desc: string; color: string; live: boolean; allChannels?: boolean }[] = [
  { key: 'buy_signals', label: 'สัญญาณ BUY', desc: 'แจ้งเมื่อมีสัญญาณซื้อใหม่', color: 'text-emerald-400', live: true, allChannels: true },
  { key: 'sell_signals', label: 'สัญญาณ SELL', desc: 'แจ้งเมื่อมีสัญญาณขายใหม่', color: 'text-red-400', live: true, allChannels: true },
  { key: 'strong_signals_only', label: 'เฉพาะสัญญาณแรง', desc: 'รับเฉพาะ strong / very_strong เท่านั้น', color: 'text-accent-glow', live: true, allChannels: true },
  { key: 'stop_loss_hit', label: 'Stop Loss ถูกตัด', desc: 'แจ้งเมื่อราคาแตะจุดตัดขาดทุนของออเดอร์ที่ถืออยู่', color: 'text-red-400', live: true },
  { key: 'take_profit_hit', label: 'Take Profit ถึง', desc: 'แจ้งเมื่อราคาแตะเป้าทำกำไรของออเดอร์ที่ถืออยู่', color: 'text-emerald-400', live: true },
  { key: 'news_alerts', label: 'ข่าวสำคัญ', desc: 'ต้องต่อแหล่งข่าวก่อน', color: 'text-blue-400', live: false },
];

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState('push');
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [toast, setToast] = useState<{ ok: boolean; msg: string } | null>(null);

  const [telegram, setTelegram] = useState({ botToken: '', chatId: '', enabled: false, hasBotToken: false });
  const [alerts, setAlerts] = useState<AlertPreferences>(DEFAULT_PREFS);
  const [pushStatus, setPushStatus] = useState<PushStatus>('checking');
  const [pushReason, setPushReason] = useState<string | null>(null);
  const [account, setAccount] = useState({
    full_name: '', email: '', timezone: 'Asia/Bangkok',
  });
  // รหัสผ่านใหม่อยู่ใน state ชั่วคราวเท่านั้น ล้างทิ้งทันทีที่ตั้งสำเร็จ
  // ไม่เก็บลง localStorage และไม่ส่งผ่าน API ของเรา
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const flash = useCallback((ok: boolean, msg: string) => {
    setToast({ ok, msg });
    setTimeout(() => setToast(null), 5000);
  }, []);

  // โหลดค่าจริงจากฐานข้อมูล — ค่าที่ cron ใช้ ต้องอยู่ในฐานข้อมูล ไม่ใช่ localStorage
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/profile');
        const data = await res.json();
        if (data.success) {
          const p = data.profile;
          setTelegram({ botToken: '', chatId: p.telegram_chat_id ?? '', enabled: Boolean(p.telegram_enabled), hasBotToken: Boolean(p.has_bot_token) });
          setAlerts({ ...DEFAULT_PREFS, ...(p.alert_preferences ?? {}) });
          setAccount((a) => ({
            ...a,
            full_name: p.full_name ?? '',
            email: p.email ?? '',
            timezone: p.timezone ?? 'Asia/Bangkok',
          }));
        }
      } catch {
        /* ปล่อยใช้ค่า default */
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // วัดความสามารถ push ของเครื่องนี้หลัง mount เท่านั้น — กัน hydration mismatch
  // (server render ไม่มี navigator จึงตอบคำถาม "เครื่องนี้รองรับไหม" ไม่ได้)
  useEffect(() => {
    const support = pushSupportStatus();
    if (!support.ok) {
      setPushReason(support.reason);
      setPushStatus('unsupported');
      return;
    }
    let cancelled = false;
    getExistingSubscription()
      .then((sub) => {
        if (!cancelled) setPushStatus(sub ? 'on' : 'off');
      })
      .catch(() => {
        // อ่านสถานะไม่สำเร็จ → โชว์ปุ่มเปิดไว้ ถ้ากดแล้วมีปัญหาจริง enablePush จะคืนข้อความอธิบายเอง
        if (!cancelled) setPushStatus('off');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleEnablePush = async () => {
    setSavingKey('push');
    try {
      const result = await enablePush();
      if (result.success) {
        setPushStatus('on');
        flash(true, 'เปิดแจ้งเตือนบนเครื่องนี้แล้ว');
      } else {
        flash(false, result.error ?? 'เปิดแจ้งเตือนไม่สำเร็จ');
      }
    } finally {
      setSavingKey(null);
    }
  };

  const handleDisablePush = async () => {
    setSavingKey('push');
    try {
      const result = await disablePush();
      if (result.success) {
        setPushStatus('off');
        flash(true, 'ปิดแจ้งเตือนของเครื่องนี้แล้ว');
      } else {
        flash(false, result.error ?? 'ปิดแจ้งเตือนไม่สำเร็จ');
      }
    } finally {
      setSavingKey(null);
    }
  };

  const patchProfile = async (key: string, patch: Record<string, unknown>) => {
    setSavingKey(key);
    try {
      const res = await fetch('/api/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'บันทึกไม่สำเร็จ');
      flash(true, 'บันทึกเรียบร้อยแล้ว');
      return true;
    } catch (err) {
      flash(false, err instanceof Error ? err.message : String(err));
      return false;
    } finally {
      setSavingKey(null);
    }
  };

  const saveTelegram = async () => {
    const ok = await patchProfile('telegram', {
      telegram_bot_token: telegram.botToken,
      telegram_chat_id: telegram.chatId,
      telegram_enabled: telegram.enabled,
    });
    if (ok) {
      setTelegram((t) => ({ ...t, botToken: '', hasBotToken: t.hasBotToken || Boolean(t.botToken) }));
    }
  };

  const toggleAlert = async (key: keyof AlertPreferences) => {
    const updated = { ...alerts, [key]: !alerts[key] };
    setAlerts(updated);
    await patchProfile('alerts', { alert_preferences: updated });
  };

  /**
   * ตั้งรหัสผ่านของบัญชีตัวเอง
   * เรียก updateUser จากเบราว์เซอร์ตรงไป Supabase — รหัสไม่ผ่านเซิร์ฟเวอร์ของเราเลย
   * (Supabase เก็บเป็น hash ฝั่งมัน อ่านกลับไม่ได้แม้แต่เจ้าของโปรเจกต์)
   */
  const savePassword = async () => {
    if (newPassword.length < 6) {
      flash(false, 'รหัสต้องยาวอย่างน้อย 6 ตัวอักษร');
      return;
    }
    if (newPassword !== confirmPassword) {
      flash(false, 'รหัสสองช่องไม่ตรงกัน');
      return;
    }
    setSavingKey('password');
    try {
      const { getSupabase } = await import('@/lib/supabase');
      const supabase = getSupabase();
      if (!supabase) throw new Error('ระบบยังไม่ได้เชื่อมต่อฐานข้อมูล');
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      setNewPassword('');
      setConfirmPassword('');
      flash(true, 'ตั้งรหัสผ่านแล้ว — ใช้อีเมลกับรหัสนี้เข้าระบบได้จากทุกเครื่อง');
    } catch (err) {
      flash(false, err instanceof Error ? err.message : String(err));
    } finally {
      setSavingKey(null);
    }
  };

  const saveAccount = async () => {
    await patchProfile('account', { full_name: account.full_name, timezone: account.timezone });
  };

  const testTelegram = async () => {
    setSavingKey('test');
    try {
      const res = await fetch('/api/telegram/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ botToken: telegram.botToken, chatId: telegram.chatId }),
      });
      const data = await res.json();
      flash(Boolean(data.success), data.success ? 'ส่งข้อความทดสอบเรียบร้อย!' : data.error || 'ไม่สำเร็จ');
    } catch (err) {
      flash(false, String(err));
    } finally {
      setSavingKey(null);
    }
  };

  const canTest = Boolean(telegram.chatId) && (Boolean(telegram.botToken) || telegram.hasBotToken);

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-display text-white">ตั้งค่า</h1>
        <p className="text-sm text-gray-500 mt-0.5">จัดการแจ้งเตือนบนเครื่อง, Telegram Bot และบัญชี</p>
      </div>

      {toast && (
        <div className={cn(
          'fixed top-4 right-4 z-50 flex items-center gap-2 px-4 py-3 rounded-xl border text-sm max-w-sm',
          toast.ok ? 'bg-emerald-500/20 border-emerald-500/30 text-emerald-400' : 'bg-red-500/20 border-red-500/30 text-red-400'
        )}>
          {toast.ok ? <CheckCircle2 className="w-4 h-4 flex-shrink-0" /> : <XCircle className="w-4 h-4 flex-shrink-0" />}
          <span>{toast.msg}</span>
        </div>
      )}

      {/* มือถือ: เรียงบน-ล่าง เพราะจอแคบไม่พอวางรางแท็บกว้าง 208px คู่กับเนื้อหา — จอ lg ขึ้นไปกลับเป็นรางซ้ายแบบเดิม */}
      <div className="flex flex-col lg:flex-row gap-6">
        {/* รางแท็บ: มือถือเป็นแถวแนวนอนเลื่อนได้ ไม่ให้ดันความกว้างหน้าเกินจอ */}
        <div className="flex lg:flex-col gap-1 overflow-x-auto lg:overflow-x-visible lg:w-52 flex-shrink-0 pb-1 lg:pb-0">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                // whitespace-nowrap + flex-shrink-0 กันชื่อแท็บหักบรรทัด/ปุ่มหดจนกดยากตอนอยู่ในแถวเลื่อนแนวนอน
                'flex items-center gap-2.5 flex-shrink-0 whitespace-nowrap lg:w-full px-3 py-2.5 rounded-xl text-sm font-medium transition-all',
                activeTab === tab.id
                  ? 'bg-accent-glow/10 text-accent-glow border border-accent-glow/20'
                  : 'text-gray-400 hover:text-white hover:bg-white/5 border border-transparent'
              )}
            >
              <tab.icon className="w-4 h-4" />
              {tab.label}
            </button>
          ))}
        </div>

        <div className="flex-1 space-y-6">
          {loading && (
            <div className="card flex items-center gap-2 text-sm text-gray-500">
              <Loader2 className="w-4 h-4 animate-spin" /> กำลังโหลดการตั้งค่า...
            </div>
          )}

          {activeTab === 'push' && (
            <div className="card">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl bg-accent-glow/10 flex items-center justify-center">
                  <BellRing className="w-5 h-5 text-accent-glow" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-white">แจ้งเตือนบนเครื่อง</h3>
                  <p className="text-xs text-gray-500">เด้งเตือนบนเครื่องนี้เมื่อมีสัญญาณ BUY/SELL ใหม่ — ไม่ต้องพึ่ง Telegram</p>
                </div>
              </div>

              {pushStatus === 'checking' && (
                <div className="flex items-center gap-2 text-sm text-gray-500 p-3">
                  <Loader2 className="w-4 h-4 animate-spin" /> กำลังตรวจสอบว่าเครื่องนี้รองรับหรือไม่...
                </div>
              )}

              {pushStatus === 'unsupported' && (
                <div className="space-y-4">
                  {/* โชว์ reason จาก pushSupportStatus ตรง ๆ — ข้อความอธิบายเงื่อนไข iOS ฝังมาในตัวแล้ว */}
                  <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl p-4">
                    <p className="text-xs text-amber-300 flex items-start gap-1.5">
                      <XCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                      <span>{pushReason ?? '—'}</span>
                    </p>
                  </div>
                  <div className="bg-blue-500/5 border border-blue-500/20 rounded-xl p-4">
                    <p className="text-xs text-blue-300 font-medium mb-2">วิธีเปิดใช้บน iPhone (3 ขั้น):</p>
                    <ol className="text-xs text-gray-400 space-y-1 list-decimal list-inside">
                      <li>เปิดเว็บนี้ใน Safari แล้วกดปุ่มแชร์ (สี่เหลี่ยมลูกศรชี้ขึ้น)</li>
                      <li>เลือก &ldquo;เพิ่มไปยังหน้าจอโฮม&rdquo; แล้วกดเพิ่ม</li>
                      <li>เปิดแอปจากไอคอนบนหน้าจอโฮม แล้วกลับมาหน้านี้เพื่อกดเปิดแจ้งเตือน</li>
                    </ol>
                  </div>
                </div>
              )}

              {pushStatus === 'off' && (
                <button
                  onClick={handleEnablePush}
                  disabled={savingKey === 'push'}
                  className="btn-primary w-full py-3 text-sm flex items-center justify-center gap-2 disabled:opacity-40"
                >
                  {savingKey === 'push'
                    ? <Loader2 className="w-4 h-4 animate-spin" />
                    : <BellRing className="w-4 h-4" />}
                  เปิดแจ้งเตือนบนเครื่องนี้
                </button>
              )}

              {pushStatus === 'on' && (
                <div className="flex items-center justify-between gap-3 p-3 rounded-xl bg-emerald-500/5 border border-emerald-500/20">
                  <p className="text-sm text-emerald-400 flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 flex-shrink-0" /> เปิดแจ้งเตือนบนเครื่องนี้อยู่
                  </p>
                  <button
                    onClick={handleDisablePush}
                    disabled={savingKey === 'push'}
                    className="btn-ghost text-sm flex items-center gap-2 flex-shrink-0 disabled:opacity-40"
                  >
                    {savingKey === 'push' && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                    ปิดแจ้งเตือน
                  </button>
                </div>
              )}

              {/* กำกับตรง ๆ ว่าตัวส่งยังไม่ได้ติดตั้ง — กันผู้ใช้เข้าใจผิดว่ากดปุ๊บแล้วจะมีแจ้งเตือนทันที */}
              <p className="text-[11px] text-gray-500 mt-4">
                การกดเปิดที่นี่เป็นการลงทะเบียนเครื่องนี้ไว้รับแจ้งเตือนเท่านั้น —
                การแจ้งเตือนสัญญาณอัตโนมัติจะเริ่มทำงานเมื่อติดตั้งตัวสแกนบน Supabase แล้ว (ดูวิธีติดตั้งใน README)
                · การสมัครแยกรายเครื่อง ถ้าใช้หลายเครื่องต้องกดเปิดในแต่ละเครื่อง
              </p>
            </div>
          )}

          {activeTab === 'telegram' && (
            <div className="card">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center">
                  <Send className="w-5 h-5 text-blue-400" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-white">Telegram Bot</h3>
                  <p className="text-xs text-gray-500">ส่งสัญญาณเข้า/ออก เข้าแชทของคุณอัตโนมัติ</p>
                </div>
              </div>

              <div className="bg-blue-500/5 border border-blue-500/20 rounded-xl p-4 mb-4">
                <p className="text-xs text-blue-300 font-medium mb-2">วิธีสร้าง Telegram Bot:</p>
                <ol className="text-xs text-gray-400 space-y-1 list-decimal list-inside">
                  <li>เปิด Telegram แล้วค้นหา <span className="text-accent-glow">@BotFather</span></li>
                  <li>พิมพ์ <span className="font-mono text-white">/newbot</span> แล้วตั้งชื่อ bot</li>
                  <li>Copy Bot Token ที่ได้มาใส่ด้านล่าง</li>
                  <li>เพิ่ม Bot ในแชท แล้วพิมพ์ข้อความใดก็ได้</li>
                  <li>เปิด <span className="text-accent-glow">api.telegram.org/bot[TOKEN]/getUpdates</span> เพื่อดู chat_id</li>
                </ol>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="text-xs text-gray-400 mb-1.5 block">
                    Bot Token
                    {telegram.hasBotToken && (
                      <span className="ml-2 text-emerald-400">• บันทึกไว้แล้ว (เว้นว่างไว้ถ้าไม่ต้องการเปลี่ยน)</span>
                    )}
                  </label>
                  <input
                    type="password"
                    className="input-field"
                    placeholder={telegram.hasBotToken ? '••••••••••••••••' : '1234567890:ABCdefGHIjklMNOpqrs...'}
                    value={telegram.botToken}
                    onChange={(e) => setTelegram({ ...telegram, botToken: e.target.value })}
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-400 mb-1.5 block">Chat ID</label>
                  <input
                    type="text"
                    className="input-field"
                    placeholder="-1001234567890 หรือ 123456789"
                    value={telegram.chatId}
                    onChange={(e) => setTelegram({ ...telegram, chatId: e.target.value })}
                  />
                </div>

                <div className="flex items-center justify-between p-3 rounded-xl bg-surface-2 border border-white/5">
                  <div>
                    <p className="text-sm text-white">เปิดใช้งาน Telegram Alerts</p>
                    <p className="text-xs text-gray-500">ส่งสัญญาณเข้า Telegram อัตโนมัติทุกรอบสแกน (รายวัน 08:00 น. และรายชั่วโมงเมื่อติดตั้งตัวสแกนบน Supabase แล้ว)</p>
                  </div>
                  <button
                    onClick={() => setTelegram({ ...telegram, enabled: !telegram.enabled })}
                    className={cn('w-10 h-6 rounded-full transition-all relative', telegram.enabled ? 'bg-emerald-400' : 'bg-white/10')}
                  >
                    <div className={cn('w-4 h-4 rounded-full bg-white absolute top-1 transition-all', telegram.enabled ? 'left-5' : 'left-1')} />
                  </button>
                </div>

                <div className="flex items-center justify-end gap-3 pt-2">
                  <button
                    onClick={testTelegram}
                    disabled={!canTest || savingKey === 'test'}
                    className="btn-ghost text-sm flex items-center gap-2 disabled:opacity-40"
                  >
                    {savingKey === 'test' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                    ทดสอบส่งข้อความ
                  </button>
                  <button
                    onClick={saveTelegram}
                    disabled={savingKey === 'telegram'}
                    className="btn-primary text-sm flex items-center gap-2 disabled:opacity-40"
                  >
                    {savingKey === 'telegram' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                    บันทึก
                  </button>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'alerts' && (
            <div className="card">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center">
                  <Bell className="w-5 h-5 text-amber-400" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-white">ประเภทการแจ้งเตือน</h3>
                  <p className="text-xs text-gray-500">เลือกว่าต้องการให้ส่งแจ้งเตือนอะไรบ้าง</p>
                </div>
              </div>
              <div className="space-y-3">
                {ALERT_ROWS.map((n) => (
                  <div
                    key={n.key}
                    className={cn(
                      'flex items-center justify-between p-3 rounded-xl bg-surface-2 border border-white/5',
                      !n.live && 'opacity-60'
                    )}
                  >
                    <div>
                      <p className={cn('text-sm font-medium flex items-center gap-2', n.color)}>
                        {n.label}
                        {!n.live && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/5 text-gray-400 font-normal">
                            ยังไม่เปิดใช้งาน
                          </span>
                        )}
                      </p>
                      <p className="text-xs text-gray-500">
                        {n.desc}
                        {n.allChannels && (
                          <span className="text-gray-600"> — มีผลกับทุกช่องทาง (Telegram และแจ้งเตือนบนเครื่อง)</span>
                        )}
                      </p>
                    </div>
                    <button
                      disabled={!n.live}
                      onClick={() => toggleAlert(n.key)}
                      className={cn(
                        'w-10 h-6 rounded-full transition-all relative disabled:cursor-not-allowed',
                        alerts[n.key] ? 'bg-accent-glow' : 'bg-white/10'
                      )}
                    >
                      <div className={cn('w-4 h-4 rounded-full bg-white absolute top-1 transition-all', alerts[n.key] ? 'left-5' : 'left-1')} />
                    </button>
                  </div>
                ))}
              </div>

              <p className="text-[11px] text-gray-500 mt-4">
                เมื่อราคาแตะ SL/TP ระบบจะบันทึกปิดออเดอร์ให้ในสมุดเทรดแล้วส่งแจ้งเตือนเท่านั้น
                ไม่ได้ส่งคำสั่งซื้อขายไปยังโบรกเกอร์ — คุณยังต้องปิดออเดอร์จริงที่โบรกเกอร์ด้วยตัวเอง
              </p>
            </div>
          )}

          {activeTab === 'account' && (
            <div className="card">
              <h3 className="text-sm font-semibold text-white mb-4">ข้อมูลบัญชี</h3>
              <div className="space-y-4">
                <div>
                  <label className="text-xs text-gray-400 mb-1.5 block">ชื่อ</label>
                  <input type="text" className="input-field" placeholder="ชื่อของคุณ"
                    value={account.full_name} onChange={(e) => setAccount({ ...account, full_name: e.target.value })} />
                </div>
                <div>
                  <label className="text-xs text-gray-400 mb-1.5 block">Email</label>
                  <input type="email" className="input-field opacity-60" value={account.email} readOnly />
                  <p className="text-[10px] text-gray-500 mt-1">อีเมลผูกกับบัญชีเข้าสู่ระบบ เปลี่ยนที่นี่ไม่ได้</p>
                </div>
                <div>
                  <label className="text-xs text-gray-400 mb-1.5 block">Timezone</label>
                  <select className="input-field" value={account.timezone}
                    onChange={(e) => setAccount({ ...account, timezone: e.target.value })}>
                    <option value="Asia/Bangkok">Asia/Bangkok (GMT+7)</option>
                    <option value="UTC">UTC</option>
                    <option value="America/New_York">America/New_York</option>
                  </select>
                </div>
                <div className="flex justify-end pt-2">
                  <button
                    onClick={saveAccount}
                    disabled={savingKey === 'account'}
                    className="btn-primary text-sm flex items-center gap-2 disabled:opacity-40"
                  >
                    {savingKey === 'account' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                    บันทึก
                  </button>
                </div>

                {/* ตั้งรหัสผ่าน — ทางเข้าที่ไม่พึ่งอีเมลเลย
                    จำเป็นเพราะเข้าเครื่องใหม่ (มือถือ / PWA ที่เพิ่มไปหน้าจอโฮม ซึ่ง iOS นับเป็นแอปแยก
                    จาก Safari จึงไม่ได้ session มาด้วย) ต้องล็อกอินใหม่ทุกครั้ง
                    และการขอรหัสทางอีเมลติดโควตา ~3-4 ฉบับ/ชั่วโมงของ Supabase
                    รหัสถูกส่งตรงจากเบราว์เซอร์ไป Supabase ผ่าน updateUser — ไม่ผ่านเซิร์ฟเวอร์ของเรา */}
                <div className="border-t border-white/5 pt-5 mt-5 space-y-4">
                  <div>
                    <h4 className="text-sm font-semibold text-white flex items-center gap-2">
                      <Lock className="w-4 h-4 text-accent-glow" />
                      ตั้งรหัสผ่าน
                    </h4>
                    <p className="text-xs text-gray-500 mt-1">
                      ตั้งไว้แล้วจะเข้าระบบจากเครื่องไหนก็ได้ด้วยอีเมล + รหัสผ่าน ไม่ต้องรออีเมลอีก
                      — จำเป็นถ้าจะใช้บนมือถือ
                    </p>
                  </div>
                  <div>
                    <label className="text-xs text-gray-400 mb-1.5 block">รหัสผ่านใหม่ (อย่างน้อย 6 ตัว)</label>
                    <input
                      type="password"
                      className="input-field"
                      autoComplete="new-password"
                      placeholder="ตั้งรหัสที่จำได้"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-400 mb-1.5 block">พิมพ์รหัสอีกครั้ง</label>
                    <input
                      type="password"
                      className="input-field"
                      autoComplete="new-password"
                      placeholder="ยืนยันรหัสเดิมอีกรอบ"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                    />
                  </div>
                  <div className="flex justify-end">
                    <button
                      onClick={savePassword}
                      disabled={savingKey === 'password' || newPassword.length < 6 || newPassword !== confirmPassword}
                      className="btn-primary text-sm flex items-center gap-2 disabled:opacity-40"
                    >
                      {savingKey === 'password' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Lock className="w-3.5 h-3.5" />}
                      ตั้งรหัสผ่าน
                    </button>
                  </div>
                  {newPassword.length > 0 && newPassword.length < 6 && (
                    <p className="text-[11px] text-amber-400">รหัสสั้นไป — ต้องอย่างน้อย 6 ตัวอักษร</p>
                  )}
                  {confirmPassword.length > 0 && newPassword !== confirmPassword && (
                    <p className="text-[11px] text-red-400">รหัสสองช่องไม่ตรงกัน</p>
                  )}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'api' && (
            <div className="card">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl bg-purple-500/10 flex items-center justify-center">
                  <Key className="w-5 h-5 text-purple-400" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-white">แหล่งข้อมูล</h3>
                  <p className="text-xs text-gray-500">ระบบใช้อะไรดึงข้อมูลอยู่ตอนนี้</p>
                </div>
              </div>

              <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-xl p-4 mb-4">
                <p className="text-xs text-emerald-300 flex items-start gap-1.5">
                  <Shield className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                  <span>
                    ราคาและแท่งเทียนทั้งหมดดึงจาก Yahoo Finance ซึ่งใช้ได้ฟรีโดยไม่ต้องมี API key
                    ระบบจึงทำงานได้ครบโดยไม่ต้องตั้งค่าอะไรเพิ่ม
                  </span>
                </p>
              </div>

              <div className="space-y-3 text-xs">
                <div className="flex items-start justify-between gap-4 p-3 rounded-xl bg-surface-2 border border-white/5">
                  <div>
                    <p className="text-sm text-white flex items-center gap-1.5"><Bot className="w-3.5 h-3.5" /> Anthropic Claude</p>
                    <p className="text-gray-500 mt-0.5">สรุปสัญญาณ/วิเคราะห์ข่าวด้วย AI</p>
                  </div>
                  <span className="text-[10px] px-2 py-1 rounded bg-white/5 text-gray-400 flex-shrink-0">ยังไม่ได้ต่อ</span>
                </div>
                <div className="flex items-start justify-between gap-4 p-3 rounded-xl bg-surface-2 border border-white/5">
                  <div>
                    <p className="text-sm text-white">แหล่งข่าว (NewsAPI)</p>
                    <p className="text-gray-500 mt-0.5">ป้อน sentiment เข้าเครื่องคำนวณสัญญาณ</p>
                  </div>
                  <span className="text-[10px] px-2 py-1 rounded bg-white/5 text-gray-400 flex-shrink-0">ยังไม่ได้ต่อ</span>
                </div>
              </div>

              <p className="text-[11px] text-gray-500 mt-4">
                สองรายการนี้ยังไม่มีโค้ดเรียกใช้ จึงยังไม่เปิดช่องให้กรอก key เพื่อไม่ให้เข้าใจผิดว่าตั้งค่าแล้วจะทำงาน
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
