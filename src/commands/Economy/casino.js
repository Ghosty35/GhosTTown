// commands/Economy/casino.js
//
// Merges what used to be 4 separate top-level commands (/slots,
// /blackjack, /coinflip, /gamble) into one command with subcommands, to
// stay under Discord's 100-command-per-guild limit. Internal logic for
// each game is unchanged from the original standalone files — only the
// command structure changed.

import { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } from 'discord.js';
import { successEmbed, warningEmbed, infoEmbed } from '../../utils/embeds.js';
import { getEconomyData, setEconomyData } from '../../utils/economy.js';
import { withErrorHandling, createError, ErrorTypes } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { logger } from '../../utils/logger.js';
import { logGameResult } from '../../services/gameLogService.js';

export default {
    data: new SlashCommandBuilder()
        .setName('casino')
        .setDescription('Play games of chance — slots, blackjack, coinflip, and gamble')
        .addSubcommand((sub) =>
            sub
                .setName('slots')
                .setDescription('Spin the slot machine')
                .addIntegerOption((opt) => opt.setName('amount').setDescription('Amount of cash to bet').setRequired(true).setMinValue(1))
        )
        .addSubcommand((sub) =>
            sub
                .setName('blackjack')
                .setDescription('Play a hand of blackjack against the dealer')
                .addIntegerOption((opt) => opt.setName('amount').setDescription('Amount of cash to bet').setRequired(true).setMinValue(1))
        )
        .addSubcommand((sub) =>
            sub
                .setName('coinflip')
                .setDescription('Challenge another member to a coinflip wager')
                .addUserOption((opt) => opt.setName('opponent').setDescription('Who to challenge').setRequired(true))
                .addIntegerOption((opt) => opt.setName('amount').setDescription('Amount of cash to wager').setRequired(true).setMinValue(1))
        )
        .addSubcommand((sub) =>
            sub
                .setName('gamble')
                .setDescription('Gamble your money for a chance to win more')
                .addIntegerOption((opt) => opt.setName('amount').setDescription('Amount of cash to gamble').setRequired(true).setMinValue(1))
        ),

    execute: withErrorHandling(async (interaction, config, client) => {
        const subcommand = interaction.options.getSubcommand();

        if (subcommand === 'slots') return executeSlots(interaction, client);
        if (subcommand === 'blackjack') return executeBlackjack(interaction, client);
        if (subcommand === 'coinflip') return executeCoinflip(interaction, client);
        if (subcommand === 'gamble') return executeGamble(interaction, client);
    }, { command: 'casino' })
};

// =====================================================================
// SLOTS
// =====================================================================
const SLOTS_COOLDOWN = 3 * 60 * 1000;
const SYMBOLS = [
    { emoji: '🍒', weight: 30, multiplier: 2 },
    { emoji: '🍋', weight: 25, multiplier: 3 },
    { emoji: '🔔', weight: 18, multiplier: 5 },
    { emoji: '⭐', weight: 12, multiplier: 10 },
    { emoji: '💎', weight: 6, multiplier: 25 },
    { emoji: '7️⃣', weight: 2, multiplier: 50 },
];
const TOTAL_WEIGHT = SYMBOLS.reduce((sum, s) => sum + s.weight, 0);

function spinReel() {
    let roll = Math.random() * TOTAL_WEIGHT;
    for (const symbol of SYMBOLS) {
        if (roll < symbol.weight) return symbol;
        roll -= symbol.weight;
    }
    return SYMBOLS[0];
}

