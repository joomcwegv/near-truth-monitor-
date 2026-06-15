const CONTRACT_ID = 'truth-monitor-123.testnet';
const NETWORK_ID = 'testnet';
const NODE_URL = 'https://rpc.testnet.near.org';
const WALLET_URL = 'https://testnet.mynearwallet.com/';

// State
let wallet;
let accountId = null;

// Initialize NEAR via RPC for view calls
async function initNear() {
    try {
        loadReports();
    } catch (err) {
        console.error("Init Error:", err);
    }
}

// Fetch reports directly from RPC
async function loadReports() {
    showSpinner(true);
    try {
        const response = await fetch(NODE_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                jsonrpc: '2.0',
                id: '1',
                method: 'query',
                params: {
                    request_type: 'call_function',
                    finality: 'final',
                    account_id: CONTRACT_ID,
                    method_name: 'get_reports',
                    args_base64: 'e30=' // "{}" in base64
                }
            })
        });

        const data = await response.json();
        if (data.result && data.result.result) {
            const bytes = data.result.result;
            const text = new TextDecoder().decode(new Uint8Array(bytes));
            const reports = JSON.parse(text);
            
            updateStats(reports);
            renderReports(reports);
        } else {
            renderReports([]);
        }
    } catch (e) {
        console.error("Failed to load reports:", e);
        showToast("Қате: Блокчейннен оқу мүмкін болмады", "error");
        renderReports([]);
    } finally {
        showSpinner(false);
    }
}

function updateStats(reports) {
    document.getElementById('statReports').textContent = reports.length;
    
    let totalTips = 0;
    const schools = new Set();
    
    reports.forEach(r => {
        if (r.school_name) schools.add(r.school_name);
        if (r.tips) {
            // Convert yoctoNEAR to NEAR roughly
            const tipInNear = parseFloat(r.tips) / 1e24;
            if (!isNaN(tipInNear)) totalTips += tipInNear;
        }
    });

    document.getElementById('statSchools').textContent = schools.size;
    document.getElementById('statTreasury').textContent = totalTips.toFixed(2);
}

function renderReports(reports) {
    const list = document.getElementById('reportsList');
    
    if (!reports || reports.length === 0) {
        list.innerHTML = `
            <div class="no-reports">
                <div class="no-reports-icon">📜</div>
                <div class="no-reports-text">Әзірге ешқандай шағым жоқ</div>
            </div>
        `;
        return;
    }

    // Reverse to show newest first
    const html = [...reports].reverse().map(report => {
        const catMap = {
            'budget': '💰 Бюджет',
            'infrastructure': '🏗️ Инфрақұрылым',
            'food': '🍽️ Тамақ',
            'staff': '👤 Кадрлар',
            'other': '📌 Басқа'
        };
        const catDisplay = catMap[report.category] || report.category;
        
        let tipText = "Донат жоқ";
        if (report.tips && report.tips !== "0") {
            const tipInNear = (parseFloat(report.tips) / 1e24).toFixed(2);
            tipText = `💎 ${tipInNear} NEAR`;
        }

        return `
            <div class="report-card">
                <div class="report-header">
                    <div class="report-school">🏫 ${escapeHtml(report.school_name)}</div>
                    <div class="report-category cat-${escapeHtml(report.category)}">${escapeHtml(catDisplay)}</div>
                </div>
                <div class="report-text">${escapeHtml(report.text)}</div>
                <div class="report-footer">
                    <div class="report-author">✍️ ${escapeHtml(report.author)}</div>
                    <div class="report-tips">${tipText}</div>
                </div>
            </div>
        `;
    }).join('');

    list.innerHTML = html;
}

// Form Submission
document.getElementById('reportForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const schoolName = document.getElementById('schoolName').value;
    const category = document.getElementById('category').value;
    const text = document.getElementById('reportText').value;

    const btn = document.getElementById('submitBtn');
    const btnText = btn.querySelector('.btn-text');
    const loader = btn.querySelector('.btn-loader');

    btn.disabled = true;
    btnText.style.display = 'none';
    loader.style.display = 'inline-block';

    showToast("Бұл тек оқуға арналған MVP. Әмиян қосылған жоқ.", "error");
    
    setTimeout(() => {
        btn.disabled = false;
        btnText.style.display = 'inline-block';
        loader.style.display = 'none';
    }, 2000);
});

// Utilities
function showSpinner(show) {
    const spinner = document.getElementById('loadingSpinner');
    if (spinner) {
        spinner.style.display = show ? 'flex' : 'none';
    }
}

function showToast(message, type = "success") {
    const toast = document.getElementById('toast');
    const icon = toast.querySelector('.toast-icon');
    const text = toast.querySelector('.toast-message');

    toast.className = `toast ${type}`;
    icon.textContent = type === "success" ? "✅" : "⚠️";
    text.textContent = message;

    toast.classList.add('show');
    
    setTimeout(() => {
        toast.classList.remove('show');
    }, 3000);
}

function scrollToForm() {
    document.getElementById('formSection').scrollIntoView({ behavior: 'smooth' });
}

function escapeHtml(unsafe) {
    if (!unsafe) return "";
    return unsafe
        .toString()
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

// Start
document.addEventListener('DOMContentLoaded', initNear);
