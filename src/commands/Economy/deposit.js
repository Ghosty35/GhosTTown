import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { successEmbed, buildUserErrorEmbed } from '../../utils/embeds.js';
import { getEconomyData, setEconomyData, getMaxBankCapacity } from '../../utils/economy.js';
import { withErrorHandling, createError, ErrorTypes } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

export default {
    data: new SlashCommandBuilder()
        .setName('deposit')
        .setDescription('Deposit money from your wallet into Ghost Savings and Loans')
        .addStringOption(option =>
            option
                .setName('amount')
                .setDescription('Amount to deposit (number or "all")')
                .setRequired(true)
        ),

    execute: withErrorHandling(async (interaction, config, client) => {
        const deferred = await InteractionHelper.safeDefer(interaction);
        if (!deferred) return;
        
        const userId = interaction.user.id;
            const guildId = interaction.guildId;
            const amountInput = interaction.options.getString("amount");

            const userData = await getEconomyData(client, guildId, userId);
            
            if (!userData) {
                throw createError(
                    "Failed to load economy data",
                    ErrorTypes.DATABASE,
                    "Failed to load your economy data. Please try again later.",
                    { userId, guildId }
                );
            }
            
            const maxBank = getMaxBankCapacity(userData);
            let depositAmount;

            if (amountInput.toLowerCase() === "all") {
                depositAmount = userData.wallet;
            } else {
                depositAmount = parseInt(amountInput);

                if (isNaN(depositAmount) || depositAmount <= 0) {
                    throw createError(
                        "Invalid deposit amount",
                        ErrorTypes.VALIDATION,
                        `Please enter a valid number or 'all'. You entered: \`${amountInput}\``,
                        { amountInput, userId }
                    );
                }
            }

            if (depositAmount === 0) {
                throw createError(
                    "Zero deposit amount",
                    ErrorTypes.VALIDATION,
                    "You have no cash to deposit.",
                    { userId, walletBalance: userData.wallet }
                );
            }

            if (depositAmount > userData.wallet) {
                depositAmount = userData.wallet;
                await interaction.followUp({
                    embeds: [
                        buildUserErrorEmbed(
                            'validation',
                            `You tried to deposit more than you have. Depositing your remaining cash: **$${depositAmount.toLocaleString()}**`
                        )
                    ],
                    flags: MessageFlags.Ephemeral,
                });
            }

            const availableSpace = maxBank - userData.bank;

            if (availableSpace <= 0) {
                throw createError(
                    "Bank is full",
                    ErrorTypes.VALIDATION,
                    `Your Ghost Savings and Loans account is currently full (Max Capacity: $${maxBank.toLocaleString()}). Purchase a **Bank Upgrade** to increase your limit.`,
                    { maxBank, currentBank: userData.bank, userId }
                );
            }

            if (depositAmount > availableSpace) {
                const originalDepositAmount = depositAmount;
                depositAmount = availableSpace;

                if (amountInput.toLowerCase() !== "all") {
                    await interaction.followUp({
                        embeds: [
                            buildUserErrorEmbed(
                                'validation',
                                `You only had space for **$${depositAmount.toLocaleString()}** in your bank account (Max: $${maxBank.toLocaleString()}). The rest remains in your cash.`
                            )
                        ],
                        flags: MessageFlags.Ephemeral,
                    });
                }
            }

            if (depositAmount === 0) {
                throw createError(
                    "No space or cash for deposit",
                    ErrorTypes.VALIDATION,
                    "The amount you tried to deposit was either 0 or exceeded your bank capacity after checking your cash balance.",
                    { depositAmount, availableSpace, walletBalance: userData.wallet }
                );
            }

            userData.wallet -= depositAmount;
            userData.bank += depositAmount;

            await setEconomyData(client, guildId, userId, userData);

            // Vault capacity bar, e.g. ▰▰▰▰▰▰▱▱▱▱ 61%
            const pct = Math.min(1, userData.bank / maxBank);
            const filled = Math.round(pct * 10);
            const vaultBar = '▰'.repeat(filled) + '▱'.repeat(10 - filled);

            const FLAVOR = [
                'Your money is now sleeping behind 3 feet of haunted steel. 🔐',
                'The vault door closes with a satisfying *THUNK*. 🚪',
                'Wise move — robbers can only dream about this now. 🦹❌',
                'Our ghost tellers counted it twice. It checks out. 👻',
                'Compound interest not included, peace of mind is. ✨',
            ];

            const embed = successEmbed(
                '🏦 Ghost Savings & Loans — Deposit Confirmed',
                `💸 **$${depositAmount.toLocaleString()}** has been secured in your vault.\n*${FLAVOR[Math.floor(Math.random() * FLAVOR.length)]}*`
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
                        value: `${vaultBar} **${Math.round(pct * 100)}%**${pct >= 0.9 ? '\n⚠️ *Nearly full — grab a 📜 Bank Note or 🏦 Bank Upgrade in the shop!*' : ''}`,
                        inline: false,
                    },
                )
                .setFooter({ text: '🔐 Vault funds are safe from /rob • Ghost Savings & Loans, est. 1913' });

            await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
    }, { command: 'deposit' })
};