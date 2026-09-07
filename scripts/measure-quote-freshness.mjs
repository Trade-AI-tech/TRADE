#!/usr/bin/env node
/**
 * measure-quote-freshness.mjs — วัดว่า Yahoo มีราคาทองใหม่ให้ "จริง ๆ" ถี่แค่ไหน
 *
 * ── ทำไมต้องวัด ────────────────────────────────────────────────────────────────
 * 2026-09-07 เจ้าของรายงานว่า "กราฟไม่วิ่ง ราคาไม่ขยับเลย" · ตรวจตอนนั้นพบว่า
 * meta.regularMarketTime ของ GC=F เก่ากว่าเวลาจริง 10.2 นาที ทั้งที่ตลาดเปิดอยู่
 * แต่นั่นคือ **หนึ่งจุดเวลา ในช่วงเอเชียตอนเช้าที่สภาพคล่องบางที่สุดของวัน**
 * จะเอาไปสรุปว่า "Yahoo ช้า 10 นาที" ไม่ได้ และที่สำคัญกว่าคือมันไม่ตอบคำถามที่
 * ต้องตอบก่อนจ่ายเงินค่า data feed: **ในช่วงที่เจ้าของเทรดจริง มันช้าแค่ไหน**
 *
 * ไฟล์นี้จึงเก็บตัวอย่างจริงกระจายทั้งวัน แล้วสรุปแยกตามช่วงตลาด เพื่อให้การตัดสินใจ
 * เรื่องค่าใช้จ่าย ($19–99/เดือน + ค่าเซิร์ฟเวอร์) ยืนอยู่บนตัวเลข ไม่ใช่ความรู้สึก
 *
 * ── วัดอะไร ───────────────────────────────────────────────────────────────────
 * ทุกครั้งที่ยิง เก็บ regularMarketTime (เวลาที่ราคานั้นเกิดตาม Yahoo) คู่กับเวลาที่เรายิง
 * สองอย่างนี้ให้ตัวเลขคนละความหมาย และต้องดูคู่กัน:
 *   · staleness = เวลาที่ยิง − regularMarketTime   → "ราคาที่ได้เก่าไปแล้วกี่วินาที"
 *   · updateGap = ระยะห่างระหว่าง regularMarketTime สองค่าที่ต่างกัน
 *                                                  → "Yahoo มีราคาใหม่ทุกกี่วินาที"
 * ตัวหลังคือเพดานที่แท้จริงของการเร่งรอบดึง — ยิงถี่กว่า updateGap ได้ค่าเดิมกลับมา
 *
 * ── แบ่งช่วงตลาดยังไง ─────────────────────────────────────────────────────────
 * ใช้เวลาไทย (UTC+7) เพราะเจ้าของอ่านผลเป็นเวลาไทย · ขอบเขตเป็นค่าประมาณของ
 * ช่วงที่สภาพคล่องเปลี่ยนจริง ไม่ใช่เวลาเปิด-ปิดตลาดตามกฎหมาย:
 *   เอเชีย  06:00–14:00 · ลอนดอน 14:00–20:00 · นิวยอร์ก 20:00–04:00 · เงียบ 04:00–06:00
 * ช่วงลอนดอนกับนิวยอร์กทับกัน 20:00–23:00 ซึ่งเป็นช่วงที่ทองแกว่งแรงที่สุด —
 * นับรวมไว้ในนิวยอร์กเพราะเป็นฝั่งที่ครองปริมาณการซื้อขาย
 *
 * ── วิธีใช้ ───────────────────────────────────────────────────────────────────
 *   node scripts/measure-quote-freshness.mjs                 เก็บหนึ่งชุด (ค่าเริ่มต้น 20 ครั้ง × 15 วิ)
 *   node scripts/measure-quote-freshness.mjs --samples=40 --interval=10
 *   node scripts/measure-quote-freshness.mjs --report        อ่านของที่เก็บไว้แล้วสรุป
 *   node scripts/measure-quote-freshness.mjs --self-test
 *
 * ไฟล์ข้อมูล: .research-cache/quote-freshness.jsonl (หนึ่งบรรทัดหนึ่งตัวอย่าง)
 * รูป JSONL เพราะไฟล์นี้โตขึ้นเรื่อย ๆ และถูก commit ทุกวัน — ต่อท้ายได้โดยไม่ต้อง
 * อ่านทั้งไฟล์ และ git diff อ่านรู้เรื่อง (เหตุผลเดียวกับ collect-15m.mjs)
 */

