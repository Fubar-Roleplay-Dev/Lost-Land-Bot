const { colorResolver } = require('../util');
const { resolveOverridableConfigKey } = require('./ticket-config');

const ticketLog = ({
  ticket,
  action,
  ticketPanel,
  guild,
  member,
  actionEmoji,
  actionText,
  fields = [],
  files = []
}) => {
  const appendATicketText = !actionText.endsWith('~');
  if (!appendATicketText) actionText = actionText.slice(0, -1);

  const loggingChannelId = resolveOverridableConfigKey('_loggingChannelId', {
    ticketPanel,
    action,
    serverIdentifier: ticket.serverIdentifier
  });
  const buttonName = `${ action.buttonEmoji ?? '' }${
    action.buttonText ? `${ action.buttonEmoji ? ' ' : '' }${ action.buttonText }` : ''
  }`.trim();
  if (loggingChannelId) {
    const logChannel = guild.channels.cache.get(loggingChannelId);
    if (!logChannel) return;
    const createdEnoch = Math.floor(ticket.createdAt.getTime() / 1000);
    const embed = {
      color: colorResolver(ticketPanel.embed.color),
      description: `### ${ actionEmoji } ${ member } ${ actionText.toLowerCase() }${ appendATicketText ? ' a ticket' : '' } in <#${ ticket.channelId }>`,
      fields: [
        {
          name: '🎫 Panel',
          value: `${ ticketPanel.embed.title ?? ticketPanel.identifier }`,
          inline: true
        },
        {
          name: '\u200b',
          value: '\u200b',
          inline: true
        },
        {
          name: 'Opened',
          value: `<t:${ createdEnoch }> (<t:${ createdEnoch }:R>)`,
          inline: true
        },

        {
          name: '🆕 Action',
          value: `${ actionEmoji } ${ actionText }`,
          inline: true
        },
        {
          name: '🆔 Button',
          value: buttonName,
          inline: true
        },
        {
          name: 'Executed By',
          value: `${ member }`,
          inline: true
        },

        {
          name: '🪪 User',
          value: `<@${ ticket.userId }>`,
          inline: true
        },
        {
          name: '#️⃣ Channel',
          value: `<#${ ticket.channelId }>`,
          inline: true
        },
        {
          name: '🙋 Handler',
          value: ticket.claimed ? `<@${ ticket.claimedBy }>` : 'None',
          inline: true
        },

        ...fields
      ]
    };
    logChannel.send({
      embeds: [ embed ], files
    }).catch(() => {
      // Omit files, transcript might be too large
      logChannel.send({ embeds: [ embed ] }).catch(() => { /* Void */ });
    });
  }
};

module.exports = { ticketLog };
