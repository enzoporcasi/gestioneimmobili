import assert from 'node:assert/strict'
import { notificationMessage, runAutomationCycle, createNotificationSender } from '../../scripts/automation/worker.mjs'

const job = {
  delivery_id: 'test-delivery', lease_token: 'test-lease', recipient_email: 'test@example.test',
  property_name: 'Immobile Test', contract_code: 'CONTRACT-TEST', due_date: '2026-11-04',
  residual: 250.5, stage: 'OVERDUE',
}
const message = notificationMessage(job, 'http://127.0.0.1:5173/', 'notifiche@example.test')
assert.ok(message.subject.includes('Canone scaduto'))
assert.ok(message.text.includes('250,50'))
assert.equal(message.to[0].address, job.recipient_email)
assert.equal(message.messageId, notificationMessage(job, 'http://127.0.0.1:5173/', 'notifiche@example.test').messageId)
assert.throws(() => notificationMessage({ ...job, residual: 0 }, '', ''), /INVALID_NOTIFICATION_PAYLOAD/)
assert.throws(() => createNotificationSender({ SMTP_HOST: 'smtp.example.com', SMTP_FROM: 'test@example.com' }), /SMTP_CREDENTIALS_REQUIRED/)

for (const fail of [false, true]) {
  const completions = []
  let claimed = false
  const api = {
    run: async () => ({ busy: false }),
    claim: async () => { if (claimed) return null; claimed = true; return job },
    complete: async (...args) => { completions.push(args) },
  }
  const result = await runAutomationCycle(api, async () => {
    if (fail) throw new Error('SMTP unavailable')
    return 'message-id'
  }, () => {})
  assert.equal(completions.length, 1)
  assert.equal(completions[0][1], !fail)
  assert.equal(result.sent, fail ? 0 : 1)
  assert.equal(result.failed, fail ? 1 : 0)
}

let sends = 0
const ackFailure = {
  run: async () => ({}), claim: async () => job,
  complete: async () => { throw new Error('database acknowledgement failed') },
}
await assert.rejects(runAutomationCycle(ackFailure, async () => { sends += 1; return 'sent-id' }, () => {}), /acknowledgement failed/)
assert.equal(sends, 1)
console.log('NOTIFICATION WORKER MESSAGE, RETRY AND ACKNOWLEDGEMENT TESTS PASSED')