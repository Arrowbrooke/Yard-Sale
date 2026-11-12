import { ApplicationServer, PushMessageError, Urgency } from 'jsr:@negrel/webpush@0.5.0';
import { createClient } from 'npm:@supabase/supabase-js@2';

type StopRecord = {
  id: string;
  title: string;
  address: string;
  categories: string[];
  message?: string;
  sale_id?: string;
  photo_paths?: string[];
};

type WebhookPayload = {
  type: string;
  table: string;
  schema: string;
  record?: StopRecord;
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'Content-Type': 'application/json' }
});

function decodeBase64Url(value: string) {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
  return Uint8Array.from(atob(padded), (character) => character.charCodeAt(0));
}

function encodeBase64Url(value: Uint8Array) {
  return btoa(String.fromCharCode(...value))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

async function importVapidKeys(publicKey: string, privateKey: string): Promise<CryptoKeyPair> {
  const rawPublicKey = decodeBase64Url(publicKey);
  if (rawPublicKey.length !== 65 || rawPublicKey[0] !== 4) {
    throw new Error('VAPID public key is not an uncompressed P-256 key');
  }
  const x = encodeBase64Url(rawPublicKey.slice(1, 33));
  const y = encodeBase64Url(rawPublicKey.slice(33, 65));
  const algorithm = { name: 'ECDSA', namedCurve: 'P-256' };
  const publicCryptoKey = await crypto.subtle.importKey(
    'jwk', { kty: 'EC', crv: 'P-256', x, y, ext: true }, algorithm, true, ['verify']
  );
  const privateCryptoKey = await crypto.subtle.importKey(
    'jwk', { kty: 'EC', crv: 'P-256', x, y, d: privateKey, ext: true }, algorithm, false, ['sign']
  );
  return { publicKey: publicCryptoKey, privateKey: privateCryptoKey };
}

Deno.serve(async (request) => {
 try {
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const webhookSecret = Deno.env.get('PUSH_WEBHOOK_SECRET');
  if (!webhookSecret || request.headers.get('x-webhook-secret') !== webhookSecret) {
    return json({ error: 'Unauthorized' }, 401);
  }

  const payload = await request.json() as WebhookPayload;
  const stop = payload.record;
  const isMapMessage = payload.table === 'map_messages';
  const isYardSale = payload.table === 'yard_sales';
  const isPhotoReview = payload.table === 'sale_photo_reviews';
  const isTest = payload.type === 'TEST';
  const appPath = payload.table === 'stops' ? 'Halloween-Map' : 'Yard-Sale';
  if ((!isTest && payload.type !== 'INSERT') || payload.schema !== 'public' || !['stops', 'yard_sales', 'map_messages', 'sale_photo_reviews'].includes(payload.table) || !stop?.id) {
    return json({ skipped: true });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  let projectSecretKeys: Record<string, string> = {};
  try {
    projectSecretKeys = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') || '{}');
  } catch {
    console.error('SUPABASE_SECRET_KEYS is not valid JSON');
  }
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || projectSecretKeys.default;
  const publicKey = Deno.env.get('VAPID_PUBLIC_KEY');
  const privateKey = Deno.env.get('VAPID_PRIVATE_KEY');
  const missingSecrets = [
    !supabaseUrl && 'SUPABASE_URL',
    !serviceKey && 'SUPABASE_SERVICE_KEY',
    !publicKey && 'VAPID_PUBLIC_KEY',
    !privateKey && 'VAPID_PRIVATE_KEY'
  ].filter(Boolean);
  if (missingSecrets.length) {
    console.error('Notification secrets missing:', missingSecrets.join(', '));
    return json({ error: 'Notification secrets are incomplete' }, 500);
  }

  let appServer: ApplicationServer;
  try {
    appServer = await ApplicationServer.new({
      contactInformation: 'https://arrowbrooke.github.io/Yard-Sale/',
      vapidKeys: await importVapidKeys(publicKey, privateKey)
    });
  } catch (keyError) {
    console.error('Web Push VAPID setup failed', keyError);
    return json({ error: 'Notification key setup failed' }, 500);
  }
  const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
  const { data: subscriptions, error } = await supabase
    .from('push_subscriptions')
    .select('endpoint,p256dh,auth');
  if (error) {
    console.error('Could not load notification subscriptions:', error.message);
    return json({ error: 'Could not load notification subscriptions' }, 500);
  }

  const categoryNames: Record<string, string> = {
    mens: "Men's Clothes", womens: "Women's Clothes", kids: "Kids' Clothes", toys: 'Toys', electronics: 'Electronics', household: 'Home Goods', furniture: 'Furniture', tools: 'Tools & Outdoors', books: 'Books & Games', other: 'Other',
    candy: 'Candy',
    nonfood: 'Candy & Goodies',
    adult: 'Adult treats'
  };
  const offerings = (stop.categories || []).map((category) => categoryNames[category] || category).join(' + ');
  const message = JSON.stringify({
    title: isTest ? 'Yard Sale alerts are working 🍂' : isPhotoReview ? 'Photos awaiting approval 📷' : isMapMessage ? 'Map message 💬' : isYardSale ? 'New yard sale 🍂' : 'New Halloween home 🎃',
    body: isTest ? 'New homes and photo reviews will send alerts. Open the Yard Sale Home Screen app to finish setup.' : isPhotoReview ? `${stop.address}\n${stop.photo_paths?.length || 0} photos to review` : isMapMessage ? String(stop.message || '').slice(0, 400) : `${stop.address}${offerings ? `\n${offerings}` : ''}`,
    tag: `${isPhotoReview ? 'photo-review' : isMapMessage ? 'map-message' : 'new-stop'}-${stop.id}`,
    url: isTest ? 'https://arrowbrooke.github.io/Yard-Sale/' : `https://arrowbrooke.github.io/${appPath}/?${isMapMessage ? 'message' : 'stop'}=${encodeURIComponent(isPhotoReview ? stop.sale_id || stop.id : stop.id)}${isPhotoReview ? '&review=1' : ''}`
  });

  let delivered = 0;
  const expired: string[] = [];
  await Promise.all((subscriptions || []).map(async (subscription) => {
    try {
      await appServer.subscribe({
        endpoint: subscription.endpoint,
        keys: { p256dh: subscription.p256dh, auth: subscription.auth }
      }).pushTextMessage(message, { ttl: 86400, urgency: Urgency.High });
      delivered += 1;
    } catch (pushError) {
      const statusCode = pushError instanceof PushMessageError ? pushError.response.status : 0;
      if (statusCode === 404 || statusCode === 410) expired.push(subscription.endpoint);
      else console.error('Web Push delivery failed', statusCode, String(pushError));
    }
  }));

  if (expired.length) {
    await supabase.from('push_subscriptions').delete().in('endpoint', expired);
  }
  console.info('Web Push result:', JSON.stringify({ delivered, expired: expired.length, subscriptions: subscriptions?.length || 0 }));
  return json({ delivered, expired: expired.length });
 } catch (unhandledError) {
   console.error('Unhandled notification error:', unhandledError instanceof Error ? unhandledError.stack || unhandledError.message : String(unhandledError));
   return json({ error: 'Notification delivery failed' }, 500);
 }
});
