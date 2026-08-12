import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import * as THREE from "three";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";

const require = createRequire(import.meta.url);
const occtImportJs = require("occt-import-js");

class NodeFileReader {
  constructor() {
    this.result = null;
    this.onloadend = null;
    this.onerror = null;
  }
  async readAsArrayBuffer(blob) {
    try {
      this.result = await blob.arrayBuffer();
      this.onloadend?.();
    } catch (error) {
      this.onerror?.(error);
    }
  }
}

globalThis.FileReader ??= NodeFileReader;

const [, , inputArg, outputArg, indicesArg] = process.argv;
if (!inputArg || !outputArg || !indicesArg) {
  console.error("Usage: node scripts/extract-step-parts-to-glb.mjs <input.step> <output.glb> <indices>");
  process.exit(1);
}

const selectedIndices = new Set(indicesArg.split(",").map(Number));
const occt = await occtImportJs();
const result = occt.ReadStepFile(fs.readFileSync(path.resolve(inputArg)), {
  linearUnit: "millimeter",
  linearDeflectionType: "bounding_box_ratio",
  linearDeflection: 0.05,
  angularDeflection: 0.8,
});
if (!result.success || !result.meshes?.length) throw new Error("STEP parsing failed.");

const scene = new THREE.Scene();
const zUpToYUp = new THREE.Matrix4().makeRotationX(-Math.PI / 2);
for (const [index, sourceMesh] of result.meshes.entries()) {
  if (!selectedIndices.has(index)) continue;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(sourceMesh.attributes.position.array, 3));
  if (sourceMesh.attributes.normal?.array?.length) {
    geometry.setAttribute("normal", new THREE.Float32BufferAttribute(sourceMesh.attributes.normal.array, 3));
  } else {
    geometry.computeVertexNormals();
  }
  geometry.setIndex(Array.from(sourceMesh.index.array));
  geometry.applyMatrix4(zUpToYUp);
  const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({
    color: "#e8e1d3",
    metalness: 0.34,
    roughness: 0.46,
  }));
  mesh.name = "robot-tool-part-" + index;
  scene.add(mesh);
}

if (!scene.children.length) throw new Error("No matching STEP parts.");
const bounds = new THREE.Box3().setFromObject(scene);
const center = bounds.getCenter(new THREE.Vector3());
scene.position.set(-center.x, -bounds.min.y, -center.z);
scene.updateMatrixWorld(true);

const glb = await new GLTFExporter().parseAsync(scene, { binary: true, onlyVisible: true });
const outputPath = path.resolve(outputArg);
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, Buffer.from(glb));
console.log("Wrote " + path.basename(outputPath) + " with STEP parts " + indicesArg);
