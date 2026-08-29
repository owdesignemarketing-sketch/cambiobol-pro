import time
import threading
import requests
from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS

app = Flask(__name__, static_folder='static', static_url_path='')
CORS(app)

# Cache de cotações em memória
quotes_cache = {
    "last_updated": 0,
    "spot_usdt_brl": None,
    "p2p_usdt_bob": [],
    "p2p_usdt_brl": [],
    "rate_brl_bob_raw": 0,
    "history": []
}

HISTORY_MAX_ITEMS = 60

HEADERS = {
    'Accept': '*/*',
    'Accept-Encoding': 'gzip, deflate, br',
    'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Content-Type': 'application/json',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
}

def fetch_binance_spot_usdt_brl():
    """Busca o preço de compra e venda no livro Spot USDT/BRL da Binance."""
    try:
        url = "https://api.binance.com/api/v3/ticker/bookTicker?symbol=USDTBRL"
        resp = requests.get(url, headers=HEADERS, timeout=6)
        if resp.status_code == 200:
            data = resp.json()
            return {
                "bid": float(data.get("bidPrice", 0)),  # Preço de venda (se quisesse vender USDT)
                "ask": float(data.get("askPrice", 0)),  # Preço de compra (comprar USDT com BRL)
                "symbol": "USDTBRL"
            }
    except Exception as e:
        print(f"Erro ao buscar Spot USDTBRL: {e}")
    return None

def fetch_binance_p2p(asset="USDT", fiat="BOB", trade_type="SELL", rows=10, pay_types=None):
    """
    Busca anúncios no P2P da Binance.
    trade_type='SELL': Usuário quer VENDER USDT e receber a moeda Fiat (BOB ou BRL) na conta bancária.
    """
    try:
        url = "https://p2p.binance.com/bapi/c2c/v2/friendly/c2c/adv/search"
        payload = {
            "asset": asset,
            "fiat": fiat,
            "merchantCheck": False,
            "page": 1,
            "payTypes": pay_types or [],
            "publisherType": None,
            "rows": rows,
            "tradeType": trade_type
        }
        resp = requests.post(url, json=payload, headers=HEADERS, timeout=6)
        if resp.status_code == 200:
            res_data = resp.json()
            ads_list = []
            for item in res_data.get("data", []):
                adv = item.get("adv", {})
                advertiser = item.get("advertiser", {})
                methods = [m.get("tradeMethodName") for m in adv.get("tradeMethods", []) if m.get("tradeMethodName")]
                
                ads_list.append({
                    "adv_id": adv.get("advNo"),
                    "nick_name": advertiser.get("nickName"),
                    "month_order_count": advertiser.get("monthOrderCount", 0),
                    "month_finish_rate": round(float(advertiser.get("monthFinishRate", 0) * 100), 1),
                    "price": float(adv.get("price", 0)),
                    "min_amount": float(adv.get("minSingleTransAmount", 0)),
                    "max_amount": float(adv.get("dynamicMaxSingleTransAmount") or adv.get("maxSingleTransAmount", 0)),
                    "surplus_amount": float(adv.get("surplusAmount", 0)),
                    "trade_methods": methods
                })
            return ads_list
    except Exception as e:
        print(f"Erro ao buscar P2P {asset}/{fiat} {trade_type}: {e}")
    return []

def update_all_quotes():
    """Atualiza as cotações completas e mantém o histórico em memória."""
    global quotes_cache
    spot = fetch_binance_spot_usdt_brl()
    p2p_bob = fetch_binance_p2p(asset="USDT", fiat="BOB", trade_type="SELL", rows=15)
    
    if spot and p2p_bob and len(p2p_bob) > 0:
        # Preço de compra do USDT com BRL no Spot (ask)
        usdt_brl_buy_price = spot["ask"]
        
        # Melhores preços de venda de USDT por BOB
        best_p2p_bob = p2p_bob[0]["price"]
        top3_avg_bob = sum(ad["price"] for ad in p2p_bob[:3]) / min(3, len(p2p_bob))
        
        # Câmbio Bruto: quantos BOB você recebe por 1 BRL
        # (1 BRL / usdt_brl_buy_price) * best_p2p_bob = BOB_per_BRL
        raw_bob_per_brl = (1.0 / usdt_brl_buy_price) * best_p2p_bob
        raw_brl_per_bob = 1.0 / raw_bob_per_brl if raw_bob_per_brl > 0 else 0
        
        now = time.time()
        
        quotes_cache["last_updated"] = now
        quotes_cache["spot_usdt_brl"] = spot
        quotes_cache["p2p_usdt_bob"] = p2p_bob
        quotes_cache["best_p2p_bob"] = best_p2p_bob
        quotes_cache["top3_avg_bob"] = round(top3_avg_bob, 4)
        quotes_cache["rate_brl_bob_raw"] = round(raw_bob_per_brl, 4)
        quotes_cache["rate_bob_brl_raw"] = round(raw_brl_per_bob, 4)
        
        # Adiciona ao histórico para gráficos
        history_item = {
            "timestamp": time.strftime("%H:%M:%S", time.localtime(now)),
            "spot_usdt_brl": usdt_brl_buy_price,
            "p2p_usdt_bob": best_p2p_bob,
            "rate_brl_bob": round(raw_bob_per_brl, 4)
        }
        quotes_cache["history"].append(history_item)
        if len(quotes_cache["history"]) > HISTORY_MAX_ITEMS:
            quotes_cache["history"].pop(0)

