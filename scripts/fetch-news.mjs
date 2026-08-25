#!/usr/bin/env node
/**
 * ตัวดึงข่าว — เก็บพาดหัวที่เกี่ยวกับสัญลักษณ์ในจักรวาลลงตาราง news
 *
 * รันเอง:  node scripts/fetch-news.mjs [--dry-run] [--limit=N]
 * ต้องมี:  NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *
 * ── ขอบเขตที่ไฟล์นี้ตั้งใจไม่ทำ ────────────────────────────────────────────────
 *
 * **ไม่วิเคราะห์อารมณ์ข่าว และไม่ป้อนอะไรเข้าเครื่องคำนวณสัญญาณ**
 *
 * src/lib/signal-engine.ts รับพารามิเตอร์ newsSentiment แล้วเอาไปบวก/ลบคะแนนจริง
 * การป้อนคะแนนที่ได้จากการนับคำเข้าไปตรงนั้น = เปลี่ยนสัญญาณที่เจ้าของเห็นด้วยตัวเลข
 * ที่ไม่มีใครเคยวัดว่าถูกไหม ซึ่งเป็นสิ่งเดียวกับที่งานวิจัยในรีโปนี้ทดลองแล้วล้มเหลว
 * มาสามตระกูลฟีเจอร์ (ดู exp-families / exp-feat-* ใน scripts/research/report/)
 *
 * ข่าวจึงถูกเก็บไว้ "ให้คนอ่าน" อย่างเดียว คอลัมน์ sentiment / sentiment_score ปล่อยว่าง
 * โดยตั้งใจ — ว่างแปลว่า "ยังไม่มีใครวัด" ซึ่งซื่อสัตย์กว่าการเดาแล้วใส่ตัวเลขลงไป
 *
 * ── ความเกี่ยวข้องของข่าว มาจากข้อมูล ไม่ใช่จากคำค้นที่เราเดา ────────────────
 * ต้องค้นด้วย **Yahoo symbol** เท่านั้น (EURUSD=X, GC=F) การค้นด้วยชื่อดิบหรือวลี
 * ทำให้ Yahoo คืนฟีดทั่วไปที่ไม่เกี่ยวเลย — วัดจริง: q=EURUSD=X ได้ข่าวที่เกี่ยวข้อง 6/6
 * ส่วน q=XAUUSD และ q="gold price" ได้ 0/6 (ได้ข่าวน้ำมัน ข่าวบริษัทรักษาความปลอดภัย ฯลฯ)
 *
 * จึงกรองซ้ำอีกชั้นด้วย relatedTickers ที่ Yahoo ติดมากับข่าวแต่ละชิ้น: รับเฉพาะข่าว
 * ที่ Yahoo เองบอกว่าเกี่ยวกับสัญลักษณ์ที่เราถาม การกรองแบบนี้ทำให้ฟีดทั่วไปตกไปเองทั้งหมด
 * โดยไม่ต้องมีบัญชีคำต้องห้ามให้ใครมาเดาว่าควรมีอะไรบ้าง
 *
 * ── สิ่งที่ทำไม่ได้และเหตุผล ──────────────────────────────────────────────────
 * ตั้งใจจะกันไม่ให้ยิงสัญญาณช่วงข่าวแรง (NFP/CPI/ดอกเบี้ย) ด้วยปฏิทินเศรษฐกิจ
 * แหล่งฟรีที่หาได้ (nfs.faireconomy.media) ตอบ HTTP 429 หลังเรียกไปสองครั้ง
 * ลองซ้ำ 6 รอบห่างกัน 45 วินาที ได้ 429 ทั้งหมด — ใช้กับตัวสแกนที่รันทุก 30 นาทีไม่ได้จริง
 * ถ้าวันไหนมีแหล่งที่เรียกได้สม่ำเสมอ ให้เพิ่มเป็นสคริปต์แยก อย่ายัดเข้ามาในไฟล์นี้
 */

const DRY_RUN = process.argv.includes('--dry-run');
const LIMIT = Number(process.argv.find((a) => a.startsWith('--limit='))?.slice(8) || 0) || null;

/**
 * จักรวาลปัจจุบัน — ต้องตรงกับ SYMBOL_UNIVERSE ใน src/lib/universe.ts
 * ไม่ import เพราะไฟล์นี้รันด้วย node ล้วนบน CI ซึ่ง import .ts ไม่ได้
 */
const UNIVERSE = [
  ['XAUUSD', 'GOLD'], ['XAGUSD', 'GOLD'],
  ['EURUSD', 'FOREX'], ['GBPUSD', 'FOREX'], ['USDJPY', 'FOREX'], ['AUDUSD', 'FOREX'],
  ['USDCHF', 'FOREX'], ['USDCAD', 'FOREX'], ['NZDUSD', 'FOREX'],
  ['EURJPY', 'FOREX'], ['GBPJPY', 'FOREX'], ['EURGBP', 'FOREX'], ['AUDJPY', 'FOREX'],
];

