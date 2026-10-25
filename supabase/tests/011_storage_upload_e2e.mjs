/**
 * GestioneImmobili - Test E2E reale Supabase Storage
 *
 * Verifica:
 *  1. fixture Property/Owner/Accesso per Utente A;
 *  2. login con password dell'Utente A;
 *  3. RPC reserve_document_upload;
 *  4. upload reale di un PDF minimo nel bucket privato;
 *  5. RPC finalize_document_upload;
 *  6. scansione CLEAN simulata dal backend/service role;
 *  7. RPC authorize_document_download;
 *  8. creazione e uso di signed URL;
 *  9. Utente B non vede né autorizza il Documento A;
 * 10. cleanup finale di DB e Storage.
 *
 * Prerequisiti:
 *   npm install @supabase/supabase-js
 *   Supabase locale avviato e migration applicate.
 *   seed.sql con:
 *     utente.a@test.local / TestUserA-2026!
 *     utente.b@test.local / TestUserB-2026!
 *
 * Variabili PowerShell prima dell'esecuzione:
 *   $env:SUPABASE_URL = "http://127.0.0.1:54321"
 *   $env:SUPABASE_ANON_KEY = "<anon-key da npx supabase status>"
 *   $env:SUPABASE_SERVICE_ROLE_KEY = "<service-role-key locale>"
 *
 * Esecuzione:
 *   node .\supabase\tests\011_storage_upload_e2e.mjs
 */

import { createClient } from '@supabase/supabase-js';
import crypto from 'node:crypto';

