const { ChatInputCommand } = require('../../classes/Commands');
const { TicketModel } = require('../../mongo/Ticket');
const { colorResolver } = require('../../util');

module.exports = new ChatInputCommand({
  enabled: true,
  // Reserved for administrators
  permLevel: 'Administrator',
  global: true,
  cooldown: {
    usages: 3,
    type: 'guild',
    duration: 60
  },
  data: { description: 'Display the ticket leaderboard' },
  run: async (client, interaction) => {
    // Destructure
    const { member, guild } = interaction;
    const { emojis } = client.container;

    // Defer our reply
    await interaction.deferReply();

    // Fetch and aggregate
    const data = await TicketModel.aggregate([
      // filter only claimed tickets
      { $match: {
        claimedBy: { $ne: null },
        guildId: guild.id
      } },
      { $group: {
        _id: '$claimedBy', // group by claimedBy field
        count: { $sum: 1 } // count the number of tickets for each claimedBy value
      } },
      // sort in descending order by the count field
      { $sort: { count: -1 } }
    ]);

    // No data
    if (!data || !data[0]) {
      interaction.editReply(`${ emojis.error } ${ member }, no data yet - try again later`);
      return;
    }

    // Reply with data
    interaction.editReply({ embeds: [
      {
        color: colorResolver(),
        author: {
          name: `Ticket Leaderboard for ${ guild.name }`,
          icon_url: guild.iconURL({ dynamic: true })
        },
        description: data
          .slice(0, 25)
          .map(({ _id, count }, ind) => `**__#${ ind + 1 }__** **<@${ _id }>: ${ count } Tickets handled**`)
          .join('\n')
      }
    ] });
  }
});
