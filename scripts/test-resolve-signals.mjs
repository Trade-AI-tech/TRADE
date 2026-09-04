#!/usr/bin/env node
/**
 * ชุดทดสอบตัวเก็บผล — สร้างแท่งเทียนขึ้นมาเองเพื่อบังคับให้เกิดทุกกรณีที่ตัดสินยาก
 *
 * ทำไมต้องมี: ตัวเก็บผลเป็นที่เดียวที่แปลง "ราคาที่วิ่งไป" เป็น "ตัวเลขที่เจ้าของใช้
 * ตัดสินใจเรื่องเงินจริง" ถ้ามันเอนเข้าข้างตัวเองแม้แต่นิดเดียว ทุกข้อสรุปหลังจากนั้นพัง
 * และจะพังแบบมองไม่เห็น เพราะตัวเลขจะดูสวยขึ้นเรื่อย ๆ ซึ่งเป็นทิศที่คนอยากเชื่ออยู่แล้ว
 *
 * รัน: node scripts/test-resolve-signals.mjs
 */

import { resolveSignal, costBpsFor, toYahooSymbol } from './resolve-signals.mjs';

let pass = 0;
let fail = 0;

function check(name, got, want) {
  const ok = Math.abs(Number(got) - Number(want)) < 1e-6;
  if (ok) {
    pass++;
  } else {
    fail++;
    console.log(`  ✗ ${name}: ได้ ${got} ควรได้ ${want}`);
  }
}

function checkEq(name, got, want) {
  const ok = got === want;
  if (ok) {
    pass++;
  } else {
    fail++;
    console.log(`  ✗ ${name}: ได้ ${JSON.stringify(got)} ควรได้ ${JSON.stringify(want)}`);
  }
}

const T0 = 1_700_000_000; // เวลาอ้างอิงคงที่ ไม่ใช้ Date.now() เพื่อให้ผลซ้ำได้เสมอ
const HOUR = 3600;

/** สร้างสัญญาณตัวอย่าง — FOREX เพื่อให้ต้นทุนเป็น 1.5 bps ที่คำนวณด้วยมือได้ */
function sig(over = {}) {
  return {
    id: 'x',
    symbol: 'EURUSD',
    market: 'FOREX',
    action: 'BUY',
    timeframe: '1H',
    entry_price: 100,
    stop_loss: 98, // risk = 2
    take_profit: 104, // เป้า = +2R
    created_at: new Date(T0 * 1000).toISOString(),
    expires_at: null,
    ...over,
  };
}

/** แท่งเทียนหลังเวลาสัญญาณ — ตัวแรกเปิดหลัง created_at หนึ่งชั่วโมง */
function bars(list) {
  return list.map((b, i) => ({ t: T0 + (i + 1) * HOUR, o: b[0], h: b[1], l: b[2], c: b[3] }));
}

console.log('── กติกาข้อ 1: แท่งเดียวแตะทั้ง SL และ TP ต้องนับ SL ──');
{
  // แท่งกวาดตั้งแต่ 97 ถึง 105 = ครอบทั้ง stop(98) และ target(104)
  const r = resolveSignal(sig(), bars([[100, 105, 97, 101]]));
  checkEq('ผลต้องเป็น sl ไม่ใช่ tp', r.outcome, 'sl');
  check('raw_r ต้องเป็น −1 พอดี', r.raw_r, -1);
  checkEq('ปิดที่ราคา stop', r.exit_price, 98);
}

console.log('── ไม้ long แตะเป้า ──');
{
  const r = resolveSignal(sig(), bars([[100, 101, 99.5, 100.5], [100.5, 104.5, 100, 104]]));
  checkEq('ผลเป็น tp', r.outcome, 'tp');
  check('raw_r = (104−100)/2 = +2', r.raw_r, 2);
  checkEq('ถือ 2 แท่ง', r.bars_held, 2);
}

console.log('── ไม้ long โดนตัดขาดทุน ──');
{
  const r = resolveSignal(sig(), bars([[100, 100.5, 97.9, 98.2]]));
  checkEq('ผลเป็น sl', r.outcome, 'sl');
  check('raw_r = −1', r.raw_r, -1);
}

