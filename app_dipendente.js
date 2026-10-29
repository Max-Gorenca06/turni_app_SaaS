// Usa la configurazione centralizzata da js/config.js (con fallback)
const SUPABASE_URL = (window.SUPABASE_CONFIG && window.SUPABASE_CONFIG.URL) || 'https://api.158.180.239.147.sslip.io';
const SUPABASE_ANON_KEY = (window.SUPABASE_CONFIG && window.SUPABASE_CONFIG.ANON_KEY) || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNzkxNDQ4MTcwLCJleHAiOjIxMDY4MDgxNzB9.v6w9RwQBBKxdC0-sN08whXB0NjRbWgy_tCzuX_piuWk';

const supabaseClient = (window.getSupabaseClient && window.getSupabaseClient()) || supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let allProfiles = [];
let currentProfile = null;
let currentStatus = null; // for timbratore
let lastRecordId = null;

function normalizeProfile(p) {
    if (!p) return p;
    const nomeRistorante = p.nome_ristorante || (p.aziende && p.aziende.nome_ristorante) || 'Azienda';
    const moduliAttivi = p.moduli_attivi || (p.aziende && p.aziende.moduli_attivi) || null;
    const reparto = p.reparto || p.role || 'Staff';
    return {
        id: p.id,
        azienda_id: p.azienda_id,
        name: p.name,
        email: p.email,
        reparto: reparto,
        role: p.role || reparto,
        nome_ristorante: nomeRistorante,
        aziende: {
            nome_ristorante: nomeRistorante,
            moduli_attivi: moduliAttivi
        }
    };
}

document.addEventListener('DOMContentLoaded', () => {
    const savedProfiles = localStorage.getItem('tc_employee_profiles');
    if (savedProfiles) {
        try {
            allProfiles = JSON.parse(savedProfiles).map(normalizeProfile);
            currentProfile = allProfiles[0];
            if (currentProfile) {
                showApp();
                loadData();
            }
        } catch (e) {
            localStorage.removeItem('tc_employee_profiles');
        }
    }

    // Login Form
    document.getElementById('login-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('login-email').value.trim();
        const password = document.getElementById('login-password').value.trim();
        const btn = document.getElementById('login-btn');
        const err = document.getElementById('login-error');
        
        btn.textContent = 'Accesso in corso...';
        btn.disabled = true;
        err.style.display = 'none';

        try {
            let staffData = null;

            // Uso della funzione RPC sicura (SECURITY DEFINER, non espone password a client anonimi)
            const { data: rpcData, error: rpcError } = await supabaseClient
                .rpc('verify_staff_credentials', { p_email: email, p_password: password });

            if (!rpcError && rpcData && rpcData.length > 0) {
                staffData = rpcData;
            } else if (rpcError && rpcError.code === 'PGRST202') {
                // Fallback solo se la funzione RPC non è stata ancora creata nel DB
                const { data: directData, error: directError } = await supabaseClient
                    .from('staff')
                    .select('id, azienda_id, name, email, reparto, aziende(nome_ristorante, moduli_attivi)')
                    .eq('email', email)
                    .eq('password', password);
                
                if (directError) throw directError;
                staffData = directData;
            }

            if (staffData && staffData.length > 0) {
                allProfiles = staffData.map(normalizeProfile);
                currentProfile = allProfiles[0];
                localStorage.setItem('tc_employee_profiles', JSON.stringify(allProfiles));
                showApp();
                loadData();
            } else {
                err.textContent = 'Credenziali non valide.';
                err.style.display = 'block';
            }
        } catch (e) {
            console.error(e);
            err.textContent = 'Errore di connessione o credenziali non valide.';
            err.style.display = 'block';
        }

        btn.textContent = 'Accedi';
        btn.disabled = false;
    });

    document.getElementById('logout-btn').addEventListener('click', () => {
        localStorage.removeItem('tc_employee_profiles');
        window.location.reload();
    });

    const navItems = document.querySelectorAll('.nav-item');
    const views = document.querySelectorAll('.view');

    navItems.forEach(item => {
        item.addEventListener('click', () => {
            navItems.forEach(n => n.classList.remove('active'));
            views.forEach(v => v.classList.remove('active'));
            
            item.classList.add('active');
            document.getElementById(item.dataset.target).classList.add('active');
        });
    });

    setInterval(() => {
        const now = new Date();
        document.getElementById('app-clock').textContent = now.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    }, 1000);

    setupSwipe();

    document.getElementById('absence-form').addEventListener('submit', submitAbsence);
    
    document.getElementById('azienda-select').addEventListener('change', (e) => {
        currentProfile = allProfiles.find(p => String(p.azienda_id) === String(e.target.value));
        applyModules();
        updateProfileView();
        loadData();
    });
});

