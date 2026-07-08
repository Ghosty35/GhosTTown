import { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } from 'discord.js';
import { successEmbed, warningEmbed, infoEmbed } from '../../utils/embeds.js';
import { getEconomyData, setEconomyData } from '../../utils/economy.js';
import { withErrorHandling, createError, ErrorTypes } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { logger } from '../../utils/logger.js';
import { logGameResult } from '../../services/gameLogService.js';

const TURN_TIMEOUT_MS = 45000;
const SUITS = ['♠️', '♥️', '♦️', '♣️'];
const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

function buildShoe() {
    const shoe = [];
    for (const suit of SUITS) {
        for (const rank of RANKS) {
            shoe.push({ rank, suit });
        }
    }
    // Fisher-Yates shuffle
    for (let i = shoe.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shoe[i], shoe[j]] = [shoe[j], shoe[i]];
    }
    return shoe;
}

function cardValue(card) {
    if (card.rank === 'A') return 11;
    if (['J', 'Q', 'K'].includes(card.rank)) return 10;
    return parseInt(card.rank, 10);
}

function handValue(hand) {
    let total = hand.reduce((sum, card) => sum + cardValue(card), 0);
    let aces = hand.filter((card) => card.rank === 'A').length;
    while (total > 21 && aces > 0) {
        total -= 10; // treat an Ace as 1 instead of 11
        aces--;
    }
    return total;
}

function formatHand(hand) {
    return hand.map((c) => `${c.rank}${c.suit}`).join(' ');
}

function isBlackjack(hand) {
    return hand.length === 2 && handValue(hand) === 21;
}

export default {
    data: new SlashCommandBuilder()
        .setName('blackjack')
        .setDescription('Play a hand of blackjack against the dealer')
        .addIntegerOption(option =>
            option
                .setName('amount')
                .setDescription('Amount of cash to bet')
                .setRequired(true)
                .setMinValue(1)
        ),

    execute: withErrorHandling(async (interaction, config, client) => {
        const deferred = await InteractionHelper.safeDefer(interaction);
        if (!deferred) return;

        const userId = interaction.user.id;
        const guildId = interaction.guildId;
        const betAmount = interaction.options.getInteger('amount');

        const userData = await getEconomyData(client, guildId, userId);
        if (userData.wallet < betAmount) {
            throw createError(
                'Insufficient cash for blackjack',
                ErrorTypes.VALIDATION,
                `You only have $${userData.wallet.toLocaleString()} cash, but you're trying to bet $${betAmount.toLocaleString()}.`,
                { required: betAmount, current: userData.wallet }
            );
        }

        // Deduct the bet up front; it gets paid back out based on the outcome.
        userData.wallet -= betAmount;
        await setEconomyData(client, guildId, userId, userData);

        const shoe = buildShoe();
        const playerHand = [shoe.pop(), shoe.pop()];
        const dealerHand = [shoe.pop(), shoe.pop()];

        const buildRow = (disabled = false) =>
            new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('bj_hit').setLabel('Hit').setStyle(ButtonStyle.Primary).setDisabled(disabled),
                new ButtonBuilder().setCustomId('bj_stand').setLabel('Stand').setStyle(ButtonStyle.Secondary).setDisabled(disabled)
            );

        const buildInProgressEmbed = () =>
            infoEmbed(
                '🃏 Blackjack',
                `**Your hand:** ${formatHand(playerHand)} (${handValue(playerHand)})\n` +
                    `**Dealer's hand:** ${dealerHand[0].rank}${dealerHand[0].suit} 🂠\n\n` +
                    `Bet: **$${betAmount.toLocaleString()}**`
            ).setFooter({ text: 'You have 45 seconds per turn.' });

        // Natural blackjack — resolve immediately, no buttons needed.
        if (isBlackjack(playerHand)) {
            return await resolveGame(interaction, client, guildId, userId, betAmount, playerHand, dealerHand, 'player_blackjack');
        }

        await InteractionHelper.safeEditReply(interaction, { embeds: [buildInProgressEmbed()], components: [buildRow()] });
        const message = await interaction.fetchReply();

        const collector = message.createMessageComponentCollector({
            componentType: ComponentType.Button,
            time: TURN_TIMEOUT_MS,
            filter: (i) => i.user.id === userId,
        });

        collector.on('collect', async (i) => {
            try {
                if (i.customId === 'bj_hit') {
                    playerHand.push(shoe.pop());

                    if (handValue(playerHand) > 21) {
                        collector.stop('bust');
                        await i.update({
                            embeds: [buildInProgressEmbed()],
                            components: [buildRow(true)],
                        });
                        await resolveGame(interaction, client, guildId, userId, betAmount, playerHand, dealerHand, 'player_bust');
                        return;
                    }

                    if (handValue(playerHand) === 21) {
                        collector.stop('twenty_one');
                        await i.update({ embeds: [buildInProgressEmbed()], components: [buildRow(true)] });
                        await resolveGame(interaction, client, guildId, userId, betAmount, playerHand, dealerHand, 'stand', shoe);
                        return;
                    }

                    await i.update({ embeds: [buildInProgressEmbed()], components: [buildRow()] });
                    return;
                }

                if (i.customId === 'bj_stand') {
                    collector.stop('stand');
                    await i.update({ embeds: [buildInProgressEmbed()], components: [buildRow(true)] });
                    await resolveGame(interaction, client, guildId, userId, betAmount, playerHand, dealerHand, 'stand', shoe);
                }
            } catch (error) {
                logger.error('Error handling blackjack turn:', error);
            }
        });

        collector.on('end', async (collected, reason) => {
            if (reason === 'time') {
                // Timed out with no action taken — treat as a stand so the
                // player's money isn't just stuck in limbo.
                await resolveGame(interaction, client, guildId, userId, betAmount, playerHand, dealerHand, 'stand', shoe);
            }
        });
    }, { command: 'blackjack' })
};

