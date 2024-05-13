/* eslint-disable sonarjs/no-duplicate-string */
/* eslint-disable sonarjs/no-nested-template-literals */
const {
  ApplicationCommandOptionType, ChannelType, ActionRowBuilder, ButtonBuilder, ButtonStyle
} = require('discord.js');
const { ChatInputCommand } = require('../../classes/Commands');
const { reactionRoleGroupNameOption, rrGroupOptionIdentifier } = require('../../interactions/autocomplete/reaction-role-group');
const { reactionRolePanelNameOption, rrPanelOptionIdentifier } = require('../../interactions/autocomplete/reaction-role-panel');
const {
  ReactionRolePanel, ReactionRoleRow, getRRPanels, ReactionRole
} = require('../../mongo/ReactionRolePanel');
const { colorResolver } = require('../../util');
const { mongo } = require('mongoose');
const { reactionRoleButtonNameOption, rrButtonOptionIdentifier } = require('../../interactions/autocomplete/reaction-role-button');
const { EMBED_TITLE_MAX_LENGTH, EMBED_DESCRIPTION_MAX_LENGTH } = require('../../constants');
const { getSettingsCache } = require('../../mongo/Settings');

const moveElementInArray = (array, currentIndex, amount, increase = false) => {
  const newPosition = increase ? currentIndex + amount : currentIndex - amount;
  if (newPosition < 0 || newPosition > array.length - (increase ? 0 : 1)) return array;
  const element = array.splice(currentIndex, 1)[0];
  array.splice(newPosition, 0, element);
  return array;
};

const buttonColors = [
  'blurple',
  'green',
  'grey',
  'red'
];

const resolveButtonColor = (color) => color === 'plurple'
  ? ButtonStyle.Primary
  : color === 'green'
    ? ButtonStyle.Success
    : color === 'grey'
      ? ButtonStyle.Secondary
      : color === 'red'
        ? ButtonStyle.Danger
        : ButtonStyle.Primary;

