import time
import threading
import requests
from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS

app = Flask(__name__, static_folder='static', static_url_path='')
CORS(app)

# Cache de cotacoes em memoria
quotes_cache = {
    "last_updated": time.time(),
    "spot_usdt_brl": {"bid": 5.21, "ask": 5.213, "symbol": "USDTBRL"},
    "p2p_usdt_bob": [],
    "p2p_usdt_brl": [],
    "best_p2p_bob": 12.10,
    "top3_avg_bob": 12.08,
    "rate_brl_bob_raw": 2.32,
    "rate_bob_brl_raw": 0.43,
    "history": []
}

HISTORY_MAX_ITEMS = 60

HEADERS_SPOT = {
    'Accept': 'application/json',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
}

HEADERS_P2P = {
    'Accept': '*/*',
    'Accept-Language': 'es-LA,es;q=0.9,pt-BR;q=0.8,en-US;q=0.7',
    'Cache-Control': 'no-cache',
    'Client-Type': 'web',
    'Content-Type': 'application/json',
    'Origin': 'https://p2p.binance.com',
    'Pragma': 'no-cache',
    'Referer': 'https://p2p.binance.com/es-LA/trade/sell/USDT?fiat=BOB&payment=ALL',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'lang': 'es-LA'
}

BINANCE_SPOT_ENDPOINTS = [
    "https://api.binance.com/api/v3/ticker/bookTicker?symbol=USDTBRL",
    "https://api1.binance.com/api/v3/ticker/bookTicker?symbol=USDTBRL",
    "https://api2.binance.com/api/v3/ticker/bookTicker?symbol=USDTBRL",
    "https://api3.binance.com/api/v3/ticker/bookTicker?symbol=USDTBRL",
    "https://data-api.binance.vision/api/v3/ticker/bookTicker?symbol=USDTBRL"
]

def fetch_binance_spot_usdt_brl():
    """Busca o preco Spot USDT/BRL com multiplos fallbacks."""
    for url in BINANCE_SPOT_ENDPOINTS:
        try:
            resp = requests.get(url, headers=HEADERS_SPOT, timeout=4)
            if resp.status_code == 200:
                data = resp.json()
                ask = float(data.get("askPrice", 0))
                bid = float(data.get("bidPrice", 0))
                if ask > 0:
                    return {
                        "bid": bid if bid > 0 else ask * 0.999,
                        "ask": ask,
                        "symbol": "USDTBRL"
                    }
        except Exception:
            continue
    return None

def clean_str(val):
    """Sanitiza strings de comerciantes para evitar erros de encoding."""
    if not val:
        return "Comerciante"
    return str(val).encode('utf-8', 'ignore').decode('utf-8')

def fetch_binance_p2p(asset="USDT", fiat="BOB", trade_type="SELL", rows=12):
    """Busca anuncios no P2P da Binance com headers web completos."""
    try:
        url = "https://p2p.binance.com/bapi/c2c/v2/friendly/c2c/adv/search"
        payload = {
            "asset": asset,
            "fiat": fiat,
            "merchantCheck": False,
            "page": 1,
            "payTypes": [],
            "publisherType": None,
            "rows": rows,
            "tradeType": trade_type
        }
        resp = requests.post(url, json=payload, headers=HEADERS_P2P, timeout=5)
        if resp.status_code == 200:
            res_data = resp.json()
            ads_list = []
            for item in res_data.get("data", []):
                adv = item.get("adv", {})
                advertiser = item.get("advertiser", {})
                methods = [clean_str(m.get("tradeMethodName")) for m in adv.get("tradeMethods", []) if m.get("tradeMethodName")]
                price = float(adv.get("price", 0))
                if price > 0:
                    ads_list.append({
                        "adv_id": clean_str(adv.get("advNo")),
                        "nick_name": clean_str(advertiser.get("nickName", "Comerciante")),
                        "month_order_count": int(advertiser.get("monthOrderCount", 0)),
                        "month_finish_rate": round(float(advertiser.get("monthFinishRate", 0) * 100), 1),
                        "price": price,
                        "min_amount": float(adv.get("minSingleTransAmount", 0)),
                        "max_amount": float(adv.get("dynamicMaxSingleTransAmount") or adv.get("maxSingleTransAmount", 0)),
                        "surplus_amount": float(adv.get("surplusAmount", 0)),
                        "trade_methods": methods
                    })
            return ads_list
    except Exception as e:
        print(f"Aviso P2P fetch: {e}")
    return []

