create or replace function public.modrek_extract_heading_number(p_title text)
returns integer
language sql
immutable
set search_path = public
as $fn$
  select coalesce(
    nullif(regexp_replace(coalesce(substring(p_title from '\(\s*([0-9]{1,2})\s*\)'), ''), '\D', '', 'g'), '')::int,
    nullif(regexp_replace(coalesce(substring(p_title from '(?:الدرس|درس|الحديث|الموضوع|النص)\s*(?:رقم\s*)?([0-9]{1,2})'), ''), '\D', '', 'g'), '')::int,
    nullif(regexp_replace(coalesce(substring(p_title from '^[^0-9]{0,30}?([0-9]{1,2})(?:\s|$|:|-)'), ''), '\D', '', 'g'), '')::int,
    case
      when p_title ~ '(الدرس|درس|الحديث)\s*(ال)?(أ|ا)ول'  then 1
      when p_title ~ '(الدرس|درس|الحديث)\s*(ال)?ثان(ي|ى)' then 2
      when p_title ~ '(الدرس|درس|الحديث)\s*(ال)?ثالث'      then 3
      when p_title ~ '(الدرس|درس|الحديث)\s*(ال)?رابع'      then 4
      when p_title ~ '(الدرس|درس|الحديث)\s*(ال)?خامس'      then 5
      when p_title ~ '(الدرس|درس|الحديث)\s*(ال)?سادس'      then 6
      when p_title ~ '(الدرس|درس|الحديث)\s*(ال)?سابع'      then 7
      when p_title ~ '(الدرس|درس|الحديث)\s*(ال)?ثامن'      then 8
      when p_title ~ '(الدرس|درس|الحديث)\s*(ال)?تاسع'      then 9
      when p_title ~ '(الدرس|درس|الحديث)\s*(ال)?عاشر'      then 10
      else null
    end
  );
$fn$;

