const { ComponentCommand } = require('../../classes/Commands');
const { getGuildSettings, db } = require('../../modules/db');
const { EmbedBuilder } = require('discord.js');

module.exports = new ComponentCommand({ run: async (client, interaction) => {
  const {
    guild, member, customId,
    channel
  } = interaction;

  // Resolve and make sure we have an option
  const [
    , // void @
    , // void action
    voteIndexStr
  ] = customId.split('@');
  const voteIndex = Number(voteIndexStr);

  // Make sure vote still exists
  const settings = getGuildSettings(guild.id);
  const vote = settings.votes.find((e) => e.index === voteIndex);
  if (!vote) {
    interaction.reply({
      content: 'This vote no longer exists - this action has been cancelled.',
      ephemeral: true
    });
    return;
  }

  // Make sure vote is still active
  if (new Date(vote.ends).valueOf() < Date.now()) {
    interaction.reply({
      content: 'This vote has ended - this action has been cancelled.',
      ephemeral: true
    });
    return;
  }

  // Defer our reply
  await interaction.deferReply({ ephemeral: true });

  // Lets remove all existing votes from this user
  const hasDownVote = vote.downVotes.includes(member.id);
  if (hasDownVote) {
    interaction.editReply({
      content: 'You already voted for this option - this action has been cancelled.',
      ephemeral: true
    });
    return;
  }

  // Remove up-vote
  const hasUpVote = vote.upVotes.includes(member.id);
  if (hasUpVote) {
    vote.upVotes = vote.upVotes.filter((e) => e !== member.id);
  }

  // Then, lets add the new vote
  vote.downVotes.push(member.id);

  // Update settings
  const guilds = db.getCollection('guilds');
  guilds.update(settings);

  // Feedback!
  interaction.editReply({
    content: hasDownVote
      ? 'Your changed your vote to **❌**'
      : 'Your vote for option **❌** has been submitted',
    ephemeral: true
  });

  // Let's update the vote message
  const msg = await channel.messages.fetch(vote.messageId);
  const existingEmbed = new EmbedBuilder(msg.embeds[0]);
  const totalVotes = vote.upVotes.length + vote.downVotes.length;
  existingEmbed.data.fields = [
    {
      name: 'Votes',
      value: `${ vote.upVotes.length } out of ${ totalVotes }`,
      inline: false
    },
    {
      name: 'Ends In',
      value: `<t:${ Math.floor(new Date(vote.ends).getTime() / 1000) }:R>`,
      inline: false
    }
  ];
  msg.edit({ embeds: [ existingEmbed ] });
} });
