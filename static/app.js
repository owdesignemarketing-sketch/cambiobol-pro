// Estado Global do App
let currentQuotes = null;
let currentSimulation = null;
let currentMode = 'BRL_TO_BOB'; // 'BRL_TO_BOB' ou 'BOB_TO_BRL'
let currentMarginType = 'PERCENT';
let currentMarginValue = 3.0;
let customP2pPriceSelected = null;
let countdown = 8;
let countdownInterval = null;
let historyChart = null;

// Elementos DOM
const countdownTimer = document.getElementById('countdownTimer');
const refreshBtn = document.getElementById('refreshBtn');
const refreshIcon = document.getElementById('refreshIcon');

// KPIs
const kpiSpotUsdtBrl = document.getElementById('kpiSpotUsdtBrl');
const kpiSpotSpread = document.getElementById('kpiSpotSpread');
const kpiP2pUsdtBob = document.getElementById('kpiP2pUsdtBob');
const kpiP2pTop3 = document.getElementById('kpiP2pTop3');
const kpiRawRate = document.getElementById('kpiRawRate');
const kpiRawRateInverse = document.getElementById('kpiRawRateInverse');
const kpiCommercialRate = document.getElementById('kpiCommercialRate');
const kpiCommercialInverse = document.getElementById('kpiCommercialInverse');
const kpiMarginBadge = document.getElementById('kpiMarginBadge');

// Calculadora
const tabBrlToBob = document.getElementById('tabBrlToBob');
const tabBobToBrl = document.getElementById('tabBobToBrl');
const inputAmount = document.getElementById('inputAmount');
const inputAmountLabel = document.getElementById('inputAmountLabel');
const inputCurrencySymbol = document.getElementById('inputCurrencySymbol');
const marginTypeSelect = document.getElementById('marginTypeSelect');
const customMarginInput = document.getElementById('customMarginInput');
const marginUnitLabel = document.getElementById('marginUnitLabel');
const customP2pPriceInput = document.getElementById('customP2pPrice');
const customSpotFeeInput = document.getElementById('customSpotFee');

// Resultados
const resClientReceivesBob = document.getElementById('resClientReceivesBob');
const resOperatorProfitBrl = document.getElementById('resOperatorProfitBrl');
const resProfitPercentBadge = document.getElementById('resProfitPercentBadge');
const resStepPix = document.getElementById('resStepPix');
const resStepUsdt = document.getElementById('resStepUsdt');
const resStepRate = document.getElementById('resStepRate');
const resStepInverse = document.getElementById('resStepInverse');

// P2P Table & Buttons
const p2pTableBody = document.getElementById('p2pTableBody');
const copyWhatsappBtn = document.getElementById('copyWhatsappBtn');
const shareWhatsappBtn = document.getElementById('shareWhatsappBtn');
const installPwaBtn = document.getElementById('installPwaBtn');
const toast = document.getElementById('toast');
const toastMsg = document.getElementById('toastMsg');

let deferredPrompt = null;

// Inicialização
document.addEventListener('DOMContentLoaded', () => {
    initChart();
    setupEventListeners();
    setupPwa();
    fetchQuotes();
    startCountdown();
});

// Configuração PWA (Instalação no Celular)
function setupPwa() {
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('sw.js').catch(err => {
            console.log('SW registration error:', err);
        });
    }

    window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        deferredPrompt = e;
        if (installPwaBtn) {
            installPwaBtn.classList.remove('hidden');
        }
    });

    if (installPwaBtn) {
        installPwaBtn.addEventListener('click', async () => {
            if (deferredPrompt) {
                deferredPrompt.prompt();
                const { outcome } = await deferredPrompt.userChoice;
                if (outcome === 'accepted') {
                    installPwaBtn.classList.add('hidden');
                    showToast('App instalado com sucesso na tela inicial!');
                }
                deferredPrompt = null;
            } else {
                showToast('Para instalar: no navegador, clique nos 3 pontinhos e escolha "Instalar aplicativo"');
            }
        });
    }
}

