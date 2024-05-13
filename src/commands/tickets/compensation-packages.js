/* eslint-disable sonarjs/no-duplicate-string */
const { serverConfig } = require('../../modules/cftClient');
const { ChatInputCommand } = require('../../classes/Commands');
const { ApplicationCommandOptionType } = require('discord.js');
const { TicketModel } = require('../../mongo/Ticket');
const ticketPanels = require('../../../config/tickets');
const { requiredItemPackageACOption, itemPackageOptionIdentifier } = require('../../interactions/autocomplete/item-package');
const { ItemPackageModel } = require('../../mongo/ItemPackage');
const { resolveOverridableConfigKey } = require('../../modules/ticket-config');

module.exports = new ChatInputCommand({
  global: true,
  permLevel: 'Administrator',
  data: {
    description: 'Manage item compensation packages',
    options: [
      {
        name: 'create',
        description: 'Create a new item compensation package',
        type: ApplicationCommandOptionType.Subcommand,
        options: [
          {
            name: 'package-id',
            description: 'The name for this package - used as identifier for the package',
            type: ApplicationCommandOptionType.String,
            required: true,
            min_length: 1,
            max_length: 256
          }
        ]
      },
      {
        name: 'delete',
        description: 'Delete an item compensation package',
        type: ApplicationCommandOptionType.Subcommand,
        options: [
          requiredItemPackageACOption,
          {
            name: 'confirm',
            description: 'Confirm the delete action',
            type: ApplicationCommandOptionType.Boolean,
            required: false
          }
        ]
      },
      {
        name: 'items',
        description: 'Manage a package\'s items',
        type: ApplicationCommandOptionType.SubcommandGroup,
        options: [
          {
            name: 'add',
            description: 'Add an item to a package',
            type: ApplicationCommandOptionType.Subcommand,
            options: [
              requiredItemPackageACOption,
              {
                name: 'class-name',
                description: 'The class name of the item to give to the player',
                type: ApplicationCommandOptionType.String,
                required: true,
                min_length: 1,
                max_length: 256
              },
              {
                name: 'quantity',
                description: 'The quantity for this item, default is 1',
                type: ApplicationCommandOptionType.Number,
                required: false,
                min_value: 0.0000,
                max_value: 1000
              },
              {
                name: 'stacked',
                description: 'Spawn items as a stack (only works if item supports to be stacked), default is false',
                type: ApplicationCommandOptionType.Boolean,
                required: false
              },
              {
                name: 'debug',
                description: 'Use debug spawn method to automatically populate specific items',
                type: ApplicationCommandOptionType.Boolean,
                required: false
              }
            ]
          },
          {
            name: 'remove',
            description: 'Remove an item from a package',
            type: ApplicationCommandOptionType.Subcommand,
            options: [
              requiredItemPackageACOption,
              {
                name: 'class-name',
                description: 'The class name of the item to give to the player',
                type: ApplicationCommandOptionType.String,
                required: true,
                min_length: 1,
                max_length: 256
              }
            ]
          },
          {
            name: 'list',
            description: 'List all items in a package',
            type: ApplicationCommandOptionType.Subcommand,
            options: [ requiredItemPackageACOption ]
          },
          {
            name: 'clear',
            description: 'Clear all items in a package',
            type: ApplicationCommandOptionType.Subcommand,
            options: [
              requiredItemPackageACOption,
              {
                name: 'confirm',
                description: 'Confirm the clear action',
                type: ApplicationCommandOptionType.Boolean,
                required: false
              }
            ]
          }
        ]
      }
    ]
  },
  // eslint-disable-next-line sonarjs/cognitive-complexity
  run: async (client, interaction) => {
    // Destructuring and assignments
    const {
      member, options, channel
    } = interaction;
    const { emojis } = client.container;
    const subCommandGroup = options.getSubcommandGroup();
    const subCommand = options.getSubcommand();

    // Deferring our reply
    await interaction.deferReply();

    // Fetch ticket data
    const ticket = await TicketModel.findOne({ channelId: channel.id });
    if (!ticket) {
      interaction.editReply(`${ emojis.error } ${ member }, no ticket is active in this channel - this command has been cancelled`);
      return;
    }

    // Resolve panel
    const ticketPanel = ticketPanels.at(ticket.panelIndex);
    if (!ticketPanel) {
      interaction.editReply(`${ emojis.error } ${ member }, invalid configuration. Please notify the administrators. Configuration for ticket panel no longer exists, please re-deploy the panel and clean/delete old deployment messages.`);
      return;
    }

    // Resolve action
    const { actions } = ticketPanel;
    const action = actions.at(ticket.actionIndex);
    if (!action) {
      interaction.editReply(`${ emojis.error } ${ member }, ticket action with index **\`${ ticket.actionIndex }\`** is not defined, you should probably re-deploy your ticket panel with \`/deploy-ticket-panel\`, please delete channel manually`);
      return;
    }

    // Should NOT be ticket user
    const ticketRolePerms = resolveOverridableConfigKey('_rolePermissions', {
      ticketPanel, action, serverIdentifier: ticket.serverIdentifier
    });
    if (ticket.userId === member.id && !member._roles.some((id) => ticketRolePerms.includes(id))) {
      interaction.editReply(`${ emojis.error } ${ member }, you don't have permission to claim this ticket`);
      return;
    }

    // Make sure cftools/dayz server is linked
    // Definitely required for a command that gives in-game stats
    if (!ticketPanel.server && !ticketPanel.selectServer) {
      interaction.editReply(`${ emojis.error } ${ member }, invalid configuration. Please notify the administrators. Configuration for ticket panel isn't linked to any DayZ/CFTools servers.`);
      return;
    }

    // Resolve server config
    const serverCfg = serverConfig.find((e) => e.NAME && ((e.NAME === ticket.serverIdentifier)
      || (ticketPanel.server && e.NAME === ticketPanel.server.NAME)));

    // Make sure we have a server config
    if (!serverCfg) {
      interaction.editReply(`${ emojis.error } ${ member }, invalid configuration. Please notify the administrators. CFTools/DayZ server configuration for ticket panel can't be resolved.`);
      return;
    }

    if (subCommandGroup) {
      // eslint-disable-next-line sonarjs/no-small-switch
      switch (subCommandGroup) {
        case 'items': {
          if (subCommand === 'add') {
            const itemPackageIdentifier = options.getString(itemPackageOptionIdentifier, true);
            const className = options.getString('class-name', true);
            const quantity = options.getNumber('quantity') ?? 1;
            const stacked = options.getBoolean('stacked') ?? false;
            const debug = options.getBoolean('debug') ?? false;

            // Resolve package
            const itemPackage = await ItemPackageModel.findOne({
              guildId: interaction.guild.id, packageId: itemPackageIdentifier
            });
            if (!itemPackage) {
              interaction.editReply(`${ emojis.error } ${ member }, item package with identifier **\`${ itemPackageIdentifier }\`** doesn't exist, please select/click it from the list of autocompleted options`);
              return;
            }

            // Make sure the item isn't already in package
            if (itemPackage.items.some((e) => e.className === className)) {
              interaction.editReply(`${ emojis.error } ${ member }, item with class **\`${ className }\`** is already in package **\`${ itemPackageIdentifier }\`** - please remove it first`);
              return;
            }

            // Create the item
            const item = {
              className,
              quantity,
              stacked,
              debug
            };

            // Add item to package
            itemPackage.items.push(item);
            await itemPackage.save();

            // Send success message
            interaction.editReply(`${ emojis.success } ${ member }, item with class **\`${ className }\`** has been added to package **\`${ itemPackageIdentifier }\`**`);
          }
          else if (subCommand === 'remove') {
            const itemPackageIdentifier = options.getString(itemPackageOptionIdentifier, true);
            const className = options.getString('class-name', true);

            // Resolve package
            const itemPackage = await ItemPackageModel.findOne({
              guildId: interaction.guild.id, packageId: itemPackageIdentifier
            });
            if (!itemPackage) {
              interaction.editReply(`${ emojis.error } ${ member }, item package with identifier **\`${ itemPackageIdentifier }\`** doesn't exist, please select/click it from the list of autocompleted options`);
              return;
            }

            // Make sure the item is in package
            if (!itemPackage.items.some((e) => e.className === className)) {
              interaction.editReply(`${ emojis.error } ${ member }, item with class **\`${ className }\`** is not in package **\`${ itemPackageIdentifier }\`**`);
              return;
            }

            // Remove item from package
            itemPackage.items = itemPackage.items.filter((e) => e.className !== className);
            await itemPackage.save();

            // Send success message
            interaction.editReply(`${ emojis.success } ${ member }, item with class **\`${ className }\`** has been removed from package **\`${ itemPackageIdentifier }\`**`);
          }
          else if (subCommand === 'list') {
            const itemPackageIdentifier = options.getString(itemPackageOptionIdentifier, true);

            // Resolve package
            const itemPackage = await ItemPackageModel.findOne({
              guildId: interaction.guild.id, packageId: itemPackageIdentifier
            });
            if (!itemPackage) {
              interaction.editReply(`${ emojis.error } ${ member }, item package with identifier **\`${ itemPackageIdentifier }\`** doesn't exist, please select/click it from the list of autocompleted options`);
              return;
            }

            // Make sure the package has items
            if (!itemPackage.items[0]) {
              interaction.editReply(`${ emojis.error } ${ member }, item package **\`${ itemPackageIdentifier }\`** doesn't have any items`);
              return;
            }

            // Send success message
            // eslint-disable-next-line sonarjs/no-nested-template-literals
            interaction.editReply(`${ emojis.success } ${ member }, item package **\`${ itemPackageIdentifier }\`** has the following items:\n\n${ itemPackage.items.map((e) => `**\`${ e.className }\`** x${ e.quantity }`).join('\n') }`);
          }
          else if (subCommand === 'clear') {
            const itemPackageIdentifier = options.getString(itemPackageOptionIdentifier, true);
            const confirm = options.getBoolean('confirm') ?? false;

            // Make sure we have confirmation
            if (confirm !== true) {
              interaction.editReply(`${ emojis.error } ${ member }, you must confirm this action by providing the \`confirm\` option`);
              return;
            }

            // Resolve package
            const itemPackage = await ItemPackageModel.findOne({
              guildId: interaction.guild.id, packageId: itemPackageIdentifier
            });
            if (!itemPackage) {
              interaction.editReply(`${ emojis.error } ${ member }, item package with identifier **\`${ itemPackageIdentifier }\`** doesn't exist, please select/click it from the list of autocompleted options`);
              return;
            }

            // Clear items in package
            itemPackage.items = [];
            await itemPackage.save();

            // Send success message
            interaction.editReply(`${ emojis.success } ${ member }, all items have been removed from package **\`${ itemPackageIdentifier }\`**`);
          }
          else {
            interaction.editReply(`${ emojis.error } ${ member }, invalid sub-command was provided`);
            return;
          }
          break;
        }

        default: {
          interaction.editReply(`${ emojis.error } ${ member }, invalid sub-command group was provided`);
          return;
        }
      }

      return;
    }

    switch (subCommand) {
      case 'create': {
        const packageId = options.getString('package-id', true);
        const exists = await ItemPackageModel.findOne({
          guildId: interaction.guild.id, packageId
        });
        if (exists) {
          interaction.editReply(`${ emojis.error } ${ member }, item package with identifier **\`${ packageId }\`** already exists - this command has been cancelled`);
          return;
        }

        // Create the package
        const itemPackage = new ItemPackageModel({
          guildId: interaction.guild.id,
          packageId,
          items: []
        });
        await itemPackage.save();

        // Send success message
        interaction.editReply(`${ emojis.success } ${ member }, item package with identifier **\`${ packageId }\`** has been created`);
        break;
      }
      case 'delete': {
        const itemPackageIdentifier = options.getString(itemPackageOptionIdentifier, true);
        const confirm = options.getBoolean('confirm') ?? false;

        // Make sure we have confirmation
        if (confirm !== true) {
          interaction.editReply(`${ emojis.error } ${ member }, you must confirm this action by providing the \`confirm\` option`);
          return;
        }

        // Resolve package
        const itemPackage = await ItemPackageModel.findOne({
          guildId: interaction.guild.id, packageId: itemPackageIdentifier
        });
        if (!itemPackage) {
          interaction.editReply(`${ emojis.error } ${ member }, item package with identifier **\`${ itemPackageIdentifier }\`** doesn't exist, please select/click it from the list of autocompleted options`);
          return;
        }

        // Delete the package
        await itemPackage.delete();
        break;
      }
      default: {
        interaction.editReply(`${ emojis.error } ${ member }, invalid sub-command was provided`);
        return;
      }
    }
  }
});


