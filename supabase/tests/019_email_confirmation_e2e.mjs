import assert from 'node:assert/strict'
import { randomBytes, randomUUID } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'

const url = process.env.SUPABASE_URL
const publicKey = process.env.SUPABASE_ANON_KEY
const secretKey = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !publicKey || !secretKey) throw new Error('ENV_MISSING')
const baseUrl = new URL(url)
if (!['localhost', '127.0.0.1'].includes(baseUrl.hostname)) throw new Error('LOCAL_SUPABASE_REQUIRED')

const mailboxUrl = process.env.SUPABASE_MAILPIT_URL ?? 'http://127.0.0.1:54324'
const redirectTo = 'http://127.0.0.1:5173'
const email = `confirmation-${randomUUID()}@test.local`
const password = randomBytes(24).toString('hex')
const clientOptions = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } }
const client = createClient(url, publicKey, clientOptions)
const admin = createClient(url, secretKey, clientOptions)
let userId
let messageIds = []

async function mailboxMessages() {
  const search = new URL('/api/v1/search', mailboxUrl)
  search.searchParams.set('query', `to:${email}`)
  const response = await fetch(search)
  assert.equal(response.status, 200, 'local mailbox search must succeed')
  const result = await response.json()
  messageIds = result.messages.map((message) => message.ID)
  assert.ok(messageIds.length > 0, 'signup confirmation email must be delivered')
  return result.messages
}

try {
  const signup = await client.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: redirectTo,
      data: { first_name: 'Conferma', last_name: 'Email Test', display_name: 'Conferma Email Test' },
    },
  })
  assert.equal(signup.error, null, 'signup must succeed')
  userId = signup.data.user?.id
  assert.ok(userId, 'signup must create a user')
  assert.equal(signup.data.session, null, 'signup must not grant a session before email confirmation')
  assert.ok(!signup.data.user.email_confirmed_at, 'email must initially be unconfirmed')
  console.log('PASS: signup creates an unconfirmed user without a session')

  const denied = await client.auth.signInWithPassword({ email, password })
  assert.equal(denied.error?.code, 'email_not_confirmed', 'login must be denied before confirmation')
  assert.equal(denied.data.session, null)
  await mailboxMessages()

  const resend = await client.auth.resend({ type: 'signup', email, options: { emailRedirectTo: redirectTo } })
  if (resend.error) assert.equal(resend.error.status, 429, 'resend may be rate limited but must not fail otherwise')
  const messages = await mailboxMessages()
  const messageResponse = await fetch(new URL(`/api/v1/message/${messages[0].ID}`, mailboxUrl))
  assert.equal(messageResponse.status, 200)
  const message = await messageResponse.json()
  assert.equal(message.Subject, 'Conferma il tuo account GestioneImmobili')
  const links = Array.from(message.HTML.matchAll(/href="([^"]+)"/g), (match) =>
    new URL(match[1].replaceAll('&amp;', '&')),
  )
  const confirmationLink = links.find((link) =>
    link.origin === baseUrl.origin && link.pathname === '/auth/v1/verify',
  )
  assert.ok(confirmationLink, 'email must contain a Supabase verification link')
  assert.equal(confirmationLink.searchParams.get('redirect_to'), redirectTo)
  console.log('PASS: confirmation email delivered locally and resend endpoint available')

  const confirmation = await fetch(confirmationLink, { redirect: 'manual' })
  assert.ok([302, 303].includes(confirmation.status), 'verification must redirect to the frontend')
  const location = new URL(confirmation.headers.get('location'))
  assert.equal(location.origin, redirectTo)
  assert.ok(!new URLSearchParams(location.hash.slice(1)).has('error'), 'verification must succeed')
  const activated = await admin.auth.admin.getUserById(userId)
  assert.equal(activated.error, null)
  assert.ok(activated.data.user.email_confirmed_at, 'verification must activate the email')

  const login = await client.auth.signInWithPassword({ email, password })
  assert.equal(login.error, null, 'login must succeed after email confirmation')
  assert.ok(login.data.session)
  const profile = await client.from('profiles').select('first_name, last_name').eq('id', userId).single()
  assert.equal(profile.error, null, 'new user must have an accessible application profile')
  assert.equal(profile.data.first_name, 'Conferma')

  const replay = await fetch(confirmationLink, { redirect: 'manual' })
  const replayLocation = new URL(replay.headers.get('location'))
  assert.ok(new URLSearchParams(replayLocation.hash.slice(1)).has('error'), 'confirmation link must be single-use')
  console.log('EMAIL CONFIRMATION, LOGIN, PROFILE AND SINGLE-USE LINK TEST PASSED')
} finally {
  if (userId) {
    const cleanup = await admin.auth.admin.deleteUser(userId)
    assert.equal(cleanup.error, null, 'temporary signup user must be deleted')
  }
  if (messageIds.length) {
    const cleanup = await fetch(new URL('/api/v1/messages', mailboxUrl), {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ IDs: messageIds }),
    })
    assert.ok(cleanup.ok, 'temporary confirmation emails must be deleted')
  }
}