// Configuração do Gráfico Chart.js
function initChart() {
    const ctx = document.getElementById('rateHistoryChart').getContext('2d');
    historyChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: [],
            datasets: [{
                label: 'Taxa BRL/BOB',
                data: [],
                borderColor: '#10b981',
                backgroundColor: 'rgba(16, 185, 129, 0.08)',
                borderWidth: 2,
                tension: 0.3,
                fill: true,
                pointRadius: 2,
                pointHoverRadius: 5
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: '#111827',
                    titleColor: '#94a3b8',
                    bodyColor: '#f8fafc',
                    borderColor: '#1f293d',
                    borderWidth: 1,
                    callbacks: {
                        label: function(context) {
                            return ` 1 BRL = ${context.parsed.y.toFixed(4)} BOB`;
                        }
                    }
                }
            },
            scales: {
                x: {
                    grid: { color: 'rgba(31, 41, 61, 0.5)' },
                    ticks: { color: '#64748b', font: { size: 10 } }
                },
                y: {
                    grid: { color: 'rgba(31, 41, 61, 0.5)' },
                    ticks: { color: '#64748b', font: { size: 10 } }
                }
            }
        }
    });
}

// Configuração dos Event Listeners
function setupEventListeners() {
    // Alternar Abas BRL ➔ BOB e BOB ➔ BRL
    tabBrlToBob.addEventListener('click', () => setMode('BRL_TO_BOB'));
    tabBobToBrl.addEventListener('click', () => setMode('BOB_TO_BRL'));

    // Inputs de Cálculo
    inputAmount.addEventListener('input', runSimulation);
    customMarginInput.addEventListener('input', (e) => {
        currentMarginValue = parseFloat(e.target.value) || 0;
        updateMarginButtonsActiveState();
        runSimulation();
    });

    // Tipo de Margem
    marginTypeSelect.addEventListener('change', (e) => {
        currentMarginType = e.target.value;
        if (currentMarginType === 'PERCENT') {
            marginUnitLabel.textContent = '%';
            if (currentMarginValue > 20) currentMarginValue = 3.0;
        } else if (currentMarginType === 'FIXED_PER_BOB') {
            marginUnitLabel.textContent = 'R$/Bs';
            currentMarginValue = 0.05;
        } else {
            marginUnitLabel.textContent = 'R$';
            currentMarginValue = 20.0;
        }
        customMarginInput.value = currentMarginValue;
        updateMarginButtonsActiveState();
        runSimulation();
    });

    // Botões Rápidos de Margem
    document.querySelectorAll('.margin-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            currentMarginType = 'PERCENT';
            marginTypeSelect.value = 'PERCENT';
            marginUnitLabel.textContent = '%';
            currentMarginValue = parseFloat(btn.dataset.val);
            customMarginInput.value = currentMarginValue;
            updateMarginButtonsActiveState();
            runSimulation();
        });
    });

    // Botões Rápidos de Valor
    document.querySelectorAll('.quick-amount-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            inputAmount.value = btn.dataset.amount;
            runSimulation();
        });
    });

    // Custom P2P Price & Spot Fee
    customP2pPriceInput.addEventListener('input', (e) => {
        customP2pPriceSelected = e.target.value ? parseFloat(e.target.value) : null;
        runSimulation();
    });
    customSpotFeeInput.addEventListener('input', runSimulation);

    // Botão Atualizar
    refreshBtn.addEventListener('click', () => {
        fetchQuotes(true);
        resetCountdown();
    });

    // Botões WhatsApp
    copyWhatsappBtn.addEventListener('click', copyWhatsappMessage);
    shareWhatsappBtn.addEventListener('click', openWhatsappDirect);
}

function setMode(mode) {
    currentMode = mode;
    if (mode === 'BRL_TO_BOB') {
        tabBrlToBob.className = 'tab-btn px-3 py-1.5 rounded-lg bg-blue-600 text-white shadow-md transition-all flex items-center gap-1.5';
        tabBobToBrl.className = 'tab-btn px-3 py-1.5 rounded-lg text-slate-400 hover:text-white transition-all flex items-center gap-1.5';
        inputAmountLabel.textContent = 'Valor a receber no PIX (Reais - BRL)';
        inputCurrencySymbol.textContent = 'R$';
        if (inputAmount.value === '5000') inputAmount.value = '1000';
    } else {
        tabBobToBrl.className = 'tab-btn px-3 py-1.5 rounded-lg bg-blue-600 text-white shadow-md transition-all flex items-center gap-1.5';
        tabBrlToBob.className = 'tab-btn px-3 py-1.5 rounded-lg text-slate-400 hover:text-white transition-all flex items-center gap-1.5';
        inputAmountLabel.textContent = 'Valor solicitado pelo cliente (Bolivianos - BOB)';
        inputCurrencySymbol.textContent = 'Bs.';
        if (inputAmount.value === '1000') inputAmount.value = '5000';
    }
    runSimulation();
}

