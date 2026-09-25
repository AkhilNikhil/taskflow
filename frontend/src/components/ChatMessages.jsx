import { Fragment, useState } from "react";

const timeOf = (iso) =>
  iso ? new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "";

function dayLabel(iso) {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  return d.toLocaleDateString([], {
    weekday: "short", day: "numeric", month: "short",
    year: d.getFullYear() !== today.getFullYear() ? "numeric" : undefined,
  });
}

export default function ChatMessages({ messages, hasMore, isLoadingOlder, onLoadOlder, onEdit, onDelete }) {
  const [editingId, setEditingId] = useState(null);
  const [editText, setEditText] = useState("");
  const [busy, setBusy] = useState(false);

  const startEdit = (m) => {
    setEditingId(m.id);
    setEditText(m.content);
  };

  const saveEdit = async (m) => {
    const text = editText.trim();
    if (!text || text === m.content) {
      setEditingId(null);
      return;
    }
    setBusy(true);
    try {
      await onEdit(m, text);
      setEditingId(null);
    } catch (err) {
      window.alert(err.message || "Could not edit message");
    } finally {
      setBusy(false);
    }
  };

  const linkBtn = { border: "none", background: "transparent", fontSize: "11px", fontWeight: 600, cursor: "pointer", padding: 0 };

  if (messages.length === 0) {
    return (
      <div style={{ textAlign: "center", padding: "60px 20px", color: "#94a3b8" }}>
        <div style={{ fontSize: "32px", marginBottom: "8px" }}>💬</div>
        <strong>No messages in this channel yet.</strong>
        <p style={{ margin: "4px 0 0", fontSize: "13px" }}>Send the first message below to start the conversation!</p>
      </div>
    );
  }

  return (
    <>
      {hasMore && (
        <button
          type="button"
          onClick={onLoadOlder}
          disabled={isLoadingOlder}
          style={{ alignSelf: "center", padding: "6px 14px", borderRadius: "999px", border: "1px solid #cbd5e1",
                   background: "white", color: "#4338ca", fontSize: "12px", fontWeight: 600, cursor: "pointer" }}
        >
          {isLoadingOlder ? "Loading..." : "↑ Load older messages"}
        </button>
      )}

      {messages.map((msg, i) => {
        const prev = messages[i - 1];
        const newDay = !prev || new Date(prev.created_at).toDateString() !== new Date(msg.created_at).toDateString();
        const isMine = msg.is_self;
        const isEditing = editingId === msg.id;

        return (
          <Fragment key={msg.id}>
            {newDay && (
              <div style={{ alignSelf: "center", fontSize: "11px", fontWeight: 700, color: "#64748b",
                            background: "#e2e8f0", padding: "3px 12px", borderRadius: "999px", margin: "6px 0" }}>
                {dayLabel(msg.created_at)}
              </div>
            )}

            <div style={{ display: "flex", flexDirection: "column", alignItems: isMine ? "flex-end" : "flex-start",
                          maxWidth: "75%", alignSelf: isMine ? "flex-end" : "flex-start" }}>
              <span style={{ fontSize: "11px", color: "#64748b", marginBottom: "4px", padding: "0 4px" }}>
                {isMine ? "You" : msg.sender_name || msg.sender_email || "Teammate"} • {timeOf(msg.created_at)}
                {msg.is_edited && !msg.is_deleted && " • edited"}
              </span>

              {isEditing ? (
                <div style={{ display: "flex", gap: "6px", width: "100%" }}>
                  <input
                    autoFocus
                    value={editText}
                    onChange={(e) => setEditText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") saveEdit(msg);
                      if (e.key === "Escape") setEditingId(null);
                    }}
                    style={{ flex: 1, padding: "8px 12px", borderRadius: "10px", border: "1px solid #6366f1", fontSize: "14px" }}
                  />
                  <button type="button" disabled={busy} onClick={() => saveEdit(msg)}
                          style={{ ...linkBtn, color: "#4f46e5", fontSize: "12px" }}>Save</button>
                  <button type="button" onClick={() => setEditingId(null)}
                          style={{ ...linkBtn, color: "#64748b", fontSize: "12px" }}>Cancel</button>
                </div>
              ) : (
                <div
                  style={{
                    padding: "10px 14px",
                    borderRadius: isMine ? "14px 14px 2px 14px" : "14px 14px 14px 2px",
                    background: msg.is_deleted ? "#f1f5f9" : isMine ? "#4f46e5" : "white",
                    color: msg.is_deleted ? "#94a3b8" : isMine ? "white" : "#1e293b",
                    fontStyle: msg.is_deleted ? "italic" : "normal",
                    border: isMine && !msg.is_deleted ? "none" : "1px solid #e2e8f0",
                    boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
                    fontSize: "14px", lineHeight: "1.45", wordBreak: "break-word", whiteSpace: "pre-wrap",
                  }}
                >
                  {msg.content}
                </div>
              )}

              {isMine && !msg.is_deleted && !isEditing && (
                <div style={{ display: "flex", gap: "10px", marginTop: "3px", padding: "0 4px" }}>
                  <button type="button" style={{ ...linkBtn, color: "#4f46e5" }} onClick={() => startEdit(msg)}>Edit</button>
                  <button type="button" style={{ ...linkBtn, color: "#ef4444" }} onClick={() => onDelete(msg)}>Delete</button>
                </div>
              )}
            </div>
          </Fragment>
        );
      })}
    </>
  );
}
