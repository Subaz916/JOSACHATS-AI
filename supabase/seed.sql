insert into public.subscription_plans (code, name, price_pkr, agent_limit, conversation_limit, features, is_active, sort_order)
values
  ('free', 'Free', 0, 1, 50, '["1 AI agent","50 conversations per month","Basic knowledge base","Community support"]'::jsonb, true, 1),
  ('starter', 'Starter', 1499, 2, 500, '["2 AI agents","500 conversations per month","Knowledge base","Email support","Basic analytics"]'::jsonb, true, 2),
  ('professional', 'Professional', 3999, 5, 2500, '["5 AI agents","2500 conversations per month","Advanced knowledge base","Priority support","Custom branding","Analytics"]'::jsonb, true, 3),
  ('business', 'Business', 8999, 15, 10000, '["15 AI agents","10000 conversations per month","Advanced knowledge base","Dedicated support","Custom branding","Advanced analytics","Team management"]'::jsonb, true, 4)
on conflict (code) do update set
  name = excluded.name,
  price_pkr = excluded.price_pkr,
  agent_limit = excluded.agent_limit,
  conversation_limit = excluded.conversation_limit,
  features = excluded.features,
  is_active = excluded.is_active,
  sort_order = excluded.sort_order,
  updated_at = now();

insert into public.workspaces (id, owner_id, name, slug, settings)
values (
  '11111111-1111-4111-8111-111111111111'::uuid,
  null,
  'JOSA CHATS Demo',
  'demo-workspace',
  '{"demo":true,"currency":"PKR","timezone":"Asia/Karachi"}'::jsonb
)
on conflict (id) do update set
  owner_id = excluded.owner_id,
  name = excluded.name,
  slug = excluded.slug,
  settings = excluded.settings,
  updated_at = now();

insert into public.agents (
  id,
  workspace_id,
  slug,
  name,
  business_name,
  business_category,
  business_description,
  business_email,
  business_phone,
  business_address,
  website_url,
  logo_url,
  status,
  public_url,
  instructions,
  languages,
  voice,
  branding,
  settings
)
values (
  '22222222-2222-4222-8222-222222222222'::uuid,
  '11111111-1111-4111-8111-111111111111'::uuid,
  'shahryar-demo',
  'Shahryar Ice Cream Bar Assistant',
  'Shahryar Ice Cream Bar',
  'Ice Cream Parlor',
  'Shahryar Ice Cream Bar serves mango, pistachio, chocolate, vanilla, and strawberry ice cream. Single scoop costs PKR 180 and three scoops cost PKR 450. Located at Main Bazaar, Shahryar Ice Cream Bar, Lahore. Opening hours are 12:00 PM to 11:00 PM daily. Home delivery is available within 5 km with a delivery fee of PKR 100. Phone: +92 300 1234567.',
  null,
  '+92 300 1234567',
  'Main Bazaar, Shahryar Ice Cream Bar, Lahore',
  null,
  null,
  'active',
  '/chat/shahryar-demo',
  '{"persona":"Friendly Shahryar Ice Cream Bar assistant","answerRules":["Use documented facts only","Answer in the customer language when possible"],"currency":"PKR"}'::jsonb,
  array['en', 'hi', 'hinglish', 'ur']::text[],
  '{"provider":"default","defaultLanguage":"en","supportedLanguages":["en","hi","hinglish","ur"]}'::jsonb,
  '{"theme":"ice-cream","primaryColor":"#F59E0B","secondaryColor":"#7C2D12","businessName":"Shahryar Ice Cream Bar"}'::jsonb,
  '{"currency":"PKR","timezone":"Asia/Karachi","voiceEnabled":true,"fallbackLanguage":"en"}'::jsonb
)
on conflict (id) do update set
  workspace_id = excluded.workspace_id,
  slug = excluded.slug,
  name = excluded.name,
  business_name = excluded.business_name,
  business_category = excluded.business_category,
  business_description = excluded.business_description,
  business_email = excluded.business_email,
  business_phone = excluded.business_phone,
  business_address = excluded.business_address,
  website_url = excluded.website_url,
  logo_url = excluded.logo_url,
  status = excluded.status,
  public_url = excluded.public_url,
  instructions = excluded.instructions,
  languages = excluded.languages,
  voice = excluded.voice,
  branding = excluded.branding,
  settings = excluded.settings,
  updated_at = now();

