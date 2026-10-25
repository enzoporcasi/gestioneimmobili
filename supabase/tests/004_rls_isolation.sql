-- Template: create two auth users via test harness/admin setup, then SET LOCAL request.jwt.claims.
-- Assert User A can SELECT Property A and gets zero rows for Property B.
-- Assert Viewer cannot execute write RPCs and revoked access is immediately ineffective.
select 'RLS isolation requires fixture UUIDs supplied by the test harness' as instruction;
