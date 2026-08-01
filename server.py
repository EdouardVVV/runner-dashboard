from flask import Flask, request, redirect, jsonify, make_response
import requests
import json
import os
import secrets
import logging

logging.basicConfig(level=logging.DEBUG)
logger = logging.getLogger(__name__)

app = Flask(__name__)
app.secret_key = secrets.token_hex(32)

STRAVA_CLIENT_ID = os.environ.get("STRAVA_CLIENT_ID", "264617")
STRAVA_CLIENT_SECRET = os.environ.get("STRAVA_CLIENT_SECRET", "d3f2b7e2f4d8aa88d99f6f74acd586f252068988")
BASE_URL = "https://www.strava.com/oauth/authorize"
TOKEN_URL = "https://www.strava.com/api/v3/oauth/token"
API_URL = "https://www.strava.com/api/v3"

# Détecter si on est en production ou local
IS_PRODUCTION = os.environ.get("RENDER") is not None
REDIRECT_URI = os.environ.get("REDIRECT_URI", "http://localhost:8766/auth/callback")

def set_token_cookie(resp, token):
    resp.set_cookie('strava_token', token, httponly=True, secure=IS_PRODUCTION, samesite='lax', max_age=30*24*3600)
    return resp

@app.route('/')
def index():
    with open('index-ultimate.html', 'r', encoding='utf-8') as f:
        return f.read()

@app.route('/ultimate.js')
def ultimate_js():
    with open('ultimate.js', 'r', encoding='utf-8') as f:
        response = make_response(f.read())
        response.headers['Content-Type'] = 'application/javascript'
        response.headers['Cache-Control'] = 'no-cache, no-store, must-revalidate'
        response.headers['Pragma'] = 'no-cache'
        response.headers['Expires'] = '0'
        return response

@app.route('/manifest.json')
def manifest():
    with open('manifest.json', 'r', encoding='utf-8') as f:
        response = make_response(f.read())
        response.headers['Content-Type'] = 'application/json'
        return response

@app.route('/sw.js')
def service_worker():
    with open('sw.js', 'r', encoding='utf-8') as f:
        response = make_response(f.read())
        response.headers['Content-Type'] = 'application/javascript'
        response.headers['Cache-Control'] = 'no-cache'
        return response

@app.route('/icon-192.png')
def icon_192():
    from flask import send_file
    return send_file('icon-192.png', mimetype='image/png')

@app.route('/icon-512.png')
def icon_512():
    from flask import send_file
    return send_file('icon-512.png', mimetype='image/png')

@app.route('/icon.svg')
def icon_svg():
    with open('icon.svg', 'r', encoding='utf-8') as f:
        response = make_response(f.read())
        response.headers['Content-Type'] = 'image/svg+xml'
        return response

@app.route('/debug')
def debug():
    """Debug page to check auth status"""
    token = request.cookies.get('strava_token')
    if token:
        resp = requests.get(f"{API_URL}/athlete", headers={'Authorization': f'Bearer {token}'})
        if resp.status_code == 200:
            return jsonify({'status': 'authenticated', 'profile': resp.json(), 'token_preview': token[:10] + '...'})
        elif resp.status_code == 401:
            return jsonify({'status': 'expired', 'message': 'Token expired, reconnect', 'resp_status': resp.status_code})
    return jsonify({'status': 'not_authenticated', 'cookies': dict(request.cookies)})

@app.route('/test-token')
def test_token():
    """Manual token test - paste your token here"""
    token = request.args.get('token', '')
    if not token:
        return 'Pass token=?token=YOUR_TOKEN_HERE'
    resp = requests.get(f"{API_URL}/athlete", headers={'Authorization': f'Bearer {token}'})
    if resp.status_code == 200:
        return jsonify({'ok': True, 'profile': resp.json()})
    return jsonify({'ok': False, 'error': resp.text})

@app.route('/auth/strava')
def strava_auth():
    state = secrets.token_urlsafe(16)
    logger.info(f"Starting OAuth, state={state}")
    resp = redirect(
        f"{BASE_URL}?client_id={STRAVA_CLIENT_ID}&redirect_uri={REDIRECT_URI}&response_type=code&scope=read,activity:read_all&state={state}"
    )
    resp.set_cookie('oauth_state', state, httponly=True, secure=IS_PRODUCTION)
    return resp

