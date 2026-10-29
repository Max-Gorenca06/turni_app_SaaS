// Modulo Gestionale Timbrature e Registro Presenze
import { getSupabaseClient } from '../config.js';
import { exportTimbratureToExcel } from './export.js';

export async function autoCloseStaleShifts() {
    const supabaseClient = getSupabaseClient();
    if (!supabaseClient) return 0;
    try {
        const { data } = await supabaseClient.rpc('auto_close_stale_timbrature', {
            p_max_hours: 14,
            p_default_shift_hours: 8
        });
        return data || 0;
    } catch (_) {
        return 0;
    }
}

export async function fetchActiveTimbrature(aziendaId) {
    const supabaseClient = getSupabaseClient();
    if (!supabaseClient || !aziendaId) return { active: [], history: [] };

    try {
        await autoCloseStaleShifts();
        const { data, error } = await supabaseClient
            .from('timbrature')
            .select('*')
            .eq('azienda_id', aziendaId)
            .order('ingresso', { ascending: false });

        if (error) throw error;

        const active = (data || []).filter(t => !t.uscita);
        const history = (data || []).filter(t => t.uscita);
        return { active, history, all: data || [] };
    } catch (err) {
        console.error("Errore caricamento timbrature:", err);
        return { active: [], history: [], all: [], error: err };
    }
}

export async function generateMonthlyReport(aziendaId, nomeAzienda, yearMonthStr) {
    const supabaseClient = getSupabaseClient();
    if (!supabaseClient || !aziendaId) return;

    try {
        const startDate = `${yearMonthStr}-01T00:00:00.000Z`;
        const [year, month] = yearMonthStr.split('-');
        const lastDay = new Date(year, month, 0).getDate();
        const endDate = `${yearMonthStr}-${lastDay}T23:59:59.999Z`;

        const { data, error } = await supabaseClient
            .from('timbrature')
            .select('*')
            .eq('azienda_id', aziendaId)
            .gte('ingresso', startDate)
            .lte('ingresso', endDate)
            .order('ingresso', { ascending: true });

        if (error) throw error;

        exportTimbratureToExcel(data, nomeAzienda, yearMonthStr);
    } catch (err) {
        console.error("Errore generazione report mensile:", err);
        alert("Impossibile generare il report mensile.");
    }
}