console.log('── ไม้ short: SL อยู่เหนือ entry, TP อยู่ใต้ ──');
{
  const s = sig({ action: 'SELL', entry_price: 100, stop_loss: 102, take_profit: 96 });
  const r = resolveSignal(s, bars([[100, 100.5, 95.5, 96]]));
  checkEq('short แตะเป้า', r.outcome, 'tp');
  check('raw_r = (100−96)/2 = +2', r.raw_r, 2);

  const r2 = resolveSignal(s, bars([[100, 102.5, 99, 102]]));
  checkEq('short โดน SL', r2.outcome, 'sl');
  check('raw_r = −1', r2.raw_r, -1);

  const r3 = resolveSignal(s, bars([[100, 103, 95, 99]]));
  checkEq('short แตะทั้งคู่ในแท่งเดียว → sl', r3.outcome, 'sl');
}

console.log('── ต้นทุนต้องคิดเป็นสัดส่วนของระยะเสี่ยง ──');
{
  const r = resolveSignal(sig(), bars([[100, 104.5, 99, 104]]));
  // 1.5 bps ของราคา 100 = 0.015 หน่วยราคา · หารระยะเสี่ยง 2 = 0.0075 R
  check('cost_r = 0.0075', r.cost_r, 0.0075);
  check('realized_r = 2 − 0.0075', r.realized_r, 1.9925);
}
{
  // SL ชิดกว่า 10 เท่า (risk = 0.2) ต้นทุนใน R ต้องหนักขึ้น 10 เท่า
  const s = sig({ stop_loss: 99.8, take_profit: 100.4 });
  const r = resolveSignal(s, bars([[100, 100.5, 99.9, 100.4]]));
  check('SL ชิด → cost_r = 0.075', r.cost_r, 0.075);
}
{
  // ทองใช้ 3 bps ไม่ใช่ 5 ของทั้งกลุ่ม — บั๊กที่เพิ่งแก้ใน th-scalp.mjs คือจุดนี้
  checkEq('XAUUSD ใช้ 3 bps', costBpsFor('XAUUSD', 'GOLD'), 3);
  checkEq('XAGUSD ใช้ 15 bps', costBpsFor('XAGUSD', 'GOLD'), 15);
  checkEq('EURUSD ตกไปที่ค่าตลาด 1.5', costBpsFor('EURUSD', 'FOREX'), 1.5);
  checkEq('USDTHB ใช้ 15 bps', costBpsFor('USDTHB', 'FOREX'), 15);
}

console.log('── กติกาข้อ 2: แท่งก่อน/ตรงเวลาสัญญาณต้องถูกข้าม ──');
{
  const past = [
    { t: T0 - HOUR, o: 100, h: 110, l: 90, c: 100 }, // ถ้านับแท่งนี้จะจบทันทีแบบผิด ๆ
    { t: T0, o: 100, h: 110, l: 90, c: 100 },
    { t: T0 + HOUR, o: 100, h: 101, l: 99.5, c: 100.5 },
  ];
  const r = resolveSignal(sig(), past);
  checkEq('แท่งอดีตไม่ทำให้จบ → ยังค้าง', r, null);
}

console.log('── ยังไม่ครบเพดาน และยังไม่โดนอะไร → ต้องคืน null ──');
{
  const quiet = Array.from({ length: 5 }, () => [100, 100.4, 99.7, 100]);
  checkEq('ปล่อยค้างรอรอบหน้า', resolveSignal(sig(), bars(quiet)), null);
}

console.log('── ครบเพดาน 24 แท่ง (1H) → หมดเวลา ปิดที่ราคาปิด ──');
{
  const quiet = Array.from({ length: 30 }, () => [100, 100.4, 99.7, 100.2]);
  const r = resolveSignal(sig(), bars(quiet));
  checkEq('ผลเป็น timeout', r.outcome, 'timeout');
  checkEq('ถือครบ 24 แท่ง', r.bars_held, 24);
  check('raw_r = (100.2−100)/2 = 0.1', r.raw_r, 0.1);
}

console.log('── เพดานเวลาของ ledger ต้องมาจากนาฬิกาของตัวเอง ไม่ใช่คอลัมน์ expires_at ──');
{
  // แท่ง 1H ที่ห่างกัน 3 ชม. (จำลองตลาดที่มีช่องว่าง) — 24 แท่งกินเวลาจริง 72 ชม.
  // เกินเพดานเวลาของ ledger (1H = 48 ชม.) จึงต้องถูกตัดด้วยเวลา ไม่ใช่ด้วยจำนวนแท่ง
  const sparse = Array.from({ length: 24 }, (_, i) => ({
    t: T0 + (i + 1) * 3 * HOUR, o: 100, h: 100.4, l: 99.7, c: 100.1,
  }));
  const r = resolveSignal(sig(), sparse);
  checkEq('ตัดที่แท่งแรกที่เลย 48 ชม. (แท่งที่ 16)', r.bars_held, 16);
  checkEq('ผลเป็น timeout', r.outcome, 'timeout');
}