function showApp() {
    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('app-screen').style.display = 'flex';
    
    const select = document.getElementById('azienda-select');
    select.innerHTML = '';
    allProfiles.forEach(p => {
        const opt = document.createElement('option');
        opt.value = p.azienda_id;
        opt.textContent = p.nome_ristorante || (p.aziende ? p.aziende.nome_ristorante : 'Azienda Sconosciuta');
        if (p.azienda_id === currentProfile.azienda_id) opt.selected = true;
        select.appendChild(opt);
    });

    applyModules();
    updateProfileView();
}

async function applyModules() {
    let moduli = {
        mod_timbratore: true,
        mod_assenze: true,
        mod_notifiche_push: false
    };

    if (currentProfile && currentProfile.azienda_id) {
        // Fetch di sicurezza se la RPC di login non ha caricato i moduli
        const { data: azData } = await supabaseClient
            .from('aziende')
            .select('moduli_attivi')
            .eq('id', currentProfile.azienda_id)
            .single();
            
        if (azData && azData.moduli_attivi) {
            moduli = azData.moduli_attivi;
        } else if (currentProfile.aziende && currentProfile.aziende.moduli_attivi) {
            moduli = currentProfile.aziende.moduli_attivi;
        }
    }

    // Toggle Timbratore
    const navTimbratore = document.getElementById('nav-timbratore');
    if (navTimbratore) navTimbratore.style.display = moduli.mod_timbratore ? 'flex' : 'none';

    // Toggle Assenze
    const navRichieste = document.getElementById('nav-richieste');
    if (navRichieste) navRichieste.style.display = moduli.mod_assenze ? 'flex' : 'none';

    // Toggle Push
    const pushCard = document.getElementById('mod-notifiche-card');
    if (pushCard) pushCard.style.display = moduli.mod_notifiche_push ? 'block' : 'none';
}

function updateProfileView() {
    document.getElementById('user-name').textContent = currentProfile.name.split(' ')[0];
    document.getElementById('user-avatar').textContent = currentProfile.name.charAt(0).toUpperCase();
    
    document.getElementById('prof-name').textContent = currentProfile.name;
    document.getElementById('prof-email').textContent = currentProfile.email || 'N/D';
    document.getElementById('prof-reparto').textContent = currentProfile.reparto || currentProfile.role || 'N/D';

    const hour = new Date().getHours();
    let greeting = 'Buongiorno,';
    if (hour >= 14 && hour < 18) greeting = 'Buon pomeriggio,';
    else if (hour >= 18) greeting = 'Buonasera,';
    document.getElementById('greeting').textContent = greeting;
}

async function loadData() {
    loadShifts();
    checkTimbratoreStatus();
    loadAbsences();
    loadNotifications();
    setupRealtimeChannel();
}

