#!/usr/bin/env node
/**
 * check-lab-parity.mjs — พิสูจน์ว่า scripts/research/engine-lab.mjs ที่ config เริ่มต้น
 * ให้ผล "เหมือน src/lib/signal-engine.ts ทุกฟิลด์"
 *
 * วิธีรัน
 *   npm run lab:parity
 *   node scripts/research/check-lab-parity.mjs
 *   node scripts/research/check-lab-parity.mjs --cases=5000     เพิ่มจำนวนเคสสุ่ม
 *   node scripts/research/check-lab-parity.mjs --seed=12345      เปลี่ยน seed (ค่าปกติคงที่)
 *   node scripts/research/check-lab-parity.mjs --case=R0042      รันเคสเดียวแล้วดัมพ์ผลทั้งสองฝั่ง
 *   node scripts/research/check-lab-parity.mjs --show=all        พิมพ์รายละเอียดทุกเคสที่ต่าง
 *
 * ทำไมไฟล์นี้สำคัญกว่าตัวเครื่องยนต์เอง
 *   engine-lab.mjs มีไว้ทดลองปรับค่า ถ้าสำเนาเพี้ยนจากต้นฉบับแม้แต่นิดเดียว
 *   ทุกข้อสรุปหลังจากนั้น (กฎไหนช่วย กฎไหนทำร้าย ปรับ threshold แล้วดีขึ้นไหม)
 *   จะเป็นการวัดของผิดตัว — ดูเหมือนวิทยาศาสตร์แต่ไม่ใช่
 *
 * ตรวจ 3 ชั้น
 *   ชั้นที่ 1  config เริ่มต้นต้องไม่ต่างจาก DEFAULT_CONFIG เลย (กันคนแอบแก้ค่าเริ่มต้น)
 *   ชั้นที่ 2  ผลลัพธ์ทุกฟิลด์ต้องตรงกันบนเคสออกแบบเอง + เคสสุ่ม >= 2000 ชุด
 *   ชั้นที่ 3  "ปุ่มปรับได้จริง" — บิด config แล้วผลต้องเปลี่ยน
 *             ถ้าไม่มีชั้นนี้ สำเนาที่เมิน config ทิ้งทั้งก้อนก็สอบผ่านชั้นที่ 2 ได้สบาย ๆ
 *
 * ฟิลด์ที่ยกเว้นอย่างชัดแจ้ง (และเหตุผล)
 *   id          — uuid สุ่มใหม่ทุกครั้ง จึงตรวจแค่ว่าทั้งสองฝั่งเป็น uuid v4 จริง
 *   created_at  — ประทับเวลา ณ ตอนรัน ยอมให้ต่างได้ไม่เกิน 5 วินาที
 *   expires_at  — เหตุผลเดียวกัน แต่เพิ่มการตรวจ "อายุสัญญาณ" (expires_at − created_at)
 *                 ว่าต่างกันไม่เกิน 2 วินาที เพื่อให้ยังจับได้ถ้าสำเนาใช้ TTL ผิด (48 ชม. vs 7 วัน)
 *   ไม่มีฟิลด์อื่นถูกยกเว้น
 *
 * ─────────────────── ตัวตรวจนี้ถูกตรวจแล้วว่า "จับได้จริง" ───────────────────
 *
 * ตัวตรวจที่ไม่เคยแดงเลย อาจแปลว่าโค้ดถูก หรืออาจแปลว่ามันตาบอด แยกไม่ออกถ้าไม่ทดลอง
 * จึงเคยบิดสำเนาทีละจุด (mutation test) แล้ววัดว่าสอบตกไหม ผลที่วัดได้ (corpus 530 เคส):
 *
 *   จับได้ 21 เคส   เกณฑ์ตัดสิน BUY เปลี่ยน >= เป็น >
 *   จับได้  5 เคส   reasons.slice(0,5) เป็น slice(0,4)
 *   จับได้ 92 เคส   TTL ของ 1H จาก 48 เป็น 72 ชั่วโมง
 *   จับได้  1 เคส   ถอดเพดาน confidence 95
 *   จับได้ 260 เคส  น้ำหนัก RSI zone 0.2 เป็น 0.25
 *   จับได้ 84 เคส   คะแนน trend ตอนไม่มี MA200 จาก 1 เป็น 2
 *   จับได้ 115 เคส  เลขนัยสำคัญราคาต่ำ 6 เป็น 4 (บั๊ก meme coin เดิม)
 *   จับได้  2 เคส   ตัวคูณ SL 1.5 เป็น 1.4999999
 *   จับได้ 81 เคส   ระยะแนวรับ/ต้าน 0.015 เป็น 0.0151
 *   จับได้ 29 เคส   เกณฑ์ขั้นต่ำ 50 แท่ง เป็น 49
 *
 * ข้อจำกัดที่รู้ตัว — บิดแล้ว "ไม่ถูกจับ" หนึ่งจุด:
 *   เปลี่ยน `!(stopOut < entryOut)` เป็น `stopOut >= entryOut` (และคู่แฝดอีก 3 จุด)
 *   สองรูปแบบนี้ต่างกันเฉพาะตอนมี NaN ทดสอบด้วยการใส่ตัวดัก NaN ที่ด่านชั้น 2/3
 *   ทั้ง 6 จุดแล้วรันทั้ง corpus → ไม่มีอินพุตใดทำให้ NaN ไปถึงเลยสักครั้ง
 *   เพราะ currentPrice ถูกกรอง isFinite ไปแล้ว และ atr มี fallback กันไว้แล้ว
 *   ส่วนระดับแนวรับ/ต้านที่เป็น NaN จะสอบตกที่ `<` ใน find เอง จึงไม่ถูกเลือกมา
 *   สรุป: กิ่งนั้นเป็นเกราะกันพลาดที่ปัจจุบันไปไม่ถึง ไม่ใช่จุดบอดของตัวตรวจ
 *   แต่แปลว่าถ้ามีใคร "ทำให้เรียบง่ายขึ้น" ที่ต้นฉบับตรงนั้น ตัวตรวจนี้จะยังเขียว
 *
 * และมีอีกสองจุดที่จับได้ด้วยเคสเพียง 1–2 เคสจาก 530 (เพดาน confidence กับตัวคูณ SL)
 * นั่นคือเหตุผลที่ค่าปกติของ --cases ต้องเยอะ ไม่ใช่พอผ่านก็ลดลงเพื่อความเร็ว
 *
 * สคริปต์นี้ไม่เขียนไฟล์ลงในโปรเจกต์เลย
 */

