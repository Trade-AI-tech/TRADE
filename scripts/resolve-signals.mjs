#!/usr/bin/env node
/**
 * ตัวเก็บผลจริงของสัญญาณ — เดินราคาไปข้างหน้าแล้วปิดบัญชีให้ทุกสัญญาณที่ยังค้าง
 *
 * ทำไมต้องมี: ตาราง signals เดิมบอกได้แค่ว่า "สัญญาณเคยเกิดขึ้น" ไม่มีคอลัมน์ไหน
 * บอกว่ามันถูกหรือผิด ผลคือต่อให้ระบบวิ่งไปอีกปี เจ้าของก็ยังตอบไม่ได้ว่าควรเทรดต่อไหม
 * ไฟล์นี้คือสิ่งที่เปลี่ยน "ความรู้สึก" ให้เป็น "ตัวเลขที่เถียงไม่ได้"
 *
 * ── กติกาที่ฝังอยู่ในตัวเลข (อ่านให้ครบก่อนแก้) ──────────────────────────────────
 *
 * 1. **แท่งเดียวแตะทั้ง SL และ TP → นับ SL เสมอ**
 *    ข้อมูลรายแท่งมีแค่ open/high/low/close บอกไม่ได้ว่าราคาไปแตะอะไรก่อน
 *    การเดาว่า TP มาก่อนคือวิธีที่ backtest ทั่วโลกใช้โกหกเจ้าของมันเอง เราเลือกด้านที่
 *    เจ็บกว่าเสมอ ตัวเลขที่ได้จึงเป็นขอบล่าง ไม่ใช่ค่ากลาง
 *
 * 2. **เริ่มนับจากแท่งที่เปิดหลังเวลาที่สัญญาณเกิดเท่านั้น**
 *    แท่งที่กำลังก่อตัวอยู่ตอนสัญญาณออกถูกข้ามทิ้ง เพราะเรารู้ราคาปิดของมันไม่ได้
 *    ณ เวลาที่ตัดสินใจ การใช้มันคือการมองอนาคต แลกด้วยการอาจพลาดไม้ที่จบในแท่งนั้น
 *
 * 3. **ระยะเสี่ยงใช้ของที่ตั้งใจไว้ตอนออกสัญญาณ** (|entry − stop| จากแถวใน signals)
 *    ไม่ใช่ระยะจริงหลังราคากระโดดข้าม stop — ตรงกับ riskModel:'planned' ใน backtest.ts
 *    ที่เลือกแบบนี้เพราะตัวหารที่เล็กจนเกือบศูนย์ทำให้ R ระเบิดเป็นหลักสิบ และไม้เดียว
 *    ลากค่าเฉลี่ยของทั้งชุดได้ (เคยเจอมาแล้ว: avgR = −9.40 ซึ่งเป็นไปไม่ได้เชิงกายภาพ)
 *
 * 4. **ต้นทุนคิดเป็นสัดส่วนของราคา แล้วแปลงเป็น R**  cost_r = (bps/10000 × entry) ÷ risk
 *    ไม้ที่ตั้ง SL ชิดจึงโดนต้นทุนหนักกว่ามาก — นี่คือกลไกเดียวที่อธิบายผลลบทั้งหมด
 *    ที่งานวิจัยเจอ (ขอบดิบ +0.035 R เทียบต้นทุนเฉลี่ย 0.113 R = ใหญ่กว่ากัน 3.2 เท่า)
 *
 * 5. **realized_r = raw_r − cost_r** ← ตัวเลขนี้ตัวเดียวที่ใช้ตัดสินว่าระบบทำเงินได้ไหม
 *
 * ── สิ่งที่ไฟล์นี้ตอบได้ แต่งานวิจัยตอบไม่ได้ ────────────────────────────────────
 * งานวิจัยทั้งชุดยืนอยู่บนต้นทุน **ประมาณการ** และ lab.mjs เขียนเตือนตัวเองไว้ว่า
 * "ตัวเลขทุกตัวใน COST_BPS คือการประมาณ ไม่ใช่ค่าที่วัดจากใบยืนยันคำสั่งจริง"
 * เมื่อเจ้าของเริ่มเทรดจริงและกรอกต้นทุนที่เกิดขึ้นจริงเข้ามา ไฟล์นี้จะเป็นที่เดียว
 * ที่เทียบได้ว่า "ที่เดาไว้" กับ "ที่จ่ายจริง" ห่างกันแค่ไหน
 *
 * รันเอง:  node scripts/resolve-signals.mjs [--dry-run]
 * ต้องมี:  NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 * ต้องรัน supabase/migrations/007_signal_outcomes.sql ก่อน ไม่งั้นจะข้ามไปเงียบ ๆ
 */

