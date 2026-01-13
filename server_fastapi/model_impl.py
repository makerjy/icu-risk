from __future__ import annotations

import math
from typing import Dict

import numpy as np
import torch
from torch import nn
import torch.nn.functional as F


CONFIG: Dict[str, Dict[str, float | int]] = {
    "diffusion": {
        "layers": 2,
        "channels": 64,
        "nheads": 4,
        "diffusion_embedding_dim": 128,
        "beta_start": 0.0001,
        "beta_end": 0.5,
        "num_steps": 10,
    },
    "model": {"featureemb": 16},
}


def get_torch_trans(heads: int = 4, layers: int = 1, channels: int = 64) -> nn.Module:
    encoder_layer = nn.TransformerEncoderLayer(
        d_model=channels,
        nhead=heads,
        dim_feedforward=channels * 2,
        activation="gelu",
        batch_first=True,
        dropout=0.3,
    )
    return nn.TransformerEncoder(encoder_layer, num_layers=layers)


class DiffusionEmbedding(nn.Module):
    def __init__(self, num_steps: int, embedding_dim: int = 64) -> None:
        super().__init__()
        self.register_buffer(
            "embedding", self._build_embedding(num_steps, embedding_dim // 2)
        )
        self.projection1 = nn.Linear(embedding_dim, embedding_dim)
        self.projection2 = nn.Linear(embedding_dim, embedding_dim)

    def _build_embedding(self, num_steps: int, dim: int) -> torch.Tensor:
        steps = torch.arange(num_steps).unsqueeze(1).float()
        freqs = 10.0 ** (torch.arange(dim) / (dim - 1) * 4.0).unsqueeze(0)
        table = steps * freqs
        return torch.cat([torch.sin(table), torch.cos(table)], dim=1)

    def forward(self, t: torch.Tensor) -> torch.Tensor:
        x = self.embedding[t]
        return F.silu(self.projection2(F.silu(self.projection1(x))))


class ResidualBlock(nn.Module):
    def __init__(
        self, side_dim: int, channels: int, diffusion_embedding_dim: int, nheads: int
    ) -> None:
        super().__init__()
        self.diffusion_projection = nn.Linear(diffusion_embedding_dim, channels)
        self.cond_projection = nn.Conv1d(side_dim, 2 * channels, 1)
        self.mid_projection = nn.Conv1d(channels, 2 * channels, 1)
        self.output_projection = nn.Conv1d(channels, 2 * channels, 1)
        self.time_layer = get_torch_trans(heads=nheads, layers=1, channels=channels)
        self.feature_layer = get_torch_trans(
            heads=nheads, layers=1, channels=channels
        )

    def forward(
        self,
        x: torch.Tensor,
        cond_info: torch.Tensor,
        diffusion_emb: torch.Tensor,
        seq_length: torch.Tensor,
    ) -> tuple[torch.Tensor, torch.Tensor]:
        batch, channel, features, length = x.shape
        x_flat = x.view(batch, channel, features * length)
        y = x_flat + self.diffusion_projection(diffusion_emb).unsqueeze(-1)

        y = (
            y.view(batch, channel, features, length)
            .permute(0, 2, 1, 3)
            .reshape(batch * features, channel, length)
            .permute(2, 0, 1)
        )
        y = self.time_layer(y)
        y = (
            y.permute(1, 2, 0)
            .view(batch, features, channel, length)
            .permute(0, 2, 1, 3)
            .reshape(batch, channel, features * length)
        )

        y = self.mid_projection(y) + self.cond_projection(
            cond_info.view(batch, -1, features * length)
        )
        gate, filter_value = torch.chunk(y, 2, dim=1)
        y = torch.sigmoid(gate) * torch.tanh(filter_value)
        res, skip = torch.chunk(self.output_projection(y), 2, dim=1)
        return (
            (x_flat + res).view(batch, channel, features, length) / math.sqrt(2.0),
            skip.view(batch, channel, features, length),
        )


class diff_CSDI(nn.Module):
    def __init__(self, config: Dict[str, float | int], inputdim: int = 2) -> None:
        super().__init__()
        self.channels = int(config["channels"])
        self.diffusion_embedding = DiffusionEmbedding(
            int(config["num_steps"]), int(config["diffusion_embedding_dim"])
        )
        self.input_projection = nn.Conv1d(inputdim, self.channels, 1)
        self.output_projection1 = nn.Conv1d(self.channels, self.channels, 1)
        self.output_projection2 = nn.Conv1d(self.channels, 1, 1)
        nn.init.zeros_(self.output_projection2.weight)
        self.residual_layers = nn.ModuleList(
            [
                ResidualBlock(
                    int(config["side_dim"]),
                    self.channels,
                    int(config["diffusion_embedding_dim"]),
                    int(config["nheads"]),
                )
                for _ in range(int(config["layers"]))
            ]
        )

    def forward(
        self,
        x: torch.Tensor,
        cond_info: torch.Tensor,
        t: torch.Tensor,
        seq_length: torch.Tensor,
    ) -> torch.Tensor:
        batch, cin, features, length = x.shape
        x = (
            F.relu(self.input_projection(x.view(batch, cin, features * length)))
            .view(batch, self.channels, features, length)
        )
        diff_emb = self.diffusion_embedding(t)
        skip_list = []
        for layer in self.residual_layers:
            x, skip = layer(x, cond_info, diff_emb, seq_length)
            skip_list.append(skip)
        x = torch.sum(torch.stack(skip_list), dim=0) / math.sqrt(len(self.residual_layers))
        x = self.output_projection2(
            F.relu(self.output_projection1(x.view(batch, self.channels, features * length)))
        )
        return x.view(batch, features, length)


class CSDI_base(nn.Module):
    def __init__(self, target_dim: int, config: Dict[str, Dict[str, float | int]], device: torch.device) -> None:
        super().__init__()
        self.device = device
        self.target_dim = target_dim
        self.embed_layer = nn.Embedding(target_dim, int(config["model"]["featureemb"]))
        config["diffusion"]["side_dim"] = int(config["model"]["featureemb"]) + 1
        self.diffmodel = diff_CSDI(config["diffusion"])
        self.num_steps = int(config["diffusion"]["num_steps"])
        beta = (
            np.linspace(
                float(config["diffusion"]["beta_start"]) ** 0.5,
                float(config["diffusion"]["beta_end"]) ** 0.5,
                self.num_steps,
            )
            ** 2
        )
        self.register_buffer("alpha_hat", torch.tensor(1 - beta, dtype=torch.float32))
        self.register_buffer("alpha", torch.cumprod(self.alpha_hat, dim=0))

    def get_side_info(self, cond_mask: torch.Tensor) -> torch.Tensor:
        batch, features, length = cond_mask.shape
        feat_queries = torch.arange(self.target_dim, device=self.device)
        emb = (
            self.embed_layer(feat_queries)
            .view(1, 1, features, -1)
            .expand(batch, length, -1, -1)
            .permute(0, 3, 2, 1)
        )
        return torch.cat([emb, cond_mask.unsqueeze(1)], dim=1)

    def impute(
        self,
        observed_data: torch.Tensor,
        cond_mask: torch.Tensor,
        side_info: torch.Tensor,
        n_samples: int,
        seq_length: torch.Tensor,
    ) -> torch.Tensor:
        batch, features, length = observed_data.shape
        imputed_samples = []
        for _ in range(n_samples):
            x = torch.randn_like(observed_data)
            for t in range(self.num_steps - 1, -1, -1):
                d_in = torch.cat(
                    [
                        (cond_mask * observed_data).unsqueeze(1),
                        ((1 - cond_mask) * x).unsqueeze(1),
                    ],
                    dim=1,
                )
                pred = self.diffmodel(
                    d_in,
                    side_info,
                    torch.tensor([t], device=self.device),
                    seq_length,
                )
                c1 = 1 / self.alpha_hat[t] ** 0.5
                c2 = (1 - self.alpha_hat[t]) / (1 - self.alpha[t]) ** 0.5
                x = c1 * (x - c2 * pred)
                if t > 0:
                    sig = (
                        ((1 - self.alpha[t - 1]) / (1 - self.alpha[t]))
                        * (1 - self.alpha_hat[t])
                    ) ** 0.5
                    x += sig * torch.randn_like(x)
            imputed_samples.append(x)
        return torch.stack(imputed_samples, dim=1)

    def forward(self, batch: Dict[str, torch.Tensor], is_train: int = 1):
        (
            _,
            obs_data,
            obs_mask,
            gt_mask,
            _,
            _,
            status,
            _,
            seq_len,
        ) = self.process_data(batch)
        cond_mask = (
            (torch.rand_like(obs_mask) < 0.5).float() * obs_mask
            if is_train
            else gt_mask
        )
        side_info = self.get_side_info(cond_mask)

        t = torch.randint(0, self.num_steps, (obs_data.size(0),), device=self.device)
        noise = torch.randn_like(obs_data)
        a = self.alpha[t].view(-1, 1, 1)
        noisy = a**0.5 * obs_data + (1 - a) ** 0.5 * noise
        d_in = torch.cat(
            [(cond_mask * obs_data).unsqueeze(1), ((1 - cond_mask) * noisy).unsqueeze(1)],
            dim=1,
        )
        pred = self.diffmodel(d_in, side_info, t, seq_len)
        loss = (((noise - pred) * (obs_mask - cond_mask)) ** 2).sum() / (
            (obs_mask - cond_mask).sum() + 1e-5
        )

        samples = self.impute(obs_data, cond_mask, side_info, 1 if is_train else 3, seq_len)
        return loss, samples.mean(dim=1), (obs_mask - cond_mask), status, obs_data, cond_mask, seq_len


class TSB_eICU(CSDI_base):
    def process_data(self, batch: Dict[str, torch.Tensor]):
        return (
            batch["patient_id"].to(self.device),
            batch["observed_data"].to(self.device).permute(0, 2, 1),
            batch["observed_mask"].to(self.device).permute(0, 2, 1),
            batch["gt_mask"].to(self.device).permute(0, 2, 1),
            None,
            None,
            batch["status"].to(self.device),
            None,
            batch["seq_length"].to(self.device),
        )


class LSTMModel(nn.Module):
    def __init__(self, input_dim: int = 36, hidden_dim: int = 128, num_layers: int = 1) -> None:
        super().__init__()
        self.lstm = nn.LSTM(
            input_dim,
            hidden_dim,
            num_layers,
            batch_first=True,
            dropout=0.3 if num_layers > 1 else 0,
            bidirectional=True,
        )
        self.dropout = nn.Dropout(0.5)
        self.fc = nn.Linear(hidden_dim * 2, 2)

    def forward(self, x: torch.Tensor, seq_lengths: torch.Tensor) -> torch.Tensor:
        if x.shape[1] == 36:
            x = x.permute(0, 2, 1)
        from torch.nn.utils.rnn import pack_padded_sequence

        packed_input = pack_padded_sequence(
            x, seq_lengths.cpu(), batch_first=True, enforce_sorted=False
        )
        _, (h_n, _) = self.lstm(packed_input)
        h_cat = torch.cat((h_n[-2, :, :], h_n[-1, :, :]), dim=1)
        return self.fc(self.dropout(h_cat))