async function executeSlots(interaction, client) {
    const deferred = await InteractionHelper.safeDefer(interaction);
    if (!deferred) return;

    const userId = interaction.user.id;
    const guildId = interaction.guildId;
    const betAmount = interaction.options.getInteger('amount');
    const now = Date.now();

    const userData = await getEconomyData(client, guildId, userId);
    const lastSlots = userData.lastSlots || 0;

    if (now < lastSlots + SLOTS_COOLDOWN) {
        const remaining = lastSlots + SLOTS_COOLDOWN - now;
        const minutes = Math.floor(remaining / (1000 * 60));
        const seconds = Math.floor((remaining % (1000 * 60)) / 1000);
        throw createError('Slots cooldown active', ErrorTypes.RATE_LIMIT, `The slot machine needs to cool down. Wait **${minutes}m ${seconds}s**.`, { remaining, cooldownType: 'slots' });
    }

    if (userData.wallet < betAmount) {
        throw createError('Insufficient cash for slots', ErrorTypes.VALIDATION, `You only have $${userData.wallet.toLocaleString()} cash, but you are trying to bet $${betAmount.toLocaleString()}.`, { required: betAmount, current: userData.wallet });
    }

    const reels = [spinReel(), spinReel(), spinReel()];
    const reelDisplay = `**[ ${reels.map((r) => r.emoji).join(' | ')} ]**`;

    let cashChange = 0;
    let resultEmbed;

    const allMatch = reels[0].emoji === reels[1].emoji && reels[1].emoji === reels[2].emoji;
    const twoMatch = !allMatch && (reels[0].emoji === reels[1].emoji || reels[1].emoji === reels[2].emoji || reels[0].emoji === reels[2].emoji);

    if (allMatch) {
        const amountWon = Math.floor(betAmount * reels[0].multiplier);
        cashChange = amountWon;
        resultEmbed = successEmbed('🎰 JACKPOT!', `${reelDisplay}\n\nAll three matched! You turned **$${betAmount.toLocaleString()}** into **$${amountWon.toLocaleString()}**!`);
    } else if (twoMatch) {
        const amountWon = Math.floor(betAmount * 1.5);
        cashChange = amountWon - betAmount;
        resultEmbed = successEmbed('🎰 Small Win', `${reelDisplay}\n\nTwo matched! You won **$${amountWon.toLocaleString()}** (net +$${cashChange.toLocaleString()}).`);
    } else {
        cashChange = -betAmount;
        resultEmbed = warningEmbed('🎰 No Match', `${reelDisplay}\n\nNo matches. You lost your **$${betAmount.toLocaleString()}** bet.`);
    }

    userData.wallet = (userData.wallet || 0) + cashChange;
    userData.lastSlots = now;
    await setEconomyData(client, guildId, userId, userData);
    await logGameResult(client, guildId, userId, 'slots', cashChange);

    resultEmbed.addFields({ name: 'New Cash Balance', value: `$${userData.wallet.toLocaleString()}`, inline: true });
    resultEmbed.setFooter({ text: 'Next spin available in 3 minutes.' });

    await InteractionHelper.safeEditReply(interaction, { embeds: [resultEmbed] });
}

// =====================================================================
// BLACKJACK
// =====================================================================
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
        total -= 10;
        aces--;
    }
    return total;
}

function formatHand(hand) {
    return hand.map((c) => `${c.rank}${c.suit}`).join(' ');
}

function isNaturalBlackjack(hand) {
    return hand.length === 2 && handValue(hand) === 21;
}

async function executeBlackjack(interaction, client) {
    const deferred = await InteractionHelper.safeDefer(interaction);
    if (!deferred) return;

    const userId = interaction.user.id;
    const guildId = interaction.guildId;
    const betAmount = interaction.options.getInteger('amount');

    const userData = await getEconomyData(client, guildId, userId);
    if (userData.wallet < betAmount) {
        throw createError('Insufficient cash for blackjack', ErrorTypes.VALIDATION, `You only have $${userData.wallet.toLocaleString()} cash, but you're trying to bet $${betAmount.toLocaleString()}.`, { required: betAmount, current: userData.wallet });
    }

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

    if (isNaturalBlackjack(playerHand)) {
        return await resolveBlackjack(interaction, client, guildId, userId, betAmount, playerHand, dealerHand, 'player_blackjack');
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
                    await i.update({ embeds: [buildInProgressEmbed()], components: [buildRow(true)] });
                    await resolveBlackjack(interaction, client, guildId, userId, betAmount, playerHand, dealerHand, 'player_bust');
                    return;
                }

                if (handValue(playerHand) === 21) {
                    collector.stop('twenty_one');
                    await i.update({ embeds: [buildInProgressEmbed()], components: [buildRow(true)] });
                    await resolveBlackjack(interaction, client, guildId, userId, betAmount, playerHand, dealerHand, 'stand', shoe);
                    return;
                }

                await i.update({ embeds: [buildInProgressEmbed()], components: [buildRow()] });
                return;
            }

            if (i.customId === 'bj_stand') {
                collector.stop('stand');
                await i.update({ embeds: [buildInProgressEmbed()], components: [buildRow(true)] });
                await resolveBlackjack(interaction, client, guildId, userId, betAmount, playerHand, dealerHand, 'stand', shoe);
            }
        } catch (error) {
            logger.error('Error handling blackjack turn:', error);
        }
    });

    collector.on('end', async (collected, reason) => {
        if (reason === 'time') {
            await resolveBlackjack(interaction, client, guildId, userId, betAmount, playerHand, dealerHand, 'stand', shoe);
        }
    });
}

