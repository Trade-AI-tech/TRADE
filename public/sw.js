/**
 * Service Worker — รับ Web Push แล้วเด้งแจ้งเตือนบนเครื่อง
 *
 * ต้องอยู่ที่ราก public/ เพื่อให้ scope ครอบทั้งเว็บ
 * iOS: ทำงานเฉพาะเมื่อผู้ใช้ "เพิ่มไปยังหน้าจอโฮม" แล้วเท่านั้น (ข้อบังคับของ Apple, iOS 16.4+)
 * และเว็บต้องเสิร์ฟผ่าน HTTPS (localhost ยกเว้นให้ตอน dev)
 */

self.addEventListener('install', () => {
  // ขึ้นเวอร์ชันใหม่ให้ทำงานทันที ไม่รอแท็บเก่าปิด — SW นี้ทำหน้าที่แจ้งเตือนอย่างเดียว
  // ไม่มี cache ที่จะพังจากการสลับเวอร์ชันกลางคัน
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  // payload มาจากตัวส่งของเราเอง (Edge Function) เป็น JSON เสมอ
  // แต่กันไว้: parse ไม่ได้ก็ยังต้องเด้งแจ้งเตือนพื้นฐาน — บนเครื่องผู้ใช้
  // push ที่ไม่แสดงแจ้งเตือนจะโดนเบราว์เซอร์ลงโทษ (ตัดสิทธิ์ push เงียบ ๆ)
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: 'Trading AI', body: event.data ? event.data.text() : '' };
  }

  const title = data.title || 'Trading AI';
  const options = {
    body: data.body || '',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    // tag เดียวกันทับกันได้ — สัญญาณตัวเดียวกันส่งซ้ำจะไม่เด้งรัว
    tag: data.tag || 'trading-ai',
    data: { url: data.url || '/signals' },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/signals';

  // มีแท็บของแอปเปิดอยู่แล้วให้สลับไปแท็บนั้น ไม่เปิดซ้ำ
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((tabs) => {
      for (const tab of tabs) {
        if (new URL(tab.url).origin === self.location.origin && 'focus' in tab) {
          tab.navigate(url);
          return tab.focus();
        }
      }
      return self.clients.openWindow(url);
    })
  );
});
