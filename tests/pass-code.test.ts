import { it, expect } from "vitest";
import { parsePassCode } from "../src/lib/pass-code";
import QRCode from "qrcode";
import sharp from "sharp";
import {
  BinaryBitmap,
  HybridBinarizer,
  RGBLuminanceSource,
  QRCodeReader,
} from "@zxing/library";
const origin = "https://festivals.example.com";
const id = "8d7db1ac-c7fe-452d-85f9-12b7c1623138";
it("accepts only this environment's resident/guest passes, never RSVP edit links", () => {
  expect(parsePassCode(`${origin}/resident-pass/${id}`, origin)).toEqual({
    kind: "resident",
    code: id,
  });
  expect(parsePassCode(`${origin}/guest-pass/${id}`, origin)).toEqual({
    kind: "guest",
    code: id,
  });
  for (const value of [
    `https://other.example.com/guest-pass/${id}`,
    `${origin}/rsvp/${id}`,
    `${origin}/guest-pass/no-code`,
    `javascript:alert(1)`,
  ])
    expect(parsePassCode(value, origin)).toBeNull();
});
it("generated QR images decode back into the exact pass URL", async () => {
  const url = `${origin}/resident-pass/${id}`;
  const png = await QRCode.toBuffer(url, {
    scale: 8,
    margin: 4,
    errorCorrectionLevel: "M",
  });
  const { data, info } = await sharp(png)
    .greyscale()
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const result = new QRCodeReader().decode(
    new BinaryBitmap(
      new HybridBinarizer(
        new RGBLuminanceSource(
          new Uint8ClampedArray(data),
          info.width,
          info.height,
        ),
      ),
    ),
  );
  expect(result.getText()).toBe(url);
});
