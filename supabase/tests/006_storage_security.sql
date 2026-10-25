-- Storage API-level test template: upload without reservation must fail; reserved upload succeeds;
-- overwrite and direct download must fail; signed URL flow must re-check access.
select 'Run through Supabase Storage API with authenticated test users' as instruction;
