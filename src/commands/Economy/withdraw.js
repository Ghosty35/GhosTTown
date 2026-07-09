import { SlashCommandBuilder } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed, infoEmbed, warningEmbed } from '../../utils/embeds.js';
import { getEconomyData, setEconomyData, getMaxBankCapacity } from '../../utils/economy.js';
import { withErrorHandling, createError, ErrorTypes } from '../../utils/errorHandler.js';

import { InteractionHelper } from '../../utils/interactionHelper.js';
export default {
    data: new SlashCommandBuilder()
        .setName('withdraw')
        .setDescription('Withdraw money from Ghost Savings and Loans to your wallet')
        .addIntegerOption(option =>
            option
                .setName('amount')
                .setDescription('Amount to withdraw')
                .setRequired(true)
                .setMinValue(1)
        ),

    execute: withErrorHandling(async (interaction, config, client) => {
        await InteractionHelper.safeDefer(interaction);
            
            const userId = interaction.user.id;
            const guildId = interaction.guildId;
            const amountInput = interaction.options.getInteger("amount");

            const userData = await getEconomyData(client, guildId, userId);
            
            if (!userData) {
                throw createError(
                    "Failed to load economy data",
                    ErrorTypes.DATABASE,
                    "Failed to load your economy data. Please try again later.",
                    { userId, guildId }
                );
            }

            let withdrawAmount = amountInput;

            if (withdrawAmount <= 0) {
                throw createError(
                    "Invalid withdrawal amount",
                    ErrorTypes.VALIDATION,
                    "You must withdraw a positive amount.",
                    { amount: withdrawAmount, userId }
                );
            }

            if (withdrawAmount > userData.bank) {
                withdrawAmount = userData.bank;
            }

            if (withdrawAmount === 0) {
                throw createError(
                    "Empty bank account",
                    ErrorTypes.VALIDATION,
                    "Your Ghost Savings and Loans account is empty.",
                    { userId, bankBalance: userData.bank }
                );
            }

            userData.wallet += withdrawAmount;
            userData.bank -= withdrawAmount;

            await setEconomyData(client, guildId, userId, userData);

            const maxBank = getMaxBankCapacity(userData);
            const pct = Math.min(1, maxBank > 0 ? userData.bank / maxBank : 0);
            const filled = Math.round(pct * 10);
            const vaultBar = '▰'.repeat(filled) + '▱'.repeat(10 - filled);

            const FLAVOR = [
                'Cash counted, stacked, and handed over in a suspicious briefcase. 💼',
                'The teller ghost waves goodbye to your money. 👻👋',
                'Spend it wisely. Or don\'t — the casino thanks you either way. 🎰',
                'Fresh bills, still warm from the vault. 🔥',
                'Reminder: wallet cash CAN be robbed. Watch your back out there. 👀',
            ];

            const embed = successEmbed(
                '🏦 Ghost Savings & Loans — Withdrawal Complete',
                `💰 **$${withdrawAmount.toLocaleString()}** is now in your pocket.\n*${FLAVOR[Math.floor(Math.random() * FLAVOR.length)]}*`
            )
                .addFields(
                    {
                        name: '💵 Wallet',
                        value: `$${userData.wallet.toLocaleString()}`,
                        inline: true,
                    },
                    {
                        name: '🏦 Vault Balance',
                        value: `$${userData.bank.toLocaleString()} / $${maxBank.toLocaleString()}`,
                        inline: true,
                    },
                    {
                        name: '📊 Vault Capacity',
                        value: `${vaultBar} **${Math.round(pct * 100)}%**`,
                        inline: false,
                    },
                )
                .setFooter({ text: '🔓 Wallet cash is fair game for /rob • Ghost Savings & Loans, est. 1913' });

            await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
    }, { command: 'withdraw' })
};