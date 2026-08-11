# 📈 Trading AI — Pro Signals

ระบบสแกนตลาดหาจุดเข้า/ออก จากการวิเคราะห์เทคนิค แล้วแจ้งเตือนเข้า Telegram อัตโนมัติ

รองรับ 5 ตลาด: **ทอง · Forex · หุ้นไทย · หุ้น US · Crypto**

> โปรเจกต์นี้เดิมชื่อ *TikTok Ads AI Manager* และถูกเปลี่ยนเป็นระบบเทรดตั้งแต่ commit `b16f643`
> ถ้าเจอโค้ดหรือเอกสารที่ยังพูดถึง TikTok อยู่ แปลว่าเป็นซากที่ตกสำรวจ — แจ้งหรือลบได้เลย

---

## Tech Stack

| ชั้น | ใช้อะไร |
|---|---|
| Frontend | Next.js 14 (App Router) + TypeScript + Tailwind |
| Backend | Supabase (Postgres + Auth + RLS) |
| ข้อมูลราคา | Yahoo Finance chart API v8 — **ไม่ต้องใช้ API key** |
| แจ้งเตือน | Telegram Bot API |
| งานตามเวลา | Vercel Cron (สแกนตลาด วันละครั้ง 08:00 น.) + GitHub Actions (เฝ้าราคา ทุก 30 นาที) |
| Deploy | Vercel |

---

## ระบบทำงานยังไง

```
เพิ่ม symbol ที่หน้า "ตลาด"
        │  ตรวจกับ Yahoo ก่อนบันทึก — symbol ผิดจะไม่ยอมให้เพิ่ม
        ▼
   ตาราง watchlist
        │
        ├── กดปุ่ม "สแกนตลาด" เอง ──►  POST /api/signals/scan   (เฉพาะของคนที่ล็อกอิน)
        └── Vercel Cron 08:00 น. ──►  GET  /api/cron/scan-markets (ของผู้ใช้ทุกคน)
                                              │
                                              ▼
                              ดึงแท่งเทียนย้อนหลัง 1 ปี จาก Yahoo
                                              │
                                              ▼
                          src/lib/indicators.ts  →  ตัวชี้วัดดิบ
                          src/lib/signal-engine.ts →  ให้คะแนน bull/bear
                                              │
                                    netScore ≥ 3 → BUY
                                    netScore ≤ -3 → SELL
                                    นอกนั้น → ไม่สร้างสัญญาณ
                                              │
                                              ▼
                                     ตาราง signals
                                              │
                            ┌─────────────────┴─────────────────┐
                            ▼                                   ▼
                  แสดงที่หน้า "สัญญาณ"                    ส่ง Telegram
                  กด "เพิ่มเข้าพอร์ต" → trades       (ตาม alert_preferences ของแต่ละคน)
```

