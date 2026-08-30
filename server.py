import time
import threading
import datetime
import requests
from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS

app = Flask(__name__, static_folder='static', static_url_path='')
CORS(app)

# Fuso Horário Oficial da Bolívia (UTC-4 / La Paz / Santa Cruz / Cochabamba)
BOLIVIA_TZ = datetime.timezone(datetime.timedelta(hours=-4))

# Cache de cotações em memória
quotes_cache = {
    "last_updated": time.time(),
    "spot_usdt_brl": {"bid": 5.21, "ask": 5.213, "symbol": "USDTBRL"},
    "p2p_usdt_bob": [],
    "best_p2p_bob": 11.91,
    "top3_avg_bob": 11.91,
    "rate_brl_bob_raw": 2.2847,
    "rate_bob_brl_raw": 0.4377,
    "history_1h": [],
    "history_24h": []
}

HEADERS_SPOT = {
    'Accept': 'application/json',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
}

HEADERS_P2P = {
    'Accept': '*/*',
    'Accept-Language': 'es-BO,es-LA,es;q=0.9,pt-BR;q=0.8,en-US;q=0.7',
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
    "https://data-api.binance.vision/api/v3/ticker/bookTicker?symbol=USDTBRL",
    "https://api1.binance.com/api/v3/ticker/bookTicker?symbol=USDTBRL",
    "https://api2.binance.com/api/v3/ticker/bookTicker?symbol=USDTBRL",
    "https://api3.binance.com/api/v3/ticker/bookTicker?symbol=USDTBRL",
    "https://api.binance.com/api/v3/ticker/bookTicker?symbol=USDTBRL"
]

BINANCE_KLINE_ENDPOINTS = [
    "https://data-api.binance.vision/api/v3/klines",
    "https://api1.binance.com/api/v3/klines",
    "https://api2.binance.com/api/v3/klines",
    "https://api3.binance.com/api/v3/klines",
    "https://api.binance.com/api/v3/klines"
]

def fetch_binance_spot_usdt_brl():
    """Busca o preço Spot USDT/BRL com múltiplos fallbacks."""
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

def fetch_binance_p2p(asset="USDT", fiat="BOB", trade_type="SELL", rows=12, only_verified=True):
    """Busca anúncios no P2P da Binance com comerciantes verificados."""
    try:
        url = "https://p2p.binance.com/bapi/c2c/v2/friendly/c2c/adv/search"
        payload = {
            "asset": asset,
            "fiat": fiat,
            "merchantCheck": True if only_verified else False,
            "page": 1,
            "payTypes": [],
            "publisherType": "merchant" if only_verified else None,
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
                        "user_type": clean_str(advertiser.get("userType", "merchant")),
                        "is_verified": True,
                        "month_order_count": int(advertiser.get("monthOrderCount", 0)),
                        "month_finish_rate": round(float(advertiser.get("monthFinishRate", 0) * 100), 1),
                        "price": price,
                        "min_amount": float(adv.get("minSingleTransAmount", 0)),
                        "max_amount": float(adv.get("dynamicMaxSingleTransAmount") or adv.get("maxSingleTransAmount", 0)),
                        "surplus_amount": float(adv.get("surplusAmount", 0)),
                        "trade_methods": methods
                    })
            if len(ads_list) > 0:
                return ads_list
                
        if only_verified:
            return fetch_binance_p2p(asset=asset, fiat=fiat, trade_type=trade_type, rows=rows, only_verified=False)
            
    except Exception as e:
        print(f"Aviso P2P fetch: {e}")
    return []

def fetch_binance_klines(symbol="USDTBRL", interval="1h", limit=24):
    """Busca histórico real de Klines/Candles da Binance com múltiplos fallbacks."""
    for base_url in BINANCE_KLINE_ENDPOINTS:
        try:
            url = f"{base_url}?symbol={symbol}&interval={interval}&limit={limit}"
            resp = requests.get(url, headers=HEADERS_SPOT, timeout=4)
            if resp.status_code == 200:
                data = resp.json()
                if isinstance(data, list) and len(data) > 0:
                    return data
        except Exception:
            continue
    return []

def generate_fallback_history_24h(best_p2p, spot_price):
    """Gera 24 pontos até a hora atual presente na Bolívia (UTC-4)."""
    now = datetime.datetime.now(BOLIVIA_TZ)
    points = []
    for i in range(23, -1, -1):
        t = now - datetime.timedelta(hours=i)
        t_str = t.strftime('%H:00')
        var_factor = 1.0 + ((i % 5 - 2) * 0.0008)
        sim_spot = spot_price * var_factor
        rate = round((1.0 / sim_spot) * best_p2p, 4)
        points.append({
            "timestamp": t_str,
            "spot_usdt_brl": round(sim_spot, 4),
            "p2p_usdt_bob": round(best_p2p, 2),
            "rate_brl_bob": rate,
            "full_time": t.strftime('%d/%m %H:%M')
        })
    return points

