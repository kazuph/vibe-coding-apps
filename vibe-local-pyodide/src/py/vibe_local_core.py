from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _blank_session(session_id: str, title: str = "") -> dict:
    now = _now()
    return {
        "session": {
            "id": session_id,
            "title": title,
            "model": "",
            "mode": "plan",
            "createdAt": now,
            "updatedAt": now,
        },
        "messages": [],
        "artifacts": [],
    }


STATE = {
    "sessions": {}
}


def load_state(payload_json: str) -> str:
    payload = json.loads(payload_json or "{}")
    sessions = {}
    for entry in payload.get("sessions", []):
        session = entry.get("session", {})
        session_id = session.get("id")
        if session_id:
            sessions[session_id] = entry
    STATE["sessions"] = sessions
    return snapshot()


def snapshot() -> str:
    sessions = sorted(
        STATE["sessions"].values(),
        key=lambda entry: entry["session"].get("updatedAt", ""),
        reverse=True,
    )
    return json.dumps({"sessions": sessions}, ensure_ascii=False)


def create_session(title: str = "") -> str:
    session_id = str(uuid.uuid4())
    entry = _blank_session(session_id, title.strip())
    STATE["sessions"][session_id] = entry
    return json.dumps(entry, ensure_ascii=False)


def _get_session(session_id: str) -> dict:
    if session_id not in STATE["sessions"]:
        raise KeyError(f"Unknown session: {session_id}")
    return STATE["sessions"][session_id]


def list_sessions() -> str:
    sessions = [
        entry["session"]
        for entry in sorted(
            STATE["sessions"].values(),
            key=lambda entry: entry["session"].get("updatedAt", ""),
            reverse=True,
        )
    ]
    return json.dumps(sessions, ensure_ascii=False)


def set_session_config(session_id: str, model: str | None = None, mode: str | None = None) -> str:
    entry = _get_session(session_id)
    if model is not None:
        entry["session"]["model"] = model
    if mode is not None:
        entry["session"]["mode"] = mode
    entry["session"]["updatedAt"] = _now()
    return json.dumps(entry["session"], ensure_ascii=False)


def append_message(session_id: str, role: str, content: str) -> str:
    entry = _get_session(session_id)
    text = (content or "").strip()
    created_at = _now()
    turn_index = len(entry["messages"])
    message = {
        "id": str(uuid.uuid4()),
        "role": role,
        "content": text,
        "createdAt": created_at,
        "turnIndex": turn_index,
    }
    entry["messages"].append(message)
    if not entry["session"]["title"] and role == "user":
        title = text.replace("\n", " ").strip()[:36]
        entry["session"]["title"] = title or "New session"
    entry["session"]["updatedAt"] = created_at
    return json.dumps({"message": message, "session": entry["session"]}, ensure_ascii=False)


def get_session_messages(session_id: str) -> str:
    entry = _get_session(session_id)
    return json.dumps(entry["messages"], ensure_ascii=False)


def compact_session(session_id: str) -> str:
    entry = _get_session(session_id)
    messages = entry["messages"]
    if len(messages) <= 8:
        return json.dumps(
            {
                "changed": False,
                "messages": messages,
                "artifact": None,
                "session": entry["session"],
            },
            ensure_ascii=False,
        )

    old_messages = messages[:-8]
    keep_messages = messages[-8:]
    summary_lines = []
    for message in old_messages:
        content = (message.get("content") or "").replace("\n", " ").strip()
        if not content:
            continue
        summary_lines.append(f"{message.get('role', 'unknown')}: {content}")
    summary_text = " | ".join(summary_lines)[:2000]
    artifact = {
        "id": str(uuid.uuid4()),
        "sessionId": session_id,
        "kind": "compaction_summary",
        "createdAt": _now(),
        "payload": {
            "summary": summary_text,
            "compactedMessageCount": len(old_messages),
        },
    }
    entry["messages"] = keep_messages
    entry["artifacts"].append(artifact)
    entry["session"]["updatedAt"] = artifact["createdAt"]
    return json.dumps(
        {
            "changed": True,
            "messages": keep_messages,
            "artifact": artifact,
            "session": entry["session"],
        },
        ensure_ascii=False,
    )


def export_session(session_id: str) -> str:
    entry = _get_session(session_id)
    return json.dumps(entry, ensure_ascii=False, indent=2)
