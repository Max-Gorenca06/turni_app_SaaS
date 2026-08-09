// Usa le stesse chiavi del progetto
const SUPABASE_URL = 'https://mrwjqeachzcmnwahnqjn.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1yd2pxZWFjaHpjbW53YWhucWpuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgxNDcxMTksImV4cCI6MjA5MzcyMzExOX0.S1WVO4y59azzM-iQss_836KHtK1gnmpfglRXZ1KRKdQ';

const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const SUPERADMIN_PASSWORD = 'ares'; // Password hardcoded per test (da cambiare in prod!)

document.addEventListener('DOMContentLoaded', () => {
    if(sessionStorage.getItem('saas_superadmin_logged_in') === 'true') {
        showDashboard();
    }
});

function loginSuperAdmin() {
    const pwd = document.getElementById('sa-password').value;
    if(pwd === SUPERADMIN_PASSWORD) {
        sessionStorage.setItem('saas_superadmin_logged_in', 'true');
        showDashboard();
    } else {
        document.getElementById('sa-error').style.display = 'block';
    }
}

function logout() {
    sessionStorage.removeItem('saas_superadmin_logged_in');
    window.location.reload();
}

async function showDashboard() {
    document.getElementById('auth-overlay').style.display = 'none';
    document.getElementById('admin-dashboard').style.display = 'block';
    loadAziende();
}

async function loadAziende() {
    const container = document.getElementById('aziende-list');
    container.innerHTML = '<p>Caricamento aziende in corso...</p>';

    // Fetch aziende from Supabase
    const { data: aziende, error } = await supabaseClient.from('aziende').select('*');
    
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
        // Fallback default modules if not present
        const moduli = azienda.moduli_attivi || {
            mod_timbratore: true,
            mod_assenze: true,
            mod_compliance_legale: false,
            mod_notifiche_push: false,
            mod_export_payroll: false,
            mod_statistiche: true,
            mod_clonazione: true
        };

        const card = document.createElement('div');
        card.className = 'azienda-card';
        card.innerHTML = `
            <div style="flex-grow: 1;">
                <div class="azienda-info">
                    <h3>${azienda.nome_ristorante || 'Azienda ' + azienda.id}</h3>
                    <p>ID: ${azienda.id} | Codice Fiscale: ${azienda.cf_piva || 'N/A'}</p>
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

function createToggle(aziendaId, moduleKey, label, isChecked) {
    const checkedHtml = isChecked ? 'checked' : '';
    return `
        <div class="module-toggle">
            <span class="toggle-label">${label}</span>
            <label class="switch">
                <input type="checkbox" ${checkedHtml} onchange="updateModule(${aziendaId}, '${moduleKey}', this.checked)">
                <span class="slider"></span>
            </label>
        </div>
    `;
}

window.updateModule = async function(aziendaId, moduleKey, newValue) {
    // Prima recuperiamo i moduli attuali
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

    // Aggiorniamo
    const { error: updateError } = await supabaseClient
        .from('aziende')
        .update({ moduli_attivi: moduli })
        .eq('id', aziendaId);

    if (updateError) {
        alert('Errore salvataggio: ' + updateError.message);
        loadAziende(); // ricarica per ripristinare il toggle visivo
    } else {
        console.log(`Aggiornato ${moduleKey} a ${newValue} per l'azienda ${aziendaId}`);
    }
}
