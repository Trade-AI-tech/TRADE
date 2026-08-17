'use client';

import { useEffect, useState } from 'react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';

interface Props {
  data: Array<{ date: string; value: number }>;
  subtitle?: string;
  emptyText?: string;
}

/**
 * สีที่ recharts ต้องใช้
 *
 * recharts รับสีเป็นสตริงแล้วยัดลง attribute ของ SVG ตรง ๆ (stroke/fill/...)
 * มันไม่รู้จักคลาสของ Tailwind และไม่รู้จัก CSS variable ที่เราตั้งไว้บน <html>
 * จึงต้องอ่านค่าจริงของตัวแปรธีมออกมาตอนรันไทม์ แล้วส่งเข้าไปเป็น prop
 */
interface ChartColors {
  /** เขียว = พอร์ตโต */
  up: string;
  /** แดง = พอร์ตหด */
  down: string;
  text: string;
  axis: string;
  grid: string;
  /** พื้นของ tooltip และวงแหวนรอบจุดที่ hover — ต้องทึบ ไม่งั้นอ่านตัวเลขไม่ออก */
  panel: string;
  border: string;
}

/**
 * ค่าสำรองเมื่ออ่านตัวแปรธีมไม่ได้ (ตอน SSR หรือธีมยังไม่ได้ประกาศตัวแปรครบ)
 *
 * ฝั่งสว่างใช้เขียว/แดงเฉดเข้ม (emerald-700 / red-700) ไม่ใช่เฉด 400 แบบธีมมืด
 * เพราะ #34d399 บนพื้นขาวได้คอนทราสต์แค่ ~1.9:1 คนอ่านกำไร/ขาดทุนผิดแน่นอน
 * ส่วนเฉดเข้มชุดนี้ผ่าน WCAG AA (≥ 4.5:1) บนพื้นขาว
 */
const FALLBACK: Record<'light' | 'dark', ChartColors> = {
  dark: {
    up: '#34d399',
    down: '#f87171',
    text: '#e4e4e7',
    axis: '#a1a1aa',
    grid: 'rgba(255,255,255,0.06)',
    panel: '#1a1b24',
    border: 'rgba(255,255,255,0.10)',
  },
  light: {
    up: '#047857',
    down: '#b91c1c',
    text: '#18181b',
    axis: '#52525b',
    grid: 'rgba(0,0,0,0.12)',
    panel: '#ffffff',
    border: 'rgba(0,0,0,0.12)',
  },
};

/** ค่าเริ่มต้นตอนเรนเดอร์ครั้งแรกต้องเป็นค่าคงที่ ไม่งั้น SSR กับ client จะไม่ตรงกัน */
const INITIAL = FALLBACK.light;

/** ธีมมืดถูกทำเครื่องหมายด้วยคลาส .dark หรือ data-theme="dark" — รับทั้งสองแบบ */
function marksDark(el: Element | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  return el.classList.contains('dark') || el.dataset.theme === 'dark';
}

/**
 * แปลงค่าที่อ่านจากตัวแปรธีมให้เป็น "สีที่เบราว์เซอร์ใช้ได้จริง"
 *
 * ตัวแปรสีส่วนใหญ่ใน globals.css เก็บเป็น "ช่อง RGB" เช่น --up: 4 120 87
 * (เก็บแบบนี้โดยตั้งใจ เพื่อให้ Tailwind เติม alpha เองผ่าน rgb(var(--x) / <alpha-value>))
 * แต่ recharts เอาสตริงที่เราส่งไปยัดลง attribute ของ SVG และ style ของ DOM ตรง ๆ
 * ซึ่งไม่รู้จักรูปแบบนี้ เบราว์เซอร์จึงทิ้งทั้งบรรทัดแบบเงียบ ๆ:
 *   stroke="4 120 87"      → stroke: none        → เส้นกราฟหายทั้งเส้น
 *   stopColor="4 120 87"   → stop-color: black   → พื้นไล่เฉดกลายเป็นดำ
 *   backgroundColor        → พื้น tooltip โปร่ง  → เส้นกราฟทะลุมาทับตัวเลข
 * ต้องครอบ rgb() ให้ก่อนส่งเข้า recharts เสมอ
 *
 * ข้อยกเว้น: --border-subtle เก็บเป็น "สีเต็ม" อยู่แล้ว (rgb(0 0 0 / 0.08)) ส่งต่อได้ทันที
 * จึงต้องแยกสองกรณีนี้ออกจากกัน ไม่ใช่ครอบ rgb() ให้ทุกค่ารวด
 *
 * คืน null เมื่อค่าที่อ่านมาใช้เป็นสีไม่ได้ ผู้เรียกจะได้ถอยไปใช้ค่าสำรอง
 */
