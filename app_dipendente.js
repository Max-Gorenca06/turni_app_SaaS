// ⚠️ Usa la stessa chiave di script.js
const SUPABASE_URL = 'https://mrwjqeachzcmnwahnqjn.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1yd2pxZWFjaHpjbW53YWhucWpuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgxNDcxMTksImV4cCI6MjA5MzcyMzExOX0.S1WVO4y59azzM-iQss_836KHtK1gnmpfglRXZ1KRKdQ';

const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let currentUser = null;
let currentAzienda = null;
let currentStatus = null; // for timbratore
let lastRecordId = null;

document.addEventListener('DOMContentLoaded', () => {
    // Check local storage for session
    const savedUser = localStorage.getItem('tc_employee_user');
    if (savedUser) {
        currentUser = JSON.parse(savedUser);
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
            // Find staff with email and password
            const { data, error } = await supabaseClient
                .from('staff')
                .select('*')
                .eq('email', email)
                .eq('password', password);

            if (error) throw error;

            if (data && data.length > 0) {
                currentUser = data[0];
                localStorage.setItem('tc_employee_user', JSON.stringify(currentUser));
                showApp();
                loadData();
            } else {
                err.style.display = 'block';
            }
        } catch (e) {
            console.error(e);
            err.textContent = 'Errore di connessione.';
            err.style.display = 'block';
        }

        btn.textContent = 'Accedi';
        btn.disabled = false;
    });

    // Logout
    document.getElementById('logout-btn').addEventListener('click', () => {
        localStorage.removeItem('tc_employee_user');
        window.location.reload();
    });

    // Navigation
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

    // Clock
    setInterval(() => {
        const now = new Date();
        document.getElementById('app-clock').textContent = now.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    }, 1000);

    // Timbratore Swipe
    setupSwipe();

    // Absence form
    document.getElementById('absence-form').addEventListener('submit', submitAbsence);
});

function showApp() {
    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('app-screen').style.display = 'flex';
    
    document.getElementById('user-name').textContent = currentUser.name.split(' ')[0];
    document.getElementById('user-avatar').textContent = currentUser.name.charAt(0).toUpperCase();
    
    document.getElementById('prof-name').textContent = currentUser.name;
    document.getElementById('prof-email').textContent = currentUser.email || 'N/D';
    document.getElementById('prof-reparto').textContent = currentUser.reparto || 'N/D';

    // Get time of day
    const hour = new Date().getHours();
    let greeting = 'Buongiorno,';
    if (hour >= 14 && hour < 18) greeting = 'Buon pomeriggio,';
    else if (hour >= 18) greeting = 'Buonasera,';
    document.getElementById('greeting').textContent = greeting;
}

async function loadData() {
    // 1. Get Azienda Name
    const { data: azData } = await supabaseClient.from('aziende').select('nome_ristorante').eq('id', currentUser.azienda_id).single();
    if (azData) {
        document.getElementById('azienda-name').textContent = azData.nome_ristorante;
    }

    // 2. Load Shifts
    loadShifts();

    // 3. Load Timbrature status
    checkTimbratoreStatus();

    // 4. Load Absences
    loadAbsences();
}

async function loadShifts() {
    const list = document.getElementById('turni-list');
    try {
        // Find the current week's griglia
        // (A simplified version: just fetch the latest griglia for the azienda)
        const { data: griglie } = await supabaseClient
            .from('griglie_turni')
            .select('*')
            .eq('azienda_id', currentUser.azienda_id)
            .order('data_lunedi', { ascending: false })
            .limit(1);

        if (!griglie || griglie.length === 0) {
            list.innerHTML = '<div class="empty-state"><div class="empty-icon">🏖️</div><div>Nessun turno assegnato questa settimana.</div></div>';
            return;
        }

        const g = griglie[0];
        const dati = g.dati_griglia || {};
        let myShifts = [];
        
        // Dati is an object with keys like "Lunedì-pranzo", "Lunedì-cena", "Martedì-..."
        // Each key has an array of objects {name: "Mario Rossi", ...}
        
        const daysOrder = ['Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato', 'Domenica'];

        for (const [key, staffArray] of Object.entries(dati)) {
            if (key.startsWith('_metadata') || !Array.isArray(staffArray)) continue;
            
            const isAssigned = staffArray.some(s => s.name === currentUser.name);
            if (isAssigned) {
                const parts = key.split('-');
                const day = parts[0];
                const shift = parts.slice(1).join('-');
                myShifts.push({ day, shift });
            }
        }

        // Sort by day of week
        myShifts.sort((a, b) => daysOrder.indexOf(a.day) - daysOrder.indexOf(b.day));

        if (myShifts.length === 0) {
            list.innerHTML = '<div class="empty-state"><div class="empty-icon">🏖️</div><div>Nessun turno assegnato questa settimana.</div></div>';
        } else {
            list.innerHTML = myShifts.map(s => `
                <div class="shift-card">
                    <div>
                        <div class="shift-day">${s.day}</div>
                        <div class="shift-time">${capitalize(s.shift)}</div>
                    </div>
                    <div class="shift-role">${currentUser.reparto}</div>
                </div>
            `).join('');
        }
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
            .eq('azienda_id', currentUser.azienda_id)
            .eq('nome_dipendente', currentUser.name)
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
        }

        if (data && data.length > 0 && !data[0].uscita) {
            // Already clocked in
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
    const maxDrag = 250; // area width (300) - btn width (50)

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

    // Mouse support for testing
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
                azienda_id: currentUser.azienda_id,
                nome_dipendente: currentUser.name,
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
            checkTimbratoreStatus(); // refresh list
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
            azienda_id: currentUser.azienda_id,
            nome_dipendente: currentUser.name,
            data_assenza: date,
            tipo_assenza: type,
            nota: note
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
            .eq('azienda_id', currentUser.azienda_id)
            .eq('nome_dipendente', currentUser.name)
            .order('data_assenza', { ascending: false })
            .limit(10);
            
        if (data && data.length > 0) {
            div.innerHTML = data.map(a => `
                <div style="background: #ffffff; padding: 12px; margin-bottom: 8px; border-radius: 8px; border: 1px solid #e2e8f0; display:flex; justify-content: space-between;">
                    <div>
                        <div style="font-weight: 600;">${new Date(a.data_assenza).toLocaleDateString('it-IT')}</div>
                        <div style="font-size: 12px; color: #64748b;">${capitalize(a.tipo_assenza)} ${a.nota ? '- '+a.nota : ''}</div>
                    </div>
                </div>
            `).join('');
        } else {
            div.innerHTML = '<div style="font-size:14px; color:#64748b;">Nessuna richiesta recente.</div>';
        }
    } catch(e) {
        console.error(e);
    }
}
