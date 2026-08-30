// Estado Global do App
let currentQuotes = null;
let currentSimulation = null;
let currentMode = 'BRL_TO_BOB'; // 'BRL_TO_BOB' ou 'BOB_TO_BRL'
let currentMarginType = 'PERCENT';
let currentMarginValue = 1.0; // Padrão 1%
let customP2pPriceSelected = null;
let currentTimeframe = '24h'; // '1h' ou '24h'

// Configurações de Timer
let refreshIntervalSeconds = 15; // Padrão 15 segundos
let countdown = 15;
let countdownInterval = null;
let historyChart = null;

// Elementos DOM
const countdownTimer = document.getElementById('countdownTimer');
const refreshIntervalSelect = document.getElementById('refreshIntervalSelect');
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
const modeDescriptionBadge = document.getElementById('modeDescriptionBadge');
const quickAmountButtonsContainer = document.getElementById('quickAmountButtonsContainer');
const marginTypeSelect = document.getElementById('marginTypeSelect');
const customMarginInput = document.getElementById('customMarginInput');
const marginUnitLabel = document.getElementById('marginUnitLabel');
const customP2pPriceInput = document.getElementById('customP2pPrice');
const customSpotFeeInput = document.getElementById('customSpotFee');

// Resultados
const resClientHeaderLabel = document.getElementById('resClientHeaderLabel');
const resClientPrefix = document.getElementById('resClientPrefix');
const resClientReceivesBob = document.getElementById('resClientReceivesBob');
const resClientSuffix = document.getElementById('resClientSuffix');
const resOperatorProfitBrl = document.getElementById('resOperatorProfitBrl');
const resProfitPercentBadge = document.getElementById('resProfitPercentBadge');

const step1Label = document.getElementById('step1Label');
const resStepPix = document.getElementById('resStepPix');
const step2Label = document.getElementById('step2Label');
const resStepUsdt = document.getElementById('resStepUsdt');
const step3Label = document.getElementById('step3Label');
const resStepRate = document.getElementById('resStepRate');
const step4Label = document.getElementById('step4Label');
const resStepInverse = document.getElementById('resStepInverse');

// P2P Table & Buttons
const p2pTableBody = document.getElementById('p2pTableBody');
const copyWhatsappBtn = document.getElementById('copyWhatsappBtn');
const shareWhatsappBtn = document.getElementById('shareWhatsappBtn');
const installPwaBtn = document.getElementById('installPwaBtn');
const installPwaBtnDesktop = document.getElementById('installPwaBtnDesktop');
const toast = document.getElementById('toast');
const toastMsg = document.getElementById('toastMsg');

// Gráfico Timeframe
const btnTimeframe1h = document.getElementById('btnTimeframe1h');
const btnTimeframe24h = document.getElementById('btnTimeframe24h');
const chartSubtitle = document.getElementById('chartSubtitle');

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
        if (installPwaBtn) installPwaBtn.classList.remove('hidden');
        if (installPwaBtnDesktop) installPwaBtnDesktop.classList.remove('hidden');
    });

    const handleInstall = async () => {
        if (deferredPrompt) {
            deferredPrompt.prompt();
            const { outcome } = await deferredPrompt.userChoice;
            if (outcome === 'accepted') {
                if (installPwaBtn) installPwaBtn.classList.add('hidden');
                if (installPwaBtnDesktop) installPwaBtnDesktop.classList.add('hidden');
                showToast('App instalado com sucesso na tela inicial!');
            }
            deferredPrompt = null;
        } else {
            showToast('Para instalar: no navegador, clique nos 3 pontinhos e escolha "Instalar aplicativo"');
        }
    };

    if (installPwaBtn) installPwaBtn.addEventListener('click', handleInstall);
    if (installPwaBtnDesktop) installPwaBtnDesktop.addEventListener('click', handleInstall);
}