async function loadShifts() {
    const list = document.getElementById('turni-list');
    try {
        const { data: griglie } = await supabaseClient
            .from('griglie_turni')
            .select('*')
            .eq('azienda_id', currentProfile.azienda_id)
            .eq('pubblicato', true)
            .order('data_lunedi', { ascending: false })
            .limit(4);

        if (!griglie || griglie.length === 0) {
            list.innerHTML = '<div class="empty-state"><div class="empty-icon">🏖️</div><div>Nessun turno pubblicato.</div></div>';
            return;
        }

        const daysOrder = ['Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato', 'Domenica'];
        let html = '';

        griglie.forEach(g => {
            const dati = g.dati_griglia || {};
            let myShifts = [];
            
            for (const [key, staffArray] of Object.entries(dati)) {
                if (key.startsWith('_metadata') || !Array.isArray(staffArray)) continue;
                const isAssigned = staffArray.some(s => s.name === currentProfile.name);
                if (isAssigned) {
                    const parts = key.split('-');
                    const day = parts[0];
                    const shift = parts.slice(1).join('-');
                    myShifts.push({ day, shift });
                }
            }

            myShifts.sort((a, b) => daysOrder.indexOf(capitalize(a.day)) - daysOrder.indexOf(capitalize(b.day)));

            const isCurrentOrFutureWeek = new Date(g.data_lunedi).getTime() + (7 * 24 * 60 * 60 * 1000) > new Date().getTime();
            
            html += `<div style="font-size: 13px; color: #64748b; margin-top: 20px; margin-bottom: 10px; font-weight: 600; text-transform: uppercase;">Settimana del ${new Date(g.data_lunedi).toLocaleDateString('it-IT')} ${isCurrentOrFutureWeek ? '(Attuale)' : '(Passata)'}</div>`;

            if (myShifts.length === 0) {
                html += '<div style="background: var(--surface); padding: 15px; border-radius: 12px; border: 1px dashed var(--border); color: var(--text-light); text-align: center; font-size: 14px;">Nessun turno assegnato.</div>';
            } else {
                const dayColors = {
                    'Lunedì': '#3b82f6',   // Blue
                    'Martedì': '#ef4444',  // Red
                    'Mercoledì': '#10b981',// Green
                    'Giovedì': '#f59e0b',  // Orange
                    'Venerdì': '#8b5cf6',  // Purple
                    'Sabato': '#ec4899',   // Pink
                    'Domenica': '#06b6d4'  // Cyan
                };
                
                daysOrder.forEach(dayName => {
                    const shiftsForDay = myShifts.filter(s => capitalize(s.day) === dayName);
                    if (shiftsForDay.length > 0) {
                        const joinedShifts = shiftsForDay.map(s => capitalize(s.shift)).join(', ');
                        html += `
                            <div class="shift-card" style="border-left-color: ${dayColors[dayName] || 'var(--primary)'}; ${!isCurrentOrFutureWeek ? 'opacity: 0.7;' : ''}">
                                <div>
                                    <div class="shift-day">${dayName}</div>
                                    <div class="shift-time">${joinedShifts}</div>
                                </div>
                                <div class="shift-role">${currentProfile.reparto}</div>
                            </div>
                        `;
                    } else {
                        html += `
                            <div class="shift-card" style="border-left-color: #cbd5e1; background: #f8fafc; box-shadow: none; ${!isCurrentOrFutureWeek ? 'opacity: 0.7;' : ''}">
                                <div>
                                    <div class="shift-day" style="color: #94a3b8;">${dayName}</div>
                                    <div class="shift-time" style="color: #94a3b8; font-weight: normal;">Riposo</div>
                                </div>
                            </div>
                        `;
                    }
                });
            }
        });
        
        list.innerHTML = html;
        
    } catch(e) {
        console.error(e);
        list.innerHTML = '<div style="color:red; text-align:center;">Errore caricamento turni</div>';
    }
}

function capitalize(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
}

// --- TIMBRATORE LOGIC ---
async function checkTimbratoreStatus() {
    try {
        try {
            await supabaseClient.rpc('auto_close_stale_timbrature', { p_max_hours: 14, p_default_shift_hours: 8 });
        } catch (_) {}

        const { data, error } = await supabaseClient
            .from('timbrature')
            .select('*')
            .eq('azienda_id', currentProfile.azienda_id)
            .eq('nome_dipendente', currentProfile.name)
            .order('ingresso', { ascending: false })
            .limit(5);

        if (error) throw error;

        const recentDiv = document.getElementById('recent-timbrature');
        if (data && data.length > 0) {
            recentDiv.innerHTML = data.map(t => {
                const i = new Date(t.ingresso).toLocaleTimeString('it-IT', {hour:'2-digit', minute:'2-digit'});
                const u = t.uscita ? new Date(t.uscita).toLocaleTimeString('it-IT', {hour:'2-digit', minute:'2-digit'}) : '...';
                const autoBadge = t.chiusa_automaticamente ? ' <span style="background:#fef3c7;color:#d97706;padding:1px 5px;border-radius:4px;font-size:10px;">⚠️ Auto</span>' : '';
                return `<div style="padding: 5px 0; border-bottom: 1px solid #e2e8f0; display:flex; justify-content:space-between;">
                    <span>${new Date(t.ingresso).toLocaleDateString('it-IT')}</span>
                    <strong>${i} - ${u}${autoBadge}</strong>
                </div>`;
            }).join('');
        } else {
            recentDiv.innerHTML = 'Nessuna timbratura recente.';
        }

        if (data && data.length > 0 && !data[0].uscita) {
            currentStatus = 'in';
            lastRecordId = data[0].id;
            updateSwipeUI('in');
        } else {
            currentStatus = 'out';
            lastRecordId = null;
            updateSwipeUI('out');
        }
    } catch(e) {
        console.error("Timbrature err", e);
    }
}