ออเดอร์ที่อยู่ในตาราง `trades` จะถูกเฝ้าต่อทุก 30 นาที — ดู [ระบบเฝ้าราคาระหว่างวัน](#ระบบเฝ้าราคาระหว่างวัน)

### เครื่องคำนวณสัญญาณ

เป็น **rule-based scoring** ล้วน ไม่ได้เรียก LLM (ดู [ข้อจำกัด](#ข้อจำกัดที่ควรรู้ก่อนใช้จริง))

| สัญญาณ | ให้คะแนน |
|---|---|
| RSI(14) < 30 / > 70 | ±2 |
| RSI ตัดผ่าน 50 | ±1 |
| MACD ตัด Signal Line | ±2 |
| MACD histogram ขยายตัว | ±1 |
| แนวโน้ม MA20/50/200 เรียงตัว | ±2 (±1 ถ้าข้อมูลไม่ถึง 200 แท่ง) |
| ราคาทะลุ Bollinger Band | ±1 |
| Engulfing / Hammer / Shooting Star | ±2 |
| อยู่ใกล้แนวรับ/แนวต้าน (ในระยะ 1.5%) | ±1 |

- **SL/TP** คิดจาก ATR(14) จริง — ขาดทุน 1.5×ATR, กำไร 3×ATR (RR 1:2) หรือชนแนวรับ/แนวต้านที่ใกล้ที่สุด
- **ความมั่นใจ** = `min(95, 40 + คะแนนรวม × 6)`
- ต้องมีแท่งเทียนอย่างน้อย 50 แท่ง ไม่งั้นข้าม symbol นั้นไป
- MA200 คำนวณเฉพาะเมื่อมีข้อมูลครบ 200 แท่งจริง ไม่ย่อ period ให้สั้นลงเพื่อให้มีเลขโชว์
- ตัวชี้วัดคืน `NaN` เมื่อข้อมูลไม่พอ ไม่เดาค่าแทน
- RSI ใช้ Wilder smoothing และ EMA seed ด้วย SMA — ตรงกับที่ TradingView/MT4 คำนวณ
- ไม่สร้างสัญญาณ symbol+action เดิมซ้ำภายใน 20 ชั่วโมง

**การรับประกันเรื่อง SL/TP ของสัญญาณ** — สัญญาณ BUY ต้องได้ `stop_loss < entry < take_profit`
และ SELL ต้องได้ `take_profit < entry < stop_loss` เสมอ บังคับไว้ 3 ชั้น:

1. เลือกแนวรับที่อยู่ **ใต้** ราคา และแนวต้านที่อยู่ **เหนือ** ราคาเท่านั้น
   (เดิมวัดด้วยระยะทางสัมบูรณ์ พอราคาหลุดใต้แนวรับเดิม แนวรับนั้นถูกเลือกมาเป็น SL ของ BUY ได้)
2. ตรวจค่าที่คำนวณเสร็จแล้วอีกครั้ง เพราะตัวคูณเผื่อ slippage (0.995 / 1.005) เลื่อนค่าข้ามฝั่ง entry ได้
3. ตรวจซ้ำ **หลังปัดทศนิยม** เพราะค่าที่ห่างจาก entry น้อยกว่าครึ่งหน่วยปัดจะยุบมาเท่ากับ entry พอดี
   ด่านไหนไม่ผ่านให้ถอยไปใช้สูตร ATR ถ้ายังไม่ผ่านอีกก็ไม่ออกสัญญาณเลย

การปัดราคาเลือกตาม **ขนาดของราคา** ไม่ใช่ชนิดตลาดอย่างเดียว — ราคาต่ำกว่า 1 ใช้เลขนัยสำคัญ
เพราะเดิมปัด 4 ตำแหน่งกับทุกตลาดแล้วเหรียญราคาถูกยุบเป็นศูนย์ทั้งชุด
(PEPE-USD ราคาจริง `0.0000061957` → `0` ทั้ง entry/SL/TP แล้ว UI คำนวณ RR ออกมาเป็น `NaN`)

---

## ระบบเฝ้าราคาระหว่างวัน

> ⚠️ **ไม่ได้ต่อกับโบรกเกอร์ และไม่เคยส่งคำสั่งซื้อขายจริง**
> ระบบนี้เป็น *สมุดบันทึกการเทรด* การ "ปิดออเดอร์อัตโนมัติ" คือการบันทึกลงตาราง `trades` ว่า
> **ถ้า** คุณตั้ง SL/TP ไว้ที่โบรกเกอร์จริง ออเดอร์นี้จะถูกตัดที่ราคาเท่าไหร่
> เงินจริงในพอร์ตของคุณไม่ได้ขยับตาม ต้องไปจัดการที่โบรกเกอร์เอง

```
GitHub Actions ทุก 30 นาที
        │  Authorization: Bearer CRON_SECRET  ← บังคับต้องมี (fail-closed)
        ▼
GET /api/cron/monitor-positions
        │
        ▼
ออเดอร์ทั้งหมดที่ status = 'open'  (ของผู้ใช้ทุกคน — ใช้ service-role เพราะ cron ไม่มี session)
        │
        ▼
ดึงราคาล่าสุดของแต่ละ symbol จาก Yahoo (ดึงครั้งเดียวต่อ symbol แล้วใช้ซ้ำ)
        │
        ├── ไม่ชน SL/TP → อัปเดต pnl / pnl_percent แบบ unrealized (ออเดอร์ยังเปิดอยู่)
        │
        └── ชน SL หรือ TP → status = 'closed' + exit_price = ระดับที่ชน + ส่ง Telegram
```

> ⚠ **`/api/cron/monitor-positions` เป็น fail-closed** — ไม่มี `CRON_SECRET` แล้วมันปฏิเสธ
> ทุกคำขอ ไม่ใช่เปิดโล่ง แปลว่า **ถ้าลืมตั้ง secret ระบบเฝ้าราคาจะไม่ทำงานเลย**
> (ต่างจาก `/api/cron/scan-markets` ที่ข้ามการตรวจเมื่อไม่มีค่า จึงยังยิงได้)
> ฝั่ง workflow ก็จะขึ้น `::warning::` ให้เห็นเป็นสีเหลืองในแท็บ Actions แทนที่จะเงียบ

> ⚠ **ความถี่ถูกจำกัดด้วยโควตา GitHub Actions ไม่ใช่ด้วยเทคนิค** — repo นี้เป็น private
> จึงถูกคิดนาที ดูรายละเอียดและทางเลือกที่ [ตั้งตัวจับเวลาให้ระบบเฝ้าราคา](#ตั้งตัวจับเวลาให้ระบบเฝ้าราคา)

### กฎที่ใช้ตัดสินว่าชน SL/TP หรือยัง

ดูจากช่วงราคา `[low, high]` ไม่ใช่ราคาปัจจุบันจุดเดียว เพราะราคาอาจแทะ SL/TP แล้วเด้งกลับ
ระหว่างที่ cron ยังไม่ถึงรอบถัดไป

| ทิศทาง | ถือว่าชน Stop Loss เมื่อ | ถือว่าถึง Take Profit เมื่อ |
|---|---|---|
| `long` | `low ≤ stop_loss` | `high ≥ take_profit` |
| `short` | `high ≥ stop_loss` | `low ≤ take_profit` |

**ช่วงราคาที่เอามาตรวจ เลือกจาก "รอบซื้อขาย" ที่ `high_24h`/`low_24h` เป็นเจ้าของ:**

รอบซื้อขายตัดสินจาก **timestamp ของแท่งเทียนรายวันแท่งล่าสุด** ที่ `fetchChart` คืนมา
(`candles[candles.length - 1].timestamp`) ซึ่ง `resolvePriceWindow` รับเป็นพารามิเตอร์ที่ 3

| กรณี | ช่วงที่ใช้ | เหตุผล |
|---|---|---|
| `opened_at` **เก่ากว่า** เวลาเปิดของแท่งล่าสุด | `[low_24h, high_24h]` | ต้องจับ wick ที่แทงถึง SL/TP แล้วเด้งกลับให้ได้ |
| `opened_at` อยู่ **ในรอบเดียวกัน** กับแท่งล่าสุด | `[price, price]` เท่านั้น | `high`/`low` ของรอบนั้นอาจเกิด *ก่อน* ที่ออเดอร์จะเปิด ใช้แล้วจะปิดออเดอร์ผิด |
| ไม่ได้ส่งเวลาแท่งล่าสุดมา / อ่านไม่ได้ | `[price, price]` | ถอยไปทางที่ปลอดภัย ยอมพลาด wick ดีกว่าปิดออเดอร์ผิด |
| `high_24h` / `low_24h` ไม่ใช่ตัวเลขที่ใช้ได้ | `[price, price]` | ไม่เดาค่าแทนข้อมูลที่ไม่มี |

> 🐛 **เดิมใช้ "วัน UTC" ของ `quote.updated_at` ตัดสิน แล้วปิดออเดอร์ผิด**
> `updated_at` คือเวลาที่ยิง fetch ไม่ใช่วันของรอบซื้อขาย พอ cron รันหลังเที่ยงคืน UTC
> แต่ตลาดยังไม่เปิดรอบใหม่ ออเดอร์ที่เพิ่งเปิดในรอบเดิมจะถูกนับเป็น "คนละวัน"
> แล้วเอาไปตรวจกับช่วงราคาทั้งรอบ รวมช่วงก่อนที่ออเดอร์จะมีอยู่จริง

**กฎเพิ่มเติมที่ต้องรู้:**

- **SL/TP ที่ตั้งไว้ผิดฝั่งของราคาเข้าจะถูก "เมิน" ไม่เอาไปปิดออเดอร์**
  นับว่าผิดฝั่งเมื่อ `long` ตั้ง `stop_loss` ≥ entry หรือ `take_profit` ≤ entry
  และ `short` ตั้ง `stop_loss` ≤ entry หรือ `take_profit` ≥ entry
  ระดับพวกนี้จะเข้าเงื่อนไขตั้งแต่วินาทีแรกแล้วปิดออเดอร์ทิ้งพร้อมป้ายที่ขัดกับตัวเลข
  (เคยเจอจริง: `long` entry 100 / stop 100.893 → ปิดด้วยป้าย "ชน Stop Loss" แต่ pnl = **+8.93**)
  ตอนนี้ออเดอร์จะถูกปล่อยไว้เฉย ๆ แทน เพราะการปิดย้อนกลับไม่ได้ และ Telegram ที่ส่งไปแล้วเรียกคืนไม่ได้
  แต่ด้านที่ถูกเมินจะถูก **รายงานออกมาในฟิลด์ `ignored`** ไม่ได้กลืนเงียบ — ถ้าเห็นค่านี้
  แปลว่าต้นทางตั้ง SL/TP ผิด ต้องไปแก้ที่ `signal-engine` หรือแก้ออเดอร์เอง
- **ชนทั้ง SL และ TP ในช่วงเดียวกัน → นับว่า SL โดนก่อนเสมอ** เพราะข้อมูลรายวันบอกไม่ได้ว่า
  high กับ low อันไหนเกิดก่อน จึงเลือกทางที่แย่กว่าไว้ก่อน ดีกว่ารายงานกำไรที่อาจไม่มีจริง
- `exit_price` = **ระดับ SL/TP ที่ชน** ไม่ใช่ราคาปัจจุบัน — เพราะคำสั่ง stop จริงจะถูกตัดที่ระดับนั้น
- `stop_loss` หรือ `take_profit` เป็น `null` (หรือ ≤ 0) → ข้ามการตรวจด้านนั้นไปเฉย ๆ ไม่ได้ถือว่าชน
- ออเดอร์ที่ยังไม่ชนอะไร `pnl` ที่เห็นเป็นตัวเลข **ยังไม่รับรู้จริง** (unrealized) คิดจากราคาล่าสุด

สูตรเดียวกับตอนกดปิดออเดอร์เองที่หน้า **พอร์ต** (`PATCH /api/trades`)

```
sign = direction === 'long' ? 1 : -1
diff = (ราคาที่ออก − entry_price) × sign
pnl         = diff × quantity − fees
pnl_percent = (diff ÷ entry_price) × 100
```

---

## เริ่มใช้งาน

### 1. ติดตั้ง

```bash
npm install
```

### 2. ตั้งค่า environment

```bash
cp .env.example .env.local
```

ต้องกรอกแค่ 3 ค่าจาก Supabase (`URL`, `ANON_KEY`, `SERVICE_ROLE_KEY`)
ราคาทั้งหมดดึงจาก Yahoo Finance ที่ใช้ฟรี จึงไม่ต้องมี API key ตัวอื่นเลย

อยากลองหน้าตาก่อนโดยไม่ต่อฐานข้อมูล ตั้ง `NEXT_PUBLIC_DEMO_MODE=true` แล้วข้ามข้อ 3 ไปได้

### 3. เตรียมฐานข้อมูล

```bash
npx supabase link --project-ref <project-ref>
npm run db:push
```

### 4. รัน

```bash
npm run dev
```

เปิด http://localhost:3000 → สมัครบัญชี → เพิ่ม symbol ที่หน้า **ตลาด** → กด **สแกนตลาด**

### 5. เปิดแจ้งเตือน Telegram (ไม่บังคับ)

ไปที่หน้า **ตั้งค่า → Telegram Bot** แล้วทำตามขั้นตอนที่แสดงไว้ในหน้านั้น
ค่าที่กรอกจะถูกเก็บลงตาราง `profiles` — cron อ่านจากตรงนี้ ไม่ใช่จาก localStorage

---

## ข้อจำกัดที่ควรรู้ก่อนใช้จริง

ส่วนที่ **ยังไม่ได้ทำ** — เขียนไว้ตรง ๆ เพื่อไม่ให้เข้าใจผิดว่าใช้ได้แล้ว

| เรื่อง | สถานะ |
|---|---|
| หน้าข่าว | ❌ ไม่มีโค้ดดึงข่าว ตาราง `news` ว่างเปล่าถาวร (แต่ `generateSignal` รองรับ `newsSentiment` ไว้แล้ว รอแค่คนป้อนค่าเข้ามา) |
| AI (Claude) | ❌ ยังไม่ได้ต่อ — `@anthropic-ai/sdk` ติดตั้งไว้แต่ยังไม่มีไฟล์ไหน import สัญญาณทุกตัวมาจาก rule-based scoring ล้วน |
| แจ้งเตือน "ข่าวสำคัญ" | ❌ ปุ่มในหน้าตั้งค่ายังล็อกไว้ เพราะยังไม่มีแหล่งข่าว (ส่วนแจ้งเตือน SL/TP ใช้ได้แล้ว) |
| `total_pnl_percent` บน Dashboard | ❌ ยังไม่มีที่ให้กรอกเงินทุนตั้งต้น จึงคำนวณไม่ได้ — ตอนนี้ **ซ่อนป้ายเปอร์เซ็นต์ไปเลย** แทนที่จะโชว์ `+0.0%` ที่ไม่มีที่มา |
| ยอดกำไร/ขาดทุนรวม | ⚠️ เป็นการ **บวกข้ามสกุลเงิน** ตรง ๆ (หุ้นไทยเป็นบาท · หุ้น US/ทอง/forex เป็นดอลลาร์) โดยไม่แปลงอัตราแลกเปลี่ยน จึงแสดงเป็นตัวเลขเปล่าไม่ติดสัญลักษณ์สกุลเงิน — ถ้าถือหลายตลาดพร้อมกัน ยอดรวมนี้ตีความตรง ๆ ไม่ได้ |
| Backtest | ❌ ยังไม่มี — ตัวเลข win rate มาจากออเดอร์ที่บันทึกเองเท่านั้น |

> ⚠️ **ระบบนี้ไม่ใช่คำแนะนำการลงทุน** สัญญาณที่ได้มาจากสูตรคณิตศาสตร์บนราคาย้อนหลัง
> ไม่เคยผ่านการ backtest และไม่รับประกันผลใด ๆ ตัดสินใจเองก่อนลงเงินจริงเสมอ

---

## โครงสร้างโปรเจกต์

```
src/
├── app/
│   ├── api/
│   │   ├── auth/callback/      แลก code → session หลังยืนยันอีเมล
│   │   ├── cron/
│   │   │   ├── scan-markets/       งานรายวัน สแกนของผู้ใช้ทุกคน + ส่ง Telegram
│   │   │   └── monitor-positions/  ทุก 30 นาที — เฝ้า SL/TP ของออเดอร์ที่เปิดอยู่
│   │   │                           อัปเดต pnl แบบ unrealized + signals.current_price
│   │   │                           บังคับต้องมี CRON_SECRET (fail-closed)
│   │   ├── profile/            โปรไฟล์ + การตั้งค่าแจ้งเตือน (cron อ่านจากที่นี่)
│   │   ├── signals/scan/       ปุ่ม "สแกนตลาด" เฉพาะของคนที่ล็อกอิน
│   │   ├── telegram/test/      ทดสอบส่งข้อความ
│   │   ├── trades/             เปิด (POST) / ปิด (PATCH) ออเดอร์
│   │   └── watchlist/          เพิ่ม-ลบ symbol ที่ติดตาม
│   ├── dashboard/  markets/  signals/  trades/  news/  settings/
│   └── auth/login/
├── components/
│   ├── charts/     EquityChart
│   ├── dashboard/  MetricCard
│   ├── trading/    SignalCard · MarketRow · TradeRow
│   └── ui/         Header (ปุ่มสแกน + ค้นหา) · Sidebar
├── hooks/
│   ├── useData.ts   watchlist / prices / signals / trades / news / stats
│   └── useStore.ts  zustand — refreshKey สำหรับสั่งโหลดข้อมูลใหม่ทั้งหน้า
├── lib/
│   ├── indicators.ts      RSI · MACD · EMA/SMA · Bollinger · ATR · S/R · patterns
│   ├── signal-engine.ts   รวมทุกตัวชี้วัด → ตัดสิน BUY/SELL/HOLD + SL/TP
│   ├── position-monitor.ts  pure function ตัดสิน SL/TP + คิด pnl (ไม่แตะ DB/network)
│   ├── market-data.ts     ตัวห่อ Yahoo Finance + แปลงชื่อ symbol ตามตลาด
│   ├── telegram.ts        จัดรูปข้อความ + ส่ง (มี fallback เป็น plain text)
│   ├── supabase.ts        client ฝั่ง browser
│   ├── supabase-server.ts client ฝั่ง server — route client (ติด RLS) + admin (ข้าม RLS)
│   └── demo-data.ts       ข้อมูลตัวอย่างสำหรับโหมด Demo
├── middleware.ts          ตรวจ session จริงผ่าน Supabase + ต่ออายุ token
└── types/index.ts

supabase/migrations/
├── 001_initial_schema.sql       ปลดระวางแล้ว (เดิมเป็นสคีมา TikTok)
├── 002_trading_schema.sql       สคีมาหลักของระบบเทรด
└── 003_position_monitoring.sql  ฟิลด์ที่ตัวเฝ้าราคาต้องใช้ (ALTER ล้วน ไม่ลบข้อมูล)

.github/workflows/
├── deploy.yml               lint + build ทุก push · deploy job ข้ามเองถ้าไม่มี secrets
└── monitor-positions.yml    ตัวจับเวลายิง /api/cron/monitor-positions ทุก 30 นาที
```

### การแปลงชื่อ symbol

กรอกชื่อสั้น ๆ ได้เลย ระบบเติมส่วนต่อท้ายของ Yahoo ให้เอง ([market-data.ts](src/lib/market-data.ts))

| ตลาด | กรอก | ระบบแปลงเป็น |
|---|---|---|
| GOLD | `XAUUSD` · `XAGUSD` | `GC=F` · `SI=F` |
| FOREX | `EURUSD` | `EURUSD=X` |
| TH_STOCK | `PTT` | `PTT.BK` |
| US_STOCK | `AAPL` | `AAPL` |
| CRYPTO | `BTC` | `BTC-USD` |

---

## ความปลอดภัย

- ทุก route ยืนยันตัวตนจาก **session cookie จริง** ผ่าน `supabase.auth.getUser()` ไม่เชื่อ header ที่ client ส่งมา
- การอ่าน-เขียนข้อมูลผู้ใช้วิ่งผ่าน client ที่ติด RLS ทั้งหมด → ยุ่งกับข้อมูลคนอื่นไม่ได้แม้จะรู้ id
- service-role client ใช้เฉพาะสองที่: cron (ไม่มี session) และเขียน cache `market_prices` (ข้อมูลมาจาก Yahoo ล้วน ไม่มีอะไรที่ผู้ใช้ส่งเข้ามา)
- Telegram bot token ไม่เคยถูกส่งกลับไปฝั่ง browser — API บอกแค่ว่า "ตั้งไว้แล้วหรือยัง"
- `/api/cron/scan-markets` และ `/api/cron/monitor-positions` ป้องกันด้วย `CRON_SECRET`
  โดย **`monitor-positions` เป็น fail-closed** — ไม่มี secret แล้วปฏิเสธทุกคำขอ (จึงหยุดทำงานทั้งระบบ)
  ส่วน `scan-markets` ข้ามการตรวจเมื่อไม่ได้ตั้งค่า

### ⚠ กติกาการแก้ migration

`002_trading_schema.sql` ถูกออกแบบให้ **รันซ้ำได้โดยไม่ลบข้อมูล** ทุก `CREATE` เป็น `IF NOT EXISTS`

**ห้ามใส่ `DROP TABLE` ของตารางฝั่งเทรดลงในไฟล์นี้** (`watchlist` · `signals` · `trades` · `telegram_alerts` · `market_prices` · `news`)
เพราะ `supabase db push` และ `db reset` จะรันไฟล์เดิมซ้ำ แล้วลบข้อมูลผู้ใช้ทิ้งทั้งหมด

ถ้าต้องเปลี่ยนโครงสร้างตาราง → เขียนไฟล์ migration ใหม่เป็น `ALTER TABLE` เสมอ

---

## Deploy

**Production:** https://trading-ai-ivory.vercel.app (โปรเจกต์ `trading-ai` บน Vercel)

ยังไม่ได้เชื่อม Git integration — ตอนนี้ deploy ด้วยมือจากเครื่อง:

```bash
npx vercel deploy --prod
```

ถ้าอยากให้ deploy เองทุกครั้งที่ push ต้องไป authorize Vercel กับ GitHub ก่อน
ที่ Vercel Dashboard → Project → Settings → Git แล้วเชื่อม repo `SLIPandTIKTOK/TIKTOK`

environment variables ฝั่ง production ตั้งครบแล้วทั้ง 5 ตัว
(`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`,
`NEXT_PUBLIC_DEMO_MODE=false`, `CRON_SECRET`) — ตั้งเฉพาะ environment `production`
ถ้าจะใช้ preview deployment ต้องตั้งเพิ่มเอง

Cron ของ **การสแกนตลาด** อ่านจาก `vercel.json` → `0 1 * * *` UTC = **08:00 น. เวลาไทย**

[.github/workflows/deploy.yml](.github/workflows/deploy.yml) รัน lint + build ทุก push
ส่วน job deploy จะข้ามไปเงียบ ๆ ถ้ายังไม่ได้ตั้ง secrets — ไม่ทำให้ CI แดงค้าง

### ตั้งตัวจับเวลาให้ระบบเฝ้าราคา

Vercel Hobby plan ให้ cron ได้แค่วันละครั้ง และโควตานั้นถูกการสแกนตลาดใช้ไปแล้ว
งานเฝ้าราคาจึงถูกยิงจาก [.github/workflows/monitor-positions.yml](.github/workflows/monitor-positions.yml) แทน
ตอนนี้ตั้งไว้ที่ **ทุก 30 นาที** (`*/30 * * * *`)

ต้องตั้ง secret ให้ GitHub ก่อน ไม่งั้น workflow จะข้ามตัวเองทุกรอบ (พร้อม `::warning::` สีเหลือง)
และเพราะ endpoint เป็น fail-closed **การไม่ตั้ง secret = ไม่มีอะไรเฝ้าราคาให้เลย**

1. เปิด repo บน GitHub → **Settings → Secrets and variables → Actions**
2. กด **New repository secret**
3. Name: `CRON_SECRET` · Secret: **ค่าเดียวกับที่ตั้งไว้ใน Vercel environment variables**
   (ถ้าไม่ตรงกัน endpoint จะตอบ 401 แล้ว workflow จะขึ้นแดงพร้อม response body ให้ดู)
4. กดรันเองได้ทันทีที่แท็บ **Actions → Monitor Positions → Run workflow** ไม่ต้องรอรอบถัดไป

> GitHub schedule ไม่การันตีเวลา ช่วงคนใช้เยอะอาจดีเลย์ 5–15 นาที และถ้า repo เงียบเกิน 60 วัน
> GitHub จะปิด schedule ให้อัตโนมัติ ต้องเข้าไปกดเปิดใหม่เอง

#### ⚠ ทำไมถึงเป็น 30 นาที ไม่ใช่ 15 — เรื่องโควตา Actions

repo `SLIPandTIKTOK/TIKTOK` เป็น **private** GitHub จึงคิดนาที Actions
(public repo เท่านั้นที่ใช้ฟรีไม่จำกัด) แผนฟรีให้ **2,000 นาที/เดือน**
และ GitHub **ปัดขึ้นเป็นนาทีเต็มต่อ job** ต่อให้ job นี้ยิง curl เสร็จใน 10 วินาที ก็ถูกหัก 1 นาที

| ความถี่ | รอบ/เดือน | นาทีที่ใช้ | ผล |
|---|---|---|---|
| `*/15 * * * *` | 4 × 24 × 30 = **2,880** | ≥ 2,880 | ❌ เกินโควตา 2,000 ตั้งแต่ยังไม่นับ deploy.yml |
| `*/30 * * * *` | 2 × 24 × 30 = **1,440** | ≈ 1,440 | ✅ เหลือ ~560 นาทีให้ `deploy.yml` |

`deploy.yml` รัน `npm ci` + lint + build ทุก push ตกราว 3–4 นาที/push (+1 นาทีของ `check-secrets`)
→ ~560 นาทีที่เหลือพอราว **100–140 push/เดือน**

**เรื่องที่อันตรายกว่าที่คิด:** พอโควตาหมด GitHub จะ**หยุดรัน workflow เงียบ ๆ**
ไม่มี notification ไม่มี run สีแดงให้เห็น หน้าเว็บก็ยังดูปกติทุกอย่าง
ผู้ใช้จะเชื่อว่ายังมีตัวเฝ้าราคาให้อยู่ทั้งที่ไม่มีแล้ว — ออเดอร์ที่ชน SL/TP จะไม่ถูกบันทึก
และไม่มี Telegram ส่งออกไป เช็คโควตาที่เหลือได้ที่ **Settings → Billing and plans → Usage**

**อยากได้ทุก 15 นาทีจริง ๆ ต้องทำอย่างใดอย่างหนึ่งก่อน:**

1. เปลี่ยน repo เป็น **public** — Actions บน public repo ไม่คิดนาที (แต่โค้ดจะเปิดเผยทั้งหมด)
2. อัป **GitHub plan** (Team/Pro) เพื่อเพิ่มโควตานาที
3. ย้ายไป **pg_cron บน Supabase Pro** ตามหัวข้อถัดไป — ไม่กินโควตา Actions เลย

#### ทางเลือก: pg_cron บน Supabase (ต้อง Pro plan)

ตรงเวลากว่า ตั้งให้ถี่กว่าได้ และไม่แตะโควตา GitHub Actions เพราะยิงจากในฐานข้อมูลเอง
(ใช้ตัวใดตัวหนึ่งพอ ถ้าเปิดทั้งคู่จะกลายเป็นยิงซ้ำโดยเปล่าประโยชน์ —
เปลี่ยนมาใช้ pg_cron แล้วให้ปิด schedule ใน `monitor-positions.yml` ด้วย)

**ต้องเปิด extension `pg_cron` และ `pg_net` ก่อน** (Dashboard → Database → Extensions
หรือรัน `create extension` สองบรรทัดแรกข้างล่าง) ถ้ายังไม่เปิด `cron.schedule` กับ `net.http_get`
จะ error ว่าไม่รู้จัก schema — ไม่ใช่เงียบ ๆ ไม่ทำงาน

> เช็คแผนของโปรเจกต์ตัวเองกับหน้า pricing ของ Supabase ก่อน (แผนที่รองรับเปลี่ยนได้)
> ที่เขียนว่า "ต้อง Pro" ไว้เพราะ Free plan จะ **หยุดโปรเจกต์อัตโนมัติเมื่อไม่มี activity**
> ซึ่งทำให้ตัวจับเวลาหยุดตามไปด้วย — เป็นการหยุดแบบเงียบแบบเดียวกับโควตา Actions หมด

```sql
-- รันใน SQL Editor ของ Supabase (ต้อง Pro plan)
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- เก็บ secret ใน Vault อย่าเขียนค่าจริงลงใน cron.schedule ตรง ๆ
-- เพราะ SQL ของ job ถูกอ่านได้จากตาราง cron.job
select vault.create_secret('<CRON_SECRET ตัวเดียวกับบน Vercel>', 'cron_secret');

-- ทุก 15 นาที — ตรงนี้ถี่ได้เพราะไม่ได้กินโควตา GitHub Actions
-- CRON_SECRET บังคับต้องมี ไม่งั้น endpoint ตอบ 401 ทุกครั้ง (fail-closed)
select cron.schedule(
  'monitor-positions',
  '*/15 * * * *',
  $$
  select net.http_get(
    url     := 'https://trading-ai-ivory.vercel.app/api/cron/monitor-positions',
    headers := jsonb_build_object(
      'Authorization',
      'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
    ),
    timeout_milliseconds := 120000
  );
  $$
);

-- pg_net ยิงแบบ async — ผลลัพธ์ไม่โผล่ใน cron.job_run_details ต้องดูที่นี่
-- status_code ต้องเป็น 200 ถ้าเจอ 401 แปลว่า secret ใน Vault ไม่ตรงกับบน Vercel
select id, status_code, created from net._http_response order by created desc limit 10;

-- ดูว่า job ถูกตั้งไว้จริงไหม:  select jobid, jobname, schedule, active from cron.job;
-- เลิกใช้เมื่อไหร่:              select cron.unschedule('monitor-positions');
```

---

## คำสั่งที่ใช้บ่อย

```bash
npm run dev        # dev server
npm run build      # production build
npm run lint       # eslint
npm run db:push    # ส่ง migration ขึ้น Supabase
npm run db:types   # gen TypeScript types จากสคีมา (ต้องมี local supabase)
```
