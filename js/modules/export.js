// Modulo Esportazione & Importazione (PDF, Stampa, CSV/Excel, Calendario ICS)
/* global html2pdf */

export function exportToPDF(element, fileName = 'turni-settimanali.pdf') {
    if (typeof html2pdf === 'undefined') {
        alert("Libreria PDF in caricamento. Riprova tra poco.");
        return;
    }
    const opt = {
        margin:       [5, 5, 5, 5],
        filename:     fileName,
        image:        { type: 'jpeg', quality: 0.98 },
        html2canvas:  { scale: 2, useCORS: true, logging: false },
        jsPDF:        { unit: 'mm', format: 'a4', orientation: 'landscape' }
    };
    html2pdf().set(opt).from(element).save();
}

export async function gestisciEsportazione(azione, { tableHeaderTitle, showToast }) {
    const element = document.getElementById('main');
    const originalTitle = document.title;

    let customName = (tableHeaderTitle && tableHeaderTitle.value ? tableHeaderTitle.value.trim() : '') || "Turni";
    customName = customName.replace(/\//g, '-');
    const finalFilename = `${customName}.pdf`;

    if (showToast) showToast(azione === 'stampa' ? "Preparazione stampa..." : "Generazione in corso...");

    document.body.classList.add('print-mode');
    document.title = customName;
    window.scrollTo(0, 0);

    const sidebar = document.getElementById('sidebar');
    if (sidebar) sidebar.classList.remove('mobile-open');

    await new Promise(resolve => setTimeout(resolve, 400));

    const opt = {
        margin: [2, 2, 2, 2],
        filename: finalFilename,
        image: { type: 'jpeg', quality: 1 },
        html2canvas: { scale: 2, useCORS: true, scrollX: 0, scrollY: 0 },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'landscape' }
    };

    try {
        if (window.Capacitor && window.Capacitor.isNativePlatform()) {
            const pdfDataUri = await html2pdf().from(element).set(opt).output('datauristring');
            const base64Data = pdfDataUri.split(',')[1];
            const savedFile = await window.Capacitor.Plugins.Filesystem.writeFile({
                path: finalFilename, data: base64Data, directory: 'CACHE'
            });
            await window.Capacitor.Plugins.Share.share({
                title: azione === 'stampa' ? 'Stampa Turni' : 'Esporta PDF', url: savedFile.uri
            });
        } else if (azione === 'stampa') {
            window.print();
        } else {
            const isMobileDevice = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) ||
                                 (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

            if (isMobileDevice) {
                const pdfBlob = await html2pdf().from(element).set(opt).output('blob');
                let condiviso = false;
                if (navigator.share) {
                    try {
                        const file = new File([pdfBlob], finalFilename, { type: 'application/pdf' });
                        if (typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })) {
                            await navigator.share({ title: 'Turni', files: [file] });
                            condiviso = true;
                        }
                    } catch (shareError) {
                        if (shareError.name === 'AbortError') condiviso = true;
                    }
                }
                if (!condiviso) {
                    if (showToast) showToast("Apertura anteprima di sistema...");
                    setTimeout(() => { window.print(); }, 500);
                }
            } else {
                await html2pdf().from(element).set(opt).save();
            }
        }
    } catch (error) {
        console.error("Errore:", error);
        if (showToast) showToast("Errore durante l'operazione");
    } finally {
        setTimeout(() => {
            document.body.classList.remove('print-mode');
            document.title = originalTitle;
            const toast = document.getElementById("toast-notification");
            if (toast) toast.classList.remove("show");
        }, 1000);
    }
}

