// Estado Global do App
let currentQuotes = null;
let currentSimulation = null;
let currentMode = 'BRL_TO_BOB';
let currentMarginType = 'SMART_TIER';
let currentMarginValue = 1.0;
let customP2pPriceSelected = null;
let customP2pNickSelected = null;
let currentTimeframe = '24h';

// Configurações de Timer
let refreshIntervalSeconds = 15;
let countdown = 15;
let countdownInterval = null;
let historyChart = null;

// Elementos DOM
const countdownTimer = document.getElementById('countdownTimer');
const refreshIntervalSelect = document.getElementById('refreshIntervalSelect');
const refreshBtn = document.getElementById('refreshBtn');
const refreshIcon = document.getElementById('refreshIcon');
const liveStatusBadge = document.getElementById('liveStatusBadge');
const offlineBanner = document.getElementById('offlineBanner');

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

const smartTierBanner = document.getElementById('smartTierBanner');
const smartTierActiveRule = document.getElementById('smartTierActiveRule');

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

// Gráfico Inspector
const btnTimeframe1h = document.getElementById('btnTimeframe1h');
const btnTimeframe24h = document.getElementById('btnTimeframe24h');
const chartSubtitle = document.getElementById('chartSubtitle');
const inspectorTimeLabel = document.getElementById('inspectorTimeLabel');
const inspectorRateLabel = document.getElementById('inspectorRateLabel');
const inspectorSpotLabel = document.getElementById('inspectorSpotLabel');
const inspectorP2pLabel = document.getElementById('inspectorP2pLabel');

let deferredPrompt = null;

// Inicialização
document.addEventListener('DOMContentLoaded', () => {
    initChart();
    setupEventListeners();
    setupPwa();
    fetchQuotes();
    startCountdown();
});

window.addEventListener('online', () => {
    fetchQuotes(true);
});

window.addEventListener('offline', () => {
    setOfflineState('Sem conexão com a Internet no celular');
});

// Configuração PWA
function setupPwa() {
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('sw.js').catch(err => {
            console.log('SW registration error:', err);
        });
    }

    const isIos = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
    const isStandalone = window.navigator.standalone || window.matchMedia('(display-mode: standalone)').matches;

    // No iPhone (Safari) exibe o botão de instalar com instruções próprias
    if (isIos && !isStandalone) {
        if (installPwaBtn) installPwaBtn.classList.remove('hidden');
        if (installPwaBtnDesktop) installPwaBtnDesktop.classList.remove('hidden');
    }

    window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        deferredPrompt = e;
        if (installPwaBtn) installPwaBtn.classList.remove('hidden');
        if (installPwaBtnDesktop) installPwaBtnDesktop.classList.remove('hidden');
    });

    const iosModal = document.getElementById('iosInstallModal');
    const closeIosBtn = document.getElementById('closeIosModalBtn');
    const gotItIosBtn = document.getElementById('gotItIosModalBtn');

    if (closeIosBtn && iosModal) closeIosBtn.addEventListener('click', () => iosModal.classList.add('hidden'));
    if (gotItIosBtn && iosModal) gotItIosBtn.addEventListener('click', () => iosModal.classList.add('hidden'));

    const handleInstall = async () => {
        if (isIos) {
            if (iosModal) iosModal.classList.remove('hidden');
            return;
        }

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
            showToast('Para instalar: toque no menu do navegador e escolha "Adicionar à Tela de Início"');
        }
    };

    if (installPwaBtn) installPwaBtn.addEventListener('click', handleInstall);
    if (installPwaBtnDesktop) installPwaBtnDesktop.addEventListener('click', handleInstall);
}

