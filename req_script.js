    // 1. LEGGE L'ID DEL RISTORANTE DALL'URL
    const urlParams = new URLSearchParams(window.location.search);
    const aziendaId = urlParams.get('id');

    if (!aziendaId) {
        document.getElementById('error-screen').style.display = 'block';
    } else {
        document.getElementById('form-content').style.display = 'block';

        const SUPABASE_URL = (window.SUPABASE_CONFIG && window.SUPABASE_CONFIG.URL) || 'https://api.158.180.239.147.sslip.io';
        const SUPABASE_ANON_KEY = (window.SUPABASE_CONFIG && window.SUPABASE_CONFIG.ANON_KEY) || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNzkxNDQ4MTcwLCJleHAiOjIxMDY4MDgxNzB9.v6w9RwQBBKxdC0-sN08whXB0NjRbWgy_tCzuX_piuWk';
        const supabaseClient = (window.getSupabaseClient && window.getSupabaseClient()) || supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

        async function caricaDati() {
            // 2. IL FILTRO SAAS: Carica solo i nomi di QUESTA azienda tramite RPC sicura
            let { data: staffData, error: staffErr } = await supabaseClient.rpc('get_public_staff_names', { p_azienda_id: aziendaId });
            if (staffErr && staffErr.code === 'PGRST202') {
                const fallback = await supabaseClient.from('staff').select('name').eq('azienda_id', aziendaId).order('name');
                staffData = fallback.data;
            }
            const selectNome = document.getElementById('nome');
            selectNome.innerHTML = '<option value="" disabled selected>Scegli il tuo nome...</option>';
            
            if (staffData) {
                staffData.forEach(p => {
                    const opt = document.createElement('option');
                    opt.value = p.name;
                    opt.textContent = p.name;
                    selectNome.appendChild(opt);
                });
            } else {
                selectNome.innerHTML = '<option value="" disabled>Errore di connessione</option>';
            }

            // Carica le impostazioni dinamiche
            const { data: configData } = await supabaseClient
                .from('griglie_turni')
                .select('dati_griglia')
                .eq('azienda_id', aziendaId)
                .eq('data_lunedi', '1970-01-01')
                .single();

            const selectTurno = document.getElementById('turno');
            if (configData && configData.dati_griglia) {
                const config = typeof configData.dati_griglia === 'string' ? JSON.parse(configData.dati_griglia) : configData.dati_griglia;
                if (config.turni) {
                    config.turni.forEach(turno => {
                        const val = turno.toLowerCase().replace(/\s+/g, "_");
                        selectTurno.innerHTML += `<option value="${val}">Solo ${turno}</option>`;
                    });
                }
            } else {
                // Default fallback
                selectTurno.innerHTML += `
                    <option value="camere">Solo Camere</option>
                    <option value="cucina_pranzo">Solo Cucina Pranzo</option>
                    <option value="sala_pranzo">Solo Sala Pranzo</option>
                    <option value="cucina_cena">Solo Cucina Cena</option>
                    <option value="sala_cena">Solo Sala Cena</option>
                `;
            }
        }

        document.getElementById('submit-btn').addEventListener('click', async () => {
            const nome = document.getElementById('nome').value;
            const dataInizio = document.getElementById('data-inizio').value;
            const dataFine = document.getElementById('data-fine').value;
            const turno = document.getElementById('turno').value;
            const motivo = document.getElementById('motivo').value.trim();
            const msgDiv = document.getElementById('status-msg');

            if (!nome || !dataInizio || !dataFine) { msgDiv.style.color = "red"; msgDiv.textContent = "Compila tutti i campi."; return; }
            if (new Date(dataFine) < new Date(dataInizio)) { msgDiv.style.color = "red"; msgDiv.textContent = "Date non valide."; return; }

            msgDiv.style.color = "#666"; msgDiv.textContent = "Invio in corso...";
            document.getElementById('submit-btn').disabled = true;

            // 3. INSERIMENTO CON IL LUCCHETTO SAAS
            const { error } = await supabaseClient.from('assenze_globali').insert([{
                azienda_id: aziendaId,
                nome_dipendente: nome,
                data_inizio: dataInizio,
                data_fine: dataFine,
                turno_specifico: turno,
                motivo: motivo,
                stato: 'IN ATTESA' 
            }]);

            document.getElementById('submit-btn').disabled = false;

            if (error) {
                msgDiv.style.color = "red"; msgDiv.textContent = "Errore di connessione. Riprova."; console.error(error);
            } else {
                if (window.TurniNotifications && window.TurniNotifications.notifyAdminNewAbsence) {
                    window.TurniNotifications.notifyAdminNewAbsence({
                        aziendaId,
                        nomeDipendente: nome,
                        dataInizio,
                        dataFine,
                        turno
                    });
                }
                msgDiv.style.color = "green"; msgDiv.textContent = "✅ Richiesta inviata con successo! Puoi chiudere.";
                document.getElementById('data-inizio').value = ''; document.getElementById('data-fine').value = ''; document.getElementById('motivo').value = '';
            }
        });

        caricaDati();
    }
