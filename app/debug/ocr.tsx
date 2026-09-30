import { useEffect, useState, type ChangeEvent } from "react";
import { ScrollView, StyleSheet, Text } from "react-native";
import { recognize, type TextBox } from "../../src/ocr";

type Scan =
  | { state: "idle" }
  | { state: "reading"; photo: string }
  | { state: "read"; photo: string; boxes: TextBox[]; ms: number }
  | { state: "failed"; photo: string; message: string };

export default function OcrDebug() {
  const [scan, setScan] = useState<Scan>({ state: "idle" });
  const [size, setSize] = useState<{ width: number; height: number }>();
  const photo = scan.state === "idle" ? undefined : scan.photo;

  useEffect(() => () => {
    if (photo) URL.revokeObjectURL(photo);
  }, [photo]);

  async function choose(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    const url = URL.createObjectURL(file);
    setSize(undefined);
    setScan({ state: "reading", photo: url });
    const started = performance.now();
    try {
      const boxes = await recognize(file);
      setScan({ state: "read", photo: url, boxes, ms: Math.round(performance.now() - started) });
    } catch (error) {
      setScan({ state: "failed", photo: url, message: String(error) });
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.screen}>
      <Text style={styles.title} role="heading" aria-level={1}>
        Read a receipt
      </Text>
      <label style={{ fontSize: 16 }}>
        Receipt photo <input type="file" accept="image/*" onChange={choose} style={{ fontSize: 16 }} />
      </label>
      <Text style={styles.status} testID="ocr-status" aria-live="polite">
        {scan.state === "idle" && "Choose a photo to read."}
        {scan.state === "reading" && "Reading…"}
        {scan.state === "read" && `Read ${scan.boxes.length} boxes in ${scan.ms} ms.`}
        {scan.state === "failed" && `Could not read it. ${scan.message}`}
      </Text>
      {photo && (
        <div style={{ position: "relative", maxWidth: 560 }}>
          <img
            src={photo}
            alt="Receipt"
            style={{ display: "block", width: "100%" }}
            onLoad={(e) => setSize({ width: e.currentTarget.naturalWidth, height: e.currentTarget.naturalHeight })}
          />
          {scan.state === "read" && size && (
            <svg
              viewBox={`0 0 ${size.width} ${size.height}`}
              style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
              aria-hidden
            >
              {scan.boxes.map((box, i) => (
                <polygon
                  key={i}
                  points={box.corners.map((p) => `${p.x},${p.y}`).join(" ")}
                  fill="rgba(255, 149, 0, 0.12)"
                  stroke="#ff9500"
                  strokeWidth={Math.max(1, size.width / 400)}
                />
              ))}
            </svg>
          )}
        </div>
      )}
      {scan.state === "read" && (
        <>
          <ol aria-label="Text boxes" style={{ fontSize: 15, lineHeight: 1.4, margin: 0, paddingLeft: 24 }}>
            {scan.boxes.map((box, i) => (
              <li key={i}>{box.text}</li>
            ))}
          </ol>
          <details>
            <summary>TextBox JSON</summary>
            <pre data-testid="ocr-json" style={{ fontSize: 12, whiteSpace: "pre-wrap" }}>
              {JSON.stringify({ ms: scan.ms, boxes: scan.boxes })}
            </pre>
          </details>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { padding: 24, gap: 16 },
  title: { fontSize: 28, fontWeight: "700", letterSpacing: -0.4 },
  status: { fontSize: 17, lineHeight: 24 },
});
