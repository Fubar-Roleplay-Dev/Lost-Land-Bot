const {
  EmbedBuilder,
  ApplicationCommandOptionType,
  ChannelType,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder
} = require('discord.js');
const { ChatInputCommand } = require('../../classes/Commands');
const { applicationPanelOption, applicationPanelOptionName } = require('../../interactions/autocomplete/application-panel');
const {
  clientConfig, resolveButtonName, replaceMessageTags, colorResolver
} = require('../../util');
const logger = require('@mirasaki/logger');
const { applicationPanels } = clientConfig;

module.exports = new ChatInputCommand({
  data: {
    description: 'Deploy an application panel',
    options: [
      applicationPanelOption,
      {
        name: 'channel',
        description: 'The channel to deploy the application panel to',
        type: ApplicationCommandOptionType.Channel,
        required: true,
        channel_types: [ ChannelType.GuildText, ChannelType.GuildAnnouncement ]
      }
    ]
  },
  run: async (client, interaction) => {
    const { options } = interaction;
    const channel = options.getChannel('channel', true);
    const applicationPanelIndStr = options.getString(applicationPanelOptionName, true);
    const applicationPanelInd = parseInt(applicationPanelIndStr);
    const applicationPanel = applicationPanels[applicationPanelInd];
    if (!applicationPanel) {
      interaction.reply({
        content: 'Invalid application panel - please select/click a value from the autocomplete menu',
        ephemeral: true
      });
      return;
    }

    const {
      name,
      options: applicationPanelOptions,
      embed: applicationPanelEmbedOptions
    } = applicationPanel;

    const applicationPanelEmbed = new EmbedBuilder(applicationPanelEmbedOptions);
    const roles = applicationPanelOptions.map((option) => {
      return `• ${ resolveButtonName({
        buttonEmoji: option.emoji,
        buttonText: option.name
      }) }${
        option.description ? ` - ${ option.description }` : ''
      }`;
    }).join('\n');
    applicationPanelEmbed.setColor(colorResolver(applicationPanelEmbedOptions.color));
    applicationPanelEmbed.setDescription(replaceMessageTags(applicationPanelEmbedOptions.description, { roles }));
    applicationPanelEmbed.setTitle(applicationPanelEmbed.data.title ?? name);

    await interaction.deferReply({ ephemeral: true });

    try {
      await channel.send({
        embeds: [ applicationPanelEmbed ],
        components: [
          new ActionRowBuilder().addComponents(
            new StringSelectMenuBuilder()
              .setCustomId(`@application-panel-option@${ applicationPanelInd }`)
              .setPlaceholder('Select an option')
              .setDisabled(false)
              .setMinValues(1)
              .setMaxValues(1)
              .setOptions(
                ...applicationPanelOptions.map((option, ind) => new StringSelectMenuOptionBuilder()
                  .setDescription(option.description)
                  .setEmoji(option.emoji)
                  .setLabel(option.name)
                  .setValue(`${ ind }`))
              )
          )
        ]
      });
    }
    catch (err) {
      logger.syserr('Error encountered while deploying application panel');
      logger.printErr(err);
      interaction.editReply({
        content: `Failed to deploy application panel: ${ err }`,
        ephemeral: true
      });
      return;
    }


    interaction.editReply({
      content: `Successfully deployed application panel to ${ channel }`,
      ephemeral: true
    });
  }
});
