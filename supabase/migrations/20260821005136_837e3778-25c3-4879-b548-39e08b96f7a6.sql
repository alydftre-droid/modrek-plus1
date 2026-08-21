create or replace function public.modrek_rebuild_lessons_from_text(p_source_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_version uuid;
  v_created int := 0;
  v_total int := 0;
  v_max_page int;
  v_prev_page int;
  v_num int;
  v_page int;
  v_title text;
begin
  for v_version in select id from public.knowledge_source_versions where source_id = p_source_id loop
    select max(coalesce(u.page_to, u.page_from)) into v_max_page
      from public.knowledge_units u where u.version_id = v_version;

    create temp table if not exists _modrek_text_lessons (
      num int, page_start int, page_end int, title text
    ) on commit drop;
    delete from _modrek_text_lessons;

    create temp table if not exists _modrek_hits (num int, page int, title text) on commit drop;
    delete from _modrek_hits;

    insert into _modrek_hits (num, page, title)
    with pages as (
      select coalesce((c.metadata->>'page_from')::int, u.page_from, u.page_to) as page, c.content
        from public.content_chunks c
        join public.knowledge_units u on u.id = c.unit_id
       where c.version_id = v_version and coalesce(c.content, '') <> ''
    ),
    hits as (
      select p.page, m[1] as lead_word, (m[2])::int as num, coalesce(m[3], '') as rest
        from pages p,
             regexp_matches(
               p.content,
               '(الحديث|الدرس|درس|التفسير|الفقه|النحو|الموضوع|النص|القراءة|الوحدة|الباب|الفصل)[[:space:]]*\(?[[:space:]]*([0-9]{1,2})[[:space:]]*\)?([^.،:]{0,60})',
               'g'
             ) as m
       where p.page is not null
    ),
    lead_pick as (
      select lead_word from hits group by lead_word
      having count(distinct num) >= 3
      order by count(distinct num) desc, count(*) desc limit 1
    ),
    scoped as (
      select h.* from hits h join lead_pick l on l.lead_word = h.lead_word
    ),
    toc_pages as (
      select page from scoped group by page having count(distinct num) >= 3
    )
    select s.num, s.page, left(trim(s.lead_word || ' ' || s.num || ' ' || s.rest), 120)
      from scoped s
     where s.page not in (select page from toc_pages);

    v_prev_page := 0;
    for v_num in select distinct num from _modrek_hits order by num loop
      select h.page, h.title into v_page, v_title
        from _modrek_hits h
       where h.num = v_num and h.page > v_prev_page
       order by h.page asc
       limit 1;
      if v_page is not null then
        insert into _modrek_text_lessons (num, page_start, title) values (v_num, v_page, v_title);
        v_prev_page := v_page;
      end if;
    end loop;

    select count(*) into v_total from _modrek_text_lessons;
    continue when v_total < 3;

    update _modrek_text_lessons t
       set page_end = coalesce(
             (select min(x.page_start) - 1 from _modrek_text_lessons x where x.page_start > t.page_start),
             v_max_page, t.page_start
           );

    update public.knowledge_lesson_index
       set kind = 'section', lesson_number = null, number_source = 'unknown'
     where version_id = v_version and kind = 'lesson' and number_source <> 'text_scan';

    delete from public.knowledge_lesson_index
     where version_id = v_version and number_source = 'text_scan';

    insert into public.knowledge_lesson_index
      (source_id, version_id, unit_id, kind, title, normalized_title,
       lesson_number, page_start, page_end, ordinal, number_source)
    select p_source_id, v_version,
           (select u.id from public.knowledge_units u
             where u.version_id = v_version and u.page_from = t.page_start
             order by (u.kind::text = 'page') desc limit 1),
           'lesson', t.title, lower(t.title), t.num, t.page_start, t.page_end, t.num, 'text_scan'
      from _modrek_text_lessons t;

    v_created := v_created + v_total;
  end loop;

  return jsonb_build_object('source_id', p_source_id, 'text_lessons', v_created);
end;
$fn$;

revoke all on function public.modrek_rebuild_lessons_from_text(uuid) from public;
grant execute on function public.modrek_rebuild_lessons_from_text(uuid) to service_role;

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
  v_has_text boolean;
begin
  for v_version in
    select id from public.knowledge_source_versions where source_id = p_source_id
  loop
    perform public.modrek_rebuild_lessons_from_text(p_source_id);
    select exists (
      select 1 from public.knowledge_lesson_index
       where version_id = v_version and kind = 'lesson' and number_source = 'text_scan'
    ) into v_has_text;

    if v_has_text then
      update public.knowledge_lesson_index
         set kind = 'section', lesson_number = null, number_source = 'unknown'
       where version_id = v_version and kind = 'lesson' and number_source <> 'text_scan';
    end if;

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

    if not v_has_text then
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
    end if;

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
    raw_pages as (
      select c.id, c.ordinal,
             coalesce(nullif(c.metadata->>'page_from','')::int, u.page_from, u.page_to,
                      p1.page_from, p1.page_to) as page_direct,
             nullif(regexp_replace(coalesce(substring(c.content from '--- *صفحة *([0-9]{1,4})'), ''), '\D', '', 'g'), '')::int as page_marker
        from public.content_chunks c
        join public.knowledge_units u on u.id = c.unit_id
        left join public.knowledge_units p1 on p1.id = u.parent_id
       where c.version_id = v_version
    ),
    chunk_pages as (
      select id,
             coalesce(page_direct, page_marker,
                      max(page_marker) over (order by ordinal rows between unbounded preceding and current row)
             ) as page
        from raw_pages
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