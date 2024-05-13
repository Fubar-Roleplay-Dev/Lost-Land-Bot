const { EmbedBuilder, Colors } = require('discord.js');
const { getGuildSettings, db } = require('./db');
const { stripIndents } = require('common-tags');

const closeVote = async (client, vote, guild) => {
  const msg = await client.channels.cache.get(vote.channelId)?.messages.fetch(vote.messageId);
  if (!msg) return;

  const hasPassed = vote.upVotes.length >= vote.downVotes.length;
  const embed = new EmbedBuilder(msg.embeds[0]);
  const ogTitle = embed.data.title;
  const ogDescription = embed.data.description;
  embed.setColor(hasPassed ? Colors.Green : Colors.Red);
  embed.setTitle(`Vote ${ hasPassed ? 'Passed' : 'Failed' }`);
  embed.setDescription(stripIndents`
    **Title:** ${ ogTitle }
    **Description:** ${ ogDescription }
    
    __**This vote has ended**__
  `);
  embed.data.fields = [
    {
      name: 'Votes',
      value: `${ vote.upVotes.length } out of ${ vote.upVotes.length + vote.downVotes.length } (${ hasPassed ? 'Passed' : 'Failed' })`,
      inline: false
    }
  ];

  vote.closed = true;
  const settings = getGuildSettings(guild.id);
  const guilds = db.getCollection('guilds');
  settings.votes = [ vote, ...settings.votes.filter((e) => e.index !== vote.index) ];
  guilds.update(settings);

  await msg.edit({
    embeds: [ embed ],
    components: []
  });
};

const handleExpiredVotesBacklog = (client) => {
  const { data: guilds } = db.getCollection('guilds');
  guilds.forEach(({ guildId, votes }) => {
    const allExpiredNonClosedPolls = votes.filter((e) => !e.closed && new Date(e.ends).valueOf() < Date.now());
    votes.reverse(); // Oldest first
    allExpiredNonClosedPolls.forEach((poll) => {
      closeVote(client, poll, client.guilds.cache.get(guildId));
    });
  });
};


module.exports = {
  closeVote,
  handleExpiredVotesBacklog
};
