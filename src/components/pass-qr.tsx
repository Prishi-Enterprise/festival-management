/* eslint-disable @next/next/no-img-element */
import QRCode from "qrcode";
export async function PassQr({ url }: { url: string }) {
  const src = await QRCode.toDataURL(url, {
    scale: 8,
    margin: 4,
    errorCorrectionLevel: "M",
  });
  return (
    <figure className="pass-qr">
      <img src={src} width={300} height={300} alt="Attendance pass QR code" />
      <figcaption>
        Show this QR code to the committee at the meal entrance.
      </figcaption>
    </figure>
  );
}
