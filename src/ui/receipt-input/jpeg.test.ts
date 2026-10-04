import { expect, test } from "vitest";

import { receiptJpeg, withoutMetadata } from "./jpeg";

const SOI = [0xff, 0xd8];
const APP0 = [0xff, 0xe0, 0x00, 0x06, 0x4a, 0x46, 0x49, 0x46];
const APP1_EXIF = [0xff, 0xe1, 0x00, 0x08, 0x45, 0x78, 0x69, 0x66, 0x00, 0x00];
const APP2_ICC = [0xff, 0xe2, 0x00, 0x06, 0x49, 0x43, 0x43, 0x5f];
const COM = [0xff, 0xfe, 0x00, 0x04, 0x68, 0x69];
const DQT = [0xff, 0xdb, 0x00, 0x04, 0x00, 0x01];
const SOF0 = [0xff, 0xc0, 0x00, 0x05, 0x08, 0x00, 0x01];
const DHT = [0xff, 0xc4, 0x00, 0x03, 0x00];
const SOS = [0xff, 0xda, 0x00, 0x03, 0x01];
// Entropy-coded data holds stuffed 0xFF00 bytes and a restart marker, neither of which ends the scan.
const SCAN = [0x12, 0xff, 0x00, 0x34, 0xff, 0xd0, 0x56];
const EOI = [0xff, 0xd9];

const bytes = (...parts: number[][]) => [...new Uint8Array(parts.flat())];
const clean = (...parts: number[][]) => {
  const out = withoutMetadata(new Uint8Array(parts.flat()));
  return out && [...out];
};

test("drops EXIF, the ICC profile and comments, and keeps the image segments and the scan byte for byte", () => {
  expect(clean(SOI, APP0, APP1_EXIF, APP2_ICC, COM, DQT, SOF0, DHT, SOS, SCAN, EOI)).toEqual(bytes(SOI, APP0, DQT, SOF0, DHT, SOS, SCAN, EOI));
});

test("keeps every scan of a progressive JPEG and the tables between them", () => {
  expect(clean(SOI, DQT, SOF0, DHT, SOS, SCAN, DHT, SOS, SCAN, EOI)).toEqual(bytes(SOI, DQT, SOF0, DHT, SOS, SCAN, DHT, SOS, SCAN, EOI));
});

test("refuses bytes that are not a whole JPEG", () => {
  expect([clean([0x89, 0x50, 0x4e, 0x47]), clean(SOI, APP0, SOS, SCAN), clean(SOI, [0xff, 0xe1, 0x00, 0x40, 0x45])]).toEqual([null, null, null]);
});

test("a receipt copy is the cleaned JPEG, and only while it fits 150 KB", async () => {
  const sized = (size: number) => {
    const whole = new Uint8Array(size).fill(0x11);
    whole.set(bytes(SOI, APP1_EXIF, DQT, SOF0, DHT, SOS));
    whole.set(EOI, size - EOI.length);
    return whole;
  };
  const fits = receiptJpeg(sized(150 * 1024 + APP1_EXIF.length));
  expect([fits?.type, fits?.size, receiptJpeg(sized(150 * 1024 + APP1_EXIF.length + 1))]).toEqual(["image/jpeg", 150 * 1024, null]);
  expect([...new Uint8Array(await fits!.arrayBuffer()).subarray(0, 4)]).toEqual([0xff, 0xd8, 0xff, 0xdb]);
});
