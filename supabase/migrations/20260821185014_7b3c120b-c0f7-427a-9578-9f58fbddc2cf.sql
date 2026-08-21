create or replace function public.modrek_library_diagnostics()
returns table (
  source_id uuid,
  title text,
  status text,
  subject text,
  grade text,
  latest_version_id uuid,
  pipeline_stage text,
  versions integer,
  pages integer,
  units integer,
  chunks integer,
  embedded_chunks integer,
  lessons integer,
  numbered_lessons integer,
  linked_chunks integer,
  searchable boolean,
  issues text[],
  updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $fn$
begin
  if not public.has_role(auth.uid(), 'admin') then
    raise exception 'forbidden: admins only';
  end if;

  return query
  with latest as (
    select v.source_id, v.id as version_id, v.pipeline_stage::text as stage,
           row_number() over (partition by v.source_id order by v.created_at desc) rn
      from public.knowledge_source_versions v
  ),
  vcount as (
    select source_id, count(*)::int as versions from public.knowledge_source_versions group by source_id
  ),
  agg as (
    select s.id as source_id,
           s.title,
           s.status::text as status,
           subj.name_ar as subject,
           g.name_ar as grade,
           l.version_id,
           l.stage,
           coalesce(vc.versions, 0) as versions,
           coalesce((select count(*) from public.knowledge_units u where u.version_id = l.version_id and u.kind::text = 'page'), 0)::int as pages,
           coalesce((select count(*) from public.knowledge_units u where u.version_id = l.version_id and u.kind::text <> 'page'), 0)::int as units,
           coalesce((select count(*) from public.content_chunks c where c.version_id = l.version_id), 0)::int as chunks,
           coalesce((select count(*) from public.content_chunks c where c.version_id = l.version_id and c.embedding is not null), 0)::int as embedded_chunks,
           coalesce((select count(*) from public.knowledge_lesson_index k where k.version_id = l.version_id and k.kind = 'lesson'), 0)::int as lessons,
           coalesce((select count(*) from public.knowledge_lesson_index k where k.version_id = l.version_id and k.kind = 'lesson' and k.lesson_number is not null), 0)::int as numbered_lessons,
           coalesce((select count(*) from public.content_chunks c where c.version_id = l.version_id and (c.metadata->>'lesson_unit_id') is not null), 0)::int as linked_chunks,
           s.updated_at
      from public.knowledge_sources s
      left join latest l on l.source_id = s.id and l.rn = 1
      left join vcount vc on vc.source_id = s.id
      left join public.library_subjects subj on subj.id = s.subject_id
      left join public.library_grades g on g.id = s.grade_id
  )
  select a.source_id, a.title, a.status, a.subject, a.grade, a.version_id, a.stage, a.versions,
         a.pages, a.units, a.chunks, a.embedded_chunks, a.lessons, a.numbered_lessons, a.linked_chunks,
         (a.chunks > 0 and a.embedded_chunks > 0) as searchable,
         (
           case when a.version_id is null then array['no_version'] else array[]::text[] end
           || case when a.pages = 0 then array['no_pages_extracted'] else array[]::text[] end
           || case when a.chunks = 0 then array['no_content_chunks'] else array[]::text[] end
           || case when a.chunks > 0 and a.embedded_chunks = 0 then array['no_embeddings'] else array[]::text[] end
           || case when a.lessons = 0 then array['no_lesson_index'] else array[]::text[] end
           || case when a.lessons > 0 and a.numbered_lessons = 0 then array['lessons_without_numbers'] else array[]::text[] end
           || case when a.chunks > 0 and a.linked_chunks = 0 then array['chunks_not_linked_to_lessons'] else array[]::text[] end
           || case when a.status = 'ready' and (a.chunks = 0 or a.embedded_chunks = 0) then array['ready_but_not_searchable'] else array[]::text[] end
         ) as issues,
         a.updated_at
    from agg a
   order by a.updated_at desc nulls last;
end;
$fn$;

revoke execute on function public.modrek_library_diagnostics() from anon;
grant execute on function public.modrek_library_diagnostics() to authenticated;
grant execute on function public.modrek_library_diagnostics() to service_role;

create or replace function public.modrek_admin_repair_source(p_source_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v jsonb;
begin
  if not public.has_role(auth.uid(), 'admin') then
    raise exception 'forbidden: admins only';
  end if;
  v := public.modrek_repair_lesson_index(p_source_id);
  return v;
end;
$fn$;

revoke execute on function public.modrek_admin_repair_source(uuid) from anon;
grant execute on function public.modrek_admin_repair_source(uuid) to authenticated;
grant execute on function public.modrek_admin_repair_source(uuid) to service_role;