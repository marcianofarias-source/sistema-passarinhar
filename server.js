function loadReport() {
    const start = document.getElementById('reportStartDate').value;
    const end = document.getElementById('reportEndDate').value;
    const seller = document.getElementById('reportSellerSelect').value;

    fetch(`${API_BASE_URL}/api/reports?start=${start}&end=${end}&sellerId=${seller}`)
    .then(async res => {
        if (!res.ok) {
            const errData = await res.json().catch(() => ({}));
            throw new Error(errData.message || `Erro do servidor (${res.status})`);
        }
        return res.json();
    })
    .then(data => {
        document.getElementById('metricTotal').innerText = data.total || data.totalVisits || 0;
        document.getElementById('metricCompleted').innerText = data.completed || 0;
        document.getElementById('metricInProgress').innerText = data.inProgress || 0;
        document.getElementById('metricScheduled').innerText = data.scheduled || 0;

        const tbody = document.getElementById('reportTableBody');
        if (!data.visits || data.visits.length === 0) {
            tbody.innerHTML = '<tr><td colspan="8" style="text-align: center;">Nenhuma visita encontrada no período.</td></tr>';
            return;
        }

        let rows = '';
        data.visits.forEach(v => {
            const gpsLink = (v.latitude && v.longitude) 
                ? `<a href="https://maps.google.com/?q=${v.latitude},${v.longitude}" target="_blank" class="map-link">Ver no Mapa</a>` 
                : 'Não registrado';

            rows += `
                <tr>
                    <td>${v.scheduledDate || '-'}</td>
                    <td>${v.clientName || '-'}</td>
                    <td>${v.sellerName || '-'}</td>
                    <td>${v.status || '-'}</td>
                    <td>${v.notes || '-'}</td>
                    <td>${v.startTime ? new Date(v.startTime).toLocaleTimeString() : '-'}</td>
                    <td>${v.endTime ? new Date(v.endTime).toLocaleTimeString() : '-'}</td>
                    <td>${gpsLink}</td>
                </tr>
            `;
        });
        tbody.innerHTML = rows;
    })
    .catch(err => {
        console.error(err);
        alert(err.message);
    });
}