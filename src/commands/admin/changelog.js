// Importing dependencies
const { ApplicationCommandOptionType } = require('discord.js');
const { ChatInputCommand } = require('../../classes/Commands');
const {
  CL_ACTION_PUBLISH, CL_ACTION_ADD, CL_ACTION_REMOVE, CL_ACTION_EDIT
} = require('../../constants');

const { requiredServerConfigCommandOption, getServerConfigCommandOptionValue } = require('../../modules/cftClient');
const { typeCommandChoices } = require('../../mongo/Changelog');
const {
  addToChangelog, publishChangelog, removeFromChangelog, editChangelogEntry
} = require('../../modules/changelog');

module.exports = new ChatInputCommand({
  global: false,
  permLevel: 'Administrator',
  data: {
    description: 'Manage the server\'s changelog',
    options: [
      // Add to the changelog
      {
        name: CL_ACTION_ADD,
        description: 'Add to the changelog',
        type: ApplicationCommandOptionType.Subcommand,
        options: [
          requiredServerConfigCommandOption,
          {
            name: 'type',
            description: 'Type of addition',
            type: ApplicationCommandOptionType.String,
            required: true,
            choices: typeCommandChoices
          },
          {
            name: 'text',
            description: 'String input',
            type: ApplicationCommandOptionType.String,
            required: true
          }
        ]
      },

      // Remove from the changelog
      {
        name: CL_ACTION_REMOVE,
        description: 'Remove from the changelog',
        type: ApplicationCommandOptionType.Subcommand,
        options: [
          requiredServerConfigCommandOption,
          {
            name: 'type',
            description: 'Type of changelog entry to remove',
            type: ApplicationCommandOptionType.String,
            required: true,
            choices: typeCommandChoices
          },
          {
            name: 'index',
            description: 'The index',
            type: ApplicationCommandOptionType.Integer,
            required: true
          }
        ]
      },

      // Edit a changelog entry
      {
        name: CL_ACTION_EDIT,
        description: 'Make edits to the changelog',
        type: ApplicationCommandOptionType.Subcommand,
        options: [
          requiredServerConfigCommandOption,
          {
            name: 'type',
            description: 'Type to edit',
            type: ApplicationCommandOptionType.String,
            required: true,
            choices: typeCommandChoices
          },
          {
            name: 'index',
            description: 'The index',
            type: ApplicationCommandOptionType.Integer,
            required: true
          },
          {
            name: 'text',
            description: 'Text the old entry should be replaced by',
            type: ApplicationCommandOptionType.String,
            required: true
          }
        ]
      },

      // Publish the changelog
      {
        name: CL_ACTION_PUBLISH,
        description: 'Publish the current changelog',
        type: ApplicationCommandOptionType.Subcommand
      }
    ]
  },
  run: async (client, interaction) => {
    // Destructuring
    const { member, options } = interaction;
    const { emojis } = client.container;

    // Resolving user input
    const action = options._subcommand;
    const serverCfg = getServerConfigCommandOptionValue(interaction);
    const type = options.getString('type');
    const index = options.getInteger('index');
    const text = options.getString('text');

    // Deferring our reply
    await interaction.deferReply({ ephemeral: true });

    // Switch/Case for the requested command option/action
    switch (action) {
      // Handles adding to the changelog
      case CL_ACTION_ADD: {
        try {
          await addToChangelog(serverCfg, type, text);
          interaction.editReply({ content: `${ emojis.success } ${ member }, entry has been added to current changelog for ${ serverCfg.NAME }.` });
          publishChangelog(client, serverCfg);
        }
        catch (err) {
          interaction.editReply({ content: `${ emojis.error } ${ member }, encountered an error while adding to changelog for ${ serverCfg.NAME }. Check below for more information.\n\n||${ err.stack || err }||` });
        }
        break;
      }

      // Handles removing from changelog
      case CL_ACTION_REMOVE: {
        try {
          await removeFromChangelog(serverCfg, type, index);
          interaction.editReply({ content: `${ emojis.success } ${ member }, entry has been removed from current changelog for ${ serverCfg.NAME }.` });
          publishChangelog(client, serverCfg);
        }
        catch (err) {
          interaction.editReply({ content: `${ emojis.error } ${ member }, encountered an error while removing from changelog for ${ serverCfg.NAME }. Check below for more information.\n\n||${ err.stack || err }||` });
        }
        break;
      }

      // Handles editing changelog entries
      case CL_ACTION_EDIT: {
        try {
          await editChangelogEntry(serverCfg, type, index, text);
          interaction.editReply({ content: `${ emojis.success } ${ member }, entry has been edited in current changelog for ${ serverCfg.NAME }.` });
          publishChangelog(client, serverCfg);
        }
        catch (err) {
          interaction.editReply({ content: `${ emojis.error } ${ member }, encountered an error while editing changelog entry for ${ serverCfg.NAME }. Check below for more information.\n\n||${ err.stack || err }||` });
        }
        break;
      }

      // Publish AND default
      case CL_ACTION_PUBLISH:
      default: {
        try {
          // Try to publish the changelog
          await publishChangelog(client, serverCfg);
          interaction.editReply({ content: `${ member } ${ emojis.success }, the changelog for ${ serverCfg.NAME } has been published.` });
        }
        catch (err) {
          // Notify user if error is encountered
          interaction.editReply({ content: `${ emojis.error } ${ member }, something went wrong while publishing the changelog for ${ serverCfg.NAME }. Check error below.\n\n||${ err.stack || err }||` });
        }
        break;
      }
    }
  }
});
