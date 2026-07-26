// Modulo Gestionale Timbrature e Registro Presenze
import { getSupabaseClient } from '../config.js';
import { exportTimbratureToExcel } from './export.js';

export async function fetchActiveTimbrature(aziendaId) {
    const supabaseClient = getSupabaseClient();
    if (!supabaseClient || !aziendaId) return { active: [], history: [] };

    try {
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
        // Calcola ultimo giorno del mese
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
