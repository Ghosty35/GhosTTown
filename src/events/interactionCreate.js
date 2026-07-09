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
          // ... (your existing chat command code - leave it as is)
          // I kept it short for brevity, but keep your full block here
        } else if (interaction.isAutocomplete()) {
          // ... (your existing autocomplete code)
        } else if (interaction.isButton()) {
          // ... (your existing button code)
        } else if (interaction.isStringSelectMenu()) {
          if (interaction.customId === 'role_select_dropdown') {
            // === DROPDOWN ROLE SELECTOR ===
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

          // Existing select menu handler
          const [customId, ...args] = interaction.customId.split(':');
          const selectMenu = client.selectMenus.get(customId);

          if (!selectMenu) {
            if (!interaction.customId.includes(':') || isCollectorManagedComponent(customId)) {
              return;
            }
            throw createError(...);
          }

          try {
            await selectMenu.execute(interaction, client, args);
          } catch (error) {
            await handleInteractionError(...);
          }
        } else if (interaction.isModalSubmit()) {
          // ... (your existing modal code)
        }
      } catch (error) {
        logger.error('Unhandled error in interactionCreate:', { ... });
        try {
          await handleInteractionError(interaction, error, ...);
        } catch (replyError) {
          logger.error('Failed to send fallback error response:', { ... });
        }
      }
    });
  }
};
