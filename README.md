# GANG CONTROL DAILY — ระบบจัดการแก๊ง FiveM

เว็บแอปภาษาไทยสำหรับใช้งานใน VS Code ด้วย Node.js

## ฟังก์ชันหลัก

- **เช็กชื่อ 3 รอบทุกวัน:** 16:30, 20:30 และ 23:50 (อิงวันที่ประเทศไทย)
- แอดมินบันทึกสถานะรายสมาชิก: มา, มาสาย, ขาด, ลา, ติดธุระ พร้อมเหตุผล/หมายเหตุ
- แก้ไขสถานะของวันและรอบนั้นได้ โดยเก็บวันที่ รอบเวลา ผู้บันทึก และเวลาบันทึก
- สมาชิกล็อกอินดูประวัติการเช็กชื่อของตัวเองได้
- เพิ่มสมาชิกพร้อมสร้าง Username/Password และนำสมาชิกออกจากแก๊งได้ (ปิดบัญชีแบบเก็บประวัติเดิม)
- คลังไอเทมและจำนวนคงเหลือ
- ระบบเบิกของ: สมาชิกส่งคำขอ แอดมินอนุมัติ/ปฏิเสธ; เมื่ออนุมัติจะหักจำนวนจากคลัง
- ระบบส่งของ: สมาชิกส่งได้หลายรายการ แอดมินยืนยันรับ/ตีกลับ; เมื่อยืนยันจะเพิ่มจำนวนเข้าคลังอัตโนมัติ
- ประวัติเช็กชื่อและกิจกรรมย้อนหลัง
- บันทึกข้อมูลใน `data/db.json`

## วิธีติดตั้งและเปิดใน VS Code

1. ติดตั้ง Node.js รุ่น 18 หรือใหม่กว่า
2. แตก ZIP แล้วเปิดโฟลเดอร์ `GANG_CONTROL_DAILY` ใน VS Code
3. เปิด Terminal ใน VS Code แล้วรัน:

   ```bash
   npm install
   ```

4. (แนะนำ) คัดลอก `.env.example` เป็น `.env` แล้วแก้ `SESSION_SECRET`, `ADMIN_USERNAME`, `ADMIN_PASSWORD` ก่อนเปิดใช้งานจริง
5. เริ่มระบบ:

   ```bash
   npm start
   ```

6. เปิดเว็บ `http://localhost:3000`

## บัญชีทดลอง

- แอดมิน: `admin` / `ChangeMe123!`
- สมาชิก Shadow: `shadow` / `Member123!`
- สมาชิก Raven: `raven` / `Member123!`
- สมาชิก Ghost: `ghost` / `Member123!`

บัญชีสมาชิกตัวอย่างจะถูกสร้างเมื่อฐานข้อมูลเริ่มต้นถูกสร้างครั้งแรกเท่านั้น ควรเปลี่ยนรหัสผ่านและลบ/แก้ข้อมูลตัวอย่างก่อนใช้งานจริง

## วิธีเช็กชื่อ

เข้าเมนู “ระบบเช็กชื่อ” เลือกรอบ 16:30, 20:30 หรือ 23:50 แล้วเลือกสถานะสมาชิกแต่ละคน หากเลือก “ขาด”, “ลา” หรือ “ติดธุระ” ให้ใส่เหตุผลในช่องหมายเหตุ แล้วกดบันทึก ระบบจะเก็บวันที่ รอบเวลา ผู้บันทึก และเวลาบันทึกไว้

> ระบบนี้เป็นการเช็กชื่อผ่านหน้าเว็บ แอดมินเป็นผู้บันทึกสถานะ ไม่ได้ตรวจจับผู้เล่นใน FiveM อัตโนมัติ และยังไม่มีระบบแจ้งเตือนอัตโนมัติ

## ข้อควรทราบ

- เวอร์ชันนี้เป็นเว็บแยก ยังไม่ได้เชื่อม ESX/QBCore หรือฐานข้อมูลเซิร์ฟเวอร์ FiveM โดยตรง
- ใช้ JSON เป็นฐานข้อมูล เหมาะกับการทดลองหรือกลุ่มเล็ก หากเปิดใช้งานหลายคนผ่านอินเทอร์เน็ตควรย้ายไป PostgreSQL และใช้ session store สำหรับ production
- หาก deploy บน Render ต้องจัดการฐานข้อมูล/ดิสก์ถาวร เพราะไฟล์ใน filesystem อาจไม่ถาวร
- ใช้ HTTPS, ตั้งรหัสผ่านที่คาดเดายาก, เปลี่ยน SESSION_SECRET และสำรอง `data/db.json` ก่อนใช้งานจริง
- การนำสมาชิกออกเป็นการปิดใช้งาน ไม่ได้ลบข้อมูลประวัติย้อนหลัง


## Render PostgreSQL deployment (V4)

Create a PostgreSQL database in Render, copy its **Internal Database URL**, and add it to the Web Service environment as `DATABASE_URL`. Also set `SESSION_SECRET` (32+ random characters), `NODE_ENV=production`, `ADMIN_USERNAME`, and a strong `ADMIN_PASSWORD`. Use `npm install` as Build Command and `npm start` as Start Command. Set Root Directory to `GANG_CONTROL_DAILY` only if that folder is inside the repository; otherwise leave it blank. After deploy, `/health` should return `ok`.

The first boot creates the PostgreSQL JSONB application state and the `user_sessions` table. The initial admin credentials are taken from `ADMIN_USERNAME` and `ADMIN_PASSWORD` at first database initialization (fallback: `admin` / `ChangeMe123!`). Changing those environment variables later does not reset an existing account. Do not delete the database to troubleshoot login.
