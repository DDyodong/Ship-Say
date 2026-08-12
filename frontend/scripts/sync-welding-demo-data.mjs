import { copyFile, mkdir } from "node:fs/promises";
import { accessSync, constants } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const frontendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const candidates = [
  process.env.WELDING_DATA_DIR,
  path.resolve(frontendRoot, "../ai/robot_anomaly_agent"),
  "/data/robot_anomaly_agent",
].filter(Boolean);
const sourceDir = candidates.find((candidate) => {
  try {
    accessSync(path.join(candidate, "rb_weld_01_timeline.csv"), constants.R_OK);
    accessSync(path.join(candidate, "weld_quality_seams.csv"), constants.R_OK);
    return true;
  } catch {
    return false;
  }
});

if (!sourceDir) {
  throw new Error(`용접 시뮬레이션 CSV를 찾을 수 없습니다. 확인한 경로: ${candidates.join(", ")}`);
}

const targetDir = path.join(frontendRoot, ".generated", "welding");
await mkdir(targetDir, { recursive: true });
for (const filename of ["rb_weld_01_timeline.csv", "weld_quality_seams.csv"]) {
  await copyFile(path.join(sourceDir, filename), path.join(targetDir, filename));
}

console.log(`[welding-data] ${sourceDir} → ${targetDir}`);

