const {
  ActionRowBuilder,
  PermissionsBitField,
  ButtonBuilder,
  ButtonStyle,
  PermissionFlagsBits
} = require('discord.js');
const { ComponentCommand } = require('../../classes/Commands');
const { colorResolver } = require('../../util');
const { stripIndents } = require('common-tags');
const { TicketModel } = require('../../mongo/Ticket');
const { getUser } = require('../../mongo/User');
const { ServerApiId } = require('cftools-sdk');
const logger = require('@mirasaki/logger');
const ticketPanels = require('../../../config/tickets');
const { cftClient, serverConfig } = require('../../modules/cftClient');
const { ticketLog } = require('../../modules/ticket-logging');
const { resolveOverridableConfigKey } = require('../../modules/ticket-config');


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
    const {
      member, guild, customId,
      channel, channelId
    } = interaction;
    const { emojis } = client.container;
    const [
      , // @
      , // action
      panelInd,
      actionInd,
      serverApiId
    ] = customId.split('@');
    const panelIndex = Number(panelInd);
    const actionIndex = Number(actionInd);

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
    const action = actions.at(actionIndex);
    if (!action) {
      interaction.reply({
        content: `${ emojis.error } ${ member }, ticket action with index **\`${ actionIndex }\`** is not defined, you should probably re-deploy your ticket panel with \`/deploy-ticket-panel\``,
        ephemeral: true
      });
      return;
    }

    // Defer our reply before any fetching
    await interaction.deferReply({ ephemeral: true });

    // Resolve and check category
    const serverCfg = serverApiId ? serverConfig.find((e) => e.CFTOOLS_SERVER_API_ID === serverApiId) : null;
    const categoryId = resolveOverridableConfigKey('_categoryOpenTicketId', {
      ticketPanel,
      action,
      serverIdentifier: serverCfg?.NAME ?? null
    });
    const category = await guild.channels.fetch(categoryId);
    if (!category) {
      interaction.editReply({ content: `${ emojis.error } ${ member }, invalid configuration. Specified category (\`${ categoryId }\`) to create ticket channel doesn't exist.` });
      return;
    }

    // Resolve user
    const user = await getUser(member.id);
    if (!user) {
      interaction.editReply(`${ emojis.error } ${ member }, service temporarily unavailable - please try again later`);
      return;
    }

    // Update user data defaults
    const steamFormEntry = action.formEntries.find((e) => e.isSteamId === true);
    if (steamFormEntry) {
      const steamVal = interaction.fields.getTextInputValue(`${ action.formEntries.indexOf(steamFormEntry) }`)?.trim();
      if (steamVal) user.steamId = steamVal;
    }

    // Save before continuing
    await user.save();

    // Fetch steam player data
    if (steamFormEntry && user.steamId) {
      // Fetch
      let playerData;

      // Try to fetch player details if requested
      if (serverApiId) {
        try {
          playerData = await cftClient.getPlayerDetails({
            playerId: { id: user.steamId },
            serverApiId: ServerApiId.of(serverApiId)
          });
        }
        catch (err) {
          interaction.editReply(`${ emojis.error } ${ member }, invalid Steam64/id provided or server has no data for identifier - please try again`);
          return;
        }
      }

      // No server - required for /ticket-user-stats
      // so require it conditionally
      if (serverApiId && !playerData) {
        if (!ticketPanel.server && !ticketPanel.selectServer) {
          interaction.editReply(`${ emojis.error } ${ member }, invalid configuration. Please notify the administrators. Configuration for ticket panel isn't linked to any DayZ/CFTools servers.`);
        }
        interaction.editReply(`${ emojis.error } ${ member }, invalid Steam64/id provided or server has no data for identifier - please try again`);
        return;
      }

      // Always end by saving user
      await user.save();
    }

    // Fetch last ticket for panel and action to determine
    // current ticketIndex
    const lastTicket = await TicketModel.findOne({
      guildId: guild.id,
      panelIndex,
      actionIndex
    }).sort({ index: -1 });
    const newIndex = lastTicket ? (lastTicket.index ?? 0) + 1 : 1;
    const newIndexOutput = newIndex.toString().padStart(4, '0');

    // Try to create the ticket channel
    let ticketChannel;
    const ticketRolePerms = resolveOverridableConfigKey('_rolePermissions', {
      ticketPanel,
      action,
      serverIdentifier: serverCfg?.NAME ?? null
    });
    const ticketIndexJoinStr = resolveOverridableConfigKey('_ticketIndexJoinStr', {
      ticketPanel,
      action,
      serverIdentifier: serverCfg?.NAME ?? null
    }) ?? '-';
    const buttonName = `${ action.buttonEmoji ?? '' }${
      action.buttonText ? `${ action.buttonEmoji ? ' ' : '' }${ action.buttonText }` : ''
    }`.trim();
    try {
      ticketChannel = await guild.channels.create({
        name: `${ newIndexOutput }${ ticketIndexJoinStr }${ member.user.username }`,
        parent: category.id,
        topic: `[${ member.user.username }] - ${ buttonName } (${ member.id })`,
        nsfw: false,
        permissionOverwrites: [
          {
            id: guild.id,
            deny: [ PermissionsBitField.Flags.ViewChannel ]
          },
          {
            id: member.id,
            allow: [
              PermissionsBitField.Flags.ViewChannel,
              PermissionsBitField.Flags.SendMessages,
              PermissionsBitField.Flags.EmbedLinks,
              PermissionsBitField.Flags.AttachFiles,
              PermissionsBitField.Flags.ReadMessageHistory
            ]
          },
          ...ticketRolePerms.map((id) => ({
            id,
            allow: [
              PermissionsBitField.Flags.ViewChannel,
              PermissionsBitField.Flags.SendMessages,
              PermissionsBitField.Flags.EmbedLinks,
              PermissionsBitField.Flags.AttachFiles,
              PermissionsBitField.Flags.ReadMessageHistory
            ]
          }))

        ]
      });
    }
    catch (err) {
      interaction.editReply({ content: `${ emojis.error } ${ member }, can't create ticket channel:\n\`\`\`${ err.message }\`\`\`` });
      return;
    }

    // Create new ticket
    const serverIdentifier = serverApiId
      ? serverConfig.find((e) => e.CFTOOLS_SERVER_API_ID === serverApiId)?.NAME ?? null
      : null;
    const ticketData = await TicketModel.create({
      guildId: guild.id,
      channelId: ticketChannel.id,
      userId: member.id,
      panelIndex,
      actionIndex,
      serverIdentifier,
      index: newIndex
    });

    const ticketCreateEmbed = {
      color: colorResolver(ticketPanel.embed.color),
      author: {
        name: `${ guild.name } Ticket Support`,
        icon_url: guild.iconURL({ dynamic: true })
      },
      description: stripIndents`
        📥 A new ticket was created by ${ member }

        ${ serverIdentifier ? `**Server:** ${ serverIdentifier }` : '' }
        **User:** (**\`${ member.user.username } - ${ member.id }\`**)
        **Panel:** ${ ticketPanel.identifier } (<#${ channelId ?? channel?.id }>)
        **Action:** ${ buttonName }
      `,

      footer: { text: 'To close this ticket, react with 🔒' }
    };

    const formEntryFields = action.formEntries?.map(({ label, required }, ind) => ({
      name: label + (required ? ' *' : ''),
      value: interaction.fields.getTextInputValue(`${ ind }`)?.trim() || '-',
      inline: false
    })) ?? [];
    if (serverIdentifier) {
      formEntryFields.unshift({
        name: 'Server',
        value: serverIdentifier,
        inline: false
      });
    }
    const ticketFormEmbed = {
      color: colorResolver(ticketPanel.embed.color),
      title: 'User provided information/context:',
      author: { name: buttonName },
      fields: formEntryFields
    };

    const roleStr = ticketRolePerms
      .map((id) => `<@&${ id }>`)
      .join(` ${ emojis.separator } `);

    const embeds = [ ticketCreateEmbed, ticketFormEmbed ];

    const claimRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`@ticket-claim@${ ticketData._id }`)
        .setLabel('Claim Ticket')
        .setEmoji('📍')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(`@ticket-unclaim@${ ticketData._id }`)
        .setLabel('Unclaim Ticket')
        .setEmoji('📌')
        .setStyle(ButtonStyle.Secondary)
    );

    const controlRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`@ticket-close@${ ticketData._id }`)
        .setLabel('Close Ticket')
        .setEmoji('🔒')
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId(`@ticket-request-close@${ ticketData._id }`)
        .setLabel('Request Close')
        .setEmoji('❔')
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId(`@ticket-auto-expire@${ ticketData._id }`)
        .setLabel('Auto Close (48H)')
        .setEmoji('⏲️')
        .setStyle(ButtonStyle.Danger)
    );

    // Conditional escalate functionality
    const utilRow = new ActionRowBuilder();
    if (ticketPanel.escalationRoleIds && ticketPanel.escalationRoleIds[0]) {
      utilRow.addComponents(
        new ButtonBuilder()
          .setCustomId(`@ticket-escalate@${ ticketData._id }`)
          .setLabel('Escalate')
          .setEmoji('⬆️')
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId(`@ticket-deescalate@${ ticketData._id }`)
          .setLabel('De-escalate')
          .setEmoji('⬇️')
          .setStyle(ButtonStyle.Primary)
      );
    }

    // After escalation, add VC button
    if (ticketPanel.hasDedicatedSupportVCs) utilRow.addComponents(
      new ButtonBuilder()
        .setCustomId(`@ticket-vc@${ ticketData._id }`)
        .setLabel('Support VC')
        .setEmoji('🔊')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`@ticket-vc-end@${ ticketData._id }`)
        .setLabel('End VC')
        .setEmoji('🔇')
        .setStyle(ButtonStyle.Success)
    );

    const shouldPing = resolveOverridableConfigKey('_pingOnTicketCreation', {
      ticketPanel,
      action,
      serverIdentifier: serverCfg?.NAME ?? null
    });
    const ticketMessage = resolveOverridableConfigKey('_ticketCreationMessage', {
      ticketPanel,
      action,
      serverIdentifier: serverCfg?.NAME ?? null
    })?.replaceAll('{@member}', `${ member }`);
    const pingAppendix = shouldPing ? `\n\n${ roleStr }` : '';
    const components = [ claimRow ];
    components.push(utilRow);
    components.push(controlRow);
    const msg = await ticketChannel.send({
      content: `${ ticketMessage }${ pingAppendix }`,
      embeds,
      components
      // new ActionRowBuilder().addComponents(
      //   new ButtonBuilder()
      //     .setCustomId(`@ticket-add-member@${ ticketData._id }`)
      //     .setLabel('Add Member')
      //     .setEmoji('➕')
      //     .setStyle(ButtonStyle.Success),
      //   new ButtonBuilder()
      //     .setCustomId(`@ticket-remove-member@${ ticketData._id }`)
      //     .setLabel('Remove Member')
      //     .setEmoji('➖')
      //     .setStyle(ButtonStyle.Danger)
      // ),
      // new ActionRowBuilder().addComponents(
      //   new ButtonBuilder()
      //     .setCustomId(`@ticket-add-role@${ ticketData._id }`)
      //     .setLabel('Add Role')
      //     .setEmoji('➕')
      //     .setStyle(ButtonStyle.Success),
      //   new ButtonBuilder()
      //     .setCustomId(`@ticket-remove-role@${ ticketData._id }`)
      //     .setLabel('Remove Role')
      //     .setEmoji('➖')
      //     .setStyle(ButtonStyle.Danger)
      // ),
    });

    // Try to pin message
    if (msg.pinnable) msg.pin().catch((err) => {
      logger.syserr('Error encountered while trying to pin ticket message:');
      logger.printErr(err);
    });

    // Feedback
    interaction.editReply(`${ emojis.success } ${ member }, a ticket has been created for you in ${ ticketChannel }`);

    // Ticket logging
    ticketLog({
      ticket: ticketData,
      action,
      ticketPanel,
      actionEmoji: '📥',
      actionText: 'Created',
      guild,
      member
    });
  }
});
