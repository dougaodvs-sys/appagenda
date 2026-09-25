"""Tests for Studio Settings changes (default_signal_percent optional, referral_enabled toggle, removed fields)."""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    # fallback: read from frontend .env
    try:
        with open("/app/frontend/.env") as f:
            for ln in f:
                if ln.startswith("REACT_APP_BACKEND_URL"):
                    BASE_URL = ln.split("=", 1)[1].strip().rstrip("/")
                    break
    except Exception:
        pass

MANAGER_EMAIL = "gerente@meustudio.com"
MANAGER_PASS = "Studio@2026"
CLIENT_PHONE = "11988887777"
CLIENT_PASS = "Cliente@2026"
STUDIO_SLUG = "meu-studio"


def _login_manager():
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login", json={"identifier": MANAGER_EMAIL, "password": MANAGER_PASS})
    assert r.status_code == 200, f"manager login failed: {r.status_code} {r.text}"
    tok = s.cookies.get("access_token") or r.json().get("access_token")
    assert tok
    s.headers.update({"Authorization": f"Bearer {tok}"})
    return s


@pytest.fixture(scope="module")
def mgr():
    return _login_manager()


@pytest.fixture(scope="module", autouse=True)
def _cleanup(mgr):
    """Ensure defaults restored at end."""
    yield
    r = mgr.get(f"{BASE_URL}/api/settings")
    cur = r.json()
    cur["default_signal_percent"] = 30
    cur["referral_enabled"] = True
    cur["referral_discount_percent"] = 10
    cur.pop("instagram", None)
    cur.pop("primary_color", None)
    mgr.put(f"{BASE_URL}/api/settings", json=cur)


def test_get_settings_no_instagram_or_primary_color(mgr):
    r = mgr.get(f"{BASE_URL}/api/settings")
    assert r.status_code == 200
    data = r.json()
    assert "instagram" not in data
    assert "primary_color" not in data
    assert "default_signal_percent" in data
    assert "referral_enabled" in data


def test_put_settings_invalid_signal_150_returns_422(mgr):
    cur = mgr.get(f"{BASE_URL}/api/settings").json()
    payload = {**cur, "default_signal_percent": 150}
    r = mgr.put(f"{BASE_URL}/api/settings", json=payload)
    assert r.status_code == 422, f"expected 422 got {r.status_code} {r.text}"


def test_put_settings_zero_signal_ok_and_appointments_reflect(mgr):
    cur = mgr.get(f"{BASE_URL}/api/settings").json()
    payload = {**cur, "default_signal_percent": 0}
    r = mgr.put(f"{BASE_URL}/api/settings", json=payload)
    assert r.status_code == 200, r.text
    got = r.json()
    assert got["default_signal_percent"] == 0

    # GET appointments summary reflect signal 0
    r2 = mgr.get(f"{BASE_URL}/api/appointments")
    assert r2.status_code == 200
    appts = r2.json()
    if appts:
        for a in appts[:5]:
            # Only assert on fields that exist
            if "signal_percent" in a:
                assert a["signal_percent"] == 0
            if "signal_value" in a:
                assert a["signal_value"] == 0


def test_public_config_includes_referral_enabled():
    r = requests.get(f"{BASE_URL}/api/public/studios/{STUDIO_SLUG}/config")
    assert r.status_code == 200, r.text
    data = r.json()
    assert "referral_enabled" in data


def test_register_with_referral_code_while_disabled_returns_400(mgr):
    # Disable referral first
    cur = mgr.get(f"{BASE_URL}/api/settings").json()
    payload = {**cur, "referral_enabled": False}
    r = mgr.put(f"{BASE_URL}/api/settings", json=payload)
    assert r.status_code == 200

    # Attempt public register with referral code
    reg = {
        "name": "TEST Referral Blocked",
        "phone": "11955550001",
        "password": "Aa@12345",
        "referral_code": "ABC123",
        "studio_slug": STUDIO_SLUG,
    }
    r = requests.post(f"{BASE_URL}/api/auth/register", json=reg)
    assert r.status_code == 400, f"expected 400 got {r.status_code} {r.text}"
    assert "indica" in r.text.lower() or "desativado" in r.text.lower()

    # Public config reflect false
    pc = requests.get(f"{BASE_URL}/api/public/studios/{STUDIO_SLUG}/config").json()
    assert pc.get("referral_enabled") is False


def test_restore_defaults(mgr):
    cur = mgr.get(f"{BASE_URL}/api/settings").json()
    cur["default_signal_percent"] = 30
    cur["referral_enabled"] = True
    cur["referral_discount_percent"] = 10
    r = mgr.put(f"{BASE_URL}/api/settings", json=cur)
    assert r.status_code == 200
    got = mgr.get(f"{BASE_URL}/api/settings").json()
    assert got["default_signal_percent"] == 30
    assert got["referral_enabled"] is True
    assert got["referral_discount_percent"] == 10
    pc = requests.get(f"{BASE_URL}/api/public/studios/{STUDIO_SLUG}/config").json()
    assert pc.get("referral_enabled") is True
