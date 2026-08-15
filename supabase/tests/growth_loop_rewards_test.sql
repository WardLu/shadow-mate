begin;
select plan(32);

set local role postgres;

insert into auth.users (id, email, encrypted_password, raw_user_meta_data)
values
  ('55555555-5555-4555-8555-555555555555', 'rewards-owner@example.test', '$2a$10$test-password-hash', '{}'::jsonb),
  ('66666666-6666-4666-8666-666666666666', 'rewards-other@example.test', '$2a$10$test-password-hash', '{}'::jsonb);

insert into public.learning_households (id, name, owner_user_id)
values (
  'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  '奖励测试家庭',
  '55555555-5555-4555-8555-555555555555'
);

insert into public.learning_household_members (household_id, user_id, role)
values (
  'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  '55555555-5555-4555-8555-555555555555',
  'owner'
);

insert into public.learning_profiles (id, household_id, display_name, grade_level)
values (
  'cccccccc-dddd-4ccc-8ccc-cccccccccccc',
  'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  '奖励孩子',
  4
);

set local role authenticated;
set local request.jwt.claim.sub = '55555555-5555-4555-8555-555555555555';

select lives_ok(
  $$insert into public.learning_rewards (
      id, household_id, name, cost_points, reward_kind, category
    ) values (
      'cccccccc-eeee-4ccc-8ccc-cccccccccccc',
      'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      '亲子绘本时间',
      5,
      'custom',
      'activity'
    )$$,
  'guardian can create a household reward'
);

select lives_ok(
  $$insert into public.learning_profile_rewards (
      household_id, profile_id, reward_id, cost_override
    ) values (
      'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      'cccccccc-dddd-4ccc-8ccc-cccccccccccc',
      'cccccccc-eeee-4ccc-8ccc-cccccccccccc',
      4
    )$$,
  'guardian can assign a reward to one child with a cost override'
);

select lives_ok(
  $$select * from public.learning_record_points(
    'cccccccc-dddd-4ccc-8ccc-cccccccccccc',
    null,
    6,
    'cccccccc-3333-4ccc-8ccc-cccccccccccc',
    'initial_balance',
    '期初积分'
  )$$,
  'guardian can seed a separately auditable initial balance'
);

select is(
  (select count(*)
   from public.learning_redeem_reward(
     'cccccccc-dddd-4ccc-8ccc-cccccccccccc',
     'cccccccc-eeee-4ccc-8ccc-cccccccccccc',
     'cccccccc-ffff-4ccc-8ccc-cccccccccccc'
   )),
  1::bigint,
  'redeeming an enabled reward creates one redemption'
);

select is(
  (select cost_points_snapshot
   from public.learning_redemptions
   where request_id = 'cccccccc-ffff-4ccc-8ccc-cccccccccccc'),
  4,
  'redemption stores the child-specific cost snapshot'
);

select is(
  (select status
   from public.learning_redemptions
   where request_id = 'cccccccc-ffff-4ccc-8ccc-cccccccccccc'),
  'pending',
  'new redemption starts as pending fulfillment'
);

select is(
  (select ledger.delta
   from public.learning_point_ledger ledger
   join public.learning_redemptions redemption on redemption.id = ledger.redemption_id
   where redemption.request_id = 'cccccccc-ffff-4ccc-8ccc-cccccccccccc'
     and ledger.entry_type = 'redemption'),
  -4,
  'redemption appends a signed debit ledger row'
);

select ok(
  exists (
    select 1
    from public.learning_point_ledger ledger
    join public.learning_redemptions redemption on redemption.id = ledger.redemption_id
    where redemption.request_id = 'cccccccc-ffff-4ccc-8ccc-cccccccccccc'
      and ledger.entry_type = 'redemption'
  ),
  'redemption debit is linked to its redemption id'
);

select is(
  (select count(*)
   from public.learning_redeem_reward(
     'cccccccc-dddd-4ccc-8ccc-cccccccccccc',
     'cccccccc-eeee-4ccc-8ccc-cccccccccccc',
     'cccccccc-ffff-4ccc-8ccc-cccccccccccc'
   )),
  1::bigint,
  'repeating redemption request returns the original redemption'
);

select is(
  (select count(*) from public.learning_redemptions),
  1::bigint,
  'repeating redemption request does not create another redemption'
);

select is(
  (select count(*)
   from public.learning_cancel_redemption(
     (select id from public.learning_redemptions where request_id = 'cccccccc-ffff-4ccc-8ccc-cccccccccccc'),
     'cccccccc-1111-4ccc-8ccc-cccccccccccc',
     '本次暂不兑现'
   )),
  1::bigint,
  'guardian can cancel a pending redemption'
);

select is(
  (select status
   from public.learning_redemptions
   where request_id = 'cccccccc-ffff-4ccc-8ccc-cccccccccccc'),
  'cancelled',
  'cancelled redemption records its terminal status'
);

select is(
  (select delta
   from public.learning_point_ledger ledger
   where ledger.redemption_id = (
       select id from public.learning_redemptions
       where request_id = 'cccccccc-ffff-4ccc-8ccc-cccccccccccc'
     )
     and ledger.entry_type = 'refund'),
  4,
  'cancellation appends a compensating refund ledger row'
);

select is(
  (select count(*)
   from public.learning_point_ledger ledger
   where ledger.redemption_id = (
       select id from public.learning_redemptions
       where request_id = 'cccccccc-ffff-4ccc-8ccc-cccccccccccc'
     )
     and ledger.entry_type = 'refund'),
  1::bigint,
  'cancellation creates one refund row'
);