insert into public.agent_instructions (
  id,
  agent_id,
  personality,
  style,
  response_length,
  rules,
  policies,
  topics_allow,
  topics_avoid,
  escalation,
  examples,
  custom_instructions
)
values (
  '33333333-3333-4333-8333-333333333333'::uuid,
  '22222222-2222-4222-8222-222222222222'::uuid,
  'Friendly, concise, and helpful',
  'Warm and conversational',
  'short',
  array[
    'Flavors: mango, pistachio, chocolate, vanilla, and strawberry.',
    'Single scoop costs PKR 180.',
    'Three scoops cost PKR 450.',
    'Location: Main Bazaar, Shahryar Ice Cream Bar, Lahore.',
    'Opening hours: 12:00 PM to 11:00 PM daily.',
    'Home delivery is available within 5 km. Delivery fee is PKR 100.',
    'Phone: +92 300 1234567.'
  ]::text[],
  array[
    'Use only documented Shahryar Ice Cream Bar facts for flavors, prices, hours, location, delivery, and phone.',
    'If a fact is unknown, say you do not know and offer to connect the customer with a human.'
  ]::text[],
  array['flavors', 'prices', 'location', 'opening hours', 'home delivery', 'phone']::text[],
  array['invented prices', 'unverified offers', 'medical or legal advice']::text[],
  'Transfer to a human when the customer asks for an unsupported fact or has a complaint.',
  '[
    {"user":"What flavors do you have?","assistant":"We have mango, pistachio, chocolate, vanilla, and strawberry."},
    {"user":"How much are three scoops?","assistant":"Three scoops cost PKR 450."},
    {"user":"Where are you located?","assistant":"We are at Main Bazaar, Shahryar Ice Cream Bar, Lahore."},
    {"user":"What time are you open?","assistant":"We are open from 12:00 PM to 11:00 PM daily."},
    {"user":"Do you deliver?","assistant":"Yes. Home delivery is available within 5 km, with a delivery fee of PKR 100."},
    {"user":"What is your phone number?","assistant":"Our phone number is +92 300 1234567."}
  ]'::jsonb,
  'Answer in the customer language when possible. Keep PKR amounts exact.'
)
on conflict (id) do update set
  agent_id = excluded.agent_id,
  personality = excluded.personality,
  style = excluded.style,
  response_length = excluded.response_length,
  rules = excluded.rules,
  policies = excluded.policies,
  topics_allow = excluded.topics_allow,
  topics_avoid = excluded.topics_avoid,
  escalation = excluded.escalation,
  examples = excluded.examples,
  custom_instructions = excluded.custom_instructions,
  updated_at = now();

insert into public.knowledge_sources (
  id,
  workspace_id,
  agent_id,
  type,
  title,
  content,
  file_path,
  url,
  status,
  metadata
)
values (
  '44444444-4444-4444-8444-444444444444'::uuid,
  '11111111-1111-4111-8111-111111111111'::uuid,
  '22222222-2222-4222-8222-222222222222'::uuid,
  'manual',
  'Shahryar Ice Cream Bar Facts',
  'Flavors: mango, pistachio, chocolate, vanilla, strawberry. Single scoop: PKR 180. Three scoops: PKR 450. Location: Main Bazaar, Shahryar Ice Cream Bar, Lahore. Opening hours: 12:00 PM to 11:00 PM daily. Home delivery: available within 5 km, delivery fee PKR 100. Phone: +92 300 1234567.',
  null,
  null,
  'ready',
  '{"origin":"documented-demo-facts","language":"en"}'::jsonb
)
on conflict (id) do update set
  workspace_id = excluded.workspace_id,
  agent_id = excluded.agent_id,
  type = excluded.type,
  title = excluded.title,
  content = excluded.content,
  file_path = excluded.file_path,
  url = excluded.url,
  status = excluded.status,
  metadata = excluded.metadata,
  updated_at = now();

insert into public.knowledge_chunks (id, source_id, workspace_id, agent_id, content, chunk_index, token_count, metadata)
values
  ('44444444-4444-4444-8444-444444444401'::uuid, '44444444-4444-4444-8444-444444444444'::uuid, '11111111-1111-4111-8111-111111111111'::uuid, '22222222-2222-4222-8222-222222222222'::uuid, 'Available flavors: mango, pistachio, chocolate, vanilla, strawberry.', 0, 12, '{"topic":"flavors"}'::jsonb),
  ('44444444-4444-4444-8444-444444444402'::uuid, '44444444-4444-4444-8444-444444444444'::uuid, '11111111-1111-4111-8111-111111111111'::uuid, '22222222-2222-4222-8222-222222222222'::uuid, 'Single scoop price: PKR 180.', 1, 6, '{"topic":"price"}'::jsonb),
  ('44444444-4444-4444-8444-444444444403'::uuid, '44444444-4444-4444-8444-444444444444'::uuid, '11111111-1111-4111-8111-111111111111'::uuid, '22222222-2222-4222-8222-222222222222'::uuid, 'Three scoops price: PKR 450.', 2, 6, '{"topic":"price"}'::jsonb),
  ('44444444-4444-4444-8444-444444444404'::uuid, '44444444-4444-4444-8444-444444444444'::uuid, '11111111-1111-4111-8111-111111111111'::uuid, '22222222-2222-4222-8222-222222222222'::uuid, 'Location: Main Bazaar, Shahryar Ice Cream Bar, Lahore.', 3, 10, '{"topic":"location"}'::jsonb),
  ('44444444-4444-4444-8444-444444444405'::uuid, '44444444-4444-4444-8444-444444444444'::uuid, '11111111-1111-4111-8111-111111111111'::uuid, '22222222-2222-4222-8222-222222222222'::uuid, 'Opening hours: 12:00 PM to 11:00 PM daily.', 4, 9, '{"topic":"hours"}'::jsonb),
  ('44444444-4444-4444-8444-444444444406'::uuid, '44444444-4444-4444-8444-444444444444'::uuid, '11111111-1111-4111-8111-111111111111'::uuid, '22222222-2222-4222-8222-222222222222'::uuid, 'Home delivery: available within 5 km, delivery fee PKR 100.', 5, 12, '{"topic":"delivery"}'::jsonb),
  ('44444444-4444-4444-8444-444444444407'::uuid, '44444444-4444-4444-8444-444444444444'::uuid, '11111111-1111-4111-8111-111111111111'::uuid, '22222222-2222-4222-8222-222222222222'::uuid, 'Phone: +92 300 1234567.', 6, 5, '{"topic":"phone"}'::jsonb)
