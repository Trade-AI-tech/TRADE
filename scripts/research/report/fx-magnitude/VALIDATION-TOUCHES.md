# สมุดบันทึกการแตะชุด validation ของ fx-magnitude.mjs

ชนิด `วิจัย` = การกวาดที่อาจนำไปสู่การตัดสินใจ (นี่คือตัวเลขที่ทำให้ validation ปนเปื้อนทีละนิด)
ชนิด `กลไก` = การรันซ้ำเพื่อเทียบไบต์ว่าได้ผลเดิมไหม ไม่มีการตัดสินใจใด ๆ

| เมื่อไร | ชนิด | อาร์กิวเมนต์ | หมายเหตุ |
|---|---|---|---|
| 2026-08-18T14:13:33.357Z | วิจัย | --bootstrap=200 --out-dir=C:/Users/ASUS/AppData/Local/Temp/claude/C--Users-ASUS-Desktop-TIKTOK/5505778e-6fc4-47c1-b0d5-9bb84af9ef5e/scratchpad/fxmag-smoke | กวาด validation เพื่อยืนยันผลจาก train |
| 2026-08-18T14:14:57.723Z | วิจัย | --bootstrap=200 --out-dir=C:/Users/ASUS/AppData/Local/Temp/claude/C--Users-ASUS-Desktop-TIKTOK/5505778e-6fc4-47c1-b0d5-9bb84af9ef5e/scratchpad/fxmag-smoke | กวาด validation เพื่อยืนยันผลจาก train |
| 2026-08-18T14:20:20.303Z | วิจัย | --bootstrap=200 --out-dir=C:/Users/ASUS/AppData/Local/Temp/claude/C--Users-ASUS-Desktop-TIKTOK/5505778e-6fc4-47c1-b0d5-9bb84af9ef5e/scratchpad/fxmag-smoke | กวาด validation เพื่อยืนยันผลจาก train |
| 2026-08-18T14:23:12.591Z | วิจัย | --bootstrap=200 --out-dir=C:/Users/ASUS/AppData/Local/Temp/claude/C--Users-ASUS-Desktop-TIKTOK/5505778e-6fc4-47c1-b0d5-9bb84af9ef5e/scratchpad/fxmag-smoke | กวาด validation เพื่อยืนยันผลจาก train |
| 2026-08-18T14:23:51.458Z | วิจัย | --bootstrap=200 --out-dir=C:/Users/ASUS/AppData/Local/Temp/claude/C--Users-ASUS-Desktop-TIKTOK/5505778e-6fc4-47c1-b0d5-9bb84af9ef5e/scratchpad/fxmag-smoke | กวาด validation เพื่อยืนยันผลจาก train |
| 2026-08-18T14:25:23.548Z | วิจัย | --bootstrap=200 --out-dir=C:/Users/ASUS/AppData/Local/Temp/claude/C--Users-ASUS-Desktop-TIKTOK/5505778e-6fc4-47c1-b0d5-9bb84af9ef5e/scratchpad/fxmag-smoke | กวาด validation เพื่อยืนยันผลจาก train |
| 2026-08-18T14:27:19.667Z | วิจัย | --bootstrap=200 --out-dir=C:/Users/ASUS/AppData/Local/Temp/claude/C--Users-ASUS-Desktop-TIKTOK/5505778e-6fc4-47c1-b0d5-9bb84af9ef5e/scratchpad/leak-full | กวาด validation เพื่อยืนยันผลจาก train |
| 2026-08-18T14:27:42.404Z | วิจัย | --bootstrap=200 --out-dir=C:/Users/ASUS/AppData/Local/Temp/claude/C--Users-ASUS-Desktop-TIKTOK/5505778e-6fc4-47c1-b0d5-9bb84af9ef5e/scratchpad/leak-cut --cache-dir=C:/Users/ASUS/AppData/Local/Temp/claude/C--Users-ASUS-Desktop-TIKTOK/5505778e-6fc4-47c1-b0d5-9bb84af9ef5e/scratchpad/candles-notest | กวาด validation เพื่อยืนยันผลจาก train |
| 2026-08-18T14:30:39.173Z | วิจัย | --bootstrap=200 --out-dir=C:/Users/ASUS/AppData/Local/Temp/claude/C--Users-ASUS-Desktop-TIKTOK/5505778e-6fc4-47c1-b0d5-9bb84af9ef5e/scratchpad/fxmag-smoke | กวาด validation เพื่อยืนยันผลจาก train |
| 2026-08-18T14:30:58.611Z | กลไก | --out-dir=C:\Users\ASUS\AppData\Local\Temp\fxmag-leak-dT4puv\full --rerun-probe | รันซ้ำเชิงกล — ไม่มีการตัดสินใจ |
| 2026-08-18T14:31:17.629Z | กลไก | --out-dir=C:\Users\ASUS\AppData\Local\Temp\fxmag-leak-dT4puv\cut --rerun-probe --cache-dir=C:\Users\ASUS\AppData\Local\Temp\fxmag-leak-dT4puv\candles-notest | รันซ้ำเชิงกล — ไม่มีการตัดสินใจ |
| 2026-08-18T14:31:35.746Z | กลไก | --out-dir=C:\Users\ASUS\AppData\Local\Temp\fxmag-leak-dT4puv\spill --rerun-probe --keep-spill | รันซ้ำเชิงกล — ไม่มีการตัดสินใจ |
| 2026-08-18T14:32:04.366Z | วิจัย | --out-dir=C:/Users/ASUS/AppData/Local/Temp/claude/C--Users-ASUS-Desktop-TIKTOK/5505778e-6fc4-47c1-b0d5-9bb84af9ef5e/scratchpad/t1 | กวาด validation เพื่อยืนยันผลจาก train |
| 2026-08-18T14:32:32.370Z | กลไก | --out-dir=C:\Users\ASUS\AppData\Local\Temp\fxmag-det-isfgoi\run-000 --rerun-probe | รันซ้ำเชิงกล — ไม่มีการตัดสินใจ |
| 2026-08-18T14:32:46.736Z | กลไก | --out-dir=C:\Users\ASUS\AppData\Local\Temp\fxmag-det-isfgoi\run-001 --rerun-probe | รันซ้ำเชิงกล — ไม่มีการตัดสินใจ |
| 2026-08-18T14:33:00.576Z | กลไก | --out-dir=C:\Users\ASUS\AppData\Local\Temp\fxmag-det-isfgoi\run-002 --rerun-probe | รันซ้ำเชิงกล — ไม่มีการตัดสินใจ |
| 2026-08-18T14:33:15.750Z | กลไก | --out-dir=C:\Users\ASUS\AppData\Local\Temp\fxmag-det-isfgoi\run-003 --rerun-probe | รันซ้ำเชิงกล — ไม่มีการตัดสินใจ |
| 2026-08-18T14:33:30.877Z | กลไก | --out-dir=C:\Users\ASUS\AppData\Local\Temp\fxmag-det-isfgoi\run-004 --rerun-probe | รันซ้ำเชิงกล — ไม่มีการตัดสินใจ |
| 2026-08-18T14:33:46.206Z | กลไก | --out-dir=C:\Users\ASUS\AppData\Local\Temp\fxmag-det-isfgoi\run-005 --rerun-probe | รันซ้ำเชิงกล — ไม่มีการตัดสินใจ |
| 2026-08-18T14:34:03.623Z | กลไก | --out-dir=C:\Users\ASUS\AppData\Local\Temp\fxmag-det-isfgoi\run-006 --rerun-probe | รันซ้ำเชิงกล — ไม่มีการตัดสินใจ |
| 2026-08-18T14:34:38.238Z | วิจัย | --bootstrap=200 --out-dir=C:/Users/ASUS/AppData/Local/Temp/claude/C--Users-ASUS-Desktop-TIKTOK/5505778e-6fc4-47c1-b0d5-9bb84af9ef5e/scratchpad/t2 | กวาด validation เพื่อยืนยันผลจาก train |
| 2026-08-18T14:35:50.617Z | วิจัย | --bootstrap=50 --out-dir=C:/Users/ASUS/AppData/Local/Temp/claude/C--Users-ASUS-Desktop-TIKTOK/5505778e-6fc4-47c1-b0d5-9bb84af9ef5e/scratchpad/fault/out-none | กวาด validation เพื่อยืนยันผลจาก train |
| 2026-08-18T14:36:03.147Z | วิจัย | --bootstrap=50 --out-dir=C:/Users/ASUS/AppData/Local/Temp/claude/C--Users-ASUS-Desktop-TIKTOK/5505778e-6fc4-47c1-b0d5-9bb84af9ef5e/scratchpad/fault/out-d1 | กวาด validation เพื่อยืนยันผลจาก train |
| 2026-08-18T14:36:14.890Z | วิจัย | --bootstrap=50 --out-dir=C:/Users/ASUS/AppData/Local/Temp/claude/C--Users-ASUS-Desktop-TIKTOK/5505778e-6fc4-47c1-b0d5-9bb84af9ef5e/scratchpad/fault/out-d2 | กวาด validation เพื่อยืนยันผลจาก train |
| 2026-08-18T14:36:27.008Z | วิจัย | --bootstrap=50 --out-dir=C:/Users/ASUS/AppData/Local/Temp/claude/C--Users-ASUS-Desktop-TIKTOK/5505778e-6fc4-47c1-b0d5-9bb84af9ef5e/scratchpad/fault/out-d3 | กวาด validation เพื่อยืนยันผลจาก train |
| 2026-08-18T14:37:12.036Z | วิจัย | --bootstrap=50 --out-dir=C:/Users/ASUS/AppData/Local/Temp/claude/C--Users-ASUS-Desktop-TIKTOK/5505778e-6fc4-47c1-b0d5-9bb84af9ef5e/scratchpad/fault/out-d2b | กวาด validation เพื่อยืนยันผลจาก train |
| 2026-08-18T14:38:53.270Z | กลไก | --bootstrap=50 --out-dir=C:\Users\ASUS\AppData\Local\Temp\fxmag-selftest-CiFBwb\ควบคุม --rerun-probe | รันซ้ำเชิงกล — ไม่มีการตัดสินใจ |
| 2026-08-18T14:39:04.985Z | กลไก | --bootstrap=50 --out-dir=C:\Users\ASUS\AppData\Local\Temp\fxmag-selftest-CiFBwb\ก1 --rerun-probe | รันซ้ำเชิงกล — ไม่มีการตัดสินใจ |
| 2026-08-18T14:39:15.913Z | กลไก | --bootstrap=50 --out-dir=C:\Users\ASUS\AppData\Local\Temp\fxmag-selftest-CiFBwb\ก2 --rerun-probe | รันซ้ำเชิงกล — ไม่มีการตัดสินใจ |
| 2026-08-18T14:39:27.274Z | กลไก | --bootstrap=50 --out-dir=C:\Users\ASUS\AppData\Local\Temp\fxmag-selftest-CiFBwb\ก3 --rerun-probe | รันซ้ำเชิงกล — ไม่มีการตัดสินใจ |
| 2026-08-18T14:40:07.494Z | วิจัย | --bootstrap=50 --out-dir=C:/Users/ASUS/AppData/Local/Temp/claude/C--Users-ASUS-Desktop-TIKTOK/5505778e-6fc4-47c1-b0d5-9bb84af9ef5e/scratchpad/t3 | กวาด validation เพื่อยืนยันผลจาก train |
| 2026-08-18T14:40:26.536Z | กลไก | --bootstrap=50 --out-dir=C:\Users\ASUS\AppData\Local\Temp\fxmag-selftest-G8fZ9y\ควบคุม --rerun-probe | รันซ้ำเชิงกล — ไม่มีการตัดสินใจ |
| 2026-08-18T14:40:38.449Z | กลไก | --bootstrap=50 --out-dir=C:\Users\ASUS\AppData\Local\Temp\fxmag-selftest-G8fZ9y\ก1 --rerun-probe | รันซ้ำเชิงกล — ไม่มีการตัดสินใจ |
| 2026-08-18T14:40:49.646Z | กลไก | --bootstrap=50 --out-dir=C:\Users\ASUS\AppData\Local\Temp\fxmag-selftest-G8fZ9y\ก2 --rerun-probe | รันซ้ำเชิงกล — ไม่มีการตัดสินใจ |
| 2026-08-18T14:40:59.435Z | กลไก | --bootstrap=50 --out-dir=C:\Users\ASUS\AppData\Local\Temp\fxmag-selftest-G8fZ9y\ก3 --rerun-probe | รันซ้ำเชิงกล — ไม่มีการตัดสินใจ |
| 2026-08-18T14:41:13.983Z | กลไก | --out-dir=C:\Users\ASUS\AppData\Local\Temp\fxmag-leak-pnitk9\full --rerun-probe | รันซ้ำเชิงกล — ไม่มีการตัดสินใจ |
| 2026-08-18T14:41:31.322Z | กลไก | --out-dir=C:\Users\ASUS\AppData\Local\Temp\fxmag-leak-pnitk9\cut --rerun-probe --cache-dir=C:\Users\ASUS\AppData\Local\Temp\fxmag-leak-pnitk9\candles-notest | รันซ้ำเชิงกล — ไม่มีการตัดสินใจ |
| 2026-08-18T14:41:47.360Z | กลไก | --out-dir=C:\Users\ASUS\AppData\Local\Temp\fxmag-leak-pnitk9\spill --rerun-probe --keep-spill | รันซ้ำเชิงกล — ไม่มีการตัดสินใจ |
| 2026-08-18T14:42:12.203Z | วิจัย | (ไม่มี) | กวาด validation เพื่อยืนยันผลจาก train |
| 2026-08-18T14:42:40.862Z | กลไก | --out-dir=C:\Users\ASUS\AppData\Local\Temp\fxmag-det-C8e4D8\run-000 --rerun-probe | รันซ้ำเชิงกล — ไม่มีการตัดสินใจ |
| 2026-08-18T14:42:56.327Z | กลไก | --out-dir=C:\Users\ASUS\AppData\Local\Temp\fxmag-det-C8e4D8\run-001 --rerun-probe | รันซ้ำเชิงกล — ไม่มีการตัดสินใจ |
| 2026-08-18T14:43:13.375Z | กลไก | --out-dir=C:\Users\ASUS\AppData\Local\Temp\fxmag-det-C8e4D8\run-002 --rerun-probe | รันซ้ำเชิงกล — ไม่มีการตัดสินใจ |
| 2026-08-18T14:43:28.927Z | กลไก | --out-dir=C:\Users\ASUS\AppData\Local\Temp\fxmag-det-C8e4D8\run-003 --rerun-probe | รันซ้ำเชิงกล — ไม่มีการตัดสินใจ |
| 2026-08-18T14:44:44.695Z | วิจัย | --bootstrap=50 --out-dir=C:/Users/ASUS/AppData/Local/Temp/claude/C--Users-ASUS-Desktop-TIKTOK/5505778e-6fc4-47c1-b0d5-9bb84af9ef5e/scratchpad/t4 | กวาด validation เพื่อยืนยันผลจาก train |
| 2026-08-18T14:45:06.817Z | กลไก | --bootstrap=50 --out-dir=C:\Users\ASUS\AppData\Local\Temp\fxmag-selftest-BhOXY6\ควบคุม --rerun-probe | รันซ้ำเชิงกล — ไม่มีการตัดสินใจ |
| 2026-08-18T14:45:18.021Z | กลไก | --bootstrap=50 --out-dir=C:\Users\ASUS\AppData\Local\Temp\fxmag-selftest-BhOXY6\ก1 --rerun-probe | รันซ้ำเชิงกล — ไม่มีการตัดสินใจ |
| 2026-08-18T14:45:28.387Z | กลไก | --bootstrap=50 --out-dir=C:\Users\ASUS\AppData\Local\Temp\fxmag-selftest-BhOXY6\ก2 --rerun-probe | รันซ้ำเชิงกล — ไม่มีการตัดสินใจ |
| 2026-08-18T14:45:39.038Z | กลไก | --bootstrap=50 --out-dir=C:\Users\ASUS\AppData\Local\Temp\fxmag-selftest-BhOXY6\ก3 --rerun-probe | รันซ้ำเชิงกล — ไม่มีการตัดสินใจ |
