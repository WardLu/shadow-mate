create index if not exists learning_households_owner_idx
  on public.learning_households (owner_user_id);

create index if not exists learning_households_project_idx
  on public.learning_households (project_id);
