
// State
let rawData = [];
let chartInstances = {};

// Color Palette
const COLORS = {
    brand: '#bed600',
    brandLight: '#d9e855',
    accent: '#13294b',
    success: '#4ade80',
    warning: '#fbbf24',
    text: '#94a3b8',
    grid: 'rgba(148, 163, 184, 0.1)'
};

// Chart.js Defaults
Chart.defaults.color = COLORS.text;
Chart.defaults.borderColor = COLORS.grid;
Chart.defaults.font.family = 'Outfit';

// DOM Elements
const fileInput = document.getElementById('file-input');
const uploadSection = document.getElementById('upload-section');
const dashboard = document.getElementById('dashboard');
const statusText = document.getElementById('status-text');

// Filter State
const filterState = {
    selectedYears: [],
    selectedCities: [],
    selectedNewConstruction: [],
    selectedCityLimits: []
};

// Event Listeners
fileInput.addEventListener('change', handleFileUpload);

// Close dropdowns when clicking outside
window.addEventListener('click', (e) => {
    if (!e.target.closest('.custom-dropdown')) {
        document.querySelectorAll('.custom-dropdown-content').forEach(d => d.classList.remove('show'));
    }
});

function toggleDropdown(id) {
    const content = document.querySelector(`#${id} .custom-dropdown-content`);
    const allContents = document.querySelectorAll('.custom-dropdown-content');
    allContents.forEach(c => {
        if (c !== content) c.classList.remove('show');
    });
    content.classList.toggle('show');
}

// ------------------------------------------------------------------
// DATA PROCESSING
// ------------------------------------------------------------------

function handleFileUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    statusText.innerText = 'Reading file...';

    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, { type: 'array', cellDates: true });

            // Assume first sheet is the one we want
            const firstSheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[firstSheetName];

            // Convert to JSON
            const jsonData = XLSX.utils.sheet_to_json(worksheet);

            processData(jsonData);

            // UI Transition
            uploadSection.classList.add('hidden');
            dashboard.classList.remove('hidden');
            statusText.innerText = 'Data Loaded';

        } catch (error) {
            console.error('Error details:', error);
            alert(`Error processing file: ${error.message}`);
            statusText.innerText = 'Error';
        }
    };
    reader.readAsArrayBuffer(file);
}

function processData(data) {
    // Map and Clean columns based on user screenshot
    rawData = data.map(row => {
        // Safe parsers
        const parsePrice = (val) => {
            if (typeof val === 'number') return val;
            if (typeof val === 'string') return parseFloat(val.replace(/[$,]/g, ''));
            return 0;
        };

        const parseDate = (val) => {
            if (val instanceof Date) return val;
            return new Date(val); // Hope for the best
        };

        return {
            date: parseDate(row['Closed Date']),
            price: parsePrice(row['Price']),
            pricePerSqFt: parsePrice(row['Price Per SQFT']),
            sqFt: parseFloat(row['Apx SQFT'] || 0),
            daysOnMarket: parseInt(row['Days On Market'] || 0),
            city: row['City']?.trim() || 'Unknown',
            subdivision: row['Subdivision'] || '',
            beds: row['Beds'],
            baths: row['Full Baths'],
            year: parseDate(row['Closed Date']).getFullYear(),
            newConstruction: row['New Construction?'] || 'No', // Default to No if missing
            insideCityLimits: row['Inside City Limits'] || row['Inside City Limit'] || 'Unknown' // Handle variation
        };
    }).filter(d => !isNaN(d.price) && d.price > 0 && d.date.getFullYear() > 2000); // Basic validation filter

    // Init Defaults (All Selected)
    filterState.selectedYears = [...new Set(rawData.map(d => d.year))];
    filterState.selectedCities = [...new Set(rawData.map(d => d.city))];
    filterState.selectedNewConstruction = [...new Set(rawData.map(d => d.newConstruction))];
    filterState.selectedCityLimits = [...new Set(rawData.map(d => d.insideCityLimits))].filter(x => x !== 'Unknown');

    populateFilters();
    updateDashboard();
}

