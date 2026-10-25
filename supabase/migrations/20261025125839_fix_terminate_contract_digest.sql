-- Rende disponibili nella RPC le funzioni dell'estensione pgcrypto,
-- incluso extensions.digest(...).

alter function public.terminate_contract(
    uuid,
    date,
    text,
    uuid
)
set search_path = pg_catalog, public, security, extensions;