const DRY_RUN = process.argv.includes('--dry-run');

// ═══════════════════════════════ ค่าคงที่ ═══════════════════════════════

/**
 * ค่าธรรมเนียมไป-กลับหน่วย bps — สำเนาของ COST_BPS ใน scripts/research/lab.mjs
 * ⚠ ต้องตรงกันเป๊ะ มี scripts/check-resolver-parity.mjs คอยตรวจให้
 * ⚠ ทุกตัวเป็น "การประมาณ" ไม่ใช่ใบเสร็จจริง — ดูหมายเหตุหัวไฟล์ข้อสุดท้าย
 */
export const COST_BPS = {
  byMarket: { GOLD: 5, FOREX: 1.5, TH_STOCK: 40, US_STOCK: 5, CRYPTO: 25 },
  bySymbol: {
    XAUUSD: 3, XAGUSD: 15, 'PL=F': 12, 'PA=F': 20, 'HG=F': 10,
    EURJPY: 2.5, GBPJPY: 2.5, USDMXN: 3, USDZAR: 5, USDTHB: 15,
    // คู่ไขว้บาท — เดิมไม่มีในตารางจึงตกไปใช้ค่าประจำตลาด 1.5 bps คือ "ถูกกว่า USDTHB
    // สิบเท่า" ทั้งที่มันต้องจ่ายสเปรดสองขา (GBPTHB คือ GBPUSD × USDTHB) จึงต้องแพงกว่า
    // USDTHB เสมอ ไม่ใช่ถูกกว่า · 20 มาจาก USDTHB 15 บวกขาหลักอีก 1.5–5 แล้วปัดขึ้น
    // ⚠ มั่นใจต่ำพอ ๆ กับ USDTHB (ดูหมายเหตุข้างบน) — ต้องถูกแทนด้วยใบยืนยันคำสั่งจริง
    //   ทันทีที่เจ้าของเทรดจริง เพราะสี่ตัวนี้คือ 4 ใน 16 ของจักรวาลค่าเงินที่เหลืออยู่
    EURTHB: 20, JPYTHB: 20, GBPTHB: 20, AUDTHB: 20,
  },
};

/**
 * ถือได้นานสุดกี่แท่งก่อนถือว่าหมดเวลา
 * 1H 24 แท่ง ≈ หนึ่งวันเต็มของตลาดที่เปิด 24 ชม. · 1D 20 แท่ง ≈ หนึ่งเดือนทำการ
 * เลือกให้กว้างไว้ก่อนโดยตั้งใจ เพราะ bars_held ถูกบันทึกไว้ทุกไม้ ใครอยากรู้ว่า
 * "ถ้าตัดจบที่ 5 แท่งจะเป็นยังไง" ก็กรองเอาทีหลังได้ แต่ข้อมูลที่ไม่ได้เก็บ ย้อนไปเก็บไม่ได้
 */
const MAX_HOLD_BARS = { '15m': 96, '1H': 24, '1D': 20 };

/** timeframe → interval/range ของ Yahoo — ต้องตรงกับ scan-universe.mjs */
const TIMEFRAMES = {
  '1D': { interval: '1d', range: '1y' },
  '1H': { interval: '1h', range: '3mo' },
  // Yahoo ให้ 15m ย้อนหลังได้สูงสุด 1 เดือน (ขอมากกว่านั้นตอบ Unprocessable Entity)
  '15m': { interval: '15m', range: '1mo' },
};

