import Image from "next/image";
export function Brand() {
  return (
    <div className="brand">
      <Image
        className="brand-logo"
        src="/radhe-logo.jpg"
        width={52}
        height={54}
        alt="Radhe Infinity society logo"
        priority
      />
      <div>
        <strong>radhe</strong>
        <span>FESTIVAL DESK</span>
      </div>
    </div>
  );
}
