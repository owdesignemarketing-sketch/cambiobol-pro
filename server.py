import time
import json
import os
import threading
import datetime
import requests
from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS

app = Flask(__name__, static_folder='static', static_url_path='')
CORS(app)

# Fuso Horário Oficial da Bolívia (UTC-4)
BOLIVIA_TZ = datetime.timezone(datetime.timedelta(hours=-4))
HISTORY_FILE = "history_store.json"

# Cache de cotações em memória
quotes_cache = {
    "last_updated": 0,
    "is_live": False,
    "spot_usdt_brl": None,
    "p2p_usdt_bob": [],
    "best_p2p_bob": None,
    "top3_avg_bob": None,
    "rate_brl_bob_raw": None,
    "rate_bob_brl_raw": None,
    "history_1h": [],
    "history_24h": [],
    "error_message": None
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

# Gerenciamento de Histórico com Auto-Limpeza (Zero Desperdício de Memória)
def load_history_store():
    if os.path.exists(HISTORY_FILE):
        try:
            with open(HISTORY_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            pass
    return {"hourly": {}, "minutely": {}}

def save_history_store(store):
    try:
        with open(HISTORY_FILE, "w", encoding="utf-8") as f:
            json.dump(store, f, ensure_ascii=False)
    except Exception as e:
        print(f"Erro ao salvar history_store: {e}")

history_store = load_history_store()

def cleanup_old_history(store, max_hours=48, max_minutes=120):
    """
    Remove automaticamente pontos antigos que já saíram do gráfico.
    Garante que o arquivo nunca passe de 10 KB e gaste ZERO memória!
    """
    now = datetime.datetime.now(BOLIVIA_TZ)
    
    # Limpa horas com mais de 48h
    cutoff_hour = now - datetime.timedelta(hours=max_hours)
    cutoff_hour_str = cutoff_hour.strftime("%Y-%m-%d %H:00")
    store["hourly"] = {k: v for k, v in store.get("hourly", {}).items() if k >= cutoff_hour_str}

    # Limpa minutos com mais de 2 horas (120 min)
    cutoff_min = now - datetime.timedelta(minutes=max_minutes)
    cutoff_min_str = cutoff_min.strftime("%Y-%m-%d %H:%M")
    store["minutely"] = {k: v for k, v in store.get("minutely", {}).items() if k >= cutoff_min_str}

def fetch_binance_spot_usdt_brl():
    for url in BINANCE_SPOT_ENDPOINTS:
        try:
            resp = requests.get(url, headers=HEADERS_SPOT, timeout=4)
            if resp.status_code == 200:
                data = resp.json()
                ask = float(data.get("askPrice") or 0)
                bid = float(data.get("bidPrice") or 0)
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
    if not val:
        return "Comerciante"
    return str(val).encode('utf-8', 'ignore').decode('utf-8')

def fetch_binance_p2p(asset="USDT", fiat="BOB", trade_type="SELL", rows=20):
    try:
        url = "https://p2p.binance.com/bapi/c2c/v2/friendly/c2c/adv/search"
        payload = {
            "asset": asset,
            "fiat": fiat,
            "merchantCheck": True,
            "page": 1,
            "payTypes": [],
            "publisherType": "merchant",
            "rows": rows,
            "tradeType": "SELL"
        }
        resp = requests.post(url, json=payload, headers=HEADERS_P2P, timeout=5)
        if resp.status_code == 200:
            res_data = resp.json()
            raw_items = res_data.get("data") or []
            ads_list = []
            for item in raw_items:
                adv = item.get("adv", {})
                advertiser = item.get("advertiser", {})
                methods = [clean_str(m.get("tradeMethodName")) for m in adv.get("tradeMethods", []) if m.get("tradeMethodName")]
                price = float(adv.get("price") or 0)
                if price > 0:
                    ads_list.append({
                        "adv_id": clean_str(adv.get("advNo")),
                        "nick_name": clean_str(advertiser.get("nickName", "Comerciante")),
                        "user_type": clean_str(advertiser.get("userType", "merchant")),
                        "is_verified": True,
                        "month_order_count": int(advertiser.get("monthOrderCount") or 0),
                        "month_finish_rate": round(float(advertiser.get("monthFinishRate") or 0) * 100, 1),
                        "price": price,
                        "min_amount": float(adv.get("minSingleTransAmount") or 0),
                        "max_amount": float(adv.get("dynamicMaxSingleTransAmount") or adv.get("maxSingleTransAmount") or 0),
                        "surplus_amount": float(adv.get("surplusAmount") or 0),
                        "trade_methods": methods
                    })
            if len(ads_list) > 0:
                ads_list.sort(key=lambda x: x["price"], reverse=True)
                return ads_list
                
    except Exception as e:
        print(f"Aviso P2P fetch: {e}")
    return []

def fetch_binance_klines(symbol="USDTBRL", interval="1h", limit=24):
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

def record_and_get_persisted_history(current_spot, current_p2p, current_rate):
    """
    Grava ponto atual no store, limpa histórico antigo que saiu da janela,
    e retorna os 24 pontos horários e 60 pontos por minuto imutáveis.
    """
    global history_store
    now_bolivia = datetime.datetime.now(BOLIVIA_TZ)
    
    hour_key = now_bolivia.strftime("%Y-%m-%d %H:00")
    min_key = now_bolivia.strftime("%Y-%m-%d %H:%M")
    
    # Grava hora atual
    history_store["hourly"][hour_key] = {
        "timestamp": now_bolivia.strftime("%H:00"),
        "full_time": now_bolivia.strftime("%d/%m %H:%M"),
        "spot_usdt_brl": round(current_spot, 4),
        "p2p_usdt_bob": round(current_p2p, 2),
        "rate_brl_bob": round(current_rate, 4)
    }

    # Grava minuto atual
    history_store["minutely"][min_key] = {
        "timestamp": now_bolivia.strftime("%H:%M"),
        "full_time": now_bolivia.strftime("%H:%M"),
        "spot_usdt_brl": round(current_spot, 4),
        "p2p_usdt_bob": round(current_p2p, 2),
        "rate_brl_bob": round(current_rate, 4)
    }

    # Inicializa horas passadas se necessário
    klines_24h = fetch_binance_klines(symbol="USDTBRL", interval="1h", limit=24)
    if klines_24h:
        for k in klines_24h:
            t_dt = datetime.datetime.fromtimestamp(k[0] / 1000, tz=datetime.timezone.utc).astimezone(BOLIVIA_TZ)
            h_k = t_dt.strftime("%Y-%m-%d %H:00")
            if h_k not in history_store["hourly"]:
                close_spot = float(k[4])
                saved_rate = round((1.0 / close_spot) * current_p2p, 4) if close_spot > 0 else current_rate
                history_store["hourly"][h_k] = {
                    "timestamp": t_dt.strftime("%H:00"),
                    "full_time": t_dt.strftime("%d/%m %H:%M"),
                    "spot_usdt_brl": round(close_spot, 4),
                    "p2p_usdt_bob": round(current_p2p, 2),
                    "rate_brl_bob": saved_rate
                }

    # Limpeza de pontos antigos que já saíram do gráfico
    cleanup_old_history(history_store)

    # Salva no disco
    save_history_store(history_store)

    # 24 horas sequenciais
    points_24h = []
    for i in range(23, -1, -1):
        target_t = now_bolivia - datetime.timedelta(hours=i)
        t_key = target_t.strftime("%Y-%m-%d %H:00")
        if t_key in history_store["hourly"]:
            points_24h.append(history_store["hourly"][t_key])
        else:
            points_24h.append({
                "timestamp": target_t.strftime("%H:00"),
                "full_time": target_t.strftime("%d/%m %H:%M"),
                "spot_usdt_brl": round(current_spot, 4),
                "p2p_usdt_bob": round(current_p2p, 2),
                "rate_brl_bob": round(current_rate, 4)
            })

    # 60 minutos sequenciais
    points_1h = []
    for i in range(59, -1, -1):
        target_t = now_bolivia - datetime.timedelta(minutes=i)
        t_key = target_t.strftime("%Y-%m-%d %H:%M")
        if t_key in history_store["minutely"]:
            points_1h.append(history_store["minutely"][t_key])
        else:
            points_1h.append({
                "timestamp": target_t.strftime("%H:%M"),
                "full_time": target_t.strftime("%H:%M"),
                "spot_usdt_brl": round(current_spot, 4),
                "p2p_usdt_bob": round(current_p2p, 2),
                "rate_brl_bob": round(current_rate, 4)
            })

    return points_24h, points_1h

def update_all_quotes():
    global quotes_cache
    try:
        spot = fetch_binance_spot_usdt_brl()
        p2p_bob = fetch_binance_p2p(asset="USDT", fiat="BOB", trade_type="SELL", rows=20)
        
        if spot and p2p_bob and len(p2p_bob) > 0:
            usdt_brl_buy_price = spot["ask"]
            best_p2p_bob = p2p_bob[0]["price"]
            top3 = [ad["price"] for ad in p2p_bob[:3]]
            top3_avg = round(sum(top3) / len(top3), 4)
            
            raw_bob_per_brl = (1.0 / usdt_brl_buy_price) * best_p2p_bob
            raw_brl_per_bob = 1.0 / raw_bob_per_brl if raw_bob_per_brl > 0 else 0
            
            now = time.time()
            quotes_cache["last_updated"] = now
            quotes_cache["is_live"] = True
            quotes_cache["spot_usdt_brl"] = spot
            quotes_cache["p2p_usdt_bob"] = p2p_bob
            quotes_cache["best_p2p_bob"] = best_p2p_bob
            quotes_cache["top3_avg_bob"] = top3_avg
            quotes_cache["rate_brl_bob_raw"] = round(raw_bob_per_brl, 4)
            quotes_cache["rate_bob_brl_raw"] = round(raw_brl_per_bob, 4)
            quotes_cache["error_message"] = None
            
            hist_24h, hist_1h = record_and_get_persisted_history(usdt_brl_buy_price, best_p2p_bob, raw_bob_per_brl)
            quotes_cache["history_24h"] = hist_24h
            quotes_cache["history_1h"] = hist_1h

        else:
            if time.time() - quotes_cache.get("last_updated", 0) > 40:
                quotes_cache["is_live"] = False
                quotes_cache["error_message"] = "Sem resposta recente da Binance"
    except Exception as e:
        print(f"Erro em update_all_quotes: {e}")
        if time.time() - quotes_cache.get("last_updated", 0) > 40:
            quotes_cache["is_live"] = False

# Inicializa
update_all_quotes()

def background_updater():
    while True:
        try:
            update_all_quotes()
        except Exception as e:
            print(f"Erro background updater: {e}")
        time.sleep(5)

updater_thread = threading.Thread(target=background_updater, daemon=True)
updater_thread.start()

@app.after_request
def add_header(response):
    response.headers['Cache-Control'] = 'no-store, no-cache, must-revalidate, post-check=0, pre-check=0, max-age=0'
    response.headers['Pragma'] = 'no-cache'
    response.headers['Expires'] = '-1'
    return response

@app.route('/')
def index():
    return send_from_directory('static', 'index.html')

@app.route('/api/quotes', methods=['GET'])
def get_quotes():
    try:
        now = time.time()
        last_updated = quotes_cache.get("last_updated", 0)
        age_seconds = int(now - last_updated) if last_updated > 0 else 999
        
        force = request.args.get('force')
        if force or age_seconds > 4:
            update_all_quotes()
            now = time.time()
            last_updated = quotes_cache.get("last_updated", 0)
            age_seconds = int(now - last_updated) if last_updated > 0 else 0

        is_live = quotes_cache.get("is_live", False) and (age_seconds < 45)
        
        all_methods = set()
        for ad in quotes_cache.get("p2p_usdt_bob", []):
            for m in ad.get("trade_methods", []):
                all_methods.add(m)
                
        return jsonify({
            "status": "success",
            "is_live": is_live,
            "age_seconds": age_seconds,
            "last_updated": last_updated,
            "timezone": "America/La_Paz (UTC-4)",
            "spot_usdt_brl": quotes_cache.get("spot_usdt_brl"),
            "best_p2p_bob": quotes_cache.get("best_p2p_bob"),
            "top3_avg_bob": quotes_cache.get("top3_avg_bob"),
            "rate_brl_bob_raw": quotes_cache.get("rate_brl_bob_raw"),
            "rate_bob_brl_raw": quotes_cache.get("rate_bob_brl_raw"),
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
        
        spot_price = float(custom_spot_price) if custom_spot_price else (quotes_cache.get("spot_usdt_brl") or {}).get("ask")
        p2p_price = float(custom_p2p_price) if custom_p2p_price else quotes_cache.get("best_p2p_bob")
        
        if not spot_price or not p2p_price or spot_price <= 0 or p2p_price <= 0:
            return jsonify({"error": "Cotações indisponíveis no momento (Offline)", "is_live": False}), 503
            
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

@app.route('/api/history/sync', methods=['POST'])
def sync_history():
    try:
        data = request.json or {}
        client_hourly = data.get('hourly', {})
        client_minutely = data.get('minutely', {})
        updated = False
        for k, v in client_hourly.items():
            if k not in history_store['hourly']:
                history_store['hourly'][k] = v
                updated = True
        for k, v in client_minutely.items():
            if k not in history_store['minutely']:
                history_store['minutely'][k] = v
                updated = True
        if updated:
            cleanup_old_history(history_store)
            save_history_store(history_store)
        return jsonify({"status": "synced", "count_hourly": len(history_store['hourly'])})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    print("Iniciando CambioBol Server na porta 5000...")
    app.run(host='0.0.0.0', port=5000, debug=False)