create or replace function public.modrek_repair_lesson_index(p_source_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_version uuid;
  v_lessons int := 0;
  v_numbered int := 0;
  v_linked int := 0;
  v_chunks int := 0;
  v_max_page int;
  v_has_explicit boolean;
begin
  for v_version in
    select id from public.knowledge_source_versions where source_id = p_source_id
  loop
    insert into public.knowledge_lesson_index
      (source_id, version_id, unit_id, kind, title, normalized_title, page_start, page_end, ordinal, number_source)
    select p_source_id, v_version, u.id,
           case when u.kind::text in ('lesson','unit','chapter') then u.kind::text else 'section' end,
           coalesce(u.title, 'بدون عنوان'), lower(coalesce(u.title, '')),
           u.page_from, coalesce(u.page_to, u.page_from), u.ordinal, 'unknown'
    from public.knowledge_units u
    where u.version_id = v_version
      and u.kind::text <> 'page'
      and coalesce(u.title, '') <> ''
      and not exists (select 1 from public.knowledge_lesson_index k where k.unit_id = u.id);

    update public.knowledge_lesson_index k
       set kind = 'lesson'
      from public.knowledge_units u
     where k.unit_id = u.id
       and k.version_id = v_version
       and u.kind::text = 'lesson'
       and k.kind <> 'lesson';

    update public.knowledge_lesson_index k
       set kind = 'lesson'
     where k.version_id = v_version
       and k.kind <> 'lesson'
       and k.title ~ '(^|\s)(الدرس|درس)(\s|$)';

    with cand as (
      select k.id, k.title,
             trim(substring(k.title from '^\s*([^0-9()]{2,24}?)\s*\(?\s*[0-9]{1,2}\s*\)?(?:\s|$)')) as lead_word,
             public.modrek_extract_heading_number(k.title) as num
        from public.knowledge_lesson_index k
       where k.version_id = v_version
         and k.title !~ '^\s*مقطع نصي'
         and k.title ~ '^\s*[^0-9()]{2,24}\s*\(?\s*[0-9]{1,2}\s*\)?(?:\s|$)'
    ),
    series as (
      select lead_word
        from cand
       where num is not null and coalesce(lead_word, '') <> ''
       group by lead_word
      having count(distinct num) >= 2
       order by count(distinct num) desc
       limit 1
    )
    update public.knowledge_lesson_index k
       set kind = 'lesson', lesson_number = c.num, number_source = 'explicit'
      from cand c, series s
     where k.id = c.id and c.lead_word = s.lead_word and c.num is not null;

    update public.knowledge_lesson_index k
       set lesson_number = public.modrek_extract_heading_number(k.title),
           number_source = 'explicit'
     where k.version_id = v_version
       and k.kind = 'lesson'
       and public.modrek_extract_heading_number(k.title) is not null;

    select exists (
      select 1 from public.knowledge_lesson_index
       where version_id = v_version and kind = 'lesson' and lesson_number is not null
    ) into v_has_explicit;

    if not v_has_explicit then
      with ordered as (
        select id, row_number() over (order by coalesce(page_start, 999999), ordinal) rn
          from public.knowledge_lesson_index
         where version_id = v_version and kind = 'lesson'
      )
      update public.knowledge_lesson_index k
         set lesson_number = o.rn, number_source = 'sequence'
        from ordered o
       where k.id = o.id;
    end if;

    select max(coalesce(page_to, page_from)) into v_max_page
      from public.knowledge_units where version_id = v_version;

    with lessons as (
      select k.id,
             coalesce(k.page_start, u.page_from) as ps,
             lead(coalesce(k.page_start, u.page_from)) over (
               order by coalesce(k.page_start, u.page_from), k.ordinal
             ) as next_ps
        from public.knowledge_lesson_index k
        join public.knowledge_units u on u.id = k.unit_id
       where k.version_id = v_version and k.kind = 'lesson'
    )
    update public.knowledge_lesson_index k
       set page_start = l.ps,
           page_end = greatest(coalesce(l.ps, 1), coalesce(l.next_ps - 1, v_max_page, l.ps))
      from lessons l
     where k.id = l.id and l.ps is not null;

    with lesson_rows as (
      select unit_id, lesson_number, title, page_start, page_end, number_source, ordinal
        from public.knowledge_lesson_index
       where version_id = v_version and kind = 'lesson' and page_start is not null
    ),
    chunk_pages as (
      select c.id, coalesce((c.metadata->>'page_from')::int, u.page_from, u.page_to) as page
        from public.content_chunks c
        join public.knowledge_units u on u.id = c.unit_id
       where c.version_id = v_version
    ),
    matched as (
      select cp.id as chunk_id, l.unit_id, l.lesson_number, l.title, l.page_start, l.page_end,
             l.number_source, l.ordinal
        from chunk_pages cp
        cross join lateral (
          select * from lesson_rows lr
           where cp.page between lr.page_start and coalesce(lr.page_end, lr.page_start)
           order by (coalesce(lr.page_end, lr.page_start) - lr.page_start) asc, lr.ordinal asc
           limit 1
        ) l
       where cp.page is not null
    )
    update public.content_chunks c
       set metadata = c.metadata || jsonb_build_object(
             'lesson_unit_id', m.unit_id,
             'lesson_kind', 'lesson',
             'lesson_number', m.lesson_number,
             'lesson_title', m.title,
             'lesson_ordinal', m.ordinal,
             'lesson_number_source', m.number_source,
             'lesson_page_start', m.page_start,
             'lesson_page_end', m.page_end
           )
      from matched m
     where c.id = m.chunk_id;
  end loop;

  select count(*) into v_lessons from public.knowledge_lesson_index
    where source_id = p_source_id and kind = 'lesson';
  select count(*) into v_numbered from public.knowledge_lesson_index
    where source_id = p_source_id and kind = 'lesson' and lesson_number is not null;
  select count(*) into v_chunks from public.content_chunks where source_id = p_source_id;
  select count(*) into v_linked from public.content_chunks
    where source_id = p_source_id and metadata->>'lesson_unit_id' is not null;

  return jsonb_build_object('source_id', p_source_id, 'lessons', v_lessons,
    'numbered_lessons', v_numbered, 'chunks', v_chunks, 'linked_chunks', v_linked);
end;
$fn$;

revoke all on function public.modrek_repair_lesson_index(uuid) from public;
grant execute on function public.modrek_repair_lesson_index(uuid) to service_role;
grant execute on function public.modrek_extract_heading_number(text) to service_role, authenticated;