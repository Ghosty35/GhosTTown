import { Events, MessageFlags } from 'discord.js';
import { logger } from '../utils/logger.js';
import { getGuildConfig } from '../services/guildConfig.js';
import { handleApplicationModal } from '../commands/Community/apply.js';
import { handleApplicationReviewModal } from '../commands/Community/app-admin.js';
import { handleInteractionError, createError, ErrorTypes } from '../utils/errorHandler.js';
import { InteractionHelper } from '../utils/interactionHelper.js';
import { createInteractionTraceContext, runWithTraceContext } from '../utils/logger.js';
import { validateChatInputPayloadOrThrow } from '../utils/commandInputValidation.js';
import { enforceAbuseProtection, formatCooldownDuration } from '../utils/abuseProtection.js';
import { isCommandEnabled } from '../services/commandAccessService.js';
import { checkChannelRestriction } from '../services/channelRestrictionService.js';
import { resolveSlashAccessKey } from '../utils/messageAdapter.js';
import { isCollectorManagedComponent } from '../utils/collectorComponents.js';
import { ResponseCoordinator } from '../utils/responseCoordinator.js';
import { enforceDefaultCommandPermissions } from '../utils/permissionGuard.js';

function withTraceContext(context = {}, traceContext = {}) {
  return {
    traceId: traceContext.traceId,
    guildId: context.guildId || traceContext.guildId,
    userId: context.userId || traceContext.userId,
    command: context.commandName || traceContext.command,
    ...context
  };
}

