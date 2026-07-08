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
    { symbol: 'GHST', name: 'Ghost Corp', emoji: '👻', basePrice: 450, volatility: 0.08 },
    { symbol: 'TOWN', name: 'Town Holdings', emoji: '🏙️', basePrice: 1200, volatility: 0.05 },
    { symbol: 'MOON', name: 'MoonShot Ventures', emoji: '🚀', basePrice: 150, volatility: 0.15 },
    { symbol: 'GOLD', name: 'Golden Reserve', emoji: '🥇', basePrice: 2500, volatility: 0.03 },
    { symbol: 'CRYP', name: 'CryptoCoin', emoji: '🪙', basePrice: 85, volatility: 0.20 },
    { symbol: 'FARM', name: 'Farmland Co-op', emoji: '🌾', basePrice: 350, volatility: 0.04 },
    { symbol: 'SRVX', name: 'Server Exchange', emoji: '📊', basePrice: 1000, volatility: 0.06, activityDriven: true },
];

export function getInvestmentBySymbol(symbol) {
    return investments.find((i) => i.symbol === symbol.toUpperCase());
}
