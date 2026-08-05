-- Prune the conflict-storm source audit table.
--
-- private.learning_save_audit grows one row per version-conflict call. Under a
-- runaway conflict storm this can grow quickly, so retain only the most recent
-- 7 days and prune daily via pg_cron (04:00 UTC).
--
-- Uses an extension check + dynamic SQL so environments without pg_cron (e.g.
-- some local supabase starts) skip the cron job instead of failing the start.
-- Idempotent on re-run: the old job is removed first, then recreated.

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    execute 'delete from cron.job where jobname = ''shadow-mate-cleanup-learning-save-audit''';
    execute format(
      'select cron.schedule(%L, %L, %L)',
      'shadow-mate-cleanup-learning-save-audit',
      '0 4 * * *',
      'delete from private.learning_save_audit where ts < now() - interval ''7 days'''
    );
  end if;
end;
$$;