@app.route('/auth/callback')
def strava_callback():
    code = request.args.get('code')
    state = request.args.get('state')
    logger.info(f"Callback received: code={code[:10] if code else None}..., state={state}")

    saved_state = request.cookies.get('oauth_state')
    if state != saved_state:
        logger.warning(f"State mismatch: got={state}, saved={saved_state}")
        return f"Invalid state parameter. Got: {state}, Expected: {saved_state}", 400

    # Exchange code for token
    payload = {
        'client_id': STRAVA_CLIENT_ID,
        'client_secret': STRAVA_CLIENT_SECRET,
        'code': code,
        'grant_type': 'authorization_code'
    }
    logger.info(f"Exchanging code for token...")
    token_resp = requests.post(TOKEN_URL, data=payload, timeout=10)
    logger.info(f"Token response status: {token_resp.status_code}")

    if token_resp.status_code != 200:
        logger.error(f"Failed to get token: {token_resp.text}")
        return f"Failed to get token from Strava: {token_resp.text}", 400

    token_data = token_resp.json()
    logger.info(f"Got token for user, refresh_token={bool(token_data.get('refresh_token'))}")

    resp = redirect('/?connected=1')
    resp = set_token_cookie(resp, token_data['access_token'])

    if token_data.get('refresh_token'):
        resp.set_cookie('strava_refresh', token_data['refresh_token'], httponly=True, secure=IS_PRODUCTION)

    return resp

@app.route('/api/logout')
def logout():
    resp = redirect('/')
    resp.delete_cookie('strava_token')
    resp.delete_cookie('strava_refresh')
    return resp

@app.route('/api/profile')
def get_profile():
    token = request.cookies.get('strava_token')
    if not token:
        return jsonify({'error': 'Not authenticated', 'cookies': dict(request.cookies)}), 401

    logger.info(f"Fetching profile with token starting {token[:10]}...")
    resp = requests.get(f"{API_URL}/athlete", headers={'Authorization': f'Bearer {token}'}, timeout=10)
    logger.info(f"Profile response: {resp.status_code}")

    if resp.status_code == 401:
        refresh = request.cookies.get('strava_refresh')
        if refresh:
            rt_resp = requests.post(TOKEN_URL, data={
                'client_id': STRAVA_CLIENT_ID,
                'client_secret': STRAVA_CLIENT_SECRET,
                'refresh_token': refresh,
                'grant_type': 'refresh_token'
            })
            if rt_resp.status_code == 200:
                token_data = rt_resp.json()
                logger.info("Token refreshed successfully")
                resp = requests.get(f"{API_URL}/athlete", headers={'Authorization': f'Bearer {token_data["access_token"]}'})
                new_resp = make_response(jsonify(resp.json()))
                new_resp = set_token_cookie(new_resp, token_data['access_token'])
                if token_data.get('refresh_token'):
                    new_resp.set_cookie('strava_refresh', token_data['refresh_token'], httponly=True, secure=IS_PRODUCTION)
                return new_resp
        return jsonify({'error': 'Token expired, please reconnect'}), 401

    return jsonify(resp.json())

@app.route('/api/runs')
def get_runs():
    token = request.cookies.get('strava_token')
    if not token:
        return jsonify({'error': 'Not authenticated'}), 401

    logger.info(f"Fetching runs...")
    all_runs = []
    page = 1
    while True:
        params = {'per_page': 200, 'page': page}
        if all_runs:
            params['before'] = all_runs[-1]['start_date_local']

        resp = requests.get(f"{API_URL}/athlete/activities", params=params,
                          headers={'Authorization': f'Bearer {token}'}, timeout=10)
        logger.info(f"Activities page {page}: status {resp.status_code}, {len(resp.json()) if resp.ok else 'error'}")

        if resp.status_code == 401:
            refresh = request.cookies.get('strava_refresh')
            if refresh:
                rt_resp = requests.post(TOKEN_URL, data={
                    'client_id': STRAVA_CLIENT_ID,
                    'client_secret': STRAVA_CLIENT_SECRET,
                    'refresh_token': refresh,
                    'grant_type': 'refresh_token'
                })
                if rt_resp.status_code == 200:
                    token_data = rt_resp.json()
                    resp = requests.get(f"{API_URL}/athlete/activities", params=params,
                                      headers={'Authorization': f'Bearer {token_data["access_token"]}'})
            else:
                return jsonify({'error': 'Token expired', 'reconnect': True}), 401

        if resp.status_code != 200:
            logger.error(f"API error: {resp.status_code} {resp.text}")
            break

        activities = resp.json()
        if not activities:
            break

        for act in activities:
            if act['sport_type'] == 'Run':
                all_runs.append(act)

        if len(activities) < 200:
            break
        page += 1

    logger.info(f"Found {len(all_runs)} runs total")
    return jsonify(all_runs)

if __name__ == '__main__':
    port = int(os.environ.get("PORT", 8766))
    print(f"Runner Dashboard - http://localhost:{port}")
    print(f"   Debug: http://localhost:{port}/debug")
    print(f"   Production mode: {IS_PRODUCTION}")
    app.run(host='0.0.0.0', port=port, debug=not IS_PRODUCTION)
