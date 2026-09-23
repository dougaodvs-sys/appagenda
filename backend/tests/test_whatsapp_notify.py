"""Tests for WhatsApp notification endpoint and professional phone requirement.
Auth uses httpOnly cookies -> use requests.Session.
"""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "http://localhost:8001").rstrip("/")
API = f"{BASE_URL}/api"


def _login(identifier, password, studio_slug=None):
    s = requests.Session()
    payload = {"identifier": identifier, "password": password}
    if studio_slug:
        payload["studio_slug"] = studio_slug
    r = s.post(f"{API}/auth/login", json=payload, timeout=15)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    me = r.json()
    # cookies use Partitioned/SameSite=None which requests may not persist reliably
    # explicitly extract token from Set-Cookie header and use Bearer
    token = None
    for c in r.cookies:
        if c.name == "access_token":
            token = c.value
            break
    if not token:
        # parse from Set-Cookie header manually
        sc = r.headers.get("Set-Cookie", "")
        import re as _re
        m = _re.search(r"access_token=([^;]+)", sc)
        if m:
            token = m.group(1)
    assert token, f"no access_token in response: {r.headers}"
    s.headers.update({"Authorization": f"Bearer {token}"})
    return s, me


@pytest.fixture(scope="module")
def mgr():
    return _login("gerente@meustudio.com", "Studio@2026")


@pytest.fixture(scope="module")
def pro():
    return _login("ana@meustudio.com", "Pro@2026xx")


@pytest.fixture(scope="module")
def cli():
    return _login("11988887777", "Cliente@2026", "meu-studio")


@pytest.fixture(scope="module")
def mgr_appointments(mgr):
    s, _ = mgr
    r = s.get(f"{API}/appointments", timeout=15)
    assert r.status_code == 200
    appts = r.json()
    assert appts, "no appointments in Meu Studio"
    return appts


# ---------- WhatsApp targets endpoint ----------

class TestWhatsAppTargets:
    def test_manager_gets_client_and_professional_targets(self, mgr, mgr_appointments):
        s, _ = mgr
        appt = next((a for a in mgr_appointments if a.get("client_phone")), None)
        assert appt, "No appointment with client phone"
        r = s.get(f"{API}/appointments/{appt['id']}/whatsapp", timeout=15)
        assert r.status_code == 200
        data = r.json()
        roles = [t["role"] for t in data["targets"]]
        assert "client" in roles
        assert "professional" in roles
        # phones normalized
        for t in data["targets"]:
            if t["phone"]:
                assert t["phone"].startswith("55"), t["phone"]
                assert t["wa_url"].startswith(f"https://wa.me/{t['phone']}?text=")

    def test_professional_target_excludes_self(self, pro):
        s, me = pro
        r = s.get(f"{API}/appointments", timeout=15)
        assert r.status_code == 200
        my_appts = r.json()
        if not my_appts:
            pytest.skip("Pro has no appointments")
        appt = my_appts[0]
        r2 = s.get(f"{API}/appointments/{appt['id']}/whatsapp", timeout=15)
        assert r2.status_code == 200
        data = r2.json()
        # Should not contain a professional target named like the logged pro
        pro_targets = [t for t in data["targets"] if t["role"] == "professional"]
        for t in pro_targets:
            assert t["name"] != me["name"], "professional target should exclude self"

    def test_client_only_professional_targets(self, cli):
        s, me = cli
        r = s.get(f"{API}/appointments", timeout=15)
        assert r.status_code == 200
        appts = r.json()
        if not appts:
            pytest.skip("Client has no appointments")
        appt = appts[0]
        r2 = s.get(f"{API}/appointments/{appt['id']}/whatsapp", timeout=15)
        assert r2.status_code == 200
        data = r2.json()
        roles = [t["role"] for t in data["targets"]]
        assert "client" not in roles, "client should not see client target"
        assert "professional" in roles

    def test_client_cannot_access_other_appointment(self, cli, mgr_appointments):
        s, me = cli
        other = next((a for a in mgr_appointments if a.get("client_id") != me["id"]), None)
        if not other:
            pytest.skip("No other client's appointment")
        r = s.get(f"{API}/appointments/{other['id']}/whatsapp", timeout=15)
        assert r.status_code == 404

    def test_client_target_empty_wa_url_when_no_phone(self, mgr, mgr_appointments):
        s, _ = mgr
        noph = [a for a in mgr_appointments if not a.get("client_phone")]
        if not noph:
            pytest.skip("no appointment without client phone")
        r = s.get(f"{API}/appointments/{noph[0]['id']}/whatsapp", timeout=15)
        assert r.status_code == 200
        data = r.json()
        client_t = next(t for t in data["targets"] if t["role"] == "client")
        assert client_t["phone"] == ""
        assert client_t["wa_url"] == ""

    def test_text_content_for_waiting(self, mgr, mgr_appointments):
        s, _ = mgr
        appt = next((a for a in mgr_appointments if a.get("status") == "waiting"
                     and a.get("client_phone")), None)
        if not appt:
            pytest.skip("no waiting appointment with phone")
        r = s.get(f"{API}/appointments/{appt['id']}/whatsapp", timeout=15)
        data = r.json()
        client_t = next(t for t in data["targets"] if t["role"] == "client")
        assert "aguardando confirmação" in client_t["text"] or "aguardando" in client_t["text"]


# ---------- Professional phone requirement ----------

class TestProfessionalPhoneRequired:
    def test_create_without_phone_returns_422(self, mgr):
        s, _ = mgr
        payload = {"name": "TEST_NoPhone", "email": "test_nophone@example.com",
                   "password": "Temp@1234"}
        r = s.post(f"{API}/professionals", json=payload, timeout=15)
        assert r.status_code == 422, f"expected 422, got {r.status_code}: {r.text}"

    def test_create_with_empty_phone_returns_422(self, mgr):
        s, _ = mgr
        payload = {"name": "TEST_EmptyPhone", "email": "test_emptyph@example.com",
                   "password": "Temp@1234", "phone": ""}
        r = s.post(f"{API}/professionals", json=payload, timeout=15)
        assert r.status_code == 422

    def test_update_with_empty_phone_returns_400(self, mgr):
        s, _ = mgr
        r = s.get(f"{API}/professionals", timeout=15)
        pros = r.json()
        ana = next((p for p in pros if p.get("email") == "ana@meustudio.com"), None)
        assert ana, "Ana not found"
        r2 = s.put(f"{API}/professionals/{ana['id']}", json={"phone": ""}, timeout=15)
        assert r2.status_code == 400
