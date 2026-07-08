import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { getColor } from '../../config/bot.js';
import { jobs, applyForJob, quitJob, getJobStatus, WEEK_MS } from '../../services/jobsService.js';
import { withErrorHandling } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

const jobChoices = jobs.map((j) => ({ name: `${j.name} (needs ${j.licenseId})`, value: j.id }));

export default {
    data: new SlashCommandBuilder()
        .setName('job')
        .setDescription('Apply for a job and earn weekly GhostCoins')
        .addSubcommand((sub) => sub.setName('list').setDescription('See all available jobs'))
        .addSubcommand((sub) =>
            sub
                .setName('apply')
                .setDescription('Apply for a job (requires owning its license)')
                .addStringOption((opt) =>
                    opt.setName('job').setDescription('Which job').setRequired(true).addChoices(...jobChoices)
                )
        )
        .addSubcommand((sub) => sub.setName('quit').setDescription('Quit your current job'))
        .addSubcommand((sub) => sub.setName('status').setDescription('See your current job and next payout')),

    execute: withErrorHandling(async (interaction, config, client) => {
        const deferred = await InteractionHelper.safeDefer(interaction);
        if (!deferred) return;

        const subcommand = interaction.options.getSubcommand();
        const guild = interaction.guild;
        const member = interaction.member;

        if (subcommand === 'list') {
            const embed = new EmbedBuilder()
                .setTitle('💼 Available Jobs')
                .setDescription('Buy the matching license in `/shop browse`, then run `/job apply`.')
                .setColor(getColor('economy'));

            for (const job of jobs) {
                embed.addFields({
                    name: `${job.emoji} ${job.name}`,
                    value: `${job.description}\n💰 $${job.weeklyPay.min.toLocaleString()}–$${job.weeklyPay.max.toLocaleString()}/week\n📋 Requires: \`${job.licenseId}\``,
                    inline: false,
                });
            }

            await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
            return;
        }

        if (subcommand === 'apply') {
            const jobId = interaction.options.getString('job');
            const result = await applyForJob(client, guild, member, jobId);
            await InteractionHelper.safeEditReply(interaction, { content: result.message });
            return;
        }

        if (subcommand === 'quit') {
            const result = await quitJob(client, guild, member);
            await InteractionHelper.safeEditReply(interaction, { content: result.message });
            return;
        }

        if (subcommand === 'status') {
            const status = await getJobStatus(client, guild, member);

            if (!status.employed) {
                await InteractionHelper.safeEditReply(interaction, {
                    content: "💼 You're currently **jobless**. Check `/job list` to see what's available!",
                });
                return;
            }

            const daysLeft = (status.msUntilPay / (24 * 60 * 60 * 1000)).toFixed(1);
            const embed = new EmbedBuilder()
                .setTitle(`${status.job.emoji} ${status.job.name}`)
                .setDescription(status.job.description)
                .setColor(getColor('economy'))
                .addFields(
                    { name: 'Weekly Pay', value: `$${status.job.weeklyPay.min.toLocaleString()}–$${status.job.weeklyPay.max.toLocaleString()}`, inline: true },
                    { name: 'Next Payout In', value: status.msUntilPay <= 0 ? 'Any moment now' : `${daysLeft} days`, inline: true }
                );

            await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
        }
    }, { command: 'job' })
};
