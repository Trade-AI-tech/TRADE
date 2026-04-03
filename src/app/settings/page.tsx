'use client';

import { cn } from '@/lib/utils';
import {
  Settings, Key, Globe, Bell, User, Link2,
  Shield, Zap, CheckCircle2, XCircle, RefreshCw, Save,
} from 'lucide-react';
import { useState, useEffect } from 'react';

const tabs = [
  { id: 'account', label: 'บัญชี', icon: User },
  { id: 'tiktok', label: 'TikTok API', icon: Link2 },
  { id: 'ai', label: 'AI Settings', icon: Zap },
  { id: 'notifications', label: 'การแจ้งเตือน', icon: Bell },
  { id: 'security', label: 'ความปลอดภัย', icon: Shield },
];

// Load settings from localStorage
function loadSettings(key: string, defaults: Record<string, unknown>) {
  if (typeof window === 'undefined') return defaults;
  try {
    const stored = localStorage.getItem(`tiktok-ads-${key}`);
    return stored ? { ...defaults, ...JSON.parse(stored) } : defaults;
  } catch {
    return defaults;
  }
}

function saveSettings(key: string, data: Record<string, unknown>) {
  localStorage.setItem(`tiktok-ads-${key}`, JSON.stringify(data));
}

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState('tiktok');
  const [saved, setSaved] = useState(false);

  // TikTok settings
  const [tiktokSettings, setTiktokSettings] = useState({
    appId: '', appSecret: '', accessToken: '', advertiserId: '',
  });

  // AI settings
  const [aiSettings, setAiSettings] = useState({
    apiKey: '', model: 'claude-sonnet-4-20250514',
    budgetOptimization: true, performanceAlerts: true, creativeAnalysis: true,
    trendPrediction: false, autoOptimization: false,
  });

  // Account settings
  const [accountSettings, setAccountSettings] = useState({
    name: '', email: '', company: '', timezone: 'Asia/Bangkok',
  });

  // Notification settings
  const [notifSettings, setNotifSettings] = useState({
    aiInsights: true, budgetAlert: true, performanceDrop: true,
    dailySummary: false, weeklyReport: true,
  });

  // Load from localStorage on mount
  useEffect(() => {
    setTiktokSettings(loadSettings('tiktok', tiktokSettings) as typeof tiktokSettings);
    setAiSettings(loadSettings('ai', aiSettings) as typeof aiSettings);
    setAccountSettings(loadSettings('account', accountSettings) as typeof accountSettings);
    setNotifSettings(loadSettings('notifications', notifSettings) as typeof notifSettings);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSave = (key: string, data: Record<string, unknown>) => {
    saveSettings(key, data);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-display text-white">ตั้งค่า</h1>
        <p className="text-sm text-gray-500 mt-0.5">จัดการบัญชี, API connections และ AI settings</p>
      </div>

      {/* Save toast */}
      {saved && (
        <div className="fixed top-4 right-4 z-50 flex items-center gap-2 px-4 py-3 rounded-xl bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 text-sm animate-slide-up">
          <CheckCircle2 className="w-4 h-4" />
          บันทึกเรียบร้อยแล้ว
        </div>
      )}

      <div className="flex gap-6">
        {/* Sidebar tabs */}
        <div className="w-48 space-y-1 flex-shrink-0">
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

        {/* Content */}
        <div className="flex-1">
          {activeTab === 'tiktok' && (
            <div className="space-y-6">
              <div className="card">
                <h3 className="text-sm font-semibold text-white mb-4">TikTok Marketing API</h3>

                <div className="space-y-4">
                  <div className="flex items-center justify-between p-4 rounded-xl bg-surface-2 border border-white/5">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-tiktok-dark flex items-center justify-center">
                        <Globe className="w-5 h-5 text-accent-glow" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-white">TikTok Advertiser Account</p>
                        <p className="text-xs text-gray-500">
                          ID: {tiktokSettings.advertiserId || 'ยังไม่ได้ตั้งค่า'}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {tiktokSettings.accessToken ? (
                        <>
                          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                          <span className="text-xs text-emerald-400">Connected</span>
                        </>
                      ) : (
                        <>
                          <XCircle className="w-4 h-4 text-gray-500" />
                          <span className="text-xs text-gray-500">Not Connected</span>
                        </>
                      )}
                    </div>
                  </div>

                  <div>
                    <label className="text-xs text-gray-400 mb-1.5 block">App ID</label>
                    <input
                      type="text"
                      className="input-field"
                      placeholder="TikTok App ID"
                      value={tiktokSettings.appId}
                      onChange={(e) => setTiktokSettings({ ...tiktokSettings, appId: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-400 mb-1.5 block">App Secret</label>
                    <input
                      type="password"
                      className="input-field"
                      placeholder="••••••••••••"
                      value={tiktokSettings.appSecret}
                      onChange={(e) => setTiktokSettings({ ...tiktokSettings, appSecret: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-400 mb-1.5 block">Access Token</label>
                    <input
                      type="password"
                      className="input-field"
                      placeholder="••••••••••••"
                      value={tiktokSettings.accessToken}
                      onChange={(e) => setTiktokSettings({ ...tiktokSettings, accessToken: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-400 mb-1.5 block">Advertiser ID</label>
                    <input
                      type="text"
                      className="input-field"
                      placeholder="Advertiser ID"
                      value={tiktokSettings.advertiserId}
                      onChange={(e) => setTiktokSettings({ ...tiktokSettings, advertiserId: e.target.value })}
                    />
                  </div>

                  <div className="flex items-center justify-between pt-2">
                    <div className="flex items-center gap-2 text-xs text-gray-500">
                      <RefreshCw className="w-3.5 h-3.5" />
                      Sync อัตโนมัติทุก 15 นาที
                    </div>
                    <div className="flex gap-3">
                      <button
                        onClick={() => handleSave('tiktok', tiktokSettings)}
                        className="btn-primary text-sm flex items-center gap-2"
                      >
                        <Save className="w-3.5 h-3.5" />
                        บันทึก
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'ai' && (
            <div className="space-y-6">
              <div className="card">
                <h3 className="text-sm font-semibold text-white mb-4">AI Analysis Settings</h3>

                <div className="space-y-4">
                  <div>
                    <label className="text-xs text-gray-400 mb-1.5 block">Anthropic API Key</label>
                    <input
                      type="password"
                      className="input-field"
                      placeholder="sk-ant-••••••••••••"
                      value={aiSettings.apiKey}
                      onChange={(e) => setAiSettings({ ...aiSettings, apiKey: e.target.value })}
                    />
                  </div>

                  <div>
                    <label className="text-xs text-gray-400 mb-1.5 block">AI Model</label>
                    <select
                      className="input-field"
                      value={aiSettings.model}
                      onChange={(e) => setAiSettings({ ...aiSettings, model: e.target.value })}
                    >
                      <option value="claude-sonnet-4-20250514">Claude Sonnet 4 (แนะนำ)</option>
                      <option value="claude-haiku-4-5-20251001">Claude Haiku 4.5 (เร็ว, ประหยัด)</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-xs text-gray-400 mb-3 block">AI Features</label>
                    <div className="space-y-3">
                      {[
                        { key: 'budgetOptimization', label: 'Budget Optimization', desc: 'วิเคราะห์และแนะนำการจัดสรรงบ' },
                        { key: 'performanceAlerts', label: 'Performance Alerts', desc: 'แจ้งเตือนเมื่อ metrics ผิดปกติ' },
                        { key: 'creativeAnalysis', label: 'Creative Analysis', desc: 'วิเคราะห์คุณภาพ Ad Creative' },
                        { key: 'trendPrediction', label: 'Trend Prediction', desc: 'ทำนายแนวโน้ม 7 วันล่วงหน้า' },
                        { key: 'autoOptimization', label: 'Auto Optimization', desc: 'ปรับงบอัตโนมัติตาม AI' },
                      ].map((feature) => (
                        <div key={feature.key} className="flex items-center justify-between p-3 rounded-xl bg-surface-2 border border-white/5">
                          <div>
                            <p className="text-sm text-white">{feature.label}</p>
                            <p className="text-xs text-gray-500">{feature.desc}</p>
                          </div>
                          <button
                            onClick={() => setAiSettings({ ...aiSettings, [feature.key]: !aiSettings[feature.key as keyof typeof aiSettings] })}
                            className={cn(
                              'w-10 h-6 rounded-full transition-all relative',
                              aiSettings[feature.key as keyof typeof aiSettings] ? 'bg-accent-glow' : 'bg-surface-4'
                            )}
                          >
                            <div className={cn(
                              'w-4 h-4 rounded-full bg-white absolute top-1 transition-all',
                              aiSettings[feature.key as keyof typeof aiSettings] ? 'left-5' : 'left-1'
                            )} />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="flex justify-end pt-2">
                    <button
                      onClick={() => handleSave('ai', aiSettings)}
                      className="btn-primary text-sm flex items-center gap-2"
                    >
                      <Save className="w-3.5 h-3.5" />
                      บันทึกการตั้งค่า
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'notifications' && (
            <div className="card">
              <h3 className="text-sm font-semibold text-white mb-4">การแจ้งเตือน</h3>
              <div className="space-y-3">
                {[
                  { key: 'aiInsights', label: 'AI Insights ใหม่', desc: 'แจ้งเตือนเมื่อมี insight ที่ severity สูง' },
                  { key: 'budgetAlert', label: 'Budget Alert', desc: 'แจ้งเมื่อใช้งบเกิน 80% ของที่ตั้งไว้' },
                  { key: 'performanceDrop', label: 'Performance Drop', desc: 'แจ้งเมื่อ ROAS ลดลงเกิน 20%' },
                  { key: 'dailySummary', label: 'Daily Summary', desc: 'สรุปประจำวันทาง Email' },
                  { key: 'weeklyReport', label: 'Weekly Report', desc: 'รายงานประจำสัปดาห์' },
                ].map((notif) => (
                  <div key={notif.key} className="flex items-center justify-between p-3 rounded-xl bg-surface-2 border border-white/5">
                    <div>
                      <p className="text-sm text-white">{notif.label}</p>
                      <p className="text-xs text-gray-500">{notif.desc}</p>
                    </div>
                    <button
                      onClick={() => {
                        const updated = { ...notifSettings, [notif.key]: !notifSettings[notif.key as keyof typeof notifSettings] };
                        setNotifSettings(updated);
                        handleSave('notifications', updated);
                      }}
                      className={cn(
                        'w-10 h-6 rounded-full transition-all relative',
                        notifSettings[notif.key as keyof typeof notifSettings] ? 'bg-accent-glow' : 'bg-surface-4'
                      )}
                    >
                      <div className={cn(
                        'w-4 h-4 rounded-full bg-white absolute top-1 transition-all',
                        notifSettings[notif.key as keyof typeof notifSettings] ? 'left-5' : 'left-1'
                      )} />
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
                  <input
                    type="text"
                    className="input-field"
                    placeholder="ชื่อของคุณ"
                    value={accountSettings.name}
                    onChange={(e) => setAccountSettings({ ...accountSettings, name: e.target.value })}
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-400 mb-1.5 block">Email</label>
                  <input
                    type="email"
                    className="input-field"
                    placeholder="email@example.com"
                    value={accountSettings.email}
                    onChange={(e) => setAccountSettings({ ...accountSettings, email: e.target.value })}
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-400 mb-1.5 block">บริษัท</label>
                  <input
                    type="text"
                    className="input-field"
                    placeholder="ชื่อบริษัท"
                    value={accountSettings.company}
                    onChange={(e) => setAccountSettings({ ...accountSettings, company: e.target.value })}
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-400 mb-1.5 block">Timezone</label>
                  <select
                    className="input-field"
                    value={accountSettings.timezone}
                    onChange={(e) => setAccountSettings({ ...accountSettings, timezone: e.target.value })}
                  >
                    <option value="Asia/Bangkok">Asia/Bangkok (GMT+7)</option>
                  </select>
                </div>
                <div className="flex justify-end pt-2">
                  <button
                    onClick={() => handleSave('account', accountSettings)}
                    className="btn-primary text-sm flex items-center gap-2"
                  >
                    <Save className="w-3.5 h-3.5" />
                    บันทึก
                  </button>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'security' && (
            <div className="card">
              <h3 className="text-sm font-semibold text-white mb-4">ความปลอดภัย</h3>
              <div className="space-y-4">
                <div className="p-4 rounded-xl bg-surface-2 border border-white/5">
                  <p className="text-sm text-white mb-1">เปลี่ยนรหัสผ่าน</p>
                  <p className="text-xs text-gray-500">เปลี่ยนรหัสผ่านล่าสุดเมื่อ 30 วันที่แล้ว</p>
                  <button className="btn-ghost text-sm mt-3">เปลี่ยนรหัสผ่าน</button>
                </div>
                <div className="p-4 rounded-xl bg-surface-2 border border-white/5">
                  <p className="text-sm text-white mb-1">Two-Factor Authentication</p>
                  <p className="text-xs text-gray-500">เปิดใช้ 2FA เพื่อความปลอดภัยเพิ่มเติม</p>
                  <button className="btn-primary text-sm mt-3">เปิดใช้งาน 2FA</button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