// Configuração do Gráfico Chart.js com suporte Touch Mobile
function initChart() {
    const ctx = document.getElementById('rateHistoryChart').getContext('2d');
    historyChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: [],
            datasets: [{
                label: 'Câmbio BRL ➔ BOB',
                data: [],
                borderColor: '#10b981',
                backgroundColor: 'rgba(16, 185, 129, 0.15)',
                borderWidth: 2.5,
                tension: 0.25,
                fill: true,
                pointBackgroundColor: '#10b981',
                pointBorderColor: '#ffffff',
                pointBorderWidth: 2,
                pointRadius: 4.5, // Ponto destacado
                pointHoverRadius: 8.5,
                pointHitRadius: 35 // Área de toque de 35px para o dedo no celular
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            events: ['mousemove', 'mouseout', 'click', 'touchstart', 'touchmove'],
            interaction: {
                intersect: false,
                mode: 'nearest',
                axis: 'x'
            },
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: '#111827',
                    titleColor: '#f0b90b',
                    bodyColor: '#f8fafc',
                    borderColor: '#374151',
                    borderWidth: 1,
                    padding: 12,
                    boxPadding: 4,
                    usePointStyle: true,
                    titleFont: { size: 12, weight: 'bold' },
                    bodyFont: { size: 12 },
                    callbacks: {
                        title: function(context) {
                            const index = context[0].dataIndex;
                            const historyList = currentTimeframe === '24h' ? (currentQuotes?.history_24h || []) : (currentQuotes?.history_1h || []);
                            const item = historyList[index];
                            return item?.full_time ? `📅 ${item.full_time}` : `⏰ ${context[0].label}`;
                        },
                        label: function(context) {
                            const val = Number(context.parsed.y).toFixed(4);
                            return ` 🇧🇴 1 BRL = ${val} BOB`;
                        },
                        afterLabel: function(context) {
                            const index = context.dataIndex;
                            const historyList = currentTimeframe === '24h' ? (currentQuotes?.history_24h || []) : (currentQuotes?.history_1h || []);
                            const item = historyList[index];
                            if (item) {
                                return ` • Spot USDT/BRL: R$ ${item.spot_usdt_brl}\n • P2P USDT/BOB: ${item.p2p_usdt_bob} Bs.`;
                            }
                            return '';
                        }
                    }
                }
            },
            scales: {
                x: {
                    grid: { color: 'rgba(31, 41, 61, 0.4)' },
                    ticks: { 
                        color: '#94a3b8', 
                        font: { size: 9 },
                        maxTicksLimit: 8 // Limita número de labels no eixo X para não poluir tela do celular
                    }
                },
                y: {
                    grid: { color: 'rgba(31, 41, 61, 0.4)' },
                    ticks: { color: '#94a3b8', font: { size: 9 } }
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

    // Seletor de Intervalo de Atualização (15s, 30s, 60s, Manual)
    refreshIntervalSelect.addEventListener('change', (e) => {
        refreshIntervalSeconds = parseInt(e.target.value);
        resetCountdown();
    });

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
            if (currentMarginValue > 20) currentMarginValue = 1.0;
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

    // Botões Rápidos de Margem (0.5%, 0.75%, 1.0%, etc.)
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
    setupQuickAmountButtons();

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

    // Botões Timeframe do Gráfico (1h vs 24h)
    btnTimeframe1h.addEventListener('click', () => setChartTimeframe('1h'));
    btnTimeframe24h.addEventListener('click', () => setChartTimeframe('24h'));
}

function setupQuickAmountButtons() {
    quickAmountButtonsContainer.querySelectorAll('.quick-amount-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            inputAmount.value = btn.dataset.amount;
            runSimulation();
        });
    });
}

