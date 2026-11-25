import { z } from 'zod';

const optionalText = (max = 5000) => z.string().trim().max(max).optional().nullable();
const uuid = z.string().uuid();

export const agentSchema = z.object({
  name: z.string().trim().min(2).max(120),
  businessName: z.string().trim().min(2).max(160),
  businessCategory: z.string().trim().min(2).max(120),
  businessDescription: z.string().trim().min(10).max(8000),
  businessEmail: z.string().trim().email().max(200),
  businessPhone: optionalText(60),
  businessAddress: optionalText(300),
  websiteUrl: z.string().trim().url().max(500).optional().nullable().or(z.literal('')),
  instructions: z.object({
    personality: optionalText(2000),
    style: optionalText(2000),
    responseLength: z.enum(['short', 'medium', 'detailed']).default('medium'),
    rules: optionalText(12000),
    policies: optionalText(12000),
    topicsAllow: optionalText(12000),
    topicsAvoid: optionalText(12000),
    escalation: optionalText(12000),
    examples: optionalText(12000),
    custom: optionalText(12000)
  }).default({}),
  languages: z.array(z.enum(['en', 'hi', 'hinglish', 'ur'])).min(1).default(['en']),
  voice: z.object({
    provider: z.enum(['browser', 'proxy']).default('browser'),
    style: optionalText(80),
    speed: z.coerce.number().min(0.5).max(2).default(1),
    responseMode: z.enum(['voice-first', 'text-first', 'balanced']).default('balanced'),
    voiceName: optionalText(120)
  }).default({}),
  branding: z.object({
    displayName: optionalText(120),
    primaryColor: z.string().trim().regex(/^#[0-9a-fA-F]{6}$/).default('#6d5efc'),
    secondaryColor: z.string().trim().regex(/^#[0-9a-fA-F]{6}$/).default('#18b6a4'),
    welcomeMessage: optionalText(1000),
    chatBackground: z.string().trim().max(500).optional().nullable(),
    agentAvatarUrl: optionalText(500),
    theme: z.enum(['light', 'dark', 'auto']).default('light')
  }).default({}),
  settings: z.object({
    voiceInput: z.boolean().default(true),
    voiceOutput: z.boolean().default(true),
    textInput: z.boolean().default(true),
    textResponses: z.boolean().default(true),
    maxResponseLength: z.coerce.number().int().min(100).max(6000).default(1200),
    conversationLimit: z.coerce.number().int().min(1).max(500).default(50),
    humanSupport: z.boolean().default(false),
    openingHours: optionalText(1000),
    feedback: z.boolean().default(true)
  }).default({}),
  knowledge: z.object({
    manualText: optionalText(50000),
    faqs: z.array(z.object({ question: z.string().trim().min(2).max(500), answer: z.string().trim().min(2).max(4000) })).max(500).default([]),
    urls: z.array(z.string().trim().url().max(500)).max(20).default([]),
    productText: optionalText(30000),
    serviceText: optionalText(30000),
    pricingText: optionalText(30000),
    termsText: optionalText(30000)
  }).default({}),
  logoFile: z.any().optional(),
  knowledgeFiles: z.array(z.any()).max(10).default([]),
  publish: z.boolean().default(false)
});

export const agentPatchSchema = agentSchema.partial();

export const knowledgeSchema = z.object({
  title: z.string().trim().min(2).max(200),
  type: z.enum(['manual', 'faq', 'pdf', 'docx', 'txt', 'url', 'product', 'service', 'pricing', 'terms']),
  content: optionalText(100000),
  url: z.string().trim().url().max(500).optional().nullable()
});

export const messageSchema = z.object({
  content: z.string().trim().min(1).max(8000),
  language: z.enum(['en', 'hi', 'hinglish', 'ur']).optional(),
  clientMessageId: z.string().trim().max(120).optional()
});

export const feedbackSchema = z.object({
  rating: z.coerce.number().int().min(1).max(5),
  comment: optionalText(3000)
});

export const productSchema = z.object({
  name: z.string().trim().min(2).max(200),
  description: optionalText(8000),
  pricePkr: z.coerce.number().min(0).max(100000000).optional().nullable(),
  category: optionalText(120),
  available: z.boolean().default(true),
  variations: optionalText(4000),
  imageUrl: optionalText(500)
});

export const serviceSchema = z.object({
  name: z.string().trim().min(2).max(200),
  description: optionalText(8000),
  pricePkr: z.coerce.number().min(0).max(100000000).optional().nullable(),
  category: optionalText(120),
  available: z.boolean().default(true),
  imageUrl: optionalText(500)
});

export const checkoutSchema = z.object({
  planCode: z.enum(['starter', 'professional', 'business'])
});

export const planSchema = z.object({
  code: z.string().trim().min(2).max(40).regex(/^[a-z0-9-]+$/),
  name: z.string().trim().min(2).max(120),
  pricePkr: z.coerce.number().int().min(0).max(100000000),
  agentLimit: z.coerce.number().int().min(1).max(1000),
  conversationLimit: z.coerce.number().int().min(1).max(10000000),
  features: z.array(z.string().trim().max(200)).max(50).default([]),
  isActive: z.boolean().default(true),
  sortOrder: z.coerce.number().int().min(0).max(100).default(0)
});

export const settingsSchema = z.object({
  productName: z.string().trim().min(2).max(120).optional(),
  maintenanceMode: z.boolean().optional(),
  retentionDays: z.coerce.number().int().min(1).max(3650).optional()
});

export const handoffSchema = z.object({
  reason: optionalText(1000)
});

export const adminUserSchema = z.object({
  status: z.enum(['active', 'suspended'])
});

export const uuidParam = z.object({ id: uuid });
