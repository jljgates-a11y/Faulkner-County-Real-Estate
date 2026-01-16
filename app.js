
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
const dashboard = document.getElementById('dashboard');
const loadingScreen = document.getElementById('loading-screen');
const loadingText = document.getElementById('loading-text');
const statusText = document.getElementById('status-text');

// Filter State
const filterState = {
    selectedYears: [],
    selectedCities: [],
    selectedNewConstruction: [],
    selectedCityLimits: []
};

// Init
document.addEventListener('DOMContentLoaded', () => {
    fetchDataFromFirestore();
});

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
// DATA PROCESSING (FIRESTORE)
// ------------------------------------------------------------------

async function fetchDataFromFirestore() {
    if (!loadingText) {
        console.error("Loading text element not found");
        return;
    }

    loadingText.innerText = "Connecting to database (Timeout 20s)...";

    // Check if firebase is initialized
    if (!db) {
        loadingText.innerHTML = "Error: Firebase DB not initialized.<br>Check firebase-config.js";
        loadingText.classList.add('text-red-500');
        throw new Error("Firebase DB not initialized.");
    }

    try {
        // Create a timeout promise to fail fast if network/auth is blocked
        const timeout = new Promise((_, reject) =>
            setTimeout(() => reject(new Error("Connection timed out. Check firewall or internet.")), 20000)
        );

        // Race the fetch against the timeout
        // NO LIMIT: Fetching all records
        const snapshot = await Promise.race([
            db.collection('sales_data').orderBy('date', 'desc').get(),
            timeout
        ]);

        if (snapshot.empty) {
            loadingText.innerText = "Connected, but no data found. Please upload data via Admin Portal.";
            statusText.innerText = "No Data";
            statusText.classList.add('text-red-400');
            return;
        }

        loadingText.innerText = `Downloaded ${snapshot.size} records. Parsing...`;

        // Allow UI to update before heavy processing
        await new Promise(r => setTimeout(r, 50));

        const data = [];
        snapshot.forEach(doc => {
            try {
                const d = doc.data();

                // Robust Date Parsing
                let dateObj;
                if (d.date && typeof d.date.toDate === 'function') {
                    dateObj = d.date.toDate();
                } else {
                    dateObj = new Date(d.date);
                }

                if (!isNaN(dateObj.getTime())) {
                    data.push({ ...d, date: dateObj });
                }
            } catch (err) {
                console.warn("Skipping record", doc.id, err);
            }
        });

        await processData(data);

    } catch (error) {
        console.error("Fetch Error:", error);
        loadingText.innerHTML = `Error: ${error.message}<br><span class="text-sm text-gray-400">If this persists, check console logs (F12)</span>`;
        loadingText.classList.add('text-red-500');
        // We do NOT hide the loading screen so the user sees the error
    }
}

