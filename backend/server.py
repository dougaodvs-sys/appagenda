from dotenv import load_dotenv
from pathlib import Path
ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

import os
import uuid
import logging
import secrets
from urllib.parse import quote, unquote
from datetime import datetime, timezone, timedelta, date, time
from typing import List, Optional, Literal

import bcrypt
import jwt
import requests
from bson import ObjectId
from fastapi import FastAPI, APIRouter, HTTPException, Depends, Request, Response, UploadFile, File, Form
from fastapi.responses import Response as FileResponse
from fastapi.security import HTTPBearer
from starlette.middleware.cors import CORSMiddleware
from starlette.concurrency import run_in_threadpool
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field, EmailStr
from emailer import send_email, password_reset_html, EMAIL_FROM_NAME

# =========================
# Config
# =========================
JWT_SECRET = os.environ["JWT_SECRET"]
JWT_ALG = "HS256"
ACCESS_MIN = 60 * 12  # 12 hours (workday)
REFRESH_DAYS = 7

mongo_url = os.environ["MONGO_URL"]
db_name = os.environ["DB_NAME"]
client = AsyncIOMotorClient(mongo_url)
db = client[db_name]

app = FastAPI(title="Studio Beauty API")
api = APIRouter(prefix="/api")

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger("studio")

# =========================
# Helpers
# =========================
def now_utc() -> datetime:
    return datetime.now(timezone.utc)

def hash_password(pw: str) -> str:
    return bcrypt.hashpw(pw.encode(), bcrypt.gensalt()).decode()

def verify_password(pw: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(pw.encode(), hashed.encode())
    except Exception:
        return False

def make_access(user_id: str, role: str) -> str:
    payload = {"sub": user_id, "role": role, "type": "access",
               "exp": now_utc() + timedelta(minutes=ACCESS_MIN)}
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALG)

def make_refresh(user_id: str) -> str:
    payload = {"sub": user_id, "type": "refresh",
               "exp": now_utc() + timedelta(days=REFRESH_DAYS)}
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALG)

def set_auth_cookies(response: Response, access: str, refresh: str):
    secure = os.environ.get("COOKIE_SECURE", "true").lower() == "true"
    samesite = "none" if secure else "lax"
    response.set_cookie("access_token", access, httponly=True, secure=secure,
                        samesite=samesite, max_age=ACCESS_MIN * 60, path="/")
    response.set_cookie("refresh_token", refresh, httponly=True, secure=secure,
                        samesite=samesite, max_age=REFRESH_DAYS * 86400, path="/")

def clear_auth_cookies(response: Response):
    response.delete_cookie("access_token", path="/")
    response.delete_cookie("refresh_token", path="/")

def uid() -> str:
    return str(uuid.uuid4())

DEFAULT_STUDIO_ID = "default-studio"
TENANT_COLLECTIONS = ("users", "professionals", "services", "settings", "gallery",
                      "files", "blocks", "coupons", "appointments", "notifications")

def tenant_id(user: dict) -> Optional[str]:
    return user.get("studio_id")

def tenant_query(user: dict, query: Optional[dict] = None) -> dict:
    """Add the authenticated user's tenant constraint (platform admins are global)."""
    q = dict(query or {})
    if user.get("role") != "super_admin":
        q["studio_id"] = user.get("studio_id")
    return q

async def ensure_studio_access(user: dict) -> None:
    if user.get("role") == "super_admin" or not user.get("studio_id"):
        return
    studio = await db.studios.find_one({"id": user["studio_id"]}, {"active": 1, "license_expires_at": 1})
    if not studio or studio.get("active") is False:
        raise HTTPException(403, "Studio bloqueado")
    expires_at = studio.get("license_expires_at")
    if expires_at:
        try:
            if datetime.fromisoformat(expires_at.replace("Z", "+00:00")) < now_utc():
                raise HTTPException(403, "Licença do studio expirada")
        except ValueError:
            logger.warning("Invalid license expiration for studio %s", user["studio_id"])

# =========================
# Object storage
# =========================
STORAGE_BASE = (os.environ.get("INTEGRATION_PROXY_URL") or "").strip() or "https://integrations.emergentagent.com"
STORAGE_URL = STORAGE_BASE.rstrip("/") + "/objstore/api/v1/storage"
EMERGENT_KEY = os.environ.get("EMERGENT_LLM_KEY")
APP_NAME = "studio-aurea"
_storage_key = None
LOCAL_UPLOAD_DIR = ROOT_DIR / "uploads"

MIME_TYPES = {
    "jpg": "image/jpeg", "jpeg": "image/jpeg", "png": "image/png",
    "gif": "image/gif", "webp": "image/webp",
}

def init_storage(force: bool = False):
    global _storage_key
    if _storage_key and not force:
        return _storage_key
    resp = requests.post(f"{STORAGE_URL}/init", json={"emergent_key": EMERGENT_KEY}, timeout=30)
    resp.raise_for_status()
    _storage_key = resp.json()["storage_key"]
    return _storage_key

def put_object(path: str, data: bytes, content_type: str) -> dict:
    if not EMERGENT_KEY:
        target = (LOCAL_UPLOAD_DIR / path).resolve()
        if LOCAL_UPLOAD_DIR.resolve() not in target.parents:
            raise ValueError("Caminho de arquivo inválido")
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(data)
        return {"path": path, "size": len(data)}
    key = init_storage()
    resp = requests.put(f"{STORAGE_URL}/objects/{path}",
                        headers={"X-Storage-Key": key, "Content-Type": content_type},
                        data=data, timeout=120)
    if resp.status_code == 404:
        key = init_storage(force=True)
        resp = requests.put(f"{STORAGE_URL}/objects/{path}",
                            headers={"X-Storage-Key": key, "Content-Type": content_type},
                            data=data, timeout=120)
    resp.raise_for_status()
    return resp.json()

def get_object(path: str):
    if not EMERGENT_KEY:
        target = (LOCAL_UPLOAD_DIR / path).resolve()
        if LOCAL_UPLOAD_DIR.resolve() not in target.parents:
            raise FileNotFoundError(path)
        if not target.is_file():
            raise FileNotFoundError(path)
        return target.read_bytes(), "application/octet-stream"
    key = init_storage()
    resp = requests.get(f"{STORAGE_URL}/objects/{path}",
                        headers={"X-Storage-Key": key}, timeout=60)
    if resp.status_code == 404:
        key = init_storage(force=True)
        resp = requests.get(f"{STORAGE_URL}/objects/{path}",
                            headers={"X-Storage-Key": key}, timeout=60)
    resp.raise_for_status()
    return resp.content, resp.headers.get("Content-Type", "application/octet-stream")

def _norm_phone(v: Optional[str]) -> str:
    import re as _re
    d = _re.sub(r"\D", "", v or "")
    if len(d) > 11 and d.startswith("55"):
        d = d[2:]
    return d

def serialize(doc: dict) -> dict:
    if doc is None:
        return None
    doc = dict(doc)
    doc.pop("_id", None)
    doc.pop("password_hash", None)
    return doc

# =========================
# Auth dependency
# =========================
async def get_current_user(request: Request) -> dict:
    token = request.cookies.get("access_token")
    if not token:
        auth = request.headers.get("Authorization", "")
        if auth.startswith("Bearer "):
            token = auth[7:]
    if not token:
        raise HTTPException(401, "Não autenticado")
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALG])
        if payload.get("type") != "access":
            raise HTTPException(401, "Token inválido")
        user = await db.users.find_one({"id": payload["sub"]})
        if not user:
            raise HTTPException(401, "Usuário não encontrado")
        await ensure_studio_access(user)
        return user
    except jwt.ExpiredSignatureError:
        raise HTTPException(401, "Sessão expirada")
    except jwt.InvalidTokenError:
        raise HTTPException(401, "Token inválido")

def require_role(*roles):
    async def dep(user: dict = Depends(get_current_user)):
        if user.get("role") != "super_admin" and user.get("role") not in roles:
            raise HTTPException(403, "Permissão insuficiente")
        return user
    return dep

# =========================
# Models
# =========================
class RegisterIn(BaseModel):
    name: str
    email: Optional[EmailStr] = None
    password: str
    phone: str = Field(min_length=8)
    referral_code: Optional[str] = None
    studio_slug: Optional[str] = None

class ManualReferralIn(BaseModel):
    referrer_id: str
    referred_id: str

class ProServicesIn(BaseModel):
    service_ids: List[str]

class LoginIn(BaseModel):
    identifier: str  # email (equipe) ou telefone (cliente)
    password: str
    studio_slug: Optional[str] = None

class ProfessionalIn(BaseModel):
    name: str
    email: EmailStr
    password: Optional[str] = None
    phone: str = Field(min_length=8)
    specialty: Optional[str] = ""
    photo_url: Optional[str] = ""
    service_ids: List[str] = []
    working_hours: dict = Field(default_factory=dict)  # {"mon": {"open":"09:00","close":"18:00"} ...}
    can_create_coupons: bool = False
    signal_percent: int = 30
    active: bool = True

class ProfessionalUpdate(BaseModel):
    name: Optional[str] = None
    phone: Optional[str] = None
    specialty: Optional[str] = None
    photo_url: Optional[str] = None
    service_ids: Optional[List[str]] = None
    working_hours: Optional[dict] = None
    can_create_coupons: Optional[bool] = None
    signal_percent: Optional[int] = None
    active: Optional[bool] = None
    password: Optional[str] = None

class ServiceIn(BaseModel):
    name: str
    duration_min: int  # in minutes
    cleanup_min: int = 0
    price: float
    description: Optional[str] = ""
    image_url: Optional[str] = ""
    active: bool = True
    professional_ids: List[str] = []

class GalleryIn(BaseModel):
    title: str
    caption: Optional[str] = ""
    before_url: str
    after_url: str
    service_id: Optional[str] = None
    professional_id: Optional[str] = None

class BlockIn(BaseModel):
    professional_id: str
    start: datetime
    end: datetime
    reason: Optional[str] = ""
    kind: Literal["single", "recurring", "vacation", "lunch"] = "single"

class CouponIn(BaseModel):
    code: str
    discount_percent: int
    scope: Literal["studio", "professional"] = "studio"
    professional_id: Optional[str] = None
    service_ids: List[str] = []
    min_value: float = 0
    max_uses: Optional[int] = None
    max_uses_per_client: Optional[int] = None
    valid_from: Optional[datetime] = None
    valid_until: Optional[datetime] = None
    active: bool = True
    client_id: Optional[str] = None

class BookingItemIn(BaseModel):
    professional_id: str
    service_id: str
    start: datetime  # UTC

class BookingIn(BaseModel):
    client_id: Optional[str] = None  # manager can pass; client bookings use current user
    client_name: Optional[str] = None  # for manager quick create
    client_phone: Optional[str] = None
    items: List[BookingItemIn]
    coupon_code: Optional[str] = None
    notes: Optional[str] = ""
    quick: bool = False
    force: bool = False

class StatusUpdate(BaseModel):
    status: Literal["waiting", "signal_pending", "signal_paid", "confirmed",
                    "completed", "refused", "cancelled"]
    cancellation_reason: Optional[str] = None

class StudioSettingsIn(BaseModel):
    name: str
    logo_url: Optional[str] = ""
    address: Optional[str] = ""
    phone: Optional[str] = ""
    whatsapp: Optional[str] = ""
    instagram: Optional[str] = ""
    email: Optional[str] = ""
    primary_color: Optional[str] = "#D4A93A"
    opening_hours: dict = Field(default_factory=dict)
    default_signal_percent: int = 30
    referral_discount_percent: int = 10

class StudioIn(BaseModel):
    name: str
    active: bool = True
    license_expires_at: Optional[datetime] = None
    manager_name: Optional[str] = None
    manager_phone: Optional[str] = ""
    manager_email: Optional[EmailStr] = None
    manager_password: Optional[str] = Field(default=None, min_length=8)

