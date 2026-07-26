import logging
try:
    import torch
    import torch.nn as nn
    import numpy as np
except ImportError:
    pass

class LSTMPredictor(nn.Module):
    """
    Réseau LSTM pour la prédiction de séries temporelles financières.
    Prend en entrée une séquence de features (shape: batch, seq_length, input_size).
    """
    def __init__(self, input_size: int, hidden_size: int = 64, num_layers: int = 2, dropout: float = 0.2):
        super(LSTMPredictor, self).__init__()
        self.hidden_size = hidden_size
        self.num_layers = num_layers

        # Couche LSTM
        self.lstm = nn.LSTM(
            input_size=input_size,
            hidden_size=hidden_size,
            num_layers=num_layers,
            batch_first=True,
            dropout=dropout if num_layers > 1 else 0
        )

        # Fully connected layer
        self.fc = nn.Linear(hidden_size, 1)
        self.sigmoid = nn.Sigmoid()

    def forward(self, x):
        # Initialisation des hidden states (h0, c0) avec des zéros
        h0 = torch.zeros(self.num_layers, x.size(0), self.hidden_size).to(x.device)
        c0 = torch.zeros(self.num_layers, x.size(0), self.hidden_size).to(x.device)

        # Forward propagate LSTM
        out, _ = self.lstm(x, (h0, c0))

        # On prend l'output du dernier time step de la séquence
        out = out[:, -1, :]

        # Fully connected et activation
        out = self.fc(out)
        out = self.sigmoid(out)
        
        return out

def create_sequences(data: np.ndarray, labels: np.ndarray, seq_length: int):
    """
    Transforme les données tabulaires 2D en tenseur 3D (samples, seq_length, features)
    adapté pour le LSTM.
    """
    xs, ys = [], []
    for i in range(len(data) - seq_length):
        xs.append(data[i:(i + seq_length)])
        ys.append(labels[i + seq_length - 1])
    
    return np.array(xs), np.array(ys)