function updateMarginButtonsActiveState() {
    document.querySelectorAll('.margin-btn').forEach(btn => {
        if (currentMarginType === 'PERCENT' && parseFloat(btn.dataset.val) === currentMarginValue) {
            btn.className = 'margin-btn px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-bold shadow-md shadow-emerald-500/20 active:scale-95';
        } else {
            btn.className = 'margin-btn px-3 py-1.5 rounded-lg bg-cardBorder text-slate-300 text-xs font-bold hover:bg-slate-700 transition-all active:scale-95';
        }
    });
}

function startCountdown() {
    countdown = 8;
    if (countdownInterval) clearInterval(countdownInterval);
    countdownInterval = setInterval(() => {
        countdown--;
        if (countdown <= 0) {
            fetchQuotes();
            countdown = 8;
        }
        countdownTimer.textContent = `${countdown}s`;
    }, 1000);
}

function resetCountdown() {
    countdown = 8;
    countdownTimer.textContent = `${countdown}s`;
}

// Busca Cotações no Backend
async function fetchQuotes(isManual = false) {
    if (isManual) {
        refreshIcon.classList.add('fa-spin');
    }
    try {
        const res = await fetch('/api/quotes');
        if (res.ok) {
            const data = await res.json();
            currentQuotes = data;
            renderKPIs(data);
            renderP2PTable(data.p2p_ads_bob || []);
            renderHistoryChart(data.history || []);
            runSimulation();
        }
    } catch (err) {
        console.error('Erro ao buscar cotações:', err);
    } finally {
        if (isManual) {
            setTimeout(() => refreshIcon.classList.remove('fa-spin'), 600);
        }
    }
}

// Renderiza Cards de Indicadores (KPIs)
function renderKPIs(data) {
    if (!data.spot_usdt_brl) return;

    // Spot
    const spotAsk = data.spot_usdt_brl.ask;
    const spotBid = data.spot_usdt_brl.bid;
    kpiSpotUsdtBrl.textContent = spotAsk.toFixed(4);
    kpiSpotSpread.textContent = (spotAsk - spotBid).toFixed(4);

    // P2P BOB
    kpiP2pUsdtBob.textContent = data.best_p2p_bob.toFixed(2);
    kpiP2pTop3.textContent = data.top3_avg_bob.toFixed(2);

    // Câmbio Bruto
    kpiRawRate.textContent = data.rate_brl_bob_raw.toFixed(4);
    kpiRawRateInverse.textContent = `R$ ${data.rate_bob_brl_raw.toFixed(4)}`;

    // Câmbio Comercial
    let commercialRate = data.rate_brl_bob_raw;
    if (currentMarginType === 'PERCENT') {
        commercialRate = data.rate_brl_bob_raw * (1 - (currentMarginValue / 100.0));
        kpiMarginBadge.textContent = `Lucro: ${currentMarginValue}%`;
    } else if (currentMarginType === 'FIXED_PER_BOB') {
        commercialRate = Math.max(0.01, data.rate_brl_bob_raw - currentMarginValue);
        kpiMarginBadge.textContent = `Lucro: -${currentMarginValue} Bs/R$`;
    } else {
        kpiMarginBadge.textContent = `Taxa: R$ ${currentMarginValue}`;
    }

    const commercialInverse = commercialRate > 0 ? (1.0 / commercialRate) : 0;
    kpiCommercialRate.textContent = commercialRate.toFixed(4);
    kpiCommercialInverse.textContent = `R$ ${commercialInverse.toFixed(4)}`;
}

