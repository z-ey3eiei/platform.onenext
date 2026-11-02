import { useState } from 'react'
import { Header } from './components/layout/Header.tsx'
import { Button } from './components/ui/Button.tsx'
import { config, missingConfigKeys } from './lib/config.ts'

const commands = [
  { cmd: 'npm run dev', note: 'เซิร์ฟเวอร์ dev + HMR' },
  { cmd: 'npm run check', note: 'lint + typecheck + test (ใช้ตัวนี้ก่อน push)' },
  { cmd: 'npm run build', note: 'typecheck แล้ว build ลงโฟลเดอร์ dist/' },
  { cmd: 'npm run preview', note: 'เทสต์ไฟล์ที่ build แล้วในเครื่อง' },
  { cmd: 'npm run deploy:prod', note: 'ส่งขึ้น production ผ่าน Vercel CLI' },
]

const pipeline = [
  {
    title: '1. push ขึ้น GitHub',
    body: 'ทุก PR และทุก commit เข้า main จะโดน .github/workflows/ci.yml ตรวจ: lint, typecheck, test, build',
  },
  {
    title: '2. merge แล้ว deploy อัตโนมัติ',
    body: '.github/workflows/deploy.yml สร้าง prebuilt dist/ แล้วส่งขึ้น production — ต้องมี 3 secret: VERCEL_TOKEN, VERCEL_ORG_ID, VERCEL_PROJECT_ID',
  },
  {
    title: '3. ถ้า build พัง',
    body: 'การ deploy จะไม่ถูกเรียก (needs: quality) และ CI จะ comment บอกว่า_fail_ที่ขั้นไหน รัน npm run check ในเครื่องเพื่อเห็นผลแบบเดียวกัน',
  },
]

export function App() {
  const [clicked, setClicked] = useState(0)
  const missing = missingConfigKeys()

  return (
    <div className="min-h-dvh">
      <Header />

      <main className="mx-auto max-w-4xl space-y-16 px-6 py-14">
        <section id="start" className="space-y-4">
          <p className="text-xs font-medium uppercase tracking-widest text-brand-500">
            Starter พร้อมใช้
          </p>
          <h1 className="text-4xl font-bold leading-tight sm:text-5xl">
            {config.appName} — Vite + React + TypeScript
          </h1>
          <p className="max-w-2xl text-slate-300">
            โครงเว็บที่ build ได้และ deploy อัตโนมัติ: ทดสอบใน PR, ส่งขึ้น prod
            เมื่อ merge เปลี่ยนชื่อเว็บได้ที่ <code>VITE_APP_NAME</code> ในไฟล์{' '}
            <code>.env</code>
          </p>
          <div className="flex flex-wrap gap-3 pt-2">
            <Button onClick={() => setClicked((n) => n + 1)}>
              กดทดสอบ {clicked > 0 ? `(${clicked})` : ''}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setClicked(0)}>
              รีเซ็ต
            </Button>
          </div>
          {missing.length > 0 && (
            <p className="pt-2 text-sm text-amber-300">
              ยังไม่ได้ตั้ง env: {missing.join(', ')} — คัดลอก{' '}
              <code>.env.example</code> เป็น <code>.env</code>
            </p>
          )}
        </section>

        <section id="pipeline" className="space-y-6">
          <h2 className="text-2xl font-semibold">คำสั่งที่ใช้บ่อย</h2>
          <div className="overflow-x-auto rounded-xl border border-slate-800">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-900 text-slate-400">
                <tr>
                  <th className="px-4 py-3 font-medium">คำสั่ง</th>
                  <th className="px-4 py-3 font-medium">ทำอะไร</th>
                </tr>
              </thead>
              <tbody>
                {commands.map((row) => (
                  <tr key={row.cmd} className="border-t border-slate-800">
                    <td className="px-4 py-3">
                      <code className="text-brand-500">{row.cmd}</code>
                    </td>
                    <td className="px-4 py-3 text-slate-300">{row.note}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section id="deploy" className="space-y-6">
          <h2 className="text-2xl font-semibold">Pipeline หลังบ้าน</h2>
          <div className="grid gap-4 sm:grid-cols-3">
            {pipeline.map((card) => (
              <article
                key={card.title}
                className="space-y-2 rounded-xl border border-slate-800 bg-slate-900/60 p-5"
              >
                <h3 className="font-semibold">{card.title}</h3>
                <p className="text-sm leading-relaxed text-slate-300">{card.body}</p>
              </article>
            ))}
          </div>
        </section>
      </main>

      <footer className="border-t border-slate-800 py-8 text-center text-sm text-slate-500">
        สร้างจาก starter — แก้ <code>src/App.tsx</code> เพื่อเริ่มเขียนเว็บของคุณ
      </footer>
    </div>
  )
}
