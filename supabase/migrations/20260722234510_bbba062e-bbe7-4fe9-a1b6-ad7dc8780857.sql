CREATE OR REPLACE FUNCTION public.exam_meaningful_tokens(_value text)
RETURNS text[]
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO 'public'
AS $function$
DECLARE
  words text[] := regexp_split_to_array(public.normalize_exam_grading_text(_value), '\s+');
  result text[] := ARRAY[]::text[];
  word text;
  token text;
  stop_words text[] := ARRAY[
    'من','في','على','علي','عن','الى','الي','ان','إن','أن','هو','هي','هما','هم','هن','هذا','هذه','ذلك','تلك','الذي','التي','الذين','او','أو','و','ثم','كما','كل','اي','أي','لا','لم','لن','ما','مع','بين','عند','اذا','إذا','كان','كانت','يكون','تكون','قد','لقد','حتى','حتي','فقط','غير','بعد','قبل','خلال','حول','له','لها','به','بها','فيها',
    'سؤال','السؤال','سوال','السوال','اجابه','اجابة','الإجابة','الاجابه','صحيح','صحيحه','الصحيحه','الصحيح','نموذج','النموذج','النموذجيه',
    'اعرف','ادري','اعلم','اجب','اجيب',
    'شرط','شروط','وجوب','واجب','واجبات','صوم','الصوم','الصيام','صيام','صلاه','صلا','الصلاه','الصلاة'
  ];
BEGIN
  FOREACH word IN ARRAY words LOOP
    token := public.normalize_exam_semantic_token(word);
    IF length(token) >= 3 AND NOT token = ANY(stop_words) AND NOT token = ANY(result) THEN
      result := array_append(result, token);
    END IF;
  END LOOP;
  RETURN result;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.exam_meaningful_tokens(text) TO public, anon, authenticated, service_role;