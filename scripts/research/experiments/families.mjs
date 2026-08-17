#!/usr/bin/env node
/**
 * families.mjs — ทดสอบสมมติฐาน "สองตระกูลกฎหักล้างกันเอง"
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 *  ไฟล์นี้ไม่คำนวณสัญญาณเอง และไม่ทำ backtest เอง
 *  มันสั่ง scripts/research/lab.mjs (เครื่องวัดตัวจริง) แล้วอ่านผลกลับมาเปรียบเทียบ
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * ── สมมติฐานที่ทดสอบ ──────────────────────────────────────────────────────────
 *
 * เครื่องยนต์ปัจจุบันเอา "กฎสวนเทรนด์" (RSI<30, ราคาหลุด BB ล่าง, ราคาแตะแนวรับ,
 * แท่งกลับตัว) กับ "กฎตามเทรนด์" (MA20>MA50>MA200, MACD ตัดขึ้น, histogram โต,
 * RSI ตัดขึ้น 50) มาบวก bullScore ก้อนเดียวกัน ทั้งที่เป็นกลยุทธ์คนละแบบที่ใช้ได้
 * คนละสถานการณ์ ถ้าสมมติฐานถูก การแยกสองตระกูลออกจากกันควรทำให้ผลดีขึ้น
 *
 * ── การแบ่งตระกูล (ประกาศไว้ก่อนเห็นผล ห้ามแก้ทีหลัง) ────────────────────────
 *
 *  ตามเทรนด์ (เดิมพันว่าจะไปต่อ)   : trend · macdCross · macdHistogram · rsi.cross
 *  สวนเทรนด์ (เดิมพันว่าจะกลับตัว) : rsi.zones · bollinger · supportResistance · patterns
 *  ไม่จัดตระกูล                     : news (ในการ backtest ไม่มี newsSentiment ส่งเข้าไป
 *                                     กฎนี้จึงไม่เคยทำงาน — ใช้เป็น negative control)
 *
 *  เหตุผลที่ patterns อยู่ฝั่งสวนเทรนด์: ทั้งสี่รูปแบบที่ต้นฉบับใช้ (Hammer,
 *  Bullish/Bearish Engulfing, Shooting Star) เป็นรูปแบบ "กลับตัว" ตามตำรา
 *  ข้อนี้เป็นการตัดสินใจเชิงทฤษฎีที่เถียงได้ จึงมีแขน L8 (ปิด patterns เดี่ยว ๆ)
 *  ให้ดูผลของมันแยกออกมาต่างหากด้วย
 *
 * ── กติกาที่ไฟล์นี้บังคับตัวเอง ──────────────────────────────────────────────
 *
 *  1. รายการแขนทดลองทั้งหมด (ARMS) และรายการการเปรียบเทียบ (COMPARISONS) เขียน
 *     ตายตัวไว้ในไฟล์นี้ *ก่อน* รันครั้งแรก — จำนวนการเทียบจึงถูกกำหนดล่วงหน้า
 *     ไม่ใช่ค่อยนับตอนเห็นผลแล้ว (การนับทีหลัง = ซ่อนการเทียบที่แพ้)
 *  2. ค่า p ทุกตัวถูกแก้ด้วย Holm-Bonferroni ตามจำนวนการเทียบทั้งหมด
 *  3. ทุกส่วนต่างคำนวณสองครั้ง: บน R ปกติ และบน R ที่ตัดที่ ±10 (คอลัมน์ "ค+ข"
 *     ของตารางตรวจเครื่องวัด) ถ้าข้อสรุปพลิกระหว่างสองแบบ = ผลของหาง ห้ามรายงานว่าเจอ
 *     (กติกาบังคับจาก report/metric-fix.md หัวข้อ 7)
 *  4. ทุกแขนวัดบน train ก่อน · validation แตะเฉพาะรายชื่อที่ส่งมาทาง --arms เท่านั้น
 *     และไฟล์นี้บันทึกจำนวนครั้งที่แตะ validation ลง exp-families-validation-log.json
 *
 * ── ความไม่แน่นอนของการเทียบ ─────────────────────────────────────────────────
 *
 * แต่ละแขนให้ "ไม้คนละชุด" (เปลี่ยนกฎ = สัญญาณเปลี่ยน = ไม้เปลี่ยน) จึงเทียบแบบ
 * จับคู่รายไม้ไม่ได้ แต่จับคู่ที่ระดับ "สัญลักษณ์ × กรอบเวลา" ได้ เพราะทุกแขนวิ่งบน
 * คลังข้อมูลชุดเดียวกัน bootstrap จึงสุ่ม *คลัสเตอร์* (symbol|timeframe) ทั้งก้อน
 * แล้วเอาไม้ของทั้งสองแขนในคลัสเตอร์ที่ถูกหยิบมาคิดค่าเฉลี่ยของแต่ละแขนในรอบนั้น
 * วิธีนี้กันความสัมพันธ์ภายในสัญลักษณ์ (ตลาดเดียว ยุคเดียว) ออกจากช่วงความเชื่อมั่น
 * ซึ่งเป็นกติกาเดียวกับ ciCluster ของ lab.mjs
 *
 * ── วิธีใช้ ──────────────────────────────────────────────────────────────────
 *
 *   node scripts/research/experiments/families.mjs --stage=train
 *   node scripts/research/experiments/families.mjs --stage=validation --arms=F1,F2,RG
 *   node scripts/research/experiments/families.mjs --stage=analyze
 *
 * ผลดิบต่อแขนถูกย่อเป็นผลรวมรายคลัสเตอร์แล้วเก็บที่
 * report/exp-families-agg-<split>.json (ไฟล์ .csv/.json ก้อนใหญ่ของ lab ถูกลบทิ้ง
 * หลังย่อเสร็จ เพราะกินพื้นที่หลายร้อยเมกะไบต์ ส่วนรายงาน .txt เก็บไว้เป็นหลักฐาน
 * ที่ report/exp-families/)
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

import { ROOT, loadSrcModules } from '../load-src-modules.mjs';

const CACHE_DIR = path.join(ROOT, '.research-cache', 'candles');
const REPORT_DIR = path.join(ROOT, 'scripts', 'research', 'report');
const KEEP_DIR = path.join(REPORT_DIR, 'exp-families');
const LAB = path.join(ROOT, 'scripts', 'research', 'lab.mjs');
const VAL_LOG = path.join(REPORT_DIR, 'exp-families-validation-log.json');

const BOOT_B = 10000;
const BOOT_SEED = 20260817;
const CLIP = 10; // เพดานของคอลัมน์ "ค+ข" ในตารางตรวจเครื่องวัดของ lab.mjs

// ════════════════════════════ แขนทดลอง (ประกาศล่วงหน้า) ════════════════════════════
//
// group: 'ref'   = แขนอ้างอิง
//        'fam'   = เครื่องยนต์ตระกูลเดียว
//        'null'  = แบบจำลองศูนย์ (เข้าไม้ทุกแท่งโดยไม่ดูคะแนนเลย)
//        'ctrl'  = ตัวควบคุมความเข้มของเกณฑ์ (กันการสับสนระหว่าง "ตระกูล" กับ "เลือกน้อยลง")
//        'loo'   = ปิดกฎทีละตัว (leave-one-out)

const ARMS = [
  // reuse: ไม้ของแขนนี้บน validation ถูกคำนวณและเผยแพร่ไปแล้วตอนซ่อมเครื่องวัด
  // (report/metric-fix.md · config เดียวกันเป๊ะ · riskModel planned · ต้นทุน base)
  // จึงอ่านไฟล์เดิมแทนการรันใหม่ = ไม่เพิ่มการแตะชุด validation แม้แต่ครั้งเดียว
  { id: 'B0', group: 'ref', label: 'พื้นฐาน (config = signal-engine เป๊ะ)', patch: {},
    reuse: { validation: { json: 'metric-after-train+validation.json', csv: 'metric-after-validation-trades.csv' } } },

  // ── เครื่องยนต์ตระกูลเดียว ──
  { id: 'F1', group: 'fam', label: 'ตามเทรนด์ล้วน (ปิดกฎสวนเทรนด์ทั้งสี่)',
    patch: { rules: { rsi: { zones: { enabled: false } }, bollinger: { enabled: false },
      supportResistance: { enabled: false }, patterns: { enabled: false } } } },
  { id: 'F2', group: 'fam', label: 'สวนเทรนด์ล้วน (ปิดกฎตามเทรนด์ทั้งสี่)',
    patch: { rules: { trend: { enabled: false }, macdCross: { enabled: false },
      macdHistogram: { enabled: false }, rsi: { cross: { enabled: false } } } } },

  // ── แบบจำลองศูนย์: เข้าไม้ทุกแท่ง ใช้กลไกวาง SL/TP เดิมทุกอย่าง ──
  // ตอบคำถาม "ระบบให้คะแนนเพิ่มข้อมูลอะไรบ้างไหม" โดยคุมเรขาคณิตของการออกให้เท่ากัน
  { id: 'N1', group: 'null', label: 'ศูนย์: BUY ทุกแท่ง ไม่ดูคะแนน', patch: { decision: { buyNetScore: -1000 } } },
  { id: 'N2', group: 'null', label: 'ศูนย์: SELL ทุกแท่ง ไม่ดูคะแนน', patch: { decision: { buyNetScore: 1000, sellNetScore: 1000 } } },

  // ── ตัวควบคุม: เกณฑ์เข้มขึ้นด้วยกฎชุดเดิมทั้งหมด ──
  // ปิดกฎไป 4 ตัวทำให้คะแนนเต็มลดลง = เข้าไม้ยากขึ้นโดยอัตโนมัติ ถ้า F1/F2 ดีขึ้น
  // เพราะ "เลือกน้อยลง" ไม่ใช่เพราะ "ตระกูลบริสุทธิ์" แขนพวกนี้ต้องดีขึ้นด้วย
  { id: 'C4', group: 'ctrl', label: 'ควบคุม: กฎครบ แต่เกณฑ์ ±4', patch: { decision: { buyNetScore: 4, sellNetScore: -4 } } },
  { id: 'C5', group: 'ctrl', label: 'ควบคุม: กฎครบ แต่เกณฑ์ ±5', patch: { decision: { buyNetScore: 5, sellNetScore: -5 } } },

  // ── ปิดกฎทีละตัว ──
  { id: 'L1', group: 'loo', label: 'ปิด RSI ทั้งก้อน', patch: { rules: { rsi: { enabled: false } } } },
  { id: 'L2', group: 'loo', label: 'ปิด RSI โซน 30/70 (สวนเทรนด์)', patch: { rules: { rsi: { zones: { enabled: false } } } } },
  { id: 'L3', group: 'loo', label: 'ปิด RSI ตัด 50 (ตามเทรนด์)', patch: { rules: { rsi: { cross: { enabled: false } } } } },
  { id: 'L4', group: 'loo', label: 'ปิด MACD ตัดสัญญาณ (ตามเทรนด์)', patch: { rules: { macdCross: { enabled: false } } } },
  { id: 'L5', group: 'loo', label: 'ปิด MACD histogram (ตามเทรนด์)', patch: { rules: { macdHistogram: { enabled: false } } } },
  { id: 'L6', group: 'loo', label: 'ปิดกฎเทรนด์ MA (ตามเทรนด์)', patch: { rules: { trend: { enabled: false } } } },
  { id: 'L7', group: 'loo', label: 'ปิด Bollinger (สวนเทรนด์)', patch: { rules: { bollinger: { enabled: false } } } },
  { id: 'L8', group: 'loo', label: 'ปิดแท่งกลับตัว (สวนเทรนด์)', patch: { rules: { patterns: { enabled: false } } } },
  { id: 'L9', group: 'loo', label: 'ปิดคะแนนแนวรับ/แนวต้าน (สวนเทรนด์)', patch: { rules: { supportResistance: { enabled: false } } } },
  { id: 'L10', group: 'loo', label: 'ปิดข่าว (negative control — ต้องไม่เปลี่ยนอะไรเลย)', patch: { rules: { news: { enabled: false } } } },
];

const ARM_BY_ID = new Map(ARMS.map((a) => [a.id, a]));

// ════════════════════════════ การเปรียบเทียบ (ประกาศล่วงหน้า) ════════════════════════════
//
// ทุกบรรทัดคือการเทียบหนึ่งครั้งที่ต้องจ่ายค่า multiplicity
// left/right เป็น "ตัวชี้กลุ่มไม้" รูปแบบ "<armId>:<cohort>" หรือผลรวมของหลายตัวด้วย '+'
// cohort: all | trending | sideways | aligned | counter
//
// ⚠ อย่าเพิ่มบรรทัดในนี้หลังจากเห็นผลแล้ว — นั่นคือการเทียบที่ไม่ถูกนับ

const COMPARISONS = [
  // — สมมติฐานหลัก: แยกตระกูลแล้วดีขึ้นไหม —
  { id: 'H1', left: 'F1:all', right: 'B0:all', q: 'ตามเทรนด์ล้วน ดีกว่าพื้นฐานไหม' },
  { id: 'H2', left: 'F2:all', right: 'B0:all', q: 'สวนเทรนด์ล้วน ดีกว่าพื้นฐานไหม' },
  { id: 'H3', left: 'F1:all', right: 'F2:all', q: 'สองตระกูลต่างกันเองไหม' },

  // — แยกตามระบอบ (วิธีที่ตำราบอก) —
  { id: 'H4', left: 'F1:trending+F2:sideways', right: 'B0:all', q: 'ตามเทรนด์เมื่อมีเทรนด์ + สวนเทรนด์เมื่อออกข้าง ดีกว่าพื้นฐานไหม' },
  { id: 'H5', left: 'F1:sideways+F2:trending', right: 'B0:all', q: 'สลับระบอบ (ตรงข้ามตำรา) ดีกว่าพื้นฐานไหม' },
  { id: 'H6', left: 'F1:trending+F2:sideways', right: 'F1:sideways+F2:trending', q: 'ตำราชนะการสลับระบอบไหม' },
  { id: 'H7', left: 'F1:trending', right: 'F1:sideways', q: 'ตามเทรนด์ทำงานดีกว่าเมื่อมีเทรนด์ไหม' },
  { id: 'H8', left: 'F2:sideways', right: 'F2:trending', q: 'สวนเทรนด์ทำงานดีกว่าเมื่อออกข้างไหม' },

  // — แบ่งกลุ่มพื้นฐานตามระบอบ (ยืนยันผลวินิจฉัยเดิมบนเครื่องวัดใหม่) —
  { id: 'H9', left: 'B0:aligned', right: 'B0:sideways', q: 'เทรนด์หนุนทิศ ดีกว่าเทรนด์ออกข้างไหม' },
  { id: 'H10', left: 'B0:aligned', right: 'B0:counter', q: 'เทรนด์หนุนทิศ ดีกว่าเข้าสวนเทรนด์ไหม' },

  // — คำถามที่สำคัญที่สุด: ชนะ "เข้าไม้ทุกแท่งไม่ดูอะไร" ไหม —
  { id: 'H11', left: 'B0:all', right: 'NULLMIX(B0)', q: 'พื้นฐาน ชนะการเข้าไม้ทุกแท่งไหม' },
  { id: 'H12', left: 'F1:all', right: 'NULLMIX(F1)', q: 'ตามเทรนด์ล้วน ชนะการเข้าไม้ทุกแท่งไหม' },
  { id: 'H13', left: 'F2:all', right: 'NULLMIX(F2)', q: 'สวนเทรนด์ล้วน ชนะการเข้าไม้ทุกแท่งไหม' },
  { id: 'H14', left: 'F1:trending+F2:sideways', right: 'NULLMIX(F1:trending+F2:sideways)', q: 'แยกตามระบอบ ชนะการเข้าไม้ทุกแท่งไหม' },

  // — ตัวควบคุมความเข้มของเกณฑ์ —
  { id: 'H15', left: 'C4:all', right: 'B0:all', q: 'เกณฑ์ ±4 ดีกว่าพื้นฐานไหม' },
  { id: 'H16', left: 'C5:all', right: 'B0:all', q: 'เกณฑ์ ±5 ดีกว่าพื้นฐานไหม' },

  // — ปิดกฎทีละตัว —
  { id: 'H17', left: 'L1:all', right: 'B0:all', q: 'ปิด RSI ทั้งก้อน' },
  { id: 'H18', left: 'L2:all', right: 'B0:all', q: 'ปิด RSI โซน' },
  { id: 'H19', left: 'L3:all', right: 'B0:all', q: 'ปิด RSI ตัด 50' },
  { id: 'H20', left: 'L4:all', right: 'B0:all', q: 'ปิด MACD ตัดสัญญาณ' },
  { id: 'H21', left: 'L5:all', right: 'B0:all', q: 'ปิด MACD histogram' },
  { id: 'H22', left: 'L6:all', right: 'B0:all', q: 'ปิดกฎเทรนด์ MA' },
  { id: 'H23', left: 'L7:all', right: 'B0:all', q: 'ปิด Bollinger' },
  { id: 'H24', left: 'L8:all', right: 'B0:all', q: 'ปิดแท่งกลับตัว' },
  { id: 'H25', left: 'L9:all', right: 'B0:all', q: 'ปิดคะแนนแนวรับ/แนวต้าน' },
  { id: 'H26', left: 'L10:all', right: 'B0:all', q: 'ปิดข่าว (ต้องได้ 0 เป๊ะ)' },
];

// ════════════════════════════ การยืนยันบน validation ════════════════════════════
//
// train ใช้ "คัดกรอง" จึงต้องจ่ายค่า multiplicity ของการเทียบทั้ง 26 ครั้ง
// validation ใช้ "ยืนยัน" สมมติฐานที่ระบุชื่อไว้ล่วงหน้าแล้วเท่านั้น จำนวนการเทียบ
// จึงเป็น 4 ไม่ใช่ 26 — แต่แลกมาด้วยเงื่อนไขที่เข้มกว่า: ห้ามเพิ่มบรรทัดในรายการนี้
// หลังเห็นผล validation และห้ามรันแขนอื่นบน validation อีก
//
// เลือกสี่ข้อนี้เพราะ:
//   V1  = สมมติฐานหลักของรอบนี้ตรง ๆ (แยกตระกูลแล้วดีขึ้นไหม)
//   V2  = คำถามที่บรีฟบอกว่าสำคัญที่สุด สำหรับผู้ท้าชิงที่ดีที่สุดบน train
//   V3  = คำถามเดียวกันสำหรับเครื่องยนต์ที่ผู้ใช้ใช้จริงอยู่ตอนนี้
//   V4  = ข้อเดียวที่รอด Holm บน train (H9) — ตัวแบ่งตามระบอบ
// ไม่เอา "แยกตามระบอบ" (H4) ไปยืนยัน เพราะบน train มันแพ้ F1 เดี่ยว ๆ อยู่แล้ว
// การเอาไปวัดจึงเป็นการเผาชุด validation โดยไม่มีสมมติฐานรองรับ

const VALIDATION_ARMS = ['B0', 'F1', 'N1', 'N2'];

const VALIDATION_COMPARISONS = [
  { id: 'V1', left: 'F1:all', right: 'B0:all', q: 'ตามเทรนด์ล้วน ดีกว่าพื้นฐานไหม (ยืนยัน H1)' },
  { id: 'V2', left: 'F1:all', right: 'NULLMIX(F1)', q: 'ตามเทรนด์ล้วน ชนะการเข้าไม้ทุกแท่งไหม (ยืนยัน H12)' },
  { id: 'V3', left: 'B0:all', right: 'NULLMIX(B0)', q: 'พื้นฐาน ชนะการเข้าไม้ทุกแท่งไหม (ยืนยัน H11)' },
  { id: 'V4', left: 'B0:aligned', right: 'B0:sideways', q: 'เทรนด์หนุนทิศ ดีกว่าเทรนด์ออกข้างไหม (ยืนยัน H9)' },
];

const COMPARISONS_BY_SPLIT = { train: COMPARISONS, validation: VALIDATION_COMPARISONS };

// ════════════════════════════ ตัวช่วยเล็ก ๆ ════════════════════════════

function parseArgs(argv) {
  const out = { _: [] };
  for (const a of argv) {
    if (a.startsWith('--')) {
      const eq = a.indexOf('=');
      if (eq === -1) out[a.slice(2)] = true;
      else out[a.slice(2, eq)] = a.slice(eq + 1);
    } else out._.push(a);
  }
  return out;
}

/** PRNG เดียวกับ lab.mjs — ต้องรันซ้ำได้เป๊ะ ไม่งั้นเถียงกันเรื่องตัวเลขไม่จบ */
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function percentileOfSorted(sorted, p) {
  if (!sorted.length) return null;
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

const n4 = (v, d = 4) => (v === null || v === undefined || !Number.isFinite(v) ? 'n/a' : v.toFixed(d));
const pctS = (v, d = 1) => (v === null || v === undefined || !Number.isFinite(v) ? 'n/a' : `${(v * 100).toFixed(d)}%`);

// ════════════════════════════ ระบอบตลาด ณ แท่งที่ออกสัญญาณ ════════════════════════════
//
// ทำไมต้องคำนวณเอง: lab.mjs ไม่ได้บันทึกระบอบลงในไม้ แต่ระบอบเป็นข้อมูลที่ "รู้ได้ตอน
// ออกสัญญาณ" จริง ๆ (คำนวณจาก MA ของแท่งนั้นเอง ไม่ใช้ข้อมูลอนาคต) จึงใช้แบ่งกลุ่มได้
// โดยไม่ผิดกติกา
//
// ⚠ ต้องตัดแท่งตาม quality.usable.from ให้ตรงกับ loadDataset() ของ lab.mjs
// ไม่งั้นดัชนีของ MA จะคนละชุดกับที่เครื่องยนต์เห็นตอนออกสัญญาณ
// (ต้นฉบับของกติกานี้คือ scripts/research/lab.mjs — ที่นี่เป็นสำเนาที่ต้องตามให้ทัน)

const TREND_SIDEWAYS = 0;
const TREND_UP = 1;
const TREND_DOWN = 2;

async function buildRegimeIndex() {
  const { indicators: ind } = await loadSrcModules(['src/lib/indicators.ts']);
  const files = fs.readdirSync(CACHE_DIR).filter((f) => f.endsWith('.json')).sort();
  const index = new Map(); // "SYMBOL|TF" → { times: Float64Array, trend: Int8Array }

  for (const f of files) {
    const j = JSON.parse(fs.readFileSync(path.join(CACHE_DIR, f), 'utf8'));
    let candles = j.candles;
    const from = j.quality?.usable?.from;
    if (from) {
      const cut = Date.parse(from);
      const idx = candles.findIndex((c) => Date.parse(c.timestamp) >= cut);
      if (idx > 0) candles = candles.slice(idx);
      else if (idx === -1) candles = [];
    }
    if (!candles.length) continue;

    const closes = candles.map((c) => c.close);
    const ema20 = ind.EMA(closes, 20);
    const sma50 = ind.SMA(closes, 50);
    // ตรงกับเครื่องยนต์: MA200 ถูกคำนวณก็ต่อเมื่อ prefix ยาวถึง 200 แท่งจริง
    const sma200 = closes.length >= 200 ? ind.SMA(closes, 200) : [];

    const times = new Float64Array(candles.length);
    const trend = new Int8Array(candles.length);
    for (let i = 0; i < candles.length; i++) {
      times[i] = Date.parse(candles[i].timestamp);
      const ma200 = i + 1 >= 200 && sma200.length ? sma200[i] : NaN;
      const t = ind.determineTrend(closes[i], ema20[i], sma50[i], ma200);
      trend[i] = t === 'uptrend' ? TREND_UP : t === 'downtrend' ? TREND_DOWN : TREND_SIDEWAYS;
    }
    index.set(`${j.symbol}|${j.timeframe}`, { times, trend });
  }
  return index;
}

/** ค้นดัชนีแท่งจากเวลา (times เรียงขึ้นเสมอ) — คืน -1 ถ้าไม่เจอพอดี */
function findBar(times, ms) {
  let lo = 0;
  let hi = times.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (times[mid] === ms) return mid;
    if (times[mid] < ms) lo = mid + 1;
    else hi = mid - 1;
  }
  return -1;
}

