import { fetchQldtSchedule } from '../server/qldt.js'

const password = process.env.QLDT_PASSWORD
if (!password) {
  process.stderr.write('QLDT_PASSWORD is not available to this process.\n')
  process.exit(2)
}

try {
  const events = await fetchQldtSchedule('AT210153', password, { timeoutMs: 20_000, maxBodyBytes: 8 * 1024 * 1024 })
  process.stdout.write(JSON.stringify({ ok: true, eventCount: events.length, firstDate: events[0]?.date || null }) + '\n')
} catch (error) {
  process.stderr.write(JSON.stringify({ ok: false, name: error?.name, code: error?.code, status: error?.status, message: error?.message }) + '\n')
  process.exit(1)
}
