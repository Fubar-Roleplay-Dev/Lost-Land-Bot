const {
  ActionRowBuilder,
  PermissionFlagsBits,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder
} = require('discord.js');
const { ComponentCommand } = require('../../../classes/Commands');
const { getUser } = require('../../../mongo/User');
const ticketPanels = require('../../../../config/tickets');
const { serverConfig } = require('../../../modules/cftClient');
const { promptModal } = require('../../../modules/ticket-modal');

module.exports = new ComponentCommand({
  clientPerms: [
    PermissionFlagsBits.ViewChannel,
    PermissionFlagsBits.ReadMessageHistory,
    PermissionFlagsBits.SendMessages,
    PermissionFlagsBits.ManageChannels,
    PermissionFlagsBits.EmbedLinks,
    PermissionFlagsBits.AttachFiles,
    PermissionFlagsBits.ManageMessages
  ],
  // eslint-disable-next-line sonarjs/cognitive-complexity
  run: async (client, interaction) => {
    // Destructure from interaction and client
    const { member, customId } = interaction;
    const { emojis } = client.container;

    const [
      , // @
      , // action
      panelIndex,
      actionIndex
    ] = customId.split('@');

    const ticketPanel = ticketPanels.at(panelIndex);
    if (!ticketPanel) {
      interaction.reply({
        content: `${ emojis.error } ${ member }, invalid configuration. Please notify the administrators. Configuration for ticket panel no longer exists, please re-deploy the panel and clean/delete old deployment messages.`,
        ephemeral: true
      });
      return;
    }

    // Resolve action
    const { actions } = ticketPanel;
    const action = actions.at(Number(actionIndex));
    if (!action) {
      interaction.reply({
        content: `${ emojis.error } ${ member }, ticket action with index **\`${ actionIndex }\`** is not defined, you should probably re-deploy your ticket panel with \`/deploy-ticket-panel\``,
        ephemeral: true
      });
      return;
    }

    // Resolve user
    const user = await getUser(member.id);
    if (!user) {
      interaction.reply({
        content: `${ emojis.error } ${ member }, service temporarily unavailable - please try again later`,
        ephemeral: true
      });
      return;
    }

    // First, check if we're dealing with a DayZ/CFTools server
    let serverApiId = null;
    if (ticketPanel.server) serverApiId = ticketPanel.server.CFTOOLS_SERVER_API_ID;
    if (ticketPanel.selectServer) {
      // Collect server from select menu
      interaction.reply({
        content: `${ emojis.wait } ${ member }, please select the server you're playing on below`,
        components: [
          new ActionRowBuilder().addComponents(
            new StringSelectMenuBuilder()
              .setCustomId(`@ticket-server-select@${ panelIndex }@${ actionIndex }`)
              .setPlaceholder('Select a server')
              .setDisabled(false)
              .setMinValues(1)
              .setMaxValues(1)
              .setOptions(...serverConfig.map((serverCfg) => new StringSelectMenuOptionBuilder()
                .setLabel(serverCfg.NAME)
                .setValue(serverCfg.CFTOOLS_SERVER_API_ID)))
          )
        ],
        ephemeral: true
      });

      // Escape early if select server, continue from there
      return;
    }

    // Prompt the modal
    promptModal({
      action,
      actionIndex,
      interaction,
      panelIndex,
      serverApiId,
      ticketPanel,
      user
    });
  }
});
