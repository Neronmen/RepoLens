"""Lưu người dùng và lịch sử chat.

Chỉ phần này cần một database "thật": nó phải sống sót khi server miễn phí khởi động lại.
Chạy ở máy bạn thì dùng một file SQLite, còn bản deploy trỏ DATABASE_URL tới Postgres
miễn phí (Neon, Supabase...). Dùng SQLAlchemy Core để cùng một đoạn code chạy được cả hai.

Chỉ mục code của repo (files, chunks, FTS5, vector) vẫn nằm ở SQLite tạm trong db.py:
đó là bản sao của repo công khai, mất đi thì lập chỉ mục lại được.
"""
import json
import threading
import uuid
from datetime import datetime, timezone
from functools import lru_cache
from typing import Any

from sqlalchemy import (
    Column,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    MetaData,
    String,
    Table,
    Text,
    create_engine,
    delete,
    event,
    func,
    insert,
    select,
    update,
)
from sqlalchemy.engine import Engine

from app.config import get_settings

MAX_CONVERSATIONS_PER_USER = 200
MAX_TURNS_PER_CONVERSATION = 100
MAX_TURN_BYTES = 200_000

metadata = MetaData()

users = Table(
    "users",
    metadata,
    Column("id", String(36), primary_key=True),
    Column("google_sub", String(64), nullable=False, unique=True),
    Column("email", String(320), nullable=False),
    Column("name", String(200), nullable=False, default=""),
    Column("picture", String(500), nullable=False, default=""),
    Column("created_at", DateTime(timezone=True), nullable=False),
)

