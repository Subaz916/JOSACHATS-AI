create or replace function public.update_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array array[
    'profiles',
    'workspaces',
    'agents',
    'agent_instructions',
    'knowledge_sources',
    'products',
    'services',
    'conversations',
    'subscription_plans',
    'subscriptions',
    'payments',
    'human_support_requests',
    'integrations',
    'system_settings'
  ] loop
    execute format('drop trigger if exists set_updated_at on public.%I', t);
    execute format(
      'create trigger set_updated_at before update on public.%I for each row execute function public.update_updated_at()',
      t
    );
  end loop;
end $$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_name text;
  v_base text;
  v_slug text;
  v_workspace_id uuid;
  v_plan_id uuid;
  i integer;
begin
  v_name := nullif(
    btrim(
      coalesce(
        new.raw_user_meta_data ->> 'full_name',
        new.raw_user_meta_data ->> 'name',
        new.raw_user_meta_data ->> 'user_name',
        new.raw_user_meta_data ->> 'username',
        new.raw_user_meta_data ->> 'preferred_username',
        split_part(coalesce(new.email, ''), '@', 1)
      )
    ),
    ''
  );
  v_name := coalesce(v_name, 'there');

  insert into public.profiles (id, email, full_name, avatar_url)
  values (
    new.id,
    new.email,
    v_name,
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do update set
    email = excluded.email,
    full_name = excluded.full_name,
    avatar_url = excluded.avatar_url,
    updated_at = now();

  v_base := btrim(regexp_replace(lower(v_name), '[^a-z0-9]+', '-', 'g'), '-');
  v_base := coalesce(nullif(v_base, ''), 'user');

  for i in 1..5 loop
    v_slug := v_base || '-' || substr(md5(new.id::text || ':' || i::text || ':' || clock_timestamp()::text), 1, 12);
    begin
      insert into public.workspaces (owner_id, name, slug, settings)
      values (new.id, v_name || '''s Workspace', v_slug, '{}'::jsonb)
      returning id into v_workspace_id;
      exit;
    exception when unique_violation then
      continue;
    end;
  end loop;

  if v_workspace_id is null then
    raise exception 'Could not create workspace for user %', new.id;
  end if;

  insert into public.workspace_members (workspace_id, user_id, role)
  values (v_workspace_id, new.id, 'owner')
  on conflict (workspace_id, user_id) do update set role = 'owner';

  select id into v_plan_id
  from public.subscription_plans
  where code = 'free'
  limit 1;

  if v_plan_id is not null then
    insert into public.subscriptions (
      workspace_id,
      plan_id,
      status,
      provider,
      provider_subscription_id,
      current_period_start,
      current_period_end,
      cancel_at_period_end
    )
    values (
      v_workspace_id,
      v_plan_id,
      'active',
      'safepay',
      'free-' || new.id::text,
      now(),
      null,
      false
    )
    on conflict do nothing;
  end if;

  return new;
end;
$$;

revoke all on function public.handle_new_user() from public, anon, authenticated, service_role;
revoke all on function public.update_updated_at() from public, anon, authenticated, service_role;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();
