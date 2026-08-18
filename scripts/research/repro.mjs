#!/usr/bin/env node
/**
 * repro.mjs — เครื่องมือกลางที่ทำให้ "รันซ้ำได้ผลเดิม" พิสูจน์ได้ ไม่ใช่แค่เชื่อ
 *
 * ══════════════════════════ ทำไมต้องมีไฟล์นี้ ══════════════════════════
 *
 * รอบก่อนเจอว่า combine.mjs รัน 17 ครั้งด้วยอาร์กิวเมนต์เดียวกัน แล้วมี 1 ครั้ง
 * ที่ให้คำตอบคนละอย่าง โดยไม่มี error ไม่มีคำเตือน — ตัวเลขที่พิมพ์ออกมาสูงกว่า
 * ค่าจริงหลายร้อยเท่า ถ้าไม่มีใครบังเอิญรันซ้ำวันนั้น มันจะกลายเป็น "การค้นพบ"
 *
 * ต้นตอของอาการแบบนี้แทบทั้งหมดไม่ได้อยู่ในสูตรคณิตศาสตร์ แต่อยู่ที่
 * **สคริปต์อ่านของจากข้างนอกโดยไม่ตรึงว่าอ่านฉบับไหน**
 *   · ไฟล์ JSON ของรายงานต้นทาง (สคริปต์พี่น้องเขียนทับได้ทุกเมื่อ)
 *   · ไฟล์แคชผลของ lab.mjs (ใช้ซ้ำโดยไม่ตรวจว่าสร้างมาจากอาร์กิวเมนต์เดียวกันไหม)
 *   · ไฟล์แท่งเทียนในคลัง (fetch ใหม่เมื่อไรก็เปลี่ยน)
 *
 * ไฟล์นี้จึงให้สองอย่าง:
 *   1. ลายนิ้วมือ (sha256) ของ "ทุกอย่างที่สคริปต์อ่าน" + ของตัวสคริปต์เอง
 *      → รายงานฉบับหนึ่งผูกกับโค้ดและข้อมูลชุดหนึ่งเท่านั้น ตรวจย้อนได้
 *   2. รายการ "ช่องที่ตั้งใจให้ต่างทุกครั้ง" (เวลา · ระยะเวลาที่ใช้รัน)
 *      → ตัวตรวจความคงที่จะได้เทียบทุกไบต์ที่เหลือได้อย่างเข้มงวด ไม่ต้องมีข้อยกเว้นลับ
 *
 * ไฟล์นี้ต้องไม่มี side effect ใด ๆ ตอน import (เป็นห้องสมุดล้วน) เหมือน load-src-modules.mjs
 */

import fs from 'node:fs';
import crypto from 'node:crypto';

/** sha256 ของสายอักขระ */
export function sha256Of(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

/** sha256 ของไฟล์ — คืน null ถ้าไม่มีไฟล์ (ผู้เรียกตัดสินเองว่าจะถือว่าผิดไหม) */
export function sha256File(p) {
  try {
    return sha256Of(fs.readFileSync(p));
  } catch {
    return null;
  }
}

/**
 * ตัวบันทึกไฟล์ขาเข้า
 *
 * ทุกครั้งที่สคริปต์อ่านไฟล์ที่มีผลต่อคำตอบ ให้เรียก .note(path, role)
 * ตอนจบเรียก .manifest() เพื่อได้รายการที่เรียงแล้ว (เรียงตาม path เสมอ —
 * ลำดับการอ่านต้องไม่มีผลต่อลายนิ้วมือ ไม่งั้นตัวตรวจจะแดงเพราะเรื่องไร้สาระ)
 */
export class InputLedger {
  constructor() { this.seen = new Map(); }

  note(absPath, role) {
    if (this.seen.has(absPath)) return absPath;
    let bytes = null;
    try { bytes = fs.statSync(absPath).size; } catch { bytes = null; }
    this.seen.set(absPath, { role, sha256: sha256File(absPath), bytes });
    return absPath;
  }

  /** อ่านไฟล์พร้อมบันทึกลายนิ้วมือในคราวเดียว — ใช้แทน fs.readFileSync ที่จุดสำคัญ */
  read(absPath, role, enc = 'utf8') {
    this.note(absPath, role);
    return fs.readFileSync(absPath, enc);
  }

  readJson(absPath, role) {
    return JSON.parse(this.read(absPath, role));
  }

  manifest(rootForRelative = null) {
    const rel = (p) => {
      if (!rootForRelative) return p;
      const r = p.startsWith(rootForRelative) ? p.slice(rootForRelative.length) : p;
      return r.replace(/^[\\/]/, '').split('\\').join('/');
    };
    return [...this.seen.entries()]
      .map(([p, v]) => ({ path: rel(p), role: v.role, sha256: v.sha256, bytes: v.bytes }))
      .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  }

  /** ลายนิ้วมือรวมของขาเข้าทั้งหมด — เปลี่ยนแม้ไฟล์เดียวก็เปลี่ยน */
  digest(rootForRelative = null) {
    return sha256Of(JSON.stringify(this.manifest(rootForRelative)));
  }
}

/**
 * บล็อกที่มาของผลลัพธ์ ที่ต้องฝังลงทั้ง .json และ .md
 *
 * volatileFields  = เส้นทางแบบจุด (a.b.c) ของช่องที่ "ตั้งใจให้ต่างทุกครั้ง"
 *                   ตัวตรวจความคงที่จะลบช่องเหล่านี้ทิ้งก่อนเทียบ
 *                   ทุกช่องที่เหลือต้องเท่ากันทุกไบต์ ไม่มีข้อยกเว้น
 * volatileReportLines = regex ของบรรทัดในรายงาน .md ที่ยอมให้ต่างได้
 */
export function buildProvenance({
  scriptPath, root, ledger, argv, volatileFields = [], volatileReportLines = [],
}) {
  const relScript = scriptPath.startsWith(root)
    ? scriptPath.slice(root.length).replace(/^[\\/]/, '').split('\\').join('/')
    : scriptPath;
  const inputs = ledger.manifest(root);
  return {
    script: relScript,
    scriptSha256: sha256File(scriptPath),
    // ตัวเลขรุ่นของ node มีผลจริงกับผลลัพธ์ (การเรียง · ฟังก์ชันคณิตศาสตร์บางตัว)
    // จึงต้องบันทึกไว้ ถ้าค่าต่างกันแล้วผลต่าง จะได้รู้ว่าเพราะอะไร
    node: process.version,
    platform: `${process.platform}-${process.arch}`,
    argv: argv.slice(),
    inputs,
    inputsDigest: sha256Of(JSON.stringify(inputs)),
    volatileFields: [...volatileFields].sort(),
    volatileReportLines: [...volatileReportLines],
  };
}

/** ลบช่องตามเส้นทางแบบจุดออกจากสำเนา (ไม่แตะของเดิม) */
export function stripPaths(obj, paths) {
  const clone = JSON.parse(JSON.stringify(obj));
  for (const p of paths) {
    const parts = p.split('.');
    let cur = clone;
    let ok = true;
    for (let i = 0; i < parts.length - 1; i++) {
      if (cur == null || typeof cur !== 'object') { ok = false; break; }
      cur = cur[parts[i]];
    }
    if (ok && cur != null && typeof cur === 'object') delete cur[parts[parts.length - 1]];
  }
  return clone;
}

/**
 * JSON ที่คีย์เรียงแน่นอน — ใช้ทำลายนิ้วมือของ "เนื้อหา" ไม่ใช่ "ลำดับที่บังเอิญเขียน"
 * (ลำดับคีย์ของ object ใน JS คงที่อยู่แล้วสำหรับคีย์สตริง แต่ถ้าคีย์เป็นตัวเลขปนสตริง
 *  ลำดับจะโดนจัดใหม่โดยอัตโนมัติ — เรียงเองเลยปลอดภัยกว่า)
 */
export function canonicalJson(value) {
  const walk = (v) => {
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === 'object') {
      const out = {};
      for (const k of Object.keys(v).sort()) out[k] = walk(v[k]);
      return out;
    }
    // -0 กับ 0 ต่างกันใน Object.is แต่ JSON.stringify เขียนเหมือนกัน — ทำให้เท่ากันไปเลย
    if (typeof v === 'number' && Object.is(v, -0)) return 0;
    return v;
  };
  return JSON.stringify(walk(value));
}

