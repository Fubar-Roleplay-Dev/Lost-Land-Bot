const { ApplicationCommandOptionType } = require('discord.js');
const { ChatInputCommand } = require('../../classes/Commands');
const { TicketModel } = require('../../mongo/Ticket');
const ticketPanels = require('../../../config/tickets');
const { ticketLog } = require('../../modules/ticket-logging');

module.exports = new ChatInputCommand({
  global: true,
  data: {
    description: 'Add a role to this ticket',
    options: [
      {
        name: 'role',
        description: 'The role to add to this ticket',
        type: ApplicationCommandOptionType.Role,
        required: true
      }
    ]
  },
  run: async (client, interaction) => {
    // Declarations
    const {
      member, channel,
      options, guild
    } = interaction;
    const { emojis } = client.container;
    const role = options.getRole('role');

    // Defer our reply
    await interaction.deferReply({ ephemeral: true });

    // Fetch ticket data
    const ticket = await TicketModel.findOne({ channelId: channel.id });
    if (!ticket) {
      interaction.editReply(`${ emojis.error } ${ member }, no ticket is active in this channel - this command has been cancelled`);
      return;
    }

    // Check is claimed
    if (!ticket.claimed) {
      interaction.editReply(`${ emojis.error } ${ member }, this command can only be used on claimed tickets - this command has been cancelled`);
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
      interaction.editReply(`${ emojis.error } ${ member }, ticket action with index **\`${ ticket.actionIndex }\`** is not defined, you should probably re-deploy your ticket panel with \`/deploy-ticket-panel\``);
      return;
    }

    // Add permissions
    try {
      await channel.permissionOverwrites.create(role.id, {
        'ViewChannel': true,
        'SendMessages': true,
        'EmbedLinks': true,
        'AttachFiles': true,
        'ReadMessageHistory': true
      });
    }
    catch (err) {
      interaction.editReply({
        content: `${ emojis.error } ${ member }, couldn't add role ${ role } to ticket: ${ err.message }`,
        disableMentions: true
      });
      return;
    }

    // Member feedback
    interaction.editReply({
      content: `${ emojis.success } ${ member }, I have added ${ role } to this ticket`,
      disableMentions: true
    });

    // Ticket feedback
    channel
      .send(`${ emojis.success } <@${ ticket.userId }>, ${ role } was added to this ticket`)
      .catch(() => { /* void */ });

    // Ticket logging
    ticketLog({
      ticket,
      action,
      ticketPanel,
      actionEmoji: '🌐',
      actionText: 'Added a role~',
      guild,
      member,
      fields: [
        {
          name: '🙋 Role',
          value: `${ role }`
        }
      ]
    });
  }
});
