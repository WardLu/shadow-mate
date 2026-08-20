-- Cover the two foreign-key lookups used by guardian-scoped diagnostics and
-- the profile-level export/retention queries.
create index if not exists learning_activity_events_actor_idx
  on private.learning_activity_events (actor_user_id);

create index if not exists learning_activity_events_profile_scope_idx
  on private.learning_activity_events (profile_id, household_id, occurred_at desc);