function setChartTimeframe(tf) {
    currentTimeframe = tf;
    if (tf === '1h') {
        btnTimeframe1h.className = 'timeframe-btn px-2.5 py-1 rounded bg-blue-600 text-white font-bold transition-all text-[10px] sm:text-[11px]';
        btnTimeframe24h.className = 'timeframe-btn px-2.5 py-1 rounded bg-cardBorder text-slate-300 hover:text-white transition-all text-[10px] sm:text-[11px]';
        chartSubtitle.textContent = '*Toque ou deslize sobre os pontos para ver o câmbio a cada 1 minuto.';
    } else {
        btnTimeframe24h.className = 'timeframe-btn px-2.5 py-1 rounded bg-blue-600 text-white font-bold transition-all text-[10px] sm:text-[11px]';
        btnTimeframe1h.className = 'timeframe-btn px-2.5 py-1 rounded bg-cardBorder text-slate-300 hover:text-white transition-all text-[10px] sm:text-[11px]';
        chartSubtitle.textContent = '*Toque ou deslize sobre os pontos para ver o câmbio exato por hora.';
    }
    if (currentQuotes) {
        renderHistoryChart(currentQuotes);
    }
}

function setMode(mode) {
    currentMode = mode;
    if (mode === 'BRL_TO_BOB') {
        tabBrlToBob.className = 'tab-btn py-2 px-3 rounded-lg bg-blue-600 text-white shadow-md transition-all flex items-center justify-center gap-1.5';
        tabBobToBrl.className = 'tab-btn py-2 px-3 rounded-lg text-slate-400 hover:text-white transition-all flex items-center justify-center gap-1.5';
        inputAmountLabel.textContent = 'Valor a receber no PIX (Reais - BRL)';
        inputCurrencySymbol.textContent = 'R$';
        modeDescriptionBadge.textContent = 'Cliente envia R$ ➔ Recebe Bs.';
        modeDescriptionBadge.className = 'text-[10px] text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded font-semibold';
        
        resClientHeaderLabel.textContent = 'Valor a Entregar ao Cliente na Bolívia';
        resClientPrefix.textContent = 'BOB';
        resClientSuffix.textContent = 'Bs.';
        
        step1Label.textContent = '1. PIX Recebido';
        step2Label.textContent = '2. USDT Comprado';
        step3Label.textContent = '3. Câmbio Fechado';
        step4Label.textContent = '4. Custo p/ BOB';

        quickAmountButtonsContainer.innerHTML = `
            <button type="button" class="quick-amount-btn px-2 py-1 bg-cardBorder hover:bg-slate-700 rounded text-[10px] sm:text-[11px] font-bold text-slate-300 transition-colors" data-amount="500">500</button>
            <button type="button" class="quick-amount-btn px-2 py-1 bg-cardBorder hover:bg-slate-700 rounded text-[10px] sm:text-[11px] font-bold text-slate-300 transition-colors" data-amount="1000">1K</button>
            <button type="button" class="quick-amount-btn px-2 py-1 bg-cardBorder hover:bg-slate-700 rounded text-[10px] sm:text-[11px] font-bold text-slate-300 transition-colors" data-amount="2000">2K</button>
            <button type="button" class="quick-amount-btn px-2 py-1 bg-cardBorder hover:bg-slate-700 rounded text-[10px] sm:text-[11px] font-bold text-slate-300 transition-colors" data-amount="5000">5K</button>
        `;
        if (inputAmount.value === '5000') inputAmount.value = '1000';
    } else {
        tabBobToBrl.className = 'tab-btn py-2 px-3 rounded-lg bg-blue-600 text-white shadow-md transition-all flex items-center justify-center gap-1.5';
        tabBrlToBob.className = 'tab-btn py-2 px-3 rounded-lg text-slate-400 hover:text-white transition-all flex items-center justify-center gap-1.5';
        inputAmountLabel.textContent = 'Valor solicitado pelo cliente (Bolivianos - BOB)';
        inputCurrencySymbol.textContent = 'Bs.';
        modeDescriptionBadge.textContent = 'Cliente precisa de Bs. ➔ Cobrar R$ no PIX';
        modeDescriptionBadge.className = 'text-[10px] text-yellow-400 bg-yellow-500/10 px-2 py-0.5 rounded font-semibold';
        
        resClientHeaderLabel.textContent = 'Valor a Cobrar do Cliente no PIX';
        resClientPrefix.textContent = 'BRL';
        resClientSuffix.textContent = 'R$';

        step1Label.textContent = '1. Custo Real Puro';
        step2Label.textContent = '2. USDT a Vender';
        step3Label.textContent = '3. Câmbio Comercial';
        step4Label.textContent = '4. Cobrar p/ BOB';

        quickAmountButtonsContainer.innerHTML = `
            <button type="button" class="quick-amount-btn px-2 py-1 bg-cardBorder hover:bg-slate-700 rounded text-[10px] sm:text-[11px] font-bold text-slate-300 transition-colors" data-amount="2000">2K</button>
            <button type="button" class="quick-amount-btn px-2 py-1 bg-cardBorder hover:bg-slate-700 rounded text-[10px] sm:text-[11px] font-bold text-slate-300 transition-colors" data-amount="5000">5K</button>
            <button type="button" class="quick-amount-btn px-2 py-1 bg-cardBorder hover:bg-slate-700 rounded text-[10px] sm:text-[11px] font-bold text-slate-300 transition-colors" data-amount="10000">10K</button>
            <button type="button" class="quick-amount-btn px-2 py-1 bg-cardBorder hover:bg-slate-700 rounded text-[10px] sm:text-[11px] font-bold text-slate-300 transition-colors" data-amount="20000">20K</button>
        `;
        if (inputAmount.value === '1000') inputAmount.value = '5000';
    }
    setupQuickAmountButtons();
    runSimulation();
}

