from __future__ import annotations

import os
import pickle
from dataclasses import dataclass
from typing import Dict, List, Optional, Sequence, Union

import numpy as np
try:  # torch is optional for non-model mode
    import torch
except Exception:  # pragma: no cover - allow server to run without torch
    torch = None  # type: ignore[assignment]

try:
    import joblib
except Exception:  # pragma: no cover - allow fallback to pickle
    joblib = None  # type: ignore[assignment]


@dataclass
class ModelOutput:
    risk: Optional[float]
    contributions: Optional[Dict[str, float]]
    model_loaded: bool
    message: str


class ModelAdapter:
    def __init__(self, feature_order: List[str]) -> None:
        self._feature_order = feature_order
        self._model = None
        self._torch_model = None
        self._scaler = None
        self._gen_model = None
        self._model_loaded = False
        self._message = "stub"

        model_path = os.getenv(
            "MODEL_PATH",
            os.path.join(os.path.dirname(__file__), "..", "model", "RealMIP_Pre.pth"),
        )
        gen_path = os.getenv(
            "MODEL_GEN_PATH",
            os.path.join(os.path.dirname(__file__), "..", "model", "RealMIP_Gen.pth"),
        )
        scaler_path = os.getenv(
            "MODEL_SCALER_PATH",
            os.path.join(os.path.dirname(__file__), "..", "model", "data_scaler.pkl"),
        )

        if scaler_path and os.path.exists(scaler_path):
            try:
                if joblib:
                    self._scaler = joblib.load(scaler_path)
                else:
                    with open(scaler_path, "rb") as handle:
                        self._scaler = pickle.load(handle)
            except Exception as exc:  # pragma: no cover - demo fallback
                self._scaler = None
                self._message = f"scaler_load_failed:{exc}"

        if model_path and os.path.exists(model_path):
            if torch is None:
                self._message = "torch_missing"
            else:
                try:
                    self._torch_model = torch.jit.load(
                        model_path, map_location="cpu"
                    )
                    self._torch_model.eval()
                    self._model_loaded = True
                    self._message = f"loaded_jit:{model_path}"
                except Exception:
                    try:
                        loaded = torch.load(model_path, map_location="cpu")
                        if isinstance(loaded, torch.nn.Module):
                            self._torch_model = loaded
                            self._torch_model.eval()
                            self._model_loaded = True
                            self._message = f"loaded_nn:{model_path}"
                        else:
                            self._model = loaded
                            self._model_loaded = True
                            self._message = f"loaded_obj:{model_path}"
                    except Exception as exc:  # pragma: no cover - demo fallback
                        self._model_loaded = False
                        self._message = f"load_failed:{exc}"

        if gen_path and os.path.exists(gen_path) and torch is not None:
            try:
                self._gen_model = torch.jit.load(gen_path, map_location="cpu")
                self._gen_model.eval()
            except Exception:
                try:
                    loaded = torch.load(gen_path, map_location="cpu")
                    if isinstance(loaded, torch.nn.Module):
                        self._gen_model = loaded
                        self._gen_model.eval()
                except Exception:
                    self._gen_model = None

    @property
    def status(self) -> str:
        return self._message

    def _vector_from_row(self, row: Dict[str, Union[str, float]]) -> List[float]:
        values = []
        for name in self._feature_order:
            raw = row.get(name, 0.0)
            if raw in ("", None):
                values.append(float("nan"))
                continue
            try:
                values.append(float(raw))
            except Exception:
                values.append(float("nan"))
        return values

    def _prepare_input(self, features: Union[Dict[str, float], Sequence[Dict[str, Union[str, float]]]]) -> np.ndarray:
        if isinstance(features, dict):
            array = np.array([self._vector_from_row(features)], dtype=np.float32)
        else:
            sequence = [self._vector_from_row(row) for row in features]
            array = np.array(sequence, dtype=np.float32)

        nan_mask = np.isnan(array)
        if self._gen_model is not None and torch is not None and nan_mask.any():
            try:
                tensor = torch.tensor(np.nan_to_num(array, nan=0.0), dtype=torch.float32)
                if tensor.ndim == 2:
                    tensor = tensor.unsqueeze(0)
                with torch.no_grad():
                    generated = self._gen_model(tensor)
                if isinstance(generated, (tuple, list)):
                    generated = generated[0]
                gen_np = generated.squeeze().detach().cpu().numpy()
                if gen_np.shape == array.shape:
                    array = np.where(nan_mask, gen_np, array)
            except Exception:
                pass

        array = np.nan_to_num(array, nan=0.0)
        if self._scaler is not None and hasattr(self._scaler, "transform"):
            try:
                array = self._scaler.transform(array)
            except Exception:
                pass
        return array

    def predict(self, features: Union[Dict[str, float], Sequence[Dict[str, Union[str, float]]]]) -> ModelOutput:
        array = self._prepare_input(features)

        if self._torch_model is not None and torch is not None:
            try:
                tensor = torch.tensor(array, dtype=torch.float32)
                if tensor.ndim == 2:
                    tensor = tensor.unsqueeze(0)
                with torch.no_grad():
                    output = self._torch_model(tensor)
                if isinstance(output, (tuple, list)):
                    output = output[0]
                value = output.squeeze().detach().cpu().numpy()
                risk_value = float(value) if np.isscalar(value) else float(value[-1])
                risk = risk_value * 100 if risk_value <= 1 else risk_value
                return ModelOutput(
                    risk=risk,
                    contributions=None,
                    model_loaded=True,
                    message=self._message,
                )
            except Exception as exc:  # pragma: no cover - demo fallback
                return ModelOutput(
                    risk=None,
                    contributions=None,
                    model_loaded=True,
                    message=f"predict_failed:{exc}",
                )

        if self._model_loaded and hasattr(self._model, "predict"):
            try:
                prediction = self._model.predict(array)[0]
                risk = float(prediction) * 100 if prediction <= 1 else float(prediction)
                return ModelOutput(
                    risk=risk,
                    contributions=None,
                    model_loaded=True,
                    message=self._message,
                )
            except Exception as exc:  # pragma: no cover - demo fallback
                return ModelOutput(
                    risk=None,
                    contributions=None,
                    model_loaded=True,
                    message=f"predict_failed:{exc}",
                )

        return ModelOutput(
            risk=None,
            contributions=None,
            model_loaded=False,
            message=self._message,
        )

    def explain(self, features: Dict[str, float]) -> ModelOutput:
        # TODO: replace with SHAP/IG/attention outputs once model is available.
        # For now return empty contributions so heuristic can be used.
        return ModelOutput(
            risk=None,
            contributions=None,
            model_loaded=self._model_loaded,
            message=self._message,
        )
