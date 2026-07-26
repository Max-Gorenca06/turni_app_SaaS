// Modulo Esportazione Report PDF e Excel
/* global html2pdf, html2canvas */

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
