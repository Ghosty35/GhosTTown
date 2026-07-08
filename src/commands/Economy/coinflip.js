import { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } from 'discord.js';
import { successEmbed, warningEmbed, infoEmbed } from '../../utils/embeds.js';
import { getEconomyData, setEconomyData } from '../../utils/economy.js';
import { withErrorHandling, createError, ErrorTypes } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { logger } from '../../utils/logger.js';
import { logGameResult } from '../../services/gameLogService.js';

const CHALLENGE_TIMEOUT_MS = 60000;

export default {
    data: new SlashCommandBuilder()
        .setName('coinflip')
        .setDescription('Challenge another member to a coinflip wager')
        .addUserOption(option =>
            option.setName('opponent').setDescription('Who to challenge').setRequired(true)
        )
        .addIntegerOption(option =>
            option
                .setName('amount')
                .setDescription('Amount of cash to wager')
                .setRequired(true)
                .setMinValue(1)
        ),

    execute: withErrorHandling(async (interaction, config, client) => {
        const deferred = await InteractionHelper.safeDefer(interaction);
        if (!deferred) return;

        const guildId = interaction.guildId;
        const challenger = interaction.user;
        const opponentUser = interaction.options.getUser('opponent');
        const amount = interaction.options.getInteger('amount');

        if (opponentUser.id === challenger.id) {
            throw createError(
                'Cannot challenge yourself',
                ErrorTypes.VALIDATION,
                "You can't coinflip against yourself.",
                { userId: challenger.id }
            );
        }

        if (opponentUser.bot) {
            throw createError(
                'Cannot challenge a bot',
                ErrorTypes.VALIDATION,
                "You can't challenge a bot to a coinflip.",
                { userId: opponentUser.id }
            );
        }

        const challengerData = await getEconomyData(client, guildId, challenger.id);
        if (challengerData.wallet < amount) {
            throw createError(
                'Insufficient funds',
                ErrorTypes.VALIDATION,
                `You only have $${challengerData.wallet.toLocaleString()} cash, but you're trying to wager $${amount.toLocaleString()}.`,
                { required: amount, current: challengerData.wallet }
            );
        }

        const acceptButton = new ButtonBuilder()
            .setCustomId('coinflip_accept')
            .setLabel('Accept')
            .setStyle(ButtonStyle.Success)
            .setEmoji('🪙');
        const declineButton = new ButtonBuilder()
            .setCustomId('coinflip_decline')
            .setLabel('Decline')
            .setStyle(ButtonStyle.Danger);
        const row = new ActionRowBuilder().addComponents(acceptButton, declineButton);

        const challengeEmbed = infoEmbed(
            '🪙 Coinflip Challenge',
            `${challenger.toString()} has challenged ${opponentUser.toString()} to a coinflip for **$${amount.toLocaleString()}**!\n\n${opponentUser.toString()}, do you accept?`
        ).setFooter({ text: 'This challenge expires in 60 seconds.' });

        await InteractionHelper.safeEditReply(interaction, { embeds: [challengeEmbed], components: [row] });
        const message = await interaction.fetchReply();

        const collector = message.createMessageComponentCollector({
            componentType: ComponentType.Button,
            time: CHALLENGE_TIMEOUT_MS,
            max: 1,
            filter: (i) => i.user.id === opponentUser.id,
        });

        collector.on('collect', async (i) => {
            try {
                if (i.customId === 'coinflip_decline') {
                    await i.update({
                        embeds: [warningEmbed('🪙 Challenge Declined', `${opponentUser.toString()} declined the coinflip.`)],
                        components: [],
                    });
                    return;
                }

                // Re-fetch both balances fresh at accept time — either side
                // may have spent money in the last 60 seconds.
                const freshChallenger = await getEconomyData(client, guildId, challenger.id);
                const freshOpponent = await getEconomyData(client, guildId, opponentUser.id);

                if (freshChallenger.wallet < amount) {
                    await i.update({
                        embeds: [warningEmbed('🪙 Challenge Cancelled', `${challenger.toString()} no longer has enough cash for this wager.`)],
                        components: [],
                    });
                    return;
                }

                if (freshOpponent.wallet < amount) {
                    await i.update({
                        embeds: [warningEmbed('🪙 Challenge Cancelled', `${opponentUser.toString()} doesn't have enough cash to accept this wager.`)],
                        components: [],
                    });
                    return;
                }

                const challengerWins = Math.random() < 0.5;
                const winner = challengerWins ? challenger : opponentUser;
                const loser = challengerWins ? opponentUser : challenger;
                const winnerData = challengerWins ? freshChallenger : freshOpponent;
                const loserData = challengerWins ? freshOpponent : freshChallenger;

                winnerData.wallet += amount;
                loserData.wallet -= amount;

                await setEconomyData(client, guildId, winner.id, winnerData);
                await setEconomyData(client, guildId, loser.id, loserData);
                await logGameResult(client, guildId, winner.id, 'coinflip', amount);
                await logGameResult(client, guildId, loser.id, 'coinflip', -amount);

                const resultEmbed = successEmbed(
                    '🪙 Coinflip Result',
                    `The coin landed in favor of ${winner.toString()}!\n\n**${winner.username}** wins **$${amount.toLocaleString()}** from **${loser.username}**.`
                );

                await i.update({ embeds: [resultEmbed], components: [] });
            } catch (error) {
                logger.error('Error resolving coinflip:', error);
                await i.update({
                    embeds: [warningEmbed('🪙 Error', 'Something went wrong resolving this coinflip. No money was moved.')],
                    components: [],
                }).catch(() => {});
            }
        });

        collector.on('end', async (collected) => {
            if (collected.size === 0) {
                await InteractionHelper.safeEditReply(interaction, {
                    embeds: [warningEmbed('🪙 Challenge Expired', `${opponentUser.toString()} didn't respond in time.`)],
                    components: [],
                }).catch(() => {});
            }
        });
    }, { command: 'coinflip' })
};
