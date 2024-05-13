const { ComponentCommand } = require('../../classes/Commands');
const ticketPanels = require('../../../config/tickets');
const { getUser } = require('../../mongo/User');
const { resolveOverridableConfigKey } = require('../../modules/ticket-config');
const { serverConfig } = require('../../modules/cftClient');
const { TicketModel } = require('../../mongo/Ticket');
const { setTicketAction } = require('../../modules/tickets');

module.exports = new ComponentCommand({ run: async (client, interaction) => {
  const { emojis } = client.container;
  const {
    member, guild, customId,
    channelId
  } = interaction;
  const selectTargetValue = interaction.values[0];
  const serverApiId = selectTargetValue;

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

  const serverCfg = serverConfig.find((e) => e.CFTOOLS_SERVER_API_ID === serverApiId);
  if (!serverCfg) {
    interaction.reply({
      content: `${ emojis.error } ${ member }, invalid configuration. Please notify the administrators. Specified server can't be resolved.`,
      ephemeral: true
    });
    return;
  }

  // We definitely need this to be visible by ticket user
  await interaction.deferReply({ ephemeral: false });

  // Resolve and check category
  const categoryId = resolveOverridableConfigKey('_categoryOpenTicketId', {
    ticketPanel,
    action,
    serverIdentifier: serverCfg.NAME
  });
  const category = await guild.channels.fetch(categoryId).catch(() => {});
  if (!category) {
    interaction.editReply({
      content: `${ emojis.error } ${ member }, invalid configuration. Please notify the administrators. Specified category (\`${ categoryId }\`) to create ticket channel doesn't exist.`,
      ephemeral: true
    });
    return;
  }

  // Resolve ticket
  const ticket = await TicketModel.findOne({ channelId: channelId });
  if (!ticket) {
    interaction.editReply({
      content: `${ emojis.error } ${ member }, no ticket is active in this channel - this action has been cancelled`,
      ephemeral: true
    });
    return;
  }

  // Resolve user
  const user = await getUser(member.id);
  if (!user) {
    interaction.editReply({
      content: `${ emojis.error } ${ member }, service temporarily unavailable - please try again later`,
      ephemeral: true
    });
    return;
  }

  setTicketAction({
    client,
    interaction,
    ticket,
    targetAction: action,
    serverCfg,
    prevAction: action,
    onFinish: () => {
      interaction.deleteReply().catch();
    }
  });
} });
