"""Endpoint tài khoản và lịch sử hội thoại."""
import logging

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.exc import SQLAlchemyError

from app import auth
from app.accounts import store
from app.config import get_settings
from app.i18n import Msg
from app.ingest.github import RepoError, parse_repo_url
from app.ratelimit import login_limiter, read_limiter

log = logging.getLogger("repolens.accounts")
router = APIRouter(prefix="/api")

NOT_FOUND = Msg("Không tìm thấy cuộc trò chuyện này.", "That conversation was not found.")


def _db_down(e: Exception) -> HTTPException:
    log.exception("Không truy cập được database tài khoản: %s", e)
    return HTTPException(
        status_code=503,
        detail=str(Msg("Chưa lưu/đọc được dữ liệu, thử lại sau nhé.", "Could not reach the data store, please try again.")),
    )


class GoogleLogin(BaseModel):
    credential: str = Field(min_length=20, max_length=4000)


@router.get("/auth/config")
def auth_config():
    """Cho giao diện biết có bật đăng nhập không, để ẩn nút khi server chưa cấu hình."""
    cid = get_settings().google_client_id
    return {"enabled": bool(cid), "google_client_id": cid}


@router.post("/auth/google", dependencies=[Depends(login_limiter)])
def login_google(body: GoogleLogin):
    if not get_settings().google_client_id:
        raise HTTPException(
            status_code=503,
            detail=str(Msg("Đăng nhập chưa được bật trên server này.", "Sign-in is not enabled on this server.")),
        )
    try:
        info = auth.verify_google_credential(body.credential)
    except auth.GoogleAuthError as e:
        log.info("Từ chối đăng nhập Google: %s", e)
        raise HTTPException(
            status_code=401,
            detail=str(Msg("Không xác thực được tài khoản Google, thử lại nhé.", "Could not verify your Google account, please try again.")),
        ) from e
    try:
        user = store.upsert_user(
            sub=str(info["sub"]),
            email=str(info.get("email", ""))[:320],
            name=str(info.get("name", ""))[:200],
            picture=str(info.get("picture", ""))[:500],
        )
    except SQLAlchemyError as e:
        raise _db_down(e) from e
    return {"token": auth.issue_token(user["id"]), "user": user}


@router.get("/me")
def me(user: dict = Depends(auth.required_user)):
    return user


@router.delete("/me", status_code=204, dependencies=[Depends(login_limiter)])
def delete_me(user: dict = Depends(auth.required_user)):
    try:
        store.delete_user(user["id"])
    except SQLAlchemyError as e:
        raise _db_down(e) from e


class NewConversation(BaseModel):
    repo: str = Field(min_length=1, max_length=300)  # "owner/name" hoặc link GitHub


@router.post("/conversations", status_code=201, dependencies=[Depends(read_limiter)])
def create_conversation(body: NewConversation, user: dict = Depends(auth.required_user)):
    try:
        owner, name = parse_repo_url(body.repo)
    except RepoError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    try:
        return store.create_conversation(user["id"], owner, name)
    except SQLAlchemyError as e:
        raise _db_down(e) from e


@router.get("/conversations", dependencies=[Depends(read_limiter)])
def list_conversations(user: dict = Depends(auth.required_user)):
    try:
        return store.list_conversations(user["id"])
    except SQLAlchemyError as e:
        raise _db_down(e) from e


@router.get("/conversations/{cid}", dependencies=[Depends(read_limiter)])
def get_conversation(cid: str, user: dict = Depends(auth.required_user)):
    try:
        conv = store.get_conversation(user["id"], cid)
        if conv is None:
            raise HTTPException(status_code=404, detail=str(NOT_FOUND))
        return {**conv, "turns": store.list_turns(cid)}
    except SQLAlchemyError as e:
        raise _db_down(e) from e


@router.delete("/conversations/{cid}", status_code=204, dependencies=[Depends(read_limiter)])
def delete_conversation(cid: str, user: dict = Depends(auth.required_user)):
    try:
        ok = store.delete_conversation(user["id"], cid)
    except SQLAlchemyError as e:
        raise _db_down(e) from e
    if not ok:
        raise HTTPException(status_code=404, detail=str(NOT_FOUND))