// ════════════════════════════ สั่ง lab.mjs แล้วย่อผล ════════════════════════════

function runLab(arm, split) {
  const tag = `fam-${arm.id}`;
  const cfgPath = path.join(os.tmpdir(), `fam-cfg-${arm.id}-${process.pid}.json`);
  fs.writeFileSync(cfgPath, JSON.stringify(arm.patch), 'utf8');
  try {
    execFileSync(process.execPath, [LAB,
      `--config=${cfgPath}`, `--tag=${tag}`, `--split=${split}`, '--dump-trades',
    ], { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024 });
  } finally {
    fs.rmSync(cfgPath, { force: true });
  }
  return {
    txt: path.join(REPORT_DIR, `${tag}-${split}.txt`),
    json: path.join(REPORT_DIR, `${tag}-${split}.json`),
    csv: path.join(REPORT_DIR, `${tag}-${split}-trades.csv`),
  };
}

const COHORTS = ['all', 'trending', 'sideways', 'aligned', 'counter'];

function emptyCohort() { return { clusters: {} }; }

function addTrade(cohort, key, rNet, rGross, costR, win) {
  let c = cohort.clusters[key];
  if (!c) { c = { n: 0, sum: 0, sumClip: 0, sumGross: 0, sumCost: 0, wins: 0 }; cohort.clusters[key] = c; }
  c.n++;
  c.sum += rNet;
  c.sumClip += Math.max(-CLIP, Math.min(CLIP, rNet));
  c.sumGross += rGross;
  c.sumCost += costR;
  if (win) c.wins++;
}