console.log('── expires_at บนแถวต้องไม่เปลี่ยนผลที่ ledger บันทึก ──');
{
  // ── บั๊กที่เทสต์นี้มาเฝ้า (พบเมื่อ 2026-09-03) ────────────────────────────────
  // เดิม resolveSignal อ่าน expires_at จากแถวมาใช้เป็นเส้นตัด พอมีคนย่ออายุใบ 15m
  // ลงเหลือ 24 ชม. เพื่อแก้อาการ "ใบค้างบนหน้าเว็บ" ผลที่บันทึกลงสมุดบัญชีก็เปลี่ยนตาม
  // ทันที 11.6% ของใบ ทั้งที่งานนั้นตั้งใจแก้แค่สิ่งที่ตาเห็น
  // ตอนนี้ ledger ใช้ LEDGER_TTL_MS ของตัวเอง คอลัมน์ฝั่งแสดงผลจึงขยับได้อย่างอิสระ
  const quiet = Array.from({ length: 30 }, () => [100, 100.4, 99.7, 100.2]);
  const base = resolveSignal(sig(), bars(quiet));
  for (const exp of [
    new Date((T0 + 1 * HOUR) * 1000).toISOString(), // สั้นกว่าเพดานถือมาก
    new Date((T0 + 3 * HOUR) * 1000).toISOString(),
    new Date((T0 + 9999 * HOUR) * 1000).toISOString(), // ยาวเกินจริง
  ]) {
    const r = resolveSignal(sig({ expires_at: exp }), bars(quiet));
    checkEq(`expires_at=${exp.slice(0, 16)} → bars_held เท่าเดิม`, r.bars_held, base.bars_held);
    checkEq(`expires_at=${exp.slice(0, 16)} → realized_r เท่าเดิม`, r.realized_r, base.realized_r);
  }
}

console.log('── 15m ต้องเดินครบ 96 แท่งได้จริง แม้หน้าต่างจริงจะกินเวลาเกิน 24 ชม. ──');
{
  // ทองหยุดวันละ 60 นาทีและหยุดสุดสัปดาห์ หน้าต่าง 96 แท่งจริงจึงกินเวลา 24.75–73.75 ชม.
  // (วัดจาก .research-cache/candles/GOLD__XAUUSD__15m.json) — จำลองด้วยแท่งที่มีช่องว่าง
  // ให้รวมแล้วเกิน 24 ชม. ถ้าวันไหนมีใครเอา TTL ฝั่งแสดงผล (24 ชม.) กลับมาให้ ledger ใช้
  // เทสต์นี้จะจับได้ทันที เพราะ bars_held จะร่วงจาก 96 ลงมาเหลือหลักสิบ
  const MIN15 = 900;
  let t = T0;
  const goldish = Array.from({ length: 96 }, (_, i) => {
    t += MIN15 + (i % 24 === 23 ? 3600 : 0); // แทรกช่องว่างพักตลาดทุก ๆ 24 แท่ง
    return { t, o: 100, h: 100.4, l: 99.7, c: 100.2 };
  });
  const spanH = (goldish[95].t - goldish[0].t) / 3600;
  check('หน้าต่างจำลองกินเวลาเกิน 24 ชม. จริง', spanH > 24 ? 1 : 0, 1);
  const r = resolveSignal(sig({ timeframe: '15m' }), goldish);
  checkEq('ถือครบเพดาน 96 แท่ง', r.bars_held, 96);
  checkEq('ผลเป็น timeout', r.outcome, 'timeout');
}

console.log('── MFE/MAE ต้องวัดจากไส้เทียน ไม่ใช่ราคาปิด ──');
{
  const r = resolveSignal(sig(), bars([[100, 103, 98.5, 100], Array(4).fill(0).map(() => 0) && [100, 104.5, 99, 104]]));
  check('MFE = (104.5−100)/2 = 2.25', r.mfe_r, 2.25);
  check('MAE = (98.5−100)/2 = −0.75', r.mae_r, -0.75);
}

