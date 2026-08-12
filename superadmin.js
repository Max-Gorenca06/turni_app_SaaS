// Usa le stesse chiavi del progetto
const SUPABASE_URL = 'https://mrwjqeachzcmnwahnqjn.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1yd2pxZWFjaHpjbW53YWhucWpuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgxNDcxMTksImV4cCI6MjA5MzcyMzExOX0.S1WVO4y59azzM-iQss_836KHtK1gnmpfglRXZ1KRKdQ';

const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

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
    const { data: updateData, error: updateError } = await supabaseClient
        .from('aziende')
        .update({ moduli_attivi: moduli })
        .eq('id', aziendaId)
        .select();

    if (updateError) {
        alert('Errore salvataggio: ' + updateError.message);
        loadAziende(); // ricarica per ripristinare il toggle visivo
    } else if (!updateData || updateData.length === 0) {
        alert('Errore: Permessi insufficienti per modificare questa azienda. Assicurati di aver fatto l\'accesso con l\'account proprietario.');
        loadAziende();
    } else {
        console.log(`Aggiornato ${moduleKey} a ${newValue} per l'azienda ${aziendaId}`);
        showToast("Salvataggio completato! ✅");
    }
}

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
