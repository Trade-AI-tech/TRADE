import type { ScorecardPair, SpeedScorecardFile, SpeedScoreInput } from './speed-scorecard';
import rawScorecard from './speed-scorecard.data.json';

/**
 * speed-scorecard.full.ts — ทางเข้าเดียวของ "ก้อนใหญ่" speed-scorecard.data.json
 *
 * ⛔ ห้าม import ไฟล์นี้จาก client component หรือจากไฟล์ที่ client component ดึงเข้าไป
 *    ก้อนใหญ่ = 162,952 ไบต์ · webpack จะยัดมันลง chunk ของหน้าเว็บทั้งก้อน
 *    (วัดจาก next build จริง: หน้า /signals ที่ดึงก้อนใหญ่ chunk = 119,359 ไบต์
 *     เป็น JSON.parse ก้อนเดียว 96,965 ไบต์ · พอเปลี่ยนเป็นก้อนย่อเหลือ 45,990 ไบต์)
 *    ฝั่งเบราว์เซอร์ให้ใช้ speed-scorecard.ts ซึ่งอ่านก้อนย่อแทน
 *
 * ✅ ที่นี่มีไว้ให้ฝั่ง server / API route / สคริปต์วิเคราะห์ ที่อยากได้ช่องที่ก้อนย่อ
 *    ตัดทิ้ง: winRate · avgR · profitFactor · exitShare · bars · firstBar/lastBar ·
 *    ตัวเลข gated รายคู่ · เส้นโค้ง K ครบทุกระดับ · unmeasured
 *
 * ถ้าจะเปิดอ่านด้วยตาเฉย ๆ ไม่ต้องผ่านโค้ด ให้ดู speed-scorecard.evidence.json
 * ซึ่งเป็นหลักฐานเต็มกว่านี้อีก และไม่มีใคร import
 */

const FULL = rawScorecard as unknown as SpeedScorecardFile;

/**
 * ก้อนใหญ่ทั้งไฟล์ — ใช้ตอนอยากอ่านช่องที่ตัวอ่านฝั่งเบราว์เซอร์ไม่มี
 * ตั้งใจไม่ห่อ API สวย ๆ ให้ เพราะคนที่ต้องใช้ระดับนี้คือคนที่กำลังตรวจข้อมูลด้วยตา
 */
export const SCORECARD_FULL: SpeedScorecardFile = FULL;

const keyOf = (symbol: string, market: string, timeframe: string) =>
  `${symbol.trim().toUpperCase()}|${market.trim().toUpperCase()}|${timeframe.trim().toUpperCase()}`;

const FULL_PAIR_INDEX: Map<string, ScorecardPair> = new Map(
  FULL.pairs.map((p) => [keyOf(p.symbol, p.market, p.timeframe), p])
);

/**
 * แถวเต็มของคู่หนึ่ง — คู่ขนานกับ scorecardPair() ใน speed-scorecard.ts
 * ใช้กติกาการเทียบกุญแจแบบเดียวกันเป๊ะ (trim + uppercase ทั้งสามช่อง)
 * เพื่อให้ "คู่ที่หาเจอ" ของสองฝั่งเป็นชุดเดียวกันเสมอ ไม่งั้นฝั่งหนึ่งเจอ อีกฝั่งไม่เจอ
 * จะกลายเป็นความต่างที่หาไม่เจอตอนดีบัก
 */
export function scorecardPairFull(input: SpeedScoreInput): ScorecardPair | null {
  return FULL_PAIR_INDEX.get(keyOf(input.symbol, input.market, input.timeframe)) ?? null;
}
