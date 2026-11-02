# platform.onenext — Vite + React 19 + TypeScript + Tailwind v4

โครงเว็บที่ build ได้และ **deploy อัตโนมัติ**: ทดสอบทุก PR, ส่งขึ้น production เมื่อ merge เข้า `main`

## เริ่มใช้งาน

```bash
npm install
cp .env.example .env     # แก้ค่าตามจริง
npm run dev              # http://localhost:5173
```

| คำสั่ง | ทำอะไร |
| --- | --- |
| `npm run dev` | dev server + HMR |
| `npm run check` | lint + typecheck + test — รันก่อน push เสมอ |
| `npm run build` | `tsc --noEmit` แล้ว build ลง `dist/` |
| `npm run preview` | ทดลองไฟล์ที่ build แล้วในเครื่อง |
| `npm run test:watch` | เทสต์แบบฟังไฟล์ |
| `npm run deploy:prod` | ส่งขึ้น production จากเครื่อง (ต้องมี Vercel CLI + `vercel link`) |

## โครงสร้าง

```
src/
  App.tsx                 หน้าแรก — เริ่มแก้ที่นี่
  main.tsx                จุด mount React
  index.css               Tailwind v4 + design tokens (@theme)
  components/ui/          ปุ่ม/ชิ้นส่วนที่ใช้ซ้ำ (มี test คู่กัน)
  components/layout/      Header / ส่วนห่อหน้า
  lib/config.ts           อ่าน env + helper (joinUrl) — มี test
.github/workflows/
  ci.yml                  ตรวจคุณภาพทุก PR
  deploy.yml              deploy ขึ้น prod เมื่อ merge
```

## สองทางเลือกในการ deploy — เลือกอย่างใดอย่างหนึ่ง

**ทาง A — ให้ Vercel build จาก Git เอง (ง่ายสุด ไม่ต้องมี secret ใน GitHub)**
เชื่อม repo ที่ Vercel → New Project → Import แล้วทุก push เข้า `main` จะขึ้น production อัตโนมัติ
ถ้าใช้ทางนี้ ให้ลบหรือ disable `.github/workflows/deploy.yml` ก่อน ไม่งั้นจะถูก build ซ้ำ 2 รอบต่อ 1 commit
(หมายเหตุ: Vercel จะเห็นเฉพาะ repo ของบัญชี GitHub ที่ติดตั้ง Vercel App — ถ้า repo อยู่คนละบัญชี ต้องติดตั้ง App ให้ repo นั้นก่อน)

**ทาง B — ให้ GitHub Actions เป็นคน deploy (ไฟล์ `.github/workflows/deploy.yml` ใน repo นี้ setups ไว้แล้ว)**
ต้องใส่ 3 secret ตามตารางด้านล่างใน GitHub — ใช้ได้แม้ repo อยู่คนละบัญชีกับ Vercel

อ่านค่าผ่าน `secrets.*` เท่านั้น → ต้องใส่ใน **GitHub → repo → Settings → Secrets and variables → Actions → tab "Secrets"** (ไม่ใช่ tab "Variables")

| ชื่อที่ต้องตรงกับใน workflow | ใส่ที่ไหน |
| --- | --- |
| `VERCEL_TOKEN` | Repo secrets |
| `VERCEL_ORG_ID` | Repo secrets (หรือ environment `production` secrets ก็ได้) |
| `VERCEL_PROJECT_ID` | Repo secrets |

ถ้าใส่ผิดช่องเป็น `Variables` ตัว workflow จะอ่านไม่เห็น (ค่าว่าง) แล้ว `vercel pull` จะล้มเหลว — อาการคือขึ้น `Could not find project settings`

`VERCEL_ORG_ID` / `VERCEL_PROJECT_ID` อ่านจากไฟล์ `.vercel/project.json` หลังรัน `npx vercel link` ในเครื่อง หรือดูจาก URL ในหน้า dashboard ของ Vercel (`.../teams/<orgId>/projects/<projectId>`)

## ค่า env ฝั่ง production (Vercel)

`VITE_*` ฝังลงไฟล์ JS ตอน **build** ไม่ใช่ตอนรัน และขั้น `vercel build` อ่านค่าจากโปรเจกต์ Vercel (หลัง `vercel pull`) — ตั้งที่ **Vercel → Project → Settings → Environment Variables → Production**

| ตัวแปร | ตัวอย่าง |
| --- | --- |
| `VITE_APP_NAME` | `OneNext Platform` |
| `VITE_API_URL` | `https://api.onenext.example` |

- `VITE_API_URL` **ว่างได้** — หน้าแรกจะขึ้นแถบเตือนว่ายังไม่ได้ตั้ง
- ใส่ค่าแล้วต้อง **deploy ใหม่หนึ่งรอบ** ค่าถึงมีผล (มันถูกฝังใน JS ที่ build ไว้แล้ว)
- ค่าที่ขึ้นต้น `VITE_` ฝังใน JS ที่ส่งให้เบราว์เซอร์ **ห้ามใส่ของลับ** — ของลับต้องอยู่ฝั่งเซิร์ฟเวอร์

## Pipeline ทำงานอย่างไร

1. `push` / เปิด PR → `ci.yml` รัน lint + typecheck + test + build
2. merge เข้า `main` → `deploy.yml` เรียก `ci.yml` เป็นด่าน (`needs: quality`) ก่อน แล้วจึง deploy — โค้ดพังจะไม่ได้ขึ้น prod
3. ตั้ง **Required reviewers** บน environment `production` (Settings → Environments) ถ้าอยากได้คนกดอนุมัติก่อนขึ้นจริง
4. ตั้ง branch protection บน `main` ให้ require check `quality` กัน merge โค้ดพัง

## ปรับ pipeline

- **ไม่ต้องรัน quality ซ้ำ:** ตอนนี้ `deploy.yml` เรียก `ci.yml` ผ่าน `workflow_call` ซึ่ง build หนึ่งครั้งใน job quality ถ้าอยากให้ deploy ใช้ artifact จาก job นั้นโดยตรง ให้ใช้ `actions/download-artifact` แทน `vercel build`
- **เปลี่ยนโฮสต์:** แทนขั้น Vercel 4 ขั้นใน `deploy.yml` ด้วยคำสั่งของ Netlify / Cloudflare Pages / S3 — โฟลเดอร์ output คือ `dist/` เหมือนเดิม (`vercel.json` ลบได้ถ้าไม่ใช้ Vercel)

## สัญญาอนุญาต

Repo นี้มี `LICENSE` เป็น **GPL-3.0** อยู่แล้ว — โค้ดโครงนี้เผยแพร่ตามสัญญาอนุญาตของ repo (GPL ไม่มี network copyleft แบบ AGPL so บริการภายนอกที่คุณเรียกจะไม่ถูกบังคับให้เปิดซอร์สตาม) ถ้าอยากเปลี่ยนเป็น MIT ให้วางไฟล์ `LICENSE` ทับ
