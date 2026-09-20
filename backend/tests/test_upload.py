"""Test upload endpoint - multipart FormData handling."""
import os
import io
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
MANAGER_EMAIL = "gerente@meustudio.com"
MANAGER_PASS = "Studio@2026"


@pytest.fixture(scope="module")
def session():
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login", json={"identifier": MANAGER_EMAIL, "password": MANAGER_PASS})
    assert r.status_code == 200, f"Login failed: {r.status_code} {r.text}"
    return s


@pytest.fixture(scope="module")
def png_bytes():
    # tiny 1x1 PNG
    return bytes.fromhex(
        "89504E470D0A1A0A0000000D49484452000000010000000108060000001F15C4"
        "890000000D49444154789C63F8CFC0F01F0005000101F1EF7B8B0000000049454E44AE426082"
    )


def test_upload_multipart_success(session, png_bytes):
    files = {"file": ("test.png", io.BytesIO(png_bytes), "image/png")}
    data = {"folder": "logo"}
    r = session.post(f"{BASE_URL}/api/upload", files=files, data=data)
    assert r.status_code == 200, f"Expected 200, got {r.status_code}: {r.text}"
    body = r.json()
    assert "path" in body
    assert "url" in body
    assert body["url"].startswith("/api/files/")
    # Verify download works
    dl = session.get(f"{BASE_URL}{body['url']}")
    assert dl.status_code == 200
    assert len(dl.content) > 0


def test_upload_missing_file_returns_422(session):
    r = session.post(f"{BASE_URL}/api/upload", data={"folder": "logo"})
    assert r.status_code == 422, f"Expected 422, got {r.status_code}: {r.text}"


def test_settings_put_json_still_works(session):
    r = session.get(f"{BASE_URL}/api/settings")
    assert r.status_code == 200
    current = r.json()
    payload = dict(current)
    payload.pop("_id", None)
    r2 = session.put(f"{BASE_URL}/api/settings", json=payload)
    assert r2.status_code == 200, f"PUT settings failed: {r2.status_code} {r2.text}"