// Configuração do Gráfico Chart.js
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
                backgroundColor: 'rgba(16, 185, 129, 0.18)',
                borderWidth: 3,
                tension: 0.25,
                fill: true,
                pointBackgroundColor: '#f0b90b',
                pointBorderColor: '#ffffff',
                pointBorderWidth: 2.5,
                pointRadius: 6,
                pointHoverRadius: 10,
                pointHitRadius: 40
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
            onHover: (event, elements) => {
                if (elements && elements.length > 0) {
                    const idx = elements[0].index;
                    updateInspector(idx);
                }
            },
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: '#111827',
                    titleColor: '#f0b90b',
                    bodyColor: '#f8fafc',
                    borderColor: '#f0b90b',
                    borderWidth: 1.5,
                    padding: 12,
                    boxPadding: 4,
                    usePointStyle: true,
                    titleFont: { size: 12, weight: 'bold' },
                    bodyFont: { size: 12 },
                    callbacks: {
                        title: function(context) {
                            const index = context[0].dataIndex;
                            const historyList = getActiveHistoryList();
                            const item = historyList[index];
                            return item?.full_time ? `📅 ${item.full_time}` : `⏰ ${context[0].label}`;
                        },
                        label: function(context) {
                            const val = Number(context.parsed.y).toFixed(4);
                            return ` 🇧🇴 1 BRL = ${val} BOB`;
                        },
                        afterLabel: function(context) {
                            const index = context.dataIndex;
                            const historyList = getActiveHistoryList();
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
                    grid: { color: 'rgba(31, 41, 61, 0.5)' },
                    ticks: { 
                        color: '#94a3b8', 
                        font: { size: 10, weight: 'bold' },
                        maxTicksLimit: 8
                    }
                },
                y: {
                    grid: { color: 'rgba(31, 41, 61, 0.5)' },
                    ticks: { 
                        color: '#10b981', 
                        font: { size: 10, weight: 'bold' },
                        callback: function(val) {
                            return Number(val).toFixed(4);
                        }
                    }
                }
            }
        }
    });
}

function getActiveHistoryList() {
    if (!currentQuotes) return [];
    return currentTimeframe === '24h' ? (currentQuotes.history_24h || []) : (currentQuotes.history_1h || []);
}

function updateInspector(index) {
    const historyList = getActiveHistoryList();
    if (!historyList || !historyList[index]) return;
    const item = historyList[index];

    inspectorTimeLabel.textContent = item.full_time ? `Ponto: ${item.full_time}` : `Horário: ${item.timestamp}`;
    inspectorRateLabel.textContent = `1 BRL = ${Number(item.rate_brl_bob).toFixed(4)} BOB`;
    inspectorSpotLabel.textContent = `Spot: R$ ${Number(item.spot_usdt_brl).toFixed(4)}`;
    inspectorP2pLabel.textContent = `P2P: ${Number(item.p2p_usdt_bob).toFixed(2)} Bs.`;
}

// Configuração dos Event Listeners
function setupEventListeners() {
    tabBrlToBob.addEventListener('click', () => setMode('BRL_TO_BOB'));
    tabBobToBrl.addEventListener('click', () => setMode('BOB_TO_BRL'));

    refreshIntervalSelect.addEventListener('change', (e) => {
        refreshIntervalSeconds = parseInt(e.target.value);
        resetCountdown();
    });

    inputAmount.addEventListener('input', () => {
        updateSmartTierBanner();
        runSimulation();
    });

    customMarginInput.addEventListener('input', (e) => {
        currentMarginValue = parseFloat(e.target.value) || 0;
        updateMarginButtonsActiveState();
        runSimulation();
    });

    marginTypeSelect.addEventListener('change', (e) => {
        currentMarginType = e.target.value;
        if (currentMarginType === 'SMART_TIER') {
            smartTierBanner.classList.remove('hidden');
            marginUnitLabel.textContent = '%';
        } else {
            smartTierBanner.classList.add('hidden');
            if (currentMarginType === 'PERCENT') {
                marginUnitLabel.textContent = '%';
            } else if (currentMarginType === 'FIXED_PER_BOB') {
                marginUnitLabel.textContent = 'R$/Bs';
                currentMarginValue = 0.05;
            } else {
                marginUnitLabel.textContent = 'R$';
                currentMarginValue = 10.0;
            }
        }
        customMarginInput.value = currentMarginValue;
        updateSmartTierBanner();
        updateMarginButtonsActiveState();
        runSimulation();
    });

    document.querySelectorAll('.margin-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            currentMarginValue = parseFloat(btn.dataset.val);
            customMarginInput.value = currentMarginValue;
            updateMarginButtonsActiveState();
            runSimulation();
        });
    });

    setupQuickAmountButtons();

    customP2pPriceInput.addEventListener('input', (e) => {
        customP2pPriceSelected = e.target.value ? parseFloat(e.target.value) : null;
        customP2pNickSelected = null;
        if (currentQuotes) renderKPIs(currentQuotes);
        runSimulation();
    });
    customSpotFeeInput.addEventListener('input', runSimulation);

    refreshBtn.addEventListener('click', () => {
        fetchQuotes(true);
        resetCountdown();
    });

    copyWhatsappBtn.addEventListener('click', copyWhatsappMessage);
    shareWhatsappBtn.addEventListener('click', openWhatsappDirect);

    btnTimeframe1h.addEventListener('click', () => setChartTimeframe('1h'));
    btnTimeframe24h.addEventListener('click', () => setChartTimeframe('24h'));
}

