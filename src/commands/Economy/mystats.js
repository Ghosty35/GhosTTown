import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { getColor } from '../../config/bot.js';
import { getDailySummary } from '../../services/gameLogService.js';
import { withErrorHandling } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

const GAME_LABELS = {
    gamble: '🎲 Gamble',
    slots: '🎰 Slots',
    blackjack: '🃏 Blackjack',
    coinflip: '🪙 Coinflip',
    rob: '🦹 Rob',
};

export default {
    data: new SlashCommandBuilder()
        .setName('mystats')
        .setDescription("See today's win/loss summary from Game Corner activities"),

    execute: withErrorHandling(async (interaction, config, client) => {
        const deferred = await InteractionHelper.safeDefer(interaction);
        if (!deferred) return;

        const summary = await getDailySummary(client, interaction.guildId, interaction.user.id);

        const embed = new EmbedBuilder()
            .setTitle(`🎮 ${interaction.user.username}'s Game Corner — Today`)
            .setColor(summary.total >= 0 ? getColor('success') : getColor('error'));

        if (summary.count === 0) {
            embed.setDescription("You haven't played anything today — head to the Game Corner and try `/slots`, `/blackjack`, `/gamble`, `/coinflip`, or `/rob`!");
        } else {
            const lines = Object.entries(summary.byGame).map(([game, amount]) => {
                const label = GAME_LABELS[game] || game;
                const sign = amount >= 0 ? '+' : '';
                return `${label}: ${sign}$${amount.toLocaleString()}`;
            });

            embed.setDescription(lines.join('\n'));
            embed.addFields(
                { name: 'Plays Today', value: `${summary.count}`, inline: true },
                {
                    name: 'Net Result',
                    value: `${summary.total >= 0 ? '📈 +' : '📉 '}$${summary.total.toLocaleString()}`,
                    inline: true,
                }
            );
        }

        embed.setFooter({ text: 'Resets at midnight, server time.' });

        await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
    }, { command: 'mystats' })
};
