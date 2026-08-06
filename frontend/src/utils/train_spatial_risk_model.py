"""Train a browser-side spatial-risk neural network from twin simulations.

Labels are synthetic: confirmed facility coordinates, hazard type, wind and
forecast time generate stochastic scenarios. This is a sim-to-model baseline,
not a field-validated accident model.
"""
from __future__ import annotations
import json, math, os
from pathlib import Path
import numpy as np

ROOT = Path(__file__).resolve().parents[2]
FACILITY_PATH = ROOT / "src" / "components" / "digitalTwin" / "geojeShipyardTags.json"
OUTPUT_PATH = Path(os.environ.get("SHIP_RISK_MODEL_OUTPUT", ROOT / "src" / "utils" / "spatialRiskModel.json"))
SEED = 250805
HAZARDS = ["FIRE", "GAS", "CRANE"]
BASE_RADIUS = np.array([38.0, 48.0, 55.0])
GROWTH = np.array([0.95, 1.35, 0.45])

def load_facilities():
    payload = json.loads(FACILITY_PATH.read_text(encoding="utf-8"))
    return [{"code": f"TAG-{x['id']}", "name": x["name"], "lat": x["lat"], "lng": x["lng"]}
            for x in payload if x.get("status") == "confirmed"]

def spatial_matrices(facilities):
    n = len(facilities); distances = np.zeros((n,n), np.float32); bearings = np.zeros((n,n), np.float32)
    for i, origin in enumerate(facilities):
        for j, target in enumerate(facilities):
            north = (target["lat"]-origin["lat"])*111_320
            east = (target["lng"]-origin["lng"])*111_320*math.cos(math.radians(origin["lat"]))
            distances[i,j] = math.hypot(north,east)
            bearings[i,j] = (math.degrees(math.atan2(east,north))+360)%360
    return distances,bearings

def make_dataset(facilities, count, rng):
    n=len(facilities); distances,bearings=spatial_matrices(facilities)
    origins=rng.integers(0,n,count); hazards=rng.integers(0,3,count)
    winds=rng.uniform(0,360,count); seconds=rng.uniform(5,120,count)
    x=np.zeros((count,n+6),np.float32); x[np.arange(count),origins]=1; x[np.arange(count),n+hazards]=1
    x[:,n+3]=np.sin(np.radians(winds)); x[:,n+4]=np.cos(np.radians(winds)); x[:,n+5]=seconds/120
    vulnerability=rng.uniform(.82,1.18,(3,n)).astype(np.float32); y=np.zeros((count,n),np.float32)
    for row in range(count):
        i=origins[row]; h=hazards[row]; radius=BASE_RADIUS[h]+GROWTH[h]*seconds[row]
        diff=np.abs((bearings[i]-winds[row]+180)%360-180)
        boost=.58+.72*np.maximum(0,np.cos(np.radians(diff)))
        logits=(radius*boost+55-distances[i])/34
        probability=(1/(1+np.exp(-np.clip(logits,-20,20))))*vulnerability[h]
        probability*=rng.normal(1,.055); probability+=rng.normal(0,.012,n)
        probability[i]=max(probability[i],.94+rng.uniform(0,.05)); y[row]=np.clip(probability,0,1)
    return x,y

def relu(x): return np.maximum(x,0)
def sigmoid(x): return 1/(1+np.exp(-np.clip(x,-20,20)))
def forward(x,w,b): return sigmoid(relu(relu(x@w[0]+b[0])@w[1]+b[1])@w[2]+b[2])

def train(train_x,train_y,val_x,val_y,rng):
    widths=[train_x.shape[1],32,16,train_y.shape[1]]
    w=[rng.normal(0,math.sqrt(2/widths[i]),(widths[i],widths[i+1])).astype(np.float32) for i in range(3)]
    b=[np.zeros(widths[i+1],np.float32) for i in range(3)]
    m=[np.zeros_like(v) for pair in zip(w,b) for v in pair]; v=[np.zeros_like(x) for x in m]
    step=0; batch_size=384; lr=.0022
    for epoch in range(190):
        order=rng.permutation(len(train_x))
        for start in range(0,len(train_x),batch_size):
            rows=order[start:start+batch_size]; x=train_x[rows]; target=train_y[rows]
            z1=x@w[0]+b[0]; a1=relu(z1); z2=a1@w[1]+b[1]; a2=relu(z2); out=sigmoid(a2@w[2]+b[2])
            d3=2*(out-target)/len(rows)*out*(1-out); gw3=a2.T@d3; gb3=d3.sum(0)
            d2=(d3@w[2].T)*(z2>0); gw2=a1.T@d2; gb2=d2.sum(0)
            d1=(d2@w[1].T)*(z1>0); gradients=[x.T@d1,d1.sum(0),gw2,gb2,gw3,gb3]
            step+=1
            for k,g in enumerate(gradients):
                m[k]=.9*m[k]+.1*g; v[k]=.999*v[k]+.001*g*g
                parameter=w[k//2] if k%2==0 else b[k//2]
                parameter-=lr*(m[k]/(1-.9**step))/(np.sqrt(v[k]/(1-.999**step))+1e-8)
        if epoch%25==0 or epoch==189:
            print(f"epoch={epoch:03d} validation_mae={np.mean(np.abs(forward(val_x,w,b)-val_y)):.5f}")
    return w,b

def main():
    rng=np.random.default_rng(SEED); facilities=load_facilities(); x,y=make_dataset(facilities,15_000,rng); split=12_000
    w,b=train(x[:split],y[:split],x[split:],y[split:],rng); prediction=forward(x[split:],w,b)
    mae=float(np.mean(np.abs(prediction-y[split:]))); rmse=float(np.sqrt(np.mean((prediction-y[split:])**2)))
    r2=1-float(np.sum((y[split:]-prediction)**2))/float(np.sum((y[split:]-y[split:].mean(0))**2))
    artifact={"modelName":"ShipyardSpatialRiskMLP","version":"1.0.0","trainingSource":"DIGITAL_TWIN_SYNTHETIC_SCENARIOS",
      "seed":SEED,"sampleCount":len(x),"validationCount":len(x)-split,"facilityCodes":[f["code"] for f in facilities],
      "hazardCodes":HAZARDS,"inputSize":x.shape[1],"architecture":[x.shape[1],32,16,y.shape[1]],"activation":"relu",
      "outputActivation":"sigmoid","metrics":{"mae":round(mae,6),"rmse":round(rmse,6),"r2":round(r2,6)},
      "weights":[np.round(np.asarray(value,dtype=np.float64),5).tolist() for value in w],
      "biases":[np.round(np.asarray(value,dtype=np.float64),5).tolist() for value in b]}
    OUTPUT_PATH.write_text(json.dumps(artifact,ensure_ascii=False,separators=(",",":")),encoding="utf-8")
    print(json.dumps(artifact["metrics"],indent=2)); print(f"saved={OUTPUT_PATH}")

if __name__=="__main__": main()
