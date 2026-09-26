import { ImageResponse } from "next/og";

// The preview shown when a link is shared (WhatsApp, Telegram, X, LinkedIn…):
// a playing card on the game-theme night background.
export const alt = "Flashcard — AI German flashcards & speaking tutor";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const runtime = "edge";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 90px",
          background: "linear-gradient(135deg, #0d1020 0%, #1a2036 55%, #2a1f5c 100%)",
          color: "#f5f3ff",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", maxWidth: 640 }}>
          <div style={{ fontSize: 34, color: "#e8c65a", fontWeight: 700, letterSpacing: 2 }}>FLASHCARD</div>
          <div style={{ fontSize: 70, fontWeight: 800, lineHeight: 1.08, marginTop: 18 }}>
            Speak German you can actually produce
          </div>
          <div style={{ fontSize: 30, color: "#c4bfe8", marginTop: 26, lineHeight: 1.35 }}>
            Spoken flashcards from your notes · AI tutor · spaced repetition
          </div>
        </div>
        <div
          style={{
            width: 300,
            height: 420,
            borderRadius: 28,
            border: "4px solid #e8c65a",
            background: "linear-gradient(160deg, #6856e6 0%, #8c50e6 100%)",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            transform: "rotate(6deg)",
            boxShadow: "0 30px 60px rgba(0,0,0,0.45)",
          }}
        >
          <div style={{ fontSize: 110, fontWeight: 800, color: "#fff" }}>A</div>
          <div style={{ fontSize: 34, color: "#fff", marginTop: 10 }}>Deutsch</div>
          <div style={{ fontSize: 24, color: "#e8c65a", marginTop: 26 }}>+10 XP</div>
        </div>
      </div>
    ),
    size,
  );
}
