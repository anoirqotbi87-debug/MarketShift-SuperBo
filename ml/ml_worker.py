import sys
import logging
import argparse

logging.basicConfig(level=logging.INFO, format="%(asctime)s - [ML-Worker-Process] %(message)s")

def main():
    parser = argparse.ArgumentParser(description="MarketShift ML Phantom Worker")
    parser.add_argument("--symbols", type=str, required=True, help="Liste de symboles séparés par des virgules")
    args = parser.parse_args()

    symbols = [s.strip() for s in args.symbols.split(",")]
    if not symbols:
        logging.error("[ML-Worker-Process] Aucun symbole fourni.")
        sys.exit(1)

    logging.info(f"[ML-Worker-Process] Démarrage de l'entraînement isolé pour: {symbols}")
    
    # Import tardif pour ne pas ralentir le démarrage si échec
    import os
    project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    if project_root not in sys.path:
        sys.path.insert(0, project_root)
        
    from ml.trainer import _run_isolated_training
    
    try:
        _run_isolated_training(symbols)
        logging.info("[ML-Worker-Process] Entraînement terminé avec succès.")
    except Exception as e:
        logging.error(f"[ML-Worker-Process] Crash fatal: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)

if __name__ == "__main__":
    main()