/**
 * อ่าน CSV ของ lab แล้วย่อเป็นผลรวมรายคลัสเตอร์ต่อกลุ่มระบอบ
 * เก็บช่วงเวลาของไม้ไว้เฉพาะแขนที่ต้องเอาไปรวมกัน (F1/F2) เพื่อนับไม้ที่ทับเวลากัน
 */
function digestCsv(csvPath, regimeIndex, keepIntervals) {
  const raw = fs.readFileSync(csvPath, 'utf8');
  const lines = raw.split('\n');
  const head = lines[0].split(',');
  const ix = Object.fromEntries(head.map((h, i) => [h, i]));
  const cohorts = Object.fromEntries(COHORTS.map((c) => [c, emptyCohort()]));
  const intervals = keepIntervals ? [] : null;
  let unmatched = 0;
  let total = 0;

  for (let li = 1; li < lines.length; li++) {
    const ln = lines[li];
    if (!ln) continue;
    const f = ln.split(',');
    const symbol = f[ix.symbol];
    const timeframe = f[ix.timeframe];
    const key = `${symbol}|${timeframe}`;
    const rNet = Number(f[ix.rNet]);
    const rGross = Number(f[ix.rGross]);
    const costR = Number(f[ix.costR]);
    if (!Number.isFinite(rNet)) continue;
    total++;

    const entryMs = Date.parse(f[ix.entryTime]);
    const ds = regimeIndex.get(key);
    let regime = null;
    if (ds) {
      const bar = findBar(ds.times, entryMs);
      // แท่งที่ออกสัญญาณคือแท่งก่อนแท่งเข้าไม้ (lab.mjs: entryIndex = i + 1)
      if (bar > 0) regime = ds.trend[bar - 1];
    }
    if (regime === null) unmatched++;

    const win = rNet > 0;
    addTrade(cohorts.all, key, rNet, rGross, costR, win);
    if (regime !== null) {
      const isUp = regime === TREND_UP;
      const isDown = regime === TREND_DOWN;
      const buy = f[ix.action] === 'BUY';
      if (isUp || isDown) {
        addTrade(cohorts.trending, key, rNet, rGross, costR, win);
        if ((isUp && buy) || (isDown && !buy)) addTrade(cohorts.aligned, key, rNet, rGross, costR, win);
        else addTrade(cohorts.counter, key, rNet, rGross, costR, win);
      } else {
        addTrade(cohorts.sideways, key, rNet, rGross, costR, win);
      }
    }
    if (intervals) {
      intervals.push([key, entryMs, Date.parse(f[ix.exitTime]),
        regime === null ? -1 : regime === TREND_SIDEWAYS ? 0 : 1]);
    }
  }
  return { cohorts, intervals, unmatched, total };
}

