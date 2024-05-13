const { EmbedBuilder, Colors } = require('discord.js');
const { resolveButtonName, emojifyNumber } = require('../util');
const { getGuildSettings, db } = require('./db');
const { stripIndents } = require('common-tags');

const closePoll = async (client, poll, guild) => {
  const msg = await client.channels.cache.get(poll.channelId)?.messages.fetch(poll.messageId);
  if (!msg) return;
  const existingEmbed = new EmbedBuilder(msg.embeds[0]);
  const newEmbed = resolveClosedPollEmbed({
    poll,
    existingEmbed
  });

  // No we don't =)
  // eslint-disable-next-line require-atomic-updates
  poll.closed = true;
  const settings = getGuildSettings(guild.id);
  const guilds = db.getCollection('guilds');
  settings.polls = [ poll, ...settings.polls.filter((e) => e.index !== poll.index) ];
  guilds.update(settings);

  await msg.edit({
    embeds: [ newEmbed ],
    components: []
  });
};

const handleExpiredPollsBacklog = (client) => {
  const { data: guilds } = db.getCollection('guilds');
  guilds.forEach(({ guildId, polls }) => {
    const allExpiredNonClosedPolls = polls.filter((e) => !e.closed && new Date(e.ends).valueOf() < Date.now());
    polls.reverse(); // Oldest first
    allExpiredNonClosedPolls.forEach((poll) => {
      closePoll(client, poll, client.guilds.cache.get(guildId));
    });
  });
};

const resolveClosedPollEmbed = ({ poll, existingEmbed }) => {
  const totalVotes = Object.values(poll.votes).reduce((a, b) => a + b.length, 0);
  const winningOption = Object.entries(poll.votes).reduce((acc, [ optionName, votes ]) => {
    if (votes.length > acc.votes.length) {
      acc.votes = votes;
      acc.name = optionName;
    }
    return acc;
  }, {
    votes: [],
    name: poll.options[0]
  });

  // Update color
  existingEmbed.setColor(Colors.Green);

  // Update fields
  existingEmbed.data.fields = [
    {
      name: 'Winner',
      value: resolveButtonName({ buttonText: `${ emojifyNumber(poll.options.indexOf(winningOption.name) + 1) } ${ winningOption.name }` }),
      inline: false
    },
    {
      name: 'Total Votes',
      value: totalVotes,
      inline: false
    }
  ];

  // Update description
  const longestOptionName = poll.options.reduce((acc, e) => (e.length > acc ? e.length : acc), 0);
  const optionsLineResults = poll.options.map((e) => {
    let votePercentage = Math.round((poll.votes[e].length / totalVotes) * 100);
    if (isNaN(votePercentage)) votePercentage = 0;
    const lineFull = '■'.repeat(votePercentage / 5);
    const lineRemaining = ' '.repeat(20 - (votePercentage / 5));
    const line = `${ lineFull }${ lineRemaining }`;
    const namePadding = longestOptionName > e.length
      ? ' '.repeat(longestOptionName - e.length)
      : '';
    return `${ e }${ namePadding } | ${ line } | (${ votePercentage }%))`;
  }).join('\n');
  existingEmbed.data.description = stripIndents`
    ${ existingEmbed.data.description }

    \`\`\`
      ${ optionsLineResults }
    \`\`\`
  `;

  return existingEmbed;
};

module.exports = {
  closePoll,
  handleExpiredPollsBacklog,
  resolveClosedPollEmbed
};