import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, '.research-cache', 'quote-freshness.jsonl');

const YAHOO_SYMBOL = 'GC=F';
const HOSTS = [
  'https://query1.finance.yahoo.com/v8/finance/chart',
  'https://query2.finance.yahoo.com/v8/finance/chart',
];

const argOf = (name, fallback) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};
const has = (name) => process.argv.includes(`--${name}`);

/** ไทยไม่มี DST — บวกตายตัวได้ ผลจึงเท่ากันทุกเครื่อง */
const TH_OFFSET_MS = 7 * 3_600_000;

/**
 * ชื่อช่วงตลาดจาก epoch มิลลิวินาที
 * ขอบเขตอยู่ในคอมเมนต์หัวไฟล์ — แก้ที่นี่ที่เดียว เทสต์อ้างฟังก์ชันนี้ตรง ๆ
 */
export function sessionOf(ms) {
  const h = new Date(ms + TH_OFFSET_MS).getUTCHours();
  if (h >= 6 && h < 14) return 'เอเชีย';
  if (h >= 14 && h < 20) return 'ลอนดอน';
  if (h >= 20 || h < 4) return 'นิวยอร์ก';
  return 'เงียบ';
}

async function fetchMeta() {
  let lastErr = null;
  for (const host of HOSTS) {
    try {
      const res = await fetch(`${host}/${encodeURIComponent(YAHOO_SYMBOL)}?interval=1m&range=1d`, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
      });
      if (!res.ok) {
        // 4xx ที่ไม่ใช่ 429 คือปัญหาถาวร ลองโฮสต์อื่นก็ได้ค่าเดิม
        if (res.status >= 400 && res.status < 500 && res.status !== 429) {
          throw new Error(`HTTP ${res.status} (ถาวร)`);
        }
        lastErr = new Error(`HTTP ${res.status}`);
        continue;
      }
      const j = await res.json();
      const meta = j?.chart?.result?.[0]?.meta;
      if (!meta) throw new Error('คำตอบไม่มี meta');
      return meta;
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr ?? new Error('ดึงไม่สำเร็จ');
}

async function collect() {
  const samples = Number(argOf('samples', '20'));
  const intervalSec = Number(argOf('interval', '15'));
  if (!Number.isFinite(samples) || samples < 1) throw new Error('--samples ต้องเป็นจำนวนบวก');
  if (!Number.isFinite(intervalSec) || intervalSec < 1) throw new Error('--interval ต้องเป็นจำนวนบวก');

  mkdirSync(path.dirname(OUT), { recursive: true });

  console.log(`เก็บ ${samples} ตัวอย่าง ห่างกัน ${intervalSec} วินาที (${YAHOO_SYMBOL})`);
  let written = 0;
  let failed = 0;

  for (let i = 0; i < samples; i++) {
    if (i > 0) await new Promise((r) => setTimeout(r, intervalSec * 1000));
    const at = Date.now();
    try {
      const meta = await fetchMeta();
      const mt = Number(meta.regularMarketTime);
      if (!Number.isFinite(mt) || mt <= 0) {
        failed++;
        continue;
      }
      const row = {
        at: new Date(at).toISOString(),
        marketTime: new Date(mt * 1000).toISOString(),
        stalenessSec: Math.round((at - mt * 1000) / 1000),
        price: Number(meta.regularMarketPrice) || null,
        session: sessionOf(at),
      };
      appendFileSync(OUT, JSON.stringify(row) + '\n', 'utf8');
      written++;
      process.stdout.write(
        `  ${row.at.slice(11, 19)}Z  ราคา ${row.price}  เก่า ${row.stalenessSec} วิ  [${row.session}]\n`
      );
    } catch (err) {
      failed++;
      process.stdout.write(`  ดึงไม่สำเร็จ: ${err.message}\n`);
    }
  }

  console.log(`\nเขียนแล้ว ${written} · ล้มเหลว ${failed} → ${OUT}`);
  // ล้มทั้งชุด = มีปัญหาจริง ต้องให้ CI เห็น ไม่ใช่เงียบ
  if (written === 0) {
    console.error('ไม่ได้ตัวอย่างเลยสักตัว');
    process.exitCode = 1;
  }
}

/** ค่ากลางแบบไม่ต้องพึ่งไลบรารี — อาร์เรย์ต้องเรียงมาแล้ว */
function pct(sorted, p) {
  if (!sorted.length) return null;
  const i = Math.min(sorted.length - 1, Math.max(0, Math.floor((sorted.length - 1) * p)));
  return sorted[i];
}

function report() {
  if (!existsSync(OUT)) {
    console.log('ยังไม่มีข้อมูล — รัน node scripts/measure-quote-freshness.mjs ก่อน');
    return;
  }
  const rows = readFileSync(OUT, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((l) => {
      try {
        return JSON.parse(l);
      } catch {
        return null;
      }
    })
    .filter(Boolean)
    .sort((a, b) => Date.parse(a.at) - Date.parse(b.at));

  if (!rows.length) {
    console.log('ไฟล์มีอยู่แต่อ่านไม่ได้สักบรรทัด');
    return;
  }

  console.log(`\nตัวอย่างทั้งหมด ${rows.length} · ${rows[0].at.slice(0, 16)}Z → ${rows[rows.length - 1].at.slice(0, 16)}Z\n`);

  // ── ราคาที่ได้เก่าไปแล้วกี่วินาที (แยกตามช่วงตลาด) ──────────────────────────
  const bySession = new Map();
  for (const r of rows) {
    if (!bySession.has(r.session)) bySession.set(r.session, []);
    bySession.get(r.session).push(r.stalenessSec);
  }
  console.log('ราคาที่ดึงมาเก่าไปแล้วกี่วินาที (staleness)');
  console.log('  ช่วงตลาด      ตัวอย่าง   ค่ากลาง    p90      สูงสุด');
  for (const name of ['เอเชีย', 'ลอนดอน', 'นิวยอร์ก', 'เงียบ']) {
    const v = (bySession.get(name) ?? []).slice().sort((a, b) => a - b);
    if (!v.length) continue;
    console.log(
      `  ${name.padEnd(12)}${String(v.length).padStart(7)}` +
        `${String(pct(v, 0.5)).padStart(9)} วิ${String(pct(v, 0.9)).padStart(7)} วิ${String(v[v.length - 1]).padStart(8)} วิ`
    );
  }

  // ── Yahoo มีราคาใหม่ให้ทุกกี่วินาที ─────────────────────────────────────────
  // นับจากการเปลี่ยนของ marketTime เท่านั้น — ยิงซ้ำแล้วได้ค่าเดิมไม่ใช่ "อัปเดต"
  const gapsBySession = new Map();
  let prev = null;
  for (const r of rows) {
    const mt = Date.parse(r.marketTime);
    if (prev !== null && mt > prev.mt) {
      const gap = Math.round((mt - prev.mt) / 1000);
      // ข้ามช่องว่างที่ยาวผิดปกติ (ตลาดปิด / เราหยุดเก็บไปเอง) ไม่ใช่จังหวะอัปเดตจริง
      if (gap <= 3600) {
        if (!gapsBySession.has(r.session)) gapsBySession.set(r.session, []);
        gapsBySession.get(r.session).push(gap);
      }
    }
    prev = { mt };
  }
  console.log('\nYahoo มีราคาใหม่ให้ทุกกี่วินาที (update gap)');
  console.log('  ช่วงตลาด      ครั้ง     ค่ากลาง    p90      สูงสุด');
  for (const name of ['เอเชีย', 'ลอนดอน', 'นิวยอร์ก', 'เงียบ']) {
    const v = (gapsBySession.get(name) ?? []).slice().sort((a, b) => a - b);
    if (!v.length) continue;
    console.log(
      `  ${name.padEnd(12)}${String(v.length).padStart(6)}` +
        `${String(pct(v, 0.5)).padStart(10)} วิ${String(pct(v, 0.9)).padStart(7)} วิ${String(v[v.length - 1]).padStart(8)} วิ`
    );
  }

  const allGaps = [...gapsBySession.values()].flat().sort((a, b) => a - b);
  console.log('\nอ่านผลยังไง');
  if (allGaps.length < 30) {
    console.log(`  ⚠ ยังมีข้อมูลน้อย (${allGaps.length} ครั้ง) — เก็บอีกสักวันก่อนใช้ตัดสินใจเรื่องเงิน`);
  } else {
    const med = pct(allGaps, 0.5);
    console.log(`  · ค่ากลางของจังหวะอัปเดตทั้งหมด ${med} วินาที = เพดานที่การเร่งรอบดึงจะช่วยได้`);
    console.log(`    ตั้ง poll ถี่กว่านี้ก็ได้คำตอบเดิมกลับมา ไม่ได้ราคาที่ใหม่ขึ้น`);
    console.log(`  · ถ้าค่ากลางในช่วงที่เทรดจริงยังสูงเกินรับได้ นั่นคือเหตุผลเดียวที่ควรจ่ายค่า data feed`);
    console.log(`    ถ้าไม่ใช่ การจ่ายเงินจะไม่เปลี่ยนอะไรเลย เพราะเพดานไม่ได้อยู่ที่รอบดึงของเรา`);
  }
  console.log('  · ทั้งสองตารางไม่เกี่ยวกับคุณภาพสัญญาณ — ตัวสแกนใช้แท่งที่ปิดแล้วเท่านั้น');
}

function selfTest() {
  let pass = 0;
  let fail = 0;
  const ok = (cond, name) => {
    if (cond) {
      pass++;
      console.log(`  ok   ${name}`);
    } else {
      fail++;
      console.log(`  FAIL ${name}`);
    }
  };

  console.log('sessionOf — ขอบเขตช่วงตลาด (เวลาไทย)');
  const th = (h) => Date.UTC(2026, 8, 7, h - 7, 30, 0); // h = ชั่วโมงไทย
  ok(sessionOf(th(6)) === 'เอเชีย', '06:30 ไทย = เอเชีย');
  ok(sessionOf(th(13)) === 'เอเชีย', '13:30 ไทย = เอเชีย');
  ok(sessionOf(th(14)) === 'ลอนดอน', '14:30 ไทย = ลอนดอน');
  ok(sessionOf(th(19)) === 'ลอนดอน', '19:30 ไทย = ลอนดอน');
  ok(sessionOf(th(20)) === 'นิวยอร์ก', '20:30 ไทย = นิวยอร์ก');
  ok(sessionOf(th(2)) === 'นิวยอร์ก', '02:30 ไทย = นิวยอร์ก (ข้ามเที่ยงคืน)');
  ok(sessionOf(th(4)) === 'เงียบ', '04:30 ไทย = เงียบ');
  ok(sessionOf(th(5)) === 'เงียบ', '05:30 ไทย = เงียบ');

  console.log('\npct — ค่าเปอร์เซ็นไทล์');
  const v = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  ok(pct(v, 0.5) === 5, 'ค่ากลางของ 1..10');
  ok(pct(v, 0.9) === 9, 'p90 ของ 1..10');
  ok(pct([], 0.5) === null, 'อาร์เรย์ว่างคืน null ไม่ใช่ 0');
  ok(pct([7], 0.9) === 7, 'ตัวเดียวคืนตัวนั้น');

  console.log(`\nผ่าน ${pass} · ไม่ผ่าน ${fail}`);
  if (fail > 0) process.exitCode = 1;
}

if (has('self-test')) selfTest();
else if (has('report')) report();
else await collect();
