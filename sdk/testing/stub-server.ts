/**
 * Minimal stand-in for the platform.onenext backend, used only by tests and
 * `npm run dev:stub`. It speaks enough of the REST shape that the SDK's real
 * fetch path is exercised end to end — no mocks of our own HTTP layer.
 */
import { createServer, type Server, type IncomingMessage, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'

export interface StubHandle {
  url: string
  requests: { path: string; method: string; headers: Record<string, string | string[] | undefined> }[]
  close(): Promise<void>
  reset(): void
}

const USERS = [
  { id: 1, email: 'a@example.com', role: 'admin' },
  { id: 2, email: 'b@example.com', role: 'member' },
  { id: 3, email: 'c@example.com', role: 'member' },
]

function json(res: ServerResponse, status: number, body: unknown, extra: Record<string, string> = {}) {
  const payload = JSON.stringify(body)
  res.writeHead(status, {
    'content-type': 'application/json',
    'content-length': Buffer.byteLength(payload),
    'x-onenext-request-id': `stub-${Math.random().toString(36).slice(2, 10)}`,
    ...extra,
  })
  res.end(payload)
}

let flakyHits = 0

export async function startStubServer(): Promise<StubHandle> {
  const requests: StubHandle['requests'] = []

  const server: Server = createServer((req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1')
    requests.push({ path: req.url ?? '/', method: req.method ?? 'GET', headers: req.headers as never })

    switch (url.pathname) {
      case '/rest/v1/users': {
        let rows = [...USERS]
        for (const [key, value] of url.searchParams) {
          if (key === 'select') continue
          if (key === 'limit') { rows = rows.slice(0, Number(value)); continue }
          const [op = '', arg = ''] = value.split('.')
          if (op === 'eq') rows = rows.filter((r) => String(r[key as keyof typeof r]) === arg)
          if (op === 'in') {
            const wanted = arg.replace(/^\(|\)$/g, '').split(',')
            rows = rows.filter((r) => wanted.includes(String(r[key as keyof typeof r])))
          }
          if (op === 'gt') rows = rows.filter((r) => Number(r[key as keyof typeof r]) > Number(arg))
        }
        const wantsObject = String(req.headers.accept ?? '').includes('pgrst.object')
        if (wantsObject) {
          if (rows.length !== 1) {
            return json(res, 406, { code: 'pgrst_not_unique', message: `Expected 1 row, got ${rows.length}` })
          }
          return json(res, 200, rows[0])
        }
        return json(res, 200, rows)
      }
      case '/flaky': {
        flakyHits += 1
        if (flakyHits < 3) return json(res, 429, { code: 'rate_limited', message: 'slow down' }, { 'retry-after': '0' })
        return json(res, 200, { ok: true, attempts: flakyHits })
      }
      case '/slow':
        // Never answers: lets the test prove the client's own timeout wins.
        return
      case '/boom':
        return json(res, 500, { code: 'kaboom', message: 'backend exploded' })
      case '/missing':
        return json(res, 404, { code: 'not_found', message: 'no such resource' })
      default:
        return json(res, 404, { code: 'unknown_route', message: `no stub for ${url.pathname}` })
    }
  })

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const port = (server.address() as AddressInfo).port

  return {
    url: `http://127.0.0.1:${port}`,
    requests,
    reset() {
      requests.length = 0
      flakyHits = 0
    },
    close() {
      return new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())))
    },
  }
}
