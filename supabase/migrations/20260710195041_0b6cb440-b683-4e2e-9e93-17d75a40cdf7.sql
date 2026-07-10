
create or replace function public.get_email_by_phone(_phone text)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select p.email
  from public.profiles p
  where p.phone is not null
    and regexp_replace(p.phone, '\D', '', 'g') = regexp_replace(_phone, '\D', '', 'g')
    and length(regexp_replace(_phone, '\D', '', 'g')) >= 6
  limit 1;
$$;

revoke all on function public.get_email_by_phone(text) from public;
grant execute on function public.get_email_by_phone(text) to anon, authenticated;
