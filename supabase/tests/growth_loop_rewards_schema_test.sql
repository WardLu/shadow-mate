begin;
select plan(15);

select is(
  to_regclass('public.learning_rewards')::text,
  'learning_rewards',
  'reward table exists'
);

select is(
  to_regclass('public.learning_profile_rewards')::text,
  'learning_profile_rewards',
  'profile reward table exists'
);

select is(
  to_regclass('public.learning_redemptions')::text,
  'learning_redemptions',
  'redemption table exists'
);

select is(
  (select count(*)
   from information_schema.columns
   where table_schema = 'public'
     and table_name = 'learning_point_ledger'
     and column_name = 'redemption_id'),
  1::bigint,
  'point ledger can link redemption and refund entries'
);

select is(
  (select count(*)
   from information_schema.columns
   where table_schema = 'public'
     and table_name = 'learning_rewards'
     and column_name in ('household_id', 'name', 'cost_points', 'is_active')),
  4::bigint,
  'rewards expose household, label, cost, and active state'
);

select is(
  (select count(*)
   from information_schema.columns
   where table_schema = 'public'
     and table_name = 'learning_profile_rewards'
     and column_name in ('household_id', 'profile_id', 'reward_id', 'cost_override', 'enabled')),
  5::bigint,
  'profile reward config exposes scope, reward, override, and enabled state'
);

select is(
  (select count(*)
   from information_schema.columns
   where table_schema = 'public'
     and table_name = 'learning_redemptions'
     and column_name in (
       'household_id', 'profile_id', 'reward_id', 'reward_name_snapshot',
       'cost_points_snapshot', 'status', 'request_id', 'actor_user_id'
     )),
  8::bigint,
  'redemptions preserve scope, reward and cost snapshots, status, and idempotency actor'
);

select ok(
  (select count(*) = 3
   from pg_class
   where oid in (
     to_regclass('public.learning_rewards'),
     to_regclass('public.learning_profile_rewards'),
     to_regclass('public.learning_redemptions')
   )
   and relrowsecurity),
  'RLS is enabled on all reward tables'
);

select ok(
  exists (
    select 1
    from pg_constraint
    where conrelid = to_regclass('public.learning_redemptions')
      and contype = 'u'
      and pg_get_constraintdef(oid) like '%profile_id%request_id%'
  ),
  'redemptions have a per-child request idempotency constraint'
);

select ok(
  exists (
    select 1
    from pg_proc function
    join pg_namespace namespace on namespace.oid = function.pronamespace
    where namespace.nspname = 'public'
      and function.proname = 'learning_redeem_reward'
      and function.pronargs = 3
  ),
  'redeem reward RPC has child, reward, and request arguments'
);

select ok(
  exists (
    select 1
    from pg_proc function
    join pg_namespace namespace on namespace.oid = function.pronamespace
    where namespace.nspname = 'public'
      and function.proname = 'learning_fulfill_redemption'
      and function.pronargs = 1
  ),
  'fulfill redemption RPC has one redemption argument'
);

select ok(
  exists (
    select 1
    from pg_proc function
    join pg_namespace namespace on namespace.oid = function.pronamespace
    where namespace.nspname = 'public'
      and function.proname = 'learning_cancel_redemption'
      and function.pronargs = 3
  ),
  'cancel redemption RPC has redemption, request, and note arguments'
);

select ok(
  coalesce((
    select has_function_privilege(
      'authenticated',
      'public.learning_redeem_reward(uuid,uuid,uuid)',
      'execute'
    )
    where exists (
      select 1 from pg_proc function
      join pg_namespace namespace on namespace.oid = function.pronamespace
      where namespace.nspname = 'public'
        and function.proname = 'learning_redeem_reward'
        and function.pronargs = 3
    )
  ), false),
  'authenticated users can call the redeem reward RPC'
);

select ok(
  coalesce((
    select not has_function_privilege(
      'anon',
      'public.learning_redeem_reward(uuid,uuid,uuid)',
      'execute'
    )
    where exists (
      select 1 from pg_proc function
      join pg_namespace namespace on namespace.oid = function.pronamespace
      where namespace.nspname = 'public'
        and function.proname = 'learning_redeem_reward'
        and function.pronargs = 3
    )
  ), false),
  'anonymous users cannot call the redeem reward RPC'
);

select ok(
  coalesce((
    select not has_table_privilege('authenticated', 'public.learning_redemptions', 'insert,update,delete')
    where to_regclass('public.learning_redemptions') is not null
  ), false),
  'authenticated users cannot write redemption rows directly'
);

select * from finish();
rollback;
