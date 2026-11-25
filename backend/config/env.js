import 'dotenv/config';

function bool(value, fallback = false) {
  if (value === undefined || value === '') return fallback;
  return ['true', '1', 'yes', 'on'].includes(String(value).toLowerCase());
}

function number(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const aiApiUrl = process.env.AI_API_URL || '';
const aiApiKey = process.env.AI_API_KEY || '';
const aiModel = process.env.AI_MODEL || '';
const safepaySecretKey = process.env.SAFEPAY_SECRET_KEY || '';
const safepayPublicKey = process.env.SAFEPAY_PUBLIC_KEY || '';
const safepayWebhookSecret = process.env.SAFEPAY_WEBHOOK_SECRET || '';
const safepaySandbox = bool(process.env.SAFEPAY_SANDBOX, true);
const safepayProductionEnabled = bool(process.env.SAFEPAY_PRODUCTION_ENABLED, false);
const placeholder = /^(your-|placeholder|changeme|xxx)/i;

function configured(value) {
  return Boolean(value) && !placeholder.test(value);
}

export const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: number(process.env.PORT, 3000),
  appUrl: process.env.APP_URL || 'http://localhost:3000',
  publicAppUrl: process.env.PUBLIC_APP_URL || process.env.APP_URL || 'http://localhost:3000',
  productName: process.env.PRODUCT_NAME || 'JOSA CHATS',
  supabaseUrl,
  supabaseAnonKey,
  supabaseServiceKey,
  aiProvider: process.env.AI_PROVIDER || 'openai-compatible',
  aiApiUrl,
  aiApiKey,
  aiModel,
  aiTimeoutMs: number(process.env.AI_TIMEOUT_MS, 30000),
  ttsApiUrl: process.env.TTS_API_URL || '',
  ttsApiKey: process.env.TTS_API_KEY || '',
  sttApiUrl: process.env.STT_API_URL || '',
  sttApiKey: process.env.STT_API_KEY || '',
  safepaySandbox,
  safepayProductionEnabled,
  safepaySecretKey,
  safepayPublicKey,
  safepayWebhookSecret,
  safepayIntent: process.env.SAFEPAY_INTENT || 'CYBERSOURCE',
  safepaySuccessUrl: process.env.SAFEPAY_SUCCESS_URL || `${process.env.APP_URL || 'http://localhost:3000'}/billing.html?payment=success`,
  safepayCancelUrl: process.env.SAFEPAY_CANCEL_URL || `${process.env.APP_URL || 'http://localhost:3000'}/billing.html?payment=cancelled`,
  maxUploadMb: number(process.env.MAX_UPLOAD_MB, 15),
  rateLimitWindowMs: number(process.env.RATE_LIMIT_WINDOW_MS, 60000),
  rateLimitMax: number(process.env.RATE_LIMIT_MAX, 120),
  logLevel: process.env.LOG_LEVEL || 'info',
  corsOrigins: String(process.env.CORS_ORIGINS || '').split(',').map((item) => item.trim()).filter(Boolean)
};

export const capabilities = {
  supabase: configured(supabaseUrl) && configured(supabaseAnonKey) && configured(supabaseServiceKey),
  ai: configured(aiApiUrl) && configured(aiApiKey) && configured(aiModel),
  safepay: configured(safepaySecretKey) && configured(safepayPublicKey) && configured(safepayWebhookSecret) && (safepaySandbox || safepayProductionEnabled),
  ttsProxy: configured(env.ttsApiUrl),
  sttProxy: configured(env.sttApiUrl)
};

export function publicConfig() {
  return {
    productName: env.productName,
    appUrl: env.publicAppUrl,
    auth: {
      supabaseUrl: configured(supabaseUrl) ? supabaseUrl : '',
      supabaseAnonKey: configured(supabaseAnonKey) ? supabaseAnonKey : ''
    },
    capabilities: {
      ai: capabilities.ai,
      safepaySandbox: capabilities.safepay ? safepaySandbox : null,
      serverTts: capabilities.ttsProxy,
      serverStt: capabilities.sttProxy
    },
    languages: [
      { code: 'en', label: 'English', voice: 'en' },
      { code: 'hi', label: 'Hindi', voice: 'hi' },
      { code: 'hinglish', label: 'Hinglish', voice: 'hi' },
      { code: 'ur', label: 'Urdu', voice: 'ur' }
    ]
  };
}