// Renderiza Tabela de Ofertas P2P
function renderP2PTable(ads) {
    if (!ads || ads.length === 0) {
        p2pTableBody.innerHTML = `<tr><td colspan="4" class="py-4 text-center text-slate-500">Nenhum anúncio disponível no momento.</td></tr>`;
        return;
    }

    let html = '';
    ads.slice(0, 7).forEach((ad, idx) => {
        const isBest = idx === 0;
        const methodsBadges = ad.trade_methods.slice(0, 3).map(m => {
            let color = 'bg-slate-800 text-slate-300 border-slate-700';
            if (m.toLowerCase().includes('union')) color = 'bg-blue-500/10 text-blue-300 border-blue-500/30';
            if (m.toLowerCase().includes('nacional') || m.toLowerCase().includes('bnb')) color = 'bg-yellow-500/10 text-yellow-300 border-yellow-500/30';
            if (m.toLowerCase().includes('credito') || m.toLowerCase().includes('bcp')) color = 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30';
            return `<span class="inline-block px-1.5 py-0.2 text-[9px] rounded border ${color} font-medium mr-1 mb-1">${m}</span>`;
        }).join('');

        html += `
            <tr class="hover:bg-slate-800/40 transition-colors ${isBest ? 'bg-binanceYellow/5' : ''}">
                <td class="py-2.5 pr-2">
                    <div class="flex items-center gap-1.5">
                        <span class="font-bold text-white text-xs">${ad.nick_name}</span>
                        ${isBest ? '<span class="text-[9px] px-1 py-0.2 bg-binanceYellow text-black font-extrabold rounded">TOP 1</span>' : ''}
                    </div>
                    <div class="text-[10px] text-slate-400 mt-0.5">
                        <span class="text-emerald-400 font-semibold">${ad.month_finish_rate}%</span> (${ad.month_order_count} ordens)
                    </div>
                    <div class="mt-1 flex flex-wrap">${methodsBadges}</div>
                </td>
                <td class="py-2.5 text-right font-mono font-bold text-binanceYellow text-xs align-top">
                    ${ad.price.toFixed(2)} <span class="text-[10px] text-slate-400 font-normal">Bs</span>
                </td>
                <td class="py-2.5 text-right font-mono text-[11px] text-slate-300 align-top">
                    <div>${formatNumber(ad.min_amount)}</div>
                    <div class="text-[9px] text-slate-500">até ${formatNumber(ad.max_amount)}</div>
                </td>
                <td class="py-2.5 text-center align-top">
                    <button onclick="applyP2pPrice(${ad.price})" class="px-2 py-1 bg-cardBorder hover:bg-binanceYellow hover:text-black rounded text-[10px] font-bold text-slate-200 transition-all">
                        Usar
                    </button>
                </td>
            </tr>
        `;
    });
    p2pTableBody.innerHTML = html;
}

window.applyP2pPrice = function(price) {
    customP2pPriceInput.value = price;
    customP2pPriceSelected = price;
    showToast(`Preço P2P fixado em ${price} Bs.`);
    runSimulation();
};

// Renderiza Gráfico Histórico
function renderHistoryChart(history) {
    if (!historyChart || !history || history.length === 0) return;
    
    const labels = history.map(h => h.timestamp);
    const dataRates = history.map(h => h.rate_brl_bob);
    
    historyChart.data.labels = labels;
    historyChart.data.datasets[0].data = dataRates;
    historyChart.update('none'); // Update sem re-render pesado
}

// Executa Simulação
async function runSimulation() {
    const amountVal = parseFloat(inputAmount.value) || 0;
    if (amountVal <= 0) return;

    const payload = {
        mode: currentMode,
        amount: amountVal,
        profit_margin_type: currentMarginType,
        profit_margin_value: currentMarginValue,
        spot_fee_percent: parseFloat(customSpotFeeInput.value) || 0.075,
        custom_p2p_price: customP2pPriceSelected,
        custom_spot_price: null
    };

    try {
        const res = await fetch('/api/simulate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (res.ok) {
            const data = await res.json();
            currentSimulation = data;
            renderSimulationResults(data);
        }
    } catch (err) {
        console.error('Erro na simulação:', err);
    }
}

