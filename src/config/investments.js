// investments.js
//
// Static catalog of tradable assets for the /invest command.
// volatility controls how much the price can swing each market update
// (e.g. 0.14 = up to ±14% per tick).
//
// NOTE: symbols are the storage keys for market prices AND player
// portfolios — never change a symbol or existing holders lose their
// shares. Renaming the display name/emoji is always safe.
//
// activityDriven: true marks the special "Server Exchange" asset whose
// price follows chat activity instead of a random walk — see
// investmentService.js for the activity tiers.

export const investments = [
    { symbol: 'GHST', name: 'Ghost Corp', emoji: '👻', basePrice: 1500, volatility: 0.14 },
    { symbol: 'TOWN', name: 'Town Holdings', emoji: '🏙️', basePrice: 4000, volatility: 0.08 },
    { symbol: 'MOON', name: 'MandoCorp.co', emoji: '🕶️', basePrice: 600, volatility: 0.25 },
    { symbol: 'GOLD', name: 'Golden Reserve', emoji: '🥇', basePrice: 8000, volatility: 0.05 },
    { symbol: 'CRYP', name: 'CryptoCoin', emoji: '🪙', basePrice: 350, volatility: 0.35 },
    { symbol: 'FARM', name: 'WeedFarms.co', emoji: '🌿', basePrice: 1200, volatility: 0.07 },
    { symbol: 'SRVX', name: 'Server Exchange', emoji: '📊', basePrice: 3500, volatility: 0.06, activityDriven: true },
];

export function getInvestmentBySymbol(symbol) {
    return investments.find((i) => i.symbol === symbol.toUpperCase());
}
