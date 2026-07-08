// investments.js
//
// Static catalog of tradable assets for the /invest command.
// volatility controls how much the price can swing each market update
// (e.g. 0.08 = up to ±8% per tick).
//
// activityDriven: true marks the special "Server Exchange" asset whose
// price follows chat activity instead of a random walk — see
// investmentService.js for the activity tiers.

export const investments = [
    { symbol: 'GHST', name: 'Ghost Corp', emoji: '👻', basePrice: 900, volatility: 0.10 },
    { symbol: 'TOWN', name: 'Town Holdings', emoji: '🏙️', basePrice: 2500, volatility: 0.06 },
    { symbol: 'MOON', name: 'MoonShot Ventures', emoji: '🚀', basePrice: 300, volatility: 0.18 },
    { symbol: 'GOLD', name: 'Golden Reserve', emoji: '🥇', basePrice: 5000, volatility: 0.04 },
    { symbol: 'CRYP', name: 'CryptoCoin', emoji: '🪙', basePrice: 175, volatility: 0.25 },
    { symbol: 'FARM', name: 'Farmland Co-op', emoji: '🌾', basePrice: 700, volatility: 0.05 },
    { symbol: 'SRVX', name: 'Server Exchange', emoji: '📊', basePrice: 2000, volatility: 0.06, activityDriven: true },
];

export function getInvestmentBySymbol(symbol) {
    return investments.find((i) => i.symbol === symbol.toUpperCase());
}
