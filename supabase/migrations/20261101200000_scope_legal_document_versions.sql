drop policy legal_document_versions_current_select
on public.legal_document_versions;

create policy legal_document_versions_current_select
on public.legal_document_versions
for select to authenticated
using (
    effective_from <= current_date
    and published_at <= now()
    and (retired_at is null or retired_at > now())
    and exists (
        select 1
        from public.legal_documents document
        where document.id = legal_document_id
          and document.status = 'ACTIVE'
    )
);
