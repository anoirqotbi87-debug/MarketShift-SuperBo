import datetime
import MetaTrader5 as mt5

def main():
    if not mt5.initialize():
        print("initialize() failed")
        mt5.shutdown()
        return

    now = datetime.datetime.now()
    today_start = datetime.datetime(now.year, now.month, now.day) + datetime.timedelta(hours=3)
    
    print(f"Fetching deals from {today_start} to {now + datetime.timedelta(days=1)}")
    
    deals = mt5.history_deals_get(today_start, now + datetime.timedelta(days=1))
    
    if deals is None:
        print(f"No deals found or error: {mt5.last_error()}")
    else:
        print(f"Found {len(deals)} deals.")
        realized_pnl = 0
        for d in deals:
            # type 0=BUY, 1=SELL, 2=BALANCE
            # entry 0=IN, 1=OUT
            print(f"Ticket: {d.ticket}, Symbol: {d.symbol}, Type: {d.type}, Entry: {d.entry}, Profit: {d.profit}, Commission: {d.commission}, Swap: {d.swap}, Fee: {d.fee}")
            if d.entry in [1, 2]: # OUT or INOUT
                realized_pnl += (d.profit + d.commission + d.swap + d.fee)
        print(f"Total calculated Realized PnL: {realized_pnl}")
        
    mt5.shutdown()

if __name__ == "__main__":
    main()
