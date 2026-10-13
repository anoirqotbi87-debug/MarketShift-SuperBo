import pytest
import time
from unittest.mock import MagicMock, patch
from fastapi.testclient import TestClient
from infrastructure.config import Config
from api.server import app

@pytest.fixture
def client():
    return TestClient(app)

def test_kill_switch_reset_without_token_rejected_403(client):
    with patch.object(Config, 'API_SECRET_KEY', 'test_key_m04'):
        headers = {'X-API-Key': 'test_key_m04'}
        with patch('api.server._engine') as mock_engine:
            mock_engine.kill_switch.is_triggered = True
            mock_engine.kill_switch.reset.side_effect = PermissionError('Confirmation invalide : le token RESET_KILL_SWITCH est requis.')

            res = client.post(
                '/control',
                json={'action': 'reset_kill'},
                headers=headers
            )
            assert res.status_code == 403
            assert 'RESET_KILL_SWITCH' in res.json().get('detail', '')

def test_kill_switch_reset_during_cooldown_rejected_403(client):
    with patch.object(Config, 'API_SECRET_KEY', 'test_key_m04'):
        headers = {'X-API-Key': 'test_key_m04'}
        with patch('api.server._engine') as mock_engine:
            mock_engine.kill_switch.is_triggered = True
            mock_engine.kill_switch.reset.side_effect = PermissionError('Delai de securite actif : rearmement impossible avant 45s.')

            res = client.post(
                '/control',
                json={'action': 'reset_kill', 'confirm_token': 'RESET_KILL_SWITCH'},
                headers=headers
            )
            assert res.status_code == 403
            assert 'securite actif' in res.json().get('detail', '')

def test_kill_switch_reset_success_with_token_and_cooldown_elapsed(client):
    with patch.object(Config, 'API_SECRET_KEY', 'test_key_m04'):
        headers = {'X-API-Key': 'test_key_m04'}
        with patch('api.server._engine') as mock_engine:
            mock_engine.kill_switch.is_triggered = True
            mock_engine.kill_switch.reset.return_value = True

            res = client.post(
                '/control',
                json={'action': 'reset_kill', 'confirm_token': 'RESET_KILL_SWITCH'},
                headers=headers
            )
            assert res.status_code == 200
            assert "Kill Switch" in res.json().get("message", "")
            mock_engine.kill_switch.reset.assert_called_once_with(confirm_token="RESET_KILL_SWITCH")

def test_kill_switch_class_direct_reset_logic():
    from agents.kill_switch import KillSwitch
    mock_connector = MagicMock()
    mock_notifier = MagicMock()
    ks = KillSwitch(connector=mock_connector, notifier=mock_notifier)

    ks.activate('TEST_ACTIVATION')
    assert ks.is_triggered is True
    assert ks.activated_at > 0

    with pytest.raises(PermissionError, match='Confirmation invalide'):
        ks.reset(confirm_token='WRONG_TOKEN')

    with pytest.raises(PermissionError):
        ks.reset(confirm_token='RESET_KILL_SWITCH', min_cooldown_seconds=60.0)

    ks.activated_at = time.time() - 70.0
    res = ks.reset(confirm_token='RESET_KILL_SWITCH', min_cooldown_seconds=60.0)
    assert res is True
    assert ks.is_triggered is False
    mock_notifier.notify_critical_event.assert_called_with(
        'KILL_SWITCH_RESET',
        reason='Réarmement manuel autorisé',
        details='Le système reprend ses opérations sous surveillance.'
    )
