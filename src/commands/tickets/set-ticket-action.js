const { ChatInputCommand } = require('../../classes/Commands');
const { requiredPanelActionACOption, panelActionACOptionName } = require('../../interactions/autocomplete/panel-action');
const { TicketModel } = require('../../mongo/Ticket');
const ticketPanels = require('../../../config/tickets');
const { resolveOverridableConfigKey } = require('../../modules/ticket-config');
const { setTicketAction } = require('../../modules/tickets');
const { serverConfig } = require('../../modules/cftClient');

module.exports = new ChatInputCommand({
  global: true,
  // API Limits - editing channels can
  // only be done twice every 10 minutes
  cooldown: {
    usages: 2,
    duration: 600,
    type: 'channel'
  },
  data: {
    description: 'Change a ticket\'s action component',
    options: [ requiredPanelActionACOption ]
  },
  // eslint-disable-next-line sonarjs/cognitive-complexity
  run: async (client, interaction) => {
    const {
      member,
      channel,
      options
    } = interaction;
    const { emojis } = client.container;
    const targetPanelActionStr = options.getString(panelActionACOptionName, true);
    const [ panelIndexStr, actionIndexStr ] = targetPanelActionStr.split('-');
    const panelIndex = parseInt(panelIndexStr, 10);
    const actionIndex = parseInt(actionIndexStr, 10);

    // After making sure this is a ticket channel, defer reply without ephemeral
    // this is because non-ticket channel commands SHOULD be ephemeral
    await interaction.deferReply();

    // Fetch ticket data
    const ticket = await TicketModel.findOne({ channelId: channel.id });
    if (!ticket) {
      interaction.editReply({
        content: `${ emojis.error } ${ member }, no ticket is active in this channel - this command has been cancelled`,
        ephemeral: true
      });
      return;
    }

    // Resolve panel
    const ticketPanel = ticketPanels.at(ticket.panelIndex);
    if (!ticketPanel) {
      interaction.editReply({
        content: `${ emojis.error } ${ member }, invalid configuration. Please notify the administrators. Configuration for ticket panel no longer exists, please re-deploy the panel and clean/delete old deployment messages.`,
        ephemeral: true
      });
      return;
    }

    // Resolve action
    const { actions } = ticketPanel;
    const action = actions.at(ticket.actionIndex);
    if (!action) {
      interaction.editReply({
        content: `${ emojis.error } ${ member }, ticket action with index **\`${ ticket.actionIndex }\`** is not defined, you should probably re-deploy your ticket panel with \`/deploy-ticket-panel\`, please delete channel manually`,
        ephemeral: true
      });
      return;
    }

    // Should NOT be ticket user
    const ticketRolePerms = resolveOverridableConfigKey('_rolePermissions', {
      ticketPanel, action, serverIdentifier: ticket.serverIdentifier
    });
    if (ticket.userId === member.id && !member._roles.some((id) => ticketRolePerms.includes(id))) {
      interaction.editReply({
        content: `${ emojis.error } ${ member }, you don't have permission to use this command`,
        ephemeral: true
      });
      return;
    }

    // Is already target
    if (panelIndex === ticket.panelIndex && actionIndex === ticket.actionIndex) {
      interaction.editReply(`${ emojis.error } ${ member }, this ticket is already using specified action - this command has been cancelled`)
        .catch(() => {});
      return;
    }

    // Find targets
    const targetPanel = ticketPanels.at(panelIndex);
    const targetAction = targetPanel.actions.at(actionIndex);

    // First, check if we're dealing with a DayZ/CFTools server
    const serverCfg = ticket.serverIdentifier ? serverConfig.find((e) => e.NAME === ticket.serverIdentifier) : null;
    // Actually. Let's not re-collect servers
    // the file and functionality is still included should it be requested
    // if (ticketPanel.selectServer) {
    //   // Collect server from select menu
    //   interaction.editReply({
    //     content: `${ emojis.wait } <@${ ticket.userId }>, please select the server you're playing on below so that we can change the ticket action to the correct one`,
    //     components: [
    //       new ActionRowBuilder().addComponents(
    //         new StringSelectMenuBuilder()
    //           .setCustomId(`@ticket-change-action-server-select@${ panelIndex }@${ actionIndex }`)
    //           .setPlaceholder('Select a server')
    //           .setDisabled(false)
    //           .setMinValues(1)
    //           .setMaxValues(1)
    //           .setOptions(...serverConfig.map((serverCfg) => new StringSelectMenuOptionBuilder()
    //             .setLabel(serverCfg.NAME)
    //             .setValue(serverCfg.CFTOOLS_SERVER_API_ID)))
    //       )
    //     ],
    //     ephemeral: true
    //   });

    //   // Escape early if select server, continue from there
    //   return;
    // }


    setTicketAction({
      client,
      interaction,
      ticket,
      targetAction,
      serverCfg,
      prevAction: action
    });
  }
});
