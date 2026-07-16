CREATE OR REPLACE FUNCTION public.library_subject_track_code(_section text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN btrim(coalesce(_section, '')) = '' THEN NULL
    WHEN lower(btrim(coalesce(_section, ''))) IN ('scientific','science','sci','sci_science','sci_math','science_track','math_track') THEN 'scientific'
    WHEN btrim(coalesce(_section, '')) IN ('علمي','علمى','علمي علوم','علمى علوم','علمي رياضة','علمى رياضة','علم') THEN 'scientific'
    WHEN lower(btrim(coalesce(_section, ''))) = 'literary' THEN 'literary'
    WHEN btrim(coalesce(_section, '')) IN ('أدبي','ادبي','أدبى','ادبى') THEN 'literary'
    ELSE lower(btrim(coalesce(_section, '')))
  END
$$;

CREATE OR REPLACE FUNCTION public.library_track_display_name(_code text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE _code
    WHEN 'scientific' THEN 'علمي'
    WHEN 'sci_science' THEN 'علمي علوم'
    WHEN 'sci_math' THEN 'علمي رياضة'
    WHEN 'literary' THEN 'أدبي'
    WHEN 'none' THEN 'بدون شعبة'
    ELSE _code
  END
$$;

CREATE OR REPLACE FUNCTION public.library_track_sort_order(_code text)
RETURNS integer
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE _code
    WHEN 'none' THEN 0
    WHEN 'scientific' THEN 1
    WHEN 'sci_science' THEN 2
    WHEN 'sci_math' THEN 3
    WHEN 'literary' THEN 4
    ELSE 99
  END
$$;

CREATE OR REPLACE FUNCTION public.library_infer_book_track_before_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _subject record;
  _track_code text;
  _track_id uuid;
BEGIN
  IF NEW.track_id IS NOT NULL OR NEW.subject_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT id, stage, section, is_active
  INTO _subject
  FROM public.subjects
  WHERE id = NEW.subject_id;

  IF NOT FOUND OR _subject.is_active IS NOT TRUE THEN
    RETURN NEW;
  END IF;

  IF lower(coalesce(_subject.stage, '')) <> 'secondary'
     AND coalesce(_subject.stage, '') NOT ILIKE '%ثانو%' THEN
    RETURN NEW;
  END IF;

  _track_code := public.library_subject_track_code(_subject.section);
  IF coalesce(_track_code, '') = '' THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.library_tracks (code, name_ar, sort_order, is_active)
  VALUES (_track_code, public.library_track_display_name(_track_code), public.library_track_sort_order(_track_code), true)
  ON CONFLICT (code) DO UPDATE
  SET name_ar = EXCLUDED.name_ar,
      sort_order = EXCLUDED.sort_order,
      is_active = true,
      updated_at = now()
  RETURNING id INTO _track_id;

  NEW.track_id := _track_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_library_infer_book_track_before_write ON public.library_books;
CREATE TRIGGER trg_library_infer_book_track_before_write
BEFORE INSERT OR UPDATE OF subject_id, stage_id, track_id
ON public.library_books
FOR EACH ROW
EXECUTE FUNCTION public.library_infer_book_track_before_write();