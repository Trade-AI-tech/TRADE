import type { Signal } from '@/types';

/**
 * Telegram notification service
 * ส่งสัญญาณเทรดผ่าน Telegram Bot
 */

export interface TelegramConfig {
  botToken: string;
  chatId: string;
}

/**
 * MarkdownV2 สงวนอักขระเหล่านี้ไว้ ต้อง escape ทุกตัว
 * รวมถึง "." ในราคา เช่น 2650.50 — ถ้าไม่ escape Telegram จะตอบ 400
 */
const RESERVED = /([_*[\]()~`>#+\-=|{}.!\\])/g;

function esc(value: string | number): string {
  return String(value).replace(RESERVED, '\\$1');
}

/**
 * Format a signal as a Telegram message
 */
export function formatSignalMessage(signal: Signal): string {
  const emoji = {
    BUY: '🟢',
    SELL: '🔴',
    HOLD: '🟡',
    CLOSE: '⚪',
  }[signal.action];

  const strengthEmoji = {
    weak: '⭐',
    moderate: '⭐⭐',
    strong: '⭐⭐⭐',
    very_strong: '⭐⭐⭐⭐',
  }[signal.strength];

  const lines = [
    `${emoji} *${esc(signal.action)} SIGNAL* ${strengthEmoji}`,
    ``,
    `📊 *${esc(signal.symbol)}* \\- ${esc(signal.name)}`,
    `💹 Market: ${esc(signal.market)}`,
    `⏰ Timeframe: ${esc(signal.timeframe)}`,
    `🎯 Confidence: *${esc(signal.confidence)}%*`,
    ``,
    `💵 *Entry:* ${esc(signal.entry_price)}`,
    `🛑 *Stop Loss:* ${esc(signal.stop_loss)}`,
    `🎯 *Take Profit:* ${esc(signal.take_profit)}`,
    ``,
    `📝 *Reasons:*`,
    ...signal.reasons.slice(0, 4).map(r => `• ${esc(r.label)}: ${esc(r.detail)}`),
  ];

  return lines.join('\n');
}

/**
 * Send message to Telegram
 * ถ้า MarkdownV2 parse ไม่ผ่าน จะส่งซ้ำเป็นข้อความธรรมดาแทนที่จะเงียบหาย
 */
export async function sendTelegramMessage(
  config: TelegramConfig,
  message: string
): Promise<{ success: boolean; error?: string }> {
  if (!config.botToken || !config.chatId) {
    return { success: false, error: 'Missing bot token or chat ID' };
  }

  const post = async (body: Record<string, unknown>) => {
    const res = await fetch(
      `https://api.telegram.org/bot${config.botToken}/sendMessage`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }
    );
    return res.json();
  };

  try {
    const base = { chat_id: config.chatId, disable_web_page_preview: true };
    const data = await post({ ...base, text: message, parse_mode: 'MarkdownV2' });
    if (data.ok) return { success: true };

    // fallback: ถอด markdown ออกแล้วส่งเป็น plain text
    const plain = message.replace(/\\([_*[\]()~`>#+\-=|{}.!\\])/g, '$1').replace(/\*/g, '');
    const retry = await post({ ...base, text: plain });
    if (retry.ok) return { success: true };

    return { success: false, error: retry.description || data.description || 'Unknown error' };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

/**
 * Send signal alert
 */
export async function sendSignalAlert(
  config: TelegramConfig,
  signal: Signal
): Promise<{ success: boolean; error?: string }> {
  const message = formatSignalMessage(signal);
  return sendTelegramMessage(config, message);
}

/**
 * ข้อมูลขั้นต่ำที่ต้องใช้ตอนแจ้งเตือนออเดอร์ปิด
 * ตั้งเป็นชนิดแคบ ๆ แทนที่จะรับ Trade ทั้งก้อน เพราะฝั่ง cron มีแค่ค่าที่คำนวณเสร็จแล้ว
 * ยังไม่ต้องอ่านแถวเต็มกลับมาจาก DB
 */
export interface ClosedTradeSummary {
  symbol: string;
  name: string;
  market: string;
  direction: 'long' | 'short';
  entry_price: number;
  quantity: number;
  pnl: number;
  pnl_percent: number;
}

/**
 * ราคาคริปโตเศษเหรียญทำให้ toFixed(2) กลายเป็น "0.00" จนดูเหมือนไม่มีกำไร/ขาดทุนเลย
 * ค่าที่เล็กกว่า 1 จึงเก็บทศนิยมไว้มากกว่าแล้วค่อยตัดศูนย์ท้ายทิ้ง
 */
function fmtNum(value: number): string {
  if (Math.abs(value) >= 1) return value.toFixed(2);
  return value.toFixed(8).replace(/0+$/, '').replace(/\.$/, '');
}

/**
 * Format a closed-trade notification
 * ใช้ตอน cron ตรวจเจอว่าราคาแตะ SL/TP แล้วปิดออเดอร์ในสมุดให้อัตโนมัติ
 */
export function formatTradeClosedMessage(
  trade: ClosedTradeSummary,
  reason: 'stop_loss' | 'take_profit',
  exitPrice: number
): string {
  const isTakeProfit = reason === 'take_profit';
  const headEmoji = isTakeProfit ? '🎯' : '🛑';
  const headText = isTakeProfit
    ? 'ปิดออเดอร์อัตโนมัติ — ถึงเป้าทำกำไร (Take Profit)'
    : 'ปิดออเดอร์อัตโนมัติ — ชนจุดตัดขาดทุน (Stop Loss)';

  // ทิศทางกำไร/ขาดทุนตัดสินจาก pnl จริง ไม่ใช่จาก reason
  // เพราะ TP ที่ตั้งผิดฝั่งหรือค่าธรรมเนียมสูงก็ทำให้ "ถึงเป้า" แล้วยังติดลบได้
  const pnlKnown = Number.isFinite(trade.pnl) && Number.isFinite(trade.pnl_percent);
  const isProfit = pnlKnown && trade.pnl >= 0;
  const pnlEmoji = !pnlKnown ? '⚪' : isProfit ? '🟢' : '🔴';
  const pnlLabel = !pnlKnown ? 'กำไร/ขาดทุน' : isProfit ? 'กำไร' : 'ขาดทุน';

  // ข้อมูลไม่พอห้ามเดาเป็น 0 — บอกตรง ๆ ว่าคำนวณไม่ได้
  const sign = isProfit ? '+' : '';
  const pnlText = pnlKnown
    ? `${sign}${fmtNum(trade.pnl)} (${sign}${fmtNum(trade.pnl_percent)}%)`
    : 'คำนวณไม่ได้ (ข้อมูลไม่พอ)';

  const directionText = trade.direction === 'long' ? 'Long (ซื้อ)' : 'Short (ขาย)';

  const lines = [
    `${headEmoji} *${esc(headText)}*`,
    ``,
    `📊 *${esc(trade.symbol)}* \\- ${esc(trade.name)}`,
    `💹 Market: ${esc(trade.market)}`,
    `↕️ ทิศทาง: ${esc(directionText)}`,
    ``,
    `💵 ราคาเข้า: ${esc(trade.entry_price)}`,
    `🚪 ราคาออก: ${esc(exitPrice)}`,
    `🔢 จำนวน: ${esc(trade.quantity)}`,
    ``,
    `${pnlEmoji} *${esc(pnlLabel)}:* ${esc(pnlText)}`,
    ``,
    // ต้องเตือนทุกครั้ง กันเข้าใจผิดว่าระบบไปปิดออเดอร์ให้ที่โบรกเกอร์แล้ว
    `⚠️ ${esc('นี่คือการบันทึกในสมุดเทรดเท่านั้น ระบบไม่ได้ส่งคำสั่งซื้อขายไปยังโบรกเกอร์จริง')}`,
  ];

  return lines.join('\n');
}

/**
 * Send closed-trade alert
 */
export async function sendTradeClosedAlert(
  config: TelegramConfig,
  trade: ClosedTradeSummary,
  reason: 'stop_loss' | 'take_profit',
  exitPrice: number
): Promise<{ success: boolean; error?: string }> {
  const message = formatTradeClosedMessage(trade, reason, exitPrice);
  return sendTelegramMessage(config, message);
}

/**
 * Test Telegram connection
 */
export async function testTelegramConnection(
  config: TelegramConfig
): Promise<{ success: boolean; error?: string }> {
  const message = '✅ *ทดสอบการเชื่อมต่อ Trading AI Bot*\n\nการแจ้งเตือนพร้อมใช้งานแล้ว';
  return sendTelegramMessage(config, message);
}
