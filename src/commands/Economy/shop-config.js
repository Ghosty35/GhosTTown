import { SlashCommandBuilder } from 'discord.js';
import shopConfigSetrole from './modules/shop_config_setrole.js';
import shopConfigLinkrole from './modules/shop_config_linkrole.js';
import { shopItems } from '../../config/shop/items.js';

const linkableChoices = shopItems
    .filter((item) => item.type === 'color_role' || item.type === 'access_role')
    .map((item) => ({ name: item.name, value: item.id }));

export default {
    slashOnly: true,
    data: new SlashCommandBuilder()
        .setName('shop-config')
        .setDescription('Configure shop settings. (Manage Server required)')
        .addSubcommand(subcommand =>
            subcommand
                .setName('setrole')
                .setDescription('Set the Discord role granted when the Premium Role shop item is purchased.')
                .addRoleOption(option =>
                    option
                        .setName('role')
                        .setDescription('The role to grant for Premium Role purchases.')
                        .setRequired(true),
                ),
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('linkrole')
                .setDescription('Link a color or access shop item to a Discord role.')
                .addStringOption(option =>
                    option
                        .setName('item')
                        .setDescription('Which shop item to link')
                        .setRequired(true)
                        .addChoices(...linkableChoices),
                )
                .addRoleOption(option =>
                    option
                        .setName('role')
                        .setDescription('The role to grant for this item.')
                        .setRequired(true),
                ),
        ),

    async execute(interaction, config, client) {
        const subcommand = interaction.options.getSubcommand();

        if (subcommand === 'setrole') {
            return shopConfigSetrole.execute(interaction, config, client);
        }

        if (subcommand === 'linkrole') {
            return shopConfigLinkrole.execute(interaction, config, client);
        }
    },
};
