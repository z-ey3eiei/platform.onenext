import { config } from '../../lib/config.ts'

const links = [
  { href: '#start', label: 'เริ่มต้น' },
  { href: '#pipeline', label: 'Pipeline' },
  { href: '#deploy', label: 'Deploy' },
]

export function Header() {
  return (
    <header className="sticky top-0 z-10 border-b border-slate-800 bg-slate-950/80 backdrop-blur">
      <div className="mx-auto flex max-w-4xl items-center justify-between gap-4 px-6 py-4">
        <a href="#start" className="text-base font-semibold tracking-tight">
          {config.appName}
        </a>
        <nav aria-label="หลัก">
          <ul className="flex gap-5 text-sm text-slate-300">
            {links.map((link) => (
              <li key={link.href}>
                <a className="hover:text-white" href={link.href}>
                  {link.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </header>
  )
}
