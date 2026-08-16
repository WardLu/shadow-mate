-- W5 / 交付项 3：activity_events 180 天自动清理。
--
-- private.learning_activity_events 是诊断事件流（payload 已被 allowlist 限制，
-- 不含儿童姓名/邮箱/自由文本/语音文本/完整错误堆栈/页面 URL），保留 180 天滚动窗口，
-- 到期直接删除（不保留原始文本，避免不可逆聚合泄露敏感内容）。
-- 每日 04:00 UTC 由 pg_cron 执行；使用扩展检查 + 动态 SQL，无 pg_cron 的环境跳过，
-- 幂等（先删旧 job 再重建），与 learning_save_audit_prune 一致。

create or replace function private.learning_purge_activity_events(p_older_than interval default interval '180 days')
returns integer
language plpgsql security definer
set search_path = private
as $$
declare
  purged integer;
begin
  delete from private.learning_activity_events
  where received_at < now() - p_older_than;
  get diagnostics purged = row_count;
  return purged;
end;
$$;

revoke all on function private.learning_purge_activity_events(interval) from public;
revoke all on function private.learning_purge_activity_events(interval) from anon;
revoke all on function private.learning_purge_activity_events(interval) from authenticated;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    execute 'delete from cron.job where jobname = ''shadow-mate-cleanup-activity-events''';
    execute format(
      'select cron.schedule(%L, %L, %L)',
      'shadow-mate-cleanup-activity-events',
      '0 4 * * *',
      'select private.learning_purge_activity_events()'
    );
  end if;
end;
$$;