console.log('── แถวที่เสียต้องถูกตีตรา ไม่ใช่คิดตัวเลขมั่ว ──');
{
  checkEq('SL/TP กลับด้าน', resolveSignal(sig({ stop_loss: 102 }), bars([[100, 101, 99, 100]])).outcome, 'unresolvable');
  checkEq('ระยะเสี่ยงศูนย์', resolveSignal(sig({ stop_loss: 100 }), bars([[100, 101, 99, 100]])).outcome, 'unresolvable');
  checkEq('ทิศทาง HOLD', resolveSignal(sig({ action: 'HOLD' }), bars([[100, 101, 99, 100]])).outcome, 'unresolvable');
  checkEq('ราคาไม่ใช่ตัวเลข', resolveSignal(sig({ entry_price: null }), bars([[100, 101, 99, 100]])).outcome, 'unresolvable');
}

console.log('── การแปลงชื่อ symbol ต้องตรงกับ market-data.ts ──');
{
  checkEq('XAUUSD → GC=F', toYahooSymbol('XAUUSD', 'GOLD'), 'GC=F');
  checkEq('XAGUSD → SI=F', toYahooSymbol('XAGUSD', 'GOLD'), 'SI=F');
  checkEq('EURUSD → EURUSD=X', toYahooSymbol('EURUSD', 'FOREX'), 'EURUSD=X');
  checkEq('PTT → PTT.BK', toYahooSymbol('PTT', 'TH_STOCK'), 'PTT.BK');
}


// ── ตัวสแกนกับตัวเก็บผลต้องรู้จัก timeframe ชุดเดียวกัน ──────────────────────
//
// บั๊กที่เทสต์นี้มาดัก (เกิดจริงเมื่อ 2026-08-26): 15m ถูกเพิ่มเข้า scan-universe.mjs
// แต่ไม่ได้เพิ่มใน resolve-signals.mjs ซึ่งตอนนั้นมี `TIMEFRAMES[tf] ?? TIMEFRAMES['1D']`
// สัญญาณ 15m จึงถูกตัดสินด้วยแท่งรายวัน ไม้ที่ SL ห่าง 1.308% ถูกบันทึกว่า "ชน SL"
// ทันทีในแท่งแรก เพราะแท่งวันเดียวของทองแกว่ง 1.999% ขณะที่แท่ง 15m จริงแกว่ง 0.12–0.16%
// หน้าผลงานจึงแสดง −0.79 R/ไม้ ซึ่งเป็นของปลอมทั้งชุด และไม่มี error ให้ใครเห็น
console.log('── ตัวสแกนกับตัวเก็บผลต้องครอบ timeframe เดียวกัน ──');
{
  const fs = await import('node:fs');
  const pathMod = await import('node:path');
  const url = await import('node:url');
  const ROOT = pathMod.resolve(pathMod.dirname(url.fileURLToPath(import.meta.url)), '..');

  /** ดึงคีย์ของ const TIMEFRAMES = { ... } ออกจากซอร์สโดยไม่ต้อง import ทั้งไฟล์ */
  const tfKeys = (rel) => {
    const src = fs.readFileSync(pathMod.join(ROOT, rel), 'utf8');
    const m = /const TIMEFRAMES = \{([\s\S]*?)\n\};/.exec(src);
    if (!m) throw new Error(`หา TIMEFRAMES ใน ${rel} ไม่เจอ`);
    return [...m[1].matchAll(/^\s*'([^']+)':/gm)].map((x) => x[1]);
  };

  const scanner = tfKeys('scripts/scan-universe.mjs').sort();
  const resolver = tfKeys('scripts/resolve-signals.mjs').sort();
  checkEq('timeframe ของตัวเก็บผลครอบของตัวสแกนครบ', resolver.join(','), scanner.join(','));

  // เพดานการถือต้องมีครบทุก timeframe ด้วย ไม่งั้นจะตกไปใช้ค่าเริ่มต้นเงียบ ๆ อีกแบบ
  const src = fs.readFileSync(pathMod.join(ROOT, 'scripts/resolve-signals.mjs'), 'utf8');
  const hold = /const MAX_HOLD_BARS = \{([^}]*)\}/.exec(src);
  const holdKeys = [...hold[1].matchAll(/'([^']+)':/g)].map((x) => x[1]).sort();
  checkEq('เพดานการถือมีครบทุก timeframe', holdKeys.join(','), scanner.join(','));
}

console.log('');
console.log(`ผ่าน ${pass} · ไม่ผ่าน ${fail}`);
if (fail > 0) process.exitCode = 1;
