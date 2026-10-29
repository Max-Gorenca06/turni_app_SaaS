// Modulo Statistiche Settimanali e Globali
import { getSupabaseClient } from '../config.js';

export function generateWeeklyStats({ data, staff }) {
    const container = document.getElementById('stats-container');
    if (!container) return;

    const statsStaff = {};
    const statsReparti = {};
    let totalShifts = 0;

    (staff || []).forEach(s => {
        statsStaff[s.name] = { count: 0, reparto: s.reparto, max: s.maxshifts, isFisso: s.is_fisso };
    });

    Object.entries(data || {}).forEach(([cellId, people]) => {
        if (cellId.startsWith('_metadata') || !Array.isArray(people)) return;
        people.forEach(p => {
            const nameMatch = (staff || []).find(s => s.name.toLowerCase() === p.name.toLowerCase());
            const finalName = nameMatch ? nameMatch.name : p.name;

            if (!statsStaff[finalName]) {
                statsStaff[finalName] = { count: 0, reparto: 'Sconosciuto', max: 0, isFisso: false };
            }
            statsStaff[finalName].count++;
            totalShifts++;

            const rep = statsStaff[finalName].reparto || 'Sconosciuto';
            statsReparti[rep] = (statsReparti[rep] || 0) + 1;
        });
    });

    const sortedStaff = Object.entries(statsStaff).sort((a, b) => b[1].count - a[1].count);

    let html = `
        <div style="display: flex; gap: 15px; margin-bottom: 20px;">
            <div style="flex: 1; background: #e3f2fd; padding: 15px; border-radius: 8px; text-align: center;">
                <div style="font-size: 24px; font-weight: bold; color: #1565c0;">${totalShifts}</div>
                <div style="font-size: 12px; color: #555;">Turni Totali Assegnati</div>
            </div>
            <div style="flex: 1; background: #e8f5e9; padding: 15px; border-radius: 8px; text-align: center;">
                <div style="font-size: 24px; font-weight: bold; color: #2e7d32;">${sortedStaff.filter(s => s[1].count > 0).length}</div>
                <div style="font-size: 12px; color: #555;">Persone Impiegate</div>
            </div>
        </div>
        
        <h3 style="font-size: 16px; margin-bottom: 10px; border-bottom: 1px solid #eee; padding-bottom: 5px;">Turni per Persona</h3>
        <div style="max-height: 250px; overflow-y: auto; padding-right: 10px; margin-bottom: 20px;">
    `;

    const maxCount = sortedStaff.length > 0 && sortedStaff[0][1].count > 0 ? sortedStaff[0][1].count : 1;

    sortedStaff.forEach(([name, info]) => {
        if (info.count === 0) return;
        const percentage = (info.count / maxCount) * 100;
        const overLimit = (info.max > 0 && info.count > info.max);
        const barColor = overLimit ? '#dc3545' : (info.isFisso ? '#6c757d' : '#28a745');

        html += `
            <div style="margin-bottom: 10px;">
                <div style="display: flex; justify-content: space-between; font-size: 13px; margin-bottom: 3px;">
                    <span><strong>${name}</strong> <small style="color: #666;">(${info.reparto})</small></span>
                    <span>${info.count} ${info.max > 0 ? ` / ${info.max}` : ''} turni</span>
                </div>
                <div style="width: 100%; background: #eee; height: 10px; border-radius: 5px; overflow: hidden;">
                    <div style="width: ${percentage}%; height: 100%; background: ${barColor}; border-radius: 5px;"></div>
                </div>
            </div>
        `;
    });

    html += `</div>
        <h3 style="font-size: 16px; margin-bottom: 10px; border-bottom: 1px solid #eee; padding-bottom: 5px;">Distribuzione per Reparto</h3>
        <div style="display: flex; flex-wrap: wrap; gap: 10px;">
    `;

    Object.entries(statsReparti).sort((a, b) => b[1] - a[1]).forEach(([rep, count]) => {
        html += `
            <div style="background: #f8f9fa; border: 1px solid #ddd; padding: 10px 15px; border-radius: 6px; font-size: 14px;">
                <strong>${rep}:</strong> ${count} turni
            </div>
        `;
    });
    html += `</div>`;

    container.innerHTML = html;
}

