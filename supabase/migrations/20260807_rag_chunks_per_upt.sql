-- ────────────────────────────────────────────────────────────
-- RAG per-UPT (Pak War 3-tier) — 2026-08-07
-- Sebelumnya rag_chunks TANPA kolom UPT: chunk katalog membawa qty/lokasi
-- agregat SEMUA UPT dan chunk txn tak ditandai, sehingga semantic search
-- match_rag_chunks membocorkan data UPT lain ke akun UPT/UIT.
--
-- Perubahan:
--   1. Kolom rag_chunks.upt_id (nullable). null = chunk SHARED (mis. FAQ,
--      katalog tanpa stok) yang tampil ke semua viewer.
--   2. match_rag_chunks(p_upts text[]) — 3-tier:
--        p_upts NULL          → nasional (Pusat/SUPERADMIN): semua chunk.
--        p_upts = ARRAY[...]  → hanya chunk upt_id di dalam array + chunk shared (upt_id null).
--      Param default NULL menjaga backward-compat (pemanggil lama = nasional).
--
-- Backward-safe: kolom nullable, RPC diganti dengan default NULL. Chunk lama
-- ber-upt_id NULL akan digantikan chunk bertag saat re-sync KB berikutnya
-- (syncRagChunks/nightly_sync meng-upsert id baru & menghapus id lama yatim).
-- ────────────────────────────────────────────────────────────

alter table rag_chunks add column if not exists upt_id text;
create index if not exists idx_rag_chunks_upt on rag_chunks(upt_id);

-- Buang versi 2-arg lama (tanpa scope) — menambah param via CREATE OR REPLACE justru
-- membuat OVERLOAD baru, bukan mengganti; dua fungsi sekaligus bikin call 2-arg ambigu
-- dan versi lama TANPA filter UPT masih bisa terpanggil (bocor). Harus di-drop eksplisit.
drop function if exists match_rag_chunks(vector, integer);

create or replace function match_rag_chunks(
  query_embedding vector(1024),
  match_count int default 8,
  p_upts text[] default null
)
returns table(id text, source_type text, source_id text, content text, similarity float)
language sql stable
as $$
  select id, source_type, source_id, content, 1 - (embedding <=> query_embedding) as similarity
  from rag_chunks
  where embedding is not null
    and (p_upts is null or upt_id is null or upt_id = any(p_upts))
  order by embedding <=> query_embedding
  limit match_count;
$$;
