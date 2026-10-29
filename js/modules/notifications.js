// Modulo Gestione Notifiche (Web Push + In-App + Supabase Realtime)
import { getSupabaseClient } from '../config.js';

export async function triggerLocalOSNotification(title, body, url = './app_dipendente.html') {
    if (typeof window === 'undefined' || !('Notification' in window)) return;
    if (Notification.permission !== 'granted') return;

    try {
        if ('serviceWorker' in navigator) {
            const reg = await navigator.serviceWorker.getRegistration();
            if (reg && reg.showNotification) {
                await reg.showNotification(title, {
                    body,
                    icon: './manifest-icon-192.maskable.png',
                    badge: './manifest-icon-192.maskable.png',
                    vibrate: [150, 75, 150],
                    data: { url }
                });
                return;
            }
        }
        new Notification(title, { body });
    } catch (e) {
        console.warn("Impossibile mostrare notifica di sistema:", e);
    }
}

export async function sendWebPushToSubscriptions(subscriptions, { title, body, url = './app_dipendente.html' }) {
    if (!subscriptions || subscriptions.length === 0) return { sent: 0 };
    const supabaseClient = getSupabaseClient();

    // Estrai oggetti subscription unici per endpoint
    const seenEndpoints = new Set();
    const validSubs = [];
    for (const row of subscriptions) {
        const sub = row.subscription || row;
        if (sub && sub.endpoint && !seenEndpoints.has(sub.endpoint)) {
            seenEndpoints.add(sub.endpoint);
            validSubs.push(sub);
        }
    }

    if (validSubs.length === 0) return { sent: 0 };

    // 1. Tentativo tramite Supabase Edge Function (funziona ovunque in Cloud)
    if (supabaseClient && supabaseClient.functions) {
        try {
            const { data, error } = await supabaseClient.functions.invoke('send-push', {
                body: { subscriptions: validSubs, title, body, url }
            });
            if (!error && data && data.success) {
                return data;
            }
        } catch (err) {
            console.warn("Fallback da Edge Function a /api/send-push:", err);
        }
    }

    // 2. Fallback tramite server Express locale (/api/send-push)
    let sent = 0;
    await Promise.allSettled(
        validSubs.map(async (subscription) => {
            const resp = await fetch('/api/send-push', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ subscription, title, body, url })
            });
            if (resp.ok) sent++;
        })
    );
    return { sent };
}

export async function notifyEmployees({
    aziendaId,
    destinatario = 'TUTTI',
    titolo,
    messaggio,
    tipo = 'info',
    url = './app_dipendente.html'
}) {
    const supabaseClient = getSupabaseClient();
    if (!supabaseClient || !aziendaId) return;

    try {
        // 1. Salva nella tabella notifiche (scatena anche Supabase Realtime e popola il centro notifiche in-app)
        await supabaseClient.from('notifiche').insert([{
            azienda_id: aziendaId,
            destinatario,
            titolo,
            messaggio,
            tipo,
            letto: false
        }]);

        // 2. Cerca le sottoscrizioni Web Push dei destinatari
        let query = supabaseClient
            .from('push_subscriptions')
            .select('subscription, nome_dipendente')
            .eq('azienda_id', String(aziendaId));

        if (destinatario !== 'TUTTI') {
            query = query.eq('nome_dipendente', destinatario);
        }

        const { data: subs } = await query;
        if (subs && subs.length > 0) {
            await sendWebPushToSubscriptions(subs, { title: titolo, body: messaggio, url });
        }
    } catch (err) {
        console.error("Errore invio notifica ai dipendenti:", err);
    }
}

export async function notifyAdminNewAbsence({
    aziendaId,
    nomeDipendente,
    dataInizio,
    dataFine,
    turno
}) {
    const supabaseClient = getSupabaseClient();
    if (!supabaseClient || !aziendaId) return;

    const inizioStr = new Date(dataInizio).toLocaleDateString('it-IT');
    const fineStr = new Date(dataFine).toLocaleDateString('it-IT');
    const periodo = dataInizio === dataFine ? `per il ${inizioStr}` : `dal ${inizioStr} al ${fineStr}`;

    try {
        await supabaseClient.from('notifiche').insert([{
            azienda_id: aziendaId,
            destinatario: 'ADMIN',
            titolo: `🏖️ Nuova richiesta da ${nomeDipendente}`,
            messaggio: `${nomeDipendente} ha richiesto assenza (${turno}) ${periodo}.`,
            tipo: 'nuova_richiesta',
            letto: false
        }]);
    } catch (err) {
        console.warn("Impossibile registrare notifica admin:", err);
    }
}

if (typeof window !== 'undefined') {
    window.TurniNotifications = {
        notifyEmployees,
        notifyAdminNewAbsence,
        triggerLocalOSNotification,
        sendWebPushToSubscriptions
    };
}