/** ลายนิ้วมือของผลลัพธ์ หลังตัดช่องที่ตั้งใจให้ต่างออกแล้ว */
export function resultDigest(obj, volatileFields = []) {
  return sha256Of(canonicalJson(stripPaths(obj, volatileFields)));
}

/**
 * ตัวเปรียบเทียบเชิงลึก คืนรายการความต่างแบบอ่านออก (จำกัดจำนวน)
 * ใช้ในตัวตรวจความคงที่ เพื่อบอกให้ได้ว่า "ต่างตรงไหน" ไม่ใช่แค่ "ต่าง"
 */
export function deepDiff(a, b, limit = 40) {
  const out = [];
  const walk = (x, y, p) => {
    if (out.length >= limit) return;
    if (Object.is(x, y)) return;
    const tx = x === null ? 'null' : typeof x;
    const ty = y === null ? 'null' : typeof y;
    if (tx !== ty || tx !== 'object') {
      out.push({ path: p || '(root)', a: shortVal(x), b: shortVal(y) });
      return;
    }
    if (Array.isArray(x) !== Array.isArray(y)) {
      out.push({ path: p || '(root)', a: `array=${Array.isArray(x)}`, b: `array=${Array.isArray(y)}` });
      return;
    }
    const keys = [...new Set([...Object.keys(x), ...Object.keys(y)])].sort();
    for (const k of keys) walk(x[k], y[k], p ? `${p}.${k}` : k);
  };
  walk(a, b, '');
  return out;
}

function shortVal(v) {
  if (v === undefined) return '(ไม่มีช่องนี้)';
  const s = typeof v === 'string' ? v : JSON.stringify(v);
  return s == null ? String(v) : (s.length > 80 ? `${s.slice(0, 77)}...` : s);
}

/**
 * จำนวนรอบที่ต้องรัน เพื่อให้จับความไม่แน่นอนที่เกิดขึ้นด้วยอัตรา p ได้ด้วยความมั่นใจ conf
 *
 * ตัวตรวจจับได้ก็ต่อเมื่อผลของ N รอบ "ไม่เหมือนกันทั้งหมด"
 * ถ้าแต่ละรอบเพี้ยนอย่างเป็นอิสระด้วยความน่าจะเป็น p:
 *     P(จับไม่ได้) = P(ดีทั้งหมด) + P(เพี้ยนทั้งหมด) = (1−p)^N + p^N
 * ต้องการ P(จับได้) ≥ conf → หา N ที่เล็กที่สุดที่ (1−p)^N + p^N ≤ 1−conf
 */
export function runsNeeded(p = 0.06, conf = 0.99, maxN = 100000) {
  for (let n = 2; n <= maxN; n++) {
    if ((1 - p) ** n + p ** n <= 1 - conf) return n;
  }
  return maxN;
}
