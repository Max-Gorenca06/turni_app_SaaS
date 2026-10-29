function generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        var r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

/* global supabase, html2pdf, html2canvas, Capacitor */

document.addEventListener('DOMContentLoaded', () => {
    if (typeof MobileDragDrop !== 'undefined') {
        try {
            MobileDragDrop.polyfill({
                dragImageTranslateOverride: MobileDragDrop.scrollBehaviourDragImageTranslateOverride || window.scrollBehaviourDragImageTranslateOverride
            });
        } catch (err) {
            console.error("Errore polyfill drag-drop:", err);
        }
    }

    // --- INIZIO FIX DEFINITIVO APPLE ---
    function setAppHeight() {
        const vh = window.innerHeight * 0.01;
        document.documentElement.style.setProperty('--vh', `${vh}px`);
    }
    window.addEventListener('resize', setAppHeight);
    window.addEventListener('orientationchange', setAppHeight);
    setAppHeight();

    document.addEventListener('touchmove', function(e) {
        if (e.target.closest('.placed')) {
            e.preventDefault();
            return;
        }
        const isScrollable = e.target.closest('#mobile-view, #sidebar, .modal-content, #main, #dashboard-container, #wizard-container, #auth-overlay');
        if (!isScrollable) {
            e.preventDefault(); 
        }
    }, { passive: false });
    // --- FINE FIX APPLE ---
  
    // Configurazione centralizzata da js/config.js (con fallback)
    const SUPABASE_URL = (window.SUPABASE_CONFIG && window.SUPABASE_CONFIG.URL) || 'https://api.158.180.239.147.sslip.io';
    const SUPABASE_ANON_KEY = (window.SUPABASE_CONFIG && window.SUPABASE_CONFIG.ANON_KEY) || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNzkxNDQ4MTcwLCJleHAiOjIxMDY4MDgxNzB9.v6w9RwQBBKxdC0-sN08whXB0NjRbWgy_tCzuX_piuWk';
    
    window.supabaseClient = (window.getSupabaseClient && window.getSupabaseClient()) || null;
    let supabaseClient = window.supabaseClient;
    if (!supabaseClient && typeof supabase !== 'undefined') {
        try {
            supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
            window.supabaseClient = supabaseClient;
        } catch (err) {
            console.error("Errore inizializzazione Supabase client:", err);
        }
    } else if (!supabaseClient) {
        console.warn("Libreria Supabase non trovata globale.");
    }

    let isLoggedIn = false;
    let isOffline = false;
    
    window.isHistoricalMode = false;
    window.assenzeSettimana = {}; 
    window.assenzeGlobali = {};
    window.assenzeGlobaliRaw = [];
    
    // VARIABILE CHIAVE SAAS: Identifica a quale ristorante appartieni
    let currentAziendaId = null;
    let isAdmin = false; 

    // --- FUNZIONE CERVELLO: RACCOGLIE TUTTI I DATI DELLA GRIGLIA ---
    function getGridData() {
        const data = {};
        data["_metadata_title"] = elements.tableHeaderTitle.value;
        data["_metadata_start_date"] = elements.startDatePicker.value;
        data["_metadata_assenze"] = window.assenzeSettimana;
        
        document.querySelectorAll('.cell').forEach(cell => {
            const names = Array.from(cell.querySelectorAll('.placed')).map(p => ({ 
                name: p.dataset.name, inDubbio: p.classList.contains('in-dubbio'), timeTag: p.dataset.timeTag || '' }));
            if (names.length) data[cell.dataset.cellId] = names;
        });
        return data;
    }

    
    async function controllaStatoLogin() {
        if (!supabaseClient) {
            isLoggedIn = false;
            currentAziendaId = null;
            mostraAuth();
            return;
        }
        try {
            const { data: { session } } = await supabaseClient.auth.getSession();
            isLoggedIn = !!session; 
            
            if (isLoggedIn) {
                isAdmin = true;
                let aziendeList = [];
                if (window.TurniAuth && typeof window.TurniAuth.fetchUserAziende === 'function') {
                    const res = await window.TurniAuth.fetchUserAziende(session.user.id);
                    aziendeList = Array.isArray(res) ? res : (res?.aziende || []);
                } else {
                    const { data } = await window.supabaseClient.rpc('get_my_aziende');
                    aziendeList = data || [];
                }

                if (aziendeList && aziendeList.length > 0) {
                    mostraDashboard(aziendeList);
                } else {
                    mostraWizard();
                }
            } else {
                const urlParams = new URLSearchParams(window.location.search);
                currentAziendaId = urlParams.get('id') || urlParams.get('azienda_id');
                if (currentAziendaId) {
                    avviaWorkspace();
                } else {
                    mostraAuth();
                }
            }
        } catch (e) {
            console.error("Errore controllaStatoLogin:", e);
            isLoggedIn = false;
            currentAziendaId = null;
            mostraAuth();
        }
    }

    
    function mostraDashboard(aziendeList) {
    window._lastAziendeList = aziendeList;
        document.getElementById('auth-overlay').style.display = 'none';
        document.getElementById('workspace-container').style.display = 'none';
        document.getElementById('wizard-container').style.display = 'none';
        document.getElementById('dashboard-container').style.display = 'block';

        
        
        const listContainer = document.getElementById('dashboard-list');
        listContainer.innerHTML = '';
        
        
        const btnOpenStats = document.getElementById('btn-open-global-stats');
        const globalStatsModal = document.getElementById('global-stats-modal');
        const closeGlobalStats = document.getElementById('close-global-stats');
        
        if (btnOpenStats && globalStatsModal) {
            // Remove old listener if exists to prevent duplicates on multiple renders
            const newBtn = btnOpenStats.cloneNode(true);
            btnOpenStats.parentNode.replaceChild(newBtn, btnOpenStats);
            
            newBtn.addEventListener('click', () => {
                globalStatsModal.style.display = 'flex';
                caricaStatisticheGlobali();
            });
            
            closeGlobalStats.addEventListener('click', () => {
                globalStatsModal.style.display = 'none';
            });
        }




        if (!aziendeList || aziendeList.length === 0) {
            listContainer.innerHTML = '<p>Nessuna attività trovata.</p>';
        } else {
            aziendeList.forEach(az => {
                const card = document.createElement('div');
                card.style.background = '#fff';
                card.style.padding = '24px';
                card.style.borderRadius = '12px';
                card.style.boxShadow = '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)';
                card.style.cursor = 'pointer';
                card.style.transition = 'transform 0.2s, box-shadow 0.2s';
                card.style.display = 'flex';
                card.style.flexDirection = 'column';
                card.style.justifyContent = 'space-between';
                
                card.onmouseover = () => {
                    card.style.transform = 'translateY(-2px)';
                    card.style.boxShadow = '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)';
                };
                card.onmouseout = () => {
                    card.style.transform = 'none';
                    card.style.boxShadow = '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)';
                };
                
                const nome = az.nome_ristorante || az.nome || az.name || az.ragione_sociale || 'Attività ' + az.id.substring(0,6);
                
                card.innerHTML = `
                    <div>
                        <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 15px;">
                            <h3 style="margin: 0; color: #1e293b; font-size: 18px; font-weight: 600;">${nome}</h3>
                            <span style="background: #e0e7ff; color: #4338ca; padding: 4px 8px; border-radius: 9999px; font-size: 11px; font-weight: 500;">Attivo</span>
                        </div>
                        <p style="font-size:12px; color:#64748b; margin-top:0; margin-bottom: 20px;">ID: ${az.id.substring(0, 8)}...</p>
                    </div>
                    <div style="display: flex; gap: 8px; flex-wrap: wrap;">
                        <button class="btn open-azienda-btn" style="flex: 1; padding: 10px; font-size: 13px; background: #3b82f6; border-radius: 6px;">Apri Turni</button>
                        <a href="app_dipendente.html" target="_blank" class="btn open-emp-app-btn" onclick="event.stopPropagation();" style="padding: 10px 12px; font-size: 13px; background: #10b981; color: white; text-decoration: none; border-radius: 6px; display: inline-flex; align-items: center; justify-content: center;" title="Apri App Dipendenti">📱 App</a>
                        <button class="btn secondary edit-azienda-btn" style="padding: 10px; font-size: 13px; border-radius: 6px;" data-id="${az.id}">⚙️</button>
                    </div>
                `;
                
                card.addEventListener('click', async (e) => {
                    if (e.target.classList.contains('edit-azienda-btn') || e.target.closest('.edit-azienda-btn')) {
                        e.stopPropagation();
                        currentAziendaId = az.id;
                        await loadConfig();
                        mostraWizard();
                        return;
                    }
                    
                    // Click on card or "Apri" button
                    currentAziendaId = az.id;
                    const sessionResp = await supabaseClient.auth.getSession();
                    if (sessionResp.data && sessionResp.data.session && sessionResp.data.session.user) {
                        await window.supabaseClient.from('profili').upsert(
                            { id: sessionResp.data.session.user.id, azienda_id: az.id },
                            { onConflict: 'id,azienda_id' }
                        );
                    }
                    avviaWorkspace();
                });
                listContainer.appendChild(card);
            });
        }
    }

    document.getElementById('btn-dashboard-logout')?.addEventListener('click', effettuaLogout);

    function mostraAuth() {
        document.getElementById('auth-overlay').style.display = 'block';
        document.getElementById('workspace-container').style.display = 'none';
        document.getElementById('wizard-container').style.display = 'none';
        document.getElementById('dashboard-container').style.display = 'none';



    }

            async function mostraWizard() {
        document.getElementById('auth-overlay').style.display = 'none';
        document.getElementById('workspace-container').style.display = 'none';
        document.getElementById('wizard-container').style.display = 'flex';
        const shareInput = document.getElementById('share-link-input');
        if (shareInput) {
            shareInput.value = currentAziendaId ? (window.location.origin + window.location.pathname + '?id=' + currentAziendaId) : '';
        }
        document.getElementById('dashboard-container').style.display = 'none';
        
        if (currentAziendaId) {
            document.getElementById('wiz-btn-genera').textContent = "Aggiorna Configurazione Azienda 🚀";
            const { data: azData } = await window.supabaseClient.from('aziende').select('nome_ristorante').eq('id', currentAziendaId).single();
            if (azData) document.getElementById('wiz-nome-azienda').value = azData.nome_ristorante || '';
            
            const turniStr = turni.map(t => {
                const f = fasceOrarie[t.toLowerCase().replace(/\s+/g, "_")] || "generale";
                return t + ": " + f;
            }).join('\n');
            document.getElementById('wiz-turni').value = turniStr;

            if (repartiAzienda) {
                document.getElementById('wiz-reparti').value = repartiAzienda.join('\n');
            }
            
            // Carica la preferenza layout colonne
            const wizColMode = document.getElementById('wiz-col-mode');
            if (wizColMode) {
                let isOneCol = localStorage.getItem('one-col-mode') === 'true';
                wizColMode.value = isOneCol ? "1" : "2";
            }

            const wizEnableTime = document.getElementById('wiz-enable-time');
            if (wizEnableTime) {
                // Se enableTimeTags non è definito, di default è true per retrocompatibilità
                wizEnableTime.checked = (window.currentConfig && window.currentConfig.enableTimeTags !== undefined) 
                                        ? window.currentConfig.enableTimeTags 
                                        : true;
            }
            
            const stData = await loadStaff();
            if (stData) {
                const staffStr = stData.map(s => {
                    let str = s.name + ", " + s.reparto;
                    if (s.is_fisso) str += ", fisso";
                    if (s.fa_camere) str += ", camere";
                    return str;
                }).join('\n');
                
            }
        } else {
            document.getElementById('wiz-btn-genera').textContent = "Genera Ambiente di Lavoro 🚀";
            
            document.getElementById('wiz-nome-azienda').value = '';
            
            // Pre-fill da una configurazione esistente
            const { data: existingConfigs } = await window.supabaseClient.from('griglie_turni').select('dati_griglia').eq('data_lunedi', '1970-01-01').limit(1);
            if (existingConfigs && existingConfigs.length > 0) {
                const config = typeof existingConfigs[0].dati_griglia === 'string' ? JSON.parse(existingConfigs[0].dati_griglia) : existingConfigs[0].dati_griglia;
                if (config.turni && config.fasceOrarie) {
                    const turniStr = config.turni.map(t => {
                        const f = config.fasceOrarie[t.toLowerCase().replace(/\s+/g, "_")] || "generale";
                        return t + ": " + f;
                    }).join('\n');
                    document.getElementById('wiz-turni').value = turniStr;
                }
                if (config.repartiAzienda) {
                    document.getElementById('wiz-reparti').value = config.repartiAzienda.join('\n');
                }
                const wizEnableTime = document.getElementById('wiz-enable-time');
                if (wizEnableTime) {
                    wizEnableTime.checked = config.enableTimeTags !== undefined ? config.enableTimeTags : true;
                }
            } else {
                document.getElementById('wiz-turni').value = '';
                document.getElementById('wiz-reparti').value = '';
                const wizEnableTime = document.getElementById('wiz-enable-time');
                if (wizEnableTime) wizEnableTime.checked = true;
            }
        }
        
        // Add cancel button if not present
        if (!document.getElementById('wiz-btn-annulla')) {
            const cancelBtn = document.createElement('button');
            cancelBtn.id = 'wiz-btn-annulla';
            cancelBtn.className = 'btn secondary';
            cancelBtn.textContent = 'Annulla';
            cancelBtn.style.cssText = 'width: 100%; padding: 15px; font-size: 18px; border: none; border-radius: 5px; cursor: pointer; font-weight: bold; margin-top: 10px;';
            cancelBtn.onclick = () => {
                if (!currentAziendaId && (document.getElementById('wiz-nome-azienda').value !== '' || document.getElementById('wiz-turni').value !== '')) {
                    if (!confirm("Sei sicuro di voler annullare? Le modifiche andranno perse.")) return;
                }
                location.reload();
            };
            document.getElementById('wiz-btn-genera').parentNode.appendChild(cancelBtn);
        } else {
            document.getElementById('wiz-btn-annulla').style.display = 'block';
            document.getElementById('wiz-btn-annulla').onclick = () => {
                if (!currentAziendaId && (document.getElementById('wiz-nome-azienda').value !== '' || document.getElementById('wiz-turni').value !== '')) {
                    if (!confirm("Sei sicuro di voler annullare? Le modifiche andranno perse.")) return;
                }
                location.reload();
            };
        }
    }

        async function avviaWorkspace() {
        document.getElementById('auth-overlay').style.display = 'none';
        document.getElementById('wizard-container').style.display = 'none';
        document.getElementById('dashboard-container').style.display = 'none';
        // Non mostriamo subito il workspace qui

        aggiornaInterfacciaLogin();

            const btnBack = document.getElementById('btn-back-dashboard');
        if (btnBack) {
            btnBack.style.display = 'inline-block';
            const newBtn = btnBack.cloneNode(true);
            btnBack.parentNode.replaceChild(newBtn, btnBack);
            newBtn.addEventListener('click', () => {
                location.reload(); 
            });
        }

        const spinner = document.getElementById('loading-spinner');
        if(spinner) spinner.style.display = 'block';

        let hasConfig = false;
        if (currentAziendaId) {
            hasConfig = await loadConfig();
            await loadStaff();
        }

        if (!hasConfig) {
            if(spinner) spinner.style.display = 'none';
            if (isLoggedIn) {
                mostraWizard();
            } else {
                mostraAuth();
            }
            return;
        }

        // Ora possiamo mostrare il workspace
        document.getElementById('workspace-container').style.display = 'flex';

        const bell = document.getElementById('notification-bell');
        if (bell) {
            const newBell = bell.cloneNode(true);
            bell.parentNode.replaceChild(newBell, bell);
            newBell.addEventListener('click', () => {
                const absencesModal = document.getElementById('absences-modal');
                if (absencesModal) {
                    absencesModal.classList.add('show');
                    if (typeof renderAbsencesList === 'function') renderAbsencesList();
                }
            });
        }

        let oggi = new Date();
        let giornoOggi = oggi.getDay();
        let diffOggi = oggi.getDate() - giornoOggi + (giornoOggi === 0 ? -6 : 1);
        let lunediCorrente = new Date(oggi.setDate(diffOggi));
        lunediCorrente.setHours(0,0,0,0);
        const offset = lunediCorrente.getTimezoneOffset() * 60000;
        const targetStr = new Date(lunediCorrente - offset).toISOString().split('T')[0];
        
        elements.startDatePicker.value = targetStr;

        generateGrid();
        populateSidebar();
        
        if (currentAziendaId) {
            await loadState();
            applyAdminModules();
            setupAdminRealtime();
        }

        if(spinner) spinner.style.display = 'none';
    }

    function applyAdminModules() {
        if (!currentAziendaId || !window._lastAziendeList) return;
        const az = window._lastAziendeList.find(a => a.id === currentAziendaId);
        if (!az) return;

        const moduli = az.moduli_attivi || {
            mod_timbratore: true,
            mod_assenze: true,
            mod_compliance_legale: false,
            mod_notifiche_push: false,
            mod_export_payroll: false,
            mod_statistiche: true,
            mod_clonazione: true
        };

        // Assenze
        const absBtn = document.getElementById('open-absences-btn');
        const bell = document.getElementById('notification-bell');
        if (absBtn) absBtn.style.display = moduli.mod_assenze ? 'inline-block' : 'none';
        if (bell) bell.style.display = moduli.mod_assenze ? 'flex' : 'none';

        // Export CSV/Payroll/PDF
        const exportCsvBtn = document.getElementById('export-csv-btn');
        const importCsvBtn = document.getElementById('import-csv-btn');
        const exportPdfBtn = document.getElementById('export-pdf-btn');
        if (exportCsvBtn) exportCsvBtn.style.display = moduli.mod_export_payroll ? 'inline-block' : 'none';
        if (importCsvBtn) importCsvBtn.style.display = moduli.mod_export_payroll ? 'inline-block' : 'none';
        if (exportPdfBtn) exportPdfBtn.style.display = moduli.mod_export_payroll ? 'inline-block' : 'none';

        // Statistiche
        const statsBtn = document.getElementById('btn-open-global-stats');
        if (statsBtn) statsBtn.style.display = moduli.mod_statistiche ? 'inline-block' : 'none';

        // Clonazione
        const copyPrevBtn = document.getElementById('copyPrevBtn');
        const cloneWeekBtn = document.getElementById('clone-week-btn');
        if (copyPrevBtn) copyPrevBtn.style.display = moduli.mod_clonazione ? 'inline-block' : 'none';
        if (cloneWeekBtn) cloneWeekBtn.style.display = moduli.mod_clonazione ? 'inline-block' : 'none';

        // Salviamo in globale così altre funzioni (es. compliance 7gg) possono leggerlo
        window.currentAziendaModuli = moduli;
    }


    
    async function effettuaLogin(email, password) {
        if (!email || !password) return alert("Inserisci email e password.");
        showToast("Accesso in corso...");
        try {
            const { error } = await supabaseClient.auth.signInWithPassword({ email, password });
            if (error) {
                alert("Errore di accesso: " + error.message);
            } else {
                location.reload(); 
            }
        } catch (e) {
            console.error("Errore login:", e);
            alert("Errore durante l'accesso.");
        }
    }

    async function effettuaRegistrazione(email, password) {
        if (!email || !password) return alert("Inserisci email e password.");
        showToast("Registrazione in corso...");
        try {
            const { error } = await supabaseClient.auth.signUp({ email, password });
            if (error) {
                
                if (error.message.includes("rate limit")) {
                    alert("Errore: limite di registrazioni orarie superato. \n\nPer risolvere: vai su Supabase -> Authentication -> Providers -> Email e DISATTIVA 'Confirm email'.\n\nNel frattempo, prova con un'altra email (es: test@test.com).");
                } else {
                    alert("Errore di registrazione: " + error.message);
                }
    
            } else {
                alert("Registrazione completata! Ora effettua il login.");
            }
        } catch (e) {
            console.error("Errore registrazione:", e);
            alert("Errore durante la registrazione.");
        }
    }


    async function effettuaLogout() {
        if (!supabaseClient) return;
        try {
            await supabaseClient.auth.signOut();
            showToast("Chiusura sistema in corso...");
            setTimeout(() => location.reload(), 1000); 
        } catch (e) {
            console.error("Errore logout:", e);
            location.reload();
        }
    }

    function aggiornaInterfacciaLogin() {
        const loginForm = document.getElementById('login-form');
        const logoutForm = document.getElementById('logout-form');
        if (loginForm && logoutForm) {
            loginForm.style.display = isLoggedIn ? 'none' : 'block';
            logoutForm.style.display = isLoggedIn ? 'block' : 'none';
        }
        
        const staffTitle = document.querySelector('#sidebar h3');
        const sidebarContent = document.getElementById('sidebar-content');

        if (staffTitle) staffTitle.style.display = isLoggedIn ? 'block' : 'none';
        if (sidebarContent) sidebarContent.style.display = isLoggedIn ? 'block' : 'none';
        const btnReset = document.getElementById('resetBtn'); 
        const btnManageStaff = document.getElementById('manageStaffBtn'); 
        const btnPublish = document.getElementById('publishBtn');
        const btnSettings = document.getElementById('settingsBtn');
        const btnImportCsv = document.getElementById('import-csv-btn');

        if(btnReset) btnReset.style.display = isLoggedIn ? 'inline-block' : 'none';
        if(btnManageStaff) btnManageStaff.style.display = isLoggedIn ? 'inline-block' : 'none';
        if(btnPublish) btnPublish.style.display = 'inline-block';
        if(btnSettings) btnSettings.style.display = isLoggedIn ? 'inline-block' : 'none';
        if(btnImportCsv) btnImportCsv.style.display = isLoggedIn ? 'inline-block' : 'none';
        if(btnSettings) {
            btnSettings.style.display = isLoggedIn ? 'inline-block' : 'none';
            btnSettings.addEventListener('click', mostraWizard);
        }

        const openAbsencesBtn = document.getElementById('open-absences-btn');
        const absencesModal = document.getElementById('absences-modal');
        const closeAbsencesBtn = document.getElementById('close-absences-modal');

        if (openAbsencesBtn && absencesModal) {
            openAbsencesBtn.addEventListener('click', () => {
                absencesModal.classList.add('show');
                if (typeof renderAbsencesList === 'function') renderAbsencesList();
            });
        }
        if (closeAbsencesBtn && absencesModal) {
            closeAbsencesBtn.addEventListener('click', () => {
                absencesModal.classList.remove('show');
            });
        }
        
        const addAbsBtn = document.getElementById('add-abs-btn');
        if (addAbsBtn) {
            addAbsBtn.addEventListener('click', async () => {
                const name = document.getElementById('abs-name').value;
                const day = document.getElementById('abs-day').value;
                const shift = document.getElementById('abs-shift').value;
                if (!name || !day) return alert("Compila tutti i campi");

                addAbsBtn.disabled = true;
                try {
                    const { error } = await supabaseClient.from('assenze_globali').insert([{
                        azienda_id: currentAziendaId,
                        nome_dipendente: name,
                        data_inizio: day,
                        data_fine: day,
                        turno_specifico: shift,
                        motivo: "Inserito da Manager",
                        stato: 'APPROVATA'
                    }]);
                    if (error) throw error;
                    await caricaAssenzeGlobali();
                    if (typeof renderAbsencesList === 'function') renderAbsencesList();
                    generateGrid();
                } catch (err) {
                    console.error(err);
                    alert("Errore nell'inserimento dell'assenza");
                }
                addAbsBtn.disabled = false;
            });
        }

        if (typeof renderMobileView === 'function') renderMobileView();
    }

        async function loadConfig() {
        if (!supabaseClient || !currentAziendaId) return false;
        const { data, error } = await supabaseClient
            .from('griglie_turni')
            .select('dati_griglia')
            .eq('azienda_id', currentAziendaId)
            .eq('data_lunedi', '1970-01-01')
            .single();

        if (error && error.code !== 'PGRST116') {
            console.error("Errore loadConfig:", error);
        }

        if (data && data.dati_griglia) {
            const config = typeof data.dati_griglia === 'string' ? JSON.parse(data.dati_griglia) : data.dati_griglia;
            window.currentConfig = config;
            if (config.turni) turni = config.turni;
            if (config.fasceOrarie) fasceOrarie = config.fasceOrarie;
            if (config.repartiAzienda) repartiAzienda = config.repartiAzienda;
            
            // Carica preferenza layout colonne
            const isOneCol = (config.layoutColonne === 1 || config.layoutColonne === '1');
            if (isOneCol) {
                document.body.classList.add('one-col-mode');
                document.getElementById('main')?.classList.add('one-col-mode');
                localStorage.setItem('one-col-mode', 'true');
            } else {
                document.body.classList.remove('one-col-mode');
                document.getElementById('main')?.classList.remove('one-col-mode');
                localStorage.setItem('one-col-mode', 'false');
            }
            
            // Popola la select dei reparti nello staff form
            const staffGroupSelect = document.getElementById('staff-group');
            if (staffGroupSelect) {
                staffGroupSelect.innerHTML = '<option value="" disabled selected>Seleziona Gruppo</option>';
                repartiAzienda.forEach(r => {
                    const opt = document.createElement('option');
                    opt.value = r;
                    opt.textContent = r;
                    staffGroupSelect.appendChild(opt);
                });
            }
            return true;
        } else {
            return false;
        }
    }

    const elements = {
        tableHeaderTitle: document.getElementById('table-header-title'),
        gridBody: document.getElementById("grid"),
        sidebarContent: document.getElementById("sidebar-content"),
        saveStatus: document.getElementById('save-status'),
        staffModal: document.getElementById('staff-modal'),
        staffList: document.getElementById('staff-list-container'),
        staffForm: document.getElementById('staff-form'),
        resetBtn: document.getElementById('resetBtn'),
        printBtn: document.getElementById('printBtn'),
        exportPdfBtn: document.getElementById('export-pdf-btn'),
        manageStaffBtn: document.getElementById('manageStaffBtn'),
        addNewStaffBtn: document.getElementById('add-new-staff-btn'),
        cancelEditBtn: document.getElementById('cancel-edit'),
        startDatePicker: document.getElementById('start-date-picker'),
        closeModalBtn: document.querySelector('.close-button')
    };

    const giorni = ["Lunedì", "Martedì", "Mercoledì", "Giovedì", "Venerdì", "Sabato", "Domenica"];
    let turni = ["Camere", "Cucina pranzo", "Sala pranzo", "Cucina cena", "Sala cena"];
    let fasceOrarie = {
        "camere": "mattina",
        "cucina_pranzo": "pranzo",
        "sala_pranzo": "pranzo",
        "cucina_cena": "cena",
        "sala_cena": "cena"
    };
    let repartiAzienda = ["Camere", "Cucina", "Sala"];
    
    let staff = [];
    let currentDraggedElement = null;
    let selectedForPlacement = null;

    // --- CARICAMENTO STAFF SAAS ---
    async function loadStaff() {
        if (!supabaseClient) {
            const localStaffRaw = localStorage.getItem('staff_backup');
            if (localStaffRaw) {
                try {
                    staff = JSON.parse(localStaffRaw);
                    isOffline = true;
                    showToast("Personale caricato offline (Sola lettura) ⚠️");
                } catch (e) {
                    staff = [];
                }
            } else {
                staff = [];
            }
            return;
        }
        // Filtra sempre per currentAziendaId e usa RPC sicura se non autenticato
        let data = null;
        let error = null;
        if (!currentAziendaId) {
            staff = [];
            window.staffData = staff;
            return staff;
        }
        if (isLoggedIn) {
            const res = await window.supabaseClient.from('staff').select('*').eq('azienda_id', currentAziendaId).order('name');
            data = res.data;
            error = res.error;
        } else {
            const rpcRes = await window.supabaseClient.rpc('get_public_staff_names', { p_azienda_id: currentAziendaId });
            if (rpcRes.error && rpcRes.error.code === 'PGRST202') {
                const fbRes = await window.supabaseClient.from('staff').select('id, name, reparto, is_fisso, fa_camere, maxshifts').eq('azienda_id', currentAziendaId).order('name');
                data = fbRes.data;
                error = fbRes.error;
            } else {
                data = rpcRes.data;
                error = rpcRes.error;
            }
        }
        
        if (error) {
            console.error("Errore di rete durante il caricamento staff:", error);
            const localStaffRaw = localStorage.getItem('staff_backup');
            if (localStaffRaw) {
                try {
                    staff = JSON.parse(localStaffRaw);
                    isOffline = true;
                    showToast("Personale caricato offline (Sola lettura) ⚠️");
                } catch (e) {
                    staff = [];
                }
            } else {
                staff = [];
            }
        } else {
            staff = data || [];
            localStorage.setItem('staff_backup', JSON.stringify(staff));
            isOffline = false;
        }
        window.staffData = staff;
        return staff;
    }

    // --- CARICAMENTO GRIGLIA SAAS ---
    async function loadState() {
        const dataLunediCercata = elements.startDatePicker.value;
        if (!dataLunediCercata) return;

        let data = null;
        if (supabaseClient) {
            // Chiediamo la griglia specifica per la data selezionata
            const { data: fetchedData } = await supabaseClient
                .from('griglie_turni')
                .select('dati_griglia, updated_at, stato')
                .eq('azienda_id', currentAziendaId)
                .eq('data_lunedi', dataLunediCercata)
                .single();
            data = fetchedData;
        }
        
        const localBackupRaw = localStorage.getItem('turni_backup');
        let localBackup = null;
        if (localBackupRaw) {
            try { localBackup = JSON.parse(localBackupRaw); } catch (e) { console.error("Errore lettura backup locale"); }
        }

            // Pulisce prima la griglia e le assenze per evitare che restino dati della settimana precedente
        document.querySelectorAll('.cell').forEach(c => {
            c.innerHTML = '';
            updateCellCounter(c);
        });
        window.assenzeSettimana = {};
        // if (elements.tableHeaderTitle) elements.tableHeaderTitle.value = ""; // Removed to avoid clearing default title
        
        let datiDaCaricare = null;
        let orarioDisplay = "";

        const timeSupabase = data && data.updated_at ? new Date(data.updated_at).getTime() : 0;
        const timeLocale = localBackup && localBackup.timestamp ? localBackup.timestamp : 0;

        if (timeLocale > timeSupabase && localBackup.data_lunedi === dataLunediCercata) {
            datiDaCaricare = localBackup.dati_griglia;
            const d = new Date(timeLocale);
            orarioDisplay = `Backup locale: ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')} ⚠️`;
            elements.saveStatus.style.color = "#e65100";
        } else if (data && data.dati_griglia) {
            datiDaCaricare = data.dati_griglia;
            const d = new Date(timeSupabase);
            orarioDisplay = `Server: ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')} (${data.stato})`;
            elements.saveStatus.style.color = "#666";
        } else {
            orarioDisplay = "Settimana vuota";
            elements.saveStatus.style.color = "#666";
        }

        updateGridHeaders();
        if (datiDaCaricare) {
            window.assenzeSettimana = datiDaCaricare["_metadata_assenze"] || {};

            Object.entries(datiDaCaricare).forEach(([id, people]) => {
                const cellDiv = document.querySelector(`.cell[data-cell-id="${id}"]`);
                if (cellDiv && !id.startsWith("_metadata")) {
                    cellDiv.innerHTML = '';
                    people.forEach(p => cellDiv.appendChild(createPlacedElement(p)));
                    updateCellCounter(cellDiv);
                }
            });
        }
        await caricaAssenzeGlobali();
        elements.saveStatus.textContent = orarioDisplay;
        updateAllSidebarCounts();
        if (typeof updateMobileHeader === 'function') updateMobileHeader();
    }

    async function caricaAssenzeGlobali() {
        if (!supabaseClient || !currentAziendaId) return;
        try {
            const dataLunediCercata = elements.startDatePicker.value;
            const inizio = new Date(dataLunediCercata);
            const fine = new Date(inizio);
            fine.setDate(inizio.getDate() + 6);

            const { data, error } = await supabaseClient
                .from('assenze_globali')
                .select('*')
                .eq('azienda_id', currentAziendaId)
                .neq('stato', 'RIFIUTATA'); 

            if (error) {
                console.error("Errore fetch assenze globali:", error);
                return;
            }

            window.assenzeGlobali = {};
            window.assenzeGlobaliRaw = data || [];

            // Aggiorna il badge numerico sulla campanella (#bell-badge) con il numero di richieste IN ATTESA
            const pendingCount = (data || []).filter(a => a.stato === 'IN ATTESA').length;
            const bellBadge = document.getElementById('bell-badge');
            if (bellBadge) {
                if (pendingCount > 0) {
                    bellBadge.textContent = pendingCount > 9 ? '9+' : String(pendingCount);
                    bellBadge.style.display = 'flex';
                } else {
                    bellBadge.style.display = 'none';
                }
            }

            (data || []).forEach(assenza => {
                const start = new Date(assenza.data_inizio);
                const end = new Date(assenza.data_fine);
                const nome = assenza.nome_dipendente;
                
                if (!window.assenzeGlobali[nome]) window.assenzeGlobali[nome] = [];

                for (let i = 0; i < 7; i++) {
                    let d = new Date(inizio);
                    d.setDate(inizio.getDate() + i);
                    
                    d.setHours(0,0,0,0);
                    let s = new Date(start); s.setHours(0,0,0,0);
                    let e = new Date(end); e.setHours(0,0,0,0);
                    
                    if (d >= s && d <= e) {
                        const giornoStr = giorni[i].toLowerCase();
                        if (assenza.turno_specifico === 'Tutto il giorno' || !assenza.turno_specifico) {
                            window.assenzeGlobali[nome].push(`${giornoStr}-tutto_il_giorno`);
                        } else {
                            window.assenzeGlobali[nome].push(`${giornoStr}-${assenza.turno_specifico.toLowerCase().replace(/\s+/g, "_")}`);
                        }
                    }
                }
            });
        } catch (err) {
            console.error("Errore generico in caricaAssenzeGlobali:", err);
        }
    }

    function renderAbsencesList() {
        const list = document.getElementById('absences-list');
        if (!list) return;

        // 1. Popola i select manuali
        const nameSelect = document.getElementById('abs-name');
        const daySelect = document.getElementById('abs-day');
        const shiftSelect = document.getElementById('abs-shift');
        
        if (nameSelect && window.staffData) {
            nameSelect.innerHTML = window.staffData.map(p => `<option value="${p.name}">${p.name}</option>`).join('');
        }
        if (daySelect) {
            daySelect.innerHTML = '';
            for(let i=0; i<7; i++) {
                let d = new Date(elements.startDatePicker.value);
                d.setDate(d.getDate() + i);
                daySelect.innerHTML += `<option value="${d.toISOString().split('T')[0]}">${d.toLocaleDateString('it-IT', {weekday:'short', day:'numeric', month:'numeric'})}</option>`;
            }
        }
        if (shiftSelect && window.currentConfig && window.currentConfig.turni) {
            shiftSelect.innerHTML = `<option value="Tutto il giorno">Tutto il giorno</option>` +
                window.currentConfig.turni.map(t => `<option value="${t}">${t}</option>`).join('');
        }

        // 2. Renderizza lista
        if (!window.assenzeGlobaliRaw || window.assenzeGlobaliRaw.length === 0) {
            list.innerHTML = '<li>Nessuna richiesta o assenza presente.</li>';
            return;
        }

        let html = '';
        window.assenzeGlobaliRaw.forEach(a => {
            const inizio = new Date(a.data_inizio).toLocaleDateString('it-IT');
            const fine = new Date(a.data_fine).toLocaleDateString('it-IT');
            const dateStr = a.data_inizio === a.data_fine ? inizio : `${inizio} - ${fine}`;
            
            let statusColor = '#f59e0b';
            if (a.stato === 'APPROVATA') statusColor = '#10b981';
            
            html += `
                <li style="background: #f8fafc; border: 1px solid #e2e8f0; padding: 12px; margin-bottom: 8px; border-radius: 8px; display: flex; justify-content: space-between; align-items: center;">
                    <div>
                        <strong style="color: #334155;">${a.nome_dipendente}</strong><br>
                        <span style="font-size: 12px; color: #64748b;">${dateStr} | ${a.turno_specifico}</span>
                        ${a.motivo ? `<br><span style="font-size: 12px; color: #94a3b8; font-style: italic;">"${a.motivo}"</span>` : ''}
                    </div>
                    <div style="display: flex; gap: 5px; align-items: center;">
                        <span style="font-size: 11px; padding: 4px 8px; border-radius: 12px; background: ${statusColor}20; color: ${statusColor}; font-weight: bold; margin-right: 5px;">${a.stato}</span>
                        ${a.stato === 'IN ATTESA' ? `
                            <button onclick="gestisciAssenza('${a.id}', 'APPROVATA')" style="background: #10b981; color: white; border: none; padding: 5px 10px; border-radius: 4px; cursor: pointer; font-size: 12px;">Approva</button>
                            <button onclick="gestisciAssenza('${a.id}', 'RIFIUTATA')" style="background: #ef4444; color: white; border: none; padding: 5px 10px; border-radius: 4px; cursor: pointer; font-size: 12px;">Rifiuta</button>
                        ` : `
                            <button onclick="eliminaAssenza('${a.id}')" style="background: #ef4444; color: white; border: none; padding: 5px 10px; border-radius: 4px; cursor: pointer; font-size: 12px;">Elimina</button>
                        `}
                    </div>
                </li>
            `;
        });
        list.innerHTML = html;
    }

    let adminRealtimeChannel = null;
    function setupAdminRealtime() {
        if (!supabaseClient || !currentAziendaId) return;
        if (adminRealtimeChannel) {
            supabaseClient.removeChannel(adminRealtimeChannel);
        }

        adminRealtimeChannel = supabaseClient
            .channel('admin-channel-' + currentAziendaId)
            .on(
                'postgres_changes',
                {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'assenze_globali',
                    filter: `azienda_id=eq.${currentAziendaId}`
                },
                async (payload) => {
                    const nuova = payload.new;
                    await caricaAssenzeGlobali();
                    if (typeof renderAbsencesList === 'function') renderAbsencesList();
                    generateGrid();
                    if (nuova && nuova.stato === 'IN ATTESA') {
                        const msg = `🔔 Nuova richiesta di assenza da ${nuova.nome_dipendente}`;
                        showToast(msg);
                        if (window.TurniNotifications && window.TurniNotifications.triggerLocalOSNotification) {
                            window.TurniNotifications.triggerLocalOSNotification('Nuova Richiesta Assenza', msg, './index.html');
                        }
                    }
                }
            )
            .subscribe();
    }

    window.gestisciAssenza = async function(id, nuovoStato) {
        if (!confirm(`Vuoi davvero segnare questa richiesta come ${nuovoStato}?`)) return;
        try {
            const targetAbs = (window.assenzeGlobaliRaw || []).find(a => String(a.id) === String(id));
            const { error } = await supabaseClient.from('assenze_globali').update({ stato: nuovoStato }).eq('id', id).eq('azienda_id', currentAziendaId);
            if (error) throw error;

            // Invia notifica in-app e Web Push al dipendente interessato
            if (targetAbs && window.TurniNotifications && window.TurniNotifications.notifyEmployees) {
                const inizioStr = new Date(targetAbs.data_inizio).toLocaleDateString('it-IT');
                const fineStr = new Date(targetAbs.data_fine).toLocaleDateString('it-IT');
                const dateStr = targetAbs.data_inizio === targetAbs.data_fine ? inizioStr : `${inizioStr} - ${fineStr}`;
                const isApproved = nuovoStato === 'APPROVATA';
                window.TurniNotifications.notifyEmployees({
                    aziendaId: currentAziendaId,
                    destinatario: targetAbs.nome_dipendente,
                    titolo: isApproved ? '✅ Richiesta Approvata' : '❌ Richiesta Rifiutata',
                    messaggio: `La tua richiesta (${targetAbs.turno_specifico}) per ${dateStr} è stata ${nuovoStato.toLowerCase()}.`,
                    tipo: isApproved ? 'assenza_approvata' : 'assenza_rifiutata'
                });
            }

            await caricaAssenzeGlobali();
            renderAbsencesList();
            generateGrid(); 
            showToast(`Richiesta ${nuovoStato.toLowerCase()} e notifica inviata!`);
        } catch (e) {
            console.error(e);
            alert("Errore nell'aggiornamento dell'assenza.");
        }
    };

    window.eliminaAssenza = async function(id) {
        if (!confirm('Vuoi davvero eliminare questa assenza dal database?')) return;
        try {
            const { error } = await supabaseClient.from('assenze_globali').delete().eq('id', id).eq('azienda_id', currentAziendaId);
            if (error) throw error;
            await caricaAssenzeGlobali();
            renderAbsencesList();
            generateGrid();
        } catch (e) {
            console.error(e);
            alert("Errore nell'eliminazione dell'assenza.");
        }
    };

    // --- SALVATAGGIO GRIGLIA SAAS ---
    async function saveState() {
        if (!isLoggedIn || window.isHistoricalMode) return; 
        if (!currentAziendaId) return;

        elements.saveStatus.textContent = 'Salvataggio...';
        elements.saveStatus.style.color = "#666";
        
        const data = getGridData();
        const dataLunedi = elements.startDatePicker.value;
        
        const backupData = {
            timestamp: new Date().getTime(),
            data_lunedi: dataLunedi,
            dati_griglia: data
        };
        localStorage.setItem('turni_backup', JSON.stringify(backupData));

        // Cerca se esiste già un record per questa azienda e data
        const { data: existingRecords, error: selectErr } = await supabaseClient
            .from('griglie_turni')
            .select('id')
            .eq('azienda_id', currentAziendaId)
            .eq('data_lunedi', dataLunedi);

        let error = selectErr;
        if (!error) {
            if (existingRecords && existingRecords.length > 0) {
                const { error: updateErr } = await supabaseClient
                    .from('griglie_turni')
                    .update({
                        dati_griglia: data,
                        updated_at: new Date().toISOString(),
                        stato: 'bozza'
                    })
                    .eq('id', existingRecords[0].id);
                error = updateErr;
            } else {
                const { error: insertErr } = await supabaseClient
                    .from('griglie_turni')
                    .insert({
                        azienda_id: currentAziendaId,
                        data_lunedi: dataLunedi,
                        dati_griglia: data,
                        updated_at: new Date().toISOString(),
                        stato: 'bozza'
                    });
                error = insertErr;
            }
        }
        
        if (error) {
            console.error(error);
            elements.saveStatus.textContent = "Salvato in locale (Offline) ⚠️";
            elements.saveStatus.style.color = "#e65100";
        } else {
            elements.saveStatus.textContent = `Salvato: ${new Date().toLocaleTimeString()}`;
            elements.saveStatus.style.color = "#666";
        }
    }

    function updateGridHeaders() {
        const startDateStr = elements.startDatePicker.value;
        if (!startDateStr) return;
        
        const parts = startDateStr.split('-');
        if (parts.length !== 3) return;

        const start = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
        if (isNaN(start.getTime())) return;

        const end = new Date(start);
        end.setDate(start.getDate() + 6);
        
        const formatOptions = { day: 'numeric', month: 'long' };
        const startFormatted = start.toLocaleDateString('it-IT', formatOptions);
        const endFormatted = end.toLocaleDateString('it-IT', formatOptions);
        
        const inputTitleEl = document.getElementById('table-header-title');
        let nomeRist = "TURNI";
        if (window._lastAziendeList && currentAziendaId) {
            const az = window._lastAziendeList.find(a => a.id === currentAziendaId);
            if (az) nomeRist = (az.nome_ristorante || az.nome || az.name || az.ragione_sociale || 'TURNI').toUpperCase();
        } else if (currentAziendaId && window.supabaseClient) {
            window.supabaseClient.from('aziende').select('*').eq('id', currentAziendaId).single().then(({data}) => {
                if (data) {
                    nomeRist = (data.nome_ristorante || data.nome || data.name || data.ragione_sociale || 'TURNI').toUpperCase();
                    if (inputTitleEl) inputTitleEl.value = `${nomeRist} - DAL ${startFormatted.toUpperCase()} AL ${endFormatted.toUpperCase()}`;
                }
            });
        }
        if (inputTitleEl) inputTitleEl.value = `${nomeRist} - DAL ${startFormatted.toUpperCase()} AL ${endFormatted.toUpperCase()}`;
        const headers = document.querySelectorAll('#main table thead th');
        for (let i = 0; i < 7; i++) {
            if (headers[i+1]) {
                const d = new Date(start);
                d.setDate(start.getDate() + i);
                let dayName = d.toLocaleDateString('it-IT', { weekday: 'long' });
                dayName = dayName.charAt(0).toUpperCase() + dayName.slice(1);
                const dayStr = d.getDate().toString().padStart(2, '0') + '/' + (d.getMonth() + 1).toString().padStart(2, '0');
                headers[i+1].textContent = dayName + ' ' + dayStr;
            }
        }
    }

    function generateGrid() {
        updateGridHeaders();
        elements.gridBody.innerHTML = "";
        turni.forEach(turno => {
            const tr = document.createElement("tr");
            const tdLabel = document.createElement("td");
            tdLabel.textContent = turno;
            tdLabel.style.fontWeight = "bold";
            tr.appendChild(tdLabel);

            giorni.forEach(giorno => {
                const td = document.createElement("td");
                const cellDiv = document.createElement("div");
                cellDiv.className = "cell";
                cellDiv.dataset.cellId = `${giorno.toLowerCase()}-${turno.toLowerCase().replace(/\s+/g, "_")}`;
                td.appendChild(cellDiv);
                tr.appendChild(td);
            });
            elements.gridBody.appendChild(tr);
        });
    }

    function updateCellCounter(cellDiv) {
        const count = cellDiv.querySelectorAll('.placed').length;
        let counter = cellDiv.querySelector('.cell-counter');
        
        if (count > 0) {
            if (!counter) {
                counter = document.createElement('div');
                counter.className = 'cell-counter';
                cellDiv.appendChild(counter);
            }
            counter.textContent = count;
            counter.style.display = 'block';
        } else if (counter) {
            counter.style.display = 'none';
        }
    }


    let currentEditingTagElement = null;

    // Inizializza eventi modale tag una volta sola
    setTimeout(() => {
        const tagModal = document.getElementById('tag-modal');
        const closeTagModal = document.getElementById('close-tag-modal');
        const btnSaveTag = document.getElementById('btn-save-tag');
        const btnToggleDubbio = document.getElementById('btn-toggle-dubbio');
        const btnRemovePerson = document.getElementById('btn-remove-person');
        const tagInput = document.getElementById('tag-input');
        
        document.querySelectorAll('.tag-quick-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                if (tagInput.value && !tagInput.value.endsWith(' ')) {
                    tagInput.value += ' ' + btn.textContent;
                } else {
                    tagInput.value += btn.textContent;
                }
            });
        });

        if (closeTagModal) closeTagModal.addEventListener('click', () => tagModal.style.display = 'none');
        
        if (btnSaveTag) btnSaveTag.addEventListener('click', () => {
            if (currentEditingTagElement) {
                currentEditingTagElement.dataset.timeTag = tagInput.value.trim();
                aggiornaTestoPill(currentEditingTagElement);
                saveState();
                if (typeof renderMobileView === 'function') renderMobileView();
            }
            tagModal.style.display = 'none';
        });

        if (btnToggleDubbio) btnToggleDubbio.addEventListener('click', () => {
            if (currentEditingTagElement) {
                const giaInDubbio = currentEditingTagElement.classList.contains('in-dubbio');
                if (giaInDubbio) {
                    currentEditingTagElement.classList.remove('in-dubbio');
                    btnToggleDubbio.textContent = 'Metti in dubbio (?)';
                    showToast(`Turno confermato per ${currentEditingTagElement.dataset.name}`);
                } else {
                    currentEditingTagElement.classList.add('in-dubbio');
                    btnToggleDubbio.textContent = 'Togli dubbio';
                    showToast(`${currentEditingTagElement.dataset.name} messo in dubbio (?)`);
                }
                saveState();
            }
        });

        if (btnRemovePerson) btnRemovePerson.addEventListener('click', () => {
            if (currentEditingTagElement) {
                if (confirm(`Rimuovere "${currentEditingTagElement.dataset.name}" dal turno?`)) {
                    const parent = currentEditingTagElement.parentElement;
                    currentEditingTagElement.remove();
                    updateCellCounter(parent);
                    saveState().then(() => {
                        updateAllSidebarCounts();
                        if (typeof renderMobileView === 'function') renderMobileView(); 
                    });
                    tagModal.style.display = 'none';
                }
            }
        });
    }, 500);

    function aggiornaTestoPill(el) {
        const name = el.dataset.name;
        const timeTag = el.dataset.timeTag || '';
        const datiStaff = staff.find(s => s.name && s.name.toLowerCase() === name.toLowerCase());
        
        let textToShow = name;
        if (datiStaff && datiStaff.is_fisso) {
            textToShow += " 🔒";
        }
        if (timeTag) {
            textToShow += ` (${timeTag})`;
        }
        el.textContent = textToShow;
    }

    
    function openTagModalForElement(el, personName) {
        if (!isLoggedIn || window.isHistoricalMode) return;
        currentEditingTagElement = el;
        
        const tagModal = document.getElementById('tag-modal');
        const tagTitle = document.getElementById('tag-modal-title');
        const tagInput = document.getElementById('tag-input');
        const btnToggleDubbio = document.getElementById('btn-toggle-dubbio');
        
        tagTitle.textContent = `Turno di ${personName}`;
        tagInput.value = el.dataset.timeTag || '';
        
        if (el.classList.contains('in-dubbio')) {
            btnToggleDubbio.textContent = 'Togli dubbio';
        } else {
            btnToggleDubbio.textContent = 'Metti in dubbio (?)';
        }
        
        tagModal.style.display = 'flex';
    }

    function createPlacedElement(person) {
        const el = document.createElement('div');
        el.className = 'placed';
        el.dataset.name = person.name;
        el.dataset.timeTag = person.timeTag || '';
        el.draggable = isLoggedIn; 
        
        if (person.inDubbio) el.classList.add('in-dubbio');

        aggiornaTestoPill(el);

        el.addEventListener('click', (e) => {
            e.stopPropagation();
            openTagModalForElement(el, person.name);
        });
        
        el.addEventListener('dragstart', e => {
            if (!isLoggedIn || window.isHistoricalMode) { e.preventDefault(); return; } 
            currentDraggedElement = el;
            e.dataTransfer.setData('text/plain', JSON.stringify({ type: 'move', name: person.name }));
            setTimeout(() => el.classList.add('dragging'), 0);
        });
        
        el.addEventListener('dragend', () => {
            el.classList.remove('dragging');
            currentDraggedElement = null;
        });
        return el;
    }

    function populateSidebar() {
        elements.sidebarContent.innerHTML = '';
        const groups = staff.reduce((acc, p) => { if (!acc[p.reparto || 'Sala']) acc[p.reparto || 'Sala'] = []; acc[p.reparto || 'Sala'].push(p); return acc; }, {});
        
        Object.keys(groups).sort().forEach(g => {
            const div = document.createElement('div');
            div.innerHTML = `<div class="group-title">${g}</div>`;
            groups[g].sort((a, b) => (b.is_fisso ? 1 : 0) - (a.is_fisso ? 1 : 0));
            groups[g].forEach(p => {
                const b = document.createElement('div');
                b.className = 'block';
                b.draggable = isLoggedIn;
                b.dataset.name = p.name;
                b.innerHTML = `${p.name} <span class="shift-count">[0]</span>`;
                
                b.addEventListener('dragstart', e => {
                    if (!isLoggedIn || window.isHistoricalMode) { e.preventDefault(); return; } 
                    e.dataTransfer.setData('text/plain', JSON.stringify({ type: 'new', name: p.name }));
                });
                
                b.addEventListener('click', () => {
                    if (!isLoggedIn || window.isHistoricalMode) return; 
                    document.querySelectorAll('.selected-for-placement').forEach(el => el.classList.remove('selected-for-placement'));
                    if (selectedForPlacement?.name === p.name) {
                        selectedForPlacement = null;
                    } else {
                        selectedForPlacement = p;
                        b.classList.add('selected-for-placement');
                    }
                });
                div.appendChild(b);
            });
            elements.sidebarContent.appendChild(div);
        });
        updateAllSidebarCounts();
    }

    function updateAllSidebarCounts() {
        const counts = {};
        document.querySelectorAll('.placed').forEach(p => {
            const cell = p.closest('.cell');
            const nomeDipendente = p.dataset.name;
            const datiDipendente = staff.find(s => s.name === nomeDipendente);

            if (cell && cell.dataset.cellId.includes('camere')) {
                if (!datiDipendente || datiDipendente.reparto !== 'Camere') return; 
            }
            counts[nomeDipendente] = (counts[nomeDipendente] || 0) + 1;
        });

        document.querySelectorAll(".block").forEach(b => {
            const name = b.dataset.name;
            const person = staff.find(p => p.name === name);
            const count = counts[name] || 0;
            const span = b.querySelector('.shift-count');
            if (span) {
                span.textContent = `[${count}]`;
                span.classList.toggle('limit-reached', person && count >= person.maxshifts);
            }
        });
    }

    function addPersonToCell(cellDiv, name) {
        if (!isLoggedIn) return; 
        if (window.isHistoricalMode) return alert("⚠️ Sei in Modalità Archivio. Clicca 'Clona per oggi' se vuoi modificare questa griglia.");

        const parts = cellDiv.dataset.cellId.split('-'); 
        const giorno = parts[0]; 
        const turno = parts[1];  
        const fasciaSelezionata = fasceOrarie[turno]; 

        let haBlocco = false;
        let motivoBlocco = "";
        
        if (window.assenzeSettimana && window.assenzeSettimana[name]) {
            if (window.assenzeSettimana[name].includes(`${giorno}-tutto_il_giorno`) || 
                window.assenzeSettimana[name].includes(`${giorno}-${turno}`)) {
                haBlocco = true;
                motivoBlocco = "Nota manuale rapida";
            }
        }

        if (!haBlocco && window.assenzeGlobali && window.assenzeGlobali[name]) {
            if (window.assenzeGlobali[name].includes(`${giorno}-tutto_il_giorno`) || 
                window.assenzeGlobali[name].includes(`${giorno}-${turno}`)) {
                haBlocco = true;
                motivoBlocco = "Richiesta approvata da DB";
            }
        }

        if (haBlocco) {
            const conferma = confirm(`⚠️ RICHIESTA/ASSENZA REGISTRATA:\n\n${name} ha un blocco impostato (${motivoBlocco}).\n\nForzare l'inserimento?`);
            if (!conferma) return; 
        }

        const checkStaff = staff.find(s => s.name && s.name.toLowerCase() === name.toLowerCase());
        if (checkStaff && !checkStaff.is_fisso) {
            const celleDipendente = document.querySelectorAll(`.placed[data-name="${name}"]`);
            const giorniAssegnati = new Set();
            celleDipendente.forEach(c => {
                const pCell = c.closest('.cell');
                if (pCell && pCell.dataset.cellId) {
                    giorniAssegnati.add(pCell.dataset.cellId.split('-')[0]);
                }
            });
            
            if (giorniAssegnati.size >= 6 && !giorniAssegnati.has(giorno)) {
                const conferma7 = confirm(`⚠️ ATTENZIONE LEGALE:\n\nIl dipendente ${name} è con contratto a CHIAMATA e sta per essere inserito per il 7° giorno in questa settimana.\nLe regole legali prevedono al massimo 6 giorni su 7 per i contratti a chiamata.\n\nVuoi davvero forzare l'inserimento?`);
                if (!conferma7) return;
            }
        }

        let conflittoTrovato = false;
        let nomeTurnoConflitto = "";
        const celleDelGiorno = document.querySelectorAll(`.cell[data-cell-id^="${giorno}-"]`);
        
        celleDelGiorno.forEach(altraCella => {
            const altroTurno = altraCella.dataset.cellId.split('-')[1];
            if (fasceOrarie[altroTurno] === fasciaSelezionata) {
                const presente = Array.from(altraCella.querySelectorAll('.placed')).some(c => c.dataset.name === name);
                if (presente) {
                    conflittoTrovato = true;
                    nomeTurnoConflitto = altroTurno.replace('_', ' '); 
                }
            }
        });

        if (conflittoTrovato) {
            const fasciaStr = fasciaSelezionata ? fasciaSelezionata.toUpperCase() : 'SCONOSCIUTA'; alert(`Impossibile inserire: \"${name}\" è già in \"${nomeTurnoConflitto}\" per il ${fasciaStr}.`);
            return; 
        }

        const nuovoElemento = createPlacedElement({ name });
        cellDiv.appendChild(nuovoElemento);
        
        const shouldEnableTime = (window.currentConfig && window.currentConfig.enableTimeTags !== undefined) ? window.currentConfig.enableTimeTags : true;
        if (shouldEnableTime) {
            setTimeout(() => openTagModalForElement(nuovoElemento, name), 50);
        }

        updateCellCounter(cellDiv);

        // ==========================================
        // AUTOMAZIONE CAMERE
        // ==========================================
        const datiStaff = staff.find(s => s.name && s.name.toLowerCase() === name.toLowerCase());
        if (datiStaff && datiStaff.fa_camere) {
            if (turno === 'cucina_pranzo' || turno === 'sala_pranzo') {
                const idCellaCamere = `${giorno}-camere`;
                const cellaCamere = document.querySelector(`.cell[data-cell-id="${idCellaCamere}"]`);
                if (cellaCamere) {
                    const giaPresente = Array.from(cellaCamere.querySelectorAll('.placed')).some(c => c.dataset.name === name);
                    if (!giaPresente) {
                        cellaCamere.appendChild(createPlacedElement({ name }));
                        updateCellCounter(cellaCamere);
                        showToast(`${name} aggiunto in automatico anche alle camere 🛏️`);
                    }
                }
            }
        }
        // ==========================================

        updateAllSidebarCounts();
        saveState();
        
        if (typeof renderMobileView === 'function') renderMobileView();
    }

    elements.gridBody.addEventListener('dragover', e => {
        if (!isLoggedIn) return;
        e.preventDefault();
        const cell = e.target.closest('.cell');
        if (cell) cell.classList.add('drag-over');
    });

    elements.gridBody.addEventListener('dragleave', e => {
        if (!isLoggedIn) return;
        const cell = e.target.closest('.cell');
        if (cell) cell.classList.remove('drag-over');
    });

    elements.gridBody.addEventListener('drop', e => {
        if (!isLoggedIn) return;
        e.preventDefault();
        const cell = e.target.closest('.cell');
        if (!cell) return;
        cell.classList.remove('drag-over');
        
        let data;
        try {
            data = JSON.parse(e.dataTransfer.getData('text/plain'));
        } catch(e) {
            console.warn("Invalid drag data", e);
            return;
        }
        
        if (data.type === 'move' && currentDraggedElement) {
            const oldParent = currentDraggedElement.parentElement;
            if (oldParent === cell) return;
            currentDraggedElement.remove();
            updateCellCounter(oldParent);
        }
        
        addPersonToCell(cell, data.name);
        currentDraggedElement = null;
    });

    elements.gridBody.addEventListener('click', e => {
        if (!isLoggedIn) return;
        const cell = e.target.closest('.cell');
        if (cell && selectedForPlacement) {
            addPersonToCell(cell, selectedForPlacement.name);
        }
    });

    elements.resetBtn.addEventListener('click', async () => {
        if (!isLoggedIn) return showToast("Devi accedere per resettare i turni.");
        if(confirm('Resettare la griglia attuale?')) {
            document.querySelectorAll('.cell').forEach(c => {
                c.innerHTML = '';
                updateCellCounter(c);
            });
            window.assenzeSettimana = {};
            // if (elements.tableHeaderTitle) elements.tableHeaderTitle.value = ""; // Removed to avoid clearing default title
            await saveState();
            updateAllSidebarCounts();
            if (typeof renderMobileView === 'function') renderMobileView();
        }
    });

    // --- FUNZIONE UNIFICATA STAMPA / PDF (delegata a js/modules/export.js) ---
    async function gestisciEsportazione(azione) {
        if (window.TurniExport && typeof window.TurniExport.gestisciEsportazione === 'function') {
            return window.TurniExport.gestisciEsportazione(azione, {
                element: document.getElementById('main'),
                titleValue: elements.tableHeaderTitle ? elements.tableHeaderTitle.value : 'Turni',
                showToast
            });
        }
    }


    // --- GESTIONE ESPORTAZIONE ICS ---
    document.getElementById('publishBtn')?.addEventListener('click', async () => {
        if (!currentAziendaId || !elements.startDatePicker.value) return alert("Errore: seleziona prima la settimana.");
        
        try {
            const { data } = await window.supabaseClient.from('griglie_turni').select('pubblicato')
                .eq('azienda_id', currentAziendaId)
                .eq('data_lunedi', elements.startDatePicker.value)
                .single();
            
            const isPublished = data && data.pubblicato;
            const statusText = document.getElementById('publish-status-text');
            if (statusText) {
                statusText.textContent = isPublished ? "Stato: 🟢 ONLINE sull'App" : "Stato: 🔴 OFFLINE dall'App";
                statusText.style.color = isPublished ? "#28a745" : "#ef4444";
            }
            
            const modal = document.getElementById('ics-modal');
            const select = document.getElementById('select-staff-ics');
            const appLinkInput = document.getElementById('app-dipendenti-link');

            if (modal && select) {
                if (appLinkInput && currentAziendaId) {
                    appLinkInput.value = window.location.href.split('?')[0].replace('index.html', '').replace(/\/$/, '') + '/app_dipendente.html';
                }

                select.innerHTML = '<option value="" disabled selected>Scegli il tuo nome...</option>';
                staff.forEach(p => {
                    const opt = document.createElement('option');
                    opt.value = p.name;
                    opt.textContent = p.name;
                    select.appendChild(opt);
                });
                modal.style.display = 'flex';
            }
        } catch(e) {
            console.error(e);
            alert("Errore caricamento stato pubblicazione.");
        }
    });

    document.getElementById('publish-app-btn')?.addEventListener('click', async () => {
        if (!currentAziendaId || !elements.startDatePicker.value) return;
        try {
            await window.supabaseClient.from('griglie_turni').update({ pubblicato: true })
                .eq('azienda_id', currentAziendaId)
                .eq('data_lunedi', elements.startDatePicker.value);
            
            const statusText = document.getElementById('publish-status-text');
            if (statusText) {
                statusText.textContent = "Stato: 🟢 ONLINE sull'App";
                statusText.style.color = "#28a745";
            }

            // Invia notifica in-app + Web Push a tutti i dipendenti dell'azienda
            if (window.TurniNotifications && window.TurniNotifications.notifyEmployees) {
                const settimanaStr = new Date(elements.startDatePicker.value).toLocaleDateString('it-IT');
                window.TurniNotifications.notifyEmployees({
                    aziendaId: currentAziendaId,
                    destinatario: 'TUTTI',
                    titolo: '📅 Nuovi Turni Pubblicati!',
                    messaggio: `Sono online i turni della settimana del ${settimanaStr}. Apri l'app per consultarli.`,
                    tipo: 'turni'
                });
            }

            alert("Turni pubblicati e notifica inviata ai dipendenti!");
        } catch(e) {
            console.error(e);
            alert("Errore durante la pubblicazione.");
        }
    });

    document.getElementById('unpublish-btn')?.addEventListener('click', async () => {
        if (!currentAziendaId || !elements.startDatePicker.value) return;
        try {
            await window.supabaseClient.from('griglie_turni').update({ pubblicato: false })
                .eq('azienda_id', currentAziendaId)
                .eq('data_lunedi', elements.startDatePicker.value);
                
            const statusText = document.getElementById('publish-status-text');
            if (statusText) {
                statusText.textContent = "Stato: 🔴 OFFLINE dall'App";
                statusText.style.color = "#ef4444";
            }
            alert("Turni nascosti dall'App Dipendenti.");
        } catch(e) {
            console.error(e);
        }
    });

    document.getElementById('copy-app-link')?.addEventListener('click', () => {
        const copyText = document.getElementById('app-dipendenti-link');
        if(copyText) {
            copyText.select();
            document.execCommand('copy');
            alert('Link App copiato!');
        }
    });

    document.getElementById('close-ics-modal')?.addEventListener('click', () => {
        const modal = document.getElementById('ics-modal');
        if (modal) modal.style.display = 'none';
    });

    document.getElementById('cancel-export-ics')?.addEventListener('click', () => {
        const modal = document.getElementById('ics-modal');
        if (modal) modal.style.display = 'none';
    });

    document.getElementById('confirm-export-ics')?.addEventListener('click', () => {
        const select = document.getElementById('select-staff-ics');
        const selectedName = select ? select.value : null;
        if (!selectedName) {
            alert('Seleziona un dipendente.');
            return;
        }

        generateICSForUser(selectedName);
        
        const modal = document.getElementById('ics-modal');
        if (modal) modal.style.display = 'none';
    });

    async function generateICSForUser(userName) {
        if (window.TurniExport && typeof window.TurniExport.generateICSForUser === 'function') {
            return window.TurniExport.generateICSForUser(userName, {
                startDateStr: elements.startDatePicker ? elements.startDatePicker.value : '',
                giorni,
                turni,
                fasceOrarie,
                getGridData
            });
        }
    }


    elements.printBtn.addEventListener('click', () => gestisciEsportazione('stampa'));
    
    // Applica layout iniziale da localStorage
    const initialIsOneCol = localStorage.getItem('one-col-mode') === 'true';
    if (initialIsOneCol) {
        document.body.classList.add('one-col-mode');
        document.getElementById('main')?.classList.add('one-col-mode');
    } else {
        document.body.classList.remove('one-col-mode');
        document.getElementById('main')?.classList.remove('one-col-mode');
    }

    // --- GESTIONE STATISTICHE SETTIMANALI (delegata a js/modules/stats.js) ---
    
    const btnStats = document.getElementById('statsBtn');
    const statsModal = document.getElementById('stats-modal');
    const closeStatsModal = document.getElementById('close-stats-modal');
    
    if (btnStats && statsModal && closeStatsModal) {
        btnStats.addEventListener('click', () => {
            generateStats();
            statsModal.style.display = 'flex';
        });
        closeStatsModal.addEventListener('click', () => statsModal.style.display = 'none');
    }

    function generateStats() {
        if (window.TurniStats && typeof window.TurniStats.generateWeeklyStats === 'function') {
            window.TurniStats.generateWeeklyStats('stats-container', getGridData, staff);
        }
    }

    
    function copyToClipboard(text) {
        navigator.clipboard.writeText(text).then(() => {
            showToast("Link pubblico copiato negli appunti!");
        }).catch(() => {
            prompt("Copia questo link:", text);
        });
    }
    const copyLinkBtn = document.getElementById('copy-link-btn');
    if (copyLinkBtn) {
        copyLinkBtn.addEventListener('click', () => {
            const input = document.getElementById('share-link-input');
            if (input && input.value) {
                copyToClipboard(input.value);
            }
        });
    }

    const btnExportCsv = document.getElementById('export-csv-btn');
    if (btnExportCsv) {
        btnExportCsv.addEventListener('click', () => esportaCSV());
    }

    const btnImportCsv = document.getElementById('import-csv-btn');
    const inputImportCsvFile = document.getElementById('import-csv-file');
    if (btnImportCsv && inputImportCsvFile) {
        btnImportCsv.addEventListener('click', () => {
            if (!isLoggedIn) {
                return showToast("Devi accedere come Admin per importare i turni.");
            }
            inputImportCsvFile.click();
        });
        
        inputImportCsvFile.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
                importaCSV(file);
                inputImportCsvFile.value = '';
            }
        });
    }
    
    elements.exportPdfBtn.addEventListener('click', () => gestisciEsportazione('pdf'));

    // --- GESTIONE MODALI STAFF E ASSENZE ---
    elements.manageStaffBtn.addEventListener('click', () => {
        populateStaffModal();
        elements.staffModal.classList.add('show');
        const sidebar = document.getElementById('sidebar');
        if (sidebar) sidebar.classList.remove('mobile-open');
    });
    
    document.querySelectorAll('.close-button').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const modal = e.target.closest('.modal');
            if (modal) modal.classList.remove('show');
            if (modal) modal.style.display = 'none';
        });
    });
    
    function createStaffListItem(p) {
        const isFissoStr = p.is_fisso ? '<span style="background: #e0e0e0; color: #555; padding: 2px 5px; border-radius: 3px; font-size: 10px;">Fisso</span>' : '';
        const faCamereStr = p.fa_camere ? '<span style="background: #e1f5fe; color: #0277bd; padding: 2px 5px; border-radius: 3px; font-size: 10px; margin-left: 5px;">+ Camere</span>' : '';
        const li = document.createElement('li');
        li.innerHTML = `
            <span style="display: flex; align-items: center; gap: 5px;">${p.name} <small>(${p.reparto})</small> ${isFissoStr} ${faCamereStr}</span> 
            <div>
                <button class="btn secondary btn-edit" style="padding: 2px 8px; font-size: 11px;">Modifica</button>
                <button class="btn secondary btn-del" style="padding: 2px 8px; font-size: 11px; color:red; border-color:red;">X</button>
            </div>
        `;

        li.querySelector('.btn-edit').addEventListener('click', () => {
            elements.staffForm.style.display = 'flex';
            elements.addNewStaffBtn.style.display = 'none';
            document.getElementById('staff-name').value = p.name;
            document.getElementById('staff-group').value = p.reparto;
            document.getElementById('staff-max-shifts').value = p.maxshifts;
            document.getElementById('original-name').value = p.id; 
            document.getElementById('staff-fisso').checked = p.is_fisso || false;
            document.getElementById('staff-fa-camere').checked = p.fa_camere || false;
            document.getElementById('staff-email').value = p.email || '';
            document.getElementById('staff-pin').value = p.password || '';
            document.getElementById('staff-paga').value = p.paga_oraria || '';
        });

        li.querySelector('.btn-del').addEventListener('click', async () => {
            if (isOffline) return alert("Sei offline! Impossibile eliminare il personale.");
            if(confirm(`Eliminare ${p.name}? Verrà rimosso anche dai turni.`)) {
                await window.supabaseClient.from('staff').delete().eq('id', p.id).eq('azienda_id', currentAziendaId);
                document.querySelectorAll(`.placed[data-name="${p.name}"]`).forEach(el => {
                    const parent = el.parentElement;
                    el.remove();
                    updateCellCounter(parent);
                });
                await loadStaff(); 
                populateSidebar(); 
                populateStaffModal();
                await saveState(); 
                if (typeof renderMobileView === 'function') renderMobileView();
            }
        });
        return li;
    }

    function populateStaffModal() {
        elements.staffList.innerHTML = '';
        const fissi = staff.filter(p => p.is_fisso);
        if (fissi.length > 0) {
            const h3Fissi = document.createElement('h3');
            h3Fissi.textContent = '🔒 PERSONALE FISSO';
            h3Fissi.className = 'staff-modal-section-title';
            elements.staffList.appendChild(h3Fissi);
            const ulFissi = document.createElement('ul');
            fissi.forEach(p => ulFissi.appendChild(createStaffListItem(p)));
            elements.staffList.appendChild(ulFissi);
        }

        const aChiamata = staff.filter(p => !p.is_fisso);
        const groups = aChiamata.reduce((acc, p) => { 
            if (!acc[p.reparto || 'Sala']) acc[p.reparto || 'Sala'] = []; acc[p.reparto || 'Sala'].push(p); 
            return acc; 
        }, {});

        Object.keys(groups).sort().forEach(g => {
            const h3Group = document.createElement('h3');
            h3Group.textContent = `📋 A CHIAMATA - ${g.toUpperCase()}`;
            h3Group.className = 'staff-modal-section-title';
            elements.staffList.appendChild(h3Group);
            const ulGroup = document.createElement('ul');
            groups[g].forEach(p => ulGroup.appendChild(createStaffListItem(p)));
            elements.staffList.appendChild(ulGroup);
        });
    }
    
    elements.addNewStaffBtn.addEventListener('click', () => {
        elements.staffForm.style.display = 'flex';
        elements.addNewStaffBtn.style.display = 'none';
    });

    elements.cancelEditBtn.addEventListener('click', () => {
        elements.staffForm.reset();
        document.getElementById('original-name').value = ''; 
        elements.staffForm.style.display = 'none';
        elements.addNewStaffBtn.style.display = 'block';
    });
    
    // --- INSERIMENTO/MODIFICA STAFF SAAS ---
    elements.staffForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (isOffline) {
            alert("Sei offline! Impossibile salvare modifiche.");
            return;
        }

        if (!currentAziendaId) return alert("Errore critico: Nessuna azienda associata a questo profilo.");

        const id = document.getElementById('original-name').value; 
        const name = document.getElementById('staff-name').value.trim();
        const group = document.getElementById('staff-group').value;
        const maxshifts = document.getElementById('staff-max-shifts').value;
        const is_fisso = document.getElementById('staff-fisso').checked;
        const fa_camere = document.getElementById('staff-fa-camere').checked;
        const email = document.getElementById('staff-email').value.trim();
        const password = document.getElementById('staff-pin').value.trim();
        const paga_oraria_val = document.getElementById('staff-paga').value;
        const paga_oraria = paga_oraria_val ? parseFloat(paga_oraria_val) : null;

        if (!name || !group) return alert("Compila tutti i campi obbligatori (Nome e Gruppo).");

        try {
            const payload = { 
                name, 
                reparto: group, 
                maxshifts, 
                is_fisso, 
                fa_camere, 
                email, 
                password
            };
            if (paga_oraria !== null && !isNaN(paga_oraria)) {
                payload.paga_oraria = paga_oraria;
            }

            if (id) {
                const oldPerson = staff.find(p => p.id == id);
                
                let { error } = await window.supabaseClient.from('staff').update(payload).eq('id', id).eq('azienda_id', currentAziendaId);

                // Fallback se la colonna paga_oraria non esiste ancora nel DB Supabase
                if (error && error.message && error.message.includes('paga_oraria')) {
                    delete payload.paga_oraria;
                    const retry = await window.supabaseClient.from('staff').update(payload).eq('id', id).eq('azienda_id', currentAziendaId);
                    error = retry.error;
                }

                if (error) {
                    console.error("Errore aggiornamento staff:", error);
                    alert(`Impossibile salvare lo staff: ${error.message || error.details}\n\nNota: Assicurati di aver eseguito le istruzioni SQL su Supabase per aggiungere le colonne email, password e paga_oraria.`);
                    return;
                }

                if (oldPerson && oldPerson.name !== name) {
                    document.querySelectorAll(`.placed[data-name="${oldPerson.name}"]`).forEach(el => {
                        el.dataset.name = name;
                        el.textContent = name;
                    });
                    await saveState(); 
                }
            } else {
                payload.azienda_id = currentAziendaId;
                let { error } = await window.supabaseClient.from('staff').insert([payload]);

                // Fallback se la colonna paga_oraria non esiste ancora nel DB Supabase
                if (error && error.message && error.message.includes('paga_oraria')) {
                    delete payload.paga_oraria;
                    const retry = await window.supabaseClient.from('staff').insert([payload]);
                    error = retry.error;
                }

                if (error) {
                    console.error("Errore inserimento staff:", error);
                    alert(`Impossibile creare lo staff: ${error.message || error.details}\n\nNota: Assicurati di aver eseguito le istruzioni SQL su Supabase per aggiungere le colonne email, password e paga_oraria.`);
                    return;
                }
            }

            await loadStaff();
            populateSidebar(); 
            populateStaffModal();
            elements.staffForm.reset();
            document.getElementById('original-name').value = ''; 
            elements.staffForm.style.display = 'none';
            elements.addNewStaffBtn.style.display = 'block';
            
            document.querySelectorAll('.cell').forEach(c => { c.innerHTML = ''; });
            await loadState();

            if (typeof renderMobileView === 'function') renderMobileView();
        } catch (err) {
            console.error("Errore imprevisto salvataggio staff:", err);
            alert("Si è verificato un errore durante il salvataggio.");
        }
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            selectedForPlacement = null;
            document.querySelectorAll('.selected-for-placement').forEach(el => el.classList.remove('selected-for-placement'));
        }
    });

    function showToast(message) {
        let toast = document.getElementById("toast-notification");
        if (!toast) {
            toast = document.createElement("div");
            toast.id = "toast-notification";
            toast.className = "toast";
            document.body.appendChild(toast);
        }
        toast.textContent = message;
        toast.classList.add("show");
        if (toast.timeoutId) clearTimeout(toast.timeoutId);
        toast.timeoutId = setTimeout(() => { toast.classList.remove("show"); }, 2500);
    }

    
    
    document.getElementById('wiz-btn-genera')?.addEventListener('click', async () => {
        if (!isLoggedIn) return;

        const nomeAzienda = document.getElementById('wiz-nome-azienda').value.trim();
        const rawTurni = document.getElementById('wiz-turni').value.split('\n');
        const rawReparti = document.getElementById('wiz-reparti').value.split('\n');
        const rawStaff = [];

        if (!nomeAzienda) return alert("Inserisci il nome dell'attività");

        const newTurni = [];
        const newFasce = {};
        rawTurni.forEach(riga => {
            if (!riga.trim()) return;
            const parts = riga.split(':');
            const nomeTurno = parts[0].trim();
            const fascia = parts[1] ? parts[1].trim().toLowerCase() : "generale";
            if (nomeTurno) {
                newTurni.push(nomeTurno);
                newFasce[nomeTurno.toLowerCase().replace(/\s+/g, "_")] = fascia;
            }
        });

        const newReparti = rawReparti.map(r => r.trim()).filter(r => r);

        if (newTurni.length === 0 || newReparti.length === 0) {
            return alert("Devi inserire almeno un turno e un reparto.");
        }

        document.getElementById('wiz-btn-genera').textContent = "Salvataggio in corso...";
        document.getElementById('wiz-btn-genera').disabled = true;

        try {
            // Seleziona o crea l'ID Azienda
            let targetAziendaId = currentAziendaId;
            let isNew = false;
            if (!targetAziendaId) {
                targetAziendaId = generateUUID();
                isNew = true;
            }

            const { data: sessionData } = await supabaseClient.auth.getSession();
            const session = sessionData?.session;
            if (!session) {
                alert("Sessione scaduta.");
                location.reload();
                return;
            }

            // Upsert dell'azienda (assegna owner_id se è nuova)
            const azPayload = { id: targetAziendaId, nome_ristorante: nomeAzienda };
            if (isNew) azPayload.owner_id = session.user.id;
            const { error: azErr } = await window.supabaseClient.from('aziende').upsert(azPayload);
            if (azErr) throw new Error("Errore salvataggio azienda: " + azErr.message);

            if (isNew) {
                const { error: upsertErr } = await window.supabaseClient
                    .from('profili')
                    .upsert({ id: session.user.id, azienda_id: targetAziendaId }, { onConflict: 'id,azienda_id' });
                if (upsertErr) throw new Error("Errore collegamento profilo: " + upsertErr.message);
            }

            const colModeSelect = document.getElementById('wiz-col-mode');
            const layoutColonne = colModeSelect ? parseInt(colModeSelect.value) : 2;
            localStorage.setItem('one-col-mode', layoutColonne === 1 ? 'true' : 'false');
            
            // Applica subito il layout
            if (layoutColonne === 1) {
                document.body.classList.add('one-col-mode');
                document.getElementById('main')?.classList.add('one-col-mode');
            } else {
                document.body.classList.remove('one-col-mode');
                document.getElementById('main')?.classList.remove('one-col-mode');
            }

            const wizEnableTime = document.getElementById('wiz-enable-time');
            const enableTimeTags = wizEnableTime ? wizEnableTime.checked : true;

            const configDaSalvare = { 
                turni: newTurni, 
                fasceOrarie: newFasce, 
                repartiAzienda: newReparti,
                layoutColonne: layoutColonne,
                enableTimeTags: enableTimeTags
            };
            
            const { data: existingConfigs } = await supabaseClient
                .from('griglie_turni')
                .select('id')
                .eq('azienda_id', targetAziendaId)
                .eq('data_lunedi', '1970-01-01');

            if (existingConfigs && existingConfigs.length > 0) {
                const { error: updateConfErr } = await supabaseClient
                    .from('griglie_turni')
                    .update({ dati_griglia: configDaSalvare, updated_at: new Date().toISOString(), stato: 'config' })
                    .eq('id', existingConfigs[0].id);
                if (updateConfErr) throw new Error("Errore aggiornamento config: " + updateConfErr.message);
            } else {
                const { error: insertConfErr } = await supabaseClient
                    .from('griglie_turni')
                    .insert({ azienda_id: targetAziendaId, data_lunedi: '1970-01-01', dati_griglia: configDaSalvare, updated_at: new Date().toISOString(), stato: 'config' });
                if (insertConfErr) throw new Error("Errore inserimento config: " + insertConfErr.message);
            }

            

            // Non cancelliamo o tocchiamo più lo staff dal wizard per evitare perdita di dati!

            alert("Configurazione salvata con successo!");
            location.reload();
        } catch (globalErr) {
            console.error("Errore imprevisto nel wizard:", globalErr);
            alert("Errore imprevisto durante la generazione: " + (globalErr.message || JSON.stringify(globalErr)));
            document.getElementById('wiz-btn-genera').textContent = currentAziendaId ? "Aggiorna Configurazione Azienda 🚀" : "Genera Ambiente di Lavoro 🚀";
            document.getElementById('wiz-btn-genera').disabled = false;
        }
    });

    // --- FUNZIONI ESPORTAZIONE ED IMPORTAZIONE CSV (delegate a js/modules/export.js) ---
    function esportaCSV() {
        if (window.TurniExport && typeof window.TurniExport.esportaCSV === 'function') {
            return window.TurniExport.esportaCSV({
                giorni,
                turni,
                titleValue: elements.tableHeaderTitle ? elements.tableHeaderTitle.value : 'Turni',
                showToast
            });
        }
    }

    function importaCSV(file) {
        if (window.TurniExport && typeof window.TurniExport.importaCSV === 'function') {
            return window.TurniExport.importaCSV(file, {
                isLoggedIn,
                isHistoricalMode: window.isHistoricalMode,
                giorni,
                turni,
                staff,
                showToast,
                updateCellCounter,
                createPlacedElement,
                saveState,
                updateAllSidebarCounts,
                renderMobileView: typeof renderMobileView === 'function' ? renderMobileView : null
            });
        }
    }

    // --- INIT ---
    async function init() {
        document.getElementById('btn-auth-login')?.addEventListener('click', () => {
            const e = document.getElementById('auth-email').value;
            const p = document.getElementById('auth-password').value;
            effettuaLogin(e, p);
        });

        document.getElementById('btn-auth-register')?.addEventListener('click', () => {
            const e = document.getElementById('auth-email').value;
            const p = document.getElementById('auth-password').value;
            effettuaRegistrazione(e, p);
        });

        document.getElementById('btn-auth-reset')?.addEventListener('click', async () => {
            const emailInput = document.getElementById('auth-email');
            const msgEl = document.getElementById('auth-message');
            const email = (emailInput?.value || prompt("Inserisci l'email del tuo account per ricevere il link di recupero password:") || '').trim();
            if (!email) {
                if (msgEl) {
                    msgEl.style.color = '#ef4444';
                    msgEl.textContent = "Inserisci prima la tua email nel campo Email.";
                }
                return;
            }
            try {
                if (msgEl) {
                    msgEl.style.color = '#64748b';
                    msgEl.textContent = "Invio email di recupero in corso...";
                }
                const redirectTo = window.location.origin + window.location.pathname;
                const { error } = await supabaseClient.auth.resetPasswordForEmail(email, { redirectTo });
                if (error) throw error;
                if (msgEl) {
                    msgEl.style.color = '#10b981';
                    msgEl.textContent = "✅ Email di recupero inviata! Controlla la tua casella di posta.";
                }
            } catch (err) {
                if (msgEl) {
                    msgEl.style.color = '#ef4444';
                    msgEl.textContent = "Errore invio email: " + (err.message || err);
                }
            }
        });

        if (supabaseClient && supabaseClient.auth) {
            supabaseClient.auth.onAuthStateChange(async (event) => {
                if (event === 'PASSWORD_RECOVERY') {
                    const newPassword = prompt("🔑 Recupero Password\nInserisci la tua nuova password (minimo 6 caratteri):");
                    if (newPassword && newPassword.trim().length >= 6) {
                        const { error } = await supabaseClient.auth.updateUser({ password: newPassword.trim() });
                        if (error) {
                            alert("Errore aggiornamento password: " + error.message);
                        } else {
                            alert("✅ Password aggiornata con successo!");
                        }
                    }
                }
            });
        }
        
        document.getElementById('btn-logout')?.addEventListener('click', effettuaLogout);
        document.getElementById('btn-support')?.addEventListener('click', () => {
            alert("Il tuo piano include Assistenza Priority.\n\n📞 WhatsApp Dedicato: +39 333 1234567\n✉️ Email Priority: vip@turnicloud.pro\n\nSiamo attivi quasi 24/7. Scrivici in qualsiasi momento!");
        });

        const settingsModal = document.getElementById('settings-modal');
        const timbratoreModal = document.getElementById('timbratore-modal');
        document.getElementById('timbratoreBtn')?.addEventListener('click', () => {
            if(!currentAziendaId) return;
            document.getElementById('timbratore-link-input').value = window.location.href.split('?')[0].replace('index.html', '').replace(/\/$/, '') + '/timbratore.html?id=' + currentAziendaId;
            // Set current month to input
            const now = new Date();
            document.getElementById('report-month').value = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');
            timbratoreModal.style.display = 'flex';
            if (!window.timbratoreInterval) {
                window.timbratoreInterval = setInterval(() => {
                    if (timbratoreModal.style.display === 'flex') {
                        caricaTimbratureDashboard();
                    }
                }, 10000);
            }
            caricaTimbratureDashboard();
        });
        document.getElementById('close-timbratore-modal')?.addEventListener('click', () => { 
            timbratoreModal.style.display = 'none'; 
            if (window.timbratoreInterval) {
                clearInterval(window.timbratoreInterval);
                window.timbratoreInterval = null;
            }
        });
        document.getElementById('copy-timbratore-link')?.addEventListener('click', () => {
            const copyText = document.getElementById('timbratore-link-input');
            copyText.select();
            document.execCommand('copy');
            alert('Link copiato!');
        });
        document.getElementById('btn-generate-report')?.addEventListener('click', generaReportTimbrature);
        document.getElementById('btn-refresh-timbrature')?.addEventListener('click', () => {
            caricaTimbratureDashboard();
        });

        document.getElementById('settingsBtn')?.addEventListener('click', async () => {
            if(!currentAziendaId) return;
            // Load current name
            try {
                const { data } = await window.supabaseClient.from('aziende').select('nome_ristorante').eq('id', currentAziendaId).single();
                if (data) document.getElementById('settings-nome-azienda').value = data.nome_ristorante;
            } catch(e){}
            settingsModal.style.display = 'flex';
        });
        document.getElementById('close-settings-modal')?.addEventListener('click', () => { settingsModal.style.display = 'none'; });
        document.getElementById('btn-save-settings')?.addEventListener('click', async () => {
            const newName = document.getElementById('settings-nome-azienda').value.trim();
            if(!newName) return;
            try {
                const { error } = await window.supabaseClient.from('aziende').update({ nome_ristorante: newName }).eq('id', currentAziendaId);
                if(error) throw error;
                alert('Attività aggiornata!');
                settingsModal.style.display = 'none';
                controllaStatoLogin(); // Reload dashboard
            } catch(e) {
                alert('Errore: ' + e.message);
            }
        });
        document.getElementById('btn-delete-azienda')?.addEventListener('click', async () => {
            if(!confirm('SEI SICURO? Tutti i turni e i dipendenti di questa attività verranno eliminati. Questa azione è irreversibile.')) return;
            try {
                const { error } = await window.supabaseClient.from('aziende').delete().eq('id', currentAziendaId);
                if(error) throw error;
                alert('Attività eliminata con successo.');
                settingsModal.style.display = 'none';
                currentAziendaId = null;
                controllaStatoLogin();
            } catch(e) {
                alert('Errore: ' + e.message);
            }
        });

        
        
        document.getElementById('copyPrevBtn')?.addEventListener('click', async () => {
            if (!isLoggedIn || !currentAziendaId) return;
            const currDateStr = elements.startDatePicker.value;
            if (!currDateStr) return;
            const currDate = new Date(currDateStr);
            const prevDate = new Date(currDate);
            prevDate.setDate(currDate.getDate() - 7);
            const offset = prevDate.getTimezoneOffset() * 60000;
            const prevDateStr = new Date(prevDate - offset).toISOString().split('T')[0];

            elements.saveStatus.textContent = "Copia in corso...";
            const { data, error } = await supabaseClient
                .from('griglie_turni')
                .select('dati_griglia')
                .eq('azienda_id', currentAziendaId)
                .eq('data_lunedi', prevDateStr)
                .single();
            
            if (error || !data || !data.dati_griglia) {
                alert("Nessun dato trovato nella settimana precedente (" + prevDateStr + ").");
                elements.saveStatus.textContent = "Errore copia";
                return;
            }

            // Pulisce e riempie
            document.querySelectorAll('.cell').forEach(c => { c.innerHTML = ''; updateCellCounter(c); });
            const datiDaCaricare = data.dati_griglia;
            // Aggiorna l'intestazione con le date della settimana corrente
            updateGridHeaders();
            window.assenzeSettimana = datiDaCaricare["_metadata_assenze"] || {};

            Object.entries(datiDaCaricare).forEach(([id, people]) => {
                const cellDiv = document.querySelector(`.cell[data-cell-id="${id}"]`);
                if (cellDiv && !id.startsWith("_metadata")) {
                    people.forEach(p => cellDiv.appendChild(createPlacedElement(p)));
                    updateCellCounter(cellDiv);
                }
            });
            await saveState();
            updateAllSidebarCounts();
            if (typeof updateMobileHeader === 'function') updateMobileHeader();
            alert("Turni copiati con successo dalla settimana precedente!");
        });

        elements.tableHeaderTitle.addEventListener('blur', () => {
            if(isLoggedIn) saveState(); 
        }); 
        elements.tableHeaderTitle.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') elements.tableHeaderTitle.blur(); 
        });

        if (elements.startDatePicker) {
            elements.startDatePicker.addEventListener('change', () => {
                if (typeof updateGridHeaders === 'function') updateGridHeaders();
                if (currentAziendaId) {
                    loadState();
                }
            });
        }

        await controllaStatoLogin(); 
    }

    if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('./sw.js')
            .then(registration => { console.log('ServiceWorker registrato con successo:', registration.scope); })
            .catch(error => { console.log('Registrazione ServiceWorker fallita:', error); });
        });
    }

    async function caricaTimbratureDashboard() {
        if (!currentAziendaId) return;
        if (window.TurniTimbrature && typeof window.TurniTimbrature.caricaTimbratureDashboard === 'function') {
            return window.TurniTimbrature.caricaTimbratureDashboard(currentAziendaId);
        }
    }

    async function generaReportTimbrature() {
        const monthStr = document.getElementById('report-month')?.value;
        if (!monthStr || !currentAziendaId) return;
        if (window.TurniTimbrature && typeof window.TurniTimbrature.generaReportTimbrature === 'function') {
            return window.TurniTimbrature.generaReportTimbrature(currentAziendaId, monthStr);
        }
    }

    init();
});

// Stubs for mobile view functions to prevent reference errors
window.renderMobileView = function() {};
window.updateMobileHeader = function() {};
function renderMobileView() {}
function updateMobileHeader() {}

async function caricaStatisticheGlobali() {
    if (window.TurniStats && typeof window.TurniStats.caricaStatisticheGlobali === 'function') {
        return window.TurniStats.caricaStatisticheGlobali();
    }
}