class StudioUpdate(BaseModel):
    name: Optional[str] = None
    active: Optional[bool] = None
    license_expires_at: Optional[datetime] = None
    manager_name: Optional[str] = None
    manager_phone: Optional[str] = None
    manager_email: Optional[EmailStr] = None
    manager_password: Optional[str] = Field(default=None, min_length=8)

class ChangePasswordIn(BaseModel):
    current_password: str
    new_password: str = Field(min_length=8)

class ForgotPasswordIn(BaseModel):
    email: EmailStr

class ResetPasswordIn(BaseModel):
    token: str
    new_password: str = Field(min_length=8)

class PlatformAdminIn(BaseModel):
    name: str = Field(min_length=2)
    email: EmailStr
    password: str = Field(min_length=8)

# =========================
# Startup
# =========================
@app.on_event("startup")
async def startup():
    # Stage 1 tenant bootstrap: preserve all existing records in one default studio.
    studio = await db.studios.find_one({"id": DEFAULT_STUDIO_ID})
    if not studio:
        await db.studios.insert_one({"id": DEFAULT_STUDIO_ID, "name": "Studio Aurea",
                                     "active": True, "license_expires_at": None,
                                     "created_at": now_utc().isoformat()})
    await db.studios.update_one({"id": DEFAULT_STUDIO_ID},
                                {"$setOnInsert": {"active": True, "license_expires_at": None}})
    for collection_name in TENANT_COLLECTIONS:
        collection = db[collection_name]
        await collection.update_many({"studio_id": {"$exists": False}},
                                     {"$set": {"studio_id": DEFAULT_STUDIO_ID}})
    try:
        init_storage()
        logger.info("Storage initialized")
    except Exception as e:
        logger.error(f"Storage init failed: {e}")
    try:
        await db.users.drop_index("email_1")
    except Exception:
        pass
    try:
        await db.professionals.drop_index("email_1")
    except Exception:
        pass
    await db.users.create_index([("studio_id", 1), ("email", 1)], unique=True,
                                partialFilterExpression={"email": {"$type": "string"}})
    await db.users.create_index("phone_digits")
    await db.studios.create_index("slug", unique=True, sparse=True)
    async for existing_studio in db.studios.find({"slug": {"$exists": False}}, {"id": 1, "name": 1}):
        await db.studios.update_one({"id": existing_studio["id"]},
                                    {"$set": {"slug": await unique_studio_slug(existing_studio.get("name", "studio"),
                                                                                existing_studio["id"])}})
    async for u in db.users.find({"phone_digits": {"$exists": False}}, {"_id": 0, "id": 1, "phone": 1}):
        await db.users.update_one({"id": u["id"]}, {"$set": {"phone_digits": _norm_phone(u.get("phone"))}})
    await db.services.create_index("name")
    await db.professionals.create_index([("studio_id", 1), ("email", 1)], unique=True)
    await db.appointments.create_index([("items.professional_id", 1), ("items.start", 1)])
    await db.coupons.create_index("code", unique=True)
    await db.login_events.create_index([("user_id", 1), ("at", -1)])
    await db.password_reset_tokens.create_index("expires_at", expireAfterSeconds=0)

    # seed manager
    admin_email = os.environ["ADMIN_EMAIL"].lower()
    admin_pw = os.environ["ADMIN_PASSWORD"]
    existing = await db.users.find_one({"email": admin_email, "studio_id": DEFAULT_STUDIO_ID})
    if not existing:
        await db.users.insert_one({
            "id": uid(),
            "email": admin_email,
            "password_hash": hash_password(admin_pw),
            "name": "Gerente",
            "role": "manager",
            "studio_id": DEFAULT_STUDIO_ID,
            "phone": "",
            "created_at": now_utc().isoformat(),
        })
        logger.info(f"Seeded manager: {admin_email}")

    super_email = (os.environ.get("SUPER_ADMIN_EMAIL") or "").strip().lower()
    super_pw = os.environ.get("SUPER_ADMIN_PASSWORD")
    if super_email and super_pw:
        super_admin = await db.users.find_one({"email": super_email, "role": "super_admin"})
        super_doc = {
            "email": super_email, "name": "Super Admin", "role": "super_admin",
            "phone": "", "studio_id": None,
        }
        if not super_admin:
            super_doc.update({"id": uid(), "password_hash": hash_password(super_pw),
                              "created_at": now_utc().isoformat()})
            await db.users.insert_one(super_doc)
        elif not super_admin.get("password_changed_at") and not verify_password(super_pw, super_admin.get("password_hash", "")):
            await db.users.update_one({"id": super_admin["id"]},
                                      {"$set": {"password_hash": hash_password(super_pw),
                                                "role": "super_admin", "studio_id": None}})

    # default studio settings
    settings = await db.settings.find_one({"key": "studio", "studio_id": DEFAULT_STUDIO_ID})
    if not settings:
        await db.settings.insert_one({
            "key": "studio",
            "studio_id": DEFAULT_STUDIO_ID,
            "name": "Studio Aurea",
            "logo_url": "",
            "address": "",
            "phone": "",
            "whatsapp": "",
            "instagram": "",
            "email": "",
            "primary_color": "#D4A93A",
            "opening_hours": {
                "mon": {"open": "09:00", "close": "18:00", "closed": False},
                "tue": {"open": "09:00", "close": "18:00", "closed": False},
                "wed": {"open": "09:00", "close": "18:00", "closed": False},
                "thu": {"open": "09:00", "close": "20:00", "closed": False},
                "fri": {"open": "09:00", "close": "20:00", "closed": False},
                "sat": {"open": "09:00", "close": "15:00", "closed": False},
                "sun": {"open": "09:00", "close": "18:00", "closed": True},
            },
            "default_signal_percent": 30,
        })

@app.on_event("shutdown")
async def shutdown():
    client.close()

# =========================
# Auth routes
# =========================
import re

def _make_referral_code(name: str) -> str:
    base = re.sub(r"[^A-Z]", "", (name or "").split(" ")[0].upper())[:6] or "AMIGA"
    return f"{base}{secrets.randbelow(9000) + 1000}"

async def ensure_referral_code(user: dict) -> dict:
    if user.get("role") == "client" and not user.get("referral_code"):
        for _ in range(10):
            code = _make_referral_code(user.get("name", ""))
            if not await db.users.find_one(tenant_query(user, {"referral_code": code})):
                await db.users.update_one(tenant_query(user, {"id": user["id"]}), {"$set": {"referral_code": code}})
                user["referral_code"] = code
                break
    return user

@api.post("/auth/register")
async def register(data: RegisterIn, response: Response):
    studio = await db.studios.find_one({"slug": data.studio_slug, "active": {"$ne": False}}) if data.studio_slug else await db.studios.find_one({"id": DEFAULT_STUDIO_ID})
    if not studio:
        raise HTTPException(404, "Studio não encontrado")
    studio_id = studio["id"]
    email = data.email.lower() if data.email else None
    if email and await db.users.find_one({"email": email, "studio_id": studio_id}):
        raise HTTPException(400, "E-mail já cadastrado")
    phone_digits = _norm_phone(data.phone)
    if len(phone_digits) < 8:
        raise HTTPException(400, "Telefone inválido")
    if await db.users.find_one({"phone_digits": phone_digits, "role": "client", "studio_id": studio_id}):
        raise HTTPException(400, "Telefone já cadastrado. Faça login com telefone e senha.")
    referred_by = None
    if data.referral_code:
        ref = await db.users.find_one({"referral_code": data.referral_code.upper().strip(), "role": "client",
                                       "studio_id": studio_id})
        if not ref:
            raise HTTPException(400, "Código de indicação inválido")
        referred_by = ref["id"]
    user = {
        "id": uid(),
        "name": data.name,
        "phone": data.phone,
        "phone_digits": phone_digits,
        "password_hash": hash_password(data.password),
        "role": "client",
        "studio_id": studio_id,
        "referred_by": referred_by,
        "referral_rewarded": False,
        "created_at": now_utc().isoformat(),
    }
    if email:
        user["email"] = email
    await db.users.insert_one(user)
    await ensure_referral_code(user)
    access = make_access(user["id"], user["role"])
    refresh = make_refresh(user["id"])
    set_auth_cookies(response, access, refresh)
    return serialize(user)

STAFF_ROLES = ("manager", "professional", "super_admin")

def client_ip(request: Request) -> str:
    fwd = request.headers.get("x-forwarded-for", "")
    if fwd:
        return fwd.split(",")[0].strip()
    return request.client.host if request.client else ""

async def record_login_event(request: Request, user: dict, success: bool):
    await db.login_events.insert_one({
        "id": uid(), "user_id": user["id"], "email": user.get("email"), "role": user.get("role"),
        "ip": client_ip(request), "user_agent": request.headers.get("user-agent", "")[:300],
        "success": success, "at": now_utc().isoformat(),
    })

@api.post("/auth/login")
async def login(data: LoginIn, request: Request, response: Response):
    ident = data.identifier.strip()
    studio = await db.studios.find_one({"slug": data.studio_slug, "active": {"$ne": False}}) if data.studio_slug else None
    studio_id = studio["id"] if studio else None
    if "@" in ident:
        query = {"email": ident.lower(), "role": {"$in": list(STAFF_ROLES)}}
        if studio_id:
            query["studio_id"] = studio_id
        matches = await db.users.find(query, {"_id": 0}).to_list(10)
        if not studio_id and len({u.get("studio_id") for u in matches if u.get("role") != "super_admin"}) > 1:
            raise HTTPException(400, "Use o link público do Studio para entrar com este e-mail")
        user = matches[0] if matches else None
    else:
        digits = _norm_phone(ident)
        query = {"phone_digits": digits, "role": "client"}
        if studio_id:
            query["studio_id"] = studio_id
        user = await db.users.find_one(query) if digits else None
    if not user or not verify_password(data.password, user["password_hash"]):
        if user and user.get("role") in STAFF_ROLES:
            await record_login_event(request, user, False)
        raise HTTPException(401, "Credenciais inválidas")
    await ensure_studio_access(user)
    if user.get("role") in STAFF_ROLES:
        await record_login_event(request, user, True)
    access = make_access(user["id"], user["role"])
    refresh = make_refresh(user["id"])
    set_auth_cookies(response, access, refresh)
    return serialize(await ensure_referral_code(user))

@api.post("/auth/logout")
async def logout(response: Response, user: dict = Depends(get_current_user)):
    clear_auth_cookies(response)
    return {"ok": True}

@api.post("/auth/change-password")
async def change_password(data: ChangePasswordIn, user: dict = Depends(get_current_user)):
    if not verify_password(data.current_password, user.get("password_hash", "")):
        raise HTTPException(400, "Senha atual inválida")
    await db.users.update_one({"id": user["id"]}, {"$set": {"password_hash": hash_password(data.new_password),
                                                            "password_changed_at": now_utc().isoformat()}})
    return {"ok": True}

@api.get("/auth/login-history")
async def login_history(limit: int = 20, user: dict = Depends(require_role(*STAFF_ROLES))):
    docs = await db.login_events.find({"user_id": user["id"]}, {"_id": 0}).sort("at", -1).to_list(min(max(limit, 1), 100))
    return docs

def frontend_base(request: Request) -> str:
    origin = request.headers.get("origin") or ""
    if origin:
        return origin.rstrip("/")
    first = [o.strip() for o in os.environ.get("CORS_ORIGINS", "").split(",") if o.strip()]
    return first[0].rstrip("/") if first else ""