function digestLabJson(jsonPath, split) {
  const j = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  const r = j.results[split];
  const audit = Object.fromEntries(r.metricAudit.map((a) => [a.id, a.net.mean]));
  return {
    configDiff: j.configDiff,
    tradeCount: r.tradeCountAll,
    avgRNet: r.cohortAll.net.stats.avgR,
    avgRGross: r.cohortAll.gross.stats.avgR,
    winRate: r.cohortAll.net.stats.winRate,
    profitFactor: r.cohortAll.net.stats.profitFactor,
    avgCostR: r.cohortAll.avgCostR,
    ciCluster: r.cohortAll.net.ciCluster,
    auditD: audit.D ?? null,   // ค: หารด้วยระยะที่ตั้งใจไว้ (= ตัวเลขหลัก)
    auditE: audit.E ?? null,   // ค+ข: ตัดที่ ±10 (คอลัมน์บังคับตรวจซ้ำ)
    signalsPerTrade: null,
  };
}

// ════════════════════════════ สถิติเปรียบเทียบ ════════════════════════════

function sumCohort(clusters) {
  let n = 0; let sum = 0; let sumClip = 0; let sumGross = 0; let sumCost = 0; let wins = 0;
  for (const c of Object.values(clusters)) {
    n += c.n; sum += c.sum; sumClip += c.sumClip; sumGross += c.sumGross; sumCost += c.sumCost; wins += c.wins;
  }
  return { n, sum, sumClip, sumGross, sumCost, wins,
    avgR: n ? sum / n : null, avgRClip: n ? sumClip / n : null,
    avgRGross: n ? sumGross / n : null, avgCostR: n ? sumCost / n : null,
    winRate: n ? wins / n : null };
}

