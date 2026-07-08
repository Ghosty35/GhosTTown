// jobsService.js
//
// Handles applying for jobs, quitting, and the weekly wage payout cron.
// Job role config (which Discord role means "Currently Working" vs
// "Jobless") is stored per guild, same pattern as shopRoleMap.

import { getJobById, jobs } from '../config/jobs.js';
import { getEconomyData, setEconomyData } from '../utils/economy.js';
import { logger } from '../utils/logger.js';

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

function configKey(guildId) {
    return `job-config:${guildId}`;
}

export async function getJobConfig(client, guildId) {
    const config = await client.db.get(configKey(guildId));
    return config || { workingRoleId: null, joblessRoleId: null };
}

export async function setJobRoles(client, guildId, workingRoleId, joblessRoleId) {
    const config = { workingRoleId, joblessRoleId };
    await client.db.set(configKey(guildId), config);
    return config;
}

/**
 * Swaps a member's job-status role. Safe to call even if roles aren't
 * configured yet, or if the member is missing one of the roles.
 */
async function syncRoles(member, config, isEmployed) {
    try {
        if (isEmployed) {
            if (config.workingRoleId && !member.roles.cache.has(config.workingRoleId)) {
                await member.roles.add(config.workingRoleId, 'Started a job');
            }
            if (config.joblessRoleId && member.roles.cache.has(config.joblessRoleId)) {
                await member.roles.remove(config.joblessRoleId, 'Started a job');
            }
        } else {
            if (config.joblessRoleId && !member.roles.cache.has(config.joblessRoleId)) {
                await member.roles.add(config.joblessRoleId, 'No longer employed');
            }
            if (config.workingRoleId && member.roles.cache.has(config.workingRoleId)) {
                await member.roles.remove(config.workingRoleId, 'No longer employed');
            }
        }
    } catch (error) {
        logger.error(`Error syncing job roles for ${member.id}:`, error);
    }
}

export async function applyForJob(client, guild, member, jobId) {
    const job = getJobById(jobId);
    if (!job) {
        return { success: false, message: `That job doesn't exist.` };
    }

    const userData = await getEconomyData(client, guild.id, member.id);

    if (!userData.inventory?.[job.licenseId]) {
        return {
            success: false,
            message: `You need the **${job.name} License** before applying for this job — check \`/shop browse\` or \`/buy item_id:${job.licenseId}\`.`,
        };
    }

    const previousJob = userData.currentJob ? getJobById(userData.currentJob.jobId) : null;

    userData.currentJob = {
        jobId: job.id,
        startedAt: Date.now(),
        lastPaidAt: Date.now(),
    };
    await setEconomyData(client, guild.id, member.id, userData);

    const config = await getJobConfig(client, guild.id);
    await syncRoles(member, config, true);

    const switchNote = previousJob && previousJob.id !== job.id
        ? ` You've left your job as **${previousJob.name}**.`
        : '';

    return {
        success: true,
        message: `✅ You're now working as a **${job.emoji} ${job.name}**!${switchNote} You'll be paid $${job.weeklyPay.min.toLocaleString()}–$${job.weeklyPay.max.toLocaleString()} every 7 days.`,
    };
}

export async function quitJob(client, guild, member) {
    const userData = await getEconomyData(client, guild.id, member.id);

    if (!userData.currentJob) {
        return { success: false, message: "You don't currently have a job." };
    }

    const job = getJobById(userData.currentJob.jobId);
    userData.currentJob = null;
    await setEconomyData(client, guild.id, member.id, userData);

    const config = await getJobConfig(client, guild.id);
    await syncRoles(member, config, false);

    return { success: true, message: `You've quit your job as **${job?.name || 'your previous job'}**.` };
}

export async function getJobStatus(client, guild, member) {
    const userData = await getEconomyData(client, guild.id, member.id);

    if (!userData.currentJob) {
        const config = await getJobConfig(client, guild.id);
        await syncRoles(member, config, false); // self-heal: make sure Jobless role is present
        return { employed: false };
    }

    const job = getJobById(userData.currentJob.jobId);
    const config = await getJobConfig(client, guild.id);
    await syncRoles(member, config, true); // self-heal: make sure Working role is present

    const msUntilPay = Math.max(0, userData.currentJob.lastPaidAt + WEEK_MS - Date.now());

    return {
        employed: true,
        job,
        startedAt: userData.currentJob.startedAt,
        msUntilPay,
    };
}

/**
 * Meant to be called on a cron schedule (see app.js setupCronJobs).
 * Pays every employed member across every guild whose weekly wage is due.
 * Uses client.db.list, same pattern as the economy dashboard's stats scan.
 */
export async function payAllWeeklyWages(client) {
    for (const [guildId, guild] of client.guilds.cache) {
        try {
            const economyKeys = await client.db.list(`economy:${guildId}:`);
            if (!economyKeys || economyKeys.length === 0) continue;

            for (const key of economyKeys) {
                const userId = key.split(':').pop();
                const userData = await client.db.get(key, {});

                if (!userData.currentJob) continue;

                const dueSince = userData.currentJob.lastPaidAt + WEEK_MS;
                if (Date.now() < dueSince) continue;

                const job = getJobById(userData.currentJob.jobId);
                if (!job) continue;

                const pay = Math.floor(
                    Math.random() * (job.weeklyPay.max - job.weeklyPay.min + 1) + job.weeklyPay.min
                );

                userData.wallet = (userData.wallet || 0) + pay;
                userData.currentJob.lastPaidAt = Date.now();
                await client.db.set(key, userData);

                logger.info(`Paid weekly wage: ${userId} in guild ${guildId} earned $${pay} as ${job.name}`);
            }
        } catch (error) {
            logger.error(`Error paying weekly wages for guild ${guildId}:`, error);
        }
    }
}

export { jobs, WEEK_MS };