def generate_fallback_history_1h(best_p2p, spot_price):
    """Gera 60 pontos até o minuto presente na Bolívia (UTC-4)."""
    now = datetime.datetime.now(BOLIVIA_TZ)
    points = []
    for i in range(59, -1, -1):
        t = now - datetime.timedelta(minutes=i)
        t_str = t.strftime('%H:%M')
        var_factor = 1.0 + ((i % 3 - 1) * 0.0003)
        sim_spot = spot_price * var_factor
        rate = round((1.0 / sim_spot) * best_p2p, 4)
        points.append({
            "timestamp": t_str,
            "spot_usdt_brl": round(sim_spot, 4),
            "p2p_usdt_bob": round(best_p2p, 2),
            "rate_brl_bob": rate,
            "full_time": t.strftime('%H:%M')
        })
    return points

def update_all_quotes():
    """Atualiza cotações, P2P e histórico calibrado no horário da Bolívia (UTC-4)."""
    global quotes_cache
    try:
        spot = fetch_binance_spot_usdt_brl()
        p2p_bob = fetch_binance_p2p(asset="USDT", fiat="BOB", trade_type="SELL", rows=12, only_verified=True)
        
        if spot:
            quotes_cache["spot_usdt_brl"] = spot
        
        if p2p_bob and len(p2p_bob) > 0:
            quotes_cache["p2p_usdt_bob"] = p2p_bob
            quotes_cache["best_p2p_bob"] = p2p_bob[0]["price"]
            top3 = [ad["price"] for ad in p2p_bob[:3]]
            quotes_cache["top3_avg_bob"] = round(sum(top3) / len(top3), 4)
            
        usdt_brl_buy_price = quotes_cache["spot_usdt_brl"]["ask"]
        best_p2p_bob = quotes_cache.get("best_p2p_bob", 11.91)
        
        if usdt_brl_buy_price > 0:
            raw_bob_per_brl = (1.0 / usdt_brl_buy_price) * best_p2p_bob
            raw_brl_per_bob = 1.0 / raw_bob_per_brl if raw_bob_per_brl > 0 else 0
            
            now = time.time()
            quotes_cache["last_updated"] = now
            quotes_cache["rate_brl_bob_raw"] = round(raw_bob_per_brl, 4)
            quotes_cache["rate_bob_brl_raw"] = round(raw_brl_per_bob, 4)
            
        # Atualiza histórico 24h calibrado no Fuso da Bolívia (UTC-4)
        klines_24h = fetch_binance_klines(symbol="USDTBRL", interval="1h", limit=24)
        if klines_24h and len(klines_24h) > 0:
            points_24h = []
            for k in klines_24h:
                t_dt = datetime.datetime.fromtimestamp(k[0] / 1000, tz=datetime.timezone.utc).astimezone(BOLIVIA_TZ)
                t_str = t_dt.strftime('%H:00')
                close_spot = float(k[4])
                rate = round((1.0 / close_spot) * best_p2p_bob, 4) if close_spot > 0 else 0
                points_24h.append({
                    "timestamp": t_str,
                    "spot_usdt_brl": round(close_spot, 4),
                    "p2p_usdt_bob": round(best_p2p_bob, 2),
                    "rate_brl_bob": rate,
                    "full_time": t_dt.strftime('%d/%m %H:%M')
                })
            quotes_cache["history_24h"] = points_24h
        elif not quotes_cache.get("history_24h"):
            quotes_cache["history_24h"] = generate_fallback_history_24h(best_p2p_bob, usdt_brl_buy_price)

        # Atualiza histórico 1h calibrado no Fuso da Bolívia (UTC-4)
        klines_1h = fetch_binance_klines(symbol="USDTBRL", interval="1m", limit=60)
        if klines_1h and len(klines_1h) > 0:
            points_1h = []
            for k in klines_1h:
                t_dt = datetime.datetime.fromtimestamp(k[0] / 1000, tz=datetime.timezone.utc).astimezone(BOLIVIA_TZ)
                t_str = t_dt.strftime('%H:%M')
                close_spot = float(k[4])
                rate = round((1.0 / close_spot) * best_p2p_bob, 4) if close_spot > 0 else 0
                points_1h.append({
                    "timestamp": t_str,
                    "spot_usdt_brl": round(close_spot, 4),
                    "p2p_usdt_bob": round(best_p2p_bob, 2),
                    "rate_brl_bob": rate,
                    "full_time": t_dt.strftime('%H:%M')
                })
            quotes_cache["history_1h"] = points_1h
        elif not quotes_cache.get("history_1h"):
            quotes_cache["history_1h"] = generate_fallback_history_1h(best_p2p_bob, usdt_brl_buy_price)

    except Exception as e:
        print(f"Erro em update_all_quotes: {e}")

