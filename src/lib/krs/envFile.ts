import fs from "node:fs";
import path from "node:path";

// Design Ref: CLAUDE.md — 토큰 값은 사용자에게 묻거나 화면/로그에 출력하지 않고 .env 파일로만 관리한다.
const ENV_PATH = path.join(process.cwd(), ".env");

// KRS_TOKEN 값을 .env 파일과 현재 프로세스 양쪽에 반영한다.
export function updateKrsTokenInEnvFile(newToken: string): void {
  process.env.KRS_TOKEN = newToken;

  const content = fs.existsSync(ENV_PATH) ? fs.readFileSync(ENV_PATH, "utf8") : "";
  const line = `KRS_TOKEN='${newToken}'`;
  const pattern = /^KRS_TOKEN=.*$/m;

  const next = pattern.test(content)
    ? content.replace(pattern, line)
    : `${content.replace(/\n?$/, "\n")}${line}\n`;

  fs.writeFileSync(ENV_PATH, next, "utf8");
}