import { loadSrcModules } from './load-src-modules.mjs';
import { createLabEngine, DEFAULT_CONFIG, resolveConfig, configDiff } from './engine-lab.mjs';
import {
  mulberry32, fnv1a, synthCandles, applyCorruption,
  PROFILE_KEYS, CORRUPTION_KEYS,
} from './lab-candles.mjs';

// ───────────────────────────────── อาร์กิวเมนต์ ─────────────────────────────────

function argValue(name) {
  const raw = process.argv.find((a) => a.startsWith(`--${name}=`));
  return raw ? raw.slice(name.length + 3) : null;
}

function fail(message) {
  console.error(`\n[ล้มเหลว] ${message}\n`);
  process.exit(1);
}

const RANDOM_CASES = Number(argValue('cases') ?? 2400);
if (!Number.isInteger(RANDOM_CASES) || RANDOM_CASES < 1) fail(`--cases ต้องเป็นจำนวนเต็ม >= 1 (ได้ "${argValue('cases')}")`);

/** seed ตายตัว — ห้ามใช้ Math.random เป็นแหล่งเคส ไม่งั้น CI จะเขียวบ้างแดงบ้างโดยโค้ดไม่เปลี่ยน */
const SEED = Number(argValue('seed') ?? 0x1ab5_2026) >>> 0;

const ONLY_CASE = argValue('case');
const SHOW_RAW = argValue('show') ?? '25';
const SHOW_LIMIT = SHOW_RAW === 'all' ? Infinity : Number(SHOW_RAW);
if (!(SHOW_LIMIT > 0)) fail(`--show ต้องเป็นจำนวนเต็ม > 0 หรือ "all" (ได้ "${SHOW_RAW}")`);

const MARKETS = ['GOLD', 'FOREX', 'TH_STOCK', 'US_STOCK', 'CRYPTO'];
const TIMEFRAMES = ['1D', '1H', '4H'];

/**
 * ความยาวชุดแท่ง — จงใจคร่อมทุกเส้นแบ่งพฤติกรรม
 *   < 50   → ต้องคืน null
 *   49/50  → คร่อมเกณฑ์ขั้นต่ำพอดี
 *   < 200  → ไม่มี MA200 (กิ่งข้อความ trend ต่างกัน)
 *   199/200/201 → คร่อมเส้น MA200 พอดี
 */
const LENGTHS = [8, 20, 35, 48, 49, 50, 51, 60, 80, 120, 160, 198, 199, 200, 201, 240, 320];

// ───────────────────────────── เทียบค่าแบบไม่โกหก ─────────────────────────────

/**
 * แปลงค่าเป็นสตริงที่ "เท่ากันก็ต้องได้สตริงเดียวกัน"
 * JSON.stringify ตรง ๆ ใช้ไม่ได้: NaN/Infinity กลายเป็น null, -0 กลายเป็น 0, undefined หายทั้งคีย์
 * ทั้งสามอย่างคือความต่างที่เราอยากจับพอดี
 */
