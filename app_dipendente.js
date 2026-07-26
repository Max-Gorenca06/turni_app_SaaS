// ⚠️ Usa la stessa chiave di script.js
const SUPABASE_URL = 'https://mrwjqeachzcmnwahnqjn.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1yd2pxZWFjaHpjbW53YWhucWpuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgxNDcxMTksImV4cCI6MjA5MzcyMzExOX0.S1WVO4y59azzM-iQss_836KHtK1gnmpfglRXZ1KRKdQ';

const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let allProfiles = [];
let currentProfile = null;
let currentStatus = null; // for timbratore
let lastRecordId = null;

document.addEventListener('DOMContentLoaded', () => {
    const savedProfiles = localStorage.getItem('tc_employee_profiles');
    if (savedProfiles) {
        allProfiles = JSON.parse(savedProfiles);
        currentProfile = allProfiles[0];
        showApp();
        loadData();
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

            // Tentativo 1: Uso della funzione RPC sicura (consigliata)
            const { data: rpcData, error: rpcError } = await supabaseClient
                .rpc('verify_staff_credentials', { p_email: email, p_password: password });

            if (!rpcError && rpcData && rpcData.length > 0) {
                staffData = rpcData;
            } else {
                // Fallback di compatibilità per tabelle tradizionali
                const { data: directData, error: directError } = await supabaseClient
                    .from('staff')
                    .select('*, aziende(nome_ristorante)')
                    .eq('email', email)
                    .eq('password', password);
                
                if (directError) throw directError;
                staffData = directData;
            }

            if (staffData && staffData.length > 0) {
                allProfiles = staffData;
                currentProfile = allProfiles[0];
                localStorage.setItem('tc_employee_profiles', JSON.stringify(allProfiles));
                showApp();
                loadData();
            } else {
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
        currentProfile = allProfiles.find(p => p.azienda_id === e.target.value);
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
        opt.textContent = p.aziende ? p.aziende.nome_ristorante : 'Azienda Sconosciuta';
        if (p.azienda_id === currentProfile.azienda_id) opt.selected = true;
        select.appendChild(opt);
    });

    updateProfileView();
}

function updateProfileView() {
    document.getElementById('user-name').textContent = currentProfile.name.split(' ')[0];
    document.getElementById('user-avatar').textContent = currentProfile.name.charAt(0).toUpperCase();
    
    document.getElementById('prof-name').textContent = currentProfile.name;
    document.getElementById('prof-email').textContent = currentProfile.email || 'N/D';
    document.getElementById('prof-reparto').textContent = currentProfile.reparto || 'N/D';

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
                return `<div style="padding: 5px 0; border-bottom: 1px solid #e2e8f0; display:flex; justify-content:space-between;">
                    <span>${new Date(t.ingresso).toLocaleDateString('it-IT')}</span>
                    <strong>${i} - ${u}</strong>
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
            }).eq('id', lastRecordId);
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