export default {
  name: Events.InteractionCreate,
  async execute(interaction, client) {
    const interactionTraceContext = createInteractionTraceContext(interaction);
    interaction.traceContext = interactionTraceContext;
    interaction.traceId = interactionTraceContext.traceId;

    return runWithTraceContext(interactionTraceContext, async () => {
      try {
        InteractionHelper.patchInteractionResponses(interaction);
        ResponseCoordinator.attach(interaction);

        if (interaction.isChatInputCommand()) {
          try {
            logger.info(`Command executed: /${interaction.commandName} by ${interaction.user.tag}`, {
              event: 'interaction.command.received',
              traceId: interactionTraceContext.traceId,
              guildId: interaction.guildId,
              userId: interaction.user?.id,
              command: interaction.commandName
            });

            validateChatInputPayloadOrThrow(interaction, withTraceContext({
              type: 'command_input_validation',
              commandName: interaction.commandName
            }, interactionTraceContext));

            const command = client.commands.get(interaction.commandName);

            if (!command) {
              throw createError(
                `No command matching ${interaction.commandName} was found.`,
                ErrorTypes.CONFIGURATION,
                'Sorry, that command does not exist.',
                withTraceContext({ commandName: interaction.commandName }, interactionTraceContext)
              );
            }

            const abuseProtection = await enforceAbuseProtection(interaction, command, interaction.commandName);
            if (!abuseProtection.allowed) {
              const formattedCooldown = formatCooldownDuration(abuseProtection.remainingMs);
              throw createError(
                `Risky command cooldown active for ${interaction.commandName}`,
                ErrorTypes.RATE_LIMIT,
                `This command is on cooldown. Please wait ${formattedCooldown} before trying again.`,
                withTraceContext({
                  commandName: interaction.commandName,
                  subtype: 'command_cooldown',
                  expected: true,
                  cooldownMs: abuseProtection.remainingMs,
                  cooldownWindowMs: abuseProtection.policy?.windowMs,
                  cooldownMaxAttempts: abuseProtection.policy?.maxAttempts
                }, interactionTraceContext)
              );
            }

            let guildConfig = null;
            if (interaction.guild) {
              guildConfig = await getGuildConfig(client, interaction.guild.id, interactionTraceContext);
              const accessKey = resolveSlashAccessKey(interaction);
              if (!(await isCommandEnabled(client, interaction.guild.id, accessKey, command.category))) {
                throw createError(
                  `Command ${accessKey} is disabled in this guild`,
                  ErrorTypes.CONFIGURATION,
                  'This command has been disabled for this server.',
                  withTraceContext({ commandName: accessKey, guildId: interaction.guild.id }, interactionTraceContext)
                );
              }

              const channelCheck = await checkChannelRestriction(client, interaction.guild.id, interaction.channelId, interaction.commandName);
              if (!channelCheck.allowed) {
                throw createError(
                  `Command ${interaction.commandName} used outside its restricted channel`,
                  ErrorTypes.VALIDATION,
                  `This command can only be used in <#${channelCheck.requiredChannelId}>.`,
                  withTraceContext({ commandName: interaction.commandName, guildId: interaction.guild.id }, interactionTraceContext)
                );
              }
            }

            const permissionAllowed = await enforceDefaultCommandPermissions(interaction, command, {
              source: 'interactionCreate',
              guildConfig,
            });
            if (!permissionAllowed) {
              return;
            }

            await command.execute(interaction, guildConfig, client);
          } catch (error) {
            await handleInteractionError(interaction, error, withTraceContext({
              type: 'command',
              commandName: interaction.commandName
            }, interactionTraceContext));
          }
        } else if (interaction.isAutocomplete()) {
          // ... (keep your existing autocomplete code here)
        } else if (interaction.isButton()) {
          // ... (keep your existing button code here)
        } else if (interaction.isStringSelectMenu()) {
          if (interaction.customId === 'role_select_dropdown') {
            await interaction.deferReply({ ephemeral: true });

            const selectedValues = interaction.values;
            const member = interaction.member;

            const roleMap = {
                'Gta News': '1197296528361017356',
                'Forza Gamers': '1510737840718221384',
                'Game Updates/News': '1524096202432315603',
                'Game Corner': '1469137327208005815',
                'Verified': '1013631705506123816',
            };

            const added = [];
            const removed = [];

            for (const [value, roleId] of Object.entries(roleMap)) {
                if (!roleId) continue;
                const role = interaction.guild.roles.cache.get(roleId);
                if (!role) continue;

                if (selectedValues.includes(value)) {
                    if (!member.roles.cache.has(roleId)) {
                        await member.roles.add(roleId).catch(() => {});
                        added.push(role.name);
                    }
                } else {
                    if (member.roles.cache.has(roleId)) {
                        await member.roles.remove(roleId).catch(() => {});
                        removed.push(role.name);
                    }
                }
            }

            let replyText = '';
            if (added.length) replyText += `✅ **Added:** ${added.join(', ')}\n`;
            if (removed.length) replyText += `❌ **Removed:** ${removed.join(', ')}\n`;
            if (!replyText) replyText = 'No changes made.';

            await interaction.editReply({ content: replyText });
            return;
          }

          // Existing select menu handler (if any)
          const [customId, ...args] = interaction.customId.split(':');
          const selectMenu = client.selectMenus.get(customId);

          if (!selectMenu) return;

          try {
            await selectMenu.execute(interaction, client, args);
          } catch (error) {
            await handleInteractionError(interaction, error, withTraceContext({
              type: 'select_menu',
              customId: interaction.customId
            }, interactionTraceContext));
          }
        } else if (interaction.isModalSubmit()) {
          // ... (keep your existing modal code)
        }
      } catch (error) {
        logger.error('Unhandled error in interactionCreate:', {
          event: 'interaction.unhandled_error',
          errorCode: 'INTERACTION_UNHANDLED_ERROR',
          error,
          traceId: interactionTraceContext.traceId,
          interactionId: interaction.id,
          guildId: interaction.guildId,
          userId: interaction.user?.id
        });

        try {
          await handleInteractionError(interaction, error, withTraceContext({
            type: 'interaction',
            commandName: interaction.commandName,
            customId: interaction.customId,
            source: 'interactionCreate.unhandled'
          }, interactionTraceContext));
        } catch (replyError) {
          logger.error('Failed to send fallback error response:', {
            event: 'interaction.error_response_failed',
            errorCode: 'INTERACTION_ERROR_RESPONSE_FAILED',
            error: replyError,
            traceId: interactionTraceContext.traceId
          });
        }
      }
    });
  }
};