const CHART_HOSTS = [
  'https://query1.finance.yahoo.com/v8/finance/chart',
  'https://query2.finance.yahoo.com/v8/finance/chart',
];

// ═══════════════════════════════ ตัวช่วย ═══════════════════════════════

/** สำเนาของ toYahooSymbol ใน src/lib/market-data.ts — check-resolver-parity.mjs ตรวจว่าตรงกัน */
export function toYahooSymbol(symbol, market) {
  const s = String(symbol).trim().toUpperCase();
  if (market === 'GOLD') {
    if (s === 'XAUUSD' || s === 'GOLD') return 'GC=F';
    if (s === 'XAGUSD' || s === 'SILVER') return 'SI=F';
    return s;
  }
  if (market === 'FOREX') return s.endsWith('=X') ? s : `${s}=X`;
  if (market === 'TH_STOCK') return s.endsWith('.BK') ? s : `${s}.BK`;
  if (market === 'CRYPTO') return s.includes('-') ? s : `${s}-USD`;
  return s;
}

export function costBpsFor(symbol, market) {
  const bps = COST_BPS.bySymbol[symbol] ?? COST_BPS.byMarket[market];
  if (bps === undefined) throw new Error(`ไม่มีค่าประมาณต้นทุนสำหรับ ${market}/${symbol}`);
  return bps;
}

/**
 * ด่านตรวจแท่งราคา — สำเนา JS ของ src/lib/candle-sanitizer.ts ปรับรูปให้เข้ากับแท่ง
 * {t,o,h,l,c} ของไฟล์นี้ (ต้นฉบับใช้ {timestamp,open,high,low,close})
 * ⚠ ต้องให้ผลตรงกันเป๊ะ — check-resolver-parity.mjs ป้อนแท่งชุดเดียวกันให้ทั้งสองฝั่ง
 *   แล้วเทียบผลทุกแท่ง แก้กติกาที่นี่โดยไม่แก้ต้นฉบับ = CI แดง
 *
 * ทำไมตัวเก็บผลต้องมีด่านนี้เท่ากับตัวสแกน: แท่ง OHLC ที่นี่คือสิ่งที่ตัดสินว่า SL/TP โดนก่อนหลัง
 * แท่งเสียหนึ่งแท่ง (เช่นระดับวาร์ปไป 7% แบบ EURUSD 2008-02-08) = ไม้นั้นถูกตีตรา "ชน SL"
 * ทั้งที่ราคาจริงไม่เคยไปแตะ → realized_r ผิดโดยไม่มี error และตัวเลขที่เจ้าของใช้ตัดสินใจ
 * เรื่องเงินจะยืนอยู่บนแท่งที่ไม่เคยเกิดขึ้นจริง
 *
 * เกณฑ์ SPIKE_PCT ต่อตลาด: ที่มา/ตัวเลขที่วัดได้อยู่ในคอมเมนต์ของต้นฉบับ candle-sanitizer.ts
 */
export const SPIKE_PCT = {
  GOLD: 0.18,
  FOREX: 0.065,
  TH_STOCK: 0.35,
  US_STOCK: 0.18,
  CRYPTO: 0.5,
};
export const SPIKE_PCT_DEFAULT = 0.5;