function populateFilters() {
    renderMultiSelect('year-options', [...new Set(rawData.map(d => d.year))], 'selectedYears', 'year-label', 'Year');
    renderMultiSelect('city-options', [...new Set(rawData.map(d => d.city))], 'selectedCities', 'city-label', 'City');
    renderMultiSelect('new-construction-options', [...new Set(rawData.map(d => d.newConstruction))], 'selectedNewConstruction', 'new-construction-label', 'New Construction');
    renderMultiSelect('city-limits-options', [...new Set(rawData.map(d => d.insideCityLimits))].filter(x => x !== 'Unknown'), 'selectedCityLimits', 'city-limits-label', 'Inside City Limits');
}

function renderMultiSelect(containerId, options, stateKey, labelId, labelSuffix) {
    const container = document.getElementById(containerId);
    container.innerHTML = '';

    // Sort options
    options.sort();
    if (typeof options[0] === 'number') options.sort((a, b) => b - a); // Years desc

    // Header actions (Select All / None)
    const header = document.createElement('div');
    header.className = 'flex justify-between px-4 py-2 text-xs text-brand-500 border-b border-gray-700 mb-1';
    header.innerHTML = `<span class="cursor-pointer hover:text-brand-300" onclick="selectAll('${stateKey}')">All</span> <span class="cursor-pointer hover:text-brand-300" onclick="deselectAll('${stateKey}')">None</span>`;
    // We need to bind these actions globally or handle them differently. 
    // Simplified: Just render items.

    options.forEach(opt => {
        const div = document.createElement('div');
        div.className = 'checkbox-item';
        div.innerHTML = `
            <input type="checkbox" value="${opt}" checked>
            <span class="text-sm">${opt}</span>
        `;
        div.onclick = (e) => {
            if (e.target.tagName !== 'INPUT') {
                const cb = div.querySelector('input');
                cb.checked = !cb.checked;
                handleFilterChange(cb, stateKey, labelId, labelSuffix);
            }
        };
        div.querySelector('input').onclick = (e) => {
            handleFilterChange(e.target, stateKey, labelId, labelSuffix);
            e.stopPropagation();
        };
        container.appendChild(div);
    });

    updateLabel(stateKey, labelId, labelSuffix);
}

function handleFilterChange(checkbox, stateKey, labelId, labelSuffix) {
    let val = checkbox.value;
    // Check if number
    if (!isNaN(parseFloat(val)) && isFinite(val)) val = parseFloat(val); // Simple check, careful with cities named "2020"

    if (checkbox.checked) {
        if (!filterState[stateKey].includes(val)) filterState[stateKey].push(val);
    } else {
        filterState[stateKey] = filterState[stateKey].filter(item => item !== val);
    }
    updateLabel(stateKey, labelId, labelSuffix);
    updateDashboard();
}

function updateLabel(stateKey, labelId, labelSuffix) {
    document.getElementById(labelId).innerText = labelSuffix;
}

// ------------------------------------------------------------------
// DASHBOARD LOGIC
// ------------------------------------------------------------------

function updateDashboard() {
    // Filter Data
    const filteredData = rawData.filter(d => {
        const yearMatch = filterState.selectedYears.includes(d.year);
        const cityMatch = filterState.selectedCities.includes(d.city);
        const ncMatch = filterState.selectedNewConstruction.includes(d.newConstruction);
        const iclMatch = filterState.selectedCityLimits.includes(d.insideCityLimits);
        return yearMatch && cityMatch && ncMatch && iclMatch;
    });

    updateKPIs(filteredData);
    updateCharts(filteredData);
}

function updateKPIs(data) {
    // Helpers
    const formatCurrency = (n) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
    const median = (arr) => {
        if (!arr.length) return 0;
        const sorted = [...arr].sort((a, b) => a - b);
        const mid = Math.floor(sorted.length / 2);
        return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
    };

    const totalVolume = data.reduce((sum, d) => sum + d.price, 0);
    const medianPrice = median(data.map(d => d.price));
    const medianPpsf = median(data.map(d => d.pricePerSqFt));
    const homesSold = data.length;

    document.getElementById('kpi-count').innerText = homesSold.toLocaleString();
    document.getElementById('kpi-volume').innerText = formatCurrency(totalVolume);
    document.getElementById('kpi-price').innerText = formatCurrency(medianPrice);
    document.getElementById('kpi-ppsf').innerText = `$${medianPpsf.toFixed(2)}`;
}



// ------------------------------------------------------------------
// CHARTS
// ------------------------------------------------------------------