export function esportaCSV({ giorni, turni, tableHeaderTitle, showToast }) {
    if (showToast) showToast("Esportazione CSV in corso...");

    const righeCSV = [];
    const sep = ';';
    const headerRow = ["Turno", ...giorni];
    righeCSV.push(headerRow.map(h => `"${h.replace(/"/g, '""')}"`).join(sep));

    turni.forEach(turno => {
        const riga = [turno];
        giorni.forEach(giorno => {
            const cellId = `${giorno.toLowerCase()}-${turno.toLowerCase().replace(/\s+/g, "_")}`;
            const cellDiv = document.querySelector(`.cell[data-cell-id="${cellId}"]`);

            if (cellDiv) {
                const people = Array.from(cellDiv.querySelectorAll('.placed')).map(p => {
                    let formatted = p.dataset.name;
                    if (p.classList.contains('in-dubbio')) formatted += '?';
                    if (p.dataset.timeTag) formatted += ` (${p.dataset.timeTag})`;
                    return formatted;
                });
                riga.push(people.join(', '));
            } else {
                riga.push('');
            }
        });

        righeCSV.push(riga.map(val => `"${val.replace(/"/g, '""')}"`).join(sep));
    });

    const csvContent = "\ufeff" + righeCSV.join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });

    let customName = (tableHeaderTitle && tableHeaderTitle.value ? tableHeaderTitle.value.trim() : '') || "Turni";
    customName = customName.replace(/\//g, '-').replace(/\s+/g, '_');
    const filename = `${customName}.csv`;

    if (window.Capacitor && window.Capacitor.isNativePlatform()) {
        const reader = new FileReader();
        reader.onloadend = async () => {
            try {
                const base64Data = reader.result.split(',')[1];
                const savedFile = await window.Capacitor.Plugins.Filesystem.writeFile({
                    path: filename, data: base64Data, directory: 'CACHE'
                });
                await window.Capacitor.Plugins.Share.share({
                    title: 'Esporta CSV', url: savedFile.uri
                });
            } catch (err) {
                console.error("Errore Capacitor:", err);
                alert("Impossibile esportare: " + err.message);
            }
        };
        reader.readAsDataURL(blob);
    } else {
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        if (showToast) showToast("CSV scaricato con successo!");
    }
}

export function parseCSV(text) {
    let separator = ',';
    const firstLine = text.split('\n')[0] || '';
    const commaCount = (firstLine.match(/,/g) || []).length;
    const semiCount = (firstLine.match(/;/g) || []).length;
    if (semiCount > commaCount) separator = ';';

    const lines = [];
    let row = [""];
    let inQuotes = false;
    for (let i = 0; i < text.length; i++) {
        const c = text[i];
        const next = text[i + 1];
        if (c === '"') {
            if (inQuotes && next === '"') {
                row[row.length - 1] += '"';
                i++;
            } else {
                inQuotes = !inQuotes;
            }
        } else if (c === separator && !inQuotes) {
            row.push("");
        } else if ((c === '\r' || c === '\n') && !inQuotes) {
            if (c === '\r' && next === '\n') i++;
            lines.push(row);
            row = [""];
        } else {
            row[row.length - 1] += c;
        }
    }
    if (row.length > 1 || row[0] !== "") lines.push(row);
    return lines;
}

