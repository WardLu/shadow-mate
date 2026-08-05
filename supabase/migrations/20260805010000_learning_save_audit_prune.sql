-- Prune the conflict-storm source audit table.
--
-- private.learning_save_audit grows one row per version-conflict call. Under a
-- runaway conflict storm this can grow quickly, so retain only the most recent
-- 7 days and prune daily via pg_cron (04:00 UTC). Idempotent on re-run.

select cron.unschedule(jobid)
  from cron.job
 where jobname = 'shadow-mate-cleanup-learning-save-audit';

select cron.schedule(
  'shadow-mate-cleanup-learning-save-audit',
  '0 4 * * *',
  $cron$delete from private.learning_save_audit where ts < now() - interval '7 days'$cron$
);
