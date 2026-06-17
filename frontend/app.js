const CONTRACT_ID = 'truth-monitor-123.testnet';
const NETWORK_ID = 'testnet';
const NODE_URL = 'https://rpc.testnet.near.org';
const WALLET_URL = 'https://testnet.mynearwallet.com/';

// State
let wallet;
let accountId = null;
let near;

// Initialize NEAR
async function initNear() {
    try {
        const { connect, keyStores, WalletConnection } = window.nearApi;
        
        // Setup configuration
        const connectionConfig = {
            networkId: NETWORK_ID,
            keyStore: new keyStores.BrowserLocalStorageKeyStore(),
            nodeUrl: NODE_URL,
            walletUrl: WALLET_URL,
            helperUrl: 'https://helper.testnet.near.org',
            explorerUrl: 'https://testnet.nearblocks.io'
        };

        // Connect to NEAR
        near = await connect(connectionConfig);
        wallet = new WalletConnection(near, 'truth-protocol');
        
        // Handle auth
        if (wallet.isSignedIn()) {
            accountId = wallet.getAccountId();
            updateAuthUI(true);
        } else {
            updateAuthUI(false);
        }

        // Load reports initially
        loadReports();
    } catch (err) {
        console.error("Init Error:", err);
        showToast("Блокчейнге қосылу қателігі", "error");
    }
}

function updateAuthUI(isSignedIn) {
    const authBtn = document.getElementById('authBtn');
    const heroBtn = document.getElementById('heroActionBtn');
    
    authBtn.style.display = 'inline-block';
    
    if (isSignedIn) {
        authBtn.textContent = accountId.substring(0, 14) + (accountId.length > 14 ? '...' : '') + ' (Шығу)';
        authBtn.onclick = logout;
        authBtn.style.background = 'var(--bg-secondary)';
        authBtn.style.color = 'var(--text-primary)';
        authBtn.style.border = '1px solid var(--border)';
        
        if (heroBtn) {
            heroBtn.innerHTML = '<span>📝</span> Шағым жазу';
            heroBtn.onclick = scrollToForm;
        }
    } else {
        authBtn.textContent = 'Әмиянды қосу';
        authBtn.onclick = login;
        authBtn.style.background = 'var(--accent-gradient)';
        authBtn.style.color = 'white';
        authBtn.style.border = 'none';
        
        if (heroBtn) {
            heroBtn.innerHTML = '<span>👛</span> Әмиянды қосу';
            heroBtn.onclick = login;
        }
    }
}

function login() {
    wallet.requestSignIn({
        contractId: CONTRACT_ID,
        methodNames: ['add_report', 'tip_report']
    });
}

function logout() {
    wallet.signOut();
    accountId = null;
    updateAuthUI(false);
    showToast("Әмияннан шықтыңыз", "success");
}

// Fetch reports directly from RPC to not rely on wallet connection for viewing
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
    const html = [...reports].reverse().map((report, index) => {
        // Since we reversed the array, we need to calculate the actual index in the contract
        const actualIndex = reports.length - 1 - index;
        
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
                    <div style="display: flex; gap: 12px; align-items: center;">
                        <div class="report-tips">${tipText}</div>
                        <button class="btn-primary" style="padding: 4px 10px; font-size: 12px;" onclick="tipReport(${actualIndex})">Донат</button>
                    </div>
                </div>
            </div>
        `;
    }).join('');

    list.innerHTML = html;
}

// Form Submission
document.getElementById('reportForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    if (!wallet || !wallet.isSignedIn()) {
        showToast("Алдымен әмиянды қосыңыз!", "warning");
        login();
        return;
    }
    
    const schoolName = document.getElementById('schoolName').value;
    const category = document.getElementById('category').value;
    const text = document.getElementById('reportText').value;

    const btn = document.getElementById('submitBtn');
    const btnText = btn.querySelector('.btn-text');
    const loader = btn.querySelector('.btn-loader');

    btn.disabled = true;
    btnText.style.display = 'none';
    loader.style.display = 'inline-block';

    try {
        const account = wallet.account();
        await account.functionCall({
            contractId: CONTRACT_ID,
            methodName: 'add_report',
            args: {
                schoolName: schoolName,
                category: category,
                text: text
            },
            gas: '30000000000000' // 30 Tgas
        });
        
        // This won't run if the wallet redirects, but good if it doesn't
        document.getElementById('reportForm').reset();
        showToast("Шағым сәтті жазылды!", "success");
        loadReports();
    } catch (err) {
        console.error("Submit Error:", err);
        showToast("Қате: Шағым жіберілмеді", "error");
    } finally {
        btn.disabled = false;
        btnText.style.display = 'inline-block';
        loader.style.display = 'none';
    }
});

// Tipping Function
async function tipReport(index) {
    if (!wallet || !wallet.isSignedIn()) {
        showToast("Донат жіберу үшін әмиянды қосыңыз", "warning");
        login();
        return;
    }
    
    // We'll prompt the user for an amount in NEAR, defaulting to 0.1
    const amountStr = prompt("Қанша NEAR донат жібергіңіз келеді?", "0.1");
    if (!amountStr || isNaN(amountStr)) return;
    
    const amountInYocto = window.nearApi.utils.format.parseNearAmount(amountStr);
    
    try {
        const account = wallet.account();
        await account.functionCall({
            contractId: CONTRACT_ID,
            methodName: 'tip_report',
            args: {
                reportIndex: parseInt(index)
            },
            gas: '30000000000000',
            attachedDeposit: amountInYocto
        });
        
        showToast("Донат жіберілді! Рахмет!", "success");
        loadReports();
    } catch (err) {
        console.error("Tip Error:", err);
        showToast("Донат жіберу сәтсіз аяқталды", "error");
    }
}

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