function toUsableColor(value: string): string | null {
  if (!value) return null;

  // "4 120 87" หรือ "4, 120, 87" = ช่อง RGB ล้วน → ครอบ rgb() ให้
  // (ใช้รูปแบบมีจุลภาคเพราะเป็นไวยากรณ์ที่ตัวแยกวิเคราะห์ทุกตัวรับแน่นอน)
  const channels = value.split(/[\s,]+/);
  if (channels.length === 3 && channels.every((c) => /^\d{1,3}$/.test(c))) {
    return `rgb(${channels.join(', ')})`;
  }

  // ยังมี var() ค้างอยู่ = ตัวแปรชี้ต่อไปหาตัวที่ไม่ได้ประกาศ ใช้เป็นสีไม่ได้
  if (value.includes('var(')) return null;

  // เป็นสีเต็มอยู่แล้ว (#hex, rgb(), hsl(), ชื่อสี) → ส่งต่อตามเดิม
  // ถาม CSS.supports ดีกว่าเดา regex เพราะครอบคลุมทุกไวยากรณ์ที่เบราว์เซอร์นั้นรู้จักจริง
  if (typeof CSS !== 'undefined' && typeof CSS.supports === 'function') {
    return CSS.supports('color', value) ? value : null;
  }
  return /^(#|rgba?\(|hsla?\()/i.test(value) ? value : null;
}

function readChartColors(): ChartColors {
  const root = document.documentElement;
  // อ่านค่าที่ body เพราะตัวแปรที่ประกาศบน :root สืบทอดลงมาถึง body อยู่แล้ว
  // แต่ถ้าธีมไปประกาศไว้ที่ body การอ่านที่ :root จะไม่เห็น — อ่านที่ body จึงครอบคลุมกว่า
  const cs = getComputedStyle(document.body || root);
  const base = marksDark(root) || marksDark(document.body) ? FALLBACK.dark : FALLBACK.light;

  // ตัวแปรตัวแรกที่ "แปลงเป็นสีที่ใช้ได้จริง" ได้ชนะ — เผื่อธีมตั้งชื่อโทเคนพื้นผิวไว้คนละระดับ
  // ของเดิมคืนค่าดิบทันทีที่สตริงไม่ว่าง ("4 120 87" ก็ไม่ว่าง) ค่าสำรองข้างล่างจึงไม่เคยถูกใช้เลย
  const pick = (names: string[], fallback: string) => {
    for (const name of names) {
      const color = toUsableColor(cs.getPropertyValue(name).trim());
      if (color) return color;
    }
    return fallback;
  };

  // พื้น tooltip ต้องทึบเท่านั้น ถ้าโทเคนพื้นผิวเป็นสีโปร่งแสง เส้นกราฟจะทะลุขึ้นมา
  // ทับตัวเลขจนอ่านไม่ออก — เจอแบบนั้นให้ถอยไปใช้สีทึบประจำธีมแทน
  // ต้องเช็คหลังแปลงค่าแล้วเท่านั้น ตอนที่ยังเป็น "26 27 36" เช็คยังไงก็ไม่มีวันเข้าเงื่อนไข
  // (รับทั้ง rgba()/hsla() แบบเก่า และ rgb(r g b / a) แบบใหม่ รวมถึง alpha เป็น 0 ถ้วน)
  const panel = pick(['--surface-1', '--surface-2'], base.panel);
  const isTranslucent = /transparent|rgba|hsla|\/\s*(0|0?\.\d+)\s*\)/i.test(panel);

  return {
    up: pick(['--up'], base.up),
    down: pick(['--down'], base.down),
    text: pick(['--text-primary'], base.text),
    axis: pick(['--text-secondary'], base.axis),
    grid: pick(['--border-subtle'], base.grid),
    panel: isTranslucent ? base.panel : panel,
    border: pick(['--border-subtle'], base.border),
  };
}