@api.post("/auth/forgot-password")
async def forgot_password(data: ForgotPasswordIn, request: Request):
    user = await db.users.find_one({"email": data.email.lower(), "role": {"$in": list(STAFF_ROLES)}}, {"_id": 0})
    if user:
        token = secrets.token_urlsafe(32)
        await db.password_reset_tokens.insert_one({
            "id": uid(), "token": token, "user_id": user["id"], "used": False,
            "created_at": now_utc(), "expires_at": now_utc() + timedelta(hours=1),
        })
        link = f"{frontend_base(request)}/redefinir-senha?token={token}"
        try:
            await send_email(to=user["email"], subject=f"{EMAIL_FROM_NAME} · Redefinir sua senha",
                             html=password_reset_html(user.get("name") or "", link))
            logger.info("Password reset e-mail sent to %s", user["email"])
        except Exception as e:
            logger.error("Password reset e-mail failed for %s: %s", user["email"], e)
            raise HTTPException(502, "Não foi possível enviar o e-mail. Tente novamente em instantes.")
    return {"ok": True, "message": "Se o e-mail estiver cadastrado, enviaremos um link de recuperação."}

@api.post("/auth/reset-password")
async def reset_password(data: ResetPasswordIn):
    doc = await db.password_reset_tokens.find_one({"token": data.token, "used": False})
    if not doc or doc["expires_at"].replace(tzinfo=timezone.utc) < now_utc():
        raise HTTPException(400, "Link inválido ou expirado")
    await db.users.update_one({"id": doc["user_id"]}, {"$set": {"password_hash": hash_password(data.new_password),
                                                                "password_changed_at": now_utc().isoformat()}})
    await db.password_reset_tokens.update_one({"id": doc["id"]}, {"$set": {"used": True}})
    return {"ok": True}

@api.get("/auth/me")
async def me(user: dict = Depends(get_current_user)):
    return serialize(await ensure_referral_code(user))

# =========================
# Studio settings
# =========================
@api.get("/settings")
async def get_settings(user: dict = Depends(get_current_user)):
    s = await db.settings.find_one(tenant_query(user, {"key": "studio"}))
    studio = await db.studios.find_one({"id": user.get("studio_id")}, {"_id": 0, "name": 1, "slug": 1}) if user.get("studio_id") else None
    result = dict(s or {})
    result.pop("_id", None)
    result.setdefault("name", studio.get("name", "Studio") if studio else "Studio")
    result.setdefault("logo_url", "")
    result.setdefault("address", "")
    result.setdefault("phone", "")
    result.setdefault("whatsapp", "")
    result.setdefault("instagram", "")
    result.setdefault("email", "")
    result.setdefault("primary_color", "#D4A93A")
    result.setdefault("opening_hours", {})
    result.setdefault("default_signal_percent", 30)
    result.setdefault("referral_discount_percent", 10)
    if studio:
        result["slug"] = studio.get("slug")
        result["public_url"] = f"/studio/{studio.get('slug')}"
    return result

@api.put("/settings")
async def update_settings(data: StudioSettingsIn, user: dict = Depends(require_role("manager"))):
    doc = data.model_dump()
    doc["key"] = "studio"
    doc["studio_id"] = tenant_id(user)
    await db.settings.update_one(tenant_query(user, {"key": "studio"}), {"$set": doc}, upsert=True)
    s = await db.settings.find_one(tenant_query(user, {"key": "studio"}))
    s.pop("_id", None)
    studio = await db.studios.find_one({"id": user.get("studio_id")}, {"_id": 0, "slug": 1})
    if studio:
        s["slug"] = studio.get("slug")
        s["public_url"] = f"/studio/{studio.get('slug')}"
    return s

# =========================
# Platform studio management
# =========================
def studio_slug(name: str) -> str:
    import unicodedata
    value = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode().lower()
    value = re.sub(r"[^a-z0-9]+", "-", value).strip("-")
    return value or "studio"

async def unique_studio_slug(name: str, studio_id: Optional[str] = None) -> str:
    base = studio_slug(name)
    slug = base
    suffix = 2
    while await db.studios.find_one({"slug": slug, **({"id": {"$ne": studio_id}} if studio_id else {})}):
        slug = f"{base}-{suffix}"
        suffix += 1
    return slug

async def studio_response(doc: dict) -> dict:
    result = serialize(doc)
    manager = await db.users.find_one({"studio_id": doc["id"], "role": "manager"},
                                      {"_id": 0, "id": 1, "name": 1, "email": 1, "phone": 1})
    result["manager"] = manager
    result["public_url"] = f"/studio/{doc.get('slug')}" if doc.get("slug") else None
    return result

@api.get("/studios")
async def list_studios(user: dict = Depends(require_role("super_admin"))):
    docs = await db.studios.find({}, {"_id": 0}).sort("created_at", 1).to_list(1000)
    return [await studio_response(doc) for doc in docs]

@api.post("/studios")
async def create_studio(data: StudioIn, user: dict = Depends(require_role("super_admin"))):
    name = data.name.strip()
    if not name:
        raise HTTPException(400, "Nome do studio é obrigatório")
    if bool(data.manager_email) != bool(data.manager_password) or bool(data.manager_email) != bool(data.manager_name):
        raise HTTPException(400, "Informe nome, e-mail e senha do gerente")
    email = str(data.manager_email).lower() if data.manager_email else None
    if email and await db.users.find_one({"email": email}):
        raise HTTPException(400, "E-mail do gerente já está em uso")
    studio_id = uid()
    doc = {
        "id": studio_id,
        "name": name,
        "slug": await unique_studio_slug(name),
        "active": data.active,
        "license_expires_at": data.license_expires_at.isoformat() if data.license_expires_at else None,
        "created_at": now_utc().isoformat(),
    }
    await db.studios.insert_one(doc)
    if email:
        await db.users.insert_one({
            "id": uid(), "name": data.manager_name.strip(), "email": email,
            "phone": data.manager_phone or "", "phone_digits": _norm_phone(data.manager_phone),
            "password_hash": hash_password(data.manager_password), "role": "manager",
            "studio_id": studio_id, "created_at": now_utc().isoformat(),
        })
    return await studio_response(doc)

# =========================
# Platform admins (super_admin)
# =========================
def _admin_view(u: dict) -> dict:
    return {"id": u["id"], "name": u.get("name"), "email": u.get("email"),
            "created_at": u.get("created_at"), "last_login_at": u.get("last_login_at")}

@api.get("/platform/admins")
async def list_platform_admins(user: dict = Depends(require_role("super_admin"))):
    admins = await db.users.find({"role": "super_admin"}, {"_id": 0}).sort("created_at", 1).to_list(100)
    out = []
    for a in admins:
        last = await db.login_events.find_one({"user_id": a["id"], "success": True}, {"_id": 0, "at": 1}, sort=[("at", -1)])
        a["last_login_at"] = last["at"] if last else None
        out.append(_admin_view(a))
    return out

@api.post("/platform/admins")
async def create_platform_admin(data: PlatformAdminIn, user: dict = Depends(require_role("super_admin"))):
    email = str(data.email).lower()
    if await db.users.find_one({"email": email}):
        raise HTTPException(400, "E-mail já está em uso")
    doc = {"id": uid(), "name": data.name.strip(), "email": email, "role": "super_admin", "studio_id": None,
           "phone": "", "password_hash": hash_password(data.password), "password_changed_at": now_utc().isoformat(),
           "created_by": user["id"], "created_at": now_utc().isoformat()}
    await db.users.insert_one(doc)
    return _admin_view(doc)

@api.delete("/platform/admins/{admin_id}")
async def delete_platform_admin(admin_id: str, user: dict = Depends(require_role("super_admin"))):
    if admin_id == user["id"]:
        raise HTTPException(400, "Você não pode remover o seu próprio acesso")
    target = await db.users.find_one({"id": admin_id, "role": "super_admin"})
    if not target:
        raise HTTPException(404, "Administrador não encontrado")
    await db.users.delete_one({"id": admin_id})
    return {"ok": True}

@api.put("/studios/{studio_id}")
async def update_studio(studio_id: str, data: StudioUpdate,
                        user: dict = Depends(require_role("super_admin"))):
    updates = data.model_dump(exclude_unset=True)
    if "name" in updates:
        updates["name"] = updates["name"].strip()
        if not updates["name"]:
            raise HTTPException(400, "Nome do studio é obrigatório")
        updates["slug"] = await unique_studio_slug(updates["name"], studio_id)
    if "license_expires_at" in updates and updates["license_expires_at"] is not None:
        updates["license_expires_at"] = updates["license_expires_at"].isoformat()
    manager_fields = {"manager_name", "manager_phone", "manager_email", "manager_password"}
    manager_updates = {k: updates.pop(k) for k in list(updates) if k in manager_fields}
    manager = await db.users.find_one({"studio_id": studio_id, "role": "manager"})
    if manager_updates:
        user_updates = {}
        if "manager_name" in manager_updates: user_updates["name"] = manager_updates["manager_name"].strip()
        if "manager_phone" in manager_updates:
            user_updates["phone"] = manager_updates["manager_phone"] or ""
            user_updates["phone_digits"] = _norm_phone(manager_updates["manager_phone"])
        if "manager_email" in manager_updates: user_updates["email"] = str(manager_updates["manager_email"]).lower()
        if "manager_password" in manager_updates: user_updates["password_hash"] = hash_password(manager_updates["manager_password"])
        if "email" in user_updates and await db.users.find_one({"email": user_updates["email"], "id": {"$ne": manager["id"] if manager else None}}):
            raise HTTPException(400, "E-mail do gerente já está em uso")
        if manager:
            await db.users.update_one({"id": manager["id"]}, {"$set": user_updates})
        elif {"name", "email", "password_hash"} <= set(user_updates):
            await db.users.insert_one({"id": uid(), "studio_id": studio_id, "role": "manager",
                                       "name": user_updates["name"], "email": user_updates["email"],
                                       "phone": user_updates.get("phone", ""), "phone_digits": user_updates.get("phone_digits", ""),
                                       "password_hash": user_updates["password_hash"], "created_at": now_utc().isoformat()})
        else:
            raise HTTPException(400, "Informe nome, e-mail e senha do gerente")
    result = await db.studios.update_one({"id": studio_id}, {"$set": updates})
    if not result.matched_count:
        raise HTTPException(404, "Studio não encontrado")
    doc = await db.studios.find_one({"id": studio_id}, {"_id": 0})
    return await studio_response(doc)

@api.get("/public/studios/{slug}/config")
async def public_studio_config(slug: str):
    studio = await db.studios.find_one({"slug": slug, "active": {"$ne": False}}, {"_id": 0})
    if not studio:
        raise HTTPException(404, "Studio não encontrado")
    settings = await db.settings.find_one({"key": "studio", "studio_id": studio["id"]}, {"_id": 0})
    logo_url = (settings or {}).get("logo_url", "")
    if logo_url.startswith("/api/files/"):
        logo_path = logo_url[len("/api/files/"):]
        logo_url = f"/api/public/studios/{studio['slug']}/logo?path={quote(logo_path)}"
    return {"studio_id": studio["id"], "slug": studio["slug"],
            "name": (settings or {}).get("name") or studio["name"],
            "logo_url": logo_url,
            "public_url": f"/studio/{studio['slug']}"}

@api.get("/public/studios/{slug}/logo")
async def public_studio_logo(slug: str, path: str):
    path = unquote(path)
    studio = await db.studios.find_one({"slug": slug, "active": {"$ne": False}}, {"_id": 0, "id": 1})
    if not studio:
        raise HTTPException(404, "Studio não encontrado")
    settings = await db.settings.find_one({"key": "studio", "studio_id": studio["id"]}, {"_id": 0, "logo_url": 1})
    if not settings or settings.get("logo_url") != f"/api/files/{path}":
        raise HTTPException(404, "Logo não encontrada")
    record = await db.files.find_one(
        {"studio_id": studio["id"], "storage_path": path, "is_deleted": False},
        {"_id": 0, "content_type": 1},
    )
    if not record:
        raise HTTPException(404, "Logo não encontrada")
    try:
        data, content_type = await run_in_threadpool(get_object, path)
    except FileNotFoundError:
        raise HTTPException(404, "Logo não encontrada")
    except Exception as exc:
        logger.exception("Failed to download public logo for studio %s", slug)
        raise HTTPException(502, f"Falha ao acessar a logo: {exc}")
    return FileResponse(
        content=data,
        media_type=record.get("content_type", content_type),
        headers={"Cache-Control": "public, max-age=3600"},
    )

