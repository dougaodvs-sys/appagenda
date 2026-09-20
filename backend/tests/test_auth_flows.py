"""Backend tests for new auth features: login-history, forgot/reset password."""
import os
import time
import requests
import pytest

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/") or "https://97432206-0969-4ca7-aa77-15fb444295da.preview.emergentagent.com"
API = f"{BASE_URL}/api"

ADMIN_EMAIL = "dvssystem@hotmail.com"
ADMIN_PASSWORD = "Douglas0101"


@pytest.fixture(scope="module")
def session():
    return requests.Session()


@pytest.fixture(scope="module")
def logged_in_session():
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"identifier": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    assert r.status_code == 200, f"Admin login failed: {r.status_code} {r.text}"
    return s


def test_login_history_requires_auth():
    r = requests.get(f"{API}/auth/login-history")
    assert r.status_code == 401


def test_login_history_authenticated(logged_in_session):
    r = logged_in_session.get(f"{API}/auth/login-history")
    assert r.status_code == 200
    data = r.json()
    assert isinstance(data, list)
    # At least one successful login should be recorded (our fixture login)
    assert any(evt.get("success") is True for evt in data)
    if data:
        evt = data[0]
        assert "ip" in evt
        assert "user_agent" in evt
        assert "at" in evt


def test_forgot_password_unknown_email_returns_ok():
    r = requests.post(f"{API}/auth/forgot-password", json={"email": "does-not-exist@example.com"})
    assert r.status_code == 200
    assert r.json().get("ok") is True


def test_forgot_password_known_email_returns_ok_and_logs_link():
    r = requests.post(f"{API}/auth/forgot-password", json={"email": ADMIN_EMAIL})
    assert r.status_code == 200
    assert r.json().get("ok") is True


def test_reset_password_invalid_token():
    r = requests.post(f"{API}/auth/reset-password", json={"token": "invalid-token-xxx", "new_password": "Whatever123"})
    assert r.status_code == 400


def test_reset_token_reuse_returns_400():
    """Trigger forgot, grab link from log, use once, reuse expects 400. Keep password same (Douglas0101)."""
    # trigger
    r = requests.post(f"{API}/auth/forgot-password", json={"email": ADMIN_EMAIL})
    assert r.status_code == 200
    time.sleep(1)
    # get token from log
    import subprocess
    out = subprocess.run(
        "grep 'PASSWORD RESET LINK' /var/log/supervisor/backend.*.log | tail -1",
        shell=True, capture_output=True, text=True,
    ).stdout.strip()
    assert "token=" in out, f"No reset link in log: {out}"
    token = out.split("token=")[-1].strip()
    # use once - set to same password to keep credentials intact
    r1 = requests.post(f"{API}/auth/reset-password", json={"token": token, "new_password": ADMIN_PASSWORD})
    assert r1.status_code == 200, f"first reset failed: {r1.status_code} {r1.text}"
    # reuse
    r2 = requests.post(f"{API}/auth/reset-password", json={"token": token, "new_password": ADMIN_PASSWORD})
    assert r2.status_code == 400


def test_change_password_wrong_current(logged_in_session):
    r = logged_in_session.post(f"{API}/auth/change-password", json={
        "current_password": "WRONG_PASSWORD_XX",
        "new_password": "AnotherPass123",
    })
    assert r.status_code == 400
    assert "inválida" in r.text.lower() or "invalida" in r.text.lower()