export function sanitizeBars(input, market) {
  const spikePct = SPIKE_PCT[market] ?? SPIKE_PCT_DEFAULT;
  const finitePositive = (v) => Number.isFinite(v) && v > 0;

  // ขั้นที่ 1+2 (ตามต้นฉบับ): ทิ้งแท่งที่ไม่ใช่ตัวเลขบวก finite แล้วซ่อมกรอบที่เหลือ
  const framed = [];
  let dropped = 0;
  let repaired = 0;
  for (const b of input) {
    if (!finitePositive(b.o) || !finitePositive(b.h) || !finitePositive(b.l) || !finitePositive(b.c)) {
      dropped++;
      continue;
    }
    const h = Math.max(b.o, b.h, b.c);
    const l = Math.min(b.o, b.l, b.c);
    if (h === b.h && l === b.l) framed.push(b);
    else {
      framed.push({ ...b, h, l });
      repaired++;
    }
  }

  // ขั้นที่ 3+4: interior spike — ทั้งกรอบวาร์ปหนี close ของแท่งที่รอดล่าสุดเกิน SPIKE_PCT
  // แล้วแท่งถัดไปถอยกลับเกินครึ่ง = ระดับผิดทั้งแท่ง · แท่งสุดท้ายห้ามทิ้ง (ไม่มีเพื่อนบ้านขวา)
  const out = [];
  for (let i = 0; i < framed.length; i++) {
    const b = framed[i];
    const isLast = i === framed.length - 1;
    const prevClose = out.length > 0 ? out[out.length - 1].c : NaN;
    if (!isLast && Number.isFinite(prevClose)) {
      const jumpedUp = b.l > prevClose * (1 + spikePct);
      const jumpedDown = b.h < prevClose * (1 - spikePct);
      if (jumpedUp || jumpedDown) {
        const jump = Math.abs(b.c - prevClose);
        if (Math.abs(framed[i + 1].c - prevClose) < jump * 0.5) {
          dropped++;
          continue;
        }
      }
    }
    out.push(b);
  }

  return { bars: out, dropped, repaired };
}

/** ดึงแท่งเทียนจาก Yahoo — คืน [{ t (วินาที), o, h, l, c }] เรียงตามเวลา */
async function fetchCandles(symbol, market, interval, range) {
  const ys = toYahooSymbol(symbol, market);
  for (const host of CHART_HOSTS) {
    try {
      const res = await fetch(`${host}/${encodeURIComponent(ys)}?interval=${interval}&range=${range}`, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
      });
      if (!res.ok) continue;
      const json = await res.json();
      const r = json?.chart?.result?.[0];
      const q = r?.indicators?.quote?.[0];
      if (!r?.timestamp || !q) continue;

      const out = [];
      for (let i = 0; i < r.timestamp.length; i++) {
        const o = q.open?.[i];
        const h = q.high?.[i];
        const l = q.low?.[i];
        const c = q.close?.[i];
        // แท่งที่ Yahoo ส่ง null มา (วันหยุด/ข้อมูลขาด) ต้องทิ้ง ไม่ใช่แทนด้วย 0
        if ([o, h, l, c].some((v) => v === null || v === undefined || !Number.isFinite(v))) continue;
        out.push({ t: r.timestamp[i], o, h, l, c });
      }
      out.sort((a, b) => a.t - b.t);

      // ด่านตรวจแท่ง — ต้อง sort ก่อนเสมอ เพราะกติกา interior spike อาศัยลำดับเวลา
      // ของเพื่อนบ้านซ้าย/ขวา (เหตุผลเต็มอยู่ที่คอมเมนต์ของ sanitizeBars ด้านบน)
      const { bars, dropped, repaired } = sanitizeBars(out, market);
      if (dropped > 0 || repaired > 0) {
        console.log(`  ด่านแท่ง ${symbol} ${interval}: ซ่อมกรอบ ${repaired} · ทิ้งแท่งเสีย ${dropped}`);
      }
      return bars;
    } catch {
      /* ลองโฮสต์ถัดไป */
    }
  }
  return [];
}

// ═══════════════════ หัวใจ: ตัดสินผลของหนึ่งสัญญาณ ═══════════════════

/**
 * @param sig  แถวจากตาราง signals
 * @param bars แท่งเทียนทั้งชุดของ symbol+timeframe นั้น
 * @returns    null = ยังตัดสินไม่ได้ ปล่อยค้างไว้รอบหน้า · หรือ object ที่พร้อมเขียนลงฐานข้อมูล
 */