async function resolveGame(interaction, client, guildId, userId, betAmount, playerHand, dealerHand, outcome, shoe) {
    let finalDealerHand = dealerHand;

    if (outcome === 'stand') {
        // Dealer draws until at least 17
        while (handValue(finalDealerHand) < 17) {
            finalDealerHand = [...finalDealerHand, shoe.pop()];
        }
    }

    const playerTotal = handValue(playerHand);
    const dealerTotal = handValue(finalDealerHand);

    const userData = await getEconomyData(client, guildId, userId);
    let payout = 0;
    let resultEmbed;

    if (outcome === 'player_blackjack') {
        payout = Math.floor(betAmount * 2.5);
        resultEmbed = successEmbed(
            '🃏 Blackjack!',
            `**Your hand:** ${formatHand(playerHand)} (21)\n**Dealer's hand:** ${formatHand(dealerHand)} (${dealerTotal})\n\nNatural blackjack! You win **$${payout.toLocaleString()}**.`
        );
    } else if (outcome === 'player_bust') {
        payout = 0;
        resultEmbed = warningEmbed(
            '🃏 Bust!',
            `**Your hand:** ${formatHand(playerHand)} (${playerTotal})\n**Dealer's hand:** ${dealerHand[0].rank}${dealerHand[0].suit} 🂠\n\nYou went over 21 and lost your **$${betAmount.toLocaleString()}** bet.`
        );
    } else if (dealerTotal > 21) {
        payout = betAmount * 2;
        resultEmbed = successEmbed(
            '🃏 Dealer Busts!',
            `**Your hand:** ${formatHand(playerHand)} (${playerTotal})\n**Dealer's hand:** ${formatHand(finalDealerHand)} (${dealerTotal})\n\nThe dealer busted! You win **$${payout.toLocaleString()}**.`
        );
    } else if (playerTotal > dealerTotal) {
        payout = betAmount * 2;
        resultEmbed = successEmbed(
            '🃏 You Win!',
            `**Your hand:** ${formatHand(playerHand)} (${playerTotal})\n**Dealer's hand:** ${formatHand(finalDealerHand)} (${dealerTotal})\n\nYou win **$${payout.toLocaleString()}**.`
        );
    } else if (playerTotal < dealerTotal) {
        payout = 0;
        resultEmbed = warningEmbed(
            '🃏 Dealer Wins',
            `**Your hand:** ${formatHand(playerHand)} (${playerTotal})\n**Dealer's hand:** ${formatHand(finalDealerHand)} (${dealerTotal})\n\nThe dealer wins. You lost your **$${betAmount.toLocaleString()}** bet.`
        );
    } else {
        payout = betAmount; // push — bet returned
        resultEmbed = infoEmbed(
            '🃏 Push',
            `**Your hand:** ${formatHand(playerHand)} (${playerTotal})\n**Dealer's hand:** ${formatHand(finalDealerHand)} (${dealerTotal})\n\nIt's a tie — your **$${betAmount.toLocaleString()}** bet has been returned.`
        );
    }

    userData.wallet += payout;
    await setEconomyData(client, guildId, userId, userData);
    await logGameResult(client, guildId, userId, 'blackjack', payout - betAmount);

    resultEmbed.addFields({ name: 'New Cash Balance', value: `$${userData.wallet.toLocaleString()}`, inline: true });

    await InteractionHelper.safeEditReply(interaction, { embeds: [resultEmbed], components: [] });
}
