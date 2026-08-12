import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import * as THREE from "three";

const require = createRequire(import.meta.url);
const occtImportJs = require("occt-import-js");
const [, , inputArg] = process.argv;

if (!inputArg) {
  console.error("Usage: node scripts/inspect-step-parts.mjs <input.step>");
  process.exit(1);
}

const inputPath = path.resolve(inputArg);
const occt = await occtImportJs();
const result = occt.ReadStepFile(fs.readFileSync(inputPath), {
  linearUnit: "millimeter",
  linearDeflectionType: "bounding_box_ratio",
  linearDeflection: 0.08,
  angularDeflection: 1,
});

if (!result.success || !result.meshes?.length) throw new Error("STEP parsing failed.");

const zUpToYUp = new THREE.Matrix4().makeRotationX(-Math.PI / 2);
const parts = result.meshes.map((mesh, index) => {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(mesh.attributes.position.array, 3));
  geometry.applyMatrix4(zUpToYUp);
  geometry.computeBoundingBox();
  const size = geometry.boundingBox.getSize(new THREE.Vector3());
  const center = geometry.boundingBox.getCenter(new THREE.Vector3());
  const triangles = (mesh.index?.array?.length || 0) / 3;
  geometry.dispose();
  return { index, center, size, triangles };
});

const fmt = (v) => [v.x, v.y, v.z].map((n) => Math.round(n * 10) / 10).join(",");
parts
  .sort((a, b) => b.center.y - a.center.y)
  .forEach((part) => console.log(
    part.index + "\tcenter=" + fmt(part.center) + "\tsize=" + fmt(part.size) + "\ttri=" + Math.round(part.triangles),
  ));
