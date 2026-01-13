from __future__ import annotations

import os
import pickle
from dataclasses import dataclass
from typing import Dict, List, Optional, Sequence

import numpy as np
import torch
import joblib

from .model_impl import CONFIG, LSTMModel, TSB_eICU


@dataclass
class ModelOutput:
    risk: Optional[float]
    contributions: Optional[Dict[str, float]]
    model_loaded: bool
    message: str


class ModelAdapter:
    def __init__(self, feature_order: List[str]) -> None:
        self._feature_order = feature_order
        self._scaler = None
        self._gen_model = None
        self._pre_model = None
        self._model_loaded = False
        self._message = "stub"

        model_path = os.getenv(
            "MODEL_PATH",
            os.path.join(
                os.path.dirname(__file__), "..", "model", "RealMIP_Pre.pth"
            ),
        )
        gen_path = os.getenv(
            "MODEL_GEN_PATH",
            os.path.join(
                os.path.dirname(__file__), "..", "model", "RealMIP_Gen.pth"
            ),
        )
        scaler_path = os.getenv(
            "MODEL_SCALER_PATH",
            os.path.join(os.path.dirname(__file__), "..", "model", "data_scaler.pkl"),
        )

        if scaler_path and os.path.exists(scaler_path):
            try:
                self._scaler = joblib.load(scaler_path)
            except Exception as exc:
                try:
                    with open(scaler_path, "rb") as handle:
                        self._scaler = pickle.load(handle)
                except Exception as inner_exc:
                    self._scaler = None
                    self._message = f"scaler_load_failed:{inner_exc or exc}"

        self._device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        try:
            self._gen_model = TSB_eICU(36, CONFIG, self._device).to(self._device)
            self._pre_model = LSTMModel(36).to(self._device)
            self._gen_model.load_state_dict(torch.load(gen_path, map_location=self._device))
            self._pre_model.load_state_dict(torch.load(model_path, map_location=self._device))
            self._gen_model.eval()
            self._pre_model.eval()
            self._model_loaded = True
            self._message = f"loaded_state_dict:{model_path}"
        except Exception as exc:
            self._model_loaded = False
            self._message = f"load_failed:{exc}"

    @property
    def status(self) -> str:
        return self._message

    def _vector_from_row(self, row: Dict[str, float]) -> List[float]:
        values = []
        for name in self._feature_order:
            raw = row.get(name, float("nan"))
            values.append(float(raw))
        return values

    def _prepare_sequence(self, features: Sequence[Sequence[float]]) -> tuple[np.ndarray, np.ndarray]:
        if not features:
            empty = np.zeros((1, len(self._feature_order)), dtype=np.float32)
            return empty, np.zeros_like(empty, dtype=np.float32)
        array = np.array(features, dtype=np.float32)
        mask = (~np.isnan(array)).astype(np.float32)
        array = np.nan_to_num(array, nan=0.0)
        if self._scaler is not None and hasattr(self._scaler, "transform"):
            array = self._scaler.transform(array)
        return array, mask

    def _build_batch(self, features: Sequence[Sequence[float]]) -> Dict[str, torch.Tensor]:
        array, obs_mask = self._prepare_sequence(features)
        observed = torch.tensor(array, dtype=torch.float32).unsqueeze(0)
        mask = torch.tensor(obs_mask, dtype=torch.float32).unsqueeze(0)
        seq_len = torch.tensor([array.shape[0]], dtype=torch.long)
        return {
            "patient_id": torch.tensor([0]),
            "observed_data": observed,
            "observed_mask": mask,
            "gt_mask": mask.clone(),
            "status": torch.tensor([0]),
            "seq_length": seq_len,
        }

    def predict(self, features: Sequence[Sequence[float]]) -> ModelOutput:
        if not self._model_loaded or self._gen_model is None or self._pre_model is None:
            return ModelOutput(
                risk=None,
                contributions=None,
                model_loaded=False,
                message=self._message,
            )

        try:
            batch = self._build_batch(features)
            with torch.no_grad():
                _, imputed, _, _, _, _, seq_len = self._gen_model(batch, is_train=0)
                output = self._pre_model(imputed, seq_len)
                risk_prob = torch.softmax(output, dim=1)[:, 1].item()
            return ModelOutput(
                risk=risk_prob * 100,
                contributions=None,
                model_loaded=True,
                message=self._message,
            )
        except Exception as exc:
            return ModelOutput(
                risk=None,
                contributions=None,
                model_loaded=True,
                message=f"predict_failed:{exc}",
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
