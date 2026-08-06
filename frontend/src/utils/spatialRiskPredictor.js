import model from "./spatialRiskModel.json";

function dense(input, weights, biases, activation) {
  return biases.map((bias, outputIndex) => {
    let value = bias;
    for (let inputIndex = 0; inputIndex < input.length; inputIndex += 1) value += input[inputIndex] * weights[inputIndex][outputIndex];
    if (activation === "relu") return Math.max(0, value);
    return 1 / (1 + Math.exp(-Math.max(-20, Math.min(20, value))));
  });
}

export function predictSpatialRisk({ originCode, hazardCode, windDegrees, forecastSeconds }) {
  const input = new Array(model.inputSize).fill(0);
  const originIndex = model.facilityCodes.indexOf(originCode);
  const hazardIndex = model.hazardCodes.indexOf(hazardCode);
  if (originIndex < 0 || hazardIndex < 0) throw new Error("공간 위험 모델이 지원하지 않는 입력입니다.");
  input[originIndex] = 1;
  input[model.facilityCodes.length + hazardIndex] = 1;
  const offset = model.facilityCodes.length + model.hazardCodes.length;
  input[offset] = Math.sin(windDegrees * Math.PI / 180);
  input[offset + 1] = Math.cos(windDegrees * Math.PI / 180);
  input[offset + 2] = Math.max(0, Math.min(120, forecastSeconds)) / 120;
  const hidden1 = dense(input, model.weights[0], model.biases[0], "relu");
  const hidden2 = dense(hidden1, model.weights[1], model.biases[1], "relu");
  const output = dense(hidden2, model.weights[2], model.biases[2], "sigmoid");
  return model.facilityCodes.map((facilityCode, index) => ({ facilityCode, probability: output[index] }));
}

export const spatialRiskModelMetadata = {
  name: model.modelName, version: model.version, architecture: model.architecture,
  trainingSource: model.trainingSource, sampleCount: model.sampleCount,
  validationCount: model.validationCount, metrics: model.metrics,
};