# Thread de atualização em segundo plano (a cada 8 segundos)
def background_updater():
    while True:
        try:
            update_all_quotes()
        except Exception as e:
            print(f"Erro no background updater: {e}")
        time.sleep(8)

updater_thread = threading.Thread(target=background_updater, daemon=True)
updater_thread.start()

@app.route('/')
def index():
    return send_from_directory('static', 'index.html')

@app.route('/api/quotes', methods=['GET'])
def get_quotes():
    # Se ainda não inicializou, força a busca
    if not quotes_cache["spot_usdt_brl"]:
        update_all_quotes()
    
    # Extrai lista de bancos/métodos disponíveis nos anúncios
    all_methods = set()
    for ad in quotes_cache.get("p2p_usdt_bob", []):
        for m in ad.get("trade_methods", []):
            all_methods.add(m)
            
    return jsonify({
        "status": "success",
        "last_updated": quotes_cache["last_updated"],
        "spot_usdt_brl": quotes_cache["spot_usdt_brl"],
        "best_p2p_bob": quotes_cache.get("best_p2p_bob", 0),
        "top3_avg_bob": quotes_cache.get("top3_avg_bob", 0),
        "rate_brl_bob_raw": quotes_cache.get("rate_brl_bob_raw", 0),
        "rate_bob_brl_raw": quotes_cache.get("rate_bob_brl_raw", 0),
        "p2p_ads_bob": quotes_cache.get("p2p_usdt_bob", []),
        "available_banks": sorted(list(all_methods)),
        "history": quotes_cache.get("history", [])
    })