@api.get("/public/studios/{slug}/manifest")
async def public_studio_manifest(slug: str):
    studio = await db.studios.find_one({"slug": slug, "active": {"$ne": False}}, {"_id": 0, "id": 1, "name": 1, "slug": 1})
    if not studio:
        raise HTTPException(404, "Studio não encontrado")
    settings = await db.settings.find_one({"key": "studio", "studio_id": studio["id"]}, {"_id": 0, "name": 1, "logo_url": 1})
    logo_url = (settings or {}).get("logo_url", "")
    icons = []
    if logo_url.startswith("/api/files/"):
        logo_path = logo_url[len("/api/files/"):]
        icons.append({
            "src": f"/api/public/studios/{studio['slug']}/logo?path={quote(logo_path)}",
            "sizes": "512x512",
            "purpose": "any maskable",
        })
    return {
        "short_name": (settings or {}).get("name") or studio["name"],
        "name": (settings or {}).get("name") or studio["name"],
        "description": f"Agendamento do {(settings or {}).get('name') or studio['name']}",
        "start_url": f"/studio/{studio['slug']}",
        "scope": f"/studio/{studio['slug']}",
        "display": "standalone",
        "theme_color": "#0a0a0a",
        "background_color": "#0a0a0a",
        "lang": "pt-BR",
        "icons": icons,
    }

# =========================
# Media / file storage
# =========================
@api.post("/upload")
async def upload_file(file: UploadFile = File(...), folder: str = Form("misc"),
                      user: dict = Depends(require_role("manager", "professional"))):
    ext = (file.filename or "").rsplit(".", 1)[-1].lower() if "." in (file.filename or "") else "bin"
    content_type = MIME_TYPES.get(ext)
    if not content_type:
        raise HTTPException(400, "Formato inválido. Envie JPG, PNG, WEBP ou GIF.")
    data = await file.read()
    if len(data) > 8 * 1024 * 1024:
        raise HTTPException(400, "Imagem muito grande (máx. 8MB).")
    folder = re.sub(r"[^a-z0-9_-]", "", (folder or "misc").lower()) or "misc"
    path = f"{APP_NAME}/{folder}/{uid()}.{ext}"
    try:
        result = await run_in_threadpool(put_object, path, data, content_type)
    except Exception as exc:
        logger.exception("Failed to upload file %s", file.filename)
        raise HTTPException(502, f"Falha ao salvar a imagem: {exc}")
    canonical = result["path"]
    await db.files.insert_one({
        "id": uid(),
        "storage_path": canonical,
        "original_filename": file.filename,
        "content_type": content_type,
        "size": result.get("size", len(data)),
        "uploaded_by": user["id"],
        "studio_id": tenant_id(user),
        "is_deleted": False,
        "created_at": now_utc().isoformat(),
    })
    return {"path": canonical, "url": f"/api/files/{canonical}"}

@api.get("/files/{path:path}")
async def download_file(path: str, user: dict = Depends(get_current_user)):
    record = await db.files.find_one(tenant_query(user, {"storage_path": path, "is_deleted": False}))
    if not record:
        raise HTTPException(404, "Arquivo não encontrado")
    try:
        data, content_type = await run_in_threadpool(get_object, path)
    except FileNotFoundError:
        raise HTTPException(404, "Arquivo não encontrado")
    except Exception as exc:
        logger.exception("Failed to download file %s", path)
        raise HTTPException(502, f"Falha ao acessar o armazenamento: {exc}")
    return FileResponse(content=data, media_type=record.get("content_type", content_type),
                        headers={"Cache-Control": "public, max-age=31536000"})

# =========================
# Gallery (antes e depois)
# =========================
@api.get("/gallery")
async def list_gallery(user: dict = Depends(get_current_user)):
    docs = await db.gallery.find(tenant_query(user, {"is_deleted": {"$ne": True}}), {"_id": 0}).sort("created_at", -1).to_list(1000)
    return docs

@api.post("/gallery")
async def create_gallery(data: GalleryIn, user: dict = Depends(require_role("manager", "professional"))):
    doc = data.model_dump()
    doc["id"] = uid()
    doc["is_deleted"] = False
    doc["created_by"] = user["id"]
    doc["studio_id"] = tenant_id(user)
    doc["created_at"] = now_utc().isoformat()
    await db.gallery.insert_one(doc)
    doc.pop("_id", None)
    return doc

@api.delete("/gallery/{gid}")
async def delete_gallery(gid: str, user: dict = Depends(require_role("manager", "professional"))):
    await db.gallery.update_one(tenant_query(user, {"id": gid}), {"$set": {"is_deleted": True}})
    return {"ok": True}

# =========================
# Services
# =========================
async def _attach_pros(services: list, user: Optional[dict] = None) -> list:
    pros = await db.professionals.find(tenant_query(user, {}) if user else {}, {"_id": 0, "id": 1, "name": 1, "service_ids": 1}).to_list(1000)
    for s in services:
        linked = [p for p in pros if s["id"] in (p.get("service_ids") or [])]
        s["professional_ids"] = [p["id"] for p in linked]
        s["professional_names"] = [p["name"] for p in linked]
    return services

async def _sync_service_pros(sid: str, professional_ids: List[str], user: dict):
    tq = tenant_query(user)
    await db.professionals.update_many({**tq, "service_ids": sid, "id": {"$nin": professional_ids}},
                                       {"$pull": {"service_ids": sid}})
    if professional_ids:
        await db.professionals.update_many({**tq, "id": {"$in": professional_ids}},
                                           {"$addToSet": {"service_ids": sid}})

@api.get("/services")
async def list_services(user: dict = Depends(get_current_user)):
    docs = await db.services.find(tenant_query(user, {}), {"_id": 0}).to_list(1000)
    docs = await _attach_pros(docs, user)
    if user.get("role") == "professional":
        docs = [doc for doc in docs if user["id"] in (doc.get("professional_ids") or [])]
    return docs

@api.post("/services")
async def create_service(data: ServiceIn, user: dict = Depends(require_role("manager"))):
    doc = data.model_dump(exclude={"professional_ids"})
    doc["id"] = uid()
    doc["created_at"] = now_utc().isoformat()
    doc["studio_id"] = tenant_id(user)
    await db.services.insert_one(doc)
    await _sync_service_pros(doc["id"], data.professional_ids, user)
    doc.pop("_id", None)
    return (await _attach_pros([doc], user))[0]

@api.put("/services/{sid}")
async def update_service(sid: str, data: ServiceIn, user: dict = Depends(require_role("manager"))):
    await db.services.update_one(tenant_query(user, {"id": sid}), {"$set": data.model_dump(exclude={"professional_ids"})})
    await _sync_service_pros(sid, data.professional_ids, user)
    doc = await db.services.find_one(tenant_query(user, {"id": sid}), {"_id": 0})
    if not doc: raise HTTPException(404, "Serviço não encontrado")
    return (await _attach_pros([doc], user))[0]

@api.delete("/services/{sid}")
async def delete_service(sid: str, user: dict = Depends(require_role("manager"))):
    await db.services.delete_one(tenant_query(user, {"id": sid}))
    await db.professionals.update_many(tenant_query(user, {"service_ids": sid}), {"$pull": {"service_ids": sid}})
    return {"ok": True}

@api.put("/professionals/me/services")
async def set_my_services(data: ProServicesIn, user: dict = Depends(require_role("professional"))):
    await db.professionals.update_one(tenant_query(user, {"id": user["id"]}), {"$set": {"service_ids": data.service_ids}})
    return await db.professionals.find_one(tenant_query(user, {"id": user["id"]}), {"_id": 0})

# =========================
# Professionals
# =========================
@api.get("/professionals")
async def list_professionals(user: dict = Depends(get_current_user)):
    docs = await db.professionals.find(tenant_query(user, {}), {"_id": 0}).to_list(1000)
    return docs

@api.post("/professionals")
async def create_professional(data: ProfessionalIn, user: dict = Depends(require_role("manager"))):
    email = data.email.lower()
    if await db.users.find_one(tenant_query(user, {"email": email})):
        raise HTTPException(400, "E-mail já em uso")
    if not data.password:
        raise HTTPException(400, "Senha inicial obrigatória")
    if len(_norm_phone(data.phone)) < 8:
        raise HTTPException(400, "Telefone/WhatsApp do profissional é obrigatório")
    pro_id = uid()
    user_doc = {
        "id": pro_id,
        "email": email,
        "name": data.name,
        "phone": data.phone or "",
        "password_hash": hash_password(data.password),
        "role": "professional",
        "studio_id": tenant_id(user),
        "created_at": now_utc().isoformat(),
    }
    await db.users.insert_one(user_doc)
    pro = data.model_dump(exclude={"password"})
    pro["id"] = pro_id
    pro["email"] = email
    pro["created_at"] = now_utc().isoformat()
    pro["studio_id"] = tenant_id(user)
    await db.professionals.insert_one(pro)
    pro.pop("_id", None)
    return pro

@api.put("/professionals/{pid}")
async def update_professional(pid: str, data: ProfessionalUpdate,
                              user: dict = Depends(get_current_user)):
    if user["role"] not in ("manager",) and user["id"] != pid:
        raise HTTPException(403, "Sem permissão")
    updates = {k: v for k, v in data.model_dump(exclude_unset=True).items() if k != "password"}
    if "phone" in updates and len(_norm_phone(updates["phone"])) < 8:
        raise HTTPException(400, "Telefone/WhatsApp do profissional é obrigatório")
    if updates:
        await db.professionals.update_one(tenant_query(user, {"id": pid}), {"$set": updates})
        if "phone" in updates:
            await db.users.update_one(tenant_query(user, {"id": pid}), {"$set": {"phone": updates["phone"]}})
    if data.password:
        await db.users.update_one(tenant_query(user, {"id": pid}), {"$set": {"password_hash": hash_password(data.password)}})
    doc = await db.professionals.find_one(tenant_query(user, {"id": pid}), {"_id": 0})
    if not doc: raise HTTPException(404, "Profissional não encontrado")
    return doc

@api.delete("/professionals/{pid}")
async def delete_professional(pid: str, user: dict = Depends(require_role("manager"))):
    await db.professionals.delete_one(tenant_query(user, {"id": pid}))
    await db.users.delete_one(tenant_query(user, {"id": pid}))
    return {"ok": True}

# =========================
# Clients
# =========================
@api.get("/clients")
async def list_clients(scope: Optional[str] = None, user: dict = Depends(get_current_user)):
    if user["role"] == "client":
        raise HTTPException(403, "Sem permissão")
    q = tenant_query(user, {"role": "client"})
    if user["role"] == "professional" and scope == "all":
        docs = await db.users.find(q, {"_id": 0, "id": 1, "name": 1, "phone": 1}).sort("name", 1).to_list(2000)
        return docs
    if user["role"] == "professional":
        # only clients this professional attended
        appts = await db.appointments.find(
            tenant_query(user, {"items.professional_id": user["id"]}), {"client_id": 1, "_id": 0}
        ).to_list(2000)
        cids = list({a["client_id"] for a in appts if a.get("client_id")})
        q["id"] = {"$in": cids}
    docs = await db.users.find(q, {"_id": 0, "password_hash": 0}).to_list(2000)
    return docs

# =========================
# Blocks
# =========================
@api.get("/blocks")
async def list_blocks(professional_id: Optional[str] = None,
                      user: dict = Depends(get_current_user)):
    q = tenant_query(user, {})
    if professional_id:
        q["professional_id"] = professional_id
    elif user["role"] == "professional":
        q["professional_id"] = user["id"]
    docs = await db.blocks.find(q, {"_id": 0}).to_list(1000)
    return docs

