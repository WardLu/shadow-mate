create extension if not exists dblink with schema extensions;

select plan(8);

set role postgres;

insert into auth.users (id, email, encrypted_password, raw_user_meta_data)
values ('55555555-5555-4555-8555-555555555555', 'recovery-race-owner@example.test', '$2a$10$test-password-hash', '{}'::jsonb);

insert into public.learning_households (id, name, owner_user_id)
values (
  '55555555-0000-4000-8000-555555555555',
  '积分恢复并发测试家庭',
  '55555555-5555-4555-8555-555555555555'
);

insert into public.learning_household_members (household_id, user_id, role)
values (
  '55555555-0000-4000-8000-555555555555',
  '55555555-5555-4555-8555-555555555555',
  'owner'
);

insert into public.learning_profiles (id, household_id, display_name, grade_level)
values
  ('55555555-1111-4000-8000-555555555555', '55555555-0000-4000-8000-555555555555', '并发导入孩子', 4),
  ('55555555-2222-4000-8000-555555555555', '55555555-0000-4000-8000-555555555555', '恢复竞争孩子', 4);

create temporary table recovery_concurrency_config (conninfo text not null);
insert into recovery_concurrency_config (conninfo)
values (format(
  'host=%s port=%s dbname=%s user=postgres password=postgres',
  inet_server_addr(),
  inet_server_port(),
  current_database()
));

create temporary table recovery_concurrency_results (
  label text primary key,
  result text not null
);

select extensions.dblink_connect('recovery_a', (select conninfo from recovery_concurrency_config));
select extensions.dblink_connect('recovery_b', (select conninfo from recovery_concurrency_config));

select extensions.dblink_exec('recovery_a', $remote$
  create or replace function pg_temp.try_import(
    p_profile_id uuid,
    p_batch_id uuid,
    p_entry_id uuid,
    p_delta integer
  ) returns text
  language plpgsql
  as $function$
  begin
    perform public.learning_import_legacy_points(
      p_profile_id,
      p_batch_id,
      jsonb_build_array(jsonb_build_object(
        'request_id', p_entry_id,
        'occurred_on', '2026-08-01',
        'delta', p_delta,
        'item_name_snapshot', '并发恢复测试',
        'note', '旧积分记录'
      ))
    );
    return 'ok';
  exception
    when others then
      return sqlstate || ':' || sqlerrm;
  end;
  $function$;
$remote$);

select extensions.dblink_exec('recovery_b', $remote$
  create or replace function pg_temp.try_import(
    p_profile_id uuid,
    p_batch_id uuid,
    p_entry_id uuid,
    p_delta integer
  ) returns text
  language plpgsql
  as $function$
  begin
    perform public.learning_import_legacy_points(
      p_profile_id,
      p_batch_id,
      jsonb_build_array(jsonb_build_object(
        'request_id', p_entry_id,
        'occurred_on', '2026-08-01',
        'delta', p_delta,
        'item_name_snapshot', '并发恢复测试',
        'note', '旧积分记录'
      ))
    );
    return 'ok';
  exception
    when others then
      return sqlstate || ':' || sqlerrm;
  end;
  $function$;

  create or replace function pg_temp.try_opening(
    p_profile_id uuid,
    p_request_id uuid,
    p_balance integer
  ) returns text
  language plpgsql
  as $function$
  begin
    perform public.learning_confirm_opening_balance(
      p_profile_id,
      p_balance,
      p_request_id,
      '期初积分'
    );
    return 'ok';
  exception
    when others then
      return sqlstate || ':' || sqlerrm;
  end;
  $function$;
$remote$);

-- The first import finishes but keeps its transaction and child row lock open.
select extensions.dblink_exec('recovery_a', 'begin');
select extensions.dblink_exec('recovery_a', 'set local role authenticated');
select extensions.dblink_exec('recovery_a', $remote$set local request.jwt.claim.sub = '55555555-5555-4555-8555-555555555555'$remote$);
select extensions.dblink_send_query('recovery_a', $remote$
  select pg_temp.try_import(
    '55555555-1111-4000-8000-555555555555',
    '55555555-aaaa-4000-8000-555555555555',
    '55555555-a001-4000-8000-555555555555',
    5
  )
$remote$);
insert into recovery_concurrency_results (label, result)
select 'first_import', result
from extensions.dblink_get_result('recovery_a') as response(result text);
select count(*)
from extensions.dblink_get_result('recovery_a') as response(result text);