function updateSwipeUI(status) {
    const btn = document.getElementById('app-swipe-button');
    const txt = document.getElementById('app-swipe-text');
    const area = document.getElementById('app-swipe-area');
    const statusMsg = document.getElementById('timbratore-status');

    if (status === 'out') {
        btn.style.transform = 'translateX(0)';
        btn.style.background = '#3b82f6';
        area.style.border = '1px solid #e2e8f0';
        txt.textContent = 'Scorri per Entrare';
        statusMsg.textContent = 'Attualmente sei: FUORI';
        statusMsg.style.color = '#64748b';
    } else {
        btn.style.transform = 'translateX(0)';
        btn.style.background = '#f59e0b';
        area.style.border = '1px solid #fde68a';
        txt.textContent = 'Scorri per Uscire';
        statusMsg.textContent = 'Attualmente sei: A LAVORO';
        statusMsg.style.color = '#10b981';
    }
}

function setupSwipe() {
    const area = document.getElementById('app-swipe-area');
    const btn = document.getElementById('app-swipe-button');
    
    let isDragging = false;
    let startX = 0;
    const maxDrag = 250;

    btn.addEventListener('touchstart', e => {
        isDragging = true;
        startX = e.touches[0].clientX - btn.getBoundingClientRect().left;
        btn.style.transition = 'none';
    }, {passive: true});

    document.addEventListener('touchmove', e => {
        if (!isDragging) return;
        let x = e.touches[0].clientX - area.getBoundingClientRect().left - startX;
        if (x < 0) x = 0;
        if (x > maxDrag) x = maxDrag;
        btn.style.transform = `translateX(${x}px)`;
    }, {passive: false});

    document.addEventListener('touchend', async e => {
        if (!isDragging) return;
        isDragging = false;
        btn.style.transition = 'transform 0.3s';
        
        let x = parseFloat(btn.style.transform.replace('translateX(', ''));
        if (x > maxDrag * 0.8) {
            btn.style.transform = `translateX(${maxDrag}px)`;
            await recordTime();
        } else {
            btn.style.transform = 'translateX(0)';
        }
    });

    btn.addEventListener('mousedown', e => {
        isDragging = true;
        startX = e.clientX - btn.getBoundingClientRect().left;
        btn.style.transition = 'none';
    });

    document.addEventListener('mousemove', e => {
        if (!isDragging) return;
        let x = e.clientX - area.getBoundingClientRect().left - startX;
        if (x < 0) x = 0;
        if (x > maxDrag) x = maxDrag;
        btn.style.transform = `translateX(${x}px)`;
    });

    document.addEventListener('mouseup', async e => {
        if (!isDragging) return;
        isDragging = false;
        btn.style.transition = 'transform 0.3s';
        let transformStr = btn.style.transform;
        let x = transformStr ? parseFloat(transformStr.replace('translateX(', '')) : 0;
        if (x > maxDrag * 0.8) {
            btn.style.transform = `translateX(${maxDrag}px)`;
            await recordTime();
        } else {
            btn.style.transform = 'translateX(0)';
        }
    });
}

async function recordTime() {
    const area = document.getElementById('app-swipe-area');
    area.style.pointerEvents = 'none';
    document.getElementById('app-swipe-text').textContent = 'Registrazione...';

    try {
        const now = new Date().toISOString();
        if (currentStatus === 'out') {
            const { data, error } = await supabaseClient.from('timbrature').insert([{
                azienda_id: currentProfile.azienda_id,
                nome_dipendente: currentProfile.name,
                ingresso: now
            }]).select();
            if (error) throw error;
            lastRecordId = data[0].id;
            currentStatus = 'in';
        } else {
            const { error } = await supabaseClient.from('timbrature').update({
                uscita: now
            }).eq('id', lastRecordId).eq('azienda_id', currentProfile.azienda_id).is('uscita', null);
            if (error) throw error;
            lastRecordId = null;
            currentStatus = 'out';
        }
        
        setTimeout(() => {
            updateSwipeUI(currentStatus);
            checkTimbratoreStatus();
            area.style.pointerEvents = 'auto';
        }, 1000);

    } catch (e) {
        console.error(e);
        alert('Errore di registrazione');
        updateSwipeUI(currentStatus);
        area.style.pointerEvents = 'auto';
    }
}