export async function caricaStatisticheGlobali() {
    const statsContainer = document.getElementById('global-stats-content');
    if (!statsContainer) return;

    statsContainer.innerHTML = '<div style="font-size:14px; color:#666; text-align: center; padding: 40px;">Caricamento statistiche...</div>';

    const supabaseClient = getSupabaseClient();
    if (!supabaseClient) return;

    try {
        const myAziende = window._lastAziendeList || [];
        if (myAziende.length === 0) {
            statsContainer.innerHTML = '<div style="font-size:14px; color:#64748b; text-align:center; padding: 20px;">Nessuna attività associata al tuo profilo.</div>';
            return;
        }

        const myAziendaIds = myAziende.map(a => a.id);
        const { data: griglie } = await supabaseClient
            .from('griglie_turni')
            .select('*')
            .in('azienda_id', myAziendaIds);

        let totaleTurniAttivi = 0;
        const attivitaConTurni = new Set();
        const conteggioPersone = {};
        const repartiStats = {};

        if (griglie) {
            griglie.forEach(g => {
                if (g.dati_griglia && g.data_lunedi && !g.data_lunedi.startsWith('1970')) {
                    attivitaConTurni.add(g.azienda_id);
                    Object.entries(g.dati_griglia).forEach(([key, arr]) => {
                        if (!key.startsWith('_metadata') && Array.isArray(arr)) {
                            totaleTurniAttivi += arr.length;
                            const parts = key.split('-');
                            const turnoName = parts.length > 1 ? parts.slice(1).join('-') : 'altro';

                            arr.forEach(p => {
                                const n = p.name.trim().toUpperCase();
                                conteggioPersone[n] = (conteggioPersone[n] || 0) + 1;
                                repartiStats[turnoName] = (repartiStats[turnoName] || 0) + 1;
                            });
                        }
                    });
                }
            });
        }

        const personeArray = Object.entries(conteggioPersone).sort((a, b) => b[1] - a[1]);
        const aziendeTotali = myAziende.length;
        const copertiPercent = aziendeTotali > 0 ? Math.round((attivitaConTurni.size / aziendeTotali) * 100) : 0;

        let pieGradient = '';
        let cumulativePercent = 0;
        const colors = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316', '#6366f1', '#84cc16', '#eab308', '#06b6d4', '#a855f7'];

        if (totaleTurniAttivi > 0) {
            let i = 0;
            for (const [, count] of personeArray) {
                const percent = (count / totaleTurniAttivi) * 100;
                const color = colors[i % colors.length];
                pieGradient += `${color} ${cumulativePercent}% ${cumulativePercent + percent}%, `;
                cumulativePercent += percent;
                i++;
            }
            pieGradient = pieGradient.slice(0, -2);
        } else {
            pieGradient = '#e2e8f0 0% 100%';
        }

        let staffListHtml = '';
        personeArray.forEach(([nome, count], idx) => {
            const percent = totaleTurniAttivi > 0 ? Math.round((count / totaleTurniAttivi) * 100) : 0;
            const color = colors[idx % colors.length];
            staffListHtml += `
                <div title="${nome}: ${percent}% (${count} turni)" style="display: flex; align-items: center; justify-content: space-between; padding: 10px 15px; background: #f8fafc; border-radius: 8px; border-left: 4px solid ${color}; transition: all 0.2s; cursor: default;" onmouseover="this.style.background='#f1f5f9'" onmouseout="this.style.background='#f8fafc'">
                    <div style="font-weight: 500; color: #334155; font-size: 14px;">${nome}</div>
                    <div style="display: flex; align-items: center; gap: 15px;">
                        <div style="font-size: 13px; color: #64748b;">${count} turni</div>
                        <div style="font-size: 14px; font-weight: 600; color: ${color}; width: 40px; text-align: right;">${percent}%</div>
                    </div>
                </div>
            `;
        });

        statsContainer.innerHTML = `
            <div style="display: flex; flex-wrap: wrap; gap: 20px; margin-bottom: 30px;">
                <div style="flex: 1; min-width: 200px; background: #f0f9ff; padding: 25px; border-radius: 12px; border: 1px solid #bae6fd;">
                    <div style="font-size: 14px; color: #0284c7; margin-bottom: 5px; font-weight: 600; text-transform: uppercase;">Attività Pianificate</div>
                    <div style="display: flex; align-items: baseline; gap: 10px;">
                        <div style="font-size: 36px; font-weight: 700; color: #0369a1;">${copertiPercent}%</div>
                        <div style="font-size: 14px; color: #0284c7;">(${attivitaConTurni.size} su ${aziendeTotali})</div>
                    </div>
                </div>
                
                <div style="flex: 1; min-width: 200px; background: #ecfdf5; padding: 25px; border-radius: 12px; border: 1px solid #a7f3d0;">
                    <div style="font-size: 14px; color: #059669; margin-bottom: 5px; font-weight: 600; text-transform: uppercase;">Turni Assegnati Globali</div>
                    <div style="font-size: 36px; font-weight: 700; color: #047857;">${totaleTurniAttivi}</div>
                    <div style="font-size: 13px; color: #059669; margin-top: 5px;">Somma di tutti i presidi attuali</div>
                </div>
            </div>
            
            <h3 style="color: #1e293b; margin-bottom: 20px; font-size: 18px; border-bottom: 1px solid #e2e8f0; padding-bottom: 10px;">Dettaglio Personale</h3>
            
            <div style="display: flex; gap: 40px; align-items: flex-start; flex-wrap: wrap;">
                <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 20px; background: white; padding: 30px; border-radius: 16px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05), 0 2px 4px -1px rgba(0,0,0,0.03); border: 1px solid #f1f5f9;">
                    <div style="font-size: 15px; font-weight: 600; color: #475569;">Distribuzione Turni</div>
                    <div style="width: 200px; height: 200px; border-radius: 50%; background: conic-gradient(${pieGradient}); box-shadow: inset 0 2px 4px rgba(0,0,0,0.1), 0 4px 10px rgba(0,0,0,0.05);"></div>
                    <div style="font-size: 12px; color: #94a3b8;">Passa il mouse sulla lista per i dettagli</div>
                </div>
                
                <div style="flex: 1; min-width: 300px; display: grid; grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); gap: 12px; max-height: 350px; overflow-y: auto; padding-right: 10px;">
                    ${staffListHtml || '<div style="color:#64748b;">Nessun turno assegnato.</div>'}
                </div>
            </div>
        `;
    } catch (e) {
        console.error(e);
        statsContainer.innerHTML = '<div style="font-size:14px; color:red; text-align:center; padding: 20px;">Errore: ' + e.message + '</div>';
    }
}

if (typeof window !== 'undefined') {
    window.TurniStats = {
        generateWeeklyStats,
        caricaStatisticheGlobali
    };
}