export async function caricaTimbratureDashboard(currentAziendaId) {
    const supabaseClient = getSupabaseClient();
    if (!supabaseClient || !currentAziendaId) return;

    try {
        await autoCloseStaleShifts();
        const { data, error } = await supabaseClient
            .from('timbrature')
            .select('*')
            .eq('azienda_id', currentAziendaId)
            .order('ingresso', { ascending: false })
            .limit(50);

        const activeEl = document.getElementById('timbrature-active-list');
        const historyEl = document.getElementById('timbrature-history-body');

        if (error) {
            if (activeEl) {
                activeEl.innerHTML = `<span style="color:red">Tabella timbrature non trovata.</span>`;
            }
            return;
        }

        if (!data || data.length === 0) {
            if (activeEl) activeEl.innerHTML = 'Nessun dipendente attualmente a lavoro.';
            if (historyEl) historyEl.innerHTML = '<tr><td colspan="5" style="padding:10px;text-align:center;">Nessuna timbratura.</td></tr>';
            return;
        }

        let htmlActive = '';
        const active = data.filter(t => !t.uscita);
        if (active.length > 0) {
            active.forEach(t => {
                const ing = new Date(t.ingresso);
                htmlActive += `<div style="padding: 8px 0; border-bottom: 1px solid #f1f5f9; display: flex; justify-content: space-between;">
                    <span style="font-weight: 600;">👤 ${t.nome_dipendente}</span>
                    <span style="color: #64748b;">Entrato alle ${ing.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}</span>
                </div>`;
            });
        } else {
            htmlActive = '<div style="color: #64748b; padding: 10px 0;">Nessun dipendente attualmente a lavoro.</div>';
        }
        if (activeEl) activeEl.innerHTML = htmlActive;

        let htmlHistory = '';
        data.forEach(t => {
            const d = new Date(t.ingresso);
            const dataStr = d.toLocaleDateString('it-IT');
            const ingStr = d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
            let uscStr = "-";
            let oreTot = "-";
            if (t.uscita) {
                const u = new Date(t.uscita);
                uscStr = u.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
                if (t.chiusa_automaticamente) {
                    const noteTitle = (t.note_sistema || 'Chiusura automatica').replace(/"/g, '&quot;');
                    uscStr += ` <span title="${noteTitle}" style="background:#fef3c7;color:#d97706;padding:2px 6px;border-radius:6px;font-size:10px;font-weight:700;">⚠️ Auto</span>`;
                }
                const diffHrs = (u - d) / (1000 * 60 * 60);
                oreTot = diffHrs.toFixed(2) + " h";
            }

            htmlHistory += `<tr style="border-bottom: 1px solid #f1f5f9;">
                <td style="padding: 10px; font-weight: 500;">${t.nome_dipendente}</td>
                <td style="padding: 10px; color: #64748b;">${dataStr}</td>
                <td style="padding: 10px; color: #10b981; font-weight: bold;">${ingStr}</td>
                <td style="padding: 10px; color: ${t.uscita ? '#ef4444' : '#94a3b8'}; font-weight: bold;">${uscStr}</td>
                <td style="padding: 10px; font-weight: 600;">${oreTot}</td>
            </tr>`;
        });

        if (historyEl) historyEl.innerHTML = htmlHistory;
    } catch (e) {
        console.error(e);
    }
}

export async function generaReportTimbrature(currentAziendaId) {
    const supabaseClient = getSupabaseClient();
    const monthEl = document.getElementById('report-month');
    const monthStr = monthEl ? monthEl.value : '';
    if (!monthStr || !currentAziendaId || !supabaseClient) return;

    const [year, month] = monthStr.split('-');
    const startDate = new Date(year, month - 1, 1).toISOString();
    const endDate = new Date(year, month, 1).toISOString();

    alert("Generazione report in corso per " + monthStr + "... Attendere.");

    try {
        await autoCloseStaleShifts();
        const { data, error } = await supabaseClient
            .from('timbrature')
            .select('*')
            .eq('azienda_id', currentAziendaId)
            .gte('ingresso', startDate)
            .lt('ingresso', endDate)
            .order('nome_dipendente');

        if (error) throw error;
        if (!data || data.length === 0) {
            alert("Nessuna timbratura trovata per questo mese.");
            return;
        }

        const { data: staffData } = await supabaseClient
            .from('staff')
            .select('*')
            .eq('azienda_id', currentAziendaId);

        const staffMap = {};
        if (staffData) {
            staffData.forEach(s => { staffMap[s.name] = s; });
        }

        const report = {};
        data.forEach(t => {
            if (!t.uscita) return;
            if (!report[t.nome_dipendente]) report[t.nome_dipendente] = { ore: 0, costo: 0, autoClosed: 0 };

            const dIng = new Date(t.ingresso);
            const dUsc = new Date(t.uscita);
            const diffHrs = (dUsc - dIng) / (1000 * 60 * 60);
            report[t.nome_dipendente].ore += diffHrs;
            if (t.chiusa_automaticamente) report[t.nome_dipendente].autoClosed += 1;
        });

        let csvContent = "Dipendente,Ore Totali,Uscite Auto-Chiuse,Costo Orario (€),Costo Totale Stimato (€)\n";
        let totalCostoAzienda = 0;

        for (const nome in report) {
            const ore = report[nome].ore;
            const autoClosed = report[nome].autoClosed || 0;
            let costoOrario = 0;

            if (staffMap[nome] && staffMap[nome].paga_oraria) {
                costoOrario = parseFloat(staffMap[nome].paga_oraria) || 0;
            } else if (staffMap[nome] && staffMap[nome].costo_orario) {
                costoOrario = parseFloat(staffMap[nome].costo_orario) || 0;
            } else if (staffMap[nome] && staffMap[nome].costo) {
                costoOrario = parseFloat(staffMap[nome].costo) || 0;
            }

            const costoTot = ore * costoOrario;
            totalCostoAzienda += costoTot;

            csvContent += `${nome},${ore.toFixed(2)},${autoClosed},${costoOrario.toFixed(2)},${costoTot.toFixed(2)}\n`;
        }

        csvContent += `\nTOTALE AZIENDA,,,,€${totalCostoAzienda.toFixed(2)}\n`;

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Report_Presenze_${monthStr}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    } catch (e) {
        console.error(e);
        alert("Errore generazione report: " + e.message);
    }
}

if (typeof window !== 'undefined') {
    window.TurniTimbrature = {
        autoCloseStaleShifts,
        fetchActiveTimbrature,
        generateMonthlyReport,
        caricaTimbratureDashboard,
        generaReportTimbrature
    };
}
