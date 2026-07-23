from abc import ABC, abstractmethod
from typing import Optional
from core.interfaces import Signal, IStrategy

class StrategyBase(IStrategy):
    """Classe de base pour toutes les stratégies de MarketShift SuperBot."""
    def __init__(self, name: str, weight: float = 1.0):
        self.name = name
        self.weight = weight

    @abstractmethod
    def analyze(self, symbol: str) -> Optional[Signal]:
        """Analyse le symbole et retourne un Signal (ou None s'il n'y a pas d'opportunité)."""
        pass