@api.post("/blocks")
async def create_block(data: BlockIn, user: dict = Depends(get_current_user)):
    if user["role"] == "professional" and user["id"] != data.professional_id:
        raise HTTPException(403, "Sem permissão")
    if user["role"] == "client":
        raise HTTPException(403, "Sem permissão")
    if not await _professional(data.professional_id, user):
        raise HTTPException(404, "Profissional não encontrado")
    doc = data.model_dump()
    doc["start"] = doc["start"].isoformat()
    doc["end"] = doc["end"].isoformat()
    doc["id"] = uid()
    doc["created_at"] = now_utc().isoformat()
    doc["studio_id"] = tenant_id(user)
    await db.blocks.insert_one(doc)
    doc.pop("_id", None)
    return doc

@api.delete("/blocks/{bid}")
async def delete_block(bid: str, user: dict = Depends(get_current_user)):
    b = await db.blocks.find_one(tenant_query(user, {"id": bid}))
    if not b:
        raise HTTPException(404, "Bloqueio não encontrado")
    if user["role"] == "professional" and user["id"] != b["professional_id"]:
        raise HTTPException(403, "Sem permissão")
    if user["role"] == "client":
        raise HTTPException(403, "Sem permissão")
    await db.blocks.delete_one(tenant_query(user, {"id": bid}))
    return {"ok": True}

# =========================
# Coupons
# =========================
@api.get("/coupons")
async def list_coupons(user: dict = Depends(get_current_user)):
    if user["role"] == "client":
        docs = await db.coupons.find(
            tenant_query(user, {"active": True, "$or": [{"client_id": None}, {"client_id": {"$exists": False}}, {"client_id": user["id"]}]}),
            {"_id": 0}).to_list(500)
        return docs
    if user["role"] == "professional":
        docs = await db.coupons.find(
            tenant_query(user, {"$or": [{"scope": "studio"}, {"professional_id": user["id"]}]}), {"_id": 0}
        ).to_list(500)
        return docs
    docs = await db.coupons.find(tenant_query(user, {}), {"_id": 0}).to_list(500)
    return docs

@api.post("/coupons")
async def create_coupon(data: CouponIn, user: dict = Depends(get_current_user)):
    if user["role"] == "client":
        raise HTTPException(403, "Sem permissão")
    doc = data.model_dump()
    if user["role"] == "professional":
        # check permission
        pro = await db.professionals.find_one(tenant_query(user, {"id": user["id"]}))
        if not pro or not pro.get("can_create_coupons"):
            raise HTTPException(403, "Criação de cupons desabilitada para este profissional")
        # force scope
        doc["scope"] = "professional"
        doc["professional_id"] = user["id"]
    if doc["scope"] == "professional" and not doc.get("professional_id"):
        raise HTTPException(400, "Cupom de profissional exige professional_id")
    if doc.get("professional_id") and not await _professional(doc["professional_id"], user):
        raise HTTPException(404, "Profissional não encontrado")
    doc["code"] = doc["code"].upper().strip()
    doc["id"] = uid()
    doc["uses"] = 0
    doc["created_at"] = now_utc().isoformat()
    doc["studio_id"] = tenant_id(user)
    if doc.get("valid_from"):
        doc["valid_from"] = doc["valid_from"].isoformat()
    if doc.get("valid_until"):
        doc["valid_until"] = doc["valid_until"].isoformat()
    try:
        await db.coupons.insert_one(doc)
    except Exception:
        raise HTTPException(400, "Código de cupom já existe")
    doc.pop("_id", None)
    return doc

@api.delete("/coupons/{cid}")
async def delete_coupon(cid: str, user: dict = Depends(get_current_user)):
    c = await db.coupons.find_one(tenant_query(user, {"id": cid}))
    if not c:
        raise HTTPException(404, "Cupom não encontrado")
    if user["role"] == "client":
        raise HTTPException(403, "Sem permissão")
    if user["role"] == "professional":
        if c.get("professional_id") != user["id"]:
            raise HTTPException(403, "Sem permissão")
    await db.coupons.delete_one(tenant_query(user, {"id": cid}))
    return {"ok": True}

# =========================
# Availability engine
# =========================
DOW = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]

def _dt(v):
    if isinstance(v, str):
        return datetime.fromisoformat(v)
    return v

async def _get_active_appointments(user: Optional[dict] = None):
    q = {"status": {"$nin": ["cancelled", "refused"]}}
    return await db.appointments.find(tenant_query(user, q) if user else q, {"_id": 0}).to_list(5000)

async def _get_blocks_for(pid: str, user: Optional[dict] = None):
    return await db.blocks.find(tenant_query(user, {"professional_id": pid}) if user else {"professional_id": pid}, {"_id": 0}).to_list(1000)

async def _service(sid: str, user: Optional[dict] = None):
    return await db.services.find_one(tenant_query(user, {"id": sid}) if user else {"id": sid}, {"_id": 0})

async def _professional(pid: str, user: Optional[dict] = None):
    return await db.professionals.find_one(tenant_query(user, {"id": pid}) if user else {"id": pid}, {"_id": 0})

def _overlaps(a_start, a_end, b_start, b_end) -> bool:
    return a_start < b_end and b_start < a_end

async def _slot_ok(professional_id: str, start: datetime, service: dict,
                   ignore_appt_id: Optional[str] = None,
                   client_id: Optional[str] = None,
                   extra_client_intervals: Optional[list] = None,
                   user: Optional[dict] = None,
                   skip_hours: bool = False) -> tuple[bool, str]:
    """Check availability: working hours, blocks, other appointments (pro + client)."""
    duration = timedelta(minutes=service["duration_min"])
    cleanup = timedelta(minutes=service.get("cleanup_min", 0))
    end = start + duration
    end_with_cleanup = end + cleanup

    pro = await _professional(professional_id, user)
    if not pro or not pro.get("active", True):
        return False, "Profissional indisponível"

    wh = (pro.get("working_hours") or {}).get(DOW[start.weekday()])
    if not wh or wh.get("closed"):
        # fallback studio hours
        settings = await db.settings.find_one(tenant_query(user, {"key": "studio"}) if user else {"key": "studio"})
        wh = (settings.get("opening_hours") or {}).get(DOW[start.weekday()]) if settings else None
    if skip_hours:
        pass
    elif not wh or wh.get("closed"):
        return False, "Fora do horário de funcionamento"
    else:
        try:
            oh, om = map(int, wh["open"].split(":"))
            ch, cm = map(int, wh["close"].split(":"))
        except Exception:
            return False, "Horário de funcionamento inválido"
        day_open = start.replace(hour=oh, minute=om, second=0, microsecond=0)
        day_close = start.replace(hour=ch, minute=cm, second=0, microsecond=0)
        if start < day_open or end > day_close:
            return False, "Fora do horário de trabalho"

    # blocks
    blocks = await _get_blocks_for(professional_id, user)
    for b in blocks:
        if _overlaps(start, end, _dt(b["start"]), _dt(b["end"])):
            return False, f"Conflito com bloqueio ({b.get('reason','')})"

    # other appointments for this professional
    appts = await _get_active_appointments(user)
    for a in appts:
        if ignore_appt_id and a["id"] == ignore_appt_id:
            continue
        for it in a["items"]:
            if it["professional_id"] != professional_id:
                continue
            svc = await _service(it["service_id"], user)
            it_start = _dt(it["start"])
            it_dur = timedelta(minutes=svc["duration_min"])
            it_clean = timedelta(minutes=svc.get("cleanup_min", 0))
            it_end = it_start + it_dur + it_clean
            # our end includes cleanup as well
            if _overlaps(start, end_with_cleanup, it_start, it_end):
                return False, "Conflito de agenda do profissional"

    # client conflict (same client cannot double-book)
    if client_id:
        for a in appts:
            if ignore_appt_id and a["id"] == ignore_appt_id:
                continue
            if a.get("client_id") != client_id:
                continue
            for it in a["items"]:
                svc = await _service(it["service_id"], user)
                it_start = _dt(it["start"])
                it_end = it_start + timedelta(minutes=svc["duration_min"])
                if _overlaps(start, end, it_start, it_end):
                    return False, "Conflito com outro procedimento da cliente"

    # extra intervals passed in (multi-item pre-check within same booking)
    if extra_client_intervals:
        for (s, e) in extra_client_intervals:
            if _overlaps(start, end, s, e):
                return False, "Conflito entre procedimentos deste agendamento"

    return True, "ok"

@api.get("/availability")
async def availability(professional_id: str, service_id: str, day: str,
                       client_id: Optional[str] = None,
                       user: dict = Depends(get_current_user)):
    """Return available start times for given service+pro+day (YYYY-MM-DD)."""
    svc = await _service(service_id, user)
    if not svc:
        raise HTTPException(404, "Serviço não encontrado")
    y, m, d = map(int, day.split("-"))
    day_start = datetime(y, m, d, 0, 0, tzinfo=timezone.utc)
    step = timedelta(minutes=30)
    slots = []
    # scan whole day
    cursor = day_start.replace(hour=6)
    end_scan = day_start.replace(hour=22)
    effective_client = client_id or (user["id"] if user["role"] == "client" else None)
    while cursor < end_scan:
        ok, _ = await _slot_ok(professional_id, cursor, svc, client_id=effective_client, user=user)
        if ok:
            slots.append(cursor.isoformat())
        cursor += step
    return {"slots": slots}

@api.get("/emergency-openings")
async def emergency_openings(service_id: str, day: str,
                             professional_id: Optional[str] = None,
                             user: dict = Depends(require_role("manager"))):
    """Find the nearest same-day openings, optionally across all professionals."""
    svc = await _service(service_id, user)
    if not svc:
        raise HTTPException(404, "Serviço não encontrado")
    try:
        y, m, d = map(int, day.split("-"))
        day_start = datetime(y, m, d, 0, 0, tzinfo=timezone.utc)
    except ValueError:
        raise HTTPException(400, "Data inválida")
    pros_query = tenant_query(user, {"active": {"$ne": False}})
    if professional_id:
        pros_query["id"] = professional_id
    pros = await db.professionals.find(pros_query, {"_id": 0, "id": 1, "name": 1}).to_list(1000)
    if professional_id and not pros:
        raise HTTPException(404, "Profissional não encontrado")
    now = now_utc()
    cursor = day_start.replace(hour=6)
    if day_start.date() == now.date():
        cursor = max(cursor, now.replace(second=0, microsecond=0))
        minute = cursor.minute % 30
        if minute:
            cursor += timedelta(minutes=30 - minute)
    end_scan = day_start.replace(hour=22)
    openings = []
    for pro in pros:
        cursor_pro = cursor
        while cursor_pro < end_scan:
            ok, _ = await _slot_ok(pro["id"], cursor_pro, svc,
                                    client_id=user["id"] if user["role"] == "client" else None,
                                    user=user)
            if ok:
                openings.append({
                    "professional_id": pro["id"],
                    "professional_name": pro.get("name", ""),
                    "start": cursor_pro.isoformat(),
                })
            cursor_pro += timedelta(minutes=30)
    openings.sort(key=lambda item: item["start"])
    return {"service_id": service_id, "day": day, "openings": openings[:50]}

