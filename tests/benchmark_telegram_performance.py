"""
tests/benchmark_telegram_performance.py
Benchmark d'isolation de performance pour le système d'alerte Telegram de MarketShift SuperBot.

Exigence (R3 & Critères d'Acceptation) :
- "The notification dispatch MUST be strictly asynchronous (or threaded) so that network latency
  to the Telegram API does not block the zero-latency trading loop."
- "A standalone verification script is provided that simulates triggering an alert and
  measures the main thread blocking time (must be < 10ms)."

Ce script teste et valide :
1. Test 1 : Appel unique sous latence réseau simulée de 2000 ms (blocage du thread appelant < 10 ms).
2. Test 2 : Rafale de 100 alertes sous forte latence réseau (blocage max par alerte < 10 ms).
3. Test 3 : Mode Fail-Safe sans identifiants (blocage < 1 ms).

Exécution directe :
    python tests/benchmark_telegram_performance.py
Sortie : Code de retour 0 si tous les seuils sont respectés (< 10 ms), code 1 en cas d'échec.
"""

import sys
import time
import statistics
from typing import List, Dict, Any

try:
    from infrastructure.telegram_notifier import TelegramNotifier
    HAS_NOTIFIER = True
except ImportError:
    HAS_NOTIFIER = False
    TelegramNotifier = None


def benchmark_single_dispatch(notifier: Any, simulated_delay_sec: float = 2.0) -> float:
    """Mesure le temps de blocage du thread principal pour un dispatch unique."""
    def mocked_dispatch(*args, **kwargs):
        time.sleep(simulated_delay_sec)
        return True

    notifier._dispatch_with_retry = mocked_dispatch

    t0 = time.perf_counter_ns()
    res = notifier.notify_trade_opened(
        symbol="EURUSD",
        direction="BUY",
        volume=0.10,
        price=1.08500,
        sl=1.08300,
        tp=1.08900,
        ticket=999999,
        ml_confidence=0.82
    )
    t1 = time.perf_counter_ns()
    duration_ms = (t1 - t0) / 1_000_000.0

    if not res:
        raise RuntimeError("Échec: notify_trade_opened a retourné False alors que le notifier est actif.")

    return duration_ms


def benchmark_burst_dispatch(notifier: Any, num_alerts: int = 100, simulated_delay_sec: float = 2.0) -> List[float]:
    """Mesure le temps de blocage par appel lors d'une rafale de 100 alertes consécutives."""
    def mocked_dispatch(*args, **kwargs):
        time.sleep(simulated_delay_sec)
        return True

    notifier._dispatch_with_retry = mocked_dispatch
    latencies_ms: List[float] = []

    for i in range(num_alerts):
        t0 = time.perf_counter_ns()
        res = notifier.notify_critical_event(
            "CIRCUIT_BREAKER",
            f"Test rafale alerte #{i}"
        )
        t1 = time.perf_counter_ns()
        if not res:
            raise RuntimeError(f"Échec: alerte #{i} a retourné False.")
        latencies_ms.append((t1 - t0) / 1_000_000.0)

    return latencies_ms


def benchmark_failsafe_dispatch(unconfigured_notifier: Any, iterations: int = 100) -> List[float]:
    """Mesure le temps d'exécution en mode fail-safe (credentials non renseignés)."""
    latencies_ms: List[float] = []

    for _ in range(iterations):
        t0 = time.perf_counter_ns()
        res = unconfigured_notifier.notify_critical_event("TEST_FAILSAFE", "Contrôle sans credentials")
        t1 = time.perf_counter_ns()
        if res is not False:
            raise RuntimeError("Le mode fail-safe doit retourner False sans lever d'exception.")
        latencies_ms.append((t1 - t0) / 1_000_000.0)

    return latencies_ms