export default function EquityChart({ data, subtitle, emptyText }: Props) {
  const [colors, setColors] = useState<ChartColors>(INITIAL);

  useEffect(() => {
    const sync = () => setColors(readChartColors());
    sync();

    // สลับธีมคือการแก้คลาส/แอตทริบิวต์บน <html> (หรือ <body>) ซึ่งไม่ได้ทำให้ React
    // เรนเดอร์กราฟใหม่ ต้องเฝ้าดูเองแล้วอ่านสีชุดใหม่
    // ไม่งั้นกราฟจะค้างสีของธีมเดิมจนกว่าผู้ใช้จะรีเฟรชหน้า
    const observer = new MutationObserver(sync);
    const options: MutationObserverInit = {
      attributes: true,
      attributeFilter: ['class', 'data-theme', 'style'],
    };
    observer.observe(document.documentElement, options);
    if (document.body) observer.observe(document.body, options);
    return () => observer.disconnect();
  }, []);

  const startValue = data[0]?.value ?? 0;
  const endValue = data[data.length - 1]?.value ?? 0;
  const pnl = endValue - startValue;
  const pnlPct = startValue > 0 ? (pnl / startValue) * 100 : 0;
  const isUp = pnl >= 0;
  const color = isUp ? colors.up : colors.down;

  return (
    <div className="card">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="text-sm font-semibold text-white">Equity Curve</h3>
          <p className="text-xs text-gray-400 mt-0.5">{subtitle ?? 'ประสิทธิภาพพอร์ต 30 วัน'}</p>
        </div>
        <div className="text-right">
          <div className="text-2xl font-mono font-bold text-white">${endValue.toLocaleString()}</div>
          {/* กำไร = เขียว, ขาดทุน = แดง
              ต้องใช้โทเคน text-up/text-down ไม่ใช่ text-[var(--up)]
              เพราะ --up เก็บเป็นช่อง RGB ("4 120 87") ซึ่ง color: 4 120 87 เป็นค่าที่ไม่ถูกต้อง
              เบราว์เซอร์ทิ้งทั้งบรรทัด → กำไรกับขาดทุนกลายเป็นสีตัวอักษรปกติเหมือนกันทั้งคู่
              (text-white / text-gray-400 ผูกกับ --text-primary / --text-secondary ใน tailwind.config แล้ว) */}
          <div className={`text-sm font-medium ${isUp ? 'text-up' : 'text-down'}`}>
            {isUp ? '+' : ''}${pnl.toLocaleString()} ({isUp ? '+' : ''}{pnlPct.toFixed(2)}%)
          </div>
        </div>
      </div>

      <div className="h-[280px]">
        {data.length === 0 ? (
          <div className="h-full flex items-center justify-center text-sm text-gray-400 text-center px-6">
            {emptyText ?? 'ยังไม่มีข้อมูล'}
          </div>
        ) : (
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 5, right: 5, bottom: 5, left: 5 }}>
            <defs>
              <linearGradient id="equity-grad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={color} stopOpacity={0.3} />
                <stop offset="100%" stopColor={color} stopOpacity={0} />
              </linearGradient>
            </defs>
            {/* กริดกับแกนต้องเข้มพอบนพื้นขาว ของเดิมเป็นขาวโปร่ง 4% ซึ่งบนพื้นสว่างหายสนิท */}
            <CartesianGrid strokeDasharray="3 3" stroke={colors.grid} />
            <XAxis dataKey="date" tick={{ fontSize: 11, fill: colors.axis }} tickLine={false} axisLine={false} />
            <YAxis tick={{ fontSize: 11, fill: colors.axis }} tickLine={false} axisLine={false} width={60} />
            <Tooltip
              contentStyle={{
                backgroundColor: colors.panel,
                border: `1px solid ${colors.border}`,
                borderRadius: '12px',
                padding: '12px',
                fontSize: '12px',
                color: colors.text,
              }}
              labelStyle={{ color: colors.axis, marginBottom: '4px' }}
            />
            <Area
              type="monotone"
              dataKey="value"
              stroke={color}
              strokeWidth={2}
              fill="url(#equity-grad)"
              dot={false}
              activeDot={{ r: 4, strokeWidth: 2, stroke: color, fill: colors.panel }}
            />
          </AreaChart>
        </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