select extensions.dblink_exec('recovery_b', 'begin');
select extensions.dblink_exec('recovery_b', 'set local role authenticated');
select extensions.dblink_exec('recovery_b', $remote$set local request.jwt.claim.sub = '55555555-5555-4555-8555-555555555555'$remote$);
select extensions.dblink_send_query('recovery_b', $remote$
  select pg_temp.try_import(
    '55555555-1111-4000-8000-555555555555',
    '55555555-bbbb-4000-8000-555555555555',
    '55555555-b001-4000-8000-555555555555',
    1000
  )
$remote$);
select pg_sleep(0.1);

select is(
  (select result from recovery_concurrency_results where label = 'first_import'),
  'ok',
  'the first concurrent legacy import succeeds'
);
select is(
  extensions.dblink_is_busy('recovery_b'),
  1,
  'a second import waits on the same child-level lock'
);

select extensions.dblink_exec('recovery_a', 'commit');
insert into recovery_concurrency_results (label, result)
select 'second_import', result
from extensions.dblink_get_result('recovery_b') as response(result text);
select count(*)
from extensions.dblink_get_result('recovery_b') as response(result text);
select extensions.dblink_exec('recovery_b', 'commit');

select is(
  (select result from recovery_concurrency_results where label = 'second_import'),
  'P0001:learning_legacy_points_already_imported',
  'the serialized second import is rejected after the first commits'
);
select is(
  (select count(*) from public.learning_point_ledger
   where profile_id = '55555555-1111-4000-8000-555555555555'
     and entry_type = 'legacy_import'),
  1::bigint,
  'concurrent imports create exactly one recovery batch'
);

-- A legacy import and opening balance use the same child-level lock and recovery check.
select extensions.dblink_exec('recovery_a', 'begin');
select extensions.dblink_exec('recovery_a', 'set local role authenticated');
select extensions.dblink_exec('recovery_a', $remote$set local request.jwt.claim.sub = '55555555-5555-4555-8555-555555555555'$remote$);
select extensions.dblink_send_query('recovery_a', $remote$
  select pg_temp.try_import(
    '55555555-2222-4000-8000-555555555555',
    '55555555-cccc-4000-8000-555555555555',
    '55555555-c001-4000-8000-555555555555',
    7
  )
$remote$);
insert into recovery_concurrency_results (label, result)
select 'recovery_import', result
from extensions.dblink_get_result('recovery_a') as response(result text);
select count(*)
from extensions.dblink_get_result('recovery_a') as response(result text);

select extensions.dblink_exec('recovery_b', 'begin');
select extensions.dblink_exec('recovery_b', 'set local role authenticated');
select extensions.dblink_exec('recovery_b', $remote$set local request.jwt.claim.sub = '55555555-5555-4555-8555-555555555555'$remote$);
select extensions.dblink_send_query('recovery_b', $remote$
  select pg_temp.try_opening(
    '55555555-2222-4000-8000-555555555555',
    '55555555-dddd-4000-8000-555555555555',
    7
  )
$remote$);
select pg_sleep(0.1);

select is(
  (select result from recovery_concurrency_results where label = 'recovery_import'),
  'ok',
  'the legacy import wins the recovery race'
);
select is(
  extensions.dblink_is_busy('recovery_b'),
  1,
  'opening balance waits on the same child-level lock'
);

select extensions.dblink_exec('recovery_a', 'commit');
insert into recovery_concurrency_results (label, result)
select 'recovery_opening', result
from extensions.dblink_get_result('recovery_b') as response(result text);
select count(*)
from extensions.dblink_get_result('recovery_b') as response(result text);
select extensions.dblink_exec('recovery_b', 'commit');

select is(
  (select result from recovery_concurrency_results where label = 'recovery_opening'),
  'P0001:learning_opening_balance_already_confirmed',
  'opening balance is rejected after the serialized import commits'
);
select is(
  (select count(*) from public.learning_point_ledger
   where profile_id = '55555555-2222-4000-8000-555555555555'
     and entry_type in ('legacy_import', 'initial_balance')),
  1::bigint,
  'the recovery race creates only one recovery method for the child'
);

select extensions.dblink_disconnect('recovery_a');
select extensions.dblink_disconnect('recovery_b');

delete from public.learning_households
where id = '55555555-0000-4000-8000-555555555555';
delete from auth.users
where id = '55555555-5555-4555-8555-555555555555';

select * from finish();
