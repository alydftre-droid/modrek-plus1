-- Multi-book semantic search (one round trip instead of one per book)
CREATE OR REPLACE FUNCTION public.library_match_chunks_multi(
  p_book_ids uuid[],
  p_query_embedding vector,
  p_match_count integer DEFAULT 12
)
RETURNS TABLE(id uuid, book_id uuid, page_number integer, content text, similarity double precision)
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $function$
  SELECT c.id, c.book_id, c.page_number, c.content,
         1 - (c.embedding <=> p_query_embedding) AS similarity
  FROM public.library_book_chunks c
  WHERE c.book_id = ANY(p_book_ids)
    AND c.embedding IS NOT NULL
  ORDER BY c.embedding <=> p_query_embedding
  LIMIT p_match_count;
$function$;

-- Multi-book keyword / exact phrase search (trigram index backed)
CREATE OR REPLACE FUNCTION public.library_search_chunks_text(
  p_book_ids uuid[],
  p_query text,
  p_match_count integer DEFAULT 12
)
RETURNS TABLE(id uuid, book_id uuid, page_number integer, content text, rank double precision)
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $function$
  SELECT c.id, c.book_id, c.page_number, c.content,
         GREATEST(
           similarity(c.content, p_query),
           CASE WHEN c.content ILIKE '%' || p_query || '%' THEN 1.0 ELSE 0 END
         )::double precision AS rank
  FROM public.library_book_chunks c
  WHERE c.book_id = ANY(p_book_ids)
    AND (c.content ILIKE '%' || p_query || '%' OR c.content % p_query)
  ORDER BY rank DESC
  LIMIT p_match_count;
$function$;

GRANT EXECUTE ON FUNCTION public.library_match_chunks_multi(uuid[], vector, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.library_search_chunks_text(uuid[], text, integer) TO service_role;

-- Allow the backend (service role) to record assistant retrieval telemetry
GRANT SELECT, INSERT ON public.modrek_search_logs TO service_role;

-- Grounding / debug payload for each assistant request
ALTER TABLE public.modrek_search_logs
  ADD COLUMN IF NOT EXISTS surface text,
  ADD COLUMN IF NOT EXISTS trace jsonb NOT NULL DEFAULT '{}'::jsonb;