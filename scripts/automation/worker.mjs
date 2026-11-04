import { pathToFileURL } from 'node:url'
import { createClient } from '@supabase/supabase-js'
import nodemailer from 'nodemailer'

export function notificationMessage(job, appUrl, from) {
  const stages = {
    UPCOMING: 'Canone in scadenza',
    DUE: 'Canone in scadenza oggi',
    OVERDUE: 'Canone scaduto',
  }
  if (!stages[job.stage] || !job.delivery_id || !job.recipient_email
    || !Number.isFinite(Number(job.residual)) || Number(job.residual) <= 0) {
    throw new Error('INVALID_NOTIFICATION_PAYLOAD')
  }
  const amount = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(Number(job.residual))
  return {
    from,
    to: [{ address: job.recipient_email }],
    subject: `${stages[job.stage]} - GestioneImmobili`,
    messageId: `<rent-${job.delivery_id}@notifications.gestioneimmobili.local>`,
    text: [
      stages[job.stage], '',
      `Immobile: ${job.property_name}`,
      `Contratto: ${job.contract_code}`,
      `Scadenza: ${job.due_date}`,
      `Residuo al momento dell'invio: ${amount}`, '',
      `Accedi al tuo account per verificare la situazione aggiornata: ${appUrl}`,
    ].join('\n'),
  }
}

export async function runAutomationCycle(api, send, log = console.log) {
  const generation = await api.run()
  if (generation?.busy) return { sent: 0, failed: 0 }
  if (generation?.generation_error) log(JSON.stringify({ event: 'billing_generation_failed' }))
  let sent = 0
  let failed = 0
  for (let index = 0; index < 20; index += 1) {
    const job = await api.claim()
    if (!job) break
    let messageId
    try {
      messageId = await send(job)
    } catch {
      await api.complete(job, false, null)
      failed += 1
      log(JSON.stringify({ event: 'notification_send_failed', delivery_id: job.delivery_id }))
      continue
    }
    await api.complete(job, true, messageId)
    sent += 1
    log(JSON.stringify({ event: 'notification_sent', delivery_id: job.delivery_id }))
  }
  return { sent, failed }
}

export function createAutomationApi(url, secret) {
  const endpoint = new URL(url)
  if (endpoint.protocol !== 'https:' && !['127.0.0.1', 'localhost', 'kong'].includes(endpoint.hostname)) {
    throw new Error('SUPABASE_HTTPS_REQUIRED')
  }
  const client = createClient(url, secret, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(20_000) }) },
  })
  async function rpc(name, args) {
    const { data, error } = await client.rpc(name, args)
    if (error) throw new Error('AUTOMATION_RPC_FAILED')
    return data
  }
  return {
    run: () => rpc('run_billing_automation', {}),
    claim: () => rpc('claim_rent_notification', {}),
    complete: (job, sent, providerRef) => rpc('complete_rent_notification', {
      p_delivery_id: job.delivery_id, p_lease_token: job.lease_token,
      p_sent: sent, p_provider_ref: providerRef,
    }),
  }
}

export function createNotificationSender(environment) {
  const host = environment.SMTP_HOST
  const port = Number(environment.SMTP_PORT ?? 587)
  const from = environment.SMTP_FROM
  const appUrl = new URL(environment.APP_URL ?? 'http://127.0.0.1:5173')
  if (!host || !from || !Number.isInteger(port) || port < 1 || port > 65535) throw new Error('SMTP_CONFIGURATION_REQUIRED')
  if (appUrl.protocol !== 'https:' && !['127.0.0.1', 'localhost'].includes(appUrl.hostname)) throw new Error('APP_HTTPS_REQUIRED')
  const local = ['inbucket', '127.0.0.1', 'localhost'].includes(host)
  if (!local && (!environment.SMTP_USER || !environment.SMTP_PASS)) throw new Error('SMTP_CREDENTIALS_REQUIRED')
  const transport = nodemailer.createTransport({
    host, port,
    secure: port === 465,
    requireTLS: !local,
    auth: local ? undefined : { user: environment.SMTP_USER, pass: environment.SMTP_PASS },
    connectionTimeout: 15_000, greetingTimeout: 15_000, socketTimeout: 30_000,
  })
  return async (job) => {
    const result = await transport.sendMail(notificationMessage(job, appUrl.toString(), from))
    if (result.rejected?.length || !result.accepted?.length) throw new Error('SMTP_RECIPIENT_REJECTED')
    return result.messageId
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) throw new Error('AUTOMATION_CONFIGURATION_REQUIRED')
  const api = createAutomationApi(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
  const send = createNotificationSender(process.env)
  let busy = false
  let stopping = false
  async function tick() {
    if (busy || stopping) return
    busy = true
    try { await runAutomationCycle(api, send) }
    catch { console.error('Automation cycle failed; queued jobs remain available for retry.') }
    finally { busy = false }
  }
  const timer = setInterval(tick, 60_000)
  function stop() { stopping = true; clearInterval(timer) }
  process.on('SIGINT', stop)
  process.on('SIGTERM', stop)
  await tick()
}