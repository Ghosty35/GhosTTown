import { SlashCommandBuilder } from 'discord.js';
import { successEmbed, warningEmbed, infoEmbed } from '../../utils/embeds.js';
import { getEconomyData, setEconomyData } from '../../utils/economy.js';
import { withErrorHandling, createError, ErrorTypes } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { investments, getInvestmentBySymbol } from '../../config/investments.js';
import { getMarket, getPercentChange } from '../../services/investmentService.js';

const symbolChoices = investments.map((i) => ({ name: `${i.name} (${i.symbol})`, value: i.symbol }));

function formatChange(percent) {
    const rounded = percent.toFixed(1);
    if (percent > 0) return `📈 +${rounded}%`;
    if (percent < 0) return `📉 ${rounded}%`;
    return `➖ ${rounded}%`;
}

export default {
    data: new SlashCommandBuilder()
        .setName('invest')
        .setDescription('Buy and sell shares in the server market')
        .addSubcommand((sub) => sub.setName('market').setDescription('See current prices for every asset'))
        .addSubcommand((sub) =>
            sub
                .setName('buy')
                .setDescription('Buy shares of an asset')
                .addStringOption((opt) => opt.setName('symbol').setDescription('Which asset').setRequired(true).addChoices(...symbolChoices))
                .addIntegerOption((opt) => opt.setName('shares').setDescription('How many shares').setRequired(true).setMinValue(1))
        )
        .addSubcommand((sub) =>
            sub
                .setName('sell')
                .setDescription('Sell shares you own')
                .addStringOption((opt) => opt.setName('symbol').setDescription('Which asset').setRequired(true).addChoices(...symbolChoices))
                .addIntegerOption((opt) => opt.setName('shares').setDescription('How many shares').setRequired(true).setMinValue(1))
        )
        .addSubcommand((sub) => sub.setName('portfolio').setDescription('See what you own and your profit/loss')),

    execute: withErrorHandling(async (interaction, config, client) => {
        const deferred = await InteractionHelper.safeDefer(interaction);
        if (!deferred) return;

        const subcommand = interaction.options.getSubcommand();
        const guildId = interaction.guildId;
        const userId = interaction.user.id;

        if (subcommand === 'market') {
            const market = await getMarket(client, guildId);

            const embed = infoEmbed('📊 Market Prices', 'Prices update roughly every 15 minutes.');
            for (const asset of investments) {
                const entry = market[asset.symbol];
                embed.addFields({
                    name: `${asset.emoji} ${asset.name} (${asset.symbol})`,
                    value: `$${entry.price.toLocaleString()}  •  ${formatChange(getPercentChange(entry))}`,
                    inline: true,
                });
            }

            await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
            return;
        }

        if (subcommand === 'portfolio') {
            const userData = await getEconomyData(client, guildId, userId);
            const portfolio = userData.portfolio || {};
            const market = await getMarket(client, guildId);

            const holdings = Object.entries(portfolio).filter(([, pos]) => pos.shares > 0);

            if (holdings.length === 0) {
                await InteractionHelper.safeEditReply(interaction, {
                    embeds: [infoEmbed('📁 Your Portfolio', "You don't own any shares yet — try `/invest buy`!")],
                });
                return;
            }

            const embed = infoEmbed('📁 Your Portfolio', '');
            let totalValue = 0;
            let totalCost = 0;

            for (const [symbol, position] of holdings) {
                const asset = getInvestmentBySymbol(symbol);
                const currentPrice = market[symbol]?.price ?? 0;
                const value = position.shares * currentPrice;
                const cost = position.shares * position.avgCost;
                const pl = value - cost;
                const plPercent = cost > 0 ? (pl / cost) * 100 : 0;

                totalValue += value;
                totalCost += cost;

                embed.addFields({
                    name: `${asset?.emoji || '•'} ${asset?.name || symbol} (${symbol})`,
                    value: `${position.shares} shares  •  Avg cost $${position.avgCost.toLocaleString()}\nValue: $${value.toLocaleString()}  •  P/L: ${pl >= 0 ? '+' : ''}$${pl.toLocaleString()} (${plPercent >= 0 ? '+' : ''}${plPercent.toFixed(1)}%)`,
                    inline: false,
                });
            }

            const totalPl = totalValue - totalCost;
            embed.setFooter({
                text: `Total value: $${totalValue.toLocaleString()}  •  Total P/L: ${totalPl >= 0 ? '+' : ''}$${totalPl.toLocaleString()}`,
            });

            await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
            return;
        }

        const symbol = interaction.options.getString('symbol');
        const shares = interaction.options.getInteger('shares');
        const asset = getInvestmentBySymbol(symbol);

        if (!asset) {
            throw createError('Invalid symbol', ErrorTypes.VALIDATION, `\`${symbol}\` is not a tradable asset.`, { symbol });
        }

        const market = await getMarket(client, guildId);
        const currentPrice = market[symbol].price;
        const userData = await getEconomyData(client, guildId, userId);
        userData.portfolio = userData.portfolio || {};

        if (subcommand === 'buy') {
            const totalCost = currentPrice * shares;

            if (userData.wallet < totalCost) {
                throw createError(
                    'Insufficient funds',
                    ErrorTypes.VALIDATION,
                    `Buying ${shares} shares of **${asset.name}** costs **$${totalCost.toLocaleString()}**, but you only have **$${userData.wallet.toLocaleString()}**.`,
                    { required: totalCost, current: userData.wallet }
                );
            }

            const existing = userData.portfolio[symbol] || { shares: 0, avgCost: 0 };
            const newShareCount = existing.shares + shares;
            const newAvgCost = (existing.shares * existing.avgCost + shares * currentPrice) / newShareCount;

            userData.portfolio[symbol] = { shares: newShareCount, avgCost: newAvgCost };
            userData.wallet -= totalCost;

            await setEconomyData(client, guildId, userId, userData);

            const embed = successEmbed(
                '📈 Purchase Complete',
                `Bought **${shares}** shares of **${asset.emoji} ${asset.name}** at $${currentPrice.toLocaleString()}/share for **$${totalCost.toLocaleString()}**.`
            ).addFields({ name: 'New Cash Balance', value: `$${userData.wallet.toLocaleString()}`, inline: true });

            await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
            return;
        }

        if (subcommand === 'sell') {
            const holding = userData.portfolio[symbol];

            if (!holding || holding.shares < shares) {
                throw createError(
                    'Not enough shares',
                    ErrorTypes.VALIDATION,
                    `You only own ${holding?.shares || 0} shares of **${asset.name}**, but you're trying to sell ${shares}.`,
                    { owned: holding?.shares || 0, requested: shares }
                );
            }

            const proceeds = currentPrice * shares;
            const costBasis = holding.avgCost * shares;
            const realizedPl = proceeds - costBasis;

            holding.shares -= shares;
            if (holding.shares === 0) {
                delete userData.portfolio[symbol];
            } else {
                userData.portfolio[symbol] = holding;
            }
            userData.wallet += proceeds;

            await setEconomyData(client, guildId, userId, userData);

            const embed = successEmbed(
                '📉 Sale Complete',
                `Sold **${shares}** shares of **${asset.emoji} ${asset.name}** at $${currentPrice.toLocaleString()}/share for **$${proceeds.toLocaleString()}**.\n\nRealized P/L: ${realizedPl >= 0 ? '+' : ''}$${realizedPl.toLocaleString()}`
            ).addFields({ name: 'New Cash Balance', value: `$${userData.wallet.toLocaleString()}`, inline: true });

            await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
        }
    }, { command: 'invest' })
};
