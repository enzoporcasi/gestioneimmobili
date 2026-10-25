# Manifest

## Migrations
1. Extensions/common functions
2. Profiles/privacy/access
3. Properties/contracts
4. Economics
5. Documents/deadlines/audit
6. Document bridges
7. Security helpers
8. Views/billing generator
9. Core payment RPC
10. RLS/grants
11. Storage bucket/policy

## Test status
- Executable SQL smoke tests: schema, due-date, basic constraints.
- Integration templates: RLS isolation, billing generation, Storage API.

## Scope note
This v1.0 is a solid starter package, not a production certification. Before deployment, add remaining RPCs from the RPC/RLS specification, full RLS policies for every table, concurrency tests, and environment-specific Auth/Storage integration fixtures.
