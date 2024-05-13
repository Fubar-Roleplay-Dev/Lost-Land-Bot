const {
  handleCFToolsError,
  cftClient,
  serverConfig
} = require('../../modules/cftClient');
const { ChatInputCommand } = require('../../classes/Commands');
const { ServerApiId } = require('cftools-sdk');
const { TicketModel } = require('../../mongo/Ticket');
const ticketPanels = require('../../../config/tickets');
const { getUser } = require('../../mongo/User');
const { requiredItemPackageACOption, itemPackageOptionIdentifier } = require('../../interactions/autocomplete/item-package');
const { ItemPackageModel } = require('../../mongo/ItemPackage');
const {
  EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, ApplicationCommandOptionType
} = require('discord.js');
const { stripIndents } = require('common-tags');
const { MS_IN_ONE_HOUR } = require('../../constants');
const { sleep, colorResolver } = require('../../util');
const { ticketLog } = require('../../modules/ticket-logging');
const { resolveOverridableConfigKey } = require('../../modules/ticket-config');

const COMP_ACCEPT_PACKAGE = '@comp_accept_package';
const COMP_DECLINE_PACKAGE = '@comp_decline_package';

module.exports = new ChatInputCommand({
  global: true,
  data: {
    description: 'Propose a package to a player that is currently online',
    options: [
      requiredItemPackageACOption,
      {
        name: 'prompt-user',
        description: 'Prompt the user for confirmation',
        type: ApplicationCommandOptionType.Boolean,
        required: false
      }
    ]
  },
  // eslint-disable-next-line sonarjs/cognitive-complexity
  run: async (client, interaction) => {
    // Destructuring and assignments
    const {
      member, options, channel,
      guild
    } = interaction;
    const { emojis } = client.container;
    const promptUser = options.getBoolean('prompt-user') ?? true;

    // Resolve packageId, make sure it's valid
    const packageId = options.getString(itemPackageOptionIdentifier, true);
    if (packageId === 'No packages found') {
      interaction.reply({
        content: `${ emojis.error } ${ member }, no packages found`,
        ephemeral: true
      });
      return;
    }

    // Deferring our reply
    await interaction.deferReply({ ephemeral: true });

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

    // Resolve package from db
    const itemPackage = await ItemPackageModel.findOne({
      guildId: guild.id,
      packageId
    });
    if (!itemPackage) {
      interaction.editReply(`${ emojis.error } ${ member }, package \`${ packageId }\` doesn't exist - please select/click a value from the autocompleted options`);
      return;
    }

    // Make sure package has items
    if (!itemPackage.items[0]) {
      interaction.editReply(`${ emojis.error } ${ member }, package \`${ packageId }\` doesn't contain any items - please notify the administrators of this empty item compensation package`);
      return;
    }

    const spawnPackage = async () => {
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

      // Notify start - void delete replies
      msg.delete().catch(() => {});
      await interaction.editReply(`${ emojis.wait } ${ member }, spawning items on **\`${ targetSession.playerName }\`**...\n\nThere's a 3.5 second delay between each item spawn, please be patient...`);

      // Try to perform spawn for every item in package
      for await (const item of itemPackage.items) {
        try {
          await cftClient.spawnItem({
            serverApiId: ServerApiId.of(serverCfg.CFTOOLS_SERVER_API_ID),
            session: targetSession,
            itemClass: item.className,
            quantity: item.quantity,
            stacked: item.stacked ?? false,
            debug: item.debug ?? false
          });
          interaction.followUp(`${ emojis.success } ${ member }, spawned **${ item.quantity }x** \`${ item.className }\` on **\`${ targetSession.playerName }\`**`);
        }
        catch (err) {
          interaction.followUp(`${ emojis.error } ${ member }, error encountered while spawning ${ item.className }: ${ err.message }`);
          handleCFToolsError(interaction, err);
          return;
        }
        finally {
          await sleep(3500);
        }
      }

      // Notify success/end
      const successFeedback = `${ emojis.success } ${ member } - <@${ ticket.userId }>, compensation went through successfully - **${ itemPackage.packageId }** spawned at \`${ targetSession.live.position.latest ?? 'n/a' }\``;
      interaction.editReply(successFeedback);
      channel.send(successFeedback);

      // Ticket logging
      ticketLog({
        ticket,
        action,
        ticketPanel,
        actionEmoji: '🎁',
        actionText: 'Compensated a package~',
        guild,
        member,
        fields: [
          {
            name: '📦 Package',
            value: `${ itemPackage.packageId }`
          }
        ]
      });
    };

    // Opt out of asking/prompting user
    if (!promptUser) {
      await spawnPackage();
      return;
    }

    await interaction.editReply(`${ emojis.wait } ${ member }, offering the item compensation package **\`${ itemPackage.packageId }\`** to <@${ ticket.userId }>, please wait for a response...`);
    const msg = await channel.send({
      content: `${ emojis.wait } <@${ ticket.userId }>, ${ member } has offered the item-package **\`${ itemPackage.packageId }\`** as compensation, do you accept this offer?\n\nYou have 48 hours to accept or decline\nYou have to be **logged in** to the server when clicking accept\nStay at the same position until you've received all compensation items - we will notify you when this happens.\n\n**If you decline, you will have to wait for a staff member to contact you again**`,
      embeds: [
        new EmbedBuilder()
          .setColor(colorResolver(ticketPanel.embed.color))
          .setTitle('Compensation offer')
          .setDescription(stripIndents`
            ## Package: \`${ itemPackage.packageId }\`

            ${ itemPackage.items.map((item) => `**${ item.quantity }x** \`${ item.className }\``).join('\n') }
          `)
      ],
      components: [
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(COMP_ACCEPT_PACKAGE)
            .setLabel('Accept')
            .setStyle(ButtonStyle.Success),
          new ButtonBuilder()
            .setCustomId(COMP_DECLINE_PACKAGE)
            .setLabel('Decline')
            .setStyle(ButtonStyle.Danger)
        )
      ]
    });

    // Button reply/input collector
    const collector = msg.createMessageComponentCollector({
      filter: (i) => (
        // Filter out custom ids
        i.customId === COMP_ACCEPT_PACKAGE || i.customId === COMP_DECLINE_PACKAGE
      ) && i.user.id === ticket.userId, // Filter out people without access to the command
      componentType: ComponentType.Button,
      time: MS_IN_ONE_HOUR * 48
    });

    // Make sure we delete the message when the collector ends
    collector.on('end', () => {
      msg.delete().catch(() => {});
    });

    // And finally, running code when it collects an interaction (defined as "i" in this callback)
    collector.on('collect', async (i) => {
      if (i.user.id !== ticket.userId) {
        i.reply({
          content: `${ emojis.error } Only <@${ ticket.userId }> can accept or decline this offer`,
          ephemeral: true
        }).then(() => i.deleteReply().catch(() => {}));
        return;
      }

      // Decline
      if (i.customId === COMP_DECLINE_PACKAGE) {
        await i.reply({
          content: `${ emojis.success } ${ i.member }, declining the item compensation package...`,
          ephemeral: true
        }).catch(() => {});
        await interaction.editReply(`${ emojis.error } ${ member }, <@${ ticket.userId }> has declined the item compensation package`);
        await msg.delete().catch(() => {});
        await channel.send(`${ emojis.error } ${ member }, <@${ ticket.userId }> has declined the item compensation package`);
        i.deleteReply().catch(() => {});
        return;
      }

      await i.reply({
        content: `${ emojis.success } ${ i.member }, accepting the item compensation package...`,
        ephemeral: true
      }).catch(() => {});
      await spawnPackage();
      i.deleteReply().catch(() => {});
    });
  }
});


