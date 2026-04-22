'use client';

import { cn } from '@/lib/utils';
import {
  Bell, User, Send, Bot, CheckCircle2, XCircle, Save, Key, Shield, Zap,
} from 'lucide-react';
import { useState, useEffect } from 'react';

const tabs = [
  { id: 'telegram', label: 'Telegram Bot', icon: Send },
  { id: 'alerts', label: 'การแจ้งเตือน', icon: Bell },
  { id: 'account', label: 'บัญชี', icon: User },
  { id: 'api', label: 'API Keys', icon: Key },
];

function loadSettings<T>(key: string, defaults: T): T {
  if (typeof window === 'undefined') return defaults;
  try {
    const stored = localStorage.getItem(`trading-ai-${key}`);
    return stored ? { ...defaults, ...JSON.parse(stored) } : defaults;
  } catch {
    return defaults;
  }
}

function saveSettings(key: string, data: Record<string, unknown>) {
  localStorage.setItem(`trading-ai-${key}`, JSON.stringify(data));
}

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState('telegram');
  const [saved, setSaved] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null);

  const [telegram, setTelegram] = useState({
    botToken: '', chatId: '', enabled: false,
  });

  const [alerts, setAlerts] = useState({
    buySignals: true, sellSignals: true, holdSignals: false,
    stopLossHit: true, takeProfitHit: true, newsAlerts: true,
    strongSignalsOnly: false,
  });

  const [account, setAccount] = useState({
    name: '', email: '', timezone: 'Asia/Bangkok', defaultQuantity: 1,
  });

  const [apiKeys, setApiKeys] = useState({
    anthropicKey: '', newsApiKey: '', alphaVantageKey: '',
  });

  useEffect(() => {
    setTelegram(loadSettings('telegram', telegram));
    setAlerts(loadSettings('alerts', alerts));
    setAccount(loadSettings('account', account));
    setApiKeys(loadSettings('api-keys', apiKeys));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSave = (key: string, data: Record<string, unknown>) => {
    saveSettings(key, data);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const testTelegram = async () => {
    setTestResult(null);
    try {
      const res = await fetch('/api/telegram/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(telegram),
      });
      const data = await res.json();
      setTestResult({ ok: data.success, msg: data.success ? 'ส่งข้อความทดสอบเรียบร้อย!' : data.error || 'ไม่สำเร็จ' });
    } catch (err) {
      setTestResult({ ok: false, msg: String(err) });
    }
    setTimeout(() => setTestResult(null), 5000);
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-display text-white">ตั้งค่า</h1>
        <p className="text-sm text-gray-500 mt-0.5">จัดการ Telegram Bot, แจ้งเตือน และ API keys</p>
      </div>

      {saved && (
        <div className="fixed top-4 right-4 z-50 flex items-center gap-2 px-4 py-3 rounded-xl bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 text-sm">
          <CheckCircle2 className="w-4 h-4" />
          บันทึกเรียบร้อยแล้ว
        </div>
      )}

      {testResult && (
        <div className={cn(
          'fixed top-4 right-4 z-50 flex items-center gap-2 px-4 py-3 rounded-xl border text-sm',
          testResult.ok ? 'bg-emerald-500/20 border-emerald-500/30 text-emerald-400' : 'bg-red-500/20 border-red-500/30 text-red-400'
        )}>
          {testResult.ok ? <CheckCircle2 className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
          {testResult.msg}
        </div>
      )}

      <div className="flex gap-6">
        <div className="w-52 space-y-1 flex-shrink-0">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                'flex items-center gap-2.5 w-full px-3 py-2.5 rounded-xl text-sm font-medium transition-all',
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
          {activeTab === 'telegram' && (
            <div className="space-y-6">
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
                    <label className="text-xs text-gray-400 mb-1.5 block">Bot Token</label>
                    <input
                      type="password"
                      className="input-field"
                      placeholder="1234567890:ABCdefGHIjklMNOpqrs..."
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
                      <p className="text-xs text-gray-500">ส่งสัญญาณเทรดเข้า Telegram อัตโนมัติ</p>
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
                      disabled={!telegram.botToken || !telegram.chatId}
                      className="btn-ghost text-sm flex items-center gap-2 disabled:opacity-40"
                    >
                      <Send className="w-3.5 h-3.5" />
                      ทดสอบส่งข้อความ
                    </button>
                    <button
                      onClick={() => handleSave('telegram', telegram)}
                      className="btn-primary text-sm flex items-center gap-2"
                    >
                      <Save className="w-3.5 h-3.5" />
                      บันทึก
                    </button>
                  </div>
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
                {[
                  { key: 'buySignals', label: 'สัญญาณ BUY', desc: 'แจ้งเมื่อมีสัญญาณซื้อใหม่', color: 'text-emerald-400' },
                  { key: 'sellSignals', label: 'สัญญาณ SELL', desc: 'แจ้งเมื่อมีสัญญาณขายใหม่', color: 'text-red-400' },
                  { key: 'holdSignals', label: 'สัญญาณ HOLD', desc: 'แจ้งเมื่อมีสัญญาณถือ', color: 'text-amber-400' },
                  { key: 'stopLossHit', label: 'Stop Loss ถูกตัด', desc: 'แจ้งเมื่อราคาถึง Stop Loss', color: 'text-red-400' },
                  { key: 'takeProfitHit', label: 'Take Profit ถึง', desc: 'แจ้งเมื่อราคาถึง Take Profit', color: 'text-emerald-400' },
                  { key: 'newsAlerts', label: 'ข่าวสำคัญ', desc: 'แจ้งเมื่อมีข่าวที่ส่งผลต่อ watchlist', color: 'text-blue-400' },
                  { key: 'strongSignalsOnly', label: 'เฉพาะสัญญาณแรง', desc: 'รับเฉพาะสัญญาณ strong/very_strong เท่านั้น', color: 'text-accent-glow' },
                ].map((n) => (
                  <div key={n.key} className="flex items-center justify-between p-3 rounded-xl bg-surface-2 border border-white/5">
                    <div>
                      <p className={cn('text-sm font-medium', n.color)}>{n.label}</p>
                      <p className="text-xs text-gray-500">{n.desc}</p>
                    </div>
                    <button
                      onClick={() => {
                        const updated = { ...alerts, [n.key]: !alerts[n.key as keyof typeof alerts] };
                        setAlerts(updated);
                        handleSave('alerts', updated);
                      }}
                      className={cn('w-10 h-6 rounded-full transition-all relative', alerts[n.key as keyof typeof alerts] ? 'bg-accent-glow' : 'bg-white/10')}
                    >
                      <div className={cn('w-4 h-4 rounded-full bg-white absolute top-1 transition-all', alerts[n.key as keyof typeof alerts] ? 'left-5' : 'left-1')} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'account' && (
            <div className="card">
              <h3 className="text-sm font-semibold text-white mb-4">ข้อมูลบัญชี</h3>
              <div className="space-y-4">
                <div>
                  <label className="text-xs text-gray-400 mb-1.5 block">ชื่อ</label>
                  <input type="text" className="input-field" placeholder="ชื่อของคุณ"
                    value={account.name} onChange={(e) => setAccount({ ...account, name: e.target.value })} />
                </div>
                <div>
                  <label className="text-xs text-gray-400 mb-1.5 block">Email</label>
                  <input type="email" className="input-field" placeholder="email@example.com"
                    value={account.email} onChange={(e) => setAccount({ ...account, email: e.target.value })} />
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
                <div>
                  <label className="text-xs text-gray-400 mb-1.5 block">จำนวนเริ่มต้นเมื่อเทรด</label>
                  <input type="number" className="input-field" placeholder="1"
                    value={account.defaultQuantity} onChange={(e) => setAccount({ ...account, defaultQuantity: Number(e.target.value) })} />
                </div>
                <div className="flex justify-end pt-2">
                  <button onClick={() => handleSave('account', account)} className="btn-primary text-sm flex items-center gap-2">
                    <Save className="w-3.5 h-3.5" />บันทึก
                  </button>
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
                  <h3 className="text-sm font-semibold text-white">API Keys</h3>
                  <p className="text-xs text-gray-500">ใส่ API keys เพื่อเปิดใช้งานข้อมูลจริง</p>
                </div>
              </div>

              <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl p-4 mb-4">
                <p className="text-xs text-amber-300">
                  <Shield className="w-3 h-3 inline mr-1" />
                  ระบบใช้ Yahoo Finance สำหรับข้อมูลราคาฟรีอยู่แล้ว ไม่ต้องใส่ key ก็ใช้ได้
                </p>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="text-xs text-gray-400 mb-1.5 block flex items-center gap-1">
                    <Bot className="w-3 h-3" /> Anthropic Claude API
                  </label>
                  <input type="password" className="input-field" placeholder="sk-ant-..."
                    value={apiKeys.anthropicKey} onChange={(e) => setApiKeys({ ...apiKeys, anthropicKey: e.target.value })} />
                  <p className="text-[10px] text-gray-500 mt-1">สำหรับวิเคราะห์ข่าว + สรุปสัญญาณด้วย AI</p>
                </div>
                <div>
                  <label className="text-xs text-gray-400 mb-1.5 block">NewsAPI Key</label>
                  <input type="password" className="input-field" placeholder="..."
                    value={apiKeys.newsApiKey} onChange={(e) => setApiKeys({ ...apiKeys, newsApiKey: e.target.value })} />
                  <p className="text-[10px] text-gray-500 mt-1">สำหรับดึงข่าวจริง (newsapi.org)</p>
                </div>
                <div>
                  <label className="text-xs text-gray-400 mb-1.5 block">Alpha Vantage Key (ตัวเลือก)</label>
                  <input type="password" className="input-field" placeholder="..."
                    value={apiKeys.alphaVantageKey} onChange={(e) => setApiKeys({ ...apiKeys, alphaVantageKey: e.target.value })} />
                  <p className="text-[10px] text-gray-500 mt-1">Backup สำหรับข้อมูลราคา</p>
                </div>
                <div className="flex justify-end pt-2">
                  <button onClick={() => handleSave('api-keys', apiKeys)} className="btn-primary text-sm flex items-center gap-2">
                    <Save className="w-3.5 h-3.5" />บันทึก
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
