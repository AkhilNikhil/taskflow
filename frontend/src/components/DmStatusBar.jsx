export default function DmStatusBar({ conversation, me, isArchitect, onRespond }) {
  const status = conversation.dm_status;
  const isMember = (conversation.members || []).some((m) => m.user_id === me);
  const isRequester = conversation.requested_by === me;
  const who = conversation.title;

  const bar = { padding: "14px 20px", borderTop: "1px solid #e2e8f0", background: "#fffbeb", display: "flex",
                alignItems: "center", justifyContent: "space-between", gap: "12px", flexWrap: "wrap" };
  const btn = (bg, color, border) => ({ padding: "8px 16px", borderRadius: "8px", background: bg, color,
                                          border: `1px solid ${border}`, fontWeight: 700, fontSize: "13px", cursor: "pointer" });

  if (!isMember) {
    return (
      <div style={bar}>
        <span style={{ fontSize: "13px", color: "#92400e" }}>
          {isArchitect ? "👑 Supervising" : "Read-only"} — this chat is <b>{status}</b>; messaging is disabled until the recipient accepts.
        </span>
      </div>
    );
  }

  if (status === "PENDING" && !isRequester) {
    return (
      <div style={bar}>
        <span style={{ fontSize: "13px", color: "#92400e" }}>
          🤝 <b>{who}</b> wants to message you. You can't chat until you accept.
        </span>
        <span style={{ display: "flex", gap: "8px" }}>
          <button type="button" onClick={() => onRespond("accept")} style={btn("#16a34a", "white", "#16a34a")}>Accept</button>
          <button type="button" onClick={() => onRespond("decline")} style={btn("white", "#dc2626", "#fca5a5")}>Decline</button>
        </span>
      </div>
    );
  }

  if (status === "PENDING" && isRequester) {
    return (
      <div style={bar}>
        <span style={{ fontSize: "13px", color: "#92400e" }}>
          ⏳ Request sent. You can start chatting as soon as <b>{who}</b> accepts.
        </span>
      </div>
    );
  }

  if (status === "DECLINED" && isRequester) {
    return (
      <div style={bar}>
        <span style={{ fontSize: "13px", color: "#b91c1c" }}>🚫 <b>{who}</b> declined your message request.</span>
      </div>
    );
  }

  return (
    <div style={bar}>
      <span style={{ fontSize: "13px", color: "#92400e" }}>You declined this request.</span>
      <button type="button" onClick={() => onRespond("accept")} style={btn("#16a34a", "white", "#16a34a")}>Accept anyway</button>
    </div>
  );
}
