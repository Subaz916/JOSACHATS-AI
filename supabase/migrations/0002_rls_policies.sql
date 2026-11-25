alter table public.profiles enable row level security;
alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;
alter table public.agents enable row level security;
alter table public.agent_instructions enable row level security;
alter table public.knowledge_sources enable row level security;
alter table public.knowledge_chunks enable row level security;
alter table public.products enable row level security;
alter table public.services enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.audio_assets enable row level security;
alter table public.subscription_plans enable row level security;
alter table public.subscriptions enable row level security;
alter table public.payments enable row level security;
alter table public.usage_records enable row level security;
alter table public.feedback enable row level security;
alter table public.human_support_requests enable row level security;
alter table public.integrations enable row level security;
alter table public.notifications enable row level security;
alter table public.admin_roles enable row level security;
alter table public.audit_logs enable row level security;
alter table public.system_settings enable row level security;
alter table public.webhook_events enable row level security;

create or replace function public.is_admin(p_user_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  select p_user_id is not null and (
    exists (
      select 1
      from public.profiles p
      where p.id = p_user_id
        and p.is_admin = true
    )
    or exists (
      select 1
      from public.admin_roles ar
      where ar.user_id = p_user_id
        and ar.role in ('admin', 'super_admin')
    )
  );
$$;

create or replace function public.workspace_is_member(p_workspace_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  select p_workspace_id is not null and (
    exists (
      select 1
      from public.workspaces w
      where w.id = p_workspace_id
        and w.owner_id = auth.uid()
    )
    or exists (
      select 1
      from public.workspace_members wm
      where wm.workspace_id = p_workspace_id
        and wm.user_id = auth.uid()
    )
  );
$$;

revoke all on function public.is_admin(uuid) from public, anon, authenticated, service_role;
revoke all on function public.workspace_is_member(uuid) from public, anon, authenticated, service_role;
grant execute on function public.is_admin(uuid) to authenticated, service_role;
grant execute on function public.workspace_is_member(uuid) to authenticated, service_role;

revoke all on table public.profiles from anon;
revoke all on table public.workspaces from anon;
revoke all on table public.workspace_members from anon;
revoke all on table public.agents from anon;
revoke all on table public.agent_instructions from anon;
revoke all on table public.knowledge_sources from anon;
revoke all on table public.knowledge_chunks from anon;
revoke all on table public.products from anon;
revoke all on table public.services from anon;
revoke all on table public.conversations from anon;
revoke all on table public.messages from anon;
revoke all on table public.audio_assets from anon;
revoke all on table public.subscriptions from anon;
revoke all on table public.payments from anon;
revoke all on table public.usage_records from anon;
revoke all on table public.feedback from anon;
revoke all on table public.human_support_requests from anon;
revoke all on table public.integrations from anon;
revoke all on table public.notifications from anon;
revoke all on table public.admin_roles from anon;
revoke all on table public.audit_logs from anon;
revoke all on table public.system_settings from anon;
revoke all on table public.webhook_events from anon;

grant select, insert, update on table public.profiles to authenticated;
grant select, insert, update, delete on table public.workspaces to authenticated;
grant select, insert, update, delete on table public.workspace_members to authenticated;
grant select, insert, update, delete on table public.agents to authenticated;
grant select, insert, update, delete on table public.agent_instructions to authenticated;
grant select, insert, update, delete on table public.knowledge_sources to authenticated;
grant select, insert, update, delete on table public.knowledge_chunks to authenticated;
grant select, insert, update, delete on table public.products to authenticated;
grant select, insert, update, delete on table public.services to authenticated;
grant select, insert, update, delete on table public.conversations to authenticated;
grant select, insert, update, delete on table public.messages to authenticated;
grant select, insert, update, delete on table public.audio_assets to authenticated;
grant select, insert, update, delete on table public.subscriptions to authenticated;
grant select, insert, update, delete on table public.payments to authenticated;
grant select, insert, update, delete on table public.usage_records to authenticated;
grant select, insert, update, delete on table public.feedback to authenticated;
grant select, insert, update, delete on table public.human_support_requests to authenticated;
grant select, insert, update, delete on table public.integrations to authenticated;
grant select, insert, update, delete on table public.notifications to authenticated;
grant select on table public.admin_roles to authenticated;
grant select, insert on table public.audit_logs to authenticated;
grant select, insert, update, delete on table public.system_settings to authenticated;
grant select, update, delete on table public.webhook_events to authenticated;

revoke all on table public.subscription_plans from anon, authenticated;
grant select on table public.subscription_plans to anon, authenticated;

drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own on public.profiles
for select to authenticated
using (id = auth.uid());

drop policy if exists profiles_insert_own on public.profiles;
create policy profiles_insert_own on public.profiles
for insert to authenticated
with check (id = auth.uid());

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles
for update to authenticated
using (id = auth.uid())
with check (id = auth.uid());

drop policy if exists workspaces_select_member on public.workspaces;
create policy workspaces_select_member on public.workspaces
for select to authenticated
using (public.workspace_is_member(id) or public.is_admin(auth.uid()));

drop policy if exists workspaces_insert_owner on public.workspaces;
create policy workspaces_insert_owner on public.workspaces
for insert to authenticated
with check (owner_id = auth.uid() or public.is_admin(auth.uid()));

drop policy if exists workspaces_update_member on public.workspaces;
create policy workspaces_update_member on public.workspaces
for update to authenticated
using (public.workspace_is_member(id) or public.is_admin(auth.uid()))
with check (public.workspace_is_member(id) or public.is_admin(auth.uid()));

drop policy if exists workspaces_delete_owner on public.workspaces;
create policy workspaces_delete_owner on public.workspaces
for delete to authenticated
using (owner_id = auth.uid() or public.is_admin(auth.uid()));

drop policy if exists workspace_members_select_member on public.workspace_members;
create policy workspace_members_select_member on public.workspace_members
for select to authenticated
using (public.workspace_is_member(workspace_id) or public.is_admin(auth.uid()));

drop policy if exists workspace_members_insert_manager on public.workspace_members;
create policy workspace_members_insert_manager on public.workspace_members
for insert to authenticated
with check (
  exists (
    select 1
    from public.workspaces w
    where w.id = workspace_id
      and (w.owner_id = auth.uid() or public.is_admin(auth.uid()))
  )
);

drop policy if exists workspace_members_update_manager on public.workspace_members;
create policy workspace_members_update_manager on public.workspace_members
for update to authenticated
using (
  exists (
    select 1
    from public.workspaces w
    where w.id = workspace_id
      and (w.owner_id = auth.uid() or public.is_admin(auth.uid()))
  )
)
with check (
  exists (
    select 1
    from public.workspaces w
    where w.id = workspace_id
      and (w.owner_id = auth.uid() or public.is_admin(auth.uid()))
  )
);

drop policy if exists workspace_members_delete_manager on public.workspace_members;
create policy workspace_members_delete_manager on public.workspace_members
for delete to authenticated
using (
  exists (
    select 1
    from public.workspaces w
    where w.id = workspace_id
      and (w.owner_id = auth.uid() or public.is_admin(auth.uid()))
  )
);

drop policy if exists agents_member_all on public.agents;
create policy agents_member_all on public.agents
for all to authenticated
using (public.workspace_is_member(workspace_id) or public.is_admin(auth.uid()))
with check (public.workspace_is_member(workspace_id) or public.is_admin(auth.uid()));

drop policy if exists agent_instructions_member_all on public.agent_instructions;
create policy agent_instructions_member_all on public.agent_instructions
for all to authenticated
using (
  public.is_admin(auth.uid())
  or exists (
    select 1
    from public.agents a
    where a.id = agent_id
      and public.workspace_is_member(a.workspace_id)
  )
)
with check (
  public.is_admin(auth.uid())
  or exists (
    select 1
    from public.agents a
    where a.id = agent_id
      and public.workspace_is_member(a.workspace_id)
  )
);

do $$
declare
  t text;
begin
  foreach t in array array[
    'knowledge_sources',
    'knowledge_chunks',
    'products',
    'services',
    'conversations',
    'messages',
    'audio_assets',
    'subscriptions',
    'payments',
    'usage_records',
    'feedback',
    'human_support_requests',
    'integrations'
  ] loop
    execute format('drop policy if exists %I on public.%I', t || '_member_all', t);
    execute format(
      'create policy %I on public.%I for all to authenticated using (public.workspace_is_member(workspace_id)) with check (public.workspace_is_member(workspace_id))',
      t || '_member_all',
      t
    );
  end loop;
end $$;

drop policy if exists notifications_member_or_owner_all on public.notifications;
create policy notifications_member_or_owner_all on public.notifications
for all to authenticated
using (public.workspace_is_member(workspace_id) or user_id = auth.uid())
with check (public.workspace_is_member(workspace_id) or user_id = auth.uid());

drop policy if exists admin_roles_select_own on public.admin_roles;
create policy admin_roles_select_own on public.admin_roles
for select to authenticated
using (user_id = auth.uid());

drop policy if exists audit_logs_read on public.audit_logs;
create policy audit_logs_read on public.audit_logs
for select to authenticated
using (public.workspace_is_member(workspace_id) or public.is_admin(auth.uid()));

drop policy if exists audit_logs_insert on public.audit_logs;
create policy audit_logs_insert on public.audit_logs
for insert to authenticated
with check (
  actor_id = auth.uid()
  and (public.workspace_is_member(workspace_id) or public.is_admin(auth.uid()))
);

drop policy if exists system_settings_admin_all on public.system_settings;
create policy system_settings_admin_all on public.system_settings
for all to authenticated
using (public.is_admin(auth.uid()))
with check (public.is_admin(auth.uid()));

drop policy if exists webhook_events_admin_select on public.webhook_events;
create policy webhook_events_admin_select on public.webhook_events
for select to authenticated
using (public.is_admin(auth.uid()));

drop policy if exists webhook_events_admin_update on public.webhook_events;
create policy webhook_events_admin_update on public.webhook_events
for update to authenticated
using (public.is_admin(auth.uid()))
with check (public.is_admin(auth.uid()));

drop policy if exists webhook_events_admin_delete on public.webhook_events;
create policy webhook_events_admin_delete on public.webhook_events
for delete to authenticated
using (public.is_admin(auth.uid()));

drop policy if exists subscription_plans_public_active on public.subscription_plans;
create policy subscription_plans_public_active on public.subscription_plans
for select to anon, authenticated
using (is_active);
