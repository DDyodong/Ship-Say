export const FACILITY_MARKERS = [
  {
    code: "A1",
    name: "가공 1구역",
    group: "A",
    lat: 34.0,
    lng: 128.0,
    risk: "low",
  },
];

export const DOCK_ZONES = [
  {
    code: "DOCK-01",
    name: "1 DOCK",
    points: [
      { lat: 34.0, lng: 128.0 },
      { lat: 34.0, lng: 128.1 },
      { lat: 33.9, lng: 128.1 },
      { lat: 33.9, lng: 128.0 },
    ],
  },
];

export const YARD_GATES = [
  {
    code: "WEST-GATE",
    name: "서문",
    lat: 34.0,
    lng: 128.0,
  },
];s

const polygon = new kakao.maps.Polygon({
  path: dock.points.map(
    point => new kakao.maps.LatLng(point.lat, point.lng),
  ),
  strokeWeight: 3,
  strokeColor: "#ff435d",
  strokeOpacity: 0.9,
  fillColor: "#ff435d",
  fillOpacity: 0.12,
});

polygon.setMap(map);