export function importaCSV(file, {
    isLoggedIn,
    giorni,
    turni,
    staff,
    createPlacedElement,
    updateCellCounter,
    saveState,
    updateAllSidebarCounts,
    showToast
}) {
    if (!isLoggedIn) return showToast && showToast("Devi accedere per importare i turni.");
    if (window.isHistoricalMode) return alert("⚠️ Sei in Modalità Archivio. Non è possibile modificare questa griglia.");

    const reader = new FileReader();
    reader.onload = async function (e) {
        const righe = parseCSV(e.target.result);
        if (righe.length < 2) return alert("Il file CSV non contiene abbastanza righe.");
        if (!confirm("Se continui, la griglia attuale della settimana selezionata verrà completamente sovrascritta con i dati del file CSV. Vuoi procedere?")) {
            return;
        }

        if (showToast) showToast("Importazione in corso...");

        document.querySelectorAll('.cell').forEach(c => {
            c.innerHTML = '';
            updateCellCounter(c);
        });

        const header = righe[0].map(h => h.trim().toLowerCase());
        const dayColMapping = {};
        giorni.forEach((g, idx) => {
            const index = header.findIndex(h => h === g.toLowerCase());
            if (index !== -1) {
                dayColMapping[g] = index;
            } else if (header[idx + 1] !== undefined) {
                dayColMapping[g] = idx + 1;
            }
        });

        let countImportati = 0;
        for (let r = 1; r < righe.length; r++) {
            const riga = righe[r];
            if (riga.length < 2) continue;

            const nomeTurnoCSV = riga[0].trim();
            if (!nomeTurnoCSV) continue;

            const matchedTurnoObj = turni.find(t => t.toLowerCase() === nomeTurnoCSV.toLowerCase());
            if (!matchedTurnoObj) continue;

            const turnoId = matchedTurnoObj.toLowerCase().replace(/\s+/g, "_");

            giorni.forEach(giorno => {
                const colIdx = dayColMapping[giorno];
                if (colIdx === undefined || riga[colIdx] === undefined) return;

                const cellVal = riga[colIdx].trim();
                if (!cellVal) return;

                let personeNomi = [];
                if (cellVal.includes(';')) personeNomi = cellVal.split(';').map(p => p.trim());
                else if (cellVal.includes(',')) personeNomi = cellVal.split(',').map(p => p.trim());
                else if (cellVal.includes('|')) personeNomi = cellVal.split('|').map(p => p.trim());
                else personeNomi = [cellVal];

                const cellId = `${giorno.toLowerCase()}-${turnoId}`;
                const cellDiv = document.querySelector(`.cell[data-cell-id="${cellId}"]`);

                if (cellDiv) {
                    personeNomi.forEach(personeRawStr => {
                        let raw = personeRawStr.trim();
                        if (!raw) return;

                        let inDubbio = false;
                        if (raw.includes('?')) {
                            inDubbio = true;
                            raw = raw.replace(/\?/g, '').trim();
                        }

                        let timeTag = '';
                        const parenMatch = raw.match(/\(([^)]+)\)/);
                        if (parenMatch) {
                            timeTag = parenMatch[1].trim();
                            raw = raw.replace(/\([^)]+\)/g, '').trim();
                        }

                        const matchedStaff = staff.find(s => s.name.trim().toLowerCase() === raw.toLowerCase());
                        const finalName = matchedStaff ? matchedStaff.name : raw;

                        const nuovoPill = createPlacedElement({ name: finalName, inDubbio, timeTag });
                        cellDiv.appendChild(nuovoPill);
                        updateCellCounter(cellDiv);
                        countImportati++;
                    });
                }
            });
        }

        if (showToast) showToast(`Importati con successo ${countImportati} inserimenti!`);
        await saveState();
        updateAllSidebarCounts();
    };

    reader.readAsText(file);
}

