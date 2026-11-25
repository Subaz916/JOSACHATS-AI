import test from 'node:test';
import assert from 'node:assert/strict';
import { detectLanguage, chunkText, tokenize, voiceLanguage } from '../backend/utils/text.js';
import { slugify, uniqueSlug } from '../backend/utils/id.js';

test('detectLanguage recognizes Urdu, Hindi, Hinglish, English', () => {
  assert.equal(detectLanguage('آپ کیسے ہیں'), 'ur');
  assert.equal(detectLanguage('आप कैसे हैं'), 'hi');
  assert.equal(detectLanguage('aap kya kar rahe hain'), 'hinglish');
  assert.equal(detectLanguage('What are your opening hours?'), 'en');
});

test('chunkText creates usable chunks', () => {
  const text = 'First point. '.repeat(300);
  const chunks = chunkText(text, 300, 40);
  assert.ok(chunks.length > 1);
  assert.ok(chunks.every((chunk) => chunk.length <= 320));
});

test('tokenize strips punctuation', () => {
  assert.deepEqual(tokenize('PKR 450, please!'), ['pkr', '450', 'please']);
});

test('voiceLanguage maps supported languages', () => {
  assert.equal(voiceLanguage('ur'), 'ur-PK');
  assert.equal(voiceLanguage('hinglish'), 'hi-IN');
  assert.equal(voiceLanguage('en'), 'en-US');
});

test('slugify and uniqueSlug produce safe slugs', () => {
  assert.equal(slugify('Shahryar Ice Cream!'), 'shahryar-ice-cream');
  assert.match(uniqueSlug('Shahryar Ice Cream!'), /^shahryar-ice-cream-[0-9a-f]{8}$/);
});
