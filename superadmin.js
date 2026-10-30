// Usa la configurazione centralizzata da js/config.js (con fallback)
const SUPABASE_URL = (window.SUPABASE_CONFIG && window.SUPABASE_CONFIG.URL) || 'https://api.158.180.239.147.sslip.io';
const SUPABASE_ANON_KEY = (window.SUPABASE_CONFIG && window.SUPABASE_CONFIG.ANON_KEY) || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNzkxNDQ4MTcwLCJleHAiOjIxMDY4MDgxNzB9.v6w9RwQBBKxdC0-sN08whXB0NjRbWgy_tCzuX_piuWk';

const supabaseClient = (window.getSupabaseClient && window.getSupabaseClient()) || supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let currentEmailContext = { nomeAzienda: 'la tua attività', scadenza: '' };

document.addEventListener('DOMContentLoaded', async () => {
    const { data: { session } } = await supabaseClient.auth.getSession();
    if(session) {
        showDashboard();
    }
});

async function loginSuperAdmin() {
    const email = document.getElementById('sa-email').value;
    const pwd = document.getElementById('sa-password').value;
    
    document.getElementById('sa-error').style.display = 'none';
    
    const { data, error } = await supabaseClient.auth.signInWithPassword({
        email: email,
        password: pwd
    });
    
    if(error) {
        document.getElementById('sa-error').textContent = error.message;
        document.getElementById('sa-error').style.display = 'block';
    } else {
        showDashboard();
    }
}

async function logout() {
    await supabaseClient.auth.signOut();
    window.location.reload();
}

async function showDashboard() {
    document.getElementById('auth-overlay').style.display = 'none';
    document.getElementById('admin-dashboard').style.display = 'block';
    loadAziende();
}

function getSubscriptionBadge(scadenzaStr) {
    if (!scadenzaStr) {
        return `<span style="background:#f1f5f9; color:#64748b; padding:4px 10px; border-radius:999px; font-size:12px; font-weight:600;">⚪ Nessuna scadenza</span>`;
    }
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const exp = new Date(scadenzaStr);
    const diffDays = Math.ceil((exp - today) / (1000 * 60 * 60 * 24));

    if (diffDays < 0) {
        return `<span style="background:#fee2e2; color:#dc2626; padding:4px 10px; border-radius:999px; font-size:12px; font-weight:700;">🔴 Scaduto da ${Math.abs(diffDays)} gg</span>`;
    }
    if (diffDays <= 7) {
        return `<span style="background:#fef3c7; color:#d97706; padding:4px 10px; border-radius:999px; font-size:12px; font-weight:700;">🟡 Scade tra ${diffDays} gg</span>`;
    }
    return `<span style="background:#dcfce7; color:#15803d; padding:4px 10px; border-radius:999px; font-size:12px; font-weight:600;">🟢 Attivo (${diffDays} gg)</span>`;
}

