#!/usr/bin/env node
/**
 * ชุดทดสอบด่านตลาดปิด / ด่านแท่งค้าง / กันซ้ำตามเนื้อหา (src/lib/market-session.ts)
 * และการเสียบเข้าตัวสแกนจริง (scripts/scan-universe.mjs)
 *
 * ทำไมต้องมี: เจ้าของรายงาน 2026-09-14 ว่าวันหยุดทองไม่วิ่งก็มีแจ้งเตือน — วัดแล้วคือใบ 15m BUY
 * เดียวกันเป๊ะเด้ง 9 ครั้งตลอดสุดสัปดาห์ 12-13 ก.ย. บั๊กแบบนี้ไม่มี error ให้เห็น ตัวสแกนเขียว
 * ทุกรอบ ด่านจึงต้องมีเทสต์ที่พิสูจน์สามทาง:
 *   1. กติกาถูก — เคสขอบทุกกิ่ง
 *   2. เกณฑ์ถูกกับของจริง — เล่นซ้ำตัวอย่างความสดของราคา 4,088 ตัวที่เก็บจริงทั้งสัปดาห์
 *      และเวลาของ 9 ใบซ้ำที่เกิดจริงในฐานข้อมูล
 *   3. ด่าน "เสียบอยู่จริง" ในตัวสแกน — ถอดออกเมื่อไหร่เทสต์นี้ต้องแดง
 *
 * รัน: node scripts/test-market-session.mjs
 */

import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { loadSrcModules, ROOT } from './research/load-src-modules.mjs';

const mods = await loadSrcModules(['src/lib/market-session.ts']);
const {
  marketSessionState, intradayBarIsCurrent, sameSetupKey,
  MARKET_CLOSED_AFTER_SEC, SAME_SETUP_LOOKBACK_HOURS,
} = mods['market-session'];