async function resolveBlackjack(interaction, client, guildId, userId, betAmount, playerHand, dealerHand, outcome, shoe) {
    let finalDealerHand = dealerHand;

    if (outcome === 'stand') {
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
        resultEmbed = successEmbed('🃏 Blackjack!', `**Your hand:** ${formatHand(playerHand)} (21)\n**Dealer's hand:** ${formatHand(dealerHand)} (${dealerTotal})\n\nNatural blackjack! You win **$${payout.toLocaleString()}**.`);
    } else if (outcome === 'player_bust') {
        payout = 0;
        resultEmbed = warningEmbed('🃏 Bust!', `**Your hand:** ${formatHand(playerHand)} (${playerTotal})\n**Dealer's hand:** ${dealerHand[0].rank}${dealerHand[0].suit} 🂠\n\nYou went over 21 and lost your **$${betAmount.toLocaleString()}** bet.`);
    } else if (dealerTotal > 21) {
        payout = betAmount * 2;
        resultEmbed = successEmbed('🃏 Dealer Busts!', `**Your hand:** ${formatHand(playerHand)} (${playerTotal})\n**Dealer's hand:** ${formatHand(finalDealerHand)} (${dealerTotal})\n\nThe dealer busted! You win **$${payout.toLocaleString()}**.`);
    } else if (playerTotal > dealerTotal) {
        payout = betAmount * 2;
        resultEmbed = successEmbed('🃏 You Win!', `**Your hand:** ${formatHand(playerHand)} (${playerTotal})\n**Dealer's hand:** ${formatHand(finalDealerHand)} (${dealerTotal})\n\nYou win **$${payout.toLocaleString()}**.`);
    } else if (playerTotal < dealerTotal) {
        payout = 0;
        resultEmbed = warningEmbed('🃏 Dealer Wins', `**Your hand:** ${formatHand(playerHand)} (${playerTotal})\n**Dealer's hand:** ${formatHand(finalDealerHand)} (${dealerTotal})\n\nThe dealer wins. You lost your **$${betAmount.toLocaleString()}** bet.`);
    } else {
        payout = betAmount;
        resultEmbed = infoEmbed('🃏 Push', `**Your hand:** ${formatHand(playerHand)} (${playerTotal})\n**Dealer's hand:** ${formatHand(finalDealerHand)} (${dealerTotal})\n\nIt's a tie — your **$${betAmount.toLocaleString()}** bet has been returned.`);
    }

    userData.wallet += payout;
    await setEconomyData(client, guildId, userId, userData);
    await logGameResult(client, guildId, userId, 'blackjack', payout - betAmount);

    resultEmbed.addFields({ name: 'New Cash Balance', value: `$${userData.wallet.toLocaleString()}`, inline: true });
    await InteractionHelper.safeEditReply(interaction, { embeds: [resultEmbed], components: [] });
}

// =====================================================================
// COINFLIP
// =====================================================================
const CHALLENGE_TIMEOUT_MS = 60000;

async function executeCoinflip(interaction, client) {
    const deferred = await InteractionHelper.safeDefer(interaction);
    if (!deferred) return;

    const guildId = interaction.guildId;
    const challenger = interaction.user;
    const opponentUser = interaction.options.getUser('opponent');
    const amount = interaction.options.getInteger('amount');

    if (opponentUser.id === challenger.id) {
        throw createError('Cannot challenge yourself', ErrorTypes.VALIDATION, "You can't coinflip against yourself.", { userId: challenger.id });
    }
    if (opponentUser.bot) {
        throw createError('Cannot challenge a bot', ErrorTypes.VALIDATION, "You can't challenge a bot to a coinflip.", { userId: opponentUser.id });
    }

    const challengerData = await getEconomyData(client, guildId, challenger.id);
    if (challengerData.wallet < amount) {
        throw createError('Insufficient funds', ErrorTypes.VALIDATION, `You only have $${challengerData.wallet.toLocaleString()} cash, but you're trying to wager $${amount.toLocaleString()}.`, { required: amount, current: challengerData.wallet });
    }

    const acceptButton = new ButtonBuilder().setCustomId('coinflip_accept').setLabel('Accept').setStyle(ButtonStyle.Success).setEmoji('🪙');
    const declineButton = new ButtonBuilder().setCustomId('coinflip_decline').setLabel('Decline').setStyle(ButtonStyle.Danger);
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
                await i.update({ embeds: [warningEmbed('🪙 Challenge Declined', `${opponentUser.toString()} declined the coinflip.`)], components: [] });
                return;
            }

            const freshChallenger = await getEconomyData(client, guildId, challenger.id);
            const freshOpponent = await getEconomyData(client, guildId, opponentUser.id);

            if (freshChallenger.wallet < amount) {
                await i.update({ embeds: [warningEmbed('🪙 Challenge Cancelled', `${challenger.toString()} no longer has enough cash for this wager.`)], components: [] });
                return;
            }
            if (freshOpponent.wallet < amount) {
                await i.update({ embeds: [warningEmbed('🪙 Challenge Cancelled', `${opponentUser.toString()} doesn't have enough cash to accept this wager.`)], components: [] });
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

            const resultEmbed = successEmbed('🪙 Coinflip Result', `The coin landed in favor of ${winner.toString()}!\n\n**${winner.username}** wins **$${amount.toLocaleString()}** from **${loser.username}**.`);
            await i.update({ embeds: [resultEmbed], components: [] });
        } catch (error) {
            logger.error('Error resolving coinflip:', error);
            await i.update({ embeds: [warningEmbed('🪙 Error', 'Something went wrong resolving this coinflip. No money was moved.')], components: [] }).catch(() => {});
        }
    });

    collector.on('end', async (collected) => {
        if (collected.size === 0) {
            await InteractionHelper.safeEditReply(interaction, { embeds: [warningEmbed('🪙 Challenge Expired', `${opponentUser.toString()} didn't respond in time.`)], components: [] }).catch(() => {});
        }
    });
}