/** รวมหลาย cohort เข้าด้วยกันที่ระดับคลัสเตอร์ (ใช้สร้างแขน "แยกตามระบอบ") */
function mergeClusters(list) {
  const out = {};
  for (const clusters of list) {
    for (const [k, c] of Object.entries(clusters)) {
      let e = out[k];
      if (!e) { e = { n: 0, sum: 0, sumClip: 0, sumGross: 0, sumCost: 0, wins: 0 }; out[k] = e; }
      e.n += c.n; e.sum += c.sum; e.sumClip += c.sumClip;
      e.sumGross += c.sumGross; e.sumCost += c.sumCost; e.wins += c.wins;
    }
  }
  return out;
}

/**
 * bootstrap ส่วนต่างของค่าเฉลี่ยระหว่างสองกลุ่มไม้ โดยสุ่ม "คลัสเตอร์" ทั้งก้อน
 *
 * คลัสเตอร์เดียวกันถูกหยิบพร้อมกันทั้งสองฝั่งเสมอ (จับคู่ที่ระดับสัญลักษณ์)
 * เพราะทั้งสองแขนวิ่งบนคลังข้อมูลชุดเดียวกัน — การจับคู่ตัดความแปรปรวนที่มาจาก
 * "สัญลักษณ์ไหนบังเอิญถูกหยิบ" ออกไป เหลือแต่ความแปรปรวนของความต่างระหว่างกฎ
 *
 * ค่า p เป็นแบบ percentile สองหาง: สัดส่วนของรอบ bootstrap ที่ตกฝั่งตรงข้ามกับผลจริง
 * คูณสอง (ใส่ +1 กันค่า 0 ซึ่งจะอ่านว่า "เป็นไปไม่ได้" ทั้งที่แค่ B ไม่พอ)
 */
