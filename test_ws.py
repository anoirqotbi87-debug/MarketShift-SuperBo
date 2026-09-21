import asyncio
import websockets

async def test_ws():
    try:
        async with websockets.connect("ws://127.0.0.1:8000/ws") as ws:
            print("Connected!")
            msg = await ws.recv()
            print("Received:", msg)
    except Exception as e:
        print("Error:", e)

asyncio.run(test_ws())
