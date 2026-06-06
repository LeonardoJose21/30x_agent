"use client";

import { useState, useRef, useCallback } from "react";

type Doc = { filename: string; chunks: number };

const E = "cubic-bezier(0.23, 1, 0.32, 1)";

function pressHandlers(el: HTMLButtonElement | null, active: boolean) {
  if (!el || !active) return;
  el.style.transform = "scale(0.96)";
}
function releaseHandlers(el: HTMLButtonElement | null) {
  if (!el) return;
  el.style.transform = "scale(1)";
}

export default function AdminPage() {
  const [secret, setSecret] = useState("");
  const [authed, setAuthed] = useState(false);
  const [authErr, setAuthErr] = useState("");
  const [checking, setChecking] = useState(false);

  const [docs, setDocs] = useState<Doc[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<Doc | null>(null);
  const [uploadErr, setUploadErr] = useState("");
  const [reindexing, setReindexing] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState<Set<string>>(new Set());
  const [reindexAllProgress, setReindexAllProgress] = useState<{
    active: boolean;
    done: number;
    total: number;
  }>({ active: false, done: 0, total: 0 });

  const fileRef = useRef<HTMLInputElement>(null);
  const h = { "x-admin-secret": secret };

  // ── Auth ────────────────────────────────────────────────────────────────────

  async function login() {
    setChecking(true);
    setAuthErr("");
    try {
      const res = await fetch("/api/admin/upload", { headers: h });
      if (!res.ok) {
        setAuthErr("Invalid secret.");
        return;
      }
      const data = await res.json();
      setDocs(data.documents ?? []);
      setAuthed(true);
    } catch {
      setAuthErr("Connection error.");
    } finally {
      setChecking(false);
    }
  }

  // ── Data ────────────────────────────────────────────────────────────────────

  async function refresh() {
    const res = await fetch("/api/admin/upload", { headers: h });
    const data = await res.json();
    setDocs(data.documents ?? []);
  }

  // ── Upload ──────────────────────────────────────────────────────────────────

  const handleUpload = useCallback(
    async (file: File) => {
      if (!file.name.toLowerCase().endsWith(".pdf")) {
        setUploadErr("Only PDF files are supported.");
        return;
      }
      setUploading(true);
      setUploadResult(null);
      setUploadErr("");
      try {
        const form = new FormData();
        form.append("file", file);
        const res = await fetch("/api/admin/upload", {
          method: "POST",
          headers: h,
          body: form,
        });
        const data = await res.json();
        if (data.success) {
          setUploadResult({ filename: data.filename, chunks: data.chunks });
          await refresh();
        } else {
          setUploadErr(data.error ?? "Upload failed.");
        }
      } catch {
        setUploadErr("Upload failed.");
      } finally {
        setUploading(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [secret]
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer.files[0];
      if (file) handleUpload(file);
    },
    [handleUpload]
  );

  // ── Reindex ──────────────────────────────────────────────────────────────────

  async function reindex(filename: string) {
    setReindexing((s) => new Set(s).add(filename));
    await fetch("/api/admin/upload", {
      method: "PATCH",
      headers: { ...h, "Content-Type": "application/json" },
      body: JSON.stringify({ filename }),
    });
    await refresh();
    setReindexing((s) => {
      const n = new Set(s);
      n.delete(filename);
      return n;
    });
  }

  async function reindexAll() {
    const total = docs.length;
    setReindexAllProgress({ active: true, done: 0, total });
    for (let i = 0; i < docs.length; i++) {
      const { filename } = docs[i];
      setReindexing((s) => new Set(s).add(filename));
      await fetch("/api/admin/upload", {
        method: "PATCH",
        headers: { ...h, "Content-Type": "application/json" },
        body: JSON.stringify({ filename }),
      });
      setReindexing((s) => {
        const n = new Set(s);
        n.delete(filename);
        return n;
      });
      setReindexAllProgress((p) => ({ ...p, done: i + 1 }));
    }
    await refresh();
    setReindexAllProgress({ active: false, done: 0, total: 0 });
  }

  // ── Delete ───────────────────────────────────────────────────────────────────

  async function deleteDoc(filename: string) {
    setDeleting((s) => new Set(s).add(filename));
    await fetch("/api/admin/upload", {
      method: "DELETE",
      headers: { ...h, "Content-Type": "application/json" },
      body: JSON.stringify({ filename }),
    });
    await refresh();
    setDeleting((s) => {
      const n = new Set(s);
      n.delete(filename);
      return n;
    });
  }

  // ── AUTH GATE ────────────────────────────────────────────────────────────────

  if (!authed) {
    return (
      <div
        className="font-sans"
        style={{
          background: "#0A0A0A",
          minHeight: "100dvh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "0 24px",
        }}
      >
        <div style={{ width: "100%", maxWidth: "340px" }}>
          <h1
            style={{
              color: "#FFFFFF",
              fontSize: "22px",
              fontWeight: 700,
              letterSpacing: "-0.03em",
              marginBottom: "32px",
              lineHeight: 1,
            }}
          >
            30X Admin
          </h1>

          <input
            type="password"
            value={secret}
            onChange={(e) => { setSecret(e.target.value); setAuthErr(""); }}
            onKeyDown={(e) => e.key === "Enter" && !checking && login()}
            placeholder="Admin secret"
            autoFocus
            style={{
              display: "block",
              width: "100%",
              background: "#111111",
              border: "1px solid #1A1A1A",
              color: "#FFFFFF",
              padding: "11px 14px",
              fontSize: "14px",
              outline: "none",
              marginBottom: authErr ? "8px" : "12px",
              fontFamily: "inherit",
              boxSizing: "border-box",
              transition: `border-color 150ms ${E}`,
              letterSpacing: "-0.01em",
            }}
            onFocus={(e) => (e.target.style.borderColor = "#333333")}
            onBlur={(e) => (e.target.style.borderColor = "#1A1A1A")}
          />

          {authErr && (
            <p
              style={{
                color: "#FF4444",
                fontSize: "12px",
                marginBottom: "12px",
                letterSpacing: "-0.01em",
              }}
            >
              {authErr}
            </p>
          )}

          <button
            onClick={login}
            disabled={checking || !secret}
            style={{
              width: "100%",
              background: "#CAFF00",
              color: "#0A0A0A",
              border: "none",
              padding: "11px 14px",
              fontSize: "13px",
              fontWeight: 700,
              cursor: checking ? "wait" : "pointer",
              fontFamily: "inherit",
              letterSpacing: "-0.02em",
              transition: `transform 160ms ${E}, opacity 150ms ease`,
              opacity: !secret || checking ? 0.45 : 1,
            }}
            onMouseDown={(e) =>
              secret && !checking && pressHandlers(e.currentTarget, true)
            }
            onMouseUp={(e) => releaseHandlers(e.currentTarget)}
            onMouseLeave={(e) => releaseHandlers(e.currentTarget)}
          >
            {checking ? "Checking…" : "Enter →"}
          </button>
        </div>
      </div>
    );
  }

  // ── DASHBOARD ────────────────────────────────────────────────────────────────

  const allBusy = reindexAllProgress.active;
  const noReindexAll = allBusy || docs.length === 0;

  return (
    <div
      className="font-sans"
      style={{
        background: "#0A0A0A",
        minHeight: "100dvh",
        color: "#FFFFFF",
        padding: "40px 48px 64px",
      }}
    >
      {/* ── Header ── */}
      <header
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: "28px",
        }}
      >
        <span
          style={{
            fontSize: "13px",
            fontWeight: 600,
            letterSpacing: "-0.02em",
            color: "#FFFFFF",
          }}
        >
          30X Admin
        </span>

        <button
          onClick={reindexAll}
          disabled={noReindexAll}
          style={{
            background: noReindexAll ? "transparent" : "#CAFF00",
            color: noReindexAll ? "#444444" : "#0A0A0A",
            border: noReindexAll ? "1px solid #1A1A1A" : "none",
            padding: "7px 14px",
            fontSize: "11px",
            fontWeight: 700,
            cursor: allBusy ? "wait" : noReindexAll ? "default" : "pointer",
            fontFamily: "inherit",
            letterSpacing: "-0.01em",
            transition: `transform 160ms ${E}, background 150ms ease`,
          }}
          onMouseDown={(e) =>
            !noReindexAll && pressHandlers(e.currentTarget, true)
          }
          onMouseUp={(e) => releaseHandlers(e.currentTarget)}
          onMouseLeave={(e) => releaseHandlers(e.currentTarget)}
        >
          {allBusy
            ? `Re-indexing ${reindexAllProgress.done} / ${reindexAllProgress.total}…`
            : "Re-index all"}
        </button>
      </header>

      {/* ── Divider ── */}
      <div style={{ height: "1px", background: "#1A1A1A" }} />

      {/* ── Document list ── */}
      <div style={{ marginBottom: "40px" }}>
        {docs.length === 0 ? (
          <p
            style={{
              color: "#333333",
              fontSize: "13px",
              padding: "20px 0",
              borderBottom: "1px solid #1A1A1A",
              letterSpacing: "-0.01em",
            }}
          >
            No documents indexed yet.
          </p>
        ) : (
          docs.map((doc) => {
            const isR = reindexing.has(doc.filename);
            const isD = deleting.has(doc.filename);
            return (
              <div
                key={doc.filename}
                style={{
                  display: "flex",
                  alignItems: "center",
                  padding: "13px 0",
                  borderBottom: "1px solid #1A1A1A",
                  gap: "16px",
                  opacity: isD ? 0.3 : 1,
                  transition: `opacity 200ms ${E}`,
                }}
              >
                {/* filename */}
                <span
                  style={{
                    flex: 1,
                    fontSize: "13px",
                    fontWeight: 500,
                    color: "#FFFFFF",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    fontFamily: "var(--font-geist-mono)",
                    letterSpacing: "-0.02em",
                  }}
                >
                  {doc.filename}
                </span>

                {/* chunk count */}
                <span
                  style={{
                    color: "#333333",
                    fontSize: "11px",
                    fontFamily: "var(--font-geist-mono)",
                    flexShrink: 0,
                    letterSpacing: "0",
                  }}
                >
                  {String(doc.chunks).padStart(3, "0")} chunks
                </span>

                {/* Re-index button */}
                <button
                  onClick={() => reindex(doc.filename)}
                  disabled={isR || isD}
                  style={{
                    background: "transparent",
                    color: isR ? "#444444" : "#CAFF00",
                    border: `1px solid ${isR ? "#222222" : "#CAFF00"}`,
                    padding: "4px 10px",
                    fontSize: "11px",
                    fontWeight: 500,
                    cursor: isR ? "wait" : "pointer",
                    fontFamily: "inherit",
                    flexShrink: 0,
                    letterSpacing: "-0.01em",
                    transition: `transform 160ms ${E}, border-color 150ms ease, color 150ms ease`,
                  }}
                  onMouseDown={(e) =>
                    !isR && pressHandlers(e.currentTarget, true)
                  }
                  onMouseUp={(e) => releaseHandlers(e.currentTarget)}
                  onMouseLeave={(e) => releaseHandlers(e.currentTarget)}
                >
                  {isR ? "…" : "Re-index"}
                </button>

                {/* Delete button */}
                <button
                  onClick={() => deleteDoc(doc.filename)}
                  disabled={isD || isR}
                  style={{
                    background: "transparent",
                    color: isD ? "#444444" : "#FF4444",
                    border: "none",
                    padding: "4px 0",
                    fontSize: "11px",
                    cursor: isD ? "wait" : "pointer",
                    fontFamily: "inherit",
                    flexShrink: 0,
                    letterSpacing: "-0.01em",
                    transition: `transform 160ms ${E}, opacity 150ms ease`,
                  }}
                  onMouseDown={(e) =>
                    !isD && pressHandlers(e.currentTarget, true)
                  }
                  onMouseUp={(e) => releaseHandlers(e.currentTarget)}
                  onMouseLeave={(e) => releaseHandlers(e.currentTarget)}
                >
                  {isD ? "…" : "Delete"}
                </button>
              </div>
            );
          })
        )}
      </div>

      {/* ── Upload zone ── */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        onClick={() => !uploading && fileRef.current?.click()}
        style={{
          border: `1px dashed ${dragOver ? "#CAFF00" : "#1A1A1A"}`,
          padding: "40px 32px",
          textAlign: "center",
          cursor: uploading ? "wait" : "pointer",
          transition: `border-color 200ms ${E}`,
          userSelect: "none",
        }}
      >
        <input
          ref={fileRef}
          type="file"
          accept=".pdf"
          style={{ display: "none" }}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleUpload(f);
            e.target.value = "";
          }}
        />

        {uploading ? (
          <p
            style={{
              color: "#444444",
              fontSize: "13px",
              letterSpacing: "-0.01em",
            }}
          >
            Indexing…
          </p>
        ) : uploadResult ? (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "8px" }}>
            <p
              style={{
                color: "#CAFF00",
                fontSize: "13px",
                fontWeight: 600,
                fontFamily: "var(--font-geist-mono)",
                letterSpacing: "-0.02em",
              }}
            >
              {uploadResult.filename}
            </p>
            <p
              style={{
                color: "#444444",
                fontSize: "12px",
                fontFamily: "var(--font-geist-mono)",
              }}
            >
              {uploadResult.chunks} chunks indexed
            </p>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setUploadResult(null);
                setUploadErr("");
                setTimeout(() => fileRef.current?.click(), 50);
              }}
              style={{
                marginTop: "4px",
                background: "transparent",
                border: "1px solid #2A2A2A",
                color: "#888888",
                fontSize: "11px",
                padding: "4px 12px",
                cursor: "pointer",
                fontFamily: "inherit",
                letterSpacing: "-0.01em",
                transition: `border-color 150ms ${E}, color 150ms ${E}`,
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLButtonElement).style.borderColor = "#CAFF00";
                (e.currentTarget as HTMLButtonElement).style.color = "#CAFF00";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.borderColor = "#2A2A2A";
                (e.currentTarget as HTMLButtonElement).style.color = "#888888";
              }}
            >
              + Add another
            </button>
          </div>
        ) : (
          <>
            <p
              style={{
                color: "#666666",
                fontSize: "13px",
                marginBottom: "4px",
                letterSpacing: "-0.01em",
              }}
            >
              Drop PDF here
            </p>
            <p style={{ color: "#2A2A2A", fontSize: "12px" }}>
              or click to select
            </p>
          </>
        )}

        {uploadErr && (
          <p
            style={{
              color: "#FF4444",
              fontSize: "12px",
              marginTop: "10px",
              letterSpacing: "-0.01em",
            }}
          >
            {uploadErr}
          </p>
        )}
      </div>
    </div>
  );
}
