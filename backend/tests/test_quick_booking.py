"""Tests for 'Encaixe rápido' (quick booking) feature."""
import os
import pytest
import requests
from datetime import datetime, timedelta, timezone

BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")

PRO_EMAIL = "ana@meustudio.com"
PRO_PASS = "Pro@2026xx"
MANAGER_EMAIL = "gerente@meustudio.com"
MANAGER_PASS = "Studio@2026"
CLIENT_PHONE = "11988887777"
CLIENT_PASS = "Cliente@2026"
CLIENT_ID = "06aa9862-6f60-449f-8d3c-ebcd056a97a6"
SERVICE_ID = "b842fd02-5f30-4efa-ad10-3af8cd8273bb"  # Design de Sobrancelha 45min


def _login(identifier, password):
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login", json={"identifier": identifier, "password": password})
    assert r.status_code == 200, f"login failed for {identifier}: {r.status_code} {r.text}"
    return s, r.json()


@pytest.fixture(scope="module")
def pro_session():
    s, u = _login(PRO_EMAIL, PRO_PASS)
    return s, u


@pytest.fixture(scope="module")
def manager_session():
    s, u = _login(MANAGER_EMAIL, MANAGER_PASS)
    return s, u


@pytest.fixture(scope="module")
def client_session():
    s, u = _login(CLIENT_PHONE, CLIENT_PASS)
    return s, u


def _future_sunday_iso(hour=22, minute=30, weeks_ahead=1):
    """Return an ISO UTC datetime for a future Sunday at hour:minute UTC."""
    now = datetime.now(timezone.utc)
    days_ahead = (6 - now.weekday()) % 7 or 7
    d = (now + timedelta(days=days_ahead + 7 * (weeks_ahead - 1))).replace(hour=hour, minute=minute, second=0, microsecond=0)
    return d


import random


def test_clients_scope_all_as_professional(pro_session):
    s, _ = pro_session
    r = s.get(f"{BASE_URL}/api/clients", params={"scope": "all"})
    assert r.status_code == 200
    data = r.json()
    assert isinstance(data, list)
    assert len(data) > 0
    # each item should only have minimal fields
    sample = data[0]
    assert set(sample.keys()) <= {"id", "name", "phone"}
    # target client is included
    assert any(c["id"] == CLIENT_ID for c in data)


def test_quick_booking_outside_hours_as_professional(pro_session):
    s, me = pro_session
    start = _future_sunday_iso(22, 30, weeks_ahead=random.randint(5, 20))
    payload = {
        "items": [{"professional_id": me["id"], "service_id": SERVICE_ID, "start": start.isoformat()}],
        "quick": True,
        "client_id": CLIENT_ID,
    }
    r = s.post(f"{BASE_URL}/api/appointments", json=payload)
    assert r.status_code == 200, f"expected 200, got {r.status_code}: {r.text}"
    data = r.json()
    assert data.get("status") == "confirmed"
    assert data.get("quick") is True


def test_non_quick_outside_hours_returns_409(pro_session):
    s, me = pro_session
    start = _future_sunday_iso(23, 0, weeks_ahead=random.randint(21, 40))
    payload = {
        "items": [{"professional_id": me["id"], "service_id": SERVICE_ID, "start": start.isoformat()}],
        "quick": False,
        "client_id": CLIENT_ID,
    }
    r = s.post(f"{BASE_URL}/api/appointments", json=payload)
    assert r.status_code == 409
    detail = r.json().get("detail", "")
    assert "hor" in detail.lower() or "funcionamento" in detail.lower()


def test_professional_cannot_quick_for_another_pro(pro_session, manager_session):
    s_pro, me = pro_session
    s_mgr, _ = manager_session
    # find another professional
    pros = s_mgr.get(f"{BASE_URL}/api/professionals").json()
    other = next((p for p in pros if p["id"] != me["id"] and p.get("active", True)), None)
    if not other:
        pytest.skip("No other active professional to test against")
    start = _future_sunday_iso(21, 0, weeks_ahead=random.randint(41, 60))
    payload = {
        "items": [{"professional_id": other["id"], "service_id": SERVICE_ID, "start": start.isoformat()}],
        "quick": True,
        "client_id": CLIENT_ID,
    }
    r = s_pro.post(f"{BASE_URL}/api/appointments", json=payload)
    assert r.status_code == 403, f"expected 403, got {r.status_code}: {r.text}"


def test_client_cannot_quick_book(client_session):
    s, me = client_session
    # need a pro id — grab from public
    pros_resp = requests.get(f"{BASE_URL}/api/professionals", cookies=s.cookies)
    if pros_resp.status_code != 200:
        pytest.skip(f"client cannot list pros: {pros_resp.status_code}")
    pros = pros_resp.json()
    pro = next((p for p in pros if SERVICE_ID in (p.get("service_ids") or [])), None)
    if not pro:
        pytest.skip("No pro with the target service")
    start = _future_sunday_iso(20, 0)
    payload = {
        "items": [{"professional_id": pro["id"], "service_id": SERVICE_ID, "start": start.isoformat()}],
        "quick": True,
    }
    r = s.post(f"{BASE_URL}/api/appointments", json=payload)
    assert r.status_code == 403


def test_quick_booking_appears_in_appointments_list(pro_session):
    s, _ = pro_session
    r = s.get(f"{BASE_URL}/api/appointments")
    assert r.status_code == 200
    data = r.json()
    assert any(a.get("quick") for a in data), "No quick appointments visible to professional"