async function loadAziende() {
    const container = document.getElementById('aziende-list');
    container.innerHTML = '<p>Caricamento aziende in corso...</p>';

    const { data: aziende, error } = await supabaseClient.from('aziende').select('*').order('data_iscrizione', { ascending: true });
    
    if (error) {
        console.error(error);
        container.innerHTML = `<p style="color:red">Errore nel caricamento delle aziende: ${error.message}</p>`;
        return;
    }

    if (!aziende || aziende.length === 0) {
        container.innerHTML = '<p>Nessuna azienda trovata.</p>';
        return;
    }

    container.innerHTML = '';

    aziende.forEach(azienda => {
        const moduli = azienda.moduli_attivi || {
            mod_timbratore: true,
            mod_assenze: true,
            mod_compliance_legale: false,
            mod_notifiche_push: false,
            mod_export_payroll: false,
            mod_statistiche: true,
            mod_clonazione: true
        };

        const nomeAzienda = azienda.nome_ristorante || 'Azienda ' + azienda.id.substring(0, 6);
        const emailCliente = azienda.email_cliente || '';
        const scadenza = azienda.scadenza_abbonamento || '';
        const safeNome = nomeAzienda.replace(/'/g, "\\'");
        const safeEmail = emailCliente.replace(/'/g, "\\'");

        const card = document.createElement('div');
        card.className = 'azienda-card';
        card.innerHTML = `
            <div style="flex-grow: 1;">
                <div class="azienda-info" style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">
                    <div>
                        <h3>${nomeAzienda}</h3>
                        <p>ID: ${azienda.id}</p>
                    </div>
                    <div>${getSubscriptionBadge(scadenza)}</div>
                </div>

                <div class="subscription-bar">
                    <div style="flex:1; min-width:200px;">
                        <div style="font-size:11px; color:#64748b; font-weight:600; margin-bottom:3px;">📧 Email Cliente</div>
                        <input type="email" id="email-${azienda.id}" value="${emailCliente}" placeholder="cliente@email.it" style="width:100%; box-sizing:border-box;">
                    </div>
                    <div>
                        <div style="font-size:11px; color:#64748b; font-weight:600; margin-bottom:3px;">📅 Scadenza Abbonamento</div>
                        <input type="date" id="scad-${azienda.id}" value="${scadenza}">
                    </div>
                    <div style="display:flex; gap:8px; align-self:flex-end;">
                        <button onclick="saveSubscriptionInfo('${azienda.id}')" style="padding:8px 12px; background:#1e293b; color:white; border:none; border-radius:6px; cursor:pointer; font-size:12px; font-weight:600;">💾 Salva Dati</button>
                        <button onclick="openEmailModal('${safeEmail}', '${safeNome}', '${scadenza}', 'rinnovo')" style="padding:8px 12px; background:#f59e0b; color:white; border:none; border-radius:6px; cursor:pointer; font-size:12px; font-weight:600;">📧 Sollecita Rinnovo</button>
                    </div>
                </div>

                <div class="modules-grid">
                    ${createToggle(azienda.id, 'mod_timbratore', 'Timbratore Presenze', moduli.mod_timbratore)}
                    ${createToggle(azienda.id, 'mod_assenze', 'Gestione Assenze', moduli.mod_assenze)}
                    ${createToggle(azienda.id, 'mod_compliance_legale', 'Compliance (7gg)', moduli.mod_compliance_legale)}
                    ${createToggle(azienda.id, 'mod_notifiche_push', 'Notifiche Push (Pro)', moduli.mod_notifiche_push)}
                    ${createToggle(azienda.id, 'mod_export_payroll', 'Esporta/Importa CSV', moduli.mod_export_payroll)}
                    ${createToggle(azienda.id, 'mod_statistiche', 'Statistiche Avanzate', moduli.mod_statistiche)}
                    ${createToggle(azienda.id, 'mod_clonazione', 'Copia/Clona Turni', moduli.mod_clonazione)}
                </div>
            </div>
        `;
        container.appendChild(card);
    });
}

window.saveSubscriptionInfo = async function(aziendaId) {
    const emailEl = document.getElementById(`email-${aziendaId}`);
    const scadEl = document.getElementById(`scad-${aziendaId}`);
    const email_cliente = emailEl ? emailEl.value.trim() : null;
    const scadenza_abbonamento = scadEl && scadEl.value ? scadEl.value : null;

    const { error } = await supabaseClient
        .from('aziende')
        .update({ email_cliente, scadenza_abbonamento })
        .eq('id', aziendaId);

    if (error) {
        alert('Errore salvataggio dati abbonamento: ' + error.message);
    } else {
        showToast("Dati abbonamento salvati! ✅");
        loadAziende();
    }
};

window.openEmailModal = function(toEmail = '', nomeAzienda = 'la tua attività', scadenza = '', template = 'test') {
    const modal = document.getElementById('email-modal');
    const toInput = document.getElementById('email-to');
    const tplSelect = document.getElementById('email-template');
    const statusEl = document.getElementById('email-status');

    currentEmailContext = {
        nomeAzienda: nomeAzienda || 'la tua attività',
        scadenza: scadenza ? new Date(scadenza).toLocaleDateString('it-IT') : 'prossimi giorni'
    };

    if (toInput) toInput.value = toEmail || '';
    if (tplSelect) tplSelect.value = toEmail ? (template || 'rinnovo') : 'test';
    if (statusEl) statusEl.textContent = '';

    applyEmailTemplate();
    if (modal) modal.style.display = 'flex';
};

window.closeEmailModal = function() {
    const modal = document.getElementById('email-modal');
    if (modal) modal.style.display = 'none';
};

window.applyEmailTemplate = function() {
    const tpl = document.getElementById('email-template')?.value || 'test';
    const subjEl = document.getElementById('email-subject');
    const bodyEl = document.getElementById('email-body');
    if (!subjEl || !bodyEl) return;

    const nome = currentEmailContext.nomeAzienda || 'Cliente';
    const scad = currentEmailContext.scadenza || 'a breve';

    if (tpl === 'rinnovo') {
        subjEl.value = `⚠️ Avviso Rinnovo Abbonamento TurniCloud Pro - ${nome}`;
        bodyEl.value = `Gentile responsabile di ${nome},\n\nti ricordiamo che l'abbonamento a TurniCloud Pro per la gestione dei turni e delle presenze è in scadenza (${scad}).\n\nPer garantire la continuità del servizio senza interruzioni per te e per i tuoi dipendenti, ti invitiamo a procedere con il rinnovo.\n\nAccedi alla tua area riservata: https://max-gorenca06.github.io/turni_app_SaaS/\n\nCordiali saluti,\nIl Team TurniCloud Pro`;
    } else if (tpl === 'benvenuto') {
        subjEl.value = `🎉 Benvenuto su TurniCloud Pro - ${nome}`;
        bodyEl.value = `Ciao!\n\nIl tuo ambiente TurniCloud Pro per "${nome}" è attivo e pronto all'uso.\n\nPuoi accedere subito alla piattaforma da qui:\nhttps://max-gorenca06.github.io/turni_app_SaaS/\n\nPer qualsiasi necessità siamo a tua disposizione.\n\nBuon lavoro,\nTurniCloud Pro`;
    } else {
        subjEl.value = `✅ Test Server Email TurniCloud Pro`;
        bodyEl.value = `Ciao!\n\nQuesta è un'email di prova inviata direttamente dal tuo server Oracle Cloud tramite TurniCloud Pro.\n\nIl collegamento SMTP funziona correttamente!`;
    }
};

window.sendCustomEmail = async function() {
    const to = document.getElementById('email-to')?.value.trim();
    const subject = document.getElementById('email-subject')?.value.trim();
    const message = document.getElementById('email-body')?.value.trim();
    const statusEl = document.getElementById('email-status');
    const btn = document.getElementById('btn-send-email');

    if (!to || !subject || !message) {
        if (statusEl) {
            statusEl.style.color = '#ef4444';
            statusEl.textContent = 'Compila destinatario, oggetto e messaggio.';
        }
        return;
    }

    try {
        if (btn) btn.disabled = true;
        if (statusEl) {
            statusEl.style.color = '#3b82f6';
            statusEl.textContent = 'Invio email in corso dal server Oracle...';
        }

        const { data, error } = await supabaseClient.functions.invoke('send-email', {
            body: { to, subject, message }
        });

        if (error) throw error;
        if (data && data.error) throw new Error(data.error);

        if (statusEl) {
            statusEl.style.color = '#10b981';
            statusEl.textContent = `✅ Email inviata con successo a ${to}!`;
        }
        showToast(`Email inviata a ${to} ✉️`);
    } catch (err) {
        console.error('Errore invio email:', err);
        if (statusEl) {
            statusEl.style.color = '#ef4444';
            statusEl.textContent = 'Errore invio: ' + (err.message || err);
        }
    } finally {
        if (btn) btn.disabled = false;
    }
};

function createToggle(aziendaId, moduleKey, label, isChecked) {
    const checkedHtml = isChecked ? 'checked' : '';
    return `
        <div class="module-toggle">
            <span class="toggle-label">${label}</span>
            <label class="switch">
                <input type="checkbox" ${checkedHtml} onchange="updateModule('${aziendaId}', '${moduleKey}', this.checked)">
                <span class="slider"></span>
            </label>
        </div>
    `;
}

window.updateModule = async function(aziendaId, moduleKey, newValue) {
    const { data: currentData, error: fetchError } = await supabaseClient
        .from('aziende')
        .select('moduli_attivi')
        .eq('id', aziendaId)
        .single();
        
    if (fetchError) {
        alert('Errore fetch moduli: ' + fetchError.message);
        return;
    }

    let moduli = currentData.moduli_attivi || {};
    moduli[moduleKey] = newValue;

    const { data: updateData, error: updateError } = await supabaseClient
        .from('aziende')
        .update({ moduli_attivi: moduli })
        .eq('id', aziendaId)
        .select();

    if (updateError) {
        alert('Errore salvataggio: ' + updateError.message);
        loadAziende();
    } else if (!updateData || updateData.length === 0) {
        alert('Errore: Permessi insufficienti per modificare questa azienda. Assicurati di aver fatto l\'accesso con l\'account proprietario.');
        loadAziende();
    } else {
        showToast("Salvataggio completato! ✅");
    }
};

function showToast(message) {
    let toast = document.getElementById('superadmin-toast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'superadmin-toast';
        toast.style.position = 'fixed';
        toast.style.bottom = '20px';
        toast.style.right = '20px';
        toast.style.background = '#10b981';
        toast.style.color = 'white';
        toast.style.padding = '12px 24px';
        toast.style.borderRadius = '8px';
        toast.style.boxShadow = '0 4px 6px rgba(0,0,0,0.1)';
        toast.style.fontWeight = 'bold';
        toast.style.zIndex = '9999';
        toast.style.transition = 'opacity 0.3s';
        document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.style.opacity = '1';
    
    setTimeout(() => {
        toast.style.opacity = '0';
    }, 2500);
}