def run_benchmarks() -> bool:
    """Exécute l'ensemble des benchmarks d'isolation de performance."""
    if not HAS_NOTIFIER:
        print("[ERREUR FATALE] Le module 'infrastructure.telegram_notifier' est introuvable.")
        print("Assurez-vous que le composant Milestone M1 est implémenté.")
        return False

    print("=" * 72)
    print("  BENCHMARK ISOLATION DE PERFORMANCE TELEGRAM — MARKETSHIFT SUPERBOT  ")
    print("=" * 72)
    print("Critère d'acceptation R3 : Blocage du thread appelant strictement < 10.0 ms\n")

    simulated_delay = 2.0  # 2000 ms de latence réseau simulée
    all_passed = True

    # 1. Benchmark Single Dispatch
    print(f"[TEST 1] Single Dispatch (Latence réseau simulée : {simulated_delay * 1000:.0f} ms)...")
    notifier_single = TelegramNotifier("123456:TEST_TOKEN", "987654321")
    try:
        single_ms = benchmark_single_dispatch(notifier_single, simulated_delay_sec=simulated_delay)
        print(f"  • Temps de blocage thread principal : {single_ms:.4f} ms")
        if single_ms < 10.0:
            print(f"  -> [PASS] {single_ms:.4f} ms < 10.0 ms (Marge: {10.0 - single_ms:.4f} ms)")
        else:
            print(f"  -> [FAIL] {single_ms:.4f} ms >= 10.0 ms (Seuil R3 dépassé !)")
            all_passed = False
    finally:
        notifier_single.stop()

    # 2. Benchmark Burst Test (100 alertes)
    num_alerts = 100
    print(f"\n[TEST 2] Burst Stress Test ({num_alerts} alertes consécutives, latence réseau 2000 ms)...")
    notifier_burst = TelegramNotifier("123456:BURST_TOKEN", "987654321")
    try:
        t_burst_start = time.perf_counter_ns()
        burst_latencies = benchmark_burst_dispatch(notifier_burst, num_alerts=num_alerts, simulated_delay_sec=simulated_delay)
        t_burst_end = time.perf_counter_ns()

        total_burst_wall_time_ms = (t_burst_end - t_burst_start) / 1_000_000.0
        avg_lat = statistics.mean(burst_latencies)
        max_lat = max(burst_latencies)
        min_lat = min(burst_latencies)
        p95_lat = statistics.quantiles(burst_latencies, n=20)[18] if len(burst_latencies) >= 20 else max_lat
        p99_lat = statistics.quantiles(burst_latencies, n=100)[98] if len(burst_latencies) >= 100 else max_lat

        print(f"  • Temps total d'envoi de la rafale (100 alertes) : {total_burst_wall_time_ms:.4f} ms")
        print(f"  • Latence moyenne par alerte : {avg_lat:.4f} ms")
        print(f"  • Min : {min_lat:.4f} ms | Max : {max_lat:.4f} ms")
        print(f"  • P95 : {p95_lat:.4f} ms | P99 : {p99_lat:.4f} ms")

        if max_lat < 10.0 and avg_lat < 1.0:
            print(f"  -> [PASS] Max {max_lat:.4f} ms < 10.0 ms et Moyenne {avg_lat:.4f} ms < 1.0 ms")
        else:
            print(f"  -> [FAIL] Seuil de performance violé (Max: {max_lat:.4f} ms, Moyenne: {avg_lat:.4f} ms)")
            all_passed = False
    finally:
        notifier_burst.stop()

    # 3. Benchmark Fail-Safe (Sans credentials)
    print("\n[TEST 3] Mode Fail-Safe (Credentials vides/absents, 100 itérations)...")
    notifier_failsafe = TelegramNotifier("", "")
    try:
        failsafe_latencies = benchmark_failsafe_dispatch(notifier_failsafe, iterations=100)
        avg_fs = statistics.mean(failsafe_latencies)
        max_fs = max(failsafe_latencies)

        print(f"  • Temps moyen par appel Fail-Safe : {avg_fs:.6f} ms")
        print(f"  • Temps max observé : {max_fs:.6f} ms")

        if max_fs < 1.0:
            print(f"  -> [PASS] Max {max_fs:.6f} ms < 1.0 ms (Fail-Safe ultra-rapide)")
        else:
            print(f"  -> [FAIL] Le mode fail-safe a dépassé 1.0 ms (Max: {max_fs:.6f} ms)")
            all_passed = False
    finally:
        notifier_failsafe.stop()

    print("\n" + "=" * 72)
    if all_passed:
        print("  RÉSULTAT GLOBAL : [PASS] TOUS LES TESTS D'ISOLATION R3 SONT VALIDÉS.  ")
    else:
        print("  RÉSULTAT GLOBAL : [FAIL] ÉCHEC D'AU MOINS UN SEUIL DE PERFORMANCE.    ")
    print("=" * 72)

    return all_passed


# ════════════════════════════════════════════════════════════════════════════════
# TESTS PYTEST COMPATIBLES
# ════════════════════════════════════════════════════════════════════════════════

def test_performance_single_dispatch_under_10ms():
    """Test pytest pour le dispatch unique sous latence réseau."""
    if not HAS_NOTIFIER:
        pytest.skip("TelegramNotifier non disponible.")
    n = TelegramNotifier("TEST_TOKEN", "TEST_CHAT")
    try:
        duration_ms = benchmark_single_dispatch(n, simulated_delay_sec=1.0)
        assert duration_ms < 10.0, f"Blocage de {duration_ms:.4f} ms (> 10.0 ms)"
    finally:
        n.stop()


def test_performance_burst_dispatch_under_10ms():
    """Test pytest pour la rafale sous latence réseau."""
    if not HAS_NOTIFIER:
        pytest.skip("TelegramNotifier non disponible.")
    n = TelegramNotifier("TEST_TOKEN", "TEST_CHAT")
    try:
        latencies = benchmark_burst_dispatch(n, num_alerts=50, simulated_delay_sec=1.0)
        assert max(latencies) < 10.0
        assert statistics.mean(latencies) < 1.0
    finally:
        n.stop()


def test_performance_failsafe_under_1ms():
    """Test pytest pour le mode fail-safe."""
    if not HAS_NOTIFIER:
        pytest.skip("TelegramNotifier non disponible.")
    n = TelegramNotifier("", "")
    try:
        latencies = benchmark_failsafe_dispatch(n, iterations=50)
        assert max(latencies) < 1.0
    finally:
        n.stop()


if __name__ == "__main__":
    success = run_benchmarks()
    sys.exit(0 if success else 1)
