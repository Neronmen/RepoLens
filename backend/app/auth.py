"""Đăng nhập bằng Google và phiên đăng nhập của riêng RepoLens.

Luồng: trình duyệt nhận một ID token từ Google (nút "Sign in with Google"), gửi lên đây.
Server kiểm tra chữ ký, người nhận (aud = client id của mình) và email đã xác minh, rồi cấp
một token phiên của mình (JWT, hết hạn sau vài ngày). Mật khẩu Google không bao giờ đi qua đây.
"""
import logging
import secrets
import time
from typing import Any

import jwt
from fastapi import Header, HTTPException

from app.accounts import store
from app.config import get_settings
from app.i18n import Msg

log = logging.getLogger("repolens.auth")

ALGORITHM = "HS256"
ISSUER = "repolens"

# Không đặt SESSION_SECRET thì mỗi lần khởi động tạo một khóa ngẫu nhiên: vẫn chạy được
# ở máy dev, chỉ là phiên đăng nhập mất khi server tắt. Bản deploy phải đặt khóa cố định.
_ephemeral_secret = secrets.token_urlsafe(48)


class GoogleAuthError(Exception):
    pass


def _secret() -> str:
    s = get_settings().session_secret
    if s:
        return s
    log.warning("Chưa đặt SESSION_SECRET: dùng khóa tạm, phiên đăng nhập sẽ mất khi server khởi động lại")
    return _ephemeral_secret


def verify_google_credential(credential: str) -> dict[str, Any]:
    """Kiểm tra ID token của Google, trả về thông tin người dùng. Tách riêng để test thay bằng bản giả."""
    client_id = get_settings().google_client_id
    if not client_id:
        raise GoogleAuthError("not configured")
    from google.auth.transport import requests as g_requests
    from google.oauth2 import id_token

    try:
        info = id_token.verify_oauth2_token(credential, g_requests.Request(), client_id)
    except ValueError as e:  # chữ ký sai, hết hạn, sai người nhận...
        raise GoogleAuthError(str(e)) from e
    if not info.get("email_verified"):
        raise GoogleAuthError("email not verified")
    return info


def issue_token(user_id: str) -> str:
    now = int(time.time())
    ttl = get_settings().session_days * 86400
    return jwt.encode({"sub": user_id, "iss": ISSUER, "iat": now, "exp": now + ttl}, _secret(), algorithm=ALGORITHM)


def _user_from_header(authorization: str | None) -> dict | None:
    if not authorization or not authorization.lower().startswith("bearer "):
        return None
    token = authorization[7:].strip()
    try:
        claims = jwt.decode(token, _secret(), algorithms=[ALGORITHM], issuer=ISSUER, options={"require": ["exp", "sub"]})
    except jwt.PyJWTError:
        return None
    return store.get_user(claims["sub"])


def optional_user(authorization: str | None = Header(default=None)) -> dict | None:
    return _user_from_header(authorization)


def required_user(authorization: str | None = Header(default=None)) -> dict:
    user = _user_from_header(authorization)
    if user is None:
        raise HTTPException(
            status_code=401,
            detail=str(Msg("Bạn cần đăng nhập để dùng tính năng này.", "Please sign in to use this feature.")),
        )
    return user
