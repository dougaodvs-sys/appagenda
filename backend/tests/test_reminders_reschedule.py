"""Tests for /appointments/reminders and /appointments/{id}/reschedule."""
import os
import requests
import pytest
from datetime import datetime, timedelta, timezone

BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
API = f"{BASE_URL}/api"

PRO_EMAIL = "ana@meustudio.com"
PRO_PASS = "Pro@2026xx"
MANAGER_EMAIL = "gerente@meustudio.com"
MANAGER_PASS = "Studio@2026"
CLIENT_PHONE = "11988887777"
CLIENT_PASS = "Cliente@2026"
SERVICE_ID = "b842fd02-5f30-4efa-ad10-3af8cd8273bb"


def _login(identifier, password):
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"identifier": identifier, "password": password})
    assert r.status_code == 200, f"login {identifier}: {r.status_code} {r.text}"
    return s, r.json()


@pytest.fixture(scope="module")
def pro_session():
    return _login(PRO_EMAIL, PRO_PASS)


@pytest.fixture(scope="module")
def manager_session():
    return _login(MANAGER_EMAIL, MANAGER_PASS)


@pytest.fixture(scope="module")
def client_session():
    return _login(CLIENT_PHONE, CLIENT_PASS)


# -------- Reminders --------

def test_reminders_as_manager(manager_session):
    s, _ = manager_session
    r = s.get(f"{API}/appointments/reminders", params={"day": "2028-05-15"})
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["day"] == "2028-05-15"
    assert isinstance(data["items"], list)
    # Seeded item for Carla exists
    assert len(data["items"]) >= 1
    item = data["items"][0]
    for k in ("wa_url", "text", "client_name", "service_name", "professional_name", "item_id"):
        assert k in item
    if item.get("client_phone"):
        assert item["wa_url"].startswith("https://wa.me/")
        assert "text=" in item["wa_url"]
    assert "lembrar do seu horário" in item["text"]


def test_reminders_as_client_forbidden(client_session):
    s, _ = client_session
    r = s.get(f"{API}/appointments/reminders", params={"day": "2028-05-15"})
    assert r.status_code == 403


def test_reminders_as_pro_scoped(pro_session):
    s, u = pro_session
    r = s.get(f"{API}/appointments/reminders", params={"day": "2028-05-15"})
    assert r.status_code == 200
    for it in r.json()["items"]:
        assert it["professional_id"] == u["id"]


# -------- Reschedule --------

def _find_appt_item_on(session, day_iso):
    r = session.get(f"{API}/appointments")
    r.raise_for_status()
    for a in r.json():
        for it in a["items"]:
            if it["start"].startswith(day_iso):
                return a, it
    return None, None


def test_reschedule_outside_hours_conflict_then_force(manager_session, pro_session):
    ms, _ = manager_session
    ps, pu = pro_session

    # Create a non-quick appointment via manager on a weekday inside hours,
    # then try to reschedule to 03:00 UTC (outside 09-18 UTC hours) -> 409.
    # Pick a far-future Wednesday 12:00 UTC.
    now = datetime.now(timezone.utc)
    days_ahead = (2 - now.weekday()) % 7 or 7  # Wednesday
    base = (now + timedelta(days=days_ahead + 30)).replace(hour=12, minute=0, second=0, microsecond=0)
    start_iso = base.isoformat()

    # Create via manager for a client (Carla)
    payload = {
        "client_id": "06aa9862-6f60-449f-8d3c-ebcd056a97a6",
        "quick": False,
        "items": [{"service_id": SERVICE_ID, "professional_id": pu["id"], "start": start_iso}],
    }
    r = ms.post(f"{API}/appointments", json=payload)
    assert r.status_code in (200, 201), r.text
    appt = r.json()
    item_id = appt["items"][0]["id"]
    appt_id = appt["id"]

    try:
        # Move to 03:00 UTC same day -> outside working hours -> 409
        outside = base.replace(hour=3)
        r_conflict = ms.post(f"{API}/appointments/{appt_id}/reschedule",
                             json={"item_id": item_id, "start": outside.isoformat(), "force": False})
        assert r_conflict.status_code == 409, r_conflict.text

        # Force -> 200
        r_force = ms.post(f"{API}/appointments/{appt_id}/reschedule",
                          json={"item_id": item_id, "start": outside.isoformat(), "force": True})
        assert r_force.status_code == 200, r_force.text
        assert r_force.json()["items"][0]["start"].startswith(outside.isoformat()[:16])
    finally:
        # Cleanup
        ms.post(f"{API}/appointments/{appt_id}/status",
                json={"status": "cancelled", "cancellation_reason": "TEST cleanup"})


def test_reschedule_other_pro_forbidden(pro_session, manager_session):
    """If there are other professionals, professional cannot reschedule someone else's item."""
    ms, _ = manager_session
    ps, pu = pro_session

    # Find any appt with an item NOT belonging to Ana
    r = ms.get(f"{API}/appointments")
    r.raise_for_status()
    target = None
    for a in r.json():
        for it in a["items"]:
            if it["professional_id"] != pu["id"] and a.get("status") not in ("cancelled", "refused", "completed"):
                target = (a["id"], it["id"], it["start"])
                break
        if target:
            break
    if not target:
        pytest.skip("No appointment of another professional available")
    aid, iid, start = target
    r = ps.post(f"{API}/appointments/{aid}/reschedule",
                json={"item_id": iid, "start": start, "force": True})
    assert r.status_code == 403