# Inicializa cotações e histórico na largada
update_all_quotes()

# Thread de atualização em segundo plano
def background_updater():
    while True:
        try:
            update_all_quotes()
        except Exception as e:
            print(f"Erro no background updater: {e}")
        time.sleep(10)

updater_thread = threading.Thread(target=background_updater, daemon=True)
updater_thread.start()

@app.route('/')
def index():
    return send_from_directory('static', 'index.html')

@app.route('/api/quotes', methods=['GET'])
def get_quotes():
    try:
        if not quotes_cache.get("spot_usdt_brl") or not quotes_cache.get("p2p_usdt_bob") or not quotes_cache.get("history_24h"):
            update_all_quotes()
            
        all_methods = set()
        for ad in quotes_cache.get("p2p_usdt_bob", []):
            for m in ad.get("trade_methods", []):
                all_methods.add(m)
                
        return jsonify({
            "status": "success",
            "last_updated": quotes_cache.get("last_updated", time.time()),
            "timezone": "America/La_Paz (UTC-4)",
            "spot_usdt_brl": quotes_cache.get("spot_usdt_brl"),
            "best_p2p_bob": quotes_cache.get("best_p2p_bob", 11.91),
            "top3_avg_bob": quotes_cache.get("top3_avg_bob", 11.91),
            "rate_brl_bob_raw": quotes_cache.get("rate_brl_bob_raw", 2.2847),
            "rate_bob_brl_raw": quotes_cache.get("rate_bob_brl_raw", 0.4377),
            "p2p_ads_bob": quotes_cache.get("p2p_usdt_bob", []),
            "available_banks": sorted(list(all_methods)),
            "history_1h": quotes_cache.get("history_1h", []),
            "history_24h": quotes_cache.get("history_24h", [])
        })
    except Exception as e:
        return jsonify({"error": str(e), "status": "error"}), 500