export function resolveSignal(sig, bars) {
  const entry = Number(sig.entry_price);
  const stop = Number(sig.stop_loss);
  const target = Number(sig.take_profit);
  const isLong = sig.action === 'BUY';

  if (sig.action !== 'BUY' && sig.action !== 'SELL') {
    return { outcome: 'unresolvable', resolve_note: `ทิศทาง ${sig.action} ไม่ใช่ไม้ที่เปิดได้` };
  }
  if (!Number.isFinite(entry) || !Number.isFinite(stop) || !Number.isFinite(target)) {
    return { outcome: 'unresolvable', resolve_note: 'ราคาในแถวไม่ใช่ตัวเลข' };
  }

  const risk = Math.abs(entry - stop);
  // ระยะเสี่ยงเป็นตัวหารของทุกอย่าง ถ้าเกือบศูนย์ R จะระเบิด — ตัดทิ้งดีกว่าให้ตัวเลขหลอก
  if (!(risk > 0) || risk / Math.abs(entry) < 1e-6) {
    return { outcome: 'unresolvable', resolve_note: 'ระยะ SL เป็นศูนย์หรือเล็กจนหารไม่ได้' };
  }

  // ทิศของ SL/TP ต้องสมเหตุสมผลกับทิศของไม้ ไม่งั้นแถวนั้นเสียตั้งแต่ตอนสร้าง
  if (isLong && !(stop < entry && target > entry)) {
    return { outcome: 'unresolvable', resolve_note: 'ไม้ long แต่ SL/TP กลับด้าน' };
  }
  if (!isLong && !(stop > entry && target < entry)) {
    return { outcome: 'unresolvable', resolve_note: 'ไม้ short แต่ SL/TP กลับด้าน' };
  }

  const createdSec = Math.floor(new Date(sig.created_at).getTime() / 1000);
  if (!Number.isFinite(createdSec)) {
    return { outcome: 'unresolvable', resolve_note: 'created_at อ่านไม่ออก' };
  }

  // กติกาข้อ 2 — เอาเฉพาะแท่งที่ "เปิดหลัง" สัญญาณเกิด
  const fwd = bars.filter((b) => b.t > createdSec);
  if (!fwd.length) return null; // ยังไม่มีแท่งใหม่ รอรอบหน้า

  const maxBars = MAX_HOLD_BARS[sig.timeframe] ?? 20;
  const expSec = sig.expires_at ? Math.floor(new Date(sig.expires_at).getTime() / 1000) : null;

  let mfe = -Infinity; // ไปทางเราได้ไกลสุดกี่ R
  let mae = Infinity; //  ไปทางตรงข้ามได้ไกลสุดกี่ R

  const finish = (outcome, exitPrice, barsHeld) => {
    const raw = isLong ? (exitPrice - entry) / risk : (entry - exitPrice) / risk;
    const cost = ((costBpsFor(sig.symbol, sig.market) / 10000) * Math.abs(entry)) / risk;
    const r4 = (n) => Math.round(n * 1e4) / 1e4;
    return {
      outcome,
      exit_price: exitPrice,
      bars_held: barsHeld,
      raw_r: r4(raw),
      cost_r: r4(cost),
      realized_r: r4(raw - cost),
      mfe_r: Number.isFinite(mfe) ? r4(mfe) : null,
      mae_r: Number.isFinite(mae) ? r4(mae) : null,
      resolved_at: new Date(fwd[barsHeld - 1].t * 1000).toISOString(),
      resolve_note: null,
    };
  };

  for (let i = 0; i < fwd.length && i < maxBars; i++) {
    const b = fwd[i];

    const favour = isLong ? (b.h - entry) / risk : (entry - b.l) / risk;
    const adverse = isLong ? (b.l - entry) / risk : (entry - b.h) / risk;
    if (favour > mfe) mfe = favour;
    if (adverse < mae) mae = adverse;

    const hitStop = isLong ? b.l <= stop : b.h >= stop;
    const hitTarget = isLong ? b.h >= target : b.l <= target;

    // กติกาข้อ 1 — SL ชนะเสมอเมื่อแตะทั้งคู่ในแท่งเดียว
    if (hitStop) return finish('sl', stop, i + 1);
    if (hitTarget) return finish('tp', target, i + 1);

    // เคารพ expires_at ถ้าแถวนั้นตั้งไว้ ปิดที่ราคาปิดของแท่งที่หมดอายุพอดี
    if (expSec !== null && b.t >= expSec) return finish('timeout', b.c, i + 1);
  }

  // ยังไม่ครบเพดาน และยังไม่โดนอะไร → ปล่อยค้างไว้ให้รอบหน้าเดินต่อ
  if (fwd.length < maxBars) return null;

  return finish('timeout', fwd[maxBars - 1].c, maxBars);
}

