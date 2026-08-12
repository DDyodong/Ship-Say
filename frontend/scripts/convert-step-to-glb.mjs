import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import * as THREE from "three";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

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

  async readAsDataURL(blob) {
    try {
      const buffer = Buffer.from(await blob.arrayBuffer());
      this.result = `data:${blob.type};base64,${buffer.toString("base64")}`;
      this.onloadend?.();
    } catch (error) {
      this.onerror?.(error);
    }
  }
}

globalThis.FileReader ??= NodeFileReader;

const [, , inputArg, outputArg] = process.argv;

if (!inputArg || !outputArg) {
  console.error("Usage: node scripts/convert-step-to-glb.mjs <input.step> <output.glb>");
  process.exit(1);
}

const inputPath = path.resolve(inputArg);
const outputPath = path.resolve(outputArg);
const input = fs.readFileSync(inputPath);
const occt = await occtImportJs();

console.log(`Reading ${path.basename(inputPath)} (${(input.byteLength / 1024 / 1024).toFixed(1)} MB)...`);
const result = occt.ReadStepFile(input, {
  linearUnit: "millimeter",
  linearDeflectionType: "bounding_box_ratio",
  linearDeflection: 0.05,
  angularDeflection: 0.8,
});

if (!result.success || !result.meshes?.length) {
  throw new Error("STEP parsing failed or produced no meshes.");
}

const zUpToYUp = new THREE.Matrix4().makeRotationX(-Math.PI / 2);
const colorBuckets = new Map();
let sourceTriangles = 0;

const quantizedColor = (mesh) => {
  const color = mesh.color ?? [0.72, 0.78, 0.8];
  const channels = color.map((value) => Math.max(0, Math.min(7, Math.round(value * 7))));
  return channels.join("-");
};

for (const sourceMesh of result.meshes) {
  const positions = sourceMesh.attributes?.position?.array;
  const indices = sourceMesh.index?.array;
  if (!positions?.length || !indices?.length) continue;

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  if (sourceMesh.attributes.normal?.array?.length) {
    geometry.setAttribute("normal", new THREE.Float32BufferAttribute(sourceMesh.attributes.normal.array, 3));
  } else {
    geometry.computeVertexNormals();
  }
  geometry.setIndex(Array.from(indices));
  geometry.applyMatrix4(zUpToYUp);

  sourceTriangles += indices.length / 3;
  const key = quantizedColor(sourceMesh);
  if (!colorBuckets.has(key)) colorBuckets.set(key, []);
  colorBuckets.get(key).push(geometry);
}

const scene = new THREE.Scene();
const mergedGeometries = [];

for (const [key, geometries] of colorBuckets) {
  const merged = mergeGeometries(geometries, false);
  if (!merged) throw new Error(`Could not merge geometry bucket ${key}.`);

  const rgb = key.split("-").map((channel) => Number(channel) / 7);
  const material = new THREE.MeshStandardMaterial({
    color: new THREE.Color(rgb[0], rgb[1], rgb[2]),
    metalness: 0.45,
    roughness: 0.55,
  });
  const mesh = new THREE.Mesh(merged, material);
  mesh.name = `cad-${key}`;
  scene.add(mesh);
  mergedGeometries.push(merged);
}

const bounds = new THREE.Box3().setFromObject(scene);
const size = bounds.getSize(new THREE.Vector3());
const center = bounds.getCenter(new THREE.Vector3());
scene.position.set(-center.x, -bounds.min.y, -center.z);
scene.updateMatrixWorld(true);

const exporter = new GLTFExporter();
const glb = await exporter.parseAsync(scene, {
  binary: true,
  onlyVisible: true,
  trs: false,
});

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, Buffer.from(glb));

const outputSize = fs.statSync(outputPath).size;
console.log(`Meshes: ${result.meshes.length} -> ${scene.children.length}`);
console.log(`Triangles: ${Math.round(sourceTriangles).toLocaleString()}`);
console.log(`Y-up bounds: ${size.x.toFixed(1)} x ${size.y.toFixed(1)} x ${size.z.toFixed(1)}`);
console.log(`Wrote ${path.basename(outputPath)} (${(outputSize / 1024 / 1024).toFixed(1)} MB)`);

for (const geometry of mergedGeometries) geometry.dispose();