@app.route('/api/simulate', methods=['POST'])
def simulate():
    data = request.json or {}
    mode = data.get("mode", "BRL_TO_BOB")  # 'BRL_TO_BOB' ou 'BOB_TO_BRL'
    amount = float(data.get("amount", 1000))
    profit_margin_type = data.get("profit_margin_type", "PERCENT")  # 'PERCENT', 'FIXED_PER_BOB', 'FIXED_PER_TX'
    profit_margin_value = float(data.get("profit_margin_value", 3.0)) # ex: 3% ou R$ 0.05
    spot_fee_percent = float(data.get("spot_fee_percent", 0.075))  # Taxa Spot Binance (0.075% BNB ou 0.1%)
    custom_p2p_price = data.get("custom_p2p_price")
    custom_spot_price = data.get("custom_spot_price")
    
    # Obtém cotações atuais ou customizadas
    if not quotes_cache["spot_usdt_brl"]:
        update_all_quotes()
        
    spot_price = float(custom_spot_price) if custom_spot_price else quotes_cache["spot_usdt_brl"]["ask"]
    p2p_price = float(custom_p2p_price) if custom_p2p_price else quotes_cache.get("best_p2p_bob", 11.5)
    
    if spot_price <= 0 or p2p_price <= 0:
        return jsonify({"error": "Preços de mercado inválidos"}), 400
        
    # Câmbio Bruto de Mercado
    raw_bob_per_brl = (1.0 / spot_price) * (1.0 - (spot_fee_percent / 100.0)) * p2p_price
    
    if mode == "BRL_TO_BOB":
        # Cliente envia BRL
        brl_input = amount
        # 1. Compra USDT no Spot descontando taxa
        usdt_bought_raw = brl_input / spot_price
        spot_fee_usdt = usdt_bought_raw * (spot_fee_percent / 100.0)
        usdt_net = usdt_bought_raw - spot_fee_usdt
        
        # 2. Vende USDT no P2P para BOB
        bob_gross = usdt_net * p2p_price
        
        # 3. Aplica margem de lucro
        if profit_margin_type == "PERCENT":
            profit_bob = bob_gross * (profit_margin_value / 100.0)
            bob_client_receives = bob_gross - profit_bob
            profit_brl = (profit_bob / p2p_price) * spot_price
        elif profit_margin_type == "FIXED_PER_BOB":
            # Margem fixa em R$ por cada Boliviano
            # Ex: Se a taxa bruta é 2.30 BOB/BRL, a taxa comercial será reduzida
            commercial_rate = max(0.001, raw_bob_per_brl - profit_margin_value)
            bob_client_receives = brl_input * commercial_rate
            profit_bob = bob_gross - bob_client_receives
            profit_brl = (profit_bob / p2p_price) * spot_price
        else: # FIXED_PER_TX (Taxa fixa em R$)
            profit_brl = min(brl_input * 0.5, profit_margin_value)
            brl_for_exchange = brl_input - profit_brl
            bob_client_receives = (brl_for_exchange / spot_price) * (1.0 - (spot_fee_percent / 100.0)) * p2p_price
            profit_bob = bob_gross - bob_client_receives
            
        commercial_bob_per_brl = bob_client_receives / brl_input if brl_input > 0 else 0
        commercial_brl_per_bob = 1.0 / commercial_bob_per_brl if commercial_bob_per_brl > 0 else 0
        profit_percent = (profit_brl / brl_input) * 100.0 if brl_input > 0 else 0
        
        return jsonify({
            "mode": mode,
            "brl_input": round(brl_input, 2),
            "spot_price_usdt_brl": round(spot_price, 4),
            "usdt_net": round(usdt_net, 2),
            "p2p_price_usdt_bob": round(p2p_price, 4),
            "bob_gross": round(bob_gross, 2),
            "bob_client_receives": round(bob_client_receives, 2),
            "profit_brl": round(profit_brl, 2),
            "profit_bob": round(profit_bob, 2),
            "profit_percent": round(profit_percent, 2),
            "raw_bob_per_brl": round(raw_bob_per_brl, 4),
            "commercial_bob_per_brl": round(commercial_bob_per_brl, 4),
            "commercial_brl_per_bob": round(commercial_brl_per_bob, 4),
        })

    else: # BOB_TO_BRL (Cliente quer X Bolivianos, quanto cobrar em R$)
        bob_target = amount
        # Para entregar bob_target ao cliente, precisamos calcular quanto em BRL cobrar
        if profit_margin_type == "PERCENT":
            # bob_target = bob_gross * (1 - margin/100)
            margin_factor = 1.0 - (profit_margin_value / 100.0)
            if margin_factor <= 0: margin_factor = 0.9
            bob_gross_needed = bob_target / margin_factor
            usdt_needed = bob_gross_needed / p2p_price
            brl_cost = usdt_needed * spot_price / (1.0 - (spot_fee_percent / 100.0))
            brl_charge_client = brl_cost
            profit_bob = bob_gross_needed - bob_target
            profit_brl = (profit_bob / p2p_price) * spot_price
        elif profit_margin_type == "FIXED_PER_BOB":
            commercial_rate = max(0.001, raw_bob_per_brl - profit_margin_value)
            brl_charge_client = bob_target / commercial_rate
            usdt_net = (brl_charge_client / spot_price) * (1.0 - (spot_fee_percent / 100.0))
            bob_gross = usdt_net * p2p_price
            profit_bob = bob_gross - bob_target
            profit_brl = (profit_bob / p2p_price) * spot_price
        else: # FIXED_PER_TX
            usdt_needed = bob_target / p2p_price
            brl_cost = usdt_needed * spot_price / (1.0 - (spot_fee_percent / 100.0))
            brl_charge_client = brl_cost + profit_margin_value
            profit_brl = profit_margin_value
            profit_bob = (profit_brl / spot_price) * p2p_price

        commercial_bob_per_brl = bob_target / brl_charge_client if brl_charge_client > 0 else 0
        commercial_brl_per_bob = brl_charge_client / bob_target if bob_target > 0 else 0
        profit_percent = (profit_brl / brl_charge_client) * 100.0 if brl_charge_client > 0 else 0
        
        return jsonify({
            "mode": mode,
            "bob_target": round(bob_target, 2),
            "brl_charge_client": round(brl_charge_client, 2),
            "spot_price_usdt_brl": round(spot_price, 4),
            "p2p_price_usdt_bob": round(p2p_price, 4),
            "profit_brl": round(profit_brl, 2),
            "profit_bob": round(profit_bob, 2),
            "profit_percent": round(profit_percent, 2),
            "raw_bob_per_brl": round(raw_bob_per_brl, 4),
            "commercial_bob_per_brl": round(commercial_bob_per_brl, 4),
            "commercial_brl_per_bob": round(commercial_brl_per_bob, 4),
        })

if __name__ == '__main__':
    print("Iniciando CâmbioBoliviana Server na porta 5000...")
    update_all_quotes()
    app.run(host='0.0.0.0', port=5000, debug=False)