module.exports = new ChatInputCommand({
  global: true,
  permLevel: 'Administrator',
  data: {
    description: 'Manage reaction-roles for your server',
    options: [
      {
        name: 'panels',
        description: 'Manage reaction role panels',
        type: ApplicationCommandOptionType.SubcommandGroup,
        options: [
          {
            name: 'add',
            description: 'Add/create a reaction role panel',
            type: ApplicationCommandOptionType.Subcommand,
            options: [
              {
                name: 'name',
                description: 'Name, used as identifier',
                type: ApplicationCommandOptionType.String,
                required: true
              },
              {
                name: 'overview',
                description: 'Indicates if an overview of available roles should be posted in the embed',
                type: ApplicationCommandOptionType.Boolean,
                required: false
              },
              {
                name: 'title',
                description: 'Title, displayed in the embed',
                type: ApplicationCommandOptionType.String,
                max_length: EMBED_TITLE_MAX_LENGTH,
                required: false
              },
              {
                name: 'message',
                description: 'Message, displayed in the embed',
                type: ApplicationCommandOptionType.String,
                max_length: EMBED_DESCRIPTION_MAX_LENGTH,
                required: false
              },
              {
                name: 'color',
                description: 'The HEX color, displayed in the embed',
                type: ApplicationCommandOptionType.String,
                required: false
              }
            ]
          },
          {
            name: 'set',
            description: 'Change a setting for the selected reaction role panel',
            type: ApplicationCommandOptionType.Subcommand,
            options: [
              reactionRolePanelNameOption,
              {
                name: 'name',
                description: 'The new name',
                type: ApplicationCommandOptionType.String,
                required: false
              },
              {
                name: 'overview',
                description: 'Indicates if an overview of available roles should be posted in the embed',
                type: ApplicationCommandOptionType.Boolean,
                required: false
              },
              {
                name: 'title',
                description: 'The new title',
                type: ApplicationCommandOptionType.String,
                max_length: EMBED_TITLE_MAX_LENGTH,
                required: false
              },
              {
                name: 'message',
                description: 'The new message',
                type: ApplicationCommandOptionType.String,
                max_length: EMBED_DESCRIPTION_MAX_LENGTH,
                required: false
              },
              {
                name: 'color',
                description: 'The new HEX color',
                type: ApplicationCommandOptionType.String,
                required: false
              }
            ]
          },
          {
            name: 'remove',
            description: 'Remove a reaction role panel',
            type: ApplicationCommandOptionType.Subcommand,
            options: [ reactionRolePanelNameOption ]
          },
          {
            name: 'view',
            description: 'View all active role panels',
            type: ApplicationCommandOptionType.Subcommand
          }
        ]
      },
      {
        name: 'groups',
        description: 'Manage reaction role groups/rows',
        type: ApplicationCommandOptionType.SubcommandGroup,
        options: [
          {
            name: 'add',
            description: 'Add/create a reaction role group/row',
            type: ApplicationCommandOptionType.Subcommand,
            options: [
              reactionRolePanelNameOption,
              {
                name: 'name',
                description: 'The name for this role group/row',
                type: ApplicationCommandOptionType.String,
                required: true
              }
            ]
          },
          {
            name: 'remove',
            description: 'Remove a reaction role group/row',
            type: ApplicationCommandOptionType.Subcommand,
            options: [ reactionRolePanelNameOption, reactionRoleGroupNameOption ]
          },
          {
            name: 'rename',
            description: 'Rename a reaction role group/row',
            type: ApplicationCommandOptionType.Subcommand,
            options: [
              reactionRolePanelNameOption,
              reactionRoleGroupNameOption,
              {
                name: 'name',
                description: 'The new name',
                type: ApplicationCommandOptionType.String,
                required: true
              }
            ]
          },
          {
            name: 'move-up',
            description: 'Move a reaction role group/row up',
            type: ApplicationCommandOptionType.Subcommand,
            options: [
              reactionRolePanelNameOption,
              reactionRoleGroupNameOption,
              {
                name: 'amount',
                description: 'How many positions the reaction role group/row should be moved up',
                type: ApplicationCommandOptionType.Integer,
                required: false,
                min_value: 1,
                max_value: 4
              }
            ]
          },
          {
            name: 'move-down',
            description: 'Move a reaction role group/row down',
            type: ApplicationCommandOptionType.Subcommand,
            options: [
              reactionRolePanelNameOption,
              reactionRoleGroupNameOption,
              {
                name: 'amount',
                description: 'How many positions the reaction role group/row should be moved up',
                type: ApplicationCommandOptionType.Integer,
                required: false,
                min_value: 1,
                max_value: 4
              }
            ]
          },
          {
            name: 'view',
            description: 'View all active reaction role groups/rows belonging to the selected panel',
            type: ApplicationCommandOptionType.Subcommand,
            options: [ reactionRolePanelNameOption ]
          }
        ]
      },
      {
        name: 'buttons',
        description: 'Manage reaction role buttons/actions',
        type: ApplicationCommandOptionType.SubcommandGroup,
        options: [
          {
            name: 'add',
            description: 'Add/create a reaction role button/action',
            type: ApplicationCommandOptionType.Subcommand,
            options: [
              reactionRolePanelNameOption,
              reactionRoleGroupNameOption,
              {
                name: 'role',
                description: 'The role given when this reaction role button is clicked',
                type: ApplicationCommandOptionType.Role,
                required: true
              },
              {
                name: 'text',
                description: 'The text displayed on the button, role name if empty',
                type: ApplicationCommandOptionType.String,
                max_length: EMBED_TITLE_MAX_LENGTH,
                required: false
              },
              {
                name: 'description',
                description: 'The description displayed on the panel overview, useful for emoji-only reaction roles',
                type: ApplicationCommandOptionType.String,
                max_length: EMBED_TITLE_MAX_LENGTH,
                required: false
              },
              {
                name: 'color',
                description: 'What color, blurple if empty',
                type: ApplicationCommandOptionType.String,
                required: false,
                choices: buttonColors.map((c) => ({
                  name: c, value: c
                }))
              },
              {
                name: 'emoji',
                description: 'The emoji, none if empty',
                type: ApplicationCommandOptionType.String,
                required: false,
                min_length: 1
              },
              {
                name: 'emoji-only',
                description: 'Hides all text output if enable, invalid if no emoji is provided',
                type: ApplicationCommandOptionType.Boolean,
                required: false
              }
            ]
          },
          {
            name: 'set',
            description: 'Change a setting for the selected reaction role button',
            type: ApplicationCommandOptionType.Subcommand,
            options: [
              reactionRolePanelNameOption,
              reactionRoleGroupNameOption,
              reactionRoleButtonNameOption,
              {
                name: 'role',
                description: 'The new role',
                type: ApplicationCommandOptionType.Role,
                required: false
              },
              {
                name: 'text',
                description: 'The new text',
                type: ApplicationCommandOptionType.String,
                max_length: EMBED_TITLE_MAX_LENGTH,
                required: false
              },
              {
                name: 'description',
                description: 'The new description',
                type: ApplicationCommandOptionType.String,
                max_length: EMBED_TITLE_MAX_LENGTH,
                required: false
              },
              {
                name: 'color',
                description: 'The new color',
                type: ApplicationCommandOptionType.String,
                required: false,
                choices: buttonColors.map((c) => ({
                  name: c, value: c
                }))
              },
              {
                name: 'emoji',
                description: 'The new emoji',
                type: ApplicationCommandOptionType.String,
                required: false,
                min_length: 1
              },
              {
                name: 'emoji-only',
                description: 'Hides all text output if enable, invalid if no emoji is provided',
                type: ApplicationCommandOptionType.Boolean,
                required: false
              }
            ]
          },
          {
            name: 'remove',
            description: 'Remove a reaction role button/action',
            type: ApplicationCommandOptionType.Subcommand,
            options: [
              reactionRolePanelNameOption,
              reactionRoleGroupNameOption,
              reactionRoleButtonNameOption
            ]
          },
          {
            name: 'move-up',
            description: 'Move a reaction role button/action up',
            type: ApplicationCommandOptionType.Subcommand,
            options: [
              reactionRolePanelNameOption,
              reactionRoleGroupNameOption,
              reactionRoleButtonNameOption,
              {
                name: 'amount',
                description: 'How many positions the reaction role button/action should be moved up',
                type: ApplicationCommandOptionType.Integer,
                required: false,
                min_value: 1,
                max_value: 4
              }
            ]
          },
          {
            name: 'move-down',
            description: 'Move a reaction role button/action down',
            type: ApplicationCommandOptionType.Subcommand,
            options: [
              reactionRolePanelNameOption,
              reactionRoleGroupNameOption,
              reactionRoleButtonNameOption,
              {
                name: 'amount',
                description: 'How many positions the reaction role button/action should be moved up',
                type: ApplicationCommandOptionType.Integer,
                required: false,
                min_value: 1,
                max_value: 4
              }
            ]
          },
          {
            name: 'view',
            description: 'View all active reaction role buttons/action belonging to the selected row/group',
            type: ApplicationCommandOptionType.Subcommand,
            options: [ reactionRolePanelNameOption, reactionRoleGroupNameOption ]
          }
        ]
      },
      {
        name: 'deploy',
        description: 'Deploy a reaction role panel to the specified channel',
        type: ApplicationCommandOptionType.Subcommand,
        options: [
          reactionRolePanelNameOption,
          {
            name: 'channel',
            description: 'The channel to deploy the selected panel to',
            type: ApplicationCommandOptionType.Channel,
            channel_types: [ ChannelType.GuildText ],
            required: true
          }
        ]
      }
    ]
  },
  // eslint-disable-next-line sonarjs/cognitive-complexity
  run: async (client, interaction) => {
    const {
      member, guild, options
    } = interaction;
    const { colors, emojis } = client.container;
    const type = options.getSubcommandGroup();
    const action = options.getSubcommand();

    await interaction.deferReply();

    if (type === 'panels') {
      switch (action) {
        // ADD PANEL
        case 'add': {
          const name = options.getString('name');
          const hasEmbedOverview = options.getBoolean('overview') ?? true;
          const title = options.getString('title') ?? 'Role Select';
          const message = options.getString('message') ?? 'Select your roles by clicking the buttons below, this is a toggle';
          const color = options.getString('color') ?? colors.main;

          const newData = new ReactionRolePanel({
            _guildId: guild.id,
            _settingsId: (await getSettingsCache(guild.id)).id,
            name,
            hasEmbedOverview,
            title,
            message,
            color,
            reactionRoleRows: []
          });
          await newData.save();
          interaction.editReply(`${ emojis.success } ${ member }, I have created a new reaction-role panel with name **\`${ name }\`**`);
          break;
        }

        // Update Panel
        case 'set': {
          const panelIdentifier = options.getString(rrPanelOptionIdentifier);
          const rrPanel = await ReactionRolePanel.findById(panelIdentifier).catch(() => {});
          if (!rrPanel) {
            interaction.editReply(`${ emojis.error } ${ member }, I can't find a reaction role panel with that name - this command has been cancelled`);
            return;
          }

          // Declarations
          const name = options.getString('name');
          const hasEmbedOverview = options.getBoolean('overview');
          const title = options.getString('title');
          const message = options.getString('message')?.replace(/\\n/g, '\n');
          const color = options.getString('color');
          const rawNewSettings = {
            name, hasEmbedOverview, title, message, color
          };

          // Make sure at least 1 setting is defined
          if (typeof (
            Object.values(rawNewSettings).find((e) => e !== null && typeof e !== 'undefined')
          ) === 'undefined') {
            interaction.editReply(`${ emojis.error } ${ member }, not a single setting was updated - this command has been cancelled`);
            return;
          }

          // Only keep truthy new values
          const newSettings = Object.fromEntries(
            Object.entries(rawNewSettings)
              .filter(([ k, v ]) => v !== null && typeof v !== 'undefined')
          );

          // Update settings
          for (const [ setting, settingValue ] of Object.entries(newSettings)) {
            rrPanel[setting] = settingValue;
            rrPanel.markModified(setting);
          }
          await rrPanel.save();

          interaction.editReply(`${ emojis.success } ${ member }, I have updated your reaction-role panel with name **\`${ name ?? rrPanel.name }\`**`);
          break;
        }

        // REMOVE PANEL
        case 'remove': {
          const panelIdentifier = options.getString(rrPanelOptionIdentifier);
          const target = await ReactionRolePanel.findById(panelIdentifier).catch(() => {});
          if (!target) {
            interaction.editReply(`${ emojis.error } ${ member }, I can't find a reaction role panel with that name - this command has been cancelled`);
            return;
          }

          // Delete all rows
          for await (const id of target.reactionRoleRows) {
            const rrRow = await ReactionRoleRow.findById(id).catch(() => {});
            if (!rrRow) continue;
            // Delete all reaction roles recursively
            for await (const reactionRoleId of rrRow.reactionRoles) {
              await ReactionRole.findByIdAndDelete(reactionRoleId).catch(() => {});
            }
            await ReactionRoleRow.findByIdAndDelete(id).catch(() => {});
          }

          // Delete panel
          await ReactionRolePanel.deleteOne({ _id: panelIdentifier });
          interaction.editReply(`${ emojis.success } ${ member }, I have deleted the reaction role panel with name **\`${ target.name }\`**`);
          break;
        }

        case 'view':
        default: {
          const allPanels = await getRRPanels(guild.id);
          if (!allPanels[0]) {
            interaction.editReply(`${ emojis.error } ${ member }, you currently don't have any reaction role panels set-up, create one with **\`/reaction-roles panels add\`**`);
          }

          const embed = {
            color: colorResolver(),
            author: {
              name: `Reaction Role Panels for ${ guild.name }`,
              icon_url: guild.iconURL({ dynamic: true })
            },
            description: allPanels.map((panel) => `${ emojis.separator } **__${ panel.name }__** with **${ panel.reactionRoleRows.length }** row${ panel.reactionRoleRows.length !== 1 ? 's' : '' }`).join('\n')
          };
          interaction.editReply({ embeds: [ embed ] });
          break;
        }
      }
    }

    else if (type === 'groups') {
      switch (action) {
        case 'add': {
          const panelIdentifier = options.getString(rrPanelOptionIdentifier);
          const rrPanel = await ReactionRolePanel.findById(panelIdentifier).catch(() => {});
          if (!rrPanel) {
            interaction.editReply(`${ emojis.error } ${ member }, I can't find a reaction role panel with that name - this command has been cancelled`);
            return;
          }

          // Check max
          if (rrPanel.reactionRoleRows.length === 5) {
            interaction.editReply(`${ emojis.error } ${ member }, this reaction role panel already has 5 rows/groups configured, you can't add any more - this command has been cancelled`);
            return;
          }

          const name = options.getString('name');
          const rrRow = await ReactionRoleRow.create({
            name,
            reactionRoles: []
          });
          rrPanel.reactionRoleRows.push(rrRow);
          rrPanel.markModified('reactionRoleRows');
          await rrPanel.save();
          interaction.editReply(`${ emojis.success } ${ member }, I have created a new reaction-role group/row with name **\`${ name }\`**`);
          break;
        }

        case 'remove': {
          const panelIdentifier = options.getString(rrPanelOptionIdentifier);
          const rrPanel = await ReactionRolePanel.findById(panelIdentifier).catch(() => {});
          if (!rrPanel) {
            interaction.editReply(`${ emojis.error } ${ member }, I can't find a reaction role panel with that name - this command has been cancelled`);
            return;
          }

          const groupIdentifier = options.getString(rrGroupOptionIdentifier);
          const rrRow = await ReactionRoleRow.findById(groupIdentifier).catch(() => {});
          if (!rrRow) {
            interaction.editReply(`${ emojis.error } ${ member }, I can't find a reaction role row with that name belonging to the selected panel - this command has been cancelled`);
            return;
          }

          // Remove all reactions roles
          for await (const reactionRoleId of rrRow.reactionRoles) {
            await ReactionRole.findByIdAndDelete(reactionRoleId).catch(() => {});
          }

          // Remove row link from panel
          rrPanel.reactionRoleRows.splice(
            rrPanel.reactionRoleRows.indexOf(new mongo.ObjectId(groupIdentifier)),
            1
          );

          rrPanel.markModified('reactionRoleRows');
          await rrPanel.save();

          await ReactionRoleRow.findByIdAndDelete(groupIdentifier).catch(() => {});
          interaction.editReply(`${ emojis.success } ${ member }, I have deleted the reaction role row with name **\`${ rrRow.name }\`**`);
          break;
        }

        case 'rename': {
          const panelIdentifier = options.getString(rrPanelOptionIdentifier);
          const rrPanel = await ReactionRolePanel.findById(panelIdentifier).catch(() => {});
          if (!rrPanel) {
            interaction.editReply(`${ emojis.error } ${ member }, I can't find a reaction role panel with that name - this command has been cancelled`);
            return;
          }

          const groupIdentifier = options.getString(rrGroupOptionIdentifier);
          const rrRow = await ReactionRoleRow.findById(groupIdentifier).catch(() => {});
          if (!rrRow) {
            interaction.editReply(`${ emojis.error } ${ member }, I can't find a reaction role row with that name belonging to the selected panel - this command has been cancelled`);
            return;
          }

          const newName = options.getString('name');
          rrRow.name = newName;
          rrRow.markModified('name');
          await rrRow.save();

          interaction.editReply(`${ emojis.success } ${ member }, I have renamed the reaction role row to **\`${ newName }\`**`);
          break;
        }


        case 'move-up': {
          // Resolve panel
          const amount = options.getInteger('amount') ?? 1;
          const panelIdentifier = options.getString(rrPanelOptionIdentifier);
          const rrPanel = await ReactionRolePanel.findById(panelIdentifier).catch(() => {});
          if (!rrPanel) {
            interaction.editReply(`${ emojis.error } ${ member }, I can't find a reaction role panel with that name - this command has been cancelled`);
            return;
          }

          // Resolve group/row
          const groupIdentifier = options.getString(rrGroupOptionIdentifier);
          const rrRow = await ReactionRoleRow.findById(groupIdentifier).catch(() => {});
          if (!rrRow) {
            interaction.editReply(`${ emojis.error } ${ member }, I can't find a reaction role row with that name belonging to the selected panel - this command has been cancelled`);
            return;
          }

          const { reactionRoleRows } = rrPanel;
          const groupId = new mongo.ObjectId(groupIdentifier);
          const currIndex = reactionRoleRows.indexOf(groupId);

          // Check can move
          if (reactionRoleRows.length === 0 || reactionRoleRows.length === 1) {
            interaction.editReply(`${ emojis.error } ${ member }, you don't have enough rows/groups configured to be able to move this element - this command has been cancelled`);
            return;
          }

          // Check range
          if (currIndex === 0) {
            interaction.editReply(`${ emojis.error } ${ member }, group/row is already at highest position, it can't move up - this command has been cancelled`);
            return;
          }

          const newPosition = currIndex - amount;
          if (newPosition < 0) {
            interaction.editReply(`${ emojis.error } ${ member }, provided amount of "${ amount }" would bring the position of that group/row to an out of range value, the maximum you can move it up is **${ currIndex }**`);
            return;
          }

          const newArr = moveElementInArray(reactionRoleRows, currIndex, amount);
          rrPanel.reactionRoleRows = newArr;
          rrPanel.markModified('reactionRoleRows');
          await rrPanel.save();

          interaction.editReply(`${ emojis.success } ${ member }, position for **${ rrRow.name }** increased by **${ amount }**`);
          break;
        }

        case 'move-down': {
          // Resolve panel
          const amount = options.getInteger('amount') ?? 1;
          const panelIdentifier = options.getString(rrPanelOptionIdentifier);
          const rrPanel = await ReactionRolePanel.findById(panelIdentifier).catch(() => {});
          if (!rrPanel) {
            interaction.editReply(`${ emojis.error } ${ member }, I can't find a reaction role panel with that name - this command has been cancelled`);
            return;
          }

          // Resolve group/row
          const groupIdentifier = options.getString(rrGroupOptionIdentifier);
          const rrRow = await ReactionRoleRow.findById(groupIdentifier).catch(() => {});
          if (!rrRow) {
            interaction.editReply(`${ emojis.error } ${ member }, I can't find a reaction role row with that name belonging to the selected panel - this command has been cancelled`);
            return;
          }

          const { reactionRoleRows } = rrPanel;
          const groupId = new mongo.ObjectId(groupIdentifier);
          const currIndex = reactionRoleRows.indexOf(groupId);

          // Check can move
          if (reactionRoleRows.length === 0 || reactionRoleRows.length === 1) {
            interaction.editReply(`${ emojis.error } ${ member }, you don't have enough rows/groups configured to be able to move this element - this command has been cancelled`);
            return;
          }

          // Check range
          if (currIndex === reactionRoleRows.length - 1) {
            interaction.editReply(`${ emojis.error } ${ member }, group/row is already at lowest position, it can't move down - this command has been cancelled`);
            return;
          }

          const newPosition = currIndex + amount;
          if (newPosition >= reactionRoleRows.length) {
            interaction.editReply(`${ emojis.error } ${ member }, provided amount of "${ amount }" would bring the position of that group/row to an out of range value, the maximum you can move it down is **${ reactionRoleRows.length - 1 - currIndex }**`);
            return;
          }

          const newArr = moveElementInArray(reactionRoleRows, currIndex, amount, true);
          rrPanel.reactionRoleRows = newArr;
          rrPanel.markModified('reactionRoleRows');
          await rrPanel.save();

          interaction.editReply(`${ emojis.success } ${ member }, position for **${ rrRow.name }** decreased by **${ amount }**`);
          break;
        }

        case 'view':
        default: {
          const panelIdentifier = options.getString(rrPanelOptionIdentifier);
          const rrPanel = await ReactionRolePanel.findById(panelIdentifier).catch(() => {});
          if (!rrPanel) {
            interaction.editReply(`${ emojis.error } ${ member }, I can't find a reaction role panel with that name - this command has been cancelled`);
            return;
          }

          if (!rrPanel.reactionRoleRows[0]) {
            interaction.editReply(`${ emojis.error } ${ member }, this panel currently doesn't have any reaction role groups/rows set-up, create one with **\`/reaction-roles groups add\`**`);
          }

          const allRows = await Promise.all(rrPanel.reactionRoleRows.map(
            (id) => ReactionRoleRow.findById(id).catch(() => {})
          ));

          const embed = {
            color: colorResolver(),
            author: {
              name: `Reaction Role Groups/Rows for panel: ${ rrPanel.name }`,
              icon_url: guild.iconURL({ dynamic: true })
            },
            description: allRows.map((row) => `${ emojis.separator } **__${ row.name }__** with **${ row.reactionRoles.length }** reaction role${ row.reactionRoles.length !== 1 ? 's' : '' }`).join('\n')
          };
          interaction.editReply({ embeds: [ embed ] });
          break;
        }
      }
    }

    else if (type === 'buttons') {
      switch (action) {
        case 'add': {
          const panelIdentifier = options.getString(rrPanelOptionIdentifier);
          const rrPanel = await ReactionRolePanel.findById(panelIdentifier).catch(() => {});
          if (!rrPanel) {
            interaction.editReply(`${ emojis.error } ${ member }, I can't find a reaction role panel with that name - this command has been cancelled`);
            return;
          }

          const groupIdentifier = options.getString(rrGroupOptionIdentifier);
          const rrRow = await ReactionRoleRow.findById(groupIdentifier).catch(() => {});
          if (!rrRow) {
            interaction.editReply(`${ emojis.error } ${ member }, I can't find a reaction role row with that name belonging to the selected panel - this command has been cancelled`);
            return;
          }

          // Check max
          if (rrRow.reactionRoles.length === 5) {
            interaction.editReply(`${ emojis.error } ${ member }, this reaction role row already has 5 buttons configured, you can't add any more - this command has been cancelled`);
            return;
          }

          // Get options
          const role = options.getRole('role');
          const text = options.getString('text') ?? null;
          const description = options.getString('description') ?? null;
          const color = options.getString('color') ?? null;
          const emoji = options.getString('emoji') ?? null;
          const emojiOnly = options.getBoolean('emoji-only') ?? false;

          // Check emojiOnly constraints
          if (emojiOnly === true && !emoji) {
            interaction.editReply(`${ emojis.error } ${ member }, the \`emoji-only\` value for this reaction role was set to \`true\`, but no emoji was provided - this command has been cancelled`);
            return;
          }

          // Check role position
          if (role.position >= guild.members.me.roles.highest?.position) {
            interaction.editReply({
              content: `${ emojis.error } ${ member }, the role ${ role } has a higher or equal position in the role list as my highest role; This means I can't give the role to members. Either move my highest role up the role-list or provide a role with a lower position instead - this command has been cancelled`,
              disableMentions: true
            });
            return;
          }

          // Check group has role
          const allButtonRoles = await Promise.all(
            rrRow.reactionRoles
              .map(async (id) => {
                const rrButton = await ReactionRole.findById(id).catch(() => {});
                const role = guild.roles.cache.get(rrButton.roleId);
                return role ?? null;
              })
              .filter((e) => e) // Truthy values only
            // Filters out roles that don't exist anymore
          );
          if (allButtonRoles.find((r) => r.id === role.id)) {
            interaction.editReply({
              content: `${ emojis.error } ${ member }, this reaction role group/row already has a button for role ${ role } - this command has been cancelled`,
              disableMentions: true
            });
            return;
          }

          // Create
          const rrButton = await ReactionRole.create({
            text,
            description,
            color,
            emoji,
            roleId: role.id,
            emojiOnly
          });
          rrRow.reactionRoles.push(rrButton);
          rrRow.markModified('reactionRoles');
          await rrRow.save();
          interaction.editReply({
            content: `${ emojis.success } ${ member }, I have created a new reaction-role button for role ${ role }`,
            disableMentions: true
          });
          break;
        }

        // Update Button
        case 'set': {
          const panelIdentifier = options.getString(rrPanelOptionIdentifier);
          const rrPanel = await ReactionRolePanel.findById(panelIdentifier).catch(() => {});
          if (!rrPanel) {
            interaction.editReply(`${ emojis.error } ${ member }, I can't find a reaction role panel with that name - this command has been cancelled`);
            return;
          }

          const groupIdentifier = options.getString(rrGroupOptionIdentifier);
          const rrRow = await ReactionRoleRow.findById(groupIdentifier).catch(() => {});
          if (!rrRow) {
            interaction.editReply(`${ emojis.error } ${ member }, I can't find a reaction role row with that name belonging to the selected panel - this command has been cancelled`);
            return;
          }

          const actionIdentifier = options.getString(rrButtonOptionIdentifier);
          const rrButton = await ReactionRole.findById(actionIdentifier).catch(() => {});
          if (!rrButton) {
            interaction.editReply(`${ emojis.error } ${ member }, I can't find a reaction role button with that role belonging to the selected row/group - this command has been cancelled`);
            return;
          }

          // Get options
          const role = options.getRole('role') ?? null;
          const text = options.getString('text') ?? null;
          const description = options.getString('description') ?? null;
          const color = options.getString('color') ?? null;
          const emoji = options.getString('emoji') ?? null;
          const emojiOnly = options.getBoolean('emoji-only') ?? null;
          const rawNewSettings = {
            roleId: role?.id ?? null, text, description, color, emoji, emojiOnly
          };

          // Check emojiOnly constraints
          if (emojiOnly === true && (!emoji && !rrButton.emoji)) {
            interaction.editReply(`${ emojis.error } ${ member }, the \`emoji-only\` value for this reaction role was set to \`true\`, but no emoji was provided or is active in button - this command has been cancelled`);
            return;
          }

          // Check role position
          if (role && role.position >= guild.members.me.roles.highest?.position) {
            interaction.editReply({
              content: `${ emojis.error } ${ member }, the role ${ role } has a higher or equal position in the role list as my highest role; This means I can't give the role to members. Either move my highest role up the role-list or provide a role with a lower position instead - this command has been cancelled`,
              disableMentions: true
            });
            return;
          }

          // Make sure at least 1 setting is defined
          if (typeof (
            Object.values(rawNewSettings).find((e) => e !== null && typeof e !== 'undefined')
          ) === 'undefined') {
            interaction.editReply(`${ emojis.error } ${ member }, not a single setting was updated - this command has been cancelled`);
            return;
          }

          // Only keep truthy new values
          const newSettings = Object.fromEntries(
            Object.entries(rawNewSettings)
              .filter(([ k, v ]) => v !== null && typeof v !== 'undefined')
          );

          // Update settings
          for (const [ setting, settingValue ] of Object.entries(newSettings)) {
            rrButton[setting] = settingValue;
            rrButton.markModified(setting);
          }
          await rrButton.save();

          interaction.editReply(`${ emojis.success } ${ member }, I have updated your reaction-role button`);
          break;
        }

        case 'remove': {
          const panelIdentifier = options.getString(rrPanelOptionIdentifier);
          const rrPanel = await ReactionRolePanel.findById(panelIdentifier).catch(() => {});
          if (!rrPanel) {
            interaction.editReply(`${ emojis.error } ${ member }, I can't find a reaction role panel with that name - this command has been cancelled`);
            return;
          }

          const groupIdentifier = options.getString(rrGroupOptionIdentifier);
          const rrRow = await ReactionRoleRow.findById(groupIdentifier).catch(() => {});
          if (!rrRow) {
            interaction.editReply(`${ emojis.error } ${ member }, I can't find a reaction role row with that name belonging to the selected panel - this command has been cancelled`);
            return;
          }

          const actionIdentifier = options.getString(rrButtonOptionIdentifier);
          const rrButton = await ReactionRole.findById(actionIdentifier).catch(() => {});
          if (!rrButton) {
            interaction.editReply(`${ emojis.error } ${ member }, I can't find a reaction role button with that role belonging to the selected row/group - this command has been cancelled`);
            return;
          }

          // Remove row link from panel
          rrRow.reactionRoles.splice(
            rrRow.reactionRoles.indexOf(new mongo.ObjectId(actionIdentifier)),
            1
          );
          rrRow.markModified('reactionRoles');
          await rrRow.save();

          await ReactionRole.findByIdAndDelete(actionIdentifier).catch(() => {});
          interaction.editReply({
            content: `${ emojis.success } ${ member }, I have deleted the reaction role action with role ${ guild.roles.cache.get(rrButton.roleId) ?? '<deleted role>' }`,
            disableMentions: true
          });
          break;
        }

        case 'move-up': {
          // Resolve panel
          const amount = options.getInteger('amount') ?? 1;
          const panelIdentifier = options.getString(rrPanelOptionIdentifier);
          const rrPanel = await ReactionRolePanel.findById(panelIdentifier).catch(() => {});
          if (!rrPanel) {
            interaction.editReply(`${ emojis.error } ${ member }, I can't find a reaction role panel with that name - this command has been cancelled`);
            return;
          }

          // Resolve group/row
          const groupIdentifier = options.getString(rrGroupOptionIdentifier);
          const rrRow = await ReactionRoleRow.findById(groupIdentifier).catch(() => {});
          if (!rrRow) {
            interaction.editReply(`${ emojis.error } ${ member }, I can't find a reaction role row with that name belonging to the selected panel - this command has been cancelled`);
            return;
          }

          const actionIdentifier = options.getString(rrButtonOptionIdentifier);
          const rrButton = await ReactionRole.findById(actionIdentifier).catch(() => {});
          if (!rrButton) {
            interaction.editReply(`${ emojis.error } ${ member }, I can't find a reaction role button with that role belonging to the selected row/group - this command has been cancelled`);
            return;
          }

          const { reactionRoles } = rrRow;
          const actionId = new mongo.ObjectId(actionIdentifier);
          const currIndex = reactionRoles.indexOf(actionId);

          // Check can move
          if (reactionRoles.length === 0 || reactionRoles.length === 1) {
            interaction.editReply(`${ emojis.error } ${ member }, you don't have enough buttons/actions configured to be able to move this element - this command has been cancelled`);
            return;
          }

          // Check range
          if (currIndex === 0) {
            interaction.editReply(`${ emojis.error } ${ member }, button/action is already at highest position, it can't move up - this command has been cancelled`);
            return;
          }

          const newPosition = currIndex - amount;
          if (newPosition < 0) {
            interaction.editReply(`${ emojis.error } ${ member }, provided amount of "${ amount }" would bring the position of that button/action to an out of range value, the maximum you can move it up is **${ currIndex }**`);
            return;
          }

          const newArr = moveElementInArray(reactionRoles, currIndex, amount);
          rrRow.reactionRoles = newArr;
          rrRow.markModified('reactionRoles');
          await rrRow.save();

          interaction.editReply(`${ emojis.success } ${ member }, position for **${ guild.roles.cache.get(rrButton.roleId) ?? `<deleted role ${ rrButton.roleId }>` }** increased by **${ amount }**`);
          break;
        }

        case 'move-down': {
          // Resolve panel
          const amount = options.getInteger('amount') ?? 1;
          const panelIdentifier = options.getString(rrPanelOptionIdentifier);
          const rrPanel = await ReactionRolePanel.findById(panelIdentifier).catch(() => {});
          if (!rrPanel) {
            interaction.editReply(`${ emojis.error } ${ member }, I can't find a reaction role panel with that name - this command has been cancelled`);
            return;
          }

          // Resolve button/action
          const groupIdentifier = options.getString(rrGroupOptionIdentifier);
          const rrRow = await ReactionRoleRow.findById(groupIdentifier).catch(() => {});
          if (!rrRow) {
            interaction.editReply(`${ emojis.error } ${ member }, I can't find a reaction role row with that name belonging to the selected panel - this command has been cancelled`);
            return;
          }

          const actionIdentifier = options.getString(rrButtonOptionIdentifier);
          const rrButton = await ReactionRole.findById(actionIdentifier).catch(() => {});
          if (!rrButton) {
            interaction.editReply(`${ emojis.error } ${ member }, I can't find a reaction role button with that role belonging to the selected row/group - this command has been cancelled`);
            return;
          }

          const { reactionRoles } = rrRow;
          const actionId = new mongo.ObjectId(actionIdentifier);
          const currIndex = reactionRoles.indexOf(actionId);

          // Check can move
          if (reactionRoles.length === 0 || reactionRoles.length === 1) {
            interaction.editReply(`${ emojis.error } ${ member }, you don't have enough buttons/actions configured to be able to move this element - this command has been cancelled`);
            return;
          }

          // Check range
          if (currIndex === reactionRoles.length - 1) {
            interaction.editReply(`${ emojis.error } ${ member }, button/action is already at lowest position, it can't move down - this command has been cancelled`);
            return;
          }

          const newPosition = currIndex + amount;
          if (newPosition >= reactionRoles.length) {
            interaction.editReply(`${ emojis.error } ${ member }, provided amount of "${ amount }" would bring the position of that button/action to an out of range value, the maximum you can move it down is **${ reactionRoles.length - 1 - currIndex }**`);
            return;
          }

          const newArr = moveElementInArray(reactionRoles, currIndex, amount, true);
          rrRow.reactionRoles = newArr;
          rrRow.markModified('reactionRoles');
          await rrRow.save();

          interaction.editReply(`${ emojis.success } ${ member }, position for **${ guild.roles.cache.get(rrButton.roleId) ?? `<deleted role ${ rrButton.roleId }>` }** decreased by **${ amount }**`);
          break;
        }

        case 'view':
        default: {
          const panelIdentifier = options.getString(rrPanelOptionIdentifier);
          const rrPanel = await ReactionRolePanel.findById(panelIdentifier).catch(() => {});
          if (!rrPanel) {
            interaction.editReply(`${ emojis.error } ${ member }, I can't find a reaction role panel with that name - this command has been cancelled`);
            return;
          }

          const groupIdentifier = options.getString(rrGroupOptionIdentifier);
          const rrRow = await ReactionRoleRow.findById(groupIdentifier).catch(() => {});
          if (!rrRow) {
            interaction.editReply(`${ emojis.error } ${ member }, I can't find a reaction role row with that name belonging to the selected panel - this command has been cancelled`);
            return;
          }

          if (!rrRow.reactionRoles[0]) {
            interaction.editReply(`${ emojis.error } ${ member }, this row/group currently doesn't have any reaction role actions/buttons set-up, create one with **\`/reaction-roles buttons add\`**`);
          }

          const allButtonRoles = await Promise.all(
            rrRow.reactionRoles
              .map(async (id) => {
                const rrButton = await ReactionRole.findById(id).catch(() => {});
                const role = guild.roles.cache.get(rrButton.roleId);
                return role
                  ?? { id: rrButton.roleId };
              })
            // Filters out roles that don't exist anymore
          );

          const embed = {
            color: colorResolver(),
            author: {
              name: `Reaction Role Buttons/Actions for group: ${ rrRow.name }`,
              icon_url: guild.iconURL({ dynamic: true })
            },
            description: allButtonRoles.map((role) => `${ emojis.separator } **__${ role.name ? role : `<deleted role ${ role.id }>` }__**`).join('\n')
          };
          interaction.editReply({ embeds: [ embed ] });
          break;
        }
      }
    }

    else if (action === 'deploy') {
      const panelIdentifier = options.getString(rrPanelOptionIdentifier);
      const rrPanel = await ReactionRolePanel.findById(panelIdentifier).catch(() => {});
      if (!rrPanel) {
        interaction.editReply(`${ emojis.error } ${ member }, I can't find a reaction role panel with that name - this command has been cancelled`);
        return;
      }

      if (!rrPanel.reactionRoleRows[0]) {
        interaction.editReply(`${ emojis.error } ${ member }, this panel doesn't have any groups/rows configured, add one first before deploying with **\`/reaction-roles groups add\`** - this command has been cancelled`);
        return;
      }

      const embed = {
        color: colorResolver(rrPanel.color),
        title: rrPanel.title,
        description: rrPanel.message,
        fields: []
      };

      const ctx = {
        content: undefined,
        components: [],
        embeds: [ embed ]
      };

      const allRows = (await Promise.all(
        rrPanel.reactionRoleRows
          .map(async (id) => await ReactionRoleRow.findById(id).catch(() => {}))
      )).filter((rrRow) => rrRow?.reactionRoles?.length >= 1);

      for await (const { name, reactionRoles } of allRows) {
        // Resolve data
        const allButtonRoles = await Promise.all(
          (await Promise.all(reactionRoles
            .map(async (id) => {
              const rrButton = await ReactionRole.findById(id).catch(() => {});
              const role = guild.roles.cache.get(rrButton.roleId);
              return {
                ...rrButton._doc, role
              };
            })))
            // Filters out roles that don't exist anymore
            .filter((e) => e.role)
        );

        // Continue if invalid
        if (allButtonRoles.length === 0 || allButtonRoles.length > 5) continue;

        // Build row
        ctx.components.push(
          new ActionRowBuilder().addComponents(
            await Promise.all(allButtonRoles.map(
              async (br) => {
                let text = br.text;
                if (text) {
                  const match = text.match(/<[@&#]+(\d+)>/);
                  if (match && match[0] && match[1]) {
                    const [ tag, id ] = match;
                    const ref = guild.roles.cache.get(id)
                    ?? guild.channels.cache.get(id)
                    ?? guild.members.cache.get(id)
                    ?? await guild.members.fetch(id);
                    if (ref) text = text.replaceAll(tag, ref.name ?? ref.user?.username);
                  }
                }
                const button = new ButtonBuilder()
                  .setCustomId(`rr@${ br._id }`)
                  .setStyle(resolveButtonColor(br.color));
                if (!br.emojiOnly) button.setLabel(text ?? br.role.name);
                if (br.emoji) button.setEmoji(br.emoji ?? null);
                return button;
              }
            ))
          )
        );

        // Display in embed
        if (rrPanel.hasEmbedOverview) embed.fields.push({
          name: '__' + name + '__',
          value: allButtonRoles.map(
            (br) => `${ br.emoji ? `${ br.emoji } ` : '' }**${ br.text ?? br.role }**${ br.description ? `\n${ br.description }\n` : '' }`
          ).join('\n'),
          inline: false
        });
      }

      // Check data availability
      if (!ctx.components[0]) {
        interaction.editReply(`${ emojis.error } ${ member }, no reaction roles available for this panel, this means all active reaction-roles are invalid/deleted roles`);
        return;
      }

      // Try to send
      const channel = options.getChannel('channel');
      try {
        await channel.send(ctx);
      }
      catch (err) {
        interaction.editReply(`${ emojis.error } ${ member }, error encountered while deploying reaction role panel: ${ err.message }`);
        return;
      }

      // Ok
      interaction.editReply(`${ emojis.success } ${ member }, reaction role panel **${ rrPanel.name }** was deployed to ${ channel }`);
    }
  }
});
