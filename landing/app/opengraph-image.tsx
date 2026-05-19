/**
 * Next.js auto-generates `/opengraph-image` from this file at build
 * time. Same React subset that `next/og` supports — flexbox, basic CSS,
 * no animations, no SSR-only browser APIs.
 *
 * Same content is reused for the Twitter card.
 */

import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt =
  "Thundrly — Satın almadan önce 5 saniyelik akıllı kontrol";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "flex-start",
          padding: "84px",
          backgroundImage:
            "linear-gradient(135deg, #ccdbdc 0%, #9ad1d4 60%, #80ced7 100%)",
          color: "#003249",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "20px",
            marginBottom: "32px",
          }}
        >
          <div
            style={{
              width: "72px",
              height: "72px",
              borderRadius: "18px",
              background: "#f7fbfb",
              border: "1px solid rgba(0, 50, 73, 0.12)",
              color: "#003249",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <svg width="52" height="52" viewBox="0 0 40 40" fill="none">
              {[9, 16.5, 23.5, 31].map((y) => (
                <line
                  key={`l-${y}`}
                  x1="11.5"
                  y1={y}
                  x2="29"
                  y2="20"
                  stroke="currentColor"
                  strokeOpacity="0.32"
                  strokeWidth="1.3"
                  strokeLinecap="round"
                />
              ))}
              {[9, 16.5, 23.5, 31].map((y) => (
                <circle key={`d-${y}`} cx="11" cy={y} r="2.1" fill="currentColor" />
              ))}
              <circle cx="29" cy="20" r="5" fill="#007ea7" />
            </svg>
          </div>
          <div style={{ fontSize: "44px", fontWeight: 500, color: "#003249" }}>
            Thundrly
          </div>
        </div>

        <div
          style={{
            fontSize: "84px",
            fontWeight: 300,
            lineHeight: 1.05,
            letterSpacing: "-0.03em",
            maxWidth: "960px",
          }}
        >
          Satın almadan önce 5 saniyelik akıllı kontrol.
        </div>

        <div
          style={{
            marginTop: "40px",
            fontSize: "28px",
            color: "rgba(0, 50, 73, 0.72)",
            maxWidth: "920px",
            lineHeight: 1.35,
          }}
        >
          Yorum manipülasyonu, sahte indirim ve bütçe aşımını tek bir karar
          rengiyle gösterir — yeşil, sarı veya kırmızı.
        </div>
      </div>
    ),
    size,
  );
}