function clusterDiffBootstrap(clA, clB, { B = BOOT_B, seed = BOOT_SEED, field = 'sum' } = {}) {
  const keys = [...new Set([...Object.keys(clA), ...Object.keys(clB)])].sort();
  const G = keys.length;
  if (!G) return null;
  const aSum = keys.map((k) => clA[k]?.[field] ?? 0);
  const aCnt = keys.map((k) => clA[k]?.n ?? 0);
  const bSum = keys.map((k) => clB[k]?.[field] ?? 0);
  const bCnt = keys.map((k) => clB[k]?.n ?? 0);

  const nA = aCnt.reduce((x, y) => x + y, 0);
  const nB = bCnt.reduce((x, y) => x + y, 0);
  if (!nA || !nB) return null;
  const observed = aSum.reduce((x, y) => x + y, 0) / nA - bSum.reduce((x, y) => x + y, 0) / nB;

  const rnd = mulberry32(seed);
  const diffs = new Array(B);
  let valid = 0;
  for (let b = 0; b < B; b++) {
    let sa = 0; let ca = 0; let sb = 0; let cb = 0;
    for (let g = 0; g < G; g++) {
      const p = (rnd() * G) | 0;
      sa += aSum[p]; ca += aCnt[p];
      sb += bSum[p]; cb += bCnt[p];
    }
    diffs[b] = ca > 0 && cb > 0 ? sa / ca - sb / cb : NaN;
    if (Number.isFinite(diffs[b])) valid++;
  }
  const fin = diffs.filter(Number.isFinite).sort((x, y) => x - y);
  if (!fin.length) return null;
  let le0 = 0; let ge0 = 0;
  for (const d of fin) { if (d <= 0) le0++; if (d >= 0) ge0++; }
  const p = Math.min(1, 2 * (Math.min(le0, ge0) + 1) / (fin.length + 1));
  return {
    observed,
    lo95: percentileOfSorted(fin, 0.025),
    hi95: percentileOfSorted(fin, 0.975),
    p,
    B: fin.length,
    validShare: valid / B,
    nA, nB, clusters: G,
  };
}

/** Holm-Bonferroni — คุม family-wise error rate โดยไม่เสียกำลังเท่า Bonferroni ล้วน */
function holm(pvalues) {
  const order = pvalues.map((p, i) => ({ p, i })).sort((a, b) => a.p - b.p);
  const m = pvalues.length;
  const adj = new Array(m);
  let running = 0;
  for (let k = 0; k < m; k++) {
    const v = Math.min(1, (m - k) * order[k].p);
    running = Math.max(running, v); // บังคับให้ไม่ลดลง (monotone)
    adj[order[k].i] = running;
  }
  return adj;
}

// ════════════════════════════ ตัวชี้กลุ่มไม้ ════════════════════════════
//
// "F1:trending+F2:sideways" → รวมคลัสเตอร์ของสอง cohort เข้าด้วยกัน
// "NULLMIX(<spec>)" → แบบจำลองศูนย์ที่มีสัดส่วน BUY/SELL เท่ากับ <spec>
//   จำเป็นเพราะ N1 เป็น BUY ล้วน N2 เป็น SELL ล้วน ถ้าแขนที่จะเทียบมี SELL 46%
//   การเทียบกับ N1 เฉย ๆ คือการเทียบข้ามทิศทาง ซึ่งตอบคนละคำถาม

function resolveSpec(spec, agg) {
  const m = /^NULLMIX\((.+)\)$/.exec(spec);
  if (m) return resolveNullMix(m[1], agg);
  const parts = spec.split('+');
  const list = [];
  for (const p of parts) {
    // ไม่ระบุ cohort = ทั้งแขน ("B0" มีความหมายเดียวกับ "B0:all")
    const [armId, cohort = 'all'] = p.split(':');
    const a = agg.arms[armId];
    if (!a) throw new Error(`ยังไม่มีผลของแขน ${armId} — รัน --stage=... ให้ครบก่อน`);
    const c = a.cohorts[cohort];
    if (!c) throw new Error(`ไม่รู้จัก cohort "${cohort}"`);
    list.push(c.clusters);
  }
  return mergeClusters(list);
}

/**
 * แบบจำลองศูนย์ที่จับคู่ทิศทาง: ถ่วงน้ำหนักไม้ของ N1 (BUY ทุกแท่ง) และ N2 (SELL ทุกแท่ง)
 * ให้ได้สัดส่วน BUY/SELL เท่ากับกลุ่มที่จะเทียบ ทำที่ระดับคลัสเตอร์ (ปรับ n และ sum
 * ด้วยตัวคูณเดียวกัน ค่าเฉลี่ยของคลัสเตอร์จึงไม่เปลี่ยน เปลี่ยนแค่น้ำหนักที่มันมี)
 */
function resolveNullMix(spec, agg) {
  const dir = specDirection(spec, agg);
  const n1 = agg.arms.N1?.cohorts.all.clusters;
  const n2 = agg.arms.N2?.cohorts.all.clusters;
  if (!n1 || !n2) throw new Error('ยังไม่มีผลของแขน N1/N2');
  const w1 = dir.buyShare;
  const w2 = 1 - dir.buyShare;
  const scale = (clusters, w) => Object.fromEntries(Object.entries(clusters).map(([k, c]) => [k, {
    n: c.n * w, sum: c.sum * w, sumClip: c.sumClip * w,
    sumGross: c.sumGross * w, sumCost: c.sumCost * w, wins: c.wins * w,
  }]));
  return mergeClusters([scale(n1, w1), scale(n2, w2)]);
}

/** สัดส่วน BUY ของกลุ่มไม้ที่ระบุ — เก็บไว้ตอน digest */
function specDirection(spec, agg) {
  const parts = spec.split('+');
  let buy = 0; let tot = 0;
  for (const p of parts) {
    const [armId, cohort = 'all'] = p.split(':');
    const d = agg.arms[armId]?.direction?.[cohort];
    if (!d) throw new Error(`ไม่มีข้อมูลทิศทางของ ${p}`);
    buy += d.buy; tot += d.total;
  }
  return { buyShare: tot ? buy / tot : 0.5, total: tot };
}

// ════════════════════════════ ขั้นตอนการรัน ════════════════════════════