conversations = Table(
    "conversations",
    metadata,
    Column("id", String(36), primary_key=True),
    Column("user_id", String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
    Column("owner", String(100), nullable=False),
    Column("name", String(100), nullable=False),
    Column("title", String(200), nullable=False, default=""),
    Column("created_at", DateTime(timezone=True), nullable=False),
    Column("updated_at", DateTime(timezone=True), nullable=False),
    Index("idx_conv_user_updated", "user_id", "updated_at"),
)

turns = Table(
    "turns",
    metadata,
    Column("id", Integer, primary_key=True, autoincrement=True),
    Column("conversation_id", String(36), ForeignKey("conversations.id", ondelete="CASCADE"), nullable=False),
    Column("question", Text, nullable=False),
    Column("data", Text, nullable=False),  # cả lượt hỏi đáp dạng JSON, đúng hình dạng giao diện đang dùng
    Column("created_at", DateTime(timezone=True), nullable=False),
    Index("idx_turns_conv", "conversation_id", "id"),
)

_lock = threading.Lock()
_ready: set[str] = set()


def _normalize(url: str) -> str:
    # Neon/Heroku cho "postgres://..." hoặc "postgresql://...", SQLAlchemy cần chỉ rõ driver
    if url.startswith("postgres://"):
        url = "postgresql://" + url.removeprefix("postgres://")
    if url.startswith("postgresql://"):
        url = "postgresql+psycopg://" + url.removeprefix("postgresql://")
    return url


@lru_cache
def _engine_for(url: str) -> Engine:
    kwargs: dict[str, Any] = {"pool_pre_ping": True, "pool_recycle": 300}
    if url.startswith("sqlite"):
        kwargs["connect_args"] = {"check_same_thread": False}
    engine = create_engine(url, **kwargs)
    if url.startswith("sqlite"):

        @event.listens_for(engine, "connect")
        def _fk(dbapi_conn, _):  # SQLite mặc định không bật khóa ngoại
            dbapi_conn.execute("PRAGMA foreign_keys = ON")

    return engine


def get_engine() -> Engine:
    url = _normalize(get_settings().database_url)
    engine = _engine_for(url)
    with _lock:
        if url not in _ready:
            metadata.create_all(engine)
            _ready.add(url)
    return engine


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _iso(dt: datetime | None) -> str | None:
    if dt is None:
        return None
    if dt.tzinfo is None:  # SQLite trả về giờ không kèm múi giờ
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.isoformat()


# --- người dùng ---------------------------------------------------------------


def _user_dict(r) -> dict:
    return {"id": r.id, "email": r.email, "name": r.name, "picture": r.picture}


def upsert_user(sub: str, email: str, name: str, picture: str) -> dict:
    with get_engine().begin() as c:
        row = c.execute(select(users).where(users.c.google_sub == sub)).first()
        if row:
            c.execute(update(users).where(users.c.id == row.id).values(email=email, name=name, picture=picture))
            uid = row.id
        else:
            uid = str(uuid.uuid4())
            c.execute(
                insert(users).values(
                    id=uid, google_sub=sub, email=email, name=name, picture=picture, created_at=_now()
                )
            )
        return _user_dict(c.execute(select(users).where(users.c.id == uid)).one())


def get_user(user_id: str) -> dict | None:
    with get_engine().connect() as c:
        row = c.execute(select(users).where(users.c.id == user_id)).first()
        return _user_dict(row) if row else None


def delete_user(user_id: str) -> None:
    """Xóa tài khoản cùng toàn bộ hội thoại (người dùng có quyền được quên)."""
    with get_engine().begin() as c:
        ids = [r.id for r in c.execute(select(conversations.c.id).where(conversations.c.user_id == user_id))]
        if ids:
            c.execute(delete(turns).where(turns.c.conversation_id.in_(ids)))
        c.execute(delete(conversations).where(conversations.c.user_id == user_id))
        c.execute(delete(users).where(users.c.id == user_id))


# --- hội thoại ----------------------------------------------------------------


def _conv_dict(r, turn_count: int | None = None) -> dict:
    d = {
        "id": r.id,
        "owner": r.owner,
        "name": r.name,
        "title": r.title,
        "created_at": _iso(r.created_at),
        "updated_at": _iso(r.updated_at),
    }
    if turn_count is not None:
        d["turn_count"] = turn_count
    return d


def create_conversation(user_id: str, owner: str, name: str) -> dict:
    cid = str(uuid.uuid4())
    now = _now()
    with get_engine().begin() as c:
        c.execute(
            insert(conversations).values(
                id=cid, user_id=user_id, owner=owner, name=name, title="", created_at=now, updated_at=now
            )
        )
        # giữ số hội thoại ở mức hợp lý: quá nhiều thì xóa các cái cũ nhất
        old = c.execute(
            select(conversations.c.id)
            .where(conversations.c.user_id == user_id)
            .order_by(conversations.c.updated_at.desc())
            .offset(MAX_CONVERSATIONS_PER_USER)
        ).all()
        for r in old:
            c.execute(delete(turns).where(turns.c.conversation_id == r.id))
            c.execute(delete(conversations).where(conversations.c.id == r.id))
        return _conv_dict(c.execute(select(conversations).where(conversations.c.id == cid)).one())


def list_conversations(user_id: str, limit: int = 100) -> list[dict]:
    with get_engine().connect() as c:
        counts = (
            select(turns.c.conversation_id, func.count().label("n")).group_by(turns.c.conversation_id).subquery()
        )
        rows = c.execute(
            select(conversations, func.coalesce(counts.c.n, 0).label("n"))
            .outerjoin(counts, counts.c.conversation_id == conversations.c.id)
            .where(conversations.c.user_id == user_id)
            .order_by(conversations.c.updated_at.desc())
            .limit(limit)
        ).all()
        # hội thoại chưa có câu hỏi nào (mở ra rồi bỏ) thì không đáng hiện
        return [_conv_dict(r, r.n) for r in rows if r.n > 0]


def get_conversation(user_id: str, cid: str) -> dict | None:
    """Trả về hội thoại nếu nó thuộc về user_id, ngược lại None (không lộ việc nó có tồn tại)."""
    with get_engine().connect() as c:
        row = c.execute(
            select(conversations).where(conversations.c.id == cid, conversations.c.user_id == user_id)
        ).first()
        return _conv_dict(row) if row else None


def list_turns(cid: str) -> list[dict]:
    with get_engine().connect() as c:
        rows = c.execute(select(turns.c.data).where(turns.c.conversation_id == cid).order_by(turns.c.id)).all()
    out = []
    for r in rows:
        try:
            out.append(json.loads(r.data))
        except ValueError:
            continue  # một dòng hỏng không được làm mất cả hội thoại
    return out


def add_turn(cid: str, question: str, data: dict) -> bool:
    payload = json.dumps(data, ensure_ascii=False)
    if len(payload.encode("utf-8")) > MAX_TURN_BYTES:
        return False
    with get_engine().begin() as c:
        n = c.execute(select(func.count()).select_from(turns).where(turns.c.conversation_id == cid)).scalar_one()
        if n >= MAX_TURNS_PER_CONVERSATION:
            return False
        c.execute(insert(turns).values(conversation_id=cid, question=question, data=payload, created_at=_now()))
        values: dict[str, Any] = {"updated_at": _now()}
        if n == 0:
            values["title"] = question.strip().replace("\n", " ")[:80]
        c.execute(update(conversations).where(conversations.c.id == cid).values(**values))
    return True


def delete_conversation(user_id: str, cid: str) -> bool:
    with get_engine().begin() as c:
        owned = c.execute(
            select(conversations.c.id).where(conversations.c.id == cid, conversations.c.user_id == user_id)
        ).first()
        if not owned:
            return False
        c.execute(delete(turns).where(turns.c.conversation_id == cid))
        c.execute(delete(conversations).where(conversations.c.id == cid))
        return True