# =========================
# Coupon validation
# =========================
async def _validate_coupon(code: str, items_info: list, client_id: str, user: Optional[dict] = None) -> dict:
    """Returns {coupon, discount_amount, applies_to_item_indices}."""
    code = (code or "").upper().strip()
    if not code:
        return {"coupon": None, "discount": 0, "applies_to": []}
    coupon = await db.coupons.find_one(tenant_query(user, {"code": code}) if user else {"code": code}, {"_id": 0})
    if not coupon:
        raise HTTPException(400, "Cupom inválido")
    if not coupon.get("active"):
        raise HTTPException(400, "Cupom indisponível")
    if coupon.get("client_id") and coupon["client_id"] != client_id:
        raise HTTPException(400, "Este cupom é pessoal e pertence a outra cliente")
    now = now_utc()
    if coupon.get("valid_from") and _dt(coupon["valid_from"]) > now:
        raise HTTPException(400, "Cupom ainda não iniciou")
    if coupon.get("valid_until") and _dt(coupon["valid_until"]) < now:
        raise HTTPException(400, "Cupom expirado")
    if coupon.get("max_uses") is not None and coupon.get("uses", 0) >= coupon["max_uses"]:
        raise HTTPException(400, "Cupom atingiu limite de usos")
    if coupon.get("max_uses_per_client") is not None and client_id:
        client_uses = await db.appointments.count_documents(
            tenant_query(user, {"client_id": client_id, "coupon_code": code}) if user else {"client_id": client_id, "coupon_code": code}
        )
        if client_uses >= coupon["max_uses_per_client"]:
            raise HTTPException(400, "Limite de usos por cliente atingido")
    applies = []
    total_eligible = 0.0
    for idx, (pid, sid, price) in enumerate(items_info):
        if coupon["scope"] == "professional" and coupon.get("professional_id") != pid:
            continue
        if coupon.get("service_ids") and sid not in coupon["service_ids"]:
            continue
        applies.append(idx)
        total_eligible += price
    if not applies:
        raise HTTPException(400, "Cupom não aplicável aos serviços selecionados")
    if coupon.get("min_value") and total_eligible < coupon["min_value"]:
        raise HTTPException(400, f"Valor mínimo de R$ {coupon['min_value']:.2f} não atingido")
    discount = round(total_eligible * coupon["discount_percent"] / 100.0, 2)
    return {"coupon": coupon, "discount": discount, "applies_to": applies}

@api.post("/coupons/validate")
async def coupon_validate(payload: dict, user: dict = Depends(get_current_user)):
    """payload: {code, items:[{professional_id, service_id}]}"""
    code = payload.get("code")
    items = payload.get("items", [])
    items_info = []
    subtotal = 0.0
    for it in items:
        svc = await _service(it["service_id"], user)
        if not svc:
            raise HTTPException(400, "Serviço inválido no carrinho")
        items_info.append((it["professional_id"], it["service_id"], svc["price"]))
        subtotal += svc["price"]
    result = await _validate_coupon(code, items_info, user["id"] if user["role"] == "client" else "", user)
    return {"subtotal": subtotal, "discount": result["discount"],
            "total": subtotal - result["discount"],
            "coupon": result["coupon"], "applies_to": result["applies_to"]}

# =========================
# Notifications
# =========================
async def notify(user_id: str, title: str, body: str, appt_id: Optional[str] = None,
                 studio_id: Optional[str] = None):
    if studio_id is None:
        recipient = await db.users.find_one({"id": user_id}, {"studio_id": 1})
        studio_id = (recipient or {}).get("studio_id")
    await db.notifications.insert_one({
        "id": uid(),
        "user_id": user_id,
        "title": title,
        "body": body,
        "appointment_id": appt_id,
        "read": False,
        "created_at": now_utc().isoformat(),
        "studio_id": studio_id,
    })

@api.get("/notifications")
async def list_notifications(user: dict = Depends(get_current_user)):
    docs = await db.notifications.find(tenant_query(user, {"user_id": user["id"]}), {"_id": 0}).sort(
        "created_at", -1).to_list(200)
    return docs

@api.post("/notifications/{nid}/read")
async def read_notif(nid: str, user: dict = Depends(get_current_user)):
    await db.notifications.update_one(
        tenant_query(user, {"id": nid, "user_id": user["id"]}), {"$set": {"read": True}}
    )
    return {"ok": True}

# =========================
# Appointments
# =========================
async def _build_summary(appt: dict) -> dict:
    """Enrich appointment with names + totals."""
    appt = {k: v for k, v in appt.items() if k != "_id"}
    settings = await db.settings.find_one(tenant_query(appt, {"key": "studio"}) if appt.get("studio_id") else {"key": "studio"}) or {}
    signal_percent = settings.get("default_signal_percent", 30)
    item_details = []
    subtotal = 0.0
    for it in appt["items"]:
        svc = await _service(it["service_id"], {"studio_id": appt.get("studio_id"), "role": "manager"})
        pro = await _professional(it["professional_id"], {"studio_id": appt.get("studio_id"), "role": "manager"})
        subtotal += svc["price"] if svc else 0
        item_details.append({
            **it,
            "service_name": svc["name"] if svc else "?",
            "duration_min": svc["duration_min"] if svc else 0,
            "price": svc["price"] if svc else 0,
            "professional_name": pro["name"] if pro else "?",
        })
    discount = appt.get("discount", 0)
    total = subtotal - discount
    signal_value = round(total * signal_percent / 100.0, 2)
    return {
        **appt,
        "items": item_details,
        "subtotal": subtotal,
        "discount": discount,
        "total": total,
        "signal_percent": signal_percent,
        "signal_value": signal_value,
    }

@api.post("/appointments")
async def create_appointment(data: BookingIn, user: dict = Depends(get_current_user)):
    if not data.items:
        raise HTTPException(400, "Nenhum procedimento informado")
    if data.quick and user.get("role") not in ("manager", "professional"):
        raise HTTPException(403, "Encaixe rápido disponível apenas para a equipe")
    if user.get("role") == "professional" and any(it.professional_id != user["id"] for it in data.items):
        raise HTTPException(403, "Profissional só pode agendar na própria agenda")

    # determine client
    client_id = None
    client_name = ""
    client_phone = ""
    if user["role"] == "client":
        client_id = user["id"]
        client_name = user["name"]
        client_phone = user.get("phone", "")
    else:
        # manager/professional creating on behalf
        if data.client_id:
            u = await db.users.find_one(tenant_query(user, {"id": data.client_id}))
            if not u:
                raise HTTPException(400, "Cliente não encontrado")
            client_id = u["id"]
            client_name = u["name"]
            client_phone = u.get("phone", "")
        elif data.client_name:
            client_name = data.client_name
            client_phone = data.client_phone or ""
        else:
            raise HTTPException(400, "Informe o cliente")

    # verify each item availability, including intra-booking conflicts
    intervals = []
    items_info = []
    for it in data.items:
        svc = await _service(it.service_id, user)
        if not svc:
            raise HTTPException(400, "Serviço inválido")
        pro = await _professional(it.professional_id, user)
        if not pro or it.service_id not in (pro.get("service_ids") or []):
            raise HTTPException(400, f"{(pro or {}).get('name', 'Profissional')} não realiza o serviço {svc['name']}")
        start = it.start
        if start.tzinfo is None:
            start = start.replace(tzinfo=timezone.utc)
        end = start + timedelta(minutes=svc["duration_min"])
        is_staff = user["role"] in ("manager", "professional")
        if not (is_staff and data.force):
            ok, msg = await _slot_ok(it.professional_id, start, svc,
                                     client_id=client_id,
                                     user=user,
                                     extra_client_intervals=intervals,
                                     skip_hours=bool(is_staff and data.quick))
            if not ok:
                raise HTTPException(409, msg)
        intervals.append((start, end))
        items_info.append((it.professional_id, it.service_id, svc["price"]))

    # coupon
    discount = 0.0
    if data.coupon_code:
        cval = await _validate_coupon(
            data.coupon_code, items_info, client_id or "", user
        )
        discount = cval["discount"]

    initial_status = "confirmed" if (data.quick and user["role"] in ("manager", "professional")) else "waiting"
    appt = {
        "id": uid(),
        "client_id": client_id,
        "client_name": client_name,
        "client_phone": client_phone,
        "items": [
            {
                "id": uid(),
                "professional_id": it.professional_id,
                "service_id": it.service_id,
                "start": (it.start if it.start.tzinfo else it.start.replace(tzinfo=timezone.utc)).isoformat(),
                "status": initial_status,
            }
            for it in data.items
        ],
        "status": initial_status,
        "quick": data.quick,
        "forced": bool(data.force),
        "coupon_code": data.coupon_code.upper().strip() if data.coupon_code else None,
        "discount": discount,
        "notes": data.notes or "",
        "signal_paid": False,
        "created_by": user["id"],
        "created_at": now_utc().isoformat(),
        "studio_id": tenant_id(user),
    }
    await db.appointments.insert_one(appt)
    if data.coupon_code:
        await db.coupons.update_one(tenant_query(user, {"code": appt["coupon_code"]}), {"$inc": {"uses": 1}})

    # notify professionals
    for it in data.items:
        title = "Encaixe confirmado" if initial_status == "confirmed" else "Nova solicitação de agendamento"
        await notify(it.professional_id, title,
                     f"Cliente {client_name} — {'encaixe rápido' if data.quick else 'solicitou um horário'}.", appt["id"])
    # notify client
    if client_id:
        await notify(client_id, "Agendamento solicitado",
                     "Seu pedido foi enviado. Aguarde confirmação.", appt["id"])

    return await _build_summary(appt)

class RescheduleIn(BaseModel):
    item_id: str
    start: datetime
    force: bool = False

@api.post("/appointments/{aid}/reschedule")
async def reschedule_appointment(aid: str, data: RescheduleIn, user: dict = Depends(require_role("manager", "professional"))):
    appt = await db.appointments.find_one(tenant_query(user, {"id": aid}), {"_id": 0})
    if not appt:
        raise HTTPException(404, "Agendamento não encontrado")
    if appt.get("status") in ("cancelled", "refused", "completed"):
        raise HTTPException(400, "Este agendamento não pode mais ser movido")
    item = next((it for it in appt["items"] if it["id"] == data.item_id), None)
    if not item:
        raise HTTPException(404, "Procedimento não encontrado")
    if user["role"] == "professional" and item["professional_id"] != user["id"]:
        raise HTTPException(403, "Só é possível mover horários da própria agenda")
    svc = await _service(item["service_id"], user)
    if not svc:
        raise HTTPException(400, "Serviço inválido")
    start = data.start if data.start.tzinfo else data.start.replace(tzinfo=timezone.utc)
    if not data.force:
        ok, msg = await _slot_ok(item["professional_id"], start, svc, ignore_appt_id=aid,
                                 client_id=appt.get("client_id"), user=user, skip_hours=bool(appt.get("quick")))
        if not ok:
            raise HTTPException(409, msg)
    await db.appointments.update_one(
        {"id": aid, "items.id": data.item_id},
        {"$set": {"items.$.start": start.isoformat(), "rescheduled_at": now_utc().isoformat(),
                  "rescheduled_by": user["id"], "forced": bool(appt.get("forced") or data.force)}})
    updated = await db.appointments.find_one({"id": aid}, {"_id": 0})
    if appt.get("client_id"):
        await notify(appt["client_id"], "Horário alterado",
                     f"{svc['name']} foi movido para {_fmt_br(start.isoformat())}.", aid)
    return await _build_summary(updated)

def _reminder_text(studio: str, client_name: str, it: dict, when_label: str) -> str:
    first = (client_name or "").split(" ")[0]
    hhmm = _dt(it["start"]).astimezone(BR_TZ).strftime("%H:%M")
    return "\n".join([
        f"✨ *{studio}* ✨", "",
        f"Olá, {first}! Passando para lembrar do seu horário {when_label} 💛", "",
        f"💅 *{it['service_name']}* com {it['professional_name']}",
        f"   🕒 {hhmm} ({_dt(it['start']).astimezone(BR_TZ).strftime('%d/%m')})", "",
        "Pode confirmar sua presença respondendo aqui? Se precisar remarcar, é só avisar 🌸",
    ])

