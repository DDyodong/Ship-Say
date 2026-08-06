# ShipyardSpatialRiskMLP

This browser-side neural network predicts the future risk probability of every mapped facility from incident location, hazard type, wind direction, and forecast time.

- Training data: 15,000 scenarios generated from the 15 confirmed facility coordinates.
- Split: 12,000 train / 3,000 validation.
- Network: 21 inputs → 32 ReLU → 16 ReLU → 15 sigmoid probabilities.
- Optimizer: Adam, implemented with NumPy in `train_spatial_risk_model.py`.
- Reproduce: run `python src/utils/train_spatial_risk_model.py` from `frontend`.

## Limitation

This is a genuinely trained neural network, but it learns from digital-twin synthetic scenarios rather than real accident outcomes. It is appropriate for a proof of concept and simulation-assisted decision support, not field-validated safety decisions. Operational use requires retraining and calibration with real sensors, incident history, wind observations, and expert-reviewed outcomes.
