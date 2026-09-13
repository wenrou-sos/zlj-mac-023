"""登录认证与角色权限。

零外部依赖实现：
- 密码：PBKDF2-HMAC-SHA256 加盐哈希
- 令牌：HMAC 签名的紧凑令牌（id.expire.signature），存于 Authorization 头

角色：
- 管理员 admin：档案管理、归档（报废/移交/退场）与恢复、停用/启用计划、年检登记
- 维保员 worker：扫码签到、保养记录、报修、派单流转（只能用本人身份签到）
"""
import base64
import hashlib
import hmac
import os
import secrets
from datetime import datetime, timedelta, timezone

from fastapi import Depends, HTTPException, Header
from sqlalchemy import select
from sqlalchemy.orm import Session

from database import get_db
import models

SECRET = os.getenv("AUTH_SECRET", "elevator-maint-dev-secret-change-me")
TOKEN_TTL_HOURS = 12

ROLE_ADMIN = "管理员"
ROLE_WORKER = "维保员"


# ---------- 密码 ----------
def hash_password(password: str) -> str:
    salt = secrets.token_hex(16)
    dk = hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), 100_000)
    return f"pbkdf2$100000${salt}${dk.hex()}"


def verify_password(password: str, stored: str) -> bool:
    try:
        _, iters, salt, digest = stored.split("$")
        dk = hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), int(iters))
        return hmac.compare_digest(dk.hex(), digest)
    except (ValueError, AttributeError):
        return False


# ---------- 令牌 ----------
def _sign(payload: str) -> str:
    return hmac.new(SECRET.encode(), payload.encode(), hashlib.sha256).hexdigest()


def create_token(user_id: int) -> str:
    exp = int((datetime.now(timezone.utc) + timedelta(hours=TOKEN_TTL_HOURS)).timestamp())
    payload = f"{user_id}.{exp}"
    sig = _sign(payload)
    return f"{payload}.{sig}"


def _user_from_token(token: str, db: Session) -> models.User:
    try:
        uid_s, exp_s, sig = token.split(".")
        if not hmac.compare_digest(sig, _sign(f"{uid_s}.{exp_s}")):
            raise ValueError
        if int(exp_s) < int(datetime.now(timezone.utc).timestamp()):
            raise HTTPException(401, "登录已过期，请重新登录")
        user = db.get(models.User, int(uid_s))
        if not user or not user.active:
            raise ValueError
        return user
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(401, "无效的登录令牌")


def get_current_user(
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> models.User:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(401, "未登录或缺少令牌")
    return _user_from_token(authorization.removeprefix("Bearer ").strip(), db)


def require_admin(user: models.User = Depends(get_current_user)) -> models.User:
    if user.role != ROLE_ADMIN:
        raise HTTPException(403, "权限不足：该操作仅管理员可执行")
    return user


def current_user_optional(
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> models.User | None:
    if not authorization or not authorization.startswith("Bearer "):
        return None
    return _user_from_token(authorization.removeprefix("Bearer ").strip(), db)
