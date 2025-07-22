import React, { useState, useRef } from "react";

const BACKEND_URL = "http://localhost:8000";

function App() {
  const [pdfs, setPdfs] = useState([]);
  const [sessionId] = useState(() => Math.random().toString(36).slice(2));
  const [chat, setChat] = useState([]);
  const [input, setInput] = useState("");
  const [uploading, setUploading] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const fileInputRef = useRef();

  // Handle PDF upload
  const handleUpload = async (e) => {
    e.preventDefault();
    if (!fileInputRef.current.files.length) return;
    setUploading(true);
    const formData = new FormData();
    for (let file of fileInputRef.current.files) {
      formData.append("files", file);
    }
    formData.append("session_id", sessionId);
    await fetch(`${BACKEND_URL}/upload`, {
      method: "POST",
      body: formData,
    });
    setPdfs(Array.from(fileInputRef.current.files).map(f => f.name));
    setUploading(false);
  };

  // Handle chat submit
  const handleSend = async (e) => {
    e.preventDefault();
    if (!input.trim()) return;
    setWaiting(true);
    const userMsg = input;
    setInput("");
    setChat((prev) => [...prev, { role: "user", text: userMsg }]);
    const res = await fetch(`${BACKEND_URL}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ session_id: sessionId, query: userMsg }),
    });
    const data = await res.json();
    setChat(
      data.history.map(([q, a]) => [
        { role: "user", text: q },
        { role: "bot", text: a },
      ]).flat()
    );
    setWaiting(false);
  };

  return (
    <div style={{ maxWidth: 600, margin: "40px auto", fontFamily: "sans-serif" }}>
      <h2>PDF Chat (Personal)</h2>
      <form onSubmit={handleUpload} style={{ marginBottom: 16 }}>
        <input
          type="file"
          accept="application/pdf"
          multiple
          ref={fileInputRef}
          disabled={uploading}
        />
        <button type="submit" disabled={uploading} style={{ marginLeft: 8 }}>
          {uploading ? "Uploading..." : "Upload PDFs"}
        </button>
      </form>
      {pdfs.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <b>PDFs uploaded:</b> {pdfs.join(", ")}
        </div>
      )}
      <div
        style={{
          border: "1px solid #ccc",
          borderRadius: 8,
          minHeight: 200,
          maxHeight: 350,
          overflowY: "auto",
          padding: 16,
          marginBottom: 16,
          background: "#fafbfc",
        }}
      >
        {chat.length === 0 && <div style={{ color: "#888" }}>No messages yet.</div>}
        {chat.map((msg, i) => (
          <div
            key={i}
            style={{
              textAlign: msg.role === "user" ? "right" : "left",
              margin: "8px 0",
            }}
          >
            <span
              style={{
                display: "inline-block",
                background: msg.role === "user" ? "#dbeafe" : "#f3f4f6",
                color: "#222",
                borderRadius: 8,
                padding: "8px 12px",
                maxWidth: "80%",
                wordBreak: "break-word",
              }}
            >
              {msg.text}
            </span>
          </div>
        ))}
        {waiting && <div style={{ color: "#888" }}>Bot is thinking...</div>}
      </div>
      <form onSubmit={handleSend} style={{ display: "flex", gap: 8 }}>
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Type your question..."
          style={{ flex: 1, padding: 8, borderRadius: 6, border: "1px solid #ccc" }}
          disabled={waiting}
        />
        <button type="submit" disabled={waiting || !input.trim()}>
          Send
        </button>
      </form>
    </div>
  );
}

export default App;
