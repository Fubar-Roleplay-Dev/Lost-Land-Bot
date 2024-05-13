const {
  handleCFToolsError,
  cftClient,
  serverConfig
} = require('../../modules/cftClient');
const { ChatInputCommand } = require('../../classes/Commands');
const { ServerApiId } = require('cftools-sdk');
const { ApplicationCommandOptionType } = require('discord.js');
const { TicketModel } = require('../../mongo/Ticket');
const ticketPanels = require('../../../config/tickets');
const { getUser } = require('../../mongo/User');
const { resolveOverridableConfigKey } = require('../../modules/ticket-config');

module.exports = new ChatInputCommand({
  global: true,
  permLevel: 'Administrator',
  data: {
    description: 'Give an item to a player that is currently online',
    options: [
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
  // eslint-disable-next-line sonarjs/cognitive-complexity
  run: async (client, interaction) => {
    // Destructuring and assignments
    const {
      member, options, channel
    } = interaction;
    const { emojis } = client.container;
    const className = options.getString('class-name');
    const quantity = options.getNumber('quantity') ?? 1;
    const stacked = options.getBoolean('stacked') ?? false;
    const debug = options.getBoolean('debug') ?? false;

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

    // Fetch
    const user = await getUser(ticket.userId);
    const serverCfg = serverConfig.find((e) => e.NAME && ((e.NAME === ticket.serverIdentifier)
      || (ticketPanel.server && e.NAME === ticketPanel.server.NAME)));

    // Make sure we have a server config
    if (!serverCfg) {
      interaction.editReply(`${ emojis.error } ${ member }, invalid configuration. Please notify the administrators. CFTools/DayZ server configuration for ticket panel can't be resolved.`);
      return;
    }

    // Check session, might not be online
    let targetSession;
    try {
      const sessions = await cftClient
        .listGameSessions({ serverApiId: ServerApiId.of(serverCfg.CFTOOLS_SERVER_API_ID) });
      targetSession = sessions.find((session) => session.steamId.id === user.steamId);
    }
    catch (err) {
      handleCFToolsError(interaction, err);
      return;
    }

    // Make sure player is online
    if (!targetSession) {
      interaction.editReply(`${ emojis.error } ${ member }, ticket user <@${ ticket.userId }> (player) isn't currently online on ${ serverCfg.NAME } - this command has been cancelled`);
      return;
    }

    // Try to perform spawn
    try {
      await cftClient.spawnItem({
        serverApiId: ServerApiId.of(serverCfg.CFTOOLS_SERVER_API_ID),
        session: targetSession,
        itemClass: className,
        quantity,
        stacked,
        debug
      });
    }
    catch (err) {
      handleCFToolsError(interaction, err);
      return;
    }

    // Ok, feedback
    interaction.editReply({ content: `${ emojis.success } ${ member }, spawned **${ quantity }x** \`${ className }\` on **\`${ targetSession.playerName }\`**` });
  }
});