// ═══════════════════════════════ main ═══════════════════════════════

async function main() {
  const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!URL_ || !KEY) {
    console.log('ข้ามตัวเก็บผล — ยังไม่ได้ตั้ง NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY');
    return;
  }
  const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };

  // migration 007 ลงแล้วหรือยัง — ถามด้วยการ select คอลัมน์ตรง ๆ ถูกกว่าอ่าน schema
  const probe = await fetch(`${URL_}/rest/v1/signals?select=id,outcome&limit=1`, { headers: H });
  if (!probe.ok) {
    console.log('⚠ ตาราง signals ยังไม่มีคอลัมน์ผลลัพธ์ — ให้รัน supabase/migrations/007_signal_outcomes.sql ก่อน');
    console.log(`   (${(await probe.text()).slice(0, 160)})`);
    return; // ไม่ใช่ความผิดพลาด แค่ยังไม่พร้อม — อย่าทำให้ CI แดง
  }

  const cols = 'id,symbol,market,action,timeframe,entry_price,stop_loss,take_profit,created_at,expires_at';
  const res = await fetch(
    `${URL_}/rest/v1/signals?select=${cols}&outcome=eq.open&order=created_at.asc&limit=500`,
    { headers: H }
  );
  const open = await res.json();
  if (!Array.isArray(open)) {
    console.log('อ่าน signals ไม่สำเร็จ:', JSON.stringify(open).slice(0, 200));
    process.exitCode = 1;
    return;
  }
  if (!open.length) {
    console.log('ไม่มีสัญญาณค้าง — ไม่มีอะไรให้ปิดบัญชี');
    return;
  }

  // ดึงแท่งเทียนครั้งเดียวต่อ symbol+timeframe แล้วใช้ซ้ำกับทุกสัญญาณของคู่นั้น
  const groups = new Map();
  for (const s of open) {
    const k = `${s.symbol}|${s.market}|${s.timeframe}`;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(s);
  }

  let resolved = 0;
  let stillOpen = 0;
  let failed = 0;
  let fetchFail = 0;
  let unknownTf = 0;
  const tally = { tp: 0, sl: 0, timeout: 0, unresolvable: 0 };
  const rs = [];

  for (const [k, sigs] of groups) {
    const [symbol, market, tf] = k.split('|');
    // ⚠ ห้ามใส่ค่าเริ่มต้นตรงนี้เด็ดขาด
    //
    // เดิมเขียนว่า TIMEFRAMES[tf] ?? TIMEFRAMES['1D'] ซึ่งทำให้สัญญาณ 15m ถูกตัดสิน
    // ด้วยแท่งเทียน "รายวัน" ตอนที่ 15m ถูกเพิ่มเข้าตัวสแกนแต่ยังไม่ได้เพิ่มที่นี่
    // ผลคือไม้ที่ SL ห่าง 1.308% โดน "ชน SL" ทันทีในแท่งแรก เพราะแท่งวันเดียวของทอง
    // แกว่ง 1.999% ขณะที่แท่ง 15m จริงแกว่งแค่ 0.121–0.161% และไม่ชนสักแท่ง
    // ตัวเลขผลงานที่เจ้าของเห็นจึงเป็นของปลอมทั้งชุด โดยไม่มี error ให้ใครเห็นเลย
    //
    // timeframe ที่ไม่รู้จักต้องกลายเป็น unresolvable ที่มีเหตุผลกำกับ ไม่ใช่เดาแล้วเดินต่อ
    const spec = TIMEFRAMES[tf];
    if (!spec) {
      unknownTf += sigs.length;
      console.log(`  ไม่รู้จัก timeframe "${tf}" (${symbol}) — ตีตรา unresolvable แทนการเดา`);
      if (!DRY_RUN) {
        for (const sig of sigs) {
          await fetch(`${URL_}/rest/v1/signals?id=eq.${sig.id}`, {
            method: 'PATCH', headers: { ...H, Prefer: 'return=minimal' },
            body: JSON.stringify({ outcome: 'unresolvable', resolve_note: `ตัวเก็บผลไม่รู้จัก timeframe "${tf}"` }),
          });
        }
      }
      tally.unresolvable += sigs.length;
      continue;
    }
    const bars = await fetchCandles(symbol, market, spec.interval, spec.range);
    if (!bars.length) {
      fetchFail += sigs.length;
      console.log(`  ดึงแท่งเทียนไม่ได้: ${symbol} ${tf} — ปล่อยค้างไว้รอบหน้า`);
      continue;
    }

    for (const sig of sigs) {
      let out;
      try {
        out = resolveSignal(sig, bars);
      } catch (e) {
        failed++;
        console.log(`  ตัดสิน ${sig.symbol} ล้ม: ${e?.message ?? e}`);
        continue;
      }
      if (out === null) {
        stillOpen++;
        continue;
      }

      tally[out.outcome] = (tally[out.outcome] ?? 0) + 1;
      if (Number.isFinite(out.realized_r)) rs.push(out.realized_r);

      if (DRY_RUN) {
        console.log(
          `  [ลองเฉย ๆ] ${sig.symbol} ${sig.action} ${tf} → ${out.outcome} ` +
            `${out.realized_r ?? '—'}R (ดิบ ${out.raw_r ?? '—'} − ต้นทุน ${out.cost_r ?? '—'})`
        );
        resolved++;
        continue;
      }

      const up = await fetch(`${URL_}/rest/v1/signals?id=eq.${sig.id}`, {
        method: 'PATCH',
        headers: { ...H, Prefer: 'return=minimal' },
        body: JSON.stringify(out),
      });
      if (up.ok) {
        resolved++;
      } else {
        failed++;
        console.log(`  เขียนผล ${sig.symbol} ไม่สำเร็จ: ${(await up.text()).slice(0, 120)}`);
      }
    }
  }

  const mean = rs.length ? rs.reduce((a, b) => a + b, 0) / rs.length : null;
  console.log('');
  console.log(
    `ค้างอยู่ ${open.length} · ปิดบัญชีรอบนี้ ${resolved} · ยังไม่ถึงเวลา ${stillOpen} · ` +
      `ดึงราคาไม่ได้ ${fetchFail} · timeframe ไม่รู้จัก ${unknownTf} · ล้ม ${failed}`
  );
  console.log(
    `ผล    แตะเป้า ${tally.tp} · โดนตัดขาดทุน ${tally.sl} · หมดเวลา ${tally.timeout} · ` +
      `ตัดสินไม่ได้ ${tally.unresolvable}`
  );
  if (mean !== null) {
    console.log(
      `R เฉลี่ยหลังหักต้นทุนของรอบนี้ ${mean >= 0 ? '+' : ''}${mean.toFixed(4)} จาก ${rs.length} ไม้ ` +
        `— ⚠ ตัวเลขรอบเดียวไม่ใช่ข้อสรุป ต้องรออย่างน้อยหลายสิบไม้`
    );
  }
}

// ให้ import มาทดสอบได้โดยไม่รัน main (ตัวตรวจ parity ใช้ทางนี้)
if (process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('scripts/resolve-signals.mjs')) {
  main().catch((e) => {
    console.error(e);
    process.exitCode = 1;
  });
}
