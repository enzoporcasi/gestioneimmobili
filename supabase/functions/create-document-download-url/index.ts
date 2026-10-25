import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8' },
  })
}

function env(name: string, fallback?: string): string {
  const value = Deno.env.get(name) ?? (fallback ? Deno.env.get(fallback) : undefined)
  if (!value) throw new Error(`SERVER_CONFIGURATION_ERROR:${name}`)
  return value
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return jsonResponse({ error: 'METHOD_NOT_ALLOWED' }, 405)

  try {
    const authorization = req.headers.get('Authorization')
    if (!authorization?.startsWith('Bearer ')) {
      return jsonResponse({ error: 'AUTHENTICATION_REQUIRED' }, 401)
    }

    let payload: { document_version_id?: string }
    try {
      payload = await req.json()
    } catch {
      return jsonResponse({ error: 'INVALID_JSON_BODY' }, 400)
    }

    const documentVersionId = payload.document_version_id
    if (!documentVersionId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(documentVersionId)) {
      return jsonResponse({ error: 'INVALID_DOCUMENT_VERSION_ID' }, 400)
    }

    const supabaseUrl = env('SUPABASE_URL')
    const publishableKey = env('SUPABASE_ANON_KEY', 'SUPABASE_PUBLISHABLE_KEY')
    const secretKey = env('SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_SECRET_KEY')

    // Client nel contesto JWT del chiamante. La RPC applica auth.uid() e il perimetro.
    const userClient = createClient(supabaseUrl, publishableKey, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false, autoRefreshToken: false },
    })

    // Validazione esplicita della sessione utente.
    const token = authorization.slice('Bearer '.length)
    const { data: userData, error: userError } = await userClient.auth.getUser(token)
    if (userError || !userData.user) {
      return jsonResponse({ error: 'INVALID_OR_EXPIRED_TOKEN' }, 401)
    }

    // Questa RPC autorizza l'utente, controlla RLS/perimetro e verifica AVAILABLE/CLEAN.
    const { data: authorizationData, error: authorizationError } = await userClient.rpc(
      'authorize_document_download',
      { p_document_version_id: documentVersionId },
    )

    if (authorizationError) {
      const message = authorizationError.message ?? ''
      if (message.includes('ACCESS_DENIED')) return jsonResponse({ error: 'ACCESS_DENIED' }, 403)
      if (message.includes('DOCUMENT_NOT_AVAILABLE')) return jsonResponse({ error: 'DOCUMENT_NOT_AVAILABLE' }, 409)
      if (message.includes('DOCUMENT_VERSION_NOT_FOUND')) return jsonResponse({ error: 'DOCUMENT_VERSION_NOT_FOUND' }, 404)
      console.error('authorize_document_download failed', authorizationError)
      return jsonResponse({ error: 'DOCUMENT_AUTHORIZATION_FAILED' }, 500)
    }

    const bucket = authorizationData?.bucket
    const storagePath = authorizationData?.storage_path
    const expiresIn = Number(authorizationData?.expires_in_seconds ?? 300)

    if (!bucket || !storagePath || !Number.isInteger(expiresIn) || expiresIn < 1 || expiresIn > 300) {
      console.error('Invalid authorization payload', authorizationData)
      return jsonResponse({ error: 'INVALID_AUTHORIZATION_RESPONSE' }, 500)
    }

    // Client privilegiato usato soltanto dopo che la RPC utente ha autorizzato il download.
    const adminClient = createClient(supabaseUrl, secretKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })

   const { data: signedData, error: signedError } = await adminClient.storage
  .from(bucket)
  .createSignedUrl(storagePath, expiresIn, { download: true })

if (signedError || !signedData?.signedUrl) {
  console.error('createSignedUrl failed', signedError)

  return jsonResponse(
    { error: 'SIGNED_URL_CREATION_FAILED' },
    500,
  )
}

const publicSupabaseUrl =
  Deno.env.get('APP_PUBLIC_SUPABASE_URL')

if (!publicSupabaseUrl) {
  console.error('APP_PUBLIC_SUPABASE_URL is missing')

  return jsonResponse(
    { error: 'PUBLIC_URL_NOT_CONFIGURED' },
    500,
  )
}

const internalSignedUrl = new URL(
  signedData.signedUrl,
)

const externalBaseUrl = new URL(
  publicSupabaseUrl,
)

/*
 * Mantiene percorso, token e query string generati da Storage,
 * ma sostituisce l'host Docker interno con quello raggiungibile
 * dal client Windows.
 */
internalSignedUrl.protocol =
  externalBaseUrl.protocol

internalSignedUrl.host =
  externalBaseUrl.host

const signedUrl =
  internalSignedUrl.toString()

console.log(
  'Signed URL host conversion',
  {
    originalHost: new URL(
      signedData.signedUrl,
    ).host,
    publicHost: externalBaseUrl.host,
    returnedHost: new URL(
      signedUrl,
    ).host,
  },
)

return jsonResponse({
  document_version_id: documentVersionId,
  signed_url: signedUrl,
  expires_in_seconds: expiresIn,
  expires_at: new Date(
    Date.now() + expiresIn * 1000,
  ).toISOString(),
})
  } catch (error) {
    console.error('Unhandled Edge Function error', error)
    return jsonResponse({ error: 'INTERNAL_SERVER_ERROR' }, 500)
  }
})
