import { createClient } from '@supabase/supabase-js'
import crypto from 'node:crypto'

const url = process.env.SUPABASE_URL
const publishable = process.env.SUPABASE_ANON_KEY
const secret = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !publishable || !secret) throw new Error('ENV_MISSING')

const admin = createClient(url, secret, { auth: { persistSession: false } })
const a = createClient(url, publishable, { auth: { persistSession: false } })
const b = createClient(url, publishable, { auth: { persistSession: false } })
const ids = {
  owner: 'ab100000-0000-0000-0000-000000000001',
  property: 'ab200000-0000-0000-0000-000000000002',
  ownership: 'ab300000-0000-0000-0000-000000000003',
}
let docId, versionId, path
const pdf = Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\n%%EOF\n')
const checksum = crypto.createHash('sha256').update(pdf).digest('hex')
const ok = (e, c) => { if (e) throw new Error(`${c}: ${e.message}`) }

async function cleanup() {
  if (path) await admin.storage.from('property-documents').remove([path])
  if (docId) {
    await admin.from('property_documents').delete().eq('document_id', docId)
    await admin.from('document_versions').delete().eq('document_id', docId)
    await admin.from('documents').delete().eq('id', docId)
  }
  await admin.from('property_ownerships').delete().eq('id', ids.ownership)
  await admin.from('properties').delete().eq('id', ids.property)
  await admin.from('user_owner_accesses').delete().eq('owner_id', ids.owner)
  await admin.from('owners').delete().eq('id', ids.owner)
}

try {
  await cleanup()
  const users = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 }); ok(users.error, 'users')
  const authA = users.data.users.find(x => x.email === 'utente.a@test.local')
  if (!authA) throw new Error('USER_A_MISSING')
  ok((await admin.from('owners').insert({ id: ids.owner, owner_type:'NATURAL_PERSON', first_name:'Owner', last_name:'Edge', tax_code:'EDGEOWNER', status:'ACTIVE' })).error, 'owner')
  ok((await admin.from('user_owner_accesses').insert({ user_id:authA.id, owner_id:ids.owner, role:'MANAGER', valid_from:new Date().toISOString().slice(0,10), status:'ACTIVE' })).error, 'access')
  ok((await admin.from('properties').insert({ id:ids.property, internal_code:'IMM-EDGE-TEST', name:'Immobile Edge Test', property_type:'APARTMENT', status:'ACTIVE', municipality:'Roma' })).error, 'property')
  ok((await admin.from('property_ownerships').insert({ id:ids.ownership, property_id:ids.property, owner_id:ids.owner, ownership_percentage:100, valid_from:new Date().toISOString().slice(0,10) })).error, 'ownership')

  ok((await a.auth.signInWithPassword({ email:'utente.a@test.local', password:'TestUserA-2026!' })).error, 'login A')
  const reserve = await a.rpc('reserve_document_upload', { p_entity_type:'PROPERTY', p_entity_id:ids.property, p_title:'Edge Download Test', p_category:'TEST', p_original_file_name:'edge.pdf', p_declared_mime_type:'application/pdf', p_expected_size_bytes:pdf.length, p_sensitivity:'STANDARD', p_link_role:'TEST' }); ok(reserve.error, 'reserve')
  docId=reserve.data.document_id; versionId=reserve.data.document_version_id; path=reserve.data.storage_path
  ok((await a.storage.from('property-documents').upload(path,pdf,{contentType:'application/pdf',upsert:false})).error,'upload')
  ok((await a.rpc('finalize_document_upload',{p_document_version_id:versionId,p_actual_mime_type:'application/pdf',p_actual_size_bytes:pdf.length,p_checksum:checksum})).error,'finalize')
  ok((await admin.rpc('complete_document_scan',{p_document_version_id:versionId,p_scan_result:'CLEAN'})).error,'scan')

  const invokeA = await a.functions.invoke('create-document-download-url', { body:{document_version_id:versionId} })
  ok(invokeA.error,'invoke A')
  if (!invokeA.data?.signed_url) throw new Error('SIGNED_URL_MISSING')
 console.log(
  'SIGNED URL RESTITUITA:',
  invokeA.data.signed_url,
)

    const download = await fetch(invokeA.data.signed_url)
  if (!download.ok) throw new Error(`DOWNLOAD_FAILED:${download.status}`)
  if (!Buffer.from(await download.arrayBuffer()).equals(pdf)) throw new Error('FILE_MISMATCH')

  ok((await b.auth.signInWithPassword({ email:'utente.b@test.local', password:'TestUserB-2026!' })).error,'login B')
  const invokeB = await b.functions.invoke('create-document-download-url', { body:{document_version_id:versionId} })
  if (!invokeB.error) throw new Error('USER_B_UNEXPECTEDLY_AUTHORIZED')

  console.log('EDGE FUNCTION DOCUMENT DOWNLOAD TEST PASSED')
} finally {
  await cleanup()
}