// --- ABSENCES ---
async function submitAbsence(e) {
    e.preventDefault();
    const date = document.getElementById('abs-date').value;
    const type = document.getElementById('abs-type').value;
    const note = document.getElementById('abs-note').value;
    const statusDiv = document.getElementById('abs-status');

    statusDiv.textContent = 'Invio in corso...';
    statusDiv.style.color = '#64748b';

    try {
        const { error } = await supabaseClient.from('assenze_globali').insert([{
            azienda_id: currentProfile.azienda_id,
            nome_dipendente: currentProfile.name,
            data_inizio: date,
            data_fine: date,
            turno_specifico: type,
            motivo: note,
            stato: 'IN ATTESA'
        }]);
        
        if (error) throw error;

        if (window.TurniNotifications && window.TurniNotifications.notifyAdminNewAbsence) {
            window.TurniNotifications.notifyAdminNewAbsence({
                aziendaId: currentProfile.azienda_id,
                nomeDipendente: currentProfile.name,
                dataInizio: date,
                dataFine: date,
                turno: type
            });
        }
        
        statusDiv.textContent = 'Richiesta inviata con successo!';
        statusDiv.style.color = '#10b981';
        document.getElementById('absence-form').reset();
        loadAbsences();
    } catch(e) {
        console.error(e);
        statusDiv.textContent = 'Errore invio richiesta.';
        statusDiv.style.color = '#ef4444';
    }
}

async function loadAbsences() {
    const div = document.getElementById('my-absences');
    try {
        const { data } = await supabaseClient.from('assenze_globali')
            .select('*')
            .eq('azienda_id', currentProfile.azienda_id)
            .eq('nome_dipendente', currentProfile.name)
            .order('data_inizio', { ascending: false })
            .limit(10);
            
        if (data && data.length > 0) {
            div.innerHTML = data.map(a => {
                let badgeColor = '#f59e0b'; // In attesa
                if (a.stato === 'APPROVATA') badgeColor = '#10b981';
                if (a.stato === 'RIFIUTATA') badgeColor = '#ef4444';

                return `
                <div style="background: #ffffff; padding: 12px; margin-bottom: 8px; border-radius: 8px; border: 1px solid #e2e8f0; display:flex; justify-content: space-between; align-items: center;">
                    <div>
                        <div style="font-weight: 600;">${new Date(a.data_inizio).toLocaleDateString('it-IT')}</div>
                        <div style="font-size: 12px; color: #64748b;">${capitalize(a.turno_specifico)} ${a.motivo ? '- '+a.motivo : ''}</div>
                    </div>
                    <div style="font-size: 10px; padding: 4px 8px; border-radius: 12px; background: ${badgeColor}20; color: ${badgeColor}; font-weight: bold;">
                        ${a.stato}
                    </div>
                </div>
            `}).join('');
        } else {
            div.innerHTML = '<div style="font-size:14px; color:#64748b;">Nessuna richiesta recente.</div>';
        }
    } catch(e) {
        console.error(e);
    }
}

// --- PUSH NOTIFICATIONS ---
const PUBLIC_VAPID_KEY = 'BLAvFrPhZKkFEPt_3FAdMcPFB8aCYoF1TiJ354yaVzVuxHOcq_g6IHECTONm4j4fOBiLX4pwKy1ObLjKAjcYQE4';

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding)
    .replace(/\-/g, '+')
    .replace(/_/g, '/');

  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