on conflict (id) do update set
  source_id = excluded.source_id,
  workspace_id = excluded.workspace_id,
  agent_id = excluded.agent_id,
  content = excluded.content,
  chunk_index = excluded.chunk_index,
  token_count = excluded.token_count,
  metadata = excluded.metadata;

insert into public.products (id, workspace_id, agent_id, name, description, price_pkr, category, available, variations, image_url)
values
  ('55555555-5555-4555-8555-555555555501'::uuid, '11111111-1111-4111-8111-111111111111'::uuid, '22222222-2222-4222-8222-222222222222'::uuid, 'Mango Scoop', 'Mango ice cream scoop.', 180, 'Ice Cream Flavor', true, 'Single scoop', null),
  ('55555555-5555-4555-8555-555555555502'::uuid, '11111111-1111-4111-8111-111111111111'::uuid, '22222222-2222-4222-8222-222222222222'::uuid, 'Pistachio Scoop', 'Pistachio ice cream scoop.', 180, 'Ice Cream Flavor', true, 'Single scoop', null),
  ('55555555-5555-4555-8555-555555555503'::uuid, '11111111-1111-4111-8111-111111111111'::uuid, '22222222-2222-4222-8222-222222222222'::uuid, 'Chocolate Scoop', 'Chocolate ice cream scoop.', 180, 'Ice Cream Flavor', true, 'Single scoop', null),
  ('55555555-5555-4555-8555-555555555504'::uuid, '11111111-1111-4111-8111-111111111111'::uuid, '22222222-2222-4222-8222-222222222222'::uuid, 'Vanilla Scoop', 'Vanilla ice cream scoop.', 180, 'Ice Cream Flavor', true, 'Single scoop', null),
  ('55555555-5555-4555-8555-555555555505'::uuid, '11111111-1111-4111-8111-111111111111'::uuid, '22222222-2222-4222-8222-222222222222'::uuid, 'Strawberry Scoop', 'Strawberry ice cream scoop.', 180, 'Ice Cream Flavor', true, 'Single scoop', null)
on conflict (id) do update set
  workspace_id = excluded.workspace_id,
  agent_id = excluded.agent_id,
  name = excluded.name,
  description = excluded.description,
  price_pkr = excluded.price_pkr,
  category = excluded.category,
  available = excluded.available,
  variations = excluded.variations,
  image_url = excluded.image_url,
  updated_at = now();

insert into public.services (id, workspace_id, agent_id, name, description, price_pkr, category, available, image_url)
values
  ('66666666-6666-4666-8666-666666666601'::uuid, '11111111-1111-4111-8111-111111111111'::uuid, '22222222-2222-4222-8222-222222222222'::uuid, 'Three Scoops', 'Three scoops of ice cream for PKR 450.', 450, 'Combo', true, null),
  ('66666666-6666-4666-8666-666666666602'::uuid, '11111111-1111-4111-8111-111111111111'::uuid, '22222222-2222-4222-8222-222222222222'::uuid, 'Home Delivery', 'Home delivery available within 5 km. Delivery fee PKR 100.', 100, 'Delivery', true, null),
  ('66666666-6666-4666-8666-666666666603'::uuid, '11111111-1111-4111-8111-111111111111'::uuid, '22222222-2222-4222-8222-222222222222'::uuid, 'Dine In', 'Open daily from 12:00 PM to 11:00 PM at Main Bazaar, Shahryar Ice Cream Bar, Lahore.', null, 'Dining', true, null)
on conflict (id) do update set
  workspace_id = excluded.workspace_id,
  agent_id = excluded.agent_id,
  name = excluded.name,
  description = excluded.description,
  price_pkr = excluded.price_pkr,
  category = excluded.category,
  available = excluded.available,
  image_url = excluded.image_url,
  updated_at = now();

insert into public.system_settings (key, value)
values
  ('safepay.mode', '"sandbox"'::jsonb),
  ('safepay.production_enabled', 'false'::jsonb),
  ('maintenance_mode', 'false'::jsonb),
  ('retention_days', '90'::jsonb)
on conflict (key) do update set
  value = excluded.value,
  updated_at = now();