export async function generateICSForUser(userName, { startDateStr, giorni, turni, fasceOrarie, getGridData }) {
    if (!startDateStr) {
        alert('Seleziona una settimana prima di esportare.');
        return;
    }

    const gridData = getGridData ? getGridData() : {};
    let icsContent = "BEGIN:VCALENDAR\nVERSION:2.0\nPRODID:-//Turni Cloud//IT\nCALSCALE:GREGORIAN\n";
    const baseDate = new Date(startDateStr);

    giorni.forEach((giorno, gIndex) => {
        const currentDay = new Date(baseDate);
        currentDay.setDate(currentDay.getDate() + gIndex);

        turni.forEach(turno => {
            const turnoSlug = turno.toLowerCase().replace(/\s+/g, "_");
            const cellId = `${giorno.toLowerCase()}-${turnoSlug}`;
            const people = gridData[cellId] || [];

            people.forEach(person => {
                if (person.name === userName) {
                    let startTime = "090000";
                    let endTime = "130000";

                    const fascia = fasceOrarie[turnoSlug] || "generale";
                    if (fascia === "mattina") {
                        startTime = "080000"; endTime = "120000";
                    } else if (fascia === "pranzo") {
                        startTime = "113000"; endTime = "153000";
                    } else if (fascia === "cena") {
                        startTime = "180000"; endTime = "230000";
                    }

                    const startDt = new Date(currentDay);
                    startDt.setHours(parseInt(startTime.substring(0, 2)), parseInt(startTime.substring(2, 4)), 0, 0);
                    const endDt = new Date(currentDay);
                    endDt.setHours(parseInt(endTime.substring(0, 2)), parseInt(endTime.substring(2, 4)), 0, 0);

                    const dtStart = startDt.toISOString().replace(/[-:]/g, '').split('.')[0] + "Z";
                    const dtEnd = endDt.toISOString().replace(/[-:]/g, '').split('.')[0] + "Z";

                    icsContent += "BEGIN:VEVENT\n";
                    icsContent += `UID:${btoa(Math.random().toString()).substring(0, 10)}@turnicloud.it\n`;
                    icsContent += `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').split('.')[0]}Z\n`;
                    icsContent += `DTSTART:${dtStart}\n`;
                    icsContent += `DTEND:${dtEnd}\n`;
                    icsContent += `SUMMARY:Turno: ${turno}\n`;
                    icsContent += "END:VEVENT\n";
                }
            });
        });
    });

    icsContent += "END:VCALENDAR";

    const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
    const finalFilename = `turni_${userName.replace(/\s+/g, '_')}_${startDateStr}.ics`;

    try {
        if (window.Capacitor && window.Capacitor.isNativePlatform()) {
            const reader = new FileReader();
            reader.onloadend = async () => {
                const base64Data = reader.result.split(',')[1];
                const savedFile = await window.Capacitor.Plugins.Filesystem.writeFile({
                    path: finalFilename, data: base64Data, directory: 'CACHE'
                });
                await window.Capacitor.Plugins.Share.share({
                    title: 'Esporta Calendario', url: savedFile.uri
                });
            };
            reader.readAsDataURL(blob);
        } else {
            const link = document.createElement('a');
            link.href = URL.createObjectURL(blob);
            link.download = finalFilename;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        }
    } catch (err) {
        console.error("Errore esportazione ICS:", err);
        alert("Impossibile esportare il calendario.");
    }
}

export function exportTimbratureToExcel(timbratureData, nomeAzienda = 'Azienda', mese = '') {
    if (!timbratureData || !timbratureData.length) {
        alert("Nessuna timbratura presente per il mese selezionato.");
        return;
    }

    let csvContent = "data:text/csv;charset=utf-8,";
    csvContent += "Dipendente,Ingresso,Uscita,Ore Lavorate\n";

    timbratureData.forEach(row => {
        const ingresso = row.ingresso ? new Date(row.ingresso).toLocaleString('it-IT') : '';
        const uscita = row.uscita ? new Date(row.uscita).toLocaleString('it-IT') : '';
        let oreStr = 'In corso';

        if (row.ingresso && row.uscita) {
            const diffMs = new Date(row.uscita) - new Date(row.ingresso);
            const ore = Math.floor(diffMs / (1000 * 60 * 60));
            const min = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
            oreStr = `${ore}h ${min}m`;
        }

        csvContent += `"${row.nome_dipendente}","${ingresso}","${uscita}","${oreStr}"\n`;
    });

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `Report_Timbrature_${nomeAzienda}_${mese || 'mensile'}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

if (typeof window !== 'undefined') {
    window.TurniExport = {
        exportToPDF,
        gestisciEsportazione,
        esportaCSV,
        parseCSV,
        importaCSV,
        generateICSForUser,
        exportTimbratureToExcel
    };
}
