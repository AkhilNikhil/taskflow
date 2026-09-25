import { useState } from "react";
import { supabase } from "../supabaseClient";
import { apiRequest } from "../api";

export default function ProfileModal({ user, onClose, onSaved, onMessage }) {
  const [name, setName] = useState(user?.display_name || "");
  const [savingName, setSavingName] = useState(false);
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [savingPw, setSavingPw] = useState(false);
  const [note, setNote] = useState({ type: "", text: "" });

  const saveName = async (e) => {
    e.preventDefault();
    setSavingName(true);
    setNote({ type: "", text: "" });
    try {
      const res = await apiRequest("/api/auth/me", { method: "PUT", body: JSON.stringify({ display_name: name.trim() }) });
      onSaved(res.user);
      setNote({ type: "ok", text: "Display name updated." });
    } catch (err) {
      setNote({ type: "err", text: err.message || "Could not update name" });
    } finally {
      setSavingName(false);
    }
  };

  const savePassword = async (e) => {
    e.preventDefault();
    setNote({ type: "", text: "" });
    if (pw.length < 6) return setNote({ type: "err", text: "Password must be at least 6 characters." });
    if (pw !== pw2) return setNote({ type: "err", text: "Passwords do not match." });
    setSavingPw(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: pw });
      if (error) throw error;
      setPw("");
      setPw2("");
      setNote({ type: "ok", text: "Password changed." });
      onMessage?.("Password changed successfully.");
    } catch (err) {
      setNote({ type: "err", text: err.message || "Could not change password" });
    } finally {
      setSavingPw(false);
    }
  };

  const input = { padding: "10px 14px", borderRadius: "10px", border: "1px solid #cbd5e1", fontSize: "14px", width: "100%" };
  const section = { border: "1px solid #e2e8f0", borderRadius: "12px", padding: "14px", marginBottom: "14px", background: "#f8fafc" };

  return (
    <div
      onClick={onClose}
      style={{ position: "fixed", inset: 0, background: "rgba(15, 23, 42, 0.45)", backdropFilter: "blur(4px)",
               display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1001, padding: "20px" }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ background: "white", borderRadius: "18px", padding: "24px", maxWidth: "500px", width: "100%",
                 boxShadow: "0 20px 60px rgba(0,0,0,0.2)", maxHeight: "90vh", overflowY: "auto" }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
          <h3 style={{ margin: 0, fontSize: "18px", color: "#0f172a" }}>👤 Your profile</h3>
          <button type="button" onClick={onClose}
                  style={{ border: 0, background: "transparent", fontSize: "22px", cursor: "pointer", color: "#64748b" }}>×</button>
        </div>
        <p style={{ margin: "0 0 14px", fontSize: "13px", color: "#64748b" }}>
          {user?.email} • Role: <strong>{user?.system_role}</strong>
        </p>

        {note.text && (
          <div style={{
            marginBottom: "12px", padding: "8px 12px", borderRadius: "8px", fontSize: "13px",
            background: note.type === "ok" ? "#f0fdf4" : "#fef2f2",
            border: `1px solid ${note.type === "ok" ? "#bbf7d0" : "#fecaca"}`,
            color: note.type === "ok" ? "#15803d" : "#dc2626",
          }}>{note.text}</div>
        )}

        <form onSubmit={saveName} style={section}>
          <strong style={{ fontSize: "13px", color: "#334155" }}>Display name</strong>
          <div style={{ display: "flex", gap: "8px", marginTop: "8px" }}>
            <input style={input} value={name} maxLength={100} onChange={(e) => setName(e.target.value)} required />
            <button type="submit" className="primary-button" disabled={savingName}
                    style={{ width: "auto", padding: "0 16px", whiteSpace: "nowrap" }}>
              {savingName ? "..." : "Save"}
            </button>
          </div>
        </form>

        <form onSubmit={savePassword} style={section}>
          <strong style={{ fontSize: "13px", color: "#334155" }}>Change password</strong>
          <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginTop: "8px" }}>
            <input style={input} type="password" placeholder="New password" value={pw} minLength={6}
                   onChange={(e) => setPw(e.target.value)} />
            <input style={input} type="password" placeholder="Confirm new password" value={pw2} minLength={6}
                   onChange={(e) => setPw2(e.target.value)} />
            <button type="submit" className="primary-button" disabled={savingPw || !pw}>
              {savingPw ? "Updating..." : "Update password"}
            </button>
          </div>
        </form>

        <div style={{ ...section, background: "#fffbeb", borderColor: "#fde68a", marginBottom: 0 }}>
          <strong style={{ fontSize: "13px", color: "#92400e" }}>🔒 Privacy & visibility</strong>
          <ul style={{ margin: "8px 0 0", paddingLeft: "18px", fontSize: "12px", color: "#78350f", lineHeight: 1.6 }}>
            <li>Your <b>personal tasks</b> are visible to you and to Admins / the Architect.</li>
            <li><b>Team tasks and team chat</b> are visible to team members, Admins and the Architect.</li>
            <li><b>Direct chats</b> need the other person's approval, and are visible only to the two participants and the Architect (for supervision).</li>
            <li>Deleting a chat message hides it for everyone, but it is retained for auditing.</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
