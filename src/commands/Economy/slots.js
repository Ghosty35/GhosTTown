import { SlashCommandBuilder } from 'discord.js';
import { successEmbed, warningEmbed } from '../../utils/embeds.js';
import { getEconomyData, setEconomyData } from '../../utils/economy.js';
import { withErrorHandling, createError, ErrorTypes } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

const SLOTS_COOLDOWN = 3 * 60 * 1000;

// Weighted symbol pool — earlier entries are more common.
// weight: relative chance, multiplier: payout when all 3 reels match.
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

export default {
    data: new SlashCommandBuilder()
        .setName('slots')
        .setDescription('Spin the slot machine')
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
        const now = Date.now();

        const userData = await getEconomyData(client, guildId, userId);
        const lastSlots = userData.lastSlots || 0;

        if (now < lastSlots + SLOTS_COOLDOWN) {
            const remaining = lastSlots + SLOTS_COOLDOWN - now;
            const minutes = Math.floor(remaining / (1000 * 60));
            const seconds = Math.floor((remaining % (1000 * 60)) / 1000);

            throw createError(
                'Slots cooldown active',
                ErrorTypes.RATE_LIMIT,
                `The slot machine needs to cool down. Wait **${minutes}m ${seconds}s**.`,
                { remaining, cooldownType: 'slots' }
            );
        }

        if (userData.wallet < betAmount) {
            throw createError(
                'Insufficient cash for slots',
                ErrorTypes.VALIDATION,
                `You only have $${userData.wallet.toLocaleString()} cash, but you are trying to bet $${betAmount.toLocaleString()}.`,
                { required: betAmount, current: userData.wallet }
            );
        }

        const reels = [spinReel(), spinReel(), spinReel()];
        const reelDisplay = `**[ ${reels.map(r => r.emoji).join(' | ')} ]**`;

        let cashChange = 0;
        let resultEmbed;

        const allMatch = reels[0].emoji === reels[1].emoji && reels[1].emoji === reels[2].emoji;
        const twoMatch = !allMatch && (
            reels[0].emoji === reels[1].emoji ||
            reels[1].emoji === reels[2].emoji ||
            reels[0].emoji === reels[2].emoji
        );

        if (allMatch) {
            const amountWon = Math.floor(betAmount * reels[0].multiplier);
            cashChange = amountWon;
            resultEmbed = successEmbed(
                '🎰 JACKPOT!',
                `${reelDisplay}\n\nAll three matched! You turned **$${betAmount.toLocaleString()}** into **$${amountWon.toLocaleString()}**!`
            );
        } else if (twoMatch) {
            const amountWon = Math.floor(betAmount * 1.5);
            cashChange = amountWon - betAmount;
            resultEmbed = successEmbed(
                '🎰 Small Win',
                `${reelDisplay}\n\nTwo matched! You won **$${amountWon.toLocaleString()}** (net +$${cashChange.toLocaleString()}).`
            );
        } else {
            cashChange = -betAmount;
            resultEmbed = warningEmbed(
                '🎰 No Match',
                `${reelDisplay}\n\nNo matches. You lost your **$${betAmount.toLocaleString()}** bet.`
            );
        }

        userData.wallet = (userData.wallet || 0) + cashChange;
        userData.lastSlots = now;

        await setEconomyData(client, guildId, userId, userData);

        resultEmbed.addFields({
            name: 'New Cash Balance',
            value: `$${userData.wallet.toLocaleString()}`,
            inline: true,
        });
        resultEmbed.setFooter({ text: 'Next spin available in 3 minutes.' });

        await InteractionHelper.safeEditReply(interaction, { embeds: [resultEmbed] });
    }, { command: 'slots' })
};
