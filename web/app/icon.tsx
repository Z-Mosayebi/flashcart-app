import { ImageResponse } from "next/og";

// Browser-tab and home-screen icon: a small tilted card with an "F".
export const size = { width: 64, height: 64 };
export const contentType = "image/png";
export const runtime = "edge";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(160deg, #6856e6 0%, #8c50e6 100%)",
          borderRadius: 14,
          border: "3px solid #e8c65a",
          color: "#fff",
          fontSize: 40,
          fontWeight: 800,
          fontFamily: "sans-serif",
        }}
      >
        F
      </div>
    ),
    size,
  );
}