let pass = 0, fail = 0;
const t = (name, ok, detail = '') => {
  if (ok) pass++;
  else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`); }
};
const sec = (iso) => Date.parse(iso) / 1000;

console.log('ทดสอบด่านตลาดปิด · ด่านแท่งค้าง · กันซ้ำตามเนื้อหา\n');

// ─────────────────────────── ๑. marketSessionState — กติกา ───────────────────────────
{
  const now = Date.parse('2026-09-14T06:10:00Z');
  const v = marketSessionState(now, [sec('2026-09-14T06:00:00Z')]);
  t('๑ ราคาเก่า 10 นาที = ตลาดเปิด', v.open && v.state === 'fresh' && v.staleSec === 600, JSON.stringify(v));

  const c = marketSessionState(now, [sec('2026-09-14T05:39:00Z')]);
  t('๑ ราคาเก่า 31 นาที = ตลาดปิด', !c.open && c.state === 'closed', JSON.stringify(c));

  const edge = marketSessionState(now, [now / 1000 - MARKET_CLOSED_AFTER_SEC]);
  t('๑ เก่าเท่าเกณฑ์พอดียังนับว่าเปิด (> ไม่ใช่ >=)', edge.open, JSON.stringify(edge));

  const u = marketSessionState(now, [null, undefined, NaN, 0, -5]);
  t('๑ ไม่รู้เวลาเลย = ปล่อยผ่าน และบอกว่า unknown', u.open && u.state === 'unknown' && u.staleSec === null, JSON.stringify(u));
  t('๑ อาร์เรย์ว่าง = unknown', marketSessionState(now, []).state === 'unknown');

  const newest = marketSessionState(now, [sec('2026-09-11T20:59:00Z'), sec('2026-09-14T06:05:00Z'), null]);
  t('๑ ใช้เวลาที่ใหม่สุดจากทุกคำขอ', newest.open && newest.staleSec === 300, JSON.stringify(newest));

  const skew = marketSessionState(now, [now / 1000 + 20]);
  t('๑ นาฬิกาเครื่องช้ากว่า Yahoo (อายุติดลบ) = 0 ไม่ใช่ปิด', skew.open && skew.staleSec === 0, JSON.stringify(skew));
}

// ─────────── ๒. เกณฑ์ถูกกับของจริง — เล่นซ้ำตัวอย่างความสดที่เก็บจริงทั้งสัปดาห์ ───────────
//
// ทุกตัวอย่างมี at (เวลาที่ถาม) กับ marketTime (เวลาซื้อขายล่าสุดที่ Yahoo ตอบ)
// จึงป้อนเข้าด่านได้ตรง ๆ แบบเดียวกับที่ตัวสแกนจะเห็น
{
  const file = path.join(ROOT, '.research-cache', 'quote-freshness.jsonl');
  if (!existsSync(file)) {
    console.log('  … ข้ามด่าน ๒ (ไม่มีไฟล์ตัวอย่างความสด)');
  } else {
    // ตรึงช่วงไว้ที่ข้อมูลชุดที่ใช้ตั้งเกณฑ์จริง (7-14 ก.ย. 2026) — ไฟล์นี้ยังโตทุกครึ่งชั่วโมง
    // ถ้าอ่านทั้งไฟล์ วันหยุดสหรัฐครั้งหน้า (Thanksgiving/คริสต์มาส) จะทำให้ "วันทำการปกติ"
    // มีตัวอย่างที่ราคาเก่าเกินเกณฑ์ แล้ว CI แดงทั้งที่ไม่มีใครแก้โค้ด — ความแดงที่ไม่ได้บอกอะไร
    const MEASURED_UNTIL = Date.parse('2026-09-14T06:00:00Z');
    const rows = readFileSync(file, 'utf8').trim().split('\n').map((l) => JSON.parse(l))
      .filter((r) => r.at && r.marketTime && Date.parse(r.at) < MEASURED_UNTIL);
    const d = (iso) => new Date(iso);
    // ตลาดทอง COMEX ช่วงเวลาออมแสง: ปิด ศ 21:00Z → อา 22:00Z · พักรายวัน 21:00–22:00Z
    const weekendClosed = (x) => {
      const dw = x.getUTCDay(), h = x.getUTCHours() + x.getUTCMinutes() / 60;
      return (dw === 5 && h >= 21) || dw === 6 || (dw === 0 && h < 22);
    };
    const dailyBreak = (x) => { const h = x.getUTCHours() + x.getUTCMinutes() / 60; return h >= 21 && h < 22; };
    // จ 7 ก.ย. 2026 = Labor Day ของสหรัฐ CME ปิดเร็ว — วันทำการที่ไม่ปกติ ไม่นับในกลุ่ม "วันปกติ"
    const laborDay = (x) => x >= Date.parse('2026-09-06T22:00:00Z') && x < Date.parse('2026-09-07T22:00:00Z');

    const verdict = (r) => marketSessionState(Date.parse(r.at), [sec(r.marketTime)]);
    const normal = rows.filter((r) => { const x = d(r.at); return !weekendClosed(x) && !dailyBreak(x) && !laborDay(x); });
    const wrongClosed = normal.filter((r) => !verdict(r).open);
    t(`๒ วันทำการปกติ ${normal.length} ตัวอย่าง — ไม่มีตัวไหนถูกนับว่าตลาดปิด`,
      normal.length > 1000 && wrongClosed.length === 0,
      `ถูกนับผิด ${wrongClosed.length} ตัว เช่น ${wrongClosed.slice(0, 2).map((r) => r.at).join(', ')}`);

    // สุดสัปดาห์: หลังปิดตลาดเกินเกณฑ์ไปแล้ว (ศ 21:00Z + ความหน่วงของ Yahoo + เกณฑ์) ต้องปิดทุกตัว
    const deepWeekend = rows.filter((r) => {
      const x = d(r.at);
      if (!weekendClosed(x)) return false;
      const sinceClose = (x - Date.parse(r.at.slice(0, 10) + 'T21:00:00Z')) / 1000;
      return x.getUTCDay() !== 5 || sinceClose > MARKET_CLOSED_AFTER_SEC + 15 * 60;
    });
    const leaked = deepWeekend.filter((r) => verdict(r).open);
    t(`๒ สุดสัปดาห์ ${deepWeekend.length} ตัวอย่าง (หลังปิดเกิน 45 นาที) — ถูกนับว่าปิดทุกตัว`,
      deepWeekend.length > 500 && leaked.length === 0,
      `หลุดว่าเปิด ${leaked.length} ตัว เช่น ${leaked.slice(0, 2).map((r) => `${r.at} (${r.stalenessSec} วิ)`).join(', ')}`);

    // Labor Day — วันหยุดต้องถูกจับด้วยกติกาเดียวกัน ไม่ต้องมีปฏิทินวันหยุด
    const laborLate = rows.filter((r) => laborDay(d(r.at)) && r.stalenessSec > 3600);
    t('๒ Labor Day ช่วงที่ไม่มีการซื้อขาย ถูกนับว่าปิดทุกตัวโดยไม่ต้องมีปฏิทินวันหยุด',
      laborLate.length > 0 && laborLate.every((r) => !verdict(r).open),
      `ตัวอย่าง ${laborLate.length} ตัว`);
  }
}

// ─────────── ๓. เวลาจริงของ 9 ใบซ้ำในฐานข้อมูล (สุดสัปดาห์ 12-13 ก.ย. 2026) ───────────
//
// ตัวเลขทั้งหมดคัดลอกจากแถวจริงในตาราง signals (อ่านอย่างเดียว 2026-09-14)
// เวลาซื้อขายล่าสุดของ GC=F ตลอดสุดสัปดาห์นั้นค้างอยู่ที่ศุกร์ก่อนปิดตลาด
const WEEKEND_DUPES = [
  '2026-09-12T08:44:28Z', '2026-09-12T12:46:19Z', '2026-09-12T16:55:34Z', '2026-09-12T20:58:00Z',
  '2026-09-13T01:16:11Z', '2026-09-13T05:16:43Z', '2026-09-13T10:05:03Z', '2026-09-13T14:17:02Z',
  '2026-09-13T18:21:16Z',
];
const FRIDAY_LAST_TRADE = sec('2026-09-11T20:59:58Z');
{
  const blocked = WEEKEND_DUPES.filter((iso) => !marketSessionState(Date.parse(iso), [FRIDAY_LAST_TRADE]).open);
  t('๓ ทั้ง 9 เวลาที่ใบซ้ำเด้งจริง ด่านตลาดปิดกันได้ครบ', blocked.length === 9, `กันได้ ${blocked.length}/9`);

  // negative control — กติกากันซ้ำแบบเดิม (จำด้วยนาฬิกา 4 ชม.) ปล่อยผ่านกี่ใบจากเวลาชุดเดียวกัน
  // ถ้าตัวนี้ไม่ได้ 9 แปลว่าเทสต์ไม่ได้จำลองบั๊กที่เกิดจริง และข้อ ๓ ด้านบนก็พิสูจน์อะไรไม่ได้
  let lastAccepted = -Infinity, oldRuleAccepted = 0;
  for (const iso of WEEKEND_DUPES) {
    const ms = Date.parse(iso);
    if (ms - lastAccepted >= 4 * 3600_000) { oldRuleAccepted++; lastAccepted = ms; }
  }
  t('๓ negative control — กติกาเดิม (หน้าต่าง 4 ชม.) ปล่อยผ่านครบ 9 ใบเหมือนที่เกิดจริง',
    oldRuleAccepted === 9, `ปล่อยผ่าน ${oldRuleAccepted}`);
}

// ─────────────────────────── ๔. intradayBarIsCurrent ───────────────────────────
{
  // วัดจริง 2026-09-14 06:11Z ตลาดเปิด: 15m แท่งปิดล่าสุด 05:45Z · ซื้อขายล่าสุด 06:01Z
  t('๔ ของจริงตอนตลาดเปิด (15m ห่าง 0.03 ชม.) = แท่งปัจจุบัน',
    intradayBarIsCurrent(sec('2026-09-14T05:45:00Z'), 900, sec('2026-09-14T06:01:48Z')));
  t('๔ ของจริงตอนตลาดเปิด (1H แท่ง 05:00Z) = แท่งปัจจุบัน',
    intradayBarIsCurrent(sec('2026-09-14T05:00:00Z'), 3600, sec('2026-09-14T06:01:48Z')));

  // ตลาดเพิ่งเปิดคืนวันอาทิตย์ — เวลาซื้อขายสดแล้ว แต่แท่งปิดใบสุดท้ายยังเป็นศุกร์
  t('๔ ตลาดเพิ่งเปิดอาทิตย์ 22:04Z แต่แท่ง 15m ล่าสุดคือศุกร์ 20:45Z = แท่งค้าง',
    !intradayBarIsCurrent(sec('2026-09-11T20:45:00Z'), 900, sec('2026-09-13T22:04:00Z')));
  t('๔ ตลาดเพิ่งเปิดอาทิตย์ แท่ง 1H ล่าสุดคือศุกร์ 20:00Z = แท่งค้าง',
    !intradayBarIsCurrent(sec('2026-09-11T20:00:00Z'), 3600, sec('2026-09-13T22:04:00Z')));

  // ขอบของเกณฑ์ 2 แท่ง
  t('๔ ห่าง 2 แท่งพอดียังเป็นแท่งปัจจุบัน', intradayBarIsCurrent(0, 900, 900 + 1800));
  t('๔ ห่างเกิน 2 แท่ง = แท่งค้าง', !intradayBarIsCurrent(0, 900, 900 + 1801));
  t('๔ ไม่รู้เวลาซื้อขาย = ปล่อยผ่าน (ด่านตลาดปิดรายงาน unknown ไว้แล้ว)', intradayBarIsCurrent(0, 900, null));
  t('๔ ข้อมูลแท่งพัง = ปล่อยผ่าน ไม่ระเบิด', intradayBarIsCurrent(NaN, 900, 12345));
}

// ─────────────────────────── ๕. sameSetupKey ───────────────────────────
{
  const user = '00000000-0000-0000-0000-000000000001';
  // แถวจากตาราง (numeric มาเป็นข้อความหรือเลข 4 ตำแหน่ง) กับใบในหน่วยความจำ (float เต็ม)
  const dbRow = { user_id: user, symbol: 'XAUUSD', timeframe: '15m', action: 'BUY', entry_price: '4408.8999', stop_loss: 4371.3333, take_profit: '4484.0331' };
  const fresh = { user_id: user, symbol: 'xauusd', timeframe: '15m', action: 'BUY', entry_price: 4408.89990234375, stop_loss: 4371.333333333333, take_profit: 4484.033066666667 };
  const kDb = sameSetupKey(dbRow), kFresh = sameSetupKey(fresh);
  t('๕ แถวจากตารางกับใบในหน่วยความจำที่มาจากแท่งเดียวกัน ได้กุญแจเดียวกัน', kDb !== null && kDb === kFresh, `${kDb} vs ${kFresh}`);
  t('๕ ต่าง timeframe = คนละเซ็ตอัพ', sameSetupKey({ ...fresh, timeframe: '1H' }) !== kFresh);
  t('๕ ต่างทิศ = คนละเซ็ตอัพ', sameSetupKey({ ...fresh, action: 'SELL' }) !== kFresh);
  t('๕ ต่างผู้รับ = คนละเซ็ตอัพ', sameSetupKey({ ...fresh, user_id: 'other' }) !== kFresh);
  t('๕ ราคาเข้าต่างกันแค่ 0.001 = คนละเซ็ตอัพ', sameSetupKey({ ...fresh, entry_price: 4408.9009 }) !== kFresh);
  t('๕ ตัวเลขพัง = null (ไม่เอาไปกันซ้ำ)', sameSetupKey({ ...fresh, stop_loss: null }) === null || sameSetupKey({ ...fresh, stop_loss: 'abc' }) === null);
  t('๕ หน้าต่างย้อนหลังครอบอายุใบยาวสุด 7 วัน', SAME_SETUP_LOOKBACK_HOURS === 168);

  // ใบซ้ำ 9 ใบจริงได้กุญแจเดียวกันหมด → กติกาใหม่ปล่อยผ่านแค่ใบแรก
  const keys = new Set(WEEKEND_DUPES.map(() => sameSetupKey(dbRow)));
  t('๕ ใบซ้ำ 9 ใบจริงได้กุญแจเดียวกันทั้งหมด', keys.size === 1);
}

// ─────────────── ๖. ด่าน "เสียบอยู่จริง" ในตัวสแกน — ถอดออกเมื่อไหร่ต้องแดง ───────────────
{
  const src = readFileSync(path.join(ROOT, 'scripts', 'scan-universe.mjs'), 'utf8');
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');

  t('๖ ตัวสแกนโหลด market-session.ts', /session:\s*path\.join\(ROOT, 'src', 'lib', 'market-session\.ts'\)/.test(code));
  t('๖ เก็บเวลาซื้อขายล่าสุดจากทุกคำขอ', /job\.marketTimeSec\s*=\s*chart\.marketTimeSec/.test(code));

  const gateAt = code.indexOf('lib.marketSessionState(');
  const closedSkipAt = code.indexOf('if (!session.open)');
  const engineAt = code.indexOf('lib.generateSignal(');
  t('๖ ถามด่านตลาดปิดก่อนเรียกเครื่องยนต์', gateAt > 0 && engineAt > 0 && gateAt < engineAt, `ด่าน ${gateAt} · เครื่องยนต์ ${engineAt}`);
  t('๖ ตลาดปิดแล้วข้ามก่อนถึงเครื่องยนต์ (ไม่ใช่กรองทีหลัง)', closedSkipAt > 0 && closedSkipAt < engineAt);

  const staleAt = code.indexOf('lib.intradayBarIsCurrent(');
  t('๖ ด่านแท่งค้างอยู่ก่อนเครื่องยนต์ และยกเว้น 1D', staleAt > 0 && staleAt < engineAt && /tf !== '1D'/.test(code.slice(closedSkipAt, engineAt)));

  // ราคาต้องยังถูกเก็บในลูปดึงข้อมูล (ก่อนด่าน) — ไม่งั้น scan-health จะขึ้นว่าตัวสแกนตายทุกสุดสัปดาห์
  const quotesAt = code.indexOf('quotes.push(chart.quote)');
  t('๖ ราคายังถูกเก็บก่อนด่านตลาดปิด (scan-health ไม่เตือนผิดตอนสุดสัปดาห์)', quotesAt > 0 && quotesAt < gateAt);

  const dedupeFilterAt = code.indexOf('const notDuplicate');
  const setupCheckAt = code.indexOf('seenSetups.has(', dedupeFilterAt);
  const selectAt = code.indexOf('lib.selectSignals(', dedupeFilterAt);
  t('๖ กันซ้ำตามเนื้อหาอยู่ในตัวกรองก่อนเข้าประตูคุณภาพ', dedupeFilterAt > 0 && setupCheckAt > dedupeFilterAt && setupCheckAt < selectAt);
  t('๖ query กันซ้ำตามเนื้อหาไม่กรอง status (ใบซ้ำจริงถูกปั๊มเป็น triggered ไปแล้ว)',
    (() => { const q = code.slice(code.indexOf('SAME_SETUP_LOOKBACK_HOURS * 3600_000'), code.indexOf('seenSetups.add(key)')); return q.length > 0 && !/\.eq\('status'/.test(q); })());
  t('๖ log บอกทั้งจำนวนที่ด่านข้ามและเวลาซื้อขายล่าสุดทุกรอบ', /ตลาดปิดข้าม \$\{sessionSkips\.closed\}/.test(code) && /เซ็ตอัพเดิมเป๊ะข้าม \$\{sameSetupSkipped\}/.test(code));
}

console.log(`\nผ่าน ${pass} · ตก ${fail}`);
process.exit(fail ? 1 : 0);
