export function maskName(name) {
  const value = String(name || "").trim();

  if (!value) return "-";
  if (value.length === 1) return "*";

  return `${value.slice(0, -1)}*`;
}