async function stageRun(split, armIds) {
  fs.mkdirSync(KEEP_DIR, { recursive: true });
  console.log(`[fam] สร้างดัชนีระบอบตลาดจากคลังข้อมูล...`);
  const regimeIndex = await buildRegimeIndex();
  console.log(`[fam] ได้ ${regimeIndex.size} ชุดข้อมูล`);

  const aggPath = path.join(REPORT_DIR, `exp-families-agg-${split}.json`);
  const agg = fs.existsSync(aggPath) ? JSON.parse(fs.readFileSync(aggPath, 'utf8'))
    : { split, generatedAt: null, arms: {}, meta: {} };

  for (const id of armIds) {
    const arm = ARM_BY_ID.get(id);
    if (!arm) throw new Error(`ไม่รู้จักแขน ${id}`);
    const t0 = Date.now();
    process.stdout.write(`[fam] ${id} ${arm.label} ... `);
    // ไม้ชุดนี้เคยคำนวณไว้แล้วด้วย config เดียวกันเป๊ะ → อ่านของเดิม ไม่แตะข้อมูลเพิ่ม
    const ru = arm.reuse?.[split];
    const reused = ru && fs.existsSync(path.join(REPORT_DIR, ru.csv));
    const out = reused
      ? { txt: null, json: path.join(REPORT_DIR, ru.json), csv: path.join(REPORT_DIR, ru.csv) }
      : runLab(arm, split);
    const lab = digestLabJson(out.json, split);
    const keepIntervals = id === 'F1' || id === 'F2';
    const d = digestCsv(out.csv, regimeIndex, keepIntervals);

    // สัดส่วน BUY ต่อ cohort — ต้องอ่านซ้ำจาก CSV เพราะ addTrade ไม่ได้เก็บทิศทาง
    const dir = directionByCohort(out.csv, regimeIndex);

    agg.arms[id] = {
      id, label: arm.label, group: arm.group, patch: arm.patch,
      lab, cohorts: d.cohorts, direction: dir,
      unmatchedRegime: d.unmatched, totalTrades: d.total,
      elapsedMs: Date.now() - t0,
    };
    if (d.intervals) {
      fs.writeFileSync(path.join(REPORT_DIR, `exp-families-intervals-${id}-${split}.json`),
        JSON.stringify(d.intervals), 'utf8');
    }

    // เก็บรายงานอ่านได้ไว้เป็นหลักฐาน ทิ้งของหนักที่สร้างใหม่ได้เสมอ
    // (ไฟล์ที่ "ยืมมา" ต้องไม่ถูกแตะ เพราะเป็นหลักฐานของงานรอบก่อน)
    if (!reused) {
      fs.renameSync(out.txt, path.join(KEEP_DIR, `${path.basename(out.txt)}`));
      fs.rmSync(out.json, { force: true });
      fs.rmSync(out.csv, { force: true });
    }
    agg.arms[id].reusedFrom = reused ? ru.csv : null;

    console.log(`${d.total.toLocaleString()} ไม้ · avgR ${n4(lab.avgRNet)} · ${((Date.now() - t0) / 1000).toFixed(1)}s`);
    agg.generatedAt = new Date().toISOString();
    fs.writeFileSync(aggPath, JSON.stringify(agg), 'utf8');
  }

  if (split === 'validation') {
    const log = fs.existsSync(VAL_LOG) ? JSON.parse(fs.readFileSync(VAL_LOG, 'utf8')) : { touches: [] };
    const fresh = armIds.filter((id) => !agg.arms[id]?.reusedFrom);
    log.touches.push({ at: new Date().toISOString(), arms: armIds, freshRuns: fresh,
      note: 'freshRuns = แขนที่รันใหม่จริง ส่วนที่เหลืออ่านจากผลที่คำนวณไว้แล้ว' });
    fs.writeFileSync(VAL_LOG, JSON.stringify(log, null, 2), 'utf8');
    console.log(`[fam] บันทึกการแตะ validation ครั้งที่ ${log.touches.length} (${armIds.join(',')})`);
  }
  console.log(`[fam] เขียน ${path.relative(ROOT, aggPath)}`);
}

/** อ่าน CSV รอบสองเพื่อนับ BUY/SELL ต่อ cohort (แยกฟังก์ชันเพื่อให้ digestCsv อ่านง่าย) */
function directionByCohort(csvPath, regimeIndex) {
  const raw = fs.readFileSync(csvPath, 'utf8');
  const lines = raw.split('\n');
  const head = lines[0].split(',');
  const ix = Object.fromEntries(head.map((h, i) => [h, i]));
  const out = Object.fromEntries(COHORTS.map((c) => [c, { buy: 0, total: 0 }]));
  const bump = (c, buy) => { out[c].total++; if (buy) out[c].buy++; };
  for (let li = 1; li < lines.length; li++) {
    const ln = lines[li];
    if (!ln) continue;
    const f = ln.split(',');
    if (!Number.isFinite(Number(f[ix.rNet]))) continue;
    const buy = f[ix.action] === 'BUY';
    bump('all', buy);
    const ds = regimeIndex.get(`${f[ix.symbol]}|${f[ix.timeframe]}`);
    if (!ds) continue;
    const bar = findBar(ds.times, Date.parse(f[ix.entryTime]));
    if (bar <= 0) continue;
    const r = ds.trend[bar - 1];
    if (r === TREND_SIDEWAYS) bump('sideways', buy);
    else {
      bump('trending', buy);
      if ((r === TREND_UP && buy) || (r === TREND_DOWN && !buy)) bump('aligned', buy);
      else bump('counter', buy);
    }
  }
  return out;
}

/** นับไม้ที่ทับเวลากันระหว่างสองกลุ่มในสัญลักษณ์เดียวกัน — ข้อจำกัดของแขน "แยกตามระบอบ" */
function overlapCount(split) {
  const p1 = path.join(REPORT_DIR, `exp-families-intervals-F1-${split}.json`);
  const p2 = path.join(REPORT_DIR, `exp-families-intervals-F2-${split}.json`);
  if (!fs.existsSync(p1) || !fs.existsSync(p2)) return null;
  const a = JSON.parse(fs.readFileSync(p1, 'utf8')).filter((r) => r[3] === 1); // F1 ตอนมีเทรนด์
  const b = JSON.parse(fs.readFileSync(p2, 'utf8')).filter((r) => r[3] === 0); // F2 ตอนออกข้าง
  const byKey = new Map();
  for (const r of b) {
    if (!byKey.has(r[0])) byKey.set(r[0], []);
    byKey.get(r[0]).push(r);
  }
  for (const list of byKey.values()) list.sort((x, y) => x[1] - y[1]);
  let overlap = 0;
  for (const r of a) {
    const list = byKey.get(r[0]);
    if (!list) continue;
    for (const s of list) {
      if (s[1] > r[2]) break;
      if (s[2] >= r[1]) { overlap++; break; }
    }
  }
  return { f1Trending: a.length, f2Sideways: b.length, overlap, share: a.length ? overlap / (a.length + b.length) : null };
}

// ════════════════════════════ วิเคราะห์ + เขียนรายงาน ════════════════════════════