// =====================================================================
// GAMBLE
// =====================================================================
const BASE_WIN_CHANCE = 0.5;
const CLOVER_WIN_BONUS = 0.2;
const CHARM_WIN_BONUS = 0.1;
const PAYOUT_MULTIPLIER = 2.0;
const GAMBLE_COOLDOWN = 3 * 60 * 1000;

async function executeGamble(interaction, client) {
    const deferred = await InteractionHelper.safeDefer(interaction);
    if (!deferred) return;

    const userId = interaction.user.id;
    const guildId = interaction.guildId;
    const betAmount = interaction.options.getInteger('amount');
    const now = Date.now();

    const userData = await getEconomyData(client, guildId, userId);
    const lastGamble = userData.lastGamble || 0;
    let cloverCount = userData.inventory['lucky_clover'] || 0;
    let charmCount = userData.inventory['lucky_charm'] || 0;

    if (now < lastGamble + GAMBLE_COOLDOWN) {
        const remaining = lastGamble + GAMBLE_COOLDOWN - now;
        const minutes = Math.floor(remaining / (1000 * 60));
        const seconds = Math.floor((remaining % (1000 * 60)) / 1000);
        throw createError('Gamble cooldown active', ErrorTypes.RATE_LIMIT, `You need to cool down before gambling again. Wait **${minutes}m ${seconds}s**.`, { remaining, cooldownType: 'gamble' });
    }

    if (userData.wallet < betAmount) {
        throw createError('Insufficient cash for gamble', ErrorTypes.VALIDATION, `You only have $${userData.wallet.toLocaleString()} cash, but you are trying to bet $${betAmount.toLocaleString()}.`, { required: betAmount, current: userData.wallet });
    }

    let winChance = BASE_WIN_CHANCE;
    let cloverMessage = '';
    let usedClover = false;
    let usedCharm = false;

    if (cloverCount > 0) {
        winChance += CLOVER_WIN_BONUS;
        userData.inventory['lucky_clover'] -= 1;
        cloverMessage = `\n🍀 **Lucky Clover Consumed:** Your win chance was boosted!`;
        usedClover = true;
    } else if (charmCount > 0) {
        winChance += CHARM_WIN_BONUS;
        userData.inventory['lucky_charm'] -= 1;
        cloverMessage = `\n🍀 **Lucky Charm Used (${charmCount - 1} uses remaining):** Your win chance was boosted!`;
        usedCharm = true;
    }

    const win = Math.random() < winChance;
    let cashChange = 0;
    let resultEmbed;

    if (win) {
        const amountWon = Math.floor(betAmount * PAYOUT_MULTIPLIER);
        cashChange = amountWon;
        resultEmbed = successEmbed('🎉 You Won!', `You successfully gambled and turned your **$${betAmount.toLocaleString()}** bet into **$${amountWon.toLocaleString()}**!${cloverMessage}`);
    } else {
        cashChange = -betAmount;
        resultEmbed = warningEmbed('💔 You Lost...', `The dice rolled against you. You lost your **$${betAmount.toLocaleString()}** bet.`);
    }

    userData.wallet = (userData.wallet || 0) + cashChange;
    userData.lastGamble = now;
    await setEconomyData(client, guildId, userId, userData);
    await logGameResult(client, guildId, userId, 'gamble', cashChange);

    resultEmbed.addFields({ name: 'New Cash Balance', value: `$${userData.wallet.toLocaleString()}`, inline: true });

    if (usedClover) {
        resultEmbed.setFooter({ text: `You have ${userData.inventory['lucky_clover']} Lucky Clovers left. Win chance was ${Math.round(winChance * 100)}%.` });
    } else if (usedCharm) {
        resultEmbed.setFooter({ text: `You have ${userData.inventory['lucky_charm']} Lucky Charm uses left. Win chance was ${Math.round(winChance * 100)}%.` });
    } else {
        resultEmbed.setFooter({ text: `Next gamble available in 3 minutes. Base win chance: ${Math.round(BASE_WIN_CHANCE * 100)}%.` });
    }

    await InteractionHelper.safeEditReply(interaction, { embeds: [resultEmbed] });
}
