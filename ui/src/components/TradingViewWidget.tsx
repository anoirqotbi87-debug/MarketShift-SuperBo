import React, { useEffect, useRef, memo } from 'react';

interface TradingViewWidgetProps {
  symbol?: string;
  theme?: 'light' | 'dark';
}

export const TradingViewWidget: React.FC<TradingViewWidgetProps> = ({ 
  symbol = 'FX:EURUSD', 
  theme = 'dark' 
}) => {
  const container = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Clean up previous widget injection
    if (container.current) {
      container.current.innerHTML = '';
      
      const script = document.createElement("script");
      script.src = "https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js";
      script.type = "text/javascript";
      script.async = true;
      script.innerHTML = `
        {
          "autosize": true,
          "symbol": "${symbol}",
          "interval": "15",
          "timezone": "Etc/UTC",
          "theme": "${theme}",
          "style": "1",
          "locale": "fr",
          "enable_publishing": false,
          "backgroundColor": "rgba(2, 6, 23, 1)",
          "gridColor": "rgba(30, 41, 59, 0.4)",
          "hide_top_toolbar": false,
          "hide_legend": false,
          "save_image": false,
          "calendar": false,
          "support_host": "https://www.tradingview.com"
        }`;
      
      container.current.appendChild(script);
    }
  }, [symbol, theme]);

  return (
    <div 
      className="tradingview-widget-container" 
      ref={container} 
      style={{ height: "100%", width: "100%", minHeight: "450px" }}
    >
      <div className="tradingview-widget-container__widget" style={{ height: "calc(100% - 32px)", width: "100%" }}></div>
    </div>
  );
};