document.addEventListener('DOMContentLoaded', async () => {
    if ('serviceWorker' in navigator) {
        try {
            await navigator.serviceWorker.register('./sw.js');
        } catch (err) {
            console.warn('Registrazione ServiceWorker fallita:', err);
        }
    }

    const pushBtn = document.getElementById('push-btn');
    if (pushBtn) {
        pushBtn.addEventListener('click', subscribeToPush);
    }
    checkPushStatus();

    const notifBell = document.getElementById('emp-notif-bell');
    const notifModal = document.getElementById('emp-notif-modal');
    const notifClose = document.getElementById('emp-notif-close');
    const notifMarkRead = document.getElementById('emp-notif-mark-read');

    if (notifBell && notifModal) {
        notifBell.addEventListener('click', () => {
            notifModal.style.display = 'flex';
            loadNotifications();
        });
    }
    if (notifClose && notifModal) {
        notifClose.addEventListener('click', () => {
            notifModal.style.display = 'none';
        });
        notifModal.addEventListener('click', (e) => {
            if (e.target === notifModal) notifModal.style.display = 'none';
        });
    }
    if (notifMarkRead) {
        notifMarkRead.addEventListener('click', markAllNotificationsRead);
    }
});

let empRealtimeChannel = null;
let currentNotifications = [];

function showEmployeeToast(title, message) {
    let toast = document.getElementById('emp-realtime-toast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'emp-realtime-toast';
        toast.style.cssText = 'position:fixed; top:20px; left:50%; transform:translateX(-50%); background:#1e293b; color:white; padding:14px 18px; border-radius:16px; box-shadow:0 10px 25px rgba(0,0,0,0.25); z-index:9999; width:90%; max-width:360px; transition:opacity 0.3s; font-size:13px;';
        document.body.appendChild(toast);
    }
    toast.innerHTML = `<div style="font-weight:700; margin-bottom:3px;">${title}</div><div style="color:#cbd5e1;">${message}</div>`;
    toast.style.opacity = '1';
    toast.style.display = 'block';
    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => {
        toast.style.opacity = '0';
        setTimeout(() => { toast.style.display = 'none'; }, 300);
    }, 4500);
}

async function loadNotifications() {
    if (!currentProfile || !currentProfile.azienda_id) return;
    try {
        const { data, error } = await supabaseClient
            .from('notifiche')
            .select('*')
            .eq('azienda_id', currentProfile.azienda_id)
            .in('destinatario', ['TUTTI', currentProfile.name])
            .order('created_at', { ascending: false })
            .limit(25);

        if (error) return;
        currentNotifications = data || [];

        const readIds = JSON.parse(localStorage.getItem('tc_read_notif_ids') || '[]');
        const unreadCount = currentNotifications.filter(n => !n.letto && !readIds.includes(n.id)).length;

        const badge = document.getElementById('emp-notif-badge');
        if (badge) {
            if (unreadCount > 0) {
                badge.textContent = unreadCount > 9 ? '9+' : String(unreadCount);
                badge.style.display = 'flex';
            } else {
                badge.style.display = 'none';
            }
        }

        const list = document.getElementById('emp-notif-list');
        if (!list) return;

        if (currentNotifications.length === 0) {
            list.innerHTML = '<div style="text-align: center; color: var(--text-light); padding: 30px 10px; font-size: 14px;">Nessuna notifica presente.</div>';
            return;
        }

        list.innerHTML = currentNotifications.map(n => {
            const isRead = n.letto || readIds.includes(n.id);
            const dateStr = new Date(n.created_at).toLocaleString('it-IT', {
                day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'
            });
            return `
                <div style="background: ${isRead ? '#f8fafc' : '#eff6ff'}; border: 1px solid ${isRead ? '#e2e8f0' : '#bfdbfe'}; border-radius: 14px; padding: 14px; margin-bottom: 10px;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
                        <strong style="font-size: 14px; color: #0f172a;">${n.titolo}</strong>
                        <span style="font-size: 11px; color: #64748b;">${dateStr}</span>
                    </div>
                    <div style="font-size: 13px; color: #334155; line-height: 1.4;">${n.messaggio}</div>
                </div>
            `;
        }).join('');
    } catch (err) {
        console.warn('Errore caricamento notifiche:', err);
    }
}