/** สำเนาของ toYahooSymbol ใน src/lib/market-data.ts (เหตุผลเดียวกับข้างบน) */
function toYahooSymbol(symbol, market) {
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

/** เก็บข่าวย้อนหลังไม่เกินนี้ — เก่ากว่านี้ไม่ช่วยการตัดสินใจแล้ว และทำให้ตารางบวมเปล่า */
const MAX_AGE_HOURS = 48;

const HOSTS = ['https://query1.finance.yahoo.com', 'https://query2.finance.yahoo.com'];

/** คืน null = ดึงไม่ได้ · คืน [] = ดึงได้แต่ไม่มีข่าวที่เกี่ยวข้อง (สองอย่างนี้ต้องแยกกัน) */
async function newsFor(ys) {
  for (const host of HOSTS) {
    try {
      const res = await fetch(
        `${host}/v1/finance/search?q=${encodeURIComponent(ys)}&newsCount=8&quotesCount=0`,
        { headers: { 'User-Agent': 'Mozilla/5.0' } }
      );
      if (!res.ok) continue;
      const j = await res.json();
      const items = Array.isArray(j?.news) ? j.news : [];
      return items
        // ด่านความเกี่ยวข้อง: Yahoo ต้องบอกเองว่าข่าวชิ้นนี้เกี่ยวกับสัญลักษณ์ที่เราถาม
        .filter((n) => Array.isArray(n?.relatedTickers) && n.relatedTickers.includes(ys))
        .filter((n) => n?.uuid && n?.title && n?.link && Number.isFinite(n.providerPublishTime))
        .map((n) => ({
          uuid: n.uuid,
          title: String(n.title).trim(),
          source: n.publisher ? String(n.publisher).trim() : null,
          url: String(n.link),
          published_at: new Date(n.providerPublishTime * 1000).toISOString(),
        }));
    } catch {
      /* โฮสต์ถัดไป */
    }
  }
  return null;
}

async function main() {
  const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!DRY_RUN && (!URL_ || !KEY)) {
    console.log('ข้ามตัวดึงข่าว — ยังไม่ได้ตั้ง NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY');
    return;
  }
  const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };

  const targets = UNIVERSE.slice(0, LIMIT ?? undefined);
  const cutoff = Date.now() - MAX_AGE_HOURS * 3600_000;

  /** uuid → แถวเดียว พร้อมรายชื่อสัญลักษณ์ที่เกี่ยวข้อง (ข่าวชิ้นเดียวเกี่ยวได้หลายตัว) */
  const byUuid = new Map();
  let fetchFail = 0;
  let dropped = 0;

  for (const [sym, market] of targets) {
    const ys = toYahooSymbol(sym, market);
    const items = await newsFor(ys);
    if (items === null) { fetchFail++; continue; }
    for (const it of items) {
      if (Date.parse(it.published_at) < cutoff) { dropped++; continue; }
      const prev = byUuid.get(it.uuid);
      if (prev) { if (!prev.symbols.includes(sym)) prev.symbols.push(sym); continue; }
      byUuid.set(it.uuid, {
        title: it.title,
        summary: null,
        source: it.source,
        url: it.url,
        published_at: it.published_at,
        symbols: [sym],
        // sentiment / sentiment_score ปล่อยว่างโดยตั้งใจ — ดูหมายเหตุหัวไฟล์
        impact: 'info',
      });
    }
  }

  const rows = [...byUuid.values()].sort((a, b) => Date.parse(b.published_at) - Date.parse(a.published_at));
  console.log(
    `ดึง ${targets.length} สัญลักษณ์ · ดึงไม่ได้ ${fetchFail} · เก่าเกิน ${MAX_AGE_HOURS} ชม. ทิ้ง ${dropped} · ` +
    `ข่าวไม่ซ้ำ ${rows.length} ชิ้น`
  );

  if (!rows.length) return;
  if (DRY_RUN) {
    rows.slice(0, 12).forEach((r) => console.log(`  [${r.source ?? '—'}] ${r.title.slice(0, 66)}  → ${r.symbols.join(',')}`));
    console.log('  [dry run] ไม่ได้เขียนฐานข้อมูล');
    return;
  }

  // กันข่าวซ้ำด้วย url — ตาราง news ไม่มี unique constraint จึงต้องเช็คเองก่อนเขียน
  const existing = new Set();
  const since = new Date(cutoff).toISOString();
  const res = await fetch(`${URL_}/rest/v1/news?select=url&published_at=gte.${since}`, { headers: H });
  if (res.ok) for (const r of await res.json()) if (r.url) existing.add(r.url);

  const fresh = rows.filter((r) => !existing.has(r.url));
  if (!fresh.length) { console.log('ข่าวทุกชิ้นมีอยู่แล้ว ไม่ต้องเขียนอะไร'); return; }

  const ins = await fetch(`${URL_}/rest/v1/news`, {
    method: 'POST', headers: { ...H, Prefer: 'return=minimal' }, body: JSON.stringify(fresh),
  });
  if (ins.ok) console.log(`เขียนข่าวใหม่ ${fresh.length} ชิ้น (มีอยู่แล้ว ${rows.length - fresh.length})`);
  else console.log(`เขียนไม่สำเร็จ: ${(await ins.text()).slice(0, 200)}`);
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
