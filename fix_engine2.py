import re
import traceback

try:
    with open('application/engine.py', 'r', encoding='utf-8') as f:
        content = f.read()

    old_start = '''    def start(self):
        self.running = True'''
    
    new_start = '''    def start(self):
        # 1. Initialize MT5 in the MAIN thread (prevents deadlock)
        if not self.connector.connect():
            logging.error("[Engine] Échec de connexion au broker (Main Thread).")
            return
            
        self.running = True'''
        
    if old_start in content:
        content = content.replace(old_start, new_start)
    else:
        print("old_start not found")

    with open('application/engine.py', 'w', encoding='utf-8') as f:
        f.write(content)
    print('Done!')
except Exception as e:
    print('Error:', e)
    traceback.print_exc()