function updateMarginButtonsActiveState() {
    document.querySelectorAll('.margin-btn').forEach(btn => {
        if (currentMarginType === 'PERCENT' && parseFloat(btn.dataset.val) === currentMarginValue) {
            btn.className = 'margin-btn px-2.5 py-1.5 rounded-lg bg-emerald-600 text-white text-[11px] sm:text-xs font-bold shadow-md shadow-emerald-500/20 active:scale-95 flex-1 sm:flex-none text-center';
        } else {
            btn.className = 'margin-btn px-2 py-1.5 rounded-lg bg-cardBorder text-slate-300 text-[11px] sm:text-xs font-bold hover:bg-slate-700 transition-all active:scale-95 flex-1 sm:flex-none text-center';
        }
    });
}

function startCountdown() {
    if (countdownInterval) clearInterval(countdownInterval);
    if (refreshIntervalSeconds === 0) {
        countdownTimer.textContent = 'Manual';
        return;
    }
    countdown = refreshIntervalSeconds;
    countdownTimer.textContent = `${countdown}s`;

    countdownInterval = setInterval(() => {
        if (refreshIntervalSeconds === 0) {
            countdownTimer.textContent = 'Manual';
            return;
        }
        countdown--;
        if (countdown <= 0) {
            fetchQuotes();
            countdown = refreshIntervalSeconds;
        }
        countdownTimer.textContent = `${countdown}s`;
    }, 1000);
}

function resetCountdown() {
    startCountdown();
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
            renderHistoryChart(data);
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
        kpiMarginBadge.textContent = `LUCRO: ${currentMarginValue}%`;
    } else if (currentMarginType === 'FIXED_PER_BOB') {
        commercialRate = Math.max(0.01, data.rate_brl_bob_raw - currentMarginValue);
        kpiMarginBadge.textContent = `LUCRO: -${currentMarginValue} Bs/R$`;
    } else {
        kpiMarginBadge.textContent = `TAXA: R$ ${currentMarginValue}`;
    }

    const commercialInverse = commercialRate > 0 ? (1.0 / commercialRate) : 0;
    kpiCommercialRate.textContent = commercialRate.toFixed(4);
    kpiCommercialInverse.textContent = `R$ ${commercialInverse.toFixed(4)}`;
}