@api.get("/appointments/reminders")
async def appointment_reminders(day: Optional[str] = None, professional_id: Optional[str] = None,
                                user: dict = Depends(require_role("manager", "professional"))):
    today_br = now_utc().astimezone(BR_TZ).date()
    target = date.fromisoformat(day) if day else today_br + timedelta(days=1)
    day_start = datetime.combine(target, time.min, tzinfo=BR_TZ)
    day_end = day_start + timedelta(days=1)
    q = tenant_query(user, {"status": {"$in": ["confirmed", "waiting", "signal_paid", "signal_pending"]}})
    pid = user["id"] if user["role"] == "professional" else professional_id
    if pid:
        q["items.professional_id"] = pid
    settings = await db.settings.find_one(tenant_query(user, {"key": "studio"})) or {}
    studio = settings.get("name") or "Studio"
    when_label = "amanhã" if target == today_br + timedelta(days=1) else ("hoje" if target == today_br else f"no dia {target.strftime('%d/%m')}")
    rows = []
    async for appt in db.appointments.find(q, {"_id": 0}):
        summary = await _build_summary(appt)
        for it in summary["items"]:
            st = _dt(it["start"])
            if not (day_start <= st < day_end) or (pid and it["professional_id"] != pid):
                continue
            text = _reminder_text(studio, summary.get("client_name"), it, when_label)
            phone = _wa_phone(summary.get("client_phone"))
            rows.append({"appointment_id": appt["id"], "item_id": it["id"], "start": it["start"],
                         "client_name": summary.get("client_name"), "client_phone": phone,
                         "service_name": it["service_name"], "professional_id": it["professional_id"],
                         "professional_name": it["professional_name"], "duration_min": it.get("duration_min", 0),
                         "status": summary.get("status"), "quick": bool(summary.get("quick")), "text": text,
                         "wa_url": f"https://wa.me/{phone}?text={quote(text)}" if phone else ""})
    rows.sort(key=lambda r: r["start"])
    return {"day": target.isoformat(), "label": when_label, "items": rows}

@api.get("/appointments")
async def list_appointments(user: dict = Depends(get_current_user)):
    q = tenant_query(user, {"status": {"$nin": ["completed", "cancelled", "refused"]}})
    if user["role"] == "professional":
        q["items.professional_id"] = user["id"]
    elif user["role"] == "client":
        q["client_id"] = user["id"]
    docs = await db.appointments.find(q, {"_id": 0}).sort("created_at", -1).to_list(2000)
    return [await _build_summary(d) for d in docs]

@api.post("/appointments/{aid}/status")
async def set_status(aid: str, data: StatusUpdate, user: dict = Depends(get_current_user)):
    appt = await db.appointments.find_one(tenant_query(user, {"id": aid}))
    if not appt:
        raise HTTPException(404, "Agendamento não encontrado")
    # authorization
    if user["role"] == "client":
        if appt.get("client_id") != user["id"]:
            raise HTTPException(403, "Sem permissão")
        if data.status not in ("cancelled",):
            raise HTTPException(403, "Cliente só pode cancelar")
    if user["role"] == "professional":
        pro_ids = {it["professional_id"] for it in appt["items"]}
        if user["id"] not in pro_ids:
            raise HTTPException(403, "Sem permissão")
    updates = {"status": data.status}
    if data.status == "cancelled":
        reason = (data.cancellation_reason or "").strip()
        if not reason:
            raise HTTPException(400, "Informe o motivo do cancelamento")
        summary_before = await _build_summary(appt)
        updates.update({
            "cancellation_reason": reason,
            "cancelled_at": now_utc().isoformat(),
            "cancelled_by_id": user["id"],
            "cancelled_by_name": user.get("name", ""),
            "cancelled_by_role": user.get("role", ""),
            "cancelled_subtotal": summary_before["subtotal"],
            "cancelled_discount": summary_before["discount"],
            "cancelled_total": summary_before["total"],
        })
    await db.appointments.update_one(tenant_query(user, {"id": aid}), {"$set": updates})
    # notify client
    labels = {"confirmed": "confirmado", "refused": "recusado", "cancelled": "cancelado",
              "completed": "concluído", "signal_paid": "sinal recebido"}
    updated = await db.appointments.find_one(tenant_query(user, {"id": aid}), {"_id": 0})
    summary = await _build_summary(updated)
    if appt.get("client_id"):
        if data.status == "confirmed":
            settings = await db.settings.find_one(tenant_query(user, {"key": "studio"})) or {}
            await notify(appt["client_id"], "Agendamento confirmado ✨",
                         _invite_text(summary, settings, ""), aid)
            await _reward_referral(appt["client_id"], studio_id=appt.get("studio_id"))
        else:
            await notify(appt["client_id"], f"Agendamento {labels.get(data.status, data.status)}",
                         (f"Status atualizado para {data.status}. Motivo: {updates['cancellation_reason']}"
                          if data.status == "cancelled"
                          else f"Status atualizado para {data.status}"), aid)
    return summary

BR_TZ = timezone(timedelta(hours=-3))

def _fmt_br(iso: str) -> str:
    return _dt(iso).astimezone(BR_TZ).strftime("%d/%m/%Y às %H:%M")

def _invite_text(summary: dict, settings: dict, origin: str, studio_slug: str = "") -> str:
    first = (summary.get("client_name") or "").split(" ")[0]
    studio = settings.get("name") or "Studio"
    lines = [f"✨ *{studio}* ✨", "",
             f"Olá, {first}! Seu horário está *confirmado* 💛", ""]
    for it in summary["items"]:
        lines.append(f"💅 *{it['service_name']}* com {it['professional_name']}")
        lines.append(f"   📅 {_fmt_br(it['start'])}")
    lines += ["", f"💰 Total: R$ {summary['total']:.2f}"]
    if summary.get("signal_value"):
        paid = " (pago ✅)" if summary.get("signal_paid") else ""
        lines.append(f"🔒 Sinal ({summary['signal_percent']}%): R$ {summary['signal_value']:.2f}{paid}")
    if settings.get("address"):
        lines += ["", f"📍 {settings['address']}"]
    if origin:
        booking_link = f"{origin}/login?studio={quote(studio_slug)}&next=%2Fagendamentos" if studio_slug else f"{origin}/agendamentos"
        lines += ["", f"Precisa reagendar? Acesse: {booking_link}"]
    lines += ["", "Até breve! 🌸"]
    return "\n".join(lines)

@api.get("/appointments/{aid}/invite")
async def appointment_invite(aid: str, origin: str = "", user: dict = Depends(get_current_user)):
    if user["role"] == "client":
        raise HTTPException(403, "Sem permissão")
    appt = await db.appointments.find_one(tenant_query(user, {"id": aid}), {"_id": 0})
    if not appt:
        raise HTTPException(404, "Agendamento não encontrado")
    settings = await db.settings.find_one(tenant_query(user, {"key": "studio"})) or {}
    studio = await db.studios.find_one({"id": appt.get("studio_id")}, {"_id": 0, "slug": 1})
    studio_slug = studio.get("slug", "") if studio else ""
    summary = await _build_summary(appt)
    text = _invite_text(summary, settings, origin.rstrip("/"), studio_slug)
    phone = re.sub(r"\D", "", appt.get("client_phone") or "")
    if phone and not phone.startswith("55") and len(phone) <= 11:
        phone = "55" + phone
    from urllib.parse import quote
    return {"text": text, "phone": phone, "wa_url": f"https://wa.me/{phone}?text={quote(text)}"}

def _wa_phone(raw: Optional[str]) -> str:
    phone = re.sub(r"\D", "", raw or "")
    if phone and not phone.startswith("55") and len(phone) <= 11:
        phone = "55" + phone
    return phone

def _wa_target(role: str, name: str, phone: Optional[str], text: str) -> dict:
    p = _wa_phone(phone)
    return {"role": role, "name": name, "phone": p, "text": text,
            "wa_url": f"https://wa.me/{p}?text={quote(text)}" if p else ""}

def _client_status_text(summary: dict, settings: dict, origin: str, studio_slug: str) -> str:
    status = summary.get("status")
    if status in ("confirmed", "completed"):
        return _invite_text(summary, settings, origin, studio_slug)
    first = (summary.get("client_name") or "").split(" ")[0]
    studio = settings.get("name") or "Studio"
    lines = [f"✨ *{studio}* ✨", "", f"Olá, {first}!"]
    if status in ("refused", "cancelled"):
        reason = summary.get("cancellation_reason")
        lines.append("Infelizmente seu horário foi *cancelado* 😔" if status == "cancelled" else "Não conseguimos confirmar seu horário 😔")
        if reason:
            lines.append(f"Motivo: {reason}")
    else:
        lines.append("Recebemos sua solicitação de horário e ela está *aguardando confirmação* ⏳")
    lines.append("")
    for it in summary["items"]:
        lines.append(f"💅 *{it['service_name']}* com {it['professional_name']}")
        lines.append(f"   📅 {_fmt_br(it['start'])}")
    if status in ("refused", "cancelled"):
        lines += ["", "Quer escolher outro horário? É só responder aqui 💛"]
    lines += ["", "Até breve! 🌸"]
    return "\n".join(lines)

def _pro_text(summary: dict, settings: dict, items: list, pro_name: str) -> str:
    studio = settings.get("name") or "Studio"
    first = pro_name.split(" ")[0] if pro_name else ""
    kind = "Encaixe" if summary.get("quick") else "Novo agendamento"
    status = summary.get("status")
    head = {"confirmed": "confirmado ✅", "completed": "concluído ✅", "refused": "recusado ❌",
            "cancelled": "cancelado ❌"}.get(status, "aguardando confirmação ⏳")
    lines = [f"✨ *{studio}* ✨", "", f"Olá, {first}! {kind} na sua agenda — {head}", "",
             f"👤 Cliente: *{summary.get('client_name') or '—'}*"]
    if summary.get("client_phone"):
        lines.append(f"📱 WhatsApp da cliente: {summary['client_phone']}")
    lines.append("")
    for it in items:
        lines.append(f"💅 *{it['service_name']}* — {it.get('duration_min', 0)} min")
        lines.append(f"   📅 {_fmt_br(it['start'])}")
    if summary.get("notes"):
        lines += ["", f"📝 {summary['notes']}"]
    return "\n".join(lines)

@api.get("/appointments/{aid}/whatsapp")
async def appointment_whatsapp(aid: str, origin: str = "", user: dict = Depends(get_current_user)):
    q = tenant_query(user, {"id": aid})
    if user["role"] == "client":
        q["client_id"] = user["id"]
    appt = await db.appointments.find_one(q, {"_id": 0})
    if not appt:
        raise HTTPException(404, "Agendamento não encontrado")
    settings = await db.settings.find_one({"key": "studio", "studio_id": appt.get("studio_id")}) or {}
    studio = await db.studios.find_one({"id": appt.get("studio_id")}, {"_id": 0, "slug": 1})
    summary = await _build_summary(appt)
    targets = []
    if user["role"] != "client":
        targets.append(_wa_target("client", summary.get("client_name") or "Cliente", summary.get("client_phone"),
                                  _client_status_text(summary, settings, origin.rstrip("/"), studio.get("slug", "") if studio else "")))
    by_pro: dict = {}
    for it in summary["items"]:
        by_pro.setdefault(it["professional_id"], []).append(it)
    for pid, items in by_pro.items():
        if user["role"] == "professional" and pid == user["id"]:
            continue
        pro = await db.professionals.find_one({"id": pid, "studio_id": appt.get("studio_id")}, {"_id": 0, "name": 1, "phone": 1})
        if not pro:
            continue
        targets.append(_wa_target("professional", pro.get("name") or "Profissional", pro.get("phone"),
                                  _pro_text(summary, settings, items, pro.get("name") or "")))
    return {"appointment_id": aid, "status": summary.get("status"), "quick": bool(summary.get("quick")), "targets": targets}