function updateCharts(data) {
    renderTrendChart(data);
    renderDistChart(data);
    renderCityChart(data);
    renderScatterChart(data);
}

function renderTrendChart(data) {
    const ctx = document.getElementById('trendChart').getContext('2d');

    // Helper
    const median = (arr) => {
        if (!arr.length) return 0;
        const sorted = [...arr].sort((a, b) => a - b);
        const mid = Math.floor(sorted.length / 2);
        return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
    };

    // Group by Month (YYYY-MM)
    const grouped = {};
    data.forEach(d => {
        const key = d.date.toISOString().slice(0, 7); // 2021-02
        if (!grouped[key]) grouped[key] = [];
        grouped[key].push(d.price);
    });

    const sortedKeys = Object.keys(grouped).sort();
    const labels = sortedKeys;
    const values = sortedKeys.map(k => median(grouped[k]));

    if (chartInstances.trend) chartInstances.trend.destroy();

    chartInstances.trend = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Median Price',
                data: values,
                borderColor: COLORS.brand,
                backgroundColor: 'rgba(14, 165, 233, 0.1)',
                fill: true,
                tension: 0.4,
                pointRadius: 2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false }, tooltip: { mode: 'index', intersect: false } },
            scales: {
                y: { beginAtZero: false, grid: { color: COLORS.grid } },
                x: { grid: { display: false } }
            }
        }
    });
}

function renderDistChart(data) {
    const ctx = document.getElementById('distChart').getContext('2d');

    // Create bins ($50k steps)
    const bins = {};
    data.forEach(d => {
        const bin = Math.floor(d.price / 50000) * 50000;
        const key = `${bin / 1000}k-${(bin + 50000) / 1000}k`;
        bins[key] = (bins[key] || 0) + 1;
    });

    // Sort bins naturally ideally, but simple object iteration for now
    // A better approach is to define ranges explicitly, but let's just sort keys
    const sortedKeys = Object.keys(bins).sort((a, b) => {
        const valA = parseInt(a.split('k')[0]);
        const valB = parseInt(b.split('k')[0]);
        return valA - valB;
    });

    if (chartInstances.dist) chartInstances.dist.destroy();

    chartInstances.dist = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: sortedKeys,
            datasets: [{
                label: 'Number of Sales',
                data: sortedKeys.map(k => bins[k]),
                backgroundColor: COLORS.accent,
                borderRadius: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                y: { grid: { color: COLORS.grid } },
                x: { grid: { display: false } }
            }
        }
    });
}

function renderCityChart(data) {
    const ctx = document.getElementById('cityChart').getContext('2d');

    const byCity = {};
    data.forEach(d => {
        if (!byCity[d.city]) byCity[d.city] = [];
        byCity[d.city].push(d.price);
    });

    // Helper
    const median = (arr) => {
        if (!arr.length) return 0;
        const sorted = [...arr].sort((a, b) => a - b);
        const mid = Math.floor(sorted.length / 2);
        return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
    };

    const labels = Object.keys(byCity);
    const values = labels.map(c => median(byCity[c]));

    if (chartInstances.city) chartInstances.city.destroy();

    chartInstances.city = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Median Price',
                data: values,
                backgroundColor: COLORS.brandLight,
                borderRadius: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            indexAxis: 'y', // Horizontal bar
            plugins: { legend: { display: false } },
            scales: {
                x: { grid: { color: COLORS.grid } },
                y: { grid: { display: false } }
            }
        }
    });
}

function renderScatterChart(data) {
    const ctx = document.getElementById('scatterChart').getContext('2d');

    // Downsample if too big for performance
    const plotData = data.slice(0, 1000).map(d => ({ x: d.sqFt, y: d.price }));

    if (chartInstances.scatter) chartInstances.scatter.destroy();

    chartInstances.scatter = new Chart(ctx, {
        type: 'scatter',
        data: {
            datasets: [{
                label: 'Price vs SqFt',
                data: plotData,
                backgroundColor: 'rgba(129, 140, 248, 0.5)',
                pointRadius: 3,
                pointHoverRadius: 5
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                x: {
                    title: { display: true, text: 'Square Feet' },
                    grid: { color: COLORS.grid }
                },
                y: {
                    title: { display: true, text: 'Price ($)' },
                    grid: { color: COLORS.grid }
                }
            }
        }
    });
}
