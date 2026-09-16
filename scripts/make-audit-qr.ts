// 실사 화면(/audit_oa) 주소를 담은 QR 코드를 public/audit-qr.svg로 만든다.
// 주소가 바뀌면 이 스크립트만 다시 실행하면 된다.
// 실행: npx tsx scripts/make-audit-qr.ts [주소]
import fs from "node:fs";
import path from "node:path";
import QRCode from "qrcode";

const url = process.argv[2] ?? "https://itsms.vercel.app/audit_oa";

async function main() {
  const svg = await QRCode.toString(url, {
    type: "svg",
    errorCorrectionLevel: "M",
    margin: 1,
    color: { dark: "#000000", light: "#FFFFFF" },
  });

  const out = path.join(process.cwd(), "public", "audit-qr.svg");
  fs.writeFileSync(out, svg, "utf8");
  console.log(`QR 생성 완료: ${out}`);
  console.log(`담긴 주소: ${url}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
