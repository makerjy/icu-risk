from __future__ import annotations

import os
import pickle
from dataclasses import dataclass
from typing import Dict, List, Optional


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
        self._model_loaded = False
        self._message = "stub"

        model_path = os.getenv("MODEL_PATH")
        if model_path:
            try:
                with open(model_path, "rb") as handle:
                    self._model = pickle.load(handle)
                self._model_loaded = True
                self._message = f"loaded:{model_path}"
            except Exception as exc:  # pragma: no cover - demo fallback
                self._model = None
                self._model_loaded = False
                self._message = f"load_failed:{exc}"

    @property
    def status(self) -> str:
        return self._message

    def predict(self, features: Dict[str, float]) -> ModelOutput:
        vector = [features.get(name, 0.0) for name in self._feature_order]

        if self._model_loaded and hasattr(self._model, "predict"):
            try:
                prediction = self._model.predict([vector])[0]
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