select is(
  (select count(*)
   from public.learning_cancel_redemption(
     (select id from public.learning_redemptions where request_id = 'cccccccc-ffff-4ccc-8ccc-cccccccccccc'),
     'cccccccc-1111-4ccc-8ccc-cccccccccccc',
     '重复取消'
   )),
  1::bigint,
  'repeating cancellation request returns the original cancellation'
);

select is(
  (select count(*)
   from public.learning_redeem_reward(
     'cccccccc-dddd-4ccc-8ccc-cccccccccccc',
     'cccccccc-eeee-4ccc-8ccc-cccccccccccc',
     'cccccccc-2222-4ccc-8ccc-cccccccccccc'
   )),
  1::bigint,
  'refunded points can be redeemed again'
);

select is(
  (select count(*)
   from public.learning_fulfill_redemption(
     (select id from public.learning_redemptions where request_id = 'cccccccc-2222-4ccc-8ccc-cccccccccccc')
   )),
  1::bigint,
  'guardian can fulfill a pending redemption'
);

select is(
  (select status
   from public.learning_redemptions
   where request_id = 'cccccccc-2222-4ccc-8ccc-cccccccccccc'),
  'fulfilled',
  'fulfilled redemption records its terminal status'
);

select is(
  (select count(*)
   from public.learning_fulfill_redemption(
     (select id from public.learning_redemptions where request_id = 'cccccccc-2222-4ccc-8ccc-cccccccccccc')
   )),
  1::bigint,
  'repeating fulfillment is idempotent'
);

select throws_ok(
  $$select * from public.learning_cancel_redemption(
    (select id from public.learning_redemptions where request_id = 'cccccccc-2222-4ccc-8ccc-cccccccccccc'),
    'cccccccc-5555-4ccc-8ccc-cccccccccccc',
    '兑现后取消'
  )$$,
  'P0001',
  'learning_redemption_not_cancellable',
  'fulfilled redemption cannot be cancelled'
);

select throws_ok(
  $$select * from public.learning_redeem_reward(
    'cccccccc-dddd-4ccc-8ccc-cccccccccccc',
    'cccccccc-eeee-4ccc-8ccc-cccccccccccc',
    'cccccccc-6666-4ccc-8ccc-cccccccccccc'
  )$$,
  'P0001',
  'learning_reward_insufficient_points',
  'redemption is blocked when the child balance is insufficient'
);

select throws_ok(
  $$select * from public.learning_record_points(
    'cccccccc-dddd-4ccc-8ccc-cccccccccccc',
    null,
    -1,
    'cccccccc-7777-4ccc-8ccc-cccccccccccc',
    'redemption',
    '伪造兑换流水'
  )$$,
  '22023',
  'learning_redemption_link_required',
  'generic point RPC cannot create an unlinked redemption debit'
);

select throws_ok(
  $$insert into public.learning_redemptions (
      household_id, profile_id, reward_id, reward_name_snapshot,
      cost_points_snapshot, request_id
    ) values (
      'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      'cccccccc-dddd-4ccc-8ccc-cccccccccccc',
      'cccccccc-eeee-4ccc-8ccc-cccccccccccc',
      '绕过 RPC',
      1,
      'cccccccc-8888-4ccc-8ccc-cccccccccccc'
    )$$,
  '42501',
  null,
  'authenticated users cannot insert redemption rows directly'
);

select throws_ok(
  $$update public.learning_redemptions
    set status = 'fulfilled'
    where request_id = 'cccccccc-2222-4ccc-8ccc-cccccccccccc'$$,
  '42501',
  null,
  'authenticated users cannot update redemption rows directly'
);

select throws_ok(
  $$delete from public.learning_redemptions
    where request_id = 'cccccccc-2222-4ccc-8ccc-cccccccccccc'$$,
  '42501',
  null,
  'authenticated users cannot delete redemption rows directly'
);

set local request.jwt.claim.sub = '66666666-6666-4666-8666-666666666666';

select is(
  (select count(*) from public.learning_rewards),
  0::bigint,
  'another user cannot read rewards from the first household'
);

select is(
  (select count(*) from public.learning_redemptions),
  0::bigint,
  'another user cannot read redemptions from the first household'
);

select throws_ok(
  $$select * from public.learning_redeem_reward(
    'cccccccc-dddd-4ccc-8ccc-cccccccccccc',
    'cccccccc-eeee-4ccc-8ccc-cccccccccccc',
    'cccccccc-9999-4ccc-8ccc-cccccccccccc'
  )$$,
  '42501',
  'learning_point_forbidden',
  'another user cannot redeem a reward for the first household'
);

select throws_ok(
  $$insert into public.learning_rewards (household_id, name, cost_points)
    values ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', '越权奖励', 1)$$,
  '42501',
  null,
  'another user cannot create a reward in the first household'
);

set local request.jwt.claim.sub = '55555555-5555-4555-8555-555555555555';

select lives_ok(
  $$select public.learning_delete_household('cccccccc-cccc-4ccc-8ccc-cccccccccccc')$$,
  'owner can delete a household containing reward and redemption history'
);

select is(
  (select count(*) from public.learning_rewards
   where household_id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'),
  0::bigint,
  'household deletion removes reward definitions'
);

select is(
  (select count(*) from public.learning_redemptions
   where household_id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'),
  0::bigint,
  'household deletion removes redemption records'
);

select * from finish();
rollback;
