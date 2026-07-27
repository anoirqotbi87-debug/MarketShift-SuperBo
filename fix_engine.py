import re
import traceback

try:
    with open('application/engine.py', 'r', encoding='utf-8') as f:
        content = f.read()

    # 1. Update start()
    content = content.replace(
    '''    def start(self):
        if not self.connector.connect():
            logging.error("[Engine] Échec de connexion au broker. Engine non démarré.")
            return

        self.running = True''',
    '''    def start(self):
        self.running = True'''
    )

    # 2. Update _run_async_loop_thread
    # Actually, we can just replace the old _run_async_loop_thread block completely
    old_run_async_loop = '''    def _run_async_loop_thread(self):
        """Démarre la boucle d'événements asyncio dans le thread dédié."""
        try:
            asyncio.run(self._async_run_loop())
        except Exception as e:
            import traceback
            logging.error(f"[Engine] Erreur fatale dans la boucle async: {e}")
            logging.error(traceback.format_exc())'''
            
    if old_run_async_loop in content:
        content = content.replace(old_run_async_loop, '''    def _run_async_loop_thread(self):
        """Démarre la boucle d'événements asyncio dans le thread dédié."""
        if not self.connector.connect():
            logging.error("[Engine] Échec de connexion au broker dans le thread dédié.")
            self.running = False
            return
        
        try:
            asyncio.run(self._async_run_loop())
        except Exception as e:
            import traceback
            logging.error(f"[Engine] Erreur fatale dans la boucle async: {e}")
            logging.error(traceback.format_exc())''')
    else:
        # Check if the older one is there (without try-except)
        old_run_async_loop_2 = '''    def _run_async_loop_thread(self):
        """Démarre la boucle d'événements asyncio dans le thread dédié."""
        asyncio.run(self._async_run_loop())'''
        if old_run_async_loop_2 in content:
            content = content.replace(old_run_async_loop_2, '''    def _run_async_loop_thread(self):
        """Démarre la boucle d'événements asyncio dans le thread dédié."""
        if not self.connector.connect():
            logging.error("[Engine] Échec de connexion au broker dans le thread dédié.")
            self.running = False
            return
            
        asyncio.run(self._async_run_loop())''')

    # 3. Replace asyncio.to_thread wrappers with direct calls
    content = content.replace('await asyncio.to_thread(self.state_manager.update_state)', 'self.state_manager.update_state()')
    content = content.replace('await asyncio.to_thread(self._apply_trailing_stops)', 'self._apply_trailing_stops()')
    content = content.replace('await asyncio.to_thread(self.connector.get_historical_data, symbol, self._tf_m1, 200)', 'self.connector.get_historical_data(symbol, self._tf_m1, 200)')
    content = content.replace('await asyncio.to_thread(self.connector.get_symbol_info, symbol)', 'self.connector.get_symbol_info(symbol)')
    
    # PreTrade validator multi-line replacement
    old_pretrade = '''        is_valid = await asyncio.to_thread(
            self.pretrade_validator.validate_signal,
            validated_signal, self.state_manager.account, current_spread_pips
        )'''
    content = content.replace(old_pretrade, '        is_valid = self.pretrade_validator.validate_signal(validated_signal, self.state_manager.account, current_spread_pips)')

    # execute order multi-line replacement
    old_exec = '''                result = await asyncio.to_thread(
                    self.connector.execute_order,
                    payload['symbol'],
                    payload['direction'],
                    payload['volume'],
                    payload['sl_price'],
                    payload['tp_price'],
                    payload['magic']
                )'''
    content = content.replace(old_exec, '''                result = self.connector.execute_order(
                    payload['symbol'],
                    payload['direction'],
                    payload['volume'],
                    payload['sl_price'],
                    payload['tp_price'],
                    payload['magic']
                )''')

    with open('application/engine.py', 'w', encoding='utf-8') as f:
        f.write(content)
    print('Done!')
except Exception as e:
    print('Error:', e)
    traceback.print_exc()