// Renderiza Tabela de Ofertas P2P
function renderP2PTable(ads) {
    if (!ads || ads.length === 0) {
        p2pTableBody.innerHTML = `<tr><td colspan="4" class="py-4 text-center text-slate-500">Nenhum anunciante verificado online no momento.</td></tr>`;
        return;
    }

    let html = '';
    ads.slice(0, 8).forEach((ad, idx) => {
        const isBest = idx === 0;
        const methodsBadges = ad.trade_methods.slice(0, 2).map(m => {
            let color = 'bg-slate-800 text-slate-300 border-slate-700';
            if (m.toLowerCase().includes('union')) color = 'bg-blue-500/10 text-blue-300 border-blue-500/30';
            if (m.toLowerCase().includes('nacional') || m.toLowerCase().includes('bnb')) color = 'bg-yellow-500/10 text-yellow-300 border-yellow-500/30';
            if (m.toLowerCase().includes('credito') || m.toLowerCase().includes('bcp')) color = 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30';
            return `<span class="inline-block px-1.5 py-0.2 text-[8px] sm:text-[9px] rounded border ${color} font-medium mr-1 mb-0.5 truncate max-w-[90px]">${m}</span>`;
        }).join('');

        html += `
            <tr class="hover:bg-slate-800/40 transition-colors ${isBest ? 'bg-binanceYellow/5' : ''}">
                <td class="py-2 sm:py-2.5 pr-1 sm:pr-2">
                    <div class="flex items-center gap-1 flex-wrap">
                        <span class="font-bold text-white text-[11px] sm:text-xs truncate max-w-[100px] sm:max-w-[130px]">${ad.nick_name}</span>
                        <span class="text-[8px] sm:text-[9px] px-1 py-0.2 bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-bold rounded flex items-center gap-0.5">
                            <i class="fa-solid fa-circle-check text-[7px]"></i> Verif.
                        </span>
                    </div>
                    <div class="text-[9px] sm:text-[10px] text-slate-400 mt-0.5">
                        <span class="text-emerald-400 font-semibold">${ad.month_finish_rate}%</span> (${ad.month_order_count} ordens)
                    </div>
                    <div class="mt-0.5 flex flex-wrap">${methodsBadges}</div>
                </td>
                <td class="py-2 sm:py-2.5 text-right font-mono font-bold text-binanceYellow text-[11px] sm:text-xs align-top">
                    ${ad.price.toFixed(2)} <span class="text-[9px] sm:text-[10px] text-slate-400 font-normal">Bs</span>
                </td>
                <td class="py-2 sm:py-2.5 text-right font-mono text-[10px] sm:text-[11px] text-slate-300 align-top">
                    <div>${formatNumber(ad.min_amount)}</div>
                    <div class="text-[8px] sm:text-[9px] text-slate-500">até ${formatNumber(ad.max_amount)}</div>
                </td>
                <td class="py-2 sm:py-2.5 text-center align-top">
                    <button onclick="applyP2pPrice(${ad.price})" class="px-2 py-1 bg-cardBorder hover:bg-binanceYellow hover:text-black rounded text-[9px] sm:text-[10px] font-bold text-slate-200 transition-all shadow-sm">
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

// Renderiza Gráfico Histórico (1h ou 24h)
function renderHistoryChart(data) {
    if (!historyChart) return;
    
    const historyList = currentTimeframe === '24h' ? (data.history_24h || []) : (data.history_1h || []);
    if (!historyList || historyList.length === 0) return;
    
    const labels = historyList.map(h => h.timestamp);
    const dataRates = historyList.map(h => h.rate_brl_bob);
    
    historyChart.data.labels = labels;
    historyChart.data.datasets[0].data = dataRates;
    historyChart.update();
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
        // Modo BOB -> BRL (Cliente quer X Bolivianos -> Quanto cobrar em Reais)
        resClientReceivesBob.textContent = `R$ ${formatNumber(data.brl_charge_client)}`;
        resOperatorProfitBrl.textContent = `R$ ${formatNumber(data.profit_brl)}`;
        resProfitPercentBadge.textContent = `(+${data.profit_percent}%)`;

        resStepPix.textContent = `R$ ${formatNumber(data.brl_cost_pure)}`;
        resStepUsdt.textContent = `${data.usdt_needed.toFixed(2)} USDT`;
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