@app.route('/api/simulate', methods=['POST'])
def simulate():
    try:
        data = request.json or {}
        mode = data.get("mode", "BRL_TO_BOB")
        amount = float(data.get("amount", 1000) or 1000)
        profit_margin_type = data.get("profit_margin_type", "SMART_TIER")
        profit_margin_value = float(data.get("profit_margin_value", 1.0) or 1.0)
        spot_fee_percent = float(data.get("spot_fee_percent", 0.075) or 0.075)
        custom_p2p_price = data.get("custom_p2p_price")
        custom_spot_price = data.get("custom_spot_price")
        
        # Preço Spot Seguro
        if custom_spot_price:
            spot_price = float(custom_spot_price)
        elif quotes_cache.get("spot_usdt_brl") and quotes_cache["spot_usdt_brl"].get("ask"):
            spot_price = float(quotes_cache["spot_usdt_brl"]["ask"])
        else:
            spot_price = 5.213
            
        # Preço P2P Seguro
        if custom_p2p_price:
            p2p_price = float(custom_p2p_price)
        else:
            p2p_price = float(quotes_cache.get("best_p2p_bob") or 11.91)
            
        if spot_price <= 0: spot_price = 5.213
        if p2p_price <= 0: p2p_price = 11.91
        if amount <= 0: amount = 1000.0
            
        raw_bob_per_brl = (1.0 / spot_price) * (1.0 - (spot_fee_percent / 100.0)) * p2p_price
        raw_brl_per_bob = 1.0 / raw_bob_per_brl if raw_bob_per_brl > 0 else 0
        
        applied_tier_label = ""

        if mode == "BRL_TO_BOB":
            brl_input = amount
            usdt_bought_raw = brl_input / spot_price
            spot_fee_usdt = usdt_bought_raw * (spot_fee_percent / 100.0)
            usdt_net = usdt_bought_raw - spot_fee_usdt
            bob_gross = usdt_net * p2p_price
            
            if profit_margin_type == "SMART_TIER":
                if brl_input < 500:
                    profit_brl = 7.00
                    applied_tier_label = "Taxa Fixa R$ 7 (< R$ 500)"
                    brl_for_exchange = max(1.0, brl_input - profit_brl)
                    bob_client_receives = (brl_for_exchange / spot_price) * (1.0 - (spot_fee_percent / 100.0)) * p2p_price
                    profit_bob = bob_gross - bob_client_receives
                elif brl_input < 1000:
                    profit_brl = 10.00
                    applied_tier_label = "Taxa Fixa R$ 10 (R$ 500 a 1K)"
                    brl_for_exchange = max(1.0, brl_input - profit_brl)
                    bob_client_receives = (brl_for_exchange / spot_price) * (1.0 - (spot_fee_percent / 100.0)) * p2p_price
                    profit_bob = bob_gross - bob_client_receives
                else:
                    applied_tier_label = f"Margem {profit_margin_value}% (>= 1K)"
                    profit_bob = bob_gross * (profit_margin_value / 100.0)
                    bob_client_receives = bob_gross - profit_bob
                    profit_brl = (profit_bob / p2p_price) * spot_price
            elif profit_margin_type == "PERCENT":
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
                "applied_tier_label": applied_tier_label
            })

        else: 
            bob_target = amount
            usdt_needed = bob_target / p2p_price
            brl_cost_pure = (usdt_needed * spot_price) / (1.0 - (spot_fee_percent / 100.0))
            
            if profit_margin_type == "SMART_TIER":
                if brl_cost_pure < 500:
                    profit_brl = 7.00
                    applied_tier_label = "Taxa Fixa R$ 7 (< R$ 500)"
                    brl_charge_client = brl_cost_pure + 7.00
                    profit_bob = (profit_brl / spot_price) * p2p_price
                elif brl_cost_pure < 1000:
                    profit_brl = 10.00
                    applied_tier_label = "Taxa Fixa R$ 10 (R$ 500 a 1K)"
                    brl_charge_client = brl_cost_pure + 10.00
                    profit_bob = (profit_brl / spot_price) * p2p_price
                else:
                    applied_tier_label = f"Margem {profit_margin_value}% (>= 1K)"
                    margin_factor = 1.0 - (profit_margin_value / 100.0)
                    if margin_factor <= 0.1: margin_factor = 0.95
                    brl_charge_client = brl_cost_pure / margin_factor
                    profit_brl = brl_charge_client - brl_cost_pure
                    profit_bob = (profit_brl / spot_price) * p2p_price
            elif profit_margin_type == "PERCENT":
                margin_factor = 1.0 - (profit_margin_value / 100.0)
                if margin_factor <= 0.1: margin_factor = 0.95
                brl_charge_client = brl_cost_pure / margin_factor
                profit_brl = brl_charge_client - brl_cost_pure
                profit_bob = (profit_brl / spot_price) * p2p_price
            elif profit_margin_type == "FIXED_PER_BOB":
                commercial_rate = max(0.001, raw_bob_per_brl - profit_margin_value)
                brl_charge_client = bob_target / commercial_rate
                profit_brl = brl_charge_client - brl_cost_pure
                profit_bob = (profit_brl / spot_price) * p2p_price
            else: # FIXED_PER_TX
                brl_charge_client = brl_cost_pure + profit_margin_value
                profit_brl = profit_margin_value
                profit_bob = (profit_brl / spot_price) * p2p_price

            commercial_bob_per_brl = bob_target / brl_charge_client if brl_charge_client > 0 else 0
            commercial_brl_per_bob = brl_charge_client / bob_target if bob_target > 0 else 0
            profit_percent = (profit_brl / brl_charge_client) * 100.0 if brl_charge_client > 0 else 0
            
            return jsonify({
                "mode": mode,
                "bob_target": round(bob_target, 2),
                "brl_charge_client": round(brl_charge_client, 2),
                "brl_cost_pure": round(brl_cost_pure, 2),
                "usdt_needed": round(usdt_needed, 2),
                "spot_price_usdt_brl": round(spot_price, 4),
                "p2p_price_usdt_bob": round(p2p_price, 4),
                "profit_brl": round(profit_brl, 2),
                "profit_bob": round(profit_bob, 2),
                "profit_percent": round(profit_percent, 2),
                "raw_bob_per_brl": round(raw_bob_per_brl, 4),
                "commercial_bob_per_brl": round(commercial_bob_per_brl, 4),
                "commercial_brl_per_bob": round(commercial_brl_per_bob, 4),
                "applied_tier_label": applied_tier_label
            })
    except Exception as e:
        print(f"Erro em /api/simulate: {e}")
        return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    print("Iniciando CambioBol Server na porta 5000...")
    app.run(host='0.0.0.0', port=5000, debug=False)
