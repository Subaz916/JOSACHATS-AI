create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text,
  avatar_url text,
  email text,
  status text not null default 'active' check (status in ('active', 'suspended')),
  is_admin boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references public.profiles (id) on delete set null,
  name text not null,
  slug text not null unique,
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.workspace_members (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'admin', 'member')),
  created_at timestamptz not null default now(),
  unique (workspace_id, user_id)
);

create table public.agents (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  slug text not null unique,
  name text not null,
  business_name text,
  business_category text,
  business_description text,
  business_email text,
  business_phone text,
  business_address text,
  website_url text,
  logo_url text,
  status text not null default 'draft' check (status in ('draft', 'active', 'inactive')),
  public_url text,
  instructions jsonb not null default '{}'::jsonb,
  languages text[] not null default '{}'::text[],
  voice jsonb not null default '{}'::jsonb,
  branding jsonb not null default '{}'::jsonb,
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.agent_instructions (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null unique references public.agents (id) on delete cascade,
  personality text,
  style text,
  response_length text check (response_length in ('short', 'medium', 'long')),
  rules text[] not null default '{}'::text[],
  policies text[] not null default '{}'::text[],
  topics_allow text[] not null default '{}'::text[],
  topics_avoid text[] not null default '{}'::text[],
  escalation text,
  examples jsonb not null default '[]'::jsonb,
  custom_instructions text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.knowledge_sources (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  agent_id uuid references public.agents (id) on delete set null,
  type text not null,
  title text not null,
  content text,
  file_path text,
  url text,
  status text not null default 'pending' check (status in ('pending', 'ready', 'failed')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.knowledge_chunks (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references public.knowledge_sources (id) on delete cascade,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  agent_id uuid references public.agents (id) on delete set null,
  content text not null,
  chunk_index integer not null check (chunk_index >= 0),
  token_count integer check (token_count >= 0),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (source_id, chunk_index)
);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  agent_id uuid references public.agents (id) on delete set null,
  name text not null,
  description text,
  price_pkr numeric(12, 2) check (price_pkr >= 0),
  category text,
  available boolean not null default true,
  variations text,
  image_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.services (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  agent_id uuid references public.agents (id) on delete set null,
  name text not null,
  description text,
  price_pkr numeric(12, 2) check (price_pkr >= 0),
  category text,
  available boolean not null default true,
  image_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  agent_id uuid not null references public.agents (id) on delete cascade,
  public_token text not null unique default replace(gen_random_uuid()::text, '-', ''),
  customer_identifier text,
  language text not null default 'en',
  channel text not null default 'text' check (channel in ('voice', 'text', 'mixed')),
  status text not null default 'open' check (status in ('open', 'pending', 'resolved', 'archived')),
  assigned_to uuid references public.profiles (id) on delete set null,
  retention_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  role text not null check (role in ('user', 'assistant', 'system')),
  content text,
  language text,
  audio_path text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.audio_assets (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  conversation_id uuid references public.conversations (id) on delete cascade,
  message_id uuid references public.messages (id) on delete cascade,
  storage_path text not null,
  mime_type text,
  duration_seconds numeric(10, 2) check (duration_seconds >= 0),
  retention_until timestamptz,
  created_at timestamptz not null default now()
);

create table public.subscription_plans (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  price_pkr numeric(12, 2) not null check (price_pkr >= 0),
  agent_limit integer not null check (agent_limit >= 0),
  conversation_limit integer not null check (conversation_limit >= 0),
  features jsonb not null default '[]'::jsonb,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  plan_id uuid not null references public.subscription_plans (id),
  status text not null default 'trialing' check (status in ('active', 'trialing', 'past_due', 'canceled', 'expired')),
  provider text not null default 'safepay',
  provider_subscription_id text,
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  subscription_id uuid references public.subscriptions (id) on delete set null,
  plan_id uuid references public.subscription_plans (id) on delete set null,
  provider text not null default 'safepay',
  tracker text not null unique,
  event_token text not null unique,
  amount_pkr numeric(12, 2) check (amount_pkr >= 0),
  amount_minor integer check (amount_minor >= 0),
  currency text not null default 'PKR',
  status text not null default 'pending' check (status in ('pending', 'succeeded', 'failed', 'canceled', 'expired', 'refunded')),
  checkout_url text,
  metadata jsonb not null default '{}'::jsonb,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.usage_records (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  agent_id uuid references public.agents (id) on delete set null,
  conversation_id uuid references public.conversations (id) on delete set null,
  kind text not null check (kind in ('conversation', 'voice', 'text')),
  count integer not null default 1 check (count >= 0),
  period_start timestamptz not null default date_trunc('month', now()),
  period_end timestamptz,
  created_at timestamptz not null default now()
);

create table public.feedback (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  rating integer not null check (rating between 1 and 5),
  comment text,
  created_at timestamptz not null default now()
);

create table public.human_support_requests (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  status text not null default 'open' check (status in ('open', 'assigned', 'resolved', 'returned')),
  assigned_to uuid references public.profiles (id) on delete set null,
  reason text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.integrations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  agent_id uuid references public.agents (id) on delete set null,
  type text not null,
  config jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  user_id uuid references public.profiles (id) on delete set null,
  type text not null,
  title text not null,
  body text,
  is_read boolean not null default false,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.admin_roles (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  role text not null check (role in ('admin', 'super_admin')),
  granted_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.workspaces (id) on delete cascade,
  actor_id uuid references public.profiles (id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  ip inet,
  created_at timestamptz not null default now()
);

create table public.system_settings (
  key text primary key,
  value jsonb not null,
  updated_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now()
);

create table public.webhook_events (
  event_token text primary key,
  type text not null,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'received' check (status in ('received', 'processed', 'failed', 'duplicate')),
  error text,
  received_at timestamptz not null default now(),
  processed_at timestamptz
);

create index profiles_email_idx on public.profiles (email);
create index profiles_status_idx on public.profiles (status);
create index workspaces_owner_idx on public.workspaces (owner_id);
create index workspaces_created_idx on public.workspaces (created_at);
create index workspace_members_user_idx on public.workspace_members (user_id);
create index workspace_members_role_idx on public.workspace_members (role);
create index agents_workspace_idx on public.agents (workspace_id);
create index agents_workspace_status_idx on public.agents (workspace_id, status);
create index agents_status_idx on public.agents (status);
create index agents_created_idx on public.agents (created_at);
create index knowledge_sources_workspace_idx on public.knowledge_sources (workspace_id);
create index knowledge_sources_agent_idx on public.knowledge_sources (agent_id);
create index knowledge_sources_status_idx on public.knowledge_sources (status);
create index knowledge_sources_created_idx on public.knowledge_sources (created_at);
create index knowledge_chunks_workspace_idx on public.knowledge_chunks (workspace_id);
create index knowledge_chunks_agent_idx on public.knowledge_chunks (agent_id);
create index knowledge_chunks_source_idx on public.knowledge_chunks (source_id);
create index knowledge_chunks_created_idx on public.knowledge_chunks (created_at);
create index products_workspace_idx on public.products (workspace_id);
create index products_agent_idx on public.products (agent_id);
create index products_category_idx on public.products (category);
create index products_available_idx on public.products (available);
create index products_created_idx on public.products (created_at);
create index services_workspace_idx on public.services (workspace_id);
create index services_agent_idx on public.services (agent_id);
create index services_category_idx on public.services (category);
create index services_available_idx on public.services (available);
create index services_created_idx on public.services (created_at);
create index conversations_workspace_idx on public.conversations (workspace_id);
create index conversations_agent_idx on public.conversations (agent_id);
create index conversations_status_idx on public.conversations (status);
create index conversations_assigned_idx on public.conversations (assigned_to);
create index conversations_created_idx on public.conversations (created_at);
create index conversations_retention_idx on public.conversations (retention_until);
create index messages_conversation_idx on public.messages (conversation_id);
create index messages_workspace_idx on public.messages (workspace_id);
create index messages_role_idx on public.messages (role);
create index messages_created_idx on public.messages (created_at);
create index audio_assets_workspace_idx on public.audio_assets (workspace_id);
create index audio_assets_conversation_idx on public.audio_assets (conversation_id);
create index audio_assets_message_idx on public.audio_assets (message_id);
create index audio_assets_retention_idx on public.audio_assets (retention_until);
create index subscriptions_workspace_idx on public.subscriptions (workspace_id);
create index subscriptions_plan_idx on public.subscriptions (plan_id);
create index subscriptions_status_idx on public.subscriptions (status);
create index subscriptions_period_end_idx on public.subscriptions (current_period_end);
create index subscriptions_provider_ref_idx on public.subscriptions (provider_subscription_id);
create index payments_workspace_idx on public.payments (workspace_id);
create index payments_subscription_idx on public.payments (subscription_id);
create index payments_plan_idx on public.payments (plan_id);
create index payments_status_idx on public.payments (status);
create index payments_created_idx on public.payments (created_at);
create index payments_paid_idx on public.payments (paid_at);
create index usage_records_workspace_idx on public.usage_records (workspace_id);
create index usage_records_agent_idx on public.usage_records (agent_id);
create index usage_records_conversation_idx on public.usage_records (conversation_id);
create index usage_records_kind_idx on public.usage_records (kind);
create index usage_records_period_idx on public.usage_records (period_start);
create index usage_records_created_idx on public.usage_records (created_at);
create index feedback_conversation_idx on public.feedback (conversation_id);
create index feedback_workspace_idx on public.feedback (workspace_id);
create index feedback_created_idx on public.feedback (created_at);
create index human_support_workspace_idx on public.human_support_requests (workspace_id);
create index human_support_conversation_idx on public.human_support_requests (conversation_id);
create index human_support_status_idx on public.human_support_requests (status);
create index human_support_assigned_idx on public.human_support_requests (assigned_to);
create index human_support_created_idx on public.human_support_requests (created_at);
create index integrations_workspace_idx on public.integrations (workspace_id);
create index integrations_agent_idx on public.integrations (agent_id);
create index integrations_type_idx on public.integrations (type);
create index integrations_active_idx on public.integrations (is_active);
create index notifications_workspace_idx on public.notifications (workspace_id);
create index notifications_user_idx on public.notifications (user_id);
create index notifications_read_idx on public.notifications (is_read);
create index notifications_created_idx on public.notifications (created_at);
create index admin_roles_role_idx on public.admin_roles (role);
create index audit_logs_workspace_idx on public.audit_logs (workspace_id);
create index audit_logs_actor_idx on public.audit_logs (actor_id);
create index audit_logs_action_idx on public.audit_logs (action);
create index audit_logs_entity_idx on public.audit_logs (entity_type, entity_id);
create index audit_logs_created_idx on public.audit_logs (created_at);
create index webhook_events_type_idx on public.webhook_events (type);
create index webhook_events_status_idx on public.webhook_events (status);
create index webhook_events_received_idx on public.webhook_events (received_at);
create index webhook_events_processed_idx on public.webhook_events (processed_at);
