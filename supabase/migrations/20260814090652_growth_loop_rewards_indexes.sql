-- Cover reward redemption foreign keys before the schema reaches production.

create index if not exists learning_redemptions_profile_scope_idx
  on public.learning_redemptions (profile_id, household_id);

create index if not exists learning_redemptions_actor_idx
  on public.learning_redemptions (actor_user_id);

create index if not exists learning_redemptions_fulfilled_by_idx
  on public.learning_redemptions (fulfilled_by);

create index if not exists learning_redemptions_cancelled_by_idx
  on public.learning_redemptions (cancelled_by);