# =========================
# Referral program (Indica)
# =========================
async def _reward_referral(referred_id: str, referrer_id: Optional[str] = None,
                           studio_id: Optional[str] = None) -> Optional[dict]:
    scope = {"studio_id": studio_id} if studio_id else {}
    referred = await db.users.find_one({**scope, "id": referred_id})
    if not referred or referred.get("referral_rewarded"):
        return None
    referrer_id = referrer_id or referred.get("referred_by")
    if not referrer_id:
        return None
    referrer = await db.users.find_one({**scope, "id": referrer_id, "role": "client"})
    if not referrer:
        return None
    settings = await db.settings.find_one({**scope, "key": "studio"}) or {}
    pct = int(settings.get("referral_discount_percent", 10) or 10)
    code = f"INDICA{secrets.randbelow(900000) + 100000}"
    coupon = {
        "id": uid(), "code": code, "discount_percent": pct, "scope": "studio",
        "professional_id": None, "service_ids": [], "min_value": 0,
        "max_uses": 1, "max_uses_per_client": 1, "valid_from": None,
        "valid_until": (now_utc() + timedelta(days=90)).isoformat(),
        "active": True, "client_id": referrer["id"], "uses": 0,
        "origin": "referral", "referred_id": referred_id,
        "created_at": now_utc().isoformat(),
        "studio_id": studio_id,
    }
    await db.coupons.insert_one(coupon)
    await db.users.update_one({**scope, "id": referred_id},
                              {"$set": {"referral_rewarded": True, "referred_by": referrer["id"]}})
    await notify(referrer["id"], "Você ganhou um cupom! 🎁",
                 f"{referred['name'].split(' ')[0]} veio ao Studio pela sua indicação. "
                 f"Use o cupom {code} ({pct}% off) na próxima reserva.")
    coupon.pop("_id", None)
    return coupon

@api.get("/referrals/me")
async def my_referrals(user: dict = Depends(require_role("client"))):
    await ensure_referral_code(user)
    friends = await db.users.find(tenant_query(user, {"referred_by": user["id"]}),
                                  {"_id": 0, "id": 1, "name": 1, "referral_rewarded": 1, "created_at": 1}).to_list(500)
    coupons = await db.coupons.find(tenant_query(user, {"client_id": user["id"]}), {"_id": 0}).sort("created_at", -1).to_list(100)
    return {"referral_code": user["referral_code"], "friends": friends, "coupons": coupons}

@api.get("/referrals")
async def list_referrals(user: dict = Depends(require_role("manager"))):
    referred = await db.users.find(tenant_query(user, {"referred_by": {"$ne": None}, "role": "client"}),
                                   {"_id": 0, "id": 1, "name": 1, "referred_by": 1, "referral_rewarded": 1}).to_list(2000)
    names = {u["id"]: u["name"] for u in await db.users.find(tenant_query(user, {"role": "client"}), {"_id": 0, "id": 1, "name": 1}).to_list(5000)}
    for r in referred:
        r["referrer_name"] = names.get(r["referred_by"], "?")
    return referred

@api.post("/referrals/manual")
async def manual_referral(data: ManualReferralIn, user: dict = Depends(require_role("manager"))):
    if data.referrer_id == data.referred_id:
        raise HTTPException(400, "Cliente não pode indicar a si mesma")
    referred = await db.users.find_one(tenant_query(user, {"id": data.referred_id, "role": "client"}))
    if not referred:
        raise HTTPException(404, "Cliente indicada não encontrada")
    if referred.get("referral_rewarded"):
        raise HTTPException(400, "Esta cliente já teve sua indicação recompensada")
    coupon = await _reward_referral(data.referred_id, data.referrer_id, user.get("studio_id"))
    if not coupon:
        raise HTTPException(400, "Não foi possível gerar o cupom")
    return coupon

@api.post("/appointments/{aid}/mark-signal-paid")
async def mark_signal_paid(aid: str, user: dict = Depends(get_current_user)):
    if user["role"] == "client":
        raise HTTPException(403, "Sem permissão")
    appt = await db.appointments.find_one(tenant_query(user, {"id": aid}))
    if not appt:
        raise HTTPException(404, "Agendamento não encontrado")
    await db.appointments.update_one(
        tenant_query(user, {"id": aid}), {"$set": {"signal_paid": True, "status": "signal_paid"}}
    )
    if appt.get("client_id"):
        await notify(appt["client_id"], "Sinal recebido",
                     "Seu sinal foi confirmado pelo Studio.", aid)
    updated = await db.appointments.find_one(tenant_query(user, {"id": aid}), {"_id": 0})
    return await _build_summary(updated)

@api.delete("/appointments/{aid}")
async def cancel_appointment(aid: str, user: dict = Depends(get_current_user)):
    appt = await db.appointments.find_one(tenant_query(user, {"id": aid}))
    if not appt:
        raise HTTPException(404, "Não encontrado")
    if user["role"] == "client" and appt.get("client_id") != user["id"]:
        raise HTTPException(403, "Sem permissão")
    raise HTTPException(400, "Use o cancelamento com motivo pelo endpoint de status")

# =========================
# Dashboard
# =========================
@api.get("/dashboard")
async def dashboard(user: dict = Depends(require_role("manager"))):
    now = now_utc()
    today = now.replace(hour=0, minute=0, second=0, microsecond=0)
    tomorrow = today + timedelta(days=1)
    week_end = today + timedelta(days=7)
    month_end = today + timedelta(days=30)

    appts = await db.appointments.find(tenant_query(user, {}), {"_id": 0}).to_list(5000)
    def in_range(a, s, e):
        for it in a["items"]:
            st = _dt(it["start"])
            if s <= st < e:
                return True
        return False

    active = [a for a in appts if a["status"] not in ("cancelled", "refused")]
    kpis = {
        "today": sum(1 for a in active if in_range(a, today, tomorrow)),
        "week": sum(1 for a in active if in_range(a, today, week_end)),
        "month": sum(1 for a in active if in_range(a, today, month_end)),
        "confirmed": sum(1 for a in appts if a["status"] == "confirmed"),
        "waiting": sum(1 for a in appts if a["status"] == "waiting"),
        "cancelled": sum(1 for a in appts if a["status"] in ("cancelled", "refused")),
    }
    # financial
    total_scheduled = 0.0
    total_signals = 0.0
    for a in active:
        summary = await _build_summary(a)
        total_scheduled += summary["total"]
        if a.get("signal_paid"):
            total_signals += summary["signal_value"]
    total_clients = await db.users.count_documents(tenant_query(user, {"role": "client"}))
    coupons_used = sum(1 for a in appts if a.get("coupon_code"))

    return {
        **kpis,
        "total_scheduled": round(total_scheduled, 2),
        "signals_received": round(total_signals, 2),
        "remaining": round(total_scheduled - total_signals, 2),
        "total_clients": total_clients,
        "coupons_used": coupons_used,
    }

@api.get("/reports/monthly")
async def monthly_report(month: Optional[str] = None, year: Optional[int] = None,
                         month_number: Optional[int] = None, day: Optional[int] = None,
                         professional_id: Optional[str] = None,
                         user: dict = Depends(require_role("manager", "professional"))):
    try:
        if month:
            year, month_number = [int(value) for value in month.split("-")]
        if year is None or month_number is None:
            raise ValueError
        start = datetime(year, month_number, day or 1, tzinfo=timezone.utc)
        if day:
            end = start + timedelta(days=1)
        else:
            end = datetime(year + (month_number == 12), 1 if month_number == 12 else month_number + 1, 1,
                          tzinfo=timezone.utc)
    except (TypeError, ValueError):
        raise HTTPException(400, "Mês inválido. Use o formato AAAA-MM.")

    selected_professional = user["id"] if user["role"] == "professional" else professional_id
    if selected_professional:
        pro = await db.professionals.find_one(
            tenant_query(user, {"id": selected_professional}), {"_id": 0, "id": 1, "name": 1}
        )
        if not pro:
            raise HTTPException(404, "Profissional não encontrado")

    appointments = await db.appointments.find(
        tenant_query(user, {}), {"_id": 0}
    ).sort("created_at", -1).to_list(5000)
    statuses = {
        "completed": 0, "open": 0, "cancelled": 0, "refused": 0,
        "waiting": 0, "signal_pending": 0, "signal_paid": 0, "confirmed": 0,
        "quick": 0,
    }
    gross = discount = net = 0.0
    rows = {}
    cancellations = []
    appointment_count = 0

    for appointment in appointments:
        items = []
        for item in appointment.get("items", []):
            item_start = _dt(item.get("start"))
            if not (start <= item_start < end):
                continue
            if selected_professional and item.get("professional_id") != selected_professional:
                continue
            service = await _service(item.get("service_id"), {"studio_id": appointment.get("studio_id"), "role": "manager"})
            professional = await _professional(item.get("professional_id"), {"studio_id": appointment.get("studio_id"), "role": "manager"})
            if service:
                items.append({
                    "price": float(service.get("price", 0) or 0),
                    "professional_id": item.get("professional_id"),
                    "professional_name": professional.get("name", "Profissional") if professional else "Profissional",
                })
        if not items:
            continue

        cancellation_date = _dt(appointment.get("cancelled_at")) if appointment.get("cancelled_at") else None
        if appointment.get("status") == "cancelled" and cancellation_date and start <= cancellation_date < end:
            cancellation_total = float(appointment.get("cancelled_total", sum(item["price"] for item in items)) or 0)
            cancellation_discount = float(appointment.get("cancelled_discount", appointment.get("discount", 0)) or 0)
            cancellations.append({
                "appointment_id": appointment["id"],
                "client_name": appointment.get("client_name", ""),
                "cancelled_at": appointment.get("cancelled_at"),
                "cancelled_by": appointment.get("cancelled_by_name", "Não informado"),
                "reason": appointment.get("cancellation_reason", "Não informado"),
                "gross": round(cancellation_total + cancellation_discount, 2),
                "discount": round(cancellation_discount, 2),
                "net": round(cancellation_total, 2),
            })

        appointment_count += 1
        status = appointment.get("status", "waiting")
        statuses[status] = statuses.get(status, 0) + 1
        if status in ("waiting", "signal_pending", "signal_paid", "confirmed"):
            statuses["open"] += 1
        if appointment.get("quick"):
            statuses["quick"] += 1
        if status in ("cancelled", "refused"):
            statuses["cancelled"] += 1
            continue

        item_gross = sum(item["price"] for item in items)
        item_discount = min(float(appointment.get("discount", 0) or 0), item_gross)
        gross += item_gross
        discount += item_discount
        net += item_gross - item_discount

        for item in items:
            share = item["price"] / item_gross if item_gross else 0
            row = rows.setdefault(item["professional_id"], {
                "professional_id": item["professional_id"],
                "professional_name": item["professional_name"],
                "appointments": 0, "gross": 0.0, "discount": 0.0, "net": 0.0,
            })
            row["gross"] += item["price"]
            row["discount"] += item_discount * share
            row["net"] += (item["price"] - item_discount * share)
            row["appointments"] += 1

    return {
        "month": f"{year:04d}-{month_number:02d}",
        "day": day,
        "scope": "professional" if user["role"] == "professional" else "studio",
        "professional_id": selected_professional,
        "appointments": appointment_count,
        "statuses": statuses,
        "gross": round(gross, 2),
        "discount": round(discount, 2),
        "net": round(net, 2),
        "cancellations": cancellations,
        "professionals": [
            {**row, "gross": round(row["gross"], 2), "discount": round(row["discount"], 2), "net": round(row["net"], 2)}
            for row in sorted(rows.values(), key=lambda value: value["professional_name"].lower())
        ],
    }

# =========================
# Register routes
# =========================
app.include_router(api)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[origin.strip() for origin in os.environ.get("CORS_ORIGINS", "").split(",") if origin.strip()],
    allow_origin_regex=r"https://([a-z0-9-]+\.)*(emergentagent\.com|emergentcf\.cloud|emergent\.host)$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