const SUPABASE_URL = process.env.SUPABASE_URL;
const ANON_KEY = process.env.SUPABASE_ANON_KEY;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !ANON_KEY || !SERVICE_ROLE_KEY) {
  throw new Error(
    'ENV_MISSING: impostare SUPABASE_URL, SUPABASE_ANON_KEY e SUPABASE_SERVICE_ROLE_KEY.'
  );
}

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function userClient() {
  return createClient(SUPABASE_URL, ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

const userA = userClient();
const userB = userClient();

const FIXTURE = {
  ownerId: 'aa100000-0000-0000-0000-000000000001',
  propertyId: 'aa200000-0000-0000-0000-000000000002',
  ownershipId: 'aa300000-0000-0000-0000-000000000003',
  internalCode: 'IMM-STORAGE-E2E-A',
};

let documentId = null;
let versionId = null;
let storagePath = null;
const bucket = 'property-documents';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertNoError(error, context) {
  if (error) {
    throw new Error(`${context}: ${error.message ?? JSON.stringify(error)}`);
  }
}

// PDF minimo sintatticamente sufficiente per il test di trasporto Storage.
const pdf = Buffer.from(
  '%PDF-1.4\n' +
    '1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n' +
    '2 0 obj<</Type/Pages/Count 0/Kids[]>>endobj\n' +
    'trailer<</Root 1 0 R>>\n%%EOF\n',
  'utf8'
);
const checksum = crypto.createHash('sha256').update(pdf).digest('hex');

async function getSeedUser(email) {
  const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  assertNoError(error, `listUsers ${email}`);
  const found = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
  assert(found, `AUTH_USER_NOT_FOUND: ${email}`);
  return found;
}

async function cleanup() {
  // Storage prima del DB.
  if (storagePath) {
    const { error } = await admin.storage.from(bucket).remove([storagePath]);
    if (error) console.warn(`Cleanup Storage: ${error.message}`);
  }

  if (documentId) {
    const bridges = ['property_documents'];
    for (const table of bridges) {
      const { error } = await admin.from(table).delete().eq('document_id', documentId);
      if (error) console.warn(`Cleanup ${table}: ${error.message}`);
    }
    const { error: versionsError } = await admin
      .from('document_versions')
      .delete()
      .eq('document_id', documentId);
    if (versionsError) console.warn(`Cleanup document_versions: ${versionsError.message}`);
    const { error: documentError } = await admin.from('documents').delete().eq('id', documentId);
    if (documentError) console.warn(`Cleanup documents: ${documentError.message}`);
  }

  await admin.from('property_ownerships').delete().eq('id', FIXTURE.ownershipId);
  await admin.from('properties').delete().eq('id', FIXTURE.propertyId);
  await admin.from('user_owner_accesses').delete().eq('owner_id', FIXTURE.ownerId);
  await admin.from('owners').delete().eq('id', FIXTURE.ownerId);
}

async function main() {
  console.log('1/10 Recupero utenti seed...');
  const authA = await getSeedUser('utente.a@test.local');
  await getSeedUser('utente.b@test.local');

  console.log('2/10 Preparazione fixture patrimoniale...');
  await cleanup();

  let result = await admin.from('owners').insert({
    id: FIXTURE.ownerId,
    owner_type: 'NATURAL_PERSON',
    first_name: 'Owner',
    last_name: 'Storage E2E A',
    tax_code: 'STORAGEE2EA',
    status: 'ACTIVE',
  });
  assertNoError(result.error, 'insert owner');

  result = await admin.from('user_owner_accesses').insert({
    user_id: authA.id,
    owner_id: FIXTURE.ownerId,
    role: 'MANAGER',
    valid_from: new Date().toISOString().slice(0, 10),
    status: 'ACTIVE',
  });
  assertNoError(result.error, 'insert user_owner_access');

  result = await admin.from('properties').insert({
    id: FIXTURE.propertyId,
    internal_code: FIXTURE.internalCode,
    name: 'Immobile Storage E2E A',
    property_type: 'APARTMENT',
    status: 'ACTIVE',
    municipality: 'Roma',
  });
  assertNoError(result.error, 'insert property');

  result = await admin.from('property_ownerships').insert({
    id: FIXTURE.ownershipId,
    property_id: FIXTURE.propertyId,
    owner_id: FIXTURE.ownerId,
    ownership_percentage: 100,
    valid_from: new Date().toISOString().slice(0, 10),
  });
  assertNoError(result.error, 'insert property_ownership');

  console.log('3/10 Login Utente A...');
  let authResult = await userA.auth.signInWithPassword({
    email: 'utente.a@test.local',
    password: 'TestUserA-2026!',
  });
  assertNoError(authResult.error, 'login user A');

  console.log('4/10 Prenotazione upload tramite RPC...');
  const reserve = await userA.rpc('reserve_document_upload', {
    p_entity_type: 'PROPERTY',
    p_entity_id: FIXTURE.propertyId,
    p_title: 'Documento Storage E2E A',
    p_category: 'CONTRACT',
    p_original_file_name: 'storage-e2e-a.pdf',
    p_declared_mime_type: 'application/pdf',
    p_expected_size_bytes: pdf.length,
    p_sensitivity: 'STANDARD',
    p_link_role: 'TEST',
  });
  assertNoError(reserve.error, 'reserve_document_upload');
  documentId = reserve.data.document_id;
  versionId = reserve.data.document_version_id;
  storagePath = reserve.data.storage_path;
  assert(documentId && versionId && storagePath, 'RESERVATION_RESPONSE_INVALID');

  console.log('5/10 Upload reale nel bucket privato...');
  const upload = await userA.storage.from(bucket).upload(storagePath, pdf, {
    contentType: 'application/pdf',
    upsert: false,
  });
  assertNoError(upload.error, 'storage upload user A');

  console.log('6/10 Finalizzazione upload...');
  const finalize = await userA.rpc('finalize_document_upload', {
    p_document_version_id: versionId,
    p_actual_mime_type: 'application/pdf',
    p_actual_size_bytes: pdf.length,
    p_checksum: checksum,
  });
  assertNoError(finalize.error, 'finalize_document_upload');
  assert(finalize.data.upload_status === 'PENDING_SCAN', 'FINALIZE_STATUS_NOT_PENDING_SCAN');

  console.log('7/10 Scansione CLEAN simulata dal backend...');
  const scan = await admin.rpc('complete_document_scan', {
    p_document_version_id: versionId,
    p_scan_result: 'CLEAN',
  });
  assertNoError(scan.error, 'complete_document_scan');
  assert(scan.data.upload_status === 'AVAILABLE', 'SCAN_STATUS_NOT_AVAILABLE');

  console.log('8/10 Autorizzazione e signed URL per Utente A...');
  const authorizationA = await userA.rpc('authorize_document_download', {
    p_document_version_id: versionId,
  });
  assertNoError(authorizationA.error, 'authorize_document_download user A');
  assert(authorizationA.data.authorized === true, 'USER_A_NOT_AUTHORIZED');

  const signed = await admin.storage.from(bucket).createSignedUrl(storagePath, 300);
  assertNoError(signed.error, 'createSignedUrl');
  const response = await fetch(signed.data.signedUrl);
  assert(response.ok, `SIGNED_URL_DOWNLOAD_FAILED: HTTP ${response.status}`);
  const downloaded = Buffer.from(await response.arrayBuffer());
  assert(downloaded.equals(pdf), 'DOWNLOADED_FILE_DIFFERS');

  console.log('9/10 Login Utente B e verifica isolamento...');
  authResult = await userB.auth.signInWithPassword({
    email: 'utente.b@test.local',
    password: 'TestUserB-2026!',
  });
  assertNoError(authResult.error, 'login user B');

  const visibleB = await userB.from('documents').select('id,title').eq('id', documentId);
  assertNoError(visibleB.error, 'select documents user B');
  assert(visibleB.data.length === 0, 'USER_B_CAN_READ_DOCUMENT_A');

  const authorizationB = await userB.rpc('authorize_document_download', {
    p_document_version_id: versionId,
  });
  assert(authorizationB.error, 'USER_B_DOWNLOAD_AUTHORIZATION_UNEXPECTEDLY_SUCCEEDED');
  assert(
    authorizationB.error.message.includes('ACCESS_DENIED'),
    `USER_B_WRONG_ERROR: ${authorizationB.error.message}`
  );

  const crossReserve = await userB.rpc('reserve_document_upload', {
    p_entity_type: 'PROPERTY',
    p_entity_id: FIXTURE.propertyId,
    p_title: 'Intrusione B',
    p_category: 'OTHER',
    p_original_file_name: 'intrusione.pdf',
    p_declared_mime_type: 'application/pdf',
    p_expected_size_bytes: pdf.length,
    p_sensitivity: 'STANDARD',
    p_link_role: 'TEST',
  });
  assert(crossReserve.error, 'USER_B_CROSS_SCOPE_RESERVE_UNEXPECTEDLY_SUCCEEDED');
  assert(
    crossReserve.error.message.includes('ACCESS_DENIED'),
    `USER_B_CROSS_SCOPE_WRONG_ERROR: ${crossReserve.error.message}`
  );

  console.log('10/10 Verifica stato DB e cleanup...');
  const state = await admin
    .from('document_versions')
    .select('upload_status,malware_scan_status,checksum')
    .eq('id', versionId)
    .single();
  assertNoError(state.error, 'read document version state');
  assert(state.data.upload_status === 'AVAILABLE', 'DB_STATUS_NOT_AVAILABLE');
  assert(state.data.malware_scan_status === 'CLEAN', 'DB_SCAN_NOT_CLEAN');
  assert(state.data.checksum === checksum, 'DB_CHECKSUM_MISMATCH');

  console.log('STORAGE UPLOAD E2E TEST PASSED');
}

try {
  await main();
} finally {
  await userA.auth.signOut().catch(() => {});
  await userB.auth.signOut().catch(() => {});
  await cleanup();
}