async function markAllNotificationsRead() {
    if (!currentProfile || !currentProfile.azienda_id) return;
    const readIds = JSON.parse(localStorage.getItem('tc_read_notif_ids') || '[]');
    currentNotifications.forEach(n => {
        if (!readIds.includes(n.id)) readIds.push(n.id);
    });
    localStorage.setItem('tc_read_notif_ids', JSON.stringify(readIds.slice(-100)));

    // Segna come lette sul DB quelle personali
    const personalUnreadIds = currentNotifications
        .filter(n => n.destinatario === currentProfile.name && !n.letto)
        .map(n => n.id);

    if (personalUnreadIds.length > 0) {
        await supabaseClient
            .from('notifiche')
            .update({ letto: true })
            .in('id', personalUnreadIds);
    }

    loadNotifications();
}

function setupRealtimeChannel() {
    if (!currentProfile || !currentProfile.azienda_id) return;
    if (empRealtimeChannel) {
        supabaseClient.removeChannel(empRealtimeChannel);
    }

    empRealtimeChannel = supabaseClient
        .channel('emp-channel-' + currentProfile.azienda_id)
        .on(
            'postgres_changes',
            {
                event: 'INSERT',
                schema: 'public',
                table: 'notifiche',
                filter: `azienda_id=eq.${currentProfile.azienda_id}`
            },
            (payload) => {
                const n = payload.new;
                if (!n) return;
                if (n.destinatario === 'TUTTI' || n.destinatario === currentProfile.name) {
                    showEmployeeToast(n.titolo, n.messaggio);
                    if (window.TurniNotifications && window.TurniNotifications.triggerLocalOSNotification) {
                        window.TurniNotifications.triggerLocalOSNotification(n.titolo, n.messaggio);
                    }
                    loadNotifications();
                    loadShifts();
                    loadAbsences();
                }
            }
        )
        .on(
            'postgres_changes',
            {
                event: 'UPDATE',
                schema: 'public',
                table: 'griglie_turni',
                filter: `azienda_id=eq.${currentProfile.azienda_id}`
            },
            () => {
                loadShifts();
            }
        )
        .on(
            'postgres_changes',
            {
                event: 'UPDATE',
                schema: 'public',
                table: 'assenze_globali',
                filter: `azienda_id=eq.${currentProfile.azienda_id}`
            },
            () => {
                loadAbsences();
            }
        )
        .subscribe();
}

async function checkPushStatus() {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    
    const btn = document.getElementById('push-btn');
    const status = document.getElementById('push-status');
    
    if (subscription && btn && status) {
        btn.textContent = 'Notifiche Attive ✓';
        btn.style.background = '#10b981';
        btn.disabled = true;
        status.textContent = 'Il tuo dispositivo riceverà gli avvisi.';
        status.style.display = 'block';
        status.style.color = '#10b981';
    }
}

async function subscribeToPush() {
    const btn = document.getElementById('push-btn');
    const status = document.getElementById('push-status');
    
    btn.textContent = 'Attivazione...';
    btn.disabled = true;
    status.style.display = 'block';
    status.textContent = 'Richiesta permessi in corso...';
    status.style.color = '#64748b';

    try {
        if (!('serviceWorker' in navigator)) throw new Error('Service Worker non supportato');

        if ('Notification' in window && Notification.permission === 'default') {
            await Notification.requestPermission();
        }
        
        await navigator.serviceWorker.register('./sw.js');
        const registration = await navigator.serviceWorker.ready;
        
        let subscription = await registration.pushManager.getSubscription();
        if (!subscription) {
            subscription = await registration.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: urlBase64ToUint8Array(PUBLIC_VAPID_KEY)
            });
        }

        // Save to Supabase
        const { error } = await supabaseClient.from('push_subscriptions').insert([{
            azienda_id: String(currentProfile.azienda_id),
            nome_dipendente: currentProfile.name,
            subscription: subscription
        }]);

        if (error) throw error;

        btn.textContent = 'Notifiche Attive ✓';
        btn.style.background = '#10b981';
        status.textContent = 'Iscrizione completata con successo!';
        status.style.color = '#10b981';
    } catch (e) {
        console.error('Errore Push:', e);
        btn.textContent = 'Riprova';
        btn.disabled = false;
        btn.style.background = '#ef4444';
        status.textContent = e.message === 'Service Worker non supportato' 
            ? 'Il tuo browser non supporta le notifiche push.' 
            : 'Devi consentire le notifiche nel popup del browser.';
        status.style.color = '#ef4444';
    }
}