def update_all_quotes():
    """Atualiza as cotacoes completas e mantem historico."""
    global quotes_cache
    try:
        spot = fetch_binance_spot_usdt_brl()
        p2p_bob = fetch_binance_p2p(asset="USDT", fiat="BOB", trade_type="SELL", rows=12)
        
        if spot:
            quotes_cache["spot_usdt_brl"] = spot
        
        if p2p_bob and len(p2p_bob) > 0:
            quotes_cache["p2p_usdt_bob"] = p2p_bob
            quotes_cache["best_p2p_bob"] = p2p_bob[0]["price"]
            top3 = [ad["price"] for ad in p2p_bob[:3]]
            quotes_cache["top3_avg_bob"] = round(sum(top3) / len(top3), 4)
            
        usdt_brl_buy_price = quotes_cache["spot_usdt_brl"]["ask"]
        best_p2p_bob = quotes_cache.get("best_p2p_bob", 12.10)
        
        if usdt_brl_buy_price > 0:
            raw_bob_per_brl = (1.0 / usdt_brl_buy_price) * best_p2p_bob
            raw_brl_per_bob = 1.0 / raw_bob_per_brl if raw_bob_per_brl > 0 else 0
            
            now = time.time()
            quotes_cache["last_updated"] = now
            quotes_cache["rate_brl_bob_raw"] = round(raw_bob_per_brl, 4)
            quotes_cache["rate_bob_brl_raw"] = round(raw_brl_per_bob, 4)
            
            history_item = {
                "timestamp": time.strftime("%H:%M:%S", time.localtime(now)),
                "spot_usdt_brl": usdt_brl_buy_price,
                "p2p_usdt_bob": best_p2p_bob,
                "rate_brl_bob": round(raw_bob_per_brl, 4)
            }
            quotes_cache["history"].append(history_item)
            if len(quotes_cache["history"]) > HISTORY_MAX_ITEMS:
                quotes_cache["history"].pop(0)
    except Exception as e:
        print(f"Erro em update_all_quotes: {e}")

# Thread de atualizacao em segundo plano
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
    try:
        if not quotes_cache.get("spot_usdt_brl") or not quotes_cache.get("p2p_usdt_bob"):
            update_all_quotes()
            
        all_methods = set()
        for ad in quotes_cache.get("p2p_usdt_bob", []):
            for m in ad.get("trade_methods", []):
                all_methods.add(m)
                
        return jsonify({
            "status": "success",
            "last_updated": quotes_cache.get("last_updated", time.time()),
            "spot_usdt_brl": quotes_cache.get("spot_usdt_brl"),
            "best_p2p_bob": quotes_cache.get("best_p2p_bob", 12.10),
            "top3_avg_bob": quotes_cache.get("top3_avg_bob", 12.08),
            "rate_brl_bob_raw": quotes_cache.get("rate_brl_bob_raw", 2.32),
            "rate_bob_brl_raw": quotes_cache.get("rate_bob_brl_raw", 0.43),
            "p2p_ads_bob": quotes_cache.get("p2p_usdt_bob", []),
            "available_banks": sorted(list(all_methods)),
            "history": quotes_cache.get("history", [])
        })
    except Exception as e:
        return jsonify({"error": str(e), "status": "error"}), 500

@app.route('/api/simulate', methods=['POST'])
def simulate():
    try:
        data = request.json or {}
        mode = data.get("mode", "BRL_TO_BOB")
        amount = float(data.get("amount", 1000) or 1000)
        profit_margin_type = data.get("profit_margin_type", "PERCENT")
        profit_margin_value = float(data.get("profit_margin_value", 3.0) or 3.0)
        spot_fee_percent = float(data.get("spot_fee_percent", 0.075) or 0.075)
        custom_p2p_price = data.get("custom_p2p_price")
        custom_spot_price = data.get("custom_spot_price")
        
        # Preco Spot Seguro
        if custom_spot_price:
            spot_price = float(custom_spot_price)
        elif quotes_cache.get("spot_usdt_brl") and quotes_cache["spot_usdt_brl"].get("ask"):
            spot_price = float(quotes_cache["spot_usdt_brl"]["ask"])
        else:
            spot_price = 5.21
            
        # Preco P2P Seguro
        if custom_p2p_price:
            p2p_price = float(custom_p2p_price)
        else:
            p2p_price = float(quotes_cache.get("best_p2p_bob") or 12.10)
            
        if spot_price <= 0: spot_price = 5.21
        if p2p_price <= 0: p2p_price = 12.10
        if amount <= 0: amount = 1000.0
            
        raw_bob_per_brl = (1.0 / spot_price) * (1.0 - (spot_fee_percent / 100.0)) * p2p_price
        
        if mode == "BRL_TO_BOB":
            brl_input = amount
            usdt_bought_raw = brl_input / spot_price
            spot_fee_usdt = usdt_bought_raw * (spot_fee_percent / 100.0)
            usdt_net = usdt_bought_raw - spot_fee_usdt
            bob_gross = usdt_net * p2p_price
            
            if profit_margin_type == "PERCENT":
                profit_bob = bob_gross * (profit_margin_value / 100.0)
                bob_client_receives = bob_gross - profit_bob
                profit_brl = (profit_bob / p2p_price) * spot_price
            elif profit_margin_type == "FIXED_PER_BOB":
                commercial_rate = max(0.001, raw_bob_per_brl - profit_margin_value)
                bob_client_receives = brl_input * commercial_rate
                profit_bob = bob_gross - bob_client_receives
                profit_brl = (profit_bob / p2p_price) * spot_price
            else: # FIXED_PER_TX
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

        else: # BOB_TO_BRL
            bob_target = amount
            if profit_margin_type == "PERCENT":
                margin_factor = 1.0 - (profit_margin_value / 100.0)
                if margin_factor <= 0.1: margin_factor = 0.95
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
    except Exception as e:
        print(f"Erro em /api/simulate: {e}")
        return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    print("Iniciando CambioBol Server na porta 5000...")
    update_all_quotes()
    app.run(host='0.0.0.0', port=5000, debug=False)