async function processData(data) {
    loadingText.innerText = "Normalizing data types...";
    await new Promise(r => setTimeout(r, 10));

    // Map and Clean columns based on user screenshot
    // Safe parsers
    const parsePrice = (val) => {
        if (typeof val === 'number') return val;
        if (typeof val === 'string') return parseFloat(val.replace(/[$,]/g, ''));
        return 0;
    };

    rawData = data.map(row => {
        // STRICTLY use 'Price' column as requested
        let dimPrice = row['price']; // From Firestore keys (lowercase)

        // Ensure we handle currency formatting or strings
        if (typeof dimPrice === 'string') {
            dimPrice = parseFloat(dimPrice.replace(/[$,]/g, ''));
        }
        // If undefined or null, default to 0
        if (dimPrice == null || isNaN(dimPrice)) {
            dimPrice = 0;
        }

        return {
            address: row['address'] || '',
            date: row['date'],
            price: dimPrice,
            pricePerSqFt: row['pricePerSqFt'] || 0,
            sqFt: row['sqFt'] || 0,
            daysOnMarket: row['daysOnMarket'] || 0,
            city: row['city'] || 'Unknown',
            subdivision: row['subdivision'] || '',
            beds: row['beds'] || 0,
            baths: row['baths'] || 0,
            year: row['date'].getFullYear(),
            newConstruction: row['newConstruction'] || 'No',
            insideCityLimits: row['insideCityLimits'] || 'Unknown'
        };
    }).filter(d => !isNaN(d.price) && d.price > 0 && d.date.getFullYear() > 2000);

    loadingText.innerText = `Checking for duplicates in ${rawData.length} records...`;
    await new Promise(r => setTimeout(r, 10));

    // Filter Duplicates (Same Day + Same Address + Same Price)
    const seen = new Set();
    const initialCount = rawData.length;
    rawData = rawData.filter(d => {
        const key = `${d.date.getTime()}-${d.address.trim().toLowerCase()}-${d.price}`;

        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
    console.log(`Processed ${rawData.length} valid records.`);

    try {
        loadingText.innerText = "Building: Filters...";
        await new Promise(r => setTimeout(r, 10));

        // Init Defaults (All Selected)
        filterState.selectedYears = [...new Set(rawData.map(d => d.year))];
        filterState.selectedCities = [...new Set(rawData.map(d => d.city))];
        filterState.selectedNewConstruction = ['Yes', 'No'];
        // Include ALL City Limits options (including 'Unknown') by default
        filterState.selectedCityLimits = [...new Set(rawData.map(d => d.insideCityLimits))];

        populateFilters();

        // Initial Rendering Loop (Granular)
        loadingText.innerText = "Building: KPIs...";
        await new Promise(r => setTimeout(r, 10));
        updateKPIs(rawData);

        loadingText.innerText = "Rendering: Trend Chart...";
        await new Promise(r => setTimeout(r, 10));
        try { renderTrendChart(rawData); } catch (e) { console.error("Trend Chart Failed", e); }

        loadingText.innerText = "Rendering: Distribution Chart...";
        await new Promise(r => setTimeout(r, 10));
        try { renderDistChart(rawData); } catch (e) { console.error("Dist Chart Failed", e); }

        loadingText.innerText = "Rendering: City Chart...";
        await new Promise(r => setTimeout(r, 10));
        try { renderCityChart(rawData); } catch (e) { console.error("City Chart Failed", e); }

        loadingText.innerText = "Building: Property List...";
        await new Promise(r => setTimeout(r, 10));
        try { renderPropertyTable(rawData); } catch (e) { console.error("Table Build Failed", e); }

        loadingText.innerText = "Rendering: Scatter Chart...";
        await new Promise(r => setTimeout(r, 10));
        try { renderScatterChart(rawData); } catch (e) { console.error("Scatter Chart Failed", e); }

    } catch (err) {
        console.error("Dashboard Build Error:", err);
        // Continue to show dashboard anyway
    }

    // FINAL SUCCESS
    loadingText.innerText = "Done!";
    await new Promise(r => setTimeout(r, 200));

    // Force hide using inline style to override CSS ID specificity (#loading-screen display:flex)
    if (loadingScreen) loadingScreen.style.display = 'none';

    if (dashboard) dashboard.classList.remove('hidden');
    if (statusText) statusText.innerText = `Live Data (${rawData.length} records)`;
}

function populateFilters() {
    renderMultiSelect('year-options', [...new Set(rawData.map(d => d.year))], 'selectedYears', 'year-label', 'Year');
    renderMultiSelect('city-options', [...new Set(rawData.map(d => d.city))], 'selectedCities', 'city-label', 'City');
    renderMultiSelect('new-construction-options', [...new Set(rawData.map(d => d.newConstruction))], 'selectedNewConstruction', 'new-construction-label', 'New Construction');
    renderMultiSelect('city-limits-options', [...new Set(rawData.map(d => d.insideCityLimits))], 'selectedCityLimits', 'city-limits-label', 'Inside City Limits');
}

function renderMultiSelect(containerId, options, stateKey, labelId, labelSuffix) {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = '';

    // Sort options
    options.sort();
    if (typeof options[0] === 'number') options.sort((a, b) => b - a); // Years desc

    // Header actions (Clear All)
    const header = document.createElement('div');
    header.className = 'flex justify-end px-4 py-2 text-xs text-brand-500 border-b border-gray-700 mb-1';
    header.innerHTML = `<span class="cursor-pointer hover:text-brand-300 transition-colors" onclick="clearFilter(event, '${containerId}', '${stateKey}', '${labelId}', '${labelSuffix}')">Clear All</span>`;
    container.appendChild(header);

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
    updateDashboard(); // Re-render logic is below
}

function updateLabel(stateKey, labelId, labelSuffix) {
    const el = document.getElementById(labelId);
    if (el) el.innerText = labelSuffix;
}

// Global Filter Actions
window.clearFilter = (e, containerId, stateKey, labelId, labelSuffix) => {
    e.stopPropagation(); // Keep dropdown open
    e.preventDefault();

    // 1. Clear State
    filterState[stateKey] = [];

    // 2. Uncheck All UI Inputs in this container
    const inputs = document.querySelectorAll(`#${containerId} input[type="checkbox"]`);
    inputs.forEach(input => input.checked = false);

    // 3. Update Dashboard
    updateLabel(stateKey, labelId, labelSuffix);
    updateDashboard();
};

// ------------------------------------------------------------------
// DASHBOARD LOGIC (Re-render)
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

    // We do NOT assume granular steps here for performance on filter change
    // But we wrap in try/catch to be safe
    try { renderTrendChart(filteredData); } catch (e) { }
    try { renderDistChart(filteredData); } catch (e) { }
    try { renderCityChart(filteredData); } catch (e) { }
    try { renderPropertyTable(filteredData); } catch (e) { }
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

// ------------------------------------------------------------------
// TABLE RENDERER
// ------------------------------------------------------------------

function renderPropertyTable(data) {
    const tbody = document.getElementById('property-table-body');
    const countLabel = document.getElementById('table-count');

    if (!tbody) return;

    // Update count
    if (countLabel) countLabel.innerText = `(${data.length.toLocaleString()} records)`;

    // Clear existing
    tbody.innerHTML = '';

    // Optimization: Render only top 200 rows if dataset is huge, 
    // or render all if reasonable. For 8,000, rendering all strings is fine 
    // but might be sluggish. Let's start with a safe limit or render all.
    // Given the request is "Scrollable list", user likely wants ALL.
    // We will render chunks or just render all since 8k text rows is manageable in modern browsers 
    // but better to cap at 1000 for DOM performance unless user scrolls.
    // For now, let's render top 1000 to keep it snappy.

    const limit = 2000;
    const displayData = data.slice(0, limit);

    const formatCurrency = (n) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
    const formatDate = (d) => d.toLocaleDateString('en-US');

    let html = '';
    displayData.forEach(row => {
        html += `
            <tr class="hover:bg-white/5 transition-colors">
                <td class="p-3">${formatDate(row.date)}</td>
                <td class="p-3 font-medium text-gray-200">${row.address}</td>
                <td class="p-3">${row.city}</td>
                <td class="p-3 text-right text-brand-500">${formatCurrency(row.price)}</td>
                <td class="p-3 text-right">${row.sqFt.toLocaleString()}</td>
                <td class="p-3 text-right">$${row.pricePerSqFt.toFixed(0)}</td>
            </tr>
        `;
    });

    if (data.length > limit) {
        html += `<tr><td colspan="6" class="p-4 text-center text-xs text-brand-500 italic">Showing top ${limit} results of ${data.length}...</td></tr>`;
    }

    tbody.innerHTML = html;
}
