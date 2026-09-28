/**
 * smc-trades.mjs — แปลงเซ็ตอัพ SMC เป็นไม้จำลอง ที่ smc-lab.mjs และ smc-testset.mjs ใช้ร่วมกัน
 *
 * แยกออกมาเพื่อให้ "ชุด test วัดสิ่งเดียวกับแล็บเป๊ะ" เป็นข้อเท็จจริงของโค้ด ไม่ใช่คำสัญญา:
 * ทั้งสองไฟล์เรียกฟังก์ชันเดียวกันนี้ ซึ่งเรียกกติกาเข้าไม้จาก src/lib/smc-setups.ts
 * (ไฟล์เดียวกับที่ตัวสแกนจริงใช้) อีกทอดหนึ่ง
 */

export function createSmcTrades({ SETUP, sim, symbol, market, maxHoldBars }) {
  const { rr: RR } = SETUP.SMC_SETUP_PARAMS;

  /** แล็บต้องเหลือแท่งถัดไปในชุดให้เข้าที่ราคาเปิด → แท่งแตะได้ถึง n − 2 (ความหมายอยู่ที่ SETUP.firstTouch) */
  const firstTouch = (bars, zone, fromIdx) => SETUP.firstTouch(bars, zone, fromIdx, bars.length - 2);

  /** สร้างไม้จากโซน — เข้าที่ราคาเปิดแท่งถัดจากแท่งที่แตะ */
  function tradeFromZone(bars, zone, knownAt, tf, stopFloor, tag) {
    const k = firstTouch(bars, zone, knownAt);
    if (k < 0) return null;
    const e = k + 1;
    const lv = SETUP.levelsFromZone(zone, bars[e].open, { stopFloor, symbol, market });
    if (!lv) return null; // เปิดทะลุ SL ไปแล้ว
    return sim.toTrade(
      bars,
      { idx: e, entry: lv.entry, risk: lv.risk, rr: RR, isLong: zone.dir === 1, entryBar: 'full', stop: lv.stop, target: lv.target },
      maxHoldBars[tf],
      // zoneKnownAt: ให้ด่านเทียบตัวสแกนตรวจกติกา "หลายใบถูกแตะพร้อมกัน → เลือกใบที่เกิดล่าสุด" ได้
      { ...tag, touchIdx: k, zoneKnownAt: knownAt }
    );
  }

  /** เซ็ตอัพทั้งสี่ของ smc-lab — นิยามอยู่หัวไฟล์ smc-lab.mjs */
  function collectTrades(bars, tf, setup, stopFloor, a) {
    const trades = [];
    if (setup === 'fvg-trend') {
      for (const f of SETUP.fvgTrendCandidates(bars.length, a.events, a.fvgs)) {
        const t = tradeFromZone(bars, f, f.knownAt, tf, stopFloor, { setup, sizeAtr: f.sizeAtr });
        if (t) trades.push(t);
      }
      return trades;
    }
    for (const ev of a.events) {
      if (!ev.ob) continue;
      if (setup === 'ob-bos' && ev.kind !== 'BOS') continue;
      if (setup === 'ob-bos-disp' && !(ev.kind === 'BOS' && ev.ob.displacement)) continue;
      if (setup === 'sweep-choch' && !(ev.kind === 'CHoCH' && ev.sweptBefore)) continue;
      const t = tradeFromZone(bars, ev.ob, ev.knownAt, tf, stopFloor, { setup, kind: ev.kind });
      if (t) trades.push(t);
    }
    return trades;
  }

  return { firstTouch, tradeFromZone, collectTrades };
}
