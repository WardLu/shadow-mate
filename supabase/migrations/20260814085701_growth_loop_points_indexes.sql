-- Cover the composite foreign keys introduced by the Growth Loop point slice.
-- Keep this separate from the foundation migration so each local/remote
-- migration remains independently reviewable and serially applicable.

create index if not exists learning_profile_point_items_profile_scope_idx
  on public.learning_profile_point_items (profile_id, household_id);

create index if not exists learning_profile_point_items_item_scope_idx
  on public.learning_profile_point_items (point_item_id, household_id);

create index if not exists learning_point_ledger_profile_scope_idx
  on public.learning_point_ledger (profile_id, household_id);

create index if not exists learning_point_ledger_item_scope_idx
  on public.learning_point_ledger (point_item_id, household_id);

create index if not exists learning_point_ledger_actor_idx
  on public.learning_point_ledger (actor_user_id);
