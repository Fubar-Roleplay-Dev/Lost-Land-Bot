const { stripIndents } = require('common-tags');
const { ChatInputCommand } = require('../../classes/Commands');
const { TicketModel } = require('../../mongo/Ticket');
const { getUser } = require('../../mongo/User');
const { colorResolver, msToHumanReadableTime } = require('../../util');
const { ServerApiId } = require('cftools-sdk');
const { MS_IN_ONE_SECOND } = require('../../constants');
const ticketPanels = require('../../../config/tickets');
const { cftClient, serverConfig } = require('../../modules/cftClient');
const { resolveOverridableConfigKey } = require('../../modules/ticket-config');

module.exports = new ChatInputCommand({
  global: true,
  data: { description: 'View server stats for a user in a Ticket channel' },
  // eslint-disable-next-line sonarjs/cognitive-complexity
  run: async (client, interaction) => {
    // Declarations
    const { member, channel } = interaction;
    const { emojis } = client.container;

    // Defer our reply
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
      interaction.editReply(`${ emojis.error } ${ member }, ticket action with index **\`${ ticket.actionIndex }\`** is not defined, you should probably re-deploy your ticket panel with \`/deploy-ticket-panel\``);
      return;
    }

    // Should NOT be ticket user
    const ticketRolePerms = resolveOverridableConfigKey('_rolePermissions', {
      ticketPanel, action, serverIdentifier: ticket.serverIdentifier
    });
    if (member.id === ticket.userId && !member._roles.some((id) => ticketRolePerms.includes(id))) {
      interaction.editReply(`${ emojis.error } ${ member }, you can't use this command because you've created the ticket, this information is for admins - this command has been cancelled`);
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

    // Try to fetch player details
    let playerData;
    try {
      playerData = await cftClient.getPlayerDetails({
        playerId: { id: user.steamId },
        serverApiId: ServerApiId.of(serverCfg.CFTOOLS_SERVER_API_ID)
      });
    }
    catch (err) {
      interaction.editReply(`${ emojis.error } ${ member }, invalid Steam64/id provided or server has no data for identifier - please try again`);
      return;
    }

    // No server - required for /ticket-user-stats
    if (!playerData) {
      interaction.editReply(`${ emojis.error } ${ member }, invalid Steam64/id provided or server has no data for identifier - please try again`);
      return;
    }

    // Safe to destructure
    const {
      names,
      playtime,
      sessions: playerSessions,
      statistics: { dayz: {
        zones,
        hits,
        kdratio,
        longestKill,
        deaths,
        kills,
        longestShot
      } }
    } = playerData;

    // Fetch sessions
    const sessions = await cftClient
      .listGameSessions({ serverApiId: ServerApiId.of(serverCfg.CFTOOLS_SERVER_API_ID) });
    const session = sessions.find((e) => e.steamId.id === user.steamId);
    const totalDeaths = Object.values(deaths ?? {}).reduce((acc, val) => acc + val, 0);

    // Resolve IGN - save if outdated for ticket autofill
    if (
      names
      && names[0]
      && user.inGameName !== names[0]
    ) {
      // eslint-disable-next-line require-atomic-updates
      user.inGameName = names[0];
      await user.save();
    }

    // Construct data embed
    let headShotPercentage = ((
      (zones.head ?? 0)
      + (zones.brain ?? 0)
    ) / (
      hits ?? 0
    )) * 100;
    if (
      headShotPercentage < 0
      || isNaN(headShotPercentage)
      || !isFinite(headShotPercentage)
    ) headShotPercentage = 0;
    else if (headShotPercentage > 100) headShotPercentage = 100;
    const cftoolsId = playerData.identities.cftools.id;
    const embed = {
      color: colorResolver(ticketPanel.color),
      title: 'DayZ stats for ticket user',
      description: stripIndents`
        **__Server__**: ${ serverCfg.NAME }
        **__Player__**: ${ names ? (names[0] ?? 'Unknown') : 'Unknown' }
        **__Steam64__**: [${ user.steamId }](http://steamcommunity.com/profiles/${ user.steamId })
        **__CFTools ID__**: [${ cftoolsId ?? 'Unknown' }](https://app.cftools.cloud/profile/${ cftoolsId })

        **Session:**
        Online: ${ session ? emojis.success : emojis.error }
        Position: ${ session
    ? `${ Object.values(session.live?.position?.latest ?? {}).map((num) => num.toFixed(4))
      .join(', ') ?? 'n/a' }`
    : 'n/a' }

        **Known Names:**
        ${ names?.map((e) => `\`${ e }\``).join(', ') ?? 'None' }${ session
  ? `\n\n**Bans:**
          Count: ${ session.bans?.count ?? 0 }
          Has Community Ban: ${ session.bans?.communityBanned ? emojis.success : emojis.error }
          Game Bans: ${ session.bans?.gameBanned ? emojis.success : emojis.error }
          VAC Bans: ${ session.bans?.vacBanned ? emojis.success : emojis.error }`
  : '' }

        **Time frame:**
        Playtime: ${ msToHumanReadableTime((playtime ?? 0) * MS_IN_ONE_SECOND) }
        Sessions: ${ playerSessions ?? 0 }

        **Other:**
        KDR: ${ kdratio ?? 1 } (${ kills?.players ?? 0 } / ${ totalDeaths ?? 0 }, ${ deaths.other ?? 0 } PvP)
        Longest Kill: ${ longestKill }m
        Longest Shot: ${ longestShot }m
        Hits: ${ hits ?? 0 }
        HeadShots: ${ headShotPercentage.toFixed(2) }%
      `
    };

    // User Feedback
    interaction.editReply({ embeds: [ embed ] });
  }
});
