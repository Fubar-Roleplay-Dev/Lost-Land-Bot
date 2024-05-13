/* eslint-disable sonarjs/no-duplicate-string */
const ticketPanels = require('../../../config/tickets');
const { ChatInputCommand } = require('../../classes/Commands');
const { resolveOverridableConfigKey } = require('../../modules/ticket-config');
const { TicketModel } = require('../../mongo/Ticket');
const { colorResolver } = require('../../util');
const {
  ButtonBuilder, ActionRowBuilder, ButtonStyle
} = require('discord.js');

module.exports = new ChatInputCommand({
  // Reserved for administrators
  permLevel: 'Administrator',
  global: true,
  cooldown: {
    usages: 3,
    type: 'guild',
    duration: 60
  },
  data: { description: 'Display the ticket leaderboard' },
  // eslint-disable-next-line sonarjs/cognitive-complexity
  run: async (client, interaction) => {
    // Destructure
    const { member, guild } = interaction;
    const { emojis } = client.container;

    // Defer our reply
    await interaction.deferReply();

    // :/ Fetch all members...
    // Needed for requested role fallback
    // await guild.members.fetch({
    //   force: false,
    //   cache: true
    // });

    const data = await TicketModel.aggregate([
      // Match only tickets for this guild
      { $match: { guildId: guild.id } },

      // Unwind the activeStaffIds array to create a separate document for each user ID
      { $unwind: '$activeStaffIds' },

      // Group by activeStaffIds field and count the number of tickets for each user ID
      { $group: {
        _id: '$activeStaffIds',
        count: { $sum: 1 }
      } },

      // Sort in descending order by the count field
      { $sort: { count: -1 } }
    ]);

    // {
    //   _id: '1148597817498140774', count: 1
    // },

    // Resolve all staff roles
    const allRoles = [
      ...new Set(
        ticketPanels
          .map((ticketPanel) => ticketPanel.actions.filter((action) => action).map((action) => resolveOverridableConfigKey('_rolePermissions', {
            ticketPanel,
            action
          }).flat())
            .flat())
          .flat()
      )
    ];

    for (const roleId of allRoles) {
      const role = guild.roles.cache.get(roleId);
      if (!role) continue;
      for (const member of role.members) {
        if (!data.find((e) => e._id === member[0])) {
          data.push({
            _id: member[0], count: 0
          });
        }
      }
    }

    // No data
    if (!data || !data[0]) {
      interaction.editReply(`${ emojis.error } ${ member }, no data yet - try again later`);
      return;
    }

    // Split data into chunks for pagination (e.g., 10 items per page)
    const itemsPerPage = 10;
    const pages = [];
    for (let i = 0; i < data.length; i += itemsPerPage) {
      const page = data.slice(i, i + itemsPerPage);
      pages.push(page);
    }

    let currentPage = 0;
    const maxPage = pages.length - 1;

    // Function to update the leaderboard embed
    const updateLeaderboard = () => {
      const leaderboardEmbed = {
        color: colorResolver(),
        author: {
          name: `Ticket Leaderboard for ${ guild.name }`,
          icon_url: guild.iconURL({ dynamic: true })
        },
        description: pages[currentPage]
          .map(({ _id, count }, ind) => `**__#${ ind + 1 + currentPage * itemsPerPage }__** **<@${ _id }>: ${ count } Tickets assisted**`)
          .join('\n')
      };

      return interaction.editReply({
        embeds: [ leaderboardEmbed ], components: [ getButtonRow() ]
      });
    };

    // Function to get the button row
    const getButtonRow = () => {
      return new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId('@ticket-lb-previous')
            .setLabel('Previous')
            .setStyle(ButtonStyle.Primary)
            .setDisabled(currentPage === 0),
          new ButtonBuilder()
            .setCustomId('@ticket-lb-next')
            .setLabel('Next')
            .setStyle(ButtonStyle.Primary)
            .setDisabled(currentPage === maxPage)
        );
    };

    // Send initial leaderboard with buttons
    updateLeaderboard();

    // Create a collector for button interactions
    const filter = (interaction) => interaction.customId === '@ticket-lb-previous' || interaction.customId === '@ticket-lb-next';
    const collector = interaction.channel.createMessageComponentCollector({
      filter, time: 60000
    });

    collector.on('collect', async (buttonInteraction) => {
      // Handle pagination buttons
      if (buttonInteraction.customId === '@ticket-lb-previous' && currentPage > 0) {
        currentPage--;
        await updateLeaderboard();
      }
      else if (buttonInteraction.customId === '@ticket-lb-next' && currentPage < maxPage) {
        currentPage++;
        await updateLeaderboard();
      }
    });

    collector.on('end', () => {
      // Remove the buttons after the collector times out
      interaction.editReply({ components: [] });
    });
  }
});
