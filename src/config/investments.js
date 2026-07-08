// investments.js
//
// Static catalog of tradable assets for the /invest command.
// volatility controls how much the price can swing each market update
// (e.g. 0.08 = up to ±8% per tick).

export const investments = [
    { symbol: 'GHST', name: 'Ghost Corp', emoji: '👻', basePrice: 100, volatility: 0.08 },
    { symbol: 'TOWN', name: 'Town Holdings', emoji: '🏙️', basePrice: 250, volatility: 0.05 },
    { symbol: 'MOON', name: 'MoonShot Ventures', emoji: '🚀', basePrice: 40, volatility: 0.15 },
    { symbol: 'GOLD', name: 'Golden Reserve', emoji: '🥇', basePrice: 500, volatility: 0.03 },
    { symbol: 'CRYP', name: 'CryptoCoin', emoji: '🪙', basePrice: 20, volatility: 0.20 },
    { symbol: 'FARM', name: 'Farmland Co-op', emoji: '🌾', basePrice: 80, volatility: 0.04 },
];

export function getInvestmentBySymbol(symbol) {
    return investments.find((i) => i.symbol === symbol.toUpperCase());
}
