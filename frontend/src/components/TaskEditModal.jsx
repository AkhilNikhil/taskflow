import { useState } from "react";

export default function TaskEditModal({ task, onClose, onSave }) {
  const [title, setTitle] = useState(task.title || "");
  const [description, setDescription] = useState(task.description || "");
  const [priority, setPriority] = useState(task.priority || "MEDIUM");
  const [dueDate, setDueDate] = useState(task.due_date || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const submit = async (e) => {
    e.preventDefault();
    if (!title.trim()) {
      setError("Title is required");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await onSave(task.id, {
        title: title.trim(),
        description: description.trim() || null,
        priority,
        due_date: dueDate || null,
      });
    } catch (err) {
      setError(err.message || "Failed to save task");
      setSaving(false);
    }
  };

  const field = { padding: "10px 14px", borderRadius: "10px", border: "1px solid #cbd5e1", fontSize: "14px", width: "100%" };

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, background: "rgba(15, 23, 42, 0.45)", backdropFilter: "blur(4px)",
        display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1001, padding: "20px",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ background: "white", borderRadius: "18px", padding: "24px", maxWidth: "480px", width: "100%",
                 boxShadow: "0 20px 60px rgba(0,0,0,0.2)", maxHeight: "90vh", overflowY: "auto" }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px" }}>
          <h3 style={{ margin: 0, fontSize: "18px", color: "#0f172a" }}>✏️ Edit task</h3>
          <button type="button" onClick={onClose}
                  style={{ border: 0, background: "transparent", fontSize: "22px", cursor: "pointer", color: "#64748b" }}>×</button>
        </div>

        {error && (
          <div style={{ background: "#fef2f2", border: "1px solid #fecaca", color: "#dc2626", padding: "8px 12px",
                        borderRadius: "8px", fontSize: "13px", marginBottom: "12px" }}>{error}</div>
        )}

        <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          <label style={{ fontSize: "12px", fontWeight: 700, color: "#475569" }}>Title
            <input style={{ ...field, marginTop: "4px" }} value={title} maxLength={255}
                   onChange={(e) => setTitle(e.target.value)} required />
          </label>
          <label style={{ fontSize: "12px", fontWeight: 700, color: "#475569" }}>Description
            <textarea style={{ ...field, marginTop: "4px", minHeight: "80px", resize: "vertical" }} value={description}
                      onChange={(e) => setDescription(e.target.value)} />
          </label>
          <div style={{ display: "flex", gap: "12px" }}>
            <label style={{ flex: 1, fontSize: "12px", fontWeight: 700, color: "#475569" }}>Priority
              <select style={{ ...field, marginTop: "4px", background: "white" }} value={priority}
                      onChange={(e) => setPriority(e.target.value)}>
                <option value="LOW">Low</option>
                <option value="MEDIUM">Medium</option>
                <option value="HIGH">High</option>
              </select>
            </label>
            <label style={{ flex: 1, fontSize: "12px", fontWeight: 700, color: "#475569" }}>Due date
              <input type="date" style={{ ...field, marginTop: "4px" }} value={dueDate}
                     onChange={(e) => setDueDate(e.target.value)} />
            </label>
          </div>
          <div style={{ display: "flex", gap: "10px", marginTop: "6px" }}>
            <button type="button" onClick={onClose}
                    style={{ flex: 1, padding: "10px", borderRadius: "10px", border: "1px solid #cbd5e1",
                             background: "#f8fafc", fontWeight: 600, cursor: "pointer" }}>Cancel</button>
            <button type="submit" className="primary-button" disabled={saving} style={{ flex: 1 }}>
              {saving ? "Saving..." : "Save changes"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
