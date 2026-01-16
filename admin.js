// Authentication
const authSection = document.getElementById('auth-section');
const adminDashboard = document.getElementById('admin-dashboard');
const loginForm = document.getElementById('login-form');
const authError = document.getElementById('auth-error');
const logoutBtn = document.getElementById('logout-btn');

auth.onAuthStateChanged(user => {
    if (user) {
        authSection.classList.add('hidden');
        adminDashboard.classList.remove('hidden');
    } else {
        authSection.classList.remove('hidden');
        adminDashboard.classList.add('hidden');
    }
});

loginForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;

    auth.signInWithEmailAndPassword(email, password)
        .catch((error) => {
            authError.innerText = error.message;
            authError.classList.remove('hidden');
        });
});

logoutBtn.addEventListener('click', () => {
    auth.signOut();
});

// Data Upload
const fileInput = document.getElementById('file-input');
const uploadStatus = document.getElementById('upload-status');
const statusMessage = document.getElementById('status-message');
const progressBar = document.getElementById('progress-bar');
const uploadResult = document.getElementById('upload-result');

fileInput.addEventListener('change', handleFileUpload);

async function handleFileUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    // Reset UI
    uploadStatus.classList.remove('hidden');
    uploadResult.classList.add('hidden');
    progressBar.style.width = '0%';
    statusMessage.innerText = 'Reading file...';

    const reader = new FileReader();
    reader.onload = async (e) => {
        try {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, { type: 'array', cellDates: true });
            const firstSheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[firstSheetName];
            const jsonData = XLSX.utils.sheet_to_json(worksheet);

            statusMessage.innerText = `Processing ${jsonData.length} records...`;
            await uploadDataToFirestore(jsonData);

        } catch (error) {
            console.error('Error details:', error);
            showResult(`Error processing file: ${error.message}`, 'text-red-400');
            uploadStatus.classList.add('hidden');
        }
    };
    reader.readAsArrayBuffer(file);
}

// Helper parsers (Same as app.js)
const parsePrice = (val) => {
    if (typeof val === 'number') return val;
    if (typeof val === 'string') return parseFloat(val.replace(/[$,]/g, ''));
    return 0;
};

const parseDate = (val) => {
    // Force a fresh native Date object to avoid "custom object" errors from libraries
    if (val instanceof Date) return new Date(val.getTime());
    if (typeof val === 'string' || typeof val === 'number') return new Date(val);
    return new Date(NaN); // Invalid
};

const normalizeYesNo = (val) => {
    if (!val) return 'No';
    const s = String(val).trim().toUpperCase();
    return (s === 'Y' || s === 'YES') ? 'Yes' : 'No';
};

const normalizeCityLimits = (val) => {
    if (!val) return 'Unknown';
    const s = String(val).trim().toUpperCase();
    if (s === 'Y' || s === 'YES') return 'Yes';
    if (s === 'N' || s === 'NO') return 'No';
    return 'Unknown';
};

async function uploadDataToFirestore(rawData) {
    const batchSize = 400; // Firestore batch limit is 500
    let addedCount = 0;

    // We need to sanitize the data into plain JS objects for Firestore
    // This wrapper ensures no "custom objects" from XLSX leak through
    const collectionRef = db.collection('sales_data');

    // 1. Process all records first
    const cleanRecords = rawData.map(row => {
        let dimPrice = row['Price'];
        if (typeof dimPrice === 'string') dimPrice = parseFloat(dimPrice.replace(/[$,]/g, ''));
        if (dimPrice == null || isNaN(dimPrice)) dimPrice = 0;

        const dateObj = parseDate(row['Closed Date']);

        // Skip invalid dates
        if (isNaN(dateObj.getTime())) return null;

        // Construct PLAIN OBJECT strictly
        const record = {
            address: String(row['Address'] || row['Street Name'] || row['Street Address'] || '').trim(),
            date: dateObj, // Firestore likes native Date objects
            price: Number(dimPrice),
            pricePerSqFt: Number(parsePrice(row['Price Per SQFT']) || 0),
            sqFt: Number(row['Apx SQFT'] || 0),
            daysOnMarket: Number(row['Days On Market'] || 0),
            city: String(row['City'] || 'Unknown').trim(),
            subdivision: String(row['Subdivision'] || '').trim(),
            beds: Number(row['Beds'] || 0),
            baths: Number(row['Full Baths'] || 0),
            year: Number(dateObj.getFullYear()),
            newConstruction: normalizeYesNo(row['New Construction?']),
            insideCityLimits: normalizeCityLimits(row['Inside City Limits'] || row['Inside City Limit']),
            uniqueKey: `${dateObj.getTime()}-${(row['Address'] || '').trim().toLowerCase()}-${dimPrice}`
        };

        // NUCLEAR SANITIZATION:
        // Convert to JSON and back to remove ANY prototypes or hidden properties
        // Date objects will become Strings strings during JSON.stringify, so we must restore them.
        const plain = JSON.parse(JSON.stringify(record));
        plain.date = new Date(record.date.getTime()); // Restore the Date object manually

        return plain;

    }).filter(d => d !== null && d.price > 0 && d.year > 2000);

    // 2. Upload in batches
    // Strategy: We can't easily check all 2000+ records one by one efficiently without many reads.
    // Optimization: We will use the 'uniqueKey' as the Document ID. Firestore handles idempotency!
    // If we try to write the same Doc ID, it will just overwrite (or validly 'update') the record.
    // Since the content is the same, this is effectively an "Ignore Duplicate" or "Update to latest".

    const total = cleanRecords.length;
    console.log(`Ready to upload ${total} sanitized records.`);

    for (let i = 0; i < total; i += batchSize) {
        const batch = db.batch();
        const chunk = cleanRecords.slice(i, i + batchSize);

        chunk.forEach(record => {
            // Ensure uniqueKey is safe for ID
            const safeKey = record.uniqueKey.replace(/\//g, '_');
            const docRef = collectionRef.doc(safeKey);
            batch.set(docRef, record); // FIXED: Requires docRef as 1st arg
        });

        await batch.commit();
        addedCount += chunk.length;

        // Update Progress
        const percent = Math.round(((i + chunk.length) / total) * 100);
        progressBar.style.width = `${percent}%`;
        statusMessage.innerText = `Uploaded ${addedCount} / ${total} records...`;
    }

    uploadStatus.classList.add('hidden');
    showResult(`Success! Processed ${total} records.`, 'text-green-400');

    // Clear input
    fileInput.value = '';
}

function showResult(msg, colorClass) {
    uploadResult.innerHTML = `<p class="${colorClass}">${msg}</p>`;
    uploadResult.classList.remove('hidden');
}
