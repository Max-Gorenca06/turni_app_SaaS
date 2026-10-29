import webpush from 'npm:web-push@3.6.7';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const publicVapidKey = Deno.env.get('VAPID_PUBLIC_KEY') || 'BLAvFrPhZKkFEPt_3FAdMcPFB8aCYoF1TiJ354yaVzVuxHOcq_g6IHECTONm4j4fOBiLX4pwKy1ObLjKAjcYQE4';
const privateVapidKey = Deno.env.get('VAPID_PRIVATE_KEY') || 'UX6bsEZv55Mtn4-EX8uMN-3SzLWwNM7R4OtF9Obj9_I';
const vapidSubject = Deno.env.get('VAPID_SUBJECT') || 'mailto:admin@turnicloud.pro';

webpush.setVapidDetails(vapidSubject, publicVapidKey, privateVapidKey);

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const bodyData = await req.json();
    const { subscription, subscriptions, title, body, url, tag } = bodyData || {};

    const targets = Array.isArray(subscriptions)
      ? subscriptions
      : subscription
      ? [subscription]
      : [];

    if (targets.length === 0) {
      return new Response(
        JSON.stringify({ error: 'Nessuna subscription fornita' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const payload = JSON.stringify({
      title: String(title || 'TurniCloud').slice(0, 120),
      body: String(body || 'Hai una nuova notifica').slice(0, 500),
      url: url || './app_dipendente.html',
      tag: tag || 'turnicloud-' + Date.now(),
    });

    const results = await Promise.allSettled(
      targets.map((sub) => webpush.sendNotification(sub, payload))
    );

    const sent = results.filter((r) => r.status === 'fulfilled').length;
    return new Response(
      JSON.stringify({ success: true, sent, total: targets.length }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : 'Errore invio push' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