function updateSmartTierBanner() {
    if (currentMarginType !== 'SMART_TIER') return;
    const amountVal = parseFloat(inputAmount.value) || 0;
    
    if (amountVal < 500) {
        smartTierActiveRule.textContent = 'Taxa Fixa R$ 7,00 (< R$ 500)';
    } else if (amountVal < 1000) {
        smartTierActiveRule.textContent = 'Taxa Fixa R$ 10,00 (R$ 500 a 1K)';
    } else {
        smartTierActiveRule.textContent = `Margem ${currentMarginValue}% (>= R$ 1.000)`;
    }
}

function setupQuickAmountButtons() {
    quickAmountButtonsContainer.querySelectorAll('.quick-amount-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            inputAmount.value = btn.dataset.amount;
            updateSmartTierBanner();
            runSimulation();
        });
    });
}

function setChartTimeframe(tf) {
    currentTimeframe = tf;
    if (tf === '1h') {
        btnTimeframe1h.className = 'timeframe-btn px-2.5 py-1 rounded bg-blue-600 text-white font-bold transition-all text-[10px] sm:text-[11px]';
        btnTimeframe24h.className = 'timeframe-btn px-2.5 py-1 rounded bg-cardBorder text-slate-300 hover:text-white transition-all text-[10px] sm:text-[11px]';
        chartSubtitle.textContent = '*Toque ou deslize o dedo nos círculos amarelos para inspecionar cada minuto.';
    } else {
        btnTimeframe24h.className = 'timeframe-btn px-2.5 py-1 rounded bg-blue-600 text-white font-bold transition-all text-[10px] sm:text-[11px]';
        btnTimeframe1h.className = 'timeframe-btn px-2.5 py-1 rounded bg-cardBorder text-slate-300 hover:text-white transition-all text-[10px] sm:text-[11px]';
        chartSubtitle.textContent = '*Toque ou deslize o dedo nos círculos amarelos para inspecionar cada hora.';
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
            <button type="button" class="quick-amount-btn px-2 py-1 bg-cardBorder hover:bg-slate-700 rounded text-[10px] sm:text-[11px] font-bold text-slate-300 transition-colors" data-amount="300">300</button>
            <button type="button" class="quick-amount-btn px-2 py-1 bg-cardBorder hover:bg-slate-700 rounded text-[10px] sm:text-[11px] font-bold text-slate-300 transition-colors" data-amount="500">500</button>
            <button type="button" class="quick-amount-btn px-2 py-1 bg-cardBorder hover:bg-slate-700 rounded text-[10px] sm:text-[11px] font-bold text-slate-300 transition-colors" data-amount="1000">1K</button>
            <button type="button" class="quick-amount-btn px-2 py-1 bg-cardBorder hover:bg-slate-700 rounded text-[10px] sm:text-[11px] font-bold text-slate-300 transition-colors" data-amount="2000">2K</button>
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
            <button type="button" class="quick-amount-btn px-2 py-1 bg-cardBorder hover:bg-slate-700 rounded text-[10px] sm:text-[11px] font-bold text-slate-300 transition-colors" data-amount="1000">1K</button>
            <button type="button" class="quick-amount-btn px-2 py-1 bg-cardBorder hover:bg-slate-700 rounded text-[10px] sm:text-[11px] font-bold text-slate-300 transition-colors" data-amount="2000">2K</button>
            <button type="button" class="quick-amount-btn px-2 py-1 bg-cardBorder hover:bg-slate-700 rounded text-[10px] sm:text-[11px] font-bold text-slate-300 transition-colors" data-amount="5000">5K</button>
            <button type="button" class="quick-amount-btn px-2 py-1 bg-cardBorder hover:bg-slate-700 rounded text-[10px] sm:text-[11px] font-bold text-slate-300 transition-colors" data-amount="10000">10K</button>
        `;
        if (inputAmount.value === '1000') inputAmount.value = '5000';
    }
    setupQuickAmountButtons();
    updateSmartTierBanner();
    runSimulation();
}

function updateMarginButtonsActiveState() {
    document.querySelectorAll('.margin-btn').forEach(btn => {
        if (parseFloat(btn.dataset.val) === currentMarginValue) {
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

function setLiveState() {
    liveStatusBadge.innerHTML = '<span class="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping"></span> Ao Vivo';
    liveStatusBadge.className = 'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] sm:text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20';
    offlineBanner.classList.add('hidden');
}

function setOfflineState(reason = 'Cotações pausadas') {
    liveStatusBadge.innerHTML = '<span class="w-1.5 h-1.5 rounded-full bg-rose-500"></span> Offline';
    liveStatusBadge.className = 'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] sm:text-xs font-medium bg-rose-500/20 text-rose-300 border border-rose-500/30';
    offlineBanner.classList.remove('hidden');
}

// Persistência Imutável Local no Aparelho do Usuário (localStorage)
function getSavedHistoryStore() {
    try {
        const raw = localStorage.getItem('cambiobol_history_cache_v3');
        return raw ? JSON.parse(raw) : { hourly: {}, minutely: {} };
    } catch (e) {
        return { hourly: {}, minutely: {} };
    }
}

function saveHistoryStoreLocal(store) {
    try {
        localStorage.setItem('cambiobol_history_cache_v3', JSON.stringify(store));
    } catch (e) {}
}

function processAndPersistHistory(data) {
    if (!data) return;
    const store = getSavedHistoryStore();
    let hasChanges = false;

    // 1. Processa 24 Horas
    if (data.history_24h && data.history_24h.length > 0) {
        data.history_24h.forEach((pt, idx) => {
            const isCurrentNow = (idx === data.history_24h.length - 1);
            const key = pt.full_time || pt.timestamp;
            
            if (!isCurrentNow && store.hourly[key]) {
                // Ponto passado: recupera o valor congelado gravado naquela hora!
                pt.rate_brl_bob = store.hourly[key].rate_brl_bob;
                pt.spot_usdt_brl = store.hourly[key].spot_usdt_brl;
                pt.p2p_usdt_bob = store.hourly[key].p2p_usdt_bob;
            } else {
                store.hourly[key] = {
                    rate_brl_bob: pt.rate_brl_bob,
                    spot_usdt_brl: pt.spot_usdt_brl,
                    p2p_usdt_bob: pt.p2p_usdt_bob,
                    timestamp: pt.timestamp,
                    full_time: pt.full_time
                };
                hasChanges = true;
            }
        });
    }

    // 2. Processa 1 Hora (Minutos)
    if (data.history_1h && data.history_1h.length > 0) {
        data.history_1h.forEach((pt, idx) => {
            const isCurrentNow = (idx === data.history_1h.length - 1);
            const key = pt.full_time || pt.timestamp;
            
            if (!isCurrentNow && store.minutely[key]) {
                pt.rate_brl_bob = store.minutely[key].rate_brl_bob;
                pt.spot_usdt_brl = store.minutely[key].spot_usdt_brl;
                pt.p2p_usdt_bob = store.minutely[key].p2p_usdt_bob;
            } else {
                store.minutely[key] = {
                    rate_brl_bob: pt.rate_brl_bob,
                    spot_usdt_brl: pt.spot_usdt_brl,
                    p2p_usdt_bob: pt.p2p_usdt_bob,
                    timestamp: pt.timestamp,
                    full_time: pt.full_time
                };
                hasChanges = true;
            }
        });
    }

    if (hasChanges) {
        saveHistoryStoreLocal(store);
        syncHistoryWithBackend(store);
    }
}

async function syncHistoryWithBackend(store) {
    try {
        await fetch('/api/history/sync', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(store)
        });
    } catch (e) {}
}

// Busca Cotações no Backend
async function fetchQuotes(isManual = false) {
    if (isManual) {
        refreshIcon.classList.add('fa-spin');
    }
    try {
        const url = isManual ? (`/api/quotes?force=1&t=${Date.now()}`) : (`/api/quotes?t=${Date.now()}`);
        const res = await fetch(url, { cache: 'no-store', headers: { 'Pragma': 'no-cache', 'Cache-Control': 'no-cache' } });
        if (res.ok) {
            const data = await res.json();
            currentQuotes = data;
            
            if (data.is_live) {
                setLiveState();
            } else {
                setOfflineState('Sem conexão recente com a Binance');
            }
            
            processAndPersistHistory(data);
            renderKPIs(data);
            renderP2PTable(data.p2p_ads_bob || []);
            renderHistoryChart(data);
            runSimulation();
        } else {
            setOfflineState('Servidor fora do ar');
        }
    } catch (err) {
        console.error('Erro ao buscar cotações:', err);
        setOfflineState('Sem conexão com a internet');
    } finally {
        if (isManual) {
            setTimeout(() => refreshIcon.classList.remove('fa-spin'), 600);
        }
    }
}

// Renderiza Cards de Indicadores (KPIs) - Sincronizado com Preço P2P Selecionado
function renderKPIs(data) {
    if (!data.spot_usdt_brl) {
        kpiSpotUsdtBrl.textContent = '--';
        kpiP2pUsdtBob.textContent = '--';
        kpiRawRate.textContent = '--';
        kpiCommercialRate.textContent = '--';
        return;
    }

    const spotAsk = data.spot_usdt_brl.ask;
    const spotBid = data.spot_usdt_brl.bid;
    kpiSpotUsdtBrl.textContent = spotAsk.toFixed(4);
    kpiSpotSpread.textContent = (spotAsk - spotBid).toFixed(4);

    // Preço P2P efetivo: usa o selecionado pelo usuário ou o melhor da API
    const effectiveP2p = customP2pPriceSelected || data.best_p2p_bob;
    
    if (effectiveP2p) {
        kpiP2pUsdtBob.textContent = effectiveP2p.toFixed(2);
        
        // Se fixado manualmente em um comerciante, exibe indicador com botão de resetar
        if (customP2pPriceSelected) {
            const nickLabel = customP2pNickSelected ? `${customP2pNickSelected.substring(0, 10)}` : 'Fixado';
            kpiP2pTop3.innerHTML = `<span class="text-binanceYellow font-bold flex items-center gap-1 cursor-pointer" onclick="resetP2pPriceToAuto()"><i class="fa-solid fa-lock text-[9px]"></i> ${nickLabel} <span class="underline text-[9px] text-slate-400 hover:text-white ml-0.5">(↺ Auto)</span></span>`;
        } else {
            kpiP2pTop3.textContent = data.top3_avg_bob ? data.top3_avg_bob.toFixed(2) : '--';
        }

        // Câmbio Bruto Efetivo com base no P2P ativo
        const effectiveRawRate = (1.0 / spotAsk) * effectiveP2p;
        const effectiveRawInverse = effectiveRawRate > 0 ? (1.0 / effectiveRawRate) : 0;
        
        kpiRawRate.textContent = effectiveRawRate.toFixed(4);
        kpiRawRateInverse.textContent = `R$ ${effectiveRawInverse.toFixed(4)}`;

        // Câmbio Comercial Efetivo
        let commercialRate = effectiveRawRate;
        const amountVal = parseFloat(inputAmount.value) || 1000;

        if (currentMarginType === 'SMART_TIER') {
            if (amountVal < 500) {
                commercialRate = effectiveRawRate * (1 - (7.0 / (amountVal || 300)));
                kpiMarginBadge.textContent = 'LUCRO: R$ 7 FIXO';
            } else if (amountVal < 1000) {
                commercialRate = effectiveRawRate * (1 - (10.0 / (amountVal || 500)));
                kpiMarginBadge.textContent = 'LUCRO: R$ 10 FIXO';
            } else {
                commercialRate = effectiveRawRate * (1 - (currentMarginValue / 100.0));
                kpiMarginBadge.textContent = `LUCRO: ${currentMarginValue}%`;
            }
        } else if (currentMarginType === 'PERCENT') {
            commercialRate = effectiveRawRate * (1 - (currentMarginValue / 100.0));
            kpiMarginBadge.textContent = `LUCRO: ${currentMarginValue}%`;
        } else if (currentMarginType === 'FIXED_PER_BOB') {
            commercialRate = Math.max(0.01, effectiveRawRate - currentMarginValue);
            kpiMarginBadge.textContent = `LUCRO: -${currentMarginValue} Bs/R$`;
        } else {
            kpiMarginBadge.textContent = `TAXA: R$ ${currentMarginValue}`;
        }

        const commercialInverse = commercialRate > 0 ? (1.0 / commercialRate) : 0;
        kpiCommercialRate.textContent = commercialRate.toFixed(4);
        kpiCommercialInverse.textContent = `R$ ${commercialInverse.toFixed(4)}`;
    }
}

let p2pCurrentPage = 1;
const p2pPrevBtn = document.getElementById('p2pPrevBtn');
const p2pNextBtn = document.getElementById('p2pNextBtn');
const p2pPageIndicator = document.getElementById('p2pPageIndicator');

if (p2pPrevBtn) {
    p2pPrevBtn.addEventListener('click', () => {
        if (p2pCurrentPage > 1) {
            p2pCurrentPage--;
            if (currentQuotes) renderP2PTable(currentQuotes.p2p_ads_bob || []);
        }
    });
}

if (p2pNextBtn) {
    p2pNextBtn.addEventListener('click', () => {
        const totalPages = Math.ceil((currentQuotes?.p2p_ads_bob?.length || 0) / 10) || 1;
        if (p2pCurrentPage < totalPages) {
            p2pCurrentPage++;
            if (currentQuotes) renderP2PTable(currentQuotes.p2p_ads_bob || []);
        }
    });
}

// Renderiza Tabela de Ofertas P2P (10 por página)
function renderP2PTable(ads) {
    if (!ads || ads.length === 0) {
        p2pTableBody.innerHTML = `<tr><td colspan="4" class="py-4 text-center text-slate-500">Nenhum anunciante de venda verificado online no momento.</td></tr>`;
        if (p2pPageIndicator) p2pPageIndicator.textContent = '0 de 0';
        return;
    }

    const pageSize = 10;
    const totalPages = Math.ceil(ads.length / pageSize) || 1;
    if (p2pCurrentPage > totalPages) p2pCurrentPage = totalPages;
    if (p2pCurrentPage < 1) p2pCurrentPage = 1;

    const startIdx = (p2pCurrentPage - 1) * pageSize;
    const endIdx = Math.min(startIdx + pageSize, ads.length);
    const pageAds = ads.slice(startIdx, endIdx);

    if (p2pPageIndicator) {
        p2pPageIndicator.textContent = `Página ${p2pCurrentPage} de ${totalPages} (Top ${startIdx + 1}-${endIdx})`;
    }
    if (p2pPrevBtn) p2pPrevBtn.disabled = p2pCurrentPage <= 1;
    if (p2pNextBtn) p2pNextBtn.disabled = p2pCurrentPage >= totalPages;

    let html = '';
    pageAds.forEach((ad, idx) => {
        const globalIdx = startIdx + idx;
        const isSelected = customP2pPriceSelected === ad.price;
        const isBest = globalIdx === 0 && !customP2pPriceSelected;
        
        const methodsBadges = ad.trade_methods.slice(0, 2).map(m => {
            let color = 'bg-slate-800 text-slate-300 border-slate-700';
            if (m.toLowerCase().includes('union')) color = 'bg-blue-500/10 text-blue-300 border-blue-500/30';
            if (m.toLowerCase().includes('nacional') || m.toLowerCase().includes('bnb')) color = 'bg-yellow-500/10 text-yellow-300 border-yellow-500/30';
            if (m.toLowerCase().includes('credito') || m.toLowerCase().includes('bcp')) color = 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30';
            return `<span class="inline-block px-1.5 py-0.2 text-[8px] sm:text-[9px] rounded border ${color} font-medium mr-1 mb-0.5 truncate max-w-[90px]">${m}</span>`;
        }).join('');

        const buttonStyle = isSelected 
            ? 'bg-binanceYellow text-black font-black ring-2 ring-yellow-400' 
            : 'bg-cardBorder hover:bg-binanceYellow hover:text-black text-slate-200';

        html += `
            <tr class="hover:bg-slate-800/40 transition-colors ${isSelected ? 'bg-binanceYellow/10 border-l-2 border-binanceYellow' : (isBest ? 'bg-binanceYellow/5' : '')}">
                <td class="py-2 sm:py-2.5 pr-1 sm:pr-2">
                    <div class="flex items-center gap-1 flex-wrap">
                        <span class="font-bold text-white text-[11px] sm:text-xs truncate max-w-[100px] sm:max-w-[130px]">${ad.nick_name}</span>
                        <span class="text-[8px] sm:text-[9px] px-1 py-0.2 bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-bold rounded flex items-center gap-0.5">
                            <i class="fa-solid fa-circle-check text-[7px]"></i> Verif.
                        </span>
                        ${isSelected ? '<span class="text-[8px] px-1 py-0.2 bg-binanceYellow text-black font-extrabold rounded">ATIVO</span>' : ''}
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
                    <button onclick="applyP2pPrice(${ad.price}, '${ad.nick_name}')" class="px-2 py-1 ${buttonStyle} rounded text-[9px] sm:text-[10px] font-bold transition-all shadow-sm">
                        ${isSelected ? 'Ativo' : 'Usar'}
                    </button>
                </td>
            </tr>
        `;
    });
    p2pTableBody.innerHTML = html;
}

// Aplica preço do comerciante selecionado em toda a interface
window.applyP2pPrice = function(price, nickName = 'Comerciante') {
    customP2pPriceInput.value = price;
    customP2pPriceSelected = price;
    customP2pNickSelected = nickName;
    
    if (currentQuotes) {
        renderKPIs(currentQuotes);
        renderP2PTable(currentQuotes.p2p_ads_bob || []);
    }
    
    showToast(`Cotação P2P fixada em ${price.toFixed(2)} Bs. (${nickName})`);
    runSimulation();
};

// Reseta para melhor cotação automática
window.resetP2pPriceToAuto = function() {
    customP2pPriceInput.value = '';
    customP2pPriceSelected = null;
    customP2pNickSelected = null;
    
    if (currentQuotes) {
        renderKPIs(currentQuotes);
        renderP2PTable(currentQuotes.p2p_ads_bob || []);
    }
    
    showToast('Cotação P2P voltou para o Automático (Melhor Oferta ao Vivo)!');
    runSimulation();
};

// Renderiza Gráfico Histórico
function renderHistoryChart(data) {
    if (!historyChart) return;
    
    const historyList = getActiveHistoryList();
    if (!historyList || historyList.length === 0) return;
    
    const labels = historyList.map(h => h.timestamp);
    const dataRates = historyList.map(h => parseFloat(h.rate_brl_bob));
    
    const minVal = Math.min(...dataRates);
    const maxVal = Math.max(...dataRates);
    const padding = (maxVal - minVal) * 0.3 || 0.003;
    
    historyChart.options.scales.y.min = Math.max(0, parseFloat((minVal - padding).toFixed(4)));
    historyChart.options.scales.y.max = parseFloat((maxVal + padding).toFixed(4));
    
    historyChart.data.labels = labels;
    historyChart.data.datasets[0].data = dataRates;
    historyChart.update();

    updateInspector(historyList.length - 1);
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
    if (data.applied_tier_label) {
        smartTierActiveRule.textContent = data.applied_tier_label;
    }

    if (currentMode === 'BRL_TO_BOB') {
        resClientReceivesBob.textContent = formatNumber(data.bob_client_receives);
        resOperatorProfitBrl.textContent = `R$ ${formatNumber(data.profit_brl)}`;
        resProfitPercentBadge.textContent = `(+${data.profit_percent}%)`;
        
        resStepPix.textContent = `R$ ${formatNumber(data.brl_input)}`;
        resStepUsdt.textContent = `${data.usdt_net.toFixed(2)} USDT`;
        resStepRate.textContent = `1 BRL = ${data.commercial_bob_per_brl.toFixed(4)} Bs.`;
        resStepInverse.textContent = `R$ ${data.commercial_brl_per_bob.toFixed(4)}`;
    } else {
        resClientReceivesBob.textContent = `R$ ${formatNumber(data.brl_charge_client)}`;
        resOperatorProfitBrl.textContent = `R$ ${formatNumber(data.profit_brl)}`;
        resProfitPercentBadge.textContent = `(+${data.profit_percent}%)`;

        resStepPix.textContent = `R$ ${formatNumber(data.brl_cost_pure)}`;
        resStepUsdt.textContent = `${data.usdt_needed.toFixed(2)} USDT`;
        resStepRate.textContent = `1 BRL = ${data.commercial_bob_per_brl.toFixed(4)} Bs.`;
        resStepInverse.textContent = `R$ ${data.commercial_brl_per_bob.toFixed(4)}`;
    }
}

function formatNumber(num) {
    if (num === undefined || num === null) return '0,00';
    return Number(num).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

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
