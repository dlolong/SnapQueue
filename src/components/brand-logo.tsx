import Image from "next/image";

export function BrandLogo({ className }: { className?: string }) {
  return <Image
    src="/images/snapqueue-logo.png"
    alt="SnapQueue"
    width={524}
    height={130}
    priority
    className={className}
  />;
}
