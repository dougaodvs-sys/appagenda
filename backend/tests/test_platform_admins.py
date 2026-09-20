"""Tests for /api/platform/admins (super_admin) and /api/auth/forgot-password email flow."""
import os
import time
import requests
import pytest

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/") or None
if not BASE_URL:
    # fallback: read frontend/.env
    with open("/app/frontend/.env") as f:
        for line in f:
            if line.startswith("REACT_APP_BACKEND_URL="):
                BASE_URL = line.split("=", 1)[1].strip().rstrip("/")

API = f"{BASE_URL}/api"
SUPER = {"email": "dvssystem@hotmail.com", "password": "Douglas0101"}
MANAGER = {"email": "gerente@meustudio.com", "password": "Studio@2026"}


def _login(creds):
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"identifier": creds["email"], "password": creds["password"]}, timeout=15)
    assert r.status_code == 200, f"login failed for {creds['email']}: {r.status_code} {r.text}"
    return s, r.json()


@pytest.fixture(scope="module")
def super_session():
    s, me = _login(SUPER)
    return s, me


@pytest.fixture(scope="module")
def manager_session():
    s, me = _login(MANAGER)
    return s, me


# -------- platform admins --------
def test_admins_requires_auth():
    r = requests.get(f"{API}/platform/admins", timeout=10)
    assert r.status_code == 401, r.text


def test_admins_forbidden_for_manager(manager_session):
    s, _ = manager_session
    r = s.get(f"{API}/platform/admins", timeout=10)
    assert r.status_code == 403, r.text


def test_admins_list_and_create_and_delete(super_session):
    s, me = super_session
    # list
    r = s.get(f"{API}/platform/admins", timeout=10)
    assert r.status_code == 200
    admins = r.json()
    assert any(a["id"] == me["id"] for a in admins)

    # create
    payload = {"name": "TEST QA Admin", "email": "test_qa_admin@studioaurea.com", "password": "Qa12345678"}
    # cleanup if left over
    r0 = s.get(f"{API}/platform/admins", timeout=10)
    for a in r0.json():
        if a["email"] == payload["email"]:
            s.delete(f"{API}/platform/admins/{a['id']}", timeout=10)

    r = s.post(f"{API}/platform/admins", json=payload, timeout=10)
    assert r.status_code == 200, r.text
    created = r.json()
    assert created["email"] == payload["email"]
    assert created["name"] == payload["name"]
    new_id = created["id"]

    # verify via GET
    r = s.get(f"{API}/platform/admins", timeout=10)
    assert any(a["id"] == new_id for a in r.json())

    # duplicate email -> 400
    r = s.post(f"{API}/platform/admins", json=payload, timeout=10)
    assert r.status_code == 400, r.text
    assert "uso" in r.text.lower()

    # cannot delete self
    r = s.delete(f"{API}/platform/admins/{me['id']}", timeout=10)
    assert r.status_code == 400, r.text

    # delete new
    r = s.delete(f"{API}/platform/admins/{new_id}", timeout=10)
    assert r.status_code == 200
    # verify removed
    r = s.get(f"{API}/platform/admins", timeout=10)
    assert not any(a["id"] == new_id for a in r.json())


# -------- forgot-password real email path --------
def test_forgot_password_returns_200_and_logs(super_session):
    log_path = "/var/log/supervisor/backend.err.log"
    marker = ""
    try:
        with open(log_path, "rb") as f:
            f.seek(0, 2)
            marker = str(f.tell())
    except FileNotFoundError:
        pass

    r = requests.post(f"{API}/auth/forgot-password", json={"email": SUPER["email"]}, timeout=30)
    assert r.status_code == 200, r.text
    time.sleep(2)

    # search recent log lines
    found = False
    for path in ["/var/log/supervisor/backend.err.log", "/var/log/supervisor/backend.out.log"]:
        try:
            with open(path) as f:
                content = f.read()[-20000:]
            if "Password reset e-mail sent to" in content and SUPER["email"] in content:
                found = True
                break
        except FileNotFoundError:
            continue
    assert found, "expected 'Password reset e-mail sent to' log line for super admin"


def test_forgot_password_unknown_email_returns_200():
    r = requests.post(f"{API}/auth/forgot-password", json={"email": "nobody_xyz@nowhere.example"}, timeout=15)
    assert r.status_code == 200