function analyse(split) {
  const aggPath = path.join(REPORT_DIR, `exp-families-agg-${split}.json`);
  if (!fs.existsSync(aggPath)) throw new Error(`ยังไม่มี ${aggPath}`);
  const agg = JSON.parse(fs.readFileSync(aggPath, 'utf8'));

  const compSet = COMPARISONS_BY_SPLIT[split];
  if (!compSet) throw new Error(`ไม่มีรายการเปรียบเทียบสำหรับ split "${split}"`);
  const rows = [];
  for (const c of compSet) {
    let left; let right;
    try {
      left = resolveSpec(c.left, agg);
      right = resolveSpec(c.right, agg);
    } catch (e) {
      rows.push({ ...c, error: e.message });
      continue;
    }
    const main = clusterDiffBootstrap(left, right, { field: 'sum' });
    const clip = clusterDiffBootstrap(left, right, { field: 'sumClip' });
    const sl = sumCohort(left);
    const sr = sumCohort(right);
    rows.push({ ...c, left: c.left, right: c.right, statsL: sl, statsR: sr, main, clip });
  }

  const usable = rows.filter((r) => r.main);
  const adj = holm(usable.map((r) => r.main.p));
  usable.forEach((r, i) => { r.pHolm = adj[i]; });

  return { agg, rows, comparisons: compSet.length, split };
}

function renderArmTable(agg) {
  const hdr = '| แขน | คำอธิบาย | ไม้ | ชนะ | avgR ก่อนต้นทุน | avgR หลังต้นทุน | CI95 ราย-สัญลักษณ์ | PF | ตัดที่ ±10 |';
  const sep = '| --- | --- | ---: | ---: | ---: | ---: | --- | ---: | ---: |';
  const lines = [hdr, sep];
  for (const a of ARMS) {
    const r = agg.arms[a.id];
    if (!r) continue;
    const ci = r.lab.ciCluster;
    lines.push(`| ${a.id} | ${a.label} | ${r.lab.tradeCount.toLocaleString()} | ${pctS(r.lab.winRate)} `
      + `| ${n4(r.lab.avgRGross)} | **${n4(r.lab.avgRNet)}** | [${n4(ci.lo95)}, ${n4(ci.hi95)}] `
      + `| ${n4(r.lab.profitFactor, 3)} | ${n4(r.lab.auditE)} |`);
  }
  return lines.join('\n');
}

function renderCompTable(rows) {
  const lines = [
    '| # | เทียบอะไร | ไม้ซ้าย | ไม้ขวา | avgR ซ้าย | avgR ขวา | ส่วนต่าง | CI95 ของส่วนต่าง | p ดิบ | p หลังแก้ | ส่วนต่างเมื่อตัด ±10 | พลิกไหม |',
    '| --- | --- | ---: | ---: | ---: | ---: | ---: | --- | ---: | ---: | ---: | --- |',
  ];
  for (const r of rows) {
    if (r.error) { lines.push(`| ${r.id} | ${r.q} | — | — | — | — | — | ${r.error} | — | — | — | — |`); continue; }
    const flip = r.clip ? (Math.sign(r.main.observed) !== Math.sign(r.clip.observed) ? '**พลิก**'
      : Math.abs(r.main.observed) < 0.01 ? 'เล็ก—ตรวจแล้วไม่พลิก' : 'ไม่พลิก') : 'n/a';
    lines.push(`| ${r.id} | ${r.q} | ${r.statsL.n.toLocaleString()} | ${Math.round(r.statsR.n).toLocaleString()} `
      + `| ${n4(r.statsL.avgR)} | ${n4(r.statsR.avgR)} | **${n4(r.main.observed)}** `
      + `| [${n4(r.main.lo95)}, ${n4(r.main.hi95)}] | ${r.main.p.toFixed(4)} | ${r.pHolm.toFixed(4)} `
      + `| ${n4(r.clip ? r.clip.observed : null)} | ${flip} |`);
  }
  return lines.join('\n');
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const stage = String(args.stage ?? 'analyze');

  if (stage === 'train' || stage === 'validation') {
    const ids = args.arms ? String(args.arms).split(',') : ARMS.map((a) => a.id);
    if (stage === 'validation' && !args.arms) {
      throw new Error('การรันบน validation ต้องระบุ --arms= เสมอ (กันการเผาชุด validation โดยไม่ตั้งใจ)');
    }
    return stageRun(stage, ids);
  }
  if (stage === 'analyze') {
    const split = String(args.split ?? 'train');
    const res = analyse(split);
    const out = {
      split, comparisons: res.comparisons,
      arms: Object.fromEntries(Object.entries(res.agg.arms).map(([k, v]) => [k, { label: v.label, lab: v.lab,
        cohortStats: Object.fromEntries(COHORTS.map((c) => [c, sumCohort(v.cohorts[c].clusters)])),
        direction: v.direction, unmatchedRegime: v.unmatchedRegime }])),
      rows: res.rows.map((r) => ({ id: r.id, q: r.q, left: r.left, right: r.right,
        nL: r.statsL?.n, nR: r.statsR?.n, avgL: r.statsL?.avgR, avgR_: r.statsR?.avgR,
        diff: r.main?.observed, lo95: r.main?.lo95, hi95: r.main?.hi95, p: r.main?.p, pHolm: r.pHolm,
        diffClip: r.clip?.observed, error: r.error })),
      overlap: overlapCount(split),
    };
    const p = path.join(REPORT_DIR, `exp-families-analysis-${split}.json`);
    fs.writeFileSync(p, JSON.stringify(out, null, 2), 'utf8');
    console.log(`\n### ตารางแขนทดลอง (${split})\n`);
    console.log(renderArmTable(res.agg));
    console.log(`\n### ตารางการเปรียบเทียบ (${res.comparisons} ครั้ง · Holm)\n`);
    console.log(renderCompTable(res.rows));
    const ov = out.overlap;
    if (ov) console.log(`\nไม้ที่ทับเวลากันระหว่าง F1(มีเทรนด์) กับ F2(ออกข้าง): ${ov.overlap} จาก ${ov.f1Trending + ov.f2Sideways} (${pctS(ov.share)})`);
    console.log(`\n[fam] เขียน ${path.relative(ROOT, p)}`);
    return undefined;
  }
  throw new Error(`ไม่รู้จัก --stage=${stage}`);
}

const r = main();
if (r && typeof r.then === 'function') {
  r.catch((e) => { console.error(`\n[fam] ล้มเหลว: ${e?.message ?? e}`); process.exit(1); });
}