function canon(value) {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  const t = typeof value;
  if (t === 'number') {
    if (Number.isNaN(value)) return 'NaN';
    if (Object.is(value, -0)) return '-0';
    return String(value);
  }
  if (t === 'string') return JSON.stringify(value);
  if (t === 'boolean' || t === 'bigint') return String(value);
  if (t === 'function') return `function ${value.name || 'anonymous'}`;
  if (Array.isArray(value)) return `[${value.map(canon).join(',')}]`;
  if (t === 'object') {
    const keys = Object.keys(value).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${canon(value[k])}`).join(',')}}`;
  }
  return String(value);
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TIME_FIELDS = new Set(['created_at', 'expires_at']);
const TIME_TOLERANCE_MS = 5000;
const TTL_TOLERANCE_MS = 2000;

/** เรียกด้วยสำเนาอินพุตของตัวเอง — ถ้าฝั่งไหนแอบแก้ input อีกฝั่งจะได้ข้อมูลที่ถูกแก้แล้ว */
function invoke(fn, testCase) {
  const input = structuredClone(testCase.input);
  let result;
  try {
    result = { threw: false, value: fn(input) };
  } catch (err) {
    result = { threw: true, name: err?.name ?? 'Error', message: String(err?.message ?? err) };
  }
  return { result, argsAfter: input };
}

function ttlOf(signal) {
  const a = Date.parse(signal.created_at);
  const b = Date.parse(signal.expires_at);
  return Number.isFinite(a) && Number.isFinite(b) ? b - a : NaN;
}

/** คืนรายการความต่าง (ว่าง = ตรงกัน) */
function diffResults(a, b) {
  const diffs = [];

  if (a.result.threw || b.result.threw) {
    if (a.result.threw !== b.result.threw) {
      const t = a.result.threw ? a.result : b.result;
      diffs.push(`ฝั่ง${a.result.threw ? 'ต้นฉบับ' : 'สำเนา'}โยน ${t.name}: ${t.message} — อีกฝั่งคืนค่าปกติ`);
    } else if (a.result.name !== b.result.name) {
      diffs.push(`ชนิด error ต่างกัน: ต้นฉบับ ${a.result.name} / สำเนา ${b.result.name}`);
    }
    return diffs;
  }

  const av = a.result.value;
  const bv = b.result.value;
  if (av === null || bv === null) {
    if (av !== bv) diffs.push(`ต้นฉบับคืน ${av === null ? 'null' : 'สัญญาณ'} แต่สำเนาคืน ${bv === null ? 'null' : 'สัญญาณ'}`);
    return diffs;
  }
  if (typeof av !== 'object' || typeof bv !== 'object') {
    if (canon(av) !== canon(bv)) diffs.push(`ชนิดผลลัพธ์ต่างกัน: ต้นฉบับ=${canon(av)} สำเนา=${canon(bv)}`);
    return diffs;
  }

  const keys = [...new Set([...Object.keys(av), ...Object.keys(bv)])].sort();
  for (const k of keys) {
    const inA = k in av;
    const inB = k in bv;
    if (inA !== inB) {
      diffs.push(`ฟิลด์ ${k}: มีเฉพาะฝั่ง${inA ? 'ต้นฉบับ' : 'สำเนา'}`);
      continue;
    }
    if (k === 'id') {
      if (!UUID_RE.test(String(av.id))) diffs.push(`id ฝั่งต้นฉบับไม่ใช่ uuid v4: ${canon(av.id)}`);
      if (!UUID_RE.test(String(bv.id))) diffs.push(`id ฝั่งสำเนาไม่ใช่ uuid v4: ${canon(bv.id)}`);
      continue;
    }
    if (TIME_FIELDS.has(k)) {
      const ta = Date.parse(av[k]);
      const tb = Date.parse(bv[k]);
      if (!Number.isFinite(ta) || !Number.isFinite(tb)) {
        diffs.push(`ฟิลด์ ${k}: อ่านเป็นเวลาไม่ได้ — ต้นฉบับ=${canon(av[k])} สำเนา=${canon(bv[k])}`);
      } else if (Math.abs(ta - tb) > TIME_TOLERANCE_MS) {
        diffs.push(`ฟิลด์ ${k}: เวลาห่างกัน ${Math.abs(ta - tb)} ms (เกิน ${TIME_TOLERANCE_MS} ms) — ต้นฉบับ=${av[k]} สำเนา=${bv[k]}`);
      }
      continue;
    }
    if (canon(av[k]) !== canon(bv[k])) {
      diffs.push(`ฟิลด์ ${k}: ต้นฉบับ=${canon(av[k])} สำเนา=${canon(bv[k])}`);
    }
  }

  // อายุสัญญาณ — ยกเว้นค่าเวลาดิบได้ แต่ห้ามยกเว้น "ระยะเวลา" เพราะนั่นคือกติกาที่ต้องเหมือนกัน
  const ttlA = ttlOf(av);
  const ttlB = ttlOf(bv);
  if (!Number.isFinite(ttlA) || !Number.isFinite(ttlB)) {
    diffs.push(`อายุสัญญาณคำนวณไม่ได้ — ต้นฉบับ=${ttlA} สำเนา=${ttlB}`);
  } else if (Math.abs(ttlA - ttlB) > TTL_TOLERANCE_MS) {
    diffs.push(`อายุสัญญาณ (expires_at − created_at) ต่างกัน ${Math.abs(ttlA - ttlB)} ms — ต้นฉบับ=${ttlA} สำเนา=${ttlB}`);
  }

  if (canon(a.argsAfter) !== canon(b.argsAfter)) {
    diffs.push('อินพุตหลังเรียกไม่เหมือนกัน แปลว่ามีฝั่งหนึ่งไปแก้ค่า input');
  }
  return diffs;
}

// ─────────────────────────────── ตารางเคสที่ออกแบบเอง ───────────────────────────────

/**
 * เคสที่ตั้งใจเล็งกิ่งเฉพาะ — เคสสุ่มครอบได้กว้างแต่ไม่การันตีว่าจะไปโดนกิ่งแคบ ๆ
 * ที่เรารู้ว่ามีอยู่ (เช่น ด่านชั้นที่ 3 หลังปัดทศนิยม หรือ threshold ข่าวที่ 0.3 พอดี)
 */
function buildDesignedCases() {
  const cases = [];
  const add = (name, input) => cases.push({ id: `D${String(cases.length + 1).padStart(3, '0')}`, name, input, kind: 'designed' });

  const mk = (profile, base, length, tag) =>
    synthCandles({ profile, base, length, seed: (SEED ^ fnv1a(`designed-${tag}`)) >>> 0 });

  // 1) ทุกตลาด × ทุกโปรไฟล์หลัก ที่ความยาวมาตรฐาน 260 แท่ง (มี MA200)
  for (const market of MARKETS) {
    for (const profile of ['up', 'down', 'side', 'vshape', 'crash']) {
      add(`${market}/${profile}/260 แท่ง/มี MA200`, {
        symbol: `${market}-${profile}`, name: `เคสออกแบบ ${market} ${profile}`, market,
        candles: mk(profile, 120, 260, `${market}-${profile}`), timeframe: '1D',
      });
    }
  }

  // 2) คร่อมเกณฑ์ขั้นต่ำ 50 แท่ง
  add('49 แท่ง → ต้อง null ทั้งสองฝั่ง', { symbol: 'MIN-49', name: 'ต่ำกว่าเกณฑ์', market: 'CRYPTO', candles: mk('up', 100, 49, 'min49'), timeframe: '1D' });
  add('50 แท่ง → ผ่านเกณฑ์พอดี', { symbol: 'MIN-50', name: 'พอดีเกณฑ์', market: 'CRYPTO', candles: mk('up', 100, 50, 'min50'), timeframe: '1D' });
  add('0 แท่ง → ต้อง null', { symbol: 'MIN-0', name: 'ไม่มีข้อมูล', market: 'US_STOCK', candles: [], timeframe: '1D' });
  add('1 แท่ง → ต้อง null', { symbol: 'MIN-1', name: 'แท่งเดียว', market: 'US_STOCK', candles: mk('up', 100, 1, 'min1'), timeframe: '1D' });

  // 3) คร่อมเส้น MA200 (กิ่งข้อความ trend และคะแนน 2 vs 1)
  add('199 แท่ง → ไม่มี MA200', { symbol: 'MA-199', name: 'ไม่ถึง MA200', market: 'US_STOCK', candles: mk('up', 100, 199, 'ma199'), timeframe: '1D' });
  add('200 แท่ง → มี MA200 พอดี', { symbol: 'MA-200', name: 'ถึง MA200 พอดี', market: 'US_STOCK', candles: mk('up', 100, 200, 'ma200'), timeframe: '1D' });
  add('201 แท่ง → มี MA200', { symbol: 'MA-201', name: 'เกิน MA200', market: 'US_STOCK', candles: mk('down', 100, 201, 'ma201'), timeframe: '1D' });

  // 4) ราคาสุดขั้วทั้งสองด้าน (roundPrice: เลขนัยสำคัญ vs toFixed)
  for (const base of [0.000001, 0.0000061957, 0.00000468, 0.5, 0.999999, 1, 1.000001, 100, 64986, 100000]) {
    for (const market of ['CRYPTO', 'FOREX']) {
      add(`ราคาฐาน ${base}/${market}`, {
        symbol: `PX-${base}`, name: `ราคาสุดขั้ว ${base}`, market,
        candles: mk('side', base, 220, `px-${base}-${market}`), timeframe: '1D',
      });
    }
  }

  // 5) timeframe ทุกแบบ (TTL 48 ชม. vs 7 วัน)
  for (const timeframe of ['1D', '1H', '4H', '15M', '']) {
    add(`timeframe "${timeframe}" → ตรวจอายุสัญญาณ`, {
      symbol: `TF-${timeframe || 'empty'}`, name: `เคส timeframe ${timeframe}`, market: 'GOLD',
      candles: mk('up', 2400, 240, `tf-${timeframe}`), timeframe,
    });
  }
  add('ไม่ส่ง timeframe → ต้อง default 1D', {
    symbol: 'TF-UNDEF', name: 'ไม่ระบุ timeframe', market: 'GOLD', candles: mk('up', 2400, 240, 'tf-undef'),
  });

  // 6) newsSentiment คร่อม threshold 0.3 / -0.3 พอดี และค่าที่ทำให้ Math.round ปัดคนละทาง
  for (const s of [0.3, 0.30000001, 0.29999999, -0.3, -0.30000001, 0.75, -0.75, 1, -1, 0, 0.5, -0.5]) {
    add(`newsSentiment ${s}`, {
      symbol: 'NEWS', name: 'เคสข่าว', market: 'US_STOCK',
      candles: mk('up', 100, 240, `news-${s}`), timeframe: '1D', newsSentiment: s,
    });
  }

  // 7) ข้อมูลเสียทุกแบบ ที่ความยาวพอผ่านเกณฑ์
  for (const kind of CORRUPTION_KEYS) {
    const rnd = mulberry32((SEED ^ fnv1a(`corrupt-${kind}`)) >>> 0);
    add(`ข้อมูลเสีย: ${kind}`, {
      symbol: `BAD-${kind}`, name: `แท่งเสีย ${kind}`, market: 'CRYPTO',
      candles: applyCorruption(mk('side', 100, 220, `corrupt-${kind}`), kind, rnd), timeframe: '1D',
    });
  }

  // 8) ATR = 0 (ทุกแท่งเท่ากัน) → ต้องถอยไปใช้ fallback currentPrice * 0.02
  add('ทุกแท่งราคาเท่ากัน → ATR fallback', {
    symbol: 'FLAT', name: 'ราคานิ่งสนิท', market: 'TH_STOCK',
    candles: Array.from({ length: 220 }, (_, i) => ({
      timestamp: new Date(Date.UTC(2026, 0, 5) + i * 86400000).toISOString(),
      open: 42, high: 42, low: 42, close: 42, volume: 1000,
    })),
    timeframe: '1D',
  });

  // 9) ราคาจิ๋วมากจนปัดทศนิยมแล้ว SL/TP ยุบเท่ากับ entry → ด่านชั้นที่ 3 ต้องคืน null
  add('ราคาจิ๋ว 1e-9 → ด่านชั้นที่ 3', {
    symbol: 'MICRO', name: 'ราคาจิ๋วเกินการปัด', market: 'CRYPTO',
    candles: mk('flat', 1e-9, 220, 'micro'), timeframe: '1D', newsSentiment: 0.9,
  });

  // 10) แนวต้านอยู่เหนือราคาแค่เศษเสี้ยว → ตัวคูณ 0.995 เตะ TP ข้ามไปใต้ entry (ด่านชั้นที่ 2)
  //     สร้างด้วยการวาง swing high ไว้เหนือราคาปิดล่าสุดประมาณ 0.2%
  {
    const candles = mk('side', 100, 220, 'tight-resistance');
    const px = candles[candles.length - 1].close;
    const peak = px * 1.002;
    const j = candles.length - 30; // ให้พ้นช่วง lookback ปลายชุดของ findSupportResistance
    candles[j] = { ...candles[j], high: peak, low: px * 0.98, open: px * 0.99, close: px * 0.995 };
    for (let k = 1; k <= 5; k++) {
      candles[j - k] = { ...candles[j - k], high: peak * (1 - 0.004 * k) };
      candles[j + k] = { ...candles[j + k], high: peak * (1 - 0.004 * k) };
    }
    add('แนวต้านเหนือราคา 0.2% → ด่านชั้นที่ 2 ฝั่ง TP', {
      symbol: 'TIGHT-R', name: 'แนวต้านชิดราคา', market: 'US_STOCK', candles, timeframe: '1D', newsSentiment: 0.95,
    });
  }

  // 11) แนวรับอยู่ใต้ราคาแค่เศษเสี้ยว → ฝั่ง SELL คูณ 1.005 แล้วเด้งข้ามขึ้นเหนือ entry
  {
    const candles = mk('side', 100, 220, 'tight-support');
    const px = candles[candles.length - 1].close;
    const trough = px * 0.998;
    const j = candles.length - 30;
    candles[j] = { ...candles[j], low: trough, high: px * 1.02, open: px * 1.01, close: px * 1.005 };
    for (let k = 1; k <= 5; k++) {
      candles[j - k] = { ...candles[j - k], low: trough * (1 + 0.004 * k) };
      candles[j + k] = { ...candles[j + k], low: trough * (1 + 0.004 * k) };
    }
    add('แนวรับใต้ราคา 0.2% → ด่านชั้นที่ 2 ฝั่ง SELL', {
      symbol: 'TIGHT-S', name: 'แนวรับชิดราคา', market: 'US_STOCK', candles, timeframe: '1D', newsSentiment: -0.95,
    });
  }

  // 12) ดันคะแนนให้คร่อมเส้นตัดสิน BUY/SELL พอดี ด้วย newsSentiment คุมคะแนนสุดท้าย
  for (const profile of ['up', 'down']) {
    for (const s of [-1, -0.6, -0.35, 0.35, 0.6, 1]) {
      add(`คร่อมเส้นตัดสิน/${profile}/news ${s}`, {
        symbol: `EDGE-${profile}`, name: 'คร่อมเส้นตัดสิน', market: 'US_STOCK',
        candles: mk(profile, 100, 260, `edge-${profile}`), timeframe: '1D', newsSentiment: s,
      });
    }
  }

  // 13) โปรไฟล์ที่เหลือทั้งหมด (ให้ครบทุกแบบที่เครื่องปั่นมี)
  for (const profile of PROFILE_KEYS) {
    add(`โปรไฟล์ ${profile}/300 แท่ง`, {
      symbol: `PROF-${profile}`, name: `โปรไฟล์ ${profile}`, market: 'CRYPTO',
      candles: mk(profile, 3000, 300, `prof-${profile}`), timeframe: '1H',
    });
  }

  // 14) เคสคะแนนสูง — ต้องประกอบมือ ไม่ใช่หวังพึ่งการสุ่ม
  //
  //  รอบแรกที่รันชุดเคสนี้ ผลออกมาว่า strength very_strong = 0 เคส และไม่มี Engulfing เลย
  //  แปลว่ากิ่ง totalScore >= 8 กับกิ่ง pattern สองตัวนั้น "ไม่เคยถูกตรวจ"
  //  parity ที่ไม่เคยเดินผ่านกิ่งไหน ก็ไม่ได้พิสูจน์อะไรเกี่ยวกับกิ่งนั้น
  //  จึงต้องประกอบชุดแท่งที่ปลุกหลายกฎพร้อมกัน: ดิ่งยาวจน RSI oversold + หลุด BB
  //  แล้วปิดด้วยแท่งกลับตัวแบบ engulfing + ข่าวบวกเต็ม → คะแนนรวมทะลุ 8
  for (const dir of [1, -1]) {
    for (const [dropBars, dropPct] of [[10, 0.01], [30, 0.04], [40, 0.015]]) {
      for (const news of [undefined, 1, -1]) {
        add(`กลับตัว/${dir > 0 ? 'ขาลง→engulf ขึ้น' : 'ขาขึ้น→engulf ลง'}/${dropBars} แท่ง ${dropPct * 100}%/news ${news ?? '-'}`, {
          symbol: `REV-${dir}-${dropBars}`, name: 'เคสกลับตัวคะแนนสูง', market: 'US_STOCK',
          candles: reversalCandles({ n: 260, dropBars, dropPct, dir, lowerWick: 0.001, upperWick: 0.001 }),
          timeframe: '1D', newsSentiment: news,
        });
      }
    }
  }

  // Hammer + Bullish Engulfing พร้อมกันในแท่งเดียว → กฎ pattern ต้องบวกคะแนนสองรอบ
  add('แท่งเดียวเป็นทั้ง Hammer และ Bullish Engulfing', {
    symbol: 'PAT-DOUBLE', name: 'สองรูปแบบในแท่งเดียว', market: 'US_STOCK',
    candles: reversalCandles({ n: 260, dropBars: 40, dropPct: 0.015, dir: 1, lowerWick: 0.06, upperWick: 0.001 }),
    timeframe: '1D', newsSentiment: 1,
  });

  // Doji — detectPatterns คืนมาแต่ไม่อยู่ในลิสต์ bullish/bearish จึงต้องถูกข้ามเงียบ ๆ
  {
    const candles = mk('side', 100, 220, 'doji');
    const i = candles.length - 1;
    const px = candles[i - 1].close;
    candles[i] = { ...candles[i], open: px, close: px, high: px * 1.05, low: px * 0.95 };
    add('แท่งสุดท้ายเป็น Doji → ต้องไม่ให้คะแนนฝั่งไหน', {
      symbol: 'PAT-DOJI', name: 'โดจิ', market: 'US_STOCK', candles, timeframe: '1D',
    });
  }

  return cases;
}

/**
 * ชุดแท่ง "เทรนด์ยาว → ดิ่งชัน → แท่งกลับตัวแบบ engulfing"
 * dir = 1  ขาขึ้นยาว แล้วดิ่ง แล้วปิดด้วย Bullish Engulfing
 * dir = -1 ขาลงยาว แล้วเด้ง แล้วปิดด้วย Bearish Engulfing
 *
 * ค่าพารามิเตอร์ที่ใช้มาจากการค้นแบบ grid บนเครื่องยนต์ต้นฉบับ เลือกชุดที่ดัน
 * totalScore ทะลุเกณฑ์ very_strong (>= 8) ได้จริง ไม่ใช่ค่าที่เดาเอา
 */
function reversalCandles({ n, dropBars, dropPct, dir, lowerWick, upperWick, base = 100 }) {
  const c = [];
  let px = base;
  const push = (open, high, low, close) => c.push({
    timestamp: new Date(Date.UTC(2026, 0, 5) + c.length * 86400000).toISOString(),
    open, high, low, close, volume: 1000,
  });

  const trendBars = n - dropBars - 1;
  for (let i = 0; i < trendBars; i++) {
    const open = px;
    const close = open * (1 + 0.004 * dir);
    push(open, Math.max(open, close) * 1.002, Math.min(open, close) * 0.998, close);
    px = close;
  }
  for (let i = 0; i < dropBars; i++) {
    const open = px;
    const close = open * (1 - dropPct * dir);
    push(open, Math.max(open, close) * 1.001, Math.min(open, close) * 0.999, close);
    px = close;
  }

  const prev = c[c.length - 1];
  const open = dir > 0 ? prev.close * 0.998 : prev.close * 1.002;
  const close = dir > 0 ? prev.open * 1.002 : prev.open * 0.998;
  push(open, Math.max(open, close) * (1 + upperWick), Math.min(open, close) * (1 - lowerWick), close);
  return c;
}

// ─────────────────────────────────── เคสสุ่ม ───────────────────────────────────

/**
 * เคสสุ่มหนึ่งชุด — ขึ้นกับ index อย่างเดียว (ไม่ใช่ลำดับการเรียก)
 * จึงรันเคสเดี่ยวซ้ำด้วย --case=R0042 แล้วได้ข้อมูลชุดเดิมเป๊ะ
 */
function buildRandomCase(i) {
  const rnd = mulberry32((SEED ^ fnv1a(`lab-case-${i}`)) >>> 0);

  const profile = PROFILE_KEYS[Math.floor(rnd() * PROFILE_KEYS.length)];
  const length = LENGTHS[Math.floor(rnd() * LENGTHS.length)];
  const market = MARKETS[Math.floor(rnd() * MARKETS.length)];
  const timeframe = TIMEFRAMES[Math.floor(rnd() * TIMEFRAMES.length)];

  // ราคาแบบ log-uniform ครอบ 0.000001 → 100000 และตรึงค่าสุดขั้วเป็นระยะ
  // เพื่อไม่ต้องหวังพึ่งโชคว่าการสุ่มจะไปแตะขอบ
  let base;
  if (i % 53 === 0) base = 0.000001;
  else if (i % 53 === 1) base = 100000;
  else base = Math.pow(10, rnd() * 11 - 6);

  const corruption = rnd() < 0.25
    ? CORRUPTION_KEYS[1 + Math.floor(rnd() * (CORRUPTION_KEYS.length - 1))]
    : 'none';

  const newsRoll = rnd();
  const newsSentiment = newsRoll < 0.35 ? undefined : Number((rnd() * 2 - 1).toFixed(3));

  let candles = synthCandles({ profile, base, length, seed: (SEED ^ fnv1a(`lab-candles-${i}`)) >>> 0 });
  if (corruption !== 'none') candles = applyCorruption(candles, corruption, rnd);

  return {
    id: `R${String(i).padStart(4, '0')}`,
    kind: 'random',
    name: `${profile}/${length} แท่ง/${market}/${timeframe}/ฐาน ${base.toPrecision(3)}${corruption === 'none' ? '' : `/เสีย:${corruption}`}${newsSentiment === undefined ? '' : `/news ${newsSentiment}`}`,
    meta: { profile, length, market, timeframe, base, corruption, newsSentiment },
    input: {
      symbol: `RND-${i}`,
      name: `เคสสุ่ม ${i}`,
      market,
      candles,
      timeframe,
      newsSentiment,
    },
  };
}

// ──────────────────────────────── สรุปความครอบคลุม ────────────────────────────────

/**
 * นับว่ากิ่งไหนถูกเดินบ้าง — ถ้าทุกเคสตกกิ่งเดียวกันหมด (เช่น null ทั้งหมด)
 * การเทียบจะ "ผ่าน" อย่างไร้ความหมายโดยไม่มีใครรู้ ตัวเลขชุดนี้คือหลักฐานว่าไม่ใช่อย่างนั้น
 */
function newCoverage() {
  return {
    action: { BUY: 0, SELL: 0, HOLD: 0 },
    strength: { weak: 0, moderate: 0, strong: 0, very_strong: 0 },
    nulls: 0,
    threw: 0,
    signals: 0,
    reasonLabels: new Map(),
    markets: new Map(),
    timeframes: new Map(),
    withMA200: 0,
    withoutMA200: 0,
    ttl: new Map(),
  };
}

function recordCoverage(cov, testCase, res) {
  const m = testCase.input.market;
  cov.markets.set(m, (cov.markets.get(m) ?? 0) + 1);
  const tf = String(testCase.input.timeframe ?? '(ไม่ระบุ)');
  cov.timeframes.set(tf, (cov.timeframes.get(tf) ?? 0) + 1);

  if (res.result.threw) { cov.threw++; return; }
  const v = res.result.value;
  if (v === null) { cov.nulls++; return; }

  cov.signals++;
  cov.action[v.action] = (cov.action[v.action] ?? 0) + 1;
  cov.strength[v.strength] = (cov.strength[v.strength] ?? 0) + 1;
  if ('ma200' in v.indicators) cov.withMA200++; else cov.withoutMA200++;
  for (const r of v.reasons) cov.reasonLabels.set(r.label, (cov.reasonLabels.get(r.label) ?? 0) + 1);
  const ttl = ttlOf(v);
  if (Number.isFinite(ttl)) {
    const hours = Math.round(ttl / 3600000);
    cov.ttl.set(hours, (cov.ttl.get(hours) ?? 0) + 1);
  }
}

const mapLine = (m) => [...m.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}=${v}`).join(' · ') || '(ไม่มี)';

// ──────────────────────── ชั้นที่ 3: ปุ่มปรับได้จริงหรือเปล่า ────────────────────────

/**
 * บิด config ทีละปุ่มแล้วนับว่าผลเปลี่ยนกี่เคส
 *
 * ถ้าไม่มีชั้นนี้ สำเนาที่เขียนว่า `return originalGenerateSignal(input)` แล้วเมิน config
 * ทั้งก้อนก็จะสอบผ่านชั้นที่ 2 แบบสวยงาม — แล้วการทดลองปรับค่าทั้งหมดหลังจากนั้น
 * จะให้ผลเท่ากันหมด แล้วเราจะสรุปผิดว่า "ปรับยังไงก็ไม่ต่าง"
 */
const KNOB_PROBES = [
  { name: 'decision.buyNetScore/sellNetScore', patch: { decision: { buyNetScore: 99, sellNetScore: -99 } } },
  { name: 'rules.rsi.enabled=false', patch: { rules: { rsi: { enabled: false } } } },
  { name: 'rules.rsi.zones 30/70 → 45/55', patch: { rules: { rsi: { zones: { oversold: 45, overbought: 55 } } } } },
  { name: 'rules.macdCross.enabled=false', patch: { rules: { macdCross: { enabled: false } } } },
  { name: 'rules.macdHistogram.enabled=false', patch: { rules: { macdHistogram: { enabled: false } } } },
  { name: 'rules.trend.enabled=false', patch: { rules: { trend: { enabled: false } } } },
  { name: 'rules.bollinger.enabled=false', patch: { rules: { bollinger: { enabled: false } } } },
  { name: 'rules.patterns.enabled=false', patch: { rules: { patterns: { enabled: false } } } },
  { name: 'rules.supportResistance.enabled=false', patch: { rules: { supportResistance: { enabled: false } } } },
  { name: 'rules.news.enabled=false', patch: { rules: { news: { enabled: false } } } },
  { name: 'levels.maxDistancePct 1.5% → 8%', patch: { levels: { maxDistancePct: 0.08 } } },
  { name: 'exits.slAtrMult 1.5 → 2.5', patch: { exits: { slAtrMult: 2.5 } } },
  { name: 'exits.tpAtrMult 3 → 6', patch: { exits: { tpAtrMult: 6 } } },
  { name: 'exits.useSupportResistance=false', patch: { exits: { useSupportResistance: false } } },
  { name: 'decision.confidenceBase 40 → 10', patch: { decision: { confidenceBase: 10 } } },
  { name: 'decision.strength 3/5/8 → 2/4/6', patch: { decision: { strengthModerate: 2, strengthStrong: 4, strengthVeryStrong: 6 } } },
  { name: 'decision.maxReasons 5 → 2', patch: { decision: { maxReasons: 2 } } },
  { name: 'indicators.rsiPeriod 14 → 7', patch: { indicators: { rsiPeriod: 7 } } },
  { name: 'indicators.maSlowPeriod 200 → 100', patch: { indicators: { maSlowPeriod: 100 } } },
  { name: 'output.ttlHoursByTimeframe 1H 48 → 6', patch: { output: { ttlHoursByTimeframe: { '1H': 6 } } } },
  { name: 'minCandles 50 → 210', patch: { minCandles: 210 } },
];

// ───────────────────────────────────── main ─────────────────────────────────────

async function main() {
  const t0 = Date.now();

  console.log('ต้นฉบับ : src/lib/signal-engine.ts (+ src/lib/indicators.ts)');
  console.log('สำเนา   : scripts/research/engine-lab.mjs (config เริ่มต้น)');
  console.log(`seed    : 0x${SEED.toString(16)} · เคสสุ่ม ${RANDOM_CASES} ชุด`);
  console.log('');

  const { indicators, 'signal-engine': engineMod } = await loadSrcModules([
    'src/lib/indicators.ts',
    'src/lib/signal-engine.ts',
  ]);
  if (typeof engineMod.generateSignal !== 'function') {
    fail('โหลด src/lib/signal-engine.ts แล้วไม่พบ generateSignal');
  }

  // ── ชั้นที่ 1: config เริ่มต้นต้องเป็นค่าเริ่มต้นจริง ──────────────────────────────
  const lab = createLabEngine(indicators);
  const startDiff = configDiff(lab.config);
  if (Object.keys(startDiff).length > 0) {
    fail(`config เริ่มต้นของ createLabEngine ไม่ตรงกับ DEFAULT_CONFIG: ${JSON.stringify(startDiff)}`);
  }
  if (canon(resolveConfig({})) !== canon(structuredClone(DEFAULT_CONFIG))) {
    fail('resolveConfig({}) ไม่คืนค่าเท่ากับ DEFAULT_CONFIG');
  }
  console.log('ชั้นที่ 1 : config เริ่มต้น = DEFAULT_CONFIG ทุกค่า (ไม่มีค่าใดถูกแก้ระหว่างทาง)');

  // ── เตรียมเคส ────────────────────────────────────────────────────────────────
  let cases = [...buildDesignedCases()];
  const designedCount = cases.length;
  for (let i = 0; i < RANDOM_CASES; i++) cases.push(buildRandomCase(i));

  if (ONLY_CASE) {
    const found = cases.find((c) => c.id === ONLY_CASE);
    if (!found) fail(`ไม่พบเคส "${ONLY_CASE}" — รหัสเคสคือ D001..D${String(designedCount).padStart(3, '0')} หรือ R0000..R${String(RANDOM_CASES - 1).padStart(4, '0')}`);
    cases = [found];
    console.log(`โหมดเคสเดียว: ${found.id} — ${found.name}`);
  }

  // ── ชั้นที่ 2: เทียบผลทุกฟิลด์ ────────────────────────────────────────────────
  const failures = [];
  const cov = newCoverage();

  for (const testCase of cases) {
    const a = invoke(engineMod.generateSignal, testCase);
    const b = invoke(lab.generateSignal, testCase);
    const diffs = diffResults(a, b);
    if (diffs.length > 0) failures.push({ testCase, diffs, a, b });
    recordCoverage(cov, testCase, a);

    if (ONLY_CASE) {
      console.log('');
      console.log('— ผลฝั่งต้นฉบับ —');
      console.log(JSON.stringify(a.result, null, 2));
      console.log('');
      console.log('— ผลฝั่งสำเนา —');
      console.log(JSON.stringify(b.result, null, 2));
      console.log('');
      console.log(diffs.length === 0 ? 'ตรงกันทุกฟิลด์' : `ต่างกัน ${diffs.length} จุด:`);
      for (const d of diffs) console.log(`  - ${d}`);
    }
  }

  console.log(`ชั้นที่ 2 : เทียบผลแล้ว ${cases.length} เคส (ออกแบบเอง ${ONLY_CASE ? '-' : designedCount} · สุ่ม ${ONLY_CASE ? '-' : RANDOM_CASES})`);
  console.log('');
  console.log('ความครอบคลุมของชุดเคส (นับจากผลฝั่งต้นฉบับ)');
  console.log(`  ผลลัพธ์      : สัญญาณ ${cov.signals} · null ${cov.nulls} · โยน error ${cov.threw}`);
  console.log(`  action       : BUY ${cov.action.BUY} · SELL ${cov.action.SELL} · HOLD ${cov.action.HOLD}`);
  console.log(`  strength     : weak ${cov.strength.weak} · moderate ${cov.strength.moderate} · strong ${cov.strength.strong} · very_strong ${cov.strength.very_strong}`);
  console.log(`  MA200        : มี ${cov.withMA200} · ไม่มี ${cov.withoutMA200}`);
  console.log(`  ตลาด         : ${mapLine(cov.markets)}`);
  console.log(`  timeframe    : ${mapLine(cov.timeframes)}`);
  console.log(`  อายุสัญญาณ(ชม.): ${mapLine(cov.ttl)}`);
  console.log(`  reason ที่เจอ : ${mapLine(cov.reasonLabels)}`);

  if (failures.length > 0) {
    console.error('');
    console.error(`[ไม่ผ่าน] ผลลัพธ์ไม่ตรงกัน ${failures.length} เคส จาก ${cases.length}`);
    console.error('');
    console.error('รหัสเคสที่ต่างทั้งหมด:');
    console.error(`  ${failures.map((f) => f.testCase.id).join(' ')}`);
    console.error('');
    let shown = 0;
    for (const f of failures) {
      if (shown >= SHOW_LIMIT) break;
      shown++;
      console.error(`── ${f.testCase.id} — ${f.testCase.name}`);
      console.error(`   ตลาด/timeframe/จำนวนแท่ง: ${f.testCase.input.market} / ${f.testCase.input.timeframe} / ${f.testCase.input.candles.length}`);
      for (const d of f.diffs) console.error(`   - ${d}`);
      console.error('');
    }
    if (failures.length > shown) {
      console.error(`   (แสดงรายละเอียด ${shown} จาก ${failures.length} เคส — ใช้ --show=all เพื่อดูทั้งหมด`);
      console.error(`    หรือ --case=<รหัส> เพื่อดัมพ์ผลทั้งสองฝั่งของเคสเดียว)`);
      console.error('');
    }
    console.error('แก้ที่ scripts/research/engine-lab.mjs ให้ตรงกับ src/lib/signal-engine.ts');
    console.error('อย่าแก้สคริปต์นี้ให้ยอมรับความต่าง — ต้นฉบับคือกฎที่ชี้ขาดสัญญาณของผู้ใช้');
    process.exit(1);
  }

  console.log('');
  console.log(`ชั้นที่ 2 : ตรงกันทุกฟิลด์ทั้ง ${cases.length} เคส (ยกเว้น id และ created_at/expires_at ตามเกณฑ์ที่ประกาศไว้หัวไฟล์)`);

  if (ONLY_CASE) return;

  // ── ชั้นที่ 3: ปุ่มปรับได้จริงหรือเปล่า ─────────────────────────────────────────
  //
  // ใช้เคสย่อยพอประมาณเพราะต้องรันซ้ำ 1 รอบต่อปุ่ม และเป้าหมายแค่ "มีผลต่างอย่างน้อยหนึ่งเคส"
  const probeCases = [
    ...cases.filter((c) => c.kind === 'designed'),
    ...cases.filter((c) => c.kind === 'random').slice(0, 400),
  ];
  const baseline = probeCases.map((c) => invoke(engineMod.generateSignal, c));

  console.log('');
  console.log(`ชั้นที่ 3 : ตรวจว่าปุ่มปรับได้จริง (บิดทีละปุ่มบน ${probeCases.length} เคส)`);
  const deadKnobs = [];
  for (const probe of KNOB_PROBES) {
    const tweaked = createLabEngine(indicators, probe.patch);
    let changed = 0;
    for (let i = 0; i < probeCases.length; i++) {
      const t = invoke(tweaked.generateSignal, probeCases[i]);
      if (diffResults(baseline[i], t).length > 0) changed++;
    }
    const pct = ((changed / probeCases.length) * 100).toFixed(1);
    console.log(`  ${changed === 0 ? '[ไม่มีผล]' : '        ok'} ${probe.name} → เปลี่ยนผล ${changed}/${probeCases.length} เคส (${pct}%)`);
    if (changed === 0) deadKnobs.push(probe.name);
  }

  if (deadKnobs.length > 0) {
    console.error('');
    console.error(`[ไม่ผ่าน] มีปุ่มที่บิดแล้วผลไม่เปลี่ยนเลย ${deadKnobs.length} ปุ่ม:`);
    for (const n of deadKnobs) console.error(`   - ${n}`);
    console.error('');
    console.error('ปุ่มที่ไม่มีผลแปลว่าเครื่องยนต์ไม่ได้อ่านค่านั้นจริง หรือชุดเคสไม่เดินผ่านกิ่งนั้นเลย');
    console.error('ทั้งสองกรณีทำให้การทดลองปรับค่าให้ผลลวง — ต้องแก้ก่อนเอาไปวิจัย');
    process.exit(1);
  }

  console.log('');
  console.log(`[ผ่าน] สำเนาใน scripts/research/engine-lab.mjs ที่ config เริ่มต้น = src/lib/signal-engine.ts ทุกฟิลด์`);
  console.log(`       และปุ่มปรับทั้ง ${KNOB_PROBES.length} ปุ่มมีผลจริง (ใช้เวลา ${((Date.now() - t0) / 1000).toFixed(1)} วินาที)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