// Renderiza Resultados da Simulação
function renderSimulationResults(data) {
    if (currentMode === 'BRL_TO_BOB') {
        resClientReceivesBob.textContent = formatNumber(data.bob_client_receives);
        resOperatorProfitBrl.textContent = `R$ ${formatNumber(data.profit_brl)}`;
        resProfitPercentBadge.textContent = `(+${data.profit_percent}%)`;
        
        resStepPix.textContent = `R$ ${formatNumber(data.brl_input)}`;
        resStepUsdt.textContent = `${data.usdt_net.toFixed(2)} USDT`;
        resStepRate.textContent = `1 BRL = ${data.commercial_bob_per_brl.toFixed(4)} Bs.`;
        resStepInverse.textContent = `R$ ${data.commercial_brl_per_bob.toFixed(4)}`;
    } else {
        resClientReceivesBob.textContent = formatNumber(data.bob_target);
        resOperatorProfitBrl.textContent = `R$ ${formatNumber(data.profit_brl)}`;
        resProfitPercentBadge.textContent = `(+${data.profit_percent}%)`;

        resStepPix.textContent = `Cobrar R$ ${formatNumber(data.brl_charge_client)}`;
        resStepUsdt.textContent = `P2P: ${data.p2p_price_usdt_bob.toFixed(2)} Bs`;
        resStepRate.textContent = `1 BRL = ${data.commercial_bob_per_brl.toFixed(4)} Bs.`;
        resStepInverse.textContent = `R$ ${data.commercial_brl_per_bob.toFixed(4)}`;
    }
}

// Utilitário de Formatação de Números
function formatNumber(num) {
    if (num === undefined || num === null) return '0,00';
    return Number(num).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Gerador de Mensagem WhatsApp
function generateWhatsappMessage() {
    if (!currentSimulation) return '';

    const now = new Date();
    const timeStr = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    const dateStr = now.toLocaleDateString('pt-BR');

    if (currentMode === 'BRL_TO_BOB') {
        return `🇧🇷 ➔ 🇧🇴 *COTAÇÃO DE CÂMBIO & REMESSA*
📅 Data: ${dateStr} às ${timeStr}

💰 *Valor Enviado no PIX:* R$ ${formatNumber(currentSimulation.brl_input)}
💵 *Valor a Receber na Bolívia:* *${formatNumber(currentSimulation.bob_client_receives)} Bs.* (Bolivianos)

📊 *Taxa Fixada:* 1 BRL = ${currentSimulation.commercial_bob_per_brl.toFixed(4)} BOB
⚡ *Pagamento:* Transferência bancária imediata / QR Simple
⏱️ _Cotação garantida por 15 minutos._`;
    } else {
        return `🇧🇴 ➔ 🇧🇷 *SOLICITAÇÃO DE REMESSA (BOLÍVIA)*
📅 Data: ${dateStr} às ${timeStr}

💵 *Valor a Entregar na Bolívia:* ${formatNumber(currentSimulation.bob_target)} Bs.
💰 *Valor a Pagar no PIX:* *R$ ${formatNumber(currentSimulation.brl_charge_client)}*

📊 *Taxa Fixada:* 1 BRL = ${currentSimulation.commercial_bob_per_brl.toFixed(4)} BOB (R$ ${currentSimulation.commercial_brl_per_bob.toFixed(4)} por BOB)
⚡ *Chave PIX:* _(Informe sua chave PIX aqui)_
⏱️ _Cotação garantida por 15 minutos._`;
    }
}

function copyWhatsappMessage() {
    const msg = generateWhatsappMessage();
    navigator.clipboard.writeText(msg).then(() => {
        showToast('Proposta copiada para a área de transferência!');
    });
}

function openWhatsappDirect() {
    const msg = generateWhatsappMessage();
    const encoded = encodeURIComponent(msg);
    window.open(`https://api.whatsapp.com/send?text=${encoded}`, '_blank');
}

function showToast(text) {
    toastMsg.textContent = text;
    toast.classList.remove('translate-y-20', 'opacity-0');
    toast.classList.add('translate-y-0', 'opacity-100');
    setTimeout(() => {
        toast.classList.remove('translate-y-0', 'opacity-100');
        toast.classList.add('translate-y-20', 'opacity-0');
    }, 3000);
}
